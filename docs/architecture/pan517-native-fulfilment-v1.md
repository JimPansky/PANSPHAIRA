# P03 bounded native fulfilment

## Scope and existing entry

The P03 namespace is composed inside the existing
`src/pan515/trade-state.mjs` transaction and the existing PAN472 target SQLite
store. It reuses the PAN473 owner/generation fence and released stock arithmetic.
There is no separate fulfilment database, warehouse adapter or new CLI gate.

Existing exported product entry:

- `initializePan515TradeState` binds the existing qualified native target.
- `authorizePan515TradeCommand` returns a process-owned opaque grant.
- `executePan515TradeCommand` validates, commits and reads back the native event.
- `readPan515TradeState` derives quantities and milestones from that ledger.

The existing `scripts/run-pan515-trade-state.mjs` also accepts the same bounded
commands through its existing `write` action. Product execution does not require
a second interface. The `LOCAL_SYNTHETIC_OWNER` seam permits only disposable
synthetic fixtures; caller metadata is not productive identity or authority.

## Commands and invariants

`pansphaira.pan517/fulfilment-command/v1` extends only the closed local COMMON
scope. Each command binds order, line, article, warehouse, unit, event identity,
expected revision, actual effective instant and an explicit reason. Transport
retry is separate from business identity. Unknown fields and stale or conflicting
history fail before a native mutation. Event and promise times must be real
calendar instants, not impossible dates normalized by `Date.parse`.

- `PROMISE` retains the original published COMMON dispatch promise and its source.
  Forward revisions bind the previous promise digest and their own promise kind.
- `PICK` and `PACK` bind reserved quantities without performing a stock issue.
- `ISSUE` consumes only its actual packed, reserved quantity through the existing
  stock arithmetic. Its immutable delivery note binds shipment, physical evidence,
  reservation remainder, order backorder and explicit promise kind/revision.
- `RETURN_RECEIPT` binds an actual previous issue and separate physical evidence.
  It cannot exceed issued quantities or replay the physical movement. Returned
  quantities remain protected/quarantined, not available for a new reservation.
- `RETURN_DECISION` needs a separate documented inspection and disposition before
  releasing that quarantine. A complaint decision is not physical return evidence.
- `COMPLAINT`, `COMPLAINT_DECISION` and the code-bound technical `CREDIT` are
  separate events. Credit without returned goods and returned goods without credit
  are representable without inventing stock or a productive financial posting.
- `CUSTOMER_RECEIPT` records a distinct actual milestone, its evidence, promise
  revision and event type. It never performs a second warehouse issue.
- `DISABLE` closes new P03 transitions while retaining immutable performed events.
  It does not disable the existing controlled stock-correction namespace. A
  feature stop is not a reversal of actual movements or an erasure of history.

A P03-started workflow cannot bypass pick/pack/issue or physical return validation
with legacy `SHIP`/`RETURN` commands. The unchanged legacy native workflow remains
separately testable when the P03 namespace has not started.

## Readback and verification

`deliveryMilestones` is read-only and distinguishes dispatch from customer receipt.
Without confirmed customer receipt its punctuality and position OTIF are UNKNOWN,
not inferred from a punctual dispatch. Actual event time and the original promise
remain available for later analysis even after a forward promise revision.

After the ordinary repository build, `npm run pan517:test` executes the real
SQLite positive/negative, calendar and bounded registration tests. The canonical
`npm test` includes that command; the verification DAG retains all previous hard
gates and owns only the additive P03 bytes. Existing native entry and regression
suites remain intact. The curated development receipt is not independent frozen
acceptance, hosted CI, a merge, a release or an anonymous artifact readback.

The implementation demonstrates actual local synthetic native mutations, not
physical productive movements, verified external customer identity, shipping
provider integration, payment/credit posting or a complete P07 trade integration.
Distribution remains source/evidence-only, not a turnkey runnable product package.
Issue closure requires the separately retained original-scope frozen review,
mandatory CI, protected merge, new classified release and exact anonymous consumer.
