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
