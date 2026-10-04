import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { canonicalJson } from "../../dist/packages/contracts/src/canonical-json.js";

// Shape validation is not observed runtime qualification or an execution grant.
const schema = JSON.parse(readFileSync(new URL("../../contracts/runtime-portability/portable-runtime-v1.schema.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ strict: true, allErrors: false, coerceTypes: false, removeAdditional: false, useDefaults: false });
ajv.addSchema(schema);
const identityValidator = ajv.compile({ $ref: `${schema.$id}#/$defs/RuntimeIdentity` });
const readinessInputValidator = ajv.compile({ $ref: `${schema.$id}#/$defs/ReadinessAssessmentInput` });
const readinessReceiptValidator = ajv.compile({ $ref: `${schema.$id}#/$defs/ReadinessReceipt` });
const desiredStateValidator = ajv.compile({ $ref: `${schema.$id}#/$defs/DesiredState` });
const observedStateValidator = ajv.compile({ $ref: `${schema.$id}#/$defs/ObservedState` });
const lifecycleJobValidator = ajv.compile({ $ref: `${schema.$id}#/$defs/LifecycleJob` });
const lifecycleReceiptValidator = ajv.compile({ $ref: `${schema.$id}#/$defs/LifecycleReceipt` });

function assertPlainData(value, errorCode, seen = new Set(), depth = 0, budget = { remaining: 10_000 }) {
  if (--budget.remaining < 0 || depth > 32) throw new Error(errorCode);
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") {
    if (value.length > 16_384) throw new Error(errorCode);
    return;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) throw new Error(errorCode);
    return;
  }
  if (typeof value !== "object" || seen.has(value)) throw new Error(errorCode);
  if (Object.getPrototypeOf(value) !== (Array.isArray(value) ? Array.prototype : Object.prototype)) throw new Error(errorCode);
  seen.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")) throw new Error(errorCode);
  if (Array.isArray(value)) {
    if (value.length > 10_000 || keys.length !== value.length + 1) throw new Error(errorCode);
    for (let i = 0; i < value.length; i++) {
      const descriptor = descriptors[String(i)];
      if (!descriptor || !descriptor.enumerable || descriptor.get || descriptor.set || descriptor.value === undefined) throw new Error(errorCode);
      assertPlainData(descriptor.value, errorCode, seen, depth + 1, budget);
    }
  } else {
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || descriptor.get || descriptor.set || descriptor.value === undefined) throw new Error(errorCode);
      assertPlainData(descriptor.value, errorCode, seen, depth + 1, budget);
    }
  }
  seen.delete(value);
}

function freezeDeep(value) {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

export function validateRuntimeIdentityV1(value) {
  assertPlainData(value, "RUNTIME_IDENTITY_DENIED");
  if (!identityValidator(value)) throw new Error("RUNTIME_IDENTITY_DENIED");
  return freezeDeep(JSON.parse(canonicalJson(value)));
}

export function runtimeIdentityDigestV1(value) {
  return createHash("sha256").update(canonicalJson(validateRuntimeIdentityV1(value))).digest("hex");
}

function validateState(value, validator, errorCode) {
  assertPlainData(value, errorCode);
  if (!validator(value) || new Set(value.secretReferences.map(({ slot }) => slot)).size !== value.secretReferences.length) {
    throw new Error(errorCode);
  }
  return freezeDeep(JSON.parse(canonicalJson(value)));
}

export function validateRuntimeDesiredStateV1(value) {
  return validateState(value, desiredStateValidator, "RUNTIME_DESIRED_STATE_DENIED");
}

export function validateRuntimeObservedStateV1(value) {
  return validateState(value, observedStateValidator, "RUNTIME_OBSERVED_STATE_DENIED");
}

export function runtimeDesiredStateDigestV1(value) {
  return createHash("sha256").update(canonicalJson(validateRuntimeDesiredStateV1(value))).digest("hex");
}

export function validateRuntimeLifecycleJobV1(value, context) {
  const errorCode = "RUNTIME_LIFECYCLE_JOB_DENIED";
  assertPlainData(value, errorCode); assertPlainData(context, errorCode);
  if (!lifecycleJobValidator(value) || JSON.stringify(Object.keys(context).sort()) !== JSON.stringify(["desiredState", "expectedIdentity", "nowMs"])) throw new Error(errorCode);
  const identity = validateRuntimeIdentityV1(context.expectedIdentity);
  const desired = validateRuntimeDesiredStateV1(context.desiredState);
  const audience = identity.componentId === "pansphaira-local-demo" ? "pansphaira-local-runtime-v1" : "kaleidosphere-runtime-v1";
  if (!Number.isSafeInteger(context.nowMs) || context.nowMs < value.issuedAtMs || context.nowMs - value.issuedAtMs > 60_000
    || value.audience !== audience || value.tenantId !== identity.tenantId || value.instanceId !== identity.instanceId
    || value.componentId !== identity.componentId || value.generation !== identity.generation
    || value.identityDigest !== runtimeIdentityDigestV1(identity)
    || runtimeIdentityDigestV1(desired.identity) !== value.identityDigest
    || value.desiredStateDigest !== runtimeDesiredStateDigestV1(desired)
    || desired.phase !== (value.action === "stop" ? "stopped" : "running")) throw new Error(errorCode);
  return freezeDeep(JSON.parse(canonicalJson(value)));
}

export function runtimeLifecycleJobDigestV1(value, context) {
  return createHash("sha256").update(canonicalJson(validateRuntimeLifecycleJobV1(value, context))).digest("hex");
}

export function validateRuntimeLifecycleReceiptV1(value) {
  assertPlainData(value, "RUNTIME_LIFECYCLE_RECEIPT_DENIED");
  if (!lifecycleReceiptValidator(value)
    || (value.outcome === "outcome_unknown" && (value.observedStateDigest !== null || value.reasonCode !== "DISPATCH_INTERRUPTED"))
    || (value.outcome === "failed" && (value.observedStateDigest === null || !["OBSERVED_TARGET_NOT_REACHED", "DISPATCH_FAILED"].includes(value.reasonCode)))
    || (value.outcome === "succeeded" && (value.observedStateDigest === null || value.reasonCode !== "OBSERVED_TARGET_REACHED"))) {
    throw new Error("RUNTIME_LIFECYCLE_RECEIPT_DENIED");
  }
  return freezeDeep(JSON.parse(canonicalJson(value)));
}

// Trusted adapters supply their own independently bound expected value. This
// comparison API does not collect observations, accept a caller PASS, or open
// any effect route. Wire receipts remain observations, never authorization.
export function assessRuntimeReadinessV1(value) {
  assertPlainData(value, "RUNTIME_READINESS_INPUT_DENIED");
  if (!readinessInputValidator(value)) throw new Error("RUNTIME_READINESS_INPUT_DENIED");
  const expectedIdentityDigest = runtimeIdentityDigestV1(value.expectedIdentity);
  const observedIdentityDigest = runtimeIdentityDigestV1(value.observedIdentity);
  const reasonCodes = [];
  if (expectedIdentityDigest !== observedIdentityDigest) reasonCodes.push("RUNTIME_IDENTITY_MISMATCH");
  if (value.probe.httpStatus !== 200) reasonCodes.push("BUSINESS_PROBE_HTTP_FAILED");
  if (value.probe.expectedValueDigest !== value.probe.observedValueDigest) reasonCodes.push("BUSINESS_PROBE_MISMATCH");
  const expectedProbe = value.expectedIdentity.componentId === "pansphaira-local-demo"
    ? "pansphaira-demo-order-readback-v1" : "kaleidosphere-bi-readback-v1";
  if (value.probe.probeId !== expectedProbe) reasonCodes.push("BUSINESS_PROBE_SCOPE_MISMATCH");
  const boundary = value.boundaryObservation;
  if (!boundary.loopbackOnly || boundary.privileged || boundary.dockerSocketMounted || !boundary.ownedResourcesOnly) {
    reasonCodes.push("RUNTIME_BOUNDARY_DENIED");
  }
  const receipt = {
    schemaVersion: "pansphaira.portable-runtime/readiness/v1",
    state: reasonCodes.length === 0 ? "READY" : "NOT_READY",
    reasonCodes: reasonCodes.sort(),
    expectedIdentityDigest, observedIdentityDigest, observedAtMs: value.observedAtMs,
    probe: value.probe, boundaryObservation: boundary, executionAuthorityGranted: false,
  };
  if (!readinessReceiptValidator(receipt)) throw new Error("RUNTIME_READINESS_RECEIPT_DENIED");
  return freezeDeep(JSON.parse(canonicalJson(receipt)));
}
