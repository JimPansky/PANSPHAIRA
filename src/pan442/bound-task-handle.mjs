import { SyntheticMetricReadIssuer, executeSyntheticMetricRead } from "./synthetic-metric-read-task.mjs";
export { SyntheticMetricReadIssuer, syntheticMetricReadOrigin, METRIC_READ_SCHEMA } from "./synthetic-metric-read-task.mjs";
import { mkdtempSync } from "node:fs";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AdminAiPoc } from "../../demo/runtime/admin-ai-poc.mjs";
import { acquireLocalJournalOwner } from "../../demo/runtime/local-journal-owner.mjs";
import { ApprovalWorkbench } from "../../demo/runtime/approval-workbench.mjs";
import {
  createAuthoritativeApprovalSnapshot,
} from "../../demo/runtime/authoritative-approval-snapshot.mjs";
import {
  DemoMutationGate,
  canonicalJson,
  sha256,
} from "../../demo/runtime/enforcement-gate.mjs";

export const BTH_SCHEMA = "pansphaira.contract/bound-task-handle/v1";
export const BTH_SOURCE_SCHEMA = "pansphaira.contract/synthetic-trusted-task-source/v1";
export const BTH_BINDING_SCHEMA = "pansphaira.contract/bound-task-handle-binding/v1";

export const BTH_ERROR = Object.freeze({
  HANDLE_INVALID: "BTH_HANDLE_INVALID_DENIED",
  HANDLE_UNKNOWN: "BTH_HANDLE_UNKNOWN_DENIED",
  HANDLE_TAMPERED: "BTH_HANDLE_TAMPERED_DENIED",
  HANDLE_EXPIRED: "BTH_HANDLE_EXPIRED_DENIED",
  HANDLE_REPLAY: "BTH_HANDLE_REPLAY_DENIED",
  TENANT_MISMATCH: "BTH_TENANT_MISMATCH_DENIED",
  PRINCIPAL_MISMATCH: "BTH_PRINCIPAL_MISMATCH_DENIED",
  RUN_MISMATCH: "BTH_RUN_MISMATCH_DENIED",
  OBJECT_MISMATCH: "BTH_OBJECT_MISMATCH_DENIED",
  VERSION_MISMATCH: "BTH_VERSION_MISMATCH_DENIED",
  AMOUNT_LIMIT: "BTH_AMOUNT_LIMIT_DENIED",
  CURRENCY_MISMATCH: "BTH_CURRENCY_MISMATCH_DENIED",
  COMPOSE_FAILED: "BTH_COMPOSE_FAILED",
  EXECUTE_FAILED: "BTH_EXECUTE_FAILED",
  OPERATION_INVALID: "BTH_OPERATION_INVALID_DENIED",
  TASK_REF_UNKNOWN: "BTH_TASK_REF_UNKNOWN_DENIED",
  TRUSTED_SOURCE_DIGEST_MISMATCH: "BTH_TRUSTED_SOURCE_DIGEST_MISMATCH_DENIED",
  HANDLE_REISSUED: "BTH_HANDLE_REISSUED_DENIED",
  BINDING_UNSUPPORTED: "BTH_BINDING_UNSUPPORTED_DENIED",
  BINDING_DIGEST_MISMATCH: "BTH_BINDING_DIGEST_MISMATCH_DENIED",
});

const OPERATION_KEYS = Object.freeze([
  "currency",
  "declaredAmountMinor",
  "object",
  "objectVersion",
  "runId",
  "tenant",
  "user",
]);
const OPERATION_OBJECT_KEYS = Object.freeze([
  "customerId",
  "entity",
  "operation",
  "orderDateEpoch",
  "provider",
  "refClient",
]);
const STAGES = Object.freeze([
  "OPERATION",
  "HANDLE_INVALID",
  "LOOKUP",
  "SIGNATURE",
  "EXPIRY",
  "TENANT",
  "PRINCIPAL",
  "RUN",
  "OBJECT",
  "VERSION",
  "LIMITS",
  "SUPPORTED",
  "COMPOSE",
  "EXECUTE",
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, code) {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || canonicalJson(Object.keys(value).sort())
      !== canonicalJson([...expected].sort())
  ) throw new Error(code);
}

function isHex(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isBase64Url(value) {
  return typeof value === "string" && value.length >= 8 && /^[A-Za-z0-9_-]+$/.test(value);
}

function fail(code, stage) {
  const error = new Error(code);
  error.name = "BoundTaskHandleError";
  error.stage = stage;
  throw error;
}

function deepFreeze(value) {
  if (isRecord(value) || Array.isArray(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return Object.freeze(value);
}

/**
 * Synthetic trusted task source.
 *
 * This is a clearly labelled LOCAL_SYNTHETIC in-process source of trusted
 * task bindings. It is NOT a live identity-provider claim: no assertion
 * exchange, no token, no network. Model or caller text cannot add, edit or
 * approve entries here; the issuer reads this source at creation time only.
 */
export function createSyntheticTrustedTaskSource({
  principal,
  tasks,
  trustLabel = "LOCAL_SYNTHETIC",
}) {
  if (
    !isRecord(principal)
    || typeof principal.user !== "string"
    || principal.user.length < 1
    || typeof principal.tenant !== "string"
    || principal.tenant.length < 1
  ) throw new Error("BTH_TRUSTED_SOURCE_INVALID_DENIED");
  if (!Array.isArray(tasks) || tasks.length < 1) {
    throw new Error("BTH_TRUSTED_SOURCE_INVALID_DENIED");
  }
  for (const task of tasks) {
    if (
      !isRecord(task)
      || typeof task.taskRef !== "string"
      || task.taskRef.length < 8
      || typeof task.runId !== "string"
      || task.runId.length < 8
      || task.tenant !== principal.tenant
      || task.user !== principal.user
      || !isRecord(task.object)
      || typeof task.object.provider !== "string"
      || typeof task.object.entity !== "string"
      || typeof task.object.operation !== "string"
      || typeof task.object.refClient !== "string"
      || !Number.isSafeInteger(task.object.customerId)
      || !Number.isSafeInteger(task.object.orderDateEpoch)
      || typeof task.objectVersion !== "number"
      || !Number.isSafeInteger(task.objectVersion)
      || task.objectVersion < 1
      || typeof task.purpose !== "string"
      || !Number.isSafeInteger(task.amountLimitMinor)
      || task.amountLimitMinor < 0
      || typeof task.currency !== "string"
      || !/^[A-Z]{3}$/.test(task.currency)
      || !Number.isSafeInteger(task.ttlMs)
      || task.ttlMs < 1
    ) throw new Error("BTH_TRUSTED_SOURCE_INVALID_DENIED");
  }
  const source = {
    schemaVersion: BTH_SOURCE_SCHEMA,
    trustLabel,
    principal: { user: principal.user, tenant: principal.tenant },
    tasks: tasks.map((task) => ({ ...task })),
  };
  // The digest covers only the attested content; it is excluded from its own
  // input (fixed point), and the lookup map is not part of the source.
  const { sourceDigest: _unused, ...digestInput } = source;
  source.sourceDigest = sha256(canonicalJson(digestInput));
  const byTaskRef = new Map(source.tasks.map((task) => [task.taskRef, task]));
  return deepFreeze({ ...source, byTaskRef });
}

/** Attested digest of a trusted source (content minus lookup map). */
function trustedSourceDigest(taskSource) {
  const { byTaskRef: _unused, sourceDigest: _unusedDigest, ...content } = taskSource;
  return sha256(canonicalJson(content));
}

/**
 * Server-side issuer. It is the only component allowed to read the trusted
 * task source. Bindings are created once, frozen, stored by handle digest and
 * never derived from caller payloads afterwards.
 */
export class BoundTaskHandleIssuer {
  #taskIndex;
  constructor({ taskSource, secret, now }) {
    if (
      !isRecord(taskSource)
      || taskSource.schemaVersion !== BTH_SOURCE_SCHEMA
      || !isHex(taskSource.sourceDigest)
      || !Number.isSafeInteger(now())
    ) throw new Error("BTH_ISSUER_INIT_INVALID_DENIED");
    if (typeof secret !== "string" || secret.length < 16) {
      throw new Error("BTH_ISSUER_SECRET_INVALID_DENIED");
    }
    this.now = now;
    this.secret = secret;
    this.secretFingerprint = sha256(`bth-secret-fingerprint:v1:${secret}`);
    this.taskSource = deepFreeze(taskSource);
    // F2: the authoritative lookup is a PRIVATE index built only from the
    // digest-attested `tasks` array. The public `byTaskRef` Map on the source
    // is NOT read as authority: it is digest-excluded, mutable and would
    // otherwise let a caller swap an unattested task into an issued binding.
    this.#taskIndex = new Map(
      deepFreeze(taskSource).tasks.map((task) => [task.taskRef, task]),
    );
    this.store = new Map();
    this.observations = [];
    Object.freeze(this);
  }

  createHandle({ taskRef }) {
    if (typeof taskRef !== "string") fail("BTH_TRUSTED_SOURCE_INVALID_DENIED", "COMPOSE");
    if (trustedSourceDigest(this.taskSource) !== this.taskSource.sourceDigest) {
      fail(BTH_ERROR.TRUSTED_SOURCE_DIGEST_MISMATCH, "COMPOSE");
    }
    // F2: read the task from the private, digest-attested index. A `.set()` on
    // the public `byTaskRef` map cannot substitute the task the binding is
    // derived from, because that map is never consulted here.
    const task = this.#taskIndex.get(taskRef);
    if (task === undefined) fail(BTH_ERROR.TASK_REF_UNKNOWN, "COMPOSE");
    const issuedAtMs = this.now();
    const binding = {
      schemaVersion: BTH_BINDING_SCHEMA,
      taskRef: task.taskRef,
      runId: task.runId,
      tenant: task.tenant,
      user: task.user,
      object: {
        provider: task.object.provider,
        entity: task.object.entity,
        operation: task.object.operation,
        refClient: task.object.refClient,
        customerId: task.object.customerId,
        orderDateEpoch: task.object.orderDateEpoch,
      },
      objectVersion: task.objectVersion,
      purpose: task.purpose,
      amountLimitMinor: task.amountLimitMinor,
      currency: task.currency,
      issuedAtMs,
      expiresAtMs: issuedAtMs + task.ttlMs,
      sourceDigest: this.taskSource.sourceDigest,
      principalDigest: sha256(canonicalJson(this.taskSource.principal)),
      secretFingerprint: this.secretFingerprint,
    };
    const digest = sha256(canonicalJson(binding));
    const signature = sha256(this.secret + digest);
    binding.handleDigest = digest;
    const frozenBinding = deepFreeze(binding);
    const handle = Buffer.from(
      canonicalJson({ v: 1, d: digest, s: signature }),
      "utf8",
    ).toString("base64url");
    if (this.store.has(digest)) fail(BTH_ERROR.HANDLE_REISSUED, "COMPOSE");
    this.store.set(digest, { binding: frozenBinding, used: false });
    return { handle, handleDigest: digest, binding: frozenBinding };
  }

  /**
   * Separately retained observed result. Written by the resolver after a
   * successful execution; it pins the approved owner identity and the exact
   * receipt/lease digests independently of any caller payload.
   */
  observe(record) {
    if (!isRecord(record) || record.schemaVersion !== BTH_SCHEMA) {
      throw new Error("BTH_OBSERVED_RECORD_INVALID_DENIED");
    }
    this.observations.push(deepFreeze({ ...record, observedAtMs: this.now() }));
    return this.observations.at(-1);
  }
}

/**
 * Local business operation seam. Composes the accepted demo Order journey:
 * AdminAiPoc decides (SYNTHETIC_DOLIBARR_ORDER_CREATE -> OWNER_ESCALATION),
 * the ApprovalWorkbench registers and the local owner approves, and the
 * DemoMutationGate executes exactly once under the owner-escalation lease.
 * This is the real business seam; nothing here bypasses approval, lease,
 * policy or reservation semantics.
 */
export function createLocalBusinessOperation({ provider, now, root }) {
  const dir = root ?? mkdtempSync(join(tmpdir(), "cm-pan442-"));
  const apiToken = "a".repeat(48);
  const controlToken = "b".repeat(48);
  const ownerAuthorityToken = "c".repeat(48);
  const expectedOrigin = "http://127.0.0.1:7781";
  const policyBytes = readFileSync(
    new URL("../../demo/manifests/authority/admin-ai-poc-policy-v1.json", import.meta.url),
  );
  const policy = JSON.parse(policyBytes.toString("utf8"));
  const policyDigest = sha256(policyBytes);
  const authorityContext = {
    profileId: "SAFE_GUIDED",
    profileGeneration: "pan442-handled-task-0001",
    policyGeneration: 1,
  };
  const gate = new DemoMutationGate({
    apiToken,
    controlToken,
    ownerAuthorityToken,
    expectedOrigin,
    receiptPath: join(dir, "effects.json"),
    provider,
    adminAiPolicyDigest: policyDigest,
    now,
    authorityContext,
    assertPolicyUse: () => true,
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
    now,
    leaseTtlMs: 30_000,
    policyDigest,
    policyGeneration: authorityContext.policyGeneration,
    profileId: authorityContext.profileId,
    profileGeneration: authorityContext.profileGeneration,
  });
  const localRequest = {
    headers: {
      authorization: `Bearer ${apiToken}`,
      host: "127.0.0.1:7781",
      origin: expectedOrigin,
      "x-cm-csrf": "chimpmaera-local-v1",
    },
  };
  async function execute(binding) {
    const replaySuffix = binding.handleDigest.slice(0, 40);
    const decision = poc.decide({
      schemaVersion: "chimpmaera.demo/admin-ai-request/v1",
      actor: "agent:admin-ai-poc",
      requestKind: "SYNTHETIC_DOLIBARR_ORDER_CREATE",
      replayKey: `admin-ai:poc:order:pan442:${replaySuffix}`,
    }).decision;
    if (decision.outcome !== "OWNER_ESCALATION") {
      fail("BTH_COMPOSE_FAILED", "COMPOSE");
    }
    const proposal = await workbench.register(decision);
    const approved = await workbench.decide({
      decisionDigest: decision.decisionDigest,
      ownerDecision: "APPROVE",
      ownerActor: "owner:local-demo",
    });
    if (approved.status !== "PASS") fail("BTH_COMPOSE_FAILED", "COMPOSE");
    const result = await gate.execute(
      localRequest,
      {
        action: decision.action,
        actionDigest: decision.actionDigest,
        businessDiff: proposal.businessDiff,
        businessDiffDigest: proposal.businessDiffDigest,
        authority: approved.authority,
      },
    );
    if (result.status !== "PASS") fail("BTH_EXECUTE_FAILED", "EXECUTE");
    return { result, decision, proposal, authority: approved.authority };
  }
  return { execute, gate, workbench, poc, dir };
}

/**
 * Trusted resolver. The caller supplies only the opaque handle and the
 * allowed operation input. Every trusted field is re-read from the immutable
 * issuer store; caller-supplied source, digest or binding fields are rejected
 * by the exact-key check before any comparison.
 */
export function createOwnedSyntheticBusinessOperation({ provider, now, root }) {
  if (typeof root !== "string" || !root.split(/[\\/]+/).includes("pan453-owned-v2"))
    throw new Error("JOURNAL_OWNED_NAMESPACE_REQUIRED_DENIED");
  const dir = root ?? mkdtempSync(join(tmpdir(), "cm-pan442-"));
  const apiToken = "a".repeat(48);
  const controlToken = "b".repeat(48);
  const ownerAuthorityToken = "c".repeat(48);
  const expectedOrigin = "http://127.0.0.1:7781";
  const policyBytes = readFileSync(
    new URL("../../demo/manifests/authority/admin-ai-poc-policy-v1.json", import.meta.url),
  );
  const policy = JSON.parse(policyBytes.toString("utf8"));
  const policyDigest = sha256(policyBytes);
  const authorityContext = {
    profileId: "SAFE_GUIDED",
    profileGeneration: "pan442-handled-task-0001",
    policyGeneration: 1,
  };
  let runtime;
  function freshRuntime(journalOwner) {
    const gate = new DemoMutationGate({
      apiToken,
      controlToken,
      ownerAuthorityToken,
      expectedOrigin,
      receiptPath: join(dir, "effects.json"),
      journalOwner,
      provider,
      adminAiPolicyDigest: policyDigest,
      now,
      authorityContext,
      assertPolicyUse: () => true,
    });
    const poc = new AdminAiPoc({
      policy,
      policyDigest,
      signAuthority: (fields) => gate.agentAuthority(fields),
    });
    const workbench = new ApprovalWorkbench({
      receiptPath: join(dir, "approvals.json"),
      journalOwner,
      issueAuthority: (fields) => gate.ownerAuthority(fields),
      readAuthoritativeSnapshot: (action) => provider.readAuthoritativeSnapshot(action),
      now,
      leaseTtlMs: 30_000,
      policyDigest,
      policyGeneration: authorityContext.policyGeneration,
      profileId: authorityContext.profileId,
      profileGeneration: authorityContext.profileGeneration,
    });
    return { gate, workbench, poc };
  }
  const localRequest = {
    headers: {
      authorization: `Bearer ${apiToken}`,
      host: "127.0.0.1:7781",
      origin: expectedOrigin,
      "x-cm-csrf": "chimpmaera-local-v1",
    },
  };
  async function execute(binding) {
    // A module-private token binds both journal readers and all writes to the
    // same local synthetic owner. Crash retention is fail-closed, not takeover.
    let owner;
    try { owner = acquireLocalJournalOwner(dir); }
    catch (error) {
      if (error?.message === "BTH_JOURNAL_FENCED_DENIED") fail(error.message, "COMPOSE");
      throw error;
    }
    try {
      runtime = freshRuntime(owner.token);
      const { gate, workbench, poc } = runtime;
    const replaySuffix = binding.handleDigest.slice(0, 40);
    const decision = poc.decide({
      schemaVersion: "chimpmaera.demo/admin-ai-request/v1",
      actor: "agent:admin-ai-poc",
      requestKind: "SYNTHETIC_DOLIBARR_ORDER_CREATE",
      replayKey: `admin-ai:poc:order:pan442:${replaySuffix}`,
    }).decision;
    if (decision.outcome !== "OWNER_ESCALATION") {
      fail("BTH_COMPOSE_FAILED", "COMPOSE");
    }
    // A response may be lost AFTER the provider committed. A fresh snapshot then
    // shows the target and rightly prevents a NEW approval. Recover only from
    // the independently persisted approved decision AND matching AMBIGUOUS
    // reservation; never treat caller input or target presence as approval.
    const reservation = gate.state.reservations[decision.action.replayKey];
    if (reservation?.status === "AMBIGUOUS") {
      const proposal = workbench.state.proposals[decision.decisionDigest];
      const prior = workbench.state.decisions[decision.decisionDigest];
      if (
        proposal?.actionDigest !== decision.actionDigest
        || proposal?.decisionDigest !== decision.decisionDigest
        || prior?.receipt?.ownerDecision !== "APPROVE"
        || prior.receipt.decisionDigest !== decision.decisionDigest
        || prior.receipt.proposalDigest !== proposal.proposalDigest
        || prior.authority?.leaseId !== reservation.leaseId
        || prior.authority?.actionDigest !== reservation.actionDigest
        || reservation.actionDigest !== decision.actionDigest
        || reservation.authorityKind !== "OWNER_ESCALATION_LEASE_HMAC_V1"
        || reservation.authorityBinding !== prior.authority.leaseId
        || reservation.recovery !== "RECONCILE"
      ) fail("BTH_RECOVERY_AUTHORITY_DENIED", "COMPOSE");
      // The gate rechecks the signed lease and reservation, then permits ONLY
      // read-only reconciliation. No new register/decision/mutation is called.
      const result = await gate.execute(localRequest, {
        action: decision.action,
        actionDigest: decision.actionDigest,
        businessDiff: proposal.businessDiff,
        businessDiffDigest: proposal.businessDiffDigest,
        authority: prior.authority,
      });
      if (result.status !== "PASS" || result.replayState !== "RECONCILE_NO_DUPLICATE") {
        fail("BTH_RECOVERY_NOT_CONFIRMED", "COMPOSE");
      }
      return { result, decision, proposal, authority: prior.authority };
    }
    const proposal = await workbench.register(decision);
    const approved = await workbench.decide({
      decisionDigest: decision.decisionDigest,
      ownerDecision: "APPROVE",
      ownerActor: "owner:local-demo",
    });
    if (approved.status !== "PASS") fail("BTH_COMPOSE_FAILED", "COMPOSE");
    const result = await gate.execute(
      localRequest,
      {
        action: decision.action,
        actionDigest: decision.actionDigest,
        businessDiff: proposal.businessDiff,
        businessDiffDigest: proposal.businessDiffDigest,
        authority: approved.authority,
      },
    );
    if (result.status !== "PASS") fail("BTH_EXECUTE_FAILED", "EXECUTE");
    return { result, decision, proposal, authority: approved.authority };
    } finally {
      owner.release();
    }
  }
  return { execute, get gate() { return runtime?.gate; },
    get workbench() { return runtime?.workbench; },
    get poc() { return runtime?.poc; }, dir };
}

/**
 * Trusted resolver. The caller supplies only the opaque handle and the
 * allowed operation input. Every trusted field is re-read from the immutable
 * issuer store; caller-supplied source, digest or binding fields are rejected
 * by the exact-key check before any comparison.
 */
export class BoundTaskHandleResolver {
  constructor({ issuer, operation, now }) {
    if (!isRecord(issuer) || (typeof issuer.createHandle !== "function" && !(issuer instanceof SyntheticMetricReadIssuer))) {
      throw new Error("BTH_RESOLVER_INIT_INVALID_DENIED");
    }
    if (!isRecord(operation) || (issuer instanceof SyntheticMetricReadIssuer
      ? typeof operation.read !== "function" || Object.keys(operation).sort().join("|") !== "read"
      : typeof operation.execute !== "function")) {
      throw new Error("BTH_RESOLVER_INIT_INVALID_DENIED");
    }
    this.issuer = issuer;
    this.operation = operation;
    this.now = now ?? issuer.now;
  }

  use({ handle, operationInput }) {
    if (this.issuer instanceof SyntheticMetricReadIssuer) return this.issuer.resolve({ handle, request: operationInput }).task;
    const stage = (name) => fail(this.#codeFor(name), name);

    let entry;
    try {
      exactKeys(operationInput, OPERATION_KEYS, BTH_ERROR.OPERATION_INVALID);
      exactKeys(operationInput.object, OPERATION_OBJECT_KEYS, BTH_ERROR.OPERATION_INVALID);
    } catch (error) {
      if (error.message === BTH_ERROR.OPERATION_INVALID) stage("OPERATION");
      throw error;
    }
    let parsed;
    try {
      if (!isBase64Url(handle)) fail(BTH_ERROR.HANDLE_INVALID, "HANDLE_INVALID");
      const decoded = JSON.parse(Buffer.from(handle, "base64url").toString("utf8"));
      if (
        !isRecord(decoded)
        || canonicalJson(Object.keys(decoded).sort()) !== canonicalJson(["d", "s", "v"])
        || decoded.v !== 1
        || !isHex(decoded.d)
        || !isHex(decoded.s)
      ) fail(BTH_ERROR.HANDLE_INVALID, "HANDLE_INVALID");
      parsed = decoded;
    } catch (error) {
      if (error.message === BTH_ERROR.HANDLE_INVALID) throw error;
      fail(BTH_ERROR.HANDLE_INVALID, "HANDLE_INVALID");
    }
    entry = this.issuer.store.get(parsed.d);
    if (entry === undefined) fail(BTH_ERROR.HANDLE_UNKNOWN, "LOOKUP");
    if (entry.used) fail(BTH_ERROR.HANDLE_REPLAY, "EXECUTE");
    const expectedSignature = sha256(this.issuer.secret + parsed.d);
    if (expectedSignature !== parsed.s) fail(BTH_ERROR.HANDLE_TAMPERED, "SIGNATURE");
    const binding = entry.binding;
    // F3: recompute the canonical digest of the stored binding (excluding its
    // own handleDigest field) and require it to equal the signed handle
    // digest. Replacing the stored binding or its wrapper therefore changes the
    // recomputed digest and fails closed before any field comparison, snapshot
    // or effect, even though the handle signature still validates.
    const { handleDigest: _unused, ...bindingContent } = binding;
    if (sha256(canonicalJson(bindingContent)) !== parsed.d) {
      fail(BTH_ERROR.BINDING_DIGEST_MISMATCH, "SIGNATURE");
    }
    if (this.now() >= binding.expiresAtMs) fail(BTH_ERROR.HANDLE_EXPIRED, "EXPIRY");
    if (operationInput.tenant !== binding.tenant) {
      fail(BTH_ERROR.TENANT_MISMATCH, "TENANT");
    }
    if (operationInput.user !== binding.user) {
      fail(BTH_ERROR.PRINCIPAL_MISMATCH, "PRINCIPAL");
    }
    if (operationInput.runId !== binding.runId) {
      fail(BTH_ERROR.RUN_MISMATCH, "RUN");
    }
    const o = operationInput.object;
    if (
      o.provider !== binding.object.provider
      || o.entity !== binding.object.entity
      || o.operation !== binding.object.operation
      || o.refClient !== binding.object.refClient
      || o.customerId !== binding.object.customerId
      || o.orderDateEpoch !== binding.object.orderDateEpoch
    ) fail(BTH_ERROR.OBJECT_MISMATCH, "OBJECT");
    if (operationInput.objectVersion !== binding.objectVersion) {
      fail(BTH_ERROR.VERSION_MISMATCH, "VERSION");
    }
    if (operationInput.currency !== binding.currency) {
      fail(BTH_ERROR.CURRENCY_MISMATCH, "LIMITS");
    }
    if (
      !Number.isSafeInteger(operationInput.declaredAmountMinor)
      || operationInput.declaredAmountMinor < 0
      || operationInput.declaredAmountMinor > binding.amountLimitMinor
    ) fail(BTH_ERROR.AMOUNT_LIMIT, "LIMITS");
    // F1: this adapter is explicitly SINGLE-FIXTURE. The accepted demo Order
    // seam executes the fixed synthetic Order described by
    // SUPPORTED_ORDER_BINDING. A bound task whose business scope differs is
    // denied at the SUPPORTED stage, before any snapshot, approval, lease or
    // provider effect, so the executed Order can never be unrelated to the
    // resolved task.
    const b = binding;
    const sup = SUPPORTED_ORDER_BINDING;
    if (
      b.tenant !== sup.tenant
      || b.object.provider !== sup.provider
      || b.object.entity !== sup.entity
      || b.object.operation !== sup.operation
      || b.object.refClient !== sup.refClient
      || b.object.customerId !== sup.customerId
      || b.object.orderDateEpoch !== sup.orderDateEpoch
      || b.purpose !== sup.purpose
      || b.currency !== sup.currency
    ) fail(BTH_ERROR.BINDING_UNSUPPORTED, "SUPPORTED");
    return binding;
  }

  #codeFor(stage) {
    const codes = {
      OPERATION: BTH_ERROR.OPERATION_INVALID,
      HANDLE_INVALID: BTH_ERROR.HANDLE_INVALID,
      LOOKUP: BTH_ERROR.HANDLE_UNKNOWN,
      SIGNATURE: BTH_ERROR.HANDLE_TAMPERED,
      EXPIRY: BTH_ERROR.HANDLE_EXPIRED,
      TENANT: BTH_ERROR.TENANT_MISMATCH,
      PRINCIPAL: BTH_ERROR.PRINCIPAL_MISMATCH,
      RUN: BTH_ERROR.RUN_MISMATCH,
      OBJECT: BTH_ERROR.OBJECT_MISMATCH,
      VERSION: BTH_ERROR.VERSION_MISMATCH,
      LIMITS: BTH_ERROR.AMOUNT_LIMIT,
      SUPPORTED: BTH_ERROR.BINDING_UNSUPPORTED,
      COMPOSE: BTH_ERROR.COMPOSE_FAILED,
      EXECUTE: BTH_ERROR.EXECUTE_FAILED,
    };
    return codes[stage] ?? BTH_ERROR.HANDLE_INVALID;
  }
}

/**
 * Real local entry point: resolve a handle, verify every use-time binding,
 * compose the accepted Order business seam, execute once, and retain the
 * observed result separately in the issuer journal.
 */
export async function useBoundTaskHandle({ issuer, handle, operationInput, operation }) {
  if (issuer instanceof SyntheticMetricReadIssuer) {
    const resolver = new BoundTaskHandleResolver({ issuer, operation });
    resolver.use({ handle, operationInput });
    return executeSyntheticMetricRead({ issuer, handle, request: operationInput, operation });
  }
  const resolver = new BoundTaskHandleResolver({ issuer, operation, now: issuer.now });
  let binding;
  try {
    binding = resolver.use({ handle, operationInput });
  } catch (error) {
    if (error.name === "BoundTaskHandleError") throw error;
    fail(BTH_ERROR.EXECUTE_FAILED, "EXECUTE");
  }
  let composed;
  try {
    composed = await operation.execute(binding);
  } catch (error) {
    if (error.name === "BoundTaskHandleError") throw error;
    fail(BTH_ERROR.COMPOSE_FAILED, "COMPOSE");
  }
  const { result, decision, proposal, authority } = composed;
  issuer.store.get(binding.handleDigest).used = true;
  const observed = issuer.observe({
    schemaVersion: BTH_SCHEMA,
    taskRef: binding.taskRef,
    runId: binding.runId,
    handleDigest: binding.handleDigest,
    stage: "EXECUTE",
    status: "PASS",
    approvedOwnerActor: "owner:local-demo",
    approvedPrincipalDigest: sha256(canonicalJson("owner:local-demo")),
    leaseId: authority.leaseId,
    authorityDigest: sha256(canonicalJson(authority)),
    receiptDigest: result.receipt.receiptDigest,
    businessDiffDigest: proposal.businessDiffDigest,
    snapshotDigest: proposal.snapshotDigest,
    decisionDigest: decision.decisionDigest,
  });
  return {
    status: "PASS",
    stage: "EXECUTE",
    binding,
    result,
    proposal,
    authority,
    decision,
    observed,
  };
}

/**
 * The complete business scope the accepted demo Order seam (AdminAiPoc
 * SYNTHETIC_DOLIBARR_ORDER_CREATE -> the fixed synthetic Order) actually
 * executes. This adapter is explicitly SINGLE-FIXTURE: a bound task whose
 * scope differs from this is denied at the SUPPORTED stage before any
 * snapshot, approval, lease or provider effect, so the executed Order can
 * never be unrelated to the resolved task (F1).
 */
export const SUPPORTED_ORDER_BINDING = Object.freeze({
  tenant: "panskys-zoo-demo",
  provider: "dolibarr",
  entity: "Order",
  operation: "CREATE_IF_ABSENT",
  refClient: "CM-ADMIN-AI-ESCALATION-001",
  customerId: 7,
  orderDateEpoch: 1767225600,
  purpose: "CREATE_SYNTHETIC_SALES_ORDER",
  currency: "EUR",
});

export const BTH_STAGES = STAGES;
