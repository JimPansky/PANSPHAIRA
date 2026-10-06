import { readFileSync } from "node:fs";
import { mountProtectedWorkspaceDocumentV1 } from "../pan527/origin-session-adapter.mjs";
import { isNativeErvReadAdapterV1 } from "./native-erv-read-adapter.mjs";
// Owner-only assembly; no JSON/HTTP registration, arbitrary code URL or new store.
export function enableWorkspaceBrowserV1(options) {
  if (!options || Object.getPrototypeOf(options) !== Object.prototype) throw new Error("WORKSPACE_OWNER_DENIED");
  const descriptors = Object.getOwnPropertyDescriptors(options); const keys = ["optIn", "gateway", "tenantId", "origin", "nativeReader", "diagnosticPlugins"];
  if (!keys.slice(0, 5).every(k => Object.hasOwn(descriptors, k)) || Reflect.ownKeys(descriptors).some(k => typeof k !== "string" || !keys.includes(k))
    || Object.values(descriptors).some(d => !d.enumerable || !("value" in d)) || options.optIn !== true
    || (Object.hasOwn(descriptors, "diagnosticPlugins") && typeof options.diagnosticPlugins !== "boolean")
    || typeof options.tenantId !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(options.tenantId)
    || !isNativeErvReadAdapterV1(options.nativeReader, options.tenantId)) throw new Error("WORKSPACE_OWNER_DENIED");
  const { gateway, tenantId, origin, nativeReader } = options;
  const sessions = gateway.sessionAdapter(tenantId);
  return mountProtectedWorkspaceDocumentV1(gateway, { optIn: true, tenantId, origin, identityDigest: sessions.binding.identityDigest,
    html: readFileSync(new URL("../../packages/browser-workspace/src/workspace.html", import.meta.url), "utf8")
      .replace("<body>", options.diagnosticPlugins === true ? '<body data-owner-diagnostic-plugins="true">' : "<body>"),
    style: readFileSync(new URL("../../packages/browser-workspace/src/workspace.css", import.meta.url), "utf8"),
    script: readFileSync(new URL("../../dist/browser-workspace/app.js", import.meta.url), "utf8"),
    readErv(request, principal) { return nativeReader.read({ tenantId: principal.tenantId, objectId: request.objectId, expectedRevision: request.expectedRevision }); },
  });
}
