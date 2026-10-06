import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { nativeFixture527, request527 } from "../pan527/helpers.mjs";
import { enableGuidedBrowserJourneyV1 } from "../../src/pan528/guided-browser.mjs";
import { readPan515TradeState } from "../../src/pan515/trade-state.mjs";

test("PAN528 actual TLS reset removes only its completed bound synthetic starter while preserving tenant isolation and the native budget", async () => {
  const f = await nativeFixture527(); let guidance; let native;
  try {
    guidance = await enableGuidedBrowserJourneyV1({ optIn: true, gateway: f.gateway, origin: f.origin, tenants: f.tenants });
    native = guidance.nativeOwner("tenant-a"); const foreign = guidance.nativeOwner("tenant-b"); const foreignBefore = foreign.client.readback();
    const session = f.gateway.sessionAdapter("tenant-a").issueOwnerSession({ subjectId: "synthetic-pan528-reset-probe", role: "reviewer", expiresAtMs: Date.now() + 120000 });
    const headers = { origin: f.origin, cookie: session.cookieHeader, "x-pan527-csrf": session.csrf };
    const command = { action: "RUN_STARTER", operationId: "operation:reset-before-run", binding: native.client.readback().binding };
    assert.equal((await request527(f, "/t/tenant-a/guided/command", headers, "POST", command)).status, 200);
    await native.owner.waitForChildCompletion(); const before = native.client.readback();
    assert.equal(before.status, "SUCCEEDED"); assert.equal(readPan515TradeState({ root: native.owner.leadingRoot }).revision, 2);
    const reset = { action: "RESET_STARTER", operationId: "operation:own-reset-001", binding: before.binding };
    for (const binding of [foreignBefore.binding, { ...before.binding, instanceId: "foreign-instance" }, { ...before.binding, generation: before.binding.generation + 1 }]) {
      const denied = await request527(f, "/t/tenant-a/guided/command", headers, "POST", { ...reset, binding });
      assert.equal(denied.status, 403); assert.deepEqual(native.client.readback(), before); assert.deepEqual(foreign.client.readback(), foreignBefore);
    }
    const response = await request527(f, "/t/tenant-a/guided/command", headers, "POST", reset);
    assert.equal(response.status, 200, "PAN528_OWN_BOUND_RESET_REQUIRED: a qualified complete child permits only its exact tenant/instance reset, not budget replenishment");
    const cleared = JSON.parse(response.body); assert.equal(cleared.status, "IDLE"); assert.equal(cleared.childCompleted, true);
    assert.equal(cleared.observedBusinessValue, null); assert.deepEqual(cleared.binding, before.binding);
    assert.deepEqual(cleared.budget, before.budget); assert.equal(existsSync(native.owner.leadingRoot), false);
    assert.deepEqual(foreign.client.readback(), foreignBefore);
    assert.equal((await request527(f, "/t/tenant-a/guided/command", headers, "POST", reset)).status, 200, "A reset replay is non-destructive");
    const replay = await request527(f, "/t/tenant-a/guided/command", headers, "POST", command);
    assert.equal(replay.status, 409, "A prior completed operation cannot redispatch after reset");
    assert.deepEqual(native.client.readback(), cleared);
    const next = await request527(f, "/t/tenant-a/guided/command", headers, "POST", { ...command, operationId: "operation:reset-after-run" });
    assert.equal(next.status, 200); await native.owner.waitForChildCompletion();
    assert.equal(native.client.readback().observedBusinessValue.available, 4);
    assert.equal(native.client.readback().budget.runtime.consumedUnits, 2);
    assert.equal(native.client.readback().budget.model.consumedUnits, 0);
  } finally { if (native) await native.owner.waitForChildCompletion(); if (guidance) await guidance.close(); await f.close(); }
});
