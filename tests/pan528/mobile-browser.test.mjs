import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { guidedBrowserFixture528 } from "./browser-fixture.mjs";

test("PAN528 real390px browser presents the native value and own reset without document overflow", async () => {
  const f = await guidedBrowserFixture528({ width: 390, height: 844 });
  try {
    await f.page.goto(f.fixture.origin + "/t/tenant-a/guided");
    const native = f.guidance.nativeOwner("tenant-a"); const before = native.client.readback();
    await f.page.getByRole("button", { name: "Suggest next step", exact: true }).click();
    await f.page.waitForFunction(() => document.getElementById("helper-status").textContent.includes("Plan only, not executed"));
    assert.deepEqual(native.client.readback(), before);
    await f.page.getByRole("button", { name: "Run starter", exact: true }).click();
    await f.page.waitForFunction(() => ["SUCCEEDED", "FAILED"].includes(document.getElementById("business-status").textContent));
    assert.equal(await f.page.getByTestId("business-result-status").innerText(), "SUCCEEDED");
    await f.page.waitForFunction(() => Number(document.getElementById("first-value").textContent) > 0);
    assert.equal(await f.page.getByTestId("expected-business-value").innerText(), "4 STK"); assert.equal(await f.page.getByTestId("observed-business-value").innerText(), "4 STK");
    assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, "PAN528_MOBILE_DOCUMENT_OVERFLOW_DENIED");
    if (process.env.PAN528_EVIDENCE_DIR) await f.page.screenshot({ path: join(process.env.PAN528_EVIDENCE_DIR, "actual390px-native-business-result.png"), fullPage: true });
    const first = await f.page.getByTestId("technical-first-value-ms").innerText();
    await f.page.getByRole("button", { name: "Reset own starter", exact: true }).click();
    await f.page.waitForFunction(() => document.getElementById("business-status").textContent === "IDLE");
    assert.equal(native.client.readback().budget.runtime.consumedUnits, 1); assert.equal(await f.page.getByTestId("technical-first-value-ms").innerText(), first);
    assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});
