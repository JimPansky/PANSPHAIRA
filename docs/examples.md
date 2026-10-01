---
title: Reproducible local examples
description: Reproduce PanSphaira's deterministic SAFE_GUIDED checks and fictional CRM-to-ERP demo with explicit prerequisites, results, cleanup, and evidence limits.
---

# Reproducible local examples

Use a tagged [regular Latest release](https://github.com/JoFe2/PANSPHAIRA/releases/latest)
or record the exact commit before running an example. All bundled business
records are fictional. Do not substitute personal or customer data.

## SAFE_GUIDED closed proof

**Prerequisites:** Node.js 24, npm 11, and dependencies installed with
`npm ci --ignore-scripts --no-audit --no-fund`.

```sh
npm run proof:secure-default
```

**Expected result:** all human claims and verifier-negative probes pass. The
exact checked surfaces and non-claims are documented in the
[proof report](SECURE-DEFAULT-PROOF.md). This deterministic repository proof
does not test a hostile host or production environment.

## Fictional CRM → ERP flow

**Prerequisites:** Linux x86_64, Docker Engine with Docker Compose v2, `jq`,
`curl`, OpenSSL, and `sha256sum`. First installation can download pinned images.

```sh
./demo/install.sh
```

**Expected result:** the installer prints `READY_VERIFIED` and loopback URLs.
The local flow creates fictional fixtures, evaluates a governed effect, and
requires authoritative readback plus a bound receipt.

Clean up only the state owned by this demo:

```sh
./demo/uninstall.sh --purge
```

Cleanup is not provider Rollback or authority Revoke. The [Quickstart](QUICKSTART.md)
and [CRM-to-ERP walkthrough](use-cases/crm-erp-approval-readback.md) define the
complete path; [known limitations](KNOWN-LIMITATIONS.md) define its boundary.

## Authority-free contract fixtures

**Prerequisites:** Node.js 24, npm 11, and dependencies installed with the
same `npm ci` command shown above.

```sh
npm run build
node --test \
  dist/tests/hmi-core.test.js \
  dist/tests/hmi-harness-adapter.test.js \
  dist/tests/azure-identity-profile.test.js \
  dist/tests/power-platform-read-connector.test.js
```

**Expected result:** the typed positive and negative fixtures pass without
issuing runtime execution authority. These tests establish deterministic local
contract behavior only. They do not establish live tenant consent, Power
Platform import, provider compatibility, or a production UI. The
[capability matrix](capabilities.md) marks the external-evidence boundary.

This example creates only build output under `dist/`; it starts no service and
needs no runtime cleanup.

## Lightweight video-reference smoke

**Prerequisites:** The checked-in repository, Node.js 24 and npm 11 within the
[declared ranges](../package.json), installed dependencies (`npm ci`), and
Python 3. The npm command builds TypeScript and runs the bounded Node/Python
tests; it does not build a GPU image or download a model.

```sh
npm run external-video-service:test
```

**Expected result:** the synthetic reference validates publication-copy and
scene/audio parity gates. It does not upload, publish, activate a watcher, or
prove production video behavior. See the
[External Video Service Boundary](EXTERNAL-VIDEO-SERVICE.md) for scope.
