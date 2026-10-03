// PAN462 — native backup/restore of a strictly container-owned synthetic
// installation (LIFE-02).
//
// This test drives the REAL local fixture storage path (embedded-postgres +
// the real `pg` wire protocol) and reads the restored objects back through the
// RELEASED native product paths (the read-only PostgreSQL connector and the
// released doctor observer/report). Nothing replaces the affected storage
// adapter with a mock, and no probe outcome is caller-minted.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import Ajv2020 from "ajv/dist/2020.js";

import {
  BACKUP_BOUNDARY_V1,
  DIAGNOSIS_CLASSES_V1,
  PAN462_BACKUP_SCHEMA_V1,
  PAN462_CONSUMER_CONTRACT_V1,
  PAN462_READBACK_ISSUER_SCHEMA_V1,
  attemptControlledEffectV1,
  createPan462BackupV1,
  diagnoseRecoveryV1,
  makeOwnedInstallation,
  readRestoredInstallationV1,
  restorePan462BackupV1,
} from "../../src/pan462/native-backup-restore.mjs";
import { PG_DATABASE, PG_PORT, PG_RO_PASSWORD, PG_RO_USER, startRealPostgres } from "../../dist/packages/knowledge-solution/src/pg-harness.js";
import { canonicalJson } from "../../dist/packages/contracts/src/index.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const fix = (name) => readFileSync(`${ROOT}/tests/fixtures/pan462/${name}`, "utf8");
const sha256Hex = (value) => createHash("sha256").update(value).digest("hex");
const NOW = "2026-09-27T12:00:00Z";
const NOW_MS = Date.UTC(2026, 8, 27, 12, 0, 0);
const EXPECTED = JSON.parse(fix("expected-facts-v1.json"));

const TARGET_PORT = 54432;
const TARGET_DB = "pan462_restore";
const TARGET_ADMIN = "pan462";
const TARGET_ADMIN_PW = "pan462-local-test-only";
const TARGET_RO = "pan462_ro";
const TARGET_RO_PW = "pan462-ro-local-test-only";
const TARGET_DATA_LEAF = "target-pg-" + "x".repeat(112);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function connectWithRetry(client, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try { await client.connect(); return; } catch (error) {
      if (i === attempts - 1) throw error;
      await sleep(250);
    }
  }
}

async function startTargetPostgres({ dataDir, port, database, user, password }) {
  rmSync(dataDir, { recursive: true, force: true });
  const instance = new EmbeddedPostgres({
    // This distinct synthetic restore target uses only loopback TCP. An
    // unused checkout/temp-derived Unix socket must not block real restore.
    databaseDir: dataDir, user, password, port, persistent: true, postgresFlags: ["-c", "unix_socket_directories="],
  });
  await instance.initialise();
  await instance.start();
  await instance.createDatabase(database);
  const client = new Client({ host: "127.0.0.1", port, database, user, password });
  await connectWithRetry(client);
  return {
    instance, client, port, database, user, password,
    async stop() {
      try { await client.end(); } catch { /* already closed */ }
      await Promise.race([
        instance.stop(),
        sleep(60_000).then(() => { throw new Error("pg-stop-timeout"); }),
      ]).catch(() => { /* bounded */ });
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

function installation() {
  const content = JSON.parse(fix("installation-content-v1.json"));
  const configBytes = readFileSync(`${ROOT}/tests/fixtures/pan462/config-source-v1.json`);
  return makeOwnedInstallation({ ...content, expectedConfigDigest: sha256Hex(configBytes), externalEffects: "DISABLED" });
}

// Independent expected facts, taken directly from the released fixtures/seed
// (NOT derived from the adapter under test).
const state = {
  source: null, target: null,
  installRoot: null, targetRoot: null, targetKeyStore: null, backupDir: null,
  backup: null, restore: null, read: null, installation: null,
  root: null,
};

before(async () => {
  state.root = mkdtempSync(path.join(os.tmpdir(), "pan462-"));
  state.installRoot = path.join(state.root, "source-install");
  state.targetRoot = path.join(state.root, "target-install");
  state.targetKeyStore = path.join(state.root, "target-keys");
  state.backupDir = path.join(state.root, "backup");

  // The owned source installation on disk (files, configuration, key refs,
  // writer authority).
  mkdirSync(path.join(state.installRoot, "files"), { recursive: true });
  mkdirSync(path.join(state.installRoot, "config"), { recursive: true });
  mkdirSync(path.join(state.installRoot, "keys"), { recursive: true });
  writeFileSync(path.join(state.installRoot, "files", "content-note-v1.txt"), fix("content-note-v1.txt"));
  writeFileSync(path.join(state.installRoot, "config", "config.json"), fix("config-source-v1.json"));
  writeFileSync(path.join(state.installRoot, "keys", "key:cfg-main.ref"), fix("key-ref-v1.txt"));
  writeFileSync(path.join(state.installRoot, "writer-authority.json"),
    `${JSON.stringify({ epoch: 7, state: "ACTIVE", invalidated: false }, null, 2)}\n`);
  // The target resolves the REQUIRED key reference from its OWN key store; the
  // optional credential reference is not supplied (and is not required).
  mkdirSync(state.targetKeyStore, { recursive: true });
  writeFileSync(path.join(state.targetKeyStore, "key:cfg-main.ref"), fix("key-ref-v1.txt"));

  state.installation = installation();

  // Real source storage: the released KTS harness starts a real PostgreSQL
  // server seeded with the fictitious invoice rows.
  state.source = await startRealPostgres(path.join(state.root, "source-pg"));

  // Real DISTINCT target storage at a matching executable version.
  state.target = await startTargetPostgres({
    dataDir: path.join(state.root, TARGET_DATA_LEAF),
    port: TARGET_PORT, database: TARGET_DB, user: TARGET_ADMIN, password: TARGET_ADMIN_PW,
  });

  state.probeBackupBefore = performance.now();
  state.backup = await createPan462BackupV1({
    installation: state.installation,
    source: { root: state.installRoot, database: { client: state.source.admin, name: PG_DATABASE } },
    backupDir: state.backupDir,
    ownedRoot: state.root,
    now: NOW, nowMs: NOW_MS,
  });
  state.probeBackupElapsed = performance.now() - state.probeBackupBefore;
  assert.equal(state.backup.outcome, "BACKED_UP", JSON.stringify(state.backup));

  state.probeRestoreBefore = performance.now();
  state.restore = await restorePan462BackupV1({
    backupDir: state.backupDir,
    targetRoot: state.targetRoot,
    ownedRoot: state.root,
    expectedVersion: EXPECTED.restoredVersion,
    target: {
      root: state.targetRoot, keyStore: state.targetKeyStore,
      database: {
        client: state.target.client, host: "127.0.0.1", port: TARGET_PORT,
        name: TARGET_DB, user: TARGET_ADMIN, password: TARGET_ADMIN_PW,
      },
    },
    now: NOW, nowMs: NOW_MS + 1,
  });
  state.probeRestoreElapsed = performance.now() - state.probeRestoreBefore;
  assert.equal(state.restore.outcome, "RESTORED", JSON.stringify(state.restore));

  // The target grants a dedicated read-only user (the real server enforces it).
  await state.target.client.query(`CREATE ROLE ${TARGET_RO} WITH LOGIN PASSWORD '${TARGET_RO_PW}'`);
  await state.target.client.query(`GRANT CONNECT ON DATABASE ${TARGET_DB} TO ${TARGET_RO}`);
  await state.target.client.query(`GRANT USAGE ON SCHEMA public TO ${TARGET_RO}`);
  await state.target.client.query(`GRANT SELECT ON kts_invoices TO ${TARGET_RO}`);

  state.read = await readRestoredInstallationV1({
    restored: state.restore.restored,
    target: {
      database: { host: "127.0.0.1", port: TARGET_PORT, name: TARGET_DB, user: TARGET_RO, password: TARGET_RO_PW },
    },
    requiredServiceIds: ["api"],
    nowMs: NOW_MS + 2,
  });
  assert.equal(state.read.outcome, "READ", JSON.stringify(state.read));
});

after(async () => {
  if (state.target !== null) await state.target.stop();
  if (state.source !== null) await state.source.stop();
  if (state.root !== null) rmSync(state.root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
test("PAN462 TCP-only isolated restore target admits readback with a long owned pathname", async () => {
  const dataDir = path.join(state.root, TARGET_DATA_LEAF);
  const socketPath = path.join(dataDir, `.s.PGSQL.${TARGET_PORT}`);
  assert.ok(Buffer.byteLength(socketPath) > 107);
  const actual = await state.target.client.query("SHOW unix_socket_directories");
  assert.equal(actual.rows[0].unix_socket_directories, "");
  assert.equal(existsSync(socketPath), false);
  assert.equal(state.restore.outcome, "RESTORED");
});

test("PAN462-AC01 positive: owned database, files, configuration and key references are captured at a consistent boundary", () => {
  const backup = state.backup;
  assert.equal(backup.boundary, BACKUP_BOUNDARY_V1);
  assert.equal(backup.manifest.schemaVersion, PAN462_BACKUP_SCHEMA_V1);
  assert.equal(backup.manifest.consumerContract ?? PAN462_CONSUMER_CONTRACT_V1, PAN462_CONSUMER_CONTRACT_V1);
  // The released checkpoint verifies the boundary with an independent context.
  assert.equal(backup.checkpoint.transition, "CHECKPOINT_RECORDED");
  assert.equal(backup.checkpoint.phase, "PRE_MIGRATION");
  assert.match(backup.checkpoint.checkpointDigest, /^[a-f0-9]{64}$/);
  // The database snapshot is transaction-consistent and carries the owned rows.
  assert.deepEqual(backup.manifest.captures.database.tables, ["kts_invoices"]);
  // Files + config + key references are captured with digests, no secret value.
  assert.equal(backup.manifest.captures.files.length, 1);
  assert.equal(backup.manifest.captures.files[0].path, "content-note-v1.txt");
  assert.equal(backup.manifest.captures.config.path, "config/config.json");
  const required = backup.manifest.captures.keyRefs.find((ref) => ref.required);
  assert.equal(required.available, true);
  assert.equal(required.secretValue, "REDACTED");
  assert.equal(required.secretExported, false);
  assert.ok(!JSON.stringify(backup.manifest).includes("handle:key-cfg-main-synthetic"));
  // A measured, real data-size + duration observation is recorded.
  assert.ok(backup.measurements.databaseRows >= 1);
  assert.ok(backup.measurements.fileBytes > 0);
  assert.ok(backup.measurements.configBytes > 0);
  assert.ok(Number.isInteger(backup.measurements.durationMs) && backup.measurements.durationMs >= 0);
});

test("PAN462-AC01 positive: restore lands in a DISTINCT isolated target at matching executable version", async () => {
  const restored = state.restore.restored;
  assert.equal(restored.version, EXPECTED.restoredVersion);
  assert.notEqual(path.resolve(restored.targetRoot), path.resolve(state.installRoot));
  assert.ok(existsSync(path.join(state.targetRoot, "files", "content-note-v1.txt")));
  assert.ok(existsSync(path.join(state.targetRoot, "config", "config.json")));
  // The restored files byte-match the captured digests.
  const restoredFile = readFileSync(path.join(state.targetRoot, "files", "content-note-v1.txt"));
  assert.equal(sha256Hex(restoredFile), state.backup.manifest.captures.files[0].sha256);
});

test("PAN462-AC02 positive: restored objects are read through the ACTUAL native product paths and match independent expectations", () => {
  const read = state.read;
  assert.equal(read.database.statement.startsWith("SELECT * FROM kts_invoices"), true);
  assert.equal(read.database.rowCount, EXPECTED.rowCount);
  assert.equal(read.database.pack.data.floorRaw, EXPECTED.floorEur);
  assert.equal(read.database.pack.data.rows.length, EXPECTED.rowCount);
  assert.deepEqual(
    read.database.pack.data.rows.map((row) => row.rechnung_nr),
    EXPECTED.order,
  );
  // The restored installation STATE is read back through the released doctor.
  assert.equal(read.doctor.status, "PASS");
  assert.equal(read.doctor.report.readOnly, true);
  assert.equal(read.doctor.report.observedLockDigest, state.installation.installationDigest);
});

test("PAN462-AC02 negative: missing store, wrong version, corrupt archive and unavailable key each refuse completion", async () => {
  const target = {
    root: state.targetRoot, keyStore: state.targetKeyStore,
    database: { client: state.target.client, host: "127.0.0.1", port: TARGET_PORT, name: TARGET_DB, user: TARGET_ADMIN, password: TARGET_ADMIN_PW },
  };
  const base = { targetRoot: state.targetRoot, ownedRoot: state.root, expectedVersion: EXPECTED.restoredVersion, target, now: NOW, nowMs: NOW_MS + 10 };

  // (a) Wrong version: a restore at a different executable version is refused.
  const wrongVersion = await restorePan462BackupV1({ ...base, backupDir: state.backupDir, expectedVersion: "9.9.9" });
  assert.equal(wrongVersion.outcome, "DENIED");
  assert.equal(wrongVersion.code, "WRONG_VERSION");

  // (b) Missing store: a required captured object is gone.
  const missingDir = path.join(state.root, "backup-missing");
  cpSync(state.backupDir, missingDir, { recursive: true });
  rmSync(path.join(missingDir, "objects", "files", "content-note-v1.txt"));
  const missing = await restorePan462BackupV1({ ...base, backupDir: missingDir });
  assert.equal(missing.code, "MISSING_STORE");

  // (c) Corrupt archive: a single flipped byte in a captured object is detected.
  const corruptDir = path.join(state.root, "backup-corrupt");
  cpSync(state.backupDir, corruptDir, { recursive: true });
  const corruptPath = path.join(corruptDir, "objects", "database.json");
  const corruptBytes = readFileSync(corruptPath);
  corruptBytes[10] = corruptBytes[10] === 0x30 ? 0x31 : 0x30;
  writeFileSync(corruptPath, corruptBytes);
  const corrupt = await restorePan462BackupV1({ ...base, backupDir: corruptDir });
  assert.equal(corrupt.code, "CORRUPT_ARCHIVE");

  // (d) Unavailable key reference: a required key the target cannot resolve.
  const emptyKeys = path.join(state.root, "empty-keys");
  mkdirSync(emptyKeys, { recursive: true });
  const unavailableKey = await restorePan462BackupV1({ ...base, backupDir: state.backupDir, target: { ...target, keyStore: emptyKeys } });
  assert.equal(unavailableKey.code, "KEY_UNAVAILABLE");
});

test("PAN462-AC03 positive: restored copy disables real external effects and refuses an attempted controlled outbound operation", async () => {
  const restored = state.restore.restored;
  assert.equal(restored.externalEffects, "DISABLED");
  const attempt = await attemptControlledEffectV1({
    restored,
    writerAuthority: { epoch: restored.writerAuthority.epoch, revoked: false },
    request: { operation: "outbound:controlled-test", idempotencyKey: "eff:1" },
  });
  assert.equal(attempt.outcome, "DENIED");
  assert.equal(attempt.code, "EXTERNAL_EFFECTS_DISABLED");
});

test("PAN462-AC03 negative: obsolete writer authority and effect replay are refused (no reactivation)", async () => {
  const restored = state.restore.restored;
  // The pre-backup (obsolete) writer authority epoch is fenced.
  const stale = await attemptControlledEffectV1({
    restored,
    writerAuthority: { epoch: restored.writerAuthority.epoch - 1, revoked: false },
    request: { operation: "outbound:controlled-test", idempotencyKey: "eff:2" },
  });
  assert.equal(stale.code, "STALE_WRITER_AUTHORITY");
  // An explicitly revoked authority is refused.
  const revoked = await attemptControlledEffectV1({
    restored,
    writerAuthority: { epoch: restored.writerAuthority.epoch, revoked: true },
    request: { operation: "outbound:controlled-test", idempotencyKey: "eff:3" },
  });
  assert.equal(revoked.code, "STALE_WRITER_AUTHORITY");
  // An effect identity already recorded in the restored copy is not replayed.
  const replay = await attemptControlledEffectV1({
    restored: { ...restored, effects: { recorded: ["eff:4"] } },
    writerAuthority: { epoch: restored.writerAuthority.epoch, revoked: false },
    request: { operation: "outbound:controlled-test", idempotencyKey: "eff:4" },
  });
  assert.equal(replay.code, "EFFECT_REPLAY_DENIED");
  // The restored copy carries the revoked predecessor epoch.
  assert.equal(restored.writerAuthority.predecessorRevoked, true);
  assert.equal(restored.writerAuthority.predecessorEpoch, state.backup.manifest.writerAuthority.epoch);
});

test("PAN462-AC04 positive: a standalone read-only recovery diagnosis distinguishes local copy, independent backup and verified restore", () => {
  // VERIFIED_RESTORE is earned by the independently re-checked native readback
  // receipt produced by readRestoredInstallationV1 — not a caller boolean.
  const diagnosis = diagnoseRecoveryV1({
    backup: state.backup, restoreReadback: state.read.readback, nowMs: NOW_MS + 100,
  });
  assert.equal(diagnosis.outcome, "DIAGNOSED");
  assert.equal(diagnosis.readOnly, true);
  // A local copy on the same controller is LOCAL_COPY, never independent.
  assert.ok(diagnosis.classes.includes("LOCAL_COPY"));
  assert.ok(!diagnosis.classes.includes("INDEPENDENT_BACKUP"));
  assert.equal(state.read.readback.doctorStatus, "PASS");
  assert.equal(state.read.readback.observedConfigDigest, state.backup.manifest.captures.config.sha256);
  // A read-back restore is VERIFIED_RESTORE; local copy is not offhost proof.
  assert.ok(diagnosis.classes.includes("VERIFIED_RESTORE"));
  // VERIFIED_RESTORE is issuer-bound: the receipt carries the module issuer
  // identity and a seal only the actual native readback could produce.
  assert.equal(state.read.readback.issuerSchemaVersion, PAN462_READBACK_ISSUER_SCHEMA_V1);
  assert.equal(state.read.readback.issuerId, diagnosis.classification.readbackIssuer);
  assert.match(state.read.readback.readbackDigest, /^[a-f0-9]{64}$/);
  assert.equal(state.read.readback.archiveDigest, state.backup.archiveDigest);
  assert.equal(diagnosis.classification.readbackProvenance, "ISSUER_BOUND_NATIVE_READBACK");
  assert.ok(diagnosis.heldClaims.some((claim) => claim.startsWith("INDEPENDENT_BACKUP")));
  assert.ok(diagnosis.heldClaims.some((claim) => claim.startsWith("PRODUCTION_RTO")));
  assert.ok(Number.isInteger(diagnosis.measurements.backup.durationMs));
  assert.ok(diagnosis.measurements.totalBytes > 0);
  // The classes are a subset of the closed vocabulary.
  assert.ok(diagnosis.classes.every((entry) => DIAGNOSIS_CLASSES_V1.includes(entry)));
});

test("PAN462-AC04 negative: an unverified restore is not classed as VERIFIED_RESTORE and missing inputs are refused", () => {
  // A tampered readback receipt (digest no longer self-consistent) is not evidence.
  const tampered = diagnoseRecoveryV1({
    backup: state.backup, restoreReadback: { ...state.read.readback, readbackDigest: "0".repeat(64) },
    nowMs: NOW_MS + 101,
  });
  assert.ok(tampered.classes.includes("LOCAL_COPY"));
  assert.ok(!tampered.classes.includes("VERIFIED_RESTORE"));
  // No readback at all: only LOCAL_COPY, nothing inferred.
  const missing = diagnoseRecoveryV1({ backup: state.backup, nowMs: NOW_MS });
  assert.equal(missing.outcome, "DIAGNOSED");
  assert.deepEqual(missing.classes, ["LOCAL_COPY"]);
  // A boolean-only diagnosis-style input is refused outright (closed shape).
  const none = diagnoseRecoveryV1({ nowMs: NOW_MS });
  assert.equal(none.outcome, "DENIED");
  assert.equal(none.code, "INPUT_REQUIRED");
});

test("PAN462 boundary: malformed inputs are refused with exact codes and the published schema validates the actual archive", async () => {
  // A caller-rehashed installation digest is not an identity.
  const badInstallation = { ...state.installation, installationDigest: "f".repeat(64) };
  const bad = await createPan462BackupV1({
    installation: badInstallation,
    source: { root: state.installRoot, database: { client: state.source.admin, name: PG_DATABASE } },
    backupDir: path.join(state.root, "backup-bad"), ownedRoot: state.root, now: NOW, nowMs: NOW_MS,
  });
  assert.equal(bad.code, "INSTALLATION_MALFORMED");
  // A declared config digest that does not bind the captured config is refused.
  const misleadingInstallation = makeOwnedInstallation({
    ...JSON.parse(fix("installation-content-v1.json")), expectedConfigDigest: "0".repeat(64),
  });
  const mismatched = await createPan462BackupV1({
    installation: misleadingInstallation,
    source: { root: state.installRoot, database: { client: state.source.admin, name: PG_DATABASE } },
    backupDir: path.join(state.root, "backup-mismatch"), ownedRoot: state.root, now: NOW, nowMs: NOW_MS,
  });
  assert.equal(mismatched.code, "DECLARED_OBSERVED_CONFIG_BINDING_MISMATCH");
  // A restore into a non-distinct target is refused.
  const sameTarget = await restorePan462BackupV1({
    backupDir: state.backupDir, targetRoot: state.installRoot, ownedRoot: state.root, expectedVersion: EXPECTED.restoredVersion,
    target: { root: state.installRoot, database: { client: state.target.client } }, now: NOW, nowMs: NOW_MS,
  });
  assert.equal(sameTarget.code, "TARGET_NOT_DISTINCT");

  // The published schema validates the actual backup archive.
  const schema = JSON.parse(readFileSync(`${ROOT}/schemas/contracts/pan462-native-backup-restore-v1.schema.json`, "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  assert.equal(validate(state.backup.manifest), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...state.backup.manifest, unapprovedField: "x" }), false);
});

test("PAN462: the closed vocabulary exports are code-owned and never widened", () => {
  assert.deepEqual(DIAGNOSIS_CLASSES_V1, ["LOCAL_COPY", "INDEPENDENT_BACKUP", "VERIFIED_RESTORE"]);
});

// ---------------------------------------------------------------------------
// Correction 2026-09-28 — the three review blockers, as named tests.
// ---------------------------------------------------------------------------

test("PAN462-CORRECTION-AC02: a mutated restored config is NOT a verified restoration and the doctor is not PASS", async () => {
  const configPath = path.join(state.targetRoot, "config", "config.json");
  const original = readFileSync(configPath);
  try {
    writeFileSync(configPath, Buffer.concat([original, Buffer.from("\n")]));
    const read = await readRestoredInstallationV1({
      restored: state.restore.restored,
      target: { database: { host: "127.0.0.1", port: TARGET_PORT, name: TARGET_DB, user: TARGET_RO, password: TARGET_RO_PW } },
      requiredServiceIds: ["api"], nowMs: NOW_MS + 300,
    });
    assert.notEqual(read.outcome, "READ", JSON.stringify(read).slice(0, 400));
    assert.equal(read.code, "RESTORED_CONFIG_MISMATCH");
    assert.equal(read.doctor.status, "FAIL");
    assert.notEqual(read.observations.observedConfigDigest, state.restore.restored.config.sha256);
    assert.equal(read.readback, null);
  } finally {
    writeFileSync(configPath, original);
  }
});

test("PAN462-CORRECTION-AC02: a deleted restored config is NOT a verified restoration and the doctor is not PASS", async () => {
  const configPath = path.join(state.targetRoot, "config", "config.json");
  const original = readFileSync(configPath);
  try {
    rmSync(configPath);
    const read = await readRestoredInstallationV1({
      restored: state.restore.restored,
      target: { database: { host: "127.0.0.1", port: TARGET_PORT, name: TARGET_DB, user: TARGET_RO, password: TARGET_RO_PW } },
      requiredServiceIds: ["api"], nowMs: NOW_MS + 301,
    });
    assert.notEqual(read.outcome, "READ");
    assert.equal(read.code, "RESTORED_CONFIG_MISSING");
    assert.equal(read.doctor.status, "FAIL");
    assert.equal(read.observations.observedConfigDigest, null);
  } finally {
    writeFileSync(configPath, original);
  }
});

test("PAN462-CORRECTION-AC02: a mutated restored file is NOT a verified restoration and the doctor is not PASS", async () => {
  const filePath = path.join(state.targetRoot, "files", "content-note-v1.txt");
  const original = readFileSync(filePath);
  try {
    writeFileSync(filePath, Buffer.concat([original, Buffer.from("tampered")]));
    const read = await readRestoredInstallationV1({
      restored: state.restore.restored,
      target: { database: { host: "127.0.0.1", port: TARGET_PORT, name: TARGET_DB, user: TARGET_RO, password: TARGET_RO_PW } },
      requiredServiceIds: ["api"], nowMs: NOW_MS + 302,
    });
    assert.notEqual(read.outcome, "READ");
    assert.equal(read.code, "RESTORED_FILE_MISMATCH");
    assert.equal(read.readback, null);
  } finally {
    writeFileSync(filePath, original);
  }
});

test("PAN462-CORRECTION-AC02: the restored service observation comes from the target state, never the requested list", async () => {
  const statePath = path.join(state.targetRoot, "installation-state.json");
  const original = readFileSync(statePath);
  try {
    const mutated = JSON.parse(original.toString("utf8"));
    mutated.services = [{ serviceId: "api", state: "STOPPED", health: "UNHEALTHY" }];
    writeFileSync(statePath, `${JSON.stringify(mutated)}\n`);
    const read = await readRestoredInstallationV1({
      restored: state.restore.restored,
      target: { database: { host: "127.0.0.1", port: TARGET_PORT, name: TARGET_DB, user: TARGET_RO, password: TARGET_RO_PW } },
      requiredServiceIds: ["api"], nowMs: NOW_MS + 303,
    });
    assert.notEqual(read.outcome, "READ");
    assert.equal(read.doctor.status, "FAIL");
  } finally {
    writeFileSync(statePath, original);
  }
});

test("PAN462-CORRECTION-AC04: caller booleans on a LOCAL_COPY manifest mint no class", () => {
  const reviewReproducer = diagnoseRecoveryV1({
    backup: { manifest: { backupClass: "LOCAL_COPY" }, boundary: BACKUP_BOUNDARY_V1, measurements: { totalBytes: 7 } },
    restored: { verified: true, measurements: {} },
    diagnosis: { ownsIndependentDestination: true },
    nowMs: 1,
  });
  assert.equal(reviewReproducer.outcome, "DENIED");
  assert.equal(reviewReproducer.code, "DIAGNOSIS_INPUT_MALFORMED");
  // Even on the accepted closed shape, a LOCAL_COPY manifest never yields
  // INDEPENDENT_BACKUP and an absent readback receipt never yields VERIFIED_RESTORE.
  const held = diagnoseRecoveryV1({
    backup: { manifest: { backupClass: "LOCAL_COPY" }, boundary: BACKUP_BOUNDARY_V1, measurements: { totalBytes: 7 } },
    destinationReceipt: { independent: true, authorizedInfrastructure: true },
    nowMs: 1,
  });
  assert.equal(held.outcome, "DIAGNOSED");
  assert.deepEqual(held.classes, ["LOCAL_COPY"]);
  assert.ok(held.heldClaims.some((claim) => claim.startsWith("INDEPENDENT_BACKUP")));
});

test("PAN462-CORRECTION-AC04: caller-self-rehashed readback and destination receipts mint no class", () => {
  // The exact forged shapes an independent reviewer reproduced: caller-authored
  // content with caller-recomputed sha256. A checksum demonstrates consistency,
  // not an authorized observation — so neither forged receipt may promote.
  const installationDigest = "b".repeat(64);
  const configDigest = "c".repeat(64);
  const archiveDigest = "a".repeat(64);
  const backup = {
    manifest: {
      backupClass: "LOCAL_COPY", installationDigest,
      captures: { config: { sha256: configDigest }, files: [] },
    },
    measurements: { totalBytes: 7 },
  };
  const readbackContent = {
    schemaVersion: "pansphaira.pan462/restore-readback/v1",
    outcome: "READ", doctorStatus: "PASS",
    installationDigest, observedConfigDigest: configDigest, observedFiles: [],
    observedAuthorityEpoch: 999, observedExternalEffects: "ENABLED",
    targetRoot: "/unobserved", observedAtMs: 1,
  };
  const forgedReadback = { ...readbackContent, readbackDigest: sha256Hex(canonicalJson(readbackContent)) };
  const forgedRestore = diagnoseRecoveryV1({ backup, restoreReadback: forgedReadback, nowMs: 1 });
  assert.equal(forgedRestore.outcome, "DIAGNOSED");
  assert.ok(!forgedRestore.classes.includes("VERIFIED_RESTORE"), JSON.stringify(forgedRestore.classes));
  assert.ok(forgedRestore.classes.includes("LOCAL_COPY"));
  assert.equal(forgedRestore.classification.restoreReadbackReceiptVerified, false);

  const independentBackup = {
    ...backup, archiveDigest,
    manifest: { ...backup.manifest, backupClass: "INDEPENDENT_BACKUP" },
  };
  const destinationContent = {
    schemaVersion: "pansphaira.pan462/destination-receipt/v1",
    independent: true, authorizedInfrastructure: true,
    destinationId: "caller:fake", archiveDigest,
  };
  const forgedDestination = diagnoseRecoveryV1({
    backup: independentBackup,
    destinationReceipt: { ...destinationContent, receiptDigest: sha256Hex(canonicalJson(destinationContent)) },
    nowMs: 1,
  });
  assert.equal(forgedDestination.outcome, "DIAGNOSED");
  assert.ok(!forgedDestination.classes.includes("INDEPENDENT_BACKUP"), JSON.stringify(forgedDestination.classes));
  assert.deepEqual(forgedDestination.classes, []);
  assert.equal(forgedDestination.classification.independentDestinationReceiptVerified, false);
  assert.equal(forgedDestination.classification.independentBackupHeld, true);
  assert.ok(forgedDestination.heldClaims.some((claim) => claim.startsWith("INDEPENDENT_BACKUP")));
});

test("PAN462-CORRECTION-AC04: a genuine issuer seal is bound to its own archive and state", () => {
  // The real native readback receipt is genuine (VERIFIED_RESTORE) …
  const real = diagnoseRecoveryV1({ backup: state.backup, restoreReadback: state.read.readback, nowMs: NOW_MS + 102 });
  assert.ok(real.classes.includes("VERIFIED_RESTORE"));

  // … but replaying it against a DIFFERENT archive gains nothing.
  const otherArchive = {
    ...state.backup,
    archiveDigest: "f".repeat(64),
    manifest: { ...state.backup.manifest, archiveDigest: "f".repeat(64) },
  };
  const replayed = diagnoseRecoveryV1({ backup: otherArchive, restoreReadback: state.read.readback, nowMs: NOW_MS + 103 });
  assert.ok(!replayed.classes.includes("VERIFIED_RESTORE"));

  // A copied/modified observation breaks the issuer seal.
  const modified = { ...state.read.readback, observedExternalEffects: "ENABLED" };
  const tampered = diagnoseRecoveryV1({ backup: state.backup, restoreReadback: modified, nowMs: NOW_MS + 104 });
  assert.ok(!tampered.classes.includes("VERIFIED_RESTORE"));

  // A foreign issuer identity is not accepted.
  const foreign = { ...state.read.readback, issuerId: "issuer:pan462-readback-deadbeef" };
  const foreignIssuer = diagnoseRecoveryV1({ backup: state.backup, restoreReadback: foreign, nowMs: NOW_MS + 105 });
  assert.ok(!foreignIssuer.classes.includes("VERIFIED_RESTORE"));
});

test("PAN462-CORRECTION-GUARD: a symlinked backup root is refused and unrelated contents are preserved", async () => {
  const unrelated = path.join(state.root, "unrelated-contents");
  mkdirSync(unrelated, { recursive: true });
  writeFileSync(path.join(unrelated, "sentinel.txt"), "do-not-delete");
  const linkDir = path.join(state.root, "backup-symlink");
  rmSync(linkDir, { recursive: true, force: true });
  symlinkSync(unrelated, linkDir);
  const refused = await createPan462BackupV1({
    installation: state.installation,
    source: { root: state.installRoot, database: { client: state.source.admin, name: PG_DATABASE } },
    backupDir: linkDir, ownedRoot: state.root, now: NOW, nowMs: NOW_MS,
  });
  assert.equal(refused.outcome, "DENIED");
  assert.equal(refused.code, "DESTINATION_IS_SYMLINK");
  assert.equal(readFileSync(path.join(unrelated, "sentinel.txt"), "utf8"), "do-not-delete");
});

test("PAN462-CORRECTION-GUARD: unowned, unsafe and non-distinct roots are refused before removal", async () => {
  const outside = mkdtempSync(path.join(os.tmpdir(), "pan462-outside-"));
  const outsideBackup = path.join(outside, "backup");
  mkdirSync(outsideBackup, { recursive: true });
  writeFileSync(path.join(outsideBackup, "other.txt"), "keep");
  // Not inside the declared owned root.
  const notOwned = await createPan462BackupV1({
    installation: state.installation,
    source: { root: state.installRoot, database: { client: state.source.admin, name: PG_DATABASE } },
    backupDir: outsideBackup, ownedRoot: state.root, now: NOW, nowMs: NOW_MS,
  });
  assert.equal(notOwned.code, "DESTINATION_NOT_OWNED");
  assert.equal(readFileSync(path.join(outsideBackup, "other.txt"), "utf8"), "keep");
  // Missing owned root.
  const noRoot = await createPan462BackupV1({
    installation: state.installation,
    source: { root: state.installRoot, database: { client: state.source.admin, name: PG_DATABASE } },
    backupDir: path.join(state.root, "backup-noroot"), now: NOW, nowMs: NOW_MS,
  });
  assert.equal(noRoot.code, "OWNED_ROOT_REQUIRED");
  // Unsafe (resolution-repairing) path.
  const unsafe = await createPan462BackupV1({
    installation: state.installation,
    source: { root: state.installRoot, database: { client: state.source.admin, name: PG_DATABASE } },
    backupDir: `${state.root}/../${path.basename(state.root)}/backup-unsafe`, ownedRoot: state.root, now: NOW, nowMs: NOW_MS,
  });
  assert.equal(unsafe.code, "DESTINATION_UNSAFE_PATH");
  // A restore root that is not distinct from the backup root is refused.
  const notDistinct = await restorePan462BackupV1({
    backupDir: state.backupDir, targetRoot: state.backupDir, ownedRoot: state.root,
    target: { root: state.backupDir, database: { client: state.target.client } },
    expectedVersion: EXPECTED.restoredVersion, now: NOW, nowMs: NOW_MS,
  });
  assert.equal(notDistinct.code, "DESTINATION_NOT_DISTINCT");
  rmSync(outside, { recursive: true, force: true });
});

// Parent independent AC04 counterexample. Product bytes unchanged.
test("PAN462-AC04-MEASUREMENT-REPRO: duration is operation elapsed, not fixture age", () => {
  const observations = {
    backup: { reportedMs: state.backup.measurements.durationMs, observedOuterMs: state.probeBackupElapsed, record: state.backup.measurements },
    restore: { reportedMs: state.restore.measurements.durationMs, observedOuterMs: state.probeRestoreElapsed, record: state.restore.measurements },
    diagnosis: diagnoseRecoveryV1({backup: state.backup, restoreReadback: state.read.readback, nowMs: NOW_MS + 500}).measurements,
  };
  console.log("PAN462_MEASUREMENT_OBSERVATION " + JSON.stringify(observations));
  for (const [name, record] of Object.entries(observations).filter(([name]) => name !== 'diagnosis')) {
    assert.ok(record.reportedMs <= record.observedOuterMs + 20,
      `${name}: reported=${record.reportedMs}ms outer=${record.observedOuterMs}ms; fixed business nowMs must not become the measured operation start`);
  }
});

// Correction 2026-09-28 (AC04 measured duration): the measured operation time is
// taken on the monotonic clock across the real invocation boundaries. The
// caller business/checkpoint timestamp (`nowMs`) stays semantically separate and
// must never become the measured start. These are REAL backup/restore operations
// (real native PostgreSQL source/target, real disk, real released product paths)
// driven with a HISTORICAL business time and a FUTURE business time; neither may
// fabricate a large duration or clamp a real nonzero operation to zero.
function timingTargetRoot(tag) {
  const targetRoot = path.join(state.root, `target-timing-${tag}`);
  const keyStore = path.join(state.root, `target-keys-timing-${tag}`);
  mkdirSync(keyStore, { recursive: true });
  writeFileSync(path.join(keyStore, "key:cfg-main.ref"), fix("key-ref-v1.txt"));
  return { targetRoot, keyStore };
}

test("PAN462-AC04-TIMING-HISTORICAL: a historical business timestamp does not become the measured operation start", async () => {
  const past = Date.UTC(2020, 0, 1, 0, 0, 0); // historical business time (~years old)
  const pastIso = "2020-01-01T00:00:00Z";
  const backupDir = path.join(state.root, "backup-timing-historical");
  const { targetRoot, keyStore } = timingTargetRoot("historical");

  const bBefore = performance.now();
  const backup = await createPan462BackupV1({
    installation: state.installation,
    source: { root: state.installRoot, database: { client: state.source.admin, name: PG_DATABASE } },
    backupDir, ownedRoot: state.root, now: pastIso, nowMs: past,
  });
  const bOuterMs = performance.now() - bBefore;
  assert.equal(backup.outcome, "BACKED_UP", JSON.stringify(backup));

  const rBefore = performance.now();
  const restore = await restorePan462BackupV1({
    backupDir, targetRoot, ownedRoot: state.root, expectedVersion: EXPECTED.restoredVersion,
    target: {
      root: targetRoot, keyStore,
      database: { client: state.target.client, host: "127.0.0.1", port: TARGET_PORT, name: TARGET_DB, user: TARGET_ADMIN, password: TARGET_ADMIN_PW },
    },
    now: pastIso, nowMs: past + 1,
  });
  const rOuterMs = performance.now() - rBefore;
  assert.equal(restore.outcome, "RESTORED", JSON.stringify(restore));

  for (const [label, record, outerMs, nowMs] of [
    ["backup", backup.measurements, bOuterMs, past],
    ["restore", restore.measurements, rOuterMs, past + 1],
  ]) {
    assert.ok(outerMs > 0, `${label}: the real operation must be a real nonzero operation`);
    // A real nonzero operation must not be clamped to zero ...
    assert.ok(Number.isInteger(record.durationMs) && record.durationMs >= (outerMs >= 1 ? 1 : 0),
      `${label}: a real nonzero operation must not be clamped to zero (recorded=${record.durationMs}ms outer=${outerMs}ms)`);
    // ... and must not fabricate a large duration from the (historical) business
    // timestamp: the recorded duration is bounded by the real operation elapsed.
    assert.ok(record.durationMs <= outerMs + 20,
      `${label}: recorded=${record.durationMs}ms outer=${outerMs}ms; a historical business nowMs must not fabricate a large duration`);
    // Business/checkpoint timestamps stay semantically separate: the measured
    // start is the real wall-clock start, never the business nowMs.
    assert.notEqual(record.startedAtMs, nowMs, `${label}: measured start must not be the business nowMs`);
    assert.ok(Math.abs(record.completedAtMs - Date.now()) < 60_000, `${label}: completedAtMs must be the real observation timestamp`);
  }
});

test("PAN462-AC04-TIMING-FUTURE: a future business timestamp clamps no real operation to zero", async () => {
  const future = Date.now() + 3_600_000; // future business time (1 hour ahead)
  const futureIso = new Date(future).toISOString();
  const backupDir = path.join(state.root, "backup-timing-future");
  const { targetRoot, keyStore } = timingTargetRoot("future");

  const bBefore = performance.now();
  const backup = await createPan462BackupV1({
    installation: state.installation,
    source: { root: state.installRoot, database: { client: state.source.admin, name: PG_DATABASE } },
    backupDir, ownedRoot: state.root, now: futureIso, nowMs: future,
  });
  const bOuterMs = performance.now() - bBefore;
  assert.equal(backup.outcome, "BACKED_UP", JSON.stringify(backup));

  const rBefore = performance.now();
  const restore = await restorePan462BackupV1({
    backupDir, targetRoot, ownedRoot: state.root, expectedVersion: EXPECTED.restoredVersion,
    target: {
      root: targetRoot, keyStore,
      database: { client: state.target.client, host: "127.0.0.1", port: TARGET_PORT, name: TARGET_DB, user: TARGET_ADMIN, password: TARGET_ADMIN_PW },
    },
    now: futureIso, nowMs: future + 1,
  });
  const rOuterMs = performance.now() - rBefore;
  assert.equal(restore.outcome, "RESTORED", JSON.stringify(restore));

  for (const [label, record, outerMs, nowMs] of [
    ["backup", backup.measurements, bOuterMs, future],
    ["restore", restore.measurements, rOuterMs, future + 1],
  ]) {
    assert.ok(outerMs > 0, `${label}: the real operation must be a real nonzero operation`);
    // With a FUTURE business timestamp the old (completedAt - businessNow) form
    // clamped a real nonzero operation to zero; the measured duration must be a
    // real elapsed, not zero and not a fabricated large number.
    assert.ok(Number.isInteger(record.durationMs) && record.durationMs >= (outerMs >= 1 ? 1 : 0),
      `${label}: a real nonzero operation must not be clamped to zero (recorded=${record.durationMs}ms outer=${outerMs}ms)`);
    assert.ok(record.durationMs <= outerMs + 20,
      `${label}: recorded=${record.durationMs}ms outer=${outerMs}ms; a future business nowMs must not fabricate a large duration`);
    assert.notEqual(record.startedAtMs, nowMs, `${label}: measured start must not be the business nowMs`);
    assert.ok(Math.abs(record.completedAtMs - Date.now()) < 60_000, `${label}: completedAtMs must be the real observation timestamp`);
  }
});

// INDEPENDENT-CLOCK-STEP: the two wall observations may step while the actual
// native operation's monotonic elapsed remains positive. This test intercepts
// ONLY the two Date.now calls in the PAN462 backup measurement lines.
test("PAN462-AC04-INDEPENDENT-CLOCK-STEP: wall adjustment cannot clamp a positive measured operation", async () => {
  const realNow = Date.now;
  const wall = realNow();
  let completedHits = 0, derivedStartHits = 0;
  const backupDir = path.join(state.root, "backup-timing-independent-clock-step");
  let result, elapsed;
  try {
    Date.now = () => {
      const stack = new Error().stack ?? "";
      if (stack.includes("native-backup-restore.mjs:691")) { completedHits++; return wall; }
      if (stack.includes("native-backup-restore.mjs:702")) { derivedStartHits++; return wall + 1000; }
      return realNow();
    };
    const began = performance.now();
    result = await createPan462BackupV1({
      installation: state.installation,
      source: { root: state.installRoot, database: { client: state.source.admin, name: PG_DATABASE } },
      backupDir, ownedRoot: state.root, now: NOW, nowMs: NOW_MS,
    });
    elapsed = performance.now() - began;
  } finally { Date.now = realNow; }
  assert.equal(result.outcome, "BACKED_UP", JSON.stringify(result));
  assert.equal(completedHits, 1, "intercepted exactly the native completed wall call");
  assert.equal(derivedStartHits, 1, "intercepted exactly the native derived-start wall call");
  console.log("PAN462_INDEPENDENT_CLOCK_STEP " + JSON.stringify({elapsed, measurements:result.measurements}));
  assert.ok(elapsed >= 1, "real PostgreSQL backup operation elapsed nonzero time");
  assert.ok(result.measurements.durationMs >= 1, "monotonic operation elapsed cannot clamp to zero under wall-clock step");
});

// Independent AC04 companion to the backup clock-step regression: the released
// restore path has the same two-wall-observation structure. Real native target.
test("PAN462-AC04-INDEPENDENT-RESTORE-CLOCK-STEP: restored operation duration remains measured across wall adjustment", async () => {
  const realNow = Date.now;
  const wall = realNow();
  let completedHits = 0, derivedStartHits = 0;
  const { targetRoot, keyStore } = timingTargetRoot("independent-restore-clock-step");
  let result, elapsed;
  try {
    Date.now = () => {
      const stack = new Error().stack ?? "";
      if (stack.includes("native-backup-restore.mjs:880")) { completedHits++; return wall; }
      if (stack.includes("native-backup-restore.mjs:908")) { derivedStartHits++; return wall + 1000; }
      return realNow();
    };
    const began = performance.now();
    result = await restorePan462BackupV1({
      backupDir: state.backupDir, targetRoot, ownedRoot: state.root,
      expectedVersion: EXPECTED.restoredVersion,
      target: {
        root: targetRoot, keyStore,
        database: { client: state.target.client, host: "127.0.0.1", port: TARGET_PORT, name: TARGET_DB, user: TARGET_ADMIN, password: TARGET_ADMIN_PW },
      },
      now: NOW, nowMs: NOW_MS + 1,
    });
    elapsed = performance.now() - began;
  } finally { Date.now = realNow; }
  assert.equal(result.outcome, "RESTORED", JSON.stringify(result));
  assert.equal(completedHits, 1, "intercepted exactly the native completed wall call");
  assert.equal(derivedStartHits, 1, "intercepted exactly the native derived-start wall call");
  console.log("PAN462_INDEPENDENT_RESTORE_CLOCK_STEP " + JSON.stringify({elapsed, measurements: result.measurements}));
  assert.ok(elapsed >= 1, "real PostgreSQL restore operation elapsed nonzero time");
  assert.ok(result.measurements.durationMs >= 1, "monotonic restore elapsed cannot clamp to zero under wall-clock step");
});
