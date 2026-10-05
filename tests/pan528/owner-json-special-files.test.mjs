import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { constants, closeSync, chmodSync, linkSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import test from "node:test";
import { createGuidedNativeOwnerV1 } from "../../src/pan528/native-journey-controller.mjs";
import { shapeIdentity527 } from "../pan527/helpers.mjs";
const entry = new URL("../../src/pan528/native-journey-controller.mjs", import.meta.url).href;
const source = `import { createGuidedNativeOwnerV1 } from ${JSON.stringify(entry)};
const options=JSON.parse(process.argv[1]);
try { const owner=createGuidedNativeOwnerV1(options); owner.owner.close(); process.stdout.write(JSON.stringify({outcome:"ACCEPTED"})+"\\n"); }
catch(error) { process.stdout.write(JSON.stringify({outcome:"REJECTED",code:error.code??null,message:error.message})+"\\n"); }`;
function fixture() {
  assert.ok(process.env.TMPDIR, "Invocation-owned scratch required");
  const parent = mkdtempSync(join(process.env.TMPDIR, "pan528-marker-observer-")); chmodSync(parent, 0o700);
  const identity = lstatSync(parent); const options = { optIn: true, identity: shapeIdentity527("tenant-a"), parentRoot: parent, probeMode: "NORMAL" };
  const first = createGuidedNativeOwnerV1(options); first.owner.close();
  return { parent, options, root: join(parent, "pan528-guided-native"), cleanup() {
    const current = lstatSync(parent);
    assert.equal(current.isDirectory() && !current.isSymbolicLink(), true); assert.equal(current.uid, process.getuid());
    assert.equal(current.dev, identity.dev); assert.equal(current.ino, identity.ino);
    rmSync(parent, { recursive: true, force: false });
  } };
}
function invoke(options) {
  // Own process, five-second hard bound. A timeout is a failing assertion,
  // never accepted as denial or a tenant/sandbox security qualification.
  return spawnSync(process.execPath, ["--input-type=module", "-e", source, JSON.stringify(options)], { encoding: "utf8", timeout: 5000, killSignal: "SIGKILL", maxBuffer: 32768 });
}
const cases = ["fifo", "directory", "symlink", "socket", "invalid-regular-shape", "wrong-mode", "hardlink", "oversized"];
for (const filename of ["invocation-owner.json", "journey.json"]) for (const kind of cases) {
  test(`PAN528 owned startup rejects ${filename} ${kind} without blocking or relaxing regular-file guards`, async () => {
    const f = fixture(); let socket; let directoryFd;
    try {
      const path = join(f.root, filename); const original = readFileSync(path); const backup = path + ".owned-backup";
      renameSync(path, backup);
      if (kind === "fifo") execFileSync("mkfifo", ["-m", "600", path], { stdio: "ignore" });
      else if (kind === "directory") mkdirSync(path, { mode: 0o700 });
      else if (kind === "symlink") symlinkSync(backup, path);
      else if (kind === "socket") {
        // Linux's short UNIX-socket address is anchored to this actual owned
        // directory descriptor, not a global scratch alias or CWD change.
        directoryFd = openSync(f.root, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
        socket = createServer(); await new Promise((resolve, reject) => { socket.once("error", reject); socket.listen("/proc/self/fd/" + directoryFd + "/" + filename, resolve); }); chmodSync(path, 0o600);
      }
      else if (kind === "hardlink") linkSync(backup, path);
      else writeFileSync(path, kind === "invalid-regular-shape" ? "{}\n" : kind === "oversized" ? " ".repeat(32769) : original, { flag: "wx", mode: kind === "wrong-mode" ? 0o640 : 0o600 });
      const actual = invoke(f.options);
      assert.notEqual(actual.error?.code, "ETIMEDOUT", "PAN528_OWNER_JSON_SPECIAL_FILE_NONBLOCK_REQUIRED: FIFO open must not block before descriptor regular-file validation");
      assert.equal(actual.error, undefined); assert.equal(actual.status, 0); assert.equal(actual.signal, null);
      const observed = JSON.parse(actual.stdout); assert.equal(observed.outcome, "REJECTED");
      if (kind === "invalid-regular-shape") assert.equal(observed.message, "GUIDED_COMMAND_DENIED");
      else assert.ok(["GUIDED_OWNED_RESOURCE_DENIED"].includes(observed.message) || ["ELOOP", "ENXIO", "EISDIR"].includes(observed.code), "Preserve exact native descriptor denial, not a generic success");
      assert.equal(actual.stderr, ""); assert.deepEqual(readFileSync(backup), original, "Own ordinary file remains unchanged");
    } finally { if (socket) await new Promise(resolve => socket.close(resolve)); if (directoryFd !== undefined) closeSync(directoryFd); f.cleanup(); }
  });
}
test("PAN528 ordinary valid private marker/journal startup still reopens the same IDLE native owner", () => {
  const f = fixture();
  try { const actual = invoke(f.options); assert.equal(actual.error, undefined); assert.equal(actual.status, 0); assert.deepEqual(JSON.parse(actual.stdout), { outcome: "ACCEPTED" }); assert.equal(actual.stderr, ""); }
  finally { f.cleanup(); }
});
