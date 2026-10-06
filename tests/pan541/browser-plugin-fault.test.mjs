import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { nativeFixture527, request527 } from "../pan527/helpers.mjs";
import { financeFixture } from "../pan519/native-fixture.mjs";
import { createNativeErvReadAdapterV1 } from "../../src/pan541/native-erv-read-adapter.mjs";
import { enableWorkspaceBrowserV1 } from "../../src/pan541/workspace-browser.mjs";

test("PUI-01-AC05 visible disabled/dependency/version and actual renderer failure leave Setup navigation and own-session logout working", async () => {
  assert.ok(process.env.PAN527_BROWSER_MODULE && process.env.PAN527_CERTUTIL && process.env.PAN541_BROWSER_EVIDENCE, "owned real browser required, no skips");
  const { chromium } = await import(process.env.PAN527_BROWSER_MODULE);
  const tls = await nativeFixture527(); let native; let browser; let workspace;
  try {
    native = await financeFixture(); const reader = createNativeErvReadAdapterV1({ tenantId: "tenant-a", root: native.root });
    assert.doesNotThrow(() => { workspace = enableWorkspaceBrowserV1({ optIn: true, gateway: tls.gateway, tenantId: "tenant-a", origin: tls.origin, nativeReader: reader, diagnosticPlugins: true }); }, "PAN541_OWNER_DIAGNOSTIC_BROWSER_PROFILE_NOT_IMPLEMENTED");
    const home = join(tls.root, "browser-home"); const nss = join(home, ".pki/nssdb"); mkdirSync(nss, { recursive: true, mode: 0o700 });
    execFileSync(process.env.PAN527_CERTUTIL, ["-N", "--empty-password", "-d", "sql:" + nss], { stdio: "ignore" });
    execFileSync(process.env.PAN527_CERTUTIL, ["-A", "-d", "sql:" + nss, "-n", "PAN541 fault-profile isolated CA", "-t", "CT,C,C", "-i", tls.options.tls.certPath], { stdio: "ignore" });
    browser = await chromium.launch({ headless: true, env: { ...process.env, HOME: home }, args: ["--no-proxy-server", "--disable-background-networking"] });
    const context = await browser.newContext({ ignoreHTTPSErrors: false, viewport: { width: 390, height: 844 } });
    await context.route("**/*", route => new URL(route.request().url()).origin === tls.origin ? route.continue() : route.abort());
    const sessions = tls.gateway.sessionAdapter("tenant-a");
    const issued = sessions.issueOwnerSession({ subjectId: "synthetic-fault-profile-reader", role: "reader", expiresAtMs: Date.now() + 60000 });
    const peer = sessions.issueOwnerSession({ subjectId: "synthetic-unaffected-peer", role: "reader", expiresAtMs: Date.now() + 60000 });
    await context.addCookies([{ name: "__Host-pan527-session", value: issued.cookieHeader.split("=")[1], url: tls.origin, secure: true, httpOnly: true, sameSite: "Strict" }]);
    const page = await context.newPage(); const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto(tls.origin + "/t/tenant-a/workspace"); await page.locator('[data-backend="setup"][data-outcome="READBACK_RECEIVED"]').waitFor();
    const widget = page.locator('[id="shell.widgets"]');
    assert.match(await widget.innerText(), /Deaktiviert/); assert.match(await widget.innerText(), /Fehlende Pflichtabhängigkeit/); assert.match(await widget.innerText(), /Inkompatible Shellversion/);
    await page.getByRole("button", { name: "Technischer Rendererfehlernachweis", exact: true }).click();
    await page.getByText("Pluginansicht konnte nicht gerendert werden.", { exact: true }).waitFor();
    assert.match(await widget.innerText(), /RENDER_FAILED/); assert.match(await page.locator("footer").innerText(), /Keine Sandbox/);
    await page.screenshot({ path: join(process.env.PAN541_BROWSER_EVIDENCE, "390-plugin-renderer-error.png"), fullPage: true });
    await page.getByRole("button", { name: "Einrichtung und Betriebszustand", exact: true }).click(); await page.locator('[data-backend="setup"][data-outcome="READBACK_RECEIVED"]').waitFor();
    await page.getByRole("button", { name: "Abmelden", exact: true }).click(); await page.getByRole("heading", { name: "Abgemeldet", exact: true }).waitFor();
    assert.equal((await request527(tls, "/t/tenant-a/api/status", { cookie: issued.cookieHeader })).status, 401);
    assert.equal((await request527(tls, "/t/tenant-a/api/status", { cookie: peer.cookieHeader })).status, 200);
    await page.screenshot({ path: join(process.env.PAN541_BROWSER_EVIDENCE, "390-logged-out.png"), fullPage: true });
    assert.deepEqual(errors, []); await context.close();
    console.log("PAN541 actual browser fault isolation, visible disabled/missing/incompatible states, other native module usable; own logout persisted; peer session still valid");
  } finally { await browser?.close(); workspace?.close(); native?.close(); await tls.close(); }
});
