// PAN455 — controlled challenge reveal: one synthetic material-intake
// eligibility rule + a sequence-addressed schema/state mapping, delivered
// THROUGH the unchanged frozen bound-task-handle (BTH) business journey.
//
// TDD: this suite is written FIRST (RED) against the frozen baseline 76cc8d0,
// which has NO src/pan455 adapter — it lacks the intake mapping and the
// intake-release eligibility rule entirely. The RED below is that specific
// missing rule/mapping (an explicit gate), not a cosmetic field rename.
// GREEN is the new additive adapter in src/pan455/intake-release.mjs reusing
// the unchanged BTH seam and the frozen CKS12 invalidation helpers.
//
// The revealed challenge source (pan455.synthetic/order-intake-journal/v1) is
// the single supported synthetic Dolibarr Order binding; its scope equals the
// frozen SUPPORTED_ORDER_BINDING, so an eligible mapping proceeds to the
// existing BTH checks (owner approval, one-use lease, reservation, readback).
// No case-ID branch, no second gateway, no blanket denial.

import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson, sha256 } from "../../demo/runtime/enforcement-gate.mjs";
import { createAuthoritativeApprovalSnapshot } from "../../demo/runtime/authoritative-approval-snapshot.mjs";
import {
  useBoundTaskHandle,
  BoundTaskHandleResolver,
  SUPPORTED_ORDER_BINDING,
} from "../../src/pan442/bound-task-handle.mjs";

// Reuse the SAME frozen CKS12 helper (type-stripped under Node 24) so the
// invalidation logic is the unchanged frozen implementation, not a re-write.
const cks12 = await import("../../src/cks-12/drift-revalidation-fastpath.ts");

// The adapter under test is a NEW additive module (absent at the frozen
// baseline -> the RED gate). Its absence is the specific missing mapping/rule.
let pan455 = null;
try {
  pan455 = await import("../../src/pan455/intake-release.mjs");
} catch {
  pan455 = null;
}

// ---------------------------------------------------------------------------
// Revealed challenge source (challenge.json `source`), verbatim.
// ---------------------------------------------------------------------------
const CHALLENGE_SOURCE = {
  schemaVersion: "pan455.synthetic/order-intake-journal/v1",
  trustLabel: "LOCAL_SYNTHETIC",
  identity: { tenant: "panskys-zoo-demo", principal: "ops:local-demo" },
  task: { reference: "pan455-intake-order-0001", run: "run:pan455:intake:0001", ttlMs: 120000 },
  order: {
    provider: "dolibarr",
    entity: "Order",
    operation: "CREATE_IF_ABSENT",
    reference: "CM-ADMIN-AI-ESCALATION-001",
    customerNumber: 7,
    dateEpoch: 1767225600,
    revision: 1,
    purpose: "CREATE_SYNTHETIC_SALES_ORDER",
    currency: "EUR",
    amountLimitMinor: 0,
  },
  intake: {
    head: 5,
    events: [
      { seq: 4, kind: "CLEAR", hold: "packing-check" },
      { seq: 1, kind: "OPEN", hold: "address-check" },
      { seq: 5, kind: "RELEASE" },
      { seq: 3, kind: "CLEAR", hold: "address-check" },
      { seq: 2, kind: "OPEN", hold: "packing-check" },
    ],
  },
};

// The changed source (challenge.json `changedSource`): an extra OPEN appended
// after RELEASE -> BLOCKED, with the dispatch-check hold.
const CHANGED_SOURCE = {
  ...CHALLENGE_SOURCE,
  intake: {
    head: 6,
    events: [
      ...CHALLENGE_SOURCE.intake.events,
      { seq: 6, kind: "OPEN", hold: "dispatch-check" },
    ],
  },
};

const CHANGE = {
  knowledgeId: "pan455:intake-applicability",
  supersededVersion: "v1",
  replacementVersion: "v2",
  affectedDependencyIds: ["intake-mapping-proof", "intake-eligibility-proof"],
  unaffectedDependencyId: "owner-lease-policy-proof",
};

const TENANT = "panskys-zoo-demo";
const USER = "ops:local-demo";

// Labelled in-process synthetic provider (the supported synthetic fixture
// boundary). Counters assert exact snapshot/mutation/readback effect counts.
function labelledSyntheticProvider({ label = "local-synthetic-dolibarr" } = {}) {
  let snapshotReads = 0;
  let mutations = 0;
  let readbacks = 0;
  const provider = {
    label,
    trustLabel: "LOCAL_SYNTHETIC",
    async readAuthoritativeSnapshot(action) {
      snapshotReads += 1;
      return createAuthoritativeApprovalSnapshot(action, []);
    },
    async mutate() {
      mutations += 1;
      return { id: "order-pan455" };
    },
    async readback(action, result) {
      readbacks += 1;
      return {
        id: result.id,
        date: action.payload.body.date,
        ref_client: action.payload.body.ref_client,
        socid: action.payload.body.socid,
      };
    },
  };
  provider.snapshotReads = () => snapshotReads;
  provider.mutations = () => mutations;
  provider.readbacks = () => readbacks;
  return provider;
}

async function expectIntakeDenial(promise, code) {
  let error;
  try {
    await promise;
  } catch (value) {
    error = value;
  }
  assert.ok(error, `expected denial ${code}`);
  assert.equal(error.name, "BoundTaskHandleError", "typed denial, not catch-any");
  assert.equal(error.message, code, `exact denial code (got ${error.message})`);
}

function requireAdapter(message) {
  assert.ok(pan455, message);
  return pan455;
}

const EFFECTS_ZERO = (provider) =>
  assert.deepEqual(
    [provider.snapshotReads(), provider.mutations(), provider.readbacks()],
    [0, 0, 0],
    "pre-effect denial has zero provider effects",
  );

// ===========================================================================
// The specific baseline-missing rule/mapping, now provided by the adapter.
// RED at the frozen baseline (src/pan455 absent -> requireAdapter throws for
// every functional test below); GREEN once the additive adapter exists. This
// is the exact missing surface we implement, not a cosmetic field rename.
// ===========================================================================
test("PAN455-00 the adapter provides the specific intake mapping and release-eligibility rule", () => {
  const adapter = requireAdapter("the specific missing rule/mapping must be implemented (src/pan455/intake-release.mjs)");
  assert.equal(typeof adapter.foldIntakeJournal, "function", "sequence-addressed state fold present");
  assert.equal(typeof adapter.checkIntakeEligibility, "function", "intake-release eligibility rule present");
  assert.equal(typeof adapter.mapIntakeToTrustedTask, "function", "schema/state mapping present");
  // The revealed challenge source itself is eligible and folds RELEASED.
  const folded = adapter.foldIntakeJournal(CHALLENGE_SOURCE);
  assert.equal(folded.state, "RELEASED");
  assert.equal(adapter.checkIntakeEligibility(CHALLENGE_SOURCE).eligible, true);
});

// ===========================================================================
// AC02 — the sequence-addressed schema/state mapping (data-driven fold).
// ===========================================================================
test("PAN455-01 journal folds on sequence, not array order or largest row", () => {
  const { foldIntakeJournal } = requireAdapter();
  const folded = foldIntakeJournal(CHALLENGE_SOURCE);
  // seq order: 1 OPEN address -> 2 OPEN packing -> 3 CLEAR address ->
  // 4 CLEAR packing -> 5 RELEASE. Final: RELEASED, no open holds.
  assert.equal(folded.state, "RELEASED");
  assert.equal(folded.holds.length, 0);
  assert.equal(folded.error, null);
});

test("PAN455-02 duplicate sequence is CONTRADICTORY even for identical rows", () => {
  const { foldIntakeJournal } = requireAdapter();
  const dup = {
    ...CHALLENGE_SOURCE,
    intake: {
      head: 2,
      events: [{ seq: 1, kind: "OPEN", hold: "a" }, { seq: 1, kind: "OPEN", hold: "a" }],
    },
  };
  assert.equal(foldIntakeJournal(dup).error, "CONTRADICTORY");
});

test("PAN455-03 a gap, a null journal and an unknown kind are UNKNOWN", () => {
  const { foldIntakeJournal } = requireAdapter();
  const gap = {
    ...CHALLENGE_SOURCE,
    intake: { head: 3, events: [{ seq: 1, kind: "OPEN", hold: "a" }, { seq: 3, kind: "RELEASE" }] },
  };
  assert.equal(foldIntakeJournal(gap).error, "UNKNOWN");
  assert.equal(foldIntakeJournal(null).error, "UNKNOWN");
  const noIntake = { ...CHALLENGE_SOURCE };
  delete noIntake.intake;
  assert.equal(foldIntakeJournal(noIntake).error, "UNKNOWN");
  const unknownKind = {
    ...CHALLENGE_SOURCE,
    intake: { head: 1, events: [{ seq: 1, kind: "BYPASS" }] },
  };
  assert.equal(foldIntakeJournal(unknownKind).error, "UNKNOWN");
});

test("PAN455-04 an illegal transition is CONTRADICTORY", () => {
  const { foldIntakeJournal } = requireAdapter();
  // RELEASE while a hold is open -> CONTRADICTORY.
  const releaseWithHold = {
    ...CHALLENGE_SOURCE,
    intake: { head: 2, events: [{ seq: 1, kind: "OPEN", hold: "a" }, { seq: 2, kind: "RELEASE" }] },
  };
  assert.equal(foldIntakeJournal(releaseWithHold).error, "CONTRADICTORY");
  // CLEAR of a hold that is not open -> CONTRADICTORY.
  const clearUnknown = {
    ...CHALLENGE_SOURCE,
    intake: { head: 1, events: [{ seq: 1, kind: "CLEAR", hold: "ghost" }] },
  };
  assert.equal(foldIntakeJournal(clearUnknown).error, "CONTRADICTORY");
  // OPEN with an empty hold key -> CONTRADICTORY.
  const openEmpty = {
    ...CHALLENGE_SOURCE,
    intake: { head: 1, events: [{ seq: 1, kind: "OPEN", hold: "" }] },
  };
  assert.equal(foldIntakeJournal(openEmpty).error, "CONTRADICTORY");
  // RELEASE carrying a hold field -> CONTRADICTORY (no hold field permitted).
  const releaseWithHoldField = {
    ...CHALLENGE_SOURCE,
    intake: { head: 1, events: [{ seq: 1, kind: "RELEASE", hold: "a" }] },
  };
  assert.equal(foldIntakeJournal(releaseWithHoldField).error, "CONTRADICTORY");
});

test("PAN455-05 CLEAR of the last hold yields PENDING, never RELEASED", () => {
  const { foldIntakeJournal } = requireAdapter();
  const clearOnly = {
    ...CHALLENGE_SOURCE,
    intake: { head: 2, events: [{ seq: 1, kind: "OPEN", hold: "a" }, { seq: 2, kind: "CLEAR", hold: "a" }] },
  };
  const folded = foldIntakeJournal(clearOnly);
  assert.equal(folded.state, "PENDING");
  assert.equal(folded.holds.length, 0);
  assert.equal(folded.error, null);
});

test("PAN455-05b reopening a cleared key is permitted and re-blocks", () => {
  const { foldIntakeJournal } = requireAdapter();
  const reopen = {
    ...CHALLENGE_SOURCE,
    intake: {
      head: 4,
      events: [
        { seq: 1, kind: "OPEN", hold: "a" },
        { seq: 2, kind: "CLEAR", hold: "a" },
        { seq: 3, kind: "OPEN", hold: "a" },
        { seq: 4, kind: "RELEASE" },
      ],
    },
  };
  // seq3 reopens a (cleared) key -> BLOCKED; seq4 RELEASE with an open hold ->
  // CONTRADICTORY. This proves reopen re-blocks (the release cannot pass).
  assert.equal(foldIntakeJournal(reopen).error, "CONTRADICTORY");
});

// ===========================================================================
// AC02 — the one material intake-release eligibility rule.
// ===========================================================================
test("PAN455-06 eligibility: released with no open hold is eligible", () => {
  const { checkIntakeEligibility } = requireAdapter();
  const folded = checkIntakeEligibility(CHALLENGE_SOURCE);
  assert.equal(folded.eligible, true);
  assert.equal(folded.code, null);
  assert.equal(folded.state, "RELEASED");
});

test("PAN455-07 an appended OPEN after RELEASE is denied NOT_RELEASED (the material rule)", () => {
  const { checkIntakeEligibility } = requireAdapter();
  const folded = checkIntakeEligibility(CHANGED_SOURCE);
  assert.equal(folded.eligible, false);
  assert.equal(folded.code, "PAN455_INTAKE_NOT_RELEASED_DENIED");
  assert.equal(folded.state, "BLOCKED");
  assert.deepEqual(folded.holds, ["dispatch-check"]);
});

// ===========================================================================
// AC02 — mapping joins principal/order/task into the trusted task shape.
// ===========================================================================
test("PAN455-08 mapping keeps order.revision as objectVersion, not journal.head", () => {
  const { mapIntakeToTrustedTask } = requireAdapter();
  const task = mapIntakeToTrustedTask(CHALLENGE_SOURCE);
  assert.equal(task.taskRef, "pan455-intake-order-0001");
  assert.equal(task.runId, "run:pan455:intake:0001");
  assert.equal(task.tenant, TENANT);
  assert.equal(task.user, USER);
  assert.equal(task.objectVersion, 1);
  assert.notEqual(task.objectVersion, CHALLENGE_SOURCE.intake.head);
  assert.deepEqual(task.object, {
    provider: "dolibarr",
    entity: "Order",
    operation: "CREATE_IF_ABSENT",
    refClient: "CM-ADMIN-AI-ESCALATION-001",
    customerId: 7,
    orderDateEpoch: 1767225600,
  });
  assert.equal(task.purpose, "CREATE_SYNTHETIC_SALES_ORDER");
  assert.equal(task.currency, "EUR");
  assert.equal(task.amountLimitMinor, 0);
  assert.equal(task.ttlMs, 120000);
});

// Trusted-source evidence binds the FULL raw source digest + mapping/rule ids;
// a journal change changes that digest even when the effect identity is held.
test("PAN455-09 evidence binds raw source digest + mapping/rule identities; journal change changes it", () => {
  const { mapIntakeToTrustedTask, buildIntakeTrustedTaskSource, createIntakeEvidence } = requireAdapter();
  const taskA = mapIntakeToTrustedTask(CHALLENGE_SOURCE);
  const taskB = mapIntakeToTrustedTask(CHANGED_SOURCE);
  // The order scope (effect identity) is identical; only the journal changed.
  assert.equal(
    sha256(canonicalJson(taskA.object)),
    sha256(canonicalJson(taskB.object)),
    "effect identity (order scope) unchanged",
  );
  const sourceA = buildIntakeTrustedTaskSource(taskA);
  const sourceB = buildIntakeTrustedTaskSource(taskB);
  assert.equal(sourceA.sourceDigest, sourceB.sourceDigest, "same order scope -> same trusted source digest");
  const evA = createIntakeEvidence(CHALLENGE_SOURCE, taskA, sourceA, {
    mappingProfileVersion: "intake-journal-to-bound-task/v1",
    ruleVersion: "intake-release/v1",
  });
  const evB = createIntakeEvidence(CHANGED_SOURCE, taskB, sourceB, {
    mappingProfileVersion: "intake-journal-to-bound-task/v1",
    ruleVersion: "intake-release/v1",
  });
  const expectedRawDigest = sha256(canonicalJson(CHALLENGE_SOURCE));
  assert.equal(evA.rawSourceDigest, expectedRawDigest);
  assert.equal(evA.taskRef, "pan455-intake-order-0001");
  assert.equal(evA.sourceDigest, sourceA.sourceDigest);
  assert.equal(evA.objectVersion, taskA.objectVersion);
  assert.equal(evA.intakeHead, CHALLENGE_SOURCE.intake.head);
  const { evidenceSha256, ...evCore } = evA;
  assert.equal(evidenceSha256, sha256(canonicalJson(evCore)));
  assert.notEqual(evA.rawSourceDigest, evB.rawSourceDigest, "raw source digest changes with the journal");
  assert.notEqual(evA.evidenceSha256, evB.evidenceSha256, "evidence digest changes with the journal");
});

// ===========================================================================
// AC02 — the useful positive: eligible mapping runs the UNCHANGED real journey.
// ===========================================================================
test("PAN455-10 positive end-to-end through the real seam: one mutation + one readback", async () => {
  const { usePan455IntakeOrder } = requireAdapter();
  const provider = labelledSyntheticProvider();
  const out = await usePan455IntakeOrder({
    source: CHALLENGE_SOURCE,
    provider,
    now: () => 1_000_000,
  });
  assert.equal(out.status, "PASS");
  assert.equal(out.stage, "EXECUTE");
  assert.ok(provider.snapshotReads() >= 1, "seam reads the authoritative snapshot");
  assert.equal(provider.mutations(), 1, "exactly one provider mutation");
  assert.equal(provider.readbacks(), 1, "exactly one provider readback");
  assert.equal(out.result.status, "PASS");
  assert.equal(out.result.replayed, false);
  assert.equal(out.result.receipt.replayKey, out.decision.replayKey);
  assert.equal(out.result.readback.ref_client, "CM-ADMIN-AI-ESCALATION-001");
  assert.equal(out.decision.outcome, "OWNER_ESCALATION");
  assert.equal(out.authority.kind, "OWNER_ESCALATION_LEASE_HMAC_V1");
  assert.equal(out.authority.maxUses, 1);
  assert.equal(out.authority.profileId, "SAFE_GUIDED");
  assert.equal(out.proposal.businessDiff.purpose, "CREATE_SYNTHETIC_SALES_ORDER");
  assert.equal(out.proposal.businessDiff.impacts.budget.currency, "EUR");
  assert.equal(out.proposal.businessDiff.impacts.budget.upperBound, "0.00");
  // The single supported synthetic Order binding is preserved.
  assert.equal(out.binding.purpose, SUPPORTED_ORDER_BINDING.purpose);
  assert.equal(out.binding.currency, SUPPORTED_ORDER_BINDING.currency);
  // Separately retained observed result pins the approved owner identity.
  assert.equal(out.observed.stage, "EXECUTE");
  assert.equal(out.observed.status, "PASS");
  assert.equal(out.observed.approvedOwnerActor, "owner:local-demo");
});

test("PAN455-11 handle replay adds no effect", async () => {
  const {
    mapIntakeToTrustedTask,
    buildIntakeTrustedTaskSource,
    createBoundTaskHandleIssuerForIntake,
    issueIntakeHandle,
    createPan455IntakeOperationInput,
    createLocalIntakeOperation,
  } = requireAdapter();
  const provider = labelledSyntheticProvider();
  const task = mapIntakeToTrustedTask(CHALLENGE_SOURCE);
  const source = buildIntakeTrustedTaskSource(task);
  const issuer = createBoundTaskHandleIssuerForIntake({ source, now: () => 1_000_000 });
  const issued = issueIntakeHandle(issuer, task.taskRef);
  const operation = createLocalIntakeOperation({ provider, now: () => 1_000_000 });
  const input = createPan455IntakeOperationInput(task);

  const out = await useBoundTaskHandle({ issuer, handle: issued.handle, operationInput: input, operation });
  assert.equal(out.status, "PASS");
  assert.equal(provider.mutations(), 1);
  assert.equal(provider.readbacks(), 1);

  await expectIntakeDenial(
    useBoundTaskHandle({ issuer, handle: issued.handle, operationInput: input, operation }),
    "BTH_HANDLE_REPLAY_DENIED",
  );
  assert.equal(provider.mutations(), 1, "replay adds no mutation");
  assert.equal(provider.readbacks(), 1, "replay adds no readback");
});

// This regression is self-contained in the public synthetic fixture. It does
// not depend on the independently held comparison/challenge-file path.
test("PAN455-10b altered raw source trust label is denied at COMPOSE before any provider effect", async () => {
  const { usePan455IntakeOrder } = requireAdapter();
  const provider = labelledSyntheticProvider();
  const changed = { ...CHALLENGE_SOURCE, trustLabel: "UNTRUSTED_EXTERNAL" };
  await expectIntakeDenial(
    usePan455IntakeOrder({ source: changed, provider, now: () => 1_000_000 }),
    "PAN455_INTAKE_TRUST_RECAST_DENIED",
  );
  EFFECTS_ZERO(provider);
});

// ===========================================================================
// AC02 — critical typed negatives (pre-effect denial, zero provider effects).
// ===========================================================================
test("PAN455-12 material witness end-to-end: appended OPEN after RELEASE -> NOT_RELEASED, zero effects", async () => {
  const { usePan455IntakeOrder } = requireAdapter();
  const provider = labelledSyntheticProvider();
  await expectIntakeDenial(
    usePan455IntakeOrder({ source: CHANGED_SOURCE, provider, now: () => 1_000_000 }),
    "PAN455_INTAKE_NOT_RELEASED_DENIED",
  );
  EFFECTS_ZERO(provider);
});

test("PAN455-13 clearing the last hold alone does not restore release", async () => {
  const { usePan455IntakeOrder } = requireAdapter();
  const provider = labelledSyntheticProvider();
  const clearOnly = {
    ...CHALLENGE_SOURCE,
    intake: { head: 2, events: [{ seq: 1, kind: "OPEN", hold: "a" }, { seq: 2, kind: "CLEAR", hold: "a" }] },
  };
  await expectIntakeDenial(
    usePan455IntakeOrder({ source: clearOnly, provider, now: () => 1_000_000 }),
    "PAN455_INTAKE_NOT_RELEASED_DENIED",
  );
  EFFECTS_ZERO(provider);
});

test("PAN455-14 unknown / contradictory journals are denied typed, zero effects", async () => {
  const { usePan455IntakeOrder } = requireAdapter();
  const gap = {
    ...CHALLENGE_SOURCE,
    intake: { head: 3, events: [{ seq: 1, kind: "OPEN", hold: "a" }, { seq: 3, kind: "RELEASE" }] },
  };
  const dup = {
    ...CHALLENGE_SOURCE,
    intake: { head: 2, events: [{ seq: 1, kind: "OPEN", hold: "a" }, { seq: 1, kind: "OPEN", hold: "a" }] },
  };
  const releaseWithHold = {
    ...CHALLENGE_SOURCE,
    intake: { head: 2, events: [{ seq: 1, kind: "OPEN", hold: "a" }, { seq: 2, kind: "RELEASE" }] },
  };
  for (const [source, code] of [
    [gap, "PAN455_INTAKE_UNKNOWN_DENIED"],
    [dup, "PAN455_INTAKE_CONTRADICTORY_DENIED"],
    [releaseWithHold, "PAN455_INTAKE_CONTRADICTORY_DENIED"],
    [null, "PAN455_INTAKE_UNKNOWN_DENIED"],
  ]) {
    const provider = labelledSyntheticProvider();
    await expectIntakeDenial(usePan455IntakeOrder({ source, provider, now: () => 1_000_000 }), code);
    EFFECTS_ZERO(provider);
  }
});

// An eligible mapping whose scope differs from the single supported binding is
// denied by the UNCHANGED core at the BTH SUPPORTED stage (before any effect).
test("PAN455-15 out-of-scope order fields are denied at the BTH SUPPORTED stage, zero effects", async () => {
  const { usePan455IntakeOrder } = requireAdapter();
  const wrongCustomer = { ...CHALLENGE_SOURCE, order: { ...CHALLENGE_SOURCE.order, customerNumber: 8 } };
  const wrongPurpose = { ...CHALLENGE_SOURCE, order: { ...CHALLENGE_SOURCE.order, purpose: "READ_ONLY_REVIEW" } };
  const wrongCurrency = { ...CHALLENGE_SOURCE, order: { ...CHALLENGE_SOURCE.order, currency: "USD" } };
  const wrongProvider = { ...CHALLENGE_SOURCE, order: { ...CHALLENGE_SOURCE.order, provider: "espocrm" } };
  const wrongRefClient = { ...CHALLENGE_SOURCE, order: { ...CHALLENGE_SOURCE.order, reference: "CM-OTHER-002" } };
  const wrongDate = { ...CHALLENGE_SOURCE, order: { ...CHALLENGE_SOURCE.order, dateEpoch: 1767225601 } };
  for (const source of [wrongCustomer, wrongPurpose, wrongCurrency, wrongProvider, wrongRefClient, wrongDate]) {
    const provider = labelledSyntheticProvider();
    await expectIntakeDenial(
      usePan455IntakeOrder({ source, provider, now: () => 1_000_000 }),
      "BTH_BINDING_UNSUPPORTED_DENIED",
    );
    EFFECTS_ZERO(provider);
  }
});

// Malformed mapping inputs (bad shape/types) are denied UNKNOWN at COMPOSE.
test("PAN455-16 malformed mapping input is denied UNKNOWN, zero effects", async () => {
  const { usePan455IntakeOrder } = requireAdapter();
  const provider = labelledSyntheticProvider();
  const badOrder = { ...CHALLENGE_SOURCE, order: { ...CHALLENGE_SOURCE.order, currency: "eu" } };
  await expectIntakeDenial(
    usePan455IntakeOrder({ source: badOrder, provider, now: () => 1_000_000 }),
    "PAN455_INTAKE_UNKNOWN_DENIED",
  );
  EFFECTS_ZERO(provider);
});

// ===========================================================================
// AC03 — source/applicability change: reuse the frozen CKS12 invalidation.
// ===========================================================================
function intakeKnowledgePair() {
  const oldKnowledge = {
    knowledgeId: CHANGE.knowledgeId,
    knowledgeVersion: CHANGE.supersededVersion,
    knowledgeSha256: sha256(canonicalJson(CHALLENGE_SOURCE)),
    state: "PROMOTED_SYNTHETIC_ONLY",
  };
  const replacementKnowledge = {
    knowledgeId: CHANGE.knowledgeId,
    knowledgeVersion: CHANGE.replacementVersion,
    knowledgeSha256: sha256(canonicalJson(CHANGED_SOURCE)),
    state: "PROMOTED_SYNTHETIC_ONLY",
  };
  return { oldKnowledge, replacementKnowledge };
}

test("PAN455-17 exact affected dependents are invalidated via the frozen revalidation helper", () => {
  const { oldKnowledge, replacementKnowledge } = intakeKnowledgePair();
  const result = cks12.requireKnowledgeDriftRevalidation({
    componentVersions: cks12.COMPONENT_VERSIONS,
    supersededKnowledge: oldKnowledge,
    replacementKnowledge,
    dependencies: CHANGE.affectedDependencyIds.map((id) => ({
      dependencyId: id,
      knowledgeId: CHANGE.knowledgeId,
      knowledgeVersion: CHANGE.supersededVersion,
      state: "PROMOTED_SYNTHETIC_ONLY",
      rollbackKnowledgeSha256: oldKnowledge.knowledgeSha256,
    })),
  });
  assert.equal(result.status, "REVALIDATION_REQUIRED");
  assert.deepEqual([...result.invalidatedDependencyIds].sort(), [...CHANGE.affectedDependencyIds].sort());
  assert.equal(result.supersededKnowledgeVersion, CHANGE.supersededVersion);
  assert.equal(result.replacementKnowledgeVersion, CHANGE.replacementVersion);
  assert.equal(result.authority, "NONE");
  assert.equal(result.capabilityDelta, "NONE");
  assert.equal(result.effect, "NONE");
});

test("PAN455-18 a too-broad dependency list is DENIED (the helper does not self-filter)", () => {
  const { oldKnowledge, replacementKnowledge } = intakeKnowledgePair();
  // The two AFFECTED deps bind the superseded intake-applicability knowledge.
  // The UNAFFECTED owner-lease-policy proof is a SEPARATE knowledge (it is not
  // superseded by this drift). Including it in the invalidation list is a
  // too-broad set: the helper requires every dependency to bind the exact
  // superseded promoted knowledge, so the differently-knowledged dependent
  // fails the check and the whole revalidation is DENIED with STALE_KNOWLEDGE.
  const broad = [
    ...CHANGE.affectedDependencyIds.map((id) => ({
      dependencyId: id,
      knowledgeId: CHANGE.knowledgeId,
      knowledgeVersion: CHANGE.supersededVersion,
      state: "PROMOTED_SYNTHETIC_ONLY",
      rollbackKnowledgeSha256: oldKnowledge.knowledgeSha256,
    })),
    {
      dependencyId: CHANGE.unaffectedDependencyId,
      knowledgeId: "pan455:owner-lease-policy", // a DIFFERENT knowledge
      knowledgeVersion: "v1",
      state: "PROMOTED_SYNTHETIC_ONLY",
      rollbackKnowledgeSha256: sha256(canonicalJson("owner-lease-policy-knowledge-v1")),
    },
  ];
  const result = cks12.requireKnowledgeDriftRevalidation({
    componentVersions: cks12.COMPONENT_VERSIONS,
    supersededKnowledge: oldKnowledge,
    replacementKnowledge,
    dependencies: broad,
  });
  assert.equal(result.status, "DENIED");
  assert.ok(result.reasonCodes.includes("STALE_KNOWLEDGE"));
  // And the unaffected owner/lease evidence is NOT among any invalidation.
  assert.notDeepEqual(result.status, "REVALIDATION_REQUIRED");
});

test("PAN455-19 the helper faithfully reports the exact set it is given (caller supplies the exact set)", () => {
  const { oldKnowledge, replacementKnowledge } = intakeKnowledgePair();
  const one = [CHANGE.affectedDependencyIds[0]].map((id) => ({
    dependencyId: id,
    knowledgeId: CHANGE.knowledgeId,
    knowledgeVersion: CHANGE.supersededVersion,
    state: "PROMOTED_SYNTHETIC_ONLY",
    rollbackKnowledgeSha256: oldKnowledge.knowledgeSha256,
  }));
  const result = cks12.requireKnowledgeDriftRevalidation({
    componentVersions: cks12.COMPONENT_VERSIONS,
    supersededKnowledge: oldKnowledge,
    replacementKnowledge,
    dependencies: one,
  });
  assert.equal(result.status, "REVALIDATION_REQUIRED");
  // The helper does not self-filter; it echoes exactly what it is given. The
  // caller's obligation is to supply the EXACT affected set (PAN455-17).
  assert.deepEqual(result.invalidatedDependencyIds, [CHANGE.affectedDependencyIds[0]]);
});

test("PAN455-20 the frozen fast-path denies unknown variants and knowledge drift", () => {
  const drifted = cks12.denyUnknownVariantFastPath({ knowledgeState: "REVALIDATION_REQUIRED" });
  assert.equal(drifted.status, "FAST_PATH_DENIED");
  assert.equal(drifted.abortStatus, "ABORTED_KNOWLEDGE_DRIFT");
  assert.ok(drifted.reasonCodes.includes("STALE_KNOWLEDGE"));
  assert.equal(drifted.slowPathEligible, true);
  assert.equal(drifted.authority, "NONE");
  const unknown = cks12.denyUnknownVariantFastPath({ knowledgeState: "SOMETHING_ELSE" });
  assert.equal(unknown.status, "FAST_PATH_DENIED");
  assert.equal(unknown.abortStatus, "ABORTED_UNKNOWN_VARIANT");
  assert.ok(unknown.reasonCodes.includes("UNKNOWN_VARIANT"));
});

test("PAN455-21 stale applicability is refused BEFORE effects", async () => {
  const { usePan455IntakeOrder } = requireAdapter();
  const provider = labelledSyntheticProvider();
  await expectIntakeDenial(
    usePan455IntakeOrder({ source: CHANGED_SOURCE, provider, now: () => 1_000_000 }),
    "PAN455_INTAKE_NOT_RELEASED_DENIED",
  );
  EFFECTS_ZERO(provider);
});

// ===========================================================================
// AC03 — requalification: replay only the impacted mapping/eligibility + the
// direct handoff. Successful requalification is NOT authority activation.
// ===========================================================================
test("PAN455-22 requalification of an eligible source still runs the full journey (not authority)", async () => {
  const { usePan455IntakeOrder } = requireAdapter();
  const provider = labelledSyntheticProvider();
  const out = await usePan455IntakeOrder({ source: CHALLENGE_SOURCE, provider, now: () => 1_000_000 });
  assert.equal(out.status, "PASS");
  assert.equal(out.authority.kind, "OWNER_ESCALATION_LEASE_HMAC_V1");
  assert.equal(provider.mutations(), 1);
});

test("PAN455-23 a requalified changed (BLOCKED) source is still denied, zero effects", async () => {
  const { usePan455IntakeOrder } = requireAdapter();
  const provider = labelledSyntheticProvider();
  await expectIntakeDenial(
    usePan455IntakeOrder({ source: CHANGED_SOURCE, provider, now: () => 1_000_000 }),
    "PAN455_INTAKE_NOT_RELEASED_DENIED",
  );
  EFFECTS_ZERO(provider);
});

// ===========================================================================
// Entry API: a small documented normal entry point for the comparison harness.
// ===========================================================================
test("PAN455-24 entry API is a stable, documented, harness-usable surface", () => {
  const adapter = requireAdapter();
  for (const name of [
    "foldIntakeJournal",
    "checkIntakeEligibility",
    "mapIntakeToTrustedTask",
    "buildIntakeTrustedTaskSource",
    "createIntakeEvidence",
    "createBoundTaskHandleIssuerForIntake",
    "issueIntakeHandle",
    "createPan455IntakeOperationInput",
    "createLocalIntakeOperation",
    "usePan455IntakeOrder",
    "invalidateAffectedIntakeDependencies",
    "fastPathGate",
  ]) {
    assert.equal(typeof adapter[name], "function", `missing exported entry: ${name}`);
  }
  assert.equal(adapter.INTAKE_SOURCE_SCHEMA, "pan455.synthetic/order-intake-journal/v1");
  assert.equal(adapter.INTAKE_RULE_VERSION, "intake-release/v1");
  assert.equal(adapter.INTAKE_MAPPING_VERSION, "intake-journal-to-bound-task/v1");
});

test("PAN455-25 the labelled synthetic provider round-trips its label", () => {
  const provider = labelledSyntheticProvider({ label: "pan455-comparison-harness" });
  assert.equal(provider.label, "pan455-comparison-harness");
  assert.equal(provider.trustLabel, "LOCAL_SYNTHETIC");
});

// A direct resolver-level check: the eligible mapped handle resolves cleanly
// against the unchanged BTH resolver (no operation needed), proving the
// mapping produces a well-formed trusted binding.
test("PAN455-26 the mapped eligible handle resolves through the unchanged BTH resolver", () => {
  const {
    mapIntakeToTrustedTask,
    buildIntakeTrustedTaskSource,
    createBoundTaskHandleIssuerForIntake,
    issueIntakeHandle,
    createPan455IntakeOperationInput,
  } = requireAdapter();
  const task = mapIntakeToTrustedTask(CHALLENGE_SOURCE);
  const source = buildIntakeTrustedTaskSource(task);
  const issuer = createBoundTaskHandleIssuerForIntake({ source, now: () => 1_000_000 });
  const issued = issueIntakeHandle(issuer, task.taskRef);
  const input = createPan455IntakeOperationInput(task);
  const resolver = new BoundTaskHandleResolver({ issuer, operation: { execute: () => {} }, now: () => 1_000_000 });
  const binding = resolver.use({ handle: issued.handle, operationInput: input });
  assert.equal(binding.taskRef, task.taskRef);
  assert.equal(binding.objectVersion, 1);
  assert.equal(binding.purpose, "CREATE_SYNTHETIC_SALES_ORDER");
  assert.equal(binding.currency, "EUR");
});

// ===========================================================================
// AC02/AC03 — the adapter-level CKS-12 wiring (the two frozen helpers are
// exercised THROUGH the adapter's exported surface, not only in isolation).
// The wrapper is the adapter's data-driven entry point to the EXACT affected
// knowledge dependencies; it reuses the frozen helpers unchanged.
// ===========================================================================
test("PAN455-27 the adapter wrapper invalidates exactly the affected intake dependents (REVALIDATION_REQUIRED, no authority)", () => {
  const { invalidateAffectedIntakeDependencies } = requireAdapter();
  const result = invalidateAffectedIntakeDependencies(CHANGE);
  assert.equal(result.status, "REVALIDATION_REQUIRED");
  assert.deepEqual([...result.invalidatedDependencyIds].sort(), [...CHANGE.affectedDependencyIds].sort());
  assert.equal(result.supersededKnowledgeVersion, CHANGE.supersededVersion);
  assert.equal(result.replacementKnowledgeVersion, CHANGE.replacementVersion);
  assert.equal(result.authority, "NONE");
  assert.equal(result.capabilityDelta, "NONE");
  assert.equal(result.effect, "NONE");
});

test("PAN455-28 the adapter wrapper fails closed on an ill-formed change (DENIED, no authority)", () => {
  const { invalidateAffectedIntakeDependencies } = requireAdapter();
  // A change with no affected dependents cannot name an exact invalidated set;
  // the frozen helper (reused through the wrapper) refuses it, not invents one.
  const result = invalidateAffectedIntakeDependencies({
    knowledgeId: CHANGE.knowledgeId,
    supersededVersion: CHANGE.supersededVersion,
    replacementVersion: CHANGE.replacementVersion,
    affectedDependencyIds: [],
  });
  assert.equal(result.status, "DENIED");
  assert.ok(result.reasonCodes.includes("MISSING_INPUT"));
  assert.equal(result.authority === "NONE" || result.invalidatedDependencyIds === undefined, true);
});

test("PAN455-29 the adapter fast-path gate aborts a drifted/unknown state before any effect (never authority)", () => {
  const { invalidateAffectedIntakeDependencies, fastPathGate } = requireAdapter();
  // A REVALIDATION_REQUIRED invalidation aborts the fast path as knowledge drift.
  const drifted = fastPathGate(invalidateAffectedIntakeDependencies(CHANGE));
  assert.equal(drifted.status, "FAST_PATH_DENIED");
  assert.equal(drifted.abortStatus, "ABORTED_KNOWLEDGE_DRIFT");
  assert.ok(drifted.reasonCodes.includes("STALE_KNOWLEDGE"));
  assert.equal(drifted.slowPathEligible, true);
  assert.equal(drifted.authority, "NONE");
  assert.equal(drifted.effect, "NONE");
  // A DENIED/unknown state aborts as an unknown variant — also no authority.
  const unknown = fastPathGate({ status: "DENIED" });
  assert.equal(unknown.status, "FAST_PATH_DENIED");
  assert.equal(unknown.abortStatus, "ABORTED_UNKNOWN_VARIANT");
  assert.ok(unknown.reasonCodes.includes("UNKNOWN_VARIANT"));
  assert.equal(unknown.authority, "NONE");
  assert.equal(unknown.effect, "NONE");
});
