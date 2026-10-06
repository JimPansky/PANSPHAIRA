import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import test, { before, after } from "node:test";
import { nativeBrowserFixture537 } from "../pan537/native-browser-fixture.mjs";

let f;
before(async () => { f = await nativeBrowserFixture537(); }, { timeout: 850000 });
after(async () => { if (f) await f.close(); });

// Reuse the retained real installer/browser/native fixture, not a new backend,
// fake response, inferred permission or historical audit verdict.
test("PAN538 AC01 actual current existing setup question fits real390 bounds", { timeout: 850000 }, async () => {
  try {
    assert.equal((await f.page.goto(f.origin + "/", { waitUntil: "networkidle" })).status(), 200);
    const observations = [];
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      await f.page.setViewportSize(viewport);
      const question = f.page.locator("#question");
      await question.scrollIntoViewIfNeeded();
      const prefix = viewport.width === 390 ? "390" : "desktop";
      await question.locator("..").screenshot({ path: join(f.output, prefix + "-actual-setup-question-card.png") });
      await f.page.screenshot({ path: join(f.output, prefix + "-actual-setup-question-viewport.png") });
      const bounds = await f.page.evaluate(() => {
        const box = element => { const r = element.getBoundingClientRect(); const style = getComputedStyle(element); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, overflowX: style.overflowX }; };
        const input = document.getElementById("question"); const card = input.closest("section"); const ask = document.getElementById("ask");
        return { viewport: { width: innerWidth, height: innerHeight }, document: box(document.documentElement), body: box(document.body), card: box(card), question: box(input), ask: box(ask), askText: ask.textContent, pageClipping: [document.documentElement, document.body].map(e => getComputedStyle(e).overflowX) };
      });
      observations.push(bounds);
      writeFileSync(join(f.output, "actual-current-setup-question-bounds.json"), JSON.stringify({ observations, noHttpStubs: true, realInstallerAndNativeServices: true, sourceIsRetained537DevelopmentTreeNotCurrentMain: true, browserViewportNotPhysicalDevice: true }, null, 2) + "\n", { mode: 0o600 });
      assert.deepEqual(bounds.viewport, viewport);
      assert.ok(bounds.question.width > 0 && bounds.question.height > 0 && bounds.ask.width > 0 && bounds.ask.height > 0);
      assert.equal(bounds.askText, "Ask"); // Historical evidence did not claim it disappeared.
      assert.ok(!bounds.pageClipping.includes("hidden") && !bounds.pageClipping.includes("clip"), "A hidden page is not a layout correction");
      assert.ok(bounds.document.scrollWidth <= bounds.document.clientWidth && bounds.question.left >= bounds.card.left && bounds.question.right <= bounds.card.right && bounds.card.right <= viewport.width && bounds.ask.right <= bounds.card.right, "PAN538_ACTUAL390_PAGE_AND_QUESTION_MUST_FIT");
    }
    assert.deepEqual(f.errors, []);
  } finally { await f.page.evaluate(() => { document.documentElement.style.zoom = ""; }); }
});

// CSS-layout zoom is an explicit stress probe, not physical-device or browser
// chrome zoom qualification. It exercises the same real native page/controls.
test("PAN538 AC04 real390 CSS200percent layout zoom keeps setup controls bounded", { timeout: 850000 }, async () => {
  try {
    assert.equal((await f.page.goto(f.origin + "/", { waitUntil: "networkidle" })).status(), 200);
    await f.page.setViewportSize({ width: 390, height: 844 });
    await f.page.evaluate(() => { document.documentElement.style.zoom = "2"; });
    const question = f.page.locator("#question");
    await question.scrollIntoViewIfNeeded();
    await f.page.screenshot({ path: join(f.output, "390-css200percent-actual-setup-question-viewport.png") });
    const bounds = await f.page.evaluate(() => {
      const box = e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width, height: r.height, clientWidth: e.clientWidth, scrollWidth: e.scrollWidth }; };
      const q = document.getElementById("question"), card = q.closest("section"), ask = document.getElementById("ask");
      return { viewportWidth: innerWidth, zoom: getComputedStyle(document.documentElement).zoom, document: box(document.documentElement), body: box(document.body), card: box(card), question: box(q), ask: box(ask), pageOverflow: [document.documentElement, document.body].map(e => getComputedStyle(e).overflowX), gridTemplateColumns: getComputedStyle(document.querySelector(".grid")).gridTemplateColumns };
    });
    writeFileSync(join(f.output, "actual-current-css200percent-setup-question-bounds.json"), JSON.stringify({ bounds, realInstallerAndNativeServices: true, noHttpStubs: true, cssLayoutZoomNotBrowserChromeZoom: true }, null, 2) + "\n", { mode: 0o600 });
    assert.equal(bounds.viewportWidth, 390);
    assert.equal(bounds.zoom, "2");
    assert.ok(!bounds.pageOverflow.includes("hidden") && !bounds.pageOverflow.includes("clip"), "page clipping must not pretend to fix zoom");
    assert.ok(bounds.question.width > 0 && bounds.question.height > 0 && bounds.ask.width > 0 && bounds.ask.height > 0);
    assert.ok(bounds.document.scrollWidth <= bounds.document.clientWidth && bounds.body.right <= 390 && bounds.card.right <= 390 && bounds.question.left >= bounds.card.left && bounds.question.right <= bounds.card.right && bounds.ask.right <= bounds.card.right, "PAN538_ACTUAL390_CSS200_LAYOUT_AND_CONTROLS_MUST_FIT");
    assert.deepEqual(f.errors, []);
  } finally { await f.page.evaluate(() => { document.documentElement.style.zoom = ""; }); }
});



// Synthetic German content stress in the genuine existing DOM; this is not a
// delivered German localization and does not stub an API or replace a backend.
test("PAN538 AC04 long German question and action label stay usable in current DOM", { timeout: 60000 }, async () => {
  assert.equal((await f.page.goto(f.origin + "/", { waitUntil: "networkidle" })).status(), 200);
  const questionText = "Wie kann ich den aktuellen Einrichtungsfortschritt mit den verfügbaren Wiederaufnahmeoptionen überprüfen, ohne zusätzliche Berechtigungen oder produktive Änderungen auszulösen?";
  const actionLabel = "Einrichtungsfortschritt und Wiederaufnahmeoptionen überprüfen";
  await f.page.locator("#question").fill(questionText);
  await f.page.locator("#ask").evaluate((button, label) => { button.textContent = label; }, actionLabel);
  const observations = [];
  try {
    for (const mode of [{ width: 1280, height: 900, zoom: "1" }, { width: 390, height: 844, zoom: "1" }, { width: 390, height: 844, zoom: "2" }]) {
      await f.page.setViewportSize({ width: mode.width, height: mode.height });
      await f.page.evaluate(zoom => { document.documentElement.style.zoom = zoom; }, mode.zoom);
      await f.page.locator("#question").focus();
      await f.page.locator("#question").scrollIntoViewIfNeeded();
      const bounds = await f.page.evaluate(() => {
        const box = e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width, height: r.height }; };
        const q = document.getElementById("question"), card = q.closest("section"), ask = document.getElementById("ask");
        return { viewportWidth: innerWidth, documentClientWidth: document.documentElement.clientWidth, documentScrollWidth: document.documentElement.scrollWidth, card: box(card), question: box(q), ask: box(ask), focusId: document.activeElement.id, inputValue: q.value, actionLabel: ask.textContent, pageOverflow: [document.documentElement, document.body].map(e => getComputedStyle(e).overflowX) };
      });
      observations.push({ mode, bounds });
      writeFileSync(join(f.output, "actual-current-german-content-layout-bounds.json"), JSON.stringify({ observations, syntheticGermanContentNotDeliveredLocalization: true, realExistingPageAndNativeServices: true, noHttpStubs: true }, null, 2) + "\n", { mode: 0o600 });
      await f.page.screenshot({ path: join(f.output, `german-${mode.width}-css${mode.zoom}-current-viewport.png`) });
      assert.equal(bounds.inputValue, questionText);
      assert.equal(bounds.actionLabel, actionLabel);
      assert.equal(bounds.focusId, "question");
      assert.ok(!bounds.pageOverflow.includes("hidden") && !bounds.pageOverflow.includes("clip"));
      assert.ok(bounds.question.width > 0 && bounds.question.height > 0 && bounds.ask.width > 0 && bounds.ask.height > 0);
      assert.ok(bounds.documentScrollWidth <= bounds.documentClientWidth && bounds.card.right <= mode.width && bounds.question.left >= bounds.card.left && bounds.question.right <= bounds.card.right && bounds.ask.left >= bounds.card.left && bounds.ask.right <= bounds.card.right, "PAN538_LONG_GERMAN_INPUT_AND_ACTION_LABEL_MUST_FIT");
    }
    assert.deepEqual(f.errors, []);
  } finally { await f.page.evaluate(() => { document.documentElement.style.zoom = ""; }); }
});


// Forward a real owned native request and defer only its response delivery.
// Pending-layout evidence is not a mocked reply or an invented loading spinner.
test("PAN538 AC04 AC06 keyboard question retains real request contract and pending response layout", { timeout: 60000 }, async () => {
  assert.equal((await f.page.goto(f.origin + "/", { waitUntil: "networkidle" })).status(), 200);
  await f.page.setViewportSize({ width: 390, height: 844 });
  const question = "Welcher status gilt für den aktuellen Einrichtungsfortschritt und die sichere Wiederaufnahme ohne zusätzliche Berechtigungen?";
  const expectedDigest = "sha256:" + createHash("sha256").update(JSON.stringify({ question })).digest("hex");
  let release, backendReady, sentBody, genuineReply, genuineStatus;
  const held = new Promise(resolve => { release = resolve; });
  const ready = new Promise(resolve => { backendReady = resolve; });
  await f.page.route("**/api/ask", async route => {
    sentBody = route.request().postDataJSON();
    const response = await route.fetch();
    genuineStatus = response.status(); genuineReply = await response.json();
    backendReady(); await held; await route.fulfill({ response });
  });
  const observations = [];
  const measure = async phase => {
    const bounds = await f.page.evaluate(() => {
      const box = e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width, height: r.height }; };
      const q = document.getElementById("question"), ask = document.getElementById("ask"), card = q.closest("section");
      return { documentClientWidth: document.documentElement.clientWidth, documentScrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, question: box(q), ask: box(ask), card: box(card), focusId: document.activeElement.id, answer: document.getElementById("answer").textContent, pageOverflow: [document.documentElement, document.body].map(e => getComputedStyle(e).overflowX) };
    });
    observations.push({ phase, bounds });
    writeFileSync(join(f.output, "actual-keyboard-native-question-pending-and-result.json"), JSON.stringify({ observations, sentBody, genuineStatus, genuineReply, expectedDigest, responseDeliveryHeldOnly: true, noHttpStubs: true, actualNativeBackend: true }, null, 2) + "\n", { mode: 0o600 });
    await f.page.screenshot({ path: join(f.output, "390-native-question-" + phase + "-viewport.png") });
    assert.ok(bounds.documentScrollWidth <= bounds.documentClientWidth && bounds.card.right <= bounds.viewportWidth && bounds.question.right <= bounds.card.right && bounds.ask.right <= bounds.card.right, "PAN538_GENUINE_QUESTION_PENDING_OR_RESULT_LAYOUT_MUST_FIT");
    assert.ok(bounds.question.width > 0 && bounds.question.height > 0 && bounds.ask.width > 0 && bounds.ask.height > 0);
    assert.ok(!bounds.pageOverflow.includes("hidden") && !bounds.pageOverflow.includes("clip"));
    return bounds;
  };
  try {
    await f.page.locator("#question").fill(question);
    await f.page.locator("#question").focus();
    await f.page.keyboard.press("Tab");
    assert.equal(await f.page.evaluate(() => document.activeElement.id), "ask");
    await f.page.keyboard.press("Enter");
    await ready;
    assert.deepEqual(sentBody, { question });
    assert.equal(genuineStatus, 200);
    assert.equal(genuineReply.providerId, "DETERMINISTIC_ADMIN_ASSISTANT_V1");
    assert.equal(genuineReply.topic, "PROGRESS");
    assert.equal(genuineReply.questionDigest, expectedDigest);
    assert.equal(genuineReply.persistedQuestionText, false);
    assert.equal((await measure("pending-real-response-delivery")).focusId, "ask");
    release();
    await f.page.waitForFunction(digest => {
      try { return JSON.parse(document.getElementById("answer").textContent).questionDigest === digest; }
      catch { return false; }
    }, expectedDigest);
    const shown = JSON.parse((await measure("genuine-native-result")).answer);
    assert.deepEqual(shown, genuineReply);
    assert.match(shown.answer, /stages .*complete/);
    assert.deepEqual(f.errors, []);
  } finally { release(); await f.page.unroute("**/api/ask"); }
});


test("PAN538 AC04 AC06 real denied ask preserves bounded keyboard controls and authorization", { timeout: 60000 }, async () => {
  assert.equal((await f.page.goto(f.origin + "/", { waitUntil: "networkidle" })).status(), 200);
  await f.page.setViewportSize({ width: 390, height: 844 });
  const question = "Welcher status gilt für die sichere Wiederaufnahme ohne zusätzliche Berechtigungen?";
  // The fixture-generated synthetic credential stays inside the browser.
  // A code-owned invalid string is a negative input, not an invented role.
  await f.page.evaluate(() => sessionStorage.setItem("cmControlToken", "invalid-owned-pan538-negative"));
  try {
    await f.page.locator("#question").fill(question);
    await f.page.locator("#question").focus();
    await f.page.keyboard.press("Tab");
    assert.equal(await f.page.evaluate(() => document.activeElement.id), "ask");
    const responsePromise = f.page.waitForResponse(r => r.url() === f.origin + "/api/ask" && r.request().method() === "POST");
    await f.page.keyboard.press("Enter");
    const response = await responsePromise;
    assert.deepEqual(response.request().postDataJSON(), { question });
    assert.equal(response.status(), 403);
    const denial = await response.json();
    assert.equal(denial.error, "AUTHENTICATION_REQUIRED");
    await f.page.waitForFunction(() => document.getElementById("answer").textContent === "Error: AUTHENTICATION_REQUIRED");
    const bounds = await f.page.evaluate(() => {
      const box = e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width, height: r.height }; };
      const q = document.getElementById("question"), ask = document.getElementById("ask"), card = q.closest("section");
      return { documentClientWidth: document.documentElement.clientWidth, documentScrollWidth: document.documentElement.scrollWidth, question: box(q), ask: box(ask), card: box(card), focusId: document.activeElement.id, answer: document.getElementById("answer").textContent, pageOverflow: [document.documentElement, document.body].map(e => getComputedStyle(e).overflowX) };
    });
    writeFileSync(join(f.output, "actual-keyboard-native-ask-auth-denial-layout.json"), JSON.stringify({ responseStatus: response.status(), denial, requestBody: { question }, bounds, noHttpStubs: true, realNativeBackendDenial: true, noCredentialValuesInEvidence: true }, null, 2) + "\n", { mode: 0o600 });
    await f.page.screenshot({ path: join(f.output, "390-native-question-genuine-auth-denial-viewport.png") });
    assert.equal(bounds.focusId, "ask");
    assert.ok(bounds.documentScrollWidth <= bounds.documentClientWidth && bounds.card.right <= 390 && bounds.question.right <= bounds.card.right && bounds.ask.right <= bounds.card.right, "PAN538_REAL_AUTH_DENIAL_LAYOUT_MUST_FIT");
    assert.ok(bounds.question.width > 0 && bounds.question.height > 0 && bounds.ask.width > 0 && bounds.ask.height > 0);
    assert.ok(!bounds.pageOverflow.includes("hidden") && !bounds.pageOverflow.includes("clip"));
    assert.deepEqual(f.errors, []);
  } finally {
    // Reload restores only the original context initialization token; never
    // read a credential value back into Node/evidence/chat.
    await f.page.reload({ waitUntil: "networkidle" });
  }
});


test("PAN538 AC06 existing synthetic setup action remains usable with original authenticated empty request", { timeout: 60000 }, async () => {
  assert.equal((await f.page.goto(f.origin + "/", { waitUntil: "networkidle" })).status(), 200);
  await f.page.setViewportSize({ width: 390, height: 844 });
  await f.page.locator("#run").focus();
  assert.equal(await f.page.evaluate(() => document.activeElement.id), "run");
  const responsePromise = f.page.waitForResponse(r => r.url() === f.origin + "/api/run" && r.request().method() === "POST");
  await f.page.keyboard.press("Enter");
  const response = await responsePromise;
  assert.deepEqual(response.request().postDataJSON(), {});
  assert.equal(response.status(), 200);
  const status = await response.json();
  assert.equal(status.health.status, "PASS");
  assert.equal(status.progress.percent, 100);
  assert.ok(status.stages.length > 0 && status.stages.every(stage => stage.status === "PASS"));
  await f.page.waitForFunction(() => {
    try { return JSON.parse(document.getElementById("action").textContent).health.status === "PASS"; }
    catch { return false; }
  });
  const readback = await f.request("/api/status");
  assert.equal(readback.status, 200);
  assert.equal(readback.value.health.status, "PASS");
  assert.equal(readback.value.progress.percent, 100);
  const bounds = await f.page.evaluate(() => {
    const box = e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width, height: r.height }; };
    const run = document.getElementById("run"), card = run.closest("section");
    return { documentClientWidth: document.documentElement.clientWidth, documentScrollWidth: document.documentElement.scrollWidth, card: box(card), controls: ["run", "resume", "promote", "cleanup"].map(id => ({ id, ...box(document.getElementById(id)) })), focusId: document.activeElement.id, pageOverflow: [document.documentElement, document.body].map(e => getComputedStyle(e).overflowX) };
  });
  writeFileSync(join(f.output, "actual-native-existing-setup-action-and-status-readback.json"), JSON.stringify({ requestBody: {}, responseStatus: response.status(), actualStatus: status, actualStatusReadback: readback.value, bounds, noHttpStubs: true, originalBoundedSyntheticSetupOnly: true, noPromotionOrProductiveRights: true }, null, 2) + "\n", { mode: 0o600 });
  await f.page.screenshot({ path: join(f.output, "390-existing-synthetic-setup-action-result-viewport.png") });
  assert.ok(bounds.documentScrollWidth <= bounds.documentClientWidth && bounds.card.right <= 390);
  for (const control of bounds.controls) assert.ok(control.width > 0 && control.height > 0 && control.left >= bounds.card.left && control.right <= bounds.card.right, "PAN538_EXISTING_SETUP_ACTION_CONTROL_MUST_REMAIN_BOUNDED");
  assert.equal(bounds.focusId, "run");
  assert.ok(!bounds.pageOverflow.includes("hidden") && !bounds.pageOverflow.includes("clip"));
  assert.deepEqual(f.errors, []);
});
