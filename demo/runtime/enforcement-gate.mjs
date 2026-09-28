import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
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
import {
  assertLocalJournalOwner,
  isOwnedSyntheticPath,
  readLocalJournalControl,
  recordLocalJournalRecoveryAttempt,
} from "./local-journal-owner.mjs";
import {
  APPROVAL_PURPOSE,
  APPROVAL_REQUESTER,
  createAuthoritativeApprovalSnapshot,
  validateAuthoritativeApprovalSnapshot,
} from "./authoritative-approval-snapshot.mjs";

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeOperationKey(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("OPERATION_KEY_INVALID_DENIED");
  }
  return value.normalize("NFC");
}

// PAN453 AC04: bind the durable stop/revoke control to the exact source and
// target identity of the observed mutation, so a stop issued for one
// source/target pair never blocks or releases an unrelated operation.
function mutationSourceIdentity(action) {
  return `${action.scope.tenant}|${action.actor}`;
}

function mutationTargetIdentity(action) {
  const body = action.payload?.body ?? {};
  const reference = String(body.ref_client ?? body.emailAddress ?? "");
  return `${action.scope.provider}|${action.scope.entity}|${reference}`;
}

function equalSecret(presented, expected) {
  const left = Buffer.from(presented ?? "");
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function authorizeLocalRequest(request, {
  apiToken,
  expectedOrigin,
  requireCsrf = true,
}) {
  const bearer = request.headers.authorization?.replace(/^Bearer /, "") ?? "";
  if (!equalSecret(bearer, apiToken)) throw new Error("AUTHENTICATION_REQUIRED");
  if (request.headers.origin !== expectedOrigin) {
    throw new Error("SAME_ORIGIN_REQUIRED");
  }
  if (request.headers.host !== new URL(expectedOrigin).host) {
    throw new Error("CANONICAL_HOST_REQUIRED");
  }
  if (requireCsrf && request.headers["x-cm-csrf"] !== "chimpmaera-local-v1") {
    throw new Error("CSRF_TOKEN_REQUIRED");
  }
}

function validateActionShape(action) {
  if (action === null || typeof action !== "object" || Array.isArray(action)) {
    throw new Error("ACTION_INVALID");
  }
  const allowedTop = ["actionType", "actor", "payload", "replayKey", "scope"];
  if (
    JSON.stringify(Object.keys(action).sort()) !== JSON.stringify(allowedTop)
    || action.actionType !== "PROVIDER_MUTATION"
    || !["installer:seed-and-flow", "agent:admin-ai-poc"].includes(action.actor)
    || typeof action.replayKey !== "string"
    || !/^[a-zA-Z0-9:._-]{8,180}$/.test(action.replayKey)
    || action.scope === null
    || typeof action.scope !== "object"
    || Array.isArray(action.scope)
    || action.payload === null
    || typeof action.payload !== "object"
    || Array.isArray(action.payload)
  ) throw new Error("UNKNOWN_ACTION_DENIED");
}

function validateAdminAiAction(action, authorityKind) {
  const contact = {
    actionType: "PROVIDER_MUTATION",
    actor: "agent:admin-ai-poc",
    payload: {
      body: {
        description: "PanSphaira Admin AI deterministic PoC contact",
        emailAddress: "admin-ai-poc@example.invalid",
        firstName: "Avery",
        lastName: "Admin AI PoC",
      },
      method: "POST",
      path: "/Contact",
    },
    replayKey: action.replayKey,
    scope: {
      actor: "agent:admin-ai-poc",
      entity: "Contact",
      operation: "CREATE_IF_ABSENT",
      provider: "espocrm",
      tenant: "panskys-zoo-demo",
    },
  };
  const order = {
    actionType: "PROVIDER_MUTATION",
    actor: "agent:admin-ai-poc",
    payload: {
      body: {
        date: 1767225600,
        ref_client: "CM-ADMIN-AI-ESCALATION-001",
        socid: 7,
      },
      method: "POST",
      path: "/orders",
    },
    replayKey: action.replayKey,
    scope: {
      actor: "agent:admin-ai-poc",
      entity: "Order",
      operation: "CREATE_IF_ABSENT",
      provider: "dolibarr",
      tenant: "panskys-zoo-demo",
    },
  };
  const expected = authorityKind === "ADMIN_AI_POC_HMAC_V1"
    ? contact
    : authorityKind === "OWNER_ESCALATION_LEASE_HMAC_V1"
      ? order
      : null;
  if (
    !/^admin-ai:poc:[a-zA-Z0-9:._-]{8,140}$/.test(action.replayKey)
    || expected === null
    || canonicalJson(action) !== canonicalJson(expected)
  ) throw new Error("AGENT_ACTION_SCOPE_DENIED");
}

function validateMutationScope(action) {
  const { scope, payload } = action;
  if (
    scope.tenant !== "panskys-zoo-demo"
    || payload.method !== "POST"
    || typeof payload.path !== "string"
    || payload.body === null
    || typeof payload.body !== "object"
    || Array.isArray(payload.body)
  ) throw new Error("SCOPE_MISMATCH_DENIED");

  const allowed = scope.provider === "espocrm"
    ? {
      Account: /^\/Account$/,
      Contact: /^\/Contact$/,
      Opportunity: /^\/Opportunity$/,
    }[scope.entity]
    : scope.provider === "dolibarr"
      ? {
        ThirdParty: /^\/thirdparties$/,
        Order: /^\/orders$/,
        OrderLine: /^\/orders\/[1-9][0-9]*\/lines$/,
      }[scope.entity]
      : undefined;
  if (
    allowed === undefined
    || scope.operation !== "CREATE_IF_ABSENT"
    || !allowed.test(payload.path)
  ) throw new Error("SCOPE_MISMATCH_DENIED");
}

function receiptCore(action, actionDigest, providerResult, readback, authority, replayState = "FIRST_EXECUTION") {
  return {
    schemaVersion: authority?.kind === "OWNER_ESCALATION_LEASE_HMAC_V1"
      ? "chimpmaera.demo/effect-receipt/v3"
      : authority === undefined
        ? "chimpmaera.demo/effect-receipt/v1"
        : "chimpmaera.demo/effect-receipt/v2",
    actionDigest,
    actor: action.actor,
    scope: action.scope,
    replayKey: action.replayKey,
    provider: {
      objectType: action.scope.entity,
      objectReference: String(
        readback?.id ?? providerResult?.id ?? providerResult,
      ),
    },
    outcome: "PROVIDER_MUTATION_READBACK_VERIFIED",
    replayState,
    readbackDigest: sha256(canonicalJson(readback)),
    ...(authority === undefined ? {} : {
      authority: {
        kind: authority.kind,
        policyId: authority.policyId,
        policyGeneration: authority.policyGeneration,
        ...(authority.leaseId === undefined ? {} : {
          leaseId: authority.leaseId,
          expiresAtMs: authority.expiresAtMs,
          maxUses: authority.maxUses,
        }),
      },
      decisionDigest: authority.decisionDigest,
      policyId: authority.policyId,
      policyGeneration: authority.policyGeneration,
      policyDigest: authority.policyDigest,
      ...(authority.ownerDecisionReceiptDigest === undefined ? {} : {
        ownerDecisionReceiptDigest: authority.ownerDecisionReceiptDigest,
        businessDiffDigest: authority.businessDiffDigest,
        snapshotDigest: authority.snapshotDigest,
        snapshotVersion: authority.snapshotVersion,
        requester: authority.requester,
        purpose: authority.purpose,
        profileId: authority.profileId,
        profileGeneration: authority.profileGeneration,
      }),
    }),
  };
}

function validateSemanticReadback(action, readback) {
  if (action.actor !== "agent:admin-ai-poc") return;
  if (action.scope.provider === "espocrm") {
    for (const field of ["description", "emailAddress", "firstName", "lastName"]) {
      if (readback[field] !== action.payload.body[field]) {
        throw new Error("PROVIDER_READBACK_MISMATCH_DENIED");
      }
    }
    return;
  }
  if (
    String(readback.ref_client ?? "") !== action.payload.body.ref_client
    || Number(readback.socid) !== action.payload.body.socid
    || Number(readback.date) !== action.payload.body.date
  ) throw new Error("PROVIDER_READBACK_MISMATCH_DENIED");
}

function normalizeEffectStore(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("EFFECT_STORE_INVALID_DENIED");
  }
  const keys = Object.keys(value).sort();
  const isV1 = value.schemaVersion === "chimpmaera.demo/effect-store/v1"
    && canonicalJson(keys) === canonicalJson(["effects", "schemaVersion"]);
  const isV2 = value.schemaVersion === "chimpmaera.demo/effect-store/v2"
    && canonicalJson(keys) === canonicalJson([
      "consumedAuthorityLeases",
      "effects",
      "reservations",
      "schemaVersion",
    ]);
  const isV3 = value.schemaVersion === "chimpmaera.demo/effect-store/v3"
    && canonicalJson(keys) === canonicalJson([
      "consumedAuthorityLeases",
      "effects",
      "reservations",
      "schemaVersion",
    ]);
  const isV4 = value.schemaVersion === "chimpmaera.demo/effect-store/v4"
    && canonicalJson(keys) === canonicalJson([
      "consumedAuthorityLeases",
      "effects",
      "reservations",
      "schemaVersion",
    ]);
  if (!isV1 && !isV2 && !isV3 && !isV4) throw new Error("EFFECT_STORE_INVALID_DENIED");
  for (const collection of [
    value.effects,
    ...(isV2 || isV3 || isV4 ? [value.reservations, value.consumedAuthorityLeases] : []),
  ]) {
    if (collection === null || typeof collection !== "object" || Array.isArray(collection)) {
      throw new Error("EFFECT_STORE_INVALID_DENIED");
    }
  }
  for (const [replayKey, record] of Object.entries(value.effects)) {
    if (
      record === null
      || typeof record !== "object"
      || Array.isArray(record)
      || canonicalJson(Object.keys(record).sort())
        !== canonicalJson(["actionDigest", "providerResult", "readback", "receipt"])
      || record.receipt?.replayKey !== replayKey
      || record.receipt?.actionDigest !== record.actionDigest
    ) throw new Error("EFFECT_STORE_INVALID_DENIED");
    const { receiptDigest, ...core } = record.receipt;
    if (
      !/^[a-f0-9]{64}$/.test(receiptDigest ?? "")
      || sha256(canonicalJson(core)) !== receiptDigest
    ) throw new Error("EFFECT_STORE_INVALID_DENIED");
  }
  if (isV2) {
    for (const [replayKey, record] of Object.entries(value.reservations)) {
      if (
        record === null
        || typeof record !== "object"
        || Array.isArray(record)
        || canonicalJson(Object.keys(record).sort()) !== canonicalJson([
          "actionDigest", "leaseId", "reservedAtMs", "status",
        ])
        || !["EXECUTING", "APPLIED", "AMBIGUOUS"].includes(record.status)
        || !/^[a-f0-9]{64}$/.test(record.actionDigest ?? "")
        || !/^[a-f0-9]{64}$/.test(record.leaseId ?? "")
        || !Number.isSafeInteger(record.reservedAtMs)
        || value.consumedAuthorityLeases[record.leaseId]?.replayKey !== replayKey
        || (record.status === "APPLIED") !== (value.effects[replayKey] !== undefined)
      ) throw new Error("EFFECT_STORE_INVALID_DENIED");
    }
  } else if (isV3 || isV4) {
    for (const [operationKey, record] of Object.entries(value.reservations)) {
      if (
        record === null
        || typeof record !== "object"
        || Array.isArray(record)
        || canonicalJson(Object.keys(record).sort()) !== canonicalJson(isV4
          ? [
            "actionDigest", "authorityBinding", "authorityKind", "leaseId", "recovery",
            "reservedAtMs", "status",
          ]
          : ["actionDigest", "authorityKind", "leaseId", "recovery", "reservedAtMs", "status"])
        || !["INSTALLER_APPROVAL_V1", "ADMIN_AI_POC_HMAC_V1", "OWNER_ESCALATION_LEASE_HMAC_V1"].includes(record.authorityKind)
        || !["EXECUTING", "APPLIED", "AMBIGUOUS"].includes(record.status)
        || !["NONE", "RECONCILE"].includes(record.recovery)
        || (record.status === "AMBIGUOUS" ? record.recovery !== "RECONCILE" : record.recovery !== "NONE")
        || !/^[a-f0-9]{64}$/.test(record.actionDigest ?? "")
        || (isV4
          && record.authorityBinding !== null
          && !/^[a-f0-9]{64}$/.test(record.authorityBinding ?? ""))
        || (record.leaseId !== null && !/^[a-f0-9]{64}$/.test(record.leaseId ?? ""))
        || !Number.isSafeInteger(record.reservedAtMs)
        || (record.status === "APPLIED") !== (value.effects[operationKey] !== undefined)
      ) throw new Error("EFFECT_STORE_INVALID_DENIED");
      if (
        record.authorityKind === "OWNER_ESCALATION_LEASE_HMAC_V1"
        && (
          record.leaseId === null
          || (isV4 && record.authorityBinding !== record.leaseId)
          || value.consumedAuthorityLeases[record.leaseId]?.replayKey !== operationKey
          || value.consumedAuthorityLeases[record.leaseId]?.actionDigest !== record.actionDigest
        )
      ) throw new Error("EFFECT_STORE_INVALID_DENIED");
      if (
        record.authorityKind !== "OWNER_ESCALATION_LEASE_HMAC_V1"
        && record.leaseId !== null
      ) throw new Error("EFFECT_STORE_INVALID_DENIED");
    }
    for (const [leaseId, record] of Object.entries(value.consumedAuthorityLeases)) {
      if (
        record === null
        || typeof record !== "object"
        || Array.isArray(record)
        || canonicalJson(Object.keys(record).sort()) !== canonicalJson([
          "actionDigest", "replayKey", "reservedAtMs",
        ])
        || !/^[a-f0-9]{64}$/.test(leaseId)
        || !/^[a-f0-9]{64}$/.test(record.actionDigest ?? "")
        || !Number.isSafeInteger(record.reservedAtMs)
      ) throw new Error("EFFECT_STORE_INVALID_DENIED");
    }
  }
  return {
    schemaVersion: "chimpmaera.demo/effect-store/v4",
    effects: value.effects,
    reservations: isV2
      ? Object.fromEntries(Object.entries(value.reservations).map(([operationKey, record]) => [
        operationKey,
        {
          actionDigest: record.actionDigest,
          authorityBinding: record.leaseId,
          authorityKind: "OWNER_ESCALATION_LEASE_HMAC_V1",
          leaseId: record.leaseId,
          recovery: record.status === "AMBIGUOUS" ? "RECONCILE" : "NONE",
          reservedAtMs: record.reservedAtMs,
          status: record.status,
        },
      ]))
      : isV3
        ? Object.fromEntries(Object.entries(value.reservations).map(([operationKey, record]) => [
          operationKey,
          {
            ...record,
            authorityBinding: record.authorityKind === "OWNER_ESCALATION_LEASE_HMAC_V1"
              ? record.leaseId
              : null,
          },
        ]))
        : isV4 ? value.reservations : {},
    consumedAuthorityLeases: isV2 || isV3 || isV4 ? value.consumedAuthorityLeases : {},
  };
}

export class DemoMutationGate {
  constructor({
    apiToken,
    controlToken,
    expectedOrigin,
    receiptPath,
    journalOwner = null,
    provider,
    adminAiPolicyId = "admin-ai-poc-policy-v1",
    adminAiPolicyDigest,
    assertPolicyUse = () => true,
    ownerAuthorityToken = controlToken,
    now = () => Date.now(),
    operationTimeoutMs = 30_000,
    maxReconcileAttempts = 3,
    authorityContext = {
      profileId: "SAFE_GUIDED",
      profileGeneration: randomUUID(),
      policyGeneration: 1,
    },
  }) {
    if (
      apiToken.length < 32
      || controlToken.length < 32
      || ownerAuthorityToken.length < 32
      || !Number.isSafeInteger(operationTimeoutMs)
      || operationTimeoutMs < 1
      || operationTimeoutMs > 300_000
      || !Number.isSafeInteger(maxReconcileAttempts)
      || maxReconcileAttempts < 1
      || maxReconcileAttempts > 32
    ) {
      throw new Error("GATE_SECRET_INVALID");
    }
    this.apiToken = apiToken;
    this.controlToken = controlToken;
    this.ownerAuthorityToken = ownerAuthorityToken;
    this.expectedOrigin = expectedOrigin;
    this.receiptPath = receiptPath;
    this.journalOwner = journalOwner;
    assertLocalJournalOwner(receiptPath, journalOwner);
    this.provider = provider;
    this.operationTimeoutMs = operationTimeoutMs;
    this.maxReconcileAttempts = maxReconcileAttempts;
    this.adminAiPolicyDigest = adminAiPolicyDigest;
    if (
      typeof now !== "function"
      || authorityContext?.profileId !== "SAFE_GUIDED"
      || typeof authorityContext.profileGeneration !== "string"
      || authorityContext.profileGeneration.length < 8
      || !Number.isSafeInteger(authorityContext.policyGeneration)
      || authorityContext.policyGeneration < 1
      || adminAiPolicyId !== "admin-ai-poc-policy-v1"
      || (adminAiPolicyDigest !== undefined
        && !/^[a-f0-9]{64}$/.test(adminAiPolicyDigest))
      || typeof assertPolicyUse !== "function"
    ) throw new Error("AUTHORITY_CONTEXT_INVALID_DENIED");
    this.now = now;
    this.authorityContext = { ...authorityContext };
    this.adminAiPolicyId = adminAiPolicyId;
    this.assertPolicyUse = assertPolicyUse;
    this.state = {
      schemaVersion: "chimpmaera.demo/effect-store/v4",
      effects: {},
      reservations: {},
      consumedAuthorityLeases: {},
    };
    try {
      this.state = normalizeEffectStore(JSON.parse(readFileSync(receiptPath, "utf8")));
      let recoveredExecuting = false;
      for (const reservation of Object.values(this.state.reservations)) {
        if (reservation.status === "EXECUTING") {
          reservation.status = "AMBIGUOUS";
          reservation.recovery = "RECONCILE";
          recoveredExecuting = true;
        }
      }
      if (recoveredExecuting) this.persist();
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  authorize(request) {
    authorizeLocalRequest(request, {
      apiToken: this.apiToken,
      expectedOrigin: this.expectedOrigin,
    });
  }

  approvalBinding(actionDigest, action) {
    const scopeDigest = sha256(canonicalJson(action.scope));
    return createHmac("sha256", this.controlToken)
      .update(`${actionDigest}\n${action.actor}\n${scopeDigest}\n${action.replayKey}`)
      .digest("hex");
  }

  agentAuthority(fields) {
    const core = {
      kind: "ADMIN_AI_POC_HMAC_V1",
      actor: fields.actor,
      scope: fields.scope,
      actionDigest: fields.actionDigest,
      replayKey: fields.replayKey,
      policyId: fields.policyId,
      policyGeneration: fields.policyGeneration,
      policyDigest: fields.policyDigest,
      decisionDigest: fields.decisionDigest,
    };
    return {
      ...core,
      binding: createHmac("sha256", this.controlToken)
        .update(`admin-ai-poc-authority-v1\n${canonicalJson(core)}`)
        .digest("hex"),
    };
  }

  validateAgentAuthority(authority, action, computedDigest) {
    if (
      authority === null
      || typeof authority !== "object"
      || Array.isArray(authority)
      || JSON.stringify(Object.keys(authority).sort()) !== JSON.stringify([
        "actionDigest",
        "actor",
        "binding",
        "decisionDigest",
        "kind",
        "policyDigest",
        "policyGeneration",
        "policyId",
        "replayKey",
        "scope",
      ])
      || authority.kind !== "ADMIN_AI_POC_HMAC_V1"
      || typeof authority.actor !== "string"
      || typeof authority.actionDigest !== "string"
      || typeof authority.replayKey !== "string"
      || authority.policyId !== this.adminAiPolicyId
      || authority.policyGeneration !== this.authorityContext.policyGeneration
      || typeof authority.policyDigest !== "string"
      || typeof authority.decisionDigest !== "string"
      || typeof authority.binding !== "string"
      || authority.scope === null
      || typeof authority.scope !== "object"
      || Array.isArray(authority.scope)
      || !/^[a-f0-9]{64}$/.test(authority.actionDigest)
      || !/^[a-f0-9]{64}$/.test(authority.decisionDigest ?? "")
      || !/^[a-f0-9]{64}$/.test(authority.policyDigest ?? "")
      || !/^[a-f0-9]{64}$/.test(authority.binding)
      || !equalSecret(authority.policyDigest, this.adminAiPolicyDigest ?? "")
      || !equalSecret(authority.actor, action.actor)
      || canonicalJson(authority.scope) !== canonicalJson(action.scope)
      || !equalSecret(authority.actionDigest, computedDigest)
      || !equalSecret(authority.replayKey, action.replayKey)
    ) throw new Error("AGENT_AUTHORITY_INVALID_DENIED");
    const expected = this.agentAuthority({
      actor: action.actor,
      scope: action.scope,
      actionDigest: computedDigest,
      replayKey: action.replayKey,
      policyId: authority.policyId,
      policyGeneration: authority.policyGeneration,
      policyDigest: authority.policyDigest,
      decisionDigest: authority.decisionDigest,
    });
    if (!equalSecret(authority.binding, expected.binding)) {
      throw new Error("AGENT_AUTHORITY_INVALID_DENIED");
    }
  }

  ownerAuthority({
    proposal,
    ownerDecisionReceiptDigest,
    issuedAtMs,
    expiresAtMs,
  }) {
    const { proposalDigest, ...boundProposalCore } = proposal ?? {};
    let snapshotValid = false;
    try {
      validateAuthoritativeApprovalSnapshot(proposal?.snapshot, proposal?.action);
      snapshotValid = true;
    } catch {
      snapshotValid = false;
    }
    if (
      proposal?.outcome !== "OWNER_ESCALATION"
      || proposal.profileId !== this.authorityContext.profileId
      || proposal.profileGeneration !== this.authorityContext.profileGeneration
      || proposal.policyId !== this.adminAiPolicyId
      || proposal.policyGeneration !== this.authorityContext.policyGeneration
      || proposal.policyDigest !== this.adminAiPolicyDigest
      || sha256(canonicalJson(proposal.action)) !== proposal.actionDigest
      || sha256(canonicalJson(proposal.businessDiff)) !== proposal.businessDiffDigest
      || !snapshotValid
      || proposal.snapshotDigest !== proposal.snapshot.snapshotDigest
      || proposal.snapshotVersion !== proposal.snapshot.version
      || proposal.requester !== APPROVAL_REQUESTER
      || proposal.purpose !== APPROVAL_PURPOSE
      || !/^[a-f0-9]{64}$/.test(proposal.decisionDigest ?? "")
      || !/^[a-f0-9]{64}$/.test(proposal.proposalDigest ?? "")
      || sha256(canonicalJson(boundProposalCore)) !== proposalDigest
      || !/^[a-f0-9]{64}$/.test(ownerDecisionReceiptDigest ?? "")
      || !Number.isSafeInteger(issuedAtMs)
      || !Number.isSafeInteger(expiresAtMs)
      || expiresAtMs <= issuedAtMs
      || expiresAtMs - issuedAtMs > 300_000
    ) throw new Error("OWNER_AUTHORITY_INPUT_INVALID_DENIED");
    validateAdminAiAction(proposal.action, "OWNER_ESCALATION_LEASE_HMAC_V1");
    const unsigned = {
      kind: "OWNER_ESCALATION_LEASE_HMAC_V1",
      actor: proposal.actor,
      scope: proposal.action.scope,
      actionDigest: proposal.actionDigest,
      businessDiffDigest: proposal.businessDiffDigest,
      snapshotDigest: proposal.snapshotDigest,
      snapshotVersion: proposal.snapshotVersion,
      requester: proposal.requester,
      purpose: proposal.purpose,
      replayKey: proposal.replayKey,
      policyId: proposal.policyId,
      policyDigest: proposal.policyDigest,
      policyGeneration: proposal.policyGeneration,
      decisionDigest: proposal.decisionDigest,
      proposalDigest: proposal.proposalDigest,
      ownerDecisionReceiptDigest,
      approver: "owner:local-demo",
      profileId: proposal.profileId,
      profileGeneration: proposal.profileGeneration,
      issuedAtMs,
      notBeforeMs: issuedAtMs,
      expiresAtMs,
      maxUses: 1,
    };
    const leaseId = createHmac("sha256", this.ownerAuthorityToken)
      .update(`owner-escalation-lease-id-v1\n${canonicalJson(unsigned)}`)
      .digest("hex");
    const core = { ...unsigned, leaseId };
    return {
      ...core,
      binding: createHmac("sha256", this.ownerAuthorityToken)
        .update(`owner-escalation-authority-v1\n${canonicalJson(core)}`)
        .digest("hex"),
    };
  }

  validateOwnerAuthority(
    authority,
    action,
    computedDigest,
    businessDiff,
    businessDiffDigest,
  ) {
    const expectedKeys = [
      "actionDigest", "actor", "approver", "binding", "businessDiffDigest",
      "decisionDigest", "expiresAtMs", "issuedAtMs", "kind", "leaseId",
      "maxUses", "notBeforeMs", "ownerDecisionReceiptDigest", "policyDigest",
      "policyGeneration", "policyId", "profileGeneration", "profileId", "proposalDigest",
      "purpose", "replayKey", "requester", "scope", "snapshotDigest",
      "snapshotVersion",
    ];
    if (
      authority === null
      || typeof authority !== "object"
      || Array.isArray(authority)
      || canonicalJson(Object.keys(authority).sort())
        !== canonicalJson(expectedKeys.sort())
      || authority.kind !== "OWNER_ESCALATION_LEASE_HMAC_V1"
      || authority.approver !== "owner:local-demo"
      || authority.maxUses !== 1
      || authority.profileId !== this.authorityContext.profileId
      || authority.profileGeneration !== this.authorityContext.profileGeneration
      || authority.policyId !== this.adminAiPolicyId
      || authority.policyGeneration !== this.authorityContext.policyGeneration
      || !equalSecret(authority.policyDigest, this.adminAiPolicyDigest ?? "")
      || !equalSecret(authority.actor, action.actor)
      || canonicalJson(authority.scope) !== canonicalJson(action.scope)
      || !equalSecret(authority.actionDigest, computedDigest)
      || !equalSecret(authority.businessDiffDigest, businessDiffDigest)
      || sha256(canonicalJson(businessDiff)) !== businessDiffDigest
      || authority.requester !== APPROVAL_REQUESTER
      || authority.purpose !== APPROVAL_PURPOSE
      || !/^[a-f0-9]{64}$/.test(authority.snapshotDigest ?? "")
      || !/^[a-f0-9]{64}$/.test(authority.snapshotVersion ?? "")
      || !equalSecret(authority.replayKey, action.replayKey)
      || !/^[a-f0-9]{64}$/.test(authority.decisionDigest ?? "")
      || !/^[a-f0-9]{64}$/.test(authority.proposalDigest ?? "")
      || !/^[a-f0-9]{64}$/.test(authority.ownerDecisionReceiptDigest ?? "")
      || !/^[a-f0-9]{64}$/.test(authority.leaseId ?? "")
      || !/^[a-f0-9]{64}$/.test(authority.binding ?? "")
      || !Number.isSafeInteger(authority.issuedAtMs)
      || !Number.isSafeInteger(authority.notBeforeMs)
      || !Number.isSafeInteger(authority.expiresAtMs)
      || authority.notBeforeMs !== authority.issuedAtMs
      || authority.expiresAtMs <= authority.notBeforeMs
      || authority.expiresAtMs - authority.issuedAtMs > 300_000
    ) throw new Error("OWNER_AUTHORITY_INVALID_DENIED");
    const { binding, ...core } = authority;
    const expectedBinding = createHmac("sha256", this.ownerAuthorityToken)
      .update(`owner-escalation-authority-v1\n${canonicalJson(core)}`)
      .digest("hex");
    if (!equalSecret(binding, expectedBinding)) {
      throw new Error("OWNER_AUTHORITY_INVALID_DENIED");
    }
    const now = this.now();
    if (!Number.isSafeInteger(now)) throw new Error("AUTHORITY_CLOCK_INVALID_DENIED");
    if (now < authority.notBeforeMs) throw new Error("AUTHORITY_NOT_YET_VALID_DENIED");
    if (now >= authority.expiresAtMs) throw new Error("AUTHORITY_EXPIRED_DENIED");
    return now;
  }

  reserveOperation({
    operationKey,
    action,
    computedDigest,
    authorityBinding,
    authorityKind,
    leaseId = null,
    reservedAtMs,
  }) {
    if (
      !["INSTALLER_APPROVAL_V1", "ADMIN_AI_POC_HMAC_V1", "OWNER_ESCALATION_LEASE_HMAC_V1"].includes(authorityKind)
      || !/^[a-f0-9]{64}$/.test(authorityBinding ?? "")
      || (authorityKind === "OWNER_ESCALATION_LEASE_HMAC_V1"
        ? authorityBinding !== leaseId
        : leaseId !== null)
    ) throw new Error("RESERVATION_AUTHORITY_BINDING_INVALID_DENIED");
    const prior = this.state.effects[operationKey];
    if (prior !== undefined && prior.actionDigest !== computedDigest) {
      throw new Error("REPLAY_KEY_CONFLICT_DENIED");
    }
    const reservation = this.state.reservations[operationKey];
    if (reservation !== undefined) {
      if (reservation.actionDigest !== computedDigest) {
        throw new Error("REPLAY_KEY_CONFLICT_DENIED");
      }
      if (
        reservation.authorityKind !== authorityKind
        || typeof reservation.authorityBinding !== "string"
        || !equalSecret(reservation.authorityBinding, authorityBinding)
      ) throw new Error("REPLAY_AUTHORITY_CONFLICT_DENIED");
      if (
        authorityKind === "OWNER_ESCALATION_LEASE_HMAC_V1"
        && reservation.leaseId === leaseId
        && reservation.status !== "AMBIGUOUS"
      ) throw new Error("AUTHORITY_LEASE_REPLAY_DENIED");
      if (reservation.status === "AMBIGUOUS") return reservation;
      if (reservation.status === "APPLIED" && prior !== undefined) return reservation;
      throw new Error("EFFECT_REPLAY_IN_PROGRESS_DENIED");
    }
    this.state.reservations[operationKey] = {
      actionDigest: computedDigest,
      authorityBinding,
      authorityKind,
      leaseId,
      recovery: "NONE",
      reservedAtMs,
      status: "EXECUTING",
    };
    if (authorityKind === "OWNER_ESCALATION_LEASE_HMAC_V1") {
      this.state.consumedAuthorityLeases[leaseId] = {
        actionDigest: computedDigest,
        replayKey: operationKey,
        reservedAtMs,
      };
    }
    this.persist();
    return this.state.reservations[operationKey];
  }

  markAmbiguous(operationKey) {
    const reservation = this.state.reservations[operationKey];
    if (reservation === undefined || this.state.effects[operationKey] !== undefined) return;
    reservation.status = "AMBIGUOUS";
    reservation.recovery = "RECONCILE";
    this.persist();
  }

  /**
   * PAN453 AC04 bounded local synthetic stop/revoke control, observed from the
   * durable owner-scoped ledger at the actual entry point.
   *  - REVOKE always denies (a new effect AND read-only reconciliation) for the
   *    bound operation key or source/target identity.
   *  - STOP denies every new effect for the bound source/target identity, but a
   *    durable AMBIGUOUS reservation that is still eligible for the lease-matched
   *    read-only reconciliation keeps that no-duplicate recovery path.
   * Legacy (non-owned) roots are untouched.
   */
  assertEffectControl({ action, operationKey, reconcileEligible }) {
    if (!isOwnedSyntheticPath(this.receiptPath)) return;
    const control = readLocalJournalControl(dirname(this.receiptPath));
    const source = mutationSourceIdentity(action);
    const target = mutationTargetIdentity(action);
    // A control binding is durable: it is observed from BOTH the bounded detail
    // records and the compact per-key denial fences. Pruning a detail record
    // under unrelated churn can therefore never end an active stop/revoke or
    // lower a retained stop epoch. A saturated fence map means the owned root
    // can no longer durably admit a new control, so new effects fail closed.
    const controls = [...control.records, ...Object.values(control.fences)];
    for (const record of controls) {
      if (
        record.kind === "REVOKE"
        && (
          record.operationKey === operationKey
          || (record.sourceIdentity === source && record.targetIdentity === target)
        )
      ) throw new Error("EFFECT_REVOKED_DENIED");
    }
    if (reconcileEligible) return;
    if (control.saturated) throw new Error("EFFECT_CONTROL_LEDGER_SATURATED_DENIED");
    if (
      controls.some((record) =>
        record.kind === "STOP"
        && record.sourceIdentity === source
        && record.targetIdentity === target)
    ) throw new Error("EFFECT_STOPPED_DENIED");
  }

  async reconcileOperation({
    operationKey,
    action,
    computedDigest,
    authority,
    authorityBinding,
    authorityKind,
    signal,
    runBounded,
  }) {
    const reservation = this.state.reservations[operationKey];
    if (reservation?.status !== "AMBIGUOUS") return null;
    if (reservation.actionDigest !== computedDigest) {
      throw new Error("REPLAY_KEY_CONFLICT_DENIED");
    }
    if (
      reservation.authorityKind !== authorityKind
      || typeof reservation.authorityBinding !== "string"
      || !equalSecret(reservation.authorityBinding, authorityBinding)
    ) throw new Error("REPLAY_AUTHORITY_CONFLICT_DENIED");
    if (typeof this.provider.reconcile !== "function") {
      throw new Error("EFFECT_AMBIGUOUS_RECONCILE_REQUIRED");
    }
    // PAN453 AC04 bounded attempts with durable retention: the attempt counter
    // is retained in the owned journal so the bound survives process restarts
    // and a local restore. Exhausting it fails closed without dispatching a new
    // effect and without another provider reconciliation read.
    if (isOwnedSyntheticPath(this.receiptPath)) {
      const attempts = recordLocalJournalRecoveryAttempt(dirname(this.receiptPath), {
        operationKey,
        attemptedAtMs: this.now(),
        maxAttempts: this.maxReconcileAttempts,
      });
      if (attempts > this.maxReconcileAttempts) {
        throw new Error("EFFECT_RECOVERY_ATTEMPTS_EXHAUSTED_DENIED");
      }
    }
    const result = await runBounded((providerSignal) =>
      this.provider.reconcile(action, providerSignal), signal);
    if (result === null || result === undefined) {
      throw new Error("EFFECT_RECONCILIATION_PENDING");
    }
    const readback = result?.readback ?? result;
    const providerResult = result?.readback === undefined
      ? result
      : result.providerResult ?? { id: readback.id };
    if (
      readback === null
      || typeof readback !== "object"
      || Array.isArray(readback)
    ) throw new Error("PROVIDER_READBACK_REQUIRED");
    validateSemanticReadback(action, readback);
    // PAN453 AC03: a matching reconcile callback is not, by itself, authority.
    // The claimed persisted target must be corroborated by an INDEPENDENT read
    // of the actual target at the existing recovery/readback boundary. An
    // absent or contradictory persisted target stays UNRESOLVED: fail closed
    // with no CONFIRM, no PASS, no second mutation and no overwritten durable
    // state. Legacy (non-owned) reconciliation semantics are unchanged.
    if (isOwnedSyntheticPath(this.receiptPath)) {
      if (typeof this.provider.readback !== "function") {
        throw new Error("EFFECT_RECONCILIATION_UNCONFIRMED_DENIED");
      }
      const independent = await runBounded(
        (providerSignal) => this.provider.readback(action, providerResult, providerSignal),
        signal,
      );
      if (
        independent === null
        || typeof independent !== "object"
        || Array.isArray(independent)
      ) throw new Error("EFFECT_RECONCILIATION_UNCONFIRMED_DENIED");
      validateSemanticReadback(action, independent);
      if (!equalSecret(
        readback.id === undefined ? "" : String(readback.id),
        independent.id === undefined ? "" : String(independent.id),
      )) throw new Error("EFFECT_RECONCILIATION_CONTRADICTORY_DENIED");
    }
    const core = receiptCore(
      action,
      computedDigest,
      providerResult,
      readback,
      action.actor === "agent:admin-ai-poc" ? authority : undefined,
      "RECONCILED_AFTER_AMBIGUITY",
    );
    const receipt = {
      ...core,
      receiptDigest: sha256(canonicalJson(core)),
    };
    this.state.effects[operationKey] = {
      actionDigest: computedDigest,
      providerResult,
      readback,
      receipt,
    };
    reservation.status = "APPLIED";
    reservation.recovery = "NONE";
    try {
      this.persist();
    } catch (persistError) {
      // A final persistence failure must not leave a live in-memory APPLIED
      // claim or an undurable receipt. Roll the in-memory effect record and
      // reservation back to the recoverable ambiguous state before rethrowing.
      // execute()'s catch does NOT re-persist here: on the reconciliation path
      // `reserved` remains false, so markAmbiguous is not called and the PRIOR
      // durable AMBIGUOUS/RECONCILE bytes are retained (not re-written). A
      // restart reconciles from that retained state without a duplicate POST.
      delete this.state.effects[operationKey];
      reservation.status = "AMBIGUOUS";
      reservation.recovery = "RECONCILE";
      throw persistError;
    }
    return {
      status: "PASS",
      replayed: true,
      replayState: "RECONCILE_NO_DUPLICATE",
      providerResult,
      readback,
      receipt,
    };
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

  async execute(request, envelope) {
    assertLocalJournalOwner(this.receiptPath, this.journalOwner);
    this.authorize(request);
    const controller = new AbortController();
    const deadlineError = new Error("OPERATION_DEADLINE_EXCEEDED");
    let deadlineTimer;
    const deadlinePromise = new Promise((_, reject) => {
      deadlineTimer = setTimeout(() => {
        controller.abort(deadlineError);
        reject(deadlineError);
      }, this.operationTimeoutMs);
    });
    deadlinePromise.catch(() => {});
    const runBounded = async (operation) => {
      if (controller.signal.aborted) throw deadlineError;
      return Promise.race([
        Promise.resolve().then(() => operation(controller.signal)),
        deadlinePromise,
      ]);
    };
    let operationKey;
    let reserved = false;
    const {
      action,
      actionDigest,
      approval,
      authority,
      businessDiff,
      businessDiffDigest,
    } = envelope ?? {};
    try {
      if (
        authority?.kind === "OWNER_ESCALATION_LEASE_HMAC_V1"
        && canonicalJson(Object.keys(envelope).sort()) !== canonicalJson([
          "action",
          "actionDigest",
          "authority",
          "businessDiff",
          "businessDiffDigest",
        ])
      ) throw new Error("OWNER_EFFECT_ENVELOPE_INVALID_DENIED");
      validateActionShape(action);
      if (action.scope.actor !== action.actor) {
        throw new Error("IDENTITY_MISMATCH_DENIED");
      }
      validateMutationScope(action);
      operationKey = normalizeOperationKey(action.replayKey);
      const computedDigest = sha256(canonicalJson(action));
      if (!equalSecret(actionDigest, computedDigest)) {
        throw new Error("ACTION_DIGEST_MISMATCH_DENIED");
      }

      const ownerLease = authority?.kind === "OWNER_ESCALATION_LEASE_HMAC_V1";
      const authorityKind = ownerLease
        ? "OWNER_ESCALATION_LEASE_HMAC_V1"
        : action.actor === "agent:admin-ai-poc"
          ? "ADMIN_AI_POC_HMAC_V1"
          : "INSTALLER_APPROVAL_V1";
      const authorityBinding = ownerLease
        ? authority.leaseId
        : action.actor === "agent:admin-ai-poc"
          ? authority?.binding
          : approval?.binding;
      if (action.actor === "agent:admin-ai-poc") {
        if (ownerLease) {
          validateAdminAiAction(action, authority.kind);
          this.validateOwnerAuthority(
            authority,
            action,
            computedDigest,
            businessDiff,
            businessDiffDigest,
          );
        } else {
          validateAdminAiAction(action, "ADMIN_AI_POC_HMAC_V1");
          this.validateAgentAuthority(authority, action, computedDigest);
        }
      } else if (
        approval?.decision !== "APPROVE"
        || approval?.approver !== "owner:local-demo"
        || !equalSecret(approval?.actionDigest, computedDigest)
        || !equalSecret(
          approval?.binding,
          this.approvalBinding(computedDigest, action),
        )
      ) throw new Error("APPROVAL_BINDING_INVALID_DENIED");

      if (action.actor === "agent:admin-ai-poc") {
        this.assertPolicyUse({
          tenant: action.scope.tenant,
          policyId: authority.policyId,
          policyGeneration: authority.policyGeneration,
          policySourceDigest: authority.policyDigest,
        });
      }

      const prior = this.state.effects[operationKey];
      const existing = this.state.reservations[operationKey];
      if (
        (prior !== undefined && prior.actionDigest !== computedDigest)
        || (existing !== undefined && existing.actionDigest !== computedDigest)
      ) throw new Error("REPLAY_KEY_CONFLICT_DENIED");
      if (
        existing !== undefined
        && (
          existing.authorityKind !== authorityKind
          || typeof existing.authorityBinding !== "string"
          || !equalSecret(existing.authorityBinding, authorityBinding)
        )
      ) throw new Error("REPLAY_AUTHORITY_CONFLICT_DENIED");

      // A durable STOP/REVOKE is bound to the operation identity and observed
      // before any snapshot, reservation or provider effect. Only a durable
      // AMBIGUOUS reservation that still matches the signed lease and the
      // synthetic reconcile callback keeps the read-only recovery path.
      const reconcileEligible = isOwnedSyntheticPath(this.receiptPath)
        && ownerLease
        && existing?.status === "AMBIGUOUS"
        && existing.recovery === "RECONCILE"
        && existing.leaseId === authority?.leaseId
        && typeof this.provider.reconcile === "function";
      this.assertEffectControl({ action, operationKey, reconcileEligible });

      if (ownerLease && this.state.consumedAuthorityLeases[authority.leaseId] !== undefined) {
        if (existing?.status !== "AMBIGUOUS" || typeof this.provider.reconcile !== "function") {
          throw new Error("AUTHORITY_LEASE_REPLAY_DENIED");
        }
      }
      if (ownerLease) {
        if (typeof this.provider.readAuthoritativeSnapshot !== "function") {
          throw new Error("APPROVAL_SNAPSHOT_UNAVAILABLE_DENIED");
        }
        const currentSnapshot = validateAuthoritativeApprovalSnapshot(
          await runBounded((signal) => this.provider.readAuthoritativeSnapshot(action, signal)),
          action,
        );
        // The pre-effect snapshot necessarily changes after an ambiguous
        // committed effect. Only an already durable AMBIGUOUS reservation with
        // the same signed lease can proceed to the read-only reconcile path;
        // no fresh effect may borrow this exception.
        const ambiguousRecovery = isOwnedSyntheticPath(this.receiptPath)
          && existing?.status === "AMBIGUOUS"
          && existing.recovery === "RECONCILE"
          && existing.leaseId === authority.leaseId
          && typeof this.provider.reconcile === "function";
        if (!ambiguousRecovery && (
          currentSnapshot.snapshotDigest !== authority.snapshotDigest
          || currentSnapshot.version !== authority.snapshotVersion
        )) throw new Error("APPROVAL_SNAPSHOT_STALE_DENIED");
        this.validateOwnerAuthority(
          authority,
          action,
          computedDigest,
          businessDiff,
          businessDiffDigest,
        );
        this.assertPolicyUse({
          tenant: action.scope.tenant,
          policyId: authority.policyId,
          policyGeneration: authority.policyGeneration,
          policySourceDigest: authority.policyDigest,
        });
      }

      if (prior !== undefined) {
        if (
          action.actor === "agent:admin-ai-poc"
          && (
            !equalSecret(prior.receipt.decisionDigest, authority.decisionDigest)
            || prior.receipt.policyId !== authority.policyId
            || prior.receipt.policyGeneration !== authority.policyGeneration
            || !equalSecret(prior.receipt.policyDigest, authority.policyDigest)
          )
        ) throw new Error("REPLAY_AUTHORITY_CONFLICT_DENIED");
        return {
          status: "PASS",
          replayed: true,
          replayState: "REPLAY_NO_DUPLICATE",
          providerResult: prior.providerResult,
          readback: prior.readback,
          receipt: prior.receipt,
        };
      }

      if (existing?.status === "AMBIGUOUS") {
        const recovered = await this.reconcileOperation({
          operationKey,
          action,
          computedDigest,
          authority,
          authorityBinding,
          authorityKind,
          signal: controller.signal,
          runBounded,
        });
        if (recovered !== null) return recovered;
      }

      this.reserveOperation({
        operationKey,
        action,
        computedDigest,
        authorityBinding,
        authorityKind,
        leaseId: ownerLease ? authority.leaseId : null,
        reservedAtMs: this.now(),
      });
      reserved = true;

      const providerResult = await runBounded((signal) =>
        this.provider.mutate(action, signal));
      const readback = await runBounded((signal) =>
        this.provider.readback(action, providerResult, signal));
      if (
        readback === null
        || typeof readback !== "object"
        || Array.isArray(readback)
      ) throw new Error("PROVIDER_READBACK_REQUIRED");
      validateSemanticReadback(action, readback);
      const core = receiptCore(
        action,
        computedDigest,
        providerResult,
        readback,
        action.actor === "agent:admin-ai-poc" ? authority : undefined,
      );
      const receipt = {
        ...core,
        receiptDigest: sha256(canonicalJson(core)),
      };
      this.state.effects[operationKey] = {
        actionDigest: computedDigest,
        providerResult,
        readback,
        receipt,
      };
      this.state.reservations[operationKey].status = "APPLIED";
      try {
        this.persist();
      } catch (persistError) {
        // A final persistence failure must not leave a live in-memory APPLIED
        // claim or an undurable receipt. Roll the in-memory effect record and
        // reservation back to the recoverable ambiguous state before rethrowing;
        // execute()'s catch then persists that convergence via markAmbiguous
        // (`reserved` is true on the initial-execution path). If that recovery
        // persist ALSO fails (persistent storage failure), the durable bytes
        // retain the prior EXECUTING reservation while live memory holds
        // AMBIGUOUS; memory and bytes converge once storage recovers and a
        // later persist succeeds. Do not claim immediate byte convergence.
        delete this.state.effects[operationKey];
        this.state.reservations[operationKey].status = "AMBIGUOUS";
        this.state.reservations[operationKey].recovery = "RECONCILE";
        throw persistError;
      }
      return {
        status: "PASS",
        replayed: false,
        providerResult,
        readback,
        receipt,
      };
    } catch (error) {
      if (reserved && operationKey !== undefined && this.state.effects[operationKey] === undefined) {
        this.markAmbiguous(operationKey);
      }
      throw error;
    } finally {
      clearTimeout(deadlineTimer);
    }
  }
}

export function createHttpProvider({
  espoPassword,
  doliApiKey,
  fetchImpl = fetch,
  operationTimeoutMs = 30_000,
}) {
  if (!Number.isSafeInteger(operationTimeoutMs) || operationTimeoutMs < 1 || operationTimeoutMs > 300_000) {
    throw new Error("PROVIDER_TIMEOUT_INVALID");
  }
  const base = {
    espocrm: "http://espocrm/api/v1",
    dolibarr: "http://dolibarr/api/index.php",
  };
  const headersFor = (provider, json = false) => ({
    ...(provider === "espocrm"
      ? {
        authorization:
          `Basic ${Buffer.from(`admin:${espoPassword}`).toString("base64")}`,
      }
      : { DOLAPIKEY: doliApiKey }),
    ...(json ? { "content-type": "application/json" } : {}),
  });
  const call = async (provider, path, options = {}) => {
    const response = await fetchImpl(`${base[provider]}${path}`, {
      ...options,
      signal: options.signal ?? AbortSignal.timeout(operationTimeoutMs),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`PROVIDER_${response.status}_DENIED`);
    try {
      return JSON.parse(text);
    } catch {
      return text.trim();
    }
  };
  return {
    async read(provider, path, query = {}, signal) {
      if (
        !["espocrm", "dolibarr"].includes(provider)
        || typeof path !== "string"
        || !/^\/[A-Za-z0-9/_-]+$/.test(path)
      ) throw new Error("PROVIDER_READ_SCOPE_DENIED");
      const url = new URL(`${base[provider]}${path}`);
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.append(key, String(value));
      }
      const response = await fetchImpl(url, {
        headers: headersFor(provider),
        signal: signal ?? AbortSignal.timeout(operationTimeoutMs),
      });
      const text = await response.text();
      if (response.status === 404 && provider === "dolibarr") return [];
      if (!response.ok) throw new Error(`PROVIDER_${response.status}_DENIED`);
      return JSON.parse(text);
    },
    async readAuthoritativeSnapshot(action, signal) {
      const rows = await this.read("dolibarr", "/orders", {
        // Read one sentinel beyond the closed snapshot limit so a hidden third
        // match fails snapshot construction instead of being called complete.
        limit: "3",
        sqlfilters: "(t.ref_client:=:'CM-ADMIN-AI-ESCALATION-001')",
      }, signal);
      if (!Array.isArray(rows)) {
        throw new Error("APPROVAL_SNAPSHOT_SOURCE_INVALID_DENIED");
      }
      return createAuthoritativeApprovalSnapshot(
        action,
        rows.map((row) => ({
          id: Number(row?.id),
          ref_client: row?.ref_client,
          socid: Number(row?.socid),
          date: Number(row?.date),
        })),
      );
    },
    async mutate(action, signal) {
      return call(action.scope.provider, action.payload.path, {
        method: "POST",
        headers: headersFor(action.scope.provider, true),
        body: JSON.stringify(action.payload.body),
        signal,
      });
    },
    async readback(action, result, signal) {
      const id = typeof result === "object" && result !== null
        ? result.id
        : result;
      if (action.scope.provider === "espocrm") {
        return call("espocrm", `${action.payload.path}/${id}`, {
          headers: headersFor("espocrm"),
          signal,
        });
      }
      if (action.scope.entity === "OrderLine") {
        const orderPath = action.payload.path.replace(/\/lines$/, "");
        const order = await call("dolibarr", orderPath, {
          headers: headersFor("dolibarr"),
          signal,
        });
        const matching = (order.lines ?? []).filter((line) =>
          line.desc === action.payload.body.desc
        );
        if (matching.length !== 1) throw new Error("PROVIDER_READBACK_REQUIRED");
        return { ...matching[0], parentOrderId: order.id };
      }
      return call("dolibarr", `${action.payload.path}/${id}`, {
        headers: headersFor("dolibarr"),
        signal,
      });
    },
    async reconcile() {
      // Provider-specific reconciliation must be explicit; never guess that
      // an uncertain POST did not land.
      return null;
    },
  };
}
