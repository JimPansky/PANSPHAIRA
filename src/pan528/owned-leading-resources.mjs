import { createHash } from "node:crypto";
import { constants, closeSync, fstatSync, lstatSync, openSync, readdirSync, readFileSync, realpathSync, rmdirSync, unlinkSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { canonicalJson } from "../../dist/packages/contracts/src/canonical-json.js";
const denied = () => { throw new Error("GUIDED_OWNED_RESOURCE_DENIED"); };
const dirs = new Set(["pan453-owned-v2", "pan473-controller", "pan473-controller/pan453-owned-v2"]);
const files = new Set(["owned-profile.json", "pan473-profile.json", "source.sqlite", "target.sqlite", "pan473-scope.sqlite", "pan453-owned-v2/journal-owner.mode", "pan453-owned-v2/journal-task-identity.json", "pan473-controller/pan453-owned-v2/journal-owner.mode", "pan473-controller/pan453-owned-v2/journal-task-identity.json"]);
const signature = stat => ({ dev: stat.dev, ino: stat.ino, uid: stat.uid, mode: stat.mode & 0o777, nlink: stat.nlink, size: stat.size });
const sameEntry = (path, stat) => { const current = lstatSync(path); if (current.dev !== stat.dev || current.ino !== stat.ino || current.isSymbolicLink()) denied(); };

// Closed Linux native profile census. Descriptor anchors are code-owned open
// directories, never caller aliases. This is not a hostile same-uid sandbox.
function leadingResources(root, expected, remove) {
  if (realpathSync(root) !== root) denied();
  const handles = []; const rows = []; const ownedFiles = []; const ownedDirs = [];
  const openDir = path => {
    const fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NONBLOCK); handles.push(fd);
    const stat = fstatSync(fd); if (!stat.isDirectory() || stat.uid !== process.getuid()) denied();
    return { fd, stat, anchor: "/proc/self/fd/" + fd };
  };
  try {
    const parent = openDir(dirname(root)); const name = basename(root); const topPath = join(parent.anchor, name); const top = openDir(topPath);
    if ((top.stat.mode & 0o777) !== 0o700) denied();
    rows.push({ path: "", kind: "directory", ...signature(top.stat) });
    function walk(directory, relative) {
      for (const childName of readdirSync(directory.anchor).sort()) {
        const rel = relative ? relative + "/" + childName : childName; const path = join(directory.anchor, childName);
        if (dirs.has(rel)) {
          const child = openDir(path); rows.push({ path: rel, kind: "directory", ...signature(child.stat) }); ownedDirs.push({ path, stat: child.stat }); walk(child, rel);
        } else if (files.has(rel)) {
          const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
          try {
            const stat = fstatSync(fd);
            if (!stat.isFile() || stat.uid !== process.getuid() || stat.nlink !== 1 || stat.size > 2097152 || ![0o600, 0o644].includes(stat.mode & 0o777)) denied();
            const row = { path: rel, kind: "file", ...signature(stat), sha256: createHash("sha256").update(readFileSync(fd)).digest("hex") };
            rows.push(row); ownedFiles.push({ path, stat });
          } finally { closeSync(fd); }
        } else denied();
      }
    }
    walk(top, "");
    if (rows.length !== 1 + dirs.size + files.size) denied();
    const census = { schemaVersion: "pansphaira.guided-native/leading-resources/v1", resources: rows.sort((a, b) => a.path.localeCompare(b.path, "en")) };
    if (expected && canonicalJson(census) !== canonicalJson(expected)) denied();
    if (remove) {
      for (const entry of ownedFiles) { sameEntry(entry.path, entry.stat); unlinkSync(entry.path); }
      for (const entry of [...ownedDirs].reverse()) { sameEntry(entry.path, entry.stat); rmdirSync(entry.path); }
      sameEntry(topPath, top.stat); rmdirSync(topPath);
    }
    return census;
  } finally { for (const fd of handles.reverse()) closeSync(fd); }
}
export const captureGuidedLeadingResourcesV1 = root => leadingResources(root, null, false);
export const assertGuidedLeadingResourcesV1 = (root, expected) => leadingResources(root, expected, false);
export const removeGuidedLeadingResourcesV1 = (root, expected) => leadingResources(root, expected, true);
