import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { nativeFixture527 } from "../pan527/helpers.mjs";

// Existing owner-issued session/CA/native product, not a fake HTTP handler,
// caller-role header or browser certificate bypass. Shape identity in the
// inherited fixture is not claimed as a new container/runtime qualification.
test("PAN528 AC1 protected native POST persists and authenticated starter is an operable browser screen", async () => {
  assert.ok(process.env.PAN527_BROWSER_MODULE && process.env.PAN527_CERTUTIL, "Real isolated browser and NSS tooling required; no skip");
  const { chromium } = await import(process.env.PAN527_BROWSER_MODULE);
  const fixture = await nativeFixture527(); let browser; let guidance; let page;
  try {
    const entry = new URL("../../src/pan528/guided-browser.mjs", import.meta.url);
    // Missing implementation still exercises the existing live ingress and
    // fails at the requested product route, not at an import/setup typo.
    if (existsSync(entry)) {
      guidance = await (await import(entry.href)).enableGuidedBrowserJourneyV1({ optIn: true, gateway: fixture.gateway, origin: fixture.origin, tenants: fixture.tenants });
    }
    const home = join(fixture.root, "pan528-private-browser-home"); const nss = join(home, ".pki/nssdb");
    mkdirSync(nss, { recursive: true, mode: 0o700 });
    execFileSync(process.env.PAN527_CERTUTIL, ["-N", "--empty-password", "-d", "sql:" + nss], { stdio: "ignore" });
    execFileSync(process.env.PAN527_CERTUTIL, ["-A", "-d", "sql:" + nss, "-n", "PAN528 private native probe CA", "-t", "CT,C,C", "-i", fixture.options.tls.certPath], { stdio: "ignore" });
    browser = await chromium.launch({ headless: true, env: { ...process.env, HOME: home }, args: ["--no-proxy-server", "--disable-background-networking"] });
    const context = await browser.newContext({ ignoreHTTPSErrors: false, viewport: { width: 1100, height: 760 } });
    await context.route("**/*", route => new URL(route.request().url()).origin === fixture.origin ? route.continue() : route.abort());
    const session = fixture.gateway.sessionAdapter("tenant-a").issueOwnerSession({ subjectId: "synthetic-pan528-browser-probe-a", role: "reviewer", expiresAtMs: Date.now() + 120000 });
    await context.addCookies([{ name: "__Host-pan527-session", value: session.cookieHeader.split("=")[1], url: fixture.origin, secure: true, httpOnly: true, sameSite: "Strict" }]);
    page = await context.newPage(); const errors = []; page.on("pageerror", error => errors.push(error.message));
    // Owner-issued CSRF is a transport nonce, not an admin/control token and
    // never part of a model prompt or helper proposal.
    await page.addInitScript(({ csrf }) => sessionStorage.setItem("pan528-csrf", csrf), { csrf: session.csrf });
    const preflight = await page.goto(fixture.origin + "/t/tenant-a/api/status"); assert.equal(preflight.status(), 200);
    assert.equal(await page.evaluate(() => window.isSecureContext), true); assert.equal(await page.evaluate(() => document.cookie), "");
    const events = join(fixture.tenants[0].productRoot, "artifacts/poc-guided-demo/playgrounds/quick-tour/dashboard-events.jsonl");
    const before = readFileSync(events, "utf8");
    const post = await page.evaluate(async ({ csrf }) => {
      const response = await fetch("/t/tenant-a/api/ask", { method: "POST", headers: { "content-type": "application/json", "x-pan527-csrf": csrf }, body: JSON.stringify({ question: "What is happening?" }) });
      return { status: response.status, value: await response.json() };
    }, { csrf: session.csrf });
    assert.equal(post.status, 200); const after = readFileSync(events, "utf8"); assert.notEqual(after, before); assert.match(after.slice(before.length), /QUESTION_ANSWERED/);
    const response = await page.goto(fixture.origin + "/t/tenant-a/guided");
    console.log(JSON.stringify({ actualBrowserVersion: browser.version(), actualTlsVerified: true, actualProtectedPostStatus: post.status, actualNativeQuestionEventPersisted: true, actualGuidedEntryHttpStatus: response.status() }));
    assert.equal(response.status(), 200, "PAN528_OPERABLE_NATIVE_GUIDED_ENTRY_REQUIRED: existing protected JSON ingress alone is not a browser journey");
    assert.match((await response.allHeaders())["content-type"], /^text\/html/);
    await page.getByRole("heading", { name: "SAFE_GUIDED process demo", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Run starter", exact: true }).isVisible(), true);
    const nativeBeforeButton = readFileSync(events, "utf8");
    const postFromButton = page.waitForResponse(r => r.url() === fixture.origin + "/t/tenant-a/api/ask" && r.request().method() === "POST");
    await page.getByRole("button", { name: "Run starter", exact: true }).click();
    assert.equal((await postFromButton).status(), 200);
    await page.waitForFunction(() => ["SUCCEEDED", "FAILED"].includes(document.getElementById("business-status").textContent));
    await page.waitForFunction(() => Number(document.getElementById("first-value").textContent) > 0);
    assert.match(readFileSync(events, "utf8").slice(nativeBeforeButton.length), /QUESTION_ANSWERED/, "Visible starter must originate in actual protected native product work, not a static result");
    assert.deepEqual(errors, []);
    if (process.env.PAN528_EVIDENCE_DIR) await page.screenshot({ path: join(process.env.PAN528_EVIDENCE_DIR, "actual-native-guided-entry.png"), fullPage: true });
    await context.close();
  } finally {
    if (page && !page.isClosed() && process.env.PAN528_EVIDENCE_DIR) await page.screenshot({ path: join(process.env.PAN528_EVIDENCE_DIR, "actual-native-guided-entry.png"), fullPage: true });
    if (browser) await browser.close(); if (guidance) await guidance.close(); await fixture.close();
  }
});


test("PAN528 AC2 actual browser starter displays expected and observed native business value with precise runtime/template identity", async () => {
  const { chromium } = await import(process.env.PAN527_BROWSER_MODULE); const fixture = await nativeFixture527(); let browser; let guidance; let page;
  try {
    guidance = await (await import("../../src/pan528/guided-browser.mjs")).enableGuidedBrowserJourneyV1({ optIn: true, gateway: fixture.gateway, origin: fixture.origin, tenants: fixture.tenants });
    const home = join(fixture.root, "pan528-domain-browser-home"); const nss = join(home, ".pki/nssdb"); mkdirSync(nss, { recursive: true, mode: 0o700 });
    execFileSync(process.env.PAN527_CERTUTIL, ["-N", "--empty-password", "-d", "sql:" + nss], { stdio: "ignore" });
    execFileSync(process.env.PAN527_CERTUTIL, ["-A", "-d", "sql:" + nss, "-n", "PAN528 native domain probe CA", "-t", "CT,C,C", "-i", fixture.options.tls.certPath], { stdio: "ignore" });
    browser = await chromium.launch({ headless: true, env: { ...process.env, HOME: home }, args: ["--no-proxy-server", "--disable-background-networking"] });
    const context = await browser.newContext({ ignoreHTTPSErrors: false }); await context.route("**/*", route => new URL(route.request().url()).origin === fixture.origin ? route.continue() : route.abort());
    const session = fixture.gateway.sessionAdapter("tenant-a").issueOwnerSession({ subjectId: "synthetic-pan528-domain-browser-probe", role: "reviewer", expiresAtMs: Date.now() + 120000 });
    await context.addCookies([{ name: "__Host-pan527-session", value: session.cookieHeader.split("=")[1], url: fixture.origin, secure: true, httpOnly: true, sameSite: "Strict" }]);
    page = await context.newPage(); const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(({ csrf }) => sessionStorage.setItem("pan528-csrf", csrf), { csrf: session.csrf });
    assert.equal((await page.goto(fixture.origin + "/t/tenant-a/guided")).status(), 200);
    await page.getByRole("button", { name: "Run starter", exact: true }).click();
    await page.waitForFunction(() => ["SUCCEEDED", "FAILED"].includes(document.getElementById("business-status").textContent));
    await page.waitForFunction(() => Number(document.getElementById("first-value").textContent) > 0);
    assert.equal(await page.getByTestId("expected-business-value").count(), 1, "PAN528_BROWSER_DOMAIN_RESULT_REQUIRED: native setup explanation alone is not the controlled business starter");
    assert.equal(await page.getByTestId("expected-business-value").innerText(), "4 STK");
    assert.equal(await page.getByTestId("observed-business-value").innerText(), "4 STK");
    assert.equal(await page.getByTestId("business-result-status").innerText(), "SUCCEEDED");
    const actual = JSON.parse(await page.getByTestId("native-starter-result").innerText());
    assert.deepEqual(actual.businessResult.expectedBusinessValue, actual.businessResult.observedBusinessValue);
    assert.equal(actual.businessResult.nativeEvidence.revision, 2);
    assert.equal(actual.businessResult.runtimeObservation.runtime.version, process.version.slice(1));
    assert.match(actual.businessResult.runtimeTemplateDigest, /^[a-f0-9]{64}$/);
    const first = await page.getByTestId("technical-first-value-ms").innerText(); assert.ok(Number(first) > 0 && Number(first) < 12000);
    const refreshed = page.waitForResponse(r => r.url() === fixture.origin + "/t/tenant-a/guided/status" && r.request().method() === "GET");
    await page.getByRole("button", { name: "Refresh status", exact: true }).click(); await refreshed;
    assert.equal(await page.getByTestId("technical-first-value-ms").innerText(), first, "First completed visible result is frozen, not a growing status timer");
    assert.deepEqual(errors, []);
    if (process.env.PAN528_EVIDENCE_DIR) await page.screenshot({ path: join(process.env.PAN528_EVIDENCE_DIR, "actual-native-browser-business-result.png"), fullPage: true });
    console.log(JSON.stringify({ actualNativeBrowserBusinessResult: true, expectedAvailable: actual.businessResult.expectedBusinessValue.available, observedAvailable: actual.businessResult.observedBusinessValue.available, nativeRevision: actual.businessResult.nativeEvidence.revision, measuredTechnicalFirstCompletedVisibleMs: Number(first), noHumanMeasurementClaim: true }));
    await context.close();
  } finally {
    if (page && !page.isClosed() && process.env.PAN528_EVIDENCE_DIR) await page.screenshot({ path: join(process.env.PAN528_EVIDENCE_DIR, "actual-native-browser-business-result.png"), fullPage: true });
    if (browser) await browser.close(); if (guidance) await guidance.close(); await fixture.close();
  }
});
