# Partial portable RuntimeIdentity development contract

Status: PARTIAL_DEVELOPMENT_CONTRACT_NOT_RUNTIME_OR_RELEASE_QUALIFICATION.

PAN526 leads this common schema; KS292 consumes the same immutable candidate.
Implemented and contract-tested scope is RuntimeIdentity only. ReadinessReceipt,
Desired/Observed state, LifecycleJob, measurement and native startup/restore
qualification are not part of this candidate and are not claimed. Their later
candidates require their own immutable identities. No reciprocal CLOSED gate.

Candidate path: `contracts/runtime-portability/candidates/runtime-identity-development-v1.schema.json`.
SHA256 of exact candidate bytes: `e2d6f05c82776f099d25f10098fd723558f4271eae2820d848e589dcf305b0d4`.
Source baseline: `39720e8862911df72bc674ad52f813e2df2f3d1e`;
baseline tree: `a958b381bd766a848b754058d018e63a354f1754`.
The candidate commit/tree and raw immutable URL are supplied in the exact
PAN526/KS292 handoff comment after provider readback, not guessed into this file.

The JSON Schema draft2020-12 root references `$defs/RuntimeIdentity`. All identity
objects are closed, with exact lowercase40-byte-hex source commit/tree, exact
sha256 image identity, x86_64 architecture, product/runtime/contract versions,
instance/tenant/generation and configuration/template/policy/network digests.
`effectiveRights` is a closed declaration of existing bound operation labels,
not an execution grant. PAN uses node; the KS component declares superset.
Component/runtime mismatch, mutable main/latest identities, extra properties,
unknown components/rights and secret fields are denied. SAFE_GUIDED is the only
profile in this partial contract; it does not extend the legacy local demo.

The shape contract does not prove actual observed runtime, readiness,
authentication, source/publication rights, business success, clean initialization,
performance, restore, complete PAN526 or KS292 acceptance, or a released product.
The first product-path contract test genuinely went RED then GREEN; raw execution
is retained privately. Identity canonical digest uses the existing sorted-key
plain-JSON profile. Caller proof booleans, roles and generic authority fields are
absent; receipts/identity labels never replace existing protected authority.

The local loopback installer and Compose bytes are unchanged. Sole PAN WIP is
526; PAN525 is already delivered. Standalone startup/profiling and later paired
adapter qualification do not wait for each other's complete releases.
