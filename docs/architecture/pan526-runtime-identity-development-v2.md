# Corrected partial portable RuntimeIdentity development contract

Status: PARTIAL_DEVELOPMENT_CONTRACT_NOT_RUNTIME_OR_RELEASE_QUALIFICATION.
PAN526 remains the sole PAN WIP; KS292 may consume this exact candidate now.
No reciprocal CLOSED/release gate and no Main preapproval gate.

Candidate path: `contracts/runtime-portability/candidates/runtime-identity-development-v2.schema.json`.
Exact candidate SHA256: `c08367db4c0f786e733b2fd56e775237fdf5fd6689fdb724d4b57cd61946a348`.
The provider commit/tree and immutable raw URL accompany the handoff after exact
anonymous readback. This is a successor development candidate, not a release.

Correction: `kaleidosphere-bi-agent` is the Node agent, not Superset. The sole
semantic schema change from the historical v1 candidate is the closed KS-agent
runtime binding, `superset` -> `node`. No component or effective right is added.
The PAN local demo remains Node. The distinct Superset service is not introduced
as a component by this candidate and is not relabeled as the BI agent.

Primary KS source: `JoFe2/KaleidoSphere` commit
`dfc7f2ae2399109b90fe8a101f2d4eed465a7cef`.
`services/bi-agent/Dockerfile` pins Node24.14.0 and runs `node src/server.mjs`;
`services/bi-agent/package.json` declares product0.18.1. The independently supplied
counterexample used those separately observed runtime/product values and
Superset6.1.0. Our regression uses synthetic identity-shape fixtures; it does not
claim a fresh native execution, genuine fixture image/tree digests or readiness.

Runnable published regression:
`node --test --test-reporter=tap tests/pan526/ks-node-agent-candidate.test.mjs`
The test went RED on the Node-agent positive before the correction, then GREEN.
It accepts the Node24.14.0/product0.18.1 shape and rejects Superset6.1.0 under the
agent identity, an unregistered Superset component and PAN rights on the KS agent.
Existing alias/rights/getter denials remain covered on the actual local validator.

Historical candidate is retained byte-for-byte at
`contracts/runtime-portability/candidates/runtime-identity-development-v1.schema.json`.
Its SHA256 is `e2d6f05c82776f099d25f10098fd723558f4271eae2820d848e589dcf305b0d4`
at PAN commit `41859b527d202bda4251bde8dc1326532638b47a`.
That historical binding is unsuitable for integrating the real KS Node agent;
use this successor, not the historical v1 binding.

This candidate contains RuntimeIdentity only. ReadinessReceipt, desired/observed
state, LifecycleJob, startup/restore measurements and full PAN526/KS292 acceptance
are absent and not claimed. Identity labels and declared rights never grant
execution, source/publication authority or new component/service rights. Prior
focused review evidence remains historical with its exact original source pins;
its acceptance is not extended to changed schemas/tests. The legacy local
installer, Compose bytes and completed PAN525 delivery remain unchanged.
