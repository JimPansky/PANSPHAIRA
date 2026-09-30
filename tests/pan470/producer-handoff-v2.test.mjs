// PAN470 producer-bound completion v2 — focused tests on the ACTUAL entry points.
//
// Drives the real released entry points (runSyntheticDevelopmentWorker,
// validateReceiptDigest, canonical sha256 from the dev-worker controller),
// the real on-disk evidence bytes, and real local Git state (spawnSync git) —
// no mock of any affected entry point. Does NOT demonstrate the AC03 "one real
// completed handoff" field evidence: this is a synthetic repository fixture, not a completed
// local public-code handoff bound to its independently observed Git base/head,
// executed commands/exits (with re-derived output digests), current evidence
// bytes and completed/unmet ACs, with the V1 synthetic null-candidate
// semantics and every V1 gate retained.
//
// The positive test uses a REAL completed local execution: a fixture
// repository is built by actually committing real files; the test commands are
// executed for real with their full output captured; the evidence bytes are
// read from disk at validation time. Only genuinely observed intervals are
// recorded; unobserved phases carry zero recorded intervals and are named in
// unobservedPhases; CI wait / idle stay separate passive buckets. No
// historical timing is reconstructed and no percentage is inferred.
//
// Boundary disclosures: the base WorkReceiptV1 comes from the released
// synthetic worker (candidateCommit=null by the V1 schema — that is the
// retained semantics, not a gap); the adapter's job is to bind the REAL
// observed base/head around it. The producer work order is a real,
// schema-valid WorkOrderV1 document with a self-consistent digest that names
// the ACTUAL observed base; it is not the synthetic receipt's order.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  PAN470_PRODUCER_ADAPTER_V1,
  PAN470_PRODUCER_REPORT_V1,
  PRODUCER_DENIALS,
  buildProducerWorkOrderV1,
  observeGitState,
  runCommand,
  buildActualHandoffBundle,
  buildObservedEffort,
  validateProducerBoundHandoffV1,
  generateActualHandoffReport,
} from "../../src/pan470/producer-handoff-v2.mjs";
import { buildHandoffReceipt, measureEffort } from "../../src/pan470/handoff-effort.mjs";
import { runSyntheticDevelopmentWorker, validateReceiptDigest, sha256 as controllerSha256 } from "../../dist/packages/dev-worker/src/controller.js";

const sha = (input) => createHash("sha256").update(input, "utf8").digest("hex");
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EVIDENCE_FILE = "tests/fixtures/pan470/producer-evidence-v2.txt";
const EVIDENCE_BYTES = "PAN470 producer-bound self-check evidence: actual local completed run, PASS\n";

function git(repo, args) {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return (result.stdout ?? "").trim();
}

let fixtureRepo;
after(() => { if (fixtureRepo) rmSync(fixtureRepo, { recursive: true, force: true }); });
let observed;
let order;
let receipt;
let executedCommands;
let effortBundle;
let bundle;
const completedAcIds = ["CONTRIB-03-AC01", "CONTRIB-03-AC02"];
const unmetAc = [
  { id: "CONTRIB-03-AC03", owner: "delivery-owner", resumeCondition: "independent focused acceptance plus release and readback on current main", nextAction: "Delivery owner runs exact-head CI, functional release and public readback" },
];

function rebuiltHandoff(overrides = {}) {
  return buildHandoffReceipt({
    order,
    receipt,
    baseCommit: observed.baseCommit,
    headCommit: observed.headCommit,
    completedAcIds,
    unmetAc,
    commands: executedCommands.map(({ outputText: _omit, ...rest }) => rest),
    evidence: [{ path: EVIDENCE_FILE, sha256: sha(EVIDENCE_BYTES) }],
    integrationSurfaces: [
      "src/pan470/handoff-effort.mjs",
      "src/pan470/producer-handoff-v2.mjs",
      "schemas/contracts/pan470-handoff-effort-v1.schema.json",
      "tests/pan470/handoff-effort.test.mjs",
      "tests/pan470/producer-handoff-v2.test.mjs",
    ],
    nonClaims: [
      "No publication, merge, release, network access, production effect, private material, or credential.",
      "The base WorkReceiptV1 remains synthetic with candidateCommit=null; the real head enters only through the adapter's independently observed Git section.",
      "No historical phase timing is reconstructed; unobserved phases stay named as unobserved and CI wait / idle stay separate passive buckets.",
    ],
    ...overrides,
  });
}

function validateWith(handoff, { git: gitState = observed, effort = effortBundle.effort, commands = executedCommands, order: orderArg = order, receipt: receiptArg = receipt, evidenceRoot = ROOT } = {}) {
  return validateProducerBoundHandoffV1({ order: orderArg, receipt: receiptArg, handoff, commands, effort, git: gitState, evidenceRoot, repositoryRoot: fixtureRepo });
}

test("setup: ACTUAL entry-point bundle — real Git observation, real executed commands, current evidence (prospective, contemporaneous)", () => {
  const repo = mkdtempSync(join(tmpdir(), "pan470-producer-repo-"));
  git(repo, ["init", "-q", "-b", "main"]);
  git(repo, ["config", "user.name", "pan470-producer-local"]);
  git(repo, ["config", "user.email", "pan470-producer-local@local"]);
  writeFileSync(join(repo, "README.md"), "PAN470 producer fixture repository: public synthetic code handoff.\n", "utf8");
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "-q", "-m", "pan470 producer fixture: base (real commit)"]);
  const baseCommit = git(repo, ["rev-parse", "HEAD"]);
  writeFileSync(join(repo, "note.txt"), "added by the actual completed producer run\n", "utf8");
  git(repo, ["add", "note.txt"]);
  git(repo, ["commit", "-q", "-m", "pan470 producer fixture: candidate head (real commit)"]);
  fixtureRepo = repo;

  // Independently observed Git state (the adapter's core observation).
  observed = observeGitState({ repositoryRoot: fixtureRepo, baseCommit });
  assert.equal(observed.baseCommit, baseCommit);
  assert.notEqual(observed.headCommit, baseCommit);
  assert.ok(observed.baseSubject.length > 0 && observed.headSubject.length > 0);

  // Real, schema-valid producer work order bound to the ACTUAL observed base.
  const issueSourceBytes = "Generic synthetic producer test work order; not an actual issue handoff.";
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const orderValidator = ajv.compile(JSON.parse(readFileSync(join(ROOT, "schemas", "work-order-v1.schema.json"), "utf8")));
  order = buildProducerWorkOrderV1({
    orderId: "order:pan470-producer-local-470",
    repository: "JoFe2/PANSPHAIRA",
    issueIid: 470,
    issueSnapshotDigest: sha(issueSourceBytes),
    baseRef: "pan470-public-base-v7",
    baseCommit: observed.baseCommit,
    acIds: [...completedAcIds, ...unmetAc.map(({ id }) => id)],
    allowedPaths: [
      "src/pan470/producer-handoff-v2.mjs",
      "tests/pan470/producer-handoff-v2.test.mjs",
      "tests/fixtures/pan470/producer-evidence-v2.txt",
    ],
    nowIso: new Date().toISOString(),
    expiresAtIso: new Date(Date.now() + 3600_000).toISOString(),
  });
  assert.equal(orderValidator(order), true, "producer work order is schema-valid");

  // The retained synthetic base receipt (V1 null-candidate semantics intact).
  receipt = runSyntheticDevelopmentWorker();
  assert.equal(receipt.candidateCommit, null);
  assert.equal(validateReceiptDigest(receipt), true);

  // Actually executed commands (prospective, contemporaneous observation).
  const selfCheckStart = Date.now();
  executedCommands = [
    runCommand({ command: "node -e \"console.log(\'synthetic permitted check\')\"", cwd: fixtureRepo }),
    runCommand({ command: "node -e \"console.log(\'synthetic candidate self-check\')\"", cwd: fixtureRepo }),
  ];
  const selfCheckEnd = Date.now();
  assert.ok(selfCheckEnd >= selfCheckStart);

  // Only the genuinely, contemporaneously observed interval is recorded: the
  // self-check phase (the real test-command execution). IMPLEMENTATION, REVIEW,
  // CORRECTION and FINALIZATION were NOT observed in this focused run, so they
  // are omitted and stay unobserved (zero recorded intervals, named in
  // unobservedPhases). No phase is inferred or back-filled.
  effortBundle = buildObservedEffort({
    deliverableId: "pan470-producer-bound-470",
    modelAlias: "cm.dev.primary",
    harnessDigest: sha("hermes-agent-cli-local"),
    observedIntervals: {
      SELF_CHECK: [{ startMs: 0, endMs: Math.max(1, selfCheckEnd - selfCheckStart) }],
    },
    passive: { CI_WAIT: 0, IDLE: 0, UNKNOWN: 0 },
  });

  bundle = buildActualHandoffBundle({
    order,
    receipt,
    git: observed,
    commands: executedCommands,
    evidence: [{ path: EVIDENCE_FILE, sha256: sha(EVIDENCE_BYTES) }],
    completedAcIds,
    unmetAc,
    integrationSurfaces: [
      "src/pan470/handoff-effort.mjs",
      "src/pan470/producer-handoff-v2.mjs",
      "schemas/contracts/pan470-handoff-effort-v1.schema.json",
      "tests/pan470/handoff-effort.test.mjs",
      "tests/pan470/producer-handoff-v2.test.mjs",
    ],
    nonClaims: [
      "No publication, merge, release, network access, production effect, private material, or credential.",
      "The base WorkReceiptV1 remains synthetic with candidateCommit=null; the real head enters only through the adapter's independently observed Git section.",
      "No historical phase timing is reconstructed; unobserved phases stay named as unobserved and CI wait / idle stay separate passive buckets.",
    ],
    effort: effortBundle.effort,
  });
  assert.equal(bundle.handoff.baseCommit, observed.baseCommit);
  assert.equal(bundle.handoff.headCommit, observed.headCommit);
});

test("AC03 positive: the synthetic fixture handoff validates through the real entry points (observed git + executed commands + current evidence bytes)", () => {
  const result = validateWith(bundle.handoff);
  assert.equal(result.ok, true);
  assert.equal(result.handoffDigest, bundle.handoff.handoffDigest);
  assert.equal(receipt.candidateCommit, null, "V1 synthetic null-candidate semantics retained");

  const report = generateActualHandoffReport({
    order,
    receipt,
    handoff: bundle.handoff,
    commands: executedCommands,
    effort: effortBundle.effort,
    git: observed,
    evidenceRoot: ROOT,
    repositoryRoot: fixtureRepo,
    unobservedPhases: effortBundle.unobservedPhases,
  });
  assert.equal(report.schemaVersion, PAN470_PRODUCER_REPORT_V1);
  assert.equal(report.adapterVersion, PAN470_PRODUCER_ADAPTER_V1);
  assert.equal(report.baseCommit, observed.baseCommit);
  assert.equal(report.headCommit, observed.headCommit);
  assert.deepEqual(report.unobservedPhases, ["CORRECTION", "FINALIZATION", "IMPLEMENTATION", "REVIEW"]);
  assert.equal(report.nonRetrospective, true);
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
  const validate = ajv.compile(JSON.parse(readFileSync(join(ROOT, "schemas/contracts/pan470-handoff-effort-v1.schema.json"), "utf8")));
  assert.equal(validate(bundle), true, JSON.stringify(validate.errors));
  assert.equal(validate(report), true, JSON.stringify(validate.errors));
  assert.equal(report.acceptance, "PENDING_INDEPENDENT_ACCEPTANCE");
  assert.equal(report.acceptedDeliverableTotals, null);
  assert.ok(!("percentage" in report) && !("effortPercent" in report));
  assert.ok(effortBundle.effort.byPhase.SELF_CHECK.totalMs >= 0);
  assert.equal(effortBundle.effort.byPhase.IMPLEMENTATION.totalMs, null, "unobserved phases carry zero recorded intervals");
});

test("AC03 boundary: re-digesting a claimed head cannot turn the null-only V1 receipt into a producer completion", () => {
  const { receiptDigest: _omit, ...unsigned } = receipt;
  const forged = { ...unsigned, candidateCommit: "b".repeat(40) };
  const rehashed = { ...forged, receiptDigest: controllerSha256(forged) };
  assert.equal(receipt.candidateCommit, null);
  assert.equal(validateReceiptDigest(rehashed), false, "released V1 gate still refuses");
  // The forged receipt carries a non-null candidate, so it is refused at the
  // exact candidate gate (no V1 relaxation), not accepted by re-digesting.
  assert.throws(() => validateWith(bundle.handoff, { receipt: rehashed }), (e) => e.message === PRODUCER_DENIALS[3]);
});

test("AC03 boundary: a non-null candidateCommit reaches the exact candidate gate (no V1 relaxation)", () => {
  const nonNull = { ...receipt, candidateCommit: observed.headCommit };
  assert.throws(() => validateWith(bundle.handoff, { receipt: nonNull }), (e) => e.message === PRODUCER_DENIALS[3]);
});

test("AC03 boundary: a substituted order digest is refused with the exact gate", () => {
  const substituted = { ...order, workOrderDigest: "f".repeat(64) };
  assert.throws(() => validateWith(bundle.handoff, { order: substituted }), (e) => e.message === PRODUCER_DENIALS[5]);
});

test("AC03 boundary: a different (schema-valid, re-digested) order is binding-mismatched", () => {
  const other = buildProducerWorkOrderV1({
    orderId: "order:pan470-producer-other-471",
    repository: "JoFe2/PANSPHAIRA",
    issueIid: 470,
    issueSnapshotDigest: sha("other snapshot bytes"),
    baseRef: "pan470-public-base-v7",
    baseCommit: observed.baseCommit,
    acIds: [...completedAcIds, ...unmetAc.map(({ id }) => id)],
    allowedPaths: ["src/pan470/producer-handoff-v2.mjs"],
    nowIso: new Date().toISOString(),
    expiresAtIso: new Date(Date.now() + 3600_000).toISOString(),
  });
  assert.throws(() => validateWith(bundle.handoff, { order: other }), (e) => e.message === PRODUCER_DENIALS[6]);
});

test("AC03 boundary: a handoff claiming an unobserved base is refused (base is observed, not asserted)", () => {
  assert.throws(() => validateWith(rebuiltHandoff({ baseCommit: "a".repeat(40) })), (e) => e.message === PRODUCER_DENIALS[7]);
});

test("AC03 boundary: a handoff claiming an unobserved head is refused (head is observed, not asserted)", () => {
  assert.throws(() => validateWith(rebuiltHandoff({ headCommit: "c".repeat(40) })), (e) => e.message === PRODUCER_DENIALS[8]);
});

test("AC03 boundary: a failed base worker outcome is not completion", () => {
  const failed = { ...receipt, outcome: "FAILED" };
  assert.throws(() => validateWith(bundle.handoff, { receipt: failed }), (e) => e.message === PRODUCER_DENIALS[2]);
});

test("AC03 boundary: an incomplete producer input set is refused with the exact missing-input gate", () => {
  const variants = [
    { order: null, receipt, handoff: bundle.handoff, commands: executedCommands, effort: effortBundle.effort, git: observed },
    { order, receipt: null, handoff: bundle.handoff, commands: executedCommands, effort: effortBundle.effort, git: observed },
    { order, receipt, handoff: null, commands: executedCommands, effort: effortBundle.effort, git: observed },
    { order, receipt, handoff: bundle.handoff, commands: null, effort: effortBundle.effort, git: observed },
    { order, receipt, handoff: bundle.handoff, commands: executedCommands, effort: null, git: observed },
    { order, receipt, handoff: bundle.handoff, commands: executedCommands, effort: effortBundle.effort, git: null },
  ];
  for (const variant of variants) {
    assert.throws(() => validateProducerBoundHandoffV1({ ...variant, evidenceRoot: ROOT }), (e) => e.message === PRODUCER_DENIALS[1]);
  }
});

test("AC03 boundary: a failed ACTUAL command is executed, recorded with its real exit, and an invalid exit is refused at the exact gate", () => {
  const failedCommand = runCommand({ command: "node -e \"console.error('forced failure for exact-gate test'); process.exit(3)\"", cwd: fixtureRepo });
  assert.equal(failedCommand.exit, 3, "the failed exit is observed and recorded, not relabeled");
  assert.ok(failedCommand.outputText.length > 0);
  assert.equal(failedCommand.outputDigest, sha(failedCommand.outputText));
  const badExit = { command: failedCommand.command, exit: "3", outputDigest: failedCommand.outputDigest, outputText: failedCommand.outputText };
  assert.throws(() => validateWith(bundle.handoff, { commands: [badExit] }), (e) => e.message === PRODUCER_DENIALS[11]);
});

test("AC03 boundary: a stale (substituted) command output digest is refused at the exact gate", () => {
  const stale = { ...executedCommands[0], outputDigest: sha("different output bytes") };
  assert.throws(() => validateWith(bundle.handoff, { commands: [stale] }), (e) => e.message === PRODUCER_DENIALS[12]);
});

test("AC03 boundary: an incomplete command list (empty / missing output) is refused at the exact gates", () => {
  assert.throws(() => validateWith(bundle.handoff, { commands: [] }), (e) => e.message === PRODUCER_DENIALS[10]);
  const missingOutput = { command: "x", exit: 0, outputDigest: sha("y") };
  assert.throws(() => validateWith(bundle.handoff, { commands: [missingOutput] }), (e) => e.message === PRODUCER_DENIALS[12]);
});

test("AC03 boundary: missing and stale evidence are refused with the exact retained V1 codes", () => {
  const missing = rebuiltHandoff({ evidence: [{ path: "tests/fixtures/pan470/producer-absent-v2.txt", sha256: sha("x") }] });
  assert.throws(() => validateWith(missing), (e) => e.message === "HANDBOFF_EVIDENCE_MISSING");
  const stale = rebuiltHandoff({ evidence: [{ path: EVIDENCE_FILE, sha256: sha("DIFFERENT BYTES\n") }] });
  assert.throws(() => validateWith(stale), (e) => e.message === "HANDBOFF_EVIDENCE_STALE");
});

test("AC03 boundary: symlinked evidence cannot escape the selected root (retained V1 gate)", () => {
  const dir = mkdtempSync(join(tmpdir(), "pan470-producer-symlink-"));
  try {
    symlinkSync(join(ROOT, EVIDENCE_FILE), join(dir, "evidence.txt"));
    const symlinked = rebuiltHandoff({ evidence: [{ path: "evidence.txt", sha256: sha(EVIDENCE_BYTES) }] });
    assert.throws(() => validateWith(symlinked, { evidenceRoot: dir }), (e) => e.message === "HANDBOFF_EVIDENCE_MISSING");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AC03 boundary: overlapping active phase observations are refused (retained V1 effort gate, exact code)", () => {
  assert.throws(() => buildObservedEffort({
    deliverableId: "pan470-producer-bound-470",
    modelAlias: "cm.dev.primary",
    harnessDigest: sha("hermes-agent-cli-local"),
    observedIntervals: {
      IMPLEMENTATION: [{ startMs: 0, endMs: 1000 }],
      SELF_CHECK: [{ startMs: 500, endMs: 1200 }],
      REVIEW: [],
      CORRECTION: [],
      FINALIZATION: [],
    },
    passive: { CI_WAIT: 0, IDLE: 0, UNKNOWN: 0 },
  }), (e) => e.message === "EFFORT_INTERVAL_OVERLAP");
  // The V1 effort gate (retained) refuses the overlapping record at the exact
  // gate; a producer bundle can never bind a non-overlap-free effort record.
  assert.throws(() => {
    const overlapping = measureEffort({
      deliverableId: "pan470-producer-bound-470",
      modelAlias: "cm.dev.primary",
      harnessDigest: sha("hermes-agent-cli-local"),
      intervals: {
        IMPLEMENTATION: [{ startMs: 0, endMs: 1000 }],
        SELF_CHECK: [{ startMs: 900, endMs: 2000 }],
        REVIEW: [],
        CORRECTION: [],
        FINALIZATION: [],
      },
      passive: { CI_WAIT: 0, IDLE: 0, UNKNOWN: 0 },
    });
    validateWith(bundle.handoff, { effort: overlapping });
  }, (e) => e.message === "EFFORT_INTERVAL_OVERLAP");
});

test("AC02 boundary: unobserved phases are recorded separately and never inferred; passive stays separate", () => {
  assert.deepEqual(effortBundle.unobservedPhases, ["CORRECTION", "FINALIZATION", "IMPLEMENTATION", "REVIEW"]);
  assert.equal(effortBundle.effort.passive.CI_WAIT, 0);
  assert.equal(effortBundle.effort.passive.IDLE, 0);
  assert.equal(effortBundle.effort.passive.UNKNOWN, 0);
  assert.equal(effortBundle.effort.activeTotalMs, effortBundle.effort.byPhase.SELF_CHECK.totalMs, "no passive or unobserved time is folded into active");
});

// Retained-candidate corrections: these must fail on the retained adapter.
test("AC01 correction: caller-minted Git and command records cannot prove execution", () => {
  assert.throws(() => validateWith(bundle.handoff, { git: { ...observed, headCommit: "f".repeat(40) } }), /PRODUCER_V2_HEAD_NOT_OBSERVED/);
  assert.throws(() => validateWith(bundle.handoff, { commands: structuredClone(executedCommands) }), /PRODUCER_V2_COMMAND_NOT_OBSERVED/);
});
test("AC01 correction: failed real command cannot imply completion", () => {
  const commands = [runCommand({ command: 'node -e "process.exit(3)"', cwd: fixtureRepo })];
  assert.throws(() => validateWith(rebuiltHandoff({ commands: commands.map(({command, exit, outputDigest}) => ({command, exit, outputDigest})) }), { commands }), /PRODUCER_V2_NOT_COMPLETED/);
});
test("AC01 correction: command records must match handoff and current evidence is mandatory", () => {
  const mismatch = rebuiltHandoff({ commands: [{ command: "never executed", exit: 0, outputDigest: sha("") }] });
  assert.throws(() => validateWith(mismatch), /PRODUCER_V2_COMMAND_BINDING_MISMATCH/);
  assert.throws(() => validateProducerBoundHandoffV1({ order, receipt, handoff: bundle.handoff, commands: executedCommands, effort: effortBundle.effort, git: observed, repositoryRoot: fixtureRepo }), /PRODUCER_V2_EVIDENCE_INVALID/);
});
test("AC02 correction: unknown passive is null and an empty phase list is unobserved", () => {
  const result = buildObservedEffort({ deliverableId: "d", modelAlias: "m", harnessDigest: sha("h"), observedIntervals: { SELF_CHECK: [] } });
  assert.equal(result.effort.passive.UNKNOWN, null);
  assert.ok(result.unobservedPhases.includes("SELF_CHECK"));
});
test("AC01 correction: unchanged or unrelated base fails with the intended denial", () => {
  assert.throws(() => observeGitState({ repositoryRoot: fixtureRepo, baseCommit: observed.headCommit }), (e) => e.message === "PRODUCER_V2_BASE_NOT_OBSERVED");
});

test("AC01 schema boundary: malformed integration and nonclaim entries deny even with a fresh digest", () => {
  assert.throws(() => validateWith(rebuiltHandoff({ integrationSurfaces: [null] })), /PRODUCER_V2_SCHEMA_DENIED/);
  assert.throws(() => validateWith(rebuiltHandoff({ nonClaims: [""] })), /PRODUCER_V2_SCHEMA_DENIED/);
});
test("AC01 completeness boundary: omitted or undeclared AC cannot be a complete handoff", () => {
  assert.throws(() => validateWith(rebuiltHandoff({ unmetAc: [] })), /PRODUCER_V2_AC_BINDING_MISMATCH/);
  assert.throws(() => validateWith(rebuiltHandoff({ completedAcIds: ["UNDECLARED"] })), /PRODUCER_V2_AC_BINDING_MISMATCH/);
});
test("AC02 integrity boundary: rehashed but inconsistent effort totals deny", () => {
  const { effortDigest: omit, ...unsigned } = effortBundle.effort;
  const changed = { ...unsigned, activeTotalMs: unsigned.activeTotalMs + 1 };
  assert.throws(() => validateWith(bundle.handoff, { effort: { ...changed, effortDigest: controllerSha256(changed) } }), /PRODUCER_V2_EFFORT_INVALID/);
});
test("AC01 current-head boundary: dirty tree and replay of commands from a preceding head deny", () => {
  writeFileSync(join(fixtureRepo, "successor.txt"), "synthetic successor\n");
  assert.throws(() => validateWith(bundle.handoff), /PRODUCER_V2_INPUT_MISSING/);
  git(fixtureRepo, ["add", "successor.txt"]);
  git(fixtureRepo, ["commit", "-q", "-m", "synthetic successor"]);
  const next = observeGitState({ repositoryRoot: fixtureRepo, baseCommit: observed.baseCommit });
  assert.throws(() => validateWith(rebuiltHandoff({ headCommit: next.headCommit }), { git: next }), /PRODUCER_V2_COMMAND_NOT_OBSERVED/);
});
