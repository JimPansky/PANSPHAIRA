import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { nativeFixture527 } from "../pan527/helpers.mjs";

function actualProcess(input) {
  const env = Object.fromEntries(["PATH", "LANG", "LC_ALL", "TMPDIR"].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  const run = spawnSync(process.execPath, [fileURLToPath(new URL("./native-restart-process.mjs", import.meta.url))], { input: JSON.stringify(input), encoding: "utf8", env, timeout: 20000, maxBuffer: 65536 });
  assert.equal(run.error, undefined); assert.equal(run.status, 0, run.stderr); assert.equal(run.signal, null);
  return JSON.parse(run.stdout);
}
for (const firstMode of ["COMPLETE", "ABORT"]) {
  test("PAN528 actual different-process restart preserves " + firstMode + " effect and native budget instead of redispatching or blindly resetting", async () => {
    const f = await nativeFixture527();
    try {
      const tenant = f.tenants[0]; const identity = tenant.identity;
      const session = f.gateway.sessionAdapter(identity.tenantId).issueOwnerSession({ subjectId: "synthetic-pan528-real-restart", role: "reviewer", expiresAtMs: Date.now() + 120000 });
      const principal = f.gateway.sessionAdapter(identity.tenantId).authenticate({ cookie: session.cookieHeader });
      const options = { optIn: true, identity, parentRoot: tenant.productRoot, probeMode: "NORMAL" };
      const command = { action: "RUN_STARTER", operationId: "operation:actual-restart-001", binding: { tenantId: identity.tenantId, instanceId: identity.instanceId, generation: identity.generation } };
      const first = actualProcess({ options, principal, command, mode: firstMode });
      const restarted = actualProcess({ options, principal, command, mode: "REPLAY" });
      assert.notEqual(first.pid, restarted.pid); assert.notEqual(first.pid, process.pid); assert.notEqual(restarted.pid, process.pid);
      assert.deepEqual(restarted.before, first.after, "A new operating-system process must read the existing native journal and budget, not fabricate a clean generation");
      if (firstMode === "COMPLETE") {
        // A fresh, explicit bound reset in the restarted owner may remove its
        // completed synthetic starter; replay itself cannot charge twice.
        assert.equal(first.after.status, "SUCCEEDED"); assert.equal(first.after.budget.runtime.consumedUnits, 1);
        assert.equal(restarted.before.nativeEvidence.revision, 2);
        assert.equal(restarted.after.status, "IDLE"); assert.equal(restarted.after.budget.runtime.consumedUnits, 1);
        assert.equal(restarted.resetError, null);
      } else {
        assert.equal(first.ack.abortAcknowledged, true); assert.equal(first.ack.childCompleted, false);
        assert.equal(first.after.childCompleted, true); assert.equal(first.after.status, "OUTCOME_UNKNOWN");
        assert.deepEqual(restarted.after, first.after);
        assert.equal(restarted.resetError, "GUIDED_OUTCOME_UNKNOWN_RETAINED"); assert.equal(restarted.cleanupError, "GUIDED_OUTCOME_UNKNOWN_RETAINED");
        assert.equal(restarted.after.budget.runtime.committedUnits, 1); assert.equal(restarted.after.budget.runtime.consumedUnits, 0);
      }
      console.log(JSON.stringify({ firstMode, firstPid: first.pid, restartedPid: restarted.pid, parentPid: process.pid, beforeStatus: restarted.before.status, afterStatus: restarted.after.status, revisionBeforeRestart: first.after.nativeEvidence?.revision ?? null, runtimeCommitted: restarted.after.budget.runtime.committedUnits, runtimeConsumed: restarted.after.budget.runtime.consumedUnits, resetError: restarted.resetError }));
    } finally { await f.close(); }
  });
}
