# PAN467 — attributed historical business correction

Status: `LOCAL_SYNTHETIC_IMPLEMENTED_NOT_YET_RELEASE_ACCEPTED`.
Original scope: LIFE-07 AC01–AC03, one synthetic draft order aggregate.

## Actual composition and limits

The implementation uses the released PAN472 native SQLite draft stores and
PAN473 epoch/routing, immutable imported evidence, forward-correction and
controller-down diagnosis. PAN453's owned journal binds the stable original
effect identity before mutation and preserves existing STOP/REVOKE controls.
Those implementations are unchanged; no alternative database or business
provider replaces their actual entry points.

PAN462's independently accepted owned-installation recovery boundaries remain
consumed scoped prerequisites, not a claim that its PostgreSQL archive now
backs up these SQLite tables. The actual draft recovery here is the released
PAN473 native recovery path plus the new bounded correction-intent recovery.
A PostgreSQL restore receipt is not relabelled as SQLite recovery evidence.

Only `synthetic:order-42` and its existing `synthetic:line-1` are exercised.
Revision 1 has price 1250 and quantity 2000000 micros; the earlier wrong source
revision 2 changes price to 1750. After native transfer/activation, later valid
target revision 3 changes quantity to 3000000 micros. The attributed correction
appends revision 4 with price 1250 while retaining that later quantity.
These are draft fields, not booked financial totals or compensation.

The owner and attribution are the fixed LOCAL_SYNTHETIC fixture owner
`synthetic:correction-owner`. An opaque in-process grant binds the exact request,
current source generation, target epoch and correction content. This is not
human identity, organizational authorization, production PKI or an OS sandbox.
Same-user code/filesystem/DDL authority on the trusted host remains outside this
contract; checksums are consistency checks, not host-adversary authentication.

## Durable original effect, not request-ID deduplication

`describePan467OriginalEffect` independently reads the immutable wrong source
revision and retained target baseline. The original effect key derives from
scope, source generation, object, original revision and the price field. It
excludes request ID, desired corrected value and request timestamps.

A new request cannot hide conflicting correction content for that original
effect. Equivalent aliases read the original committed receipt without a new
version. Conflicting content is denied before a new target effect. Wrong
original-effect keys, generations and epochs are denied, not normalized.
A no-change request is not a correction and is refused before mutation.

The durable intent records the fixed actor, reason, original evidence digest,
first request identity and correction-content digest before the native effect.
The native forward correction remains PAN473's actual implementation, including
its historical same-field conflict guard; later legitimate price choices cannot
be erased even if the value subsequently returns to the earlier wrong price.

The attributed receipt binds that retained intent to the actual independently
observed native correction event and new revision. Original source history,
imported baseline, import receipts and earlier target events are never rewritten.

## Native recovery and crash boundaries

Intent and native correction do not pretend to be one cross-module transaction.
The staged protocol explicitly retains `PENDING` until actual native observation
is bound to the attribution receipt. A crash after the intent and a crash after
the native correction are both exercised with real CLI child processes and
`SIGKILL`. They are process-crash probes, not power-loss qualification.

A new process uses the persisted local PID/boot/start identity to distinguish a
dead correction owner from a live or unknown owner. Live/unknown owners refuse
mutation. Dead-owner recovery reads the actual native history: it either applies
the still-current pending correction or commits attribution to its already
observed native event. It never blindly repeats an applied effect or rewinds
later valid data. The initial request/actor attribution is retained on recovery.

`diagnosePan467BusinessCorrection` is a separate read-only SQL path, without
importing the mutation implementation or issuer. It reconstructs source/baseline,
intent/content, generation/epoch and receipt/native-event associations. Pending
native effects are reported pending, never complete. Malformed or self-rehashed
receipts without the exact native association remain UNKNOWN.

## Public entries

- `describePan467OriginalEffect({root,id,originalRevision})`: read-only original
  effect identity and observed generation/epoch.
- `authorizePan467BusinessCorrection({root,request,owner,actor})`: exact opaque
  LOCAL_SYNTHETIC content-bound admission.
- `executePan467BusinessCorrection({root,request,grant})`: durable intent,
  actual forward correction, observed attributed receipt or read-only duplicate
  reconciliation.
- `diagnosePan467BusinessCorrection({root})`: standalone read-only observation.

CLI: `node scripts/run-pan467-business-correction.mjs` with `describe`, `apply`
and `diagnose`. Mutation requires the closed JSON request, explicit
`--owner LOCAL_SYNTHETIC_OWNER` and `--actor synthetic:correction-owner`.
Inputs are bounded regular files; symlinks and extra arguments/fields are refused.
Fault pauses are available only in an owned IPC crash-test process.

## Original-criterion qualification

| Original criterion | Actual named checks |
| --- | --- |
| LIFE-07-AC01 | Native source wrong revision 2, target later valid revision 3, actual released recovery, independent source/target SQL reads |
| LIFE-07-AC02 | New attributed revision 4; source bytes/baseline/import receipts/earlier native event unchanged; later valid quantity retained; standalone CLI diagnosis |
| LIFE-07-AC03 | API and CLI uncovered external outcome, conflicting source generation/target epoch, original-effect-key substitution and fresh-request conflicting original effect denials; equivalent alias does not duplicate |

Focused command: `npm run pan467:test` (native APIs, CLI and two real process
crashes). Canonical registration retains all mandatory governance/integrity gates.
Development GREEN is not independent acceptance, provider CI, merge, published
release or public readback. Original467 remains open until every required delivery
gate actually passes. Historical RED probes remain historical failures.

## Nonclaims

- No unrestricted database rewind or universal point-in-time semantic undo.
- No production/customer data, real bookings, payment/email/external effects,
  automatic financial compensation, host activation or installation permission.
- Only the closed native draft profile is covered. An uncovered external outcome
  is denied even if a caller supplies a new identity or asserts it is safe.
- No offhost backup, filesystem-adversary defense, distributed ownership,
  production RTO, power-loss acceptance, human signature or privacy/PKI waiver.
- No private/sealed evaluator material, reviewer state, grants or keys are public
  deliverables. Paused projects remain paused.
