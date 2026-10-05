# P07: bounded connected native stage and operator introduction

This development entry executes one existing, disposable native COMMON-TRADE-01
scope. It is not the original complete P07 target integration. P04 fiscal/archive
qualification and P05 selected FiBu, authorized tenant, booking/payment/allocation
and cutoff readback remain absent. Neither a local handoff nor the reference
invoices establish external booking, gross fiscal amounts or payment authority.
The original issue remains OPEN until its full criteria and delivery gates pass.

## Prerequisites and data takeover

Use an existing explicitly synthetic PAN472 target activated through the existing
PAN473 epoch-fenced takeover and initialized by P01 for COMMON-TRADE-01. Retain its
source/profile marker, epoch, source history, imports and immutable receipts.
The entry does not create a new main ledger, import arbitrary business data, adopt
an unrelated existing workflow or grant production/marketplace/source rights.
The protected native integer piece-to-STK mapping and canonical COMMON revision
binding remain unchanged; the COMMON raw-file hash is separate provenance.
A fixture initializer in a test is not a real tenant migration qualification.

No external adapter, endpoint, credential, actor, role or provider selector exists
in this CLI. The local synthetic owner is code-owned and still constrained by the
existing native namespace/profile, component grants and STOP/REVOKE controls.

## Closed operator commands

Run from the exact checked-out source with its locked dependencies and compiled
contracts. ROOT names the existing explicitly owned synthetic native root:

```sh
node scripts/run-pan521-connected-trade.mjs run-local --root "$ROOT" --as-of 2026-07-31T23:59:59Z --attempt attempt-first --through PURCHASE_TARGET
node scripts/run-pan521-connected-trade.mjs run-local --root "$ROOT" --as-of 2026-07-31T23:59:59Z --attempt attempt-resume --through FULL_NATIVE
node scripts/run-pan521-connected-trade.mjs read --root "$ROOT" --as-of 2026-07-31T23:59:59Z
```

The two through values are bounded progress selectors, not authority or
qualification selectors. Attempt IDs change transport identity only. Business
keys, original expected revisions and code-owned source content remain fixed.
Unknown/duplicate CLI flags, owner/provider/qualification selectors and invalid
UTC cutoffs deny before dispatch. Read remains a separate read-only mode.

PURCHASE_TARGET returns a real persisted local purchase target observation and
explicit partial/unqualified result. It is not a composite financial cutoff or
completed journey. FULL_NATIVE reuses the target effect, then records the same
COMMON receipts, reservation, P03 pick/pack/partial and remainder issues,
complaint/technical credit and quarantined physical return. It captures the
existing bounded AR-01 local finance handoff from actual native dispatch evidence.
It does not replace AP-01's unresolved variance with the separate matched AP test
case, or claim AR-02/CN-01 reference documents as qualified fiscal postings.

## Readback and open exceptions

Trade, purchase and finance come from the same native root. P06 STOCK/P2P/O2C
snapshots bind the actual native trade revision/event digests; P2P also binds its
purchase revision. The purchase identity is the existing validated
originalPurchaseInvoice.source.mapping.canonicalOrderId, not a new alias in the
readback identity object. The stock availability fact is STOCK.facts.free.
Generic optional BI pairing remains separate from these native projections.
The actual same-source KS consumer execution must be bound separately; native
P06 projection success alone is not that execution.

Inspect completion.openExceptions. Missing fiscal/archive/FiBu qualification,
original AP amount deviation and unknown/unsettled finance remain open. Unknown
payment/allocation is not zero. All outputs retain original521Accepted=false,
businessCaseClosed=false, externalPostingAuthorized=false and
paymentDispatchAuthorized=false. Reference billing is labeled reference-only.

## Interruption, correction and rollback limits

Native components own intentionally non-reentrant writer leases. The entry
composes independently durable effects, not one invented cross-component atomic
transaction. A partial failure leaves performed effects and history intact.
After returned PURCHASE_TARGET, a real child SIGKILL and different-process full
continuation have been exercised without changing the target record. This does
not qualify kill during a transaction, dead-owner lock recovery or an ambiguous
in-flight external POST. An unknown/live native lock must not be stolen or
blindly removed; use the existing bounded owner/control procedure or explicit
operator investigation.

Retry the same business journey with a new attempt ID and read before assuming a
new target order. Later native price revisions and a documented return inspection
must preserve prior movement and finance receipt bytes; they do not rewrite an
invoice's original basis or authorize an external correction/payment.

Disable/remove only the new entry's activation or use the existing explicitly
owned native transition control when its wider namespace scope is intended.
Retain the last qualified generation and every confirmed business record. There
is no destructive downgrade, history reset, automatic financial reversal or
permission to delete another owner's resources.

## Scope and resumption

Local native/HTTP contract execution, independent development replay, frozen
clean-build acceptance, canonical proof, hosted CI, protected merge, publication,
anonymous exact artifact execution and original external qualification are
separate evidence classes. This document does not assert any pending gate passed.
A source archive alone is not a turnkey installation or delivered business case.

Resume full P07 only with the original authorized P04 fiscal/format/archive case,
archive bytes/readback and P05 selected FiBu/version/profile, bounded adapter
rights/test endpoint, tenant/entity/currency/test documents and actual bound
booking/payment/allocation/cutoff observations. Preserve unresolved deviations;
never change COMMON, a sealed expected result or rights to manufacture acceptance.
