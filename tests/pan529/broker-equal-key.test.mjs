import assert from "node:assert/strict";
import test from "node:test";
import { ModelAccessBrokerV1, syntheticCanonicalModelRequestV1, syntheticModelAccessPolicyV1 } from "../../dist/packages/contracts/src/model-access-broker.js";

test("PAN529 retry barrier: 100 equal-key calls dispatch the existing broker provider once", async () => {
  const policy = syntheticModelAccessPolicyV1();
  const request = syntheticCanonicalModelRequestV1();
  request.budget.maxRequests = policy.maxBudget.maxRequests;
  const broker = new ModelAccessBrokerV1(policy);
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const provider = async () => {
    calls += 1;
    await barrier;
    return { contentType: "text/plain", text: "Synthetic bounded result; no authorization.", usage: { inputTokens: 2, outputTokens: 3, costMicros: 0 } };
  };
  const pending = Array.from({ length: 100 }, () => broker.invoke(request, provider));
  await new Promise((resolve) => setImmediate(resolve));
  release();
  const results = await Promise.all(pending);
  console.log(JSON.stringify({ attempted: pending.length, actualProviderCalls: calls, allows: results.filter((r) => r.outcome === "ALLOW").length }));
  assert.equal(calls, 1, "Equal operation retries must never repeat the provider effect or cost");
});
