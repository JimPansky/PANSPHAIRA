import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { nativeFixture527 } from "../pan527/helpers.mjs";
import { enableGuidedBrowserJourneyV1 } from "../../src/pan528/guided-browser.mjs";

export async function guidedBrowserFixture528(viewport = { width: 1100, height: 900 }) {
  if (!process.env.PAN527_BROWSER_MODULE || !process.env.PAN527_CERTUTIL) throw new Error("PAN528_REAL_BROWSER_REQUIRED_NO_SKIP");
  const { chromium } = await import(process.env.PAN527_BROWSER_MODULE);
  const fixture = await nativeFixture527(); let guidance; let browser;
  try {
    guidance = await enableGuidedBrowserJourneyV1({ optIn: true, gateway: fixture.gateway, origin: fixture.origin, tenants: fixture.tenants });
    const home = join(fixture.root, "pan528-owned-browser-home"); const nss = join(home, ".pki/nssdb"); mkdirSync(nss, { recursive: true, mode: 0o700 });
    execFileSync(process.env.PAN527_CERTUTIL, ["-N", "--empty-password", "-d", "sql:" + nss], { stdio: "ignore" });
    execFileSync(process.env.PAN527_CERTUTIL, ["-A", "-d", "sql:" + nss, "-n", "PAN528 private owned native CA", "-t", "CT,C,C", "-i", fixture.options.tls.certPath], { stdio: "ignore" });
    browser = await chromium.launch({ headless: true, env: { ...process.env, HOME: home }, args: ["--no-proxy-server", "--disable-background-networking"] });
    const context = await browser.newContext({ ignoreHTTPSErrors: false, viewport });
    await context.route("**/*", route => new URL(route.request().url()).origin === fixture.origin ? route.continue() : route.abort());
    const session = fixture.gateway.sessionAdapter("tenant-a").issueOwnerSession({ subjectId: "synthetic-pan528-owned-browser-probe", role: "reviewer", expiresAtMs: Date.now() + 120000 });
    await context.addCookies([{ name: "__Host-pan527-session", value: session.cookieHeader.split("=")[1], url: fixture.origin, secure: true, httpOnly: true, sameSite: "Strict" }]);
    const page = await context.newPage(); const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(({ csrf }) => sessionStorage.setItem("pan528-csrf", csrf), { csrf: session.csrf });
    return { fixture, guidance, browser, page, errors,
      async close() { await browser.close(); await guidance.close(); await fixture.close(); } };
  } catch (error) { if (browser) await browser.close(); if (guidance) await guidance.close(); await fixture.close(); throw error; }
}
