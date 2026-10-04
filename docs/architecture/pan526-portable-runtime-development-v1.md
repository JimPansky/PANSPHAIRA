# Partial shared portable runtime development contract

Status: PARTIAL_DEVELOPMENT_CONTRACT_NOT_NATIVE_OR_RELEASE_QUALIFICATION.
PAN526 leads the single common contract; KS292 consumes this immutable candidate
on the existing PAN integration ref. Capability-bound integration can proceed
without waiting for either whole issue, ten cold starts, release or CLOSED.

Candidate: `contracts/runtime-portability/candidates/portable-runtime-development-v1.schema.json`.
Exact SHA256: `7c49eb32b45d4942f81828713babd45ef643a4d63b230e039445e6e9c2c6ebcb`.
Identical schema bytes are provided at `contracts/runtime-portability/portable-runtime-v1.schema.json` for the
product-path validator `src/pan526/runtime-contract.mjs`.
Compile the existing canonical JSON module with `npm run build` after the locked
installation; this validator imports the already existing contracts build path.
The schema `$id` is an identifier, not a network fetch or new data source.
Provider commit/tree and every file SHA256 are supplied in the existing
PAN526/KS292 handoff after exact anonymous readback.

Implemented contract profiles are RuntimeIdentity, DesiredState, ObservedState,
ReadinessAssessmentInput/ReadinessReceipt and LifecycleJob/LifecycleReceipt.
Select the named `$defs` when compiling the common draft2020-12 schema. Root
reference remains RuntimeIdentity. All wire objects are closed; opaque secret
references contain a closed slot and an opaque reference ID, never values, paths
or caller credentials. Desired/Observed are distinct immutable data types.
PAN local demo and KS BI agent are Node components. The corrected Identity-only
v2 candidate remains unchanged and the earlier wrong v1 remains historical.

Readiness compares bound expected/observed identities, a code-owned business
probe expected/observed value digest and independently collected boundary
observations. HTTP200 with a wrong value is NOT_READY. The pure assessor does
not collect native observations itself or open any effect route. Its output is
never a caller proof, authentication, execution grant or liveness-based authority.
Consumers must collect actual observations and derive expectations from their
own protected, qualified fixture/source rather than accept a caller PASS.

Jobs are typed start/stop/restart requests, bound to exact audience, tenant,
instance, component, generation, identity/desired-state digests and bounded
issued-at/deadline fields. Their validation does not dispatch them or grant
rights. Receipts explicitly bind the complete outcome/reason/digest table:
- succeeded: OBSERVED_TARGET_REACHED and a non-null observed-state digest;
- failed: OBSERVED_TARGET_NOT_REACHED or DISPATCH_FAILED and a non-null digest;
- outcome_unknown: DISPATCH_INTERRUPTED and a null observed-state digest.
An interrupted/unknown dispatch is not definite failed; success reasons are
never failed reasons. Both wire schema and validator enforce this table.

Actual tests: `node --test --test-reporter=tap tests/pan526/runtime-contract.test.mjs tests/pan526/ks-node-agent-candidate.test.mjs`.
The targeted receipt findings went RED before code and wire-schema correction;
the exhaustive 24-combination test and complete current contract set passed.
These are real validators executing synthetic shape fixtures, not new native
lifecycle, startup, restore, resource measurements or paired adapter execution.

Native portable runtime integration, ten x86_64 init/idle/load/restore trials,
verification-DAG/integrity registration, fullproof, required hosted CI, protected
merge, release/archive product readback and original issue closure remain
outside this development-candidate acceptance. No whole PAN526/KS292 approval
or inherited independent review is claimed. Existing legacy local installer and
Compose security remain unchanged; no new host/network/component/source rights.
Sole PAN WIP remains526. No Main preapproval or reciprocal CLOSED wait.
