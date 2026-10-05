import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../../dist/packages/contracts/src/canonical-json.js";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const sourceRoot = fileURLToPath(new URL("../../", import.meta.url));
const safeEnv = Object.fromEntries(["PATH", "LANG", "LC_ALL", "TMPDIR"].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
const git = args => execFileSync("git", ["-C", sourceRoot, ...args], { encoding: "utf8", env: safeEnv, timeout: 5000, maxBuffer: 4 * 1024 * 1024 }).trim();

// Native Node/source-byte observation only. This does not turn an inherited
// shape/session binding, selected template or source commit into OCI readiness.
export function observeGuidedNativeProcessV1() {
  const paths = git(["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "src", "demo/runtime", "demo/manifests", "contracts", "packages/contracts/src", "packages/setup-coordinator/src", "package-lock.json"]).split("\0").filter(Boolean);
  function compiled(root, relative) {
    for (const item of readdirSync(root, { withFileTypes: true })) {
      const path = join(relative, item.name);
      if (item.isDirectory()) compiled(join(root, item.name), path);
      else if (item.isFile() && item.name.endsWith(".js")) paths.push(path);
      else if (item.isSymbolicLink()) throw new Error("GUIDED_NATIVE_COMPILED_ALIAS_DENIED");
    }
  }
  compiled(join(sourceRoot, "dist/packages/contracts/src"), "dist/packages/contracts/src");
  compiled(join(sourceRoot, "dist/packages/setup-coordinator/src"), "dist/packages/setup-coordinator/src");
  const unique = [...new Set(paths)].sort(); if (unique.length > 10000) throw new Error("GUIDED_NATIVE_SOURCE_BOUND_DENIED");
  let total = 0;
  const rows = unique.map(path => {
    const full = join(sourceRoot, path); const stat = lstatSync(full);
    const bytes = stat.isSymbolicLink() ? Buffer.from(readlinkSync(full)) : stat.isFile() ? readFileSync(full) : null;
    if (!bytes || bytes.length > 8 * 1024 * 1024 || (total += bytes.length) > 64 * 1024 * 1024) throw new Error("GUIDED_NATIVE_SOURCE_BOUND_DENIED");
    return { path, mode: stat.isSymbolicLink() ? "120000" : stat.mode & 0o111 ? "100755" : "100644", sha256: sha(bytes) };
  });
  return Object.freeze({ schemaVersion: "pansphaira.guided-native/process-observation/v1", scope: "LOCAL_NATIVE_NODE_AND_SQLITE_ONLY_NOT_OCI_QUALIFICATION", runtime: Object.freeze({ name: "node", version: process.version.slice(1) }), architecture: process.arch,
    executableSha256: sha(readFileSync(realpathSync(process.execPath))), sourceAnchorCommit: git(["rev-parse", "HEAD"]), sourceAnchorTree: git(["rev-parse", "HEAD^{tree}"]),
    sourceBytesKind: "OBSERVED_SOURCE_AND_COMPILED_BYTES_NOT_AN_INHERITED_HEAD_CLAIM", sourceSnapshotDigest: "sha256:" + sha(canonicalJson(rows)), sourcePathCount: rows.length,
    entrypointPath: "src/pan528/starter-worker.mjs", entrypointSha256: sha(readFileSync(new URL("./starter-worker.mjs", import.meta.url))) });
}
