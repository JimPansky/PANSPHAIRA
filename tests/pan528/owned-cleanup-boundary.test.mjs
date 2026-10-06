import assert from "node:assert/strict";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createGuidedNativeOwnerV1 } from "../../src/pan528/native-journey-controller.mjs";
import { join } from "node:path";
import test from "node:test";
import { nativeFixture527, request527 } from "../pan527/helpers.mjs";
import { enableGuidedBrowserJourneyV1 } from "../../src/pan528/guided-browser.mjs";

test("PAN528 reset refuses an unregistered nested resource before any deletion or native budget/state mutation", async () => {
  const f = await nativeFixture527(); let guidance; let native; let sentinel;
  try {
    guidance = await enableGuidedBrowserJourneyV1({ optIn: true, gateway: f.gateway, origin: f.origin, tenants: f.tenants }); native = guidance.nativeOwner("tenant-a");
    const s = f.gateway.sessionAdapter("tenant-a").issueOwnerSession({ subjectId: "synthetic-pan528-nested-resource-probe", role: "reviewer", expiresAtMs: Date.now() + 120000 });
    const headers = { origin: f.origin, cookie: s.cookieHeader, "x-pan527-csrf": s.csrf };
    const binding = native.client.readback().binding;
    assert.equal((await request527(f, "/t/tenant-a/guided/command", headers, "POST", { action: "RUN_STARTER", operationId: "operation:foreign-nested-run", binding })).status, 200);
    await native.owner.waitForChildCompletion(); const before = native.client.readback(); assert.equal(before.status, "SUCCEEDED");
    sentinel = join(native.owner.leadingRoot, "foreign-sentinel.txt"); writeFileSync(sentinel, "Unregistered producer resource: do not delete\n", { mode: 0o600, flag: "wx" });
    const response = await request527(f, "/t/tenant-a/guided/command", headers, "POST", { action: "RESET_STARTER", operationId: "operation:foreign-nested-reset", binding });
    assert.equal(response.status, 503, "PAN528_EXACT_OWNED_CENSUS_REQUIRED: parent ownership is not authority to recursively delete an unregistered nested resource");
    assert.deepEqual(native.client.readback(), before);
    assert.equal(readFileSync(sentinel, "utf8"), "Unregistered producer resource: do not delete\n");
    assert.throws(() => native.owner.cleanup(), /GUIDED_OWNED_RESOURCE_DENIED/);
    assert.equal(existsSync(sentinel), true);
    // Test owner removes only its own adversarial fixture after denial; native
    // product cleanup must then remain compatible with its registered resources.
    unlinkSync(sentinel); sentinel = undefined;
  } finally { if (sentinel && existsSync(sentinel)) unlinkSync(sentinel); if (native) await native.owner.waitForChildCompletion(); if (guidance) await guidance.close(); await f.close(); }
});

for (const relative of ["unregistered.txt", "native-budget/unregistered.txt"]) {
  test("PAN528 cleanup refuses unregistered " + relative + " before closing or deleting its own native resources", async () => {
    const f = await nativeFixture527(); let native; let sentinel;
    const root = join(f.tenants[0].productRoot, "pan528-guided-native");
    try {
      native = createGuidedNativeOwnerV1({ optIn: true, identity: f.tenants[0].identity, parentRoot: f.tenants[0].productRoot, probeMode: "NORMAL" });
      const before = native.client.readback(); sentinel = join(root, relative);
      writeFileSync(sentinel, "Unregistered test producer resource\n", { mode: 0o600, flag: "wx" });
      assert.throws(() => native.owner.cleanup(), /GUIDED_OWNED_RESOURCE_DENIED/, "PAN528_OUTER_OWNED_CENSUS_REQUIRED: an owned parent never authorizes deleting undeclared children");
      assert.equal(readFileSync(sentinel, "utf8"), "Unregistered test producer resource\n");
      assert.deepEqual(native.client.readback(), before, "Guard must run before closing the budget or changing state");
      unlinkSync(sentinel); sentinel = undefined;
      native.owner.cleanup(); native = undefined;
      assert.equal(existsSync(root), false);
    } finally { if (sentinel && existsSync(sentinel)) unlinkSync(sentinel); if (native && existsSync(root)) native.owner.cleanup(); await f.close(); }
  });
}
