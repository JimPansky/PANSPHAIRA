import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
const runner = "scripts/run-pan541-shared-browser-shell-tests.mjs";
test("PAN541 mandatory runner includes every owned test and rejects caller-selected or skipped cases", () => {
  const list = spawnSync(process.execPath, [runner, "--list"], { encoding: "utf8", timeout: 5000 });
  assert.equal(list.status, 0, "PAN541_CLOSED_RUNNER_MISSING: " + list.stderr);
  const files = JSON.parse(list.stdout);
  assert.deepEqual(files, readdirSync("tests/pan541").filter(p => p.endsWith(".test.mjs")).sort().map(p => "tests/pan541/" + p));
  assert.equal(new Set(files).size, files.length);
  for (const args of [["--skip-browser"], ["--test-name-pattern", "descriptor"], [files[0]], ["--list", "--skip"]]) {
    const denied = spawnSync(process.execPath, [runner, ...args], { encoding: "utf8", timeout: 5000 });
    assert.equal(denied.status, 1); assert.equal(denied.stdout, ""); assert.equal(denied.stderr.trim(), "PAN541_TEST_ARGUMENT_DENIED");
  }
});
test("PAN541 runner requires owned scratch but supports the hosted RUNNER_TEMP contract", () => {
  const env = { ...process.env }; delete env.TMPDIR; delete env.RUNNER_TEMP;
  const denied = spawnSync(process.execPath, [runner], { env, encoding: "utf8", timeout: 5000 });
  assert.equal(denied.status, 1); assert.equal(denied.stdout, ""); assert.equal(denied.stderr.trim(), "PAN541_OWNED_SCRATCH_REQUIRED");
});
