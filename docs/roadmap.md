---
title: PanSphaira now, next, and later
description: Follow a small evidence-linked view of PanSphaira's released proof, ready work, and planned directions without duplicating the issue backlog.
---

# PanSphaira now, next, and later

This is a curated navigation layer, not a second backlog. GitHub issue state
and labels remain authoritative, and a linked issue is not evidence that a
capability is released. The [capability matrix](./capabilities.md) owns current
maturity; regular [releases](https://github.com/JoFe2/PANSPHAIRA/releases/latest)
own shipped scope.

## Status truth

Current issue, epic and release status is generated, not hand-maintained.
The [status-truth generator](https://github.com/JoFe2/PANSPHAIRA/blob/main/packages/contracts/src/status-truth.ts)
consumes an explicit allowlisted manifest and one anonymous provider readback,
binds every projection to a retrieval time, source URL and exact state digests,
and fails closed on material contradictions. A red, missing, stale or
wrong-head required workflow can never project `closure verified` or `DONE`,
and historical issue bodies and receipts stay immutable. Its deterministic
rendering, completeness and failure-on-partial-data behavior are fixed by the
[status-truth profile test](https://github.com/JoFe2/PANSPHAIRA/blob/main/tests/status-truth-profile.test.ts).

### Generated anonymous status snapshot

The following is the unchanged generated output from an actual anonymous
readback at the stated retrieval time, not a manually maintained closed-issue
list or a continuously live feed. Its explicit normal allowlist contains only
[#390](https://github.com/JoFe2/PANSPHAIRA/issues/390) and
[#378](https://github.com/JoFe2/PANSPHAIRA/issues/378). The source association is
[commit 9808703](https://github.com/JoFe2/PANSPHAIRA/tree/9808703ddae3379ab395f729a399c4bce597ffdf),
tree `a2004c058e790d1e8a0e898002a535dea5234795`, and
[SOURCE_EVIDENCE_ONLY release 2026_10_02_v7](https://github.com/JoFe2/PANSPHAIRA/releases/tag/2026_10_02_v7).
PR508 identifies that qualified source integration, not completed #390 acceptance.
This snapshot does not close #390, activate #396, or qualify a human workflow.

<!-- PS380-GENERATED-ANONYMOUS-SNAPSHOT-BEGIN -->
```text
# Status Truth — PS380-STATUS-TRUTH-01

Retrieved: 2026-10-02T23:01:47.768678+00:00
Source: https://github.com/JoFe2/PANSPHAIRA
Scoped release: 2026_10_02_v7
Latest: 2026_10_02_v7 (forward-only: yes)
State digest: 497e4c3a641c34f2e6e9087cd182c72f5b98211b056c3885ae4108b6b8658f02

## issue-390 — PLANNED
- open: yes
- checklist: 0/6
- labels: type:epic, domain:agent-runtime, priority:p0, status:ready, lane:l3, security
- pr: #508 merged=yes
- stages: codePresent, testsPassed, runtimeObserved, merged, released, readbackVerified
- projection digest: 102a9caac087a54a66aeebb382db7b16288b3b9bc1b0c471c4f44d273ef1680a

## issue-378 — FALSIFIED
- open: no
- checklist: 7/7
- labels: priority:p0, lane:l3, type:test, domain:erp, status:completed
- pr: #507 merged=yes
- stages: codePresent, testsPassed, runtimeObserved, merged, released, readbackVerified, issueClosed, queueDone, closure-verified
- projection digest: ddf5de42dc9e2d361b24d25ad1fed59e4c64d212ad2340291b25c2a62f8cddbf

```
<!-- PS380-GENERATED-ANONYMOUS-SNAPSHOT-END -->

Twenty-four actual credential-free HTTP200 observations bound issue/comment,
PR, workflow, release and pagination inputs. The input receipt SHA256 is
`7dc5f727b23546354afd70c9477b27ec79a76ac6ff46589113c67e9879cbc939`;
the unchanged original projector produced the state above deterministically,
and exact snapshot verification returned `VERIFIED`. Its snapshot digest is
`dbb9bbd0bff2cf28a220f412a2853c7183e50208832e08359cc8d2c6012b74de`.

The separate unchanged diagnostic allowlist including #392 and #380 returned
`DENIED` with `STATUS_TRUTH_ACCEPTANCE_SHOWN_COMPLETE_DENIED` and
`STATUS_TRUTH_CHECKLIST_STALE_DENIED`: their historical closed states and
unchecked checklists were not rewritten to manufacture a positive portfolio
view. Deliberately removing one item from the consumer input returned
`STATUS_TRUTH_ITEM_MISMATCH_DENIED` and
`STATUS_TRUTH_PAGINATION_INCOMPLETE_DENIED`; actual provider responses stayed
unchanged. This is a retrieval-bound observation, not historical execution
reconstruction or complete original #390 acceptance. Existing source evidence
remains 23 native probes, 25 separate semantic checks and 0 complete human
business workflows; no ERP, IAM, productive posting or payment qualification
follows.

## Now — verify and harden the released local proof

- Reproduce the released [CRM-to-ERP approval and readback path](./use-cases/crm-erp-approval-readback.md)
  and its [`CM-SEC-007` evidence](./SECURITY-ASSURANCE.md#locally-validated-synthetic-evidence).
- Continue the finite inactive capability/action catalogue in
  [issue #3](https://github.com/JoFe2/PANSPHAIRA/issues/3). Its live labels
  and issue history own the work state.
- Reproduce the released [Extension Assurance Profile](./EXTENSION-ASSURANCE-PROFILES.md)
  and its eight universal fail-closed gates. Issue
  [#45](https://github.com/JoFe2/PANSPHAIRA/issues/45) retains delivery
  history, while release governance owns shipped status.
- Reproduce the released [minimized agent-work event contract](./AGENT-WORK-EVENT-CONTRACT.md)
  and its consent, retention, tombstone and disclosure-safe readback gates.
  Issue [#43](https://github.com/JoFe2/PANSPHAIRA/issues/43) retains
  delivery history, while release governance owns shipped status.
- Reproduce the released [update, migration, and Doctor contract freeze](./UPDATE-MIGRATION-DOCTOR-CONTRACTS.md)
  and its six-axis lock, canonical digest and fail-closed preview gates. Issue
  [#59](https://github.com/JoFe2/PANSPHAIRA/issues/59) retains delivery
  history, while release governance owns shipped status.
- Reproduce the separated [External Video Service Boundary](EXTERNAL-VIDEO-SERVICE.md)
  and its deterministic local reference-closure checks. Issue
  [#64](https://github.com/JoFe2/PANSPHAIRA/issues/64) retains delivery
  history, while release governance owns shipped status.
- Reproduce the released ASF-INTAKE-2 closed nine-gate pre-candidate decision
  through [`CM-REL-017`](../release/governance.json). Issue
  [#56](https://github.com/JoFe2/PANSPHAIRA/issues/56) retains delivery
  history, while release governance owns shipped status.
- Reproduce the released [INT-PROFILE-001 integration profiles](./INTEGRATION-PROFILES.md)
  and their five local-synthetic variants plus nine fail-closed probes. Issue
  [#60](https://github.com/JoFe2/PANSPHAIRA/issues/60) retains delivery
  history, while release governance owns shipped status.
- Keep release truth, anonymous asset/hash readback, secure-default probes,
  public navigation, and known limitations synchronized with every bounded
  increment.

## Next — ready contract foundations

- Freeze the governed immutable skill bundle and compatibility contracts in
  [issue #41](https://github.com/JoFe2/PANSPHAIRA/issues/41).
“Ready” is an issue-planning label, not a release or validation claim. Each
increment still needs its own implementation, tests, evidence, review, and
release decision.

## Later — selected planned directions

- A governed CRM/ERP business-intelligence demo:
  [issue #9](https://github.com/JoFe2/PANSPHAIRA/issues/9).
- A governed Power Apps-first integration:
  [issue #32](https://github.com/JoFe2/PANSPHAIRA/issues/32).
- One core with thin conformant harness adapters:
  [issue #36](https://github.com/JoFe2/PANSPHAIRA/issues/36).

These are selected orientation links, not a promise of order, date, funding,
compatibility, or delivery. Browse the
[full issue tracker](https://github.com/JoFe2/PANSPHAIRA/issues) for live
scope and status.

## Participate safely

Ask non-sensitive questions in
[GitHub Q&A](https://github.com/JoFe2/PANSPHAIRA/discussions/categories/q-a),
or follow the [contribution guide](../CONTRIBUTING.md) for a bounded proposal.
Use the [security policy](../SECURITY.md) for vulnerabilities; do not post
sensitive reports in an issue or Discussion.
