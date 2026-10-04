---
title: External BI service contract v2
description: Connect PanSphaira to independently released KaleidoSphere through the stable, fail-closed SBA v2 compatibility boundary.
---

# External BI service contract v2

KaleidoSphere is the sole owner of BI discovery, database adapters, analysis,
semantic/KPI/graph logic, previews and Superset execution. PanSphaira (CM)
retains only a thin generic client plus its existing generic orchestration,
approval and UI boundaries. CM does not vendor or start KaleidoSphere, own its
containers or volumes, receive database or Superset credentials, forward
SQL/raw rows, or apply/publish a BI result.

`SBA` remains the compatibility abbreviation for this boundary. Stable
`superset-bi-agent.*` schema and product IDs, `BI_AGENT_*` environment
variables, `/v2` routes and the `bi-agent` runtime component name are unchanged.

The legacy default pair remains SBA product `v0.8.0` and external contract
`2.0.0`. PAN524 adds one explicitly selected current pair, described below;
there is no automatic latest-version negotiation.
PanSphaira owns the expected compatibility profile
`pansphaira.external-bi-service/compatibility-profile/v2`; transport
configuration cannot supply, replace or attest that profile. A closed named
selection may choose only the code-owned pair described below. CM first verifies
`GET /v2/capabilities`, including the canonical SHA-256 digest, the exact
product and contract identities, the six capability descriptors, the accepted
Adaptive Graph incumbent `adaptive-v1`, and the declared
non-credential/non-SQL/non-mutation boundaries. It then sends closed requests
to `POST /v2/intents` and verifies product, contract, attestation binding and
response digest on every result.

The only admitted capability tuple is versioned and ordered as follows:

| Capability | Action | Authority |
| --- | --- | --- |
| `bi.status.read` | `status` | `read-only` |
| `bi.discovery.run` | `discovery` | `local-evidence-write` |
| `bi.analysis.run` | `analyze` | `source-read-only` |
| `bi.graph.adaptive-v1.plan` | `plan` | `proposal-only` |
| `bi.preview.create` | `preview` | `proposal-only` |
| `bi.readback.read` | `readback` | `read-only` |

Unknown or extra products, stale versions, substituted product/contract pairs,
changed capability descriptors, reordered or incomplete capability sets, and
fully re-digested forged profiles are not alternate compatibility modes. They
are denied.

## Configuration

BI is optional and default-off. Configure only the SBA root URL:

```sh
BI_AGENT_BASE_URL=http://127.0.0.1:18790
BI_AGENT_TIMEOUT_MS=5000
```

No BI variables means `DISABLED`. `BI_AGENT_EXPECTED_PRODUCT_VERSION` and
`BI_AGENT_EXPECTED_CONTRACT_VERSION` are explicitly rejected: an operator or
caller cannot override PanSphaira's owner-derived profile. A wrong
version/contract/capability/digest, malformed payload, unsafe request or
unavailable/timeout condition fails closed as `DENIED` or `UNAVAILABLE`.
`SUPERSET_BASE_URL` is explicitly rejected.

## PAN524 exact current pair (J01/J02)

Opt in to the single code-owned profile, not an arbitrary version override:

```sh
BI_AGENT_BASE_URL=http://127.0.0.1:18790
BI_AGENT_PAIR_PROFILE=KS_J02_0181_C2_V1
BI_AGENT_TIMEOUT_MS=30000
```

This binds the agent product `v0.18.1`, contract `2.0.0`, package
`@chimpmaera-bi/agent` version `0.18.1`, and package SHA-256
`826bcc27fa1a59514001b550a8d07c2fd129bf68089ddc98bdf626b2eb346145`.
The exact published counterpart source is
`92f47ef2d5dc74bd44fa3a71c7a296da23c9b928`; its root package version
`0.26.0` is not the agent version. Each call checks `/v2/capabilities`
and `/v2/provider-profile` before dispatching any intent. The latter is bound
to canonical profile digest
`sha256:9d50be8fad2ba9f3432e1461a2a9d9b08a567097d5f9a88ec86b7405230f9b04`,
the exact package identity and its complete, single-attestation set.
A redigested modified artifact, missing or additional attestation, substituted
contract, reordered capability tuple or wildcard selection is denied.

The six external intents remain unchanged. Three additional descriptors,
`trusted-apply`, `trusted-readback` and `trusted-rollback`, are known partial
trusted-only operations with `externalIntent: false`. Their presence does not
permit PAN to invoke them. PAN still rejects source credentials, raw rows,
free SQL and unsafe routing input before transport; the direct order receiver
is a separate, unchanged boundary. Known metadata does not authorize registry
promotion, a private source, deployment or productive persistence.

The reproducible current-pair consumer is:

```sh
npm run pan524:test
npm run build --silent
node scripts/verify-pan524-exact-bi-pair-v1.mjs http://127.0.0.1:18790
```

The last command requires an explicitly supplied already-running genuine
provider configured for an owned public synthetic fixture. It does not start,
vendor or modify a provider, call a paid LLM, or grant source/Superset rights.
It exercises status, discovery, analysis, plan, preview and readback through
the actual PAN client, checks their read-only/proposal-only results and
`NOT_APPLIED`, and rejects deliberately modified live response captures for
the original identity/attestation negatives. Modified captures are fault
injection, not a replacement provider or a separate paired PASS. Its output
is scoped to the exact selected profile and observed synthetic runtime;
it does not prove live customer data access or productive persistence.

Remove `BI_AGENT_PAIR_PROFILE` to restore the retained legacy `v0.8.0` profile;
a current provider then fails closed rather than falling back to a wildcard.
Remove `BI_AGENT_BASE_URL` and the other BI variables to disable BI altogether.
The original legacy holdout and runner below are retained as separate evidence,
not relabelled as a current-pair run. J02 can consume an immutable PAN contract
candidate before issue closure; J03 must aggregate the same qualified pair run,
not demand mutual CLOSED states or infer promotion from profile metadata.

## Allowed intent boundary

CM may request only `status`, `discovery`, `analyze`, `plan`, `preview`, and
`readback`. Runtime guards reject unknown actions, arbitrary routes, credential,
secret/token, URL/host/port, raw-row and SQL-shaped inputs before any fetch.
Persistent Superset work remains inside SBA's trusted
preview→approval→apply→readback→rollback workflow and is not an external intent.

The cross-repository clean-room runner is:

```sh
npm run external-bi-service:test
node scripts/verify-external-bi-service-v2-clean-room.mjs http://127.0.0.1:28790
```

The focused suite contains 18 deterministic probes over the
`FND-PS-03-external-bi-v2-clean-room` holdout, whose marker is
`synthetic-non-customer-bytes-only`. It proves the exact positive profile and
digest bindings plus unknown, stale, substituted, incomplete,
paired-substituted, fully re-digested forged, accessor, Proxy, hidden-key,
symbol-key and post-validation-mutation denials. The cross-repository runner
additionally proves the full
status→analyze→discovery→plan→preview→readback chain, `NOT_APPLIED` readback,
and absence of direct Superset access, credentials, raw rows, SQL forwarding
and mutation.

Rollback before merge is the exact pre-migration CM base. After a protected
merge, use a protected successor PR; do not rewrite main, retag or replace
assets. Disabling BI only requires removing the CM BI environment variables;
KaleidoSphere lifecycle remains independently controlled by its own release
checkout.

Non-claims: no deployment, runtime activation, production/customer access,
credential onboarding, database write-back, Superset administration or proof beyond the exact released SBA v0.8.0/contract 2.0.0 pair.
