import test from "node:test";
import assert from "node:assert/strict";
import { nativeFixture527, request527 } from "../pan527/helpers.mjs";

let shell;
try { shell = await import("../../packages/browser-shell/src/context-owner-v1.ts"); }
catch (error) { if (error.code !== "ERR_MODULE_NOT_FOUND") throw error; }

const context = (tenantId, sessionId) => ({ schemaVersion: "pansphaira.browser-context/v1", tenantId, sessionId, objectId: null, revision: 1 });

test("PUI-01-AC04 shell epoch rejects late real protected native HTTPS read after tenant/session change and disposes only owned listeners", async () => {
  assert.equal(typeof shell?.createBrowserContextOwnerV1, "function", "PAN541_CONTEXT_OWNER_NOT_IMPLEMENTED");
  const fixture = await nativeFixture527();
  let owner;
  try {
    const sessions = new Map(["tenant-a", "tenant-b"].map(id => [id, fixture.gateway.sessionAdapter(id).issueOwnerSession({ subjectId: "synthetic-shell-read", role: "reviewer", expiresAtMs: Date.now() + 60000 })]));
    let fulfillHeld;
    let nativeReadObserved;
    const observed = new Promise(resolve => { nativeReadObserved = resolve; });
    let first = true;
    owner = shell.createBrowserContextOwnerV1({ initialContext: context("tenant-a", "session-a"), async readBackend(binding, signal) {
      const issued = sessions.get(binding.tenantId);
      const response = await request527(fixture, "/t/" + binding.tenantId + "/api/status", { cookie: issued.cookieHeader });
      assert.equal(response.status, 200); assert.equal(response.tlsAuthorized, true);
      const actual = { status: response.status, value: JSON.parse(response.body) };
      if (first) { first = false; nativeReadObserved(signal); return new Promise(resolve => { fulfillHeld = () => resolve(actual); }); }
      return actual;
    } });
    let disposed = 0;
    owner.onDispose(() => { disposed++; });
    const old = owner.read();
    const oldSignal = await observed;
    owner.switchContext(context("tenant-b", "session-b"));
    assert.equal(oldSignal.aborted, true); assert.equal(disposed, 1);
    fulfillHeld();
    const stale = await old;
    assert.deepEqual(stale, { outcome: "STALE_CONTEXT", value: null });
    const current = await owner.read();
    assert.equal(current.outcome, "READBACK_RECEIVED");
    assert.equal(current.context.tenantId, "tenant-b");
    assert.deepEqual(current.grantedRights, []);
    owner.close();
    await assert.rejects(owner.read(), /CONTEXT_OWNER_CLOSED/);
  } finally { owner?.close(); await fixture.close(); }
});

test("PUI-01-AC04 browser context metadata cannot replace a tenant-bound or expired actual native session", async () => {
  const fixture = await nativeFixture527(); let owner;
  try {
    const issued = fixture.gateway.sessionAdapter("tenant-a").issueOwnerSession({ subjectId: "synthetic-shell-expiry", role: "reader", expiresAtMs: Date.now() + 2000 });
    owner = shell.createBrowserContextOwnerV1({ initialContext: context("tenant-b", "logical-session-b"), async readBackend(binding) {
      const reply = await request527(fixture, "/t/" + binding.tenantId + "/api/status", { cookie: issued.cookieHeader });
      assert.equal(reply.tlsAuthorized, true);
      return { status: reply.status, value: JSON.parse(reply.body) };
    } });
    assert.deepEqual(await owner.read(), { outcome: "DENIED", value: null });
    owner.switchContext(context("tenant-a", "logical-session-a"));
    const before = await owner.read(); assert.equal(before.outcome, "READBACK_RECEIVED"); assert.deepEqual(before.grantedRights, []);
    await new Promise(resolve => setTimeout(resolve, 2100));
    assert.deepEqual(await owner.read(), { outcome: "DENIED", value: null });
    owner.close();
  } finally { owner?.close(); await fixture.close(); }
});
