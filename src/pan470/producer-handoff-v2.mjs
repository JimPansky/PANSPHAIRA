// PAN470 retained producer adapter, corrected for local public-code handoffs.
// V1 worker receipts remain synthetic self-check evidence, never proof of this
// candidate. Git is re-observed locally; commands must originate in runCommand
// in this process on the same clean head. Saved JSON is evidence, not authority.
// Call only from a trusted local worker: shell commands are not sandboxed.
// Effort is caller-observed, prospective data, not independently authenticated.
// No report grants acceptance, publication, productive authority or gate bypass.
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  WORK_ORDER_SCHEMA_V1,

} from "../../dist/packages/contracts/src/index.js";
import { sha256 as controllerSha256, validateReceiptDigest } from "../../dist/packages/dev-worker/src/controller.js";
import {
  buildHandoffReceipt,
  validateHandoffReceipt,
  measureEffort,
  generateHandoffReport,
  EFFORT_PHASES_V1,
  PASSIVE_STATES_V1,
} from "./handoff-effort.mjs";

export const PAN470_PRODUCER_ADAPTER_V1 = "pansphaira.pan470/producer-adapter/v1";
export const PAN470_PRODUCER_HANDOFF_V1 = "pansphaira.pan470/producer-bound-handoff/v1";
export const PAN470_PRODUCER_REPORT_V1 = "pansphaira.pan470/producer-bound-report/v1";

export const PRODUCER_DENIALS = Object.freeze([
  "PRODUCER_V2_SCHEMA_DENIED",
  "PRODUCER_V2_INPUT_MISSING",
  "PRODUCER_V2_RECEIPT_INVALID",
  "PRODUCER_V2_CANDIDATE_NOT_NULL",
  "PRODUCER_V2_ORDER_SCHEMA_DENIED",
  "PRODUCER_V2_ORDER_DIGEST_MISMATCH",
  "PRODUCER_V2_ORDER_BINDING_MISMATCH",
  "PRODUCER_V2_BASE_NOT_OBSERVED",
  "PRODUCER_V2_HEAD_NOT_OBSERVED",
  "PRODUCER_V2_NOT_COMPLETED",
  "PRODUCER_V2_COMMAND_EMPTY",
  "PRODUCER_V2_COMMAND_EXIT_INVALID",
  "PRODUCER_V2_COMMAND_OUTPUT_STALE",
  "PRODUCER_V2_EVIDENCE_INVALID",
  "PRODUCER_V2_EFFORT_INVALID",
]);

const isSha1 = (value) => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
const isSha256 = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const sha256OfText = (text) => createHash("sha256").update(text, "utf8").digest("hex");

function workOrderSchemaValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const schema = JSON.parse(readFileSync(new URL("../../schemas/work-order-v1.schema.json", import.meta.url), "utf8"));
  return ajv.compile(schema);
}

const documentSchema = JSON.parse(readFileSync(new URL("../../schemas/contracts/pan470-handoff-effort-v1.schema.json", import.meta.url), "utf8"));
const documentAjv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
documentAjv.addSchema(documentSchema);
const handoffSchemaValidator = documentAjv.getSchema(`${documentSchema.$id}#/$defs/handoffReceipt`);

/**
 * Build a WorkOrderV1-shaped producer work order bound to the REAL Git base.
 * Self-consistent: workOrderDigest = canonical sha256 of the unsigned fields
 * (same released encoder the controller uses), so the order digest is
 * independently re-derivable by any verifier and cannot be asserted freely.
 */
export function buildProducerWorkOrderV1({
  orderId,
  repository,
  issueIid,
  issueSnapshotDigest,
  baseRef,
  baseCommit,
  acIds,
  allowedPaths,
  nowIso,
  expiresAtIso,
  modelAlias = "cm.dev.primary",
}) {
  if (!isSha1(baseCommit) || !isSha256(issueSnapshotDigest)) throw new Error(PRODUCER_DENIALS[1]);
  const unsigned = {
    schemaVersion: WORK_ORDER_SCHEMA_V1,
    orderId,
    workloadIdentity: "workload:pan470-producer-local",
    project: { id: `github-repository:${repository}`, repository },
    issue: { iid: issueIid, snapshotDigest: issueSnapshotDigest },
    base: { ref: baseRef, commit: baseCommit },
    paths: { allowed: allowedPaths, denied: [".github/**", ".gitlab/**", "scripts/**", "release/**", "security/**", "gateway/**"] },
    acceptanceCriteria: acIds,
    nonScope: [
      "No publication, merge, release, network, dependency, or private-material change; no scheduler, supervisor, dashboard, general framework or external authority; no historical timing reconstruction.",
    ],
    risk: "LOW",
    dataClass: "PUBLIC_OSS",
    artifacts: {
      toolchainDigest: sha256OfText(process.version),
      harnessDigest: controllerSha256({ harness: "hermes-agent-cli-local", node: process.version }),
      workerDigest: sha256OfText(PAN470_PRODUCER_ADAPTER_V1),
    },
    model: {
      aliases: [modelAlias],
      providerPolicyDigest: controllerSha256({ alias: modelAlias, provider: "local-cli-worker", externalNetwork: false }),
    },
    budget: { maxInputTokens: 1024, maxOutputTokens: 1024, maxCostMicros: 100000, maxRequests: 16, timeoutMs: 600000, maxPatchBytes: 65536 },
    testProfile: { commands: ["npm run pan470:test"] },
    lease: { id: "lease:pan470-producer-local", capabilities: ["cm.dev.issue.read", "cm.dev.repository.snapshot.read", "cm.dev.test.run", "cm.dev.evidence.read"], expiresAt: expiresAtIso },
    publication: { mode: "NONE", allowed: [], denied: ["MERGE", "MARK_READY", "FORCE_PUSH", "BRANCH_DELETE", "PROJECT_ADMIN", "TOKEN_CREATE", "TAG", "RELEASE", "DEPLOY"] },
    expiresAt: expiresAtIso,
  };
  const order = { ...unsigned, workOrderDigest: controllerSha256(unsigned) };
  if (!Number.isFinite(Date.parse(nowIso)) || !Number.isFinite(Date.parse(expiresAtIso)) || Date.parse(nowIso) >= Date.parse(expiresAtIso)) throw new Error(PRODUCER_DENIALS[1]);
  return order;
}

/**
 * Independently observe the real Git state of a local repository (spawnSync,
 * no network). Fails closed with PRODUCER_V2_INPUT_MISSING when the
 * observation is impossible: not a repository, dirty tree, or the base commit
 * is not a strict ancestor of the observed HEAD.
 */
export function observeGitState({ repositoryRoot, baseCommit }) {
  const git = (args) => {
    const result = spawnSync("git", args, { cwd: repositoryRoot, encoding: "utf8" });
    if (result.status !== 0) return null;
    return (result.stdout ?? "").trim();
  };
  if (!isSha1(baseCommit)) throw new Error(PRODUCER_DENIALS[1]);
  const top = git(["rev-parse", "--is-inside-work-tree"]);
  if (top !== "true") throw new Error(PRODUCER_DENIALS[1]);
  const status = git(["status", "--porcelain"]);
  if (status !== "") throw new Error(PRODUCER_DENIALS[1]);
  const headCommit = git(["rev-parse", "HEAD^{commit}"]);
  if (!isSha1(headCommit)) throw new Error(PRODUCER_DENIALS[1]);
  const baseExists = git(["cat-file", "-e", `${baseCommit}^{commit}`]);
  if (baseExists === null) throw new Error(PRODUCER_DENIALS[1]);
  const ancestor = git(["merge-base", "--is-ancestor", baseCommit, headCommit]);
  if (ancestor === null) throw new Error(PRODUCER_DENIALS[7]);
  const sameCommit = git(["merge-base", baseCommit, headCommit]);
  if (sameCommit === headCommit && baseCommit === headCommit) throw new Error(PRODUCER_DENIALS[7]);
  return {
    baseCommit,
    headCommit,
    tree: git(["rev-parse", "HEAD^{tree}"]),
    baseSubject: git(["log", "-1", "--format=%s", baseCommit]) ?? "",
    headSubject: git(["log", "-1", "--format=%s", headCommit]) ?? "",
  };
}

/**
 * Run one REAL command (node child_process, same shell semantics as a worker
 * test command) and record its exit plus the sha256 of its FULL stdout+stderr
 * output text. The output text is carried so the v2 gate can RE-DERIVE the
 * digest later; a stale or substituted digest is refused.
 */
const commandObservations = new WeakMap();
function currentCandidate(cwd) {
  const run = (args) => {
    const r = spawnSync("git", args, { cwd, encoding: "utf8" });
    if (r.status !== 0) throw new Error(PRODUCER_DENIALS[1]);
    return r.stdout.trim();
  };
  if (run(["status", "--porcelain"]) !== "") throw new Error(PRODUCER_DENIALS[1]);
  return { root: realpathSync(run(["rev-parse", "--show-toplevel"])), head: run(["rev-parse", "HEAD"]) };
}
export function runCommand({ command, cwd, timeoutMs = 600000 }) {
  if (typeof command !== "string" || !command.trim()) throw new Error(PRODUCER_DENIALS[10]);
  const before = currentCandidate(cwd);
  const result = spawnSync(command, { cwd, shell: true, encoding: "utf8", timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 });
  const outputText = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const record = Object.freeze({ command, exit: result.status, outputDigest: sha256OfText(outputText), outputText });
  const after = currentCandidate(cwd);
  if (controllerSha256(before) !== controllerSha256(after)) throw new Error("PRODUCER_V2_COMMAND_HEAD_CHANGED");
  commandObservations.set(record, before);
  return record;
}

/**
 * Compose the ACTUAL completed handoff through the EXISTING v1 surfaces:
 * buildHandoffReceipt (v1) binds the real work order + real base receipt; the
 * adapter adds the observed git section, the executed commands (with output
 * text) and the observed effort record. The returned bundle is the input to
 * validateProducerBoundHandoffV1.
 */
export function buildActualHandoffBundle({
  order,
  receipt,
  git,
  commands,
  evidence,
  completedAcIds,
  unmetAc,
  integrationSurfaces,
  nonClaims,
  effort,
  headCommit,
}) {
  const handoff = buildHandoffReceipt({
    order,
    receipt,
    baseCommit: git.baseCommit,
    headCommit: headCommit ?? git.headCommit,
    completedAcIds,
    unmetAc,
    commands: commands.map(({ outputText: _omit, ...rest }) => rest),
    evidence,
    integrationSurfaces,
    nonClaims,
  });
  return {
    schemaVersion: PAN470_PRODUCER_HANDOFF_V1,
    adapterVersion: PAN470_PRODUCER_ADAPTER_V1,
    handoff,
    commandsWithOutput: commands,
    effort,
    git,
  };
}

/**
 * Effort record builder for the actual work: observed phase intervals come
 * from the caller's contemporaneous observations (startMs/endMs relative to
 * the observation session). Phases with NO observation record an empty
 * interval list (totalMs 0) and are flagged unobserved. Passive CI_WAIT/IDLE
 * stay separate; UNOBSERVED passive stays its own bucket and is never inferred.
 */
export function buildObservedEffort({ deliverableId, modelAlias, harnessDigest, observedIntervals, passive = {} }) {
  if (!deliverableId?.trim() || !modelAlias?.trim() || !isSha256(harnessDigest) ||
      Object.keys(observedIntervals ?? {}).some((p) => !EFFORT_PHASES_V1.includes(p)) ||
      Object.keys(passive).some((p) => !PASSIVE_STATES_V1.includes(p))) throw new Error(PRODUCER_DENIALS[14]);
  const intervals = {}, unobservedPhases = [];
  for (const phase of EFFORT_PHASES_V1) {
    const raw = observedIntervals?.[phase];
    if (raw !== undefined && !Array.isArray(raw)) throw new Error(PRODUCER_DENIALS[14]);
    intervals[phase] = raw ?? [];
    if (!intervals[phase].length) unobservedPhases.push(phase);
    for (const iv of intervals[phase]) if (!Number.isSafeInteger(iv.startMs) || !Number.isSafeInteger(iv.endMs)) throw new Error(PRODUCER_DENIALS[14]);
  }
  const passiveTotals = {}, measuredPassive = {};
  for (const state of PASSIVE_STATES_V1) {
    const value = passive[state] ?? null;
    if (value !== null && (!Number.isSafeInteger(value) || value < 0)) throw new Error(PRODUCER_DENIALS[14]);
    passiveTotals[state] = value;
    measuredPassive[state] = value ?? 0;
  }
  const measured = measureEffort({ deliverableId, modelAlias, harnessDigest, intervals, passive: measuredPassive });
  const byPhase = Object.fromEntries(EFFORT_PHASES_V1.map((p) => [p, { intervals: intervals[p].length, totalMs: unobservedPhases.includes(p) ? null : measured.byPhase[p].totalMs }]));
  const unsigned = {
    schemaVersion: "pansphaira.pan470/observed-effort/v1", deliverableId, modelAlias, harnessDigest,
    observations: intervals, byPhase, passive: passiveTotals,
    activeTotalMs: measured.activeTotalMs, unobservedPhases: unobservedPhases.sort(),
  };
  return { effort: { ...unsigned, effortDigest: controllerSha256(unsigned) }, unobservedPhases: unsigned.unobservedPhases };
}

/**
 * Validate one producer-bound handoff FAIL-CLOSED. Every gate is exact; the
 * first violation throws its PRODUCER_V2_* code. The legacy V1 synthetic
 * semantics are re-asserted, not replaced: the base receipt must still pass
 * validateReceiptDigest with candidateCommit === null, and the real head
 * enters only via the observed-git section.
 */
export function validateProducerBoundHandoffV1({ order, receipt, handoff, commands, effort, git, evidenceRoot, repositoryRoot }) {
  if (!order || !receipt || !handoff || !commands || !effort || !git) throw new Error(PRODUCER_DENIALS[1]);
  if (evidenceRoot === undefined) throw new Error(PRODUCER_DENIALS[13]);
  if (repositoryRoot === undefined) throw new Error(PRODUCER_DENIALS[1]);
  if (!handoffSchemaValidator(handoff)) throw new Error(PRODUCER_DENIALS[0]);
  const observed = observeGitState({ repositoryRoot, baseCommit: order.base?.commit });
  if (git.baseCommit !== observed.baseCommit) throw new Error(PRODUCER_DENIALS[7]);
  if (controllerSha256(git) !== controllerSha256(observed)) throw new Error(PRODUCER_DENIALS[8]);
  // (1) the base worker receipt must keep its V1 null-only candidate. A
  //     caller self-attested head on the receipt is refused here, before any
  //     other gate — the V1 schema cannot be relaxed to accept one.
  if (receipt.candidateCommit !== null) throw new Error(PRODUCER_DENIALS[3]);
  // (2) retained mandatory V1 receipt gate — schema + canonical digest,
  //     re-run from the released controller, never replaced.
  if (!validateReceiptDigest(receipt)) throw new Error(PRODUCER_DENIALS[2]);
  // (3) the producer work order: schema-valid and digest self-consistent.
  //     It names the ACTUAL base the work started from; it is NOT the
  //     synthetic receipt's order and is never claimed to be.
  if (!workOrderSchemaValidator()(order)) throw new Error(PRODUCER_DENIALS[4]);
  const { workOrderDigest: recordedOrderDigest, ...unsignedOrder } = order;
  if (controllerSha256(unsignedOrder) !== recordedOrderDigest) throw new Error(PRODUCER_DENIALS[5]);
  // (4) the handoff must name the ACTUAL producer order and the EXACT base
  //     receipt (its digest), and the issue id must agree.
  if (!isSha256(order.workOrderDigest) || handoff.workOrderDigest !== order.workOrderDigest ||
      handoff.issueIid !== order.issue.iid || handoff.baseReceiptDigest !== receipt.receiptDigest) throw new Error(PRODUCER_DENIALS[6]);
  // (5) observed git base: the order's named base, the observed base and the
  //     handoff's base must all be the same independently observed commit.
  if (!isSha1(order.base?.commit) || !isSha1(git.baseCommit) || order.base.commit !== git.baseCommit ||
      handoff.baseCommit !== git.baseCommit) throw new Error(PRODUCER_DENIALS[7]);
  // (6) observed git head: the handoff's head must equal what the adapter
  //     OBSERVED — a caller-claimed head is not accepted.
  if (!isSha1(git.headCommit) || handoff.headCommit !== git.headCommit) throw new Error(PRODUCER_DENIALS[8]);
  // (7) actual completion of the base worker run (no relaxation of V1).
  if (receipt.outcome !== "SUCCEEDED" || receipt.review?.outcome !== "PASS" ||
      !Array.isArray(receipt.tests) || receipt.tests.length === 0 ||
      receipt.tests.some((entry) => entry.outcome !== "PASS")) throw new Error(PRODUCER_DENIALS[9]);
  // (8) actually executed commands: every entry carries the full output text
  //     and its recorded digest must RE-DERIVE from it (no substitution, no
  //     stale digest). A failed exit is recorded honestly and never relabeled.
  if (!Array.isArray(commands) || commands.length === 0) throw new Error(PRODUCER_DENIALS[10]);
  for (const c of commands) {
    if (c === null || typeof c !== "object") throw new Error(PRODUCER_DENIALS[10]);
    const { command, exit, outputDigest, outputText } = c;
    if (typeof command !== "string" || command.length === 0) throw new Error(PRODUCER_DENIALS[10]);
    if (!Number.isInteger(exit)) throw new Error(PRODUCER_DENIALS[11]);
    if (typeof outputText !== "string") throw new Error(PRODUCER_DENIALS[12]);
    if (!isSha256(outputDigest) || sha256OfText(outputText) !== outputDigest) throw new Error(PRODUCER_DENIALS[12]);
    const observation = commandObservations.get(c);
    if (!observation || observation.root !== realpathSync(repositoryRoot) || observation.head !== git.headCommit) throw new Error("PRODUCER_V2_COMMAND_NOT_OBSERVED");
    if (exit !== 0) throw new Error(PRODUCER_DENIALS[9]);
  }
  const compactCommands = commands.map(({ command, exit, outputDigest }) => ({ command, exit, outputDigest }));
  if (controllerSha256(compactCommands) !== controllerSha256(handoff.commands)) throw new Error("PRODUCER_V2_COMMAND_BINDING_MISMATCH");
  const declared = order.acceptanceCriteria;
  const named = [...handoff.completedAcIds, ...handoff.unmetAc.map(({ id }) => id)];
  if (new Set(named).size !== named.length || named.length !== declared.length || named.some((id) => !declared.includes(id))) throw new Error("PRODUCER_V2_AC_BINDING_MISMATCH");
  // (9) the recorded effort must be re-derivable from its own fields
  //     (observed intervals only; unobserved phases carry zero recorded
  //     intervals and are named, never inferred).
  if (effort === null || typeof effort !== "object") throw new Error(PRODUCER_DENIALS[14]);
  const { effortDigest: recordedEffortDigest, ...unsignedEffort } = effort;
  if (!isSha256(recordedEffortDigest) || controllerSha256(unsignedEffort) !== recordedEffortDigest) throw new Error(PRODUCER_DENIALS[14]);
  const rebuilt = buildObservedEffort({ ...effort, observedIntervals: effort.observations }).effort;
  if (controllerSha256(rebuilt) !== controllerSha256(effort)) throw new Error(PRODUCER_DENIALS[14]);
  // (10) the existing v1 handoff receipt is validated fail-closed, including
  //     current on-disk evidence bytes when an evidenceRoot is supplied.
  return validateHandoffReceipt(handoff, { evidenceRoot });
}

/**
 * Generate the ACTUAL completed handoff report: the existing v1 report path
 * (generateHandoffReport, evidence re-check included) wrapped with the
 * observed-git + observed-effort + unobserved sections. Prospective observed
 * phases only; no historical reconstruction, no percentage inference.
 */
export function generateActualHandoffReport({ order, receipt, handoff, commands, effort, git, evidenceRoot, repositoryRoot }) {
  validateProducerBoundHandoffV1({ order, receipt, handoff, commands, effort, git, evidenceRoot, repositoryRoot });
  // V1 receives only recorded totals. The public v2 report preserves nulls.
  const measured = measureEffort({ ...effort, intervals: effort.observations,
    passive: Object.fromEntries(PASSIVE_STATES_V1.map((p) => [p, effort.passive[p] ?? 0])) });
  const v1 = generateHandoffReport({ handoff, effortRecords: [measured], evidenceRoot });
  const unsigned = {
    schemaVersion: PAN470_PRODUCER_REPORT_V1, adapterVersion: PAN470_PRODUCER_ADAPTER_V1,
    handoffDigest: handoff.handoffDigest, ...git,
    completedAcIds: handoff.completedAcIds, unmetAcIds: handoff.unmetAc.map((u) => u.id),
    v1ReportDigest: v1.reportDigest, effortDigest: effort.effortDigest,
    effort, byDeliverable: v1.byDeliverable, byModelHarness: v1.byModelHarness,
    acceptance: "PENDING_INDEPENDENT_ACCEPTANCE", acceptedDeliverableTotals: null,
    unobservedPhases: effort.unobservedPhases, nonRetrospective: true,
  };
  return { ...unsigned, reportDigest: controllerSha256(unsigned) };
}
