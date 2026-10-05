import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { guidedBrowserFixture528 } from "./browser-fixture.mjs";
import { authorizePan515TradeCommand, executePan515TradeCommand, readPan515TradeState } from "../../src/pan515/trade-state.mjs";

// A test-owner producer fault in its disposable persistent result, not a
// mocked HTTP response: the changed value comes from another real native event.
test("PAN528 browser refuses genuine wrong native stock despite HTTP200 and a faulted persisted SUCCEEDED flag", async () => {
  const f = await guidedBrowserFixture528(); let journalBackup; let targetBackup; let journalPath; let targetPath;
  try {
    await f.page.goto(f.fixture.origin + "/t/tenant-a/guided");
    const native = f.guidance.nativeOwner("tenant-a"); const before = native.client.readback();
    const started = await f.page.evaluate(async binding => {
      const response = await fetch(location.pathname + "/command", { method: "POST", headers: { "content-type": "application/json", "x-pan527-csrf": sessionStorage.getItem("pan528-csrf") }, body: JSON.stringify({ action: "RUN_STARTER", operationId: "operation:wrong-value-actual-run", binding }) });
      return response.status;
    }, before.binding);
    assert.equal(started, 200); await native.owner.waitForChildCompletion();
    assert.equal(native.client.readback().observedBusinessValue.available, 4);
    journalPath = join(dirname(native.owner.leadingRoot), "journey.json"); targetPath = join(native.owner.leadingRoot, "target.sqlite");
    journalBackup = readFileSync(journalPath); targetBackup = readFileSync(targetPath);
    const command = { schemaVersion: "pansphaira.pan515/trade-command/v1", effectId: "synthetic:wrong-value-count", transportId: "synthetic:wrong-value-request", expectedRevision: 2, orderId: "synthetic:order-42", lineId: "synthetic:line-1", articleId: "SYN-ART-001", warehouseId: "LAGER-01", unit: "STK", kind: "COUNT_ADJUSTMENT", quantity: 11, referenceId: "synthetic:guided-receipt-01", effectiveAt: "2026-10-03T10:01:00Z", reason: "Test-owner genuine native wrong-value producer fault" };
    executePan515TradeCommand({ root: native.owner.leadingRoot, command, grant: authorizePan515TradeCommand({ root: native.owner.leadingRoot, command, owner: "LOCAL_SYNTHETIC_OWNER" }) });
    const leading = readPan515TradeState({ root: native.owner.leadingRoot }); assert.equal(leading.quantities.available, 5); assert.equal(leading.revision, 3);
    const faulted = JSON.parse(journalBackup.toString("utf8"));
    faulted.result.observedBusinessValue = leading.quantities;
    faulted.result.nativeEvidence.revision = leading.revision;
    faulted.result.nativeEvidence.eventDigests = leading.events.map(event => event.eventDigest);
    writeFileSync(journalPath, JSON.stringify(faulted) + "\n", { mode: 0o600 });
    // Only this private test producer changes its fixture. Product cleanup
    // must refuse the changed resource instead of adopting or deleting it.
    assert.throws(() => native.owner.cleanup(), /GUIDED_OWNED_RESOURCE_DENIED/);
    const statusResponse = f.page.waitForResponse(r => r.url().endsWith("/guided/status"));
    await f.page.getByRole("button", { name: "Refresh status", exact: true }).click();
    const response = await statusResponse; assert.equal(response.status(), 200);
    const raw = await response.json(); assert.equal(raw.status, "SUCCEEDED"); assert.equal(raw.observedBusinessValue.available, leading.quantities.available);
    await f.page.waitForFunction(() => document.getElementById("business-status").textContent === "FAILED");
    assert.equal(await f.page.getByTestId("expected-business-value").innerText(), "4 STK");
    assert.equal(await f.page.getByTestId("observed-business-value").innerText(), "5 STK");
    assert.match(await f.page.locator("#progress").innerText(), /HTTP success does not approve a wrong value/);
    await f.page.waitForFunction(() => document.getElementById("reset-starter").disabled === false);
    assert.equal(await f.page.getByTestId("technical-first-value-ms").innerText(), "Not measured", "PAN528_WRONG_VALUE_NOT_FIRST_VALUE: a failed business value must not be measured as an accepted first value");
    assert.equal(native.client.readback().budget.runtime.consumedUnits, 1);
    assert.deepEqual(f.errors, []);
    if (process.env.PAN528_EVIDENCE_DIR) await f.page.screenshot({ path: join(process.env.PAN528_EVIDENCE_DIR, "actual-browser-wrong-native-value-denied.png"), fullPage: true });
    console.log(JSON.stringify({ actualNativeRevision: leading.revision, actualNativeAvailable: leading.quantities.available, actualHttpStatus: response.status(), faultedPersistedStatus: raw.status, browserAcceptedStatus: "FAILED", noMockedHttp: true, firstAcceptedValueMeasured: false }));
  } finally {
    // Test owner restores its exact fixture bytes, never deleting changed
    // resources via product cleanup or hiding the product's deletion denial.
    if (targetBackup) writeFileSync(targetPath, targetBackup);
    if (journalBackup) writeFileSync(journalPath, journalBackup);
    await f.close();
  }
});
