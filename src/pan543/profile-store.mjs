import { DatabaseSync } from "node:sqlite";
import { constants, closeSync, lstatSync, openSync, realpathSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { defaultBrowserProfileV1, migrateBrowserProfileV1, resolveBrowserProfileV1, validateBrowserProfileWriteV1 } from "../../dist/packages/contracts/src/browser-profile-v1.js";
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
