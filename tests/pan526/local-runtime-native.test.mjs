import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("opt-in portable adapter observes the real isolated legacy demo and performs bound lifecycle jobs", { timeout: 120000 }, async () => {
  assert.ok(existsSync(new URL("../../src/pan526/local-runtime-adapter.mjs", import.meta.url)),
    "real portable adapter must implement actual native observation, not only schema shapes");
  assert.ok(process.env.PAN526_NATIVE_PROFILE, "native test requires an explicitly isolated installed profile; missing setup is not SKIP");
  const profile = JSON.parse(readFileSync(process.env.PAN526_NATIVE_PROFILE, "utf8"));
  const config = Object.fromEntries(readFileSync(join(profile.sourceRoot, ".chimpmaera-demo/config.env"), "utf8").trim().split("\n").map((line) => line.split("=")));
  const { createLocalRuntimeAdapterV1 } = await import("../../src/pan526/local-runtime-adapter.mjs");
  const contracts = await import("../../src/pan526/runtime-contract.mjs");
  const imageDigest = execFileSync("docker", ["image", "inspect", config.CM_CHIMP_IMAGE, "--format", "{{.Id}}"], { encoding: "utf8" }).trim();
  const options = { optIn: true, sourceRoot: profile.sourceRoot, instanceId: profile.instanceId, sourceCommit: profile.sourceCommit, sourceTree: profile.sourceTree, imageDigest, expectedGeneration: 1 };
  const adapter = createLocalRuntimeAdapterV1(options);
  const observed = adapter.observe();
  assert.equal(observed.state.phase, "running");
  assert.equal(observed.state.identity.runtime.name, "node");
  assert.equal(observed.state.identity.runtime.version, "24.14.1");
  assert.equal(observed.state.identity.productVersion, "0.2.0-poc.20260810.5");
  assert.equal(observed.state.identity.generation, 1);
  const ready = await adapter.readiness();
  assert.equal(ready.state, "READY"); assert.equal(ready.probe.httpStatus, 200);
  const wrongGeneration = createLocalRuntimeAdapterV1({ ...options, expectedGeneration: 2 });
  assert.deepEqual((await wrongGeneration.readiness()).reasonCodes, ["RUNTIME_IDENTITY_MISMATCH"]);
  const desiredState = adapter.desiredState("running");
  const job = { schemaVersion: "pansphaira.portable-runtime/lifecycle-job/v1", jobId: "native-restart-" + Date.now(), action: "restart", audience: "pansphaira-local-runtime-v1", tenantId: adapter.expectedIdentity.tenantId, instanceId: profile.instanceId, componentId: adapter.expectedIdentity.componentId, generation: 1, identityDigest: contracts.runtimeIdentityDigestV1(adapter.expectedIdentity), desiredStateDigest: contracts.runtimeDesiredStateDigestV1(desiredState), issuedAtMs: Date.now(), deadlineMs: 30000 };
  const restart = await adapter.dispatchLifecycle(job);
  assert.equal(restart.outcome, "succeeded");
  assert.equal(restart.reasonCode, "OBSERVED_TARGET_REACHED");
  assert.equal((await adapter.dispatchLifecycle(job)).jobDigest, restart.jobDigest, "same job is readback, not a second restart");
  const ambiguous = { ...job, jobId: "native-interrupted-" + Date.now(), issuedAtMs: Date.now(), deadlineMs: 1 };
  const interrupted = await adapter.dispatchLifecycle(ambiguous);
  assert.equal(interrupted.outcome, "outcome_unknown");
  assert.equal(interrupted.reasonCode, "DISPATCH_INTERRUPTED");
  assert.equal(interrupted.observedStateDigest, null);
  assert.equal((await adapter.dispatchLifecycle(ambiguous)).outcome, "outcome_unknown", "unknown job must not auto-retry or relabel failed");
});

test("HTTP200 with an actually wrong native business value is NOT_READY and restored value recovers", { timeout: 120000 }, async () => {
  assert.ok(process.env.PAN526_NATIVE_PROFILE);
  const profile = JSON.parse(readFileSync(process.env.PAN526_NATIVE_PROFILE, "utf8"));
  const config = Object.fromEntries(readFileSync(join(profile.sourceRoot, ".chimpmaera-demo/config.env"), "utf8").trim().split("\n").map((line) => line.split("=")));
  const { createLocalRuntimeAdapterV1 } = await import("../../src/pan526/local-runtime-adapter.mjs");
  const imageDigest = execFileSync("docker", ["image", "inspect", config.CM_CHIMP_IMAGE, "--format", "{{.Id}}"], { encoding: "utf8" }).trim();
  const adapter = createLocalRuntimeAdapterV1({ optIn: true, sourceRoot: profile.sourceRoot, instanceId: profile.instanceId, sourceCommit: profile.sourceCommit, sourceTree: profile.sourceTree, imageDigest, expectedGeneration: 1 });
  const before = await adapter.readiness(); assert.equal(before.state, "READY");
  const seed = JSON.parse(readFileSync(join(profile.sourceRoot, ".chimpmaera-demo/public/seed-and-flow.json"), "utf8"));
  const orderId = String(seed.governedFlow.target.id); assert.match(orderId, /^[1-9][0-9]*$/);
  const dbId = execFileSync("docker", ["ps", "-q", "--filter", "label=com.docker.compose.project=" + profile.instanceId, "--filter", "label=com.docker.compose.service=doli-db"], { encoding: "utf8" }).trim();
  assert.match(dbId, /^[a-f0-9]{12,64}$/);
  const sql = (query) => execFileSync("docker", ["exec", "-i", dbId, "sh", "-c", "read -r MYSQL_PWD < /run/secrets/root; export MYSQL_PWD; exec mariadb --batch --skip-column-names -uroot dolidb"], { input: query, encoding: "utf8", timeout: 30000, stdio: ["pipe", "pipe", "pipe"] }).trim();
  const [lineId, originalQuantity] = sql("SELECT rowid, qty FROM llx_commandedet WHERE fk_commande=" + orderId + " ORDER BY rowid LIMIT 1;\n").split("\t");
  assert.match(lineId, /^[1-9][0-9]*$/); assert.match(originalQuantity, /^[0-9]+(?:\.[0-9]+)?$/);
  let wrong;
  try {
    sql("UPDATE llx_commandedet SET qty=qty+1 WHERE rowid=" + lineId + " AND fk_commande=" + orderId + ";\n");
    wrong = await adapter.readiness();
    assert.equal(wrong.probe.httpStatus, 200, "actual protected provider read still responds200");
    assert.equal(wrong.state, "NOT_READY");
    assert.deepEqual(wrong.reasonCodes, ["BUSINESS_PROBE_MISMATCH"]);
  } finally {
    sql("UPDATE llx_commandedet SET qty=" + originalQuantity + " WHERE rowid=" + lineId + " AND fk_commande=" + orderId + ";\n");
    assert.equal(sql("SELECT qty FROM llx_commandedet WHERE rowid=" + lineId + " AND fk_commande=" + orderId + ";\n"), originalQuantity);
  }
  const restored = await adapter.readiness(); assert.equal(restored.state, "READY");
  if (process.env.PAN526_NATIVE_EVIDENCE) {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(process.env.PAN526_NATIVE_EVIDENCE, { recursive: true, mode: 0o700 });
    writeFileSync(join(process.env.PAN526_NATIVE_EVIDENCE, "actual-http200-business-fault-and-restore.json"), JSON.stringify({ sourceCommit: profile.sourceCommit, instanceId: profile.instanceId, before, wrong, restored, actualNativeQuantityChangedAndRestored: true, productionAuthority: false }, null, 2) + "\n", { mode: 0o600 });
  }
});
