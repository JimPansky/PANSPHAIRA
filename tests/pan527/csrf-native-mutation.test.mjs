import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { nativeFixture527, request527 } from "./helpers.mjs";
const hash = (value) => createHash("sha256").update(value).digest("hex");

test("AC1/2 reviewer mutation reaches native persisted event only with bound Origin and CSRF", async () => {
  const fixture = await nativeFixture527();
  try {
    const adapter = fixture.gateway.sessionAdapter("tenant-a");
    const reviewer = adapter.issueOwnerSession({ subjectId: "synthetic-reviewer-a", role: "reviewer", expiresAtMs: Date.now() + 60000 });
    const reader = adapter.issueOwnerSession({ subjectId: "synthetic-reader-a", role: "reader", expiresAtMs: Date.now() + 60000 });
    const headers = { cookie: reviewer.cookieHeader, origin: fixture.origin, "x-pan527-csrf": reviewer.csrf };
    const eventsA = join(fixture.tenants[0].productRoot, "artifacts/poc-guided-demo/playgrounds/quick-tour/dashboard-events.jsonl");
    const eventsB = join(fixture.tenants[1].productRoot, "artifacts/poc-guided-demo/playgrounds/quick-tour/dashboard-events.jsonl");
    const beforeB = hash(readFileSync(eventsB)); const beforeA = readFileSync(eventsA, "utf8");
    const positive = await request527(fixture, "/t/tenant-a/api/ask", headers, "POST", { question: "What is happening?" });
    assert.equal(positive.status, 200, "explicit reviewer + exact HTTPS Origin + server-issued CSRF must reach the existing native product handler");
    const afterPositive = readFileSync(eventsA, "utf8");
    assert.notEqual(afterPositive, beforeA); assert.match(afterPositive.slice(beforeA.length), /QUESTION_ANSWERED/);
    for (const [path, deniedHeaders, body, expected] of [
      ["/t/tenant-a/api/ask", { cookie: reviewer.cookieHeader, origin: fixture.origin }, { question: "What is happening?" }, 403],
      ["/t/tenant-a/api/ask", { ...headers, "x-pan527-csrf": "0".repeat(64) }, { question: "What is happening?" }, 403],
      ["/t/tenant-a/api/ask", { ...headers, origin: "https://not-owned.test" }, { question: "What is happening?" }, 403],
      ["/t/tenant-a/api/ask", { ...headers, cookie: reader.cookieHeader, "x-pan527-csrf": reader.csrf }, { question: "What is happening?" }, 403],
      ["/t/tenant-b/api/ask", headers, { question: "What is happening?" }, 401],
      ["/t/tenant-a/api/ask", { ...headers, "x-role": "owner" }, { question: "What is happening?" }, 403],
      ["/t/tenant-a/api/ask", headers, { question: "What is happening?", tenantId: "tenant-b" }, 400],
    ]) {
      assert.equal((await request527(fixture, path, deniedHeaders, "POST", body)).status, expected);
      assert.equal(readFileSync(eventsA, "utf8"), afterPositive); assert.equal(hash(readFileSync(eventsB)), beforeB);
    }
  } finally { await fixture.close(); }
});
