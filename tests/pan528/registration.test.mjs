import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildVerificationImpactPlanV2 } from "../../dist/packages/contracts/src/index.js";
const load = path => JSON.parse(readFileSync(path, "utf8"));
const sha = path => createHash("sha256").update(readFileSync(path)).digest("hex");

test("PAN528 full native browser journey is registered once with existing transport/domain/budget owners and all unchanged hard gates", () => {
  const graph = load("verification/verification-dag-v2.json"); const nodes = graph.nodes.filter(node => node.id === "pan528-guided-native-browser-v1");
  assert.equal(nodes.length, 1, "PAN528_AUTHORITATIVE_SOURCE_REGISTRATION_REQUIRED");
  assert.equal(graph.graphVersion, 94); const owner = nodes[0];
  assert.deepEqual(owner.dependsOn, ["pan515-native-trade-state-v1", "pan527-origin-session-v1", "pan529-runtime-budget-v1"]);
  assert.deepEqual(owner.ownedTests, ["npm run pan528:test"]); assert.equal(owner.riskClass, "HIGH"); assert.equal(owner.globalInvalidation, false);
  assert.deepEqual(graph.hardGates, ["npm run lint", "npm run release-governance:verify", "npm run supply-chain:verify", "sha256sum -c SHA256SUMS", "./scripts/build-public-release.sh --output <isolated-absolute-path>"]);
  const inputPaths = owner.inputs.map(input => input.path);
  for (const path of ["src/pan528/app.js", "src/pan528/native-journey-controller.mjs", "src/pan528/starter-worker.mjs", "src/pan528/owned-leading-resources.mjs", "tests/pan528/wrong-business-value-browser.test.mjs", "tests/pan528/native-process-restart.test.mjs", "scripts/run-pan528-guided-browser-tests.mjs", "docs/architecture/pan528-guided-browser-v1.md", "verification/pan528-guided-browser-boundary-v1.json"]) assert.ok(inputPaths.includes(path), path);
  const observedInputDigests = Object.fromEntries(graph.nodes.flatMap(node => node.inputs.map(input => [input.path, input.sha256])));
  const manifest = new Set(readFileSync("release/public-files.manifest", "utf8").split("\n").filter(line => line && !line.startsWith("#")).map(line => line.split("\t")[0]));
  const builder = readFileSync("scripts/build-public-release.sh", "utf8");
  for (const input of owner.inputs) {
    assert.equal(input.sha256, sha(input.path), input.path);
    assert.deepEqual(graph.nodes.filter(node => node.inputs.some(row => row.path === input.path)).map(node => node.id), [owner.id]);
    assert.equal(manifest.has(input.path), false, "Source-only optional journey must not silently change the legacy runnable payload");
    assert.ok(builder.includes(JSON.stringify(input.path)), input.path);
    const plan = buildVerificationImpactPlanV2({ graph, graphPath: "verification/verification-dag-v2.json", baseSha: "1".repeat(40), headSha: "2".repeat(40), changedPaths: [input.path], observedInputDigests });
    assert.deepEqual(plan.selectedNodes, [owner.id]); assert.deepEqual(plan.selectedTests, ["npm run pan528:test"]);
    assert.deepEqual(plan.hardGates, [...graph.hardGates].sort((a, b) => a.localeCompare(b, "en")));
  }
  const pkg = load("package.json"); assert.equal(pkg.scripts["pan528:test"], 'TMPDIR="${TMPDIR:-${RUNNER_TEMP:?PAN528_OWNED_SCRATCH_REQUIRED}}" node scripts/run-pan528-guided-browser-tests.mjs');
  assert.equal(pkg.scripts.pretest.split("npm run pan528:test").length, 2);
  assert.equal(graph.nodes.find(node => node.id === "repository-integrity").ownedTests.filter(command => command === "npm run pan528:test").length, 1);
});
