import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

// Contract-shape examples are not product/runtime qualification.
const deniedExtra = "synthetic-denied-extra";
const identity = () => ({
  schemaVersion: "pansphaira.portable-runtime/identity/v1",
  componentId: "pansphaira-local-demo",
  sourceCommit: "39720e8862911df72bc674ad52f813e2df2f3d1e",
  sourceTree: "a958b381bd766a848b754058d018e63a354f1754",
  imageDigest: "sha256:" + "a".repeat(64),
  architecture: "x86_64",
  productVersion: "0.2.0-poc.20260810.5",
  runtime: { name: "node", version: "24.14.1" },
  contractVersion: "1.0.0",
  instanceId: "pan-local-contract-test",
  tenantId: "panskys-zoo-demo",
  generation: 1,
  configurationDigest: "b".repeat(64),
  templateDigest: "c".repeat(64),
  policyDigest: "d".repeat(64),
  networkDigest: "e".repeat(64),
  authorityProfile: "SAFE_GUIDED",
  effectiveRights: ["demo.status.read", "demo.provider.bound.read", "demo.governed.effect"],
});

test("portable identity binds immutable component, versions and generation without rights or secret extras", async () => {
  assert.ok(existsSync(new URL("../../src/pan526/runtime-contract.mjs", import.meta.url)),
    "portable runtime identity contract validator must exist on the actual product path");
  const { validateRuntimeIdentityV1, runtimeIdentityDigestV1 } = await import("../../src/pan526/runtime-contract.mjs");
  const original = identity();
  const validated = validateRuntimeIdentityV1(original);
  assert.deepEqual(validated, original);
  assert.ok(Object.isFrozen(validated) && Object.isFrozen(validated.runtime) && Object.isFrozen(validated.effectiveRights));
  original.runtime.version = "24.0.0";
  assert.equal(validated.runtime.version, "24.14.1");
  assert.match(runtimeIdentityDigestV1(validated), /^[a-f0-9]{64}$/);
  const orderOnly = Object.fromEntries(Object.entries(validated).reverse());
  assert.equal(runtimeIdentityDigestV1(orderOnly), runtimeIdentityDigestV1(validated));
  for (const change of [
    (v) => { v.sourceCommit = "main"; },
    (v) => { v.imageDigest = "node:latest"; },
    (v) => { v.generation = 0; },
    (v) => { v.componentId = "caller-agent"; },
    (v) => { v.effectiveRights.push("host.shell.execute"); },
    (v) => { v.password = deniedExtra; },
    (v) => { v.runtime.apiKey = deniedExtra; },
    (v) => { v.authorityProfile = "RAMPAGE"; },
    (v) => { v.contractVersion = "latest"; },
    (v) => { v.sourceCommit = v.sourceCommit.toUpperCase(); },
  ]) {
    const candidate = identity(); change(candidate);
    assert.throws(() => validateRuntimeIdentityV1(candidate), /RUNTIME_IDENTITY_DENIED/);
  }
  let getterCalls = 0;
  const accessor = identity();
  Object.defineProperty(accessor, "generation", { enumerable: true, get() { getterCalls++; return 1; } });
  assert.throws(() => validateRuntimeIdentityV1(accessor), /RUNTIME_IDENTITY_DENIED/);
  assert.equal(getterCalls, 0, "caller accessors must not execute during validation");
});

test("actual identity validator binds the KS Node agent and rejects the distinct Superset runtime", async () => {
  const { validateRuntimeIdentityV1 } = await import("../../src/pan526/runtime-contract.mjs");
  const agent = identity();
  agent.componentId = "kaleidosphere-bi-agent";
  agent.productVersion = "0.18.1";
  agent.runtime = { name: "node", version: "24.14.0" };
  agent.effectiveRights = ["bi.catalog.read"];
  assert.doesNotThrow(() => validateRuntimeIdentityV1(agent),
    "actual validator must accept the separately observed KS Node-agent binding");
  const wrongRuntime = structuredClone(agent);
  wrongRuntime.runtime = { name: "superset", version: "6.1.0" };
  assert.throws(() => validateRuntimeIdentityV1(wrongRuntime), /RUNTIME_IDENTITY_DENIED/,
    "separate Superset runtime must not be relabeled as the BI agent");
  const wrongRights = structuredClone(agent); wrongRights.effectiveRights = ["demo.governed.effect"];
  assert.throws(() => validateRuntimeIdentityV1(wrongRights), /RUNTIME_IDENTITY_DENIED/);
});

test("portable desired and observed states are separate, immutable and carry only opaque secret references", async () => {
  const runtime = await import("../../src/pan526/runtime-contract.mjs");
  assert.equal(typeof runtime.validateRuntimeDesiredStateV1, "function",
    "desired state must have its own data-only validator");
  assert.equal(typeof runtime.validateRuntimeObservedStateV1, "function");
  const secretReferences = [{ slot: "api-auth", referenceId: "opaque:" + "7".repeat(32) }];
  const desired = { schemaVersion: "pansphaira.portable-runtime/desired/v1", identity: identity(), phase: "running", secretReferences };
  const observed = { schemaVersion: "pansphaira.portable-runtime/observed/v1", identity: identity(), phase: "stopped", secretReferences, observedAtMs: 1791129600000 };
  const d = runtime.validateRuntimeDesiredStateV1(desired);
  const o = runtime.validateRuntimeObservedStateV1(observed);
  assert.equal(d.phase, "running"); assert.equal(o.phase, "stopped");
  assert.ok(Object.isFrozen(d) && Object.isFrozen(o) && Object.isFrozen(d.secretReferences[0]));
  assert.throws(() => runtime.validateRuntimeDesiredStateV1(observed), /RUNTIME_DESIRED_STATE_DENIED/);
  assert.throws(() => runtime.validateRuntimeObservedStateV1(desired), /RUNTIME_OBSERVED_STATE_DENIED/);
  for (const referenceId of ["/run/secrets/api_token", "secret-value", "https://caller.invalid/token"]) {
    const wrong = structuredClone(desired); wrong.secretReferences[0].referenceId = referenceId;
    assert.throws(() => runtime.validateRuntimeDesiredStateV1(wrong), /RUNTIME_DESIRED_STATE_DENIED/);
  }
  const leaked = structuredClone(observed); leaked.secretReferences[0].value = "synthetic-extra-secret";
  assert.throws(() => runtime.validateRuntimeObservedStateV1(leaked), /RUNTIME_OBSERVED_STATE_DENIED/);
});

test("lifecycle jobs are audience tenant generation and digest bound with outcome_unknown preserved", async () => {
  const runtime = await import("../../src/pan526/runtime-contract.mjs");
  assert.equal(typeof runtime.validateRuntimeLifecycleJobV1, "function", "typed lifecycle validator must exist");
  const expectedIdentity = identity();
  const desiredState = { schemaVersion: "pansphaira.portable-runtime/desired/v1", identity: identity(), phase: "running", secretReferences: [] };
  const context = { expectedIdentity, desiredState, nowMs: 1791129600000 };
  const job = { schemaVersion: "pansphaira.portable-runtime/lifecycle-job/v1", jobId: "runtime-start-one", action: "start", audience: "pansphaira-local-runtime-v1", tenantId: expectedIdentity.tenantId, instanceId: expectedIdentity.instanceId, componentId: expectedIdentity.componentId, generation: expectedIdentity.generation, identityDigest: runtime.runtimeIdentityDigestV1(expectedIdentity), desiredStateDigest: runtime.runtimeDesiredStateDigestV1(desiredState), issuedAtMs: context.nowMs, deadlineMs: 30000 };
  const bound = runtime.validateRuntimeLifecycleJobV1(job, context);
  assert.ok(Object.isFrozen(bound));
  for (const change of [
    (v) => { v.audience = "kaleidosphere-runtime-v1"; },
    (v) => { v.tenantId = "foreign-tenant"; },
    (v) => { v.instanceId = "foreign-instance"; },
    (v) => { v.generation++; },
    (v) => { v.identityDigest = "9".repeat(64); },
    (v) => { v.desiredStateDigest = "9".repeat(64); },
    (v) => { v.action = "shell"; },
    (v) => { v.action = "stop"; },
    (v) => { v.issuedAtMs -= 60001; },
    (v) => { v.role = "owner"; },
  ]) {
    const wrong = structuredClone(job); change(wrong);
    assert.throws(() => runtime.validateRuntimeLifecycleJobV1(wrong, context), /RUNTIME_LIFECYCLE_JOB_DENIED/);
  }
  const receipt = { schemaVersion: "pansphaira.portable-runtime/lifecycle-receipt/v1", jobId: job.jobId, jobDigest: runtime.runtimeLifecycleJobDigestV1(job, context), outcome: "outcome_unknown", reasonCode: "DISPATCH_INTERRUPTED", observedStateDigest: null, completedAtMs: context.nowMs, executionAuthorityGranted: false };
  const unknown = runtime.validateRuntimeLifecycleReceiptV1(receipt);
  assert.equal(unknown.outcome, "outcome_unknown");
  assert.ok(Object.isFrozen(unknown));
  const invented = structuredClone(receipt); invented.outcome = "success-by-liveness";
  assert.throws(() => runtime.validateRuntimeLifecycleReceiptV1(invented), /RUNTIME_LIFECYCLE_RECEIPT_DENIED/);
});

test("lifecycle failed receipts require a definitive observation and cannot relabel success or unknown", async () => {
  const { validateRuntimeLifecycleReceiptV1 } = await import("../../src/pan526/runtime-contract.mjs");
  const receipt = { schemaVersion: "pansphaira.portable-runtime/lifecycle-receipt/v1", jobId: "receipt-combination-test", jobDigest: "8".repeat(64), outcome: "failed", reasonCode: "OBSERVED_TARGET_NOT_REACHED", observedStateDigest: "9".repeat(64), completedAtMs: 1791129600000, executionAuthorityGranted: false };
  assert.equal(validateRuntimeLifecycleReceiptV1(receipt).outcome, "failed");
  assert.equal(validateRuntimeLifecycleReceiptV1({ ...receipt, reasonCode: "DISPATCH_FAILED" }).outcome, "failed");
  for (const reasonCode of ["OBSERVED_TARGET_REACHED", "DISPATCH_INTERRUPTED"]) {
    assert.throws(() => validateRuntimeLifecycleReceiptV1({ ...receipt, reasonCode }), /RUNTIME_LIFECYCLE_RECEIPT_DENIED/,
      "failed must not claim a reached target or relabel an interrupted unknown outcome");
  }
  for (const reasonCode of ["OBSERVED_TARGET_NOT_REACHED", "DISPATCH_FAILED"]) {
    assert.throws(() => validateRuntimeLifecycleReceiptV1({ ...receipt, reasonCode, observedStateDigest: null }), /RUNTIME_LIFECYCLE_RECEIPT_DENIED/,
      "lack of a definitive observation is not evidence of failed outcome");
  }
  assert.equal(validateRuntimeLifecycleReceiptV1({ ...receipt, outcome: "succeeded", reasonCode: "OBSERVED_TARGET_REACHED" }).outcome, "succeeded");
  assert.equal(validateRuntimeLifecycleReceiptV1({ ...receipt, outcome: "outcome_unknown", reasonCode: "DISPATCH_INTERRUPTED", observedStateDigest: null }).outcome, "outcome_unknown");
  const { readFileSync } = await import("node:fs");
  const { default: Ajv2020 } = await import("ajv/dist/2020.js");
  const schema = JSON.parse(readFileSync(new URL("../../contracts/runtime-portability/portable-runtime-v1.schema.json", import.meta.url), "utf8"));
  const ajv = new Ajv2020({ strict: true }); ajv.addSchema(schema);
  const validateSchema = ajv.compile({ $ref: `${schema.$id}#/$defs/LifecycleReceipt` });
  const allowed = new Set(["succeeded/OBSERVED_TARGET_REACHED/digest", "failed/OBSERVED_TARGET_NOT_REACHED/digest", "failed/DISPATCH_FAILED/digest", "outcome_unknown/DISPATCH_INTERRUPTED/null"]);
  for (const outcome of ["succeeded", "failed", "outcome_unknown"]) {
    for (const reasonCode of ["OBSERVED_TARGET_REACHED", "OBSERVED_TARGET_NOT_REACHED", "DISPATCH_FAILED", "DISPATCH_INTERRUPTED"]) {
      for (const observedStateDigest of [null, "9".repeat(64)]) {
        const value = { ...receipt, outcome, reasonCode, observedStateDigest };
        const expected = allowed.has(`${outcome}/${reasonCode}/${observedStateDigest === null ? "null" : "digest"}`);
        assert.equal(validateSchema(value), expected, "wire schema must bind every outcome/reason/digest combination");
        if (expected) assert.doesNotThrow(() => validateRuntimeLifecycleReceiptV1(value));
        else assert.throws(() => validateRuntimeLifecycleReceiptV1(value), /RUNTIME_LIFECYCLE_RECEIPT_DENIED/);
      }
    }
  }
});

test("readiness requires bound business and isolation observations rather than HTTP liveness", async () => {
  const runtime = await import("../../src/pan526/runtime-contract.mjs");
  assert.equal(typeof runtime.assessRuntimeReadinessV1, "function",
    "actual portable readiness assessor must compare business and observed runtime bindings");
  const request = () => ({
    expectedIdentity: identity(), observedIdentity: identity(), observedAtMs: 1791129600000,
    probe: {
      probeId: "pansphaira-demo-order-readback-v1", httpStatus: 200,
      expectedValueDigest: "1".repeat(64), observedValueDigest: "1".repeat(64),
      sourceObservationDigest: "2".repeat(64),
    },
    boundaryObservation: { loopbackOnly: true, privileged: false, dockerSocketMounted: false, ownedResourcesOnly: true },
  });
  const ready = runtime.assessRuntimeReadinessV1(request());
  assert.equal(ready.state, "READY");
  assert.deepEqual(ready.reasonCodes, []);
  assert.equal(ready.executionAuthorityGranted, false);
  assert.ok(Object.isFrozen(ready) && Object.isFrozen(ready.probe));
  const wrongBusiness = request(); wrongBusiness.probe.observedValueDigest = "3".repeat(64);
  const notReady = runtime.assessRuntimeReadinessV1(wrongBusiness);
  assert.equal(notReady.state, "NOT_READY", "HTTP200 with a false business value is not ready");
  assert.deepEqual(notReady.reasonCodes, ["BUSINESS_PROBE_MISMATCH"]);
  const wrongGeneration = request(); wrongGeneration.observedIdentity.generation++;
  assert.deepEqual(runtime.assessRuntimeReadinessV1(wrongGeneration).reasonCodes, ["RUNTIME_IDENTITY_MISMATCH"]);
  const wrongHttp = request(); wrongHttp.probe.httpStatus = 503;
  assert.deepEqual(runtime.assessRuntimeReadinessV1(wrongHttp).reasonCodes, ["BUSINESS_PROBE_HTTP_FAILED"]);
  const wrongIsolation = request(); wrongIsolation.boundaryObservation.dockerSocketMounted = true;
  assert.deepEqual(runtime.assessRuntimeReadinessV1(wrongIsolation).reasonCodes, ["RUNTIME_BOUNDARY_DENIED"]);
  const extra = request(); extra.probe.password = deniedExtra;
  assert.throws(() => runtime.assessRuntimeReadinessV1(extra), /RUNTIME_READINESS_INPUT_DENIED/);
  const forgedReceipt = request(); forgedReceipt.state = "READY";
  assert.throws(() => runtime.assessRuntimeReadinessV1(forgedReceipt), /RUNTIME_READINESS_INPUT_DENIED/);
});
