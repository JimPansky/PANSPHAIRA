import test from "node:test";
import assert from "node:assert/strict";
import { BoundTaskHandleResolver, useBoundTaskHandle, SyntheticMetricReadIssuer, syntheticMetricReadOrigin, BTH_ERROR, createSyntheticTrustedTaskSource, BoundTaskHandleIssuer } from "../../src/pan442/bound-task-handle.mjs";
const origin = syntheticMetricReadOrigin();
const request = () => ({ ...origin.principal, ...Object.fromEntries(Object.entries(origin).filter(([k]) => !["schemaVersion", "origin", "principal"].includes(k))) });
const issuer = () => new SyntheticMetricReadIssuer({ secret: "local-synthetic-read-secret-2026" });
const result = () => ({ executed: true, authority: { mutationAuthority: "NONE", publicWrites: false, arbitrarySql: false }, binding: { releasedContractSha256: origin.contractSha256, sourceRevision: origin.sourceRevision, sourceSha256: origin.sourceSha256, profileId: origin.layout }, acceptance: { executionState: "COMPLETE", reconcilesToIndependentExpectedResult: true } });
test("real resolver and useBoundTaskHandle admit only owned synthetic read without effect", async () => {
  const i = issuer(); const { handle } = i.issue({ taskRef: origin.taskRef }); let calls = 0;
  const op = { read: async () => { calls++; return result(); } };
  assert.equal(new BoundTaskHandleResolver({ issuer: i, operation: op }).use({ handle, operationInput: request() }).intent, origin.intent);
  const out = await useBoundTaskHandle({ issuer: i, handle, operationInput: request(), operation: op });
  assert.equal(out.effectStatus, "NO_EFFECT_AUTHORIZED"); assert.equal(calls, 1);
  await assert.rejects(useBoundTaskHandle({ issuer: i, handle, operationInput: request(), operation: op }), /MRT_REPLAY_DENIED/);
});
test("wrong context, source, revision, intent, units, layout, period and effects deny before callback", async () => {
  for (const [name, change, code] of [
    ["tenant", { tenant: "other" }, "SCOPE"], ["actor", { user: "other" }, "SCOPE"],
    ["source", { sourceSha256: "0".repeat(64) }, "SCOPE"],
    ["revision", { sourceRevision: "old" }, "SCOPE"],
    ["intent", { intent: "CREATE_IF_ABSENT" }, "SCOPE"],
    ["question", { question: "other" }, "SCOPE"], ["layout", { layout: "other" }, "SCOPE"],
    ["units", { units: "CHF_MINOR_UNITS" }, "SCOPE"],
    ["period", { period: { ...origin.period, current: { ...origin.period.current, end: "2026-08-01" } } }, "SCOPE"],
    ["write", { authority: { readOnly: true, mutationAuthority: true, effectJournal: true } }, "EFFECT"],
    ["extra", { sql: "DELETE FROM x" }, "SHAPE"],
  ]) {
    const i = issuer(); const { handle } = i.issue({ taskRef: origin.taskRef }); let calls = 0;
    await assert.rejects(useBoundTaskHandle({ issuer: i, handle, operationInput: { ...request(), ...change }, operation: { read: async () => { calls++; return result(); } } }), new RegExp(`MRT_${code}_DENIED`), name);
    assert.equal(calls, 0, name);
  }
});
test("wrong result and action-shaped operation fail; legacy order resolver still refuses read", async () => {
  const i = issuer(); const { handle } = i.issue({ taskRef: origin.taskRef });
  await assert.rejects(useBoundTaskHandle({ issuer: i, handle, operationInput: request(), operation: { execute: async () => result() } }), /BTH_RESOLVER_INIT_INVALID_DENIED/);
  await assert.rejects(useBoundTaskHandle({ issuer: i, handle, operationInput: request(), operation: { read: async () => ({ ...result(), authority: { mutationAuthority: true } }) } }), /MRT_RESULT_DENIED/);
  const task = { taskRef: "synthetic-read-task", runId: "synthetic-read-run", tenant: origin.principal.tenant, user: origin.principal.user, object: { provider: "ks", entity: "Metric", operation: "READ_METRIC", refClient: "synthetic", customerId: 1, orderDateEpoch: 1 }, objectVersion: 1, purpose: "READ_METRIC", amountLimitMinor: 0, currency: "EUR", ttlMs: 10000 };
  const src = createSyntheticTrustedTaskSource({ principal: origin.principal, tasks: [task] });
  const old = new BoundTaskHandleIssuer({ taskSource: src, secret: "local-synthetic-read-secret-2026", now: () => 100 });
  const issued = old.createHandle({ taskRef: task.taskRef });
  assert.throws(() => new BoundTaskHandleResolver({ issuer: old, operation: { execute: async () => {} } }).use({ handle: issued.handle, operationInput: { tenant: task.tenant, user: task.user, runId: task.runId, object: task.object, objectVersion: 1, declaredAmountMinor: 0, currency: "EUR" } }), new RegExp(BTH_ERROR.BINDING_UNSUPPORTED));
});

test("one handle cannot dispatch two simultaneous reads; callback failure consumes reservation", async () => {
  const i = issuer(); const { handle } = i.issue({ taskRef: origin.taskRef });
  let enter; const entered = new Promise((resolve) => { enter = resolve; });
  let release; const pending = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const operation = { read: async () => { calls++; enter(); await pending; return result(); } };
  const first = useBoundTaskHandle({ issuer: i, handle, operationInput: request(), operation });
  await entered;
  const second = useBoundTaskHandle({ issuer: i, handle, operationInput: request(), operation });
  release();
  await assert.rejects(second, /MRT_REPLAY_DENIED/);
  assert.equal((await first).status, "READ_COMPLETE");
  assert.equal(calls, 1);
  const failedIssuer = issuer(); const failed = failedIssuer.issue({ taskRef: origin.taskRef });
  await assert.rejects(useBoundTaskHandle({ issuer: failedIssuer, handle: failed.handle, operationInput: request(), operation: { read: async () => { throw new Error("READ_FAILED"); } } }), /READ_FAILED/);
  await assert.rejects(useBoundTaskHandle({ issuer: failedIssuer, handle: failed.handle, operationInput: request(), operation: { read: async () => result() } }), /MRT_REPLAY_DENIED/);
});
