import type { BrowserShellPluginV1 } from "../../contracts/src/browser-shell-plugin-v1.js";
import type { PocEarlyAdminStatusV1 } from "../../contracts/src/poc-early-admin-ai-setup.js";
import type { BrowserShellFactoryV1 } from "../../browser-shell/src/registry-v1.js";
import { text, facts, readState, deniedMessage, type WorkspaceViewApiV1 } from "./api-v1.js";
export const setupPluginV1: BrowserShellPluginV1 = {
  schemaVersion: "pansphaira.browser-plugin/v1", id: "pan.setup", version: "1.0.0", shellVersion: "1.0.0", enabled: true,
  trustBoundary: "TRUSTED_IN_PROCESS_CODE_OWNED_FACTORIES",
  needs: { data: ["setup.status"], context: ["tenantId", "sessionId"], rights: ["demo.status.read"], dependencies: [] },
  contributions: [
    { id: "pan.setup.route", kind: "ROUTE", slot: "shell.routes", factoryId: null, routeId: "pan.setup.route", path: "/workspace/setup", label: "Einrichtung und Betriebszustand" },
    { id: "pan.setup.navigation", kind: "NAVIGATION", slot: "shell.navigation", factoryId: "pan.setup.navigation", routeId: "pan.setup.route", path: null, label: "Einrichtung und Betriebszustand" },
    { id: "pan.setup.view", kind: "VIEW", slot: "shell.main", factoryId: "pan.setup.view", routeId: "pan.setup.route", path: null, label: "Einrichtung und Betriebszustand" },
  ],
};
export function createSetupViewV1(api: WorkspaceViewApiV1): BrowserShellFactoryV1<HTMLElement> {
  return { kind: "VIEW", async render({ target, signal }) {
    target.append(text("h1", "Einrichtung und Betriebszustand"));
    readState(target, "setup", "LOADING", "Aktueller Zustand wird vom zuständigen Setup-Backend gelesen …");
    const response = await api.read(); if (signal.aborted) return;
    target.replaceChildren(text("h1", "Einrichtung und Betriebszustand"));
    if (response.outcome !== "READBACK_RECEIVED") { readState(target, "setup", response.outcome, deniedMessage(response.outcome)); return; }
    const value = response.value as PocEarlyAdminStatusV1;
    // This projection consumes the existing coordinator's verified status. No
    // authority fields are interpreted as browser grants or mutation controls.
    if (!value || value.apiVersion !== "chimpmaera.dev/poc-early-admin-status/v1" || value.kind !== "PocEarlyAdminStatus"
      || !Array.isArray(value.stages) || value.stages.length < 1 || value.stages.length > 16
      || value.stages.some(s => typeof s.label !== "string" || s.label.length > 240 || !["PENDING", "RUNNING", "PASS", "FAILED"].includes(s.status))
      || !value.progress || !Number.isSafeInteger(value.progress.completedStages) || !Number.isSafeInteger(value.progress.totalStages)
      || value.progress.completedStages < 0 || value.progress.totalStages < 1 || value.progress.completedStages > value.progress.totalStages
      || !value.health || !["PENDING", "DEGRADED", "PASS"].includes(value.health.status)) throw new Error("SETUP_NATIVE_PROJECTION_DENIED");
    readState(target, "setup", "READBACK_RECEIVED", "Aktueller Backendzustand empfangen — lesende Anzeige, keine neue Einrichtungsfreigabe.");
    facts(target, [["Abgeschlossene Stufen", String(value.progress.completedStages) + " von " + String(value.progress.totalStages)], ["Health-Zustand", value.health.status]]);
    const list = document.createElement("ul"); list.className = "stages";
    for (const stage of value.stages) list.append(text("li", stage.label + " — " + stage.status)); target.append(list);
    target.append(text("p", "Diese Ansicht verwendet den vorhandenen Setupkoordinator. Ein empfangener Status ist kein neuer Ready-, Installations- oder Produktivnachweis."));
  } };
}
