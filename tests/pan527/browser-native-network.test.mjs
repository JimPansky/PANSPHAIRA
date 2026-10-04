import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { nativeFixture527 } from "./helpers.mjs";

test("AC1 real certificate-verifying Chromium cookie and CSRF requests reach existing native event", async () => {
  assert.ok(process.env.PAN527_BROWSER_MODULE && process.env.PAN527_CERTUTIL, "actual isolated browser/CA tooling is required, not a skipped browser test");
  const { chromium } = await import(process.env.PAN527_BROWSER_MODULE);
  const fixture = await nativeFixture527(); let browser;
  try {
    // Only this browser child's private NSS trust/profile changes. The harness
    // HOME/HERMES_HOME and the existing system/user CA stores are untouched.
    const browserHome = join(fixture.root, "browser-home"); const nss = join(browserHome, ".pki/nssdb");
    mkdirSync(nss, { recursive: true, mode: 0o700 });
    execFileSync(process.env.PAN527_CERTUTIL, ["-N", "--empty-password", "-d", "sql:" + nss], { stdio: "ignore" });
    execFileSync(process.env.PAN527_CERTUTIL, ["-A", "-d", "sql:" + nss, "-n", "PAN527 isolated test CA", "-t", "CT,C,C", "-i", fixture.options.tls.certPath], { stdio: "ignore" });
    browser = await chromium.launch({ headless: true, env: { ...process.env, HOME: browserHome }, args: ["--no-proxy-server", "--disable-background-networking"] });
    const context = await browser.newContext({ ignoreHTTPSErrors: false });
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      return url.origin === fixture.origin ? route.continue() : route.abort();
    });
    const issued = fixture.gateway.sessionAdapter("tenant-a").issueOwnerSession({ subjectId: "synthetic-browser-reviewer-a", role: "reviewer", expiresAtMs: Date.now() + 60000 });
    // Seed an actual owner-issued opaque token, never a scripted role/tenant.
    // The following real HTTPS response writes/qualifies the cookie flags.
    await context.addCookies([{ name: "__Host-pan527-session", value: issued.cookieHeader.split("=")[1], url: fixture.origin, secure: true, httpOnly: true, sameSite: "Strict" }]);
    const page = await context.newPage(); const errors = []; const consoleErrors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    const response = await page.goto(fixture.origin + "/t/tenant-a/api/status");
    assert.equal(response.status(), 200); assert.equal(await page.evaluate(() => window.isSecureContext), true);
    assert.equal(await page.evaluate(() => location.origin), fixture.origin); assert.equal(await page.evaluate(() => document.cookie), "");
    const header = (await response.allHeaders())["set-cookie"]; assert.match(header, /; Secure; HttpOnly; SameSite=Strict; Max-Age=/);
    const cookie = (await context.cookies()).find((c) => c.name === "__Host-pan527-session");
    assert.ok(cookie.secure && cookie.httpOnly && cookie.sameSite === "Strict");
    const events = join(fixture.tenants[0].productRoot, "artifacts/poc-guided-demo/playgrounds/quick-tour/dashboard-events.jsonl");
    const before = readFileSync(events, "utf8");
    const positive = await page.evaluate(async ({ csrf }) => {
      const response = await fetch("/t/tenant-a/api/ask", { method: "POST", headers: { "content-type": "application/json", "x-pan527-csrf": csrf }, body: JSON.stringify({ question: "What is happening?" }) });
      return { status: response.status, body: await response.json() };
    }, { csrf: issued.csrf }).catch((error) => { console.log("BOUNDED_BROWSER_FETCH_DIAGNOSTIC " + JSON.stringify(consoleErrors)); throw error; });
    assert.equal(positive.status, 200, "actual same-origin browser request must reach CSRF-protected native route");
    const after = readFileSync(events, "utf8"); assert.notEqual(after, before); assert.match(after.slice(before.length), /QUESTION_ANSWERED/);
    const denied = await page.evaluate(async () => (await fetch("/t/tenant-a/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: "What is happening?" }) })).status);
    assert.equal(denied, 403); assert.equal(readFileSync(events, "utf8"), after); assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(async () => (await fetch("/t/tenant-b/api/status")).status), 401);
    assert.equal(await page.evaluate(async () => (await fetch("/t/tenant-a/api/status", { headers: { "x-role": "owner" } })).status), 403);
    const outsideOrigin = await page.evaluate(async () => { try { await fetch("https://pan527-not-owned.invalid/api/status"); return "unexpected"; } catch { return "denied"; } });
    assert.equal(outsideOrigin, "denied");
    assert.ok(consoleErrors.some((value) => value.includes("connect-src 'self'") && value.includes("pan527-not-owned.invalid")));
    assert.equal(readFileSync(events, "utf8"), after);
    if (process.env.PAN527_BROWSER_SCREENSHOT) await page.screenshot({ path: process.env.PAN527_BROWSER_SCREENSHOT, fullPage: true });
    console.log("PAN527 actual isolated Chromium " + browser.version() + "; private CA verified; Secure/HttpOnly/Strict; native CSRF positive/denial");
    await context.close();
  } finally { if (browser) await browser.close(); await fixture.close(); }
});
