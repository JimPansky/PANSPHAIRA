import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { nativeFixture527, request527 } from "../pan527/helpers.mjs";
import { financeFixture } from "../pan519/native-fixture.mjs";
import { nativeRows } from "../fixtures/pan515/native-trade-fixture.mjs";
import { createNativeErvReadAdapterV1 } from "../../src/pan541/native-erv-read-adapter.mjs";
import { mountProtectedWorkspaceDocumentV1 } from "../../src/pan527/origin-session-adapter.mjs";
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test("PUI-01-AC04 real delayed native replies cannot revive a retired module/session; foreign deep links fail without foreign requests", async () => {
  assert.ok(process.env.PAN527_BROWSER_MODULE && process.env.PAN527_CERTUTIL && process.env.PAN541_BROWSER_EVIDENCE, "owned certificate-verifying real browser required, no skips");
  const { chromium } = await import(process.env.PAN527_BROWSER_MODULE);
  const tls = await nativeFixture527(); let native; let browser; let workspace; let held; const gates = []; const captures = [];
  try {
    native = await financeFixture(); const rows = () => JSON.stringify(nativeRows(native.root, "SELECT revision,effect_key,command,event FROM pan516_events ORDER BY revision")); const before = rows();
    const nativeReader = createNativeErvReadAdapterV1({ tenantId: "tenant-a", root: native.root });
    workspace = mountProtectedWorkspaceDocumentV1(tls.gateway, {
      optIn: true, tenantId: "tenant-a", origin: tls.origin, identityDigest: tls.gateway.sessionAdapter("tenant-a").binding.identityDigest,
      html: readFileSync(new URL("../../packages/browser-workspace/src/workspace.html", import.meta.url), "utf8"),
      style: readFileSync(new URL("../../packages/browser-workspace/src/workspace.css", import.meta.url), "utf8"),
      script: readFileSync(new URL("../../dist/browser-workspace/app.js", import.meta.url), "utf8"),
      async readErv(request, principal) {
        const gate = held; held = null;
        const actual = nativeReader.read({ tenantId: principal.tenantId, objectId: request.objectId, expectedRevision: request.expectedRevision });
        if (gate) {
          captures.push({ invoiceId: actual.invoiceId, revision: actual.revision }); gate.captured.resolve();
          await gate.release.promise; gate.finished.resolve();
        }
        return actual;
      },
    });
    const home = join(tls.root, "browser-safety-home"); const nss = join(home, ".pki/nssdb"); mkdirSync(nss, { recursive: true, mode: 0o700 });
    execFileSync(process.env.PAN527_CERTUTIL, ["-N", "--empty-password", "-d", "sql:" + nss], { stdio: "ignore" });
    execFileSync(process.env.PAN527_CERTUTIL, ["-A", "-d", "sql:" + nss, "-n", "PAN541 context-safety isolated CA", "-t", "CT,C,C", "-i", tls.options.tls.certPath], { stdio: "ignore" });
    browser = await chromium.launch({ headless: true, env: { ...process.env, HOME: home }, args: ["--no-proxy-server", "--disable-background-networking"] });
    const context = await browser.newContext({ ignoreHTTPSErrors: false, viewport: { width: 390, height: 844 } });
    await context.route("**/*", route => new URL(route.request().url()).origin === tls.origin ? route.continue() : route.abort());
    const sessions = tls.gateway.sessionAdapter("tenant-a");
    const issued = sessions.issueOwnerSession({ subjectId: "synthetic-context-safety-reader", role: "reader", expiresAtMs: Date.now() + 60000 });
    const setCookie = async value => context.addCookies([{ name: "__Host-pan527-session", value: value.cookieHeader.split("=")[1], url: tls.origin, secure: true, httpOnly: true, sameSite: "Strict" }]);
    await setCookie(issued); const page = await context.newPage(); page.setDefaultTimeout(6000); const errors = []; const requests = [];
    page.on("pageerror", error => errors.push(error.message)); page.on("request", r => requests.push({ method: r.method(), path: new URL(r.url()).pathname }));

    await page.goto(tls.origin + "/t/tenant-a/workspace"); await page.locator('[data-backend="setup"][data-outcome="READBACK_RECEIVED"]').waitFor();
    const delay = () => { held = { captured: deferred(), release: deferred(), finished: deferred(), retired: false }; gates.push(held); return held; };
    const moduleGate = delay(); await page.getByRole("button", { name: "Eingangsrechnungsprüfung — nur lesen", exact: true }).click(); await moduleGate.captured.promise;
    await page.locator('[data-backend="erv"][data-outcome="LOADING"]').waitFor();
    assert.equal(await page.locator('[id="shell.actions"] button').count(), 0); assert.equal(await page.locator('[id="shell.panels"]').isVisible(), false);
    await page.screenshot({ path: join(process.env.PAN541_BROWSER_EVIDENCE, "390-erv-native-loading.png"), fullPage: true });
    await page.getByRole("button", { name: "Einrichtung und Betriebszustand", exact: true }).click(); await page.locator('[data-backend="setup"][data-outcome="READBACK_RECEIVED"]').waitFor();
    moduleGate.retired = true; moduleGate.release.resolve(); await moduleGate.finished.promise;
    assert.equal(await page.locator("main h1").innerText(), "Einrichtung und Betriebszustand"); assert.doesNotMatch(await page.locator("main").innerText(), /AP-PAN516-MATCHED-01/);
    const sessionGate = delay(); await page.getByRole("button", { name: "Eingangsrechnungsprüfung — nur lesen", exact: true }).click(); await sessionGate.captured.promise;
    const replacement = sessions.issueOwnerSession({ subjectId: "synthetic-context-safety-replacement", role: "reader", expiresAtMs: Date.now() + 60000 });
    assert.equal((await request527(tls, "/t/tenant-a/workspace/logout", { cookie: issued.cookieHeader, origin: tls.origin }, "POST")).status, 200);
    await setCookie(replacement); sessionGate.release.resolve(); await sessionGate.finished.promise;
    await page.locator('[data-backend="erv"][data-outcome="DENIED"]').waitFor();
    assert.doesNotMatch(await page.locator("main").innerText(), /AP-PAN516-MATCHED-01|600,00/); assert.equal(await page.locator('[id="shell.actions"] button').count(), 0);
    await page.screenshot({ path: join(process.env.PAN541_BROWSER_EVIDENCE, "390-session-replaced-denied.png"), fullPage: true });
    assert.equal((await context.cookies(tls.origin)).find(c => c.name === "__Host-pan527-session")?.value === replacement.cookieHeader.split("=")[1], true, "RETIRED_NATIVE_READ_RESPONSE_OVERWRITES_REPLACEMENT_SESSION_COOKIE");
    await page.reload(); await page.locator('[data-backend="erv"][data-outcome="READBACK_RECEIVED"]').waitFor();
    await page.getByRole("button", { name: "Einrichtung und Betriebszustand", exact: true }).click(); await page.locator('[data-backend="setup"][data-outcome="READBACK_RECEIVED"]').waitFor();
    await page.evaluate(() => { location.hash = "#/workspace/erv?tenantId=tenant-b"; });
    await page.getByRole("heading", { name: "Deep Link verweigert", exact: true }).waitFor();
    assert.equal(requests.some(r => r.path.startsWith("/t/tenant-b/")), false);
    await page.screenshot({ path: join(process.env.PAN541_BROWSER_EVIDENCE, "390-foreign-deep-link-denied.png"), fullPage: true });
    assert.equal((await request527(tls, "/t/tenant-b/workspace/context", { cookie: replacement.cookieHeader })).status, 401);
    assert.equal(rows(), before); assert.equal(captures.length, 2); assert.ok(captures.every(c => c.invoiceId === "AP-PAN516-MATCHED-01")); assert.deepEqual(errors, []);
    console.log("PAN541 real native delayed reply captures, no fabricated body: " + JSON.stringify(captures) + "; old module and replaced session contained; foreign fragment issued no foreign request; native tenant boundary401; leading history unchanged");
    await context.close();
  } finally { for (const gate of gates) gate.release.resolve(); await browser?.close(); workspace?.close(); native?.close(); tls.gateway.server.closeAllConnections(); await tls.close(); }
});

test("UIDOD-03/04/05 actual native revision conflict and expiry deny without facts; real 200-percent CSS zoom keeps panel/control bounds", async () => {
  assert.ok(process.env.PAN527_BROWSER_MODULE && process.env.PAN527_CERTUTIL && process.env.PAN541_BROWSER_EVIDENCE, "owned certificate-verifying browser required, no skips");
  const { chromium } = await import(process.env.PAN527_BROWSER_MODULE);
  const tls = await nativeFixture527(); let native; let browser; let workspace; let expiryGate;
  try {
    native = await financeFixture(); const rows = () => JSON.stringify(nativeRows(native.root, "SELECT revision,effect_key,command,event FROM pan516_events ORDER BY revision")); const before = rows();
    const reader = createNativeErvReadAdapterV1({ tenantId: "tenant-a", root: native.root });
    workspace = mountProtectedWorkspaceDocumentV1(tls.gateway, {
      optIn: true, tenantId: "tenant-a", origin: tls.origin, identityDigest: tls.gateway.sessionAdapter("tenant-a").binding.identityDigest,
      html: readFileSync(new URL("../../packages/browser-workspace/src/workspace.html", import.meta.url), "utf8"),
      style: readFileSync(new URL("../../packages/browser-workspace/src/workspace.css", import.meta.url), "utf8"),
      script: readFileSync(new URL("../../dist/browser-workspace/app.js", import.meta.url), "utf8"),
      async readErv(request, principal) {
        const actual = reader.read({ tenantId: principal.tenantId, objectId: request.objectId, expectedRevision: request.expectedRevision });
        if (expiryGate) { expiryGate.captured.resolve(); await expiryGate.release.promise; }
        return actual;
      },
    });
    const home = join(tls.root, "browser-revision-home"); const nss = join(home, ".pki/nssdb"); mkdirSync(nss, { recursive: true, mode: 0o700 });
    execFileSync(process.env.PAN527_CERTUTIL, ["-N", "--empty-password", "-d", "sql:" + nss], { stdio: "ignore" });
    execFileSync(process.env.PAN527_CERTUTIL, ["-A", "-d", "sql:" + nss, "-n", "PAN541 revision-expiry isolated CA", "-t", "CT,C,C", "-i", tls.options.tls.certPath], { stdio: "ignore" });
    browser = await chromium.launch({ headless: true, env: { ...process.env, HOME: home }, args: ["--no-proxy-server", "--disable-background-networking"] });
    const context = await browser.newContext({ ignoreHTTPSErrors: false, viewport: { width: 390, height: 844 } });
    await context.route("**/*", route => new URL(route.request().url()).origin === tls.origin ? route.continue() : route.abort());
    const sessions = tls.gateway.sessionAdapter("tenant-a");
    const issued = sessions.issueOwnerSession({ subjectId: "synthetic-revision-reader", role: "reader", expiresAtMs: Date.now() + 60000 });
    const setCookie = async value => context.addCookies([{ name: "__Host-pan527-session", value: value.cookieHeader.split("=")[1], url: tls.origin, secure: true, httpOnly: true, sameSite: "Strict" }]);
    await setCookie(issued); const page = await context.newPage(); page.setDefaultTimeout(6000); const errors = []; const statuses = [];
    page.on("pageerror", error => errors.push(error.message)); page.on("response", r => { if (new URL(r.url()).pathname === "/t/tenant-a/workspace/erv") statuses.push(r.status()); });
    await page.goto(tls.origin + "/t/tenant-a/workspace#/workspace/erv"); await page.locator('[data-backend="erv"][data-outcome="READBACK_RECEIVED"]').waitFor();
    await page.getByRole("button", { name: "Informationspanel zum aktuellen Vorgang öffnen", exact: true }).click(); await page.getByRole("heading", { name: "Informationen zum aktuellen Rechnungsvorgang", exact: true }).waitFor();
    await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
    const zoom = await page.evaluate(() => ({ actualCssZoom: getComputedStyle(document.documentElement).zoom, viewport: innerWidth, width: document.documentElement.scrollWidth, controls: [...document.querySelectorAll("button:not(:disabled), a:not(.skip-link)")].filter(e => e.getClientRects().length).map(e => { const r = e.getBoundingClientRect(); return { label: e.textContent, left: r.left, right: r.right, width: r.width, height: r.height }; }) }));
    assert.equal(zoom.actualCssZoom, "2"); assert.ok(zoom.width <= zoom.viewport, "CSS_ZOOM_200_PAGE_OVERFLOW"); assert.ok(zoom.controls.every(c => c.width > 0 && c.height > 0 && c.left >= 0 && c.right <= zoom.viewport), "CSS_ZOOM_200_CONTROL_CLIPPING");
    const panelWordTail = await page.locator('[id="shell.panels"] h2').evaluate(heading => {
      const node = heading.firstChild; const firstWord = node.textContent.split(" ")[0];
      const glyphs = Array.from({ length: 3 }, (_, offset) => {
        const index = firstWord.length - 3 + offset; const range = document.createRange(); range.setStart(node, index); range.setEnd(node, index + 1);
        // CSS-generated hyphens can add a preceding rectangle. The final
        // rectangle of each one-character range locates its actual glyph.
        const rect = [...range.getClientRects()].at(-1); return { char: firstWord[index], top: rect.top, width: rect.width };
      });
      return { text: firstWord, hyphens: getComputedStyle(heading).hyphens, glyphs };
    });
    await page.screenshot({ path: join(process.env.PAN541_BROWSER_EVIDENCE, "390-erv-panel-css-zoom-200.png"), fullPage: true });
    console.log("PAN541 actual zoom panel word-tail rectangles " + JSON.stringify(panelWordTail));
    assert.equal(new Set(panelWordTail.glyphs.map(r => r.top)).size, 1, "ZOOM_PANEL_GERMAN_TITLE_STRANDS_FINAL_N");
    await page.evaluate(() => { document.documentElement.style.zoom = "1"; });
    const href = await page.getByRole("link", { name: "Deep Link zum aktuellen Rechnungsvorgang", exact: true }).getAttribute("href");
    const stale = new URL(href, tls.origin); const nativeRevision = Number(stale.searchParams.get("revision") ?? new URLSearchParams(stale.hash.split("?")[1]).get("revision"));
    const parameters = new URLSearchParams(stale.hash.split("?")[1]); parameters.set("revision", String(nativeRevision + 1));
    await page.evaluate(hash => { location.hash = hash; }, "#/workspace/erv?" + parameters.toString());
    await page.locator('[data-backend="erv"][data-outcome="BACKEND_UNAVAILABLE"]').waitFor(); assert.ok(statuses.includes(409));
    assert.match(await page.locator("main").innerText(), /Vorgang veraltet/); assert.doesNotMatch(await page.locator("main").innerText(), /600,00|READBACK_RECEIVED/); assert.equal(await page.locator('[id="shell.actions"] button').count(), 0);
    await page.screenshot({ path: join(process.env.PAN541_BROWSER_EVIDENCE, "390-native-revision-stale.png"), fullPage: true });
    await page.goto("about:blank");
    const short = sessions.issueOwnerSession({ subjectId: "synthetic-expiring-reader", role: "reader", expiresAtMs: Date.now() + 2000 }); await setCookie(short);
    expiryGate = { captured: deferred(), release: deferred() }; await page.goto(tls.origin + "/t/tenant-a/workspace#/workspace/erv");
    await page.locator('[data-backend="erv"][data-outcome="LOADING"]').waitFor();
    let capturedDeadline;
    try { await Promise.race([expiryGate.captured.promise, new Promise((_, reject) => { capturedDeadline = setTimeout(() => reject(new Error("ACTUAL_NATIVE_EXPIRY_GATE_NOT_CAPTURED")), 5000); })]); } finally { clearTimeout(capturedDeadline); }
    let expiryStatus; const deadline = Date.now() + 6000;
    // The status route can deny cookie renewal during its final subsecond
    // while the session itself is still valid. Observe the actual protected
    // workspace binding's expiry before releasing the genuine held read.
    do { expiryStatus = (await request527(tls, "/t/tenant-a/workspace/context", { cookie: short.cookieHeader })).status; if (expiryStatus === 200) await new Promise(r => setTimeout(r, 25)); } while (expiryStatus === 200 && Date.now() < deadline);
    assert.equal(expiryStatus, 401);
    assert.equal((await request527(tls, "/t/tenant-a/api/status", { cookie: short.cookieHeader })).status, 401);
    expiryGate.release.resolve(); await page.locator('[data-backend="erv"][data-outcome="DENIED"]').waitFor();
    assert.doesNotMatch(await page.locator("main").innerText(), /600,00|AP-PAN516-MATCHED-01/); assert.equal(await page.locator('[id="shell.actions"] button').count(), 0);
    await page.screenshot({ path: join(process.env.PAN541_BROWSER_EVIDENCE, "390-native-session-expired-denied.png"), fullPage: true });
    assert.equal(rows(), before); assert.deepEqual(errors, []); console.log("PAN541 actual native revision409 and expiry401; no stale/expired facts or actions; leading history unchanged; actual CSS zoom (not OS/browser chrome zoom) " + JSON.stringify(zoom));
    await context.close();
  } finally { expiryGate?.release.resolve(); await browser?.close(); workspace?.close(); native?.close(); tls.gateway.server.closeAllConnections(); await tls.close(); }
});
