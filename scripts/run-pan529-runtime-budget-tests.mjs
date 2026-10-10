import { spawnSync } from "node:child_process";
// One authoritative closed suite; concurrent process barriers are inside tests.
const files = ["tests/pan529/runtime-template.test.mjs", "tests/pan529/broker-equal-key.test.mjs", "tests/pan529/atomic-resource-budget.test.mjs", "tests/pan529/native-receipt-cache.test.mjs", "tests/pan529/native-controller.test.mjs", "tests/pan529/native-process-integration.test.mjs", "tests/pan529/registration.test.mjs", "tests/pan529/test-runner.test.mjs", "dist/tests/model-access-broker.test.js", "dist/tests/ccp-cost-budget.test.js", "tests/pan575/tool-transcript.test.mjs", "tests/pan575/broker-feedback-native.test.mjs", "tests/pan575/native-ui-consumer.test.mjs", "tests/pan575/registration.test.mjs"];
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--list") process.stdout.write(JSON.stringify(files) + "\n");
  else {
    if (args.length) throw new Error("PAN529_TEST_ARGUMENT_DENIED");
    if (process.platform !== "linux" || process.arch !== "x64") throw new Error("PAN529_TEST_REQUIRES_SUPPORTED_LINUX_X86_64");
    // Reuse the existing548 canonical owned-scratch binding. Hosted runners
    // provide RUNNER_TEMP, not TMPDIR; never substitute system /tmp or weaken
    // the original native-fixture custody check.
    const env = { ...process.env, TMPDIR: process.env.TMPDIR || process.env.RUNNER_TEMP };
    if (!env.TMPDIR) throw new Error("PAN529_OWNED_SCRATCH_REQUIRED");
    const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", "--test-reporter=tap", ...files], { stdio: "inherit", env });
    if (result.error || result.signal || result.status === null) throw new Error("PAN529_TEST_PROCESS_INTERRUPTED");
    process.exitCode = result.status;
  }
} catch (error) { process.stderr.write((error instanceof Error ? error.message : "PAN529_TEST_TOOLING_UNAVAILABLE") + "\n"); process.exitCode = 1; }
