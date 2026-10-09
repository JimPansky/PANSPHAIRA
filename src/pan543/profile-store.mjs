import { DatabaseSync } from "node:sqlite";
import { constants, closeSync, lstatSync, openSync, realpathSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { defaultBrowserProfileV1, migrateBrowserProfileV1, resolveBrowserProfileV1, validateBrowserProfileWriteV1 } from "../../dist/packages/contracts/src/browser-profile-v1.js";
import { defaultWorkspaceModuleViewV1, validateWorkspaceModuleViewV1 } from "../../dist/packages/contracts/src/workspace-module-view-v1.js";
const ownedModuleViewStores = new WeakMap();
// Code-owner local persistence only; the protected ingress supplies the principal.
// No business ledger, roles registry, browser storage or caller-supplied ownership.
export function createBrowserProfileStoreV1({ root, catalog }) {
  const stat = lstatSync(root);
  if (!isAbsolute(root) || resolve(root) !== root || realpathSync(root) !== root || !stat.isDirectory() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700 || typeof catalog !== "function") throw new Error("PROFILE_STORE_ROOT_DENIED");
  const path = join(root, "browser-profiles.sqlite");
  try { closeSync(openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW, 0o600)); } catch (e) { if (e.code !== "EEXIST") throw e; }
  const file = lstatSync(path);
  if (!file.isFile() || file.isSymbolicLink() || file.nlink !== 1 || file.uid !== process.getuid() || (file.mode & 0o777) !== 0o600) throw new Error("PROFILE_STORE_ROOT_DENIED");
  const db = new DatabaseSync(path); db.exec("PRAGMA busy_timeout=3000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS browser_profiles (tenant_id TEXT NOT NULL, subject_id TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 1), profile TEXT NOT NULL, PRIMARY KEY(tenant_id,subject_id)) STRICT;");
  let closed = false;
  function identity(principal) {
    if (closed) throw new Error("PROFILE_STORE_CLOSED");
    if (!principal || typeof principal.tenantId !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(principal.tenantId)
      || typeof principal.subjectId !== "string" || !/^[a-z0-9][a-z0-9:_-]{0,79}$/.test(principal.subjectId)) throw new Error("PROFILE_PRINCIPAL_DENIED");
    return [principal.tenantId, principal.subjectId];
  }
  function read(principal) {
    const row = db.prepare("SELECT revision,profile FROM browser_profiles WHERE tenant_id=? AND subject_id=?").get(...identity(principal));
    let migrated = { profile: defaultBrowserProfileV1(), migration: "NONE" };
    if (row) { let value; try { value = JSON.parse(row.profile); } catch { value = null; } migrated = migrateBrowserProfileV1(value); }
    const available = catalog(principal);
    return { schemaVersion: "pansphaira.browser-profile-read/v1", revision: row?.revision ?? 0, ...migrated, catalog: available, ...resolveBrowserProfileV1(migrated.profile, available) };
  }
  function write(principal, value) {
    const key = identity(principal); const command = validateBrowserProfileWriteV1(value);
    db.exec("BEGIN IMMEDIATE");
    try {
      const current = read(principal);
      if (current.revision !== command.expectedRevision) throw new Error("PROFILE_REVISION_CONFLICT");
      const allowed = new Map(catalog(principal).map(i => [i.id, i]));
      // Orphans can be kept byte-identically or removed, never edited/re-enabled.
      for (const item of command.profile.items) {
        const entry = allowed.get(item.id); const old = current.profile.items.find(i => i.id === item.id);
        if (!entry || entry.state !== "AVAILABLE" || entry.version !== item.version) {
          if (!old || JSON.stringify(old) !== JSON.stringify(item)) throw new Error("PROFILE_CONTRIBUTION_DENIED");
        }
      }
      db.prepare("INSERT INTO browser_profiles(tenant_id,subject_id,revision,profile) VALUES(?,?,?,?) ON CONFLICT(tenant_id,subject_id) DO UPDATE SET revision=excluded.revision,profile=excluded.profile").run(...key, current.revision + 1, JSON.stringify(command.profile));
      const target = read(principal); db.exec("COMMIT"); return target;
    } catch (e) { db.exec("ROLLBACK"); throw e; }
  }
  return Object.freeze({ read, write, close() { if (!closed) { closed = true; db.close(); } } });
}

// Additive ordinary personal-view state in the SAME existing profile database.
// No invoice, Human event, identity/role, credentials or business data is stored.
// Code-owner API: authentication/consent are enforced by the native view owner;
// neither this store nor a shape/digest check grants HTTP mutation authority.
export function createWorkspaceModuleViewStoreV1({ root, fields }) {
  const stat = lstatSync(root);
  if (!isAbsolute(root) || resolve(root) !== root || realpathSync(root) !== root || !stat.isDirectory() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700 || !Array.isArray(fields)) throw new Error("VIEW_STORE_ROOT_DENIED");
  const path = join(root, "browser-profiles.sqlite");
  try { closeSync(openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW, 0o600)); } catch (e) { if (e.code !== "EEXIST") throw e; }
  const file = lstatSync(path);
  if (!file.isFile() || file.isSymbolicLink() || file.nlink !== 1 || file.uid !== process.getuid() || (file.mode & 0o777) !== 0o600) throw new Error("VIEW_STORE_ROOT_DENIED");
  // Validate/copy caller-owned metadata once, never execute a callback inside a
  // transaction. Current native field/rights checks are a separate owner gate.
  const defaultView = validateWorkspaceModuleViewV1(defaultWorkspaceModuleViewV1(), fields);
  const metadata = Object.freeze(fields.map(f => Object.freeze({ ...f })));
  const db = new DatabaseSync(path);
  db.exec("PRAGMA busy_timeout=3000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS workspace_module_views (tenant_id TEXT NOT NULL,subject_id TEXT NOT NULL,instance_id TEXT NOT NULL,generation INTEGER NOT NULL,module_id TEXT NOT NULL,view_id TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>=1),view_json TEXT NOT NULL,view_digest TEXT NOT NULL,candidate_digest TEXT NOT NULL,PRIMARY KEY(tenant_id,subject_id,instance_id,generation,module_id,view_id)) STRICT; CREATE TABLE IF NOT EXISTS workspace_module_view_history (tenant_id TEXT NOT NULL,subject_id TEXT NOT NULL,instance_id TEXT NOT NULL,generation INTEGER NOT NULL,module_id TEXT NOT NULL,view_id TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>=0),view_json TEXT NOT NULL,view_digest TEXT NOT NULL,candidate_digest TEXT,PRIMARY KEY(tenant_id,subject_id,instance_id,generation,module_id,view_id,revision)) STRICT;");
  let closed = false, reservation = null;
  const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const where = "tenant_id=? AND subject_id=? AND instance_id=? AND generation=? AND module_id=? AND view_id=?";
  function key(principal) {
    if (closed) throw new Error("VIEW_STORE_CLOSED");
    if (!principal || typeof principal.tenantId !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(principal.tenantId) || typeof principal.subjectId !== "string" || !/^[a-z0-9][a-z0-9:_-]{0,79}$/.test(principal.subjectId) || typeof principal.instanceId !== "string" || !/^[a-z0-9][a-z0-9:_-]{0,95}$/.test(principal.instanceId) || !Number.isSafeInteger(principal.generation) || principal.generation < 1) throw new Error("VIEW_STORE_PRINCIPAL_DENIED");
    return [principal.tenantId, principal.subjectId, principal.instanceId, principal.generation, "pan.erv", "pan.erv.view"];
  }
  function decode(row) {
    const view = row ? validateWorkspaceModuleViewV1(JSON.parse(row.view_json), metadata) : defaultView;
    const viewDigest = hash(view), revision = row?.revision ?? 0;
    if (!Number.isSafeInteger(revision) || revision < 0 || row && (row.view_digest !== viewDigest || row.view_json !== JSON.stringify(view) || revision > 0 && (typeof row.candidate_digest !== "string" || !/^[a-f0-9]{64}$/.test(row.candidate_digest)))) throw new Error("VIEW_STORE_INTEGRITY_DENIED");
    return Object.freeze({ schemaVersion: "pansphaira.workspace-module-view/readback/v1", revision, view, viewDigest, confirmedCandidateDigest: row?.candidate_digest ?? null, persisted: Boolean(row), businessEffectProduced: false });
  }
  function read(principal) { return decode(db.prepare("SELECT revision,view_json,view_digest,candidate_digest FROM workspace_module_views WHERE " + where).get(...key(principal))); }
  function historical(principal, revision) {
    if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("VIEW_UNDO_REVISION_DENIED");
    const row = db.prepare("SELECT revision,view_json,view_digest,candidate_digest FROM workspace_module_view_history WHERE " + where + " AND revision=?").get(...key(principal), revision);
    if (!row) throw new Error("VIEW_UNDO_REVISION_DENIED"); return decode(row);
  }
  // Opaque owner-local reservation, not a caller-supplied transaction callback.
  // Acquisition can wait: the Native546 owner runs its FINAL authenticated
  // lease/source/consent gate only AFTER this reservation has been acquired.
  function reserve(principal) {
    const keys = key(principal);
    if (reservation) throw new Error("VIEW_STORE_RESERVATION_DENIED");
    db.exec("BEGIN IMMEDIATE");
    const token = Object.freeze({});
    reservation = { token, key: JSON.stringify(keys) }; return token;
  }
  function cancelReservation(token) {
    if (!reservation) return false;
    if (reservation.token !== token) throw new Error("VIEW_STORE_RESERVATION_DENIED");
    try { db.exec("ROLLBACK"); } finally { reservation = null; } return true;
  }
  function writeReserved(token, principal, command) {
    if (!reservation || reservation.token !== token) throw new Error("VIEW_STORE_RESERVATION_DENIED");
    try {
    const keys = key(principal);
    if (reservation.key !== JSON.stringify(keys)) throw new Error("VIEW_STORE_RESERVATION_DENIED");
    if (!command || Object.getPrototypeOf(command) !== Object.prototype) throw new Error("VIEW_STORE_COMMAND_DENIED");
    const ds = Object.getOwnPropertyDescriptors(command);
    if (Reflect.ownKeys(ds).length !== 4 || ["expectedRevision", "view", "viewDigest", "candidateDigest"].some(k => !Object.hasOwn(ds, k)) || Object.values(ds).some(d => !d.enumerable || !("value" in d)) || !Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0 || command.expectedRevision >= Number.MAX_SAFE_INTEGER || typeof command.candidateDigest !== "string" || !/^[a-f0-9]{64}$/.test(command.candidateDigest)) throw new Error("VIEW_STORE_COMMAND_DENIED");
    const view = validateWorkspaceModuleViewV1(command.view, metadata), viewDigest = hash(view);
    if (command.viewDigest !== viewDigest) throw new Error("VIEW_STORE_DIGEST_DENIED");
      const before = read(principal);
      if (before.revision !== command.expectedRevision) throw new Error("VIEW_REVISION_CONFLICT");
      // A bounded lifetime, not retention deletion or a global cleanup policy.
      if (before.revision >= 128) throw new Error("VIEW_HISTORY_BOUND_DENIED");
      db.prepare("INSERT OR IGNORE INTO workspace_module_view_history VALUES(?,?,?,?,?,?,?,?,?,?)").run(...keys, before.revision, JSON.stringify(before.view), before.viewDigest, before.confirmedCandidateDigest);
      db.prepare("INSERT INTO workspace_module_views VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,subject_id,instance_id,generation,module_id,view_id) DO UPDATE SET revision=excluded.revision,view_json=excluded.view_json,view_digest=excluded.view_digest,candidate_digest=excluded.candidate_digest").run(...keys, before.revision + 1, JSON.stringify(view), viewDigest, command.candidateDigest);
      db.prepare("INSERT INTO workspace_module_view_history VALUES(?,?,?,?,?,?,?,?,?,?)").run(...keys, before.revision + 1, JSON.stringify(view), viewDigest, command.candidateDigest);
      const receipt = read(principal); db.exec("COMMIT"); reservation = null; return receipt;
    } catch (error) { cancelReservation(token); throw error; }
  }
  function write(principal, command) {
    const token = reserve(principal);
    try { return writeReserved(token, principal, command); } finally { cancelReservation(token); }
  }
  const store = Object.freeze({ read, historical, write, reserve, writeReserved, cancelReservation, revision(principal) { return read(principal).revision; }, close() { if (!closed) { if (reservation) cancelReservation(reservation.token); closed = true; db.close(); } } });
  ownedModuleViewStores.set(store, { path, dev: file.dev, ino: file.ino, scope: "tenant/subject/instance/generation/pan.erv/pan.erv.view", fieldsDigest: hash(metadata) }); return store;
}
export const isWorkspaceModuleViewStoreV1 = store => ownedModuleViewStores.has(store);
// An independent real connection to the SAME native profile database and
// module-view scope is valid; a facade, callback or another database is not.
export function sameWorkspaceModuleViewStoreV1(a, b) {
  const x = ownedModuleViewStores.get(a), y = ownedModuleViewStores.get(b);
  return Boolean(x && y && x.path === y.path && x.dev === y.dev && x.ino === y.ino && x.scope === y.scope && x.fieldsDigest === y.fieldsDigest);
}
