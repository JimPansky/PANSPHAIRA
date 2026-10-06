import type { BrowserContributionV1, BrowserShellPluginV1 } from "../../packages/contracts/src/browser-shell-plugin-v1.js";

const valid: BrowserContributionV1 = {
  id: "pan.setup.view", kind: "VIEW", slot: "shell.main", factoryId: "setup.view",
  routeId: "pan.setup.route", path: null, label: "Einrichtungsarbeitsplatz",
};
void valid;

// @ts-expect-error VIEW must use the shell-owned VIEW slot, not a navigation slot.
const wrongSlot: BrowserContributionV1 = { id: "pan.setup.view", kind: "VIEW", slot: "shell.navigation", factoryId: "setup.view", routeId: "pan.setup.route", path: null, label: "Einrichtung" };
void wrongSlot;

// @ts-expect-error Incompatible shell versions must not be expressible as admitted metadata.
const wrongShellVersion: BrowserShellPluginV1["shellVersion"] = "2.0.0";
void wrongShellVersion;
