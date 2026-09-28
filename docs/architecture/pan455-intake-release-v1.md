# PAN455 — one synthetic material-intake release rule + sequence-addressed mapping

Status: `LOCAL_SYNTHETIC_IMPLEMENTED` (repository-only)

This implements the revealed PAN455 controlled challenge (PAN455-INTAKE-RELEASE-01)
as ONE additive adapter at the permitted seam: a single material
**intake-release eligibility rule** plus a **sequence-addressed schema/state
mapping**, delivered THROUGH the existing, unchanged bound-task-handle (BTH)
business journey. It does not modify the frozen core.

It is a local synthetic bound task: **not** live authentication, **not** a
global exactly-once guarantee, **not** a public write, and **not** a real
provider. No private input, external model, runtime or model change is used,
and nothing is published or activated.

## The one material rule (business eligibility, never authority)

An order may enter the accepted owner-approved journey **only when the
complete trusted intake journal folds to `RELEASED` with no open hold**. This
is business eligibility — it is **never** owner approval and **never** effect
authority. The material witness: appending an `OPEN` after a `RELEASE`
changes an otherwise identical order from eligible to denied, and clearing the
last hold alone yields `PENDING`, not `RELEASED`.

## Reused actual foundation (additive; nothing modified)

| Accepted foundation | PAN455 use | Classification |
| --- | --- | --- |
| `src/pan442/bound-task-handle.mjs` `useBoundTaskHandle` / issuer / resolver | The unchanged bound-task business journey (handle, use-time checks, owner approval, one-use lease, reservation, readback) | REUSE |
| `demo/runtime/admin-ai-poc.mjs` → `createLocalBusinessOperation` seam | The non-owned local business operation (OWNER_ESCALATION decision → owner approval → lease execution) | REUSE |
| `src/cks-12/drift-revalidation-fastpath.ts` `requireKnowledgeDriftRevalidation` / `denyUnknownVariantFastPath` | Exact affected-knowledge invalidation and fast-path refusal (unchanged frozen helpers) | REUSE |
| `demo/runtime/enforcement-gate.mjs` `canonicalJson` / `sha256` | Canonical evidence digests | REUSE |

No second gateway, scheduler, journal platform, identity provider, policy,
approval or lease mechanism is introduced. The mapping and state fold operate
on **data** — there are no case-ID branches, no scenario-specific core rewrite
and no blanket denial.

## The sequence-addressed intake fold

The intake journal (`pan455.synthetic/order-intake-journal/v1`,
`LOCAL_SYNTHETIC`) is reconstructed by **sorted `seq`**, never by array order
or the largest observed row. Exactly one row at each integer `seq 1..head`.
Duplicate `seq` is `CONTRADICTORY` (even for identical rows); a gap, null
journal or unknown kind is `UNKNOWN`. No coercion of identifiers or numbers.

Transitions (initial `PENDING`, empty hold set):
- `OPEN` — requires a nonempty new hold key; adds it and sets `BLOCKED`
  (revoking any prior release). Reopening a cleared key is permitted.
- `CLEAR` — requires an existing open hold key; removes it. If none remain the
  state is `PENDING`, not `RELEASED`.
- `RELEASE` — no hold field; requires no open holds; sets `RELEASED`.
  `RELEASE` with an open hold is `CONTRADICTORY`.

## The sequence-addressed schema/state mapping

The nested `principal` / `order` / `task` records are joined into the existing
trusted task shape. `order.revision` is bound as `objectVersion` (the object
version), **not** `intake.head` (the journal sequence head). The full raw
source digest plus the mapping and rule identities are bound into
trusted-source evidence, so any journal change changes the evidence digest even
when the effect identity is unchanged.

## Exact fail-closed negatives (typed, before effects)

| Code | Trigger | Stage |
| --- | --- | --- |
| `PAN455_INTAKE_UNKNOWN_DENIED` | gap / null journal / unknown kind / malformed input | `COMPOSE` |
| `PAN455_INTAKE_CONTRADICTORY_DENIED` | duplicate seq / illegal transition | `COMPOSE` |
| `PAN455_INTAKE_NOT_RELEASED_DENIED` | journal does not end `RELEASED` (incl. appended `OPEN`) | `COMPOSE` |

These PAN455 codes are challenge/reference expectations, **not** existing
baseline product codes; denials are typed `BoundTaskHandleError` and the
`BTH_*` codes/stages retain their existing meaning. A mapping whose order scope
differs from the single supported binding is denied at the **existing BTH
`SUPPORTED` stage** by the unchanged core (`BTH_BINDING_UNSUPPORTED_DENIED`),
with zero effects. Every pre-effect denial has zero provider snapshots,
mutations and readbacks; handle replay adds no effect.

## Exact affected-source invalidation (CKS-12)

The change (knowledge `pan455:intake-applicability`, `v1` → `v2`) invalidates
exactly the two affected dependents — `intake-mapping-proof` and
`intake-eligibility-proof` — via the frozen `requireKnowledgeDriftRevalidation`
helper; the unaffected `owner-lease-policy-proof` is a **separate** knowledge
and is not invalidated by graph reachability. A too-broad set (including the
unaffected proof) is `DENIED` (`STALE_KNOWLEDGE`) because the helper does not
self-filter — the caller supplies the exact set. Stale applicability is refused
**before any effect** via `denyUnknownVariantFastPath` (a
`REVALIDATION_REQUIRED` state aborts as knowledge drift); a newly hashed source
or a successful requalification **never activates authority**
(`authority NONE`, `effect NONE`).

## Entry API and effects

Entry point: `usePan455IntakeOrder`. The positive path runs exactly one
mutation and one semantic readback through
`useBoundTaskHandle → AdminAiPoc OWNER_ESCALATION → owner:local-demo approval →
one-use lease → reservation → readback`.

## Test execution and limits

The focused suite runs with
`node --test tests/pan455/pan455-intake.test.mjs` (31 tests). There is no
`package.json` script entry for it: `package.json` is a **frozen identity**
(`f055fa68…`) and is digest-pinned by the verification-fabric gate, so the
registration delta does not modify it — the comparison harness drives the suite
directly. Public writes: none. Real providers: none. Repository-only: yes.
Local synthetic: yes. No private input, external model, runtime or model
change.

## Registration (separately recorded integration delta)

Scoped public-safe registrations added in the integration commit (not part of
the sealed blind-proof tested commit): the schema
(`schemas/contracts/pan455-intake-release-v1.schema.json`), this doc, and the
boundary record (`verification/pan455-intake-release-boundary-v1.json`). The
only mandatory integrity gate moved by the two new source/test files is the
canonicalJson census; its counts and the canonical census-tooling digests are
re-pinned in that same, separately-recorded delta. See `RESULT.json`.
