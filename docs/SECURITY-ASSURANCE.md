# Security Assurance

This is the canonical assurance record for PanSphaira's scoped security
claims, maturity, evidence, trusted computing base (TCB) and non-claims. The
[README](../README.md) intentionally keeps only the short operational summary.

## Scope and evidence snapshot

The current public regular release is
[`v0.2.0-poc.20260825.1`](https://github.com/JoFe2/PANSPHAIRA/releases/tag/v0.2.0-poc.20260825.1),
the **canonical-number hardening** increment. It rejects negative zero before
canonicalization in Verification Fabric timestamps and Extension Assurance
Profile numeric boundaries. It performs no migration, restore, filesystem, package, schema
or service mutation, pointer switch, migration or rollback execution,
activation, promotion or external completion inference.
`v0.1.0` is historical. Release state is governed by
[anonymous public readback](RELEASE-GOVERNANCE.md), not inferred from a local
branch, a tag alone, a date or an editorial update. Documentation on `main` may
postdate the released asset bytes and does not silently change their claims.

The exact claims below remain bound to the stated local, synthetic paths,
fixtures, commands and evidence. Checked-in local runtime-smoke records are not
public-release, production, live-provider or independent evidence.

The Latest increment performs no default activation, scheduling, external
completion inference, authority grant, external write or adaptive test-depth
reduction. It establishes no universal provider compatibility, representative
long-duration or multi-host evidence, hostile-host isolation, production
readiness, security certification or customer-data fitness.
The detailed claims below remain bound to their own dated evidence snapshots.

Table counts are dated observations from their linked 2026-08-01 synthetic
evidence records, not a volatile claim about the current repository-wide test
total or live issue state. The listed reproduction command and commit-bound CI
result are authoritative for a newer snapshot; a changed count does not broaden
the claim boundary.

## Claim maturity

Maturity terms are strict:

- **PROVEN IN THIS SNAPSHOT** — executable contract/test evidence is present
  in this repository snapshot and the stated command passes on these bytes.
- **LOCALLY VALIDATED — SYNTHETIC EVIDENCE** — a checked-in, commit-bound local
  runtime smoke exists. Inclusion in a public release does not turn it into
  production, certification or independent evidence.
- **PLANNED / IN PROGRESS** — roadmap only. An issue is never evidence.
- **NOT CLAIMED — EXTERNAL GATES** — the claim requires evidence this local
  snapshot cannot provide.

## Runnable SAFE_GUIDED proof

The bounded [`SAFE_GUIDED` secure-default proof](SECURE-DEFAULT-PROOF.md)
turns the relevant claims and uncertainties into a closed, SHA-256-bound
manifest plus focused positive/adversarial probes. Run it with:

```sh
npm run proof:secure-default
```

The command also executes `npm test` as its authoritative comparator; it does
not use Verification Fabric v2 to skip tests. Its claims apply only to the
declared local synthetic `SAFE_GUIDED` path. `FULL_CONTROL_LAB` and `RAMPAGE`
do not inherit them.

The broadest governed Owner Profile is distinct from those lab aliases and
continues to require mediation, isolation, use-time checks and Evidence.
`FULL_CONTROL_LAB` / `RAMPAGE` is a deliberate dangerous escape profile: after
exact risk acceptance it may bypass PanSphaira action and Approval gates up to
the host process's OS/host ceiling. Claims for bypassed layers are downgraded,
and the published local lifecycle must reset to `SAFE_GUIDED` on restart,
revoke or cleanup with explicit rollback/recovery steps. Audit and emergency
stop cannot be claimed as protection from an actor able to alter them under
that ceiling.

### PROVEN IN THIS SNAPSHOT

| Claim ID | Exact claim | Evidence / reproduce | Result | Boundary |
| --- | --- | --- | --- | --- |
| `CM-SEC-001` | Every **defined meaningful crossing in the declared governed paths** is mediated by typed trusted code; the Agent is not the enforcement point. | [Canon](CANON.md) CM-CAN-01/03/08/09/10; [architecture](ARCHITECTURE.md); `npm test` | **154/154 PASS** | Local synthetic paths represented by this repository. This does not prove that unknown bypasses, a compromised host or a future integration cannot escape the model. `FULL_CONTROL_LAB` intentionally exits the governed-profile claim. |
| `CM-SEC-002` | Capability/catalogue entries are finite, typed, digest-bound and inactive by default; admission or inspection grants no authority. | [catalogue tests](../tests/capability-catalogue.test.ts); `npm run build && node --test dist/tests/capability-catalogue.test.js` | **4/4 PASS**; AAS-012 evidence records full-suite **95/95 PASS** | Two synthetic actions. No live adapter provenance, activation service, Gateway or production tenant claim. |
| `CM-SEC-003` | Untrusted provider, tool, document and memory content cannot select call targets, credentials, approval or authority; hostile content changes evidence digests only. | [trust-boundary tests](../tests/injection-trust-boundary.test.ts); `npm run build && node --test dist/tests/injection-trust-boundary.test.js` | **4/4 PASS** across four hostile synthetic origins | Closed local contract, not proof that prompt injection is eliminated in a live model, tokenizer, retrieval stack or gateway. |
| `CM-SEC-004` | The Owner can select visible, context-bound authority profiles, including the separate dangerous `FULL_CONTROL_LAB` / `RAMPAGE` lab profile; that lab selection requires exact risk acceptance and resets to `SAFE_GUIDED` on restart, revoke or cleanup. | [authority-profile tests](../tests/poc-early-admin-ai-setup.test.ts); [RAMPAGE manifest](../demo/manifests/authority/RAMPAGE-v1.json); `npm run build && node --test dist/tests/poc-early-admin-ai-setup.test.js` | **13/13 PASS**, including the two profile lifecycle tests | Local setup contract. The lab profile inherits the host process's OS ceiling, bypasses PanSphaira action/approval gates and can destroy local controls if separately given root. It is outside SAFE_GUIDED and Canon claims for bypassed layers. Audit and emergency stop are transparency/recovery features, not protection from that actor. |
| `CM-SEC-008` | Verified audit explanations are built only from signed, ordered, digest-linked facts and an exact head/count checkpoint; tampered, missing, reordered or forked facts do not render verified success. | [audit tests](../tests/protected-audit-timeline.test.ts); `npm run build && node --test dist/tests/protected-audit-timeline.test.js` | **4/4 PASS**; AAS-023 full suite **132/132 PASS** | Synthetic Ed25519/local checkpoint. Not hostile-host tamper-proof storage, an independent witness, trusted time, production key custody or retention compliance. |
| `CM-SEC-009` | The stock demo publishes only loopback ports, keeps databases on internal networks, mounts no Docker socket, and runs PanSphaira non-root with a read-only root, dropped capabilities and no-new-privileges. | [Compose contract](../demo/compose.yaml); [supply-chain verifier tests](../tests/supply-chain-verifier.test.mjs); `npm run supply-chain:verify` | **6/6 PASS** declaration/runtime-posture checks | Repository and local Compose posture only. It does not resist a compromised host kernel or Docker daemon and does not establish production network isolation. |

<a id="locally-validated-synthetic-evidence"></a>

### LOCALLY VALIDATED — SYNTHETIC EVIDENCE

| Claim ID | Exact claim | Evidence / reproduce | Recorded result | Boundary |
| --- | --- | --- | --- | --- |
| `CM-SEC-005` | Model requests are guarded before provider access; responses and streams are guarded before Agent/tool use. The broker alone resolves opaque credentials and routes; model tool calls remain untrusted candidates with no effect path. | `docs/development/evidence/admin-ai-aas-036-20260801.json`; [broker tests](../tests/model-access-broker.test.ts); `./demo/model-access-broker/smoke.sh` | AAS-036 **8/8 PASS**; isolated OpenClaw smoke: **11** provider calls, **7** denials, **7** metadata-only audits/receipts, no raw content stored, zero owned residue | Closed local OpenAI/Anthropic protocol fixtures and pinned OpenClaw 2026.7.1. No live provider, production TLS/DNS, real vault, universal runtime support or injection-elimination claim. |
| `CM-SEC-006` | The isolated Agent fixture has zero ambient provider/host/tenant credentials and one Gateway-only application path; direct Internet, provider, peer, host, socket and unmanaged-effect paths are denied by the tested fixture. | `docs/development/evidence/admin-ai-aas-035-20260801.json`; [runtime tests](../tests/openclaw-agent-runtime.test.mjs); `./demo/openclaw-agent/smoke.sh` | AAS-035 **12/12 PASS**; frozen smoke records **5** denials, **1** mediated effect with receipt/readback, stable Owner fingerprint and zero owned residue | Docker shares the host kernel. This is not a production sandbox, hostile-host boundary, complete supply-chain audit or production network/IAM claim. |
| `CM-SEC-007` | Declared effects are executed only at the broker/gate boundary. Transport acceptance is not success: authoritative provider readback and a bound receipt are mandatory; rejection, drift, ambiguity and replay do not become success. | `docs/development/evidence/admin-ai-aas-016-20260801.json`; [effect-gate tests](../tests/demo-enforcement-gate.test.mjs); [approval tests](../tests/demo-approval-workbench.test.mjs); `./demo/acceptance.sh SAFE_DEMO_COLD` | AAS-016 **4/4 PASS**; corrected cold smoke `READY_VERIFIED`, approved readback `VERIFIED`, rejected effect `DENIED`, replay denied, zero owned residue | One synthetic Dolibarr order path and local fixture identity. No provider transaction/ETag, production approval/IAM/MFA/quorum, provider Revoke or production Rollback claim. |

### HISTORICAL ROADMAP PROVENANCE — NOT CURRENT ISSUE STATE

The 2026-08-01 assurance review recorded issue [#3](https://github.com/JoFe2/PANSPHAIRA/issues/3)
as open/in progress and epic [#2](https://github.com/JoFe2/PANSPHAIRA/issues/2)
plus children [#4](https://github.com/JoFe2/PANSPHAIRA/issues/4),
[#5](https://github.com/JoFe2/PANSPHAIRA/issues/5),
[#6](https://github.com/JoFe2/PANSPHAIRA/issues/6),
[#7](https://github.com/JoFe2/PANSPHAIRA/issues/7) and
[#8](https://github.com/JoFe2/PANSPHAIRA/issues/8) as open/blocked. That is
a dated provenance snapshot, not a live status claim; current state must be
read from GitHub. Issues remain roadmap links, not evidence by themselves.

### NOT CLAIMED — EXTERNAL GATES

- `CM-NC-001`: no unhackability, absolute safety, security completeness or
  absence of unknown side channels.
- `CM-NC-002`: no thought, hidden-reasoning or chain-of-thought transparency.
  PanSphaira evidences observable inputs, decisions, actions, readback and
  receipts—not private model thoughts.
- `CM-NC-003`: no universal-agent, universal-model or live-provider
  validation; Hermes and Claude Code runtime paths remain unproven here.
- `CM-NC-004`: no production security/readiness, hostile-host containment,
  production multi-tenancy, IAM/MFA, HSM/KMS/PKI/vault, high availability,
  compliance or permission to use real customer data. Those require external,
  independently operated production evidence.

**TCB and isolation limit.** For these local claims, the trusted computing base
includes the host kernel and Docker daemon, Gateway/brokers/effect gate,
catalogue/Profile/Policy state, local keys and evidence store, plus the provider
surface used for authoritative readback. Agents, models and imported content
are treated as untrusted. Compromise of the local TCB can forge or bypass local
evidence; container hardening reduces accidental exposure but does not create
an independent hostile-host boundary.

## Related boundaries

- [Security policy and private reporting](../SECURITY.md)
- [Known limitations](KNOWN-LIMITATIONS.md)
- [Agent runtime isolation contract](AGENT-RUNTIME-ISOLATION-CONTRACT.md)
- [Supply-chain declaration verification](SUPPLY-CHAIN.md)
