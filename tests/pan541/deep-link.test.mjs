import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

test("PUI-01-AC04 typed registered-route deep links bind tenant/session/object/revision without code URLs or authority fields", async () => {
  const source = new URL("../../packages/browser-shell/src/deep-link-v1.ts", import.meta.url);
  assert.ok(existsSync(source), "PAN541_TYPED_DEEP_LINK_BOUNDARY_NOT_IMPLEMENTED");
  const { parseBrowserDeepLinkV1, buildBrowserDeepLinkV1 } = await import("../../dist/packages/browser-shell/src/deep-link-v1.js");
  const context = { schemaVersion: "pansphaira.browser-context/v1", tenantId: "tenant-a", sessionId: "session-a", objectId: null, revision: 1 };
  const paths = ["/workspace/setup", "/workspace/erv"];
  const link = buildBrowserDeepLinkV1({ path: "/workspace/erv", tenantId: "tenant-a", sessionId: "session-a", objectId: "AP-PAN516-MATCHED-01", revision: 4 });
  assert.deepEqual(parseBrowserDeepLinkV1(link, context, paths), { path: "/workspace/erv", tenantId: "tenant-a", sessionId: "session-a", objectId: "AP-PAN516-MATCHED-01", revision: 4 });
  assert.equal(parseBrowserDeepLinkV1("#/workspace/setup", context, paths).objectId, null);
  for (const input of ["#https://untrusted.example.invalid/a.js", "#/workspace/not-registered", "#/workspace/erv?tenantId=tenant-b", "#/workspace/erv?sessionId=old-session", "#/workspace/erv?role=owner", "#/workspace/erv?script=https://untrusted.example.invalid/a.js", "#/workspace/erv?revision=4", "#/workspace/erv?objectId=AP-PAN516-MATCHED-01&revision=0", "#/workspace/erv?objectId=AP-PAN516-MATCHED-01&revision=01", "#/workspace/erv?objectId=AP-PAN516-MATCHED-01&revision=4&revision=5", "#/workspace/erv?objectId=..%2Fforeign-root&revision=4"]) assert.throws(() => parseBrowserDeepLinkV1(input, context, paths), /DEEP_LINK_DENIED/, input);
  assert.throws(() => buildBrowserDeepLinkV1({ path: "/workspace/erv", tenantId: "tenant-a", sessionId: "session-a", objectId: null, revision: 4, role: "owner" }), /DEEP_LINK_DENIED/);
});
