import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import { buildVerificationImpactPlanV2 } from "../../dist/packages/contracts/src/index.js";
const load = (path) => JSON.parse(readFileSync(path, "utf8"));
const digest = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

test("PAN529 native template and budget have one additive owner in authoritative lifecycle", () => {
  const graph = load("verification/verification-dag-v2.json");
  const owners = graph.nodes.filter((node) => node.id === "pan529-runtime-budget-v1");
  assert.equal(owners.length, 1, "Native H05 executable source must have its actual canonical owner");
  const owner = owners[0];
  assert.equal(graph.graphVersion, 86);
  assert.deepEqual(owner.dependsOn, ["pan526-portable-runtime-v1"]);
  assert.deepEqual(owner.ownedTests, ["npm run pan529:test"]);
  assert.equal(owner.riskClass, "HIGH"); assert.equal(owner.globalInvalidation, false);
  assert.deepEqual(graph.hardGates, ["npm run lint", "npm run release-governance:verify", "npm run supply-chain:verify", "sha256sum -c SHA256SUMS", "./scripts/build-public-release.sh --output <isolated-absolute-path>"]);
  const required = ["packages/contracts/src/model-access-broker.ts", "demo/runtime/atomic-resource-budget.mjs", "src/pan529/runtime-template-contract.mjs", "src/pan529/native-budget-controller.mjs", "contracts/runtime-budget/candidates/runtime-budget-development-v1.json", "tests/pan529/native-process-integration.test.mjs", "tests/pan529/native-provider-worker.mjs", "tests/pan529/registration.test.mjs", "scripts/run-pan529-runtime-budget-tests.mjs"];
  for (const path of required) assert.ok(owner.inputs.some((input) => input.path === path), path);
  const observedInputDigests = Object.fromEntries(graph.nodes.flatMap((node) => node.inputs.map((input) => [input.path, input.sha256])));
  const legacy = new Set(readFileSync("release/public-files.manifest", "utf8").split("\n").filter((line) => line && !line.startsWith("#")).map((line) => line.split("\t")[0]));
  const builder = readFileSync("scripts/build-public-release.sh", "utf8");
  for (const input of owner.inputs) {
    assert.equal(input.sha256, digest(input.path), input.path);
    assert.deepEqual(graph.nodes.filter((node) => node.inputs.some((item) => item.path === input.path)).map((node) => node.id), [owner.id]);
    if (input.path === "packages/contracts/src/model-access-broker.ts") {
      assert.equal(legacy.has(input.path), true, "Authorized equal-key fix preserves existing shared contract payload membership");
    } else {
      assert.equal(legacy.has(input.path), false, "New opt-in native adapter stays outside the legacy runnable payload");
      assert.ok(builder.includes(JSON.stringify(input.path)), input.path);
    }
    const plan = buildVerificationImpactPlanV2({ graph, graphPath: "verification/verification-dag-v2.json", baseSha: "1".repeat(40), headSha: "2".repeat(40), changedPaths: [input.path], observedInputDigests });
    assert.deepEqual(plan.selectedNodes, [owner.id]);
    assert.deepEqual(plan.selectedTests, ["npm run pan529:test"]);
    assert.deepEqual(plan.hardGates, [...graph.hardGates].sort((a, b) => a.localeCompare(b, "en")));
  }
  const pkg = load("package.json");
  assert.equal(pkg.scripts["pan529:test"], "node scripts/run-pan529-runtime-budget-tests.mjs");
  assert.equal(pkg.scripts.pretest.split("npm run pan529:test").length, 2);
  assert.equal(graph.nodes.find((node) => node.id === "repository-integrity").ownedTests.filter((command) => command === "npm run pan529:test").length, 1);
  assert.equal(digest("contracts/runtime-portability/portable-runtime-v1.schema.json"), "7c49eb32b45d4942f81828713babd45ef643a4d63b230e039445e6e9c2c6ebcb");
  assert.equal(digest("contracts/runtime-budget/candidates/runtime-budget-development-v1.json"), "4f8ed30d2446639fa4f3b28589a8c9ef362ca8b1083f702fabcc40d22b887255");
});
