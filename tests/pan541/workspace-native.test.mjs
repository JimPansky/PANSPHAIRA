import test from "node:test";
import assert from "node:assert/strict";
import { nativeFixture527, request527 } from "../pan527/helpers.mjs";
import { financeFixture } from "../pan519/native-fixture.mjs";
import { createNativeErvReadAdapterV1 } from "../../src/pan541/native-erv-read-adapter.mjs";
import * as ingress from "../../src/pan527/origin-session-adapter.mjs";

test("PUI-01-AC03/04 existing protected ingress mounts only owner-bound workspace and real ERV reads; reader logout revokes its own session", async () => {
  assert.equal(typeof ingress.mountProtectedWorkspaceDocumentV1, "function", "PAN541_PROTECTED_WORKSPACE_OWNER_MOUNT_NOT_IMPLEMENTED");
  const tls = await nativeFixture527(); let native; let mounted;
  try {
    native = await financeFixture();
    const reader = createNativeErvReadAdapterV1({ tenantId: "tenant-a", root: native.root });
    const sessions = tls.gateway.sessionAdapter("tenant-a");
    const issued = sessions.issueOwnerSession({ subjectId: "synthetic-workspace-reader", role: "reader", expiresAtMs: Date.now() + 60000 });
    mounted = ingress.mountProtectedWorkspaceDocumentV1(tls.gateway, { optIn: true, tenantId: "tenant-a", identityDigest: sessions.binding.identityDigest,
      origin: tls.origin, html: "<main>Workspace transport probe; not a browser-view acceptance.</main>", script: "// owned transport probe", style: "main { color: black; }",
      readErv(request, principal) { return reader.read({ tenantId: principal.tenantId, objectId: request.objectId, expectedRevision: request.expectedRevision }); } });
    assert.equal((await request527(tls, "/t/tenant-a/workspace")).status, 401);
    const headers = { cookie: issued.cookieHeader };
    const doc = await request527(tls, "/t/tenant-a/workspace", headers); assert.equal(doc.status, 200); assert.equal(doc.tlsAuthorized, true);
    assert.match(doc.headers["content-security-policy"], /script-src 'self'/);
    const context = JSON.parse((await request527(tls, "/t/tenant-a/workspace/context", headers)).body);
    assert.equal(context.tenantId, "tenant-a"); assert.match(context.sessionId, /^session:[a-f0-9]{64}$/);
    assert.equal((await request527(tls, "/t/tenant-a/api/status", headers)).status, 200);
    const actual = await request527(tls, "/t/tenant-a/workspace/erv?objectId=AP-PAN516-MATCHED-01", headers);
    assert.equal(actual.status, 200); const value = JSON.parse(actual.body);
    assert.equal(value.invoiceAmountMinor, 60000); assert.equal(value.decisionOutcome, "MATCHED");
    assert.equal((await request527(tls, "/t/tenant-a/workspace/erv?objectId=AP-PAN516-MATCHED-01&revision=1", headers)).status, 409);
    assert.equal((await request527(tls, "/t/tenant-a/workspace/erv?role=reviewer", headers)).status, 400);
    assert.equal((await request527(tls, "/t/tenant-b/workspace", headers)).status, 401);
    assert.equal((await request527(tls, "/t/tenant-a/workspace/app.js?script=https://untrusted.example.invalid/a.js", headers)).status, 404);
    assert.equal((await request527(tls, "/t/tenant-a/workspace/logout", { ...headers, origin: "https://untrusted.example.invalid" }, "POST")).status, 403);
    assert.equal((await request527(tls, "/t/tenant-a/workspace/logout", { ...headers, origin: tls.origin }, "POST")).status, 200);
    assert.equal((await request527(tls, "/t/tenant-a/workspace/context", headers)).status, 401);
    assert.equal((await request527(tls, "/t/tenant-a/api/status", headers)).status, 401);
  } finally { mounted?.close(); native?.close(); await tls.close(); }
});
