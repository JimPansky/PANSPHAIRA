import { readFileSync } from "node:fs";
import {join} from 'node:path';
import {createNativeWorkspaceAgentRunV1,syntheticWorkspaceViewModelV1} from '../pan548/native-agent-run.mjs';
import {mountProtectedWorkspaceAgentRunV1} from '../pan527/origin-session-adapter.mjs';
import { mountProtectedWorkspaceDocumentV1, mountProtectedWorkspaceConfigurationV1, mountProtectedWorkspaceNotificationsV1, mountProtectedWorkspaceAnalysisV1, mountProtectedWorkspaceContextSelectionV1, mountProtectedWorkspaceModuleViewsV1, mountProtectedWorkspaceErvHumanV1, protectedWorkspaceSetupStatusV1, protectedGuidedOwnerContextV1 } from "../pan527/origin-session-adapter.mjs";
import { createBrowserProfileStoreV1, createWorkspaceModuleViewStoreV1 } from "../pan543/profile-store.mjs";
import { defaultBrowserProfileV1 } from "../../dist/packages/contracts/src/browser-profile-v1.js";
import { isNativeErvReadAdapterV1 } from "./native-erv-read-adapter.mjs";
import { isAgentConfigurationDraftStoreV1 } from "../pan563/draft-store.mjs";
import { isNativeNotificationsV1 } from "../pan544/native-notifications.mjs";
import { isNativeAnalysisReadAdapterV1 } from "../pan549/native-analysis-read.mjs";
import { createNativeWorkspaceContextSelectionV1 } from "../pan548/native-context-selection.mjs";
import { createNativeWorkspaceDataCatalogV1, nativeWorkspaceViewFieldsV1 } from "../pan546/native-data-catalog.mjs";
import { createNativeWorkspaceViewOwnerV1 } from "../pan546/native-view-owner.mjs";
import { createNativeWorkspaceErvHumanV1 } from "../pan546/native-human-workspace.mjs";
import {createNativeWorkspaceInvoiceNavigationV1} from '../pan546/native-invoice-navigation.mjs';
import {mountProtectedWorkspaceInvoiceNavigationV1} from '../pan527/origin-session-adapter.mjs';
import {createNativeModelConnectionV1} from '../pan565/native-model-connection.mjs';
import {mountProtectedModelConnectionV1} from '../pan527/origin-session-adapter.mjs';
// Owner-only assembly; no HTTP registration, arbitrary code URL or business-store replacement.
export function enableWorkspaceBrowserV1(options) {
  if (!options || Object.getPrototypeOf(options) !== Object.prototype) throw new Error("WORKSPACE_OWNER_DENIED");
  const descriptors = Object.getOwnPropertyDescriptors(options); const keys = ["optIn", "gateway", "tenantId", "origin", "nativeReader", "diagnosticPlugins", "profileCatalogV1", "configurationDrafts", "notifications", "analysisReader", "contextSelection", "moduleViews", "humanDecisions", "agentRuns", "invoiceNavigation", "modelConnections"];
  if (Object.hasOwn(descriptors, "profileCatalogV1") && typeof descriptors.profileCatalogV1.value !== "function") throw new Error("WORKSPACE_OWNER_DENIED");
  if (!keys.slice(0, 5).every(k => Object.hasOwn(descriptors, k)) || Reflect.ownKeys(descriptors).some(k => typeof k !== "string" || !keys.includes(k))
    || Object.values(descriptors).some(d => !d.enumerable || !("value" in d)) || options.optIn !== true
    || (Object.hasOwn(descriptors, "diagnosticPlugins") && typeof options.diagnosticPlugins !== "boolean")
    || (Object.hasOwn(descriptors, "contextSelection") && typeof options.contextSelection !== "boolean")
    || typeof options.tenantId !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(options.tenantId)
    || !isNativeErvReadAdapterV1(options.nativeReader, options.tenantId)) throw new Error("WORKSPACE_OWNER_DENIED");
  const { gateway, tenantId, origin, nativeReader } = options;
  if (Object.hasOwn(descriptors, "moduleViews")) {
    const value = options.moduleViews, fields = value && Object.getPrototypeOf(value) === Object.prototype ? Object.getOwnPropertyDescriptors(value) : null;
    if (!fields || Reflect.ownKeys(fields).length !== 2 || ["schemaVersion", "humanRoot"].some(k => !Object.hasOwn(fields, k)) || Object.values(fields).some(d => !d.enumerable || !("value" in d)) || value.schemaVersion !== "pansphaira.workspace-native-module-views/owner-v1" || typeof value.humanRoot !== "string" || options.contextSelection !== true) throw new Error("WORKSPACE_MODULE_VIEWS_OWNER_DENIED");
  }
  if (Object.hasOwn(descriptors,"humanDecisions") && (typeof options.humanDecisions!=="boolean" || options.humanDecisions===true&&!options.moduleViews)) throw Error("WORKSPACE_HUMAN_OWNER_DENIED");
  if(Object.hasOwn(descriptors,'agentRuns')&&(typeof options.agentRuns!=='boolean'||options.agentRuns===true&&(!options.moduleViews||options.contextSelection!==true)))throw Error('WORKSPACE_AGENT_OWNER_DENIED');
  if(Object.hasOwn(descriptors,'invoiceNavigation')&&(typeof options.invoiceNavigation!=='boolean'||options.invoiceNavigation===true&&(!options.moduleViews||options.contextSelection!==true)))throw Error('NAV_NATIVE_OWNER_DENIED');
  if(Object.hasOwn(descriptors,'modelConnections')&&!Array.isArray(options.modelConnections))throw Error('MODEL_CONNECTION_OWNER_DENIED');
  const sessions = gateway.sessionAdapter(tenantId);
  if (Object.hasOwn(descriptors, "configurationDrafts") && !isAgentConfigurationDraftStoreV1(options.configurationDrafts, sessions.binding)) throw new Error("WORKSPACE_CONFIGURATION_OWNER_DENIED");
  if (Object.hasOwn(descriptors, "notifications") && !isNativeNotificationsV1(options.notifications, sessions.binding)) throw new Error("WORKSPACE_NOTIFICATIONS_OWNER_DENIED");
  if (Object.hasOwn(descriptors, "analysisReader") && !isNativeAnalysisReadAdapterV1(options.analysisReader, sessions.binding)) throw new Error("WORKSPACE_ANALYSIS_OWNER_DENIED");
  const owner = protectedGuidedOwnerContextV1(gateway, { optIn: true, tenantId, origin, identityDigest: sessions.binding.identityDigest });
  const profiles = createBrowserProfileStoreV1({ root: owner.productRoot, catalog: options.profileCatalogV1 ?? (() => defaultBrowserProfileV1().items.map(i => ({ id: i.id, version: i.version, state: "AVAILABLE" }))) });
  let mounted; let attachment; let notifications; let analysis; let contextSelection; let moduleStore; let dataCatalog; let viewOwner; let moduleViews; let human; let agent; let navigation; let modelConnection;
  try { mounted = mountProtectedWorkspaceDocumentV1(gateway, { optIn: true, tenantId, origin, identityDigest: sessions.binding.identityDigest,
    html: readFileSync(new URL("../../packages/browser-workspace/src/workspace.html", import.meta.url), "utf8")
      .replace('</body>', (Object.hasOwn(descriptors,'modelConnections') ? '<script type="module" src="/t/'+tenantId+'/workspace/model-connection/app.js"></script>' : '') + '</body>')
      .replace("<body>", '<body' + (options.diagnosticPlugins === true ? ' data-owner-diagnostic-plugins="true"' : '') + (options.configurationDrafts ? ' data-owner-configuration-drafts="true"' : '') + (options.notifications ? ' data-owner-notifications="true"' : '') + (options.analysisReader ? ' data-owner-analysis-reader="true"' : '') + (options.contextSelection === true ? ' data-owner-context-selection="true"' : '') + (options.moduleViews ? ' data-owner-module-views="true"' : '') + (options.humanDecisions===true ? ' data-owner-human-decisions="true"' : '') + (options.agentRuns===true ? ' data-owner-agent-runs="true"' : '') + (options.invoiceNavigation===true ? ' data-owner-invoice-navigation="true"' : '') + '>'),
    style: readFileSync(new URL("../../packages/browser-workspace/src/workspace.css", import.meta.url), "utf8") + (options.configurationDrafts ? readFileSync(new URL("../../packages/browser-workspace/src/configuration-draft-v1.css", import.meta.url), "utf8") : "") + (options.analysisReader ? readFileSync(new URL("../../packages/browser-workspace/src/analysis-v1.css", import.meta.url), "utf8") : "") + (options.moduleViews ? readFileSync(new URL("../../packages/browser-workspace/src/module-view-v1.css", import.meta.url), "utf8") : "") + (options.agentRuns===true ? readFileSync(new URL('../../packages/browser-workspace/src/workspace-agent-panel-v1.css',import.meta.url),'utf8') : '') + (options.invoiceNavigation===true ? readFileSync(new URL('../../packages/browser-workspace/src/workspace-invoice-navigation-v1.css',import.meta.url),'utf8') : '') + (Object.hasOwn(descriptors,'modelConnections') ? readFileSync(new URL('../../packages/browser-workspace/src/workspace-model-connection-v1.css',import.meta.url),'utf8') : ''),
    script: readFileSync(new URL("../../dist/browser-workspace/app.js", import.meta.url), "utf8"),
    readErv(request, principal) { return nativeReader.read({ tenantId: principal.tenantId, objectId: request.objectId, expectedRevision: request.expectedRevision }); },
    profilesV1: { schemaVersion: "pansphaira.workspace-profile-adapter/v1", read(principal) { return profiles.read(principal); }, write(command, principal) { return profiles.write(principal, command); } },
  });
    if(Object.hasOwn(descriptors,'modelConnections'))modelConnection=mountProtectedModelConnectionV1(gateway,{optIn:true,tenantId,origin,identityDigest:sessions.binding.identityDigest,owner:createNativeModelConnectionV1({sessions,profiles,root:owner.productRoot,connections:options.modelConnections}),script:readFileSync(new URL('../../dist/browser-workspace/workspace-model-connection.js',import.meta.url),'utf8')});
    if (options.configurationDrafts) attachment = mountProtectedWorkspaceConfigurationV1(gateway, { optIn: true, tenantId, origin, identityDigest: sessions.binding.identityDigest,
      adapterVersion: "pan441-pan529/v1", read: principal => options.configurationDrafts.read(principal), save: (command, principal) => options.configurationDrafts.save(command, principal) });
    if (options.notifications) notifications = mountProtectedWorkspaceNotificationsV1(gateway, { optIn: true, tenantId, origin, identityDigest: sessions.binding.identityDigest,
      adapterVersion: "pan542-native-notifications/v1", feed: headers => options.notifications.feed(headers), open: (headers, command) => options.notifications.open(headers, command),
      markRead: (headers, command) => options.notifications.markRead(headers, command), reconcileRead: (headers, command) => options.notifications.reconcileRead(headers, command), savePreferences: (headers, command) => options.notifications.savePreferences(headers, command) });
    if (options.analysisReader) analysis = mountProtectedWorkspaceAnalysisV1(gateway, { optIn: true, tenantId, origin, identityDigest: sessions.binding.identityDigest,
      adapterVersion: "pan520-stock-analysis/v1", read: (headers, selector) => options.analysisReader.read(headers, selector) });
    if (options.moduleViews) moduleStore = createWorkspaceModuleViewStoreV1({ root: owner.productRoot, fields: nativeWorkspaceViewFieldsV1 });
    if (options.contextSelection === true) {
      const nativeContext = createNativeWorkspaceContextSelectionV1({ sessions, identity: owner.identity, nativeReader,
        readSetup: () => protectedWorkspaceSetupStatusV1(gateway, { tenantId, origin, identityDigest: sessions.binding.identityDigest }), readProfile: principal => profiles.read(principal), ...(moduleStore ? { moduleViewStore: moduleStore } : {}) });
      contextSelection = mountProtectedWorkspaceContextSelectionV1(gateway, { optIn: true, tenantId, origin, identityDigest: sessions.binding.identityDigest, adapterVersion: "pan548-native-context-selection/v1", owner: nativeContext });
      if(options.invoiceNavigation===true)navigation=mountProtectedWorkspaceInvoiceNavigationV1(gateway,{optIn:true,tenantId,origin,identityDigest:sessions.binding.identityDigest,adapterVersion:'pan546-native-invoice-navigation/v1',owner:createNativeWorkspaceInvoiceNavigationV1({sessions,contextSelection:nativeContext,nativeReader}),script:readFileSync(new URL('../../dist/browser-workspace/workspace-invoice-navigation.js',import.meta.url),'utf8')});
      if (moduleStore) {
        dataCatalog = createNativeWorkspaceDataCatalogV1({ sessions, contextSelection: nativeContext, nativeReader, humanRoot: options.moduleViews.humanRoot });
        viewOwner = createNativeWorkspaceViewOwnerV1({ sessions, contextSelection: nativeContext, dataCatalog, store: moduleStore });
        moduleViews = mountProtectedWorkspaceModuleViewsV1(gateway, { optIn: true, tenantId, origin, identityDigest: sessions.binding.identityDigest, adapterVersion: "pan546-native-personal-view/v1", dataCatalog, viewOwner });
        if(options.agentRuns===true)agent=mountProtectedWorkspaceAgentRunV1(gateway,{optIn:true,tenantId,origin,identityDigest:sessions.binding.identityDigest,adapterVersion:'pan548-native-agent-run/v1',owner:createNativeWorkspaceAgentRunV1({sessions,contextSelection:nativeContext,dataCatalog,viewOwner,root:join(owner.productRoot,'native-ui-runs'),model:syntheticWorkspaceViewModelV1(tenantId)}),script:readFileSync(new URL('../../dist/browser-workspace/workspace-agent-panel.js',import.meta.url),'utf8')});
        if(options.humanDecisions===true)human=mountProtectedWorkspaceErvHumanV1(gateway,{optIn:true,tenantId,origin,identityDigest:sessions.binding.identityDigest,owner:createNativeWorkspaceErvHumanV1({sessions,contextSelection:nativeContext,humanRoot:options.moduleViews.humanRoot}),script:readFileSync(new URL('../../dist/browser-workspace/erv-human.js',import.meta.url),'utf8')});
      }
    }
  } catch (error) { modelConnection?.close(); navigation?.close(); agent?.close(); human?.close(); moduleViews?.close(); viewOwner?.close(); dataCatalog?.close(); contextSelection?.close(); moduleStore?.close(); analysis?.close(); notifications?.close(); attachment?.close(); mounted?.close(); profiles.close(); throw error; }
  return Object.freeze({ close() { modelConnection?.close(); navigation?.close(); agent?.close(); human?.close(); moduleViews?.close(); viewOwner?.close(); dataCatalog?.close(); contextSelection?.close(); moduleStore?.close(); analysis?.close(); notifications?.close(); attachment?.close(); mounted.close(); profiles.close(); } });
}
