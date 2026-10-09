import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { EventEmitter, once } from "node:events";
import { createNativeBudgetControllerV1 } from "../../src/pan529/native-budget-controller.mjs";
import { deliveredIdentity, planCommand, modelCommand } from "./native-fixture.mjs";

const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  promise.catch(() => {});
  return { promise, resolve, reject };
};
function observeWorkerCompletion(item, ready, done) {
  return new Promise((resolve) => item.child.once("close", (code, signal) => {
    resolve({ code, signal });
    if (!item.completed && !item.expectedKill) { const error = new Error(`Native worker exited before result: ${code}/${signal}: ${item.stderr}`); ready.reject(error); done.reject(error); }
  }));
}
async function fixture(limits) {
  const stateRoot = mkdtempSync(join(tmpdir(), "pan529-native-process-"));
  const options = { optIn: true, stateRoot, identity: deliveredIdentity(), limits, syntheticProvider: async () => { throw new Error("Parent must not dispatch synthetic traffic"); } };
  const adapter = createNativeBudgetControllerV1(options);
  const planned = adapter.client.plan(planCommand(adapter));
  adapter.owner.activate({ operationId: planned.operationId, planDigest: planned.planDigest });
  adapter.owner.close();
  const pending = []; const observations = []; const firstHttp = deferred();
  const httpObserved = new EventEmitter();
  const server = createServer((request, response) => {
    let body = ""; request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      assert.equal(request.method, "POST"); assert.equal(request.url, "/synthetic");
      const observed = JSON.parse(body);
      assert.equal(observed.route.provider, "provider:synthetic-model");
      assert.equal(observed.route.credentialHandle, "credential-handle:synthetic-model-v1");
      observations.push({ operationId: request.headers["x-operation-id"], requestDigest: observed.requestDigest });
      httpObserved.emit("observed");
      pending.push(response); firstHttp.resolve();
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const children = [];
  const spawn = (operationId) => {
    const ready = deferred(); const done = deferred();
    const child = fork(new URL("./native-provider-worker.mjs", import.meta.url), [], { execArgv: [], stdio: ["ignore", "pipe", "pipe", "ipc"] });
    const item = { child, ready, done, stderr: "", completed: false, expectedKill: false };
    children.push(item);
    child.stderr.on("data", (chunk) => { item.stderr += chunk.toString(); });
    child.stdout.resume();
    child.on("message", (message) => {
      if (message.phase === "READY") ready.resolve(message);
      if (message.phase === "DONE") { item.completed = true; done.resolve(message); }
    });
    item.exit = observeWorkerCompletion(item, ready, done);
    child.send({ stateRoot, limits, providerPort: server.address().port, operationId });
    return item;
  };
  const cleanup = async () => {
    for (const item of children) { if (item.child.exitCode === null && item.child.signalCode === null) { item.expectedKill = true; item.child.kill("SIGKILL"); } }
    await Promise.all(children.map((item) => item.exit));
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
    rmSync(stateRoot, { recursive: true, force: true });
  };
  return { stateRoot, options, observations, pending, spawn, firstHttp, cleanup,
    waitForHttpCount: async (count, signal) => {
      while (observations.length < count) await once(httpObserved, "observed", { signal });
    }
  };
}

test("PAN529 synthetic observer ordering accepts DONE notification after exit but before channel close", async () => {
  const child = new EventEmitter(); const ready = deferred(); const done = deferred();
  const item = { child, completed: false, expectedKill: false, stderr: "" };
  const finished = observeWorkerCompletion(item, ready, done);
  child.emit("exit", 0, null);
  item.completed = true; done.resolve({ phase: "DONE" });
  child.emit("close", 0, null);
  await assert.doesNotReject(done.promise);
  assert.deepEqual(await finished, { code: 0, signal: null });
});
test("PAN529 synthetic observer ordering still denies channel closure without any completion", async () => {
  const child = new EventEmitter(); const ready = deferred(); const done = deferred();
  const item = { child, completed: false, expectedKill: false, stderr: "diagnostic-only" };
  const finished = observeWorkerCompletion(item, ready, done);
  child.emit("exit", 0, null); child.emit("close", 0, null);
  await assert.rejects(done.promise, /Native worker exited before result: 0\/null/);
  assert.deepEqual(await finished, { code: 0, signal: null });
});

test("PAN529 100 separate native controllers cannot overrun held budget before 10 actual HTTP completions", { timeout: 120_000 }, async (t) => {
  const f = await fixture({ modelUnits: 640, runtimeUnits: 11 });
  try {
    const workers = Array.from({ length: 100 }, (_, index) => f.spawn(`operation:native-http-${String(index).padStart(3, "0")}`));
    const ready = await Promise.all(workers.map((worker) => worker.ready.promise));
    assert.equal(new Set(ready.map((item) => item.pid)).size, 100);
    const denialBarrier = deferred(); let denied = 0;
    for (const worker of workers) worker.done.promise.then((value) => { if (!value.allowed) { denied += 1; if (denied === 90) denialBarrier.resolve(); } }, denialBarrier.reject);
    for (const worker of workers) worker.child.send("GO");
    await denialBarrier.promise;
    await f.waitForHttpCount(10, t.signal);
    assert.equal(f.observations.length, 10);
    const db = new DatabaseSync(join(f.stateRoot, "resource-budget.sqlite"), { readOnly: true });
    try {
      const held = db.prepare("SELECT count(*) AS n,sum(model_units) AS model,sum(runtime_units) AS runtime FROM reservations WHERE state='UNKNOWN_USAGE'").get();
      assert.equal(held.n, 10); assert.equal(held.model, 640); assert.equal(held.runtime, 10);
      for (const response of f.pending) {
        assert.equal(response.destroyed, false);
        response.writeHead(200, { "content-type": "application/json", connection: "close" });
        response.end(JSON.stringify({ contentType: "text/plain", text: "Real local HTTP synthetic response", usage: { inputTokens: 1, outputTokens: 1, costMicros: 0 } }));
      }
      const results = await Promise.all(workers.map((worker) => worker.done.promise));
      const allowed = results.filter((result) => result.allowed);
      assert.equal(allowed.length, 10); assert.equal(results.filter((result) => !result.allowed && /RESOURCE_BUDGET_EXHAUSTED_DENIED/.test(result.denied)).length, 90);
      const settled = db.prepare("SELECT operation_id,model_consumed,runtime_consumed,result_json FROM reservations WHERE operation_id != ? ORDER BY operation_id").all("operation:template-activation-v1");
      assert.equal(settled.length, 10);
      assert.equal(settled.reduce((sum, row) => sum + row.model_consumed, 0), 20);
      assert.equal(settled.reduce((sum, row) => sum + row.runtime_consumed, 0), 10);
      assert.deepEqual(settled.map((row) => row.operation_id), f.observations.map((item) => item.operationId).sort());
      for (const result of allowed) assert.deepEqual(JSON.parse(settled.find((row) => row.operation_id === result.result.audit.operationId).result_json), result.result);
      const exits = await Promise.all(workers.map((worker) => worker.exit));
      assert.ok(exits.every((exit) => exit.code === 0 && exit.signal === null));
      t.diagnostic(JSON.stringify({ nativeProcesses: ready.length, accepted: allowed.length, denied, heldModelUnitsBeforeCompletion: held.model, actualSyntheticHttp: f.observations.length, persistedModelConsumption: 20, persistedRuntimeConsumption: 10, activationRuntimeConsumption: 1 }));
    } finally { db.close(); }
  } finally { await f.cleanup(); }
});

test("PAN529 killed actual HTTP dispatch retains unknownUsage and no model-answer release on reopen", { timeout: 30_000 }, async (t) => {
  const f = await fixture({ modelUnits: 64, runtimeUnits: 3 });
  let reopened;
  try {
    const operationId = "operation:native-http-interrupted";
    const worker = f.spawn(operationId); await worker.ready.promise; worker.child.send("GO");
    await f.firstHttp.promise;
    assert.equal(f.observations.length, 1);
    worker.expectedKill = true; worker.child.kill("SIGKILL");
    const exit = await worker.exit; assert.equal(exit.signal, "SIGKILL");
    reopened = createNativeBudgetControllerV1(f.options);
    const request = modelCommand(reopened, operationId); request.budget.timeoutMs = 20_000;
    const before = reopened.client.readback();
    const unknown = await reopened.client.invoke(request);
    assert.equal(unknown.state, "UNKNOWN_USAGE"); assert.equal(unknown.dispatchGranted, false);
    assert.equal(before.budget.model.committedUnits, 64); assert.equal(before.budget.model.consumedUnits, 0);
    assert.deepEqual(reopened.client.readback(), before);
    await assert.rejects(reopened.client.invoke({ ...request, ownerCompletionEvidence: { evidenceDigest: "0".repeat(64), authenticator: "0".repeat(64), modelUnits: 0, runtimeUnits: 0 } }));
    assert.deepEqual(reopened.client.readback(), before);
    await assert.rejects(reopened.client.invoke(modelCommand(reopened, "operation:native-after-interrupt")), /RESOURCE_BUDGET_EXHAUSTED_DENIED/);
    const db = new DatabaseSync(join(f.stateRoot, "resource-budget.sqlite"), { readOnly: true });
    try {
      const row = db.prepare("SELECT state,model_units,model_consumed,result_json FROM reservations WHERE operation_id=?").get(operationId);
      assert.equal(row.state, "UNKNOWN_USAGE"); assert.equal(row.model_units, 64); assert.equal(row.model_consumed, 0); assert.equal(row.result_json, null);
    } finally { db.close(); }
    assert.equal(f.observations.length, 1);
    t.diagnostic(JSON.stringify({ actualHttpBeforeKill: 1, realProcessSignal: exit.signal, unknownHeldAfterReopen: 64, additionalDispatch: 0, answerReleaseDenied: true }));
  } finally { reopened?.owner.close(); await f.cleanup(); }
});
