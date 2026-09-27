import {
  mkdirSync,
  openSync,
  closeSync,
  fsyncSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { assertLocalJournalOwner, isOwnedSyntheticPath } from "./local-journal-owner.mjs";
import { canonicalJson, sha256 } from "./enforcement-gate.mjs";
import {
  APPROVAL_PURPOSE,
  APPROVAL_REQUESTER,
  assertApprovalSnapshotFresh,
  deriveAuthoritativeBusinessDiff,
  validateAuthoritativeApprovalSnapshot,
} from "./authoritative-approval-snapshot.mjs";

const STORE_SCHEMA = "chimpmaera.demo/approval-workbench-store/v2";
const PROPOSAL_SCHEMA = "chimpmaera.demo/approval-proposal/v2";
const RECEIPT_SCHEMA = "chimpmaera.demo/owner-decision-receipt/v2";
const OWNER_ACTOR = "owner:local-demo";

function assertExactKeys(value, expected, code) {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || canonicalJson(Object.keys(value).sort())
      !== canonicalJson([...expected].sort())
  ) throw new Error(code);
}

function assertHex(value, code) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(code);
  }
}

function decisionCore(decision) {
  const {
    action,
    authority,
    decisionDigest,
    ...core
  } = decision;
  return core;
}

function validateEscalationDecision(decision) {
  assertExactKeys(decision, [
    "action",
    "actionDigest",
    "actor",
    "authority",
    "decisionDigest",
    "outcome",
    "policyDigest",
    "policyGeneration",
    "policyId",
    "reasonCodes",
    "replayKey",
    "requestId",
    "requestKind",
    "schemaVersion",
  ], "OWNER_ESCALATION_DECISION_INVALID_DENIED");
  if (
    decision.schemaVersion !== "chimpmaera.demo/admin-ai-decision/v4"
    || decision.actor !== "agent:admin-ai-poc"
    || decision.requestKind !== "SYNTHETIC_DOLIBARR_ORDER_CREATE"
    || decision.outcome !== "OWNER_ESCALATION"
    || canonicalJson(decision.reasonCodes)
      !== canonicalJson(["POLICY_ORDER_REQUIRES_OWNER"])
    || decision.authority !== null
    || decision.action?.scope?.provider !== "dolibarr"
    || decision.action?.scope?.entity !== "Order"
    || decision.policyId !== "admin-ai-poc-policy-v1"
    || !Number.isSafeInteger(decision.policyGeneration)
    || decision.policyGeneration < 1
  ) throw new Error("OWNER_ESCALATION_DECISION_INVALID_DENIED");
  for (const value of [
    decision.requestId,
    decision.actionDigest,
    decision.policyDigest,
    decision.decisionDigest,
  ]) assertHex(value, "OWNER_ESCALATION_DECISION_INVALID_DENIED");
  if (
    sha256(canonicalJson(decision.action)) !== decision.actionDigest
    || sha256(canonicalJson(decisionCore(decision))) !== decision.decisionDigest
  ) throw new Error("OWNER_ESCALATION_DECISION_INVALID_DENIED");
}

function proposalCore(decision, context, snapshot) {
  const policy = {
    id: decision.policyId,
    generation: decision.policyGeneration,
    digest: decision.policyDigest,
  };
  const businessDiff = deriveAuthoritativeBusinessDiff(
    decision.action,
    snapshot,
    policy,
  );
  return {
    schemaVersion: PROPOSAL_SCHEMA,
    decisionDigest: decision.decisionDigest,
    requestId: decision.requestId,
    actor: decision.actor,
    requestKind: decision.requestKind,
    outcome: decision.outcome,
    reasonCodes: decision.reasonCodes,
    action: decision.action,
    actionDigest: decision.actionDigest,
    businessDiff,
    businessDiffDigest: sha256(canonicalJson(businessDiff)),
    snapshot,
    snapshotDigest: snapshot.snapshotDigest,
    snapshotVersion: snapshot.version,
    requester: snapshot.requester,
    purpose: snapshot.purpose,
    replayKey: decision.replayKey,
    policyDigest: decision.policyDigest,
    policyGeneration: decision.policyGeneration,
    policyId: decision.policyId,
    profileId: context.profileId,
    profileGeneration: context.profileGeneration,
  };
}

function validateProposal(proposal) {
  assertExactKeys(proposal, [
    "action",
    "actionDigest",
    "actor",
    "businessDiff",
    "businessDiffDigest",
    "decisionDigest",
    "outcome",
    "policyDigest",
    "policyGeneration",
    "policyId",
    "profileGeneration",
    "profileId",
    "proposalDigest",
    "purpose",
    "reasonCodes",
    "replayKey",
    "requester",
    "requestId",
    "requestKind",
    "schemaVersion",
    "snapshot",
    "snapshotDigest",
    "snapshotVersion",
  ], "APPROVAL_PROPOSAL_INVALID_DENIED");
  if (
    proposal.schemaVersion !== PROPOSAL_SCHEMA
    || proposal.outcome !== "OWNER_ESCALATION"
    || proposal.profileId !== "SAFE_GUIDED"
    || proposal.policyId !== "admin-ai-poc-policy-v1"
    || proposal.requester !== APPROVAL_REQUESTER
    || proposal.purpose !== APPROVAL_PURPOSE
    || !Number.isSafeInteger(proposal.policyGeneration)
    || proposal.policyGeneration < 1
    || typeof proposal.profileGeneration !== "string"
    || proposal.profileGeneration.length < 8
  ) throw new Error("APPROVAL_PROPOSAL_INVALID_DENIED");
  for (const value of [
    proposal.actionDigest,
    proposal.businessDiffDigest,
    proposal.decisionDigest,
    proposal.policyDigest,
    proposal.proposalDigest,
    proposal.snapshotDigest,
    proposal.snapshotVersion,
  ]) assertHex(value, "APPROVAL_PROPOSAL_INVALID_DENIED");
  const { proposalDigest, ...core } = proposal;
  let expectedDiff;
  try {
    validateAuthoritativeApprovalSnapshot(proposal.snapshot, proposal.action);
    expectedDiff = deriveAuthoritativeBusinessDiff(
      proposal.action,
      proposal.snapshot,
      {
        id: proposal.policyId,
        generation: proposal.policyGeneration,
        digest: proposal.policyDigest,
      },
    );
  } catch {
    throw new Error("APPROVAL_PROPOSAL_INVALID_DENIED");
  }
  if (
    sha256(canonicalJson(proposal.action)) !== proposal.actionDigest
    || proposal.snapshotDigest !== proposal.snapshot.snapshotDigest
    || proposal.snapshotVersion !== proposal.snapshot.version
    || canonicalJson(proposal.businessDiff) !== canonicalJson(expectedDiff)
    || sha256(canonicalJson(proposal.businessDiff))
      !== proposal.businessDiffDigest
    || sha256(canonicalJson(core)) !== proposalDigest
  ) throw new Error("APPROVAL_PROPOSAL_INVALID_DENIED");
}

function validateDecisionReceipt(receipt, proposal) {
  assertExactKeys(receipt, [
    "actionDigest",
    "businessDiffDigest",
    "decidedAtMs",
    "decisionDigest",
    "outcome",
    "ownerActor",
    "ownerDecision",
    "policyDigest",
    "policyGeneration",
    "policyId",
    "profileGeneration",
    "profileId",
    "proposalDigest",
    "purpose",
    "receiptDigest",
    "requester",
    "schemaVersion",
    "snapshotDigest",
    "snapshotVersion",
  ], "OWNER_DECISION_RECEIPT_INVALID_DENIED");
  const { receiptDigest, ...core } = receipt;
  if (
    receipt.schemaVersion !== RECEIPT_SCHEMA
    || receipt.ownerActor !== OWNER_ACTOR
    || !["APPROVE", "REJECT"].includes(receipt.ownerDecision)
    || receipt.outcome !== (
      receipt.ownerDecision === "APPROVE"
        ? "OWNER_APPROVED_AUTHORITY_ISSUED"
        : "OWNER_REJECTED_NO_AUTHORITY"
    )
    || !Number.isSafeInteger(receipt.decidedAtMs)
    || receipt.decidedAtMs < 0
    || receipt.proposalDigest !== proposal.proposalDigest
    || receipt.decisionDigest !== proposal.decisionDigest
    || receipt.actionDigest !== proposal.actionDigest
    || receipt.businessDiffDigest !== proposal.businessDiffDigest
    || receipt.policyDigest !== proposal.policyDigest
    || receipt.policyGeneration !== proposal.policyGeneration
    || receipt.policyId !== proposal.policyId
    || receipt.profileId !== proposal.profileId
    || receipt.profileGeneration !== proposal.profileGeneration
    || receipt.requester !== proposal.requester
    || receipt.purpose !== proposal.purpose
    || receipt.snapshotDigest !== proposal.snapshotDigest
    || receipt.snapshotVersion !== proposal.snapshotVersion
    || sha256(canonicalJson(core)) !== receiptDigest
  ) throw new Error("OWNER_DECISION_RECEIPT_INVALID_DENIED");
}

function normalizeStore(value) {
  assertExactKeys(
    value,
    ["decisions", "proposals", "schemaVersion"],
    "APPROVAL_STORE_INVALID_DENIED",
  );
  if (
    value.schemaVersion !== STORE_SCHEMA
    || value.proposals === null
    || typeof value.proposals !== "object"
    || Array.isArray(value.proposals)
    || value.decisions === null
    || typeof value.decisions !== "object"
    || Array.isArray(value.decisions)
  ) throw new Error("APPROVAL_STORE_INVALID_DENIED");
  for (const [digest, proposal] of Object.entries(value.proposals)) {
    validateProposal(proposal);
    if (proposal.decisionDigest !== digest) {
      throw new Error("APPROVAL_STORE_INVALID_DENIED");
    }
  }
  for (const [digest, record] of Object.entries(value.decisions)) {
    assertExactKeys(
      record,
      ["authority", "receipt"],
      "APPROVAL_STORE_INVALID_DENIED",
    );
    const proposal = value.proposals[digest];
    if (proposal === undefined) throw new Error("APPROVAL_STORE_INVALID_DENIED");
    validateDecisionReceipt(record.receipt, proposal);
    if (
      (record.receipt.ownerDecision === "REJECT" && record.authority !== null)
      || (record.receipt.ownerDecision === "APPROVE"
        && (record.authority === null || typeof record.authority !== "object"))
    ) throw new Error("APPROVAL_STORE_INVALID_DENIED");
  }
  return value;
}

export class ApprovalWorkbench {
  constructor({
    receiptPath,
    journalOwner = null,
    issueAuthority,
    readAuthoritativeSnapshot,
    now = () => Date.now(),
    leaseTtlMs = 60_000,
    policyDigest,
    policyGeneration = 1,
    policyId = "admin-ai-poc-policy-v1",
    profileId = "SAFE_GUIDED",
    profileGeneration,
  }) {
    if (
      typeof receiptPath !== "string"
      || typeof issueAuthority !== "function"
      || typeof readAuthoritativeSnapshot !== "function"
      || typeof now !== "function"
      || !Number.isSafeInteger(leaseTtlMs)
      || leaseTtlMs < 1_000
      || leaseTtlMs > 300_000
      || !Number.isSafeInteger(policyGeneration)
      || policyGeneration < 1
      || policyId !== "admin-ai-poc-policy-v1"
      || profileId !== "SAFE_GUIDED"
      || typeof profileGeneration !== "string"
      || profileGeneration.length < 8
    ) throw new Error("APPROVAL_WORKBENCH_CONFIG_INVALID_DENIED");
    assertHex(policyDigest, "APPROVAL_WORKBENCH_CONFIG_INVALID_DENIED");
    this.receiptPath = receiptPath;
    this.journalOwner = journalOwner;
    assertLocalJournalOwner(receiptPath, journalOwner);
    this.issueAuthority = issueAuthority;
    this.readAuthoritativeSnapshot = readAuthoritativeSnapshot;
    this.now = now;
    this.leaseTtlMs = leaseTtlMs;
    this.context = {
      policyDigest,
      policyGeneration,
      policyId,
      profileId,
      profileGeneration,
    };
    this.state = {
      schemaVersion: STORE_SCHEMA,
      proposals: {},
      decisions: {},
    };
    this.pendingDecisions = new Set();
    try {
      this.state = normalizeStore(JSON.parse(readFileSync(receiptPath, "utf8")));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  persist() {
    assertLocalJournalOwner(this.receiptPath, this.journalOwner);
    mkdirSync(dirname(this.receiptPath), { recursive: true });
    const temp = `${this.receiptPath}.tmp`;
    writeFileSync(temp, `${JSON.stringify(this.state, null, 2)}\n`, {
      mode: 0o600,
      ...(isOwnedSyntheticPath(this.receiptPath) ? { flush: true } : {}),
    });
    renameSync(temp, this.receiptPath);
    if (isOwnedSyntheticPath(this.receiptPath)) {
      const dirFd = openSync(dirname(this.receiptPath), "r");
      try { fsyncSync(dirFd); } finally { closeSync(dirFd); }
    }
  }

  async register(decision) {
    validateEscalationDecision(decision);
    if (
      decision.policyDigest !== this.context.policyDigest
      || decision.policyGeneration !== this.context.policyGeneration
      || decision.policyId !== this.context.policyId
    ) {
      throw new Error("APPROVAL_POLICY_CONTEXT_MISMATCH_DENIED");
    }
    const snapshot = validateAuthoritativeApprovalSnapshot(
      await this.readAuthoritativeSnapshot(decision.action),
      decision.action,
    );
    if (snapshot.matches.length !== 0) {
      throw new Error("APPROVAL_TARGET_ALREADY_EXISTS_DENIED");
    }
    const core = proposalCore(decision, this.context, snapshot);
    const proposal = {
      ...core,
      proposalDigest: sha256(canonicalJson(core)),
    };
    const prior = this.state.proposals[decision.decisionDigest];
    if (prior !== undefined) {
      if (canonicalJson(prior) !== canonicalJson(proposal)) {
        throw new Error("APPROVAL_PROPOSAL_CONFLICT_DENIED");
      }
      return prior;
    }
    this.state.proposals[decision.decisionDigest] = proposal;
    this.persist();
    return proposal;
  }

  async decide({ decisionDigest, ownerDecision, ownerActor }) {
    assertHex(decisionDigest, "OWNER_DECISION_INVALID_DENIED");
    if (
      ownerActor !== OWNER_ACTOR
      || !["APPROVE", "REJECT"].includes(ownerDecision)
    ) throw new Error("OWNER_DECISION_INVALID_DENIED");
    const proposal = this.state.proposals[decisionDigest];
    if (proposal === undefined) throw new Error("APPROVAL_PROPOSAL_NOT_FOUND");
    if (this.state.decisions[decisionDigest] !== undefined) {
      throw new Error("OWNER_DECISION_ALREADY_FINAL_DENIED");
    }
    if (this.pendingDecisions.has(decisionDigest)) {
      throw new Error("OWNER_DECISION_IN_PROGRESS_DENIED");
    }
    this.pendingDecisions.add(decisionDigest);
    try {
      validateProposal(proposal);
      if (
        ownerActor === proposal.actor
        || ownerActor === proposal.requester
      ) throw new Error("APPROVAL_SAME_ACTOR_DENIED");
      if (
        proposal.policyDigest !== this.context.policyDigest
        || proposal.policyGeneration !== this.context.policyGeneration
        || proposal.policyId !== this.context.policyId
        || proposal.profileId !== this.context.profileId
        || proposal.profileGeneration !== this.context.profileGeneration
      ) throw new Error("APPROVAL_CONTEXT_STALE_DENIED");
      assertApprovalSnapshotFresh(
        proposal.snapshot,
        await this.readAuthoritativeSnapshot(proposal.action),
        proposal.action,
      );
      const decidedAtMs = this.now();
      if (!Number.isSafeInteger(decidedAtMs) || decidedAtMs < 0) {
        throw new Error("APPROVAL_CLOCK_INVALID_DENIED");
      }
      const core = {
      schemaVersion: RECEIPT_SCHEMA,
      proposalDigest: proposal.proposalDigest,
      decisionDigest,
      ownerActor,
      ownerDecision,
      outcome: ownerDecision === "APPROVE"
        ? "OWNER_APPROVED_AUTHORITY_ISSUED"
        : "OWNER_REJECTED_NO_AUTHORITY",
      decidedAtMs,
      actionDigest: proposal.actionDigest,
      businessDiffDigest: proposal.businessDiffDigest,
      policyDigest: proposal.policyDigest,
      policyGeneration: proposal.policyGeneration,
      policyId: proposal.policyId,
      profileId: proposal.profileId,
      profileGeneration: proposal.profileGeneration,
      requester: proposal.requester,
      purpose: proposal.purpose,
      snapshotDigest: proposal.snapshotDigest,
      snapshotVersion: proposal.snapshotVersion,
    };
      const receipt = {
      ...core,
      receiptDigest: sha256(canonicalJson(core)),
    };
      const authority = ownerDecision === "APPROVE"
      ? this.issueAuthority({
        proposal,
        ownerDecisionReceiptDigest: receipt.receiptDigest,
        issuedAtMs: decidedAtMs,
        expiresAtMs: decidedAtMs + this.leaseTtlMs,
      })
      : null;
      this.state.decisions[decisionDigest] = { receipt, authority };
      this.persist();
      return { status: "PASS", decisionReceipt: receipt, authority };
    } finally {
      this.pendingDecisions.delete(decisionDigest);
    }
  }

  readDecision(decisionDigest) {
    assertHex(decisionDigest, "OWNER_DECISION_INVALID_DENIED");
    const record = this.state.decisions[decisionDigest];
    if (record === undefined) throw new Error("OWNER_DECISION_RECEIPT_NOT_FOUND");
    return { status: "PASS", ...record };
  }
}
