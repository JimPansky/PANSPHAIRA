import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AdminAiPoc } from "../demo/runtime/admin-ai-poc.mjs";
import { ApprovalWorkbench } from "../demo/runtime/approval-workbench.mjs";
import { createAuthoritativeApprovalSnapshot } from
  "../demo/runtime/authoritative-approval-snapshot.mjs";
import {
  DemoMutationGate,
  canonicalJson,
  sha256,
} from "../demo/runtime/enforcement-gate.mjs";

const apiToken = "a".repeat(48);
const controlToken = "b".repeat(48);
const ownerAuthorityToken = "c".repeat(48);
const expectedOrigin = "http://127.0.0.1:7780";
const policyBytes = readFileSync(
  new URL(
    "../demo/manifests/authority/admin-ai-poc-policy-v1.json",
    import.meta.url,
  ),
);
const policy = JSON.parse(policyBytes.toString("utf8"));
const policyDigest = sha256(policyBytes);
const authorityContext = {
  profileId: "SAFE_GUIDED",
  profileGeneration: "test-generation-0001",
  policyGeneration: 1,
};
let sequence = 0;

function localRequest() {
  return {
    headers: {
      authorization: "Bearer " + apiToken,
      host: "127.0.0.1:7780",
      origin: expectedOrigin,
      "x-cm-csrf": "chimpmaera-local-v1",
    },
  };
}

function policyRequest(suffix) {
  return {
    schemaVersion: "chimpmaera.demo/admin-ai-request/v1",
    actor: "agent:admin-ai-poc",
    requestKind: "SYNTHETIC_DOLIBARR_ORDER_CREATE",
    replayKey: "admin-ai:poc:order:" + suffix,
  };
}

function harness({
  nowMs = 1_000_000,
  mutate,
  readback,
  reconcile,
  root,
  snapshotRecords = [],
  snapshotTransform = (snapshot) => snapshot,
  assertPolicyUse = () => true,
} = {}) {
  const clock = { value: nowMs };
  const dir = root ?? mkdtempSync(join(tmpdir(), "cm-approval-workbench-"));
  let mutations = 0;
  let readbacks = 0;
  let snapshotReads = 0;
  const provider = {
    async readAuthoritativeSnapshot(action) {
      snapshotReads += 1;
      return snapshotTransform(
        createAuthoritativeApprovalSnapshot(action, snapshotRecords),
      );
    },
    async mutate(action) {
      mutations += 1;
      return mutate === undefined ? { id: "order-42" } : mutate(action);
    },
    async readback(action, result) {
      readbacks += 1;
      return readback === undefined
        ? {
          id: result.id,
          date: action.payload.body.date,
          ref_client: action.payload.body.ref_client,
          socid: action.payload.body.socid,
        }
        : readback(action, result);
    },
    ...(reconcile === undefined ? {} : {
      async reconcile(action) {
        return reconcile(action);
      },
    }),
  };
  const gate = new DemoMutationGate({
    apiToken,
    controlToken,
    ownerAuthorityToken,
    expectedOrigin,
    receiptPath: join(dir, "effects.json"),
    provider,
    adminAiPolicyDigest: policyDigest,
    now: () => clock.value,
    authorityContext,
    assertPolicyUse,
  });
  const poc = new AdminAiPoc({
    policy,
    policyDigest,
    signAuthority: (fields) => gate.agentAuthority(fields),
  });
  const workbench = new ApprovalWorkbench({
    receiptPath: join(dir, "approvals.json"),
    issueAuthority: (fields) => gate.ownerAuthority(fields),
    readAuthoritativeSnapshot: (action) => provider.readAuthoritativeSnapshot(action),
    now: () => clock.value,
    leaseTtlMs: 30_000,
    policyDigest,
    policyGeneration: authorityContext.policyGeneration,
    profileId: authorityContext.profileId,
    profileGeneration: authorityContext.profileGeneration,
  });
  return {
    clock,
    dir,
    gate,
    poc,
    workbench,
    mutations: () => mutations,
    readbacks: () => readbacks,
    snapshotReads: () => snapshotReads,
    snapshotRecords,
  };
}

async function escalation(current, suffix = "case-" + sequence++) {
  const decision = current.poc.decide(policyRequest(suffix)).decision;
  const proposal = await current.workbench.register(decision);
  return { decision, proposal };
}

async function ownerDecision(current, decision, value, ownerActor = "owner:local-demo") {
  return current.workbench.decide({
    decisionDigest: decision.decisionDigest,
    ownerDecision: value,
    ownerActor,
  });
}

function effectEnvelope(decision, proposal, authority) {
  return {
    action: decision.action,
    actionDigest: decision.actionDigest,
    businessDiff: proposal.businessDiff,
    businessDiffDigest: proposal.businessDiffDigest,
    authority,
  };
}

test("AAS-016-1 bounded snapshots reject hidden, truncated and unknown fields", async () => {
  const transforms = [
    (snapshot) => ({ ...snapshot, truncated: true }),
    (snapshot) => ({
      ...snapshot,
      materialFields: snapshot.materialFields.slice(0, 2),
    }),
    (snapshot) => ({ ...snapshot, hiddenMatches: [] }),
    (snapshot) => ({
      ...snapshot,
      query: { ...snapshot.query, limit: 100 },
    }),
  ];
  for (const snapshotTransform of transforms) {
    const current = harness({ snapshotTransform });
    await assert.rejects(
      escalation(current),
      /APPROVAL_SNAPSHOT_INVALID_DENIED/,
    );
    assert.equal(current.mutations(), 0);
  }
});

test("AAS-016-2 snapshot-derived display is fully bound and fresh approval acts once", async () => {
  const current = harness();
  const { decision, proposal } = await escalation(current, "white-001");
  assert.equal(decision.outcome, "OWNER_ESCALATION");
  assert.equal(
    proposal.businessDiff.summary,
    "Create one synthetic Dolibarr sales order if absent.",
  );
  assert.deepEqual(
    proposal.businessDiff.changes.map(({ field, after }) => [field, after]),
    [
      ["customerReference", "CM-ADMIN-AI-ESCALATION-001"],
      ["customerId", 7],
      ["orderDateEpoch", 1767225600],
    ],
  );
  assert.equal(
    proposal.businessDiffDigest,
    sha256(canonicalJson(proposal.businessDiff)),
  );
  assert.equal(proposal.snapshot.matches.length, 0);
  assert.equal(proposal.businessDiff.priorState.complete, true);
  assert.deepEqual(proposal.businessDiff.materialFields, [
    "customerReference", "customerId", "orderDateEpoch",
  ]);
  assert.equal(proposal.businessDiff.requester, "requester:local-demo");
  assert.equal(proposal.businessDiff.purpose, "CREATE_SYNTHETIC_SALES_ORDER");
  assert.equal(proposal.businessDiff.impacts.budget.upperBound, "0.00");
  assert.equal(
    proposal.businessDiff.rollback.mode,
    "SEPARATE_APPROVAL_REQUIRED",
  );
  assert.equal(proposal.businessDiff.policy.digest, policyDigest);
  assert.equal(
    proposal.businessDiff.priorState.snapshotDigest,
    proposal.snapshotDigest,
  );

  const approved = await ownerDecision(current, decision, "APPROVE");
  assert.equal(approved.status, "PASS");
  assert.equal(
    approved.decisionReceipt.outcome,
    "OWNER_APPROVED_AUTHORITY_ISSUED",
  );
  assert.equal(approved.authority.kind, "OWNER_ESCALATION_LEASE_HMAC_V1");
  assert.equal(approved.authority.maxUses, 1);
  assert.equal(
    approved.authority.ownerDecisionReceiptDigest,
    approved.decisionReceipt.receiptDigest,
  );
  assert.equal(approved.authority.profileId, "SAFE_GUIDED");
  assert.equal(approved.authority.expiresAtMs - approved.authority.issuedAtMs, 30_000);

  const result = await current.gate.execute(
    localRequest(),
    effectEnvelope(decision, proposal, approved.authority),
  );
  assert.equal(result.status, "PASS");
  assert.equal(result.replayed, false);
  assert.equal(current.mutations(), 1);
  assert.equal(current.readbacks(), 1);
  assert.equal(result.readback.ref_client, "CM-ADMIN-AI-ESCALATION-001");
  assert.equal(
    result.receipt.ownerDecisionReceiptDigest,
    approved.decisionReceipt.receiptDigest,
  );
  assert.equal(result.receipt.authority.leaseId, approved.authority.leaseId);
  assert.equal(result.receipt.businessDiffDigest, proposal.businessDiffDigest);
  assert.equal(result.receipt.snapshotDigest, proposal.snapshotDigest);
  assert.equal(current.snapshotReads(), 3);
  assert.deepEqual(
    current.workbench.readDecision(decision.decisionDigest),
    {
      status: "PASS",
      receipt: approved.decisionReceipt,
      authority: approved.authority,
    },
  );
  assert.deepEqual(
    current.gate.state.effects[decision.replayKey].receipt,
    result.receipt,
  );
});

test("AAS-016-3 approval and use-time snapshot drift deny before mutation", async () => {
  {
    const records = [];
    const current = harness({ snapshotRecords: records });
    const { decision } = await escalation(current, "approval-drift-001");
    records.push({
      id: 41,
      ref_client: "CM-ADMIN-AI-ESCALATION-001",
      socid: 7,
      date: 1767225600,
    });
    await assert.rejects(
      ownerDecision(current, decision, "APPROVE"),
      /APPROVAL_SNAPSHOT_STALE_DENIED/,
    );
    assert.equal(current.mutations(), 0);
  }
  {
    const records = [];
    const current = harness({ snapshotRecords: records });
    const { decision, proposal } = await escalation(current, "use-drift-001");
    const approved = await ownerDecision(current, decision, "APPROVE");
    records.push({
      id: 42,
      ref_client: "CM-ADMIN-AI-ESCALATION-001",
      socid: 7,
      date: 1767225600,
    });
    await assert.rejects(
      current.gate.execute(
        localRequest(),
        effectEnvelope(decision, proposal, approved.authority),
      ),
      /APPROVAL_SNAPSHOT_STALE_DENIED/,
    );
    assert.equal(current.mutations(), 0);
    assert.deepEqual(current.gate.state.reservations, {});
  }
});

test("AAS-016-4 rapid decisions, actor drift and Policy drift fail closed", async () => {
  let release;
  let reads = 0;
  const barrier = new Promise((resolve) => { release = resolve; });
  const current = harness({
    snapshotTransform: async (snapshot) => {
      reads += 1;
      if (reads === 2) await barrier;
      return snapshot;
    },
  });
  const { decision } = await escalation(current, "rapid-001");
  const first = ownerDecision(current, decision, "APPROVE");
  await assert.rejects(
    ownerDecision(current, decision, "APPROVE"),
    /OWNER_DECISION_IN_PROGRESS_DENIED/,
  );
  release();
  await first;

  const actorCurrent = harness();
  const { decision: actorDecision } = await escalation(actorCurrent, "actor-001");
  await assert.rejects(
    ownerDecision(actorCurrent, actorDecision, "APPROVE", "agent:admin-ai-poc"),
    /OWNER_DECISION_INVALID_DENIED|APPROVAL_SAME_ACTOR_DENIED/,
  );

  const policyCurrent = harness();
  const { decision: policyDecision } = await escalation(policyCurrent, "policy-001");
  policyCurrent.workbench.context.policyGeneration += 1;
  await assert.rejects(
    ownerDecision(policyCurrent, policyDecision, "APPROVE"),
    /APPROVAL_CONTEXT_STALE_DENIED/,
  );
  assert.equal(policyCurrent.mutations(), 0);
});

test("rejected escalation is terminal, has no authority and cannot act", async () => {
  const current = harness();
  const { decision, proposal } = await escalation(current, "reject-001");
  const rejected = await ownerDecision(current, decision, "REJECT");
  assert.equal(rejected.authority, null);
  assert.equal(
    rejected.decisionReceipt.outcome,
    "OWNER_REJECTED_NO_AUTHORITY",
  );
  await assert.rejects(
    current.gate.execute(
      localRequest(),
      effectEnvelope(decision, proposal, rejected.authority),
    ),
    /AGENT_ACTION_SCOPE_DENIED/,
  );
  await assert.rejects(
    ownerDecision(current, decision, "APPROVE"),
    /OWNER_DECISION_ALREADY_FINAL_DENIED/,
  );
  assert.equal(current.mutations(), 0);
  assert.equal(current.readbacks(), 0);
});

test("tampered action, scope, diff, policy, profile, receipt and HMAC cannot act", async () => {
  const cases = [
    (envelope) => ({ ...envelope, unexpected: true }),
    (envelope) => ({ ...envelope, actionDigest: "0".repeat(64) }),
    (envelope) => {
      const action = structuredClone(envelope.action);
      action.scope.entity = "Invoice";
      return {
        ...envelope,
        action,
        actionDigest: sha256(canonicalJson(action)),
      };
    },
    (envelope) => {
      const businessDiff = structuredClone(envelope.businessDiff);
      businessDiff.changes[0].after = "TAMPERED";
      return { ...envelope, businessDiff };
    },
    (envelope) => ({
      ...envelope,
      authority: { ...envelope.authority, policyDigest: "0".repeat(64) },
    }),
    (envelope) => ({
      ...envelope,
      authority: { ...envelope.authority, profileGeneration: "other-generation" },
    }),
    (envelope) => ({
      ...envelope,
      authority: { ...envelope.authority, snapshotDigest: "0".repeat(64) },
    }),
    (envelope) => ({
      ...envelope,
      authority: { ...envelope.authority, snapshotVersion: "0".repeat(64) },
    }),
    (envelope) => ({
      ...envelope,
      authority: { ...envelope.authority, requester: "agent:admin-ai-poc" },
    }),
    (envelope) => ({
      ...envelope,
      authority: {
        ...envelope.authority,
        ownerDecisionReceiptDigest: "0".repeat(64),
      },
    }),
    (envelope) => ({
      ...envelope,
      authority: { ...envelope.authority, binding: "0".repeat(64) },
    }),
  ];
  for (const mutateEnvelope of cases) {
    const current = harness();
    const { decision, proposal } = await escalation(current);
    const approved = await ownerDecision(current, decision, "APPROVE");
    await assert.rejects(
      current.gate.execute(
        localRequest(),
        mutateEnvelope(effectEnvelope(decision, proposal, approved.authority)),
      ),
      /OWNER_EFFECT_ENVELOPE_INVALID_DENIED|ACTION_DIGEST_MISMATCH_DENIED|SCOPE_MISMATCH_DENIED|AGENT_ACTION_SCOPE_DENIED|OWNER_AUTHORITY_INVALID_DENIED/,
    );
    assert.equal(current.mutations(), 0);
    assert.equal(current.readbacks(), 0);
  }
});

test("not-yet-valid and expired leases fail before provider access", async () => {
  {
    const current = harness({ nowMs: 50_000 });
    const { decision, proposal } = await escalation(current, "future-001");
    const approved = await ownerDecision(current, decision, "APPROVE");
    current.clock.value = approved.authority.notBeforeMs - 1;
    await assert.rejects(
      current.gate.execute(
        localRequest(),
        effectEnvelope(decision, proposal, approved.authority),
      ),
      /AUTHORITY_NOT_YET_VALID_DENIED/,
    );
    assert.equal(current.mutations(), 0);
  }
  {
    const current = harness({ nowMs: 60_000 });
    const { decision, proposal } = await escalation(current, "expired-001");
    const approved = await ownerDecision(current, decision, "APPROVE");
    current.clock.value = approved.authority.expiresAtMs;
    await assert.rejects(
      current.gate.execute(
        localRequest(),
        effectEnvelope(decision, proposal, approved.authority),
      ),
      /AUTHORITY_EXPIRED_DENIED/,
    );
    assert.equal(current.mutations(), 0);
  }
});

test("deferred snapshot read revalidates lease before reservation", async () => {
  let releaseSnapshot;
  let resolveSnapshotReadStarted;
  const snapshotReadStarted = new Promise((resolve) => {
    resolveSnapshotReadStarted = resolve;
  });
  const deferredSnapshot = new Promise((resolve) => {
    releaseSnapshot = resolve;
  });
  let reads = 0;
  const current = harness({
    snapshotTransform: async (snapshot) => {
      reads += 1;
      if (reads === 3) {
        resolveSnapshotReadStarted();
        await deferredSnapshot;
      }
      return snapshot;
    },
  });
  const { decision, proposal } = await escalation(current, "temporal-001");
  const approved = await ownerDecision(current, decision, "APPROVE");
  const pending = current.gate.execute(
    localRequest(),
    effectEnvelope(decision, proposal, approved.authority),
  );
  await snapshotReadStarted;
  current.clock.value = approved.authority.expiresAtMs;
  releaseSnapshot();
  await assert.rejects(pending, /AUTHORITY_EXPIRED_DENIED/);
  assert.equal(current.mutations(), 0);
  assert.deepEqual(current.gate.state.reservations, {});
});

test("deferred snapshot read revalidates policy and profile generations", async () => {
  for (const [label, change] of [
    ["policy", (current) => { current.gate.authorityContext.policyGeneration += 1; }],
    ["profile", (current) => { current.gate.authorityContext.profileGeneration = "profile-revoked-v2"; }],
  ]) {
    let releaseSnapshot;
    let resolveSnapshotReadStarted;
    const snapshotReadStarted = new Promise((resolve) => {
      resolveSnapshotReadStarted = resolve;
    });
    const deferredSnapshot = new Promise((resolve) => {
      releaseSnapshot = resolve;
    });
    let reads = 0;
    const current = harness({
      snapshotTransform: async (snapshot) => {
        reads += 1;
        if (reads === 3) {
          resolveSnapshotReadStarted();
          await deferredSnapshot;
        }
        return snapshot;
      },
    });
    const { decision, proposal } = await escalation(current, `binding-${label}`);
    const approved = await ownerDecision(current, decision, "APPROVE");
    const pending = current.gate.execute(
      localRequest(),
      effectEnvelope(decision, proposal, approved.authority),
    );
    await snapshotReadStarted;
    change(current);
    releaseSnapshot();
    await assert.rejects(pending, /OWNER_AUTHORITY_INVALID_DENIED/);
    assert.equal(current.mutations(), 0);
    assert.deepEqual(current.gate.state.reservations, {});
  }
});

test("deferred snapshot read revalidates the current policy state", async () => {
  let revoked = false;
  let releaseSnapshot;
  let resolveSnapshotReadStarted;
  const snapshotReadStarted = new Promise((resolve) => {
    resolveSnapshotReadStarted = resolve;
  });
  const deferredSnapshot = new Promise((resolve) => {
    releaseSnapshot = resolve;
  });
  let reads = 0;
  const current = harness({
    assertPolicyUse: () => {
      if (revoked) throw new Error("POLICY_USE_REVOKED_DENIED");
    },
    snapshotTransform: async (snapshot) => {
      reads += 1;
      if (reads === 3) {
        resolveSnapshotReadStarted();
        await deferredSnapshot;
      }
      return snapshot;
    },
  });
  const { decision, proposal } = await escalation(current, "revocation-001");
  const approved = await ownerDecision(current, decision, "APPROVE");
  const pending = current.gate.execute(
    localRequest(),
    effectEnvelope(decision, proposal, approved.authority),
  );
  await snapshotReadStarted;
  revoked = true;
  releaseSnapshot();
  await assert.rejects(pending, /POLICY_USE_REVOKED_DENIED/);
  assert.equal(current.mutations(), 0);
  assert.deepEqual(current.gate.state.reservations, {});
});

test("consumed authority replay cannot act a second time", async () => {
  const current = harness();
  const { decision, proposal } = await escalation(current, "replay-001");
  const approved = await ownerDecision(current, decision, "APPROVE");
  const envelope = effectEnvelope(decision, proposal, approved.authority);
  await current.gate.execute(localRequest(), envelope);
  const readsBeforeReplay = current.snapshotReads();
  await assert.rejects(
    current.gate.execute(localRequest(), envelope),
    /AUTHORITY_LEASE_REPLAY_DENIED/,
  );
  assert.equal(current.mutations(), 1);
  assert.equal(current.readbacks(), 1);
  assert.equal(current.snapshotReads(), readsBeforeReplay);
});

test("concurrent and restart replay see the durable EXECUTING reservation", async () => {
  let releaseMutation;
  let resolveMutationStarted;
  const mutationStarted = new Promise((resolve) => {
    resolveMutationStarted = resolve;
  });
  const mutationBarrier = new Promise((resolve) => {
    releaseMutation = resolve;
  });
  const current = harness({
    mutate: async () => {
      resolveMutationStarted();
      await mutationBarrier;
      return { id: "order-concurrent" };
    },
  });
  const { decision, proposal } = await escalation(current, "concurrent-001");
  const approved = await ownerDecision(current, decision, "APPROVE");
  const envelope = effectEnvelope(decision, proposal, approved.authority);
  const first = current.gate.execute(localRequest(), envelope);
  await mutationStarted;

  await assert.rejects(
    current.gate.execute(localRequest(), envelope),
    /AUTHORITY_LEASE_REPLAY_DENIED/,
  );
  const restarted = harness({ root: current.dir });
  await assert.rejects(
    restarted.gate.execute(localRequest(), envelope),
    /AUTHORITY_LEASE_REPLAY_DENIED/,
  );
  assert.equal(current.mutations(), 1);
  assert.equal(restarted.mutations(), 0);
  releaseMutation();
  await first;
});

test("semantic readback mismatch records ambiguity and no success receipt", async () => {
  const current = harness({
    readback: async () => ({
      id: "order-wrong",
      date: 1767225600,
      ref_client: "WRONG",
      socid: 7,
    }),
  });
  const { decision, proposal } = await escalation(current, "readback-001");
  const approved = await ownerDecision(current, decision, "APPROVE");
  await assert.rejects(
    current.gate.execute(
      localRequest(),
      effectEnvelope(decision, proposal, approved.authority),
    ),
    /PROVIDER_READBACK_MISMATCH_DENIED/,
  );
  assert.equal(current.mutations(), 1);
  assert.equal(current.readbacks(), 1);
  assert.equal(current.gate.state.effects[decision.replayKey], undefined);
  assert.equal(
    current.gate.state.reservations[decision.replayKey].status,
    "AMBIGUOUS",
  );
});

test("ambiguous owner recovery is bound to the originally consumed lease", async () => {
  let reconciliations = 0;
  const current = harness({
    readback: async () => ({
      id: "order-wrong",
      date: 1767225600,
      ref_client: "WRONG",
      socid: 7,
    }),
    reconcile: async (action) => {
      reconciliations += 1;
      return {
        providerResult: { id: "order-42" },
        readback: {
          id: "order-42",
          date: action.payload.body.date,
          ref_client: action.payload.body.ref_client,
          socid: action.payload.body.socid,
        },
      };
    },
  });
  const { decision, proposal } = await escalation(current, "authority-recovery-001");
  const approved = await ownerDecision(current, decision, "APPROVE");
  await assert.rejects(
    current.gate.execute(
      localRequest(),
      effectEnvelope(decision, proposal, approved.authority),
    ),
    /PROVIDER_READBACK_MISMATCH_DENIED/,
  );
  assert.equal(
    current.gate.state.reservations[decision.replayKey].authorityBinding,
    approved.authority.leaseId,
  );

  current.clock.value += 1;
  const substitutedAuthority = current.gate.ownerAuthority({
    proposal,
    ownerDecisionReceiptDigest: approved.decisionReceipt.receiptDigest,
    issuedAtMs: current.clock.value,
    expiresAtMs: current.clock.value + 30_000,
  });
  assert.notEqual(substitutedAuthority.leaseId, approved.authority.leaseId);
  const snapshotReadsBeforeRetry = current.snapshotReads();
  await assert.rejects(
    current.gate.execute(
      localRequest(),
      effectEnvelope(decision, proposal, substitutedAuthority),
    ),
    /REPLAY_AUTHORITY_CONFLICT_DENIED/,
  );
  assert.equal(current.snapshotReads(), snapshotReadsBeforeRetry);
  assert.equal(reconciliations, 0);
  assert.equal(current.gate.state.effects[decision.replayKey], undefined);
});

test("owner operation binding conflict takes precedence over consumed-lease replay", async () => {
  const current = harness({
    readback: async () => ({
      id: "order-wrong",
      date: 1767225600,
      ref_client: "WRONG",
      socid: 7,
    }),
  });
  const { decision, proposal } = await escalation(current, "binding-order-001");
  const approved = await ownerDecision(current, decision, "APPROVE");
  const envelope = effectEnvelope(decision, proposal, approved.authority);
  await assert.rejects(
    current.gate.execute(localRequest(), envelope),
    /PROVIDER_READBACK_MISMATCH_DENIED/,
  );

  const differentActionDigest = "0".repeat(64);
  current.gate.state.reservations[decision.replayKey].actionDigest = differentActionDigest;
  current.gate.state.consumedAuthorityLeases[approved.authority.leaseId].actionDigest =
    differentActionDigest;
  await assert.rejects(
    current.gate.execute(localRequest(), envelope),
    /REPLAY_KEY_CONFLICT_DENIED/,
  );
  assert.equal(current.mutations(), 1);
});

test("tampered persisted approval and effect stores refuse startup", async () => {
  {
    const current = harness();
    const { decision } = await escalation(current, "store-approval-001");
    await ownerDecision(current, decision, "APPROVE");
    const path = join(current.dir, "approvals.json");
    const value = JSON.parse(readFileSync(path, "utf8"));
    value.decisions[decision.decisionDigest].receipt.outcome = "TAMPERED";
    writeFileSync(path, JSON.stringify(value));
    assert.throws(
      () => harness({ root: current.dir }),
      /OWNER_DECISION_RECEIPT_INVALID_DENIED/,
    );
  }
  {
    const current = harness();
    const { decision, proposal } = await escalation(current, "store-effect-001");
    const approved = await ownerDecision(current, decision, "APPROVE");
    await current.gate.execute(
      localRequest(),
      effectEnvelope(decision, proposal, approved.authority),
    );
    const path = join(current.dir, "effects.json");
    const value = JSON.parse(readFileSync(path, "utf8"));
    value.effects[decision.replayKey].receipt.outcome = "TAMPERED";
    writeFileSync(path, JSON.stringify(value));
    assert.throws(
      () => harness({ root: current.dir }),
      /EFFECT_STORE_INVALID_DENIED/,
    );
  }
});

test("production server wires authenticated owner decision and receipt readback endpoints", () => {
  const server = readFileSync(
    new URL("../demo/runtime/server.mjs", import.meta.url),
    "utf8",
  );
  assert.match(server, /\/api\/demo\/admin-ai\/owner-decision/);
  assert.match(server, /\/api\/demo\/admin-ai\/owner-decision-receipt\?/);
  assert.match(server, /ownerActor: "owner:local-demo"/);
  assert.match(server, /authorizeLocalRequest\(incoming/);
  assert.doesNotMatch(server, /ownerActor: body\./);
  assert.match(server, /\/var\/lib\/chimpmaera\/owner-authority\.key/);
  const dockerfile = readFileSync(
    new URL("../demo/chimpmaera.Dockerfile", import.meta.url),
    "utf8",
  );
  const installer = readFileSync(
    new URL("../demo/install.sh", import.meta.url),
    "utf8",
  );
  for (const source of [dockerfile, installer]) {
    assert.match(source, /authoritative-approval-snapshot\.mjs/);
  }
  const seed = readFileSync(
    new URL("../demo/seed-and-flow.sh", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(seed, /owner[_-]authority|chimp-owner-authority-token/);
  const smoke = readFileSync(
    new URL("../demo/approval-workbench-smoke.sh", import.meta.url),
    "utf8",
  );
  const acceptance = readFileSync(
    new URL("../demo/acceptance.sh", import.meta.url),
    "utf8",
  );
  assert.match(smoke, /OWNER_APPROVED_AUTHORITY_ISSUED/);
  assert.match(smoke, /OWNER_REJECTED_NO_AUTHORITY/);
  assert.match(smoke, /AUTHORITY_LEASE_REPLAY_DENIED/);
  assert.match(smoke, /owner-decision-receipt/);
  assert.match(acceptance, /approval-workbench-smoke\.sh/);
});

test("legacy direct gate retains stale-snapshot denial on ambiguous owner retry", async () => {
  const snapshotRecords = [];
  let reconciliations = 0;
  const current = harness({
    snapshotRecords,
    mutate: async (action) => {
      snapshotRecords.push({ id: 42, date: action.payload.body.date,
        ref_client: action.payload.body.ref_client, socid: action.payload.body.socid });
      throw new Error("SYNTHETIC_RESPONSE_LOSS_AFTER_COMMIT");
    },
    reconcile: async (action) => {
      reconciliations += 1;
      return { providerResult: { id: "order-42" }, readback: {
        id: "order-42", date: action.payload.body.date,
        ref_client: action.payload.body.ref_client, socid: action.payload.body.socid,
      } };
    },
  });
  const { decision, proposal } = await escalation(current, "legacy-stale-snapshot-001");
  const approved = await ownerDecision(current, decision, "APPROVE");
  const envelope = effectEnvelope(decision, proposal, approved.authority);
  await assert.rejects(current.gate.execute(localRequest(), envelope), /SYNTHETIC_RESPONSE_LOSS_AFTER_COMMIT/);
  assert.equal(current.mutations(), 1);
  assert.equal(current.gate.state.reservations[decision.replayKey].status, "AMBIGUOUS");
  await assert.rejects(current.gate.execute(localRequest(), envelope), /APPROVAL_SNAPSHOT_STALE_DENIED/);
  assert.equal(reconciliations, 0);
  assert.equal(current.mutations(), 1);
});
