import { spawnSync } from "node:child_process";

// Closed mandatory suite: real TLS/Chromium/native persistence and lifecycle.
// Missing native/browser tooling fails; no caller selection or skip switches.
const files = [
  "tests/pan528/browser-denials.test.mjs",
  "tests/pan528/guided-abort-browser.test.mjs",
  "tests/pan528/guided-abort-native.test.mjs",
  "tests/pan528/guided-browser-native.test.mjs",
  "tests/pan528/guided-helper-boundary.test.mjs",
  "tests/pan528/guided-helper-browser.test.mjs",
  "tests/pan528/guided-reset-browser.test.mjs",
  "tests/pan528/guided-reset-native.test.mjs",
  "tests/pan528/mobile-browser.test.mjs",
  "tests/pan528/native-business-starter.test.mjs",
  "tests/pan528/native-process-restart.test.mjs",
  "tests/pan528/owned-cleanup-boundary.test.mjs",
  "tests/pan528/owner-json-special-files.test.mjs",
  "tests/pan528/registration.test.mjs",
  "tests/pan528/test-runner.test.mjs",
  "tests/pan528/wrong-business-value-browser.test.mjs",
];
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--list") process.stdout.write(JSON.stringify(files) + "\n");
  else {
    if (args.length) throw new Error("PAN528_TEST_ARGUMENT_DENIED");
    if (process.platform !== "linux" || process.arch !== "x64") throw new Error("PAN528_TEST_REQUIRES_SUPPORTED_LINUX_X86_64");
    const env = { ...process.env,
      TMPDIR: process.env.TMPDIR || process.env.RUNNER_TEMP,
      PAN527_BROWSER_MODULE: process.env.PAN527_BROWSER_MODULE || import.meta.resolve("playwright"),
      PAN527_CERTUTIL: process.env.PAN527_CERTUTIL || "certutil",
    };
    if (!env.TMPDIR) throw new Error("PAN528_OWNED_SCRATCH_REQUIRED");
    const run = spawnSync(process.execPath, ["--test", "--test-concurrency=1", "--test-reporter=tap", ...files], { env, stdio: "inherit" });
    if (run.error || run.signal || run.status === null) throw new Error("PAN528_TEST_PROCESS_INTERRUPTED");
    process.exitCode = run.status;
  }
} catch (error) { process.stderr.write((error instanceof Error ? error.message : "PAN528_TEST_TOOLING_UNAVAILABLE") + "\n"); process.exitCode = 1; }
