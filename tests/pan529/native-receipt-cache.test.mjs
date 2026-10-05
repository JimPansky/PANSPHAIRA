import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { canonicalJson } from "../../dist/packages/contracts/src/canonical-json.js";
import { ModelAccessBrokerV1, syntheticCanonicalModelRequestV1, syntheticModelAccessPolicyV1 } from "../../dist/packages/contracts/src/model-access-broker.js";
import { createResourceBudgetStoreV1 } from "../../demo/runtime/atomic-resource-budget.mjs";

// Native budget/result persistence is real; provider responses are authorized synthetic inputs.
test("PAN529 persists the actual guarded broker receipt with settlement for replay after reopen", async () => {
  const root = mkdtempSync(join(tmpdir(), "pan529-native-receipt-"));
  let store;
  try {
    const options = { optIn: true, stateRoot: root, tenantId: "tenant:synthetic-zoo", bindingDigest: "a".repeat(64), limits: { modelUnits: 10, runtimeUnits: 10 } };
    store = createResourceBudgetStoreV1(options);
    const request = syntheticCanonicalModelRequestV1();
    request.operationId = "operation:native-receipt-001";
    const requestDigest = createHash("sha256").update(canonicalJson(request)).digest("hex");
    store.reserve({ operationId: request.operationId, requestDigest, modelUnits: 8, runtimeUnits: 1 });
    assert.equal(store.markUnknownUsage(request.operationId).dispatchGranted, true);
    const broker = new ModelAccessBrokerV1(syntheticModelAccessPolicyV1());
    const result = await broker.invoke(request, async () => ({ contentType: "text/plain", text: "Synthetic observed result; not an approval.", usage: { inputTokens: 2, outputTokens: 3, costMicros: 0 } }));
    assert.equal(result.outcome, "ALLOW");
    const used = result.response.usage.inputTokens + result.response.usage.outputTokens;
    const evidenceDigest = createHash("sha256").update(canonicalJson(result)).digest("hex");
    const completion = store.ownerCompletionEvidence({ operationId: request.operationId, requestDigest, modelUnits: used, runtimeUnits: 1, evidenceDigest });
    store.settle(completion, result);
    assert.equal(store.read(request.operationId).result_json, canonicalJson(result), "Settlement and observed broker receipt must commit together");
    store.close(); store = createResourceBudgetStoreV1(options);
    assert.deepEqual(JSON.parse(store.read(request.operationId).result_json), result);
    assert.equal(store.markUnknownUsage(request.operationId).dispatchGranted, false);
    assert.equal(store.snapshot().model.consumedUnits, used);
    const independent = new DatabaseSync(join(root, "resource-budget.sqlite"), { readOnly: true });
    try {
      const persisted = independent.prepare("SELECT state,model_consumed,result_json FROM reservations WHERE operation_id=?").get(request.operationId);
      assert.equal(persisted.state, "SETTLED");
      assert.equal(persisted.model_consumed, used);
      assert.deepEqual(JSON.parse(persisted.result_json), result);
    } finally { independent.close(); }
  } finally { store?.close(); rmSync(root, { recursive: true, force: true }); }
});

test("PAN529 a genuine completion cannot sign a swapped model-answer receipt into native state", () => {
  const root = mkdtempSync(join(tmpdir(), "pan529-result-binding-"));
  const store = createResourceBudgetStoreV1({ optIn: true, stateRoot: root, tenantId: "tenant:synthetic-zoo", bindingDigest: "a".repeat(64), limits: { modelUnits: 10, runtimeUnits: 10 } });
  try {
    const command = { operationId: "operation:result-binding-001", requestDigest: "b".repeat(64), modelUnits: 8, runtimeUnits: 1 };
    store.reserve(command); store.markUnknownUsage(command.operationId);
    const observed = { outcome: "NATIVE_COMPLETED", operationId: command.operationId };
    const digest = createHash("sha256").update(canonicalJson(observed)).digest("hex");
    const evidence = store.ownerCompletionEvidence({ operationId: command.operationId, requestDigest: command.requestDigest, modelUnits: 3, runtimeUnits: 1, evidenceDigest: digest });
    const before = store.read(command.operationId);
    assert.throws(() => store.settle(evidence, { outcome: "MODEL_ANSWER_APPROVED", operationId: command.operationId }), /RESOURCE_BUDGET_OBSERVED_RESULT_BINDING_DENIED/, "Authenticated completion binds the exact observed native result, not an approval-looking replacement");
    assert.deepEqual(store.read(command.operationId), before);
    assert.equal(store.snapshot().model.committedUnits, 8);
    store.settle(evidence, observed);
    assert.equal(store.read(command.operationId).result_json, canonicalJson(observed));
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});
