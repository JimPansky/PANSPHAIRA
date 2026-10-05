import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

let optionalIngress;
try {
  optionalIngress = await import("../../src/pan527/origin-session-adapter.mjs");
} catch (error) {
  if (error.code !== "ERR_MODULE_NOT_FOUND"
    || !error.message.includes("src/pan527/origin-session-adapter.mjs")) throw error;
}

test("AC1 optional HTTPS origin is explicit, closed and not the legacy loopback profile", () => {
  assert.equal(typeof optionalIngress?.validateHostedOriginV1, "function",
    "PAN527 requires a real optional HTTPS origin/session ingress, not relabelling the local HTTP profile");
  const validate = optionalIngress.validateHostedOriginV1;
  assert.equal(validate("https://127.0.0.1:4443"), "https://127.0.0.1:4443");
  assert.equal(validate("https://pan527.test:4443"), "https://pan527.test:4443");
  for (const bad of [undefined, "", "http://127.0.0.1:4443", "https://127.0.0.1:4443/",
    "https://owner@pan527.test:4443", "https://pan527.test:4443?tenant=B",
    "https://pan527.test:4443#authority", "https://PAN527.test:4443", "https://pan527.test:0",
    "https://pan527.test:65536", "https://pan527.test:443", "https://pan527.test:04443",
    "https://pan527.test:4443.evil.test", " https://pan527.test:4443", "https://pan527.test:4443\n"]) {
    assert.throws(() => validate(bad), /HOSTED_ORIGIN_DENIED/, String(bad));
  }
});

function shapeIdentity(tenantId = "tenant-a") {
  return {
    schemaVersion: "pansphaira.portable-runtime/identity/v1", componentId: "pansphaira-local-demo",
    sourceCommit: "fd157e60b4da3ca9f6c4c5ec185c73a28f3650bb",
    sourceTree: "af69cfb56cd3b82c7d01714384ae51ebcd4f9d07",
    imageDigest: "sha256:" + "a".repeat(64), architecture: "x86_64",
    productVersion: "0.2.0-poc.20260810.5", runtime: { name: "node", version: "24.14.1" },
    contractVersion: "1.0.0", instanceId: "pan527-unit-session", tenantId, generation: 1,
    configurationDigest: "b".repeat(64), templateDigest: "c".repeat(64),
    policyDigest: "d".repeat(64), networkDigest: "e".repeat(64), authorityProfile: "SAFE_GUIDED",
    effectiveRights: ["demo.status.read", "demo.provider.bound.read", "demo.governed.effect"],
  };
}

test("AC2 protected owner-issued opaque session survives reload without trusting headers", () => {
  assert.equal(typeof optionalIngress?.createProtectedSessionAdapterV1, "function",
    "PAN527 requires protected server-side session identity on the actual product ingress");
  const root = mkdtempSync(join(tmpdir(), "pan527-session-unit-"));
  try {
    const options = { optIn: true, origin: "https://pan527.test:4443", identity: shapeIdentity(), stateRoot: root };
    const adapter = optionalIngress.createProtectedSessionAdapterV1(options);
    const issued = adapter.issueOwnerSession({ subjectId: "synthetic-reader-a", role: "reader", expiresAtMs: Date.now() + 60000 });
    assert.match(issued.setCookie, /^__Host-pan527-session=[a-f0-9]{64}; Path=\/; Secure; HttpOnly; SameSite=Strict; Max-Age=[1-9][0-9]*$/);
    assert.match(issued.csrf, /^[a-f0-9]{64}$/);
    const headers = { cookie: issued.cookieHeader };
    assert.deepEqual(adapter.authenticate(headers), { tenantId: "tenant-a", subjectId: "synthetic-reader-a", role: "reader", instanceId: "pan527-unit-session", generation: 1 });
    const recovered = optionalIngress.createProtectedSessionAdapterV1(options);
    assert.deepEqual(recovered.authenticate(headers), adapter.authenticate(headers));
    assert.equal(statSync(join(root, "sessions.json")).mode & 0o777, 0o600);
    assert.equal(statSync(join(root, "session-auth.key")).mode & 0o777, 0o600);
    const persisted = readFileSync(join(root, "sessions.json"), "utf8");
    assert.equal(persisted.includes(issued.cookieHeader.split("=")[1]), false);
    assert.equal(persisted.includes(issued.csrf), false);
    for (const field of ["authorization", "x-tenant", "x-tenant-id", "x-role", "x-roles", "x-user", "x-forwarded-host", "x-forwarded-for", "forwarded"]) {
      assert.throws(() => recovered.authenticate({ ...headers, [field]: "caller-owned-spoof" }), /HOSTED_HEADER_AUTHORITY_DENIED/);
    }
    assert.throws(() => recovered.authenticate({ cookie: "__Host-pan527-session=" + "0".repeat(64) }), /HOSTED_SESSION_DENIED/);
    assert.throws(() => recovered.issueOwnerSession({ subjectId: "synthetic-reader-a", role: "owner", expiresAtMs: Date.now() + 60000 }), /HOSTED_PRINCIPAL_DENIED/);
    assert.throws(() => optionalIngress.createProtectedSessionAdapterV1({ ...options, optIn: false }), /HOSTED_OPT_IN_REQUIRED/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
