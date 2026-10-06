import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { buildVerificationImpactPlanV2 } from "../../dist/packages/contracts/src/index.js";
const load = path => JSON.parse(readFileSync(path, "utf8"));
const sha = path => createHash("sha256").update(readFileSync(path)).digest("hex");

test("PAN537 existing proposal browser correction has one bounded owner and mandatory actual native regression without widening legacy membership or gates", () => {
  const graph = load("verification/verification-dag-v2.json");
  const owners = graph.nodes.filter(node => node.id === "pan537-proposal-diff-browser-v1");
  assert.equal(owners.length, 1, "PAN537_AUTHORITATIVE_SOURCE_OWNER_NOT_REGISTERED");
  const owner = owners[0]; assert.equal(graph.graphVersion, 93);
  assert.deepEqual(owner.dependsOn, []); assert.deepEqual(owner.ownedTests, ["npm run pan537:test"]);
  assert.equal(owner.riskClass, "HIGH"); assert.equal(owner.globalInvalidation, false);
  assert.deepEqual(graph.hardGates, ["npm run lint", "npm run release-governance:verify", "npm run supply-chain:verify", "sha256sum -c SHA256SUMS", "./scripts/build-public-release.sh --output <isolated-absolute-path>"]);
  const expected = ["packages/setup-coordinator/src/index.ts", "tests/pan537/native-browser-fixture.mjs", "tests/pan537/browser-proposal-diff.test.mjs", "tests/pan537/registration.test.mjs", "tests/pan537/test-runner.test.mjs", "scripts/run-pan537-proposal-diff-browser-tests.mjs", "docs/architecture/pan537-proposal-diff-browser-v1.md", "tests/pan538/setup-overflow.test.mjs"];
  assert.deepEqual(owner.inputs.map(row => row.path).sort(), [...expected].sort());
  const observedInputDigests = Object.fromEntries(graph.nodes.flatMap(node => node.inputs.map(row => [row.path, row.sha256])));
  const manifest = new Set(readFileSync("release/public-files.manifest", "utf8").split("\n").filter(line => line && !line.startsWith("#")).map(line => line.split("\t")[0]));
  const builder = readFileSync("scripts/build-public-release.sh", "utf8");
  for (const input of owner.inputs) {
    assert.equal(input.sha256, sha(input.path), input.path);
    assert.deepEqual(graph.nodes.filter(node => node.inputs.some(row => row.path === input.path)).map(node => node.id), [owner.id]);
    // The existing dashboard source already belongs to the legacy payload.
    // All new regression/documentation/runner paths remain source-only.
    if (input.path === "packages/setup-coordinator/src/index.ts") assert.equal(manifest.has(input.path), true);
    else { assert.equal(manifest.has(input.path), false); assert.ok(builder.includes(JSON.stringify(input.path)), input.path); }
    const plan = buildVerificationImpactPlanV2({ graph, graphPath: "verification/verification-dag-v2.json", baseSha: "1".repeat(40), headSha: "2".repeat(40), changedPaths: [input.path], observedInputDigests });
    assert.deepEqual(plan.selectedNodes, [owner.id]); assert.deepEqual(plan.selectedTests, ["npm run pan537:test"]);
    assert.deepEqual(plan.hardGates, [...graph.hardGates].sort((a, b) => a.localeCompare(b, "en")));
  }
  assert.equal(graph.nodes.find(node => node.id === "repository-integrity").ownedTests.filter(command => command === "npm run pan537:test").length, 1);
  const pkg = load("package.json"); assert.equal(pkg.scripts["pan537:test"], 'TMPDIR="${TMPDIR:-${RUNNER_TEMP:?PAN537_OWNED_SCRATCH_REQUIRED}}" node scripts/run-pan537-proposal-diff-browser-tests.mjs');
  assert.equal(pkg.scripts.pretest.split("npm run pan537:test").length, 2);
});
