# PAN464: one retained-state native pair

This is an isolated synthetic qualification surface, not a deployment installer or production authorization. Its receipts cannot close issues, publish releases or grant additional authority.

## Exact edge and runtime

Source producer: `c255df512ba86cf8c346c797bac5400bac1b6ab3` with KaleidoSphere `72d9a4af87fbbc5b23cb52835cd2f85415b8ddc7`. Target: the actual clean PAN implementation head checked by the runner, with the **same exact consumer**. The producer version changes; the existing consumer executes its native retained-state initialization again. Historical paired profiles remain unchanged.

The qualification image composes digest-pinned Node 24.19.0/ABI137 Linux x64 and Superset 6.1.0, declared in `tests/pan464/runtime/Dockerfile` and `retained-pair-plan.mjs`. Its actual built image ID is bound into both tuples. Build arguments adapt only the image-local non-root identity to the disposable runner's UID/GID; no host account is changed. PostgreSQL is the locked embedded-postgres dependency. No signed-provenance, reproducible-image or distributed deployment claim is made.

The released source PostgreSQL harness creates real synthetic invoice rows. Later jobs restart that **same data directory without initialization, purge or reseeding**, read through the released connector and execute PAN463's existing fixed transactional DDL. Native Superset dataset/dashboard/metric objects are likewise retained. Frozen KS init stages from its live metadata, executes real `superset db upgrade`, `superset init` and bootstrap, and retains the previous generation. An actual command invocation is **not** asserted to be a nontrivial Superset schema change; this can be a same-schema/no-op migration.

An explicit synthetic SQLite projection materializes the observed PostgreSQL records for real Superset HTTP queries. This adapter is distinct from the unchanged #346 paired analytics transport. The controller separately executes that original runner for both exact source and target, including real loopback service, regenerated consumer manifest and original compatibility denials.

## Admission and writable native startup

`src/pan464/retained-pair-controller.mjs` owns one deterministic installation/journal mapping. Requests contain only the operation and captured plan digest, not commands, paths, mount modes, oracle values, permission records or checkpoint expectations. Trusted constructor configuration and a separately retained live permission reader are the controller boundary, **not** a new authentication provider.

The composition reuses PAN453's local owner, durable reservation and STOP/REVOKE controls, PAN463's native executor and the existing migration-checkpoint contract. The stopped physical checkpoint includes producer storage, consumer metadata/generations/pointers/projection and synthetic keys, preserving bytes, ordinary permission modes and relative pointers. It is a same-controller **LOCAL_COPY**, not an independently administered/offhost backup or power-loss guarantee.

Before native writable startup, actual Docker IDs, state/PIDs, restart policy and mounts are inspected for the owned namespace and retained bind consumers. Running or foreign consumers remain held. The fixed job is created with a pinned image, network none, non-root user, dropped capabilities, no-new-privileges, read-only root and no Docker socket. Its actual configuration is inspected and permission, STOP/REVOKE, independent checkpoint binding and quiescence are rechecked before start. Native consumer init has read-only overrides for keys, projection and producer storage. The host controller's journal, checkpoint and oracle are not updater-writable.

Unadmitted raw shell init and direct Python installer run with the **actual retained stores read-only** and real prerequisites available. Qualification requires a filesystem write denial and unchanged retained digest, not merely an unavailable binary, health check or wrapper denial.

This does not constrain Docker/host administrators, arbitrary same-UID host code or malicious code already admitted into a writable runtime principal. Standalone frozen-KS Compose deployments do not thereby become PAN-aware. In-flight revocation is not an instantaneous native transaction cancellation claim: authority is rechecked before dispatch/activation, and current STOP/REVOKE also gates post-activation fixture writes.

## Business oracle and recovery

The controller-side oracle reads original PAN462 fixture expectations, not caller-provided expectations. It checks invoice identities/threshold/total, real Superset chart HTTP business data and retained native object IDs. Healthy HTTP200 with a deliberately corrupted saved metric is rejected.

For a known **pre-activation** wrong-business rejection, the controller revalidates authority, stopped writers and checkpoint, preserves rejected state, restores the stopped source copy and independently re-reads actual producer/consumer paths. The rejected operation is not silently replayed.

Durable activation intent precedes post-validation writer capability. Unknown/crashed, activated and post-activation states have **no automatic old-snapshot restore path**. `readRecovery()` is observational and returns `HELD_NO_AUTOMATIC_RESTORE`; stale/live owners are not automatically adopted. Explicit fresh recovery decisions must retain new valid work.

Native tests kill the actual controller at checkpoint, activation intent and after new correct producer/metadata writes. They also kill the container while real `superset db upgrade` runs. Killing a Docker CLI alone is not container quiescence: the actual container exit and absence of owned residue are checked. No storage power-loss or cross-host guarantee is claimed.

## Running and publishing evidence

Lightweight unit checks: `npm run pan464:test` (included in `posttest`). These are not native acceptance.

Required native gate: `npm run pan464:native`, with `PAN464_SOURCE_ROOT`, `PAN464_KS_ROOT`, `PAN464_OWNED_ROOT` and the actual `PAN464_IMAGE_ID`. It requires clean exact public checkouts, compiled locked dependencies, Docker and the pinned native image; missing prerequisites fail rather than skip. The owned root is a fresh disposable directory outside product checkouts. All fixture values and grants are synthetic.

The explicit demonstration CLI is `scripts/run-retained-pair-upgrade.mjs`; its required flags name the source, counterpart, owned root, exact PAN head, image ID, separately protected synthetic permission file and outside-checkout output. It executes pair checks, source creation, real RO bypass probes, retained upgrade, correct new writes and observational recovery. It is not a production grant issuer.

`.github/workflows/retained-native-pair.yml` runs the native gate on exact PR/Main heads. `scripts/run-pan464-native-qualification.mjs` verifies the process exit and complete native test counts before emitting a public-safe source/runtime-bound summary. Only that summary is uploaded. Raw state, encryption keys, permission files and internal container logs must not be published. Local execution, independent acceptance, hosted CI, protected merge, classified release/readback and criterion-bound closure remain separate gates.
