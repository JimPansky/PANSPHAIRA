# PanSphaira local demo installer

The demo is the bounded implementation example for
[The PanSphaira Canon](../docs/CANON.md). Use
[Architecture](../docs/ARCHITECTURE.md) and
[Known Limitations](../docs/KNOWN-LIMITATIONS.md) to distinguish shipped local
behavior from non-claims.

The installer starts a local synthetic CRM/ERP stack and verifies
authenticated provider readiness, mapped fictional identities, a
digest-bound catalog, one governed CRM-to-ERP order flow and the deterministic
Admin-AI preview boundary.

The released local Wave 1 surface adds an Approval Workbench for the
existing synthetic order escalation. It derives the readable business diff
from a bounded provider snapshot, binds its local version plus requester,
purpose, impacts, rollback and Policy, then rechecks freshness at approval and
use. An authenticated local Approve issues a short one-use lease; Reject issues
none. The provider gate and separate decision/effect receipts preserve those
bindings. Stale, hidden, truncated, rejected, tampered, expired and replayed
leases cannot execute. This remains a deterministic static-policy demo with no
real provider transaction/ETag, live LLM or production owner identity.

## Requirements

- Linux x86_64;
- Docker Engine with Docker Compose v2;
- `jq`, `curl`, OpenSSL and `sha256sum`;
- permission to build the local demo image and create installer-owned Docker
  containers, volumes and networks;
- free loopback ports `7780`, `7781` and `7782`, unless overridden with unique
  `CM_*_PORT` loopback bindings.

Do not use production credentials or real customer data. Initial installation
may download the pinned container images declared in `compose.yaml`.

## Install

From the release root:

```sh
./demo/install.sh
```

The guided defaults select the complete synthetic demo with safe local
authority. The optional `RAMPAGE` profile is a test-lab mode and requires the
explicit `CM_RAMPAGE_CONFIRM=I_UNDERSTAND_LOCAL_DEMO_ONLY` opt-in. It does not
grant host privileges.

Success prints `READY_VERIFIED` and loopback URLs for PanSphaira, EspoCRM and
Dolibarr. An unchanged rerun is idempotent. The Admin-AI PoC uses a
deterministic local policy, not a live LLM or production delegation service.
The dashboard permission X-ray is GET-only and informational: it displays the
exact synthetic profile/assignment/capability/constraint intersection and
issues no executable authority.

The source tree also contains a Wave 3 Paperless-ngx zoo adapter contract. It
is intentionally disabled in this installer (`CM_DMS=off`) and is tested only
against synthetic HTTP fixtures. It reads bounded metadata through fixed GET
paths and has no upload, content-download, delete or arbitrary-URL operation.
The playable stack does not install or claim compatibility with Paperless.

After a SAFE_GUIDED install, the bounded endpoint smoke can be run with:

```sh
./demo/approval-workbench-smoke.sh
```

The script creates one additional fictional Dolibarr order, proves a rejected
proposal cannot act, proves an approved lease acts once, rejects replay, and
writes digest-only evidence under `.chimpmaera-demo/public/`.

## Local runtime state

The installer generates random local demo secrets and state under
`.chimpmaera-demo/`. Per-run diagnostic receipts are written under
`.chimpmaera-acceptance/`. Neither directory belongs in a source or release
archive.

The scheduled/release exact-head gate is documented in
[Current-head Docker E2E](../docs/DEMO-CURRENT-HEAD-E2E.md). Its
`CM_DEMO_RUN_OWNER` input is reserved for the bounded CI runner: it must equal
the isolated Compose project and adds a second ownership label to the locally
built image. Ordinary interactive installs leave it unset.

## Cleanup

The uninstall parser accepts no option, `--purge`, `--help` or `-h` only.
Help exits zero without Docker or file effects. Unknown or extra arguments exit
two before any Docker call or file mutation, even when configuration exists.

Stop the configured installation while retaining its volumes and local state:

```sh
./demo/uninstall.sh
```

Only explicit `--purge` selects data removal. It requires one configured Compose
project, its matching bounded run-owner marker, the observed installer image
ownership and exact run label, and matching project labels on existing declared
volumes. All checks happen before teardown; the configured project is passed
explicitly so an ambient `COMPOSE_PROJECT_NAME` cannot redirect the operation.
Linked state or configuration is rejected.

```sh
./demo/uninstall.sh --purge
```

Missing or contradictory ownership refuses purge without removing data. Ordinary
interactive installs without the bounded run marker can be stopped, but this
safety-qualified purge path does not infer their destructive ownership. Do not
invent a marker, relabel resources, use Docker pruning, or broadly delete files
to force cleanup. Retain the stopped state for an owning operator's qualified
resource disposition.

The focused native safety probe uses only newly created synthetic resources,
no-network containers and an independently read live control. It demonstrates
stop/data retention and exact-owned purge, not a fresh full installer, ERP result,
model execution or hostile same-user sandbox.

`READY_VERIFIED` applies only to the selected local run. It is not a
publication, production, support, performance or security-certification
claim.
