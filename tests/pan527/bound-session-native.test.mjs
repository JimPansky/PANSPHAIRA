import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { canonicalJson } from "../../dist/packages/contracts/src/canonical-json.js";
import { nativeFixture527, request527 } from "./helpers.mjs";

test("AC3 actual TLS native mutation denies owner-signed wrong audience, instance and generation without fallback", async () => {
  const fixture = await nativeFixture527();
  try {
    const issued = fixture.gateway.sessionAdapter("tenant-a").issueOwnerSession({ subjectId: "synthetic-bound-reviewer-a", role: "reviewer", expiresAtMs: Date.now() + 60000 });
    const headers = { cookie: issued.cookieHeader, origin: fixture.origin, "x-pan527-csrf": issued.csrf };
    const question = { question: "What is happening?" };
    const positive = await request527(fixture, "/t/tenant-a/api/ask", headers, "POST", question);
    assert.equal(positive.status, 200); assert.equal(positive.tlsAuthorized, true);
    const eventPaths = fixture.tenants.map((t) => join(t.productRoot, "artifacts/poc-guided-demo/playgrounds/quick-tour/dashboard-events.jsonl"));
    const eventsBefore = eventPaths.map((p) => readFileSync(p));
    const storePath = join(fixture.tenants[0].stateRoot, "sessions.json");
    const original = readFileSync(storePath); const originalStore = JSON.parse(original);
    // This test's owner-created synthetic private key signs each malformed
    // binding so denials reach the binding check, not merely a stale MAC.
    const key = Buffer.from(readFileSync(join(fixture.tenants[0].stateRoot, "session-auth.key"), "utf8").trim(), "hex");
    const denials = [];
    try {
      for (const [field, wrong] of [["audience", "kaleidosphere-protected-control-origin-v1"], ["instanceId", "different-instance"], ["generation", 2], ["tenantId", "tenant-b"], ["origin", "https://not-owned.invalid"], ["identityDigest", "0".repeat(64)]]) {
        const item = structuredClone(originalStore);
        const row = Object.values(item.payload.sessions)[0]; row.binding[field] = wrong;
        item.mac = createHmac("sha256", key).update(canonicalJson(item.payload)).digest("hex");
        writeFileSync(storePath, canonicalJson(item) + "\n");
        const denied = await request527(fixture, "/t/tenant-a/api/ask", headers, "POST", question);
        assert.equal(denied.status, 401, field); assert.equal(JSON.parse(denied.body).error, "HOSTED_SESSION_DENIED", field);
        assert.deepEqual(eventPaths.map((p) => readFileSync(p)), eventsBefore, field);
        const redirect = await request527(fixture, "/t/tenant-a", headers);
        assert.equal(redirect.status, 401); assert.equal(redirect.headers.location, undefined);
        denials.push({ field, status: denied.status });
        writeFileSync(storePath, original);
        assert.equal((await request527(fixture, "/t/tenant-a/api/status", headers)).status, 200);
      }
      const badMac = structuredClone(originalStore); badMac.mac = "0".repeat(64);
      writeFileSync(storePath, canonicalJson(badMac) + "\n");
      assert.equal((await request527(fixture, "/t/tenant-a/api/ask", headers, "POST", question)).status, 503);
      assert.deepEqual(eventPaths.map((p) => readFileSync(p)), eventsBefore);
    } finally { key.fill(0); writeFileSync(storePath, original); }
    assert.equal((await request527(fixture, "/t/tenant-a/api/status", headers)).status, 200);
    assert.deepEqual(eventPaths.map((p) => readFileSync(p)), eventsBefore);
    console.log("PAN527 actual signed-binding denials " + JSON.stringify(denials) + "; corrupted auth MAC 503; restored 200; A/B events unchanged");
  } finally { await fixture.close(); }
});
