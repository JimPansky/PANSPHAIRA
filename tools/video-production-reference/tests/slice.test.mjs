import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { cloneStrictJson, parseStrictJson } from "../src/strict-json.mjs";
import { decodePng, readPngInfo, readWavData, readWavInfo } from "../src/media-io.mjs";
import { validateJob } from "../src/job-validator.mjs";
import { componentEvidence, getTrustedComponentRun, loadDescriptors, selectComponent } from "../src/select-component.mjs";
import { renderPackage } from "../src/package-assembly.mjs";
import { emitResult, runController } from "../src/controller.mjs";
import { verifySyntheticFixtures } from "../scripts/generate-synthetic-assets.mjs";

let Ajv2020;
try { ({ default: Ajv2020 } = await import("ajv/dist/2020.js")); } catch {}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPOSITORY_ROOT = resolve(ROOT, "../..");
const CLI = join(ROOT, "bin", "cm-video.mjs");
const ALPHA = join(ROOT, "jobs", "job-alpha.synthetic-v1.json");
const BETA = join(ROOT, "jobs", "job-beta.synthetic-v1.json");

function sha(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
async function json(path) { return JSON.parse(await readFile(path, "utf8")); }
async function cli(command, { root = ROOT, job = ALPHA, output } = {}) {
  const args = [command, "--root", root, "--job", job];
  if (output) args.push("--output", output);
  let body;
  const result = await runController({ argv: args, output: (value) => { body = value; } });
  return { status: result.exitCode, body, stderr: "" };
}
async function fixture(t, copy = false) {
  const temporary = await mkdtemp(join(tmpdir(), "cmvideo-test-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const root = join(temporary, "reference");
  if (copy) await cp(ROOT, root, { recursive: true });
  const output = join(temporary, "output");
  await mkdir(output);
  return { temporary, root: copy ? root : ROOT, output };
}
async function mutateJob(t, mutate, source = ALPHA) {
  const context = await fixture(t);
  const job = await json(source);
  mutate(job);
  const path = join(context.temporary, "job.json");
  await writeFile(path, `${JSON.stringify(job, null, 2)}\n`);
  return { ...context, job: path };
}
async function outputDigests(directory) {
  const result = {};
  async function walk(path, prefix = "") {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(join(path, entry.name), relative);
      else result[relative] = sha(await readFile(join(path, entry.name)));
    }
  }
  await walk(directory);
  return result;
}
async function waitFor(predicate, label) {
  for (let attempt = 0; attempt < 100_000; attempt += 1) {
    try { if (await predicate()) return; } catch {}
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(`WAIT_TIMEOUT:${label}`);
}

function liveDirectoryReplacement({ trigger, target, moved, replacement }) {
  const source = [
    'const fs = require("node:fs");',
    "const [trigger, target, moved, replacement] = process.argv.slice(1);",
    "const deadline = Date.now() + 15_000;",
    "function poll() {",
    "  if (fs.existsSync(trigger)) { fs.renameSync(target, moved); fs.renameSync(replacement, target); return; }",
    "  if (Date.now() > deadline) process.exit(3);",
    "  setImmediate(poll);",
    "}",
    "poll();",
  ].join("\n");
  const child = spawn(process.execPath, ["-e", source, trigger, target, moved, replacement], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`LIVE_REPLACEMENT_FAILED:${code}:${stderr}`));
    });
  });
}

test("fixture generator verifies checked-in bytes without writes", async () => {
  const lines = [];
  await verifySyntheticFixtures({ writeLine: (line) => lines.push(line) });
  assert.equal(lines.filter((line) => line.endsWith("\tPASS\n")).length, 6);
});

test("explicit fixture regeneration atomically replaces a symlink without touching its sentinel target", async (t) => {
  const context = await fixture(t, true);
  const target = join(context.root, "assets", "synthetic", "frame-s01.png");
  const sentinel = join(context.temporary, "sentinel");
  await writeFile(sentinel, "keep");
  await unlink(target);
  await symlink(sentinel, target);
  await verifySyntheticFixtures({ regenerate: true, root: context.root, writeLine: () => {} });
  assert.equal(await readFile(sentinel, "utf8"), "keep");
  assert.equal((await lstat(target)).isFile(), true);
  assert.equal(sha(await readFile(target)), sha(await readFile(join(ROOT, "assets", "synthetic", "frame-s01.png"))));
});

test("explicit fixture regeneration survives a concurrent target swap and never follows the swapped symlink", async (t) => {
  const context = await fixture(t, true);
  const directory = join(context.root, "assets", "synthetic");
  const target = join(directory, "frame-s01.png");
  const sentinel = join(context.temporary, "swap-sentinel");
  await writeFile(sentinel, "keep");
  const swap = (async () => {
    await waitFor(async () => (await readdir(directory)).some((name) => /^\.frame-s01\.png\.[a-f0-9]{32}\.tmp$/.test(name)), "fixture temp entry");
    await unlink(target);
    await symlink(sentinel, target);
  })();
  await verifySyntheticFixtures({ regenerate: true, root: context.root, writeLine: () => {} });
  await swap;
  assert.equal(await readFile(sentinel, "utf8"), "keep");
  assert.equal((await lstat(target)).isFile(), true);
  assert.equal(sha(await readFile(target)), sha(await readFile(join(ROOT, "assets", "synthetic", "frame-s01.png"))));
});

test("failed explicit fixture regeneration cleans only its owned temporary entry", async (t) => {
  const context = await fixture(t, true);
  const directory = join(context.root, "assets", "synthetic");
  const target = join(directory, "frame-s01.png");
  await rm(target);
  await mkdir(target);
  await writeFile(join(target, "sentinel"), "keep");
  await assert.rejects(verifySyntheticFixtures({ regenerate: true, root: context.root, writeLine: () => {} }));
  assert.equal(await readFile(join(target, "sentinel"), "utf8"), "keep");
  assert.equal((await readdir(directory)).some((name) => /^\.frame-s01\.png\..+\.tmp$/.test(name)), false);
});

test("three exact hash-closed descriptors select only static trusted component roles", async () => {
  const descriptors = await loadDescriptors(ROOT);
  assert.deepEqual(descriptors.map((value) => value.descriptor.role).sort(), ["audio", "qa", "renderer"]);
  for (const record of descriptors) assert.equal(record.implementationSha256, record.descriptor.implementationSha256);
});

for (const [name, path, digest] of [
  ["alpha", ALPHA, "3453f8e5f5de0bd40b755fc0638ba3fcb61cd279ddc3496801646dbea0b01d1f"],
  ["beta", BETA, "0bcd37730b5f85a3a65b5d04a549968e7af7d4df35a7db1e20b9b6bf2282ad9b"],
]) {
  test(`validate verifies job and executable bytes for ${name}`, async () => {
    const result = await cli("validate", { job: path });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.body.outcome, "VALIDATED");
    assert.equal(result.body.job.jobDigest, digest);
    assert.deepEqual(Object.keys(result.body.components).sort(), ["audio", "qa", "renderer"]);
  });
}

test("selection denies an unknown backend without fallback", async () => {
  const descriptors = await loadDescriptors(ROOT);
  const result = selectComponent({ descriptors, role: "renderer", backend: "gpu", version: "1.0.0" });
  assert.equal(result.outcome, "DENIED");
  assert.ok(result.reasonCodes.includes("SELECTION_PROHIBITED_FALLBACK_DENIED"));
});

test("selection denies an incompatible exact version", async () => {
  const descriptors = await loadDescriptors(ROOT);
  assert.equal(selectComponent({ descriptors, role: "audio", backend: "cpu-ffmpeg-free", version: "2.0.0" }).outcome, "DENIED");
});

const GOLDEN = {
  alpha: {
    job: ALPHA, namespace: "job-alpha/synthetic-alpha-v1", artifactSet: "81b4be6900fd993b2618e6c7295d0d12c0bb627b4d5508912365bff142263ca3",
    files: {
      "audio.pcm.wav": "0588d14d07b7a8bed0dcecece9cf523c482e4b221949ea39200e3c3ff2be1e30",
      "frames/S01.png": "49c0ab6c7fe8e28725b57036f9ae921ffca088aa53417a4ff3e45d54c1931c76",
      "frames/S02.png": "59ac2035972203d2e4d9704617109aa3205c7e25cc00a39b6de596df461acdc8",
      "manifest.json": "8523028e34592287d6169c5a62611ccdd3bf53b24f87cddf3c8f20032edc0a75",
      "ownership.json": "df8a21908f2fcd2384ab9b2aebdec8d9941e2efa87af0dedaa7588671e620083",
      "qa-receipt.json": "bc6fa5c5abb647734abba3105a2269e8bf344893e3378cb2c83b52a569397137",
      "render.cmvideo": "67937b919963ff45115c1bfd95d0fa6ae6a64f76d9ce5a2e8d96936257847a8e",
      "success.json": "0ef5ac5f5ae6a9fb8d7ebbd78c08c7ad377d87eea479de80fa5ab42fb4e8d0a8",
      "timeline.json": "a8976d7fa4bae57075eb6743d29c4934007be85548d636281a51344f0edacff5",
    },
  },
  beta: {
    job: BETA, namespace: "job-beta/synthetic-beta-v1", artifactSet: "2ed70131306d027657c523c9f5ac9f9ad4e46e0755f7d6dc0179b8e0eb738cc0",
    files: {
      "audio.pcm.wav": "bdb66026805e779a68241d05406ddf58b8704ecf3f655971068154f71ead71a7",
      "frames/S01.png": "fc48018519057b6e430a16e188429d91ce08ac82ccde63a2f3e2f1b9e609c9d3",
      "frames/S02.png": "f71d6e9a89d4515e51818d8ff279766406b89bad1001ffa1380accc362039295",
      "frames/S03.png": "49c0ab6c7fe8e28725b57036f9ae921ffca088aa53417a4ff3e45d54c1931c76",
      "manifest.json": "925d6c663667f938c4fc6e42fd9c21de665d5a3245fab9fca02070b5b2bb8bfd",
      "ownership.json": "14b7bb89a44a9f98289a93b6ab26de27a5ce1808db756b5cc782f03c9c80c857",
      "qa-receipt.json": "e728c1ef38710b40ed7c0127afd1773b7ca829f785febfb0da0fce823b08e445",
      "render.cmvideo": "0cb2b21e923cf6382bb63fea36eed3608c1591b43048af4986456bfcac479cab",
      "success.json": "26ef6269e36a16e4f038569fe5b3bc2bb2547803dcff69248a7cfb4670ff8ff9",
      "timeline.json": "405b9739e8575c1f520890aeaf46a50a89dffb38c38f86e53480fff81b3b0636",
    },
  },
};

for (const [name, golden] of Object.entries(GOLDEN)) {
  test(`${name} combined path matches independent complete-file golden hashes`, async (t) => {
    const context = await fixture(t);
    const result = await cli("validate-and-render", { job: golden.job, output: context.output });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.body.outcome, "RENDERED_AND_QA_PASS");
    assert.equal(result.body.render.artifactSetSha256, golden.artifactSet);
    assert.deepEqual(await outputDigests(join(context.output, golden.namespace)), golden.files);
  });
}

test(".cmvideo is canonical JSON and explicitly not playable video", async (t) => {
  const context = await fixture(t);
  assert.equal((await cli("validate-and-render", { output: context.output })).status, 0);
  const bytes = await readFile(join(context.output, GOLDEN.alpha.namespace, "render.cmvideo"));
  const index = JSON.parse(bytes);
  assert.equal(index.playableVideo, false);
  assert.equal(index.mediaType, "application/vnd.chimpmaera.synthetic-package-index+json");
  assert.equal(`${JSON.stringify(index, null, 2)}\n`, bytes.toString());
});

test("a repeated QA validates the current immutable receipt", async (t) => {
  const context = await fixture(t);
  assert.equal((await cli("validate-and-render", { output: context.output })).status, 0);
  const result = await cli("qa", { output: context.output });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.body.artifactSetSha256, GOLDEN.alpha.artifactSet);
});

test("render replay is denied without changing the published set", async (t) => {
  const context = await fixture(t);
  assert.equal((await cli("validate-and-render", { output: context.output })).status, 0);
  const before = await outputDigests(join(context.output, GOLDEN.alpha.namespace));
  const replay = await cli("render", { output: context.output });
  assert.equal(replay.status, 2);
  assert.deepEqual(await outputDigests(join(context.output, GOLDEN.alpha.namespace)), before);
});

test("two concurrent identical renders yield exactly one success", async (t) => {
  const context = await fixture(t);
  const run = async () => {
    const result = await cli("render", { output: context.output });
    return { code: result.status, body: result.body };
  };
  const results = await Promise.all([run(), run()]);
  assert.deepEqual(results.map(({ code }) => code).sort(), [0, 2]);
  assert.deepEqual(results.map(({ body }) => body.outcome).sort(), ["DENIED", "RENDERED"]);
  assert.equal((await cli("qa", { output: context.output })).status, 0);
});

test("pre-existing output parent and sentinel survive render", async (t) => {
  const context = await fixture(t);
  await mkdir(join(context.output, "job-alpha"));
  await writeFile(join(context.output, "job-alpha", "sentinel.txt"), "keep\n");
  assert.equal((await cli("validate-and-render", { output: context.output })).status, 0);
  assert.equal(await readFile(join(context.output, "job-alpha", "sentinel.txt"), "utf8"), "keep\n");
});

test("symlink output root is denied and target sentinel survives", async (t) => {
  const context = await fixture(t);
  const target = join(context.temporary, "target");
  await mkdir(target);
  await writeFile(join(target, "sentinel"), "keep");
  const link = join(context.temporary, "output-link");
  await symlink(target, link);
  assert.equal((await cli("render", { output: link })).status, 2);
  assert.equal(await readFile(join(target, "sentinel"), "utf8"), "keep");
});

test("symlink job parent is denied and target sentinel survives", async (t) => {
  const context = await fixture(t);
  const target = join(context.temporary, "target");
  await mkdir(target);
  await writeFile(join(target, "sentinel"), "keep");
  await symlink(target, join(context.output, "job-alpha"));
  assert.equal((await cli("render", { output: context.output })).status, 2);
  assert.equal(await readFile(join(target, "sentinel"), "utf8"), "keep");
});

test("same-user final namespace rename/replacement denies success and cleanup preserves replacement", async (t) => {
  const context = await fixture(t);
  const parent = join(context.output, "job-alpha");
  const final = join(parent, "synthetic-alpha-v1");
  const moved = join(parent, "attacker-moved-owned-inode");
  const replacement = (async () => {
    await waitFor(async () => { await readFile(join(final, "ownership.json")); return true; }, "render ownership marker");
    await rename(final, moved);
    await mkdir(final);
    await writeFile(join(final, "sentinel"), "keep");
  })();
  const result = await cli("render", { output: context.output });
  await replacement;
  assert.equal(result.status, 2);
  assert.equal(await readFile(join(final, "sentinel"), "utf8"), "keep");
  assert.deepEqual(await readdir(moved), []);
});

test("same-user artifact replacement denies render and cleanup never removes the replacement", async (t) => {
  const context = await fixture(t);
  const final = join(context.output, "job-alpha", "synthetic-alpha-v1");
  const manifest = join(final, "manifest.json");
  const moved = join(final, "owned-manifest-moved");
  const replacement = (async () => {
    await waitFor(async () => { await readFile(manifest); return true; }, "render manifest");
    await rename(manifest, moved);
    await writeFile(manifest, "replacement-sentinel\n", { flag: "wx" });
  })();
  const result = await cli("render", { output: context.output });
  await replacement;
  assert.equal(result.status, 2);
  assert.equal(await readFile(manifest, "utf8"), "replacement-sentinel\n");
  assert.equal(sha(await readFile(moved)), GOLDEN.alpha.files["manifest.json"]);
});

test("independent same-user job-parent replacement denies render success and preserves its sentinel", async (t) => {
  const context = await fixture(t);
  const parent = join(context.output, "job-alpha");
  const final = join(parent, "synthetic-alpha-v1");
  const moved = join(context.output, "attacker-moved-job-parent");
  const replacement = join(context.output, "attacker-replacement-job-parent");
  await mkdir(replacement);
  await writeFile(join(replacement, "sentinel"), "job-parent-replacement\n");
  const attack = liveDirectoryReplacement({ trigger: join(final, "ownership.json"), target: parent, moved, replacement });
  const result = await cli("render", { output: context.output });
  await attack;
  assert.equal(result.status, 2);
  assert.equal(result.body.outcome, "DENIED");
  assert.equal(await readFile(join(parent, "sentinel"), "utf8"), "job-parent-replacement\n");
  assert.deepEqual(await readdir(moved), []);
});

test("independent same-user output-root replacement denies render success and preserves its sentinel", async (t) => {
  const context = await fixture(t);
  const final = join(context.output, GOLDEN.alpha.namespace);
  const moved = join(context.temporary, "attacker-moved-output-root");
  const replacement = join(context.temporary, "attacker-replacement-output-root");
  await mkdir(replacement);
  await writeFile(join(replacement, "sentinel"), "output-root-replacement\n");
  const attack = liveDirectoryReplacement({ trigger: join(final, "ownership.json"), target: context.output, moved, replacement });
  const result = await cli("render", { output: context.output });
  await attack;
  assert.equal(result.status, 2);
  assert.equal(result.body.outcome, "DENIED");
  assert.equal(await readFile(join(context.output, "sentinel"), "utf8"), "output-root-replacement\n");
  assert.deepEqual(await readdir(moved), []);
});

for (const [label, mutate] of [
  ["capability", (value) => value.capabilities.push("unknown")],
  ["default", (value) => { value.defaultFor = "cpu"; }],
  ["role", (value) => { value.role = "audio"; }],
  ["backend", (value) => { value.backend = "gpu"; }],
  ["version", (value) => { value.version = "1.0.1"; }],
]) {
  test(`descriptor ${label} ambiguity/unknown is denied`, async (t) => {
    const context = await fixture(t, true);
    const path = join(context.root, "components", "renderer.cpu-v1.json");
    const descriptor = await json(path); mutate(descriptor);
    await writeFile(path, `${JSON.stringify(descriptor, null, 2)}\n`);
    assert.equal((await cli("validate", { root: context.root, job: join(context.root, "jobs", "job-alpha.synthetic-v1.json") })).status, 2);
  });
}

test("implementation tamper is denied before execution", async (t) => {
  const context = await fixture(t, true);
  await writeFile(join(context.root, "src", "render-cpu.mjs"), "throw new Error('executed');\n", { flag: "a" });
  const result = await cli("validate", { root: context.root, job: join(context.root, "jobs", "job-alpha.synthetic-v1.json") });
  assert.equal(result.status, 2);
  assert.deepEqual(result.body.reasonCodes, ["SELECTION_IMPLEMENTATION_HASH_DENIED"]);
});

test("digest-consistent caller module reaching node:fs is denied before execution", async (t) => {
  const context = await fixture(t, true);
  const sentinel = join(context.temporary, "must-not-exist");
  const source = Buffer.from([
    'const fs = process.getBuiltinModule("node:fs");',
    `fs.writeFileSync(${JSON.stringify(sentinel)}, "EXECUTED");`,
    "export function run() { return {}; }",
    "",
  ].join("\n"));
  await writeFile(join(context.root, "src", "render-cpu.mjs"), source);
  const descriptorPath = join(context.root, "components", "renderer.cpu-v1.json");
  const descriptor = await json(descriptorPath);
  descriptor.implementationSha256 = sha(source);
  await writeFile(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`);
  await assert.rejects(loadDescriptors(context.root), /SELECTION_DESCRIPTOR_SCHEMA_DENIED/);
  await assert.rejects(readFile(sentinel));
});

test("strict Ajv and runtime descriptor validation deny the same negative tuple corpus", async (t) => {
  const schema = await json(join(ROOT, "schemas", "component-descriptor.schema.v1.json"));
  const validate = Ajv2020
    ? new Ajv2020({ allErrors: true, strict: true }).compile(schema)
    : (value) => {
      try { schemaOracle(value, schema, schema, new Map()); return true; } catch { return false; }
    };
  for (const name of ["audio.pcm-v1.json", "qa.cpu-v1.json", "renderer.cpu-v1.json"]) {
    assert.equal(validate(await json(join(ROOT, "components", name))), true, `${name}: ${JSON.stringify(validate.errors)}`);
  }
  const corpus = [
    ["wrong role", (value) => { value.role = "audio"; }],
    ["wrong id", (value) => { value.id = "audio.pcm.v1"; }],
    ["wrong backend", (value) => { value.backend = "gpu"; }],
    ["wrong implementation", (value) => { value.implementation = "src/audio-pcm.mjs"; }],
    ["wrong capability", (value) => { value.capabilities = ["synthetic.pcm16-mono-48000-passthrough"]; }],
    ["wrong default", (value) => { value.defaultFor = "cpu"; }],
  ];
  for (const [label, mutate] of corpus) {
    await t.test(label, async (nested) => {
      const context = await fixture(nested, true);
      const path = join(context.root, "components", "renderer.cpu-v1.json");
      const descriptor = await json(path);
      mutate(descriptor);
      assert.equal(validate(descriptor), false, `${label}: schema accepted`);
      await writeFile(path, `${JSON.stringify(descriptor, null, 2)}\n`);
      await assert.rejects(loadDescriptors(context.root), /SELECTION_DESCRIPTOR_SCHEMA_DENIED/);
    });
  }
});

test("implementation symlink is denied with no external import", async (t) => {
  const context = await fixture(t, true);
  const path = join(context.root, "src", "render-cpu.mjs");
  await unlink(path); await symlink(join(ROOT, "src", "render-cpu.mjs"), path);
  assert.equal((await cli("validate", { root: context.root, job: join(context.root, "jobs", "job-alpha.synthetic-v1.json") })).status, 2);
});

test("descriptor symlink is denied", async (t) => {
  const context = await fixture(t, true);
  const path = join(context.root, "components", "renderer.cpu-v1.json");
  await unlink(path); await symlink(join(ROOT, "components", "renderer.cpu-v1.json"), path);
  assert.equal((await cli("validate", { root: context.root, job: join(context.root, "jobs", "job-alpha.synthetic-v1.json") })).status, 2);
});

test("duplicate textual descriptor key is denied", async (t) => {
  const context = await fixture(t, true);
  const path = join(context.root, "components", "renderer.cpu-v1.json");
  const source = await readFile(path, "utf8");
  await writeFile(path, source.replace("{\n", "{\n  \"id\": \"renderer.cpu.v1\",\n"));
  assert.equal((await cli("validate", { root: context.root, job: join(context.root, "jobs", "job-alpha.synthetic-v1.json") })).status, 2);
});

test("an extra descriptor creates a denied component set", async (t) => {
  const context = await fixture(t, true);
  await writeFile(join(context.root, "components", "extra.json"), await readFile(join(context.root, "components", "renderer.cpu-v1.json")));
  assert.equal((await cli("validate", { root: context.root, job: join(context.root, "jobs", "job-alpha.synthetic-v1.json") })).status, 2);
});

test("static trusted registry ignores a later caller implementation path swap", async (t) => {
  const context = await fixture(t, true);
  const descriptors = await loadDescriptors(context.root);
  const selected = selectComponent({ descriptors, role: "renderer", backend: "cpu-ffmpeg-free", version: "1.0.0" }).selection;
  await writeFile(join(context.root, "src", "render-cpu.mjs"), "export function run(){ throw new Error('swapped'); }\n");
  const run = getTrustedComponentRun(selected);
  assert.equal(run({ kind: "synthetic-package-plan", jobDigest: "a".repeat(64), frameCount: 1, durationFrames: 1 }).packageFormat, "canonical-synthetic-package-index");
});

test("verified descriptor selection is frozen against a later descriptor swap", async (t) => {
  const context = await fixture(t, true);
  const descriptors = await loadDescriptors(context.root);
  const selected = selectComponent({ descriptors, role: "audio", backend: "cpu-ffmpeg-free", version: "1.0.0" }).selection;
  await writeFile(join(context.root, "components", "audio.pcm-v1.json"), "{}\n");
  assert.equal(componentEvidence(selected).descriptor.id, "audio.pcm.v1");
  assert.throws(() => { selected.descriptor.id = "changed"; }, TypeError);
});

test("asset bytes validated once remain the assembled bytes after source swap", async (t) => {
  const context = await fixture(t, true);
  const job = await json(join(context.root, "jobs", "job-alpha.synthetic-v1.json"));
  const validated = await validateJob({ job, root: context.root });
  assert.equal(validated.outcome, "PASS");
  const descriptors = await loadDescriptors(context.root);
  const selected = Object.fromEntries(["renderer", "audio", "qa"].map((role) => [role, selectComponent({ descriptors, role, backend: "cpu-ffmpeg-free", version: "1.0.0" }).selection]));
  const renderer = getTrustedComponentRun(selected.renderer);
  const audio = getTrustedComponentRun(selected.audio);
  await writeFile(join(context.root, "assets", "synthetic", "frame-s01.png"), Buffer.alloc(10));
  const result = await renderPackage({
    validated,
    components: Object.fromEntries(Object.entries(selected).map(([role, value]) => [role, componentEvidence(value)])),
    rendererPlan: renderer({ kind: "synthetic-package-plan", jobDigest: validated.jobDigest, frameCount: validated.assets.length, durationFrames: validated.durationFrames }),
    audioResult: audio({ kind: "pcm16-passthrough", bytesBase64: validated.audio.bytesBase64, sha256: validated.audio.sha256, sampleCount: validated.expectedAudioSamples }),
    outputRoot: context.output,
  });
  assert.equal(result.outcome, "RENDERED");
  assert.equal(sha(await readFile(join(context.output, GOLDEN.alpha.namespace, "frames", "S01.png"))), GOLDEN.alpha.files["frames/S01.png"]);
});

for (const [label, source] of [
  ["duplicate textual key", '{"a":1,"a":2}'],
  ["trailing text", '{"a":1}x'],
  ["negative zero", '{"a":-0}'],
]) test(`strict text boundary rejects ${label}`, () => assert.throws(() => parseStrictJson(Buffer.from(source)), /STRICT_JSON_DENIED/));

test("strict text boundary rejects invalid UTF-8", () => assert.throws(() => parseStrictJson(Buffer.from([0x7b, 0x22, 0xff, 0x22, 0x3a, 0x31, 0x7d])), /STRICT_JSON_DENIED/));

for (const [label, make] of [
  ["accessor", () => { const value = {}; Object.defineProperty(value, "x", { enumerable: true, get() { return 1; } }); return value; }],
  ["custom prototype", () => Object.create({ inherited: true })],
  ["non-enumerable", () => { const value = {}; Object.defineProperty(value, "x", { value: 1 }); return value; }],
  ["symbol", () => ({ [Symbol("x")]: 1 })],
  ["sparse array", () => { const value = []; value.length = 2; value[1] = 1; return value; }],
  ["augmented array", () => { const value = [1]; value.extra = true; return value; }],
  ["non-finite number", () => ({ value: Infinity })],
]) test(`strict API boundary rejects ${label}`, () => assert.throws(() => cloneStrictJson(make()), /STRICT_JSON_DENIED/));

test("strict API boundary rejects aliases", () => { const shared = {}; assert.throws(() => cloneStrictJson({ left: shared, right: shared }), /STRICT_JSON_DENIED/); });
test("strict API boundary rejects cycles", () => { const value = {}; value.self = value; assert.throws(() => cloneStrictJson(value), /STRICT_JSON_DENIED/); });
test("strict API boundary enforces depth", () => { let value = {}; for (let i = 0; i < 30; i += 1) value = { value }; assert.throws(() => cloneStrictJson(value), /STRICT_JSON_DENIED/); });
test("strict API boundary enforces node count", () => assert.throws(() => cloneStrictJson(Array.from({ length: 20 }, (_, index) => index), { maxNodes: 10 }), /STRICT_JSON_DENIED/));
test("strict API boundary enforces string limits", () => assert.throws(() => cloneStrictJson({ value: "x".repeat(20) }, { maxStringLength: 10 }), /STRICT_JSON_DENIED/));

function boundaryOutcomes(value, limits) {
  const direct = () => cloneStrictJson(value, limits);
  const textual = () => parseStrictJson(Buffer.from(JSON.stringify(value)), limits);
  return [direct, textual].map((operation) => {
    try { operation(); return "PASS"; } catch { return "DENIED"; }
  });
}

test("direct and textual boundaries share the exact object-key UTF-8 byte limit", () => {
  assert.deepEqual(boundaryOutcomes({ ["x".repeat(8)]: 1 }, { maxStringLength: 8 }), ["PASS", "PASS"]);
  assert.deepEqual(boundaryOutcomes({ ["x".repeat(9)]: 1 }, { maxStringLength: 8 }), ["DENIED", "DENIED"]);
  assert.deepEqual(boundaryOutcomes({ "éé": 1 }, { maxStringLength: 4 }), ["PASS", "PASS"]);
  assert.deepEqual(boundaryOutcomes({ "ééé": 1 }, { maxStringLength: 4 }), ["DENIED", "DENIED"]);
});

test("direct and textual boundaries share the exact global key-count limit", () => {
  assert.deepEqual(boundaryOutcomes({ a: 1, b: 2 }, { maxKeys: 2 }), ["PASS", "PASS"]);
  assert.deepEqual(boundaryOutcomes({ a: 1, b: 2, c: 3 }, { maxKeys: 2 }), ["DENIED", "DENIED"]);
});

test("direct and textual boundaries share representable depth, nodes, strings, arrays, keys, and numeric rules", () => {
  const dangerous = Object.create(null);
  Object.defineProperty(dangerous, "__proto__", { value: 1, enumerable: true });
  assert.throws(() => cloneStrictJson(dangerous), /STRICT_JSON_DENIED/);
  assert.throws(() => parseStrictJson(Buffer.from('{"__proto__":1}')), /STRICT_JSON_DENIED/);
  for (const [value, limits, expected] of [
    [{ a: { b: 1 } }, { maxDepth: 2 }, "PASS"],
    [{ a: { b: 1 } }, { maxDepth: 1 }, "DENIED"],
    [[1, 2], { maxArrayLength: 2 }, "PASS"],
    [[1, 2, 3], { maxArrayLength: 2 }, "DENIED"],
    [{ a: "1234" }, { maxTotalStringLength: 5 }, "PASS"],
    [{ a: "12345" }, { maxTotalStringLength: 5 }, "DENIED"],
  ]) assert.deepEqual(boundaryOutcomes(value, limits), [expected, expected]);
  assert.throws(() => cloneStrictJson({ a: -0 }), /STRICT_JSON_DENIED/);
  assert.throws(() => parseStrictJson(Buffer.from('{"a":-0}')), /STRICT_JSON_DENIED/);
});

test("validated job is a private deeply frozen clone", async () => {
  const source = await json(ALPHA);
  const result = await validateJob({ job: source, root: ROOT });
  source.metadata.name = "mutated";
  assert.equal(result.job.metadata.name, "job-alpha");
  assert.ok(Object.isFrozen(result.job.spec.assets.shots));
  assert.throws(() => { result.job.metadata.name = "x"; }, TypeError);
});

test("numeric string coercion is denied", async (t) => {
  const context = await mutateJob(t, (job) => { job.spec.assets.shots[0].startFrame = "0"; });
  assert.equal((await cli("validate", { job: context.job })).status, 2);
});

for (const [label, mutate] of [
  ["nonzero first tick", (job) => { job.spec.assets.shots[0].startFrame = 1; }],
  ["gap", (job) => { job.spec.assets.shots[1].startFrame = 31; }],
  ["wrong final tick", (job) => { job.spec.assets.shots[1].endFrame = 59; }],
  ["duplicate shot id", (job) => { job.spec.assets.shots[1].id = job.spec.assets.shots[0].id; }],
  ["duplicate scene id", (job) => { job.spec.assets.shots[1].sceneId = job.spec.assets.shots[0].sceneId; }],
]) test(`frame schedule denies ${label}`, async (t) => { const context = await mutateJob(t, mutate); assert.equal((await cli("validate", { job: context.job })).status, 2); });

test("audio and shot evidence IDs are globally unique", async (t) => {
  const context = await mutateJob(t, (job) => { job.spec.assets.audio.id = job.spec.assets.shots[0].id; });
  const result = await cli("validate", { job: context.job });
  assert.equal(result.status, 2);
  assert.deepEqual(result.body.reasonCodes, ["JOB_AUDIO_DENIED"]);
});

test("digest-consistent frame path escape is denied", async (t) => {
  const context = await fixture(t, true);
  const bytes = await readFile(join(context.root, "assets", "synthetic", "frame-s01.png"));
  await writeFile(join(context.root, "assets", "frame-s01.png"), bytes);
  const jobPath = join(context.root, "jobs", "job-alpha.synthetic-v1.json");
  const job = await json(jobPath); job.spec.assets.shots[0].path = "../frame-s01.png"; job.spec.assets.shots[0].sha256 = sha(bytes);
  await writeFile(jobPath, `${JSON.stringify(job, null, 2)}\n`);
  assert.equal((await cli("validate", { root: context.root, job: jobPath })).status, 2);
});

test("digest-consistent audio path escape is denied", async (t) => {
  const context = await fixture(t, true);
  const bytes = await readFile(join(context.root, "assets", "synthetic", "track-alpha.wav"));
  await writeFile(join(context.root, "assets", "track-alpha.wav"), bytes);
  const jobPath = join(context.root, "jobs", "job-alpha.synthetic-v1.json");
  const job = await json(jobPath); job.spec.assets.audio.path = "../track-alpha.wav"; job.spec.assets.audio.sha256 = sha(bytes);
  await writeFile(jobPath, `${JSON.stringify(job, null, 2)}\n`);
  assert.equal((await cli("validate", { root: context.root, job: jobPath })).status, 2);
});

test("WAV exact sample count is enforced", async (t) => {
  const context = await fixture(t, true);
  const wavPath = join(context.root, "assets", "synthetic", "track-alpha.wav");
  const bytes = (await readFile(wavPath)).subarray(0, -2);
  bytes.writeUInt32LE(bytes.length - 8, 4); bytes.writeUInt32LE(bytes.length - 44, 40);
  await writeFile(wavPath, bytes);
  const jobPath = join(context.root, "jobs", "job-alpha.synthetic-v1.json");
  const job = await json(jobPath); job.spec.assets.audio.sha256 = sha(bytes); await writeFile(jobPath, `${JSON.stringify(job, null, 2)}\n`);
  assert.equal((await cli("validate", { root: context.root, job: jobPath })).status, 2);
});

function crc32Oracle(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunkOracle(type, data) {
  const result = Buffer.alloc(12 + data.length); result.writeUInt32BE(data.length); result.write(type, 4, "ascii"); data.copy(result, 8);
  result.writeUInt32BE(crc32Oracle(result.subarray(4, 8 + data.length)), 8 + data.length); return result;
}

test("PNG CRC corruption is denied", async () => { const bytes = await readFile(join(ROOT, "assets/synthetic/frame-s01.png")); bytes[29] ^= 1; assert.throws(() => readPngInfo(bytes), /CRC/); });
test("PNG trailing bytes are denied", async () => { const bytes = Buffer.concat([await readFile(join(ROOT, "assets/synthetic/frame-s01.png")), Buffer.from([0])]); assert.throws(() => readPngInfo(bytes)); });
test("PNG duplicate critical chunks are denied", async () => {
  const bytes = await readFile(join(ROOT, "assets/synthetic/frame-s01.png")); const idatAt = 33; const size = bytes.readUInt32BE(idatAt) + 12;
  const duplicate = Buffer.concat([bytes.subarray(0, idatAt + size), bytes.subarray(idatAt, idatAt + size), bytes.subarray(idatAt + size)]);
  assert.throws(() => readPngInfo(duplicate));
});
test("PNG forbidden IHDR format with valid CRC is denied", async () => {
  const source = await readFile(join(ROOT, "assets/synthetic/frame-s01.png")); const ihdr = Buffer.from(source.subarray(16, 29)); ihdr[8] = 16;
  const changed = Buffer.concat([source.subarray(0, 8), chunkOracle("IHDR", ihdr), source.subarray(33)]);
  assert.throws(() => readPngInfo(changed), /IHDR/);
});
test("PNG compressed bomb using a different DEFLATE form is bounded and denied", () => {
  const raw = Buffer.alloc((1280 * 3 + 1) * 720); const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1280); ihdr.writeUInt32BE(720, 4); ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunkOracle("IHDR", ihdr), chunkOracle("IDAT", deflateSync(raw)), chunkOracle("IEND", Buffer.alloc(0))]);
  assert.throws(() => decodePng(png), /zlib header|stored blocks/);
});

test("WAV RIFF size mismatch is denied", async () => { const bytes = await readFile(join(ROOT, "assets/synthetic/track-alpha.wav")); bytes.writeUInt32LE(0, 4); assert.throws(() => readWavInfo(bytes), /RIFF size/); });
test("WAV sample-rate/byte-rate mismatch is denied", async () => { const bytes = await readFile(join(ROOT, "assets/synthetic/track-alpha.wav")); bytes.writeUInt32LE(44100, 24); assert.throws(() => readWavInfo(bytes), /fmt/); });
test("WAV block alignment mismatch is denied", async () => { const bytes = await readFile(join(ROOT, "assets/synthetic/track-alpha.wav")); bytes.writeUInt16LE(4, 32); assert.throws(() => readWavData(bytes), /fmt/); });
test("WAV truncation is denied", async () => { const bytes = (await readFile(join(ROOT, "assets/synthetic/track-alpha.wav"))).subarray(0, -1); assert.throws(() => readWavData(bytes)); });

test("QA denies an extra artifact and writes no new receipt", async (t) => {
  const context = await fixture(t); assert.equal((await cli("render", { output: context.output })).status, 0);
  const directory = join(context.output, GOLDEN.alpha.namespace); await writeFile(join(directory, "extra"), "x");
  assert.equal((await cli("qa", { output: context.output })).status, 2);
  await assert.rejects(readFile(join(directory, "qa-receipt.json")));
});

test("QA late concurrent extra artifact denies and retracts its owned PASS receipt", async (t) => {
  const context = await fixture(t);
  assert.equal((await cli("render", { output: context.output })).status, 0);
  const directory = join(context.output, GOLDEN.alpha.namespace);
  const addLate = (async () => {
    await waitFor(async () => { await readFile(join(directory, "qa-receipt.json")); return true; }, "QA receipt preparation");
    await writeFile(join(directory, "late-extra"), "x", { flag: "wx" });
  })();
  const result = await cli("qa", { output: context.output });
  await addLate;
  assert.equal(result.status, 2);
  assert.equal(await readFile(join(directory, "late-extra"), "utf8"), "x");
  await assert.rejects(readFile(join(directory, "qa-receipt.json")));
});

test("independent same-user job-parent replacement denies QA PASS and preserves its sentinel", async (t) => {
  const context = await fixture(t);
  assert.equal((await cli("render", { output: context.output })).status, 0);
  const parent = join(context.output, "job-alpha");
  const final = join(parent, "synthetic-alpha-v1");
  const moved = join(context.output, "attacker-moved-job-parent");
  const replacement = join(context.output, "attacker-replacement-job-parent");
  await mkdir(replacement);
  await writeFile(join(replacement, "sentinel"), "job-parent-qa-replacement\n");
  const attack = liveDirectoryReplacement({ trigger: join(final, "qa-receipt.json"), target: parent, moved, replacement });
  const result = await cli("qa", { output: context.output });
  await attack;
  assert.equal(result.status, 2);
  assert.equal(result.body.outcome, "DENIED");
  assert.equal(await readFile(join(parent, "sentinel"), "utf8"), "job-parent-qa-replacement\n");
  await assert.rejects(readFile(join(moved, "synthetic-alpha-v1", "qa-receipt.json")));
});

test("independent same-user output-root replacement denies QA PASS and preserves its sentinel", async (t) => {
  const context = await fixture(t);
  assert.equal((await cli("render", { output: context.output })).status, 0);
  const final = join(context.output, GOLDEN.alpha.namespace);
  const moved = join(context.temporary, "attacker-moved-output-root");
  const replacement = join(context.temporary, "attacker-replacement-output-root");
  await mkdir(replacement);
  await writeFile(join(replacement, "sentinel"), "output-root-qa-replacement\n");
  const attack = liveDirectoryReplacement({ trigger: join(final, "qa-receipt.json"), target: context.output, moved, replacement });
  const result = await cli("qa", { output: context.output });
  await attack;
  assert.equal(result.status, 2);
  assert.equal(result.body.outcome, "DENIED");
  assert.equal(await readFile(join(context.output, "sentinel"), "utf8"), "output-root-qa-replacement\n");
  await assert.rejects(readFile(join(moved, GOLDEN.alpha.namespace, "qa-receipt.json")));
});

test("QA denies a frame symlink even when it targets digest-consistent bytes", async (t) => {
  const context = await fixture(t); assert.equal((await cli("render", { output: context.output })).status, 0);
  const frame = join(context.output, GOLDEN.alpha.namespace, "frames", "S01.png"); await unlink(frame); await symlink(join(ROOT, "assets/synthetic/frame-s01.png"), frame);
  assert.equal((await cli("qa", { output: context.output })).status, 2);
});

test("stale PASS receipt cannot validate a changed artifact set", async (t) => {
  const context = await fixture(t); assert.equal((await cli("validate-and-render", { output: context.output })).status, 0);
  const directory = join(context.output, GOLDEN.alpha.namespace); const receiptBefore = await readFile(join(directory, "qa-receipt.json"));
  await writeFile(join(directory, "manifest.json"), "{}\n");
  assert.equal((await cli("qa", { output: context.output })).status, 2);
  assert.ok((await readFile(join(directory, "qa-receipt.json"))).equals(receiptBefore));
});

test("QA denies a missing success marker", async (t) => {
  const context = await fixture(t); assert.equal((await cli("render", { output: context.output })).status, 0);
  await unlink(join(context.output, GOLDEN.alpha.namespace, "success.json"));
  assert.equal((await cli("qa", { output: context.output })).status, 2);
});

test("preflight denial leaves output root unchanged and no namespace residue", async (t) => {
  const context = await mutateJob(t, (job) => { job.spec.video.width = 1; });
  await writeFile(join(context.output, "sentinel"), "keep");
  const before = await outputDigests(context.output); const result = await cli("render", { job: context.job, output: context.output });
  assert.equal(result.status, 2); assert.deepEqual(await outputDigests(context.output), before);
});

function pointer(document, fragment) {
  return fragment.slice(2).split("/").reduce((value, token) => value[token.replaceAll("~1", "/").replaceAll("~0", "~")], document);
}

function schemaOracle(value, schema, document, documents) {
  if (schema.$ref) {
    const [file, fragment] = schema.$ref.split("#");
    const targetDocument = file ? documents.get(file) : document;
    return schemaOracle(value, fragment ? pointer(targetDocument, `#${fragment}`) : targetDocument, targetDocument, documents);
  }
  if (schema.oneOf) {
    let accepted = 0;
    for (const alternative of schema.oneOf) {
      try { schemaOracle(value, alternative, document, documents); accepted += 1; } catch {}
    }
    assert.equal(accepted, 1, "oneOf requires exactly one matching tuple");
  }
  if ("const" in schema) assert.deepEqual(value, schema.const);
  if (schema.enum) assert.ok(schema.enum.some((item) => JSON.stringify(item) === JSON.stringify(value)));
  if (schema.type === "object") {
    assert.ok(value !== null && typeof value === "object" && !Array.isArray(value));
    for (const required of schema.required ?? []) assert.ok(Object.hasOwn(value, required), `missing ${required}`);
    if (schema.additionalProperties === false) for (const key of Object.keys(value)) assert.ok(Object.hasOwn(schema.properties ?? {}, key), `extra ${key}`);
    for (const [key, child] of Object.entries(schema.properties ?? {})) if (Object.hasOwn(value, key)) schemaOracle(value[key], child, document, documents);
  } else if (schema.type === "array") {
    assert.ok(Array.isArray(value));
    if (schema.minItems !== undefined) assert.ok(value.length >= schema.minItems);
    if (schema.maxItems !== undefined) assert.ok(value.length <= schema.maxItems);
    if (schema.uniqueItems) assert.equal(new Set(value.map((item) => JSON.stringify(item))).size, value.length);
    for (const item of value) schemaOracle(item, schema.items, document, documents);
  } else if (schema.type === "string") {
    assert.equal(typeof value, "string"); if (schema.pattern) assert.match(value, new RegExp(schema.pattern));
  } else if (schema.type === "integer") assert.ok(Number.isInteger(value));
  else if (schema.type === "number") assert.equal(typeof value, "number");
  if (schema.minimum !== undefined) assert.ok(value >= schema.minimum);
  if (schema.exclusiveMinimum !== undefined) assert.ok(value > schema.exclusiveMinimum);
}

async function schemas() {
  const names = (await readdir(join(ROOT, "schemas"))).filter((name) => name.endsWith(".json"));
  return new Map(await Promise.all(names.map(async (name) => [name, await json(join(ROOT, "schemas", name))])));
}

test("every explicitly object-typed shipped schema is closed", async () => {
  const documents = await schemas();
  function walk(value, path) {
    if (!value || typeof value !== "object") return;
    if (value.type === "object") assert.equal(value.additionalProperties, false, path);
    for (const [key, child] of Object.entries(value)) walk(child, `${path}/${key}`);
  }
  for (const [name, document] of documents) walk(document, name);
});

test("independent schema oracle accepts every shipped job, descriptor and emitted evidence object", async (t) => {
  const documents = await schemas();
  for (const name of ["job-alpha.synthetic-v1.json", "job-beta.synthetic-v1.json"]) schemaOracle(await json(join(ROOT, "jobs", name)), documents.get("video-job.schema.v1.json"), documents.get("video-job.schema.v1.json"), documents);
  for (const name of ["audio.pcm-v1.json", "qa.cpu-v1.json", "renderer.cpu-v1.json"]) schemaOracle(await json(join(ROOT, "components", name)), documents.get("component-descriptor.schema.v1.json"), documents.get("component-descriptor.schema.v1.json"), documents);
  const context = await fixture(t); assert.equal((await cli("validate-and-render", { output: context.output })).status, 0);
  const directory = join(context.output, GOLDEN.alpha.namespace);
  for (const [artifact, schema] of [
    ["ownership.json", "ownership-marker.schema.v1.json"], ["timeline.json", "timeline.schema.v1.json"],
    ["render.cmvideo", "package-index.schema.v1.json"], ["manifest.json", "render-manifest.schema.v1.json"],
    ["success.json", "success-marker.schema.v1.json"], ["qa-receipt.json", "qa-receipt.schema.v1.json"],
  ]) schemaOracle(await json(join(directory, artifact)), documents.get(schema), documents.get(schema), documents);
});

test("independent DAG oracle binds every local file, both video commands, and security fallback", async () => {
  const dag = await json(join(REPOSITORY_ROOT, "verification", "verification-dag-v2.json"));
  // v71 adds original LIFE-07 while retaining all prior released bindings.
  // Existing video commands, ownership and security fallback remain intact.
  assert.equal(dag.graphVersion, 79);
  const life06 = dag.nodes.filter(({ id }) => id === "pan466-qualified-module-generations-v1");
  assert.equal(life06.length, 1);
  assert.deepEqual(life06[0].dependsOn, ["pan468-impact-selection-v1", "pan464-retained-pair-v1"]);
  assert.deepEqual(life06[0].ownedTests, ["npm run pan466:test"]);
  const life06Inputs = [
    ["docs/architecture/pan466-qualified-module-generations-v1.md", "DERIVED_EVIDENCE"],
    ...["module-lifecycle-descriptor", "module-lifecycle-check", "qualified-retained-module"].map(name => [`src/pan466/${name}.mjs`, "SOURCE"]),
    ["scripts/run-pan466-native-qualification.mjs", "VALIDATOR"],
    ...["module-lifecycle-descriptor.test", "module-lifecycle-check.test", "qualified-module-binding.test", "qualified-module-native.test", "qualified-module-process"].map(name => [`tests/pan466/${name}.mjs`, "VALIDATOR"]),
  ];
  assert.equal(life06[0].inputs.length, life06Inputs.length);
  for (const [path, role] of life06Inputs) {
    assert.deepEqual(dag.nodes.filter(owner => owner.inputs.some(input => input.path === path)).map(({ id }) => id), [life06[0].id], path);
    assert.deepEqual(life06[0].inputs.find(input => input.path === path), { path, role, sha256: sha(await readFile(join(REPOSITORY_ROOT, path))) });
  }
  const integrity = dag.nodes.filter(({ id }) => id === "repository-integrity");
  assert.equal(integrity.length, 1);
  const r1Inputs = [
    ["docs/.vitepress/config.mts", "SOURCE"],
    ["tests/docs-site.test.mjs", "VALIDATOR"],
    ["docs/README.md", "DERIVED_EVIDENCE"],
    ["docs/explanation/overview.md", "DERIVED_EVIDENCE"],
    ["docs/explanation/architecture-tour.md", "DERIVED_EVIDENCE"],
    ["docs/explanation/knowledge-and-reuse.md", "DERIVED_EVIDENCE"],
    ["docs/explanation/research-questions.md", "DERIVED_EVIDENCE"],
    ["docs/use-cases/index.md", "DERIVED_EVIDENCE"],
    ...["concept-loop", "controlled-effect", "knowledge-lifecycle", "provider-adaptation"]
      .flatMap((name) => ["mmd", "svg"].map((extension) => [`docs/diagrams/${name}.${extension}`, "DERIVED_EVIDENCE"])),
  ];
  assert.equal(r1Inputs.length, 16);
  for (const [path, role] of r1Inputs) {
    const owners = dag.nodes.filter((owner) => owner.inputs.some((input) => input.path === path));
    assert.deepEqual(owners.map(({ id }) => id), ["repository-integrity"], path);
    const matches = integrity[0].inputs.filter((input) => input.path === path);
    assert.equal(matches.length, 1, path);
    assert.deepEqual(matches[0], { path, role, sha256: sha(await readFile(join(REPOSITORY_ROOT, path))) });
  }
  assert.equal(integrity[0].ownedTests.filter((command) => command === "npm run docs:test").length, 1);
  const node = dag.nodes.find(({ id }) => id === "know-media-m1-audience-learning-v1");
  assert.ok(node);
  assert.deepEqual(node.inputs.slice(0, 3).map(({ path }) => path), [
    "packages/contracts/src/external-video-service.ts", "tests/external-video-service.test.ts", "docs/EXTERNAL-VIDEO-SERVICE.md",
  ]);
  assert.deepEqual(node.ownedTests, ["npm run external-video-service:test", "npm run video:test"]);
  const localInputs = node.inputs.filter(({ path }) => path.startsWith("tools/video-production-reference/"));
  assert.equal(localInputs.length, 39);
  const localFiles = Object.keys(await outputDigests(ROOT)).map((path) => `tools/video-production-reference/${path}`).sort();
  assert.deepEqual(localInputs.map(({ path }) => path).sort(), localFiles);
  for (const input of localInputs) assert.equal(sha(await readFile(join(REPOSITORY_ROOT, input.path))), input.sha256, input.path);
  const roles = new Map(localInputs.map(({ path, role }) => [path, role]));
  assert.equal(roles.get("tools/video-production-reference/src/safe-io.mjs"), "SECURITY");
  assert.equal(roles.get("tools/video-production-reference/src/audio-pcm.mjs"), "SOURCE");
  assert.equal(roles.get("tools/video-production-reference/SHA256SUMS"), "CONTRACT");
  assert.equal(roles.get("tools/video-production-reference/jobs/job-alpha.synthetic-v1.json"), "FIXTURE");
  assert.equal(roles.get("tools/video-production-reference/schemas/video-job.schema.v1.json"), "SCHEMA");
  const select = (path) => {
    const input = node.inputs.find((candidate) => candidate.path === path);
    if (!input) return "FULL_FALLBACK";
    return ["TOOLCHAIN", "ENVIRONMENT", "SECURITY"].includes(input.role) ? "FULL_FALLBACK" : node.ownedTests;
  };
  assert.deepEqual(select("packages/contracts/src/external-video-service.ts"), node.ownedTests);
  assert.deepEqual(select("tools/video-production-reference/README.md"), node.ownedTests);
  assert.equal(select("tools/video-production-reference/src/safe-io.mjs"), "FULL_FALLBACK");
});

test("integrity refresh rejects absent, altered, or duplicated pre-existing media owner before any write", async (t) => {
  const source = await json(join(REPOSITORY_ROOT, "verification", "verification-dag-v2.json"));
  const cases = [
    ["absent", (dag) => { dag.nodes = dag.nodes.filter(({ id }) => id !== "know-media-m1-audience-learning-v1"); }],
    ["altered external owner input", (dag) => {
      dag.nodes.find(({ id }) => id === "know-media-m1-audience-learning-v1").inputs[0].role = "SOURCE";
    }],
    ["duplicated", (dag) => {
      dag.nodes.push(structuredClone(dag.nodes.find(({ id }) => id === "know-media-m1-audience-learning-v1")));
    }],
  ];
  for (const [label, mutate] of cases) {
    await t.test(label, async (nested) => {
      const temporary = await mkdtemp(join(tmpdir(), "cmvideo-refresh-owner-"));
      nested.after(() => rm(temporary, { recursive: true, force: true }));
      await mkdir(join(temporary, "verification"));
      const dag = structuredClone(source);
      mutate(dag);
      const dagPath = join(temporary, "verification", "verification-dag-v2.json");
      const before = Buffer.from(`${JSON.stringify(dag, null, 2)}\n`);
      await writeFile(dagPath, before);
      const result = spawnSync(process.execPath, [join(REPOSITORY_ROOT, "scripts", "refresh-integrity-data.mjs")], {
        cwd: temporary,
        encoding: "utf8",
      });
      assert.notEqual(result.status, 0, `${label}: refresh unexpectedly passed`);
      assert.ok((await readFile(dagPath)).equals(before), `${label}: DAG was rewritten`);
      assert.deepEqual(await readdir(temporary), ["verification"]);
    });
  }
});

async function epiped(command) {
  const writer = () => { const error = new Error("closed"); error.code = "EPIPE"; throw error; };
  const result = await runController({
    argv: [command, "--root", ROOT, "--job", command === "validate" ? ALPHA : join(ROOT, "jobs", "missing.json")],
    output: (value) => emitResult(value, writer),
  });
  return { code: result.exitCode, stderr: "" };
}
test("stdout EPIPE preserves successful validation status without trace", async () => assert.deepEqual(await epiped("validate"), { code: 0, stderr: "" }));
test("stdout EPIPE preserves denial status without trace", async () => assert.deepEqual(await epiped("qa"), { code: 2, stderr: "" }));
test("CLI installs an asynchronous stdout EPIPE handler", async () => assert.match(await readFile(CLI, "utf8"), /error\.code !== "EPIPE"/));
