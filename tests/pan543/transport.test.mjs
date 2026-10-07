import test from "node:test";
import assert from "node:assert/strict";
import { nativeFixture527, request527 } from "../pan527/helpers.mjs";
import { financeFixture } from "../pan519/native-fixture.mjs";
import { createNativeErvReadAdapterV1 } from "../../src/pan541/native-erv-read-adapter.mjs";
import { enableWorkspaceBrowserV1 } from "../../src/pan541/workspace-browser.mjs";
import { createOptionalHttpsProductIngressV1 } from "../../src/pan527/origin-session-adapter.mjs";
import { defaultBrowserProfileV1 } from "../../dist/packages/contracts/src/browser-profile-v1.js";

test("PUI-02 protected real profile route derives identity, applies CAS and survives logout/login plus ingress restart", async () => {
  const tls = await nativeFixture527(); let native; let mounted; let replacement;
  try {
    native = await financeFixture(); const reader = createNativeErvReadAdapterV1({ tenantId: "tenant-a", root: native.root });
    mounted = enableWorkspaceBrowserV1({ optIn: true, gateway: tls.gateway, tenantId: "tenant-a", origin: tls.origin, nativeReader: reader });
    const sessions = tls.gateway.sessionAdapter("tenant-a");
    const issue = (subjectId = "synthetic-profile-user") => sessions.issueOwnerSession({ subjectId, role: "reader", expiresAtMs: Date.now() + 120000 });
    const issued = issue();
    const binding = JSON.parse((await request527(tls, "/t/tenant-a/workspace/context", { cookie: issued.cookieHeader })).body).sessionId;
    const headers = { cookie: issued.cookieHeader, origin: tls.origin, "x-pan543-session": binding };
    const get = await request527(tls, "/t/tenant-a/workspace/profile", headers); assert.equal(get.status, 200, "PROFILE_PROTECTED_ROUTE_MISSING");
    assert.equal(JSON.parse(get.body).revision, 0); assert.equal(get.headers["set-cookie"], undefined);
    const profile = defaultBrowserProfileV1(); profile.items[3].visible = true; profile.items[3].size = "large";
    const payload = { expectedRevision: 0, profile };
    assert.equal((await request527(tls, "/t/tenant-a/workspace/profile", { cookie: issued.cookieHeader, "x-pan543-session": binding }, "POST", payload)).status, 403);
    assert.equal((await request527(tls, "/t/tenant-a/workspace/profile", { ...headers, origin: "https://untrusted.example.invalid" }, "POST", payload)).status, 403);
    for (const extra of [{ subjectId: "other-user" }, { tenantId: "tenant-b" }, { rights: ["all"] }]) assert.equal((await request527(tls, "/t/tenant-a/workspace/profile", headers, "POST", { ...payload, ...extra })).status, 400);
    for (const extra of [{ credential: "synthetic-no-secret" }, { invoiceAmount: 60000 }]) assert.equal((await request527(tls, "/t/tenant-a/workspace/profile", headers, "POST", { ...payload, profile: { ...profile, ...extra } })).status, 400);
    assert.equal((await request527(tls, "/t/tenant-a/workspace/profile", headers, "POST", { ...payload, profile: { ...profile, items: [{ ...profile.items[0], size: 100 }] } })).status, 400);
    assert.equal((await request527(tls, "/t/tenant-b/workspace/profile", headers)).status, 401);
    assert.equal((await request527(tls, "/t/tenant-a/workspace/profile?userId=other", headers)).status, 404);
    assert.equal((await request527(tls, "/t/tenant-a/workspace/profile", { ...headers, "x-user-id": "other-user" })).status, 403);
    const race = await Promise.all([request527(tls, "/t/tenant-a/workspace/profile", headers, "POST", payload), request527(tls, "/t/tenant-a/workspace/profile", headers, "POST", payload)]);
    assert.deepEqual(race.map(r => r.status).sort(), [200, 409]); const saved = JSON.parse(race.find(r => r.status === 200).body); assert.equal(saved.revision, 1); assert.deepEqual(saved.profile, profile);
    const other = issue("other-user"); assert.equal(JSON.parse((await request527(tls, "/t/tenant-a/workspace/profile", { cookie: other.cookieHeader })).body).revision, 0);
    assert.equal((await request527(tls, "/t/tenant-a/workspace/profile", { ...headers, cookie: other.cookieHeader }, "POST", payload)).status, 401, "OLD_TAB_MUST_NOT_WRITE_REPLACEMENT_USER_PROFILE");
    assert.equal((await request527(tls, "/t/tenant-a/workspace/logout", headers, "POST")).status, 200);
    assert.equal((await request527(tls, "/t/tenant-a/workspace/profile", headers, "POST", { expectedRevision: 1, profile })).status, 401);
    const login = issue(); const logged = { cookie: login.cookieHeader };
    assert.deepEqual(JSON.parse((await request527(tls, "/t/tenant-a/workspace/profile", logged)).body), saved);
    mounted.close(); mounted = null; await new Promise(r => tls.gateway.server.close(r));
    replacement = createOptionalHttpsProductIngressV1(tls.options); await new Promise(r => replacement.server.listen(tls.port, "127.0.0.1", r));
    mounted = enableWorkspaceBrowserV1({ optIn: true, gateway: replacement, tenantId: "tenant-a", origin: tls.origin, nativeReader: reader });
    assert.deepEqual(JSON.parse((await request527(tls, "/t/tenant-a/workspace/profile", logged)).body), saved);
    console.log("PAN543 native TLS profile target readback=" + JSON.stringify(saved));
  } finally { mounted?.close(); if (replacement?.server.listening) await new Promise(r => replacement.server.close(r)); native?.close(); await tls.close(); }
});
