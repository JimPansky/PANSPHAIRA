// PAN470 — AC tests for complete worker handoff + measurable finalization effort.
//
// Drives the ACTUAL released entry points (runSyntheticDevelopmentWorker,
// validateReceiptDigest, and the dev-worker controller's canonical sha256) plus the
// real on-disk evidence bytes. No mock of the affected entry points. Census-safe: the
// canonical-json identifier is never referenced here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFileSync, rmSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import {
  buildHandoffReceipt,
  validateHandoffReceipt,
  measureEffort,
  aggregateEffort,
  generateHandoffReport,
  composeCompletedHandoff,
  validateProducerBoundHandoff,
  EFFORT_PHASES_V1,
  PASSIVE_STATES_V1,
  RECEIPT_DENIALS,
  PAN470_RECEIPT_SCHEMA_V1,
} from "../../src/pan470/handoff-effort.mjs";
import {
  syntheticWorkOrder,
  runSyntheticDevelopmentWorker,
  validateReceiptDigest,
  sha256 as controllerSha256,
} from "../../dist/packages/dev-worker/src/controller.js";

const sha = (input) => createHash("sha256").update(input, "utf8").digest("hex");
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EVIDENCE_FILE = "tests/fixtures/pan470/evidence-selfcheck-v1.txt";
const EVIDENCE_BYTES = "PAN470 synthetic self-check evidence: PASS\n";

function orderAndReceipt() {
  const workOrder = syntheticWorkOrder();
  const receipt = runSyntheticDevelopmentWorker();
  if (!validateReceiptDigest(receipt)) throw new Error("baseline receipt gate failed");
  return { workOrder, receipt };
}

function baseHandoff(workOrder, receipt, overrides = {}) {
  return buildHandoffReceipt({
    order: workOrder,
    receipt,
    baseCommit: "a".repeat(40),
    headCommit: "b".repeat(40),
    completedAcIds: ["CONTRIB-03-AC01", "CONTRIB-03-AC02", "CONTRIB-03-AC03"],
    unmetAc: [
      { id: "CONTRIB-03-AC04", owner: "maintainer", resumeCondition: "real-environment CI evidence", nextAction: "hold until real CI" },
    ],
    commands: [{ command: "npm run pan470:test", exit: 0, outputDigest: sha("output") }],
    evidence: [{ path: EVIDENCE_FILE, sha256: sha(EVIDENCE_BYTES) }],
    integrationSurfaces: [
      "src/pan470/handoff-effort.mjs",
      "schemas/contracts/pan470-handoff-effort-v1.schema.json",
    ],
    nonClaims: ["No live publication or production effect."],
    ...overrides,
  });
}

test("AC01 positive: a complete handoff names base/head, AC IDs, commands/exits, evidence, surfaces and nonclaims", () => {
  const { workOrder, receipt } = orderAndReceipt();
  const handoff = baseHandoff(workOrder, receipt);
  assert.equal(handoff.schemaVersion, PAN470_RECEIPT_SCHEMA_V1);
  assert.equal(handoff.baseCommit, "a".repeat(40));
  assert.equal(handoff.headCommit, "b".repeat(40));
  assert.deepEqual(handoff.completedAcIds, ["CONTRIB-03-AC01", "CONTRIB-03-AC02", "CONTRIB-03-AC03"]);
  assert.equal(handoff.unmetAc[0].id, "CONTRIB-03-AC04");
  assert.equal(handoff.commands[0].exit, 0);
  assert.equal(handoff.evidence[0].path, EVIDENCE_FILE);
  assert.equal(handoff.integrationSurfaces.length, 2);
  assert.equal(handoff.nonClaims.length, 1);
  const v = validateHandoffReceipt(handoff);
  assert.equal(v.ok, true);
  assert.equal(v.handoffDigest, handoff.handoffDigest);
});

test("AC01 negative: a tampered receipt is refused (does not imply completion)", () => {
  const { workOrder, receipt } = orderAndReceipt();
  const handoff = baseHandoff(workOrder, receipt);
  const tampered = { ...handoff, outcome: "FAILED" };
  assert.throws(() => validateHandoffReceipt(tampered), (e) => e.message === "HANDBOFF_RECEIPT_DIGEST_MISMATCH");
});

test("AC01 negative: missing head commit is refused", () => {
  const { workOrder, receipt } = orderAndReceipt();
  const handoff = baseHandoff(workOrder, receipt, { headCommit: "not-a-sha1" });
  assert.throws(() => validateHandoffReceipt(handoff), (e) => e.message === "HANDBOFF_HEAD_MISSING");
});

test("AC01 negative: an empty completed-AC list is refused", () => {
  const { workOrder, receipt } = orderAndReceipt();
  const handoff = baseHandoff(workOrder, receipt, { completedAcIds: [] });
  assert.throws(() => validateHandoffReceipt(handoff), (e) => e.message === "HANDBOFF_AC_EMPTY");
});

test("AC01 negative: an AC cannot be both completed and unmet", () => {
  const { workOrder, receipt } = orderAndReceipt();
  const handoff = baseHandoff(workOrder, receipt, {
    completedAcIds: ["CONTRIB-03-AC01"],
    unmetAc: [{ id: "CONTRIB-03-AC01", owner: "o", resumeCondition: "r", nextAction: "n" }],
  });
  assert.throws(() => validateHandoffReceipt(handoff), (e) => e.message === "HANDBOFF_AC_OVERLAP");
});

test("AC01 negative: a non-integer command exit is refused", () => {
  const { workOrder, receipt } = orderAndReceipt();
  const handoff = baseHandoff(workOrder, receipt, { commands: [{ command: "x", exit: "0", outputDigest: sha("x") }] });
  assert.throws(() => validateHandoffReceipt(handoff), (e) => e.message === "HANDBOFF_COMMAND_EXIT_INVALID");
});

test("AC03 negative: stale evidence bytes are refused (recorded sha256 no longer matches current bytes)", () => {
  const { workOrder, receipt } = orderAndReceipt();
  const handoff = baseHandoff(workOrder, receipt);
  // The evidence file exists at its real on-disk bytes -> re-derivation matches -> ok.
  assert.equal(validateHandoffReceipt(handoff, { evidenceRoot: ROOT }).ok, true);
  // Stale: record a sha256 that does not match the current on-disk bytes.
  const stale = baseHandoff(workOrder, receipt, {
    evidence: [{ path: EVIDENCE_FILE, sha256: sha("DIFFERENT BYTES\n") }],
  });
  assert.throws(() => validateHandoffReceipt(stale, { evidenceRoot: ROOT }), (e) => e.message === "HANDBOFF_EVIDENCE_STALE");
});

test("AC03 negative: a missing evidence file is refused", () => {
  const { workOrder, receipt } = orderAndReceipt();
  const missing = baseHandoff(workOrder, receipt, {
    evidence: [{ path: "tests/fixtures/pan470/does-not-exist.txt", sha256: sha("x") }],
  });
  assert.throws(() => validateHandoffReceipt(missing, { evidenceRoot: ROOT }), (e) => e.message === "HANDBOFF_EVIDENCE_MISSING");
});

test("AC02 positive: active phases are measured separately from CI wait / idle / unknown", () => {
  const harness = sha("harness-v1");
  const effort = measureEffort({
    deliverableId: "D1",
    modelAlias: "cm.dev.primary",
    harnessDigest: harness,
    intervals: {
      IMPLEMENTATION: [{ startMs: 0, endMs: 1000 }, { startMs: 2000, endMs: 3000 }],
      SELF_CHECK: [{ startMs: 4000, endMs: 5000 }],
      REVIEW: [],
      CORRECTION: [{ startMs: 6000, endMs: 6500 }],
      FINALIZATION: [{ startMs: 7000, endMs: 7200 }],
    },
    passive: { CI_WAIT: 90000, IDLE: 12000, UNKNOWN: 300 },
  });
  // Active = 1000 + 1000 + 1000 + 500 + 200 = 3700; passive stays separate.
  assert.equal(effort.activeTotalMs, 3700);
  assert.equal(effort.byPhase.IMPLEMENTATION.totalMs, 2000);
  assert.equal(effort.byPhase.CORRECTION.totalMs, 500);
  assert.equal(effort.passive.CI_WAIT, 90000);
  assert.equal(effort.passive.IDLE, 12000);
  assert.equal(effort.passive.UNKNOWN, 300);
  // Passive is NEVER folded into active.
  assert.equal(effort.activeTotalMs + effort.passive.CI_WAIT, 93700);
});

test("AC02 positive: aggregation by accepted deliverable and by model/harness", () => {
  const h1 = sha("harness-v1");
  const h2 = sha("harness-v2");
  const mk = (deliverableId, modelAlias, harnessDigest, active, ciWait) =>
    measureEffort({
      deliverableId, modelAlias, harnessDigest,
      intervals: { IMPLEMENTATION: [{ startMs: 0, endMs: active }], SELF_CHECK: [], REVIEW: [], CORRECTION: [], FINALIZATION: [] },
      passive: { CI_WAIT: ciWait, IDLE: 0, UNKNOWN: 0 },
    });
  const report = aggregateEffort([
    mk("D1", "cm.dev.primary", h1, 1000, 500),
    mk("D1", "cm.dev.primary", h1, 2000, 1500),
    mk("D2", "cm.dev.fast", h2, 400, 100),
  ]);
  assert.equal(report.activeTotalMs, 3400);
  assert.equal(report.byDeliverable.D1, 3000);
  assert.equal(report.byDeliverable.D2, 400);
  assert.equal(report.byModelHarness[`cm.dev.primary/${h1}`], 3000);
  assert.equal(report.byModelHarness[`cm.dev.fast/${h2}`], 400);
  assert.equal(report.passiveTotals.CI_WAIT, 2100);
});

test("AC02 negative: overlapping active intervals are refused", () => {
  assert.throws(
    () =>
      measureEffort({
        deliverableId: "D1", modelAlias: "cm.dev.primary", harnessDigest: sha("h"),
        intervals: { IMPLEMENTATION: [{ startMs: 0, endMs: 1000 }, { startMs: 500, endMs: 1500 }], SELF_CHECK: [], REVIEW: [], CORRECTION: [], FINALIZATION: [] },
        passive: { CI_WAIT: 0, IDLE: 0, UNKNOWN: 0 },
      }),
    (e) => e.message === "EFFORT_INTERVAL_OVERLAP",
  );
});

test("AC02 negative: an unknown passive state is refused", () => {
  assert.throws(
    () =>
      measureEffort({
        deliverableId: "D1", modelAlias: "cm.dev.primary", harnessDigest: sha("h"),
        intervals: { IMPLEMENTATION: [{ startMs: 0, endMs: 100 }], SELF_CHECK: [], REVIEW: [], CORRECTION: [], FINALIZATION: [] },
        passive: { CI_WAIT: 0, IDLE: 0 }, // UNKNOWN missing
      }),
    (e) => e.message === "EFFORT_STATE_UNKNOWN",
  );
});

test("AC03 synthetic self-check report (not producer completion) + non-retrospective", () => {
  const { workOrder, receipt } = orderAndReceipt();
  const composed = composeCompletedHandoff({
    workOrder,
    frozenBaseCommit: "a".repeat(40),
    candidateHeadCommit: "b".repeat(40),
    completedAcIds: ["CONTRIB-03-AC01"],
    unmetAc: [],
    commands: [{ command: "npm run pan470:test", exit: 0, outputDigest: sha("out") }],
    evidence: [{ path: EVIDENCE_FILE, sha256: sha(EVIDENCE_BYTES) }],
    integrationSurfaces: ["src/pan470/handoff-effort.mjs"],
    nonClaims: ["synthetic local evidence only"],
  });
  // The mandatory existing receipt gate is retained and passed.
  assert.equal(validateReceiptDigest(composed.baseReceipt), true);
  assert.equal(composed.baseReceiptSha256, composed.baseReceipt.receiptDigest);
  const effort = measureEffort({
    deliverableId: "D1", modelAlias: "cm.dev.primary", harnessDigest: sha("harness"),
    intervals: { IMPLEMENTATION: [{ startMs: 0, endMs: 1000 }], SELF_CHECK: [{ startMs: 1000, endMs: 1500 }], REVIEW: [], CORRECTION: [], FINALIZATION: [] },
    passive: { CI_WAIT: 9000, IDLE: 0, UNKNOWN: 0 },
  });
  const report = generateHandoffReport({ handoff: composed.handoff, effortRecords: [effort], evidenceRoot: ROOT });
  assert.equal(report.handoffDigest, composed.handoff.handoffDigest);
  assert.equal(report.completedAcIds, composed.handoff.completedAcIds);
  assert.equal(report.activeTotalMs, 1500);
  assert.equal(report.passiveTotals.CI_WAIT, 9000);
  assert.equal(report.nonRetrospective, true);
  // The report contains no percentage field derived from tokens/commits/overlapping wall time.
  assert.ok(!("percentage" in report));
  assert.ok(!("effortPercent" in report));
});

test("boundary: exact-byte evidence reuse — unchanged bytes validate, any change is refused", () => {
  const dir = mkdtempSync(join(tmpdir(), "pan470-evidence-"));
  try {
    const relPath = "evidence.txt";
    writeFileSync(join(dir, relPath), EVIDENCE_BYTES, "utf8");
    const { workOrder, receipt } = orderAndReceipt();
    const handoff = baseHandoff(workOrder, receipt, { evidence: [{ path: relPath, sha256: sha(EVIDENCE_BYTES) }] });
    assert.equal(validateHandoffReceipt(handoff, { evidenceRoot: dir }).ok, true);
    // Reuse unchanged exact bytes -> still valid.
    writeFileSync(join(dir, relPath), EVIDENCE_BYTES, "utf8");
    assert.equal(validateHandoffReceipt(handoff, { evidenceRoot: dir }).ok, true);
    // Any change -> refused as stale.
    writeFileSync(join(dir, relPath), EVIDENCE_BYTES + "tampered\n", "utf8");
    assert.throws(() => validateHandoffReceipt(handoff, { evidenceRoot: dir }), (e) => e.message === "HANDBOFF_EVIDENCE_STALE");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("enumerations: closed phase and passive-state sets", () => {
  assert.deepEqual(EFFORT_PHASES_V1, ["IMPLEMENTATION", "SELF_CHECK", "REVIEW", "CORRECTION", "FINALIZATION"]);
  assert.deepEqual(PASSIVE_STATES_V1, ["CI_WAIT", "IDLE", "UNKNOWN"]);
  assert.equal(RECEIPT_DENIALS.length, 20);
});

// Delivery-owner independent negatives: a digest-consistent failure is not completion;
// a link to a file outside the selected root is refused before reading it.
test("review negative: failed base outcome cannot validate completed ACs", () => {
  const { workOrder, receipt } = orderAndReceipt();
  const handoff = baseHandoff(workOrder, { ...receipt, outcome: "FAILED" });
  assert.throws(() => validateHandoffReceipt(handoff), /HANDBOFF_RECEIPT_SCHEMA_DENIED/);
});

test("review negative: symlinked evidence cannot escape the selected root", () => {
  const dir = mkdtempSync(join(tmpdir(), "pan470-symlink-"));
  try {
    symlinkSync(join(ROOT, EVIDENCE_FILE), join(dir, "evidence.txt"));
    const { workOrder, receipt } = orderAndReceipt();
    const handoff = baseHandoff(workOrder, receipt, { evidence: [{ path: "evidence.txt", sha256: sha(EVIDENCE_BYTES) }] });
    assert.throws(() => validateHandoffReceipt(handoff, { evidenceRoot: dir }), /HANDBOFF_EVIDENCE_MISSING/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("review negative: across-phase overlapping intervals are refused", () => {
  const intervals = { IMPLEMENTATION: [{ startMs: 0, endMs: 1000 }], SELF_CHECK: [], REVIEW: [{ startMs: 500, endMs: 1200 }], CORRECTION: [], FINALIZATION: [] };
  assert.throws(() => measureEffort({ deliverableId: "D1", modelAlias: "synthetic", harnessDigest: sha("h"), intervals, passive: { CI_WAIT: 0, IDLE: 0, UNKNOWN: 0 } }), /EFFORT_INTERVAL_OVERLAP/);
});

test("producer boundary refuses the real synthetic worker null candidate", () => {
  const { workOrder, receipt } = orderAndReceipt();
  const handoff = baseHandoff(workOrder, receipt, { baseCommit: workOrder.base.commit });
  assert.throws(() => validateProducerBoundHandoff({ order: workOrder, receipt, handoff, evidenceRoot: ROOT }), /PRODUCER_CANDIDATE_MISSING/);
});
test("producer boundary rejects substituted order, base and rehashed candidate assertion", () => {
  const { workOrder, receipt } = orderAndReceipt();
  const handoff = baseHandoff(workOrder, receipt, { baseCommit: workOrder.base.commit });
  assert.throws(() => validateProducerBoundHandoff({ order: { ...workOrder, workOrderDigest: "f".repeat(64) }, receipt, handoff, evidenceRoot: ROOT }), /PRODUCER_ORDER_MISMATCH/);
  assert.throws(() => validateProducerBoundHandoff({ order: workOrder, receipt, handoff: baseHandoff(workOrder, receipt), evidenceRoot: ROOT }), /PRODUCER_BASE_MISMATCH/);
  assert.throws(() => validateProducerBoundHandoff({ order: { ...workOrder, issue: { iid: workOrder.issue.iid + 1, snapshotDigest: workOrder.issue.snapshotDigest } }, receipt, handoff, evidenceRoot: ROOT }), /PRODUCER_ORDER_MISMATCH/);
  assert.throws(() => validateProducerBoundHandoff({ order: workOrder, receipt, handoff }), /PRODUCER_EVIDENCE_ROOT_REQUIRED/);
  assert.throws(() => validateProducerBoundHandoff({ order: workOrder, receipt: { ...receipt, candidateCommit: "b".repeat(40) }, handoff, evidenceRoot: ROOT }), /PRODUCER_RECEIPT_INVALID/);
});

test("AC03 boundary: re-digesting a claimed head cannot turn a null-only worker receipt into a producer completion",()=>{
  const {workOrder,receipt}=orderAndReceipt();
  const {receiptDigest:_ignore,...unsigned}=receipt;
  const altered={...unsigned,candidateCommit:"b".repeat(40)};
  const rehashed={...altered,receiptDigest:controllerSha256(altered)};
  assert.equal(receipt.candidateCommit,null);
  assert.equal(validateReceiptDigest(rehashed),false); // WorkReceiptV1 schema binds null; digest alone is insufficient.
  const handoff=baseHandoff(workOrder,rehashed,{baseCommit:workOrder.base.commit,headCommit:altered.candidateCommit});
  assert.throws(()=>validateProducerBoundHandoff({order:workOrder,receipt:rehashed,handoff,evidenceRoot:ROOT}),/PRODUCER_RECEIPT_INVALID/);
});
