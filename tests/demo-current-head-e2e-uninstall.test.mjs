import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

function uninstallFixture() {
  const scratch = process.env.TMPDIR ?? process.env.RUNNER_TEMP;
  assert.ok(scratch, "The uninstall probe requires invocation-owned scratch, not system temp.");
  const root = mkdtempSync(join(resolve(scratch), "pan572-uninstall-"));
  chmodSync(root, 0o700);
  for (const dir of ["demo", "bin", ".chimpmaera-demo", ".chimpmaera-demo/secrets"]) {
    mkdirSync(join(root, dir), { recursive: true, mode: 0o700 });
  }
  copyFileSync("demo/uninstall.sh", join(root, "demo/uninstall.sh"));
  copyFileSync("demo/compose.yaml", join(root, "demo/compose.yaml"));
  const config = "COMPOSE_PROJECT_NAME=pansphaira-e2e-572123-1\nCM_DEMO_RUN_OWNER=pansphaira-e2e-572123-1\nCM_CHIMP_IMAGE=sha256:" + "a".repeat(64) + "\n";
  writeFileSync(join(root, ".chimpmaera-demo/config.env"), config, { mode: 0o600 });
  writeFileSync(join(root, ".chimpmaera-demo/secrets/owned-control"), "retained synthetic control\n", { mode: 0o600 });
  const log = join(root, "fake-docker-calls.log");
  writeFileSync(log, "", { mode: 0o600 });
  writeFileSync(join(root, "bin/docker"), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$PAN572_FAKE_DOCKER_LOG"
if [ "$1 $2" = 'image inspect' ] && [ -n "\${PAN572_FAKE_IMAGE_ID:-}" ] && [ "$3" = "$PAN572_FAKE_IMAGE_ID" ]; then
  case "\${5:-}" in
    '{{.Id}}') printf '%s\\n' "$PAN572_FAKE_IMAGE_ID" ;;
    *io.chimpmaera.demo.run-owner*) printf '%s\\n' "\${PAN572_FAKE_IMAGE_RUN_OWNER:-}" ;;
    *io.chimpmaera.demo.owner*) printf '%s\\n' "\${PAN572_FAKE_IMAGE_OWNER:-}" ;;
  esac
elif [ "$1 $2" = 'volume ls' ]; then
  [ -z "\${PAN572_FAKE_VOLUME_NAME:-}" ] || printf '%s\\n' "$PAN572_FAKE_VOLUME_NAME"
elif [ "$1 $2" = 'volume inspect' ]; then
  printf '%s\\n' "\${PAN572_FAKE_VOLUME_PROJECT:-}"
fi
exit 0
`, { mode: 0o700 });
  const env = { ...process.env, PATH: join(root, "bin") + ":" + process.env.PATH, PAN572_FAKE_DOCKER_LOG: log };
  return { root, config, log, env };
}

test("SAFE-AC01 help with existing configuration invokes no Docker and preserves state", () => {
  const fixture = uninstallFixture();
  try {
    const result = spawnSync("bash", [join(fixture.root, "demo/uninstall.sh"), "--help"], {
      cwd: fixture.root, env: fixture.env, encoding: "utf8", timeout: 5_000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(fixture.log, "utf8"), "", "Help must parse before any Docker invocation, including volume removal.");
    assert.equal(readFileSync(join(fixture.root, ".chimpmaera-demo/config.env"), "utf8"), fixture.config);
    assert.equal(readFileSync(join(fixture.root, ".chimpmaera-demo/secrets/owned-control"), "utf8"), "retained synthetic control\n");
    assert.match(result.stdout, /Usage:/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("SAFE-AC02 ordinary stop retains data and pins the configured project against ambient override", () => {
  const fixture = uninstallFixture();
  try {
    const result = spawnSync("bash", [join(fixture.root, "demo/uninstall.sh")], {
      cwd: fixture.root, env: { ...fixture.env, COMPOSE_PROJECT_NAME: "independent-control" },
      encoding: "utf8", timeout: 5_000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    const calls = readFileSync(fixture.log, "utf8");
    assert.match(calls, /--project-name pansphaira-e2e-572123-1(?: |$)/,
      "Ambient Compose project must not redirect the configured installation stop.");
    assert.doesNotMatch(calls, /--volumes|^image rm/m);
    assert.equal(readFileSync(join(fixture.root, ".chimpmaera-demo/config.env"), "utf8"), fixture.config);
    assert.equal(readFileSync(join(fixture.root, ".chimpmaera-demo/secrets/owned-control"), "utf8"), "retained synthetic control\n");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("SAFE-AC03 purge refuses missing observed runtime image ownership before teardown", () => {
  const fixture = uninstallFixture();
  try {
    const result = spawnSync("bash", [join(fixture.root, "demo/uninstall.sh"), "--purge"], {
      cwd: fixture.root, env: fixture.env, encoding: "utf8", timeout: 5_000,
    });
    assert.equal(result.error, undefined);
    assert.doesNotMatch(readFileSync(fixture.log, "utf8"), /(?:^compose .* down|^image rm)/m,
      "Configured ownership is not observed Docker ownership; missing image binding must precede teardown denial.");
    assert.equal(result.status, 2, result.stderr);
    assert.equal(readFileSync(join(fixture.root, ".chimpmaera-demo/config.env"), "utf8"), fixture.config);
    assert.equal(readFileSync(join(fixture.root, ".chimpmaera-demo/secrets/owned-control"), "utf8"), "retained synthetic control\n");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("SAFE-AC03 declared volume with foreign project ownership denies purge before teardown", () => {
  const fixture = uninstallFixture();
  try {
    const env = {
      ...fixture.env, PAN572_FAKE_IMAGE_ID: "sha256:" + "a".repeat(64),
      PAN572_FAKE_IMAGE_OWNER: "chimpmaera-v01-playable-installer",
      PAN572_FAKE_IMAGE_RUN_OWNER: "pansphaira-e2e-572123-1",
      PAN572_FAKE_VOLUME_NAME: "pansphaira-e2e-572123-1_chimpmaera_state",
      PAN572_FAKE_VOLUME_PROJECT: "independent-control",
    };
    const result = spawnSync("bash", [join(fixture.root, "demo/uninstall.sh"), "--purge"], {
      cwd: fixture.root, env, encoding: "utf8", timeout: 5_000,
    });
    assert.equal(result.error, undefined);
    assert.doesNotMatch(readFileSync(fixture.log, "utf8"), /(?:^compose .* down|^image rm)/m,
      "A declared volume name is not ownership; foreign volume labels must deny purge before any teardown.");
    assert.equal(result.status, 2, result.stderr);
    assert.equal(readFileSync(join(fixture.root, ".chimpmaera-demo/config.env"), "utf8"), fixture.config);
    assert.equal(readFileSync(join(fixture.root, ".chimpmaera-demo/secrets/owned-control"), "utf8"), "retained synthetic control\n");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("SAFE-AC03 linked state cannot authorize destruction of an independent control directory", () => {
  const fixture = uninstallFixture();
  const control = join(fixture.root, "independent-control-state");
  renameSync(join(fixture.root, ".chimpmaera-demo"), control);
  symlinkSync(control, join(fixture.root, ".chimpmaera-demo"), "dir");
  try {
    const env = {
      ...fixture.env, PAN572_FAKE_IMAGE_ID: "sha256:" + "a".repeat(64),
      PAN572_FAKE_IMAGE_OWNER: "chimpmaera-v01-playable-installer",
      PAN572_FAKE_IMAGE_RUN_OWNER: "pansphaira-e2e-572123-1",
    };
    const result = spawnSync("bash", [join(fixture.root, "demo/uninstall.sh"), "--purge"], {
      cwd: fixture.root, env, encoding: "utf8", timeout: 5_000,
    });
    assert.equal(result.error, undefined);
    assert.doesNotMatch(readFileSync(fixture.log, "utf8"), /(?:^compose .* down|^image rm)/m,
      "A linked state directory cannot establish custody of control files for purge.");
    assert.equal(result.status, 2, result.stderr);
    assert.equal(readFileSync(join(control, "config.env"), "utf8"), fixture.config);
    assert.equal(readFileSync(join(control, "secrets/owned-control"), "utf8"), "retained synthetic control\n");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

for (const [name, mutate] of [
  ["missing run owner", (config) => config.replace(/^CM_DEMO_RUN_OWNER=.*\n/m, "")],
  ["empty run owner", (config) => config.replace(/^CM_DEMO_RUN_OWNER=.*$/m, "CM_DEMO_RUN_OWNER=")],
  ["contradictory run owner", (config) => config.replace(/^CM_DEMO_RUN_OWNER=.*$/m, "CM_DEMO_RUN_OWNER=pansphaira-e2e-999999-1")],
  ["foreign project", (config) => config.replace(/^COMPOSE_PROJECT_NAME=.*$/m, "COMPOSE_PROJECT_NAME=independent-control")],
]) {
  test(`SAFE-AC03 purge refuses ${name} before every destructive call`, () => {
    const fixture = uninstallFixture();
    const config = mutate(fixture.config);
    writeFileSync(join(fixture.root, ".chimpmaera-demo/config.env"), config, { mode: 0o600 });
    try {
      const result = spawnSync("bash", [join(fixture.root, "demo/uninstall.sh"), "--purge"], {
        cwd: fixture.root, env: fixture.env, encoding: "utf8", timeout: 5_000,
      });
      assert.equal(result.error, undefined);
      assert.doesNotMatch(readFileSync(fixture.log, "utf8"), /(?:^compose .* down|^image rm)/m,
        "Unverified run/project ownership must deny purge before destructive Docker commands.");
      assert.equal(result.status, 2, result.stderr);
      assert.equal(readFileSync(join(fixture.root, ".chimpmaera-demo/config.env"), "utf8"), config);
      assert.equal(readFileSync(join(fixture.root, ".chimpmaera-demo/secrets/owned-control"), "utf8"), "retained synthetic control\n");
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
}

test("SAFE-AC04 uninstall regression is registered in canonical tests and the existing integrity owner", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.ok(pkg.scripts.test.split(" ").includes("tests/demo-current-head-e2e-uninstall.test.mjs"),
    "The canonical test command must actually execute the uninstall regression.");
  const graph = JSON.parse(readFileSync("verification/verification-dag-v2.json", "utf8"));
  const owners = graph.nodes.filter((node) => node.inputs.some((input) => input.path === "tests/demo-current-head-e2e-uninstall.test.mjs"));
  assert.deepEqual(owners.map((node) => node.id), ["repository-integrity"]);
  assert.ok(owners[0].ownedTests.includes("node --test tests/demo-current-head-e2e*.test.mjs"));
  assert.ok(readFileSync("SHA256SUMS", "utf8").split("\n").some((line) =>
    /^[0-9a-f]{64}  (?:\.\/)?tests\/demo-current-head-e2e-uninstall\.test\.mjs$/.test(line)),
  "The new registered regression must be an actual root-checksum member.");
});

for (const args of [["--purgee"], ["unexpected"], ["--purge", "extra"], ["--help", "extra"], ["-h", "--purge"], ["--purge", "--purge"]]) {
  test(`SAFE-AC01 invalid argument list ${JSON.stringify(args)} is effect-free Exit2`, () => {
    const fixture = uninstallFixture();
    try {
      const result = spawnSync("bash", [join(fixture.root, "demo/uninstall.sh"), ...args], {
        cwd: fixture.root, env: fixture.env, encoding: "utf8", timeout: 5_000,
      });
      assert.equal(result.error, undefined);
      assert.equal(readFileSync(fixture.log, "utf8"), "", "Invalid arguments must be rejected before every Docker call.");
      assert.equal(result.status, 2, result.stderr);
      assert.equal(readFileSync(join(fixture.root, ".chimpmaera-demo/config.env"), "utf8"), fixture.config);
      assert.equal(readFileSync(join(fixture.root, ".chimpmaera-demo/secrets/owned-control"), "utf8"), "retained synthetic control\n");
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
}
