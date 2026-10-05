import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { guidedBrowserFixture528 } from "./browser-fixture.mjs";

test("PAN528 non-admin browser requests a bound native abort without claiming child completion or refunding unresolved usage", async () => {
  const f = await guidedBrowserFixture528();
  try {
    await f.page.goto(f.fixture.origin + "/t/tenant-a/guided");
    const abort = f.page.getByRole("button", { name: "Abort starter", exact: true });
    assert.equal(await abort.count(), 1, "PAN528_OPERABLE_BOUND_ABORT_REQUIRED: native abort alone is not a browser action");
    const native = f.guidance.nativeOwner("tenant-a");
    const started = f.page.waitForResponse(r => r.url().endsWith("/guided/command") && r.request().postDataJSON().action === "RUN_STARTER");
    await f.page.getByRole("button", { name: "Run starter", exact: true }).click();
    assert.equal((await started).status(), 200);
    const response = f.page.waitForResponse(r => r.url().endsWith("/guided/command") && r.request().postDataJSON().action === "ABORT_STARTER");
    await abort.click(); const acknowledged = await response; assert.equal(acknowledged.status(), 200);
    const ack = await acknowledged.json(); assert.equal(ack.abortAcknowledged, true); assert.equal(ack.childCompleted, false); assert.equal(ack.status, "OUTCOME_UNKNOWN");
    await native.owner.waitForChildCompletion();
    await f.page.getByRole("button", { name: "Refresh status", exact: true }).click();
    await f.page.waitForFunction(() => document.getElementById("progress").textContent.includes("unresolved"));
    assert.equal(await f.page.getByTestId("business-result-status").innerText(), "OUTCOME_UNKNOWN");
    assert.match(await f.page.getByTestId("native-starter-result").innerText(), /OUTCOME_UNKNOWN/, "PAN528_ABORT_EVIDENCE_REQUIRED: an aborted real dispatch must not still say Not run");
    assert.equal(await f.page.getByTestId("technical-first-value-ms").innerText(), "Not measured");
    assert.equal(await f.page.getByRole("button", { name: "Reset own starter", exact: true }).isDisabled(), true);
    const resetStatus = await f.page.evaluate(async ({ binding, operationId }) => (await fetch(location.pathname + "/command", { method: "POST", headers: { "content-type": "application/json", "x-pan527-csrf": sessionStorage.getItem("pan528-csrf") }, body: JSON.stringify({ action: "RESET_STARTER", operationId, binding }) })).status, { binding: ack.binding, operationId: "operation:browser-unknown-reset" });
    assert.equal(resetStatus, 409);
    const stopped = native.client.readback(); assert.equal(stopped.childCompleted, true); assert.equal(stopped.status, "OUTCOME_UNKNOWN");
    assert.equal(stopped.budget.runtime.committedUnits, 1); assert.equal(stopped.budget.runtime.consumedUnits, 0);
    assert.throws(() => native.owner.cleanup(), /GUIDED_OUTCOME_UNKNOWN_RETAINED/);
    assert.deepEqual(f.errors, []);
    if (process.env.PAN528_EVIDENCE_DIR) await f.page.screenshot({ path: join(process.env.PAN528_EVIDENCE_DIR, "actual-browser-abort-retained-unknown.png"), fullPage: true });
    console.log(JSON.stringify({ actualChromiumAbort: true, childCompletedAtAck: ack.childCompleted, childCompletedAfterNativeClose: stopped.childCompleted, outcome: stopped.status, blindResetHttpStatus: resetStatus, runtimeCommitted: stopped.budget.runtime.committedUnits, runtimeConsumed: stopped.budget.runtime.consumedUnits }));
  } finally { await f.close(); }
});
