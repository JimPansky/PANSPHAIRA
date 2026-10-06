import assert from "node:assert/strict";
import test from "node:test";
import { nativeFixture527, request527 } from "../pan527/helpers.mjs";
import { enableGuidedBrowserJourneyV1 } from "../../src/pan528/guided-browser.mjs";

test("PAN528 actual TLS abort acknowledges a request separately from observed child close and preserves the unresolved native effect fence", async () => {
  const f = await nativeFixture527(); let guidance; let native;
  try {
    guidance = await enableGuidedBrowserJourneyV1({ optIn: true, gateway: f.gateway, origin: f.origin, tenants: f.tenants });
    native = guidance.nativeOwner("tenant-a");
    const session = f.gateway.sessionAdapter("tenant-a").issueOwnerSession({ subjectId: "synthetic-pan528-abort-probe", role: "reviewer", expiresAtMs: Date.now() + 120000 });
    const headers = { origin: f.origin, cookie: session.cookieHeader, "x-pan527-csrf": session.csrf };
    const command = { action: "RUN_STARTER", operationId: "operation:actual-abort-001", binding: native.client.readback().binding };
    const started = await request527(f, "/t/tenant-a/guided/command", headers, "POST", command);
    assert.equal(started.status, 200); assert.equal(JSON.parse(started.body).childCompleted, false);
    const beforeAbort = native.client.readback().budget;
    const response = await request527(f, "/t/tenant-a/guided/command", headers, "POST", { ...command, action: "ABORT_STARTER" });
    assert.equal(response.status, 200, "PAN528_BOUND_ABORT_REQUIRED: abort ACK must be separate from native child completion and outcome resolution");
    const ack = JSON.parse(response.body);
    assert.equal(ack.abortAcknowledged, true);
    assert.equal(ack.childCompleted, false, "A signal request is not child completion");
    assert.equal(ack.status, "OUTCOME_UNKNOWN");
    await native.owner.waitForChildCompletion();
    const stopped = native.client.readback();
    assert.equal(stopped.childCompleted, true, "Only actual native close may record child completion");
    assert.equal(stopped.status, "OUTCOME_UNKNOWN", "Process exit alone cannot prove absence of domain effects");
    assert.equal(stopped.observedBusinessValue, null);
    assert.deepEqual(stopped.budget, beforeAbort, "Unknown usage is held, neither refunded nor charged twice");
    const retry = await request527(f, "/t/tenant-a/guided/command", headers, "POST", command);
    assert.equal(retry.status, 200); assert.equal(JSON.parse(retry.body).status, "OUTCOME_UNKNOWN");
    assert.deepEqual(native.client.readback().budget, beforeAbort);
    const reset = await request527(f, "/t/tenant-a/guided/command", headers, "POST", { ...command, action: "RESET_STARTER", operationId: "operation:unknown-reset-001" });
    assert.equal(reset.status, 409, "PAN528_OUTCOME_UNKNOWN_RESET_DENIED: a stopped unresolved child must not permit blind reset");
    assert.throws(() => native.owner.cleanup(), /GUIDED_OUTCOME_UNKNOWN_RETAINED/);
    const closed = await guidance.close(); guidance = undefined;
    assert.deepEqual(closed.retainedUnknownTenants, ["tenant-a"], "Unmount/close retains the actual unknown persistence instead of deleting it");
    console.log(JSON.stringify({ actualProtectedAbort: true, abortAcknowledged: ack.abortAcknowledged, childCompletedAtAck: ack.childCompleted, childCompletedAfterNativeClose: stopped.childCompleted, persistedOutcome: stopped.status, blindResetHttpStatus: reset.status, committedRuntimeUnits: stopped.budget.runtime.committedUnits, consumedRuntimeUnits: stopped.budget.runtime.consumedUnits }));
  } finally { if (native) await native.owner.waitForChildCompletion(); if (guidance) await guidance.close(); await f.close(); }
});
