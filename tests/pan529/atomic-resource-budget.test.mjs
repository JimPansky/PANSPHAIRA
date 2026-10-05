import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createHash } from "node:crypto";
import { Worker } from "node:worker_threads";
import { createResourceBudgetStoreV1 } from "../../demo/runtime/atomic-resource-budget.mjs";

export const budgetOptions = (stateRoot) => ({
  optIn: true, stateRoot, tenantId: "tenant:synthetic-zoo", bindingDigest: "a".repeat(64),
  limits: { modelUnits: 10, runtimeUnits: 10 },
});

test("PAN529 native integer reservation persists once and reopens through shared CCP counters", () => {
  const root = mkdtempSync(join(tmpdir(), "pan529-budget-"));
  try {
    const store = createResourceBudgetStoreV1(budgetOptions(root));
    const command = { operationId: "operation:budget-001", requestDigest: "b".repeat(64), modelUnits: 3, runtimeUnits: 4 };
    assert.equal(store.reserve(command).replayed, false);
    assert.equal(store.reserve(command).replayed, true);
    assert.equal(store.snapshot().model.committedUnits, 3);
    assert.equal(store.snapshot().runtime.committedUnits, 4);
    store.close();
    const reopened = createResourceBudgetStoreV1(budgetOptions(root));
    assert.equal(reopened.snapshot().model.committedUnits, 3);
    reopened.close();
    const independent = new DatabaseSync(join(root, "resource-budget.sqlite"), { readOnly: true });
    assert.deepEqual({ ...independent.prepare("SELECT count(*) AS count, sum(model_units) AS model, sum(runtime_units) AS runtime FROM reservations").get() }, { count: 1, model: 3, runtime: 4 });
    independent.close();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("PAN529 actual100 barrier reservations cannot exceed either persisted integer limit", { timeout: 90_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "pan529-race-"));
  const options = { ...budgetOptions(root), limits: { modelUnits: 40, runtimeUnits: 30 } };
  const workers = [];
  try {
    const ready = [];
    const results = [];
    for (let index = 0; index < 100; index += 1) {
      const worker = new Worker(new URL("./reservation-worker.mjs", import.meta.url), { workerData: { options, index } });
      workers.push(worker);
      let onReady;
      let onResult;
      ready.push(new Promise((resolve, reject) => { onReady = resolve; worker.once("error", reject); }));
      results.push(new Promise((resolve, reject) => { onResult = resolve; worker.once("error", reject); }));
      worker.on("message", (message) => {
        if (message.type === "ready") onReady(message);
        if (message.type === "result") onResult(message);
      });
    }
    assert.equal((await Promise.all(ready)).length, 100);
    for (const worker of workers) worker.postMessage("reserve");
    const observed = await Promise.all(results);
    assert.equal(observed.length, 100);
    const allowed = observed.filter((row) => row.result.allowed);
    const rejected = observed.filter((row) => !row.result.allowed);
    assert.equal(allowed.length, 20);
    assert.equal(rejected.length, 80);
    assert.ok(rejected.every((row) => row.result.code === "RESOURCE_BUDGET_EXHAUSTED_DENIED"));
    const independent = new DatabaseSync(join(root, "resource-budget.sqlite"), { readOnly: true });
    const persisted = { ...independent.prepare("SELECT count(*) AS count, sum(model_units) AS model, sum(runtime_units) AS runtime FROM reservations").get() };
    independent.close();
    assert.deepEqual(persisted, { count: allowed.length, model: 40, runtime: 20 });
    assert.ok(persisted.model <= options.limits.modelUnits && persisted.runtime <= options.limits.runtimeUnits);
    console.log(JSON.stringify({ actualConcurrentReservations: observed.length, independentConnectionsReadyAtBarrier: workers.length, accepted: allowed.length, denied: rejected.length, persisted }));
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()));
    rmSync(root, { recursive: true, force: true });
  }
});

test("PAN529 unknownUsage reserve cannot be released by a model answer and trusted completion releases only the unused rest", () => {
  const root = mkdtempSync(join(tmpdir(), "pan529-unknown-"));
  try {
    const store = createResourceBudgetStoreV1(budgetOptions(root));
    const command = { operationId: "operation:unknown-001", requestDigest: "d".repeat(64), modelUnits: 8, runtimeUnits: 6 };
    store.reserve(command);
    assert.equal(typeof store.markUnknownUsage, "function", "Native interrupted-use custody must exist before provider dispatch");
    store.markUnknownUsage(command.operationId);
    assert.equal(store.read(command.operationId).state, "UNKNOWN_USAGE");
    assert.throws(() => store.settle({ operationId: command.operationId, requestDigest: command.requestDigest, modelUnits: 0, runtimeUnits: 0, authority: "MODEL_ANSWER_APPROVED" }), /DENIED/);
    assert.equal(store.snapshot().model.committedUnits, 8);
    const evidence = store.ownerCompletionEvidence({ operationId: command.operationId, requestDigest: command.requestDigest, modelUnits: 3, runtimeUnits: 2, evidenceDigest: "e".repeat(64) });
    store.settle(evidence);
    assert.equal(store.snapshot().model.committedUnits, 3);
    assert.equal(store.snapshot().model.consumedUnits, 3);
    assert.equal(store.snapshot().runtime.remainingUnits, 8);
    assert.deepEqual(store.settle(evidence), store.read(command.operationId));
    store.close();
  } finally { rmSync(root, { recursive: true, force: true }); }
});
