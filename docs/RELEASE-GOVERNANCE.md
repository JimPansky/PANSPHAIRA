# Release governance

This document is the canonical, fail-closed publication contract for
PanSphaira. The machine-readable companion is
[`release/governance.json`](../release/governance.json), enforced by
`npm run release-governance:verify` in every pull request.

## Release taxonomy and current public truth

The versioned `chimpmaera.release-taxonomy/v1` contract has two new-release
classes:

| Class | Runnable meaning | Custom-asset contract | GitHub Latest |
| --- | --- | --- | --- |
| `REGULAR_RUNNABLE_ARTIFACT` | A project-built runnable archive | One `.tar.gz` archive and its exact `.sha256` sidecar; body, API inventory, downloaded size/hash and sidecar content must agree | Eligible only when governance designates this class |
| `SOURCE_EVIDENCE_ONLY` | Source/evidence at one exact merge commit; not a project-built runnable artifact | No custom assets and the body must say exactly `NO_ASSETS_SOURCE_ONLY` | Eligible only when governance designates this class; ownership does not supersede the runnable artifact |

The reconciled public identities at this governance baseline are deliberately
separate:

- **Current Main source:** the moving public `main` ref. A checkout obtains its
  exact identity with `git rev-parse HEAD`; governance cannot self-embed the SHA
  of the commit that contains itself.
- **GitHub Latest:** `2026_09_02_v7`, target
  `1e65fee46c609ba7239d63b9c245b32e045e004c`, an explicitly reconciled
  `SOURCE_EVIDENCE_ONLY` record with no custom assets.
- **Historical verified runnable artifact:**
  `v0.2.0-poc.20260825.1`, target
  `33d19f3e96ccc512038dbf06063f19489e067390`, with its immutable archive and
  SHA-256 sidecar. It was the verified runnable artifact at that reconciliation
  baseline; it is not GitHub Latest and does not contain later Main source.
- **Earlier history:** `v0.1.0` and unlisted pre-taxonomy releases remain
  historical evidence. They are not silently reclassified or granted v2
  conformance.

Both named records above are legacy pre-v2 releases. Their exact existing
metadata/body/asset state is recorded under `legacyReleaseExceptions` solely
for `REL-TRUTH-AC06` readback. That explicit exception does not authorize a tag,
body, target or asset rewrite and is no precedent for a new release.

## Product increments, not calendar identity

A public release is named for the functional, evidence-backed increment it
delivers. A date or editorial cadence may appear as provenance, but labels such
as “Daily”, “today's release” or “previous Daily” must not be the identity of a
new conforming release. Calendar-shaped historical records remain factual
provenance rather than a naming template. That historical runnable artifact's
canonical-number hardening rejects negative zero before canonicalization in
Verification Fabric timestamps and Extension Assurance Profile numeric
boundaries. It performs no migration, restore, filesystem, package, schema or
service mutation, pointer switch, rollback execution, activation, promotion,
production deployment or external completion inference.

Editorial Daily content is independent. It may describe progress, decisions,
learnings or a preview. It does not gate a release and must not claim that a
version was published until the anonymous public readback below passes.

## Release-state policy

- **Draft:** preparation only; never public/current.
- **Prerelease:** an explicitly labeled preview; never GitHub Latest under this
  contract.
- **GitHub Latest:** exactly one `draft=false`, `prerelease=false` release whose
  body class equals `releaseTaxonomy.githubLatestOwnerClass` and whose tag
  resolves from anonymous `/releases/latest` readback.
- **Runnable-artifact current:** the separately recorded, checksum-bound
  runnable artifact. It can differ from GitHub Latest when Latest is
  `SOURCE_EVIDENCE_ONLY`.

Repository state, CI, a tag, authenticated API output or an editorial post is
insufficient by itself. After publication, run:

```sh
env -u GH_TOKEN -u GITHUB_TOKEN npm run release-governance:public-readback
```

The verifier sends no authorization header. The baseline readback checks the
release ID, publication timestamp and URL, tag reference, release title/body,
target, Latest/draft/prerelease state, exact asset-name set, sizes,
asset-manifest content and SHA-256 bytes. New-release mode also compares the
local governed surfaces with anonymous raw bytes at the exact target commit.
Unknown, missing or extra evidence fails closed. The baseline command reads the
two explicitly reconciled legacy records. New publication closure uses the
release-event command documented below and never accepts a legacy exception.

## Exact release-body contract

### Forward non-Latest runnable designation

`pansphaira.release/non-latest-runnable/v1` adds an explicit forward-only
designation under `forwardRunnableReleases`. It does not mutate either legacy
record, grant retroactive conformance, or change `githubLatestOwnerClass`.
The designated tag `v0.3.0-offline-updater.1` names the selected PAN465 offline
retained-native profile and must include issue #465. A designation is not
publication, runtime qualification, or issue-closure evidence.

Designation is checked before choosing a release-body class branch. This tag
cannot relabel itself `SOURCE_EVIDENCE_ONLY`, omit its issue/assets, or become
Latest through the normal source-only path. Non-designated conforming
source-only owner releases retain their existing path.

A designated `REGULAR_RUNNABLE_ARTIFACT` must be published with
`make_latest=false`. Its independent anonymous tag readback still verifies the
exact checkout/merge/tag commit, complete eight-section body, bounded claim
ownership, exact archive/sidecar inventory, downloaded bytes, and raw governed
surfaces. It must return `latest:false` rather than pretending to own Latest.
The archive and its SHA-256 sidecar are the only custom assets; signatures and
receipts belonging to the profile must be inventoried inside the archive.

The verifier additionally reads the actual Latest owner's full release
metadata both from `/releases/latest` and `/releases/tags/<owner-tag>`, and its
exact `/git/ref/tags/<owner-tag>` target. The two provider observations must
agree on ID, body, publication time, URL, target and non-draft/non-prerelease
state. That owner must be `SOURCE_EVIDENCE_ONLY`, with the exact no-assets
marker and no custom assets, and its body/target/tag SHA must agree. A stale
tag-only assertion is insufficient. The owner's merge section must contain
exactly one unambiguous merge declaration; duplicate declarations, including
duplicates with equal values, are denied. Requested tags, returned release
tags, and both returned `refs/tags/<tag>` names are explicitly cross-bound.
The new runnable tag becoming Latest,
an undesignated tag, missing owner readback, target drift, extra assets or
corrupt archive bytes all fail closed. Existing source-only Latest and all
historical reconciliation gates retain their previous requirements.

The explicit auxiliary-owner policy is
`CONFORMING_NONHISTORICAL_SOURCE_ONLY`. Forward designations cannot overlap
protected historical tags. Recognized historical tags or recorded release IDs
cannot be treated as new conforming releases or auxiliary forward owners,
even if fresh provider responses agree on a rewritten body or moved target.
Their exact legacy readback path remains unchanged; no v2 conformance is
granted retroactively. If actual Latest is a preserved legacy record rather
than a conforming nonhistorical source-only owner, this forward publication
path is held. Do not resolve that hold by rewriting history, inventing an
unrelated release, or changing the owner policy silently. The finalizer must
observe the actual supported owner anonymously again at delivery time.

The standard `--release-tag ... --require-conforming` command and publication
workflow apply unchanged. No caller may use this designation to waive exact
CI, current-head Docker E2E, independent acceptance, privacy, public readback,
or the original acceptance criteria.

### Required body sections

Every new release body uses each of these H2 headings exactly once and in the
declared contract order:

1. `Release class` with one `RELEASE_CLASS: <class>` line;
2. `Exact merge SHA` with `MERGE_SHA: <40-lowercase-hex>`;
3. `Included capabilities and issues` with at least one `CAPABILITY` and one
   `ISSUE` line;
4. `Evidence boundary` with one exact `CLAIM_PROOF` ownership line for every
   listed material capability;
5. `Tests` with every executable gate and `=> PASS`;
6. `Assets and checksums`, containing every exact asset name, byte size and
   SHA-256 digest for a runnable release, or exactly
   `NO_ASSETS_SOURCE_ONLY` for a source/evidence-only release;
7. `Nonclaims` with at least one explicit limitation; and
8. `Closure state`, containing `PUBLIC_READBACK: PENDING` and
   `ISSUE_QUEUE_TERMINAL: BLOCKED_PENDING_PUBLIC_READBACK`.

Each evidence line has this closed field order:

```text
- CLAIM_PROOF: <claim-id> | MATURITY=<maturity> | PROOF_CLASS=<proof-class> | ARTIFACT=<documented-path-or-exact-provider-commit> | EXACT_IDENTITY=<sha256:digest-or-git:sha> | GATE=<EXECUTABLE:command-or-ANONYMOUS_PUBLIC_READBACK> | NONCLAIM=<bounded nonclaim>
```

Local artifact paths must exist at the exact published head, be present in the
public manifest and match the stated digest. A release page/body cannot attest
itself, and caller-supplied expected values cannot replace tag/provider
readback. A regular/runnable body lists the archive and sidecar as
`- ASSET: <name> | SIZE=<bytes> | SHA256=<digest>`. The source/evidence-only
marker and an asset list are mutually exclusive.

## Required publication evidence

Before publication, the pull request must contain:

1. a functional increment name, intended class and exact expected tag;
2. the complete release body except for provider-created metadata, with the
   exact merge SHA filled only from the merged commit;
3. claim-to-proof ownership and explicit nonclaims;
4. class-specific asset inventory or `NO_ASSETS_SOURCE_ONLY`;
5. conservative Security Assurance and Known Limitations boundaries;
6. focused positive and complete adversarial validator tests;
7. secret/private-path scanning of active public surfaces; and
8. green repository, lint, checksum, supply-chain and contradiction-preflight
   gates.

After publication, preserve an anonymous readback record for the tag, Latest
state, public docs, release metadata and every asset byte. Editing title/body
does not authorize changing a tag, target or asset. Any mismatch blocks the
public claim and requires correction or rollback.

## Publication workflow gate

`.github/workflows/release-public-readback.yml` is triggered only after GitHub
emits `release.published`. It checks out the event's immutable tag without
persisted credentials. Before public readback it requires the reusable bounded
current-head Docker E2E at the release event's exact 40-hex target. A branch,
tag alias, stale head, failed or missing receipt, unhealthy service, fixture
drift, missing provider readback, timeout or owned residue fails the release
job. It then verifies repository integrity and the release-authority
adversarial matrix, unsets both `GH_TOKEN` and `GITHUB_TOKEN`, and runs:

```sh
npm run release-governance:public-readback -- --release-tag "$RELEASE_TAG" --require-conforming
```

The tag comes from `github.event.release.tag_name`; class, merge SHA, target,
Latest state, body, assets and checksums are derived from anonymous provider
readback rather than caller assertions. The workflow has only `contents: read`
and no issue or Queue mutation authority. A failing or missing gate is not
closure evidence: the final owner must not close an included issue or mark its
Queue row terminal until this exact post-creation job succeeds.

## Current-head Docker E2E closure

The machine policy is `currentHeadDockerE2E` in `release/governance.json`; the
closed six-criterion mapping is
`verification/demo-current-head-e2e/contract-v1.json`. Scheduled and manual
runs use the immutable workflow-event SHA, while a release run receives only
the provider event's exact target. Ordinary pull requests execute
`node --test tests/demo-current-head-e2e*.test.mjs` and do not pay the Docker
runtime cost.

The retained 14-day receipt binds commit/tree, pinned OCI and Compose inputs,
fixture digests, healthy services, governed synthetic effect, authoritative
provider readback and ownership-scoped zero-residue purge. It retains no raw
provider payload, generated credential, customer data or runner path. The
runtime is capped at 2,100 seconds inside a 45-minute job, and `always()` runs
an idempotent exact-namespace purge before artifact upload.

Release publication success is not final completion by itself. Final closure
requires provider-read successful E2E, public-readback and repository hard
gates for the same commit/tree; a receipt completed after the released-tree
timestamp and no more than 168 hours old; the complete fixed adversarial case
set; anonymous public issue `CLOSED`/`COMPLETED`; and authoritative Queue
`DONE` with no owner or residual ownership. Caller-authored PASS, a release
body, local package state and a re-digested overclaim are not evidence. The
validator is read-only and performs no release, issue, Queue or provider
mutation.

## Bounded contradiction preflight

Every public delivery maps each material claim ID to one maturity, one allowed
proof class, one authoritative artifact, one exact identity, one executable or
anonymous-readback gate and an explicit nonclaim. The v1 matrix allows only:

- `RELEASED_LOCAL_SYNTHETIC` → `LOCAL_EXECUTABLE` → `EXECUTABLE`;
- `SOURCE_EVIDENCE_ONLY` → `SOURCE_EVIDENCE` → executable or anonymous public
  readback; and
- `PUBLIC_PROVIDER_OBSERVED` → `ANONYMOUS_PUBLIC_READBACK` → anonymous public
  readback.

Release-identity drift, proof-class inflation, a missing exact-head documented
path, circular or caller-minted provenance, stale public status and stale
governance fail closed. A bounded legacy inconsistency is allowed only when the
governance file names an exact acceptance ID and its negative regression probe;
an exception cannot manufacture conformance or authorize historical mutation.

## Public README and documentation presentation

Every pull request and release candidate must inspect the root README on both
mobile and desktop rendering, not only as Markdown source. Accessibility is
part of the release surface: meaningful images require non-empty, descriptive
alt text, while an extended text alternative may live in a compact
`<details>` disclosure or in clearly linked architecture documentation.

The release-governance verifier applies this rule to the paths declared in
`activePublicFiles`. Unencapsulated technical labels such as `Text fallback:`
or placeholder labels fail closed because they turn implementation scaffolding
into primary public copy. Empty or generic Markdown/HTML image alt text also
fails closed. Declared historical archive prefixes remain immutable evidence
and are not retroactively rewritten by this presentation gate. The check does
not claim exhaustive assistive-technology certification; it preserves useful
alternatives while keeping the active README and documentation
orientation-focused.

## Claim/evidence boundary

The canonical mappings live in `release/governance.json`. Every claim needs a
stable ID, existing evidence paths and at least one non-claim. For this proof of
concept, evidence is local and synthetic. It does not establish production
readiness, certification, universal containment, customer-data fitness,
generic ETL/MDM capability or a production system of record.

Each grouped functional component in a release additionally records its
user-oriented claim and value, included public-manifest bytes, focused positive
proof, relevant changed-surface fail-closed proof, explicit non-claims, and
PDCA plus exact release-commit and asset-checksum bindings. The governance
validator requires included bytes and focused proof paths to be present in the
public manifest. Repository PDCA paths must exist but remain outside the public
asset under the existing development-evidence hygiene rule. This is release
evidence for included functionality, not a separate product scope or an
invitation to add broad optional test matrices.

## Active videos and historical evidence

Only video IDs listed under `videos.activeVerifiedIds` may appear on active
README Watch/video surfaces. Withdrawn IDs fail validation. Historical Daily
candidate records under the declared archive prefixes remain immutable
provenance and are not scanned as current public identity.

## Change procedure and rollback

Change the canonical JSON, docs, validator and tests together. Preserve asset
bytes and tags unless a separate release task explicitly authorizes replacing
them. A metadata-only correction is reversible by restoring the prior
title/body; first record the tag/target and anonymous asset inventory so the
rollback cannot silently mutate release evidence.
