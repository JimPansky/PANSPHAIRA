import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import test from "node:test";

test("PAN528 authoritative runner lists all real product tests once and refuses caller-selected or skipping probes", () => {
  const runner = "scripts/run-pan528-guided-browser-tests.mjs";
  const listing = spawnSync(process.execPath, [runner, "--list"], { encoding: "utf8", timeout: 5000 });
  assert.equal(listing.status, 0, "PAN528_CLOSED_REAL_BROWSER_RUNNER_REQUIRED: " + listing.stderr);
  const files = JSON.parse(listing.stdout);
  assert.deepEqual(files, readdirSync("tests/pan528").filter(file => file.endsWith(".test.mjs")).sort().map(file => "tests/pan528/" + file));
  assert.equal(new Set(files).size, files.length);
  for (const args of [["--skip"], ["--test-name-pattern", "starter"], ["tests/pan528/native-business-starter.test.mjs"], ["--list", "--skip"]]) {
    const denied = spawnSync(process.execPath, [runner, ...args], { encoding: "utf8", timeout: 5000 });
    assert.equal(denied.status, 1); assert.match(denied.stderr, /PAN528_TEST_ARGUMENT_DENIED/);
  }
});
