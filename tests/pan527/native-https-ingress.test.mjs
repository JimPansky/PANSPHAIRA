import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { request as httpsRequest } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as ingress from "../../src/pan527/origin-session-adapter.mjs";

function shapeIdentity(tenantId) {
  return {
    schemaVersion: "pansphaira.portable-runtime/identity/v1", componentId: "pansphaira-local-demo",
    sourceCommit: "fd157e60b4da3ca9f6c4c5ec185c73a28f3650bb", sourceTree: "af69cfb56cd3b82c7d01714384ae51ebcd4f9d07",
    imageDigest: "sha256:" + "a".repeat(64), architecture: "x86_64", productVersion: "0.2.0-poc.20260810.5",
    runtime: { name: "node", version: process.version.slice(1) }, contractVersion: "1.0.0",
    instanceId: "pan527-tls-native-core-" + tenantId, tenantId, generation: 1,
    configurationDigest: "b".repeat(64), templateDigest: "c".repeat(64), policyDigest: "d".repeat(64), networkDigest: "e".repeat(64),
    authorityProfile: "SAFE_GUIDED", effectiveRights: ["demo.status.read", "demo.provider.bound.read", "demo.governed.effect"],
  };
}
async function freePort() {
  const server = createHttpServer(); await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port; await new Promise((r) => server.close(r)); return port;
}
function get(port, cert, path, headers) {
  return new Promise((resolve, reject) => {
    const request = httpsRequest({ hostname: "127.0.0.1", servername: "pan527.test", port, path, method: "GET", ca: cert, rejectUnauthorized: true, headers }, (response) => {
      let body = ""; response.setEncoding("utf8"); response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body, tlsAuthorized: request.socket.authorized, tlsProtocol: request.socket.getProtocol() }));
    }); request.on("error", reject); request.end();
  });
}

test("AC1/2 actual verified TLS requests reach distinct existing per-tenant persisted native core", async () => {
  assert.equal(typeof ingress.createOptionalHttpsProductIngressV1, "function",
    "PAN527 requires actual opt-in HTTPS product ingress, not session metadata alone");
  const root = mkdtempSync(join(tmpdir(), "pan527-native-tls-")); let gateway;
  try {
    const keyPath = join(root, "tls.key"); const certPath = join(root, "tls.crt");
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyPath, "-out", certPath, "-days", "1", "-subj", "/CN=pan527-isolated-test", "-addext", "subjectAltName=IP:127.0.0.1,DNS:pan527.test"], { stdio: "ignore" });
    chmodSync(keyPath, 0o600); chmodSync(certPath, 0o600);
    const port = await freePort(); const origin = "https://127.0.0.1:" + port;
    const tenants = ["tenant-a", "tenant-b"].map((tenantId) => {
      const stateRoot = join(root, tenantId + "-auth"); const productRoot = join(root, tenantId + "-product");
      mkdirSync(stateRoot, { mode: 0o700 }); mkdirSync(productRoot, { mode: 0o700 });
      return { identity: shapeIdentity(tenantId), stateRoot, productRoot };
    });
    gateway = ingress.createOptionalHttpsProductIngressV1({ optIn: true, origin, tls: { keyPath, certPath }, tenants });
    await new Promise((r, reject) => { gateway.server.once("error", reject); gateway.server.listen(port, "127.0.0.1", r); });
    const a = gateway.sessionAdapter("tenant-a").issueOwnerSession({ subjectId: "synthetic-reader-a", role: "reader", expiresAtMs: Date.now() + 60000 });
    const b = gateway.sessionAdapter("tenant-b").issueOwnerSession({ subjectId: "synthetic-reviewer-b", role: "reviewer", expiresAtMs: Date.now() + 60000 });
    const cert = readFileSync(certPath); const beforeB = await get(port, cert, "/t/tenant-b/api/status", { cookie: b.cookieHeader });
    const aa = await get(port, cert, "/t/tenant-a/api/status", { cookie: a.cookieHeader });
    assert.equal(aa.status, 200); assert.equal(aa.tlsAuthorized, true); assert.equal(aa.tlsProtocol, "TLSv1.3");
    assert.equal(JSON.parse(aa.body).apiVersion, "chimpmaera.dev/poc-early-admin-status/v1");
    assert.equal(JSON.parse(aa.body).kind, "PocEarlyAdminStatus");
    assert.match(aa.headers["set-cookie"][0], /; Path=\/; Secure; HttpOnly; SameSite=Strict; Max-Age=/);
    assert.equal((await get(port, cert, "/t/tenant-b/api/status", { cookie: a.cookieHeader })).status, 401);
    assert.equal((await get(port, cert, "/t/tenant-a/api/status", { cookie: a.cookieHeader, "x-role": "reviewer" })).status, 403);
    const afterB = await get(port, cert, "/t/tenant-b/api/status", { cookie: b.cookieHeader });
    assert.deepEqual(JSON.parse(afterB.body), JSON.parse(beforeB.body));
    assert.equal((await get(port, cert, "/t/tenant-a/api/status", { cookie: a.cookieHeader, host: "not-owned.test:" + port })).status, 421);
    assert.equal((await get(port, cert, "/t/tenant-a/api/status", { cookie: a.cookieHeader, origin: "https://not-owned.test" })).status, 403);
    for (const spec of tenants) {
      const status = readFileSync(join(spec.productRoot, "artifacts/poc-guided-demo/playgrounds/quick-tour/dashboard-status.json"), "utf8");
      assert.equal(JSON.parse(status).apiVersion, "chimpmaera.dev/poc-early-admin-status/v1");
      assert.equal(JSON.parse(status).kind, "PocEarlyAdminStatus");
    }
  } finally {
    if (gateway?.server.listening) await new Promise((r) => gateway.server.close(r));
    rmSync(root, { recursive: true, force: true });
  }
});
