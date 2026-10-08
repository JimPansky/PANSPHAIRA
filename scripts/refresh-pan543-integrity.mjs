import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

// Bounded local inventory refresh only. No test outcomes, review, release or
// secure-default evidence is created. Unrelated digest drift fails closed.
if (process.argv.length !== 2) throw new Error("PAN543_REFRESH_ARGUMENT_DENIED");
const inputs = [
  ["docs/architecture/browser-profile-v1.md", "DERIVED_EVIDENCE"],
  ["packages/browser-workspace/src/profile-editor-v1.ts", "SOURCE"],
  ["packages/contracts/src/browser-profile-v1.ts", "CONTRACT"],
  ["scripts/run-pan543-browser-profile-tests.mjs", "VALIDATOR"],
  ["scripts/refresh-pan543-integrity.mjs", "SOURCE"],
  ["src/pan543/profile-store.mjs", "SECURITY"],
  ["tests/pan543/backend-fixture.mjs", "VALIDATOR"],
  ["tests/pan543/browser.test.mjs", "VALIDATOR"],
  ["tests/pan543/profile-types.ts", "VALIDATOR"],
  ["tests/pan543/profile.test.mjs", "VALIDATOR"],
  ["tests/pan543/registration.test.mjs", "VALIDATOR"],
  ["tests/pan543/transport.test.mjs", "VALIDATOR"],
];
const allowed = new Set([...inputs.map(([p]) => p),
  "package.json", "packages/browser-workspace/src/app.ts",
  "packages/browser-workspace/src/workspace.css", "packages/browser-workspace/src/workspace.html",
  "src/pan527/origin-session-adapter.mjs", "src/pan541/workspace-browser.mjs",
  "scripts/build-public-release.sh", "scripts/refresh-integrity-data.mjs",
  "tests/pan541/registration.test.mjs", "tests/pan527/registration.test.mjs",
  "tests/pan526/registration.test.mjs", "tests/pan515/registration.test.mjs",
  "tests/procurement-434/procurement-registration.test.mjs", "tests/verification-fabric-v2.test.ts",
  "verification/verification-dag-v2.json",
]);
const graphPath = "verification/verification-dag-v2.json";
const graph = JSON.parse(readFileSync(graphPath, "utf8"));
assert.equal(graph.graphVersion, 95);
assert.equal(graph.nodes.length, 100);
assert.deepEqual(graph.hardGates, ["npm run lint", "npm run release-governance:verify", "npm run supply-chain:verify", "sha256sum -c SHA256SUMS", "./scripts/build-public-release.sh --output <isolated-absolute-path>"]);
const owners = graph.nodes.filter(n => n.id === "pan541-shared-browser-shell-v1");
assert.equal(owners.length, 1, "PAN543_EXISTING_SHELL_OWNER_REQUIRED");
const owner = owners[0];
assert.deepEqual(owner.dependsOn, ["pan516-native-procurement-v1", "pan527-origin-session-v1"]);
assert.equal(owner.riskClass, "HIGH"); assert.equal(owner.globalInvalidation, false);
assert.ok(JSON.stringify(owner.ownedTests) === JSON.stringify(["npm run pan541:test"]) || JSON.stringify(owner.ownedTests) === JSON.stringify(["npm run pan541:test", "npm run pan543:test"]), "PAN543_EXISTING_TEST_OWNERSHIP_DENIED");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const sha = path => hash(readFileSync(path));
for (const [path, role] of inputs) {
  const existingOwners = graph.nodes.filter(n => n.inputs.some(i => i.path === path));
  if (existingOwners.length !== 0) {
    assert.deepEqual(existingOwners.map(n => n.id), [owner.id], "PAN543_SOURCE_OWNERSHIP_DENIED:" + path);
    assert.equal(owner.inputs.filter(i => i.path === path).length, 1);
    assert.equal(owner.inputs.find(i => i.path === path).role, role);
  } else owner.inputs.push({ path, role, sha256: sha(path) });
}
if (!owner.ownedTests.includes("npm run pan543:test")) owner.ownedTests.push("npm run pan543:test");
const integrationOwners = graph.nodes.filter(n => n.id === "repository-integrity");
assert.equal(integrationOwners.length, 1);
if (!integrationOwners[0].ownedTests.includes("npm run pan543:test")) integrationOwners[0].ownedTests.push("npm run pan543:test");
for (const node of graph.nodes) for (const input of node.inputs) {
  const actual = sha(input.path);
  if (!allowed.has(input.path) && input.sha256 !== actual) throw new Error("PAN543_UNRELATED_DIGEST_DRIFT_DENIED:" + input.path);
  if (allowed.has(input.path)) input.sha256 = actual;
}
const graphBytes = JSON.stringify(graph, null, 2) + "\n";
const entries = new Map();
for (const line of readFileSync("SHA256SUMS", "utf8").trimEnd().split("\n")) {
  const match = /^([a-f0-9]{64})  \.\/(.+)$/.exec(line);
  assert.ok(match, "PAN543_CHECKSUM_FORMAT_DENIED");
  assert.ok(!entries.has(match[2]), "PAN543_DUPLICATE_CHECKSUM_DENIED");
  entries.set(match[2], match[1]);
}
for (const [path] of inputs) if (!entries.has(path)) entries.set(path, null);
const sums = [...entries].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, expected]) => {
  const actual = path === graphPath ? hash(graphBytes) : sha(path);
  if (!allowed.has(path) && expected !== actual) throw new Error("PAN543_UNRELATED_CHECKSUM_DRIFT_DENIED:" + path);
  return `${actual}  ./${path}`;
}).join("\n") + "\n";
// All ownership, digests and checksums are validated before either write.
writeFileSync(graphPath, graphBytes);
writeFileSync("SHA256SUMS", sums);
console.log(`PAN543_INTEGRITY_REFRESHED owner=${owner.id} addedOrBoundPaths=${inputs.length} qualificationClaimsWritten=0`);
