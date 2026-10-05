import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RUNTIME_TEMPLATE_PLAN_REQUEST_SCHEMA_V1 } from "../../src/pan529/runtime-template-contract.mjs";
import { syntheticCanonicalModelRequestV1 } from "../../dist/packages/contracts/src/model-access-broker.js";

// Reuse delivered 526 identity as an owner-selected binding, not a new runtime/image qualification.
export function deliveredIdentity() {
  const legacy = JSON.parse(readFileSync(new URL("../../verification/pan526-portable-runtime-evidence-v1.json", import.meta.url), "utf8")).actualNativeIntegration;
  assert.deepEqual(legacy.nativeExpectedIdentity, legacy.nativeObservedIdentity);
  return structuredClone(legacy.nativeExpectedIdentity);
}
export function planCommand(adapter, operationId = "operation:native-plan-001") {
  const template = adapter.client.manifest.template;
  return { schemaVersion: RUNTIME_TEMPLATE_PLAN_REQUEST_SCHEMA_V1, operationId, componentId: template.identity.componentId, templateId: template.templateId, identityDigest: template.identityDigest, runtimeTemplateDigest: template.runtimeTemplateDigest };
}
export function modelCommand(adapter, operationId = "operation:native-model-001") {
  const request = syntheticCanonicalModelRequestV1();
  const binding = adapter.client.manifest.modelBinding;
  request.operationId = operationId;
  request.tenant = binding.tenant;
  request.delegationDigest = binding.delegationDigest;
  request.budget = { ...binding.maxBudget, timeoutMs: 2_000 };
  return request;
}
