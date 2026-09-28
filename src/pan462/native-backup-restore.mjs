#!/usr/bin/env node
// PAN462 — native backup/restore for a strictly container-owned synthetic
// installation (LIFE-02).
//
// Bounded, native backup of ONE container-owned synthetic installation (owned
// database, files, configuration and needed key references) at a consistent
// boundary, and restoration into a DISTINCT isolated target at a matching
// executable version. The restored copy is read back through the ACTUAL
// released native product paths, and its real external effects are disabled so
// an attempted controlled outbound operation is denied and no obsolete writer
// authority can be reactivated.
//
// Reused released surfaces (no second mechanism is introduced):
//   - packages/contracts canonicalJson / updateDoctorContractDigest — canonical
//     serialisation + digest of the installation identity and every object.
//   - packages/contracts adaptComposeDoctorObservationV1 / runFixtureDoctorV1 —
//     the released read-only observer + doctor report; the restored installation
//     is read back through this actual product path.
//   - packages/contracts buildUpdateMigrationCheckpointV1 /
//     verifyUpdateMigrationCheckpointV1 — the released checkpoint contract that
//     binds the consistent backup boundary with an INDEPENDENT verification
//     context.
//   - packages/knowledge-solution readMarginContextFromPostgresV1 /
//     runReadOnlyQueryV1 — the released REAL read-only PostgreSQL product
//     connector; the restored database objects are read back through it.
//   - the real `pg` client and the real embedded-postgres data directory (the
//     actual local fixture storage path); nothing here replaces the storage
//     adapter with a mock.
//
// Non-claims (explicit):
//   - Synthetic, container-owned installation only. The backup destination is a
//     LOCAL COPY on the same controller/host — it is NOT an independent/offhost
//     disaster-recovery destination, and no production RTO is claimed.
//   - No publication, no private source, no host effect, no real outbound
//     business effect. The controlled outbound attempt is exercised as a
//     fail-closed denial inside the isolated synthetic restore target.
//   - Synthetic evidence cannot satisfy human-only or real-environment evidence;
//     those remain separately held.
//
// Correction 2026-09-28 (AC04 provenance): the recovery diagnosis no longer
// accepts a caller-self-rehashed readback or destination receipt.
//   - VERIFIED_RESTORE is earned only by an issuer-sealed native readback: the
//     receipt is HMAC-sealed with a code-owned, per-process issuer secret that
//     only this module's actual read path holds. The receipt is additionally
//     bound to the material identity of one specific archive. The seal is
//     process-bound: a fresh process must re-run the real native readback (the
//     restored target still exists) to obtain its own valid seal.
//   - INDEPENDENT_BACKUP is HELD in this slice: there is no independently
//     authorized destination issuer, and a caller boolean/receipt/rehash is
//     never authority. No external authority is synthesized.

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  adaptComposeDoctorObservationV1,
  canonicalJson,
  buildUpdateMigrationCheckpointV1,
  verifyUpdateMigrationCheckpointV1,
  updateDoctorContractDigest,
  runFixtureDoctorV1,
  DOCTOR_COMPOSE_OBSERVATION_SCHEMA_V1,
} from "../../dist/packages/contracts/src/index.js";
import {
  readMarginContextFromPostgresV1,
} from "../../dist/packages/knowledge-solution/src/postgres-source.js";
import { PG_SCHEMA } from "../../dist/packages/knowledge-solution/src/pg-harness.js";
import { Client } from "pg";

// ---------------------------------------------------------------------------
// Closed, versioned vocabulary (code-owned; never widened at the boundary).
// ---------------------------------------------------------------------------
export const PAN462_INSTALLATION_SCHEMA_V1 = "pansphaira.pan462/owned-installation/v1";
export const PAN462_BACKUP_SCHEMA_V1 = "pansphaira.pan462/backup-archive/v1";
export const PAN462_RESTORE_SCHEMA_V1 = "pansphaira.pan462/restore-receipt/v1";
export const PAN462_SCHEMA_V1 = "pansphaira.pan462/native-backup-restore/v1";
export const PAN462_CONSUMER_CONTRACT_V1 = "pan462.installation.native-backup-restore/v1";
// Correction 2026-09-28: the closed shapes the corrected readback/diagnosis use.
export const PAN462_READBACK_SCHEMA_V1 = "pansphaira.pan462/restore-readback/v1";
export const PAN462_RESTORED_STATE_SCHEMA_V1 = "pansphaira.pan462/restored-installation-state/v1";
export const PAN462_DESTINATION_SCHEMA_V1 = "pansphaira.pan462/destination-receipt/v1";
// Correction 2026-09-28: the issuer-bound readback seal vocabulary. The issuer
// secret is code-owned and per-process (see READBACK_ISSUER_V1 below).
export const PAN462_READBACK_ISSUER_SCHEMA_V1 = "pansphaira.pan462/readback-issuer/v1";

// The only backup boundary this slice produces: one quiesced, transaction-
// consistent snapshot of the owned state. It is a LOCAL COPY (same controller
// as the source), never an independent/offhost destination by itself.
export const BACKUP_BOUNDARY_V1 = "CONSISTENT_QUIESCED_SNAPSHOT";
export const BACKUP_CLASSES_V1 = Object.freeze(["LOCAL_COPY", "INDEPENDENT_BACKUP"]);

// AC04: the three recovery classes a diagnosis must distinguish.
export const DIAGNOSIS_CLASSES_V1 = Object.freeze(["LOCAL_COPY", "INDEPENDENT_BACKUP", "VERIFIED_RESTORE"]);

// AC01: store kinds the owned installation may own.
export const STORE_KINDS_V1 = Object.freeze(["DATABASE", "FILE", "CONFIG", "KEY"]);

// AC04/AC03: restore disposition.
export const RESTORE_STATES_V1 = Object.freeze(["RESTORED", "HELD"]);

// AC03: the effect policy of a restored copy. A restored copy is created with
// external effects DISABLED and its writer authority epoch advanced.
export const EFFECT_POLICY_V1 = Object.freeze(["ENABLED", "DISABLED"]);

const SECRET_MARKER = "REDACTED";

// ---------------------------------------------------------------------------
// Small closed-shape helpers (mirrors the PAN461 anti-substitution boundary).
// ---------------------------------------------------------------------------
const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype;
const isDenseArray = (value) =>
  Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype;
const exactKeys = (value, keys) =>
  isRecord(value) && canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort());
const sha256Hex = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const closedId = (value) =>
  typeof value === "string" && /^[a-z][a-z0-9-]{1,31}:[a-z0-9][a-z0-9._-]{2,95}$/.test(value);
const semver = (value) =>
  typeof value === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value);
const exactAxis = (value) => typeof value === "string" && /^v[1-9]\d*$/.test(value);
const sha = (value) => createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
const bytesSha = (value) =>
  createHash("sha256").update(typeof value === "string" ? Buffer.from(value, "utf8") : new Uint8Array(value)).digest("hex");

const deny = (code) => ({ outcome: "DENIED", code });
const safeCopy = (value) => JSON.parse(canonicalJson(value));

// ---------------------------------------------------------------------------
// Owned/disposable destination guard (correction 2026-09-28).
// ---------------------------------------------------------------------------
// Destructive removal of a backup or restore root is allowed ONLY inside an
// explicitly owned, disposable scratch root. The path must be an absolute,
// normalized STRICT descendant of `ownedRoot`, must not be a symlink (or
// contain a symlinked component), must not be a filesystem root, and must be
// distinct from every related root. Anything else is refused BEFORE any
// destructive write, so unrelated contents are never touched.
function isStrictDescendant(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function symlinkComponentBetween(parent, child) {
  let current = parent;
  for (const part of path.relative(parent, child).split(path.sep)) {
    if (part === "" || part === ".") continue;
    current = path.join(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) return true;
    } catch {
      // A component that does not exist yet cannot be a symlink: the destructive
      // op creates it fresh, so traversal into pre-existing data is impossible.
      return false;
    }
  }
  return false;
}

function guardDisposableDestination({ dir, ownedRoot, forbidden = [] }) {
  if (typeof dir !== "string" || dir.length === 0) return deny("INPUT_REQUIRED");
  if (typeof ownedRoot !== "string" || ownedRoot.length === 0) return deny("OWNED_ROOT_REQUIRED");
  const resolved = path.resolve(dir);
  if (!path.isAbsolute(dir) || resolved === path.parse(resolved).root) return deny("DESTINATION_UNSAFE_PATH");
  // `path.resolve` would silently repair `..`/`.`; a repaired path is not the
  // path the caller named, so it is refused rather than normalized.
  if (dir !== resolved || dir.includes("..")) return deny("DESTINATION_UNSAFE_PATH");
  const owned = path.resolve(ownedRoot);
  if (!path.isAbsolute(ownedRoot) || owned === path.parse(owned).root) return deny("OWNED_ROOT_REQUIRED");
  let ownedStat;
  try { ownedStat = lstatSync(owned); } catch { return deny("OWNED_ROOT_REQUIRED"); }
  if (ownedStat.isSymbolicLink() || !ownedStat.isDirectory()) return deny("OWNED_ROOT_REQUIRED");
  if (!isStrictDescendant(owned, resolved)) return deny("DESTINATION_NOT_OWNED");
  if (symlinkComponentBetween(owned, resolved)) return deny("DESTINATION_IS_SYMLINK");
  try {
    const leaf = lstatSync(resolved);
    if (leaf.isSymbolicLink() || !leaf.isDirectory()) return deny("DESTINATION_IS_SYMLINK");
  } catch { /* not created yet — a fresh owned leaf is fine */ }
  for (const other of forbidden) {
    if (typeof other !== "string" || other.length === 0) continue;
    const otherResolved = path.resolve(other);
    if (otherResolved === resolved
      || isStrictDescendant(otherResolved, resolved)
      || isStrictDescendant(resolved, otherResolved)) {
      return deny("DESTINATION_NOT_DISTINCT");
    }
  }
  return { outcome: "OK", code: "OK", resolved };
}

// ---------------------------------------------------------------------------
// Read-only observation of the ACTUAL restored target (correction 2026-09-28).
// ---------------------------------------------------------------------------
const COMPOSE_STATES_V1 = Object.freeze(["RUNNING", "STOPPED", "UNAVAILABLE"]);
const COMPOSE_HEALTH_V1 = Object.freeze(["HEALTHY", "UNHEALTHY", "NOT_AVAILABLE"]);

function observeRestoredTargetState({ restored, targetRoot, requiredServiceIds }) {
  const readEntry = (relativePath) => {
    const full = path.join(targetRoot, relativePath);
    if (!existsSync(full)) return { present: false, bytes: null, json: null };
    try {
      const bytes = readFileSync(full);
      let json = null;
      try { json = JSON.parse(bytes.toString("utf8")); } catch { json = null; }
      return { present: true, bytes, json };
    } catch {
      return { present: false, bytes: null, json: null };
    }
  };

  const config = readEntry(path.join("config", "config.json"));
  const observedConfigDigest = config.bytes === null ? null : bytesSha(config.bytes);
  const files = restored.files.map((file) => {
    const observed = readEntry(path.join("files", file.path));
    return {
      path: file.path,
      expectedSha256: file.sha256,
      present: observed.present,
      observedSha256: observed.bytes === null ? null : bytesSha(observed.bytes),
    };
  });
  const state = readEntry("installation-state.json").json;
  const authorityEntry = readEntry("writer-authority.json");
  const effectEntry = readEntry("effect-policy.json");
  const authority = isRecord(authorityEntry.json) ? authorityEntry.json : null;
  const effectPolicy = isRecord(effectEntry.json) ? effectEntry.json : null;

  // The restored copy's persisted service-state records. Invalid-valued entries
  // are dropped (they then count as missing), so a mutated state file degrades
  // to a non-PASS observation instead of throwing.
  const declaredServices = isRecord(state) && isDenseArray(state.services) ? state.services : null;
  const observedServices = declaredServices === null ? null : declaredServices
    .filter((service) => isRecord(service)
      && requiredServiceIds.includes(service.serviceId)
      && COMPOSE_STATES_V1.includes(service.state)
      && COMPOSE_HEALTH_V1.includes(service.health))
    .map((service) => ({ serviceId: service.serviceId, state: service.state, health: service.health }));

  return {
    observedLockDigest: isRecord(state) && sha256Hex(state.installationDigest) ? state.installationDigest : null,
    observedVersion: isRecord(state) && typeof state.version === "string" ? state.version : null,
    observedConfigDigest,
    files,
    authority,
    effectPolicy,
    observedServices,
    servicesPresent: declaredServices !== null,
    publicView: {
      targetRoot,
      configPresent: config.present,
      observedConfigDigest,
      files: files.map((file) => ({ path: file.path, present: file.present, observedSha256: file.observedSha256 })),
      authorityEpoch: authority !== null && Number.isSafeInteger(authority.epoch) ? authority.epoch : null,
      authorityState: authority !== null && typeof authority.state === "string" ? authority.state : null,
      predecessorRevoked: authority !== null && authority.predecessorRevoked === true,
      externalEffects: effectPolicy !== null && typeof effectPolicy.externalEffects === "string" ? effectPolicy.externalEffects : null,
      serviceIds: observedServices === null ? [] : observedServices.map((service) => service.serviceId),
    },
  };
}

function restoredReadDenialCode({ observed, filesMatch, configMatch, authorityMatch, effectMatch, servicesMatch }) {
  if (observed.observedConfigDigest === null) return "RESTORED_CONFIG_MISSING";
  if (!configMatch) return "RESTORED_CONFIG_MISMATCH";
  if (observed.files.some((file) => !file.present)) return "RESTORED_FILE_MISSING";
  if (!filesMatch) return "RESTORED_FILE_MISMATCH";
  if (observed.effectPolicy === null) return "RESTORED_EFFECT_POLICY_MISSING";
  if (!effectMatch) return "RESTORED_EFFECT_POLICY_MALFORMED";
  if (observed.authority === null) return "RESTORED_AUTHORITY_MISSING";
  if (!authorityMatch) return "RESTORED_AUTHORITY_MISMATCH";
  if (observed.servicesPresent !== true) return "RESTORED_SERVICE_STATE_MISSING";
  if (!servicesMatch) return "RESTORED_SERVICE_STATE_UNAVAILABLE";
  return "RESTORED_STATE_UNVERIFIED";
}

// ---------------------------------------------------------------------------
// AC04 correction 2026-09-28 — issuer-bound native readback; destination HELD.
// ---------------------------------------------------------------------------
// The independent/offhost destination class has NO independently authorized
// issuer in this slice. A caller-provided destination receipt — or a renamed
// caller receipt/verifier/key/signer, or an asserted `independent`/
// `authorizedInfrastructure` boolean — is never authority. INDEPENDENT_BACKUP is
// therefore always HELD here: the manifest may declare the class, but the
// diagnosis never mints it. Genuine offhost authority must arrive from a
// separately authorized destination in a future, separately authorized slice;
// this slice does not synthesize one.
const INDEPENDENT_DESTINATION_HELD_V1 = Object.freeze({
  verified: false,
  reason: "NO_AUTHORIZED_DESTINATION_ISSUER",
});

// VERIFIED_RESTORE is earned only by an ISSUER-BOUND native readback. The
// readback receipt is sealed with a code-owned issuer secret held by this module
// instance: only `readRestoredInstallationV1` — which actually reads the
// restored database over the wire and the restored target from disk — can
// produce a valid seal. A caller that fabricates the same fields and recomputes
// a plain sha256 can never mint the seal, so a self-rehashed object is not
// evidence (a checksum shows consistency, not an authorized observation).
//
// The seal covers the whole receipt content, which is additionally bound to the
// MATERIAL identity of one specific archive: the installation identity digest,
// the observed config/file digests, the fenced successor authority epoch, the
// disabled effect policy and the archive digest. A genuine receipt replayed
// against a mismatched backup therefore also fails.
const READBACK_ISSUER_V1 = Object.freeze({
  schemaVersion: PAN462_READBACK_ISSUER_SCHEMA_V1,
  issuerId: `issuer:pan462-readback-${randomBytes(8).toString("hex")}`,
  key: randomBytes(32),
});

// The seal is an HMAC over the receipt content with the module-held issuer
// secret. The secret is never exported, so the seal is not caller-recomputable.
function sealReadbackReceipt(content) {
  return createHmac("sha256", READBACK_ISSUER_V1.key).update(canonicalJson(content), "utf8").digest("hex");
}

function issuerSealMatches(content, seal) {
  if (!sha256Hex(seal)) return false;
  const expected = Buffer.from(sealReadbackReceipt(content), "hex");
  const actual = Buffer.from(seal, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function verifyRestoreReadback(receipt, backup) {
  if (!isRecord(receipt) || receipt.schemaVersion !== PAN462_READBACK_SCHEMA_V1) return false;
  if (receipt.issuerSchemaVersion !== PAN462_READBACK_ISSUER_SCHEMA_V1) return false;
  if (receipt.issuerId !== READBACK_ISSUER_V1.issuerId) return false;
  if (receipt.outcome !== "READ" || receipt.doctorStatus !== "PASS") return false;
  // (1) Issuer seal over the receipt content. Only the actual native readback
  //     route holds the issuer secret; a caller-rehashed object fails here.
  const { readbackDigest, ...content } = receipt;
  if (!issuerSealMatches(content, readbackDigest)) return false;
  // (2) Material binding to exactly ONE archive — not arbitrary digest agreement.
  const manifest = isRecord(backup.manifest) ? backup.manifest : undefined;
  if (!isRecord(manifest)) return false;
  const archiveDigest = backup.archiveDigest ?? manifest.archiveDigest;
  if (typeof archiveDigest !== "string" || receipt.archiveDigest !== archiveDigest) return false;
  const captures = manifest.captures;
  if (!isRecord(captures) || !isRecord(captures.config) || !isDenseArray(captures.files)) return false;
  if (receipt.installationDigest !== manifest.installationDigest) return false;
  if (receipt.observedConfigDigest !== captures.config.sha256) return false;
  if (!isDenseArray(receipt.observedFiles) || receipt.observedFiles.length !== captures.files.length) return false;
  for (const file of captures.files) {
    if (!receipt.observedFiles.some((observed) => observed.path === file.path && observed.sha256 === file.sha256)) return false;
  }
  // (3) The observed state must be this archive's fenced successor: the restored
  //     writer epoch is the captured epoch + 1 and effects are DISABLED.
  if (!Number.isSafeInteger(receipt.observedAuthorityEpoch)
    || !isRecord(manifest.writerAuthority)
    || receipt.observedAuthorityEpoch !== manifest.writerAuthority.epoch + 1) return false;
  if (receipt.observedExternalEffects !== "DISABLED") return false;
  return true;
}

// ---------------------------------------------------------------------------
// AC01 — the owned synthetic installation descriptor (closed shape).
// ---------------------------------------------------------------------------
function validInstallation(value) {
  if (!exactKeys(value, ["schemaVersion", "installationId", "releaseId", "version", "versionAxes",
    "authorityProfile", "components", "stores", "keyRefs", "services",
    "expectedConfigDigest", "externalEffects", "installationDigest"])) return false;
  if (value.schemaVersion !== PAN462_INSTALLATION_SCHEMA_V1
    || !closedId(value.installationId)
    || !semver(value.releaseId) || !semver(value.version)) return false;
  if (!exactKeys(value.versionAxes, ["core", "policies", "schemas"])
    || !Object.values(value.versionAxes).every(exactAxis)) return false;
  if (!exactKeys(value.authorityProfile, ["profileId", "digest"])
    || !closedId(value.authorityProfile.profileId) || !sha256Hex(value.authorityProfile.digest)) return false;
  if (!isDenseArray(value.components) || value.components.length === 0
    || !value.components.every((component) => exactKeys(component, ["componentId", "version", "digest"])
      && closedId(component.componentId) && semver(component.version) && sha256Hex(component.digest))) return false;
  const componentIds = value.components.map(({ componentId }) => componentId);
  if (componentIds.length !== new Set(componentIds).size) return false;
  if (!isDenseArray(value.stores) || value.stores.length === 0
    || !value.stores.every((store) => exactKeys(store, ["storeId", "kind", "path", "required"])
      && closedId(store.storeId) && STORE_KINDS_V1.includes(store.kind)
      && typeof store.path === "string" && store.path.length > 0
      && typeof store.required === "boolean")) return false;
  const storeIds = value.stores.map(({ storeId }) => storeId);
  if (storeIds.length !== new Set(storeIds).size) return false;
  if (!isDenseArray(value.keyRefs)
    || !value.keyRefs.every((ref) => exactKeys(ref, ["refId", "role", "path", "required"])
      && closedId(ref.refId) && ["CONFIG", "CREDENTIAL", "CERTIFICATE"].includes(ref.role)
      && typeof ref.path === "string" && ref.path.length > 0
      && typeof ref.required === "boolean")) return false;
  const refIds = value.keyRefs.map(({ refId }) => refId);
  if (refIds.length !== new Set(refIds).size) return false;
  if (!isDenseArray(value.services) || value.services.length === 0
    || !value.services.every((service) => exactKeys(service, ["serviceId", "state", "health"])
      && typeof service.serviceId === "string" && /^[a-z][a-z0-9-]{1,31}$/.test(service.serviceId)
      && ["RUNNING", "STOPPED", "UNAVAILABLE"].includes(service.state)
      && ["HEALTHY", "UNHEALTHY", "NOT_AVAILABLE"].includes(service.health))) return false;
  if (!sha256Hex(value.expectedConfigDigest)) return false;
  if (!EFFECT_POLICY_V1.includes(value.externalEffects)) return false;
  // The installation identity is the released canonical digest of its own
  // declared content; a caller-rehashed digest that does not match is refused.
  return installationDigestOf(value) === value.installationDigest;
}

function installationDigestOf(value) {
  const content = {
    schemaVersion: value.schemaVersion,
    installationId: value.installationId,
    releaseId: value.releaseId,
    version: value.version,
    versionAxes: value.versionAxes,
    authorityProfile: value.authorityProfile,
    components: value.components,
    stores: value.stores,
    keyRefs: value.keyRefs,
    services: value.services,
    expectedConfigDigest: value.expectedConfigDigest,
    externalEffects: value.externalEffects,
  };
  return updateDoctorContractDigest(content, "installationDigest");
}

// Public helper: build a valid installation from content (test/fixture use).
export function makeOwnedInstallation(input) {
  const content = {
    schemaVersion: PAN462_INSTALLATION_SCHEMA_V1,
    installationId: input.installationId,
    releaseId: input.releaseId,
    version: input.version,
    versionAxes: input.versionAxes,
    authorityProfile: input.authorityProfile,
    components: input.components,
    stores: input.stores,
    keyRefs: input.keyRefs,
    services: input.services,
    expectedConfigDigest: input.expectedConfigDigest,
    externalEffects: input.externalEffects ?? "DISABLED",
  };
  return { ...content, installationDigest: installationDigestOf(content) };
}

// ---------------------------------------------------------------------------
// Native storage adapter — real entry points only.
// ---------------------------------------------------------------------------
// The owned DATABASE store is a REAL local PostgreSQL server. Its consistent
// snapshot is captured inside ONE REPEATABLE READ / READ ONLY transaction (one
// MVCC snapshot for every table), so the backup boundary is consistent and not
// a per-table race.
export async function snapshotDatabaseV1(adminClient) {
  await adminClient.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    const tablesResult = (await adminClient.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name",
    )).rows;
    const tables = [];
    for (const { table_name: table } of tablesResult) {
      const columns = (await adminClient.query(
        "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position",
        [table],
      )).rows;
      // A bounded, non-recursive read of this synthetic table. The value set is
      // captured in column order so the object is canonical and independent of
      // object key ordering.
      const rows = (await adminClient.query(`SELECT * FROM "${table}"`)).rows;
      tables.push({
        table,
        columns: columns.map((column) => ({
          name: column.column_name,
          dataType: column.data_type,
          nullable: column.is_nullable === "YES",
        })),
        rows: rows.map((row) => columns.map((column) => row[column.column_name])),
      });
    }
    await adminClient.query("COMMIT");
    return tables.sort((left, right) => left.table.localeCompare(right.table));
  } catch (error) {
    try { await adminClient.query("ROLLBACK"); } catch { /* already rolled back */ }
    throw error;
  }
}

// Recreate the captured database objects into a DISTINCT target database and
// insert the captured rows through the real wire protocol.
export async function restoreDatabaseV1(targetClient, tables) {
  for (const table of tables) {
    await targetClient.query(`DROP TABLE IF EXISTS "${table.table}"`);
    const columnSql = table.columns
      .map((column) => `"${column.name}" ${sqlTypeOf(column.dataType)}${column.nullable ? "" : " NOT NULL"}`)
      .join(", ");
    await targetClient.query(`CREATE TABLE "${table.table}" (${columnSql})`);
    for (const row of table.rows) {
      const placeholders = row.map((_, index) => `$${index + 1}`).join(",");
      await targetClient.query(`INSERT INTO "${table.table}" VALUES (${placeholders})`, row);
    }
  }
}

function sqlTypeOf(dataType) {
  // The synthetic installation owns a closed set of scalar column types; an
  // unknown type is refused rather than guessed.
  const map = {
    text: "text",
    "character varying": "text",
    numeric: "numeric",
    integer: "integer",
    bigint: "bigint",
    boolean: "boolean",
    date: "date",
    timestamp: "timestamp",
    "timestamp with time zone": "timestamptz",
    jsonb: "jsonb",
  };
  const sqlType = map[dataType];
  if (sqlType === undefined) throw new Error(`UNSUPPORTED_COLUMN_TYPE:${dataType}`);
  return sqlType;
}

function listFilesRecursive(root, prefix = "") {
  if (!existsSync(root)) return [];
  const out = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) out.push(...listFilesRecursive(path.join(root, entry.name), relative));
    else if (entry.isFile()) out.push(relative);
    // Symlinks and other non-regular entries are deliberately not followed.
  }
  return out.sort();
}

// ---------------------------------------------------------------------------
// AC01 — back up owned state at a consistent boundary.
// ---------------------------------------------------------------------------
export async function createPan462BackupV1({
  installation,
  source,
  backupDir,
  ownedRoot,
  now,
  nowMs,
  checkpointOrdinal = 1,
} = {}) {
  if (installation === undefined || source === undefined || typeof backupDir !== "string"
    || typeof now !== "string" || !Number.isSafeInteger(nowMs)) {
    return deny("INPUT_REQUIRED");
  }
  if (!validInstallation(installation)) return deny("INSTALLATION_MALFORMED");
  if (!isRecord(source) || typeof source.root !== "string" || !isRecord(source.database)
    || typeof source.database.client !== "object") {
    return deny("SOURCE_STORAGE_REQUIRED");
  }
  // The backup root is removed recursively below: prove it is an owned,
  // disposable, distinct local root before anything destructive happens.
  const destination = guardDisposableDestination({ dir: backupDir, ownedRoot, forbidden: [source.root] });
  if (destination.outcome !== "OK") return destination;
  // AC04: the measured operation time is taken on the monotonic clock at the
  // real invocation boundaries. `nowMs` (the caller business/checkpoint
  // timestamp) is semantically separate and must never be reused as the
  // measured start — that made the recorded duration the fixture age, not the
  // operation elapsed.
  const startedMonotonicMs = performance.now();
  try {
    // 1) Owned DATABASE: one consistent snapshot.
    const database = await snapshotDatabaseV1(source.database.client);

    // 2) Owned FILES: the whole declared content directory, byte for byte.
    const filesDir = path.join(source.root, "files");
    const files = listFilesRecursive(filesDir).map((relative) => {
      const bytes = readFileSync(path.join(filesDir, relative));
      return { path: relative, sha256: bytesSha(bytes), bytes: bytes.length };
    });

    // 3) Owned CONFIGURATION: a single configuration object.
    const configRel = "config/config.json";
    const configPath = path.join(source.root, configRel);
    const configBytes = readFileSync(configPath);
    const config = { path: configRel, sha256: bytesSha(configBytes), bytes: configBytes.length };
    // One declared source of truth for the configuration: the captured config
    // must equal the installation's declared expected config digest.
    if (installation.expectedConfigDigest !== config.sha256) {
      return deny("DECLARED_OBSERVED_CONFIG_BINDING_MISMATCH");
    }

    // 4) Needed KEY REFERENCES only — a reference path, never a secret value.
    const keysDir = path.join(source.root, "keys");
    const keyRefs = installation.keyRefs.map((ref) => {
      const referencePath = path.join(keysDir, `${ref.refId}.ref`);
      const available = existsSync(referencePath);
      let sha256 = null;
      if (available) {
        const reference = readFileSync(referencePath, "utf8").trim();
        // A key store holds REFERENCES, not secret values. A value-shaped
        // secret (a PEM body or a high-entropy token) is refused at capture.
        if (looksLikeSecretValue(reference)) throw new Error("KEY_STORE_CONTAINS_SECRET_VALUE");
        sha256 = bytesSha(reference);
      }
      return {
        refId: ref.refId, role: ref.role, path: ref.path, required: ref.required,
        available, sha256, secretValue: SECRET_MARKER, secretExported: false,
      };
    });

    // 5) Writer authority + effect policy: the boundary that AC03 fences.
    const writerAuthority = readWriterAuthority(source.root);

    const capturesDigest = sha({ database, files, config, keyRefs });
    const contentDigest = sha(database);
    const snapshotDigest = sha({ installationDigest: installation.installationDigest, capturesDigest });
    const ownerStateDigest = sha({ writerAuthority, externalEffects: installation.externalEffects });

    // The released checkpoint binds the consistent boundary with an INDEPENDENT
    // verification context (the same values re-supplied separately).
    const checkpoint = buildUpdateMigrationCheckpointV1({
      operationDigest: sha({ installationId: installation.installationId, releaseId: installation.releaseId }),
      migrationEdgeDigest: sha({ fromVersion: installation.version, toVersion: installation.version }),
      currentTupleDigest: sha(installation.versionAxes),
      rollbackTargetTupleDigest: sha(installation.versionAxes),
      snapshotDigest,
      snapshotContentDigest: contentDigest,
      ownerStateDigest,
      checkpointOrdinal,
      authorityProfileDigest: installation.authorityProfile.digest,
      recorder: { recorderId: "recorder:checkpoint-writer", recorderVersion: "1.0.0" },
      capturedAtMs: nowMs,
    });
    const context = {
      expectedOperationDigest: checkpoint.operationDigest,
      expectedMigrationEdgeDigest: checkpoint.migrationEdgeDigest,
      expectedCurrentTupleDigest: checkpoint.currentTupleDigest,
      expectedSnapshotDigest: checkpoint.snapshotDigest,
      expectedSnapshotContentDigest: checkpoint.snapshotContentDigest,
      expectedOwnerStateDigest: checkpoint.ownerStateDigest,
      expectedCheckpointOrdinal: checkpoint.checkpointOrdinal,
      expectedAuthorityProfileDigest: checkpoint.authorityProfileDigest,
      expectedRecorder: { recorderId: checkpoint.recorder.recorderId, recorderVersion: checkpoint.recorder.recorderVersion },
      expectedCapturedAtMs: checkpoint.capturedAtMs,
    };
    const verified = verifyUpdateMigrationCheckpointV1(checkpoint, context);
    if (verified.outcome !== "RECORDED") {
      return deny("BOUNDARY_CHECKPOINT_DENIED");
    }

    // 6) Write the archive: one manifest (metadata + digests) plus the raw
    //    captured objects. The archive digest is the canonical digest of the
    //    manifest, so a single flipped byte in any object is detectable.
    rmSync(backupDir, { recursive: true, force: true });
    mkdirSync(path.join(backupDir, "objects"), { recursive: true });
    const databaseBytes = Buffer.from(`${JSON.stringify(database, null, 2)}\n`, "utf8");
    writeFileSync(path.join(backupDir, "objects", "database.json"), databaseBytes);
    writeFileSync(path.join(backupDir, "objects", "config.json"), configBytes);
    for (const file of files) {
      const target = path.join(backupDir, "objects", "files", file.path);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, readFileSync(path.join(filesDir, file.path)));
    }
    const manifest = {
      schemaVersion: PAN462_BACKUP_SCHEMA_V1,
      consumerContract: PAN462_CONSUMER_CONTRACT_V1,
      boundary: BACKUP_BOUNDARY_V1,
      backupClass: "LOCAL_COPY",
      sourceRoot: source.root,
      installationId: installation.installationId,
      releaseId: installation.releaseId,
      version: installation.version,
      versionAxes: installation.versionAxes,
      authorityProfile: installation.authorityProfile,
      installationDigest: installation.installationDigest,
      captures: {
        database: { tables: database.map((table) => table.table), digest: bytesSha(databaseBytes) },
        files,
        config,
        keyRefs,
        // The owned installation's declared service state, captured at the same
        // consistent boundary and restored into the target (readback observes
        // the restored copy's persisted records, never the caller's request).
        services: installation.services.map((service) => ({ ...service })),
      },
      writerAuthority,
      externalEffects: installation.externalEffects,
      checkpoint,
      capturedAtMs: nowMs,
    };
    const archiveDigest = sha(manifest);
    writeFileSync(path.join(backupDir, "manifest.json"), `${JSON.stringify({ ...manifest, archiveDigest }, null, 2)}\n`);

    const completedAtMs = Date.now();
    return {
      outcome: "BACKED_UP",
      code: "OK",
      boundary: BACKUP_BOUNDARY_V1,
      backupClass: "LOCAL_COPY",
      sourceRoot: source.root,
      archiveDigest,
      checkpoint,
      manifest: { ...manifest, archiveDigest },
      measurements: measure({
        startedAtMs: Math.round(Date.now() - (performance.now() - startedMonotonicMs)),
        completedAtMs,
        databaseRows: database.reduce((sum, table) => sum + table.rows.length, 0),
        fileCount: files.length,
        fileBytes: files.reduce((sum, file) => sum + file.bytes, 0),
        configBytes: config.bytes,
        totalBytes: statSync(path.join(backupDir, "objects", "database.json")).size
          + config.bytes + files.reduce((sum, file) => sum + file.bytes, 0),
      }),
    };
  } catch (error) {
    return deny(`BACKUP_FAILED:${error instanceof Error ? error.message : String(error)}`);
  }
}

function looksLikeSecretValue(reference) {
  // A key store reference is a path or an opaque handle id. A PEM body or a
  // long bare token is a secret value and is refused.
  return /-----BEGIN/.test(reference) || /^[A-Za-z0-9+/=_-]{40,}$/.test(reference);
}

function readWriterAuthority(root) {
  const authorityPath = path.join(root, "writer-authority.json");
  if (!existsSync(authorityPath)) return { epoch: 0, state: "NONE", invalidated: true };
  const authority = JSON.parse(readFileSync(authorityPath, "utf8"));
  return {
    epoch: authority.epoch,
    state: authority.state ?? "ACTIVE",
    invalidated: authority.invalidated === true,
  };
}

function measure({ startedAtMs, completedAtMs, databaseRows, fileCount, fileBytes, configBytes, totalBytes }) {
  return {
    startedAtMs,
    completedAtMs,
    durationMs: Math.max(0, completedAtMs - startedAtMs),
    databaseRows,
    fileCount,
    fileBytes,
    configBytes,
    totalBytes,
  };
}

// ---------------------------------------------------------------------------
// AC01/AC02 — restore into a DISTINCT isolated target.
// ---------------------------------------------------------------------------
export async function restorePan462BackupV1({
  backupDir,
  targetRoot,
  ownedRoot,
  target,
  expectedVersion,
  now,
  nowMs,
} = {}) {
  if (typeof backupDir !== "string" || typeof targetRoot !== "string" || target === undefined
    || typeof expectedVersion !== "string" || typeof now !== "string" || !Number.isSafeInteger(nowMs)) {
    return deny("INPUT_REQUIRED");
  }
  if (!semver(expectedVersion)) return deny("EXPECTED_VERSION_MALFORMED");
  if (!isRecord(target) || typeof target.root !== "string" || !isRecord(target.database)
    || typeof target.database.client !== "object") {
    return deny("TARGET_STORAGE_REQUIRED");
  }
  const manifestPath = path.join(backupDir, "manifest.json");
  if (!existsSync(manifestPath)) return deny("MISSING_STORE");
  let archive;
  try {
    archive = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return deny("CORRUPT_ARCHIVE");
  }
  if (!isRecord(archive) || archive.schemaVersion !== PAN462_BACKUP_SCHEMA_V1
    || !sha256Hex(archive.archiveDigest)) return deny("CORRUPT_ARCHIVE");

  // The archive digest must equal the canonical digest of the manifest content:
  // a byte changed anywhere in the captured metadata is a corrupt archive.
  const { archiveDigest, ...manifestContent } = archive;
  if (sha(manifestContent) !== archiveDigest) return deny("CORRUPT_ARCHIVE");

  // AC01: the restore target must be DISTINCT from the source installation the
  // archive was captured from.
  if (path.resolve(targetRoot) === path.resolve(archive.sourceRoot)) {
    return deny("TARGET_NOT_DISTINCT");
  }

  // AC01: the restored copy must run at the MATCHING executable version.
  if (archive.version !== expectedVersion) return deny("WRONG_VERSION");

  // A manifest without the captured service state cannot be restored faithfully.
  if (!isRecord(archive.captures) || !isDenseArray(archive.captures.services)) return deny("CORRUPT_ARCHIVE");

  // The restore root is removed recursively below: prove it is an owned,
  // disposable, distinct local root before anything destructive happens.
  const destination = guardDisposableDestination({
    dir: targetRoot, ownedRoot, forbidden: [archive.sourceRoot, backupDir],
  });
  if (destination.outcome !== "OK") return destination;

  // Recompute every captured object digest; a missing or altered object refuses
  // completion (missing store / corrupt archive).
  const objectsDir = path.join(backupDir, "objects");
  let database;
  try {
    if (!existsSync(path.join(objectsDir, "database.json"))) return deny("MISSING_STORE");
    const databaseBytes = readFileSync(path.join(objectsDir, "database.json"));
    if (bytesSha(databaseBytes) !== archive.captures.database.digest) return deny("CORRUPT_ARCHIVE");
    database = JSON.parse(databaseBytes.toString("utf8"));
  } catch {
    return deny("CORRUPT_ARCHIVE");
  }
  for (const file of archive.captures.files) {
    const objectPath = path.join(objectsDir, "files", file.path);
    if (!existsSync(objectPath)) return deny("MISSING_STORE");
    if (bytesSha(readFileSync(objectPath)) !== file.sha256) return deny("CORRUPT_ARCHIVE");
  }
  const configObjectPath = path.join(objectsDir, "config.json");
  if (!existsSync(configObjectPath)) return deny("MISSING_STORE");
  if (bytesSha(readFileSync(configObjectPath)) !== archive.captures.config.sha256) return deny("CORRUPT_ARCHIVE");

  // AC02: an unavailable REQUIRED key reference refuses completion.
  const availableKeyRefs = [];
  for (const ref of archive.captures.keyRefs) {
    const targetRefPath = path.join(target.keyStore ?? path.join(target.root, "keys"), `${ref.refId}.ref`);
    if (ref.required && !existsSync(targetRefPath)) return deny("KEY_UNAVAILABLE");
    availableKeyRefs.push({ ...ref, availableInTarget: existsSync(targetRefPath) });
  }

  // AC03: the restored copy is created with external effects DISABLED and the
  // writer authority epoch advanced, so the pre-backup writer authority is
  // obsolete and cannot be reactivated.
  const restoredWriterAuthority = {
    epoch: archive.writerAuthority.epoch + 1,
    state: "RESTORED_READ_ONLY",
    invalidated: false,
    predecessorEpoch: archive.writerAuthority.epoch,
    predecessorRevoked: true,
  };

  // AC04: measured operation time on the monotonic clock at the real invocation
  // boundary; `nowMs` stays the separate business/checkpoint timestamp.
  const startedMonotonicMs = performance.now();
  try {
    rmSync(targetRoot, { recursive: true, force: true });
    mkdirSync(path.join(targetRoot, "files"), { recursive: true });
    mkdirSync(path.join(targetRoot, "config"), { recursive: true });
    mkdirSync(path.join(targetRoot, "keys"), { recursive: true });

    // Restore the owned objects (files + configuration).
    for (const file of archive.captures.files) {
      const target = path.join(targetRoot, "files", file.path);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, readFileSync(path.join(objectsDir, "files", file.path)));
    }
    writeFileSync(path.join(targetRoot, "config", "config.json"), readFileSync(configObjectPath));

    // Restore the owned DATABASE into the distinct target database.
    await restoreDatabaseV1(target.database.client, database);

    // Persist the restored copy's effect policy + writer authority fence.
    writeFileSync(path.join(targetRoot, "effect-policy.json"), `${JSON.stringify({ externalEffects: "DISABLED" }, null, 2)}\n`);
    writeFileSync(path.join(targetRoot, "writer-authority.json"), `${JSON.stringify(restoredWriterAuthority, null, 2)}\n`);
    // Persist the restored installation state (identity + declared services) so
    // the readback observes the restored copy itself, not the caller's request.
    writeFileSync(path.join(targetRoot, "installation-state.json"), `${JSON.stringify({
      schemaVersion: PAN462_RESTORED_STATE_SCHEMA_V1,
      installationId: archive.installationId,
      releaseId: archive.releaseId,
      version: archive.version,
      versionAxes: archive.versionAxes,
      installationDigest: archive.installationDigest,
      externalEffects: "DISABLED",
      writerAuthority: restoredWriterAuthority,
      services: archive.captures.services.map((service) => ({ ...service })),
    }, null, 2)}\n`);

    const completedAtMs = Date.now();
    const restored = {
      schemaVersion: PAN462_RESTORE_SCHEMA_V1,
      installationId: archive.installationId,
      releaseId: archive.releaseId,
      version: archive.version,
      versionAxes: archive.versionAxes,
      installationDigest: archive.installationDigest,
      authorityProfile: archive.authorityProfile,
      externalEffects: "DISABLED",
      writerAuthority: restoredWriterAuthority,
      keyRefs: availableKeyRefs,
      files: archive.captures.files.map((file) => ({ path: file.path, sha256: file.sha256, bytes: file.bytes })),
      config: archive.captures.config,
      services: archive.captures.services.map((service) => ({ ...service })),
      targetRoot,
      restoredAtMs: nowMs,
      // The archive identity this copy was restored from, so a later native
      // readback receipt can be bound to exactly this archive (correction
      // 2026-09-28).
      archiveDigest,
    };
    return {
      outcome: "RESTORED",
      code: "OK",
      restored,
      archiveDigest,
      measurements: measure({
        startedAtMs: Math.round(Date.now() - (performance.now() - startedMonotonicMs)),
        completedAtMs,
        databaseRows: database.reduce((sum, table) => sum + table.rows.length, 0),
        fileCount: archive.captures.files.length,
        fileBytes: archive.captures.files.reduce((sum, file) => sum + file.bytes, 0),
        configBytes: archive.captures.config.bytes,
        totalBytes: archive.captures.files.reduce((sum, file) => sum + file.bytes, 0) + archive.captures.config.bytes,
      }),
    };
  } catch (error) {
    return deny(`RESTORE_FAILED:${error instanceof Error ? error.message : String(error)}`);
  }
}

// ---------------------------------------------------------------------------
// AC02 — read the RESTORED objects through the ACTUAL native product paths.
// ---------------------------------------------------------------------------
export async function readRestoredInstallationV1({
  restored,
  target,
  requiredServiceIds,
  nowMs,
} = {}) {
  if (restored === undefined || !isRecord(target) || !isRecord(target.database)
    || typeof target.database.host !== "string" || !Number.isSafeInteger(target.database.port)
    || typeof target.database.name !== "string" || typeof target.database.user !== "string"
    || typeof target.database.password !== "string" || !isDenseArray(requiredServiceIds)) {
    return deny("INPUT_REQUIRED");
  }
  const targetRoot = typeof target.root === "string" && target.root.length > 0 ? target.root : restored.targetRoot;
  if (typeof targetRoot !== "string" || targetRoot.length === 0) return deny("INPUT_REQUIRED");
  try {
    // 1) Native product read of the restored DATABASE objects: the released
    //    read-only PostgreSQL connector reads them back over the wire protocol
    //    using a fresh client (the adapter owns + closes it, residual-free).
    const { pack, readback } = await readMarginContextFromPostgresV1({
      conn: { host: target.database.host, port: target.database.port, database: target.database.name, user: target.database.user, password: target.database.password },
      schema: PG_SCHEMA,
      client: new Client({
        host: target.database.host, port: target.database.port,
        database: target.database.name, user: target.database.user, password: target.database.password,
      }),
    });

    // 2) Observe the ACTUAL restored target from disk, read-only. Nothing here
    //    is copied from the restored receipt, and no service state is inferred
    //    from the requested service list.
    const observed = observeRestoredTargetState({ restored, targetRoot, requiredServiceIds });
    if (observed.observedLockDigest === null) {
      return deny("RESTORED_STATE_UNAVAILABLE");
    }

    // 3) The RELEASED observer + doctor over the genuine, independently read
    //    observations of the restored copy.
    const snapshot = {
      schemaVersion: DOCTOR_COMPOSE_OBSERVATION_SCHEMA_V1,
      source: "LOCAL_COMPOSE_SNAPSHOT",
      readOnly: true,
      mutationCount: 0,
      observedLockDigest: observed.observedLockDigest,
      composeVersion: observed.observedVersion,
      expectedConfigDigest: restored.config.sha256,
      observedConfigDigest: observed.observedConfigDigest,
      services: observed.observedServices ?? [],
    };
    const fixture = adaptComposeDoctorObservationV1({ requiredServiceIds, snapshot });
    const report = runFixtureDoctorV1({
      reportId: "cm:doctor-report-pan462-restored-readback",
      profile: "QUICK",
      expectedLockDigest: restored.installationDigest,
      generatedAtMs: nowMs,
      timeoutMs: 30_000,
      fixture,
    });
    const doctorStatus = report.checks.every((check) => check.status === "PASS") ? "PASS" : "FAIL";

    const filesMatch = observed.files.every((file) => file.present && file.observedSha256 === file.expectedSha256);
    const configMatch = observed.observedConfigDigest !== null && observed.observedConfigDigest === restored.config.sha256;
    const authorityMatch = observed.authority !== null
      && observed.authority.epoch === restored.writerAuthority.epoch
      && observed.authority.state === "RESTORED_READ_ONLY"
      && observed.authority.predecessorRevoked === true;
    const effectMatch = observed.effectPolicy !== null && observed.effectPolicy.externalEffects === "DISABLED";
    const servicesMatch = observed.servicesPresent === true
      && requiredServiceIds.every((serviceId) => (observed.observedServices ?? []).some((service) => service.serviceId === serviceId));

    // A READ is only a verified restoration when the released doctor passed AND
    // every observed value matches the archive. Mutated/deleted config, files,
    // effect policy or authority therefore never yield a verified restoration.
    const verified = doctorStatus === "PASS" && filesMatch && configMatch && authorityMatch && effectMatch && servicesMatch;
    const shared = {
      database: { rowCount: readback.rowCount, statement: readback.statement, pack },
      doctor: { status: doctorStatus, report },
      observations: observed.publicView,
    };
    if (verified) {
      const readbackContent = {
        schemaVersion: PAN462_READBACK_SCHEMA_V1,
        issuerSchemaVersion: PAN462_READBACK_ISSUER_SCHEMA_V1,
        issuerId: READBACK_ISSUER_V1.issuerId,
        consumerContract: PAN462_CONSUMER_CONTRACT_V1,
        outcome: "READ",
        installationId: restored.installationId,
        installationDigest: observed.observedLockDigest,
        observedConfigDigest: observed.observedConfigDigest,
        observedFiles: observed.files.map((file) => ({ path: file.path, sha256: file.observedSha256 })),
        observedAuthorityEpoch: observed.authority.epoch,
        observedExternalEffects: observed.effectPolicy.externalEffects,
        doctorStatus,
        targetRoot,
        observedAtMs: nowMs,
        archiveDigest: typeof restored.archiveDigest === "string" ? restored.archiveDigest : null,
      };
      return {
        outcome: "READ",
        code: "OK",
        ...shared,
        // The issuer seal replaces the old caller-recomputable self-hash: only
        // this module's actual native readback can produce it, so a caller
        // cannot mint a VERIFIED_RESTORE by rehashing assertions.
        readback: { ...readbackContent, readbackDigest: sealReadbackReceipt(readbackContent) },
      };
    }
    return {
      ...deny(restoredReadDenialCode({ observed, filesMatch, configMatch, authorityMatch, effectMatch, servicesMatch })),
      ...shared,
      readback: null,
    };
  } catch (error) {
    return deny(`RESTORED_READ_FAILED:${error instanceof Error ? error.message : String(error)}`);
  }
}

// ---------------------------------------------------------------------------
// AC03 — external effects are disabled and obsolete writer authority cannot be
// reactivated in the restored copy.
// ---------------------------------------------------------------------------
export async function attemptControlledEffectV1({ restored, writerAuthority, request } = {}) {
  if (restored === undefined || request === undefined) return deny("INPUT_REQUIRED");
  const idempotencyKey = isRecord(request) ? request.idempotencyKey : undefined;
  if (!isRecord(request) || !exactKeys(request, ["operation", "idempotencyKey"])
    || typeof request.operation !== "string" || typeof idempotencyKey !== "string") {
    return deny("CONTROLLED_EFFECT_MALFORMED");
  }
  // The restored copy is created with external effects DISABLED: a controlled
  // outbound operation is denied at the effect boundary.
  if (restored.externalEffects !== "DISABLED") return deny("RESTORED_EFFECT_POLICY_MALFORMED");
  if (!isRecord(writerAuthority) || !Number.isSafeInteger(writerAuthority.epoch)
    || typeof writerAuthority.revoked !== "boolean") {
    return deny("WRITER_AUTHORITY_MALFORMED");
  }
  // The obsolete (pre-backup) writer authority is fenced: only the restored
  // epoch is current, and the predecessor epoch is revoked.
  if (writerAuthority.revoked === true || writerAuthority.epoch !== restored.writerAuthority.epoch) {
    return deny("STALE_WRITER_AUTHORITY");
  }
  // Effect replay: an effect identity already recorded in the restored copy is
  // refused rather than replayed.
  if (isRecord(restored.effects) && Array.isArray(restored.effects.recorded)
    && restored.effects.recorded.includes(idempotencyKey)) {
    return deny("EFFECT_REPLAY_DENIED");
  }
  // No real outbound target exists in this isolated synthetic restore; the
  // policy refusal above is the fail-closed outcome.
  return deny("EXTERNAL_EFFECTS_DISABLED");
}

// ---------------------------------------------------------------------------
// AC04 — standalone read-only recovery diagnosis + measured record.
// ---------------------------------------------------------------------------
const DIAGNOSIS_INPUT_KEYS_V1 = Object.freeze(["backup", "restoreReadback", "destinationReceipt", "nowMs"]);

export function diagnoseRecoveryV1(options = {}) {
  // Closed shape: an unknown field (e.g. a caller boolean such as
  // `ownsIndependentDestination`/`restored.verified`) is refused outright, so a
  // caller assertion can never be read as evidence.
  if (!isRecord(options) || !Object.keys(options).every((key) => DIAGNOSIS_INPUT_KEYS_V1.includes(key))) {
    return deny("DIAGNOSIS_INPUT_MALFORMED");
  }
  const { backup, restoreReadback, destinationReceipt, nowMs } = options;
  if (backup === undefined || !Number.isSafeInteger(nowMs)) return deny("INPUT_REQUIRED");
  if (!isRecord(backup) || !isRecord(backup.manifest) || !isRecord(backup.measurements)
    || typeof backup.manifest.backupClass !== "string" || !Number.isSafeInteger(backup.measurements.totalBytes)) {
    return deny("INPUT_REQUIRED");
  }
  // LOCAL_COPY is a local copy on the same controller as the source. An
  // INDEPENDENT_BACKUP requires an independently authorized offhost destination
  // issuer; this slice never produces one and a caller receipt/boolean is never
  // authority, so the class is HELD and never minted here. (destinationReceipt is
  // accepted for shape stability only and is deliberately not read as evidence.)
  // A VERIFIED_RESTORE requires the issuer-sealed native readback receipt, never
  // a caller rehash.
  const independentBackup = false;
  const verifiedRestore = verifyRestoreReadback(restoreReadback, backup);
  const classes = [];
  if (backup.manifest.backupClass === "LOCAL_COPY") classes.push("LOCAL_COPY");
  if (verifiedRestore) classes.push("VERIFIED_RESTORE");
  return {
    outcome: "DIAGNOSED",
    code: "OK",
    readOnly: true,
    classes,
    classification: {
      backupClass: backup.manifest.backupClass,
      boundary: backup.boundary ?? backup.manifest.boundary ?? null,
      onSameControllerAsSource: backup.manifest.backupClass === "LOCAL_COPY",
      independentDestinationReceiptVerified: independentBackup,
      independentBackupHeld: true,
      independentDestinationHeld: INDEPENDENT_DESTINATION_HELD_V1,
      restoreReadbackReceiptVerified: verifiedRestore,
      readbackIssuer: verifiedRestore ? READBACK_ISSUER_V1.issuerId : null,
      readbackProvenance: verifiedRestore ? "ISSUER_BOUND_NATIVE_READBACK" : "NONE",
    },
    // Measured observations only — no retrospective or invented timing.
    measurements: {
      backup: backup.measurements,
      restore: isRecord(restoreReadback) && isRecord(restoreReadback.measurements) ? restoreReadback.measurements : null,
      totalBytes: backup.measurements.totalBytes,
    },
    heldClaims: [
      "INDEPENDENT_BACKUP: requires separately supplied authorized infrastructure and a source-bound destination receipt; not satisfied by a local copy or a caller boolean.",
      "PRODUCTION_RTO: no host-disaster or production recovery-time objective is claimed.",
    ],
    nonClaims: [
      "Local copy is not offhost or disaster proof.",
      "Synthetic evidence only; no production or customer data.",
      "A caller boolean is never accepted as independent-backup or verified-restore evidence.",
    ],
  };
}
