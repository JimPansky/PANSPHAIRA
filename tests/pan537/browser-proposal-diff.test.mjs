import assert from "node:assert/strict";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import test, { before, after } from "node:test";
import { nativeBrowserFixture537 } from "./native-browser-fixture.mjs";

let f; let registeredProposal; let stalePage; let staleProposal;
async function proposalThroughActualBrowser(page) {
  assert.equal((await page.goto(f.origin + "/", { waitUntil: "networkidle" })).status(), 200);
  const pending = page.waitForResponse(response => response.url() === f.origin + "/api/demo/admin-ai/request" && response.request().method() === "POST");
  pending.catch(() => {});
  await page.getByRole("button", { name: "Owner escalation for synthetic order", exact: true }).click();
  const response = await pending; assert.equal(response.status(), 200);
  const value = await response.json(); assert.equal(value.decision.outcome, "OWNER_ESCALATION");
  await page.getByRole("button", { name: "Approve", exact: true }).waitFor();
  return value.proposal;
}
const nativeOrders = async () => {
  const result = await f.request("/api/demo/provider-read", { provider: "dolibarr", path: "/orders", query: {} });
  assert.equal(result.status, 200); return result.value;
};
const browserEffectCount = () => f.requests.filter(row => row.method === "POST" && row.path === "/api/demo/effects").length;
before(async () => {
  f = await nativeBrowserFixture537();
  stalePage = await f.context.newPage(); staleProposal = await proposalThroughActualBrowser(stalePage);
}, { timeout: 850000 });
after(async () => { if (f) await f.close(); }, { timeout: 200000 });

// Vertical tracer: actual browser -> existing runtime -> registered proposal.
// Original historical audit is not reused as a current execution result.
test("PAN537 AC01 current real browser order shows the registered proposal business Diff before approval", { timeout: 850000 }, async () => {
  {
    const pageResponse = await f.page.goto(f.origin + "/", { waitUntil: "networkidle" });
    assert.equal(pageResponse.status(), 200);
    const before = await f.request("/api/demo/provider-read", { provider: "dolibarr", path: "/orders", query: {} });
    assert.equal(before.status, 200);
    const responsePending = f.page.waitForResponse(response => response.url() === f.origin + "/api/demo/admin-ai/request" && response.request().method() === "POST");
    responsePending.catch(() => {}); // Preserve actual click/readiness failure, not an unhandled observer promise.
    await f.page.getByRole("button", { name: "Owner escalation for synthetic order", exact: true }).click();
    const response = await responsePending;
    assert.equal(response.status(), 200);
    const actual = await response.json();
    registeredProposal = actual.proposal;
    assert.equal(actual.decision.outcome, "OWNER_ESCALATION");
    assert.ok(actual.proposal.businessDiff);
    assert.match(actual.proposal.businessDiffDigest, /^[a-f0-9]{64}$/);
    assert.equal(Object.hasOwn(actual.decision, "businessDiff"), false);
    assert.equal(Object.hasOwn(actual.decision, "businessDiffDigest"), false);
    await f.page.waitForFunction(() => { try { return JSON.parse(document.getElementById("admin-ai-order-result").textContent).outcome === "OWNER_ESCALATION"; } catch { return false; } });
    await f.page.screenshot({ path: join(f.output, "desktop-proposal-before-approval.png"), fullPage: true });
    const observed = await f.page.locator("#admin-ai-order-result").innerText();
    const visible = JSON.parse(observed);
    writeFileSync(join(f.output, "actual-current-proposal-diff-observation.json"), JSON.stringify({ status: response.status(), decisionOutcome: actual.decision.outcome, businessDiff: actual.proposal.businessDiff, businessDiffDigest: actual.proposal.businessDiffDigest, decisionOwnsBusinessDiff: Object.hasOwn(actual.decision, "businessDiff"), observedBusinessDiffText: observed, preApprovalEffectsSent: browserEffectCount(), pageErrors: f.errors }, null, 2) + "\n", { mode: 0o600 });
    assert.deepEqual(visible.businessDiff, actual.proposal.businessDiff, "PAN537_BROWSER_DIFF_MUST_BIND_REGISTERED_PROPOSAL_NOT_DECISION");
    assert.equal(visible.businessDiffDigest, actual.proposal.businessDiffDigest);
  await f.page.screenshot({ path: join(f.output, "actual-human-readable-proposal-desktop.png"), fullPage: true });
  const table = f.page.getByRole("table", { name: "Before and after business changes", exact: true });
  assert.equal(await table.isVisible(), true, "PAN537_PROPOSAL_DIFF_MUST_HAVE_READABLE_BEFORE_AFTER_COLUMNS");
  assert.deepEqual(await table.getByRole("columnheader").allTextContents(), ["Field", "Before", "After"]);
  const labels = { customerReference: "Customer reference", customerId: "Customer ID", orderDateEpoch: "Order date (UTC)" };
  for (const change of actual.proposal.businessDiff.changes) {
    const row = table.getByRole("row").filter({ has: f.page.getByRole("rowheader", { name: labels[change.field] ?? change.field, exact: true }) });
    assert.equal(await row.getByRole("cell").nth(0).innerText(), change.before === null ? "Not present" : String(change.before));
    assert.equal(await row.getByRole("cell").nth(1).innerText(), change.field === "orderDateEpoch" ? new Date(change.after * 1000).toISOString() : String(change.after));
  }
    const images = [];
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      await f.page.setViewportSize(viewport);
      await table.scrollIntoViewIfNeeded();
      const prefix = viewport.width === 390 ? "390" : "desktop";
      const region = f.page.locator("#admin-ai-business-diff");
      await region.screenshot({ path: join(f.output, prefix + "-readable-business-diff-component.png") });
      await f.page.screenshot({ path: join(f.output, prefix + "-readable-business-diff-viewport.png") });
      const actualLayout = await table.evaluate(table => {
        const rect = element => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
        return { viewport: { width: innerWidth, height: innerHeight }, table: rect(table), cellBoxes: [...table.querySelectorAll("th,td")].map(rect), columnHeaders: [...table.querySelectorAll("thead th")].map(e => e.textContent), documentClientWidth: document.documentElement.clientWidth, documentScrollWidth: document.documentElement.scrollWidth };
      });
      assert.deepEqual(actualLayout.viewport, viewport);
      assert.ok(actualLayout.table.left >= 0 && actualLayout.table.right <= viewport.width, "Owned proposal Diff must fit actual viewport");
      assert.deepEqual(actualLayout.columnHeaders, ["Field", "Before", "After"]);
      images.push({ ...actualLayout, files: [prefix + "-readable-business-diff-component.png", prefix + "-readable-business-diff-viewport.png"], businessDiffDigest: actual.proposal.businessDiffDigest, snapshotDigest: actual.proposal.businessDiff.priorState.snapshotDigest, preApprovalEffectsSent: browserEffectCount(), scope: "OWNED_APPROVAL_REGION_NOT_WHOLE_SETUP_OR_PHYSICAL_DEVICE_ACCEPTANCE" });
    }
    await f.page.setViewportSize({ width: 1280, height: 900 });
    writeFileSync(join(f.output, "actual-readable-proposal-viewport-and-state-bindings.json"), JSON.stringify({ images, realNativeProposalAndUnmodifiedBackend: true, browserViewportNotPhysicalDevice: true }, null, 2) + "\n", { mode: 0o600 });
    const after = await f.request("/api/demo/provider-read", { provider: "dolibarr", path: "/orders", query: {} });
    assert.equal(after.status, 200);
    assert.deepEqual(after.value, before.value, "Displaying a proposal must not execute its effect");
    assert.deepEqual(f.errors, []);
  }
});

test("PAN537 AC05 genuine browser Reject issues no authority or effect", { timeout: 60000 }, async () => {
  const page = await f.context.newPage(); await proposalThroughActualBrowser(page);
  const before = await nativeOrders(); const beforePosts = browserEffectCount();
  const pending = page.waitForResponse(response => response.url() === f.origin + "/api/demo/admin-ai/owner-decision" && response.request().method() === "POST");
  pending.catch(() => {});
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  const response = await pending; assert.equal(response.status(), 200);
  const result = await response.json(); assert.equal(result.authority, null);
  assert.equal(result.decisionReceipt.outcome, "OWNER_REJECTED_NO_AUTHORITY");
  await page.waitForFunction(() => document.getElementById("admin-ai-effect-result").textContent.includes("OWNER_REJECTED_NO_AUTHORITY"));
  assert.equal(await page.getByRole("button", { name: "Run approved effect", exact: true }).count(), 0);
  assert.equal(browserEffectCount(), beforePosts); assert.deepEqual(await nativeOrders(), before);
  await page.close();
});

test("PAN537 AC05 actual authenticated browser request without executable authority cannot create an order", { timeout: 60000 }, async () => {
  const before = await nativeOrders(); const beforePosts = browserEffectCount();
  const actual = await f.page.evaluate(async () => {
    const d = adminAiEffect.decision; const p = adminAiEffect.proposal;
    // Real browser adversarial request; valid ephemeral fixture authentication
    // but no signed authority. No caller role, forged lease or response stub.
    const response = await fetch('/api/demo/effects', { method: 'POST', headers: { authorization: 'Bearer ' + controlToken(), 'x-cm-csrf': 'chimpmaera-local-v1', 'content-type': 'application/json' }, body: JSON.stringify({ action: d.action, actionDigest: d.actionDigest, businessDiff: p.businessDiff, businessDiffDigest: p.businessDiffDigest, authority: null }) });
    const value = await response.json(); return { status: response.status, error: value.error, receiptPresent: !!value.receipt };
  });
  assert.equal(actual.status, 403); assert.equal(actual.error, "AGENT_ACTION_SCOPE_DENIED");
  assert.equal(actual.receiptPresent, false); assert.equal(browserEffectCount(), beforePosts + 1);
  assert.deepEqual(await nativeOrders(), before);
  assert.equal(await f.page.getByRole("button", { name: "Run approved effect", exact: true }).count(), 0);
  writeFileSync(join(f.output, "actual-authenticated-no-executable-authority-denial.json"), JSON.stringify({ ...actual, nativeTargetUnchanged: true, noAuthorityOrCredentialRetained: true }, null, 2) + "\n", { mode: 0o600 });
});

test("PAN537 AC04 allowed owner browser request binds proposal Diff to native receipt and fresh persisted target readback", { timeout: 90000 }, async () => {
  assert.ok(registeredProposal, "The genuine first browser response is required");
  const ownerPending = f.page.waitForResponse(response => response.url() === f.origin + "/api/demo/admin-ai/owner-decision" && response.request().method() === "POST");
  ownerPending.catch(() => {});
  await f.page.getByRole("button", { name: "Approve", exact: true }).click();
  const ownerResponse = await ownerPending; assert.equal(ownerResponse.status(), 200);
  const owner = await ownerResponse.json();
  assert.equal(owner.decisionReceipt.ownerDecision, "APPROVE");
  assert.equal(owner.decisionReceipt.outcome, "OWNER_APPROVED_AUTHORITY_ISSUED");
  assert.equal(owner.decisionReceipt.businessDiffDigest, registeredProposal.businessDiffDigest);
  assert.ok(owner.authority);
  const effectPending = f.page.waitForResponse(response => response.url() === f.origin + "/api/demo/effects" && response.request().method() === "POST");
  effectPending.catch(() => {});
  await f.page.getByRole("button", { name: "Run approved effect", exact: true }).click();
  const effectResponse = await effectPending;
  const sent = effectResponse.request().postDataJSON();
  const effect = await effectResponse.json();
  writeFileSync(join(f.output, "actual-browser-owner-effect-envelope-observation.json"), JSON.stringify({ httpStatus: effectResponse.status(), backendCode: effect.error ?? null, sentBusinessDiff: sent.businessDiff ?? null, sentBusinessDiffDigest: sent.businessDiffDigest ?? null, authorityPresent: !!sent.authority, ownerDecision: owner.decisionReceipt.ownerDecision, decisionReceiptDigest: owner.decisionReceipt.receiptDigest, noRawAuthorityOrCredentialsRetained: true }, null, 2) + "\n", { mode: 0o600 });
  assert.equal(effectResponse.status(), 200, "PAN537_BROWSER_OWNER_EFFECT_MUST_SEND_REGISTERED_PROPOSAL_DIFF");
  assert.deepEqual(sent.businessDiff, registeredProposal.businessDiff);
  assert.equal(sent.businessDiffDigest, registeredProposal.businessDiffDigest);
  assert.ok(effect.receipt); assert.ok(effect.readback);
  assert.equal(effect.readback.ref_client, registeredProposal.action.payload.body.ref_client);
  const fresh = await f.request("/api/demo/provider-read", { provider: "dolibarr", path: "/orders/" + effect.readback.id, query: {} });
  assert.equal(fresh.status, 200);
  assert.equal(fresh.value.value.ref_client, effect.readback.ref_client);
  assert.equal(Number(fresh.value.value.socid), Number(effect.readback.socid));
  assert.equal(Number(fresh.value.value.date), Number(effect.readback.date));
  assert.deepEqual(f.errors, []);
  writeFileSync(join(f.output, "actual-browser-native-effect-fresh-target-readback.json"), JSON.stringify({ browserOwnerPostStatus: ownerResponse.status(), browserEffectPostStatus: effectResponse.status(), realDolibarrReadbackStatus: fresh.status, syntheticOrderId: effect.readback.id, customerReference: fresh.value.value.ref_client, customerId: Number(fresh.value.value.socid), orderDateEpoch: Number(fresh.value.value.date), actualRequestContainsExactProposalDiffDigest: true, actualNativeReceiptPresent: true, noAuthorityOrCredentialsRetained: true }, null, 2) + "\n", { mode: 0o600 });
});



test("PAN537 AC05 stale registered proposal is refused after genuine target mutation", { timeout: 60000 }, async () => {
  assert.equal(staleProposal.businessDiff.priorState.matchCount, 0);
  const before = await nativeOrders(); const beforePosts = browserEffectCount();
  const pending = stalePage.waitForResponse(response => response.url() === f.origin + "/api/demo/admin-ai/owner-decision" && response.request().method() === "POST");
  pending.catch(() => {});
  await stalePage.getByRole("button", { name: "Approve", exact: true }).click();
  const response = await pending; const result = await response.json();
  assert.equal(response.status(), 403);
  assert.equal(result.error, "APPROVAL_SNAPSHOT_STALE_DENIED");
  assert.equal(await stalePage.getByRole("button", { name: "Run approved effect", exact: true }).count(), 0);
  assert.equal(browserEffectCount(), beforePosts); assert.deepEqual(await nativeOrders(), before);
});

async function deniedActualEffect(mutate) {
  const before = await nativeOrders();
  await f.page.evaluate(mutate);
  const pending = f.page.waitForResponse(response => response.url() === f.origin + "/api/demo/effects" && response.request().method() === "POST");
  pending.catch(() => {});
  try {
    await f.page.getByRole("button", { name: "Run approved effect", exact: true }).click();
    const response = await pending; const result = await response.json();
    assert.equal(response.status(), 403);
    assert.deepEqual(await nativeOrders(), before);
    return result.error;
  } finally {
    await f.page.evaluate(() => { adminAiEffect.proposal = window.__pan537OriginalProposal; delete window.__pan537OriginalProposal; });
  }
}

test("PAN537 AC05 missing outgoing browser Diff field cannot bypass existing owner envelope gate", { timeout: 60000 }, async () => {
  const code = await deniedActualEffect(() => {
    window.__pan537OriginalProposal = adminAiEffect.proposal;
    adminAiEffect.proposal = { ...adminAiEffect.proposal };
    delete adminAiEffect.proposal.businessDiffDigest;
  });
  assert.equal(code, "OWNER_EFFECT_ENVELOPE_INVALID_DENIED");
});

test("PAN537 AC05 tampered outgoing browser Diff digest cannot use valid owner authority", { timeout: 60000 }, async () => {
  const code = await deniedActualEffect(() => {
    window.__pan537OriginalProposal = adminAiEffect.proposal;
    adminAiEffect.proposal = { ...adminAiEffect.proposal, businessDiffDigest: "0".repeat(64) };
  });
  assert.equal(code, "OWNER_AUTHORITY_INVALID_DENIED");
});

test("PAN537 AC05 browser without valid credential cannot execute even a retained valid proposal", { timeout: 60000 }, async () => {
  const before = await nativeOrders();
  // Deliberately invalid owned test value, never a productive/user secret.
  await f.page.evaluate(() => sessionStorage.setItem("cmControlToken", "invalid-owned-synthetic-test-token"));
  const pending = f.page.waitForResponse(response => response.url() === f.origin + "/api/demo/effects" && response.request().method() === "POST");
  pending.catch(() => {});
  await f.page.getByRole("button", { name: "Run approved effect", exact: true }).click();
  const response = await pending; const result = await response.json();
  assert.equal(response.status(), 403); assert.equal(result.error, "AUTHENTICATION_REQUIRED");
  assert.deepEqual(await nativeOrders(), before);
  // Own fixture init script re-provisions only its ephemeral test credential.
  // No secret is returned to this test or written into evidence.
  await f.page.reload({ waitUntil: "networkidle" });
});

test("PAN537 AC05 lost genuine native response is explicit unknown without blind effect retry", { timeout: 90000 }, async () => {
  const pending = f.page.waitForResponse(response => response.url() === f.origin + "/api/demo/admin-ai/request" && response.request().method() === "POST");
  pending.catch(() => {});
  await f.page.getByRole("button", { name: "Auto-grant synthetic contact", exact: true }).click();
  const preview = await pending; assert.equal(preview.status(), 200);
  const decision = (await preview.json()).decision; assert.equal(decision.outcome, "AUTO_GRANT");
  let actualNativeReply;
  // Relay the real unchanged backend request, then interrupt delivery only.
  // No response body, provider, authority or target result is fabricated.
  // This is browser transport ambiguity, not a claimed vendor failure.
  await f.page.route("**/api/demo/effects", async route => {
    const response = await route.fetch({ maxRedirects: 0 });
    const value = await response.json();
    actualNativeReply = { status: response.status(), receiptPresent: !!value.receipt, readbackPresent: !!value.readback, nativeReadbackId: value.readback?.id ?? null, actualAuthoritativeReadback: value.readback };
    await route.abort("connectionreset");
  });
  const beforePosts = browserEffectCount();
  await f.page.getByRole("button", { name: "Run approved effect", exact: true }).click();
  await f.page.waitForFunction(() => document.getElementById("admin-ai-effect-result").textContent.length > 0);
  assert.equal(actualNativeReply.status, 200); assert.equal(actualNativeReply.receiptPresent, true); assert.equal(actualNativeReply.readbackPresent, true);
  assert.equal(browserEffectCount(), beforePosts + 1);
  const visible = await f.page.locator("#admin-ai-effect-result").innerText();
  writeFileSync(join(f.output, "actual-native-response-interruption-observation.json"), JSON.stringify({ browserTransportOnlyNotVendorFailure: true, actualNativeResponseStatus: actualNativeReply.status, actualNativeReceiptPresent: actualNativeReply.receiptPresent, actualNativeReadbackPresent: actualNativeReply.readbackPresent, nativeReadbackId: actualNativeReply.nativeReadbackId, visibleText: visible, browserEffectRequests: browserEffectCount() - beforePosts, noAuthorityOrCredentialRetained: true }, null, 2) + "\n", { mode: 0o600 });
  assert.match(visible, /OUTCOME_UNKNOWN/, "PAN537_UNKNOWN_OUTCOME_MUST_BE_EXPLICIT_WITHOUT_BLIND_RETRY");
  assert.equal(await f.page.getByRole("button", { name: "Run approved effect", exact: true }).count(), 0, "Do not offer an uninformed mutation retry");
  await f.page.unroute("**/api/demo/effects");
});
