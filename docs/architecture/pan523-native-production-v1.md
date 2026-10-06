# P09 bounded native production and operative cost

P09 is additive SOURCE_EVIDENCE_ONLY software on the existing owned PAN472 target SQLite store. It does not introduce a database, MES, APS, productive manufacturing authority, fiscal invoice issuer, archive or qualified financial adapter.

## Real path and identity

The existing PAN515 entry owns the transaction, current native epoch/route, immutable trade history, STOP/REVOKE controls and opaque content-bound command grant. Optional P09 is loaded only for its exact new schemas, preserving legacy source consumers without the new module. One production binding freezes the actual native order/line revision, explicit local BOM and valuation. No caller role, copied result or metadata substitutes for that path.

Declared component opening stock and every confirmed material issue reuse the unchanged existing stock contract. A report includes good quantity, scrap, exact BOM material quantities, explicit resource minutes and selected rates. Only good quantity creates finished stock. Both histories commit in the same native transaction; a real SQL insertion failure rolls back both. Latest leading reads verify the coupled component ledger before exposing finished stock. Changed native order revision, BOM version or valuation version fails closed.

## Costs and partials

All minor-unit arithmetic uses safe exact integers. The selected local valuation includes all material and resource rates and planned times; missing facts are denied rather than defaulted. Standard cost is compared with confirmed material/resource cost at processed quantity, including scrap. The separate six-piece fictional input produces five good and one scrap: planned 486 minor units, confirmed 489, variance 3. This is an operative comparison, not a qualified balance-sheet valuation or profit.

Business effect identity, not transport identity, governs retries. Changed transport reuses the original receipt without another issue/finished receipt. A new effect cannot exceed the remaining order quantity; a final report must cover the declared processed quantity. Confirmed history is never overwritten.

## P03 and billing boundary

A separate explicitly fictional manufacturing path uses the unchanged native COMMON sales-order/P03 selectors and newly produced lots. It performs the existing real reservation, pick, pack and issue transitions. This is NOT a replay of the complete COMMON purchasing/finance reference, not a KIT-to-ARTICLE-A identity alias, and not an implicit purchase receipt. The independent local six-piece BOM/valuation and this ten-piece manufacturing source remain distinct.

A new technical operative invoice-reference schema persists an explicit exact document/line/date/amount/currency reference only after the actual P03 dispatch allocates entirely from confirmed production lots. The leading receipt and reference commit together. Reference-only documents cannot create revenue without that native link; repeated documents under new effect IDs are denied. Fiscal invoice creation/archive qualification and external finance stay unqualified. An incomplete billing quantity yields null contribution rather than a hidden allocation/default. The complete ten-piece synthetic scope yields revenue 100000, cost 810 and operative contribution 99190 minor units, explicitly NOT financial profit. Existing P06 fiscal billed-net semantics are not promoted by this technical reference.

## Operator

After the existing owner prepares/initializes a native PAN515 scope and the exact locked source is compiled:

    node scripts/run-pan523-production.mjs initialize --root <owned-native-root> --owner LOCAL_SYNTHETIC_OWNER --input <explicit-configuration.json>
    node scripts/run-pan523-production.mjs confirm --root <owned-native-root> --owner LOCAL_SYNTHETIC_OWNER --input <explicit-report-or-operative-reference.json>
    node scripts/run-pan523-production.mjs read --root <owned-native-root>
    node scripts/run-pan523-production.mjs stop --root <owned-native-root> --owner LOCAL_SYNTHETIC_OWNER --reason <explicit-reason>

The owner literal alone is not authority: the actual owned synthetic store, live native route/epoch and per-command opaque grant are still required. The operator has no prepare, productive, fiscal-qualification or network flag. Bounded non-symlink regular JSON files only; unknown flags/schemas are denied.

## Fallback and historical evidence

Stop appends immutable P09 control, disabling new reports including a previously issued grant while retaining confirmed component/finished movements, costs and original unrelated trade transitions. Corrections never erase confirmed history. Historical PAN515/PAN517 execution records and their original source pins remain unchanged. A closed one-file successor admission verifies retained raw predecessor bytes from exact delivered 54d4a597 and the separately current source hash; it is not an old execution rerun. Neighbor, extra-key, changed historical/current hash, wrong commit/artifact and relabelled-execution admissions are denied.

## Verification and limits

`npm run pan523:test` is a closed native suite. The existing explicitly supplied TMPDIR takes precedence; CI RUNNER_TEMP is the owned fallback, and absence of both fails closed. Caller filtering and invented qualification flags are rejected. Original four criteria/five negatives, actual native revision change, coupled-ledger corruption, SQL rollback, partial/retry, P03/billing references and fresh-process CLI are executable. These tests prove local synthetic software behavior only, not physical manufacture, human study, new source access, fiscal/FiBu qualification, installation or release delivery. Canonical proof, exact hosted CI, protected merge, new release, anonymous archive execution and release-event verification still govern delivery.
