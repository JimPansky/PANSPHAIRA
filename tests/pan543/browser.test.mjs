import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync, fork } from "node:child_process";
import { join } from "node:path";
import { connect as tlsConnect } from "node:tls";
import { nativeFixture527, request527 } from "../pan527/helpers.mjs";
import { financeFixture } from "../pan519/native-fixture.mjs";
import { nativeRows } from "../fixtures/pan515/native-trade-fixture.mjs";
import { createNativeErvReadAdapterV1 } from "../../src/pan541/native-erv-read-adapter.mjs";
import { enableWorkspaceBrowserV1 } from "../../src/pan541/workspace-browser.mjs";
import { defaultBrowserProfileV1 } from "../../dist/packages/contracts/src/browser-profile-v1.js";

export async function browserFixture543() {
  assert.ok(process.env.PAN527_BROWSER_MODULE && process.env.PAN527_CERTUTIL && process.env.PAN543_BROWSER_EVIDENCE, "owned browser/CA tooling and evidence required, no skip");
  const { chromium } = await import(process.env.PAN527_BROWSER_MODULE);
  const tls = await nativeFixture527(); let native; let mounted; let browser; let gateway = tls.gateway; let child; const backendRestarts = [];
  const initialSockets = new Set();
  const trackInitialSocket = socket => { initialSockets.add(socket); socket.once("close", () => initialSockets.delete(socket)); };
  gateway.server.on("connection", trackInitialSocket);
  const retireInitialSockets = () => { gateway.server.closeAllConnections(); for (const socket of initialSockets) socket.destroy(); };
  async function stopBackend() {
    if (!child) return; const owned = child; child = null;
    await new Promise((resolve, reject) => { const deadline = setTimeout(() => { owned.kill("SIGKILL"); reject(new Error("PAN543_BACKEND_STOP_TIMEOUT")); }, 10000); owned.once("exit", (code, signal) => { clearTimeout(deadline); if (code !== 0 || signal) reject(new Error("PAN543_BACKEND_EXIT_DENIED")); else resolve(); }); owned.send("STOP"); });
  }
  try {
    native = await financeFixture(); const reader = createNativeErvReadAdapterV1({ tenantId: "tenant-a", root: native.root });
    let catalogState = "AVAILABLE";
    const catalog = () => ["shell.main", "shell.widgets", "pan.workspace.boundary", "pan.erv.information"].map(id => ({ id, version: "1.0.0", state: id === "pan.erv.information" ? catalogState : "AVAILABLE" }));
    const mount = () => enableWorkspaceBrowserV1({ optIn: true, gateway, tenantId: "tenant-a", origin: tls.origin, nativeReader: reader, profileCatalogV1: catalog });
    mounted = mount();
    const home = join(tls.root, "browser-home"); const nss = join(home, ".pki/nssdb"); mkdirSync(nss, { recursive: true, mode: 0o700 });
    execFileSync(process.env.PAN527_CERTUTIL, ["-N", "--empty-password", "-d", "sql:" + nss]);
    execFileSync(process.env.PAN527_CERTUTIL, ["-A", "-d", "sql:" + nss, "-n", "PAN543 isolated test CA", "-t", "CT,C,C", "-i", tls.options.tls.certPath]);
    browser = await chromium.launch({ headless: true, env: { ...process.env, HOME: home }, args: ["--no-proxy-server", "--disable-background-networking"] });
    const issued = () => gateway.sessionAdapter("tenant-a").issueOwnerSession({ subjectId: "synthetic-browser-profile-user", role: "reader", expiresAtMs: Date.now() + 600000 });
    const context = await browser.newContext({ ignoreHTTPSErrors: false, viewport: { width: 1440, height: 1000 } });
    context.setDefaultTimeout(5000); context.setDefaultNavigationTimeout(15000);
    await context.route("**/*", route => new URL(route.request().url()).origin === tls.origin ? route.continue() : route.abort());
    const login = async () => { const session = issued(); await context.addCookies([{ name: "__Host-pan527-session", value: session.cookieHeader.split("=")[1], url: tls.origin, secure: true, httpOnly: true, sameSite: "Strict" }]); return session; };
    const session = await login();
    return { tls, native, browser, context, session, login, backendRestarts, setCatalogState(state) { catalogState = state; },
      async restart() {
        if (child) await stopBackend(); else { mounted.close(); mounted = null; retireInitialSockets(); await new Promise((resolve, reject) => { const deadline = setTimeout(() => reject(new Error("PAN543_INITIAL_BACKEND_STOP_TIMEOUT")), 5000); gateway.server.close(error => { clearTimeout(deadline); if (error) reject(error); else resolve(); }); }); gateway.server.off("connection", trackInitialSocket); }
        child = fork(new URL("./backend-fixture.mjs", import.meta.url), [JSON.stringify(tls.options), native.root], { env: { ...process.env }, execArgv: [], silent: true });
        const owned = child; let output = ""; owned.stderr.on("data", chunk => { output = (output + chunk.toString()).slice(-65536); });
        await new Promise((resolve, reject) => { const deadline = setTimeout(() => reject(new Error("PAN543_BACKEND_READY_TIMEOUT")), 10000); owned.once("error", error => { clearTimeout(deadline); reject(error); }); owned.once("exit", code => { clearTimeout(deadline); reject(new Error("PAN543_BACKEND_START_FAILED:" + code + ":" + output)); }); owned.once("message", message => { clearTimeout(deadline); if (message?.state !== "READY" || message.pid !== owned.pid) reject(new Error("PAN543_BACKEND_READY_DENIED")); else resolve(); }); });
        backendRestarts.push(owned.pid);
        const currentCookie = (await context.cookies()).find(c => c.name === "__Host-pan527-session"); assert.ok(currentCookie);
        assert.equal((await request527(tls, "/t/tenant-a/workspace/context", { cookie: currentCookie.name + "=" + currentCookie.value })).status, 200, "ACTUAL_RESTARTED_BACKEND_HEALTH_REQUIRED");
      },
      async close() { await browser?.close(); await stopBackend(); retireInitialSockets(); mounted?.close(); native?.close(); if (gateway.server.listening) await new Promise(r => gateway.server.close(r)); gateway.server.off("connection", trackInitialSocket); await tls.close(); } };
  } catch (e) { await browser?.close(); retireInitialSockets(); mounted?.close(); native?.close(); gateway.server.off("connection", trackInitialSocket); await tls.close(); throw e; }
}
export async function snap543(page, name) {
  const path = join(process.env.PAN543_BROWSER_EVIDENCE, name + ".png"); await page.screenshot({ path, fullPage: true });
  const binding = await page.evaluate(() => ({ viewport: { width: innerWidth, height: innerHeight }, deviceScaleFactor: devicePixelRatio, route: location.pathname + location.hash, contextRevision: document.body.dataset.contextRevision ?? "unknown", nativeRevision: document.body.dataset.nativeRevision ?? "unknown", profileRevision: document.querySelector('[data-profile-state]')?.getAttribute("data-profile-revision") ?? "unknown", profileState: document.querySelector('[data-profile-state]')?.getAttribute("data-profile-state") ?? "unknown", cssZoom: getComputedStyle(document.body).zoom }));
  writeFileSync(path + ".json", JSON.stringify({ provenance: process.env.PAN543_BUILD_MANIFEST ? JSON.parse(process.env.PAN543_BUILD_MANIFEST) : { state: "UNPINNED_DEVELOPMENT" }, ...binding, imageSha256: createHash("sha256").update(readFileSync(path)).digest("hex"), visualInspection: "NOT_RUN_NO_IMAGE_VIEW_TOOL" }, null, 2) + "\n");
}
export async function dimensions543(page) {
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth,
    controls: [...document.querySelectorAll("button,a,input,select")].filter(e => e.getClientRects().length && !e.classList.contains("skip-link")).map(e => { const r = e.getBoundingClientRect(); return { label: e.getAttribute("aria-label") || e.textContent, x: r.x, right: r.right, width: r.width, height: r.height }; }) }));
  assert.ok(dimensions.width <= dimensions.viewport, JSON.stringify(dimensions));
  assert.ok(dimensions.controls.every(c => c.width > 0 && c.height > 0 && c.x >= 0 && c.right <= dimensions.viewport + 1), JSON.stringify(dimensions)); return dimensions;
}

export async function readability543(page, label) {
  const metrics = await page.evaluate(() => {
    const box = e => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); const content = e.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight); return { width: r.width, height: r.height, contentEm: content / parseFloat(s.fontSize), display: s.display, overflowX: s.overflowX, overflowY: s.overflowY }; };
    const lines = e => {
      const counts = new Map(); const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); let node;
      while ((node = walker.nextNode())) for (let i = 0; i < node.textContent.length; i++) {
        if (/\s/.test(node.textContent[i])) continue;
        const range = document.createRange(); range.setStart(node, i); range.setEnd(node, i + 1);
        for (const r of range.getClientRects()) if (r.width && r.height) { const top = Math.round(r.top); counts.set(top, (counts.get(top) || 0) + 1); }
      }
      const glyphs = [...counts.values()]; return { glyphs, total: glyphs.reduce((a,b) => a+b,0), max: Math.max(0,...glyphs) };
    };
    const main = document.getElementById("shell.main"); const panel = document.getElementById("shell.panels");
    const heading = main.querySelector("h1"); const note = document.querySelector('[id="shell.widgets"] p');
    return { viewport: { width: innerWidth, height: innerHeight }, cssZoom: getComputedStyle(document.body).zoom,
      profileRevision: document.querySelector('[data-profile-state]').getAttribute("data-profile-revision"),
      main: box(main), heading: { text: heading.textContent, ...box(heading), ...lines(heading) }, note: { text: note.textContent, ...box(note), ...lines(note) },
      facts: [...main.querySelectorAll(".facts")].map(e => box(e)),
      cells: [...main.querySelectorAll(".facts dt,.facts dd"), ...panel.querySelectorAll(".facts dt,.facts dd")].map(e => ({ text: e.textContent, ...box(e), ...lines(e) })) };
  });
  writeFileSync(join(process.env.PAN543_BROWSER_EVIDENCE, label + "-readability.json"), JSON.stringify(metrics, null, 2) + "\n");
  assert.ok(metrics.main.contentEm >= 18, "PAN543_MAIN_READABILITY_MIN18EM:" + JSON.stringify(metrics));
  assert.ok(metrics.facts.length && metrics.facts.every(f => f.contentEm >= 18), "PAN543_FACTS_READABILITY_MIN18EM:" + JSON.stringify(metrics));
  for (const item of [metrics.heading, metrics.note]) assert.ok(item.max >= Math.min(12,item.total), "PAN543_NEAR_SINGLE_GLYPH_LINES:" + JSON.stringify(item));
  assert.match(metrics.heading.text, /Eingangsrechnungsprüfung/); assert.match(metrics.note.text, /Pluginmetadaten gewähren keine Backendrechte/);
  assert.ok(metrics.cells.length && metrics.cells.every(c => c.contentEm >= 8 && c.max >= Math.min(8,c.total)), "PAN543_FACT_CELL_READABILITY_MIN8EM:" + JSON.stringify(metrics.cells));
  assert.ok([metrics.main,metrics.heading,metrics.note,...metrics.facts,...metrics.cells].every(c => c.width > 0 && c.height > 0 && !["hidden","clip"].includes(c.overflowX) && !["hidden","clip"].includes(c.overflowY)), "PAN543_READABILITY_MUST_NOT_HIDE_OR_CLIP_CONTENT");
  return metrics;
}

test("PAN543-VISUAL-01 fast real saved-large-panel revision2 CSSzoom2 readability and viewport return without writes", async () => {
  const f = await browserFixture543();
  try {
    const business = JSON.stringify(nativeRows(f.native.root, "SELECT revision,effect_key,command,event FROM pan516_events ORDER BY revision"));
    const page = await f.context.newPage(); let posts = 0; page.on("request", r => { if (r.method() === "POST" && new URL(r.url()).pathname.endsWith("/workspace/profile")) posts++; });
    await page.goto(f.tls.origin + "/t/tenant-a/workspace#/workspace/erv"); await page.locator('[data-backend="erv"][data-outcome="READBACK_RECEIVED"]').waitFor();
    await page.getByRole("button", { name: "Darstellung anpassen", exact: true }).click();
    await page.getByRole("checkbox", { name: "Informationspanel anzeigen", exact: true }).check(); await page.getByRole("slider", { name: "Informationspanel Größe", exact: true }).press("End");
    await page.getByRole("button", { name: "Betriebsstatus nach oben", exact: true }).click(); await page.getByRole("checkbox", { name: "Darstellungsgrenze anzeigen", exact: true }).uncheck();
    const save = async () => { await page.getByRole("button", { name: "Profil speichern", exact: true }).click(); await page.getByRole("button", { name: "Speichern bestätigen", exact: true }).click(); await page.locator('[data-profile-state="SAVED"]').waitFor(); };
    await save(); await page.getByRole("checkbox", { name: "Darstellungsgrenze anzeigen", exact: true }).check(); await save();
    const persisted = JSON.parse((await request527(f.tls, "/t/tenant-a/workspace/profile", { cookie: f.session.cookieHeader })).body); assert.equal(persisted.revision, 2); assert.equal(persisted.profile.items.find(i => i.id === "pan.erv.information").size, "large");
    await page.evaluate(() => { document.body.style.zoom = "2"; });
    const zoom = await readability543(page, "visual01-css-zoom2-revision2"); await dimensions543(page); await snap543(page, "visual01-css-zoom2-revision2");
    assert.deepEqual(JSON.parse((await request527(f.tls, "/t/tenant-a/workspace/profile", { cookie: f.session.cookieHeader })).body), persisted);
    await page.evaluate(() => { document.body.style.zoom = "1"; }); await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await readability543(page, "visual01-390-revision2"); await dimensions543(page); await snap543(page, "visual01-390-revision2");
    await page.setViewportSize({ width: 1440, height: 1000 }); const desktop = await readability543(page, "visual01-desktop-return-revision2"); await dimensions543(page); await snap543(page, "visual01-desktop-return-revision2");
    const placement = await page.evaluate(() => { const m = document.getElementById("shell.main").getBoundingClientRect(); const p = document.getElementById("shell.panels").getBoundingClientRect(); return { mainRight: m.right, panelLeft: p.left, panelTop: p.top, mainBottom: m.bottom }; });
    assert.ok(placement.panelLeft >= placement.mainRight && placement.panelTop < placement.mainBottom, "PAN543_ORDINARY_DESKTOP_RIGHT_PANEL_PRESERVED");
    assert.equal(posts, 2); assert.deepEqual(JSON.parse((await request527(f.tls, "/t/tenant-a/workspace/profile", { cookie: f.session.cookieHeader })).body), persisted);
    assert.equal(JSON.stringify(nativeRows(f.native.root, "SELECT revision,effect_key,command,event FROM pan516_events ORDER BY revision")), business);
    writeFileSync(join(process.env.PAN543_BROWSER_EVIDENCE, "visual01.json"), JSON.stringify({ zoom, mobile, desktop, placement, persisted, profilePosts: posts, businessHistoryUnchanged: true }, null, 2) + "\n");
  } finally { await f.close(); }
});

test("PUI-02 actual browser edits/confirm/CAS/readback, simultaneous independent right panel, logout/login/restart and 390px restore", async () => {
  const f = await browserFixture543();
  try {
    const before = JSON.stringify(nativeRows(f.native.root, "SELECT revision,effect_key,command,event FROM pan516_events ORDER BY revision"));
    const page = await f.context.newPage(); const requests = []; const errors = [];
    page.on("request", r => requests.push({ method: r.method(), path: new URL(r.url()).pathname, body: r.postData() })); page.on("pageerror", e => errors.push(e.message));
    await page.goto(f.tls.origin + "/t/tenant-a/workspace#/workspace/erv");
    await page.locator('[data-backend="erv"][data-outcome="READBACK_RECEIVED"]').waitFor();
    await page.getByRole("button", { name: "Darstellung anpassen", exact: true }).click({ timeout: 3000 });
    await page.getByRole("checkbox", { name: "Informationspanel anzeigen", exact: true }).check();
    const range = page.getByRole("slider", { name: "Informationspanel Größe", exact: true }); await range.focus(); await range.press("End");
    await page.getByRole("button", { name: "Betriebsstatus nach oben", exact: true }).click();
    await page.getByRole("checkbox", { name: "Darstellungsgrenze anzeigen", exact: true }).uncheck();
    const main = page.locator('[id="shell.main"]'); const panel = page.locator('[id="shell.panels"]'); await panel.getByRole("heading").waitFor();
    const geometry = await page.evaluate(() => { const a = document.getElementById("shell.main").getBoundingClientRect(); const b = document.getElementById("shell.panels").getBoundingClientRect(); return { main: { x: a.x, right: a.right, top: a.top, bottom: a.bottom, width: a.width }, panel: { x: b.x, top: b.top, bottom: b.bottom, width: b.width } }; });
    assert.ok(geometry.panel.x >= geometry.main.right && geometry.panel.width > 0 && geometry.main.width > 0); assert.ok(geometry.panel.top < geometry.main.bottom && geometry.main.top < geometry.panel.bottom);
    await page.getByRole("button", { name: "Profil speichern", exact: true }).click();
    await page.getByRole("heading", { name: "Darstellungsänderungen prüfen", exact: true }).waitFor();
    assert.match(await page.locator('[data-profile="diff"]').innerText(), /ausgeblendet.*angezeigt/s); assert.equal(requests.filter(r => r.method === "POST").length, 0, "preview is not persistence");
    await page.getByRole("button", { name: "Speichern bestätigen", exact: true }).click();
    await page.locator('[data-profile-state="SAVED"]').waitFor();
    const posts = requests.filter(r => r.method === "POST" && r.path.endsWith("/workspace/profile")); assert.equal(posts.length, 1);
    const payload = JSON.parse(posts[0].body); assert.equal(payload.expectedRevision, 0);
    const saved = JSON.parse((await request527(f.tls, "/t/tenant-a/workspace/profile", { cookie: f.session.cookieHeader })).body); assert.deepEqual(saved.profile, payload.profile); assert.equal(saved.revision, 1);
    await page.getByRole("button", { name: "Darstellung anpassen", exact: true }).click();
    const desktop = await dimensions543(page); await snap543(page, "desktop-saved-right-panel");
    const simultaneous = await page.evaluate(() => ["shell.main", "shell.panels"].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0 && r.width > 0 && r.height > 0; })); assert.ok(simultaneous.every(Boolean), "ERV_AND_RIGHT_PANEL_MUST_BE_IN_VIEWPORT_TOGETHER");
    await page.getByRole("button", { name: "Darstellung anpassen", exact: true }).click();
    const secondContext = await f.browser.newContext({ ignoreHTTPSErrors: false, viewport: { width: 1440, height: 1000 } }); secondContext.setDefaultTimeout(5000);
    await secondContext.route("**/*", route => new URL(route.request().url()).origin === f.tls.origin ? route.continue() : route.abort());
    const secondSession = f.tls.gateway.sessionAdapter("tenant-a").issueOwnerSession({ subjectId: "synthetic-browser-profile-user", role: "reader", expiresAtMs: Date.now() + 600000 });
    await secondContext.addCookies([{ name: "__Host-pan527-session", value: secondSession.cookieHeader.split("=")[1], url: f.tls.origin, secure: true, httpOnly: true, sameSite: "Strict" }]);
    const stale = await secondContext.newPage(); const secondStatuses = []; stale.on("response", r => { if (new URL(r.url()).pathname.endsWith("/workspace/profile")) secondStatuses.push(r.status()); });
    await stale.goto(f.tls.origin + "/t/tenant-a/workspace#/workspace/erv"); await stale.locator('[data-profile-state="READY"]').waitFor();
    await page.getByRole("checkbox", { name: "Darstellungsgrenze anzeigen", exact: true }).check(); await page.getByRole("button", { name: "Profil speichern", exact: true }).click(); await page.getByRole("button", { name: "Speichern bestätigen", exact: true }).click(); await page.locator('[data-profile-state="SAVED"]').waitFor();
    await stale.getByRole("button", { name: "Darstellung anpassen", exact: true }).click(); await stale.getByRole("checkbox", { name: "Betriebsstatus anzeigen", exact: true }).uncheck(); await stale.getByRole("button", { name: "Profil speichern", exact: true }).click(); await stale.getByRole("button", { name: "Speichern bestätigen", exact: true }).click();
    await stale.locator('[data-profile-state="CONFLICT"]').waitFor(); await snap543(stale, "desktop-conflict"); assert.equal(JSON.parse((await request527(f.tls, "/t/tenant-a/workspace/profile", { cookie: f.session.cookieHeader })).body).revision, 2);
    assert.ok(secondStatuses.includes(409)); await secondContext.close();
    const desktopProfile = JSON.parse((await request527(f.tls, "/t/tenant-a/workspace/profile", { cookie: f.session.cookieHeader })).body);
    await page.setViewportSize({ width: 390, height: 844 }); await snap543(page, "390-editor-right-panel"); const mobile = await dimensions543(page);
    await page.setViewportSize({ width: 1440, height: 1000 }); assert.deepEqual(JSON.parse((await request527(f.tls, "/t/tenant-a/workspace/profile", { cookie: f.session.cookieHeader })).body), desktopProfile);
    const zoomReadability = await (async () => { await page.evaluate(() => { document.body.style.zoom = "2"; }); const measured = await readability543(page, "desktop-css-zoom2"); await dimensions543(page); await snap543(page, "desktop-css-zoom2"); await page.evaluate(() => { document.body.style.zoom = "1"; }); return measured; })();
    assert.deepEqual(JSON.parse((await request527(f.tls, "/t/tenant-a/workspace/profile", { cookie: f.session.cookieHeader })).body), desktopProfile, "CSS_ZOOM_MUST_NOT_WRITE_SAVED_PROFILE_OR_REVISION");
    await page.getByRole("checkbox", { name: "Hauptfläche anzeigen", exact: true }).uncheck();
    await page.getByRole("button", { name: "Abmelden", exact: true }).click(); await page.getByRole("heading", { name: "Abgemeldet", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Profil speichern", exact: true }).count(), 0);
    await f.login(); await page.reload(); await page.locator('[data-profile-state="READY"]').waitFor(); await page.locator('[id="shell.panels"] h2').waitFor();
    // A real certificate-verified idle TLS preconnection must not prevent
    // backend replacement while the authenticated browser remains open.
    const idle = tlsConnect({ host: "127.0.0.1", port: f.tls.port, servername: "pan527.test", ca: f.tls.cert, rejectUnauthorized: true });
    await new Promise((resolve, reject) => { idle.once("secureConnect", resolve); idle.once("error", reject); }); assert.equal(idle.authorized, true);
    try { await f.restart(); } finally { idle.destroy(); }
    await page.reload(); await page.locator('[data-profile-state="READY"]').waitFor(); await page.locator('[id="shell.panels"] h2').waitFor();
    assert.ok(f.backendRestarts?.length && f.backendRestarts[0] !== process.pid, "REAL_BACKEND_PROCESS_RESTART_REQUIRED");
    await f.restart(); await page.reload(); await page.locator('[data-profile-state="READY"]').waitFor(); await page.locator('[id="shell.panels"] h2').waitFor();
    assert.notEqual(f.backendRestarts[0], f.backendRestarts[1]);
    const cookies = await f.context.cookies(); const cookie = cookies.find(c => c.name === "__Host-pan527-session");
    assert.deepEqual(JSON.parse((await request527(f.tls, "/t/tenant-a/workspace/profile", { cookie: cookie.name + "=" + cookie.value })).body), desktopProfile);
    await page.getByRole("button", { name: "Darstellung anpassen", exact: true }).click(); await page.getByRole("button", { name: "Standarddarstellung wiederherstellen", exact: true }).click();
    assert.equal(await page.getByRole("checkbox", { name: "Informationspanel anzeigen", exact: true }).isChecked(), false); assert.equal(JSON.parse((await request527(f.tls, "/t/tenant-a/workspace/profile", { cookie: cookie.name + "=" + cookie.value })).body).revision, 2, "default preview must not silently write");
    await page.getByRole("button", { name: "Profil speichern", exact: true }).click(); await page.getByRole("button", { name: "Speichern bestätigen", exact: true }).click(); await page.locator('[data-profile-state="SAVED"]').waitFor();
    const restoredDefault = JSON.parse((await request527(f.tls, "/t/tenant-a/workspace/profile", { cookie: cookie.name + "=" + cookie.value })).body); assert.equal(restoredDefault.revision, 3); assert.deepEqual(restoredDefault.profile, defaultBrowserProfileV1());
    assert.deepEqual(errors, []); assert.equal(JSON.stringify(nativeRows(f.native.root, "SELECT revision,effect_key,command,event FROM pan516_events ORDER BY revision")), before);
    writeFileSync(join(process.env.PAN543_BROWSER_EVIDENCE, "journey.json"), JSON.stringify({ browser: f.browser.version(), viewports: [1440, 390], requests, secondStatuses, geometry, desktop, mobile, zoomReadability, targetReadback: desktopProfile, restoredDefault, backendRestarts: f.backendRestarts, businessHistoryUnchanged: true, errors }, null, 2));
  } finally { await f.close(); }
});

test("PUI-02 real pointer drag/keyboard resize, removed/denied panel projection and session replacement preserve own-scope authority", async () => {
  const f = await browserFixture543();
  try {
    const page = await f.context.newPage(); const errors = []; page.on("pageerror", e => errors.push(e.message));
    await page.goto(f.tls.origin + "/t/tenant-a/workspace#/workspace/erv"); await page.locator('[data-backend="erv"][data-outcome="READBACK_RECEIVED"]').waitFor();
    await page.getByRole("button", { name: "Darstellung anpassen", exact: true }).click();
    await page.getByRole("checkbox", { name: "Darstellungsgrenze anzeigen", exact: true }).evaluate(e => { window.retiredProfileControl = e; });
    await page.locator('[data-profile-item="pan.workspace.boundary"] h3').dragTo(page.locator('[data-profile-item="shell.main"] h3'));
    await page.evaluate(() => { window.retiredProfileControl.checked = false; window.retiredProfileControl.dispatchEvent(new Event("change")); });
    assert.equal(await page.locator('[id="pan.workspace.boundary"]').isVisible(), true, "RETIRED_ROW_LISTENER_MUST_NOT_MUTATE_CURRENT_DRAFT");
    assert.equal(await page.locator(".profile-row").first().getAttribute("data-profile-item"), "pan.workspace.boundary");
    const down = page.getByRole("button", { name: "Darstellungsgrenze nach unten", exact: true }); await down.focus(); await down.press("Enter");
    assert.equal(await page.locator(".profile-row").nth(1).getAttribute("data-profile-item"), "pan.workspace.boundary");
    const check = page.getByRole("checkbox", { name: "Informationspanel anzeigen", exact: true }); await check.focus(); await check.press("Space");
    const size = page.getByRole("slider", { name: "Informationspanel Größe", exact: true }); await size.focus(); await size.press("Home"); assert.equal(await size.inputValue(), "0"); await size.press("ArrowRight"); assert.equal(await size.inputValue(), "1");
    await page.getByRole("button", { name: "Profil speichern", exact: true }).click(); await page.getByRole("button", { name: "Speichern bestätigen", exact: true }).click(); await page.locator('[data-profile-state="SAVED"]').waitFor();
    await page.locator('[id="shell.panels"] h2').waitFor();
    f.setCatalogState("MISSING"); await page.reload(); await page.locator('[data-profile-state="READY"]').waitFor(); await page.getByRole("button", { name: "Darstellung anpassen", exact: true }).click();
    assert.equal(await page.locator('[id="shell.panels"]').isVisible(), false); assert.equal(await page.getByRole("checkbox", { name: "Informationspanel anzeigen", exact: true }).isDisabled(), true);
    assert.match(await page.locator('[id="profile.controls"]').innerText(), /MISSING/); await snap543(page, "desktop-orphan-missing");
    f.setCatalogState("DENIED"); await page.reload(); await page.locator('[data-profile-state="READY"]').waitFor(); await page.getByRole("button", { name: "Darstellung anpassen", exact: true }).click();
    assert.match(await page.locator('[id="profile.controls"]').innerText(), /DENIED/); await page.getByRole("button", { name: "Informationspanel zum aktuellen Vorgang öffnen", exact: true }).click(); assert.equal(await page.locator('[id="shell.panels"]').isVisible(), false);
    await page.setViewportSize({ width: 390, height: 844 }); await dimensions543(page); await snap543(page, "390-contribution-denied");
    const other = f.tls.gateway.sessionAdapter("tenant-a").issueOwnerSession({ subjectId: "synthetic-replacement-user", role: "reader", expiresAtMs: Date.now() + 60000 });
    await f.context.addCookies([{ name: "__Host-pan527-session", value: other.cookieHeader.split("=")[1], url: f.tls.origin, secure: true, httpOnly: true, sameSite: "Strict" }]);
    await page.getByRole("button", { name: "Gespeichertes Profil neu laden — lokale Änderungen verwerfen", exact: true }).click(); await page.locator('[data-profile-state="DENIED"]').waitFor();
    assert.doesNotMatch(await page.locator("main").innerText(), /AP-PAN516-MATCHED-01|600,00/); assert.equal(await page.locator('[id="shell.panels"]').isVisible(), false);
    await snap543(page, "390-session-denied"); assert.equal(JSON.parse((await request527(f.tls, "/t/tenant-a/workspace/profile", { cookie: other.cookieHeader })).body).revision, 0);
    await page.setViewportSize({ width: 1440, height: 1000 }); await dimensions543(page); await snap543(page, "desktop-session-denied"); assert.deepEqual(errors, []);
  } finally { await f.close(); }
});

test("PUI-02 actual applied-but-unacknowledged write remains outcome_unknown without retry; backend reload reconciles", async () => {
  const f = await browserFixture543();
  try {
    const page = await f.context.newPage(); let posts = 0;
    await page.route("**/workspace/profile", async route => {
      if (route.request().method() === "POST") {
        posts++; const headers = route.request().headers();
        const actual = await request527(f.tls, "/t/tenant-a/workspace/profile", { cookie: headers.cookie, origin: f.tls.origin, "x-pan543-session": headers["x-pan543-session"] }, "POST", JSON.parse(route.request().postData()));
        assert.equal(actual.status, 200); await route.abort("failed");
      } else await route.continue();
    });
    await page.goto(f.tls.origin + "/t/tenant-a/workspace"); await page.locator('[data-profile-state="READY"]').waitFor(); await page.getByRole("button", { name: "Darstellung anpassen", exact: true }).click();
    await page.getByRole("checkbox", { name: "Darstellungsgrenze anzeigen", exact: true }).uncheck(); await page.getByRole("button", { name: "Profil speichern", exact: true }).click(); await page.getByRole("button", { name: "Speichern bestätigen", exact: true }).click();
    await page.locator('[data-profile-state="OUTCOME_UNKNOWN"]').waitFor(); assert.equal(posts, 1); assert.equal(await page.getByRole("button", { name: "Profil speichern", exact: true }).isDisabled(), true);
    assert.equal(JSON.parse((await request527(f.tls, "/t/tenant-a/workspace/profile", { cookie: f.session.cookieHeader })).body).revision, 1);
    await snap543(page, "desktop-outcome-unknown"); await page.setViewportSize({ width: 390, height: 844 }); await dimensions543(page); await snap543(page, "390-outcome-unknown");
    await page.getByRole("button", { name: "Gespeichertes Profil neu laden — lokale Änderungen verwerfen", exact: true }).click(); await page.locator('[data-profile-state="READY"]').waitFor(); assert.equal(posts, 1);
    assert.equal(await page.getByRole("checkbox", { name: "Darstellungsgrenze anzeigen", exact: true }).isChecked(), false);
  } finally { await f.close(); }
});

test("PUI-02 actual empty/loading/unavailable and versioned native migration/fallback render without silent persistence", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const f = await browserFixture543();
  try {
    const page = await f.context.newPage(); let release; const wait = new Promise(r => { release = r; }); let entered; const reached = new Promise(r => { entered = r; });
    await page.route("**/workspace/profile", async route => { entered(); await wait; await route.continue(); });
    const navigation = page.goto(f.tls.origin + "/t/tenant-a/workspace"); await reached;
    await page.locator('[data-profile-state="LOADING"]').waitFor();
    await page.getByRole("button", { name: "Eingangsrechnungsprüfung — nur lesen", exact: true }).waitFor();
    await snap543(page, "desktop-loading"); await page.setViewportSize({ width: 390, height: 844 }); await dimensions543(page); await snap543(page, "390-loading");
    release(); await navigation; await page.locator('[data-profile-state="READY"]').waitFor(); assert.match(await page.locator('[id="profile.controls"]').innerText(), /Noch kein persönliches Profil/); await snap543(page, "390-empty");
    await page.unroute("**/workspace/profile"); await page.setViewportSize({ width: 1440, height: 1000 }); await snap543(page, "desktop-empty");
    await page.route("**/workspace/profile", route => route.abort("failed")); await page.reload(); await page.locator('[data-profile-state="UNAVAILABLE"]').waitFor(); await snap543(page, "desktop-unavailable"); await page.setViewportSize({ width: 390, height: 844 }); await dimensions543(page); await snap543(page, "390-unavailable");
    await page.unroute("**/workspace/profile");
    const path = join(f.tls.tenants[0].productRoot, "browser-profiles.sqlite"); const db = new DatabaseSync(path);
    const old = { schemaVersion: "pansphaira.browser-profile/v0", items: [{ id: "shell.main", version: "1.0.0", visible: true, size: 2 }, { id: "pan.erv.information", version: "1.0.0", visible: true, size: 3 }] };
    db.prepare("INSERT INTO browser_profiles(tenant_id,subject_id,revision,profile) VALUES(?,?,?,?)").run("tenant-a", "synthetic-browser-profile-user", 7, JSON.stringify(old));
    const migratedTarget = await request527(f.tls, "/t/tenant-a/workspace/profile", { cookie: f.session.cookieHeader }); console.log("PAN543 migration target", migratedTarget.status, migratedTarget.body); assert.equal(migratedTarget.status, 200);
    await page.goto(f.tls.origin + "/t/tenant-a/workspace#/workspace/erv"); await page.reload(); await page.locator('[data-profile-state="READY"]').waitFor(); await page.locator('[id="shell.panels"] h2').waitFor();
    assert.match(await page.locator('[id="profile.controls"]').innerText(), /V0_TO_V1/); assert.equal(db.prepare("SELECT profile FROM browser_profiles").get().profile, JSON.stringify(old), "migration read must not write"); await snap543(page, "390-migration-preview");
    await page.getByRole("button", { name: "Darstellung anpassen", exact: true }).click();
    await page.getByRole("button", { name: "Profil speichern", exact: true }).click(); await page.getByRole("button", { name: "Speichern bestätigen", exact: true }).click(); await page.locator('[data-profile-state="SAVED"]').waitFor();
    const persistedMigration = db.prepare("SELECT revision,profile FROM browser_profiles").get(); assert.equal(persistedMigration.revision, 8); assert.equal(JSON.parse(persistedMigration.profile).schemaVersion, "pansphaira.browser-profile/v1");
    await page.getByRole("button", { name: "Standarddarstellung wiederherstellen", exact: true }).click();
    assert.equal(await page.getByRole("checkbox", { name: "Betriebsstatus anzeigen", exact: true }).isDisabled(), false, "default restore must include catalog contributions omitted by saved profile");
    db.prepare("UPDATE browser_profiles SET profile=?").run(JSON.stringify({ ...old, items: [{ ...old.items[0], size: 100 }] })); await page.reload(); await page.locator('[data-profile-state="READY"]').waitFor(); assert.match(await page.locator('[id="profile.controls"]').innerText(), /DEFAULT_UNSUPPORTED/);
    assert.equal(db.prepare("SELECT revision FROM browser_profiles").get().revision, 8); db.close();
    await snap543(page, "390-invalid-migration-default"); await page.setViewportSize({ width: 1440, height: 1000 }); await snap543(page, "desktop-invalid-migration-default");
  } finally { await f.close(); }
});

test("PUI-02 late actual profile response from a retired session cannot restore stale display or report READY", async () => {
  const f = await browserFixture543(); let release;
  try {
    const page = await f.context.newPage(); await page.goto(f.tls.origin + "/t/tenant-a/workspace#/workspace/erv"); await page.locator('[data-profile-state="READY"]').waitFor(); await page.locator('[data-backend="erv"][data-outcome="READBACK_RECEIVED"]').waitFor();
    let entered; const reached = new Promise(r => { entered = r; }); const held = new Promise(r => { release = r; });
    await page.route("**/workspace/profile", async route => {
      const actual = await request527(f.tls, "/t/tenant-a/workspace/profile", { cookie: route.request().headers().cookie, "x-pan543-session": route.request().headers()["x-pan543-session"] });
      assert.equal(actual.status, 200); entered(); await held;
      await route.fulfill({ status: actual.status, headers: { "content-type": "application/json" }, body: actual.body });
    });
    await page.getByRole("button", { name: "Darstellung anpassen", exact: true }).click(); await page.getByRole("button", { name: "Gespeichertes Profil neu laden — lokale Änderungen verwerfen", exact: true }).click(); await reached;
    assert.equal((await request527(f.tls, "/t/tenant-a/workspace/logout", { cookie: f.session.cookieHeader, origin: f.tls.origin }, "POST")).status, 200);
    await f.login(); release(); await page.locator('[data-profile-state="DENIED"]').waitFor();
    assert.doesNotMatch(await page.locator("main").innerText(), /AP-PAN516-MATCHED-01|600,00/);
  } finally { release?.(); await f.close(); }
});
