import { createHash } from "node:crypto";
import { canonicalJson } from "../../dist/packages/contracts/src/canonical-json.js";
import { assertCcpDigestV1, ccpStrictDenyV1, readCcpClosedObjectV1 } from "../../dist/packages/contracts/src/ccp-event-envelope.js";
import { guardModelRequestV1, ModelAccessBrokerV1, syntheticModelAccessPolicyV1 } from "../../dist/packages/contracts/src/model-access-broker.js";
import { createResourceBudgetStoreV1 } from "../../demo/runtime/atomic-resource-budget.mjs";
import { bindRuntimeTemplateV1, planRuntimeTemplateV1 } from "./runtime-template-contract.mjs";

const denied = "NATIVE_RUNTIME_BUDGET_INPUT_DENIED";
const closed = (value, keys) => readCcpClosedObjectV1(value, keys, new WeakSet(), denied);
const hash = (value) => createHash("sha256").update(canonicalJson(value)).digest("hex");
const freeze = (value) => {
  if (value !== null && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
};
const selectionOperation = "operation:template-activation-v1";
const snapshotData = (value, seen = new WeakSet(), depth = 0) => {
  if (depth > 16) ccpStrictDenyV1(denied);
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0)) return value;
  if (typeof value !== "object" || seen.has(value)) ccpStrictDenyV1(denied);
  seen.add(value);
  if (Array.isArray(value)) {
    if (value.length > 128 || Reflect.ownKeys(value).length !== value.length + 1) ccpStrictDenyV1(denied);
    return Array.from({ length: value.length }, (_, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor === undefined || !Object.hasOwn(descriptor, "value")) ccpStrictDenyV1(denied);
      return snapshotData(descriptor.value, seen, depth + 1);
    });
  }
  const record = closed(value, Object.keys(value));
  return Object.fromEntries(Object.entries(record).map(([key, child]) => [key, snapshotData(child, seen, depth + 1)]));
};

/** Owner-only constructor. Client API contains neither activation nor the store/signer. */
export function createNativeBudgetControllerV1(candidate) {
  const options = closed(candidate, ["optIn", "stateRoot", "identity", "limits", "syntheticProvider"]);
  if (options.optIn !== true || typeof options.syntheticProvider !== "function") ccpStrictDenyV1(denied);
  const template = bindRuntimeTemplateV1(options.identity);
  if (template.identity.componentId !== "pansphaira-local-demo" || !template.identity.effectiveRights.includes("demo.provider.bound.read")) ccpStrictDenyV1(denied);
  const policy = syntheticModelAccessPolicyV1();
  policy.routes[0].allowedTenants = [`tenant:${template.identity.tenantId}`];
  policy.maxBudget = {
    maxInputBytes: template.resourceClass.maxInputBytes, maxOutputBytes: template.resourceClass.maxOutputBytes,
    maxTokens: template.resourceClass.maxTokens, maxRequests: template.resourceClass.maxRequests,
    timeoutMs: template.resourceClass.timeoutMs, maxCostMicros: 1,
  };
  // The existing request guard requires a positive ceiling. The synthetic route
  // must report zero cost; this ceiling is not billing or paid-provider authority.
  const modelBinding = {
    tenant: policy.routes[0].allowedTenants[0],
    delegationDigest: hash({ schemaVersion: "pansphaira.runtime-budget/delegation-binding/v1", runtimeTemplateDigest: template.runtimeTemplateDigest, workloadIdentity: policy.workloadIdentities[0], userIdentity: policy.userIdentities[0] }),
    maxBudget: policy.maxBudget,
  };
  const bindingDigest = hash({ runtimeTemplateDigest: template.runtimeTemplateDigest, modelPolicy: policy, modelBinding });
  const store = createResourceBudgetStoreV1({ optIn: true, stateRoot: options.stateRoot, tenantId: modelBinding.tenant, bindingDigest, limits: options.limits });
  const broker = new ModelAccessBrokerV1(policy);
  const plans = new Map();
  const inFlight = new Map();
  const manifest = freeze({ template, modelBinding, modelPolicyDigest: hash(policy), executionAuthorityGranted: false });
  const selected = () => store.read(selectionOperation)?.state === "SETTLED";
  const plan = (value) => {
    const result = planRuntimeTemplateV1(value, template.identity, selected() ? template.runtimeTemplateDigest : null);
    if (!plans.has(result.operationId) && plans.size >= template.resourceClass.maxRequests) ccpStrictDenyV1("NATIVE_RUNTIME_PLAN_CAPACITY_DENIED");
    plans.set(result.operationId, result);
    return result;
  };
  const activate = (value) => {
    const approval = closed(value, ["operationId", "planDigest"]);
    assertCcpDigestV1(approval.planDigest, denied);
    const planned = plans.get(approval.operationId);
    if (planned === undefined || planned.planDigest !== approval.planDigest) ccpStrictDenyV1("NATIVE_RUNTIME_PLAN_REQUIRED_DENIED");
    const requestDigest = hash({ kind: "TEMPLATE_SELECTION", bindingDigest });
    const reservation = store.reserve({ operationId: selectionOperation, requestDigest, modelUnits: 0, runtimeUnits: 1 });
    if (reservation.reservation.state === "SETTLED") return freeze(JSON.parse(reservation.reservation.result_json));
    const fence = store.markUnknownUsage(selectionOperation);
    if (!fence.dispatchGranted) ccpStrictDenyV1("NATIVE_RUNTIME_SELECTION_OUTCOME_UNKNOWN");
    const observed = { state: "TEMPLATE_SELECTED", runtimeTemplateDigest: template.runtimeTemplateDigest, identityDigest: template.identityDigest, effectiveRights: template.identity.effectiveRights, executionAuthorityGranted: false };
    const evidence = store.ownerCompletionEvidence({ operationId: selectionOperation, requestDigest, modelUnits: 0, runtimeUnits: 1, evidenceDigest: hash(observed) });
    store.settle(evidence, observed);
    return freeze(observed);
  };
  const perform = async (request, requestDigest) => {
    const reservation = store.reserve({ operationId: request.operationId, requestDigest, modelUnits: template.resourceClass.modelReservationUnits, runtimeUnits: template.resourceClass.runtimeReservationUnits });
    if (reservation.reservation.state === "SETTLED") return freeze(JSON.parse(reservation.reservation.result_json));
    const fence = store.markUnknownUsage(request.operationId);
    if (!fence.dispatchGranted) return freeze({ outcome: "QUARANTINE", state: "UNKNOWN_USAGE", response: null, issues: ["RESOURCE_BUDGET_UNKNOWN_USAGE_RETAINED"], operationId: request.operationId, dispatchGranted: false, executionAuthorityGranted: false });
    let providerDispatchAttempted = false;
    const observed = await broker.invoke(request, async (boundRequest, signal) => {
      providerDispatchAttempted = true;
      return snapshotData(await options.syntheticProvider(boundRequest, signal));
    });
    // Only an owner-witnessed absence of dispatch can prove zero use. A callback
    // failure, timeout, invalid output or lost process leaves the full hold intact.
    if (observed.outcome === "ALLOW" || !providerDispatchAttempted) {
      const usage = observed.outcome === "ALLOW" ? observed.audit.usage : { inputTokens: 0, outputTokens: 0, costMicros: 0 };
      if (usage.costMicros !== 0) ccpStrictDenyV1("NATIVE_RUNTIME_SYNTHETIC_COST_DENIED");
      const evidence = store.ownerCompletionEvidence({ operationId: request.operationId, requestDigest, modelUnits: usage.inputTokens + usage.outputTokens, runtimeUnits: 1, evidenceDigest: hash(observed) });
      store.settle(evidence, observed);
    }
    return freeze(observed);
  };
  const invoke = async (value) => {
    if (!selected()) ccpStrictDenyV1("NATIVE_RUNTIME_TEMPLATE_NOT_SELECTED_DENIED");
    const request = snapshotData(value);
    const guarded = guardModelRequestV1(request, policy);
    if (guarded.outcome !== "ALLOW") ccpStrictDenyV1(guarded.issues.join(","));
    if (request.delegationDigest !== modelBinding.delegationDigest) ccpStrictDenyV1("NATIVE_RUNTIME_DELEGATION_BINDING_DENIED");
    const requestDigest = hash({ kind: "MODEL_DISPATCH", request });
    const prior = inFlight.get(request.operationId);
    if (prior !== undefined) {
      if (prior.requestDigest !== requestDigest) ccpStrictDenyV1("RESOURCE_BUDGET_RETRY_CONFLICT_DENIED");
      return prior.result;
    }
    const result = Promise.resolve().then(() => perform(request, requestDigest));
    inFlight.set(request.operationId, { requestDigest, result });
    try { return await result; } finally { inFlight.delete(request.operationId); }
  };
  return Object.freeze({
    client: Object.freeze({ manifest, plan, invoke, readback: () => freeze({ currentTemplateDigest: selected() ? template.runtimeTemplateDigest : null, budget: store.snapshot(), executionAuthorityGranted: false }) }),
    owner: Object.freeze({ activate, close: () => store.close() }),
  });
}
