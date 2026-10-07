import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { verifySupplyChain } from "../scripts/verify-supply-chain.mjs";

const execFile = promisify(execFileCallback);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lockPath = "demo/manifests/supply-chain/artifact-lock-v1.json";

async function fixture() {
  const target = await mkdtemp(path.join(tmpdir(), "cm-supply-chain-test-"));
  const lock = JSON.parse(await readFile(path.join(root, lockPath), "utf8"));
  const files = new Set([
    lockPath,
    "demo/chimpmaera.Dockerfile",
    "demo/compose.yaml",
    "demo/install.sh",
    "package.json",
    "package-lock.json",
    lock.ci.workflowPath,
    ...(lock.ci.additionalWorkflowPaths ?? []),
    lock.publicClosure.manifestPath,
    ...lock.publicClosure.requiredPaths,
    ...lock.ociDeclarations.flatMap(({ locations }) =>
      locations.map(({ path: locationPath }) => locationPath)
    ),
  ]);
  const publicManifest = await readFile(
    path.join(root, lock.publicClosure.manifestPath),
    "utf8",
  );
  for (const line of publicManifest.split("\n")) {
    if (line && !line.startsWith("#")) files.add(line.split("\t")[0]);
  }
  for (const name of await (await import("node:fs/promises")).readdir(
    path.join(root, lock.runtimeClosure.directory),
  )) {
    if (name.endsWith(".mjs")) {
      files.add(`${lock.runtimeClosure.directory}/${name}`);
    }
  }
  for (const relative of files) {
    const destination = path.join(target, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(root, relative), destination);
  }
  return target;
}

async function mutate(relative, transform) {
  const target = await fixture();
  const file = path.join(target, relative);
  const source = await readFile(file, "utf8");
  await writeFile(file, transform(source));
  return target;
}

test("real repository declarations produce a bounded PASS report", async () => {
  const report = await verifySupplyChain({ root });
  assert.equal(report.status, "PASS");
  assert.match(report.lockDigest, /^[a-f0-9]{64}$/);
  assert.deepEqual(report.checks, [
    "OCI_DECLARATIONS_PINNED",
    "OPENCLAW_REFERENCE_ADAPTER_LOCK_VERIFIED",
    "NPM_LOCK_INTEGRITY_DECLARED",
    "CI_ACTIONS_NPM_COMPOSE_AND_EXTERNAL_VIDEO_BOUNDARY_PINNED",
    "RUNTIME_COPY_CLOSURE_VERIFIED",
    "PUBLIC_RELEASE_CRITICAL_CLOSURE_VERIFIED",
    "RUNTIME_POSTURE_AND_PAPERLESS_NON_CLAIM_VERIFIED",
  ]);
  assert.match(report.claimBoundary, /not registry signature/i);
});

test("public release staging accepts an isolated Git worktree control file", async () => {
  const target = await mkdtemp(path.join(tmpdir(), "cm-public-build-test-"));
  try {
    const output = path.join(target, "cm-product-increment-rc-20260802-test");
    await execFile(path.join(root, "scripts/build-public-release.sh"), [
      "--output",
      output,
    ]);
    const metadata = await (await import("node:fs/promises")).stat(
      `${output}.tar.gz`,
    );
    assert.ok(metadata.size > 0);
  } finally {
    await rm(target, { recursive: true, force: true });
  }
});

test("ERV source-only classifier is exact, absent from payload, and denies adjacent unknown files", async () => {
  const graph = JSON.parse(await readFile(path.join(root, "verification/verification-dag-v2.json"), "utf8"));
  const admitted = graph.nodes.find(({ id }) => id === "erv-workflow-native-evidence-v1").inputs.map(({ path: file }) => file).sort();
  assert.equal(admitted.length, 44);
  const builder = await readFile(path.join(root, "scripts/build-public-release.sh"), "utf8");
  const fileBlock = builder.match(/^repository_only_files = \{([\s\S]*?)^\}/m)[1];
  const prefixBlock = builder.match(/^repository_only_prefixes = \(([\s\S]*?)^\)/m)[1];
  const exact = [...fileBlock.matchAll(/^\s+"([^"]+)",$/gm)].map((match) => match[1]);
  const prefixes = [...prefixBlock.matchAll(/^\s+"([^"]+)",$/gm)].map((match) => match[1]);
  assert.deepEqual(exact.filter((file) => admitted.includes(file)).sort(), admitted);
  assert.ok(!prefixes.some((prefix) => admitted.some((file) => file.startsWith(prefix))));
  const target = await fixture();
  const staging = await mkdtemp(path.join(tmpdir(), "cm-erv-source-classification-"));
  try {
    for (const file of admitted) {
      const destination = path.join(target, file);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(path.join(root, file), destination);
    }
    const output = path.join(staging, "cm-product-increment-rc-20261002-erv-classification");
    await execFile("bash", [path.join(target, "scripts/build-public-release.sh"), "--output", output]);
    for (const file of admitted) await assert.rejects(readFile(path.join(output, file)), /ENOENT/);
    for (const [index, neighbor] of ["tests/erv-workflow-evidence/unreviewed-neighbor.test.mjs", "evidence/erv-workflow/reference-v1/unreviewed-neighbor.json"].entries()) {
      const location = path.join(target, neighbor);
      await writeFile(location, "{}\n");
      await assert.rejects(execFile("bash", [path.join(target, "scripts/build-public-release.sh"), "--output", path.join(staging, `cm-product-increment-rc-20261002-neighbor-${index}`)]), (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, new RegExp(`UNMANIFESTED_SOURCE_FILE:${neighbor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
        return true;
      });
      await unlink(location);
    }
  } finally {
    await rm(target, { recursive: true, force: true });
    await rm(staging, { recursive: true, force: true });
  }
});

test("PAN572 uninstall safety regression is exact source-only and adjacent unknown tests stay denied", async () => {
  const file = "tests/demo-current-head-e2e-uninstall.test.mjs";
  const builder = await readFile(path.join(root, "scripts/build-public-release.sh"), "utf8");
  const fileBlock = builder.match(/^repository_only_files = \{([\s\S]*?)^\}/m)[1];
  const exact = [...fileBlock.matchAll(/^\s+"([^"]+)",$/gm)].map((match) => match[1]);
  assert.equal(exact.filter((entry) => entry === file).length, 1,
    "The new safety regression needs one exact source-only classification.");
  const manifest = await readFile(path.join(root, "release/public-files.manifest"), "utf8");
  assert.ok(!manifest.split("\n").some((line) => line.split("\t")[0] === file));
  const target = await fixture();
  const staging = await mkdtemp(path.join(tmpdir(), "cm-pan572-source-classification-"));
  try {
    await mkdir(path.join(target, "tests"), { recursive: true });
    await copyFile(path.join(root, file), path.join(target, file));
    const output = path.join(staging, "cm-product-increment-rc-20261007-pan572-classification");
    await execFile("bash", [path.join(target, "scripts/build-public-release.sh"), "--output", output]);
    await assert.rejects(readFile(path.join(output, file)), /ENOENT/);
    const neighbor = "tests/demo-current-head-e2e-uninstall-neighbor.test.mjs";
    await writeFile(path.join(target, neighbor), "{}\n");
    await assert.rejects(execFile("bash", [path.join(target, "scripts/build-public-release.sh"), "--output",
      path.join(staging, "cm-product-increment-rc-20261007-pan572-neighbor")]), (error) => {
      assert.equal(error.code, 1);
      assert.ok(error.stderr.includes(`UNMANIFESTED_SOURCE_FILE:${neighbor}`));
      return true;
    });
  } finally {
    await rm(target, { recursive: true, force: true });
    await rm(staging, { recursive: true, force: true });
  }
});

test("mutable OCI, npm integrity, CI ref, runtime omission and release omission deny", async () => {
  const cases = [
    [
      "demo/chimpmaera.Dockerfile",
      (source) => source.replace(
        /node:24\.14\.1-bookworm-slim@sha256:[a-f0-9]{64}/,
        "node:24.14.1-bookworm-slim",
      ),
      /SUPPLY_CHAIN_OCI_DECLARATION_DRIFT_DENIED/,
    ],
    [
      "package-lock.json",
      (source) => {
        const lock = JSON.parse(source);
        const key = Object.keys(lock.packages).find((value) => value !== "");
        delete lock.packages[key].integrity;
        return JSON.stringify(lock);
      },
      /SUPPLY_CHAIN_NPM_INTEGRITY_MISSING_DENIED/,
    ],
    [
      ".github/workflows/ci.yml",
      (source) => source.replace(/@[a-f0-9]{40}/, "@v4"),
      /SUPPLY_CHAIN_CI_ACTION_NOT_COMMIT_PINNED_DENIED/,
    ],
    [
      ".github/workflows/ci.yml",
      (source) => source.replace(
        /CM_COMPOSE_SHA256: [a-f0-9]{64}/,
        `CM_COMPOSE_SHA256: ${"0".repeat(64)}`,
      ),
      /SUPPLY_CHAIN_CI_COMPOSE_TOOL_INVALID_DENIED/,
    ],
    [
      ".github/workflows/ci.yml",
      (source) => source.replace(
        /npm run external-video-service:test/,
        "npm run test",
      ),
      /SUPPLY_CHAIN_CI_EXTERNAL_VIDEO_BOUNDARY_INVALID_DENIED/,
    ],
    [
      "demo/chimpmaera.Dockerfile",
      (source) => source.replace(
        /^COPY demo\/runtime\/policy-evaluator\.mjs.*\n/m,
        "",
      ),
      /SUPPLY_CHAIN_RUNTIME_COPY_CLOSURE_DENIED/,
    ],
    [
      "demo/chimpmaera.Dockerfile",
      (source) => source.replace(/^COPY demo\/runtime\/atomic-resource-budget\.mjs.*\n/m, ""),
      /SUPPLY_CHAIN_RUNTIME_COPY_CLOSURE_DENIED/,
    ],
    [
      "demo/chimpmaera.Dockerfile",
      (source) => `${source}COPY demo/runtime/not-a-runtime-module.mjs ./not-a-runtime-module.mjs\n`,
      /SUPPLY_CHAIN_RUNTIME_COPY_CLOSURE_DENIED/,
    ],
    [
      "release/public-files.manifest",
      (source) => source.replace(
        /^demo\/runtime\/paperless-ngx-zoo-adapter\.mjs.*\n/m,
        "",
      ),
      /SUPPLY_CHAIN_PUBLIC_CLOSURE_MISSING_DENIED/,
    ],
  ];
  for (const [relative, transform, expected] of cases) {
    const target = await mutate(relative, transform);
    await assert.rejects(verifySupplyChain({ root: target }), expected);
  }
});

test("symlinked declared inputs cannot escape the verification root", async () => {
  const target = await fixture();
  const candidate = path.join(target, "package.json");
  await unlink(candidate);
  await symlink(path.join(root, "package.json"), candidate);
  await assert.rejects(
    verifySupplyChain({ root: target }),
    /SUPPLY_CHAIN_SYMLINK_SOURCE_DENIED/,
  );
});

test("unsafe or malformed public manifest entries fail closed", async () => {
  const cases = [
    (source) => `${source}../outside\t../outside\t0644\n`,
    (source) => source.replace(/^README[.]md\tREADME[.]md\t0644$/m, "README.md\tREADME.md"),
    (source) => `${source}README.md\tREADME.md\t0644\n`,
  ];
  for (const transform of cases) {
    const target = await mutate("release/public-files.manifest", transform);
    await assert.rejects(
      verifySupplyChain({ root: target }),
      /SUPPLY_CHAIN_(?:PATH|PUBLIC_MANIFEST)_INVALID_DENIED/,
    );
  }
});

test("CI runs the complete authoritative lifecycle once through secure-default proof", async () => {
  const workflow = await readFile(path.join(root, ".github/workflows/ci.yml"), "utf8");
  const manifest = JSON.parse(await readFile(path.join(root, "security/secure-default-proof-v1.json"), "utf8"));
  assert.equal((workflow.match(/^\s+run: npm run proof:secure-default$/gm) ?? []).length, 1);
  assert.equal((workflow.match(/^\s+run: npm (?:test|run test)$/gm) ?? []).length, 0,
    "proof already runs npm test including pretest and posttest");
  assert.equal(manifest.commands.authoritative, "npm test");
  assert.match(workflow, /run: git diff --exit-code/);
});

test("canonical lifecycle builds once and compiled variants preserve standalone tests", async () => {
  const { scripts } = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  function leaves(name) {
    return scripts[name].split(" && ").flatMap(command => {
      const match = /^npm run ([\w:-]+)(?: --silent)?$/.exec(command);
      return match ? leaves(match[1]) : [command];
    });
  }
  const expanded = ["pretest", "test", "posttest"].flatMap(leaves);
  assert.equal(expanded.filter(command => command === "tsc -p tsconfig.json").length, 1);
  assert.equal(scripts.pretest.split(" && ")[0], "npm run build");
  const compiled = Object.keys(scripts).filter(name => name.endsWith(":compiled"));
  assert.ok(compiled.length > 0);
  for (const name of compiled) {
    assert.equal(scripts[name.slice(0, -":compiled".length)], "npm run build --silent && " + scripts[name]);
    assert.ok(scripts[name].startsWith("node --test "));
  }
});
