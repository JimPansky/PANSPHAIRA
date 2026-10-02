# PAN473 — bounded native writer-scope cutover and recovery

This MIG-03 composition extends the released PAN472 owned synthetic SQLite draft
stores. It transfers one writer scope, with recovery in the same qualification.
It is not a production cutover, a global transaction, zero downtime, an offhost
backup, a power-loss result or a hostile-host sandbox. External business effects
remain disabled. No existing fixed business action, inventory/preview permission,
installation grant, signing authority or historical release verdict is widened.

## Consumed boundaries

PAN472's actual SQLite snapshot/delta import, content-bound synthetic approval,
atomic data/cursor/dedup/receipt and independent import reconciliation are reused
unchanged. The existing PAN453 owned journal binds cutover/target task identities
and retains STOP/REVOKE controls. The completed PAN462 backup/restore evidence
supplies the scoped predecessor boundary: a restored copy is not permission to
reuse old writer authority or replay effects, and controller claims are not
observations. Its PostgreSQL backup/restore implementation is not modified or
requalified as a SQLite adapter. PAN473 adds native epoch/fence/routing composition
for the existing PAN472 scope, not a new database backend or continuous supervisor.

The original synthetic data bounds remain 16 objects, 64 total historical events
and the exact draft mapping (integer micro quantities, integer minor money,
DRAFT status, versioned tombstones). New target history counts against the same
64-event bound. Credentials, native stores, live grants, retained controller state
and reviewer scratch are private runtime material, not public source artifacts.

## Original acceptance and actual entries

| Original criterion | Actual positive / boundary-specific negative qualification |
| --- | --- |
| MIG-03-AC01 | Living old writer and already-open native batch both write before the fence, then both are denied after it. The final delta and exact native rows are observed before target epoch 1 activation. Native routing is read back. A virgin target also uses the inherited real snapshot import. |
| MIG-03-AC02 | The real CLI controller is SIGKILLed after source fence, after target activation, and before routing ACK. A new process independently reads the held gates and data. Fresh recovery completes one epoch without a duplicate import/receipt. A live/unknown predecessor lease is never stolen. |
| MIG-03-AC03 | Late import and unchanged legacy replay are refused after target activity. Native receipt/import metadata is immutable after activation. Old-state rollback is refused. An untouched historical numeric field can be forward-corrected while preserving later work on other fields and original evidence. Same-field conflict, including A -> B -> A, is refused; a correctly re-digested clobbering history is independently rejected. |
| MIG-03-AC04 | The standalone CLI uses separate read-only SQL connections, even after controller death. Native routing contradiction is UNKNOWN, not ACTIVE, and denies recovery without mutation. A source profile without the required fence guarantee explicitly retains coexistence/offline transfer instead of authorizing a cutover. |

`tests/pan473/native-process-cutover.test.mjs` exercises live native clients,
actual SIGKILL and fresh CLI processes; `writer-scope-cutover.test.mjs` exercises
the actual APIs and the independent native observer. The hostile history probe
uses disclosed trusted-host native SQL with registered functions, not a
code-owned grant, a mock database or a production attack claim. Process termination
is deliberately not presented as storage/power-failure qualification.

## Native state transition

1. Preparation installs source write guards and an inactive target epoch on the
   validated owned draft stores. Source capability is a closed local profile;
   selecting `NO_FENCE_GUARANTEE` cannot mint the native cutover branch.
2. A plan binds the actual current source cutoff, exact state digest, owned scope
   and optional final inherited transfer. A changed source cutoff invalidates it.
3. The source is durably fenced before target activation. SQLite triggers on
   source objects/events/meta fence both the old API and an already-prepared
   batch connection. A stopped/revoked task is refused, not silently resumed.
4. The final real import is independently reconciled, then the target transaction
   retains its exact original baseline and activates epoch 1 plus native guards.
5. Routing switches to TARGET with ACK still false. Target writes require both
   native epoch and actual routing ACK; source writes stay fenced throughout.
6. ACK is committed and independently reread. Recovery reconstructs from the
   retained plan and actual gates/data, not a claimed completed phase. It skips
   an already verified import/activation and never automatically reopens source.

The native controller lease binds an owned PID to Linux process birth/boot
identity. A dead/reused PID can be recovered with fresh local owner admission;
unknown liveness fails closed. This is local process coordination, not an OS
security boundary. DDL/database administrators and a malicious trusted host are
outside the guard claim. Preparation interrupted before its native schema is
complete is UNKNOWN; existing partial scopes are not automatically adopted.

## Preservation and ABA correction

The original imported baseline, receipts, approval/dedup metadata and subsequent
target events are retained. A correction names the imported object revision,
field and original value. The writer walks real retained target events inside
its write transaction: any material later change to that field makes the
historical correction obsolete, even if its current value returned to the
original value. A change to another field does not create this conflict.

The independent observer separately reconstructs source and target histories,
tracks material field changes and rejects an obsolete correction independently
of event/receipt hashes. Rehashing a semantically wrong history is not acceptance.
A correction that succeeds is a new forward revision; it never edits old history
or simply restores an old database. Legitimate later same-field changes require
an independently fresh current-version action, not this historical correction.

## Standalone diagnosis and CLI

Run the existing compiled Node 24 runtime and inherited PAN472 entry to create
an owned synthetic draft scope. Then, with ROOT pointing to that existing absolute
`pan472-owned-v1` directory:

```sh
node scripts/run-pan473-writer-scope-cutover.mjs prepare --root "$ROOT" --source-capability NATIVE_SQLITE_EPOCH_FENCE
node scripts/run-pan473-writer-scope-cutover.mjs cutover --root "$ROOT" --owner LOCAL_SYNTHETIC_OWNER
node scripts/run-pan473-writer-scope-cutover.mjs diagnose --root "$ROOT"
node scripts/run-pan473-writer-scope-cutover.mjs recover --root "$ROOT" --owner LOCAL_SYNTHETIC_OWNER
npm run pan473:test
```

`write` / `correct` require current epoch, explicit local synthetic owner and a
bounded JSON input file; `request-old-state` never silently restores an old scope.
`--pause-after` is only for the three owned IPC crash probes, not a daemon mode.
`diagnose` never issues a grant or writes a store. ACTIVE means the bounded native
cutoff/target history/epoch/routing are verified, not organizational authorization
or live external-service availability. Missing/contradictory evidence is UNKNOWN
with quarantine; incomplete transitions are HELD with no active writer.

If the source cannot support the required native fence guarantee, the explicit
alternative is `COEXISTENCE_OR_OFFLINE_TRANSFER_REQUIRED`. The existing source
remains usable; no synthetic guarantee flag authorizes a fake cutover. There is
no automatic productive offline migration. Local tests are implementation evidence;
independent frozen acceptance, exact-head CI, protected integration, a genuinely
new classified release and public/provider readback remain separate delivery gates.
