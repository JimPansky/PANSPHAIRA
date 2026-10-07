import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
// Own bounded mandatory suite; no silent browser/native skips or file filters.
const files = ["tests/pan543/profile.test.mjs", "tests/pan543/transport.test.mjs", "tests/pan543/browser.test.mjs", "tests/pan543/registration.test.mjs"];
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--list") process.stdout.write(JSON.stringify(files) + "\n");
else {
  if (args.length) throw new Error("PAN543_TEST_ARGUMENT_DENIED");
  const env = { ...process.env, TMPDIR: process.env.TMPDIR || process.env.RUNNER_TEMP };
  if (!env.TMPDIR) throw new Error("PAN543_OWNED_SCRATCH_REQUIRED");
  if (!env.PAN543_BROWSER_EVIDENCE) env.PAN543_BROWSER_EVIDENCE = mkdtempSync(join(env.TMPDIR, "pan543-browser-evidence-"));
  env.PAN527_BROWSER_MODULE ||= import.meta.resolve("playwright"); env.PAN527_CERTUTIL ||= "certutil";
  process.stdout.write("PAN543_BROWSER_EVIDENCE_DIR=" + env.PAN543_BROWSER_EVIDENCE + "\n");
  const build = spawnSync(process.execPath, ["scripts/build-pan541-browser.mjs"], { env, stdio: "inherit" });
  if (build.error || build.signal || build.status === null) throw new Error("PAN543_BROWSER_BUILD_INTERRUPTED");
  if (build.status) process.exitCode = build.status;
  else {
    const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
    const hash = path => createHash("sha256").update(readFileSync(path)).digest("hex");
    const provenance = { schemaVersion: "pansphaira.browser-profile-evidence/v1", commit: git("rev-parse", "HEAD"), tree: git("rev-parse", "HEAD^{tree}"), worktreeDirty: git("status", "--porcelain").length > 0, node: process.version, bundleSha256: hash("dist/browser-workspace/app.js"), styleSha256: hash("packages/browser-workspace/src/workspace.css"), htmlSha256: hash("packages/browser-workspace/src/workspace.html"), tests: Object.fromEntries([...files, "tests/pan543/backend-fixture.mjs", "tests/pan543/profile-types.ts"].map(p => [p, hash(p)])) };
    env.PAN543_BUILD_MANIFEST = JSON.stringify(provenance);
    writeFileSync(join(env.PAN543_BROWSER_EVIDENCE, "build.json"), JSON.stringify(provenance, null, 2) + "\n");
    process.stdout.write("PAN543_BUILD=" + env.PAN543_BUILD_MANIFEST + "\n");
    const run = spawnSync(process.execPath, ["--test", "--test-concurrency=1", "--test-reporter=tap", ...files], { env, stdio: "inherit" });
    if (run.error || run.signal || run.status === null) throw new Error("PAN543_TEST_INTERRUPTED"); process.exitCode = run.status;
  }
}
