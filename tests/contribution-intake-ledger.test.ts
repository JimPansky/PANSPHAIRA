import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

import {
  bindPrevalidatedContributionIntakeTrustContextV1,
  classifyContributionDeliveryV1,
  CONTRIBUTION_AUTHORITY_SCOPES_V1,
  CONTRIBUTION_DELIVERY_SCHEMA_V1,
  CONTRIBUTION_INTAKE_ENTRY_DISPOSITIONS_V1,
  CONTRIBUTION_INTAKE_REASON_CODES_V1,
  CONTRIBUTION_SUBMITTED_IDENTITY_BINDINGS_V1,
  CONTRIBUTION_INTAKE_TRUST_CONTEXT_SCHEMA_V1,
  createContributionIntakeLedgerV1,
  currentHeadEntryV1,
  deepCiEligibleEntriesV1,
  headStatusV1,
  ingestContributionDeliveryV1,
  isDeepCiEligibleV1,
  quarantinedEntriesV1,
  replayContributionIntakeV1,
  verifyContributionIntakeLedgerV1,
  verifyContributionIntakeReceiptV1,
  type ContributionAuthorityScopeV1,
  type ContributionDeliveryV1,
  type ContributionIntakeLedgerV1,
  type ContributionIntakeReceiptV1,
  type ContributionIntakeTrustContextInputV1,
  type VerifiedContributionIntakeLedgerV1,
  type VerifiedContributionIntakeTrustContextV1,
} from "../packages/contracts/src/contribution-intake-ledger.js";

const BASE_MS = 1_700_000_000_000;
const CONTEXT_INPUT: ContributionIntakeTrustContextInputV1 = {
  schemaVersion: CONTRIBUTION_INTAKE_TRUST_CONTEXT_SCHEMA_V1,
  ledgerId: "ledger:ccp-m1-ledger",
  tenantId: "tenant:chimpmaera",
  repositoryId: "repository:chimpmaera",
  contributionId: "contribution:issue-52-pr-101",
  actorId: "actor:trusted-maintainer",
  authorityEvidenceId: "authority-evidence:maintainer-grant-20260817",
  authorityScope: "WRITE",
};

/** Independent test canonicalizer: never imports or calls the production canonicalJson implementation. */
function independentCanonical(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("NON_FINITE_TEST_VALUE");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(independentCanonical).join(",")}]`;
  if (typeof value !== "object") throw new TypeError("NON_JSON_TEST_VALUE");
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${independentCanonical(record[key])}`).join(",")}}`;
}

const sha256Bytes = (bytes: string): string => createHash("sha256").update(bytes).digest("hex");
const independentDigest = (domain: string, value: unknown): string =>
  sha256Bytes(independentCanonical({ domain, value }));
const fixtureDigest = (label: string): string => createHash("sha256").update(label).digest("hex");

const IDENTITY_FIELDS = [
  "ledgerId", "tenantId", "repositoryId", "contributionId",
  "actorId", "authorityEvidenceId", "authorityScope",
] as const;
type CanonicalIdentity = Pick<ContributionIntakeTrustContextInputV1, typeof IDENTITY_FIELDS[number]>;

function assertCanonicalIdentities(
  trust: VerifiedContributionIntakeTrustContextV1,
  ...values: readonly CanonicalIdentity[]
): void {
  for (const value of values) {
    for (const field of IDENTITY_FIELDS) assert.equal(value[field], trust[field], field);
  }
}

function context(overrides: Partial<ContributionIntakeTrustContextInputV1> = {}): VerifiedContributionIntakeTrustContextV1 {
  return bindPrevalidatedContributionIntakeTrustContextV1({ ...CONTEXT_INPUT, ...overrides });
}

function delivery(index: number, overrides: Partial<ContributionDeliveryV1> = {}): ContributionDeliveryV1 {
  const base = {
    schemaVersion: CONTRIBUTION_DELIVERY_SCHEMA_V1,
    ledgerId: CONTEXT_INPUT.ledgerId,
    tenantId: CONTEXT_INPUT.tenantId,
    repositoryId: CONTEXT_INPUT.repositoryId,
    contributionId: CONTEXT_INPUT.contributionId,
    deliveryId: `delivery:event-${String(index).padStart(4, "0")}`,
    headDigest: fixtureDigest(`head-${index}`),
    ancestorDigest: null,
    actorId: CONTEXT_INPUT.actorId,
    authorityEvidenceId: CONTEXT_INPUT.authorityEvidenceId,
    authorityScope: CONTEXT_INPUT.authorityScope,
    payloadDigest: fixtureDigest(`payload-${index}`),
    receivedAtMs: BASE_MS + index * 1_000,
  } as const;
  return { ...base, ...overrides };
}

function makeProfile(count: 50 | 100): ContributionDeliveryV1[] {
  const events: ContributionDeliveryV1[] = [];
  const acceptedHeads: string[] = [];
  let current: string | null = null;
  for (let index = 1; index <= count; index += 1) {
    if (index % 10 === 0 && events[0] !== undefined) {
      events.push({ ...events[0] });
      continue;
    }
    if (index % 7 === 0 && current !== null) {
      events.push(delivery(index, { headDigest: current, ancestorDigest: current }));
      continue;
    }
    if (index % 11 === 0 && acceptedHeads.length > 1) {
      events.push(delivery(index, { headDigest: acceptedHeads[0]!, ancestorDigest: acceptedHeads[0]! }));
      continue;
    }
    const next = fixtureDigest(`profile-${count}-head-${index}`);
    events.push(delivery(index, { headDigest: next, ancestorDigest: index % 6 === 0 ? null : current }));
    acceptedHeads.push(next);
    current = next;
  }
  return events;
}

function assertProfile(
  trust: VerifiedContributionIntakeTrustContextV1,
  events: readonly ContributionDeliveryV1[],
  ledger: VerifiedContributionIntakeLedgerV1,
  receipts: readonly ContributionIntakeReceiptV1[],
): void {
  assert.equal(receipts.length, events.length);
  assert.equal(verifyContributionIntakeLedgerV1(trust, ledger) !== null, true);
  assert.equal(ledger.nextSequence, ledger.entries.length + 1);
  assert.equal(ledger.quarantineCount, ledger.entries.filter((entry) => entry.quarantined).length);
  assert.ok(ledger.entries.every((entry, index) => entry.sequence === index + 1));
  assert.ok(ledger.entries.every((entry) => entry.quarantined
    === (entry.disposition === "STALE" || entry.disposition === "REJECTED")));
  const appended = ledger.entries.filter((entry) => entry.disposition === "APPENDED");
  assert.equal(new Set(appended.map((entry) => entry.headDigest)).size, appended.length);
  assert.equal(deepCiEligibleEntriesV1(trust, ledger).length, appended.length === 0 ? 0 : 1);
  for (const receipt of receipts) assert.ok(verifyContributionIntakeReceiptV1(trust, ledger, receipt));
}

function entryEvent(entry: Record<string, any>): Record<string, unknown> {
  const evidence = entry.submittedIdentityEvidence as Record<string, unknown>;
  return {
    schemaVersion: CONTRIBUTION_DELIVERY_SCHEMA_V1,
    ledgerId: evidence.ledgerId,
    tenantId: evidence.tenantId,
    repositoryId: evidence.repositoryId,
    contributionId: evidence.contributionId,
    deliveryId: entry.deliveryId,
    headDigest: entry.headDigest,
    ancestorDigest: entry.ancestorDigest,
    actorId: evidence.actorId,
    authorityEvidenceId: evidence.authorityEvidenceId,
    authorityScope: evidence.authorityScope,
    payloadDigest: entry.payloadDigest,
    receivedAtMs: entry.receivedAtMs,
  };
}

/** Correct attack rehash order: previous link and delivery digest are set before hashing each entry. */
function independentlyRehashLedger(value: Record<string, any>): Record<string, any> {
  let previous: string | null = null;
  for (const entry of value.entries as Array<Record<string, any>>) {
    entry.previousEntryDigest = previous;
    entry.submittedIdentityEvidenceDigest = independentDigest(
      "cm.contribution-submitted-identity-evidence/v1",
      entry.submittedIdentityEvidence,
    );
    entry.deliveryDigest = independentDigest("cm.contribution-delivery/v1", entryEvent(entry));
    const unsigned = Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "entryDigest"));
    entry.entryDigest = independentDigest("cm.contribution-intake-entry/v1", unsigned);
    previous = entry.entryDigest;
  }
  value.nextSequence = value.entries.length + 1;
  value.quarantineCount = value.entries.filter((entry: Record<string, any>) => entry.quarantined).length;
  value.ledgerDigest = independentDigest("cm.contribution-intake-ledger/v1", {
    schemaVersion: value.schemaVersion,
    ledgerId: value.ledgerId,
    tenantId: value.tenantId,
    repositoryId: value.repositoryId,
    contributionId: value.contributionId,
    actorId: value.actorId,
    authorityEvidenceId: value.authorityEvidenceId,
    authorityScope: value.authorityScope,
    contextDigest: value.contextDigest,
    entryDigests: value.entries.map((entry: Record<string, any>) => entry.entryDigest),
    nextSequence: value.nextSequence,
    quarantineCount: value.quarantineCount,
  });
  return value;
}

function independentlyRehashReceipt(value: Record<string, any>): Record<string, any> {
  value.submittedIdentityEvidenceDigest = independentDigest(
    "cm.contribution-submitted-identity-evidence/v1",
    value.submittedIdentityEvidence,
  );
  const unsigned = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "receiptDigest"));
  value.receiptDigest = independentDigest("cm.contribution-intake-receipt/v1", unsigned);
  return value;
}

function validTwoHeadLedger(): {
  trust: VerifiedContributionIntakeTrustContextV1;
  ledger: VerifiedContributionIntakeLedgerV1;
  events: readonly ContributionDeliveryV1[];
} {
  const trust = context();
  const first = delivery(1, { headDigest: fixtureDigest("two-head-a") });
  const second = delivery(2, { headDigest: fixtureDigest("two-head-b"), ancestorDigest: first.headDigest });
  const replay = replayContributionIntakeV1(trust, [first, second]);
  return { trust, ledger: replay.ledger, events: [first, second] };
}

function schemaValidator(schema: object, definition?: string): ReturnType<Ajv2020["compile"]> {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  if (definition === undefined) return ajv.compile(schema);
  return ajv.compile({
    $schema: (schema as { $schema: string }).$schema,
    $defs: (schema as { $defs: object }).$defs,
    $ref: `#/$defs/${definition}`,
  });
}

test("CCP-M1-INT-001 deterministic 10-event fixture classifies every transition and quarantines only denials", () => {
  const trust = context();
  const a = fixtureDigest("ten-a");
  const b = fixtureDigest("ten-b");
  const c = fixtureDigest("ten-c");
  const event1 = delivery(1, { headDigest: a });
  const event2 = delivery(2, { headDigest: a, ancestorDigest: a });
  const events: ContributionDeliveryV1[] = [
    event1,
    event2,
    delivery(3, { headDigest: b, ancestorDigest: a }),
    delivery(4, { headDigest: a, ancestorDigest: a }),
    delivery(5, { headDigest: c, ancestorDigest: null }),
    delivery(6, { headDigest: b, ancestorDigest: b }),
    { ...event1 },
    { ...event2, payloadDigest: fixtureDigest("reuse-tamper") },
    delivery(9, { headDigest: fixtureDigest("admin-head"), ancestorDigest: c, authorityScope: "ADMIN" }),
    delivery(10, { headDigest: fixtureDigest("stale-time"), ancestorDigest: c, receivedAtMs: BASE_MS }),
  ];
  const result = replayContributionIntakeV1(trust, events);
  assert.deepEqual(result.ledger.entries.map((entry) => entry.disposition), [
    "APPENDED", "SEMANTIC_DUPLICATE", "APPENDED", "STALE", "APPENDED", "STALE",
    "REJECTED", "REJECTED", "STALE",
  ]);
  assert.deepEqual(result.ledger.entries.map((entry) => entry.reasonCodes), [
    ["NEW_CONTRIBUTION"], ["HEAD_ALREADY_CURRENT"], ["PR_HEAD_SUPERSESSION"],
    ["SUPERSEDED_HEAD_REPLAY"], ["PR_HEAD_FORCE_PUSH", "UNKNOWN_ANCESTOR"],
    ["INVALIDATED_HEAD_REPLAY"], ["DELIVERY_ID_REUSE_TAMPER"],
    ["AUTHORITY_WIDENING"], ["STALE_HEAD_TIMESTAMP"],
  ]);
  assert.equal(result.receipts[6]?.disposition, "TRANSPORT_DUPLICATE");
  assert.deepEqual(result.receipts[6]?.reasonCodes, ["TRANSPORT_REDELIVERY"]);
  assert.equal(result.ledger.quarantineCount, 5);
  assert.equal(headStatusV1(trust, result.ledger, a), "SUPERSEDED");
  assert.equal(headStatusV1(trust, result.ledger, b), "INVALIDATED");
  assert.equal(headStatusV1(trust, result.ledger, c), "CURRENT");
  assertProfile(trust, events, result.ledger, result.receipts);
});

test("CCP-M1-INT-002 deterministic 50-value fixture is in-process array-processing evidence only", () => {
  const trust = context();
  const events = makeProfile(50);
  const first = replayContributionIntakeV1(trust, events);
  const second = replayContributionIntakeV1(trust, structuredClone(events));
  assertProfile(trust, events, first.ledger, first.receipts);
  assert.deepEqual(first, second);
});

test("CCP-M1-INT-003 deterministic 100-value fixture is in-process array-processing evidence only", () => {
  const trust = context();
  const events = makeProfile(100);
  const first = replayContributionIntakeV1(trust, events);
  const second = replayContributionIntakeV1(trust, structuredClone(events));
  assertProfile(trust, events, first.ledger, first.receipts);
  assert.deepEqual(first, second);
});

test("CCP-M1-INT-004 explicit trust context prevents the first delivery from self-establishing authority", () => {
  const trust = context();
  for (const [candidate, binding, reason] of [
    [delivery(1, { authorityScope: "ADMIN" }), "AUTHORITY_WIDENING", "AUTHORITY_WIDENING"],
    [delivery(2, { actorId: "actor:untrusted-maintainer" }), "AUTHORITY_CHANGE", "AUTHORITY_CHANGE"],
    [delivery(3, { authorityEvidenceId: "authority-evidence:foreign-grant" }), "AUTHORITY_CHANGE", "AUTHORITY_CHANGE"],
    [delivery(4, { authorityScope: "READ" }), "AUTHORITY_CHANGE", "AUTHORITY_CHANGE"],
  ] as const) {
    const ledger = createContributionIntakeLedgerV1(trust);
    assert.deepEqual(classifyContributionDeliveryV1(trust, ledger, candidate).reasonCodes, [reason]);
    const rejected = ingestContributionDeliveryV1(trust, ledger, candidate);
    const entry = rejected.ledger.entries[0]!;
    assert.equal(rejected.receipt.disposition, "REJECTED");
    assert.equal(entry.submittedIdentityBinding, binding);
    assert.equal(rejected.receipt.submittedIdentityBinding, binding);
    assertCanonicalIdentities(trust, rejected.ledger, entry, rejected.receipt);
    assert.equal(entry.submittedIdentityEvidence.authoritative, false);
    assert.equal(rejected.receipt.submittedIdentityEvidence.authoritative, false);
    assert.equal(entry.submittedIdentityEvidence.authorityScope, candidate.authorityScope);
    assert.equal(entry.submittedIdentityEvidence.actorId, candidate.actorId);
    assert.equal(entry.submittedIdentityEvidence.authorityEvidenceId, candidate.authorityEvidenceId);
    assert.deepEqual(rejected.receipt.submittedIdentityEvidence, entry.submittedIdentityEvidence);
    assert.equal(rejected.receipt.submittedIdentityEvidenceDigest, entry.submittedIdentityEvidenceDigest);
    assert.equal(entry.contextDigest, trust.contextDigest);
    assert.equal(rejected.receipt.contextDigest, trust.contextDigest);
    assert.equal(currentHeadEntryV1(trust, rejected.ledger), null);
  }
});

test("CCP-M1-INT-005 tenant, repository and contribution substitution are context-bound and quarantined", () => {
  for (const [field, attack] of [
    ["tenantId", delivery(1, { tenantId: "tenant:foreign-tenant" })],
    ["repositoryId", delivery(2, { repositoryId: "repository:foreign-repository" })],
    ["contributionId", delivery(3, { contributionId: "contribution:foreign-pr-999" })],
    ["ledgerId", delivery(4, { ledgerId: "ledger:foreign-ledger" })],
  ] as const) {
    const trust = context();
    const result = ingestContributionDeliveryV1(trust, createContributionIntakeLedgerV1(trust), attack);
    const entry = result.ledger.entries[0]!;
    assert.equal(result.receipt.disposition, "REJECTED");
    assert.deepEqual(result.receipt.reasonCodes, ["TRUST_CONTEXT_MISMATCH"]);
    assert.equal(entry.quarantined, true);
    assert.equal(entry.submittedIdentityBinding, "SCOPE_MISMATCH");
    assert.equal(result.receipt.submittedIdentityBinding, "SCOPE_MISMATCH");
    assertCanonicalIdentities(trust, result.ledger, entry, result.receipt);
    assert.equal(entry.submittedIdentityEvidence.authoritative, false);
    assert.equal(entry.submittedIdentityEvidence[field], attack[field]);
    assert.deepEqual(result.receipt.submittedIdentityEvidence, entry.submittedIdentityEvidence);
    assert.equal(result.receipt.submittedIdentityEvidenceDigest, entry.submittedIdentityEvidenceDigest);
    assert.equal(entry.contextDigest, trust.contextDigest);
    assert.equal(result.receipt.contextDigest, trust.contextDigest);
    assert.equal(entry.deliveryDigest, independentDigest("cm.contribution-delivery/v1", entryEvent(entry)));
    assert.equal(currentHeadEntryV1(trust, result.ledger), null);
    assert.ok(verifyContributionIntakeLedgerV1(trust, structuredClone(result.ledger)));
    assert.ok(verifyContributionIntakeReceiptV1(trust, result.ledger, structuredClone(result.receipt)));

    const stream = [attack, structuredClone(attack)];
    const replay = replayContributionIntakeV1(trust, stream);
    assert.deepEqual(replay, replayContributionIntakeV1(trust, structuredClone(stream)));
    assert.equal(replay.ledger.entries.length, 1);
    assert.equal(replay.ledger.quarantineCount, 1);
    assert.deepEqual(replay.receipts.map((receipt) => receipt.disposition), ["REJECTED", "TRANSPORT_DUPLICATE"]);
    assertProfile(trust, stream, replay.ledger, replay.receipts);

    const forgedLedger = structuredClone(result.ledger) as unknown as Record<string, any>;
    forgedLedger.entries[0][field] = attack[field];
    independentlyRehashLedger(forgedLedger);
    assert.equal(verifyContributionIntakeLedgerV1(trust, forgedLedger), null);
    const forgedReceipt = structuredClone(result.receipt) as unknown as Record<string, any>;
    forgedReceipt[field] = attack[field];
    const unsigned = Object.fromEntries(Object.entries(forgedReceipt).filter(([key]) => key !== "receiptDigest"));
    forgedReceipt.receiptDigest = independentDigest("cm.contribution-intake-receipt/v1", unsigned);
    assert.equal(verifyContributionIntakeReceiptV1(trust, result.ledger, forgedReceipt), null);
  }
});

test("CCP-M1-INT-006 delivery-id reuse and exact transport redelivery remain distinct and deterministic", () => {
  const trust = context();
  const original = delivery(1);
  const first = ingestContributionDeliveryV1(trust, createContributionIntakeLedgerV1(trust), original);
  const duplicate = ingestContributionDeliveryV1(trust, first.ledger, { ...original });
  assert.equal(duplicate.ledger, first.ledger);
  assert.equal(duplicate.receipt.disposition, "TRANSPORT_DUPLICATE");
  const attack = { ...original, payloadDigest: fixtureDigest("changed-payload") };
  const quarantined = ingestContributionDeliveryV1(trust, duplicate.ledger, attack);
  assert.equal(quarantined.receipt.disposition, "REJECTED");
  assert.deepEqual(quarantined.receipt.reasonCodes, ["DELIVERY_ID_REUSE_TAMPER"]);
  const replay = ingestContributionDeliveryV1(trust, quarantined.ledger, { ...attack });
  assert.equal(replay.ledger, quarantined.ledger);
  assert.equal(replay.receipt.disposition, "TRANSPORT_DUPLICATE");
  assert.equal(replay.receipt.sequence, quarantined.receipt.sequence);
});

test("CCP-M1-INT-007 verified queries expose only the accepted current head and immutable quarantine", () => {
  const { trust, ledger, events } = validTwoHeadLedger();
  const stale = ingestContributionDeliveryV1(trust, ledger, delivery(3, {
    headDigest: events[0]!.headDigest,
    ancestorDigest: events[0]!.headDigest,
  }));
  assert.equal(currentHeadEntryV1(trust, stale.ledger)?.headDigest, events[1]!.headDigest);
  assert.equal(isDeepCiEligibleV1(trust, stale.ledger, events[1]!.headDigest), true);
  assert.equal(isDeepCiEligibleV1(trust, stale.ledger, events[0]!.headDigest), false);
  assert.equal(deepCiEligibleEntriesV1(trust, stale.ledger).length, 1);
  assert.equal(quarantinedEntriesV1(trust, stale.ledger).length, 1);
  assert.equal(Object.isFrozen(quarantinedEntriesV1(trust, stale.ledger)), true);
});

test("CCP-M1-INT-008 semantic verification denies correctly rehashed impossible histories", () => {
  const { trust, ledger } = validTwoHeadLedger();
  const cases: Array<[string, (value: Record<string, any>) => void]> = [
    ["disposition", (value) => { value.entries[1].disposition = "SEMANTIC_DUPLICATE"; value.entries[1].reasonCodes = ["HEAD_ALREADY_CURRENT"]; value.entries[1].replacedHeadDigest = null; }],
    ["reason", (value) => { value.entries[1].reasonCodes = ["PR_HEAD_FORCE_PUSH"]; }],
    ["quarantine", (value) => { value.entries[1].disposition = "STALE"; value.entries[1].reasonCodes = ["STALE_HEAD_TIMESTAMP"]; value.entries[1].quarantined = true; value.entries[1].replacedHeadDigest = null; }],
    ["replacement", (value) => { value.entries[1].replacedHeadDigest = null; }],
    ["delivery reuse", (value) => { value.entries[1].deliveryId = value.entries[0].deliveryId; }],
    ["head transition", (value) => { value.entries[1].ancestorDigest = fixtureDigest("false-ancestor"); }],
    ["timestamp", (value) => { value.entries[1].receivedAtMs = value.entries[0].receivedAtMs - 1; }],
    ["authority evidence", (value) => { value.entries[1].authorityEvidenceId = "authority-evidence:foreign-grant"; }],
  ];
  for (const [caseId, mutate] of cases) {
    const candidate = structuredClone(ledger) as unknown as Record<string, any>;
    mutate(candidate);
    independentlyRehashLedger(candidate);
    assert.equal(verifyContributionIntakeLedgerV1(trust, candidate), null, caseId);
  }
});

test("CCP-M1-INT-009 semantic replay derives genesis and authority transitions rather than trusting hashes", () => {
  const trust = context();
  const valid = replayContributionIntakeV1(trust, [delivery(1)]).ledger;
  for (const mutate of [
    (value: Record<string, any>) => { value.entries[0].disposition = "REJECTED"; value.entries[0].reasonCodes = ["AUTHORITY_CHANGE"]; value.entries[0].quarantined = true; },
    (value: Record<string, any>) => { value.entries[0].reasonCodes = ["PR_HEAD_SUPERSESSION"]; },
    (value: Record<string, any>) => { value.entries[0].replacedHeadDigest = fixtureDigest("invented-head"); },
  ]) {
    const candidate = structuredClone(valid) as unknown as Record<string, any>;
    mutate(candidate);
    independentlyRehashLedger(candidate);
    assert.equal(verifyContributionIntakeLedgerV1(trust, candidate), null);
  }
});

test("CCP-M1-INT-010 JSON Schema closes trust context, ledger, delivery, entry and receipt shapes", () => {
  const schema = JSON.parse(readFileSync("schemas/contracts/contribution-intake-ledger-v1.schema.json", "utf8")) as object;
  const trust = context();
  const event = delivery(1);
  const result = ingestContributionDeliveryV1(trust, createContributionIntakeLedgerV1(trust), event);
  for (const [definition, value] of [
    [undefined, result.ledger],
    ["trustContext", trust],
    ["delivery", event],
    ["submittedIdentityEvidence", result.ledger.entries[0]?.submittedIdentityEvidence],
    ["entry", result.ledger.entries[0]],
    ["receipt", result.receipt],
  ] as const) {
    const validate = schemaValidator(schema, definition);
    assert.equal(validate(value), true, `${definition ?? "ledger"}:${JSON.stringify(validate.errors)}`);
    const extra = { ...value, extra: true };
    assert.equal(validate(extra), false, `${definition ?? "ledger"}:extra`);
  }
});

test("CCP-M1-INT-011 schema and runtime share safe-integer maxima", () => {
  const schema = JSON.parse(readFileSync("schemas/contracts/contribution-intake-ledger-v1.schema.json", "utf8")) as object;
  const validateDelivery = schemaValidator(schema, "delivery");
  const trust = context();
  const maximum = delivery(1, { receivedAtMs: Number.MAX_SAFE_INTEGER });
  assert.equal(validateDelivery(maximum), true, JSON.stringify(validateDelivery.errors));
  assert.equal(ingestContributionDeliveryV1(trust, createContributionIntakeLedgerV1(trust), maximum).receipt.sequence, 1);
  const tooLarge = { ...maximum, receivedAtMs: Number.MAX_SAFE_INTEGER + 1 };
  assert.equal(validateDelivery(tooLarge), false);
  assert.throws(
    () => ingestContributionDeliveryV1(trust, createContributionIntakeLedgerV1(trust), tooLarge as ContributionDeliveryV1),
    /CONTRIBUTION_DELIVERY_SCHEMA_DENIED/,
  );
  const fractional = { ...maximum, receivedAtMs: 1.5 };
  assert.equal(validateDelivery(fractional), false);
  assert.throws(
    () => ingestContributionDeliveryV1(trust, createContributionIntakeLedgerV1(trust), fractional as ContributionDeliveryV1),
    /CONTRIBUTION_DELIVERY_SCHEMA_DENIED/,
  );
});

test("CCP-M1-INT-012 independent golden canonical-byte and SHA-256 vectors bind context and delivery", () => {
  const contextBytes = "{\"domain\":\"cm.contribution-intake-trust-context/v1\",\"value\":{\"actorId\":\"actor:trusted-maintainer\",\"authorityEvidenceId\":\"authority-evidence:maintainer-grant-20260817\",\"authorityScope\":\"WRITE\",\"contributionId\":\"contribution:issue-52-pr-101\",\"ledgerId\":\"ledger:ccp-m1-ledger\",\"repositoryId\":\"repository:chimpmaera\",\"schemaVersion\":\"cm.contribution-intake-trust-context/v1\",\"tenantId\":\"tenant:chimpmaera\"}}";
  const contextSha = "94d240d7b63d59e07dde31a14240f5443d701e2f43e59b7953b6071cc1ace14a";
  const deliveryBytes = "{\"domain\":\"cm.contribution-delivery/v1\",\"value\":{\"actorId\":\"actor:trusted-maintainer\",\"ancestorDigest\":null,\"authorityEvidenceId\":\"authority-evidence:maintainer-grant-20260817\",\"authorityScope\":\"WRITE\",\"contributionId\":\"contribution:issue-52-pr-101\",\"deliveryId\":\"delivery:event-0001\",\"headDigest\":\"bca8bf016ab3e996d0ed642c65483676b934d6db51abf58b175071016fb5715d\",\"ledgerId\":\"ledger:ccp-m1-ledger\",\"payloadDigest\":\"2e6709af8dbfe7cd5abb2f716924848e527b4486c30c4509b0e4aa8171987335\",\"receivedAtMs\":1700000001000,\"repositoryId\":\"repository:chimpmaera\",\"schemaVersion\":\"cm.contribution-delivery/v1\",\"tenantId\":\"tenant:chimpmaera\"}}";
  const deliverySha = "f884f389dccb048aa15215caab5d7805529819ee4b3f38c82ba64d7ff7868e08";
  const trust = context();
  const event = delivery(1);
  assert.equal(independentCanonical({ domain: "cm.contribution-intake-trust-context/v1", value: CONTEXT_INPUT }), contextBytes);
  assert.equal(sha256Bytes(contextBytes), contextSha);
  assert.equal(trust.contextDigest, contextSha);
  assert.equal(independentCanonical({ domain: "cm.contribution-delivery/v1", value: event }), deliveryBytes);
  assert.equal(sha256Bytes(deliveryBytes), deliverySha);
  const result = ingestContributionDeliveryV1(trust, createContributionIntakeLedgerV1(trust), event);
  assert.equal(result.ledger.entries[0]?.deliveryDigest, deliverySha);
});

test("CCP-M1-INT-013 every receipt has closed semantic verification, including transport redelivery", () => {
  const trust = context();
  const original = delivery(1);
  const first = ingestContributionDeliveryV1(trust, createContributionIntakeLedgerV1(trust), original);
  const duplicate = ingestContributionDeliveryV1(trust, first.ledger, { ...original });
  assert.ok(verifyContributionIntakeReceiptV1(trust, duplicate.ledger, first.receipt));
  assert.ok(verifyContributionIntakeReceiptV1(trust, duplicate.ledger, duplicate.receipt));
  assert.equal(duplicate.receipt.disposition, "TRANSPORT_DUPLICATE");
});

test("CCP-M1-INT-014 forged ledger and receipt digests, including rehashed receipt claims, deny", () => {
  const trust = context();
  const result = ingestContributionDeliveryV1(trust, createContributionIntakeLedgerV1(trust), delivery(1));
  const ledger = structuredClone(result.ledger) as unknown as Record<string, any>;
  ledger.ledgerDigest = fixtureDigest("forged-ledger");
  assert.equal(verifyContributionIntakeLedgerV1(trust, ledger), null);
  const contextDigest = structuredClone(result.ledger) as unknown as Record<string, any>;
  contextDigest.contextDigest = fixtureDigest("forged-context");
  independentlyRehashLedger(contextDigest);
  assert.equal(verifyContributionIntakeLedgerV1(trust, contextDigest), null);

  const receipt = structuredClone(result.receipt) as unknown as Record<string, any>;
  receipt.headDigest = fixtureDigest("forged-head");
  const unsigned = Object.fromEntries(Object.entries(receipt).filter(([key]) => key !== "receiptDigest"));
  receipt.receiptDigest = independentDigest("cm.contribution-intake-receipt/v1", unsigned);
  assert.equal(verifyContributionIntakeReceiptV1(trust, result.ledger, receipt), null);
  const digestOnly = structuredClone(result.receipt) as unknown as Record<string, any>;
  digestOnly.receiptDigest = fixtureDigest("forged-receipt");
  assert.equal(verifyContributionIntakeReceiptV1(trust, result.ledger, digestOnly), null);
});

test("CCP-M1-INT-015 delivery boundary rejects accessor, non-enumerable, symbol and dangerous keys without invoking accessors", () => {
  const trust = context();
  const ledger = createContributionIntakeLedgerV1(trust);
  const good = delivery(1);
  let invoked = false;
  const accessor = { ...good } as Record<PropertyKey, unknown>;
  Object.defineProperty(accessor, "headDigest", { enumerable: true, get() { invoked = true; return good.headDigest; } });
  const hidden = { ...good } as Record<PropertyKey, unknown>;
  Object.defineProperty(hidden, "receivedAtMs", { value: good.receivedAtMs, enumerable: false });
  const symbolic = { ...good, [Symbol("hidden")]: true } as Record<PropertyKey, unknown>;
  const dangerous = ["__proto__", "constructor", "prototype"].map((key) => {
    const attack = { ...good } as Record<PropertyKey, unknown>;
    Object.defineProperty(attack, key, { value: true, enumerable: true });
    return attack;
  });
  for (const attack of [accessor, hidden, symbolic, ...dangerous]) {
    assert.throws(
      () => ingestContributionDeliveryV1(trust, ledger, attack as unknown as ContributionDeliveryV1),
      /CONTRIBUTION_DELIVERY_SCHEMA_DENIED/,
    );
  }
  assert.equal(invoked, false);
  assert.equal(ledger.entries.length, 0);
});

test("CCP-M1-INT-016 ledger and receipt boundaries reject descriptor and symbol attacks", () => {
  const trust = context();
  const result = ingestContributionDeliveryV1(trust, createContributionIntakeLedgerV1(trust), delivery(1));
  const hiddenLedger = structuredClone(result.ledger) as unknown as Record<PropertyKey, unknown>;
  Object.defineProperty(hiddenLedger, "ledgerDigest", { value: result.ledger.ledgerDigest, enumerable: false });
  assert.equal(verifyContributionIntakeLedgerV1(trust, hiddenLedger), null);
  const symbolLedger = { ...structuredClone(result.ledger), [Symbol("forged")]: true };
  assert.equal(verifyContributionIntakeLedgerV1(trust, symbolLedger), null);
  const accessorReceipt = structuredClone(result.receipt) as unknown as Record<PropertyKey, unknown>;
  let invoked = false;
  Object.defineProperty(accessorReceipt, "receiptDigest", { enumerable: true, get() { invoked = true; return result.receipt.receiptDigest; } });
  assert.equal(verifyContributionIntakeReceiptV1(trust, result.ledger, accessorReceipt), null);
  assert.equal(invoked, false);
  const evidenceAccessorLedger = structuredClone(result.ledger) as unknown as Record<string, any>;
  Object.defineProperty(evidenceAccessorLedger.entries[0].submittedIdentityEvidence, "tenantId", {
    enumerable: true,
    get() { invoked = true; return CONTEXT_INPUT.tenantId; },
  });
  assert.equal(verifyContributionIntakeLedgerV1(trust, evidenceAccessorLedger), null);
  const evidenceAccessorReceipt = structuredClone(result.receipt) as unknown as Record<string, any>;
  Object.defineProperty(evidenceAccessorReceipt.submittedIdentityEvidence, "tenantId", {
    enumerable: true,
    get() { invoked = true; return CONTEXT_INPUT.tenantId; },
  });
  assert.equal(verifyContributionIntakeReceiptV1(trust, result.ledger, evidenceAccessorReceipt), null);
  assert.equal(invoked, false);
});

test("CCP-M1-INT-017 ordinary dense arrays reject sparse, custom-key and subclassed representations", () => {
  const trust = context();
  const sparse = new Array<ContributionDeliveryV1>(1);
  assert.throws(() => replayContributionIntakeV1(trust, sparse), /CONTRIBUTION_DELIVERY_STREAM_DENIED/);
  const custom = [delivery(1)];
  Object.defineProperty(custom, "custom", { value: true, enumerable: true });
  assert.throws(() => replayContributionIntakeV1(trust, custom), /CONTRIBUTION_DELIVERY_STREAM_DENIED/);
  class DeliveryArray extends Array<ContributionDeliveryV1> {}
  assert.throws(() => replayContributionIntakeV1(trust, new DeliveryArray(delivery(1))), /CONTRIBUTION_DELIVERY_STREAM_DENIED/);

  const valid = replayContributionIntakeV1(trust, [delivery(1)]).ledger;
  for (const attack of ["sparse", "custom", "subclass"] as const) {
    const candidate = structuredClone(valid) as unknown as Record<string, any>;
    if (attack === "sparse") candidate.entries[0].reasonCodes = new Array(1);
    if (attack === "custom") Object.defineProperty(candidate.entries[0].reasonCodes, "custom", { value: true });
    if (attack === "subclass") {
      class ReasonArray extends Array<string> {}
      candidate.entries[0].reasonCodes = new ReasonArray("NEW_CONTRIBUTION");
    }
    assert.equal(verifyContributionIntakeLedgerV1(trust, candidate), null, attack);
  }
});

test("CCP-M1-INT-018 cycles and unsafe aliases deny at replay and ledger verification boundaries", () => {
  const trust = context();
  const repeated = delivery(1);
  assert.throws(() => replayContributionIntakeV1(trust, [repeated, repeated]), /CONTRIBUTION_DELIVERY_SCHEMA_DENIED/);
  const valid = replayContributionIntakeV1(trust, [delivery(1), delivery(2, {
    headDigest: fixtureDigest("alias-b"), ancestorDigest: fixtureDigest("head-1"),
  })]).ledger;
  const alias = structuredClone(valid) as unknown as Record<string, any>;
  alias.entries[1].reasonCodes = alias.entries[0].reasonCodes;
  assert.equal(verifyContributionIntakeLedgerV1(trust, alias), null);
  const evidenceAlias = structuredClone(valid) as unknown as Record<string, any>;
  evidenceAlias.entries[1].submittedIdentityEvidence = evidenceAlias.entries[0].submittedIdentityEvidence;
  assert.equal(verifyContributionIntakeLedgerV1(trust, evidenceAlias), null);
  const repeatedEntry = structuredClone(valid) as unknown as Record<string, any>;
  repeatedEntry.entries[1] = repeatedEntry.entries[0];
  assert.equal(verifyContributionIntakeLedgerV1(trust, repeatedEntry), null);
  const cycle = structuredClone(valid) as unknown as Record<string, any>;
  cycle.entries[0] = cycle;
  assert.equal(verifyContributionIntakeLedgerV1(trust, cycle), null);
  const evidenceCycle = structuredClone(valid) as unknown as Record<string, any>;
  evidenceCycle.entries[0].submittedIdentityEvidence = evidenceCycle.entries[0];
  assert.equal(verifyContributionIntakeLedgerV1(trust, evidenceCycle), null);
  const receiptResult = ingestContributionDeliveryV1(trust, createContributionIntakeLedgerV1(trust), delivery(3));
  const receiptCycle = structuredClone(receiptResult.receipt) as unknown as Record<string, any>;
  receiptCycle.submittedIdentityEvidence = receiptCycle;
  assert.equal(verifyContributionIntakeReceiptV1(trust, receiptResult.ledger, receiptCycle), null);
});

test("CCP-M1-INT-019 exported constants and every normalized nested value are immutable", () => {
  for (const constant of [
    CONTRIBUTION_AUTHORITY_SCOPES_V1,
    CONTRIBUTION_INTAKE_ENTRY_DISPOSITIONS_V1,
    CONTRIBUTION_INTAKE_REASON_CODES_V1,
    CONTRIBUTION_SUBMITTED_IDENTITY_BINDINGS_V1,
  ]) {
    assert.equal(Object.isFrozen(constant), true);
    assert.throws(() => (constant as unknown as string[]).push("FORGED"), TypeError);
  }
  const trust = context();
  const result = ingestContributionDeliveryV1(trust, createContributionIntakeLedgerV1(trust), delivery(1));
  assert.equal(Object.isFrozen(trust), true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.ledger), true);
  assert.equal(Object.isFrozen(result.ledger.entries), true);
  assert.equal(Object.isFrozen(result.ledger.entries[0]), true);
  assert.equal(Object.isFrozen(result.ledger.entries[0]?.submittedIdentityEvidence), true);
  assert.equal(Object.isFrozen(result.ledger.entries[0]?.reasonCodes), true);
  assert.equal(Object.isFrozen(result.receipt), true);
  assert.equal(Object.isFrozen(result.receipt.submittedIdentityEvidence), true);
  assert.equal(Object.isFrozen(result.receipt.reasonCodes), true);
});

test("CCP-M1-INT-020 inputs are cloned and successors do not alias prior ledger entries", () => {
  const contextInput = { ...CONTEXT_INPUT };
  const trust = bindPrevalidatedContributionIntakeTrustContextV1(contextInput);
  contextInput.actorId = "actor:mutated-after-bind";
  assert.equal(trust.actorId, CONTEXT_INPUT.actorId);
  const event = delivery(1);
  const first = ingestContributionDeliveryV1(trust, createContributionIntakeLedgerV1(trust), event);
  (event as { headDigest: string }).headDigest = fixtureDigest("mutated-after-ingest");
  assert.notEqual(first.ledger.entries[0]?.headDigest, event.headDigest);
  const secondEvent = delivery(2, {
    headDigest: fixtureDigest("clone-second"),
    ancestorDigest: first.ledger.entries[0]!.headDigest,
  });
  const second = ingestContributionDeliveryV1(trust, first.ledger, secondEvent);
  assert.notEqual(second.ledger.entries[0], first.ledger.entries[0]);
  const raw = structuredClone(second.ledger) as unknown as Record<string, any>;
  const verified = verifyContributionIntakeLedgerV1(trust, raw);
  assert.ok(verified);
  raw.entries[0].headDigest = fixtureDigest("mutated-after-verify");
  raw.entries[0].submittedIdentityEvidence.tenantId = "tenant:mutated-after-verify";
  assert.notEqual(verified.entries[0]?.headDigest, raw.entries[0].headDigest);
  assert.notEqual(
    verified.entries[0]?.submittedIdentityEvidence.tenantId,
    raw.entries[0].submittedIdentityEvidence.tenantId,
  );
});

test("CCP-M1-INT-021 public ingest, classification and query helpers reject unverified ledger state", () => {
  const { trust, ledger } = validTwoHeadLedger();
  const raw = structuredClone(ledger) as unknown as VerifiedContributionIntakeLedgerV1;
  const event = delivery(3);
  const calls = [
    () => ingestContributionDeliveryV1(trust, raw, event),
    () => classifyContributionDeliveryV1(trust, raw, event),
    () => currentHeadEntryV1(trust, raw),
    () => headStatusV1(trust, raw, event.headDigest),
    () => deepCiEligibleEntriesV1(trust, raw),
    () => isDeepCiEligibleV1(trust, raw, event.headDigest),
    () => quarantinedEntriesV1(trust, raw),
  ];
  for (const call of calls) assert.throws(call, /CONTRIBUTION_INTAKE_LEDGER_NOT_VERIFIED/);
  const otherContext = context({ tenantId: "tenant:other-tenant" });
  assert.throws(() => currentHeadEntryV1(otherContext, ledger), /CONTRIBUTION_INTAKE_LEDGER_NOT_VERIFIED/);
});

test("CCP-M1-INT-022 field-specific namespaces deny generic and cross-field identities", () => {
  for (const [field, value] of [
    ["ledgerId", "tenant:wrong-field"],
    ["tenantId", "repository:wrong-field"],
    ["repositoryId", "contribution:wrong-field"],
    ["contributionId", "delivery:wrong-field"],
    ["actorId", "authority-evidence:wrong-field"],
    ["authorityEvidenceId", "actor:wrong-field"],
  ] as const) {
    assert.throws(
      () => bindPrevalidatedContributionIntakeTrustContextV1({ ...CONTEXT_INPUT, [field]: value }),
      /CONTRIBUTION_TRUST_CONTEXT_DENIED/,
      field,
    );
  }
  const trust = context();
  assert.throws(
    () => ingestContributionDeliveryV1(trust, createContributionIntakeLedgerV1(trust),
      { ...delivery(1), deliveryId: "actor:wrong-field" }),
    /CONTRIBUTION_DELIVERY_SCHEMA_DENIED/,
  );
});

test("CCP-M1-INT-023 force-push, supersession, stale and timestamp decisions remain deterministic", () => {
  const trust = context();
  const a = fixtureDigest("decision-a");
  const b = fixtureDigest("decision-b");
  const c = fixtureDigest("decision-c");
  const d = fixtureDigest("decision-d");
  const result = replayContributionIntakeV1(trust, [
    delivery(1, { headDigest: a }),
    delivery(2, { headDigest: b, ancestorDigest: a }),
    delivery(3, { headDigest: c, ancestorDigest: fixtureDigest("unrelated") }),
    delivery(4, { headDigest: a, ancestorDigest: a }),
    delivery(5, { headDigest: d, ancestorDigest: c, receivedAtMs: BASE_MS }),
  ]);
  assert.deepEqual(result.ledger.entries.map((entry) => entry.reasonCodes), [
    ["NEW_CONTRIBUTION"], ["PR_HEAD_SUPERSESSION"], ["PR_HEAD_FORCE_PUSH"],
    ["SUPERSEDED_HEAD_REPLAY"], ["STALE_HEAD_TIMESTAMP"],
  ]);
  assert.equal(headStatusV1(trust, result.ledger, a), "SUPERSEDED");
  assert.equal(headStatusV1(trust, result.ledger, b), "INVALIDATED");
  assert.equal(headStatusV1(trust, result.ledger, c), "CURRENT");
  assert.equal(headStatusV1(trust, result.ledger, d), "UNKNOWN");
});

test("CCP-M1-INT-024 denials do not mutate context, delivery or ledger inputs", () => {
  const trust = context();
  const ledger = createContributionIntakeLedgerV1(trust);
  const invalid = { ...delivery(1), receivedAtMs: -1 };
  const beforeContext = JSON.stringify(trust);
  const beforeLedger = JSON.stringify(ledger);
  const beforeDelivery = JSON.stringify(invalid);
  assert.throws(
    () => ingestContributionDeliveryV1(trust, ledger, invalid as ContributionDeliveryV1),
    /CONTRIBUTION_DELIVERY_SCHEMA_DENIED/,
  );
  assert.equal(JSON.stringify(trust), beforeContext);
  assert.equal(JSON.stringify(ledger), beforeLedger);
  assert.equal(JSON.stringify(invalid), beforeDelivery);
});

test("CCP-M1-INT-025 bounded nonclaims are explicit and whole-issue completion is denied exactly", () => {
  const source = readFileSync("packages/contracts/src/contribution-intake-ledger.ts", "utf8");
  const pdca = readFileSync("docs/development/ccp-m1-intake-ledger-slice-pdca.md", "utf8");
  const text = `${source}\n${pdca}`;
  for (const phrase of [
    "events/hour", "persistence", "crash", "concurrency", "throughput", "memory", "cost",
    "fairness", "queue age", "real CI slots", "Git ancestry", "GitHub delivery", "production capacity",
  ]) assert.match(text, new RegExp(phrase, "i"), phrase);
  assert.equal((pdca.match(/This does not complete Issue #52\./g) ?? []).length, 1);
});

test("CCP-M1-INT-026 Verification DAG ownership expansion advances its graph version", () => {
  const dag = JSON.parse(readFileSync("verification/verification-dag-v2.json", "utf8")) as {
    graphVersion: number;
    nodes: Array<{ id: string; inputs: Array<{ path: string; role: string; sha256: string }>; ownedTests: string[] }>;
  };
  // v74 adds original PAN360 execution owner; all prior released owner bindings remain intact.
  assert.equal(dag.graphVersion, 74);
  const life06 = dag.nodes.filter(({ id }) => id === "pan466-qualified-module-generations-v1");
  assert.equal(life06.length, 1);
  const life06Inputs: ReadonlyArray<readonly [string, string]> = [
    ["docs/architecture/pan466-qualified-module-generations-v1.md", "DERIVED_EVIDENCE"],
    ...["module-lifecycle-descriptor", "module-lifecycle-check", "qualified-retained-module"].map(name => [`src/pan466/${name}.mjs`, "SOURCE"] as const),
    ["scripts/run-pan466-native-qualification.mjs", "VALIDATOR"],
    ...["module-lifecycle-descriptor.test", "module-lifecycle-check.test", "qualified-module-binding.test", "qualified-module-native.test", "qualified-module-process"].map(name => [`tests/pan466/${name}.mjs`, "VALIDATOR"] as const),
  ];
  assert.equal(life06[0]!.inputs.length, life06Inputs.length);
  for (const [path, role] of life06Inputs) {
    assert.deepEqual(dag.nodes.filter(owner => owner.inputs.some(input => input.path === path)).map(({ id }) => id), [life06[0]!.id], path);
    assert.deepEqual(life06[0]!.inputs.find(input => input.path === path), { path, role, sha256: createHash("sha256").update(readFileSync(path)).digest("hex") });
  }
  assert.deepEqual(life06[0]!.ownedTests, ["npm run pan466:test"]);
  const integrity = dag.nodes.filter(({ id }) => id === "repository-integrity");
  assert.equal(integrity.length, 1);
  const r1Bindings: ReadonlyArray<readonly [string, string]> = [
    ["docs/.vitepress/config.mts", "SOURCE"],
    ["tests/docs-site.test.mjs", "VALIDATOR"],
    ["docs/README.md", "DERIVED_EVIDENCE"],
    ...["overview", "architecture-tour", "knowledge-and-reuse", "research-questions"]
      .map((name) => [`docs/explanation/${name}.md`, "DERIVED_EVIDENCE"] as const),
    ["docs/use-cases/index.md", "DERIVED_EVIDENCE"],
    ...["concept-loop", "controlled-effect", "knowledge-lifecycle", "provider-adaptation"]
      .flatMap((name) => ["mmd", "svg"].map((extension) => [`docs/diagrams/${name}.${extension}`, "DERIVED_EVIDENCE"] as const)),
  ];
  assert.equal(r1Bindings.length, 16);
  for (const [path, role] of r1Bindings) {
    assert.deepEqual(dag.nodes.filter((node) => node.inputs.some((input) => input.path === path)).map(({ id }) => id), ["repository-integrity"], path);
    const matches = integrity[0]!.inputs.filter((input) => input.path === path);
    assert.equal(matches.length, 1, path);
    assert.deepEqual(matches[0], { path, role, sha256: createHash("sha256").update(readFileSync(path)).digest("hex") });
  }
  assert.equal(integrity[0]!.ownedTests.filter((command) => command === "npm run docs:test").length, 1);
  assert.equal(dag.nodes.length, 80);
  const semantic = dag.nodes.filter(({ id }) => id === "pan487-product-purpose-semantic-successor-v1");
  assert.equal(semantic.length, 1);
  assert.equal(semantic[0]!.inputs.length, 9);
  assert.deepEqual(semantic[0]!.ownedTests, ["npm run pan487:test"]);
  for (const input of semantic[0]!.inputs) {
    assert.deepEqual(dag.nodes.filter(owner => owner.inputs.some(candidate => candidate.path === input.path)).map(({ id }) => id), [semantic[0]!.id], input.path);
    assert.equal(input.sha256, createHash("sha256").update(readFileSync(input.path)).digest("hex"), input.path);
  }
  assert.equal(dag.nodes.filter(({ id }) => id === "pan466-qualified-module-generations-v1").length, 1);
  assert.equal(dag.nodes.filter(({ id }) => id === "pan465-offline-updater-v1").length, 1);
  assert.equal(dag.nodes.filter(({ id }) => id === "pan463-native-update-v1").length, 1);
  assert.equal(dag.nodes.filter(({ id }) => id === "pan464-retained-pair-v1").length, 1);
  assert.equal(dag.nodes.filter(({ id }) => id === "ap-01-incoming-invoice-blueprint-v1").length, 1);
  assert.equal(dag.nodes.filter(({ id }) => id === "ap-02-incoming-invoice-intake-v1").length, 1);
  assert.equal(dag.nodes.filter(({ id }) => id === "ap-03-incoming-invoice-extraction-benchmark-v1").length, 1);
  assert.equal(dag.nodes.filter(({ id }) => id === "etl-01-extension-assurance-profile-v1").length, 1);
  assert.equal(dag.nodes.filter(({ id }) => id === "etl-02-external-plugin-preflight-v1").length, 1);
  assert.equal(dag.nodes.filter(({ id }) => id === "awi-plugin-01-knowledge-harvest-v1").length, 1);
  assert.equal(dag.nodes.filter(({ id }) => id === "awi-insights-1-usage-insights-v1").length, 1);
  assert.equal(dag.nodes.filter(({ id }) => id === "ccp-m1-contribution-intake-ledger-v1").length, 1);
  assert.equal(dag.nodes.filter(({ id }) => id === "cap-cell-erp-01").length, 1);
  assert.equal(dag.nodes.filter(({ id }) => id === "lkc-files-01-local-file-corpus").length, 1);
  assert.equal(dag.nodes.filter(({ id }) => id === "vf-m2-adaptive-evidence-gates-v1").length, 1);
});

test("CCP-M1-INT-027 foreign submitted evidence defeats a fully rehashed rejection-to-head rewrite", () => {
  const trust = context();
  const foreign = delivery(1, { tenantId: "tenant:foreign-tenant" });
  const result = ingestContributionDeliveryV1(trust, createContributionIntakeLedgerV1(trust), foreign);
  assert.equal(result.ledger.entries[0]?.submittedIdentityEvidence.tenantId, foreign.tenantId);
  assert.equal(result.ledger.entries[0]?.submittedIdentityBinding, "SCOPE_MISMATCH");
  assert.equal(currentHeadEntryV1(trust, result.ledger), null);
  assert.ok(verifyContributionIntakeReceiptV1(trust, result.ledger, structuredClone(result.receipt)));

  const forgedLedger = structuredClone(result.ledger) as unknown as Record<string, any>;
  const forgedEntry = forgedLedger.entries[0] as Record<string, any>;
  forgedEntry.submittedIdentityBinding = "CONTEXT_MATCH";
  forgedEntry.disposition = "APPENDED";
  forgedEntry.reasonCodes = ["NEW_CONTRIBUTION"];
  forgedEntry.quarantined = false;
  forgedEntry.replacedHeadDigest = null;
  independentlyRehashLedger(forgedLedger);
  assert.equal(forgedEntry.tenantId, trust.tenantId);
  assert.equal(forgedEntry.submittedIdentityEvidence.tenantId, foreign.tenantId);
  assert.equal(verifyContributionIntakeLedgerV1(trust, forgedLedger), null);

  const forgedReceipt = structuredClone(result.receipt) as unknown as Record<string, any>;
  forgedReceipt.submittedIdentityBinding = "CONTEXT_MATCH";
  forgedReceipt.disposition = "APPENDED";
  forgedReceipt.reasonCodes = ["NEW_CONTRIBUTION"];
  forgedReceipt.quarantined = false;
  forgedReceipt.deliveryDigest = forgedEntry.deliveryDigest;
  independentlyRehashReceipt(forgedReceipt);
  assert.equal(forgedReceipt.tenantId, trust.tenantId);
  assert.equal(forgedReceipt.submittedIdentityEvidence.tenantId, foreign.tenantId);
  assert.equal(verifyContributionIntakeReceiptV1(trust, result.ledger, forgedReceipt), null);

  const replay = replayContributionIntakeV1(trust, [foreign, structuredClone(foreign)]);
  assert.equal(replay.ledger.entries.length, 1);
  assert.deepEqual(replay.receipts.map(({ disposition }) => disposition), ["REJECTED", "TRANSPORT_DUPLICATE"]);
  assert.ok(verifyContributionIntakeReceiptV1(trust, replay.ledger, replay.receipts[1]));
});
