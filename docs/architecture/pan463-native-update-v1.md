# PAN463 — bounded native update-effect adapter

Evidence class: LOCAL_SYNTHETIC_NATIVE_EXECUTION. Source distribution only, not
production installation authority or a runnable deployment release.

## Existing surfaces reused

- The unchanged `update-operation-contract-v1.schema.json` and released
  `updateDoctorContractDigest` validate the embedded CHECK_ONLY plan. Its mode,
  no-authority-delta contract and non-effectful receipt remain unchanged.
- `DemoMutationGate.reserveOperation`, existing v4 effect-store validation,
  `markAmbiguous`, `persist`, and `assertEffectControl` retain the PAN453 durable
  reservation/receipt and stop/revoke mechanics. No second operation journal is
  introduced and the existing provider gateway's action/authority allowlists
  are not widened. The adapter uses the existing installer-approval reservation
  binding; that reservation is storage, not a substitute for the native grant.
- `acquireLocalJournalOwner` remains the process-local owner issuer. The native
  adapter occupies only a new `pan453-owned-v2/pan463-native-v1` descendant of an
  explicitly declared, real, non-symlink owned root. Legacy roots and their
  retained crash fences are not adopted or cleared.
- Real `pg` and the released `startRealPostgres` fixture storage path exercise
  actual PostgreSQL transactions and the existing synthetic `kts_invoices`
  table. No database or effect callback is mocked.

## Admission and effect boundary (LIFE-03-AC01)

Build first (`npm run build`), then use `createNativeUpdateExecutorV1` from
`src/pan463/native-update-executor.mjs`. A trusted local controller supplies:

- its independently retained native plan, including the exact CHECK_ONLY plan;
- its current grant reader, separately from the untrusted execution request;
- the explicit owned journal root and loopback database configuration;
- a trusted safe-integer clock (default actual wall-clock time).

The plan's only typed effect is `ADD_INVOICE_REVISION_NOTE_V1`: add the fixed
`public.kts_invoices.native_revision_note` non-null text column with empty default.
There is no request-supplied SQL, table name, command or shell capability. The
whole native plan, installation, source/target lock digests and consecutive
source/target generations are bound before dispatch. A CHECK_ONLY plan alone
is not a native plan and cannot execute. A rehashed substitute does not replace
the controller's retained plan.

The request carries only `{plan, executorId, fence}`. The independently read
grant has exact fields `{grantId, planDigest, executorId, fence, notBeforeMs,
expiresAtMs, revoked}`. Plan/owner/fence must match, and expiry/revocation are
rechecked before effect and commit/readback. A changed grant cannot silently
borrow a prior reservation. Persistent PAN453 revocation also denies native
execution/reconciliation.

The already provisioned synthetic target has one `pan463_native_state` row with
`installation_id`, `generation`, `lock_digest`, `fence`, `migration_count`,
`last_operation`, and `last_plan_digest`. It is observed, never created or reset
by the executor. The fixed DDL and target generation/operation marker commit in
ONE serializable transaction with local synchronous commit enabled. The marker
is part of the effect's target transaction, not a new controller journal. The
fixture provisioning is explicit test setup, not proof of a deployed updater.

## Process ownership and restart (LIFE-03-AC02)

A target-database advisory session lock excludes a second native executor even
if it names another journal root. The existing filesystem owner remains held
through journal persistence. On restart, only in the new native namespace and
with the database lock acquired, an old marker can be removed after its exact
PID is observed absent (`ESRCH`). Live PID, reused PID, inaccessible PID,
malformed marker or changed inode fails closed. No process is killed by the
adapter; signal zero is only an existence check. The test parent sends SIGKILL
to its own child processes.

Named tests kill a REAL executor process:

1. BEFORE_DISPATCH, after durable reservation but before target transaction;
2. DURING_TRANSACTION, after real DDL and target-row update but before commit;
3. AFTER_COMMIT_BEFORE_RECEIPT, after commit but before journal receipt.

The same target and journal survive each kill. The replacement executor does
not dispatch again. It reads schema and target marker in a repeatable-read,
read-only transaction. Exact postcondition gives APPLIED/PASS and a recovered
receipt; exact precondition gives NOT_APPLIED/HELD; contradictory/unavailable
state gives UNKNOWN/HELD. NOT_APPLIED deliberately does not auto-retry: a fresh
controller decision is required. Unknown data never implies success or replay.

## Actual negative boundaries (LIFE-03-AC03)

The focused tests exercise competing processes, another journal root, stale
request and observed-database fences, wrong owner, expired/revoked grants,
expiry/revocation during the transaction, persisted grant conflict, malformed
CHECK_ONLY and native steps, rehashed payload conflict, wrong generation,
contradictory/missing target state, and root/remote-database denials. Original
PAN453 and CHECK_ONLY tests are rerun without modifying their implementations.
The native suite is registered in the serial `posttest` lifecycle after the
existing PostgreSQL suites so shared fixture ports cannot race.

## Limits

One synthetic local installation and one fixed schema step. The controller's
plan/grant reader and owned filesystem are trust boundaries, not caller JSON
proof or an OS sandbox. Same-UID hostile programs, arbitrary PostgreSQL owners,
multiple hosts, lost/corrupt storage and database-server/host power-loss recovery
are not qualified. No production/customer operation, global admin, remote
provider, updater binary deployment, distributed exactly-once or schema rollback
service is introduced. No broader lifecycle child or parent closure follows
from this slice. Independent review, exact-head CI, classified release and
anonymous public readback remain delivery gates.

Focused checks: `npm run pan463:test`, `npm run pan453:test`, and
`node --test dist/tests/update-doctor.test.js` after build. Canonical lifecycle:
`npm test` including posttest. Raw execution logs stay outside the source tree.
