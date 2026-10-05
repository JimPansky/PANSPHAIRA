import { createHash } from "node:crypto";
import { canonicalJson } from "../../dist/packages/contracts/src/canonical-json.js";
import { readCcpClosedObjectV1 } from "../../dist/packages/contracts/src/ccp-event-envelope.js";
import { validateRuntimeIdentityV1 } from "../pan526/runtime-contract.mjs";
import { bindRuntimeTemplateV1, planRuntimeTemplateV1, RUNTIME_TEMPLATE_PLAN_REQUEST_SCHEMA_V1 } from "../pan529/runtime-template-contract.mjs";
const closed = (value, keys) => readCcpClosedObjectV1(value, keys, new WeakSet(), "GUIDED_COMMAND_DENIED");

// Owner-local optional pure suggestion broker. No model execution or authority
// is obtained from a proposal. The existing native controller owns all effects.
export function createGuidedHelperBrokerV1(candidate) {
  const options = closed(candidate, ["optIn", "identity", "nativeClient"]);
  const identity = validateRuntimeIdentityV1(options.identity);
  if (options.optIn !== true || identity.authorityProfile !== "SAFE_GUIDED" || typeof options.nativeClient?.command !== "function" || typeof options.nativeClient?.readback !== "function") throw new Error("GUIDED_OWNER_OPT_IN_REQUIRED");
  const binding = Object.freeze({ tenantId: identity.tenantId, instanceId: identity.instanceId, generation: identity.generation });
  if (canonicalJson(options.nativeClient.readback().binding) !== canonicalJson(binding)) throw new Error("GUIDED_BOUND_PRINCIPAL_DENIED");
  const template = bindRuntimeTemplateV1(identity);
  async function command(value, principal) {
    const input = closed(value, ["action", "operationId", "binding"]);
    if (input.action !== "SUGGEST_STARTER") return options.nativeClient.command(value, principal);
    const suppliedBinding = closed(input.binding, ["tenantId", "instanceId", "generation"]);
    if (canonicalJson({ ...suppliedBinding }) !== canonicalJson(binding) || !principal || principal.role !== "reviewer" || principal.tenantId !== binding.tenantId || principal.instanceId !== binding.instanceId || principal.generation !== binding.generation) throw new Error("GUIDED_BOUND_PRINCIPAL_DENIED");
    if (typeof input.operationId !== "string" || !/^operation:[a-z0-9][a-z0-9._-]{2,63}$/.test(input.operationId)) throw new Error("GUIDED_COMMAND_DENIED");
    if (options.nativeClient.readback().status !== "IDLE") throw new Error("GUIDED_STARTER_NOT_IDLE_DENIED");
    const templatePlan = planRuntimeTemplateV1({ schemaVersion: RUNTIME_TEMPLATE_PLAN_REQUEST_SCHEMA_V1, operationId: input.operationId, componentId: identity.componentId, templateId: template.templateId, identityDigest: template.identityDigest, runtimeTemplateDigest: template.runtimeTemplateDigest }, identity);
    const body = { schemaVersion: "pansphaira.guided-native/suggestion/v1", binding, planOnly: true, activationAuthorized: false, modelInvocation: "NOT_REQUESTED", suggestion: { kind: "RUN_CONTROLLED_NATIVE_STARTER", processId: "synthetic-receipt-reservation-v1", receiptQuantity: 10, reservationQuantity: 6, expectedAvailable: 4 }, templatePlan };
    return Object.freeze({ ...body, proposalDigest: createHash("sha256").update(canonicalJson(body)).digest("hex") });
  }
  return Object.freeze({ command, readback: options.nativeClient.readback });
}
