import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { guidedBrowserFixture528 } from "./browser-fixture.mjs";

test("PAN528 optional helper is an operable browser proposal and never runs the native starter without the separate explicit action", async () => {
  const f = await guidedBrowserFixture528();
  try {
    assert.equal((await f.page.goto(f.fixture.origin + "/t/tenant-a/guided")).status(), 200);
    const native = f.guidance.nativeOwner("tenant-a"); const before = native.client.readback();
    const button = f.page.getByRole("button", { name: "Suggest next step", exact: true });
    assert.equal(await button.count(), 1, "PAN528_OPERABLE_TYPED_HELPER_REQUIRED: a server-only proposal is not a usable optional helper");
    const response = f.page.waitForResponse(r => r.url() === f.fixture.origin + "/t/tenant-a/guided/command" && r.request().postDataJSON().action === "SUGGEST_STARTER");
    await button.click(); assert.equal((await response).status(), 200);
    await f.page.getByText("Typed proposal and bounded template plan", { exact: true }).click();
    await f.page.getByTestId("typed-helper-proposal").filter({ hasText: "RUN_CONTROLLED_NATIVE_STARTER" }).waitFor();
    const proposal = JSON.parse(await f.page.getByTestId("typed-helper-proposal").innerText());
    assert.equal(proposal.planOnly, true); assert.equal(proposal.activationAuthorized, false);
    assert.equal(proposal.modelInvocation, "NOT_REQUESTED");
    assert.equal(proposal.suggestion.expectedAvailable, 4);
    assert.deepEqual(native.client.readback(), before, "A browser helper proposal must not reserve budget or dispatch");
    assert.equal(await f.page.getByTestId("technical-first-value-ms").innerText(), "Not measured");
    if (process.env.PAN528_EVIDENCE_DIR) await f.page.screenshot({ path: join(process.env.PAN528_EVIDENCE_DIR, "actual-browser-typed-helper-plan-only.png"), fullPage: true });
    await f.page.getByRole("button", { name: "Run starter", exact: true }).click();
    await f.page.waitForFunction(() => ["SUCCEEDED", "FAILED"].includes(document.getElementById("business-status").textContent));
    assert.equal(await f.page.getByTestId("business-result-status").innerText(), "SUCCEEDED");
    assert.equal(await f.page.getByTestId("observed-business-value").innerText(), "4 STK");
    assert.equal(native.client.readback().budget.runtime.consumedUnits, 1);
    assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});
