import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { guidedBrowserFixture528 } from "./browser-fixture.mjs";

test("PAN528 non-admin browser resets only its completed native starter without replenishing budget or rewriting first visible time", async () => {
  const f = await guidedBrowserFixture528();
  try {
    await f.page.goto(f.fixture.origin + "/t/tenant-a/guided");
    const native = f.guidance.nativeOwner("tenant-a"); const foreign = f.guidance.nativeOwner("tenant-b"); const foreignBefore = foreign.client.readback();
    await f.page.getByRole("button", { name: "Run starter", exact: true }).click();
    await f.page.waitForFunction(() => ["SUCCEEDED", "FAILED"].includes(document.getElementById("business-status").textContent));
    await f.page.waitForFunction(() => Number(document.getElementById("first-value").textContent) > 0);
    assert.equal(await f.page.getByTestId("business-result-status").innerText(), "SUCCEEDED");
    const first = await f.page.getByTestId("technical-first-value-ms").innerText(); assert.ok(Number(first) > 0);
    const reset = f.page.getByRole("button", { name: "Reset own starter", exact: true });
    assert.equal(await reset.count(), 1, "PAN528_OPERABLE_OWN_RESET_REQUIRED: an internal reset is not a non-admin browser journey");
    const response = f.page.waitForResponse(r => r.url() === f.fixture.origin + "/t/tenant-a/guided/command" && r.request().postDataJSON().action === "RESET_STARTER");
    await reset.click(); assert.equal((await response).status(), 200);
    await f.page.waitForFunction(() => document.getElementById("business-status").textContent === "IDLE");
    assert.equal(await f.page.getByTestId("observed-business-value").innerText(), "Not observed");
    assert.equal(await f.page.getByTestId("technical-first-value-ms").innerText(), first);
    assert.equal(native.client.readback().budget.runtime.consumedUnits, 1);
    assert.deepEqual(foreign.client.readback(), foreignBefore);
    assert.equal(await f.page.getByRole("button", { name: "Run starter", exact: true }).isEnabled(), true);
    assert.deepEqual(f.errors, []);
    if (process.env.PAN528_EVIDENCE_DIR) await f.page.screenshot({ path: join(process.env.PAN528_EVIDENCE_DIR, "actual-browser-own-reset-preserved-budget-and-first-time.png"), fullPage: true });
  } finally { await f.close(); }
});
