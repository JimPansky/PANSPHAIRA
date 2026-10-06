import { createBrowserContextOwnerV1, type BrowserContextV1 } from "../../browser-shell/src/context-owner-v1.js";
import { createBrowserShellRegistryV1, type BrowserShellFactoryV1 } from "../../browser-shell/src/registry-v1.js";
import { parseBrowserDeepLinkV1, buildBrowserDeepLinkV1, type BrowserDeepLinkV1 } from "../../browser-shell/src/deep-link-v1.js";
import type { BrowserErvReadV1 } from "../../contracts/src/browser-erv-read-v1.js";
import { setupPluginV1, createSetupViewV1 } from "./plugin-setup-v1.js";
import { ervPluginV1, createErvViewV1, createErvPanelV1, createErvActionV1 } from "./plugin-erv-v1.js";
import { diagnosticPluginsV1, diagnosticFailingViewV1 } from "./plugin-diagnostics-v1.js";
import { text, type WorkspaceViewApiV1 } from "./api-v1.js";
const element = (id: string): HTMLElement => { const node = document.getElementById(id); if (!node) throw new Error("SHELL_SLOT_MISSING"); return node; };
async function start() {
  const scope = /^\/t\/([a-z0-9][a-z0-9-]{0,63})\/workspace$/.exec(location.pathname); if (!scope) throw new Error("WORKSPACE_ROUTE_DENIED");
  const base = "/t/" + scope[1]; const main = element("shell.main"); const panel = element("shell.panels"); const actions = element("shell.actions"); const nav = element("shell.navigation"); const widget = element("shell.widgets");
  const lifetime = new AbortController(); let invoice: BrowserErvReadV1 | null = null; let link: BrowserDeepLinkV1 | null = null;
  const skip = document.querySelector<HTMLAnchorElement>(".skip-link"); if (!skip) throw new Error("SHELL_SKIP_LINK_MISSING");
  skip.addEventListener("click", event => { event.preventDefault(); main.focus(); }, { signal: lifetime.signal });
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
  let registry: ReturnType<typeof createBrowserShellRegistryV1<HTMLElement>>;
  const api: WorkspaceViewApiV1 = Object.freeze({ context: owner.context, read: owner.read, invoice: () => invoice,
    rememberInvoice(value: BrowserErvReadV1) { invoice = value; },
    openInvoicePanel() { panel.hidden = false; void registry.render("pan.erv.information", panel).then(result => { if (result.outcome === "RENDERED") panel.focus(); }); },
  });
  const diagnostic = document.body.dataset.ownerDiagnosticPlugins === "true" ? diagnosticPluginsV1() : null;
  const plugins = [setupPluginV1, ervPluginV1]; if (diagnostic) plugins.push(diagnostic.broken, diagnostic.disabled, diagnostic.missing);
  const diagnosticStates: string[] = [];
  function showStates(message: string) {
    widget.replaceChildren(text("p", message));
    if (diagnosticStates.length) { const list = document.createElement("ul"); for (const state of diagnosticStates) list.append(text("li", state)); widget.append(list); }
  }
  const factories = new Map<string, BrowserShellFactoryV1<HTMLElement>>([
    ["pan.setup.view", createSetupViewV1(api)], ["pan.erv.view", createErvViewV1(api)], ["pan.erv.information", createErvPanelV1(api)], ["pan.erv.action", createErvActionV1(api)],
  ]);
  if (diagnostic) for (const p of [diagnostic.broken, diagnostic.disabled, diagnostic.missing, diagnostic.incompatible]) factories.set(p.id + ".view", diagnosticFailingViewV1);
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
    if ([setupPluginV1.id, ervPluginV1.id].includes(plugin.id) && result.outcome !== "REGISTERED") throw new Error("WORKSPACE_PLUGIN_REGISTRATION_DENIED");
    if (result.outcome === "DISABLED") diagnosticStates.push("Deaktiviert: " + plugin.id);
    if (result.outcome === "MISSING_DEPENDENCY") diagnosticStates.push("Fehlende Pflichtabhängigkeit: " + plugin.id);
  }
  if (diagnostic) {
    const result = registry.register(diagnostic.incompatible);
    if (result.outcome !== "DENIED" || !("reason" in result) || result.reason !== "PLUGIN_VERSION_DENIED") throw new Error("DIAGNOSTIC_VERSION_DENIAL_MISSING");
    diagnosticStates.push("Inkompatible Shellversion: " + diagnostic.incompatible.id);
  }
  function disposal() { owner.onDispose(() => { registry.retireAll(); invoice = null; main.replaceChildren(); actions.replaceChildren(); panel.replaceChildren(); panel.hidden = true; nav.replaceChildren(); }); }
  async function activate() {
    const current = owner.context(); let selected: BrowserDeepLinkV1;
    try { selected = parseBrowserDeepLinkV1(location.hash || "#/workspace/setup", current, registry.routes().filter(r => r.state === "REGISTERED").map(r => r.path!)); }
    catch {
      owner.switchContext({ ...current, objectId: null, revision: current.revision + 1 }); disposal();
      main.append(text("h1", "Deep Link verweigert"), text("p", "Route, Tenant, Session, Objektparameter oder Version sind nicht gültig. Keine Anfrage an einen fremden Tenant."));
      for (const plugin of plugins) for (const c of plugin.contributions) if (c.kind === "NAVIGATION") await registry.render(c.id, nav);
      return;
    }
    link = selected;
    owner.switchContext({ ...current, objectId: selected.path === "/workspace/erv" ? selected.objectId ?? "AP-PAN516-MATCHED-01" : null, revision: current.revision + 1 }); disposal();
    showStates("Lesender Arbeitsplatz. Pluginmetadaten gewähren keine Backendrechte.");
    for (const plugin of plugins) for (const c of plugin.contributions) if (c.kind === "NAVIGATION") await registry.render(c.id, nav);
    const plugin = plugins.find(p => p.contributions.some(c => c.kind === "ROUTE" && c.path === selected.path));
    const view = plugin?.contributions.find(c => c.kind === "VIEW"); if (!view) throw new Error("WORKSPACE_VIEW_MISSING");
    const target = document.createElement("section"); main.append(target); const result = await registry.render(view.id, target);
    if (result.outcome !== "RENDERED") { if (result.outcome !== "STALE_RENDER") target.append(text("p", "Pluginansicht konnte nicht gerendert werden.")); return; }
    if (invoice && owner.context().objectId === invoice.invoiceId) {
      await registry.render("pan.erv.action", actions);
      const anchor = text("a", "Deep Link zum aktuellen Rechnungsvorgang") as HTMLAnchorElement;
      anchor.href = buildBrowserDeepLinkV1({ path: selected.path, tenantId: current.tenantId, sessionId: current.sessionId, objectId: invoice.invoiceId, revision: invoice.revision }); actions.append(anchor);
    }
    if (target.isConnected) main.focus();
  }
  disposal(); window.addEventListener("hashchange", () => { void activate(); }, { signal: lifetime.signal });
  element("shell.logout").addEventListener("click", async () => {
    const response = await fetch(base + "/workspace/logout", { method: "POST", credentials: "same-origin" });
    if (response.status !== 200) { widget.textContent = "Abmelden nicht bestätigt. Keine Erfolgsmeldung."; return; }
    owner.close(); registry.close(); lifetime.abort(); invoice = null; nav.replaceChildren(); actions.replaceChildren(); panel.replaceChildren(); panel.hidden = true;
    main.replaceChildren(text("h1", "Abgemeldet"), text("p", "Die aktuelle Session wurde serverseitig widerrufen."));
    (element("shell.logout") as HTMLButtonElement).disabled = true; widget.textContent = "Session beendet.";
  }, { signal: lifetime.signal });
  await activate();
}
void start().catch(() => { const main = element("shell.main"); main.replaceChildren(text("h1", "Arbeitsplatz nicht verfügbar"), text("p", "Keine gültige aktuelle Session oder kein gültiges Frontendbinding. Es wurde kein fachlicher Erfolg bestätigt.")); });
