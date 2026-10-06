import { validateBrowserErvReadV1 } from "../../contracts/src/browser-erv-read-v1.js";
import type { BrowserShellPluginV1 } from "../../contracts/src/browser-shell-plugin-v1.js";
import type { BrowserShellFactoryV1 } from "../../browser-shell/src/registry-v1.js";
import { text, facts, readState, deniedMessage, type WorkspaceViewApiV1 } from "./api-v1.js";
export const ervPluginV1: BrowserShellPluginV1 = {
  schemaVersion: "pansphaira.browser-plugin/v1", id: "pan.erv", version: "1.0.0", shellVersion: "1.0.0", enabled: true,
  trustBoundary: "TRUSTED_IN_PROCESS_CODE_OWNED_FACTORIES",
  needs: { data: ["erv.read"], context: ["tenantId", "sessionId", "objectId", "revision"], rights: ["erv.read"], dependencies: [] },
  contributions: [
    { id: "pan.erv.route", kind: "ROUTE", slot: "shell.routes", factoryId: null, routeId: "pan.erv.route", path: "/workspace/erv", label: "Eingangsrechnungsprüfung — nur lesen" },
    { id: "pan.erv.navigation", kind: "NAVIGATION", slot: "shell.navigation", factoryId: "pan.erv.navigation", routeId: "pan.erv.route", path: null, label: "Eingangsrechnungsprüfung — nur lesen" },
    { id: "pan.erv.view", kind: "VIEW", slot: "shell.main", factoryId: "pan.erv.view", routeId: "pan.erv.route", path: null, label: "Eingangsrechnungsprüfung" },
    { id: "pan.erv.information", kind: "PANEL", slot: "shell.panels", factoryId: "pan.erv.information", routeId: "pan.erv.route", path: null, label: "Informationen zum aktuellen Rechnungsvorgang" },
    { id: "pan.erv.action", kind: "ACTION", slot: "shell.actions", factoryId: "pan.erv.action", routeId: "pan.erv.route", path: null, label: "Informationspanel öffnen" },
  ],
};
const euros = (value: number) => (value / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " EUR";
export function createErvViewV1(api: WorkspaceViewApiV1): BrowserShellFactoryV1<HTMLElement> {
  return { kind: "VIEW", async render({ target, signal }) {
    target.append(text("h1", "Eingangsrechnungsprüfung")); readState(target, "erv", "LOADING", "Fachlicher Readback aus dem führenden nativen Speicher wird geladen …");
    const response = await api.read(); if (signal.aborted) return;
    target.replaceChildren(text("h1", "Eingangsrechnungsprüfung"));
    if (response.outcome !== "READBACK_RECEIVED") { readState(target, "erv", response.outcome, deniedMessage(response.outcome)); return; }
    const value = validateBrowserErvReadV1(response.value);
    if (value.tenantId !== api.context().tenantId || value.invoiceId !== api.context().objectId) throw new Error("ERV_CURRENT_CONTEXT_DENIED");
    api.rememberInvoice(value);
    readState(target, "erv", "READBACK_RECEIVED", "Echter fachlicher Readback empfangen — nur lesen, keine Buchung und kein Zahlungsauftrag.");
    facts(target, [["Rechnung / Vorgang", value.invoiceId], ["Native Objektversion", String(value.revision)], ["Rechnungsbetrag", euros(value.invoiceAmountMinor)], ["Erwarteter Betrag", euros(value.expectedAmountMinor)], ["Abweichung", euros(value.varianceMinor)], ["Bestellt / angenommen / berechnet", [value.orderedQuantity, value.acceptedQuantity, value.invoicedQuantity].join(" / ")], ["Entscheidung des vorhandenen Prüfers", value.decisionOutcome], ["Fachlicher Status", value.status]]);
    target.append(text("p", "Lokaler synthetischer Fall im vorhandenen führenden SQLite-Ziel. Diese Anzeige ersetzt keine externe Fiskal-/Archiv-/FiBuqualifikation und gewährt keine Buchungs- oder Zahlungsrechte."));
  } };
}
export function createErvPanelV1(api: WorkspaceViewApiV1): BrowserShellFactoryV1<HTMLElement> {
  return { kind: "PANEL", render({ target }) {
    const value = api.invoice(); if (!value || value.invoiceId !== api.context().objectId || value.tenantId !== api.context().tenantId) throw new Error("ERV_PANEL_CURRENT_CONTEXT_DENIED");
    target.replaceChildren(text("h2", "Informationen zum aktuellen Rechnungsvorgang"));
    facts(target, [["Vorgang", value.invoiceId], ["Objektversion", String(value.revision)], ["Führender Speicher", value.leadingStore], ["Bestätigungsdigest", value.confirmationDigest], ["Quellbelegdigest", value.invoiceSourceSha256]]);
  } };
}
export function createErvActionV1(api: WorkspaceViewApiV1): BrowserShellFactoryV1<HTMLElement> {
  return { kind: "ACTION", render({ target, signal }) {
    const button = text("button", "Informationspanel zum aktuellen Vorgang öffnen") as HTMLButtonElement;
    button.type = "button"; button.addEventListener("click", () => api.openInvoicePanel(), { signal }); target.append(button);
  } };
}
