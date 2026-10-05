import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as sessions from "../../src/pan527/origin-session-adapter.mjs";
import { validateRuntimeIdentityV1 } from "../../src/pan526/runtime-contract.mjs";
import { shapeIdentity527 } from "./helpers.mjs";

// The observed source entrypoint and Dockerfile establish distinct control and
// agent processes. These identity values are binding-shape fixtures, not a new
// native KS run, image observation, readiness receipt or execution grant.
function controlBinding() {
  return {
    schemaVersion: "pansphaira.hosted-origin-session/protected-route-binding/v1",
    componentId: "kaleidosphere-bi-control", entrypointPath: "services/bi-control/src/server.mjs",
    sourceCommit: "67c611c6b523d8d8ee329a65f8a00a589de81e1e",
    sourceTree: "a".repeat(40), entrypointSha256: "8b4e3bed4aec797dd4d556148c48530736fe991fa25cfaae1412c8b97319eda1",
    runtime: { name: "node", version: process.version.slice(1) },
    instanceId: "ks293-control-shape", tenantId: "tenant-a", generation: 1,
  };
}

test("KS293 explicit protected control-route session does not relabel agent RuntimeIdentity or grant effects", () => {
  assert.equal(typeof sessions.createProtectedRouteSessionAdapterV1, "function",
    "a distinct actual control route needs an explicit common binding, not the agent component relabelled");
  const root = mkdtempSync(join(tmpdir(), "pan527-ks293-route-session-"));
  try {
    const options = { optIn: true, origin: "https://127.0.0.1:4443", routeBinding: controlBinding(), stateRoot: root };
    const adapter = sessions.createProtectedRouteSessionAdapterV1(options);
    const issued = adapter.issueOwnerSession({ subjectId: "synthetic-control-reader", role: "reader", expiresAtMs: Date.now() + 60000 });
    assert.match(issued.setCookie, /^__Host-ks293-session=[a-f0-9]{64}; Path=\/; Secure; HttpOnly; SameSite=Strict; Max-Age=/);
    assert.equal(adapter.binding.audience, "kaleidosphere-protected-control-origin-v1");
    assert.equal(adapter.binding.componentId, "kaleidosphere-bi-control");
    assert.equal(adapter.binding.identityDigest, undefined);
    assert.match(adapter.binding.protectedRouteDigest, /^[a-f0-9]{64}$/);
    assert.equal(adapter.authorizeMutation, undefined, "a control reader/reviewer cookie is not product effect authority");
    const headers = { cookie: issued.cookieHeader, origin: options.origin, "x-pan527-csrf": issued.csrf };
    const principal = adapter.authenticate(headers);
    assert.equal(principal.componentId, "kaleidosphere-bi-control"); assert.equal(principal.tenantId, "tenant-a");
    assert.deepEqual(adapter.authorizeReadOperation(headers), principal);
    assert.deepEqual(sessions.createProtectedRouteSessionAdapterV1(options).authenticate(headers), principal);
    for (const mutation of [{ "x-pan527-csrf": undefined }, { "x-pan527-csrf": "0".repeat(64) }, { origin: "https://not-owned.invalid" }]) {
      assert.throws(() => adapter.authorizeReadOperation({ ...headers, ...mutation }), /HOSTED_CSRF_DENIED/);
    }
    for (const field of ["x-role", "x-tenant", "authorization", "forwarded", "x-forwarded-host"]) {
      assert.throws(() => adapter.authenticate({ ...headers, [field]: "caller-spoof" }), /HOSTED_HEADER_AUTHORITY_DENIED/);
    }
    for (const componentId of ["kaleidosphere-bi-agent", "pansphaira-local-demo", "unknown-component", "kaleidosphere-bi-control "]) {
      assert.throws(() => sessions.createProtectedRouteSessionAdapterV1({ ...options, routeBinding: { ...options.routeBinding, componentId } }), /HOSTED_ROUTE_BINDING_DENIED/);
    }
    for (const mutation of [{ entrypointPath: "services/bi-agent/src/server.mjs" }, { effectiveRights: ["control.apply"] }, { runtime: { name: "python", version: "3.13.0" } }, { audience: "pansphaira-hosted-origin-v1" }, { generation: 0 }]) {
      assert.throws(() => sessions.createProtectedRouteSessionAdapterV1({ ...options, routeBinding: { ...options.routeBinding, ...mutation } }), /HOSTED_ROUTE_BINDING_DENIED/);
    }
    for (const mutation of [{ instanceId: "other-control-instance" }, { tenantId: "tenant-b" }, { generation: 2 }, { entrypointSha256: "e".repeat(64) }]) {
      const other = sessions.createProtectedRouteSessionAdapterV1({ ...options, routeBinding: { ...options.routeBinding, ...mutation } });
      assert.throws(() => other.authenticate(headers), /HOSTED_SESSION_DENIED/);
    }
    assert.throws(() => adapter.issueOwnerSession({ subjectId: "synthetic-control-reader", role: "owner", expiresAtMs: Date.now() + 60000 }), /HOSTED_PRINCIPAL_DENIED/);
    const runtimeSchema = JSON.parse(readFileSync(new URL("../../contracts/runtime-portability/portable-runtime-v1.schema.json", import.meta.url), "utf8"));
    assert.deepEqual(runtimeSchema.$defs.RuntimeIdentity.properties.componentId.enum, ["pansphaira-local-demo", "kaleidosphere-bi-agent"]);
    assert.throws(() => validateRuntimeIdentityV1({ ...shapeIdentity527("tenant-a"), componentId: "kaleidosphere-bi-control" }), /RUNTIME_IDENTITY_DENIED/);
    assert.throws(() => validateRuntimeIdentityV1({ ...shapeIdentity527("tenant-a"), componentId: "unknown-component" }), /RUNTIME_IDENTITY_DENIED/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
