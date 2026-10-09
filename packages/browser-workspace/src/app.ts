import { createBrowserContextOwnerV1, type BrowserContextV1 } from "../../browser-shell/src/context-owner-v1.js";
import { createBrowserShellRegistryV1, type BrowserShellFactoryV1 } from "../../browser-shell/src/registry-v1.js";
import { parseBrowserDeepLinkV1, buildBrowserDeepLinkV1, type BrowserDeepLinkV1 } from "../../browser-shell/src/deep-link-v1.js";
import type { BrowserErvReadV1 } from "../../contracts/src/browser-erv-read-v1.js";
import { setupPluginV1, createSetupViewV1 } from "./plugin-setup-v1.js";
import { ervPluginV1, createErvViewV1, createErvPanelV1, createErvActionV1 } from "./plugin-erv-v1.js";
import { diagnosticPluginsV1, diagnosticFailingViewV1 } from "./plugin-diagnostics-v1.js";
import { configurationDraftPluginV1, createConfigurationDraftViewV1 } from "./plugin-configuration-draft-v1.js";
import { text, type WorkspaceViewApiV1 } from "./api-v1.js";
import { createWorkspaceProfileEditorV1 } from "./profile-editor-v1.js";
import type { BrowserProfileReadV1 } from "../../contracts/src/browser-profile-v1.js";
import { createWorkspaceNotificationsV1 } from "./notifications-v1.js";
import { analysisPluginV1, createAnalysisViewV1 } from "./plugin-analysis-v1.js";
import { createWorkspaceContextSelectionV1 } from "./context-selection-v1.js";
const element = (id: string): HTMLElement => { const node = document.getElementById(id); if (!node) throw new Error("SHELL_SLOT_MISSING"); return node; };
async function start() {
  const scope = /^\/t\/([a-z0-9][a-z0-9-]{0,63})\/workspace$/.exec(location.pathname); if (!scope) throw new Error("WORKSPACE_ROUTE_DENIED");
  const base = "/t/" + scope[1]; const main = element("shell.main"); const panel = element("shell.panels"); const actions = element("shell.actions"); const nav = element("shell.navigation"); const widget = element("shell.widgets");
  const lifetime = new AbortController(); let invoice: BrowserErvReadV1 | null = null; let link: BrowserDeepLinkV1 | null = null;
  let profileEditor: Awaited<ReturnType<typeof createWorkspaceProfileEditorV1>> | null = null;
  let presentation: BrowserProfileReadV1 | null = null; let panelEpoch = 0;
  let notifications: ReturnType<typeof createWorkspaceNotificationsV1> | null = null;
  const canvas = element("profile.canvas"); const boundary = element("pan.workspace.boundary");
  const cards = new Map([["shell.main", main], ["shell.widgets", widget], ["pan.workspace.boundary", boundary], ["pan.erv.information", panel]]);
  async function renderPanel() {
    const epoch = ++panelEpoch;
    const visible = presentation?.effectiveItems.some(i => i.id === "pan.erv.information" && i.visible);
    if (!visible || !invoice) { panel.hidden = true; panel.replaceChildren(); return; }
    panel.hidden = false;
    const result = await registry.render("pan.erv.information", panel);
    if (epoch !== panelEpoch || !invoice) return;
    if (result.outcome !== "RENDERED") { panel.hidden = true; panel.replaceChildren(); }
  }
  function applyPresentation(value: BrowserProfileReadV1) {
    const configurationFocus = document.body.dataset.ownerConfigurationDrafts === "true" && document.activeElement instanceof HTMLElement && document.activeElement.closest(".configuration-draft") ? document.activeElement : null;
    presentation = value;
    for (const [id, node] of cards) {
      const item = value.effectiveItems.find(i => i.id === id);
      node.classList.remove("profile-compact", "profile-regular", "profile-large");
      if (item) node.classList.add("profile-" + item.size);
      node.hidden = !item?.visible || (id === "pan.erv.information" && !invoice);
    }
    for (const item of value.profile.items) { const card = cards.get(item.id); if (card) canvas.append(card); }
    const size = value.effectiveItems.find(i => i.id === "pan.erv.information")?.size ?? "regular";
    canvas.classList.remove("panel-compact", "panel-regular", "panel-large"); canvas.classList.add("panel-" + size);
    canvas.classList.toggle("panel-open", !panel.hidden);
    void renderPanel();
    if (configurationFocus?.isConnected && !main.hidden) configurationFocus.focus({ preventScroll: true });
  }
  const skip = document.querySelector<HTMLAnchorElement>(".skip-link"); if (!skip) throw new Error("SHELL_SKIP_LINK_MISSING");
  skip.addEventListener("click", event => { event.preventDefault(); if (main.hidden) element("profile.controls").querySelector<HTMLButtonElement>("button")?.focus(); else main.focus(); }, { signal: lifetime.signal });
  async function get(path: string, signal?: AbortSignal) {
    const response = await fetch(base + path, { credentials: "same-origin", cache: "no-store", ...(signal ? { signal } : {}) });
    return { status: response.status, value: response.status === 200 ? await response.json() as unknown : null };
  }
  const bootstrap = await get("/workspace/context"); if (bootstrap.status !== 200) throw new Error("WORKSPACE_SESSION_DENIED");
  const owner = createBrowserContextOwnerV1({ initialContext: bootstrap.value as BrowserContextV1, async readBackend(context, signal) {
    const expected = link; const fresh = await get("/workspace/context", signal);
    const current = fresh.value as BrowserContextV1 | null;
    if (fresh.status !== 200 || current?.tenantId !== context.tenantId || current.sessionId !== context.sessionId) return { status: 401, value: null };
    const query = new URLSearchParams(); if (context.objectId !== null) { query.set("objectId", context.objectId); if (expected?.revision !== null && expected?.revision !== undefined) query.set("revision", String(expected.revision)); }
    const response = await get(context.objectId === null ? "/api/status" : "/workspace/erv?" + query.toString(), signal);
    const after = await get("/workspace/context", signal); const binding = after.value as BrowserContextV1 | null;
    if (after.status !== 200 || binding?.tenantId !== context.tenantId || binding.sessionId !== context.sessionId) return { status: 401, value: null };
    return response;
  } });
  const contextSelection = document.body.dataset.ownerContextSelection === "true"
    ? createWorkspaceContextSelectionV1({ root: element("shell.context-selection"), base, context: owner.context, signal: lifetime.signal }) : null;
  let registry: ReturnType<typeof createBrowserShellRegistryV1<HTMLElement>>;
  const api: WorkspaceViewApiV1 = Object.freeze({ context: owner.context, read: owner.read, invoice: () => invoice,
    rememberInvoice(value: BrowserErvReadV1) { invoice = value; document.body.dataset.nativeRevision = String(value.revision); },
    openInvoicePanel() { void (async () => {
      await profileEditor?.refreshAuthority();
      const fresh = await owner.read();
      if (fresh.outcome !== "READBACK_RECEIVED" || !invoice) { panel.hidden = true; panel.replaceChildren(); return; }
      if (profileEditor?.setVisible("pan.erv.information")) { await renderPanel(); if (!panel.hidden) panel.focus(); }
    })(); },
  });
  const diagnostic = document.body.dataset.ownerDiagnosticPlugins === "true" ? diagnosticPluginsV1() : null;
  const configurationEnabled = document.body.dataset.ownerConfigurationDrafts === "true";
  const analysisEnabled = document.body.dataset.ownerAnalysisReader === "true";
  const plugins = [setupPluginV1, ervPluginV1]; if (analysisEnabled) plugins.push(analysisPluginV1); if (configurationEnabled) plugins.push(configurationDraftPluginV1); if (diagnostic) plugins.push(diagnostic.broken, diagnostic.disabled, diagnostic.missing);
  const diagnosticStates: string[] = [];
  function showStates(message: string) {
    widget.replaceChildren(text("p", message));
    if (diagnosticStates.length) { const list = document.createElement("ul"); for (const state of diagnosticStates) list.append(text("li", state)); widget.append(list); }
  }
  const factories = new Map<string, BrowserShellFactoryV1<HTMLElement>>([
    ["pan.setup.view", createSetupViewV1(api)], ["pan.erv.view", createErvViewV1(api)], ["pan.erv.information", createErvPanelV1(api)], ["pan.erv.action", createErvActionV1(api)],
  ]);
  if (diagnostic) for (const p of [diagnostic.broken, diagnostic.disabled, diagnostic.missing, diagnostic.incompatible]) factories.set(p.id + ".view", diagnosticFailingViewV1);
  if (configurationEnabled) factories.set("pan.configuration.view", createConfigurationDraftViewV1(owner.context));
  if (analysisEnabled) factories.set("pan.analysis.view", createAnalysisViewV1({ base, context: owner.context, selected: () => link }));
  for (const plugin of plugins) for (const c of plugin.contributions) if (c.kind === "NAVIGATION") {
    const route = plugin.contributions.find(r => r.kind === "ROUTE" && r.id === c.routeId);
    factories.set(c.factoryId, { kind: "NAVIGATION", render({ target, signal }) {
      const button = text("button", c.label) as HTMLButtonElement; button.type = "button";
      if (route?.path === link?.path) button.setAttribute("aria-current", "page");
      button.disabled = registry.status(plugin.id).outcome !== "REGISTERED";
      button.addEventListener("click", () => { if (route?.path) location.hash = "#" + route.path; }, { signal }); target.append(button);
    } });
  }
  registry = createBrowserShellRegistryV1({ factories, reportFault(fault) { showStates("Pluginfehler: " + fault.outcome + ". Andere Module und Abmelden bleiben bedienbar."); } });
  for (const plugin of plugins) {
    const result = registry.register(plugin);
    if ([setupPluginV1.id, ervPluginV1.id, ...(analysisEnabled ? [analysisPluginV1.id] : [])].includes(plugin.id) && result.outcome !== "REGISTERED") throw new Error("WORKSPACE_PLUGIN_REGISTRATION_DENIED");
    if (result.outcome === "DISABLED") diagnosticStates.push("Deaktiviert: " + plugin.id);
    if (result.outcome === "MISSING_DEPENDENCY") diagnosticStates.push("Fehlende Pflichtabhängigkeit: " + plugin.id);
  }
  if (diagnostic) {
    const result = registry.register(diagnostic.incompatible);
    if (result.outcome !== "DENIED" || !("reason" in result) || result.reason !== "PLUGIN_VERSION_DENIED") throw new Error("DIAGNOSTIC_VERSION_DENIAL_MISSING");
    diagnosticStates.push("Inkompatible Shellversion: " + diagnostic.incompatible.id);
  }
  if (document.body.dataset.ownerNotifications === "true") notifications = createWorkspaceNotificationsV1({ root: element("shell.notifications"), base, context: owner.context, signal: lifetime.signal,
    onSessionDenied() {
      const c = owner.context(); owner.switchContext({ ...c, objectId: null, revision: c.revision + 1 }); disposal();
      document.body.dataset.nativeRevision = "unknown"; main.hidden = false;
      main.append(text("h1", "Zugriff verweigert"), text("p", "Session, Berechtigung oder aktueller Objektstand nicht mehr bestätigt. Frühere fachliche Inhalte und Kontextlisteners wurden verworfen. Arbeitsbereich mit aktueller Session neu laden."));
      widget.dataset.state = "DENIED"; widget.textContent = "Aktueller Zugriff nicht bestätigt — keine alten Vorgangsinhalte.";
    },
    openTarget(value) {
      if (registry.status(value.target.pluginId).outcome !== "REGISTERED" || !registry.routes().some(r => r.pluginId === value.target.pluginId && r.routeId === value.target.routeId && r.state === "REGISTERED" && r.path === "/workspace/erv")) throw new Error("WORKSPACE_NOTIFICATION_ROUTE_DENIED");
      const c = owner.context(); location.hash = buildBrowserDeepLinkV1({ path: "/workspace/erv", tenantId: c.tenantId, sessionId: c.sessionId, objectId: value.invoice.invoiceId, revision: value.invoice.revision });
    },
  });
  function disposal() { owner.onDispose(() => { contextSelection?.retire(); panelEpoch++; registry.retireAll(); invoice = null; delete document.body.dataset.analysisResultRevision; main.replaceChildren(); actions.replaceChildren(); panel.replaceChildren(); panel.hidden = true; canvas.classList.remove("panel-open"); nav.replaceChildren(); }); }
  let latestActivation: object | null = null;
  function captureActivation(invocation: object) {
    const binding = owner.context(), nativeContextEpoch = contextSelection?.epoch();
    return { binding, nativeContextEpoch, live: () => latestActivation === invocation && !lifetime.signal.aborted
      && owner.context() === binding && contextSelection?.epoch() === nativeContextEpoch };
  }
  async function activate() {
    const invocation = Object.freeze({}); latestActivation = invocation;
    contextSelection?.retire();
    const current = owner.context(); let selected: BrowserDeepLinkV1;
    try { selected = parseBrowserDeepLinkV1(location.hash || "#/workspace/setup", current, registry.routes().filter(r => r.state === "REGISTERED").map(r => r.path!)); }
    catch {
      owner.switchContext({ ...current, objectId: null, revision: current.revision + 1 }); disposal();
      const activation = captureActivation(invocation); if (!activation.live()) return;
      void notifications?.refresh();
      main.hidden = false;
      main.append(text("h1", "Deep Link verweigert"), text("p", "Route, Tenant, Session, Objektparameter oder Version sind nicht gültig. Keine Anfrage an einen fremden Tenant."));
      showStates("Deep Link verweigert — terminaler Zustand. Persönliche Hinweise werden unabhängig mit der aktuellen Session geprüft.");
      for (const plugin of plugins) for (const c of plugin.contributions) if (c.kind === "NAVIGATION") {
        const rendered = await registry.render(c.id, nav); if (!activation.live() || rendered.outcome === "STALE_RENDER") return;
      }
      return;
    }
    link = selected;
    owner.switchContext({ ...current, objectId: selected.path === "/workspace/erv" ? selected.objectId ?? "AP-PAN516-MATCHED-01" : selected.path === "/workspace/analysis" ? selected.objectId ?? "analysis:common-trade-01:stock" : null, revision: current.revision + 1 }); disposal();
    const activation = captureActivation(invocation); if (!activation.live()) return;
    document.body.dataset.contextRevision = String(owner.context().revision); document.body.dataset.nativeRevision = "unknown";
    void notifications?.refresh();
    showStates("Lesender Arbeitsplatz. Pluginmetadaten gewähren keine Backendrechte.");
    for (const plugin of plugins) for (const c of plugin.contributions) if (c.kind === "NAVIGATION") {
      const rendered = await registry.render(c.id, nav); if (!activation.live() || rendered.outcome === "STALE_RENDER") return;
    }
    const plugin = plugins.find(p => p.contributions.some(c => c.kind === "ROUTE" && c.path === selected.path));
    const view = plugin?.contributions.find(c => c.kind === "VIEW"); if (!view) throw new Error("WORKSPACE_VIEW_MISSING");
    const nativeContextEpoch = activation.nativeContextEpoch;
    const target = document.createElement("section"); main.append(target); const result = await registry.render(view.id, target);
    if (!activation.live()) return;
    if (result.outcome !== "RENDERED") { if (result.outcome !== "STALE_RENDER") { target.append(text("p", "Pluginansicht konnte nicht gerendert werden.")); if (nativeContextEpoch !== undefined) contextSelection?.unavailable(nativeContextEpoch); } return; }
    // Optional context transport must not hold the existing native actions,
    // deep link, navigation or logout hostage to a slow/failed context request.
    const readback = invoice;
    const nativeInvoice = readback && selected.path === "/workspace/erv" && activation.binding.objectId === readback.invoiceId
      ? { objectId: readback.invoiceId, revision: readback.revision } : null;
    if (contextSelection && nativeContextEpoch !== undefined) void contextSelection.bind({ localEpoch: nativeContextEpoch, moduleId: plugin!.id, viewId: view.id,
      primaryObjectId: nativeInvoice?.objectId ?? null, domainRevision: nativeInvoice?.revision ?? null });
    if (nativeInvoice) {
      const action = await registry.render("pan.erv.action", actions); if (!activation.live()) return;
      if (action.outcome === "RENDERED") {
        const anchor = text("a", "Deep Link zum aktuellen Rechnungsvorgang") as HTMLAnchorElement;
        anchor.href = buildBrowserDeepLinkV1({ path: selected.path, tenantId: activation.binding.tenantId, sessionId: activation.binding.sessionId, objectId: nativeInvoice.objectId, revision: nativeInvoice.revision }); actions.append(anchor);
      }
    }
    if (presentation) applyPresentation(presentation);
    if (activation.live() && target.isConnected && !main.hidden && !element("shell.notifications").contains(document.activeElement)) main.focus();
  }
  disposal(); window.addEventListener("hashchange", () => { void activate(); }, { signal: lifetime.signal });
  element("shell.logout").addEventListener("click", async () => {
    const response = await fetch(base + "/workspace/logout", { method: "POST", credentials: "same-origin" });
    if (response.status !== 200) { widget.textContent = "Abmelden nicht bestätigt. Keine Erfolgsmeldung."; return; }
    contextSelection?.close(); owner.close(); registry.close(); lifetime.abort(); invoice = null; nav.replaceChildren(); actions.replaceChildren(); panel.replaceChildren(); panel.hidden = true;
    main.hidden = false;
    main.replaceChildren(text("h1", "Abgemeldet"), text("p", "Die aktuelle Session wurde serverseitig widerrufen."));
    (element("shell.logout") as HTMLButtonElement).disabled = true; widget.textContent = "Session beendet.";
  }, { signal: lifetime.signal });
  const profileReady = createWorkspaceProfileEditorV1({ root: element("profile.controls"), base, sessionId: owner.context().sessionId, signal: lifetime.signal,
    apply: applyPresentation, denied() { presentation = null; owner.switchContext({ ...owner.context(), objectId: null, revision: owner.context().revision + 1 }); disposal(); main.hidden = false; main.replaceChildren(text("h1", "Zugriff verweigert"), text("p", "Aktuelle Session abgelaufen oder gewechselt. Keine fachlichen Daten aus dem alten Kontext.")); },
  });
  await activate();
  profileEditor = await profileReady;
}
void start().catch(() => { const main = element("shell.main"); main.replaceChildren(text("h1", "Arbeitsplatz nicht verfügbar"), text("p", "Keine gültige aktuelle Session oder kein gültiges Frontendbinding. Es wurde kein fachlicher Erfolg bestätigt.")); });
