import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { request as httpsRequest } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOptionalHttpsProductIngressV1 } from "../../src/pan527/origin-session-adapter.mjs";

// These binding values are shape fixtures, not container/image observations.
export function shapeIdentity527(tenantId) {
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
export function request527(fixture, path, headers = {}, method = "GET", value) {
  return new Promise((resolve, reject) => {
    const body = value === undefined ? undefined : JSON.stringify(value);
    const request = httpsRequest({ hostname: "127.0.0.1", servername: "pan527.test", port: fixture.port, path, method, ca: fixture.cert, rejectUnauthorized: true,
      headers: { ...(body === undefined ? {} : { "content-type": "application/json", "content-length": Buffer.byteLength(body) }), ...headers } }, (response) => {
      let text = ""; response.setEncoding("utf8"); response.on("data", (chunk) => { text += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body: text, tlsAuthorized: request.socket.authorized, tlsProtocol: request.socket.getProtocol() }));
    }); request.on("error", reject); request.end(body);
  });
}
export async function nativeFixture527() {
  const root = mkdtempSync(join(tmpdir(), "pan527-native-owned-")); let gateway;
  try {
    const keyPath = join(root, "tls.key"); const certPath = join(root, "tls.crt");
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyPath, "-out", certPath, "-days", "1", "-subj", "/CN=pan527-isolated-test", "-addext", "subjectAltName=IP:127.0.0.1,DNS:pan527.test"], { stdio: "ignore" });
    chmodSync(keyPath, 0o600); chmodSync(certPath, 0o600);
    const reservation = createHttpServer(); await new Promise((r) => reservation.listen(0, "127.0.0.1", r));
    const port = reservation.address().port; await new Promise((r) => reservation.close(r));
    const origin = "https://127.0.0.1:" + port;
    const tenants = ["tenant-a", "tenant-b"].map((tenantId) => {
      const stateRoot = join(root, tenantId + "-auth"); const productRoot = join(root, tenantId + "-product");
      mkdirSync(stateRoot, { mode: 0o700 }); mkdirSync(productRoot, { mode: 0o700 });
      return { identity: shapeIdentity527(tenantId), stateRoot, productRoot };
    });
    const options = { optIn: true, origin, tls: { keyPath, certPath }, tenants };
    gateway = createOptionalHttpsProductIngressV1(options);
    await new Promise((r, reject) => { gateway.server.once("error", reject); gateway.server.listen(port, "127.0.0.1", r); });
    return { root, gateway, options, port, origin, cert: readFileSync(certPath), tenants,
      async close() { if (gateway.server.listening) await new Promise((r) => gateway.server.close(r)); rmSync(root, { recursive: true, force: true }); } };
  } catch (error) { if (gateway?.server.listening) await new Promise((r) => gateway.server.close(r)); rmSync(root, { recursive: true, force: true }); throw error; }
}
