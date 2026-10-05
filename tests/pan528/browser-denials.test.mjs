import assert from "node:assert/strict";
import test from "node:test";
import { guidedBrowserFixture528 } from "./browser-fixture.mjs";

test("PAN528 actual non-admin Chromium denied routes and commands preserve both tenants and all native budget", async t => {
  const f = await guidedBrowserFixture528();
  try {
    await f.page.goto(f.fixture.origin + "/t/tenant-a/guided");
    const native = f.guidance.nativeOwner("tenant-a"); const foreign = f.guidance.nativeOwner("tenant-b");
    const before = native.client.readback(); const foreignBefore = foreign.client.readback();
    const good = { action: "RUN_STARTER", operationId: "operation:browser-negative-001", binding: before.binding };
    const probes = [
      { name: "admin route in reviewer browser", path: "/t/tenant-a/api/admin", method: "GET", status: 404 },
      { name: "unchecked upload", path: "/t/tenant-a/guided/upload", method: "POST", value: { unchecked: "synthetic" }, status: 404 },
      { name: "free shell action", path: "/t/tenant-a/guided/command", method: "POST", value: { ...good, action: "SHELL" }, status: 400 },
      { name: "free URL field", path: "/t/tenant-a/guided/command", method: "POST", value: { ...good, url: "https://invalid.example" }, status: 400 },
      { name: "foreign instance reset", path: "/t/tenant-a/guided/command", method: "POST", value: { ...good, action: "RESET_STARTER", binding: { ...before.binding, instanceId: "foreign-instance" } }, status: 403 },
      { name: "foreign tenant reset", path: "/t/tenant-b/guided/command", method: "POST", value: { ...good, action: "RESET_STARTER", binding: foreignBefore.binding }, status: 401 },
    ];
    for (const probe of probes) await t.test(probe.name, async () => {
      const status = await f.page.evaluate(async ({ path, method, value }) => (await fetch(path, { method, headers: { "content-type": "application/json", "x-pan527-csrf": sessionStorage.getItem("pan528-csrf") }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) })).status, probe);
      assert.equal(status, probe.status); assert.deepEqual(native.client.readback(), before); assert.deepEqual(foreign.client.readback(), foreignBefore);
      console.log(JSON.stringify({ actualChromiumNegative: probe.name, httpStatus: status, nativeAndBudgetUnchanged: true }));
    });
    assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});
