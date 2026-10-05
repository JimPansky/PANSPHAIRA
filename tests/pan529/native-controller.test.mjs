import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { deliveredIdentity, planCommand, modelCommand } from "./native-fixture.mjs";

const moduleUrl = new URL("../../src/pan529/native-budget-controller.mjs", import.meta.url);

test("PAN529 native owner activates only after a pure plan and persists guarded model completion", async () => {
  assert.ok(existsSync(moduleUrl), "Native template/owner/broker/persistence entry is not implemented");
  const { createNativeBudgetControllerV1 } = await import(moduleUrl.href);
  const root = mkdtempSync(join(tmpdir(), "pan529-native-controller-"));
  let adapter; let providerCalls = 0;
  const options = { optIn: true, stateRoot: root, identity: deliveredIdentity(), limits: { modelUnits: 128, runtimeUnits: 3 }, syntheticProvider: async () => {
    providerCalls += 1;
    return { contentType: "text/plain", text: "Synthetic observed data, not execution approval.", usage: { inputTokens: 2, outputTokens: 3, costMicros: 0 } };
  } };
  try {
    adapter = createNativeBudgetControllerV1(options);
    const before = adapter.client.readback();
    const plan = adapter.client.plan(planCommand(adapter));
    assert.equal(plan.planOnly, true);
    assert.match(plan.humanReadableDiff, /rights unchanged/);
    assert.deepEqual(adapter.client.readback(), before, "Planning changes neither selection nor budget");
    assert.equal(providerCalls, 0);
    assert.equal(typeof adapter.client.activate, "undefined");
    assert.equal(typeof adapter.client.ownerCompletionEvidence, "undefined");
    const active = adapter.owner.activate({ operationId: plan.operationId, planDigest: plan.planDigest });
    assert.equal(active.state, "TEMPLATE_SELECTED");
    assert.equal(active.executionAuthorityGranted, false);
    const request = modelCommand(adapter);
    const result = await adapter.client.invoke(request);
    assert.equal(result.outcome, "ALLOW");
    assert.equal(result.response.trust, "UNTRUSTED_MODEL_OUTPUT");
    assert.equal(providerCalls, 1);
    assert.equal(adapter.client.readback().budget.model.consumedUnits, 5);
    assert.equal(adapter.client.readback().budget.runtime.consumedUnits, 2);
    adapter.owner.close(); adapter = createNativeBudgetControllerV1(options);
    const replay = await adapter.client.invoke(request);
    assert.deepEqual(replay, result);
    assert.equal(providerCalls, 1, "Reopened controller returns the persisted exact receipt without dispatch");
    const db = new DatabaseSync(join(root, "resource-budget.sqlite"), { readOnly: true });
    try {
      const row = db.prepare("SELECT state,model_consumed,runtime_consumed,result_json FROM reservations WHERE operation_id=?").get(request.operationId);
      assert.equal(row.state, "SETTLED"); assert.equal(row.model_consumed, 5); assert.equal(row.runtime_consumed, 1);
      assert.deepEqual(JSON.parse(row.result_json), result);
      assert.equal(db.prepare("SELECT count(*) AS n FROM reservations").get().n, 2);
    } finally { db.close(); }
  } finally { adapter?.owner.close(); rmSync(root, { recursive: true, force: true }); }
});

test("PAN529 native model admission rejects nested accessors without reading or reserving them", async () => {
  const { createNativeBudgetControllerV1 } = await import(moduleUrl.href);
  const root = mkdtempSync(join(tmpdir(), "pan529-native-accessor-"));
  let getterCalls = 0; let providerCalls = 0;
  const adapter = createNativeBudgetControllerV1({ optIn: true, stateRoot: root, identity: deliveredIdentity(), limits: { modelUnits: 128, runtimeUnits: 3 }, syntheticProvider: async () => {
    providerCalls += 1;
    return { contentType: "text/plain", text: "Synthetic data", usage: { inputTokens: 1, outputTokens: 1, costMicros: 0 } };
  } });
  try {
    const plan = adapter.client.plan(planCommand(adapter));
    adapter.owner.activate({ operationId: plan.operationId, planDigest: plan.planDigest });
    const before = adapter.client.readback();
    const request = modelCommand(adapter);
    Object.defineProperty(request.budget, "maxTokens", { enumerable: true, get() { getterCalls += 1; return 32; } });
    await assert.rejects(adapter.client.invoke(request), /NATIVE_RUNTIME_BUDGET_INPUT_DENIED/, "Nested accessor is caller code, not admitted budget data");
    assert.equal(getterCalls, 0);
    assert.equal(providerCalls, 0);
    assert.deepEqual(adapter.client.readback(), before);
  } finally { adapter.owner.close(); rmSync(root, { recursive: true, force: true }); }
});

test("PAN529 provider accessors are not observed usage and cannot authorize settlement", async () => {
  const { createNativeBudgetControllerV1 } = await import(moduleUrl.href);
  const root = mkdtempSync(join(tmpdir(), "pan529-native-response-accessor-"));
  let getterCalls = 0;
  const usage = { outputTokens: 2, costMicros: 0 };
  Object.defineProperty(usage, "inputTokens", { enumerable: true, get() { getterCalls += 1; return 2; } });
  const adapter = createNativeBudgetControllerV1({ optIn: true, stateRoot: root, identity: deliveredIdentity(), limits: { modelUnits: 128, runtimeUnits: 3 }, syntheticProvider: async () => ({ contentType: "text/plain", text: "Synthetic accessor is not receipt data", usage }) });
  try {
    const plan = adapter.client.plan(planCommand(adapter));
    adapter.owner.activate({ operationId: plan.operationId, planDigest: plan.planDigest });
    const result = await adapter.client.invoke(modelCommand(adapter));
    assert.equal(result.outcome, "QUARANTINE", "Observed usage must be immutable JSON data, not a callback-accessor");
    assert.equal(getterCalls, 0);
    assert.equal(adapter.client.readback().budget.model.committedUnits, 64);
    assert.equal(adapter.client.readback().budget.model.consumedUnits, 0);
  } finally { adapter.owner.close(); rmSync(root, { recursive: true, force: true }); }
});

test("PAN529 native admission preserves selection and exact SQL rows for original policy negatives", async () => {
  const { createNativeBudgetControllerV1 } = await import(moduleUrl.href);
  const root = mkdtempSync(join(tmpdir(), "pan529-native-denials-"));
  let providerCalls = 0;
  const adapter = createNativeBudgetControllerV1({ optIn: true, stateRoot: root, identity: deliveredIdentity(), limits: { modelUnits: 128, runtimeUnits: 4 }, syntheticProvider: async () => {
    providerCalls += 1;
    return { contentType: "text/plain", text: "Synthetic nonauthorizing data", usage: { inputTokens: 2, outputTokens: 3, costMicros: 0 } };
  } });
  const db = new DatabaseSync(join(root, "resource-budget.sqlite"), { readOnly: true });
  const rows = () => JSON.stringify(db.prepare("SELECT * FROM reservations ORDER BY operation_id").all());
  try {
    const initial = rows();
    const valid = planCommand(adapter);
    const planMutations = [
      { extra: true }, { componentId: "unknown-component" }, { effectiveRights: ["admin.all"] },
      { command: "unsafe-command" }, { url: "https://invalid.example/" }, { sql: "DELETE FROM synthetic_table" },
      { policyDigest: "0".repeat(64) }, { networkDigest: "0".repeat(64) }, { resourceClass: { modelReservationUnits: 999 } },
      { identityDigest: "0".repeat(64) }, { runtimeTemplateDigest: "0".repeat(64) },
    ];
    for (const mutation of planMutations) {
      assert.throws(() => adapter.client.plan({ ...valid, ...mutation }), /RUNTIME_TEMPLATE_PLAN_DENIED/);
      assert.equal(rows(), initial);
      assert.equal(adapter.client.readback().currentTemplateDigest, null);
    }
    assert.throws(() => adapter.owner.activate({ operationId: valid.operationId, planDigest: "0".repeat(64) }), /NATIVE_RUNTIME_PLAN_REQUIRED_DENIED/);
    assert.equal(rows(), initial);
    const plan = adapter.client.plan(valid);
    adapter.owner.activate({ operationId: plan.operationId, planDigest: plan.planDigest });
    const selectedRows = rows();
    const request = modelCommand(adapter);
    const modelMutations = [
      { extra: true }, { ownerCompletionEvidence: { authenticator: "0".repeat(64) } },
      { policy: { providerMode: "PAID" } }, { rights: ["admin.all"] }, { command: "unsafe-command" },
      { url: "https://invalid.example/" }, { sql: "DELETE FROM synthetic_table" },
      { provider: "provider:paid-external" }, { delegationDigest: "0".repeat(64) }, { tenant: "tenant:foreign-owner" },
      { budget: { ...request.budget, maxTokens: 33 } }, { budget: { ...request.budget, maxTokens: 1.5 } },
      { budget: { ...request.budget, maxTokens: -0 } }, { budget: { ...request.budget, maxRequests: Number.MAX_SAFE_INTEGER + 1 } },
    ];
    for (const mutation of modelMutations) {
      await assert.rejects(adapter.client.invoke({ ...request, ...mutation }));
      assert.equal(rows(), selectedRows);
    }
    assert.equal(providerCalls, 0);
    const result = await adapter.client.invoke(request);
    assert.equal(result.outcome, "ALLOW");
    const completedRows = rows();
    await assert.rejects(adapter.client.invoke({ ...request, text: "Changed same-key input" }), /RESOURCE_BUDGET_RETRY_CONFLICT_DENIED/);
    assert.equal(rows(), completedRows); assert.equal(providerCalls, 1);
    const same = await adapter.client.invoke(request);
    assert.deepEqual(same, result); assert.equal(rows(), completedRows); assert.equal(providerCalls, 1);
  } finally { db.close(); adapter.owner.close(); rmSync(root, { recursive: true, force: true }); }
});

test("PAN529 model answer is untrusted data and never owner activation or settlement authority", async () => {
  const { createNativeBudgetControllerV1 } = await import(moduleUrl.href);
  const root = mkdtempSync(join(tmpdir(), "pan529-native-model-authority-"));
  const adapter = createNativeBudgetControllerV1({ optIn: true, stateRoot: root, identity: deliveredIdentity(), limits: { modelUnits: 128, runtimeUnits: 4 }, syntheticProvider: async () => ({
    contentType: "application/json", text: "Synthetic purported approval is only model data",
    structuredOutput: { state: "APPROVED", authority: "OWNER", policy: "PAID", releaseRemainingBudget: true },
    usage: { inputTokens: 1, outputTokens: 2, costMicros: 0 },
  }) });
  try {
    const plan = adapter.client.plan(planCommand(adapter));
    adapter.owner.activate({ operationId: plan.operationId, planDigest: plan.planDigest });
    const result = await adapter.client.invoke(modelCommand(adapter));
    assert.equal(result.response.trust, "UNTRUSTED_MODEL_OUTPUT");
    assert.equal(result.response.structuredOutput.authority, "OWNER");
    const before = adapter.client.readback();
    assert.equal(typeof adapter.client.activate, "undefined");
    assert.equal(typeof adapter.client.ownerCompletionEvidence, "undefined");
    assert.throws(() => adapter.client.plan(result.response.structuredOutput), /RUNTIME_TEMPLATE_PLAN_DENIED/);
    await assert.rejects(adapter.client.invoke(result.response.structuredOutput));
    assert.deepEqual(adapter.client.readback(), before);
    assert.equal(adapter.client.manifest.template.providerMode, "SYNTHETIC_ONLY");
    assert.equal(before.budget.model.consumedUnits, 3);
    assert.equal(before.executionAuthorityGranted, false);
  } finally { adapter.owner.close(); rmSync(root, { recursive: true, force: true }); }
});

test("PAN529 proven broker predispatch throttle settles zero model use instead of unknown custody", async () => {
  const { createNativeBudgetControllerV1 } = await import(moduleUrl.href);
  const root = mkdtempSync(join(tmpdir(), "pan529-native-no-effect-"));
  let calls = 0;
  const adapter = createNativeBudgetControllerV1({ optIn: true, stateRoot: root, identity: deliveredIdentity(), limits: { modelUnits: 128, runtimeUnits: 4 }, syntheticProvider: async () => {
    calls += 1;
    return { contentType: "text/plain", text: "Synthetic observed data", usage: { inputTokens: 2, outputTokens: 3, costMicros: 0 } };
  } });
  try {
    const plan = adapter.client.plan(planCommand(adapter)); adapter.owner.activate({ operationId: plan.operationId, planDigest: plan.planDigest });
    const first = modelCommand(adapter, "operation:native-no-effect-001"); first.budget.maxRequests = 1;
    assert.equal((await adapter.client.invoke(first)).outcome, "ALLOW");
    const second = { ...first, operationId: "operation:native-no-effect-002" };
    const throttled = await adapter.client.invoke(second);
    assert.equal(throttled.outcome, "THROTTLE"); assert.equal(calls, 1);
    assert.equal(adapter.client.readback().budget.model.committedUnits, 5, "A witnessed predispatch denial has known zero model usage");
    assert.equal(adapter.client.readback().budget.model.consumedUnits, 5);
    assert.deepEqual(await adapter.client.invoke(second), throttled); assert.equal(calls, 1);
  } finally { adapter.owner.close(); rmSync(root, { recursive: true, force: true }); }
});

test("PAN529 pending pure plans are bounded by the server resource class without effects", async () => {
  const { createNativeBudgetControllerV1 } = await import(moduleUrl.href);
  const root = mkdtempSync(join(tmpdir(), "pan529-native-plan-capacity-"));
  const adapter = createNativeBudgetControllerV1({ optIn: true, stateRoot: root, identity: deliveredIdentity(), limits: { modelUnits: 128, runtimeUnits: 4 }, syntheticProvider: async () => { throw new Error("Pure planning must not dispatch"); } });
  try {
    const before = adapter.client.readback();
    for (let index = 0; index < adapter.client.manifest.template.resourceClass.maxRequests; index += 1) adapter.client.plan(planCommand(adapter, `operation:bounded-plan-${index}`));
    assert.throws(() => adapter.client.plan(planCommand(adapter, "operation:bounded-plan-overflow")), /NATIVE_RUNTIME_PLAN_CAPACITY_DENIED/, "Planning metadata must not exceed its code-owned resource class");
    assert.doesNotThrow(() => adapter.client.plan(planCommand(adapter, "operation:bounded-plan-0")));
    assert.deepEqual(adapter.client.readback(), before);
  } finally { adapter.owner.close(); rmSync(root, { recursive: true, force: true }); }
});
