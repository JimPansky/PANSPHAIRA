import assert from "node:assert/strict";
import test from "node:test";
import { nativeFixture527, request527 } from "../pan527/helpers.mjs";
import { enableGuidedBrowserJourneyV1 } from "../../src/pan528/guided-browser.mjs";

test("PAN528 optional helper through real protected TLS emits only a typed plan without native effects or budget use", async () => {
  const f = await nativeFixture527(); let guidance;
  try {
    guidance = await enableGuidedBrowserJourneyV1({ optIn: true, gateway: f.gateway, origin: f.origin, tenants: f.tenants });
    const session = f.gateway.sessionAdapter("tenant-a").issueOwnerSession({ subjectId: "synthetic-pan528-helper-probe", role: "reviewer", expiresAtMs: Date.now() + 120000 });
    const headers = { origin: f.origin, cookie: session.cookieHeader, "x-pan527-csrf": session.csrf };
    const native = guidance.nativeOwner("tenant-a"); const before = native.client.readback();
    const proposal = { action: "SUGGEST_STARTER", operationId: "operation:helper-001", binding: before.binding };
    const response = await request527(f, "/t/tenant-a/guided/command", headers, "POST", proposal);
    assert.equal(response.status, 200, "PAN528_TYPED_GUIDED_HELPER_REQUIRED: the protected helper must return a typed proposal, not dispatch or rights");
    assert.equal(response.tlsAuthorized, true);
    const result = JSON.parse(response.body);
    assert.equal(result.schemaVersion, "pansphaira.guided-native/suggestion/v1");
    assert.deepEqual(result.binding, before.binding);
    assert.equal(result.planOnly, true); assert.equal(result.activationAuthorized, false);
    assert.equal(result.modelInvocation, "NOT_REQUESTED");
    assert.deepEqual(result.suggestion, { kind: "RUN_CONTROLLED_NATIVE_STARTER", processId: "synthetic-receipt-reservation-v1", receiptQuantity: 10, reservationQuantity: 6, expectedAvailable: 4 });
    assert.equal(result.templatePlan.planOnly, true); assert.equal(result.templatePlan.activationAuthorized, false);
    assert.equal(result.templatePlan.runtimeTemplateDigest, before.runtimeTemplateDigest);
    assert.match(result.proposalDigest, /^[a-f0-9]{64}$/);
    assert.doesNotMatch(response.body, /(?:csrf|authenticator|invocationNonce|https?:\/\/|modelKey|apiKey|shellCommand)/i);
    assert.deepEqual(native.client.readback(), before, "Typed helper must not mutate full native state or budget");
    const denied = [
      { ...proposal, shell: "rm -rf /" }, { ...proposal, url: "https://invalid.example" },
      { ...proposal, upload: "unchecked" }, { ...proposal, modelKey: "caller-secret" },
      { ...proposal, controlToken: "caller-control" }, { ...proposal, modelOutput: { action: "RUN_STARTER" } },
    ];
    for (const body of denied) {
      const bad = await request527(f, "/t/tenant-a/guided/command", headers, "POST", body);
      assert.equal(bad.status, 400); assert.deepEqual(native.client.readback(), before);
    }
    const foreign = await request527(f, "/t/tenant-a/guided/command", headers, "POST", { ...proposal, binding: { ...before.binding, instanceId: "foreign-instance" } });
    assert.equal(foreign.status, 403); assert.deepEqual(native.client.readback(), before);
    const authorized = await request527(f, "/t/tenant-a/guided/command", headers, "POST", { action: "RUN_STARTER", operationId: "operation:helper-explicit-run", binding: before.binding });
    assert.equal(authorized.status, 200); await native.owner.waitForChildCompletion();
    assert.equal(native.client.readback().status, "SUCCEEDED"); assert.equal(native.client.readback().observedBusinessValue.available, 4);
    assert.equal(native.client.readback().budget.runtime.consumedUnits, 1);
  } finally { if (guidance) await guidance.close(); await f.close(); }
});
