# J03: exact local synthetic pair qualification

The read-only PAN-owned registry qualifies only profile `KS_J02_0181_C2_V1`
with consumer `0efa10b545cfa617e7b6e8c58fe5bc768e0158aa` and provider
`92f47ef2d5dc74bd44fa3a71c7a296da23c9b928`. It does not admit a new PAN
head merely because the compiled handler has identical bytes. `main`, `latest`,
other builds, missing selectors, caller proof, roles and extra arguments deny.

From an exact source checkout or source archive:

    node scripts/read-pan525-qualified-pair-v1.mjs KS_J02_0181_C2_V1 0efa10b545cfa617e7b6e8c58fe5bc768e0158aa 92f47ef2d5dc74bd44fa3a71c7a296da23c9b928

Success emits `QUALIFIED_LOCAL_SYNTHETIC_EXACT_PAIR`, exact commits, contract
`2.0.0`, provider runtime/product version, actual native versions and proof
SHA256 digests. Failure emits a bounded HELD code on stderr and exits 2.
The evidence reader opens each fixed evidence file with O_NOFOLLOW, verifies
regular-file type and hashes bytes read through that same descriptor. Returned
records are deeply frozen. No CLI input supplies proof or authority.

## Separate observations, not a handshake upgrade

The immutable original observation retains its historical native HELD state.
Its genuine delivered J01 HTTP run executed all six external contract intents:
status, analysis, discovery, plan, preview and readback. It uses the known public
synthetic fixture, MSSQL profile and stub language model, but the actual released
KS HTTP product is not a substitute provider. Independent result checks and
version, rights, source and drilldown denials remain bound to that same pair.
The external run remains `SYNTHETIC_UNVALIDATED`; its output is not relabelled
as native Superset execution.

A separate native persistence run used the exact released PAN producer,
consumer and business oracle with unchanged released KS native runtime files.
The actual native image is
`sha256:10e879d1ed447aa2b195c70790ef040adee67e32f43b6f4584c31191313fe32f`.
Native Superset 6.1.0 provisioning invoked its real `db upgrade` command three
times, retained existing dataset/dashboard state and real new business and
metadata writes across stopped-process restart and reinstallation. The schema
revision stayed `4b2a8c9d3e1f`: this proves the actual upgrade invocation and
persistence, not a schema-revision transition or an untested old-version upgrade.
Raw native state and grants stay private. The public native observation binds
actual job/log/command digests and four persisted-business oracle checkpoints.

The local registry joins those exact independently checked evidence hashes;
its only promotion is membership of this retained local synthetic pair. It does
not mutate the provider registry or grant execution, source or publication rights.
KS#250 independent second context remains HELD. The known fixture is not a new
source context. Unsupported/trusted-only intents do not become implemented
external operations; external trusted mutation remains denied.

## Distribution and delivery boundaries

This increment is SOURCE_EVIDENCE_ONLY, not a runnable product package or fresh
installation claim. The existing runnable public manifest is unchanged. One
bounded verification-DAG owner binds its contracts, source, CLI, tests and public
evidence; ordinary canonical proof, required hosted CI, protected merge, new
release and anonymous exact source-archive execution remain separate delivery
gates. Focused source and native evidence reviews are not full integration or
issue acceptance. No Main approval or reciprocal CLOSED wait gate is introduced.
