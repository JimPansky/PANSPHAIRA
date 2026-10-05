import { createHash } from "node:crypto";
import { canonicalJson } from "../../dist/packages/contracts/src/canonical-json.js";
import { assertCcpDigestV1, assertCcpStringV1, readCcpClosedObjectV1, ccpStrictDenyV1 } from "../../dist/packages/contracts/src/ccp-event-envelope.js";
import { validateRuntimeIdentityV1, runtimeIdentityDigestV1 } from "../pan526/runtime-contract.mjs";

export const RUNTIME_TEMPLATE_SCHEMA_V1 = "pansphaira.portable-runtime/template/v1";
export const RUNTIME_TEMPLATE_PLAN_REQUEST_SCHEMA_V1 = "pansphaira.portable-runtime/template-plan-request/v1";
const denied = "RUNTIME_TEMPLATE_PLAN_DENIED";
const hash = (value) => createHash("sha256").update(canonicalJson(value)).digest("hex");
const freeze = (value) => {
  if (value !== null && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
};

/** Pure binding to an owner's existing qualified identity; no new qualification or grant. */
export function bindRuntimeTemplateV1(expectedIdentity) {
  const identity = validateRuntimeIdentityV1(expectedIdentity);
  const body = {
    schemaVersion: RUNTIME_TEMPLATE_SCHEMA_V1,
    templateId: `bounded-${identity.componentId}-v1`,
    identity,
    identityDigest: runtimeIdentityDigestV1(identity),
    providerMode: "SYNTHETIC_ONLY",
    resourceClass: {
      name: "bounded-native-read-v1", modelReservationUnits: 64, runtimeReservationUnits: 1,
      maxInputBytes: 4096, maxOutputBytes: 8192, maxTokens: 32, maxRequests: 32, timeoutMs: 20_000,
    },
    activationAuthorized: false,
  };
  return freeze({ ...body, runtimeTemplateDigest: hash(body) });
}

/** Client input selects an immutable server template, never rights, policy or commands. */
export function planRuntimeTemplateV1(candidate, expectedIdentity, currentTemplateDigest = null) {
  const command = readCcpClosedObjectV1(candidate, ["schemaVersion", "operationId", "componentId", "templateId", "identityDigest", "runtimeTemplateDigest"], new WeakSet(), denied);
  const template = bindRuntimeTemplateV1(expectedIdentity);
  assertCcpStringV1(command.operationId, /^operation:[a-z0-9][a-z0-9._-]{2,63}$/, denied);
  if (command.schemaVersion !== RUNTIME_TEMPLATE_PLAN_REQUEST_SCHEMA_V1 || command.componentId !== template.identity.componentId
      || command.templateId !== template.templateId || command.identityDigest !== template.identityDigest || command.runtimeTemplateDigest !== template.runtimeTemplateDigest) ccpStrictDenyV1(denied);
  if (currentTemplateDigest !== null) assertCcpDigestV1(currentTemplateDigest, denied);
  const diff = {
    from: currentTemplateDigest, to: template.runtimeTemplateDigest,
    componentId: template.identity.componentId, effectiveRights: template.identity.effectiveRights,
    sourceTemplateDigest: template.identity.templateDigest, policyDigest: template.identity.policyDigest,
    networkDigest: template.identity.networkDigest, resourceClass: template.resourceClass,
  };
  const humanReadableDiff = [
    `Template: ${currentTemplateDigest ?? "not selected"} -> ${template.runtimeTemplateDigest}`,
    `Component: ${diff.componentId}; rights unchanged: ${diff.effectiveRights.join(", ")}`,
    `Template/Policy/Network: ${diff.sourceTemplateDigest}/${diff.policyDigest}/${diff.networkDigest}`,
    `Resource class: ${diff.resourceClass.name}; model reserve <= ${diff.resourceClass.modelReservationUnits}; runtime reserve <= ${diff.resourceClass.runtimeReservationUnits}`,
    "Provider mode: SYNTHETIC_ONLY; no paid provider or business pricing.",
    "Plan only: no activation, budget reservation, dispatch or rights grant.",
  ].join("\n");
  const body = { schemaVersion: "pansphaira.portable-runtime/template-plan/v1", operationId: command.operationId, identityDigest: template.identityDigest, runtimeTemplateDigest: template.runtimeTemplateDigest, diff, humanReadableDiff, planOnly: true, activationAuthorized: false };
  return freeze({ ...body, planDigest: hash(body) });
}
