# PAN462 — native backup/restore of a container-owned synthetic installation

Status: `LOCAL_SYNTHETIC_NATIVE_BACKUP_RESTORE_IMPLEMENTED`

This is the bounded LIFE-02 slice (parent epic #458): a **native backup and
restore path** for **one strictly container-owned synthetic installation**
(owned database, files, configuration and needed key references). It captures
those owned stores at a **consistent boundary**, restores them into a
**distinct isolated target** running at a **matching executable version**, reads
the restored objects back through the **actual native product paths**, and
proves that the restored copy cannot replay external effects or revive obsolete
writer authority.

It is a local synthetic capability over the **released** storage, checkpoint and
observer contracts. It is **not** production readiness, **not** a disaster
recovery service, and **not** an offhost/independent destination.

## Reused actual modules (released)

| Foundation | PAN462 use | Classification |
| --- | --- | --- |
| `packages/contracts/src/update-doctor.ts` `adaptComposeDoctorObservationV1` / `runFixtureDoctorV1` | The released read-only observer + doctor report used to read the **restored installation state** back | REUSE |
| `packages/contracts/src/update-migration-checkpoint.ts` `buildUpdateMigrationCheckpointV1` / `verifyUpdateMigrationCheckpointV1` | The released checkpoint contract that binds the **consistent backup boundary** and re-verifies it against an independent context | REUSE |
| `packages/contracts/src/update-doctor.ts` `updateDoctorContractDigest` + `canonicalJson` | Canonical serialisation and the installation identity digest | REUSE |
| `packages/knowledge-solution/src/postgres-source.ts` `readMarginContextFromPostgresV1` | The released **real read-only PostgreSQL product connector** used to read the restored database objects | REUSE |
| `packages/knowledge-solution/src/pg-harness.ts` (`embedded-postgres` + real `pg`) | The **actual supported local fixture storage path** (a real PostgreSQL server, real wire protocol) | REUSE |

No second doctor, installer, updater, database or storage mechanism is
introduced. The backup/restore is a thin native composition over the released
storage, checkpoint and observer surfaces, and it is exercised against a **real**
local PostgreSQL server (never a mock replacing the affected adapter).

## Consistent backup boundary (AC01)

- The owned **DATABASE** is captured in ONE `REPEATABLE READ / READ ONLY`
  transaction, so every table is read from the same MVCC snapshot rather than a
  per-table race.
- The owned **FILES** are captured byte for byte with a per-file `sha256`.
- The owned **CONFIGURATION** is captured with its digest, and must equal the
  installation's declared expected config digest (one declared source of truth).
- Only **key REFERENCES** are captured — a reference path and a `REDACTED`
  marker. A secret value is never exported, and a value-shaped reference is
  refused at capture.
- The released `buildUpdateMigrationCheckpointV1` binds the boundary and
  `verifyUpdateMigrationCheckpointV1` re-verifies it against an independent
  context, so the boundary is a real `CHECKPOINT_RECORDED` record, not a claim.
- The archive digest is the canonical digest of the manifest; every captured
  object carries its own digest.

## Distinct isolated restore target (AC01)

`restorePan462BackupV1` refuses a target that is not distinct from the source
installation (`TARGET_NOT_DISTINCT`), requires the archive's version to equal the
requested **matching executable version** (`WRONG_VERSION`), restores the files,
configuration and database into a distinct target, and creates the restored copy
with **external effects disabled** and a **new writer-authority epoch**.

## Reading the restored objects through native product paths (AC02)

The restored database objects are read back through the released read-only
PostgreSQL connector (`readMarginContextFromPostgresV1`) over the wire protocol
of the **distinct target server**, and the restored installation state is read
back through the released doctor. Independent expectations (row count, order,
threshold) come from a committed fixture, not from the adapter.

**Correction 2026-09-28 — the readback observes the target, it does not restate
the request.** `readRestoredInstallationV1` reads the *actual* restored target
from disk, read-only: the config bytes (`config/config.json`), every restored
file, the effect policy, the writer-authority fence and the restored copy's
persisted installation state (`installation-state.json`). The observed config and
file digests are computed from those bytes and compared to the archive; the
released doctor is fed the *observed* `observedConfigDigest`, the *observed*
service records and the *observed* lock digest. Nothing is copied from the
restored receipt and no service state is inferred from `requiredServiceIds`. A
READ (and its readback receipt) is returned only when the released doctor is
`PASS` **and** every observed value matches the archive; a mutated or deleted
config/file/authority/effect-policy instead yields `DENIED` with an exact code
(`RESTORED_CONFIG_MISMATCH`, `RESTORED_CONFIG_MISSING`, `RESTORED_FILE_MISMATCH`,
`RESTORED_FILE_MISSING`, `RESTORED_AUTHORITY_MISMATCH`,
`RESTORED_EFFECT_POLICY_MALFORMED`, `RESTORED_SERVICE_STATE_UNAVAILABLE`) and a
non-`PASS` doctor report. The restored service records are the restored copy's
persisted declared state observed from disk — not a live process probe — and are
stated here as a limit, not a production runtime claim.

Every boundary refuses composition:

| Condition | Result |
| --- | --- |
| missing store | `DENIED / MISSING_STORE` |
| wrong version | `DENIED / WRONG_VERSION` |
| corrupt archive (a single flipped byte) | `DENIED / CORRUPT_ARCHIVE` |
| unavailable required key reference | `DENIED / KEY_UNAVAILABLE` |

## External effects and writer authority (AC03)

- The restored copy is created with `externalEffects: DISABLED`. A controlled
  outbound operation attempt is refused at the effect boundary
  (`EXTERNAL_EFFECTS_DISABLED`).
- The restored copy carries a **new writer-authority epoch**; the pre-backup
  epoch is recorded as the revoked predecessor. Presenting the obsolete epoch
  (`STALE_WRITER_AUTHORITY`) or an explicitly revoked authority is refused.
- An effect identity already recorded in the restored copy is not replayed
  (`EFFECT_REPLAY_DENIED`).

## Standalone read-only recovery diagnosis (AC04)

`diagnoseRecoveryV1` is a standalone, read-only diagnosis that distinguishes
`LOCAL_COPY`, `INDEPENDENT_BACKUP` and `VERIFIED_RESTORE`, and records the
**measured** duration and data-size observations actually taken. It holds the
`INDEPENDENT_BACKUP` and `PRODUCTION_RTO` claims explicitly: a local copy on the
same controller as the source is **not** offhost or disaster proof.

**Correction 2026-09-28 — caller booleans are not evidence.** The diagnosis has a
closed input shape (`backup`, `restoreReadback`, `destinationReceipt`, `nowMs`);
any other field — e.g. a caller `ownsIndependentDestination` or a bare
`restored.verified` — is refused (`DIAGNOSIS_INPUT_MALFORMED`). `VERIFIED_RESTORE`
is earned only by the *independently re-checked native readback receipt* produced
by `readRestoredInstallationV1` (`outcome: READ`, `doctorStatus: PASS`, self-
consistent `readbackDigest`, and observed config/file digests that re-bind to the
same archive). `INDEPENDENT_BACKUP` requires both an `INDEPENDENT_BACKUP` manifest
and a source-bound, authorized destination receipt that binds the same
`archiveDigest`; this slice never mints one, so an unqualified destination class
stays unavailable/held.

## Owned/disposable destination guard (correction 2026-09-28)

Destructive removal of a backup or restore root is allowed only inside an
explicit, owned scratch root. `createPan462BackupV1` and
`restorePan462BackupV1` take an `ownedRoot`; before any `rmSync` the target must
be an absolute, normalized **strict descendant** of `ownedRoot` (`DESTINATION_NOT_OWNED`),
must not be a filesystem root or a resolution-repairing path such as one
containing `..` (`DESTINATION_UNSAFE_PATH`), must not be a symlink or contain a
symlinked component (`DESTINATION_IS_SYMLINK`), must be distinct from the source
and sibling roots (`DESTINATION_NOT_DISTINCT`), and `ownedRoot` itself must be a
real existing directory (`OWNED_ROOT_REQUIRED`). A refusal happens *before* any
destructive write, so unrelated contents are never touched.

## Public entry points

- `makeOwnedInstallation(input)` — build a valid owned-installation descriptor.
- `createPan462BackupV1({installation, source, backupDir, ownedRoot, now, nowMs, checkpointOrdinal})`
- `restorePan462BackupV1({backupDir, targetRoot, ownedRoot, target, expectedVersion, now, nowMs})`
- `readRestoredInstallationV1({restored, target, requiredServiceIds, nowMs})` — returns a verified `readback` receipt on success.
- `attemptControlledEffectV1({restored, writerAuthority, request})`
- `diagnoseRecoveryV1({backup, restoreReadback, destinationReceipt, nowMs})`

## Boundary and nonclaims

- Synthetic, container-owned installation only. A local copy on the same
  controller; no offhost/independent disaster destination and no production RTO.
- No publication, private source, host admin, install-on-host, Docker socket,
  arbitrary shell capability, network service or real outbound business effect.
- The controlled outbound operation is exercised as a fail-closed denial inside
  the isolated synthetic restore target; no real external target is contacted.
- Synthetic evidence cannot satisfy human-only or real-environment evidence;
  those remain separately held.
- Independent review, integration, CI, release and public readback remain owned
  by the maintainer/delivery owner.

Focused proof: `node --test tests/pan462/native-backup-restore.test.mjs`
(registered as `npm run pan462:test`). Canonical command: `npm test`.
The correction's named regressions are
`PAN462-CORRECTION-AC02`, `PAN462-CORRECTION-AC04` and `PAN462-CORRECTION-GUARD`.
