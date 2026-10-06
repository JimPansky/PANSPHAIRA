import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";

// Fixed real browser/native suite. Listing is not execution qualification.
const files = [
  "tests/pan537/browser-proposal-diff.test.mjs",
  "tests/pan537/registration.test.mjs",
  "tests/pan537/test-runner.test.mjs",
  "tests/pan538/setup-overflow.test.mjs",
];
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--list") process.stdout.write(JSON.stringify(files) + "\n");
  else {
    if (args.length) throw new Error("PAN537_TEST_ARGUMENT_DENIED");
    if (process.platform !== "linux" || process.arch !== "x64") throw new Error("PAN537_TEST_REQUIRES_SUPPORTED_LINUX_X86_64");
    const scratch = process.env.TMPDIR || process.env.RUNNER_TEMP;
    if (!scratch) throw new Error("PAN537_OWNED_SCRATCH_REQUIRED");
    const env = { ...process.env, TMPDIR: scratch,
      PAN537_BROWSER_MODULE: process.env.PAN537_BROWSER_MODULE || import.meta.resolve("playwright"),
      PAN537_EVIDENCE_DIR: mkdtempSync(join(scratch, "pan537-browser-native-")),
    };
    const run = spawnSync(process.execPath, ["--test", "--test-concurrency=1", "--test-reporter=tap", ...files], { env, stdio: "inherit" });
    if (run.error || run.signal || run.status === null) throw new Error("PAN537_TEST_PROCESS_INTERRUPTED");
    process.exitCode = run.status;
  }
} catch (error) {
  process.stderr.write((error instanceof Error ? error.message : "PAN537_TEST_TOOLING_UNAVAILABLE") + "\n");
  process.exitCode = 1;
}
