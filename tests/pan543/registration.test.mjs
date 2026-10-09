import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, copyFileSync, appendFileSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { buildVerificationImpactPlanV2 } from "../../dist/packages/contracts/src/index.js";
test("PAN543 focused profile tests are registered in canonical pretest and the fixed owned runner rejects filtering", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(pkg.scripts.pretest.split("npm run pan543:test").length, 2);
  assert.equal(pkg.scripts["pan543:test"], 'TMPDIR="${TMPDIR:-${RUNNER_TEMP:?PAN543_OWNED_SCRATCH_REQUIRED}}" node scripts/run-pan543-browser-profile-tests.mjs');
  const listed = spawnSync(process.execPath, ["scripts/run-pan543-browser-profile-tests.mjs", "--list"], { encoding: "utf8" }); assert.equal(listed.status, 0);
  assert.deepEqual(JSON.parse(listed.stdout), readdirSync("tests/pan543").filter(p => p.endsWith(".test.mjs")).sort().map(p => "tests/pan543/" + p).sort((a,b) => JSON.parse(listed.stdout).indexOf(a) - JSON.parse(listed.stdout).indexOf(b)));
  for (const flag of ["--skip-browser", "--test-name-pattern=contract", "tests/pan543/profile.test.mjs"]) { const result = spawnSync(process.execPath, ["scripts/run-pan543-browser-profile-tests.mjs", flag], { encoding: "utf8" }); assert.notEqual(result.status, 0); assert.match(result.stderr, /PAN543_TEST_ARGUMENT_DENIED/); }
});

test("PAN543 optional presentation sources have unique existing shell ownership, adaptive tests and unchanged hard gates/runnable payload", () => {
  const graph = JSON.parse(readFileSync("verification/verification-dag-v2.json", "utf8"));
  const owner = graph.nodes.find(n => n.id === "pan541-shared-browser-shell-v1");
  const paths = ["docs/architecture/browser-profile-v1.md", "packages/browser-workspace/src/profile-editor-v1.ts", "packages/contracts/src/browser-profile-v1.ts", "scripts/run-pan543-browser-profile-tests.mjs", "scripts/refresh-pan543-integrity.mjs", "src/pan543/profile-store.mjs", "tests/pan543/backend-fixture.mjs", "tests/pan543/browser.test.mjs", "tests/pan543/profile-types.ts", "tests/pan543/profile.test.mjs", "tests/pan543/registration.test.mjs", "tests/pan543/transport.test.mjs"];
  assert.equal(graph.graphVersion, 98); assert.equal(graph.nodes.length, 103);
  const expectedGates = ["npm run lint", "npm run release-governance:verify", "npm run supply-chain:verify", "sha256sum -c SHA256SUMS", "./scripts/build-public-release.sh --output <isolated-absolute-path>"];
  assert.deepEqual(graph.hardGates, expectedGates);
  const builder = readFileSync("scripts/build-public-release.sh", "utf8");
  const refresh = readFileSync("scripts/refresh-integrity-data.mjs", "utf8");
  const manifest = new Set(readFileSync("release/public-files.manifest", "utf8").split("\n").filter(l => l && !l.startsWith("#")).map(l => l.split("\t")[0]));
  const sums = new Map(readFileSync("SHA256SUMS", "utf8").trim().split("\n").map(l => [l.slice(68), l.slice(0,64)]));
  const observedInputDigests = Object.fromEntries(graph.nodes.flatMap(n => n.inputs.map(i => [i.path,i.sha256])));
  for (const path of paths) {
    assert.deepEqual(graph.nodes.filter(n => n.inputs.some(i => i.path === path)).map(n => n.id), [owner.id], path);
    const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
    assert.equal(owner.inputs.find(i => i.path === path).sha256, actual, path);
    assert.equal(sums.get(path), actual, path);
    assert.equal(manifest.has(path), false, "No silent widening of the existing runnable payload");
    assert.ok(builder.includes(JSON.stringify(path)), path); assert.ok(refresh.includes(JSON.stringify(path)), path);
    const plan = buildVerificationImpactPlanV2({ graph, graphPath: "verification/verification-dag-v2.json", baseSha: "1".repeat(40), headSha: "2".repeat(40), changedPaths: [path], observedInputDigests });
    assert.deepEqual(plan.hardGates, [...expectedGates].sort((a,b) => a.localeCompare(b,"en")));
    if (owner.inputs.find(i => i.path === path).role === "SECURITY") {
      assert.equal(plan.mode, "FULL_FALLBACK"); assert.deepEqual(plan.reasons, ["CENTRAL_INPUT_CHANGED"]);
      assert.deepEqual(plan.selectedNodes, graph.nodes.map(n => n.id).sort((a,b) => a.localeCompare(b,"en")));
      assert.deepEqual(plan.selectedTests, [...new Set(graph.nodes.flatMap(n => n.ownedTests))].sort((a,b) => a.localeCompare(b,"en")));
    } else {
      assert.equal(plan.mode, "IMPACTED_SHADOW"); assert.deepEqual(plan.selectedNodes, [owner.id, "pan544-native-notifications-v1", "pan548-authentic-context-selection-v1", "pan549-native-analysis-result-v1", "pan563-configuration-draft-v1"]); assert.deepEqual(plan.selectedTests, ["npm run pan541:test", "npm run pan543:test", "npm run pan544:test", "npm run pan546:test", "npm run pan548:test", "npm run pan549:test", "npm run pan563:test"]);
    }
  }
  assert.deepEqual(owner.ownedTests, ["npm run pan541:test", "npm run pan543:test", "npm run pan546:test"]);
  const before = ["verification/verification-dag-v2.json", "SHA256SUMS"].map(p => readFileSync(p, "utf8"));
  const unsupportedRefresh = spawnSync(process.execPath, ["scripts/refresh-pan543-integrity.mjs", "--force"], { encoding: "utf8" });
  assert.notEqual(unsupportedRefresh.status, 0); assert.match(unsupportedRefresh.stderr, /PAN543_REFRESH_ARGUMENT_DENIED/);
  assert.deepEqual(["verification/verification-dag-v2.json", "SHA256SUMS"].map(p => readFileSync(p, "utf8")), before);
  assert.equal(graph.nodes.find(n => n.id === "repository-integrity").ownedTests.filter(t => t === "npm run pan543:test").length, 1);
});

test("PAN543 bounded refresh rejects real unrelated source drift before any evidence or checksum write", () => {
  assert.ok(process.env.TMPDIR, "PAN543_OWNED_SCRATCH_REQUIRED");
  const root = mkdtempSync(join(process.env.TMPDIR, "pan543-integrity-denial-"));
  const graphPath = "verification/verification-dag-v2.json";
  const graph = JSON.parse(readFileSync(graphPath, "utf8"));
  const paths = new Set([...graph.nodes.flatMap(n => n.inputs.map(i => i.path)), graphPath, "SHA256SUMS"]);
  try {
    for (const path of paths) { const target = join(root, path); mkdirSync(dirname(target), { recursive: true }); copyFileSync(path, target); }
    const before = [graphPath, "SHA256SUMS"].map(p => readFileSync(join(root, p), "utf8"));
    // Mutate only this owned copy, never the actual source or another owner.
    appendFileSync(join(root, "packages/contracts/src/knowledge-envelope.ts"), "\n// synthetic unrelated digest drift\n");
    const result = spawnSync(process.execPath, [resolve("scripts/refresh-pan543-integrity.mjs")], { cwd: root, encoding: "utf8", timeout: 20000 });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /PAN543_UNRELATED_DIGEST_DRIFT_DENIED:packages\/contracts\/src\/knowledge-envelope.ts/);
    assert.deepEqual([graphPath, "SHA256SUMS"].map(p => readFileSync(join(root, p), "utf8")), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
