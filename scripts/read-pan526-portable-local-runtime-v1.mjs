#!/usr/bin/env node
import { createLocalRuntimeAdapterV1 } from "../src/pan526/local-runtime-adapter.mjs";

const flags = new Map([
  ["--source-root", "sourceRoot"], ["--instance-id", "instanceId"],
  ["--source-commit", "sourceCommit"], ["--source-tree", "sourceTree"],
  ["--image-digest", "imageDigest"], ["--generation", "expectedGeneration"],
]);
try {
  const args = process.argv.slice(2);
  const options = {};
  let load = false;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === "--opt-in-local-owner") {
      if (Object.hasOwn(options, "optIn")) throw new Error("LOCAL_RUNTIME_CLI_ARGUMENTS_DENIED");
      options.optIn = true; continue;
    }
    if (flag === "--bounded-read-load") {
      if (load) throw new Error("LOCAL_RUNTIME_CLI_ARGUMENTS_DENIED");
      load = true; continue;
    }
    const key = flags.get(flag);
    if (!key || Object.hasOwn(options, key) || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error("LOCAL_RUNTIME_CLI_ARGUMENTS_DENIED");
    options[key] = args[++i];
  }
  if (Object.keys(options).length !== 7 || options.optIn !== true || !/^[1-9][0-9]{0,14}$/.test(options.expectedGeneration ?? "")) throw new Error("LOCAL_RUNTIME_CLI_ARGUMENTS_DENIED");
  options.expectedGeneration = Number(options.expectedGeneration);
  const adapter = createLocalRuntimeAdapterV1(options);
  const readiness = await adapter.readiness();
  const observed = adapter.observe().state;
  const loadReceipts = [];
  if (load) {
    for (let i = 0; i < 20; i++) loadReceipts.push(await adapter.readiness());
  }
  process.stdout.write(JSON.stringify({ schemaVersion: "pansphaira.portable-runtime/local-reader/v1", expectedIdentity: adapter.expectedIdentity, desired: adapter.desiredState("running"), observed, readiness, loadReceipts, executionAuthorityGranted: false }) + "\n");
  if (readiness.state !== "READY" || loadReceipts.some((receipt) => receipt.state !== "READY")) process.exitCode = 2;
} catch (error) {
  const code = error?.message === "LOCAL_RUNTIME_CLI_ARGUMENTS_DENIED" ? error.message : "LOCAL_RUNTIME_OBSERVATION_DENIED";
  process.stderr.write("HELD: " + code + "\n"); process.exitCode = 2;
}
