# Bounded product offering-purpose semantic successor v1

This is the named PAN487 successor, not a rewritten CSCL-11 historical verdict.
The actual repository mapping/evaluation entry exports
`evaluateProductPurposeSemanticV1` from `src/cscl-11/holdout-gate.mjs`, implemented
in `src/cscl-11/product-purpose-semantic-v1.mjs`. The executable is:

```sh
node scripts/evaluate-product-purpose-semantic-v1.mjs < request.json > result.json
```

Exactly one closed v1 request is read from stdin and one closed v1 result is
written to stdout. A well-formed positive, contradiction, unmapped or unknown
semantic result exits0. Admission errors exit2 with diagnostics on stderr and no
semantic stdout. There are no requested output paths, network, SQL, provider,
activation or effect grants. The input is at most131072bytes and has at most16
obligations and32rows per captured relation.

## Fixed scope and independently observed meaning

The frozen seam is PRODUCT_ITEM_MANAGEMENT / objects-roles / purpose, proposed
CORE target product-item-shared-purpose. Its single shared assertion concerns a
reusable catalogue offering, not five separate semantic obligations derived from
training systems. It distinguishes an offering record from an order-owned sales
occurrence even when names agree and the line references the real offering.
Native field equality, stock policy, units, routes, processes and other families
are outside this verdict. A nonstocked service can be a catalogue offering.

The exact original source/candidate baseline and public prior decision rule are
preserved in the closed request/rule contracts. Historical candidate bytes,
source facts, protocol, schemas and #317/#328/#329 verdicts remain immutable in
Git and retained artifacts. Existing legacy functions are unchanged; only the
explicit successor export is added to the mapping/evaluation entry.

The historical builder sets generated preservation/contradiction/unmapped flags.
Those flags and its five-core denominator establish structural proposal/transport
facts, not independently evaluated business equivalence. The old frozen family
80/20 protocol is not silently changed and historical product GO is not relabeled
as a new independent semantic finding or a universal failure. This successor
separates request/schema/digest admission from an observed business result.

For every declared obligation, retained in input order and in the full positive
denominator:

1. Omitted or UNMAPPED selected mapping yields UNMAPPED.
2. A proposed native key witnessed as an order-owned line yields CONTRADICTED,
   even if it is also witnessed in the catalogue.
3. Otherwise a catalogue witness yields PRESERVED.
4. Otherwise the bounded capture yields UNKNOWN, not global absence.

Evidence pointers name every matching catalogue row first, then every matching
sales line, preserving array order. A line's offeringKey is not substituted for
its own key. Candidate flags, display names, receipt denominators and matching
hashes never decide semantic correctness. Actual category counts partition the
complete inventory. If any evidence remains unsupported, final semantic totals
are null and exact observed counts are lower bounds. Any contradiction takes
verdict precedence, then UNKNOWN, then UNMAPPED; GO requires every obligation to
be observed preserved. There is no80percent shortcut in this successor.

## Integrity and actual-path checks

Public request/result schemas and decision-rule bytes were copied exactly from
the authorized implementer-safe packet. Both public calibration files are marked
training/calibration, never blind-score evidence. The actual entry rejects
source/candidate/rule drift, off-seam context or targets, duplicate obligation or
mapping IDs, duplicates within either relation, invalid offering references,
unrecognized fields, invalid synthetic bindings/receipt/request digests, unsafe
wire numbers/strings, duplicate JSON keys, invalid UTF8 and oversized transport.
Cross-relation collisions are meaningful admitted evidence, not schema errors.

The public wire admits integer JSON tokens, not decimal or exponent tokens that
happen to normalize to integers. The bounded entry checks exact numeric token
sources after the unchanged shared strict parser; `9.0` and `9e0` are admission
errors, while those spellings inside string labels remain ordinary text. This
transport correction does not change the public contract or semantic rule.

Tests invoke the actual module export and actual stdin/stdout executable. The
initial public development run passes38cases:18public-calibration/implementer
checks and20unchanged historical CSCL-11 regressions. These development results
are not a frozen-candidate, independent or held-out acceptance claim. Repository
registration/integrity, full freeze, independently reviewed changed entry,
exact-head CI, merge, honestly classified release and public artifact readback
remain separate mandatory gates.

## Custody and applicability

Main exclusively retains and runs the sealed evaluator. No sealed inputs,
expectations, reference code, case names, logs, manifests or mounts enter the
implementation/tuning workspace, including after a failure. Before Main-only
held-out execution, bind a complete exact candidate commit and executable
closure: entry/module/imports, contracts, source/candidate data, decision rule,
lockfile, actual installed dependency identity, Node version and launch arguments.
Public calibration and implementer-authored cases cannot substitute for that
independent comparison. A negative frozen result remains negative; do not tune
cases, reference, candidate core or the fixed rule to force success.

The overlay rows are independently authored synthetic observations, not recovered
private originals or actual iDempiere source facts. The historical wire's
holdoutSystemId is transport context only. The result applies solely to this
synthetic offering-purpose capture. No whole-family, universal ERP equivalence,
production/customer, provider/SQL, runtime activation, operational authority,
privacy/PKI or host-isolation qualification is implied.
