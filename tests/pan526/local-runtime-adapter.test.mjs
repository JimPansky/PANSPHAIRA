import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

test("local portable runtime adapter is opt-in and refuses undeclared selectors before external calls", async () => {
  assert.ok(existsSync(new URL("../../src/pan526/local-runtime-adapter.mjs", import.meta.url)),
    "actual isolated local runtime adapter must exist");
  const { createLocalRuntimeAdapterV1 } = await import("../../src/pan526/local-runtime-adapter.mjs");
  assert.throws(() => createLocalRuntimeAdapterV1({}), /LOCAL_RUNTIME_OPT_IN_REQUIRED/);
  assert.throws(() => createLocalRuntimeAdapterV1({ optIn: false }), /LOCAL_RUNTIME_OPT_IN_REQUIRED/);
  const options = { optIn: true, sourceRoot: "/synthetic/not-a-runtime", instanceId: "pansphaira-e2e-526-1", sourceCommit: "39720e8862911df72bc674ad52f813e2df2f3d1e", sourceTree: "a958b381bd766a848b754058d018e63a354f1754", imageDigest: "sha256:" + "1".repeat(64), expectedGeneration: 1 };
  for (const change of [
    (v) => { v.sourceCommit = "main"; },
    (v) => { v.imageDigest = "latest"; },
    (v) => { v.instanceId = "foreign-demo"; },
    (v) => { v.expectedGeneration = 0; },
    (v) => { v.role = "owner"; },
    (v) => { v.bind = "0.0.0.0"; },
  ]) {
    const wrong = structuredClone(options); change(wrong);
    assert.throws(() => createLocalRuntimeAdapterV1(wrong), /LOCAL_RUNTIME_OPTIONS_DENIED/);
  }
});
