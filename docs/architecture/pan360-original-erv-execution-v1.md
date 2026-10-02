# PAN360 original ERV execution v1

This bounded successor executes the original frozen LEAN versus changed ERV requirement from issue365 comment5508575190 and issue366 comment5508575402. It does not overwrite the historical AP04/AP05/AP06 fixtures or their correct100bps/UNKNOWN evidence.

## Scope and actual entry point

After `npm run build`, run `npm run pan360:entry` for the complete actual report, or `npm run pan360:check` for a fresh execution and byte-exact comparison against `verification/pan360-original-erv-execution-v1.json`. An absolute owned `TMPDIR` or `RUNNER_TEMP` is required. No network call, OCR/model provider, customer input, production posting, credentials or ERP is part of this execution.

The high invoice is an explicitly declared public hand-authored synthetic structured-text document for EUR12000.00. Four pinned document variants exercise the original strictly-greater-than approval threshold below, equal to and above EUR10000.00. The retained deterministic key-value extractor reads the amount from the actual bytes. PO and receipt extraction remain UNKNOWN; independent frozen synthetic counterparty references are admitted separately. Their supplier/quantity/unit/currency values are not copied from the extraction or silently repaired.

## Version and preserved sources

`src/pan360/original-erv-core-v1.mjs` admits a fixed closed public profile with LEAN_INVOICE_ONLY_V1@1.0.0, THREE_WAY_RELATIONAL_V2@1.0.0, and RATE_BPS_V1@2.0.0 fixed at200bps. It reuses the unchanged released amount engine and adds closed provenance and relational admission. The historical RATE_BPS_V1@1.0.0 remains100bps and is a real conflicting discriminator. Neither the historical fixed-pack compiler nor its source bytes are relabelled as support for the new profile. New wrapper/input/composition qualification is separate from source identity.

Both compared executions use exactly the same versioned wrapper and retained intake storage, extraction, amount-matching, setup dialogue and neutral UI consumer bytes. Core, input and composition digests are recorded independently. The old setup fixture's TWO_WAY baseline is not evidence of invoice-only behavior: the new explicit adapter delta records that mismatch and resolves the original LEAN no-mandatory-PO/receipt requirement to the new admitted version. The requested200bps value and separate approval threshold are fully bound, not inferred from a generic rate ID.

## Executed outputs and limits

LEAN returns invoice-only validation, explicitly not a PO/receipt or full three-way match. The changed execution evaluates separately admitted Supplier/PO/Receipt/Invoice relations with200bps, executes the separate local synthetic approval above1000000 EUR minor, writes and rereads an owned temporary journal, and removes that directory before success. Distinct synthetic requester/approver names are test actors, not real IAM authentication or production approval authority.

The actual decision/advisor/approval and intake readback feed the UI producer. The retained schema-neutral consumer renders the actual package, with labels, evidence citations, explicit missing-reference UNKNOWN fields and Authority NONE. The UI trusted digest is obtained from the actual producer. A self-rehashed package can be neutral data without becoming trusted source evidence. No desktop/mobile visual or production-frontend claim follows from these machine tests.

The receipt report binds both actual executions, requirement/configuration/dialogue digests, identical core/module identities, advisor/process/UI/readback differences and an explicit reuse receipt. A fresh CLI check reconstructs actual producer outputs; it does not trust a caller-supplied hash. The report verifier requires an independently retained producer digest; passing a caller's own digest alone is not source admission.

All six standalone analytics projections remain present. Historical synthetic extraction analyses1/2 are consumed byte-pinned without new OCR or new-pair-quality claims. Versioned analyses3–6 project the actual two-execution denominator,200bps configuration, exceptions, separate approval requirement and readback. MATCHED is not automatically approved. Historical and new denominators are not conflated. No identity, arbitrary query, financial/fraud opinion or production dashboard is emitted by the aggregate projection.

## Focused qualification and delivery

`npm run pan360:test` covers actual pair execution, deterministic dialogue/order/replay, actual threshold document inputs, missing references, relational mismatch and duplicates, cancellation, tamper, hidden authority, missing/re-digested readback, unsupported/substituted200→100 config, independent approval counterpart, actual isolated core mutation, source/UI/receipt forgery and six-analytic projection.

The original development RED, historical UNKNOWNs and100bps counterexamples remain valid retained evidence. Checked-in report status is explicitly pending independent Original9 acceptance and delivery. It is not a self-issued GO/NARROW_GO or a completed release. Original360 and affected AP06 obligations remain open until independent acceptance, exact required CI, protected current-Main merge, new correctly classified release, anonymous exact-byte readback and actual released-source replay. README publication is separately governed; no marker changes here.
