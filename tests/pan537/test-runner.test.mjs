import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const runner = "scripts/run-pan537-proposal-diff-browser-tests.mjs";
const expected = [
  "tests/pan537/browser-proposal-diff.test.mjs",
  "tests/pan537/registration.test.mjs",
  "tests/pan537/test-runner.test.mjs",
  "tests/pan538/setup-overflow.test.mjs",
];
test("PAN537 closed browser/native suite keeps every original case mandatory and uses owned hosted scratch", () => {
  assert.ok(existsSync(runner), "PAN537_CLOSED_RUNNER_MISSING");
  const list = spawnSync(process.execPath, [runner, "--list"], { encoding: "utf8" });
  assert.equal(list.status, 0, list.stderr); assert.deepEqual(JSON.parse(list.stdout), expected);
  const env = { ...process.env, RUNNER_TEMP: process.env.TMPDIR || process.env.RUNNER_TEMP };
  delete env.TMPDIR; assert.ok(env.RUNNER_TEMP);
  const hosted = spawnSync("npm", ["run", "--silent", "pan537:test", "--", "--list"], { encoding: "utf8", env });
  assert.equal(hosted.status, 0, hosted.stderr); assert.deepEqual(JSON.parse(hosted.stdout), expected);
  delete env.RUNNER_TEMP;
  const missing = spawnSync("npm", ["run", "--silent", "pan537:test", "--", "--list"], { encoding: "utf8", env });
  assert.notEqual(missing.status, 0); assert.match(missing.stderr, /PAN537_OWNED_SCRATCH_REQUIRED/); assert.equal(missing.stdout, "");
  for (const args of [["--skip-browser"], ["--test-name-pattern", "nothing"], [expected[0]], ["--list", "--skip"]]) {
    const denied = spawnSync(process.execPath, [runner, ...args], { encoding: "utf8" });
    assert.equal(denied.status, 1); assert.match(denied.stderr, /PAN537_TEST_ARGUMENT_DENIED/); assert.equal(denied.stdout, "");
  }
});
