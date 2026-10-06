import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";

// Complete fixed original-scope suite; missing browser/native tooling fails.
// No caller-selected files, skip flags or context-based test suppression.
const files = [
  "tests/pan541/browser-context-safety.test.mjs",
  "tests/pan541/browser-plugin-fault.test.mjs",
  "tests/pan541/browser-workspace.test.mjs",
  "tests/pan541/context-native.test.mjs",
  "tests/pan541/deep-link.test.mjs",
  "tests/pan541/descriptor.test.mjs",
  "tests/pan541/native-erv-read.test.mjs",
  "tests/pan541/registration.test.mjs",
  "tests/pan541/registry.test.mjs",
  "tests/pan541/test-runner.test.mjs",
  "tests/pan541/workspace-native.test.mjs",
];
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--list") process.stdout.write(JSON.stringify(files) + "\n");
  else {
    if (args.length) throw new Error("PAN541_TEST_ARGUMENT_DENIED");
    if (process.platform !== "linux" || process.arch !== "x64") throw new Error("PAN541_TEST_REQUIRES_SUPPORTED_LINUX_X86_64");
    const env = { ...process.env, TMPDIR: process.env.TMPDIR || process.env.RUNNER_TEMP };
    if (!env.TMPDIR) throw new Error("PAN541_OWNED_SCRATCH_REQUIRED");
    // Hosted canonical proof does not inherit a caller's evidence path.
    // Retain every real screenshot in a unique invocation-owned directory.
    if (!env.PAN541_BROWSER_EVIDENCE) {
      env.PAN541_BROWSER_EVIDENCE = mkdtempSync(join(env.TMPDIR, "pan541-browser-evidence-"));
      process.stdout.write("PAN541_BROWSER_EVIDENCE_DIR=" + env.PAN541_BROWSER_EVIDENCE + "\n");
    }
    env.PAN527_BROWSER_MODULE = env.PAN527_BROWSER_MODULE || import.meta.resolve("playwright");
    env.PAN527_CERTUTIL = env.PAN527_CERTUTIL || "certutil";
    const build = spawnSync(process.execPath, ["scripts/build-pan541-browser.mjs"], { env, stdio: "inherit" });
    if (build.error || build.signal || build.status === null) throw new Error("PAN541_BROWSER_BUILD_INTERRUPTED");
    if (build.status !== 0) process.exitCode = build.status;
    else {
      const run = spawnSync(process.execPath, ["--test", "--test-concurrency=1", "--test-reporter=tap", ...files], { env, stdio: "inherit" });
      if (run.error || run.signal || run.status === null) throw new Error("PAN541_TEST_PROCESS_INTERRUPTED");
      process.exitCode = run.status;
    }
  }
} catch (error) { process.stderr.write((error instanceof Error ? error.message : "PAN541_TEST_TOOLING_UNAVAILABLE") + "\n"); process.exitCode = 1; }
