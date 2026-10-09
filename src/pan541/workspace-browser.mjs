import { readFileSync } from "node:fs";
import { mountProtectedWorkspaceDocumentV1, mountProtectedWorkspaceConfigurationV1, mountProtectedWorkspaceNotificationsV1, mountProtectedWorkspaceAnalysisV1, mountProtectedWorkspaceContextSelectionV1, protectedWorkspaceSetupStatusV1, protectedGuidedOwnerContextV1 } from "../pan527/origin-session-adapter.mjs";
import { createBrowserProfileStoreV1 } from "../pan543/profile-store.mjs";
import { defaultBrowserProfileV1 } from "../../dist/packages/contracts/src/browser-profile-v1.js";
import { isNativeErvReadAdapterV1 } from "./native-erv-read-adapter.mjs";
import { isAgentConfigurationDraftStoreV1 } from "../pan563/draft-store.mjs";
import { isNativeNotificationsV1 } from "../pan544/native-notifications.mjs";
import { isNativeAnalysisReadAdapterV1 } from "../pan549/native-analysis-read.mjs";
import { createNativeWorkspaceContextSelectionV1 } from "../pan548/native-context-selection.mjs";
// Owner-only assembly; no HTTP registration, arbitrary code URL or business-store replacement.
export function enableWorkspaceBrowserV1(options) {
  if (!options || Object.getPrototypeOf(options) !== Object.prototype) throw new Error("WORKSPACE_OWNER_DENIED");
  const descriptors = Object.getOwnPropertyDescriptors(options); const keys = ["optIn", "gateway", "tenantId", "origin", "nativeReader", "diagnosticPlugins", "profileCatalogV1", "configurationDrafts", "notifications", "analysisReader", "contextSelection"];
  if (Object.hasOwn(descriptors, "profileCatalogV1") && typeof descriptors.profileCatalogV1.value !== "function") throw new Error("WORKSPACE_OWNER_DENIED");
  if (!keys.slice(0, 5).every(k => Object.hasOwn(descriptors, k)) || Reflect.ownKeys(descriptors).some(k => typeof k !== "string" || !keys.includes(k))
    || Object.values(descriptors).some(d => !d.enumerable || !("value" in d)) || options.optIn !== true
    || (Object.hasOwn(descriptors, "diagnosticPlugins") && typeof options.diagnosticPlugins !== "boolean")
    || (Object.hasOwn(descriptors, "contextSelection") && typeof options.contextSelection !== "boolean")
    || typeof options.tenantId !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(options.tenantId)
    || !isNativeErvReadAdapterV1(options.nativeReader, options.tenantId)) throw new Error("WORKSPACE_OWNER_DENIED");
  const { gateway, tenantId, origin, nativeReader } = options;
  const sessions = gateway.sessionAdapter(tenantId);
  if (Object.hasOwn(descriptors, "configurationDrafts") && !isAgentConfigurationDraftStoreV1(options.configurationDrafts, sessions.binding)) throw new Error("WORKSPACE_CONFIGURATION_OWNER_DENIED");
  if (Object.hasOwn(descriptors, "notifications") && !isNativeNotificationsV1(options.notifications, sessions.binding)) throw new Error("WORKSPACE_NOTIFICATIONS_OWNER_DENIED");
  if (Object.hasOwn(descriptors, "analysisReader") && !isNativeAnalysisReadAdapterV1(options.analysisReader, sessions.binding)) throw new Error("WORKSPACE_ANALYSIS_OWNER_DENIED");
  const owner = protectedGuidedOwnerContextV1(gateway, { optIn: true, tenantId, origin, identityDigest: sessions.binding.identityDigest });
  const profiles = createBrowserProfileStoreV1({ root: owner.productRoot, catalog: options.profileCatalogV1 ?? (() => defaultBrowserProfileV1().items.map(i => ({ id: i.id, version: i.version, state: "AVAILABLE" }))) });
  let mounted; let attachment; let notifications; let analysis; let contextSelection;
  try { mounted = mountProtectedWorkspaceDocumentV1(gateway, { optIn: true, tenantId, origin, identityDigest: sessions.binding.identityDigest,
    html: readFileSync(new URL("../../packages/browser-workspace/src/workspace.html", import.meta.url), "utf8")
      .replace("<body>", '<body' + (options.diagnosticPlugins === true ? ' data-owner-diagnostic-plugins="true"' : '') + (options.configurationDrafts ? ' data-owner-configuration-drafts="true"' : '') + (options.notifications ? ' data-owner-notifications="true"' : '') + (options.analysisReader ? ' data-owner-analysis-reader="true"' : '') + (options.contextSelection === true ? ' data-owner-context-selection="true"' : '') + '>'),
    style: readFileSync(new URL("../../packages/browser-workspace/src/workspace.css", import.meta.url), "utf8") + (options.configurationDrafts ? readFileSync(new URL("../../packages/browser-workspace/src/configuration-draft-v1.css", import.meta.url), "utf8") : "") + (options.analysisReader ? readFileSync(new URL("../../packages/browser-workspace/src/analysis-v1.css", import.meta.url), "utf8") : ""),
    script: readFileSync(new URL("../../dist/browser-workspace/app.js", import.meta.url), "utf8"),
    readErv(request, principal) { return nativeReader.read({ tenantId: principal.tenantId, objectId: request.objectId, expectedRevision: request.expectedRevision }); },
    profilesV1: { schemaVersion: "pansphaira.workspace-profile-adapter/v1", read(principal) { return profiles.read(principal); }, write(command, principal) { return profiles.write(principal, command); } },
  });
    if (options.configurationDrafts) attachment = mountProtectedWorkspaceConfigurationV1(gateway, { optIn: true, tenantId, origin, identityDigest: sessions.binding.identityDigest,
      adapterVersion: "pan441-pan529/v1", read: principal => options.configurationDrafts.read(principal), save: (command, principal) => options.configurationDrafts.save(command, principal) });
    if (options.notifications) notifications = mountProtectedWorkspaceNotificationsV1(gateway, { optIn: true, tenantId, origin, identityDigest: sessions.binding.identityDigest,
      adapterVersion: "pan542-native-notifications/v1", feed: headers => options.notifications.feed(headers), open: (headers, command) => options.notifications.open(headers, command),
      markRead: (headers, command) => options.notifications.markRead(headers, command), reconcileRead: (headers, command) => options.notifications.reconcileRead(headers, command), savePreferences: (headers, command) => options.notifications.savePreferences(headers, command) });
    if (options.analysisReader) analysis = mountProtectedWorkspaceAnalysisV1(gateway, { optIn: true, tenantId, origin, identityDigest: sessions.binding.identityDigest,
      adapterVersion: "pan520-stock-analysis/v1", read: (headers, selector) => options.analysisReader.read(headers, selector) });
    if (options.contextSelection === true) contextSelection = mountProtectedWorkspaceContextSelectionV1(gateway, { optIn: true, tenantId, origin, identityDigest: sessions.binding.identityDigest,
      adapterVersion: "pan548-native-context-selection/v1", owner: createNativeWorkspaceContextSelectionV1({ sessions, identity: owner.identity, nativeReader,
        readSetup: () => protectedWorkspaceSetupStatusV1(gateway, { tenantId, origin, identityDigest: sessions.binding.identityDigest }), readProfile: principal => profiles.read(principal) }) });
  } catch (error) { contextSelection?.close(); analysis?.close(); notifications?.close(); attachment?.close(); mounted?.close(); profiles.close(); throw error; }
  return Object.freeze({ close() { contextSelection?.close(); analysis?.close(); notifications?.close(); attachment?.close(); mounted.close(); profiles.close(); } });
}
