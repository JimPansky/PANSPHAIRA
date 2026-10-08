import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { buildVerificationImpactPlanV2 } from "../../dist/packages/contracts/src/index.js";
const load = p => JSON.parse(readFileSync(p, "utf8"));
const sha = p => createHash("sha256").update(readFileSync(p)).digest("hex");
test("PAN541 shared browser/typed shell has exactly one additive owner, native dependencies and every original hard gate", () => {
  const graph = load("verification/verification-dag-v2.json"); const owners = graph.nodes.filter(n => n.id === "pan541-shared-browser-shell-v1");
  assert.equal(owners.length, 1, "PAN541_AUTHORITATIVE_SOURCE_OWNER_NOT_REGISTERED");
  assert.equal(graph.graphVersion, 94); const owner = owners[0];
  assert.deepEqual(owner.dependsOn, ["pan516-native-procurement-v1", "pan527-origin-session-v1"]);
  assert.deepEqual(owner.ownedTests, ["npm run pan541:test", "npm run pan543:test"]); assert.equal(owner.riskClass, "HIGH"); assert.equal(owner.globalInvalidation, false);
  assert.deepEqual(graph.hardGates, ["npm run lint", "npm run release-governance:verify", "npm run supply-chain:verify", "sha256sum -c SHA256SUMS", "./scripts/build-public-release.sh --output <isolated-absolute-path>"]);
  const paths = owner.inputs.map(i => i.path);
  for (const p of ["packages/contracts/src/browser-shell-plugin-v1.ts", "packages/contracts/src/browser-erv-read-v1.ts", "packages/browser-shell/src/context-owner-v1.ts", "packages/browser-shell/src/registry-v1.ts", "packages/browser-shell/src/deep-link-v1.ts", "packages/browser-workspace/src/app.ts", "packages/browser-workspace/src/workspace.css", "src/pan541/workspace-browser.mjs", "src/pan541/native-erv-read-adapter.mjs", "tests/pan541/browser-workspace.test.mjs", "tests/pan541/browser-context-safety.test.mjs", "tests/pan541/browser-plugin-fault.test.mjs", "tests/pan541/registration.test.mjs", "scripts/run-pan541-shared-browser-shell-tests.mjs"]) assert.ok(paths.includes(p), p);
  const digests = Object.fromEntries(graph.nodes.flatMap(n => n.inputs.map(i => [i.path, i.sha256])));
  const manifest = new Set(readFileSync("release/public-files.manifest", "utf8").split("\n").filter(l => l && !l.startsWith("#")).map(l => l.split("\t")[0]));
  const builder = readFileSync("scripts/build-public-release.sh", "utf8");
  for (const input of owner.inputs) {
    assert.equal(input.sha256, sha(input.path), input.path); assert.deepEqual(graph.nodes.filter(n => n.inputs.some(i => i.path === input.path)).map(n => n.id), [owner.id]);
    assert.equal(manifest.has(input.path), false, "Optional source browser must not silently change the unchanged legacy runnable payload"); assert.ok(builder.includes(JSON.stringify(input.path)), input.path);
    const plan = buildVerificationImpactPlanV2({ graph, graphPath: "verification/verification-dag-v2.json", baseSha: "1".repeat(40), headSha: "2".repeat(40), changedPaths: [input.path], observedInputDigests: digests });
    assert.deepEqual(plan.hardGates, [...graph.hardGates].sort((a,b) => a.localeCompare(b,"en")));
    if (input.role === "SECURITY") {
      assert.equal(plan.mode, "FULL_FALLBACK"); assert.deepEqual(plan.reasons, ["CENTRAL_INPUT_CHANGED"]);
      assert.deepEqual(plan.selectedNodes, graph.nodes.map(n => n.id).sort((a,b) => a.localeCompare(b,"en")));
      assert.deepEqual(plan.selectedTests, [...new Set(graph.nodes.flatMap(n => n.ownedTests))].sort((a,b) => a.localeCompare(b,"en")));
    } else {
      assert.deepEqual(plan.selectedNodes, [owner.id, "pan563-configuration-draft-v1"]); assert.deepEqual(plan.selectedTests, ["npm run pan541:test", "npm run pan543:test", "npm run pan563:test"]);
    }
  }
  assert.equal(graph.nodes.find(n => n.id === "repository-integrity").ownedTests.filter(t => t === "npm run pan541:test").length, 1);
  const pkg = load("package.json"); assert.equal(pkg.scripts["pan541:test"], 'TMPDIR="${TMPDIR:-${RUNNER_TEMP:?PAN541_OWNED_SCRATCH_REQUIRED}}" node scripts/run-pan541-shared-browser-shell-tests.mjs'); assert.equal(pkg.scripts.pretest.split("npm run pan541:test").length, 2);
});
