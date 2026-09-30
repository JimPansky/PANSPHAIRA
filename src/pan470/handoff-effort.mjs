// PAN470 — complete worker handoff + measurable finalization effort (bounded first slice).
//
// Uses the EXISTING work-order and receipt surfaces (WorkOrderV1 / WorkReceiptV1,
// schemas/work-order-v1 + work-receipt-v1) to close the CONTRIB-03 gap: a handoff must
// NAME its exact base/head, completed and unmet AC IDs, commands/exits, evidence
// locations, integration surfaces and nonclaims, and malformed or stale receipts must
// not imply completion. Finalization effort is measured as EXACT recorded intervals for
// implementation, self-check, review, correction and finalization, kept SEPARATE from
// CI wait, idle and unknown; it is aggregated by accepted deliverable and by model/
// harness. No percentage is inferred from tokens, commit counts or overlapping wall
// time, and bookkeeping is not a new blocking delivery gate.
//
// SYNTHETIC + LOCAL: this drives the ACTUAL released entry points
// (runSyntheticDevelopmentWorker + validateReceiptDigest from the dev-worker controller)
// and the real on-disk evidence bytes; it performs no writes, no publication, no
// production/customer/host data and no credentials.
//
// Census-safe: this module never references the census-tracked canonical-json
// identifier by name; object digests use the controller's released `sha256` (which
// canonicalizes internally) and file/byte digests use a direct sha256 over utf8.
import { createHash } from "node:crypto";
import { readFileSync, existsSync, lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import {
  runSyntheticDevelopmentWorker,
  validateReceiptDigest,
  sha256 as controllerSha256,
} from "../../dist/packages/dev-worker/src/controller.js";
import {
  WORK_RECEIPT_SCHEMA_V1,
  WORK_ORDER_SCHEMA_V1,
} from "../../dist/packages/contracts/src/index.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");

export const PAN470_RECEIPT_SCHEMA_V1 = "pansphaira.pan470/handoff-receipt/v1";
export const PAN470_EFFORT_SCHEMA_V1 = "pansphaira.pan470/effort-intervals/v1";
export const PAN470_REPORT_SCHEMA_V1 = "pansphaira.pan470/effort-report/v1";

// Closed phase classes for ACTIVE implementation effort (measured intervals).
export const EFFORT_PHASES_V1 = Object.freeze([
  "IMPLEMENTATION",
  "SELF_CHECK",
  "REVIEW",
  "CORRECTION",
  "FINALIZATION",
]);

// Passive / non-active states, kept strictly separate from active effort.
export const PASSIVE_STATES_V1 = Object.freeze([
  "CI_WAIT",
  "IDLE",
  "UNKNOWN",
]);

export const RECEIPT_DENIALS = Object.freeze([
  "HANDBOFF_RECEIPT_SCHEMA_DENIED",
  "HANDBOFF_RECEIPT_DIGEST_MISMATCH",
  "HANDBOFF_BASE_MISMATCH",
  "HANDBOFF_HEAD_MISSING",
  "HANDBOFF_WORK_ORDER_DIGEST_MISMATCH",
  "HANDBOFF_AC_EMPTY",
  "HANDBOFF_AC_DUP",
  "HANDBOFF_AC_UNKNOWN",
  "HANDBOFF_AC_OVERLAP",
  "HANDBOFF_COMMAND_EMPTY",
  "HANDBOFF_COMMAND_EXIT_INVALID",
  "HANDBOFF_EVIDENCE_EMPTY",
  "HANDBOFF_EVIDENCE_MISSING",
  "HANDBOFF_EVIDENCE_STALE",
  "HANDBOFF_INTEGRATION_EMPTY",
  "HANDBOFF_NONCLAIMS_EMPTY",
  "EFFORT_INTERVAL_INVALID",
  "EFFORT_PHASE_UNKNOWN",
  "EFFORT_STATE_UNKNOWN",
  "EFFORT_INTERVAL_OVERLAP",
]);

// Object digests use the released canonical encoder (single source of truth); string /
// raw-byte digests use a direct sha256 over utf8 (matches the released sha256 for strings).
function digestOf(value) {
  if (typeof value === "string") return createHash("sha256").update(value, "utf8").digest("hex");
  return controllerSha256(value);
}
function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}
function isSha1(value) {
  return typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
}
function isNonNegInt(value) {
  return Number.isInteger(value) && value >= 0;
}
function uniqueSorted(list) {
  return [...new Set(list)].sort();
}

/**
 * Build a complete handoff receipt from the EXISTING work-order/receipt surfaces.
 * The handoff ADDS the fields the base WorkReceiptV1 lacks: exact base/head, completed
 * + unmet AC IDs (each unmet with an owner + exact resume condition + next action),
 * commands/exits, evidence locations (path + recorded sha256), integration surfaces,
 * and nonclaims. `handoffDigest` is the sha256 of the unsigned fields.
 */
export function buildHandoffReceipt({
  order,
  receipt,
  baseCommit,
  headCommit,
  completedAcIds,
  unmetAc,
  commands,
  evidence,
  integrationSurfaces,
  nonClaims,
}) {
  const unsigned = {
    schemaVersion: PAN470_RECEIPT_SCHEMA_V1,
    workOrderSchema: WORK_ORDER_SCHEMA_V1,
    receiptSchema: WORK_RECEIPT_SCHEMA_V1,
    workOrderDigest: order.workOrderDigest,
    baseCommit,
    headCommit,
    issueIid: order.issue.iid,
    outcome: receipt.outcome,
    completedAcIds: uniqueSorted(completedAcIds),
    unmetAc,
    commands,
    evidence,
    integrationSurfaces: uniqueSorted(integrationSurfaces),
    nonClaims: uniqueSorted(nonClaims),
    baseReceiptDigest: receipt.receiptDigest,
  };
  return { ...unsigned, handoffDigest: digestOf(unsigned) };
}

/**
 * Validate a handoff receipt FAIL-CLOSED. Returns { ok: true, handoffDigest } on success,
 * or throws a coded error on the first violation. Malformed or stale receipts do NOT
 * imply completion. When `evidenceRoot` is supplied, each evidence location's recorded
 * sha256 is re-derived from CURRENT on-disk bytes; a mismatch or missing file is
 * HANDBOFF_EVIDENCE_STALE.
 */
export function validateHandoffReceipt(handoff, { evidenceRoot } = {}) {
  if (handoff === null || typeof handoff !== "object") throw new Error(RECEIPT_DENIALS[0]);
  const {
    schemaVersion, workOrderDigest, baseCommit, headCommit, issueIid, outcome,
    completedAcIds, unmetAc, commands, evidence, integrationSurfaces, nonClaims,
    baseReceiptDigest, handoffDigest,
  } = handoff;

  if (schemaVersion !== PAN470_RECEIPT_SCHEMA_V1) throw new Error(RECEIPT_DENIALS[0]);
  if (!isSha256(workOrderDigest)) throw new Error(RECEIPT_DENIALS[4]);
  if (!isSha1(baseCommit)) throw new Error(RECEIPT_DENIALS[2]);
  if (!isSha1(headCommit)) throw new Error(RECEIPT_DENIALS[3]);
  if (!Number.isInteger(issueIid) || issueIid < 1) throw new Error(RECEIPT_DENIALS[0]);
  if (!isSha256(baseReceiptDigest)) throw new Error(RECEIPT_DENIALS[1]);

  if (!Array.isArray(completedAcIds) || completedAcIds.length === 0) throw new Error(RECEIPT_DENIALS[5]);
  if (new Set(completedAcIds).size !== completedAcIds.length) throw new Error(RECEIPT_DENIALS[6]);
  if (!Array.isArray(unmetAc)) throw new Error(RECEIPT_DENIALS[0]);

  const seen = new Set();
  for (const id of completedAcIds) {
    if (typeof id !== "string" || id.length === 0 || seen.has(id)) throw new Error(RECEIPT_DENIALS[6]);
    seen.add(id);
  }
  for (const item of unmetAc) {
    if (item === null || typeof item !== "object") throw new Error(RECEIPT_DENIALS[0]);
    const { id, owner, resumeCondition, nextAction } = item;
    if (typeof id !== "string" || id.length === 0) throw new Error(RECEIPT_DENIALS[7]);
    if (seen.has(id)) throw new Error(RECEIPT_DENIALS[8]);
    seen.add(id);
    if (typeof owner !== "string" || owner.length === 0) throw new Error(RECEIPT_DENIALS[0]);
    if (typeof resumeCondition !== "string" || resumeCondition.length === 0) throw new Error(RECEIPT_DENIALS[0]);
    if (typeof nextAction !== "string" || nextAction.length === 0) throw new Error(RECEIPT_DENIALS[0]);
  }
  if (!Array.isArray(commands) || commands.length === 0) throw new Error(RECEIPT_DENIALS[9]);
  for (const c of commands) {
    if (c === null || typeof c !== "object") throw new Error(RECEIPT_DENIALS[9]);
    const { command, exit, outputDigest } = c;
    if (typeof command !== "string" || command.length === 0) throw new Error(RECEIPT_DENIALS[9]);
    if (!Number.isInteger(exit)) throw new Error(RECEIPT_DENIALS[10]);
    if (!isSha256(outputDigest)) throw new Error(RECEIPT_DENIALS[0]);
  }
  if (!Array.isArray(evidence) || evidence.length === 0) throw new Error(RECEIPT_DENIALS[11]);
  for (const e of evidence) {
    if (e === null || typeof e !== "object") throw new Error(RECEIPT_DENIALS[0]);
    const { path: p, sha256: recorded } = e;
    if (typeof p !== "string" || p.length === 0 || p.startsWith("/") || p.includes("..")) throw new Error(RECEIPT_DENIALS[0]);
    if (!isSha256(recorded)) throw new Error(RECEIPT_DENIALS[0]);
  }
  if (!Array.isArray(integrationSurfaces) || integrationSurfaces.length === 0) throw new Error(RECEIPT_DENIALS[12]);
  if (!Array.isArray(nonClaims) || nonClaims.length === 0) throw new Error(RECEIPT_DENIALS[13]);

  // digest self-consistency — the handoffDigest must re-derive from the fields.
  const { handoffDigest: _omit, ...unsigned } = handoff;
  if (digestOf(unsigned) !== handoffDigest) throw new Error(RECEIPT_DENIALS[1]);
  if (outcome !== "SUCCEEDED") throw new Error(RECEIPT_DENIALS[0]); // rehashed failed results cannot complete ACs

  // staleness — re-derive each evidence sha256 from CURRENT bytes.
  if (evidenceRoot !== undefined) {
    const root = realpathSync(evidenceRoot);
    for (const e of evidence) {
      const full = path.resolve(root, e.path);
      const relative = path.relative(root, full);
      if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error(RECEIPT_DENIALS[12]);
      }
      let cursor = root;
      for (const part of relative.split(path.sep)) {
        cursor = path.join(cursor, part);
        if (!existsSync(cursor) || lstatSync(cursor).isSymbolicLink()) throw new Error(RECEIPT_DENIALS[12]);
      }
      if (!lstatSync(full).isFile()) throw new Error(RECEIPT_DENIALS[12]);
      const current = createHash("sha256").update(readFileSync(full), "utf8").digest("hex");
      if (current !== e.sha256) throw new Error(RECEIPT_DENIALS[13]);
    }
  }
  return { ok: true, handoffDigest };
}

/**
 * Measure finalization effort as EXACT recorded intervals, per phase, kept strictly
 * separate from CI wait / idle / unknown. `intervals` maps phase -> [{ startMs, endMs }]
 * (exact, non-overlapping, ascending). `passive` maps state -> totalMs. No percentage is
 * derived from tokens, commits or overlapping wall time.
 */
export function measureEffort({ deliverableId, modelAlias, harnessDigest, intervals, passive }) {
  const byPhase = {};
  const allActiveIntervals = [];
  for (const phase of EFFORT_PHASES_V1) {
    const raw = intervals?.[phase];
    if (!Array.isArray(raw)) throw new Error(RECEIPT_DENIALS[15]);
    let total = 0;
    let lastEnd = null;
    for (const iv of raw) {
      if (iv === null || typeof iv !== "object") throw new Error(RECEIPT_DENIALS[15]);
      const { startMs, endMs } = iv;
      if (!isNonNegInt(startMs) || !isNonNegInt(endMs) || endMs <= startMs) throw new Error(RECEIPT_DENIALS[15]);
      if (lastEnd !== null && startMs < lastEnd) throw new Error(RECEIPT_DENIALS[19]);
      total += endMs - startMs;
      if (!Number.isSafeInteger(total)) throw new Error(RECEIPT_DENIALS[16]);
      allActiveIntervals.push({ startMs, endMs });
      lastEnd = endMs;
    }
    byPhase[phase] = { intervals: raw.length, totalMs: total };
  }
  allActiveIntervals.sort((a, b) => a.startMs - b.startMs);
  for (let i = 1; i < allActiveIntervals.length; i++) {
    if (allActiveIntervals[i].startMs < allActiveIntervals[i - 1].endMs) throw new Error(RECEIPT_DENIALS[19]);
  }
  const passiveTotals = {};
  for (const state of PASSIVE_STATES_V1) {
    const ms = passive?.[state];
    if (ms === undefined) throw new Error(RECEIPT_DENIALS[18]);
    if (!isNonNegInt(ms)) throw new Error(RECEIPT_DENIALS[15]);
    passiveTotals[state] = ms;
  }
  const activeTotalMs = EFFORT_PHASES_V1.reduce((sum, p) => sum + byPhase[p].totalMs, 0);
  if (!Number.isSafeInteger(activeTotalMs)) throw new Error(RECEIPT_DENIALS[16]);
  const unsigned = {
    schemaVersion: PAN470_EFFORT_SCHEMA_V1,
    deliverableId,
    modelAlias,
    harnessDigest,
    byPhase,
    passive: passiveTotals,
    activeTotalMs,
  };
  return { ...unsigned, effortDigest: digestOf(unsigned) };
}

/**
 * Aggregate measured effort records by accepted deliverable and by model/harness.
 * Passive (CI wait / idle / unknown) is summed separately and never folded into active.
 */
export function aggregateEffort(records) {
  if (!Array.isArray(records) || records.length === 0) throw new Error(RECEIPT_DENIALS[16]);
  const byDeliverable = {};
  const byModelHarness = {};
  const passiveTotals = { CI_WAIT: 0, IDLE: 0, UNKNOWN: 0 };
  let activeTotalMs = 0;
  for (const r of records) {
    const { deliverableId, modelAlias, harnessDigest, activeTotalMs: a, passive } = r;
    if (typeof deliverableId !== "string" || deliverableId.length === 0) throw new Error(RECEIPT_DENIALS[16]);
    if (typeof modelAlias !== "string" || modelAlias.length === 0) throw new Error(RECEIPT_DENIALS[16]);
    if (!isSha256(harnessDigest)) throw new Error(RECEIPT_DENIALS[16]);
    if (!isNonNegInt(a)) throw new Error(RECEIPT_DENIALS[15]);
    activeTotalMs += a;
    for (const state of PASSIVE_STATES_V1) {
      if (!isNonNegInt(passive?.[state])) throw new Error(RECEIPT_DENIALS[16]);
      passiveTotals[state] += passive[state];
    }
    byDeliverable[deliverableId] = (byDeliverable[deliverableId] ?? 0) + a;
    const key = `${modelAlias}/${harnessDigest}`;
    byModelHarness[key] = (byModelHarness[key] ?? 0) + a;
  }
  const unsigned = {
    schemaVersion: PAN470_REPORT_SCHEMA_V1,
    recordCount: records.length,
    activeTotalMs,
    byDeliverable,
    byModelHarness,
    passiveTotals,
  };
  return { ...unsigned, reportDigest: digestOf(unsigned) };
}

/**
 * Compose ONE structural synthetic self-check handoff using released entry points:
 * (1) runSyntheticDevelopmentWorker() -> WorkReceiptV1 with candidateCommit=null;
 * (2) validateReceiptDigest(baseReceipt) -> the existing mandatory receipt gate is
 *     retained and must pass; (3) buildHandoffReceipt -> the complete PAN470 handoff
 *     bound to that base receipt. NOT producer completion; see validateProducerBoundHandoff.
 */
export function composeCompletedHandoff({
  workOrder,
  frozenBaseCommit,
  candidateHeadCommit,
  completedAcIds,
  unmetAc,
  commands,
  evidence,
  integrationSurfaces,
  nonClaims,
}) {
  // (1) drive the ACTUAL released entry point -> the base WorkReceiptV1.
  const baseReceipt = runSyntheticDevelopmentWorker();
  // (2) retain the existing mandatory receipt gate; it must pass.
  if (!validateReceiptDigest(baseReceipt)) {
    throw new Error("MANDATORY_RECEIPT_GATE_FAILED");
  }
  // (3) bind the complete handoff to the EXISTING work-order surface (work order
  //     digest + issue) and to the released base receipt (its exact receiptDigest).
  const handoff = buildHandoffReceipt({
    order: workOrder,
    receipt: baseReceipt,
    baseCommit: frozenBaseCommit,
    headCommit: candidateHeadCommit,
    completedAcIds,
    unmetAc,
    commands,
    evidence,
    integrationSurfaces,
    nonClaims,
  });
  return {
    workOrderDigest: workOrder.workOrderDigest,
    issueIid: workOrder.issue.iid,
    baseReceipt,
    baseReceiptSha256: baseReceipt.receiptDigest,
    handoff,
  };
}

/**
 * Generate an effort report from a COMPLETE handoff plus its measured effort records.
 * Demonstrates report generation and the non-retrospective invariant: the report
 * contains NO percentage inferred from tokens / commit counts / overlapping wall time,
 * and passive time is never folded into active effort.
 */
export function generateHandoffReport({ handoff, effortRecords, evidenceRoot }) {
  if (evidenceRoot === undefined) throw new Error(RECEIPT_DENIALS[12]);
  const validation = validateHandoffReceipt(handoff, { evidenceRoot });
  if (!validation.ok) throw new Error(RECEIPT_DENIALS[1]);
  const report = aggregateEffort(effortRecords);
  const unsigned = {
    schemaVersion: PAN470_REPORT_SCHEMA_V1,
    handoffDigest: handoff.handoffDigest,
    baseCommit: handoff.baseCommit,
    headCommit: handoff.headCommit,
    completedAcIds: handoff.completedAcIds,
    unmetAcIds: handoff.unmetAc.map((u) => u.id),
    evidenceDigest: digestOf(handoff.evidence),
    recordCount: report.recordCount,
    activeTotalMs: report.activeTotalMs,
    byDeliverable: report.byDeliverable,
    byModelHarness: report.byModelHarness,
    passiveTotals: report.passiveTotals,
    nonRetrospective: true,
  };
  return { ...unsigned, reportDigest: digestOf(unsigned) };
}

/** Strict producer boundary: caller head assertions are not worker candidates. */
export function validateProducerBoundHandoff({ order, receipt, handoff, evidenceRoot }) {
  if (!order || !receipt || !handoff || !validateReceiptDigest(receipt)) throw new Error("PRODUCER_RECEIPT_INVALID");
  if (evidenceRoot === undefined) throw new Error("PRODUCER_EVIDENCE_ROOT_REQUIRED");
  const { workOrderDigest: recordedOrderDigest, ...unsignedOrder } = order;
  if (controllerSha256(unsignedOrder) !== recordedOrderDigest) throw new Error("PRODUCER_ORDER_MISMATCH");
  if (!isSha256(order.workOrderDigest) || order.workOrderDigest !== receipt.workOrderDigest ||
      order.workOrderDigest !== handoff.workOrderDigest || order.issue?.iid !== handoff.issueIid) throw new Error("PRODUCER_ORDER_MISMATCH");
  if (!isSha1(order.base?.commit) || order.base.commit !== receipt.baseCommit ||
      order.base.commit !== handoff.baseCommit) throw new Error("PRODUCER_BASE_MISMATCH");
  if (!isSha1(receipt.candidateCommit)) throw new Error("PRODUCER_CANDIDATE_MISSING");
  if (receipt.candidateCommit !== handoff.headCommit || receipt.receiptDigest !== handoff.baseReceiptDigest) throw new Error("PRODUCER_HEAD_OR_RECEIPT_MISMATCH");
  if (receipt.outcome !== "SUCCEEDED" || receipt.review?.outcome !== "PASS" ||
      receipt.tests?.some((entry) => entry.outcome !== "PASS")) throw new Error("PRODUCER_NOT_COMPLETED");
  return validateHandoffReceipt(handoff, { evidenceRoot });
}
