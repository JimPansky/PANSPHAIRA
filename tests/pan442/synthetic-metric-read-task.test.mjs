import test from "node:test";
import assert from "node:assert/strict";
import { BoundTaskHandleResolver, useBoundTaskHandle, SyntheticMetricReadIssuer, syntheticMetricReadOrigin, BTH_ERROR, createSyntheticTrustedTaskSource, BoundTaskHandleIssuer } from "../../src/pan442/bound-task-handle.mjs";
import { executeSyntheticMetricRead } from "../../src/pan442/synthetic-metric-read-task.mjs";
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

test("second frozen source grants a distinct one-shot synthetic read, not a caller-selected digest",async()=>{
 const v2=syntheticMetricReadOrigin("v2");
 assert.equal(v2.sourceRevision,"synthetic-unfamiliar-source-v2");
 assert.equal(v2.sourceSha256,"cacd2a08d5fa5cb8603513a769362a2f7bdb700c44d700728a1fe2f1244be52e");
 assert.notEqual(v2.taskRef,origin.taskRef);
 assert.throws(()=>syntheticMetricReadOrigin("v3"),/MRT_SCOPE_DENIED/);
 const request2=()=>({...v2.principal,...Object.fromEntries(Object.entries(v2).filter(([key])=>!["schemaVersion","origin","principal"].includes(key)))});
 const result2=()=>({...result(),binding:{...result().binding,sourceRevision:v2.sourceRevision,sourceSha256:v2.sourceSha256}});
 const i=issuer(),issued=i.issue({taskRef:v2.taskRef});
 assert.equal(issued.task,v2);
 let calls=0;
 for(const invalid of [{...request2(),sourceSha256:origin.sourceSha256},{...request2(),taskRef:origin.taskRef},{...request2(),sourceRevision:origin.sourceRevision},{...request2(),authority:{readOnly:false,mutationAuthority:true,effectJournal:true}}]){
  await assert.rejects(useBoundTaskHandle({issuer:i,handle:issued.handle,operationInput:invalid,operation:{read:async()=>{calls++;return result2();}}}),/MRT_(SCOPE|EFFECT)_DENIED/);
 }
 assert.equal(calls,0);
 const output=await useBoundTaskHandle({issuer:i,handle:issued.handle,operationInput:request2(),operation:{read:async()=>{calls++;return result2();}}});
 assert.equal(output.status,"READ_COMPLETE");assert.equal(output.effectStatus,"NO_EFFECT_AUTHORIZED");assert.equal(output.task.sourceSha256,v2.sourceSha256);assert.equal(calls,1);
 await assert.rejects(useBoundTaskHandle({issuer:i,handle:issued.handle,operationInput:request2(),operation:{read:async()=>{calls++;return result2();}}}),/MRT_REPLAY_DENIED/);
 assert.equal(calls,1);
 const old=issuer().issue({taskRef:origin.taskRef});assert.equal(old.task,origin);
});

// -------------------------------------------------------------------------------------
// PAN486 METRIC-READ-01: structural read-scope equality (AC01) + explicit finite
// safe-integer issuance/resolution clock (AC02) + actual executeSyntheticMetricRead
// callback-count boundary (AC03). Reuses the existing structural comparator
// (canonicalJson) and the existing fail-closed codes; adds no generic framework, no new
// keys/types and no new effect authority.
// -------------------------------------------------------------------------------------
const metricIssuer = (now) => new SyntheticMetricReadIssuer({ secret: "public-synthetic-regression-only", now });
// Byte-identical values to the frozen origin, in origin key order (a valid baseline).
const metricRequest = (o) => ({
  tenant: o.principal.tenant, user: o.principal.user, taskRef: o.taskRef, intent: o.intent,
  sourceRevision: o.sourceRevision, sourceSha256: o.sourceSha256, contractSha256: o.contractSha256,
  question: o.question,
  period: { current: { start: o.period.current.start, end: o.period.current.end }, comparison: { start: o.period.comparison.start, end: o.period.comparison.end } },
  layout: o.layout, units: o.units,
  authority: { readOnly: o.authority.readOnly, mutationAuthority: o.authority.mutationAuthority, effectJournal: o.authority.effectJournal },
});
const metricResult = (o) => ({ executed: true, authority: { mutationAuthority: "NONE", publicWrites: false, arbitrarySql: false }, binding: { releasedContractSha256: o.contractSha256, sourceRevision: o.sourceRevision, sourceSha256: o.sourceSha256, profileId: o.layout }, acceptance: { executionState: "COMPLETE", reconcilesToIndependentExpectedResult: true } });
// Same values, different JSON object-key insertion order at each supported nested object.
const metricReorders = (o) => ([
  ["authority", { ...metricRequest(o), authority: { effectJournal: o.authority.effectJournal, mutationAuthority: o.authority.mutationAuthority, readOnly: o.authority.readOnly } }],
  ["period", { ...metricRequest(o), period: { comparison: { start: o.period.comparison.start, end: o.period.comparison.end }, current: { start: o.period.current.start, end: o.period.current.end } } }],
  ["period.current", { ...metricRequest(o), period: { ...metricRequest(o).period, current: { end: o.period.current.end, start: o.period.current.start } } }],
  ["period.comparison", { ...metricRequest(o), period: { ...metricRequest(o).period, comparison: { end: o.period.comparison.end, start: o.period.comparison.start } } }],
  ["all-nested", { ...metricRequest(o), authority: { effectJournal: o.authority.effectJournal, mutationAuthority: o.authority.mutationAuthority, readOnly: o.authority.readOnly }, period: { comparison: { end: o.period.comparison.end, start: o.period.comparison.start }, current: { end: o.period.current.end, start: o.period.current.start } } }],
]);

test("METRIC-READ-AC01: meaning-preserving key reorders at each supported nested object are accepted for both synthetic task variants", async () => {
  for (const variant of ["v1", "v2"]) {
    const o = syntheticMetricReadOrigin(variant);
    const i = metricIssuer(() => 1000);
    let calls = 0;
    const op = { read: async () => { calls++; return metricResult(o); } };
    for (const [name, q] of metricReorders(o)) {
      const { handle } = i.issue({ taskRef: o.taskRef, ttlMs: 30000 });
      const out = await executeSyntheticMetricRead({ issuer: i, handle, request: q, operation: op }, `AC01 ${variant}/${name}`);
      assert.equal(out.status, "READ_COMPLETE", `AC01 ${variant}/${name}`);
      assert.equal(out.effectStatus, "NO_EFFECT_AUTHORIZED", `AC01 ${variant}/${name}`);
    }
    assert.equal(calls, metricReorders(o).length, `AC01 ${variant}: every reordered read reached the trusted callback exactly once`);
  }
});

test("METRIC-READ-AC02: issuance and resolution enforce an explicit finite safe-integer clock before any callback or successful resolution", async () => {
  const badClocks = [NaN, 0.5, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, Number.MIN_SAFE_INTEGER - 1, null, undefined, "1000", true];
  for (const value of badClocks) assert.throws(() => metricIssuer(() => value).issue({ taskRef: origin.taskRef }), /MRT_EXPIRY_DENIED/, `AC02 issue now=${String(value)}`);
  { // Reproducible two-read step: a valid issuance timestamp must be the only clock read.
    let calls = 0;
    const i = metricIssuer(() => ++calls === 1 ? 1000 : NaN);
    const issued = i.issue({ taskRef: origin.taskRef, ttlMs: 10 });
    assert.equal(typeof issued.handle, "string");
    assert.equal(calls, 1, "AC02 issue must not consult a second unchecked clock for its nonce");
  }
  for (const value of badClocks) {
    let nowVal = 1000;
    const i = metricIssuer(() => nowVal);
    const { handle } = i.issue({ taskRef: origin.taskRef, ttlMs: 30000 });
    nowVal = value;
    let calls = 0;
    await assert.rejects(executeSyntheticMetricRead({ issuer: i, handle, request: metricRequest(origin), operation: { read: async () => { calls++; return result(); } } }), /MRT_EXPIRY_DENIED/, `AC02 resolve now=${String(value)}`);
    assert.equal(calls, 0, `AC02 invalid clock ${String(value)} must not reach the callback`);
  }
  // Documented controls retained: before-expiry accepts, exact-expiry rejects.
  {
    let nowVal = 1000;
    const i = metricIssuer(() => nowVal);
    const a = i.issue({ taskRef: origin.taskRef, ttlMs: 10 });
    nowVal = 1009;
    assert.ok(i.resolve({ handle: a.handle, request: metricRequest(origin) }), "AC02 before-expiry accepted");
    nowVal = 1010;
    assert.throws(() => i.resolve({ handle: a.handle, request: metricRequest(origin) }), /MRT_EXPIRY_DENIED/, "AC02 exact-expiry rejected");
    const b = i.issue({ taskRef: origin.taskRef, ttlMs: 30000 });
    nowVal = 1000;
    let calls = 0;
    await executeSyntheticMetricRead({ issuer: i, handle: b.handle, request: metricRequest(origin), operation: { read: async () => { calls++; return result(); } } });
    assert.equal(calls, 1);
  }
});

test("METRIC-READ-AC03: a permitted reordered request reaches the trusted callback once and an invalid clock zero times, through executeSyntheticMetricRead", async () => {
  {
    const o = syntheticMetricReadOrigin();
    const i = metricIssuer(() => 1000);
    const { handle } = i.issue({ taskRef: o.taskRef, ttlMs: 30000 });
    const q = { ...metricRequest(o), authority: { effectJournal: false, mutationAuthority: false, readOnly: true } };
    let calls = 0;
    const out = await executeSyntheticMetricRead({ issuer: i, handle, request: q, operation: { read: async () => { calls++; return metricResult(o); } } });
    assert.equal(out.status, "READ_COMPLETE", "AC03 permitted reordered read");
    assert.equal(out.effectStatus, "NO_EFFECT_AUTHORIZED");
    assert.equal(calls, 1, "AC03 permitted reordered request reached the callback exactly once");
  }
  {
    let nowVal = 1000;
    const i = metricIssuer(() => nowVal);
    const { handle } = i.issue({ taskRef: origin.taskRef, ttlMs: 30000 });
    nowVal = NaN;
    let calls = 0;
    await assert.rejects(executeSyntheticMetricRead({ issuer: i, handle, request: metricRequest(origin), operation: { read: async () => { calls++; return result(); } } }), /MRT_EXPIRY_DENIED/, "AC03 invalid clock read");
    assert.equal(calls, 0, "AC03 invalid clock reached the callback zero times");
  }
  // Preserved fail-closed: real scope/principal/source/authority mutations, malformed
  // input and replay still deny before any callback (single-use reservation untouched).
  {
    for (const [name, change, code] of [
      ["tenant", { tenant: "other" }, "SCOPE"], ["user", { user: "other" }, "SCOPE"],
      ["source", { sourceSha256: "0".repeat(64) }, "SCOPE"], ["revision", { sourceRevision: "old" }, "SCOPE"],
      ["write", { authority: { readOnly: false, mutationAuthority: true, effectJournal: true } }, "EFFECT"],
      ["extra", { sql: "DELETE FROM x" }, "SHAPE"],
    ]) {
      const i = metricIssuer(() => 1000);
      const { handle } = i.issue({ taskRef: origin.taskRef, ttlMs: 30000 });
      let calls = 0;
      await assert.rejects(executeSyntheticMetricRead({ issuer: i, handle, request: { ...metricRequest(origin), ...change }, operation: { read: async () => { calls++; return result(); } } }), new RegExp(`MRT_${code}_DENIED`), `AC03 preserved ${name}`);
      assert.equal(calls, 0, `AC03 preserved ${name} reached the callback`);
    }
    const i = metricIssuer(() => 1000);
    const { handle } = i.issue({ taskRef: origin.taskRef, ttlMs: 30000 });
    let calls = 0;
    await executeSyntheticMetricRead({ issuer: i, handle, request: metricRequest(origin), operation: { read: async () => { calls++; return result(); } } });
    assert.equal(calls, 1);
    await assert.rejects(executeSyntheticMetricRead({ issuer: i, handle, request: metricRequest(origin), operation: { read: async () => { calls++; return result(); } } }), /MRT_REPLAY_DENIED/, "AC03 replay denied");
    assert.equal(calls, 1, "AC03 replay did not reach the callback a second time");
  }
});
