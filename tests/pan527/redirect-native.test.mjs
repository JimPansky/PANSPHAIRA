import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { nativeFixture527, request527 } from "./helpers.mjs";

test("AC1 authenticated redirect has one fixed same-tenant relative destination", async () => {
  const fixture = await nativeFixture527();
  try {
    const issued = fixture.gateway.sessionAdapter("tenant-a").issueOwnerSession({ subjectId: "synthetic-redirect-reader-a", role: "reader", expiresAtMs: Date.now() + 60000 });
    const paths = fixture.tenants.map((t) => join(t.productRoot, "artifacts/poc-guided-demo/playgrounds/quick-tour/dashboard-events.jsonl"));
    const before = paths.map((p) => readFileSync(p));
    const redirect = await request527(fixture, "/t/tenant-a", { cookie: issued.cookieHeader });
    assert.equal(redirect.status, 303, "opted-in ingress needs an authenticated fixed redirect, not a caller-owned return URL");
    assert.equal(redirect.headers.location, "/t/tenant-a/api/status");
    assert.equal(new URL(redirect.headers.location, fixture.origin).origin, fixture.origin);
    const followed = await request527(fixture, redirect.headers.location, { cookie: issued.cookieHeader });
    assert.equal(followed.status, 200); assert.equal(followed.tlsAuthorized, true);
    for (const path of ["/t/tenant-a?returnTo=https://not-owned.invalid", "/t/tenant-a?redirect=/t/tenant-b/api/status", "/t/tenant-a/redirect", "/t/tenant-a/api/status?returnTo=/t/tenant-b/api/status", "//not-owned.invalid/t/tenant-a", "/t/tenant-a/../tenant-b"]) {
      const result = await request527(fixture, path, { cookie: issued.cookieHeader });
      assert.equal(result.status, 404, path); assert.equal(result.headers.location, undefined, path);
    }
    const other = await request527(fixture, "/t/tenant-b", { cookie: issued.cookieHeader });
    assert.equal(other.status, 401); assert.equal(other.headers.location, undefined);
    const anonymous = await request527(fixture, "/t/tenant-a");
    assert.equal(anonymous.status, 401); assert.equal(anonymous.headers.location, undefined);
    assert.deepEqual(paths.map((p) => readFileSync(p)), before);
  } finally { await fixture.close(); }
});
