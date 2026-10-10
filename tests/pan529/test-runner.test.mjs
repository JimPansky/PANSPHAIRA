import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
const runner = "scripts/run-pan529-runtime-budget-tests.mjs";
const expected = ["tests/pan529/runtime-template.test.mjs", "tests/pan529/broker-equal-key.test.mjs", "tests/pan529/atomic-resource-budget.test.mjs", "tests/pan529/native-receipt-cache.test.mjs", "tests/pan529/native-controller.test.mjs", "tests/pan529/native-process-integration.test.mjs", "tests/pan529/registration.test.mjs", "tests/pan529/test-runner.test.mjs", "dist/tests/model-access-broker.test.js", "dist/tests/ccp-cost-budget.test.js", "tests/pan575/tool-transcript.test.mjs", "tests/pan575/broker-feedback-native.test.mjs", "tests/pan575/native-ui-consumer.test.mjs", "tests/pan575/registration.test.mjs"];
test("PAN529 authoritative launcher includes all original native tests and denies caller filtering", () => {
  assert.ok(existsSync(runner), "Closed PAN529 canonical lifecycle launcher is not implemented");
  const listing = spawnSync(process.execPath, [runner, "--list"], { encoding: "utf8" });
  assert.equal(listing.status, 0, listing.stderr);
  assert.deepEqual(JSON.parse(listing.stdout), expected);
  for (const args of [["--test-name-pattern", "nothing"], ["--skip"], ["tests/pan529/runtime-template.test.mjs"], ["--list", "--skip"]]) {
    const denied = spawnSync(process.execPath, [runner, ...args], { encoding: "utf8" });
    assert.equal(denied.status, 1); assert.match(denied.stderr, /PAN529_TEST_ARGUMENT_DENIED/);
    assert.equal(denied.stdout, "");
  }
});
