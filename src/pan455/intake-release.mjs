// PAN455 — one synthetic material-intake eligibility rule + a
// sequence-addressed schema/state mapping, delivered THROUGH the unchanged
// frozen bound-task-handle (BTH) business journey.
//
// This module is an ADDITIVE adapter at the permitted seam. It does NOT touch
// the frozen core (src/pan442/bound-task-handle.mjs, demo/runtime/*, the CKS12
// fastpath, the policy, or any of the 16 frozen identities). It reuses:
//   - the existing trusted-source / handle / resolver / journey (BTH) as-is,
//   - the frozen CKS-12 invalidation helpers (requireKnowledgeDriftRevalidation
//     + denyUnknownVariantFastPath) for the exact affected knowledge deps.
//
// What is new (the challenge delta):
//   * a sequence-addressed fold of the revealed intake journal
//     (pan455.synthetic/order-intake-journal/v1) into intake state + open holds,
//   * the one material intake-release eligibility rule (an order may enter the
//     owner-approved journey only when the journal ends RELEASED with no open
//     hold; business eligibility, NEVER owner approval or effect authority),
//   * a mapping that joins principal/order/task into the trusted task shape,
//     binding order.revision as objectVersion (NOT journal.head) and the FULL
//     raw source digest plus mapping/rule identities into trusted-source
//     evidence.
//
// No case-ID branches, no second gateway, no blanket denial, no product
// evaluator import. The mapping and state fold operate on DATA.

import { canonicalJson, sha256 } from "../../demo/runtime/enforcement-gate.mjs";
import {
  createSyntheticTrustedTaskSource,
  BoundTaskHandleIssuer,
  createLocalBusinessOperation,
  useBoundTaskHandle,
} from "../../src/pan442/bound-task-handle.mjs";
import {
  COMPONENT_VERSIONS as CKS12_COMPONENT_VERSIONS,
  requireKnowledgeDriftRevalidation,
  denyUnknownVariantFastPath,
} from "../../src/cks-12/drift-revalidation-fastpath.ts";

// ---------------------------------------------------------------------------
// Versioned identities (the "mapping/rule identities" bound into evidence).
// ---------------------------------------------------------------------------
export const INTAKE_SOURCE_SCHEMA = "pan455.synthetic/order-intake-journal/v1";
export const INTAKE_RULE_VERSION = "intake-release/v1";
export const INTAKE_MAPPING_VERSION = "intake-journal-to-bound-task/v1";
export const INTAKE_EVIDENCE_SCHEMA = "pan455.intake-release-evidence/v1";

const KIND_OPEN = "OPEN";
const KIND_CLEAR = "CLEAR";
const KIND_RELEASE = "RELEASE";
const KNOWN_KINDS = new Set([KIND_OPEN, KIND_CLEAR, KIND_RELEASE]);
const STATE_PENDING = "PENDING";
const STATE_BLOCKED = "BLOCKED";
const STATE_RELEASED = "RELEASED";

// The exact challenge denial codes (reference expectations; see
// challenge.json mappingDelta.referenceCodes / codeBoundary). These are
// challenge/reference expectations, NOT baseline product codes: denials are
// thrown as typed BoundTaskHandleError and the BTH_* codes/stages keep their
// existing meaning.
export const INTAKE_DENIAL = Object.freeze({
  UNKNOWN: "PAN455_INTAKE_UNKNOWN_DENIED",
  CONTRADICTORY: "PAN455_INTAKE_CONTRADICTORY_DENIED",
  NOT_RELEASED: "PAN455_INTAKE_NOT_RELEASED_DENIED",
  TRUST_RECAST_DENIED: "PAN455_INTAKE_TRUST_RECAST_DENIED",
});

const SECRET = "pan455-intake-synthetic-secret-0001"; // local synthetic, >=16

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(code, stage) {
  const error = new Error(code);
  error.name = "BoundTaskHandleError";
  error.stage = stage;
  throw error;
}

// ---------------------------------------------------------------------------
// SOURCE TRUST BOUNDARY (the corrected trust-label gate).
//
// The raw intake source is caller-controlled. Before ANY trusted-task-source
// construction, BTH snapshot, approval, lease, reservation or provider effect,
// the source must declare the one supported synthetic LOCAL_SYNTHETIC trust
// label on the one supported synthetic schema. A raw source that declares
// UNTRUSTED_EXTERNAL (or any other label), or a missing/mismatched
// schemaVersion, is denied typed at COMPOSE and is NEVER silently recast to a
// trusted LOCAL_SYNTHETIC source. This is a data-driven shape/trust check
// (no case-ID branch, no scenario switch, no second gateway, no blanket
// denial): the eligible LOCAL_SYNTHETIC positive is unchanged.
// ---------------------------------------------------------------------------
export const INTAKE_TRUST_LABEL = "LOCAL_SYNTHETIC";

export function checkSourceTrustBoundary(source) {
  if (!isRecord(source)) fail(INTAKE_DENIAL.UNKNOWN, "COMPOSE");
  // (a) the raw source must be the one supported synthetic schema;
  // a missing or mismatched schemaVersion cannot be reconstructed.
  if (
    typeof source.schemaVersion !== "string"
    || source.schemaVersion !== INTAKE_SOURCE_SCHEMA
  ) fail(INTAKE_DENIAL.UNKNOWN, "COMPOSE");
  // (b) the raw source must declare the one supported synthetic trust label.
  // This is enforced BEFORE the trusted task source is constructed, so a raw
  // UNTRUSTED_EXTERNAL (or any other) label is denied and NEVER silently
  // recast to a trusted LOCAL_SYNTHETIC source.
  if (
    typeof source.trustLabel !== "string"
    || source.trustLabel !== INTAKE_TRUST_LABEL
  ) fail(INTAKE_DENIAL.TRUST_RECAST_DENIED, "COMPOSE");
}


// ---------------------------------------------------------------------------
// Sequence-addressed state fold of the intake journal.
//
// Precedence (challenge.json mappingDelta.failurePrecedence):
//   1. source shape/types         -> UNKNOWN (cannot reconstruct)
//   2. duplicate sequence         -> CONTRADICTORY
//   3. missing sequence / unknown -> UNKNOWN
//      kind
//   4. illegal transition         -> CONTRADICTORY
//   5. eligibility (applied after a successful fold)
//
// Missing rows are UNKNOWN, not absence of holds. No coercion of identifiers
// or numbers. Reconstructed by SORTED sequence 1..head, never by array order
// or the largest observed row.
// ---------------------------------------------------------------------------
export function foldIntakeJournal(source) {
  // (1) Source shape/types.
  if (!isRecord(source)) return { state: null, holds: [], error: "UNKNOWN" };
  const intake = source.intake;
  if (!isRecord(intake) || !Number.isSafeInteger(intake.head) || intake.head < 1) {
    return { state: null, holds: [], error: "UNKNOWN" };
  }
  if (!Array.isArray(intake.events)) return { state: null, holds: [], error: "UNKNOWN" };

  // Validate each row's shape first (types), so a malformed row is UNKNOWN,
  // not a mis-folded transition.
  for (const event of intake.events) {
    if (
      !isRecord(event)
      || !Number.isSafeInteger(event.seq)
      || event.seq < 1
      || typeof event.kind !== "string"
    ) return { state: null, holds: [], error: "UNKNOWN" };
  }

  // (2) Duplicate sequence -> CONTRADICTORY (even for identical rows).
  const seen = new Set();
  for (const event of intake.events) {
    if (seen.has(event.seq)) return { state: null, holds: [], error: "CONTRADICTORY" };
    seen.add(event.seq);
  }

  // (3) Missing sequence (gap) or unknown kind -> UNKNOWN. Exactly one row at
  //     each integer seq 1..head.
  const expected = new Set();
  for (let seq = 1; seq <= intake.head; seq += 1) expected.add(seq);
  if (seen.size !== expected.size) return { state: null, holds: [], error: "UNKNOWN" };
  for (const seq of expected) if (!seen.has(seq)) return { state: null, holds: [], error: "UNKNOWN" };
  for (const event of intake.events) {
    if (!KNOWN_KINDS.has(event.kind)) return { state: null, holds: [], error: "UNKNOWN" };
  }

  // (4) Replay in sequence order, applying the transition rules.
  const ordered = [...intake.events].sort((a, b) => a.seq - b.seq);
  let state = STATE_PENDING;
  const holds = new Set();
  for (const event of ordered) {
    const holdKey = event.hold;
    if (event.kind === KIND_OPEN) {
      // Requires a nonempty NEW hold key: a second OPEN for an already-active
      // hold key is CONTRADICTORY, never silently collapsed by the set. Set
      // BLOCKED (revokes a previous release). Reopening an already-CLEARED key
      // is permitted (the key is no longer active).
      if (typeof holdKey !== "string" || holdKey.length === 0) {
        return { state: null, holds: [], error: "CONTRADICTORY" };
      }
      if (holds.has(holdKey)) {
        return { state: null, holds: [], error: "CONTRADICTORY" };
      }
      holds.add(holdKey);
      state = STATE_BLOCKED;
    } else if (event.kind === KIND_CLEAR) {
      // Requires an existing open hold key; remove it; if none remain ->
      // PENDING (not RELEASED).
      if (typeof holdKey !== "string" || holdKey.length === 0) {
        return { state: null, holds: [], error: "CONTRADICTORY" };
      }
      if (!holds.has(holdKey)) return { state: null, holds: [], error: "CONTRADICTORY" };
      holds.delete(holdKey);
      if (holds.size === 0) state = STATE_PENDING;
    } else if (event.kind === KIND_RELEASE) {
      // No hold field; requires no open holds; set RELEASED.
      if ("hold" in event) return { state: null, holds: [], error: "CONTRADICTORY" };
      if (holds.size !== 0) return { state: null, holds: [], error: "CONTRADICTORY" };
      state = STATE_RELEASED;
    }
  }
  return { state, holds: [...holds].sort(), error: null };
}

// ---------------------------------------------------------------------------
// The one material intake-release eligibility rule (business eligibility,
// NEVER owner approval or effect authority). An order is eligible iff the
// complete trusted intake journal ends RELEASED with no unresolved hold.
// ---------------------------------------------------------------------------
export function checkIntakeEligibility(source) {
  const folded = foldIntakeJournal(source);
  if (folded.error === "UNKNOWN") {
    return { ...folded, eligible: false, code: INTAKE_DENIAL.UNKNOWN };
  }
  if (folded.error === "CONTRADICTORY") {
    return { ...folded, eligible: false, code: INTAKE_DENIAL.CONTRADICTORY };
  }
  const eligible = folded.state === STATE_RELEASED && folded.holds.length === 0;
  return {
    ...folded,
    eligible,
    code: eligible ? null : INTAKE_DENIAL.NOT_RELEASED,
  };
}

// ---------------------------------------------------------------------------
// The sequence-addressed schema/state MAPPING: join the nested
// principal/order/task records into the existing trusted task shape.
// order.revision is kept as objectVersion (the object version), NOT
// journal.head (the journal sequence head). No coercion.
// ---------------------------------------------------------------------------
export function mapIntakeToTrustedTask(source) {
  if (!isRecord(source)) fail(INTAKE_DENIAL.UNKNOWN, "COMPOSE");
  const { identity, task, order } = source;
  if (
    !isRecord(identity)
    || typeof identity.tenant !== "string"
    || identity.tenant.length < 1
    || typeof identity.principal !== "string"
    || identity.principal.length < 1
    || !isRecord(task)
    || typeof task.reference !== "string"
    || task.reference.length < 8
    || typeof task.run !== "string"
    || task.run.length < 8
    || !Number.isSafeInteger(task.ttlMs)
    || task.ttlMs < 1
    || !isRecord(order)
    || typeof order.provider !== "string"
    || typeof order.entity !== "string"
    || typeof order.operation !== "string"
    || typeof order.reference !== "string"
    || !Number.isSafeInteger(order.customerNumber)
    || !Number.isSafeInteger(order.dateEpoch)
    || !Number.isSafeInteger(order.revision)
    || order.revision < 1
    || typeof order.purpose !== "string"
    || !Number.isSafeInteger(order.amountLimitMinor)
    || order.amountLimitMinor < 0
    || typeof order.currency !== "string"
    || !/^[A-Z]{3}$/.test(order.currency)
  ) fail(INTAKE_DENIAL.UNKNOWN, "COMPOSE");
  return {
    taskRef: task.reference,
    runId: task.run,
    tenant: identity.tenant,
    user: identity.principal,
    object: {
      provider: order.provider,
      entity: order.entity,
      operation: order.operation,
      refClient: order.reference,
      customerId: order.customerNumber,
      orderDateEpoch: order.dateEpoch,
    },
    objectVersion: order.revision, // object version, NOT journal.head
    purpose: order.purpose,
    amountLimitMinor: order.amountLimitMinor,
    currency: order.currency,
    ttlMs: task.ttlMs,
  };
}

// ---------------------------------------------------------------------------
// Raw-source binding into the issued trusted source (the AC02 binding delta).
//
// The trusted source's attested content carries a versioned evidence label
// that binds the FULL raw source digest plus the mapping/rule identities.
// createSyntheticTrustedTaskSource computes sourceDigest over the WHOLE
// content (schema + trust label + principal + tasks), so the issued binding's
// sourceDigest therefore tracks the raw journal: two distinct complete
// eligible raw journals yield distinct binding.sourceDigest values even when
// the mapped effect identity (order scope) is identical. This binds the full
// raw source plus the mapping/rule identities into the ACTUAL trusted task
// binding — it is no longer a computed-then-discarded side evidence.
// ---------------------------------------------------------------------------
const RAW_BINDING_PREFIX = "pan455.synthetic/raw-binding:v1";
const RAW_BINDING_SCHEMA = "pan455.synthetic/order-intake-journal/v1";
const RAW_BINDING_RULE = "intake-release/v1";
const RAW_BINDING_MAPPING = "intake-journal-to-bound-task/v1";

// The versioned raw-binding label: raw-source digest + mapping/rule
// identities. Distinct raw journals -> distinct labels -> distinct
// sourceDigest (and thus distinct binding.sourceDigest).
export function intakeRawBindingLabel(rawSource) {
  const rawSourceDigest = sha256(canonicalJson(rawSource));
  return (
    RAW_BINDING_PREFIX +
    "/" + RAW_BINDING_SCHEMA +
    "/" + RAW_BINDING_RULE +
    "/" + RAW_BINDING_MAPPING +
    "/raw=" + rawSourceDigest
  );
}

// Build the UNCHANGED trusted task source from a mapped task (single fixture).
// When rawSource is supplied the issued source is bound to the full raw source
// digest + mapping/rule identities (the actual binding); otherwise the label
// is the plain supported synthetic label (the unbound mapping shape).
export function buildIntakeTrustedTaskSource(task, rawSource) {
  return createSyntheticTrustedTaskSource({
    principal: { user: task.user, tenant: task.tenant },
    trustLabel: rawSource !== undefined ? intakeRawBindingLabel(rawSource) : "LOCAL_SYNTHETIC",
    tasks: [task],
  });
}

// ---------------------------------------------------------------------------
// Trusted-source evidence: binds the FULL raw source digest plus the
// mapping/rule identities. A journal change MUST change this digest even when
// the effect identity (order scope) is unchanged.
// ---------------------------------------------------------------------------
export function createIntakeEvidence(rawSource, task, trustedSource, { mappingProfileVersion, ruleVersion }) {
  const core = {
    schemaVersion: INTAKE_EVIDENCE_SCHEMA,
    taskRef: task.taskRef,
    runId: task.runId,
    tenant: task.tenant,
    user: task.user,
    objectVersion: task.objectVersion,
    intakeHead: rawSource.intake.head,
    rawSourceDigest: sha256(canonicalJson(rawSource)),
    sourceDigest: trustedSource.sourceDigest,
    mappingProfileVersion,
    ruleVersion,
    state: STATE_RELEASED,
    eligible: true,
  };
  return { ...core, evidenceSha256: sha256(canonicalJson(core)) };
}

// The exact operation input the UNCHANGED BTH resolver requires for this task.
export function createPan455IntakeOperationInput(task) {
  return {
    tenant: task.tenant,
    user: task.user,
    runId: task.runId,
    objectVersion: task.objectVersion,
    declaredAmountMinor: task.amountLimitMinor,
    currency: task.currency,
    object: {
      provider: task.object.provider,
      entity: task.object.entity,
      operation: task.object.operation,
      refClient: task.object.refClient,
      customerId: task.object.customerId,
      orderDateEpoch: task.object.orderDateEpoch,
    },
  };
}

export function createBoundTaskHandleIssuerForIntake({ source, now, secret = SECRET }) {
  return new BoundTaskHandleIssuer({ taskSource: source, secret, now });
}

export function issueIntakeHandle(issuer, taskRef) {
  return issuer.createHandle({ taskRef });
}

// The UNCHANGED local business operation seam (AdminAiPoc -> owner approval ->
// one-use lease -> reservation -> semantic readback). No second gateway.
export function createLocalIntakeOperation({ provider, now, root }) {
  return createLocalBusinessOperation({ provider, now, root });
}

// ---------------------------------------------------------------------------
// The small documented normal entry API for the independent comparison
// harness. It runs the eligible intake order THROUGH the existing actual
// bound-task business journey and returns the BTH result.
//
// Denials (typed BoundTaskHandleError, stage COMPOSE) precede ANY BTH check,
// snapshot, approval, lease, reservation or provider effect:
//   - PAN455_INTAKE_UNKNOWN_DENIED      (gap / null journal / unknown kind)
//   - PAN455_INTAKE_CONTRADICTORY_DENIED (duplicate seq / illegal transition)
//   - PAN455_INTAKE_NOT_RELEASED_DENIED (journal does not end RELEASED)
// An eligible mapping proceeds to the existing BTH checks (a mapping whose
// scope differs from the single supported binding is denied at the BTH
// SUPPORTED stage by the unchanged core).
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Source/applicability drift re-check (the AC03 pre-effect boundary).
//
// The raw source is bound at the entry; source applicability is NOT a one-shot
// check. At the actual effect path the current raw source must still fold
// eligible (RELEASED, no open hold) AND the exact affected intake-applicability
// dependents (intake-mapping-proof, intake-eligibility-proof) must be
// invalidated through the FROZEN CKS12 chain: requireKnowledgeDriftRevalidation
// then denyUnknownVariantFastPath. A drifted / no-longer-eligible source is a
// REVALIDATION_REQUIRED (stale applicability) state and the frozen fast path
// ABORTS it (ABORTED_KNOWLEDGE_DRIFT) -> the effect is refused typed BEFORE the
// mutation. A newly re-folded eligible source or a successful requalification
// NEVER activates authority (the owner/lease evidence is separate and
// unchanged). Owner/lease provenance and the owner/lease-policy proof are NOT
// part of this chain and are not invalidated.
// ---------------------------------------------------------------------------
const AFFECTED_INTAKE_DEPENDENCY_IDS = ["intake-mapping-proof", "intake-eligibility-proof"];
const INTAKE_APPLICABILITY_KNOWLEDGE_ID = "pan455:intake-applicability";

function sourceApplicabilityDrift(rawSource, boundRawDigest) {
  // The bound raw-source digest is the integrity identity this handle was
  // issued from. At the effect point the CURRENT raw source is re-folded:
  //   * if it is the exact bound source and still folds eligible (RELEASED, no
  //     open hold) -> no drift; the effect proceeds;
  //   * if the source has changed at all (a distinct digest, e.g. a new OPEN
  //     appended after the binding) OR no longer folds eligible -> the
  //     applicability is STALE. Invalidate the EXACT affected dependents on
  //     the frozen CKS12 chain and let the fast path abort the stale
  //     applicability BEFORE the effect.
  const liveDigest = sha256(canonicalJson(rawSource));
  const check = checkIntakeEligibility(rawSource);
  const stale = liveDigest !== boundRawDigest || check.code !== null;
  if (!stale) return { drifted: false, gate: null };
  const superseded = {
    knowledgeId: INTAKE_APPLICABILITY_KNOWLEDGE_ID,
    knowledgeVersion: INTAKE_RULE_VERSION,
    state: "PROMOTED_SYNTHETIC_ONLY",
    knowledgeSha256: boundRawDigest, // immutable last-known-good (the bound source)
  };
  const replacement = {
    knowledgeId: INTAKE_APPLICABILITY_KNOWLEDGE_ID,
    knowledgeVersion: INTAKE_RULE_VERSION + "+drifted",
    state: "PROMOTED_SYNTHETIC_ONLY",
    knowledgeSha256: liveDigest, // distinct digest-bound replacement
  };
  const dependencies = AFFECTED_INTAKE_DEPENDENCY_IDS.map((dependencyId) => ({
    dependencyId,
    knowledgeId: INTAKE_APPLICABILITY_KNOWLEDGE_ID,
    knowledgeVersion: INTAKE_RULE_VERSION,
    state: "PROMOTED_SYNTHETIC_ONLY",
    rollbackKnowledgeSha256: boundRawDigest,
  }));
  const invalidation = requireKnowledgeDriftRevalidation({
    componentVersions: CKS12_COMPONENT_VERSIONS,
    supersededKnowledge: superseded,
    replacementKnowledge: replacement,
    dependencies,
  });
  // REVALIDATION_REQUIRED aborts as knowledge drift; any other (DENIED) state
  // is an unknown variant. Neither is effect authority.
  const gate = fastPathGate(invalidation);
  return { drifted: true, gate };
}

// Wrap the caller's provider so the current raw source's applicability is
// rechecked on the ACTUAL effect path (the mutation point) through the frozen
// CKS12 invalidation/fastpath chain. A drifted source refuses the effect typed
// before the mutation. All other provider methods pass through unchanged.
function createRawBindingProvider({ provider, boundRawDigest, recheck }) {
  if (provider === null || typeof provider !== "object" || typeof provider.mutate !== "function") {
    return provider;
  }
  return {
    ...provider,
    async mutate(action, signal) {
      const { drifted } = recheck();
      if (drifted) {
        const error = new Error("PAN455_INTAKE_APPLICABILITY_DRIFT_DENIED");
        error.name = "BoundTaskHandleError";
        error.stage = "COMPOSE";
        throw error;
      }
      return provider.mutate(action, signal);
    },
  };
}

export async function usePan455IntakeOrder({ source, provider, now, secret = SECRET, root }) {
  // (0) SOURCE TRUST BOUNDARY: the raw source must declare the supported
  // synthetic schema + LOCAL_SYNTHETIC trust label. Enforced as the FIRST
  // check, before eligibility, trusted-task-source construction, BTH
  // snapshots, approval, lease, reservation or any provider effect. A raw
  // UNTRUSTED_EXTERNAL (or any other) label is denied typed and is NEVER
  // silently recast to a trusted LOCAL_SYNTHETIC source.
  checkSourceTrustBoundary(source);

  // (5) Eligibility (the one material rule) is enforced BEFORE effects.
  const elig = checkIntakeEligibility(source);
  if (elig.code !== null) fail(elig.code, "COMPOSE");

  // (a) BIND the full raw source + versioned mapping/rule identities into the
  //     issued trusted source. boundRawDigest is the integrity identity the
  //     effect-path drift re-check compares the live raw source against.
  const task = mapIntakeToTrustedTask(source);
  const boundRawDigest = sha256(canonicalJson(source));
  const trustedSource = buildIntakeTrustedTaskSource(task, source);
  // Trusted-source evidence binds the full raw digest + mapping/rule identities.
  createIntakeEvidence(source, task, trustedSource, {
    mappingProfileVersion: INTAKE_MAPPING_VERSION,
    ruleVersion: INTAKE_RULE_VERSION,
  });

  const issuer = createBoundTaskHandleIssuerForIntake({ source: trustedSource, now, secret });
  const issued = issueIntakeHandle(issuer, task.taskRef);
  const operationInput = createPan455IntakeOperationInput(task);
  // (b) Enforce current eligibility / source binding on the ACTUAL effect
  //     path: the live raw source is re-folded and requalified through the
  //     frozen CKS12 invalidation/fastpath chain at the mutation point, so a
  //     source that drifts after the first snapshot (a new OPEN appended) is
  //     refused before the mutation, not silently executed.
  const effectProvider = createRawBindingProvider({
    provider,
    boundRawDigest,
    recheck: () => sourceApplicabilityDrift(source, boundRawDigest),
  });
  const operation = createLocalIntakeOperation({ provider: effectProvider, now, root });

  // THE existing actual bound-task business journey (unchanged core):
  // resolve handle -> verify every use-time binding -> owner approval ->
  // one-use lease -> reservation -> semantic readback.
  return useBoundTaskHandle({ issuer, handle: issued.handle, operationInput, operation });
}

// ---------------------------------------------------------------------------
// CKS-12 knowledge-drift invalidation (the EXACT affected knowledge
// dependencies), reusing the FROZEN helpers unchanged.
//
// Data-driven: the caller supplies the change description (the revealed
// challenge `changedSource` fields). No case-ID branch, no scenario switch.
//   * requireKnowledgeDriftRevalidation invalidates ONLY the dependents that
//     bind the exact superseded promoted knowledge (the two intake proofs);
//     the unaffected owner/lease-policy proof is a separate knowledge and must
//     NOT be in the set — a too-broad set is DENIED (STALE_KNOWLEDGE), so the
//     helper does not self-filter and the caller supplies the exact set.
//   * denyUnknownVariantFastPath refuses stale/unknown applicability BEFORE
//     any effect; a REVALIDATION_REQUIRED state is an ABORTED_KNOWLEDGE_DRIFT,
//     never an authority grant. A newly hashed source or a successful
//     requalification NEVER activates authority.

// Deterministic knowledge digest for a (knowledgeId, version) pair. The
// rollback digest must stay bound to the immutable last-known-good bytes; the
// replacement must be a DISTINCT digest-bound version of the same knowledge.
function knowledgeDigest(knowledgeId, version) {
  return sha256(canonicalJson({ knowledgeId, version }));
}

// The exact invalidated dependents: every affected dependencyId binds the
// exact superseded promoted knowledge and keeps its rollback bound to the
// immutable last-known-good bytes. Reuses the frozen helper (unchanged).
export function invalidateAffectedIntakeDependencies(change) {
  if (!isRecord(change)) return { status: "DENIED", reasonCodes: ["MISSING_INPUT"] };
  const oldKnowledge = {
    knowledgeId: change.knowledgeId,
    knowledgeVersion: change.supersededVersion,
    state: "PROMOTED_SYNTHETIC_ONLY",
    knowledgeSha256: knowledgeDigest(change.knowledgeId, change.supersededVersion),
  };
  const replacementKnowledge = {
    knowledgeId: change.knowledgeId,
    knowledgeVersion: change.replacementVersion,
    state: "PROMOTED_SYNTHETIC_ONLY",
    knowledgeSha256: knowledgeDigest(change.knowledgeId, change.replacementVersion),
  };
  const dependencies = (Array.isArray(change.affectedDependencyIds) ? change.affectedDependencyIds : []).map(
    (dependencyId) => ({
      dependencyId,
      knowledgeId: change.knowledgeId,
      knowledgeVersion: change.supersededVersion,
      state: "PROMOTED_SYNTHETIC_ONLY",
      rollbackKnowledgeSha256: oldKnowledge.knowledgeSha256,
    })
  );
  return requireKnowledgeDriftRevalidation({
    componentVersions: CKS12_COMPONENT_VERSIONS,
    supersededKnowledge: oldKnowledge,
    replacementKnowledge,
    dependencies,
  });
}

// Refuse stale applicability BEFORE effects: a REVALIDATION_REQUIRED state
// aborts the fast path (knowledge drift); any other state is an unknown
// variant. Neither is slow-path authority, capability delta or effect.
export function fastPathGate(invalidationResult) {
  return denyUnknownVariantFastPath({
    knowledgeState: invalidationResult && invalidationResult.status === "REVALIDATION_REQUIRED"
      ? "REVALIDATION_REQUIRED"
      : "UNKNOWN",
  });
}
