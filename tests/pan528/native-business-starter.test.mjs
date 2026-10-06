import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { nativeFixture527 } from "../pan527/helpers.mjs";
import { readPan515TradeState } from "../../src/pan515/trade-state.mjs";
const entry = new URL("../../src/pan528/native-journey-controller.mjs", import.meta.url);
const module = existsSync(entry) ? await import(entry.href) : {};

test("PAN528 native starter performs the existing controlled goods-receipt/reservation and exposes separately observed business value", async () => {
  const fixture = await nativeFixture527(); let controller;
  try {
    assert.equal(typeof module.createGuidedNativeOwnerV1, "function", "PAN528_CONTROLLED_NATIVE_BUSINESS_STARTER_REQUIRED: a protected setup answer is not a business process");
    const identity = fixture.tenants[0].identity;
    const options = { optIn: true, identity, parentRoot: fixture.tenants[0].productRoot, probeMode: "NORMAL" };
    controller = module.createGuidedNativeOwnerV1(options);
    const binding = { tenantId: identity.tenantId, instanceId: identity.instanceId, generation: identity.generation };
    const session = fixture.gateway.sessionAdapter(identity.tenantId).issueOwnerSession({ subjectId: "synthetic-pan528-process-observer", role: "reviewer", expiresAtMs: Date.now() + 120000 });
    const principal = fixture.gateway.sessionAdapter(identity.tenantId).authenticate({ cookie: session.cookieHeader });
    const command = { action: "RUN_STARTER", operationId: "operation:starter-001", binding };
    const dispatched = await controller.client.command(command, principal);
    assert.equal(dispatched.status, "OUTCOME_UNKNOWN", "Persist the dispatch fence before a real child can act");
    await controller.owner.waitForChildCompletion();
    const result = controller.client.readback();
    assert.equal(result.status, "SUCCEEDED"); assert.equal(result.childCompleted, true);
    const expected = { physical: 10, reserved: 6, blocked: 0, available: 4, shipped: 0, returned: 0 };
    assert.deepEqual(result.expectedBusinessValue, expected); assert.deepEqual(result.observedBusinessValue, expected);
    const leading = readPan515TradeState({ root: controller.owner.leadingRoot });
    assert.equal(leading.revision, 2); assert.deepEqual(leading.quantities, result.observedBusinessValue);
    assert.equal(leading.events[0].kind, "RECEIPT"); assert.equal(leading.events[1].kind, "RESERVE");
    assert.equal(result.budget.runtime.consumedUnits, 1); assert.equal(result.budget.model.consumedUnits, 0);
    assert.equal(result.modelInvocation, "NOT_REQUESTED"); assert.equal(result.authorityProfile, "SAFE_GUIDED");
    assert.equal(result.runtimeObservation.runtime.version, process.version.slice(1));
    assert.match(result.runtimeObservation.executableSha256, /^[a-f0-9]{64}$/);
    assert.match(result.runtimeObservation.entrypointSha256, /^[a-f0-9]{64}$/);
    assert.match(result.runtimeTemplateDigest, /^[a-f0-9]{64}$/);
    controller.owner.close(); controller = module.createGuidedNativeOwnerV1(options);
    assert.deepEqual(controller.client.readback().observedBusinessValue, expected, "Native disk readback survives a reopen, not claimed as process restart");
    await controller.client.command(command, principal);
    assert.equal(readPan515TradeState({ root: controller.owner.leadingRoot }).revision, 2, "Same operation cannot duplicate a physical movement");
    assert.equal(controller.client.readback().budget.runtime.consumedUnits, 1);
    controller.owner.cleanup(); controller = undefined;
  } finally { controller?.owner.close(); await fixture.close(); }
});
