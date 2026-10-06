import type { BrowserShellPluginV1 } from "../../contracts/src/browser-shell-plugin-v1.js";
import type { BrowserShellFactoryV1 } from "../../browser-shell/src/registry-v1.js";
// Explicit owner-only diagnostic profile. Never enabled by a route/query/role,
// never imports runtime code and never contacts a business backend.
function descriptor(id: string, suffix: string, label: string): BrowserShellPluginV1 {
  return { schemaVersion: "pansphaira.browser-plugin/v1", id, version: "1.0.0", shellVersion: "1.0.0", enabled: true,
    trustBoundary: "TRUSTED_IN_PROCESS_CODE_OWNED_FACTORIES", needs: { data: [], context: [], rights: [], dependencies: [] },
    contributions: [
      { id: id + ".route", kind: "ROUTE", slot: "shell.routes", factoryId: null, routeId: id + ".route", path: "/workspace/" + suffix, label },
      { id: id + ".navigation", kind: "NAVIGATION", slot: "shell.navigation", factoryId: id + ".navigation", routeId: id + ".route", path: null, label },
      { id: id + ".view", kind: "VIEW", slot: "shell.main", factoryId: id + ".view", routeId: id + ".route", path: null, label },
    ],
  };
}
export function diagnosticPluginsV1() {
  const broken = descriptor("pan.diagnostic", "diagnostic", "Technischer Rendererfehlernachweis");
  const disabled = { ...descriptor("pan.disabled", "disabled", "Deaktiviertes Diagnosemodul"), enabled: false };
  const missingBase = descriptor("pan.missing", "missing", "Fehlende Pflichtabhängigkeit");
  const missing = { ...missingBase, needs: { ...missingBase.needs, dependencies: [{ id: "pan.not-installed", version: "1.0.0" }] } };
  const incompatible = { ...descriptor("pan.incompatible", "incompatible", "Inkompatible Shellversion"), shellVersion: "2.0.0" };
  return { broken, disabled, missing, incompatible };
}
export const diagnosticFailingViewV1: BrowserShellFactoryV1<HTMLElement> = { kind: "VIEW", render() { throw new Error("OWNED_DIAGNOSTIC_RENDERER_FAILED"); } };
