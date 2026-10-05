# PAN527 optional HTTPS origin and protected sessions

This is an explicitly enabled source capability, not a customer portal, public deployment, visual UI journey, turnkey hosted image or native KaleidoSphere qualification. Existing local installation, Compose, selfhosting and runnable public payload remain unchanged.

## Closed product boundary

`createOptionalHttpsProductIngressV1` wraps existing per-tenant `PocEarlyAdminCoordinatorV1` product state. The configured HTTPS origin, actual loopback socket and certificate must agree. Only authenticated `GET /t/<tenant>/api/status`, `GET /t/<tenant>/api/effective-rights`, the fixed authenticated tenant-root 303 redirect and reviewer-authorized `POST /t/<tenant>/api/ask` are exposed. The POST persists the existing native question event, not a new provider or productive operation. Query aliases, arbitrary proxy targets, return URLs, caller roles/tenants/forwarded authority, duplicate security headers, external origins, upgrades and unsupported bodies are denied.

Owner-issued opaque sessions use an explicitly private local store and HMAC key. Exact audience, origin, tenant, instance, generation and identity digest are checked; secure host-only HttpOnly Strict cookies never contain roles or identity claims. The persisted CSRF binding and current authentication are checked again after asynchronous request bodies. Expiry, invalid binding/MAC and unavailable authentication fail closed. No external OIDC/portal fallback exists and no customer inputs are needed for the technical tests. Removing the optional ingress does not change the existing local HTTP entrypoint.

## Distinct KS control process

`validateProtectedRouteBindingV1` and `createProtectedRouteSessionAdapterV1` bind the actual `services/bi-control/src/server.mjs` process as `kaleidosphere-bi-control`, with a separate audience, cookie and read-operation surface. The PAN-owned route-binding schema references existing common field definitions offline. It is not a new portable RuntimeIdentity enum member or a relabelled `kaleidosphere-bi-agent`; the portable schema and effective-rights contract remain unchanged. The control adapter has no `authorizeMutation`. Origin/CSRF-authenticated reader/reviewer metadata is not execution permission. Native KS route policy, credentials, tenant persistence and product verification remain with the existing KS owner.

The immutable early selector remains `origin-session-development-v3.json` at commit `6a7752be07405bd03ccbc40c13a9936d1b8d0d2b`, tree `43f33d0c3c14aacc23f1497aae7a0f83f1cd7f30`, contract SHA-256 `cd87f1a1a5942bea20ac19cc8b08d5e32861c1e2499b9895b9d759fb4ba7b20b`. Its historical source pins address that exact candidate, not subsequent integration metadata. V1/V2 bytes and the explicit V3 correction are preserved. The observed KS commit `67c611c6b523d8d8ee329a65f8a00a589de81e1e` has actual tree `c36229b762bac232eb5cc942c9d68272076ee46c`; a source observation or synthetic binding fixture is not a KS runtime/image observation.

## Reproducible bounded tests

On supported Linux x86_64 with Node 24.14.1 and npm 11.16.0:

1. `npm ci --ignore-scripts --no-audit --no-fund`
2. `npm run build --silent`
3. Install the repository-locked Playwright 1.63.0 Chromium into an explicitly owned `PLAYWRIGHT_BROWSERS_PATH` with `node node_modules/playwright/cli.js install chromium`.
4. Provide an NSS `certutil` via `PAN527_CERTUTIL` or PATH. CI anonymously downloads the exact Ubuntu package, verifies SHA-256 and extracts it under its owned runner directory; it does not install a system package or alter global trust.
5. `npm run pan527:test`

The closed runner lists its exact files with `node scripts/run-pan527-origin-session-tests.mjs --list`. Other arguments, selected filenames, test-name filters and skip flags are refused. Missing real browser/NSS tooling is failure, not SKIP. Existing explicitly supplied private tooling can be reused and must be disclosed. CA trust changes occur only in the browser child's fresh private HOME; TLS verification stays enabled. The suite is registered once in the authoritative npm test lifecycle and additive verification DAG, with the existing hard gates preserved.

The early public V3 archives were independently matched to all 2593 Git files and all 180 contract pins. A fresh anonymous archive install/build executed the exact nine declared files: 10 PASS, 0 FAIL, 0 SKIP, including certificate-verifying Chromium and real native persistence. This bounded candidate qualification is not final-head canonical proof, required CI, merge, release or issue closure.

AC4 separately ran the unchanged actual legacy install, acceptance, protected provider mutation/readback and purge in hosted run `37241991499`, attempt 1, at that exact V3 identity. Artifact `11317504291` SHA-256 is `dd70c1c20de0d3a41697dbdb4a6245ca4dff168ef98e3f5d71af04cfce0f2732`; its retained receipt was actually downloaded and validated against the exact source. All five services were healthy and all owned resource classes were zero after purge. Receipt validation is not another native run. Final-head/release evidence remains separate.
