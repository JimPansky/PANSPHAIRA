# Existing proposal browser correction (PAN537)

This is a bounded correction of the existing synthetic setup approval
workbench, not another browser shell, backend or authority provider.

## Data and authority boundaries

- Visible business Diff and its digest come from the registered `proposal`.
  The policy `decision` is not the business Diff or executable authority.
- Before confirmation, the preview shows Field / Before / After facts from
  that same Diff. Dates are rendered in UTC; raw JSON and the exact original
  digest remain available without changing or re-digesting the proposal.
- Owner approval returns its decision receipt and signed authority separately.
  The actual effect POST binds that authority to the original Diff and digest.
  A successful effect has a native receipt and authoritative target readback.
- Reject, stale state, invalid authentication, absent executable rights and
  omitted or tampered envelope fields retain the unchanged backend denials.
  ALLOW, a role label or an authenticated caller is not execution authority.
- Only a closed list of known before-dispatch errors is shown as a denied
  attempt. All unclassified failures are conservatively `OUTCOME_UNKNOWN`;
  no current uninformed effect retry is offered. This never declares a prior
  operation not applied and does not grant a compensating action.

## Mandatory regression

`npm run pan537:test` runs the fixed browser, registration and entry-contract
suite on supported Linux x86-64. Filtering, alternate test files and skip
switches are rejected. Missing browser/native tooling is failure, not skip.
Use invocation-owned `TMPDIR`, or the existing hosted `RUNNER_TEMP` fallback.
Private evidence stays inside the supplied owned scratch directory.

The real unchanged installer boots the pinned synthetic vendor services.
Actual Chromium requests, owner decision, effect receipt, fresh native target
readback and owned cleanup are exercised. Response-loss testing relays the
real backend request and interrupts browser delivery only; it does not claim
vendor failure or fabricate an API response or signed authority.

Desktop and 390px browser views bind the real proposal state, image/source
pins and viewport. Visual self-check is not physical-device, independent
human acceptance or whole-setup acceptance. PAN538 retains its separate
setup-overflow obligation. PAN528 retains its complete additional criteria.

The existing dashboard source stays in the original legacy payload. New
regression/documentation/runner files are source-only; legacy membership,
all existing hard gates and productive/data-source rights remain unchanged.

## Existing setup390 overflow correction (PAN538)

The same component owner and closed `npm run pan537:test` path now also make
`tests/pan538/setup-overflow.test.mjs` mandatory. No second dashboard-source
owner, generic shell, backend or authority provider is introduced. Original
proposal/effect tests and every pretest/hard gate remain mandatory.

The existing question and Ask use bounded border-box sizing with their
unchanged horizontal margins. Ask wraps long label words rather than clipping
them. The existing grid minimum is limited by available container width.
Neither root nor body hides horizontal overflow. Header/card text inherits
word wrapping so wider system-font metrics cannot expand heading or paragraph
content beyond those bounds. Real DejaVu Sans and monospace font-content stress
checks also bind heading/header scroll bounds and keyboard-reachable controls;
this is not an asserted replay of a hosted runner font identity. Original
layout predicates retain their exact comparisons and report actual numeric
bounds on failure. All non-style request, authorization, coordinator and
backend source bytes retain their prior logic.

The actual existing installer/native browser verifies document/card/control
bounds and positive reachable dimensions at desktop1280 and390, long synthetic
German question/action-label content, keyboard focus/Tab/Enter, CSS-layout200%
zoom, held delivery of a real native question response, the genuine403 denial
and an authenticated empty-body synthetic setup with fresh status readback.
German content stress is not a delivered localization. CSS-layout zoom is not
browser-chrome or physical-device certification. Held response delivery is not
a fabricated reply or a claimed loading spinner. Tokens stay ephemeral inside
the invocation-owned fixture; no productive, elevated or new provider rights.

Images need actual visual inspection; creating a screenshot is not PASS.
Registered tests, immutable source qualification, current-head required CI,
protected SHA-bound merge and exact anonymous release/product readback remain
separate delivery gates. This local correction alone does not close any issue.
