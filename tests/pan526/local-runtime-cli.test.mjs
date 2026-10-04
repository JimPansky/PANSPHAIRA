import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import test from "node:test";

test("portable local reader requires exact closed owner opt-in arguments", () => {
  const path = new URL("../../scripts/read-pan526-portable-local-runtime-v1.mjs", import.meta.url);
  assert.ok(existsSync(path), "actual portable reader CLI must exist");
  for (const args of [[], ["--opt-in-local-owner"], ["--help"], ["--opt-in-local-owner", "--role", "owner"], ["--opt-in-local-owner", "--opt-in-local-owner"]]) {
    const run = spawnSync(process.execPath, [path.pathname, ...args], { encoding: "utf8" });
    assert.equal(run.status, 2);
    assert.equal(run.stdout, "");
    assert.match(run.stderr, /^HELD: LOCAL_RUNTIME_CLI_ARGUMENTS_DENIED\n$/);
  }
});
