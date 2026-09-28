# PS360 source-bound closure record — AP proof epic (parent #360)

Status: local source closure complete. NOT delivered. This record maps every
parent #360 acceptance criterion to actual released evidence and test paths in
this repository. It does not author or approve any delivery receipt (independent
review, exact PR/Main CI, release publication, anonymous readback, issue
closure): those are performed by the delivery job controller. No push, no public
mutation, no credentials, no external systems, no issue closure.

## Release identity (immutable, public)

- Release tag:
  `ap-06-frozen-adapted-erv-proof-probe-with-narrow-go-verdict-issue-366-95ecd4d587d9`
  (public: <https://github.com/JoFe2/PANSPHAIRA/releases/tag/ap-06-frozen-adapted-erv-proof-probe-with-narrow-go-verdict-issue-366-95ecd4d587d9>)
- Release commit: `ae765100ac731b519906bacee5ce02dbeb2680d9` (current Main HEAD at
  the time of this source closure)
- Frozen proof probe (public raw URL):
  <https://raw.githubusercontent.com/JoFe2/PANSPHAIRA/ae765100ac731b519906bacee5ce02dbeb2680d9/verification/incoming-invoice-ap06-proof-probe-v1.json>
- The probe's own `exactHead` (`3ce0c4d5…`) and
  `releaseStatus=PENDING_EXACT_SOURCE_RELEASE` are frozen producer fields of the
  AP-06 work (task `PS366-AP06-PROOF-PROBE-01`); they are not rewritten here.
  The public release above is the separate, immutable publication pointer.

## Criterion map — parent #360 to released evidence and test paths

The parent's acceptance is the delivery of the six work packages
(AP-01…AP-06, issues #361–#366) with their 34 acceptance identifiers,
executed through one released core, terminated by the independent
`GO` / `NARROW_GO` / `FALSIFIED_WITH_EVIDENCE` verdict. Every row below is
bound to released, byte-identical artifacts present in this repository;
nothing is inferred from checked boxes or from child closure alone.

| Work package (issue) | Acceptance IDs | Released evidence artifact (repo path) | Focused test paths |
|---|---|---|---|
| AP-01 — Blueprint and scenario vectors (#361) | `AP-01-AC01`–`AP-01-AC05` | `packages/contracts/src/incoming-invoice-blueprint.ts` (digest `aad1b877…` per the probe `chain[3]`); closure receipt `closure-audits/AP-01-361/exact-head-local-gates.json` | `npm run incoming-invoice:test` (`tests/incoming-invoice-blueprint.test.ts`); DAG node `ap-01-incoming-invoice-blueprint-v1` |
| AP-02 — Supplier-invoice intake (#362) | `AP-02-AC01`–`AP-02-AC05` | `packages/contracts/src/incoming-invoice-intake.ts` (digest `38490af3…` per the probe `chain[0..1]`); frozen synthetic source `tests/fixtures/incoming-invoice/supplier-invoice-v1.txt`; closure receipt `closure-audits/AP-02-362/exact-head-local-gates.json` | `npm run incoming-invoice-intake:test` (`tests/incoming-invoice-intake.test.ts`); DAG node `ap-02-incoming-invoice-intake-v1` |
| AP-03 — Document-AI benchmark (#363; historical issue title; synthetic scoring, not model-quality evidence; [real pilot #378](https://github.com/JoFe2/PANSPHAIRA/issues/378)) | `AP-03-AC01`–`AP-03-AC04` | `packages/contracts/src/incoming-invoice-extraction-benchmark.ts` (digest `f64575a4…` per the probe `chain[2]`); frozen holdout `tests/fixtures/incoming-invoice/ap-03-holdout-v1.json`; closure receipt `closure-audits/AP-03-363/exact-head-local-gates.json` (all four `PASS`) | `npm run incoming-invoice-extraction:test` (`tests/incoming-invoice-extraction-benchmark.test.ts`); DAG node `ap-03-incoming-invoice-extraction-benchmark-v1` |
| AP-04 — Validation, matching, advisor (#364) | `AP-04-AC01`–`AP-04-AC05` | `packages/contracts/src/incoming-invoice-erv.ts` (digest `6ba52507…`, the shared released core per the probe `variantProof.sharedCoreSourceDigest`); frozen 8-case pack `tests/fixtures/incoming-invoice/ap-04-erv-cases-v1.json`; additive relational hardening slice `packages/contracts/src/incoming-invoice-erv-relational-v2.ts` + `tests/fixtures/incoming-invoice/ap-04-erv-relational-cases-v2.json` (v1 pack kept byte-identical) | `npm run incoming-invoice-erv:test` (`tests/incoming-invoice-erv.test.ts`, test titles named per AC); `npm run incoming-invoice-erv-relational:test`; DAG nodes `ap-04-incoming-invoice-erv-v1`, `ap-04-incoming-invoice-erv-relational-v2` |
| AP-05 — Adaptive UI and Application Guide (#365) | `AP-05-AC01`–`AP-05-AC08` | `verification/incoming-invoice-ap05-receipt-manifest-v1.json` (`acceptanceCriteria` names all eight; `uiProducerOutputs` carry baseline and changed manifests); `packages/contracts/src/incoming-invoice-adaptive-ui.ts` (digest `e60fb079…` per the probe `chain[6]`); `tests/fixtures/incoming-invoice/ap-05-frozen-setup-v1.json` and `tests/fixtures/incoming-invoice/ap-05-adaptive-release-v1/` | `npm run incoming-invoice-ap05-receipt-manifest:test` (`tests/incoming-invoice-ap05-receipt-manifest.test.ts`); `npm run incoming-invoice-adaptive-ui:test`; DAG node `ap-05-incoming-invoice-receipt-manifest-v1` |
| AP-06 — End-to-end verdict (#366, corrected by #488) | `AP-06-AC01`–`AP-06-AC07` | current: `verification/incoming-invoice-ap06-proof-probe-v2.json` (`verdict.value=NARROW_GO`; every `chain` layer carries an explicit evidence class — `SOURCE_BOUND`/`SCHEMA_VALIDATED`/`EXECUTED` — with its basis and observed result; an unexecuted layer is never reported executed; eleven `caseMatrix` rows match their oracle; the bounded synthetic extraction-to-decision dataflow is bound by `dataflow`). Historical: `verification/incoming-invoice-ap06-proof-probe-v1.json` is retained byte-for-byte and scoped to its `HISTORICAL_RELEASE_LINE_NOT_CURRENT_SOURCE` release line: its generic `exercised: true` flag is superseded and is not reused | current: `npm run incoming-invoice-ap06-proof-probe-v2:test` (`tests/incoming-invoice-ap06-proof-probe-v2.test.ts`, generator `scripts/generate-incoming-invoice-ap06-proof-probe-v2.mjs`); historical: `npm run incoming-invoice-ap06-proof-probe:test` (unchanged, still reproduces the frozen v1 bytes) |

Supporting released artifacts exercised by the AP-06 probe: scenario packs
`ap-04-local-synthetic-erv-cases-v1`, `ap-03-local-synthetic-holdout-v1`,
`ap-02-synthetic-supplier-invoice-v1` (named in the probe
`releaseReadback.namedScenarioPacks`), and the analytics pack
`verification/incoming-invoice-erv-analytics-v1.json`
(`npm run incoming-invoice-erv-analytics:test`).

## The independent verdict and its boundary (NARROW_GO)

The AP-06 probe is the independent verdict for the parent: `NARROW_GO`.

- Proven (baseline): the dialogue-free `LEAN` requirement executes through the
  released core and resolves `MATCHED`
  (`variantProof.executions[0]`: `coreExecutable=true`,
  `coreOutcome=MATCHED`); both variants share one core
  (`variantProof.coreModuleDigestIdentical=true`,
  `onlyRequirementConfigurationDiffer=true`).
- Genuinely unmet (changed variant): the requested
  `RATE_BPS_V1@1.0.0 rateBasisPoints=200` three-way tolerance has no released
  AP-04 core variant (the released variant is `rateBasisPoints=100`). The
  released core neither invents the requested variant nor substitutes the
  released rate; the changed execution stays `TYPED_UNKNOWN`
  (`variantProof.executions[1]`: `coreExecutable=false`). This is a typed,
  evidence-citing exception — **not** a proven 200-bps execution, **not** a
  supported 200-bps variant, and **not** a claim of arbitrary adaptability.
  The probe's nonclaims include `NO_TOLERANCE_SUBSTITUTION_FOR_MISSING_VARIANT`.
- Scope nonclaims (probe `nonclaims`): `NO_CUSTOMER_DATA_EVALUATED`,
  `NO_EXTERNAL_PROVIDER_EVALUATED`, `NO_PRODUCTIVE_ALLOCATION_OR_POSTING_AUTHORIZED`,
  `NO_BOOKING_AUTHORITY_GRANTED`, `NO_LIVE_ERP_SYSTEM_CLAIM`,
  `NO_INVENTED_CAPABILITY_OR_AUTHORITY`.

## Genuinely unmet / unresolved items (retained, not waived)

1. **200-bps changed variant**: no released executable variant exists
   (`TYPED_UNKNOWN`, `coreExecutable=false`). Satisfying it requires a new
   released AP-04 core variant plus a re-proven AP-06 probe; it is outside the
   scope of this bounded source work and of the NARROW_GO verdict.
2. **Parent delivery receipts**: independent (Qwen) review, exact PR/Main CI,
   release publication and anonymous readback, and public issue closure for
   #360/#361–#366 are owned by the delivery job controller and are not
   authored, approved, or claimed by this record. The public AP implementation
   issues remain recorded as `6/6 open` in the proving-ground status table
   (last recorded state; closure happens after controller readback).
3. **General end-to-end product**: the general product (all applications, live
   systems, production accounts-payable fitness) is not delivered; the README
   keeps `[work in progress](https://github.com/JoFe2/PANSPHAIRA/issues/360)`
   for the general product. Only the bounded incoming-invoice local-synthetic
   proof slice is proven.
4. **ERP-enhanced composition**: authoritative ERP reads, productive posting,
   and system-of-record readback remain separately authorized and separately
   evidenced; nothing here claims them.

## Source changes of this closure (bounded, TDD)

- `README.md`: the stale `WORK IN PROGRESS · PLANNED · SHORT-TERM PROOF` ERV
  marker is replaced by `PROVEN_LOCAL_SYNTHETIC_POC · NARROW_GO · LOCAL
  SYNTHETIC`; the marker-removal sentence is replaced by the exact immutable
  public release tag and raw proof links plus the bounded NARROW_GO
  explanation (baseline `MATCHED` through the released core; 200-bps typed
  `UNKNOWN`, not a proven 200-bps execution or arbitrary adaptability).
  Marketing-first layout, standalone core plus optional ERP framing, and all
  nonclaim boundaries are preserved; word count and H2 budget unchanged.
- `docs/INCOMING-INVOICE-PROVING-GROUND.md`: the
  `WORK_IN_PROGRESS_PLANNED_NOT_DELIVERED` marker becomes
  `PROVEN_LOCAL_SYNTHETIC_POC_NARROW_GO`; the stale `Current status` rows
  (work packages, acceptance identifiers, product implementation/release) are
  reconciled to the released state; the promotion-gating paragraph now records
  the public `NARROW_GO` verdict satisfying `AP-05-AC05`–`AP-05-AC08` and
  `AP-06-AC06`–`AP-06-AC07` and states that the general end-to-end product is
  not delivered.
- `tests/release-governance.test.mjs`: focused positive/negative assertions for
  the new marker, the exact public release/proof links, the NARROW_GO
  explanation substrings, and the fail-closed negative that the 200-bps
  variant is never presented as released/supported/proven (RED demonstrated
  before the source fix; GREEN after).
- `SHA256SUMS` and `verification/verification-dag-v2.json`: repository-required
  integrity refresh for the changed source only (`npm run integrity:refresh`);
  `graphVersion` remains 47, node count unchanged, no frozen producer, fixture,
  manifest entry, or governance rule changed.