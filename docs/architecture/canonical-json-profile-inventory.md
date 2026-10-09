# Canonical JSON / Digest Profile Inventory v1 (FND-PS-04)

- **Task ID:** CAMPAIGN-V1-FND-PS-04-INTEGRATE-01
- **Accepted census artifact:** `cfda3f1601b2a0d4430059933a2ca2e2a5107606` (#338)
- **Base commit (exact current public Main, `origin/main`):**
  `dac921d459cbcfc16e4912dff558c8786e6438de`
- **Companion artifacts:**
  - `verification/canonical-json-profile-inventory-v1.json` — machine-testable inventory
  - `tests/canonical-json-profile-inventory.test.ts` — deterministic scanner + fail-closed validator (31 tests)
- **Process context preserved (not re-litigated):** Operating Model v1.1 and decisions D-001 through D-007. No new process variant is introduced by this slice.

## Purpose and decision

This document records the refreshed repository-wide census of canonical JSON
serialization profiles on exact admitted Main. It is a **decision artifact and a
testable inventory**, not a utility consolidation:

1. **No implementation is declared equivalent to any other.** Equivalence stance is
   `NOT-PROVEN` with `claims: []`. The required evidence dimensions are
   `valid / invalid / unicode / number`; the existing runtime parity test
   (`tests/canonical-json-runtime-parity.test.mjs`, digest-pinned) proves
   **valid + invalid only**. `unicode` and `number` evidence is missing, so
   `missingDimensions: ["unicode", "number"]` and no equivalence claim is
   permitted. Similar names or shapes (30 similar-shape sites, see below) never
   produce an equivalence claim.
2. **No utility consolidation and no product-runtime change.** The slice changes
   only the three issue-authorized product paths. The 33 discovered
   `canonicalJson` implementations remain where they are; consolidating them
   would require the shared valid/invalid/Unicode/number proof that does not
   yet exist.
3. **Historical digest-bound bytes are not regenerated.** All 21 base-anchored byte
   obligations (13 pinned profile implementations, 1 parity-evidence test,
   1 parity fixture, 6 base-ledger name matches) are verified unchanged on
   disk against the immutable admitted-base fixture. Current coverage and the
   four derived census artifacts bind separately through `repository-integrity`.

## Scan methodology (single source of truth)

The scanner is embedded in `tests/canonical-json-profile-inventory.test.ts`;
the inventory JSON is generated from the same logic, and the validator
recomputes the scan at test time, so inventory and scanner cannot drift apart
silently.

- **Scan roots:** `src`, `packages`, `scripts`, `demo`, `tools`, `tests`,
  `benchmarks`, `docs` (skipping `node_modules`, `dist`, `.git`).
- **Extensions:** `.ts`, `.mts`, `.cts`, `.js`, `.mjs`, `.cjs`.
- **Self-exclusion:** the census test file itself is counted in
  `filesScanned` (591) but excluded from every census dimension, so the prose
  in this document and the test's own regexes can never skew the counts they
  define. A dedicated self-consistency test asserts this.
- **Detection (line-local, form-based):**
  - `declaration` — a line declaring `canonicalJson`
    (`function|const|let|var canonicalJson`);
  - `import site` — a line importing `canonicalJson` from a module;
  - `re-export` — an `export { ... canonicalJson ... }` line;
  - `similar-shape site` — a declaration of a canonicalize-family helper
    (`canonicalize`, `encodeCanonical`, `canonicalDigest`).
- **Classification (line-local, reproducible from a single source line):**
  - `alias` — a direct rebind of a canonicalize-family helper
    (`canonicalJson = encodeCanonical` / `canonicalJson = canonicalize`);
  - `wrapper` — an arrow-form declaration that delegates on the **same line**
    to a canonicalize-family helper;
  - `implementation` — everything else, including arrow functions with their
    own serialization body.
- **Owner family:** the second path segment under `src/`, `packages/`, or
  `tools/`; otherwise the top-level segment. Note `cks` legitimately spans
  `src/cks/` and `packages/cks/` (3 import files).
- **Ledger:** `SHA256SUMS`, one digest per line, leading `./` stripped.

## Integration ownership (current Main)

The accepted census is replayed without changing the historical byte set. Its
four decision/validator artifacts are digest-bound inputs of the existing
`repository-integrity` Verification Fabric node:

- `docs/architecture/canonical-json-profile-inventory.md` — `DERIVED_EVIDENCE`;
- `tests/fixtures/canonical-json-profile-base-obligations-v1.json` — `FIXTURE`;
- `verification/canonical-json-profile-inventory-v1.json` — `CONTRACT`;
- `tests/canonical-json-profile-inventory.test.ts` — `VALIDATOR`.

The validator rejects a stale `origin/main` base commit, an omitted or
mis-owned integration artifact, and any current-byte digest that differs from
the node declaration. `verification/verification-dag-v2.json` remains the
authoritative ownership declaration; its own change is graph-change
fail-closed, while `package.json` remains covered by central toolchain
invalidation. This adds no new process variant or runtime utility.

## Module contribution integration refresh

The module contribution registration adds three scanned `.mjs` files and five
public manifest / checksum ledger paths. The current mechanical inventory now
has **659 scanned files**, **1,870 ledger entries / unique paths** (no duplicates),
and the release manifest retains an exact **1,555 public paths** gate. Canonical
profile dimensions remain unchanged: 36 declaration sites/files, 221 import sites
in 220 files, 4 re-export sites and 30 similar-shape sites.

The immutable admitted-base commit, base-obligation fixture, historical digests
and profile-version migration chain are unchanged. Only current census counts
and derived integrity bindings advance. The table below records the earlier
admitted census, not the current integration totals.

## J03 local exact-pair integration refresh

PAN525 adds one read-only J03 owner at graph v83 and an additive integrity
generator migration V56. The unchanged mechanical scanner observes 858 source
files and 2,296 unique checksum paths; declaration/import/re-export/similar-shape
dimensions, the immutable 21-entry admitted-base fixture and every historical
migration remain intact. The current generator digest advances only through that
explicit migration. The runnable public manifest is unchanged. Only current
scanner counts and actual changed-byte bindings advance; no canonical-profile
equivalence claim or new source/execution authority is introduced.

## PUI-02 serial presentation integration refresh

PAN543 extends only the existing optional browser-shell owner at graph v93 with 98
nodes and adds the exact integrity-generator migration V70 after retained V69.
The unchanged scanner observes 1017 source files and 2505 unique checksum paths;
37 declaration sites/files, 297 import sites in 296 files, 7 re-export sites and 30
similar-shape sites remain unchanged. Every admitted profile retains its original
class, owner, line and pin semantics; only the explicitly migrated generator
digest advances. The immutable 21-entry base obligations, original consumer
families, non-equivalence classifications, runnable manifest and every hard gate
remain intact. This is source/inventory integration, not UI, canonical-CI, native
installer, publication or human acceptance.

## PUI-08 bounded native analysis registration (profile74)

PAN549 advances the graph to97 with one additional read-only result-view owner,
retaining all101 previous owners and every hard gate. The unchanged scanner
observes1064 source files,2560 unique checksum paths,37 declaration sites/files,
305 import sites in304 files,7 reexports and30 similar-shape sites. The21 immutable
base byte obligations,13 admitted pinned profiles and all historical migrations
remain intact. Only the exact generator migration V74 advances its current pin.
The fourteen source-only members do not expand the legacy runnable manifest.

The native STOCK projection and separately attached local Usage Insights cohort
retain their distinct cutoffs, provenance, revisions, units and availability.
The early counterpart descriptor remains immutable historical provenance, not
current renderer/build pins. Registration and local native/browser measurements
are not frozen canonical/CI, actual KS composition, release/archive/event or
original closure acceptance, nor new consent, transport or execution authority.

## DUI-02 early authentic context registration (profile75)

PAN548 adds exactly one context-selection owner at graph98, retaining all102
previous owners and every hard gate. The unchanged scanner measures1075 source
files; the complete fixed reentrancy fixture adds the2572nd unique checksum member.
Declaration/import/reexport/similar-shape dimensions remain37/306-in305/7/30,
with21 immutable base obligations and13 admitted pinned profiles. Explicit
integrity-generator migration V75 preserves all earlier migrations and digests.
The legacy runnable manifest remains1792 paths; new context members are exact
SOURCE_EVIDENCE_ONLY entries, not a turnkey package or inference/view-write grant.
Registry oracles retain strict exact generation/count and required-selection
assertions, extended additively for the new owner. Updating the mandatory video
registry oracle is not resuming the paused video project. These measured local
bindings are neither whole548/546 delivery nor review, canonical CI, merge,
release or human/device acceptance.

## Fresh census vs historical hints

Historical lexical counts (81 declarations / 80 files; 172 import sites /
171 files) are **historical hints, not expected truth**. The fresh mechanical
scan supersedes them:

| Metric | Fresh (admitted Main) | Historical hint |
|---|---|---|
| Files scanned | 591 | — |
| Declaration sites | 33 | 81 |
| Declaration files | 33 | 80 |
| Import sites | 194 | 172 |
| Import files | 193 | 171 |
| Re-export sites | 4 | — |
| Similar-shape sites | 30 | — |
| Byte obligations | 21 | — |
| Base-pinned profile files | 13 | — |

The large gap between the historical hint (81) and the fresh count (33) is
expected: the hint was produced by ad-hoc grep methods that disagree with each
other; this scan is the reproducible baseline. Fresh counts and uncertainty
are reproducible on admitted Main by running the census test.

## Profiles (33 declarations, 33 files)

30 `implementation`, 2 `alias`, 1 `wrapper`. By owner and class:

| Owner | implementation | alias | wrapper |
|---|---|---|---|
| cks-12 | 10 | — | — |
| contracts | 2 | 1 | — |
| cscl-01 | 1 | — | — |
| cscl-04 | — | 1 | — |
| cscl-05 | 1 | — | — |
| cscl-06 | 1 | — | — |
| cscl-07 | 1 | — | — |
| demo | 1 | — | — |
| rks-01 | 2 | — | 1 |
| scripts | 9 | — | — |
| tests | 1 | — | — |
| video-production-reference | 1 | — | — |

- Aliases: `packages/contracts/src/asf-synthetic-lifecycle-harness.ts:262`,
  `src/cscl-04/profile-builder.mjs:96`.
- Wrapper: `src/rks-01/deterministic-ingestion.mjs:20`
  (`export const canonicalJson = (value) => JSON.stringify(canonicalize(value));`).
  Arrow declarations with their own serialization body
  (`src/cscl-07/matrix.mjs:6`, `scripts/refresh-integrity-data.mjs:9`) are
  implementations, not wrappers — the classifier requires a same-line
  canonicalize-family helper reference for `wrapper`.
- Full file/line/owner/classification/digest table:
  `verification/canonical-json-profile-inventory-v1.json` → `profiles`.

## Consumers

- **14 consumer families**, 194 import sites across 193 files. Largest:
  `contracts` 124/124, `tests` 36/35 (one file with two import lines), `demo`
  9/9, `scripts` 8/8, `cks` 3/3. Full table:
  `verification/canonical-json-profile-inventory-v1.json` → `consumerFamilies`.
- **4 re-exports:** `demo/openclaw-agent/capability-m1-4-adapter.mjs:23`,
  `packages/contracts/src/index.ts:1`, `src/cscl-03/profile-builder.mjs:8`,
  `src/rks-02/comparator.mjs:6`.
- **30 similar-shape sites** (`canonicalize` 25, `encodeCanonical` 3,
  `canonicalDigest` 2) across contracts, scripts, tools, tests, and src
  families. Every entry carries `equivalence: "not-claimed"`.

## Byte obligations (21) and ledger state

Historical obligations derive from
`tests/fixtures/canonical-json-profile-base-obligations-v1.json`, which binds the
exact admitted base commit, its ledger digest, 13 pinned profile files and 21
byte obligations. Candidate `SHA256SUMS` is used for current coverage/counts but
cannot redefine these historical expectations.

Basis categories remain `profile-implementation` (13), `parity-evidence` (1),
`parity-fixture` (1), and base-ledger-name-match (6). The four derived census
artifacts bind separately through `repository-integrity` and therefore create no
self-referential hash cycle.

**Current canonical ledger state:**
- 1716 parseable digest lines and 1716 unique `./`-prefixed paths;
- zero duplicate paths and zero digest conflicts;
- the previously mixed-prefix duplicate tail was normalized mechanically.

The validator requires the obligation set to match exactly (no omitted,
duplicate, unknown, or tampered entries), each basis to match, and both the
recorded digest and the on-disk sha256 to agree. Any historical byte change
fails validation.

## Equivalence policy (fail-closed)

- `requiredDimensions: ["valid", "invalid", "unicode", "number"]`.
- Current evidence proves `valid` + `invalid` only (via
  `tests/canonical-json-runtime-parity.test.mjs`), so `stance: "NOT-PROVEN"`,
  `claims: []`, `missingDimensions: ["unicode", "number"]`.
- A claim is only stancable `PROVEN` when every claim covers all four
  dimensions; the validator rejects unproven claims, weakened dimension
  lists, and inconsistent stances. The parity test file and its fixture are
  byte-pinned, so the evidence itself cannot drift silently.

## Uncertainty and known limitations

- The census is **lexical/form-based**, not semantic: it counts declarations
  and import sites, not call graphs. Line-local classification is
  deliberately conservative — when in doubt, `implementation`.
- Owner families are mechanical path derivations, not code-ownership
  records.
- The scan roots exclude `.github`, `config`, and other non-code directories
  by design (source-code census); JSON fixture files are covered via the
  ledger name-match basis instead.
- A local Node exit 133/SIGTRAP or docker ENOENT during verification is
  infrastructure evidence, not a product verdict: record it, keep the
  artifact clean, and let the controller run the authoritative pinned-Node /
  host-Docker gates.

## Scope guard

This integration changes exactly ten issue and deterministic integration paths:
this document, inventory JSON, census test, immutable base-obligation fixture,
`package.json`, `verification/verification-dag-v2.json`, `SHA256SUMS`,
`release/public-files.manifest`, `scripts/build-public-release.sh`, and
`tests/release-governance.test.mjs`. No historical digest-bound source byte is
regenerated; no utility consolidation or product-runtime behavior change is
made; and no credential/remote/provider/service/CI/harness/DSH_HOME/spill
change, push, merge, or release occurs.
## PAN537 bounded legacy-browser successor (profile64)

The existing proposal browser correction adds one bounded source owner at
graph91, a closed mandatory native browser regression and readable before/after
preview. Profile64 preserves all admitted migration rows, source classes, base
obligations, old node semantics and hard gates. The existing dashboard stays
in the legacy payload; new tests, runner and documentation are source-only.
The unchanged scanner observes972 source files and2445 unique checksum paths;
its original declarations, imports and similar-shape non-equivalence remain
unchanged. This is a local development fork, not a composition or publication
of the held immutable PAN541 capability, a human/device/whole-setup acceptance
claim, productive authorization or release/closure qualification.


## PAN538 existing setup-bounds registration (profile65)

Profile65 advances graph91 to92 by extending the same existing dashboard
component owner and closed browser path with the fixed setup390 regression.
No source owner, predecessor test, hard gate or runnable manifest membership
is removed or duplicated. Every historical profile migration and immutable
admitted byte obligation stays intact; only the explicit current generator
digest and measured census anchors advance. The unchanged scanner observes
973 source files,2446 unique checksum paths,37 declaration sites/files,
294 import sites/293 import files,7 reexports and30 similar-shape sites.
All21 byte obligations and13 pinned-profile files retain their original
admission rules and non-equivalence stance.

The layout regression uses the genuine existing installer/native browser,
desktop and390 bounds, German synthetic content, CSS-layout200% stress,
keyboard, held delivery of a real reply, native403 denial and authenticated
bounded synthetic setup/readback. It is not a localization, browser-chrome
or physical-device certification, new productive/provider authority or an
exact-head canonical/CI/release/closure verdict. Original source/review and
public delivery gates remain mandatory on the authorized clean14232 lineage.

## PAN572 closed uninstall safety registration (profile67)

Profile67 keeps graph93 and its98 existing owners and hard gates. The new
uninstall regression belongs to the existing repository-integrity owner and
is present in the direct canonical test command, the checksum ledger and one
exact source-only builder classification. The legacy runnable manifest retains
its membership; an adjacent unknown regression file is still denied.

The unchanged mechanical scanner observes1000 source files and2476 unique
checksum paths,37 declaration sites/files,294 import sites/293 import files,
7 reexports and30 similar-shape sites. All21 byte obligations,13 pinned-profile
files, original base obligations, historical migrations and non-equivalence
classifications retain their admission rules. Only observed current bindings
and the explicit new generator migration advance.

The uninstall safety successor has a separate exact byte pin; the historical
uninstall pin and other legacy install/runtime/manifest pins stay unchanged.
Recorded Fake-Docker interactions and new exclusively owned no-network native
stop/data-retention/purge with a live independent control are separate evidence.
Neither proves a fresh full installer, ERP/model outcome, hostile same-user
sandbox, independent person review or canonical/CI/release/closure completion.

## PAN549 direct cohort integrity regression: measured consumer refresh

The genuine nested-report integrity regression imports the existing
canonicalJson function once in tests/pan549/cohort-analysis.test.mjs. The
unchanged scanner now observes1064 source files,37 declaration sites/files,
306 import sites/305 import files,7 reexports,30 similar-shape sites and2560
unique checksum entries. The tests consumer family is69 sites/68 files.
Only these measured current import anchors advance. Scanner logic, strict
validator, historical migrations,21 byte obligations,13 pinned-profile files,
original admitted bytes and the non-equivalence stance are unchanged.

This metadata refresh does not waive any tests, native boundary checks,
review, whole-canonical, CI, release or anonymous product-readback gates.

## PAN546 additive personal view and connected Human registration (profile76)

Profile76 retains graph98 and all103 existing owners and hard gates. The fixed
complete native/shared-contract/browser entry and26 exact source-only members
are additive to the existing shell/profile owner; the legacy runnable manifest
is unchanged. Every old selected test remains selected, including the newly
required pan546:test command in affected dependency closures.

The actual unchanged mechanical scanner observes1099 source files,
37 declaration sites/files,307 import sites/306 import files,7 reexports,
30 similar-shape sites and2598 unique checksum paths. All21 byte obligations,
13 pinned-profile files, immutable base obligations, historical migrations,
scanner/validator and negative tests remain unchanged; only the explicit
current generator migration and observed census bindings advance.

This is mechanical inventory, not a runtime, native/browser, image, CI,
WholeCanonical, real-model, KS-composition, merge, release or delivery PASS.
The actual425 stale-census/selection failures remain historical evidence;
the required current metadata tests must exercise these new exact bytes.
