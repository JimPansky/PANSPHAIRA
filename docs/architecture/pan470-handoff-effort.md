# PAN470 — complete worker handoff + measurable finalization effort (CONTRIB-03)

Bounded first slice. This module makes a worker handoff COMPLETE (it names exact
base/head, completed and unmet AC IDs, commands/exits, evidence locations, integration
surfaces and nonclaims) and makes finalization effort MEASURABLE (exact recorded
intervals per active phase, kept separate from CI wait / idle / unknown, aggregated by
accepted deliverable and by model/harness) — using the EXISTING work-order and receipt
surfaces, with no new telemetry platform.

## Surfaces and entry points

`src/pan470/handoff-effort.mjs` is a read-only, synthetic, local entry point that drives
the ACTUAL released entry points:

- `runSyntheticDevelopmentWorker()` (dev-worker controller) — the base `WorkReceiptV1`.
- `validateReceiptDigest()` (dev-worker controller) — the existing mandatory receipt
  gate, retained and re-checked (AC03).
- `WORK_ORDER_SCHEMA_V1` / `WORK_RECEIPT_SCHEMA_V1` — the existing work-order/receipt
  schema identities the handoff is bound to.

## Functions

| Function | Role |
| --- | --- |
| `buildHandoffReceipt({order, receipt, baseCommit, headCommit, completedAcIds, unmetAc, commands, evidence, integrationSurfaces, nonClaims})` | Add the completeness fields a base `WorkReceiptV1` lacks; emit `handoffDigest`. |
| `validateHandoffReceipt(handoff, {evidenceRoot})` | Fail-closed validation; malformed receipts and stale evidence (recorded sha256 no longer matches current bytes / missing file) do NOT imply completion. |
| `measureEffort({deliverableId, modelAlias, harnessDigest, intervals, passive})` | Exact recorded intervals per active phase (IMPLEMENTATION, SELF_CHECK, REVIEW, CORRECTION, FINALIZATION) separate from passive (CI_WAIT, IDLE, UNKNOWN); `activeTotalMs`. |
| `aggregateEffort(records)` | Aggregate by accepted deliverable and by model/harness; passive summed separately. |
| `composeCompletedHandoff({workOrder, frozenBaseCommit, candidateHeadCommit, ...})` | Compose one synthetic self-check handoff through the released entry points; not proof of a real code candidate. |
| `generateHandoffReport({handoff, effortRecords, evidenceRoot})` | Structural report generation from a validated handoff and recorded effort; provenance depends on the producer adapter, not this helper; `nonRetrospective: true`. |

## Denial codes (fail-closed)

`HANDBOFF_RECEIPT_SCHEMA_DENIED`, `HANDBOFF_RECEIPT_DIGEST_MISMATCH`,
`HANDBOFF_BASE_MISMATCH`, `HANDBOFF_HEAD_MISSING`, `HANDBOFF_WORK_ORDER_DIGEST_MISMATCH`,
`HANDBOFF_AC_EMPTY`, `HANDBOFF_AC_DUP`, `HANDBOFF_AC_UNKNOWN`, `HANDBOFF_AC_OVERLAP`,
`HANDBOFF_COMMAND_EMPTY`, `HANDBOFF_COMMAND_EXIT_INVALID`, `HANDBOFF_EVIDENCE_EMPTY`,
`HANDBOFF_EVIDENCE_MISSING`, `HANDBOFF_EVIDENCE_STALE`, `HANDBOFF_INTEGRATION_EMPTY`,
`HANDBOFF_NONCLAIMS_EMPTY`, `EFFORT_INTERVAL_INVALID`, `EFFORT_PHASE_UNKNOWN`,
`EFFORT_STATE_UNKNOWN`, `EFFORT_INTERVAL_OVERLAP`.

## Non-claims

- No percentage of effort is inferred from tokens, commit counts or overlapping wall
  time; passive time is never folded into active effort (AC02 / non-retrospective).
- Bookkeeping is not a new blocking delivery gate (AC03).
- No live publication, production/customer/host data, or credentials; synthetic local
  evidence only.

## Evidence

`tests/fixtures/pan470/evidence-selfcheck-v1.txt` is the exact-byte self-check evidence
the handoff's evidence location binds to; `validateHandoffReceipt` re-derives its sha256
from current on-disk bytes to prove the receipt is not stale (AC03).

## Producer-bound completion (v2 adapter) — trust boundary

The V1 producer (`runSyntheticDevelopmentWorker`) intentionally emits
`candidateCommit = null`, and `schemas/work-receipt-v1.schema.json` pins
`"candidateCommit": { "type": "null" }`. A caller that rewrites that field to a
real-looking head and rehashes the receipt CANNOT become a genuine completion:
`validateReceiptDigest` re-validates schema + canonical digest and refuses it.

The explicit versioned adapter `src/pan470/producer-handoff-v2.mjs`
(`pansphaira.pan470/producer-adapter/v1`) is the smallest surface that binds an
ACTUAL completed local public-code handoff to independently observed Git state:

- **IN**: a schema-validated, self-consistent `WorkOrderV1` producer order
  (digest = released canonical sha256 of the unsigned fields); a real
  `WorkReceiptV1` base receipt whose `candidateCommit` is exactly `null` and
  whose retained `validateReceiptDigest` gate is RE-RUN, not replaced; real
  local Git state observed via `spawnSync("git")` (base a strict ancestor of
  HEAD, clean tree, exact subjects); actually executed commands with their real
  exit codes and full output text; current on-disk evidence bytes.
- **OUT**: `ProducerBoundHandoffV1` / `ProducerBoundReportV1` — the existing v1
  handoff receipt plus observed-git and observed-effort sections — accepted
  only when every binding holds.
- **NOT IN / never accepted**: caller self-attested head or base (the handoff
  must equal the OBSERVED identities); historical/reconstructed phase timings;
  CI wait or idle folded into active effort; any relaxation of the V1 null-only
  schema; scheduler, supervisor, dashboard, general framework, external
  authority, publication, network or private material.

Unobserved phases carry zero recorded intervals and are reported separately as
`unobservedPhases` — never inferred, never zero-by-inference. Prospective
observed intervals only; `nonRetrospective: true`.

Adapter denial codes (fail-closed, exact): `PRODUCER_V2_SCHEMA_DENIED`,
`PRODUCER_V2_INPUT_MISSING`, `PRODUCER_V2_RECEIPT_INVALID`,
`PRODUCER_V2_CANDIDATE_NOT_NULL`, `PRODUCER_V2_ORDER_SCHEMA_DENIED`,
`PRODUCER_V2_ORDER_DIGEST_MISMATCH`, `PRODUCER_V2_ORDER_BINDING_MISMATCH`,
`PRODUCER_V2_BASE_NOT_OBSERVED`, `PRODUCER_V2_HEAD_NOT_OBSERVED`,
`PRODUCER_V2_NOT_COMPLETED`, `PRODUCER_V2_COMMAND_EMPTY`,
`PRODUCER_V2_COMMAND_EXIT_INVALID`, `PRODUCER_V2_COMMAND_OUTPUT_STALE`,
`PRODUCER_V2_EVIDENCE_INVALID`, `PRODUCER_V2_EFFORT_INVALID`.

Commands must originate from `runCommand` in the same process on the same clean
repository head. The adapter re-observes Git and binds the command objects; a
deserialized JSON record, invented output, failed exit or earlier-head command
cannot authorize completion. `runCommand` is a trusted local shell executor,
not a sandbox or permission boundary. Do not feed it untrusted commands.

`buildActualHandoffBundle` returns the schema-versioned bundle;
`generateActualHandoffReport` requires the order, synthetic base receipt,
bundle handoff/effort/git, live command records, repositoryRoot and evidenceRoot.
The synthetic base receipt is only a retained self-check, not the real work's
receipt. Git, executed commands and current evidence establish that separate
local-code handoff. Effort remains caller-observed, not authenticated by Git.

Missing phase totals and unknown passive durations are `null`, not measured
zero. Aggregate totals cover recorded active intervals only. Reports always
say `PENDING_INDEPENDENT_ACCEPTANCE`; independent review and actual delivery
readback must separately bind the report digest to an accepted deliverable.
The adapter does not assert acceptance, close issues or bypass mandatory gates.
Synthetic fixture tests are not the real completed-handoff demonstration;
that demonstration must run on the actual immutable code candidate and retain
the report, exact commands and original-criterion acceptance evidence.
