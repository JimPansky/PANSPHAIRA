import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
const contractPath = new URL("../../dist/packages/contracts/src/browser-profile-v1.js", import.meta.url);
const storePath = new URL("../../src/pan543/profile-store.mjs", import.meta.url);
const contract = existsSync(contractPath) ? await import(contractPath) : {};
const store = existsSync(storePath) ? await import(storePath) : {};
const catalog = () => ["shell.main", "shell.widgets", "pan.workspace.boundary", "pan.erv.information"].map(id => ({ id, version: "1.0.0", state: "AVAILABLE" }));
const owner = { tenantId: "tenant-a", subjectId: "synthetic-profile-reader" };

test("PUI-02 presentation contract is closed, bounded, versioned and cannot contain identity, rights, credentials or business values", () => {
  assert.equal(typeof contract.validateBrowserProfileV1, "function", "PROFILE_CONTRACT_MISSING");
  const valid = contract.defaultBrowserProfileV1();
  assert.deepEqual(contract.validateBrowserProfileV1(valid), valid);
  for (const extra of [{ tenantId: "tenant-b" }, { userId: "other" }, { password: "synthetic-not-a-secret" }, { invoiceAmount: 60000 }, { rights: ["write"] }]) assert.throws(() => contract.validateBrowserProfileV1({ ...valid, ...extra }));
  for (const size of ["enormous", -1, 999, null]) assert.throws(() => contract.validateBrowserProfileV1({ ...valid, items: [{ ...valid.items[0], size }] }));
  assert.throws(() => contract.validateBrowserProfileV1({ ...valid, items: [valid.items[0], valid.items[0]] }));
  assert.throws(() => contract.validateBrowserProfileV1({ ...valid, items: [{ ...valid.items[0], visible: "true" }] }));
  assert.throws(() => contract.validateBrowserProfileV1({ ...valid, items: [{ ...valid.items[0], amount: 60000 }] }));
  assert.throws(() => contract.validateBrowserProfileV1(Object.create(valid)));
  let touched = false; const accessor = { ...valid }; Object.defineProperty(accessor, "items", { enumerable: true, get() { touched = true; return []; } });
  assert.throws(() => contract.validateBrowserProfileV1(accessor)); assert.equal(touched, false);
});

test("PUI-02 exact migration rejects invalid/unknown schema and never substitutes similar IDs or revives denied widgets", () => {
  assert.equal(typeof contract.migrateBrowserProfileV1, "function", "PROFILE_MIGRATION_MISSING");
  const old = { schemaVersion: "pansphaira.browser-profile/v0", items: [{ id: "pan.erv.information", version: "1.0.0", visible: true, size: 2 }] };
  const migrated = contract.migrateBrowserProfileV1(old); assert.equal(migrated.migration, "V0_TO_V1"); assert.equal(migrated.profile.items[0].size, "regular");
  for (const bad of [{ ...old, schemaVersion: "future/v99" }, { ...old, items: [{ ...old.items[0], size: 100 }] }, { ...old, rights: ["all"] }]) assert.equal(contract.migrateBrowserProfileV1(bad).migration, "DEFAULT_UNSUPPORTED");
  const c = catalog(); c[3].state = "DENIED";
  const profile = contract.defaultBrowserProfileV1(); profile.items[3].visible = true;
  const resolved = contract.resolveBrowserProfileV1(profile, c);
  assert.equal(resolved.effectiveItems.some(i => i.id === c[3].id), false); assert.deepEqual(resolved.orphaned, [{ id: c[3].id, reason: "DENIED" }]);
  for (const state of ["DISABLED", "INCOMPATIBLE", "MISSING"]) { c[3].state = state; assert.equal(contract.resolveBrowserProfileV1(profile, c).orphaned[0].reason, state); }
  c[3] = { id: "pan.erv.information-similar", version: "1.0.0", state: "AVAILABLE" };
  assert.equal(contract.resolveBrowserProfileV1(profile, c).effectiveItems.some(i => i.id.includes("information")), false);
  c[3] = { id: "pan.erv.information", version: "2.0.0", state: "AVAILABLE" };
  assert.equal(contract.resolveBrowserProfileV1(profile, c).orphaned[0].reason, "INCOMPATIBLE");
});

test("PUI-02 durable SQLite CAS retains exact own-user/tenant presentation across independent store connections and restart", () => {
  assert.equal(typeof store.createBrowserProfileStoreV1, "function", "PROFILE_DURABLE_CAS_MISSING");
  const root = mkdtempSync(join(process.env.TMPDIR, "pan543-store-")); let a; let b;
  try {
    a = store.createBrowserProfileStoreV1({ root, catalog }); b = store.createBrowserProfileStoreV1({ root, catalog });
    const initial = a.read(owner); assert.equal(initial.revision, 0);
    const profile = contract.defaultBrowserProfileV1(); profile.items[3].visible = true; profile.items.reverse(); profile.items[0].size = "large";
    const saved = a.write(owner, { expectedRevision: 0, profile }); assert.equal(saved.revision, 1); assert.deepEqual(b.read(owner).profile, profile);
    assert.throws(() => b.write(owner, { expectedRevision: 0, profile: initial.profile }), /PROFILE_REVISION_CONFLICT/);
    assert.deepEqual(a.read(owner), saved);
    assert.equal(a.read({ ...owner, subjectId: "other-user" }).revision, 0); assert.equal(a.read({ ...owner, tenantId: "tenant-b" }).revision, 0);
    for (const extra of [{ tenantId: "tenant-b" }, { subjectId: "other-user" }, { secret: "synthetic" }]) assert.throws(() => a.write(owner, { expectedRevision: 1, profile, ...extra }));
    const unknown = { ...profile, items: [{ ...profile.items[0], id: "pan.unknown.widget" }] }; assert.throws(() => a.write(owner, { expectedRevision: 1, profile: unknown }));
    a.close(); b.close(); a = store.createBrowserProfileStoreV1({ root, catalog }); assert.deepEqual(a.read(owner), saved);
    const db = new DatabaseSync(join(root, "browser-profiles.sqlite"));
    db.prepare("UPDATE browser_profiles SET profile=? WHERE tenant_id=? AND subject_id=?").run(JSON.stringify({ schemaVersion: "future/v99", items: [] }), owner.tenantId, owner.subjectId); db.close();
    const fallback = a.read(owner); assert.equal(fallback.revision, 1); assert.equal(fallback.migration, "DEFAULT_UNSUPPORTED");
    a.write(owner, { expectedRevision: fallback.revision, profile: fallback.profile }); assert.equal(a.read(owner).revision, 2);
  } finally { a?.close(); b?.close(); rmSync(root, { recursive: true, force: true }); }
});
