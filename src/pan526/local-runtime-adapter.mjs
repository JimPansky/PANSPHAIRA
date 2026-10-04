import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { constants, closeSync, fstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { canonicalJson } from "../../dist/packages/contracts/src/canonical-json.js";
import { assessRuntimeReadinessV1, runtimeDesiredStateDigestV1, runtimeIdentityDigestV1, runtimeLifecycleJobDigestV1, validateRuntimeDesiredStateV1, validateRuntimeIdentityV1, validateRuntimeLifecycleJobV1, validateRuntimeLifecycleReceiptV1, validateRuntimeObservedStateV1 } from "./runtime-contract.mjs";

const services = ["chimpmaera", "doli-db", "dolibarr", "espo-db", "espocrm"];
const hash = (value) => createHash("sha256").update(value).digest("hex");
const hashJson = (value) => hash(canonicalJson(value));
const safeEnv = Object.fromEntries(["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR"].filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]));
function command(executable, args, timeout = 30000) {
  return execFileSync(executable, args, { encoding: "utf8", timeout, maxBuffer: 2 * 1024 * 1024, env: safeEnv, stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function regularBytes(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw new Error("LOCAL_RUNTIME_FILE_DENIED");
    return readFileSync(fd);
  } finally { closeSync(fd); }
}
function readJson(path) { return JSON.parse(regularBytes(path).toString("utf8")); }
function atomicJson(path, value) {
  const tmp = path + "." + randomBytes(8).toString("hex");
  writeFileSync(tmp, canonicalJson(value) + "\n", { flag: "wx", mode: 0o600 });
  renameSync(tmp, path);
}

// Local owner entry only. Nothing is registered on the legacy HTTP server;
// a schema, caller role, receipt or READY never grants permission to call this.
export function createLocalRuntimeAdapterV1(options) {
  if (!options || typeof options !== "object" || Object.getOwnPropertyDescriptor(options, "optIn")?.value !== true) throw new Error("LOCAL_RUNTIME_OPT_IN_REQUIRED");
  const keys = ["expectedGeneration", "imageDigest", "instanceId", "optIn", "sourceCommit", "sourceRoot", "sourceTree"];
  const descriptors = Object.getOwnPropertyDescriptors(options);
  if (Object.getPrototypeOf(options) !== Object.prototype || JSON.stringify(Reflect.ownKeys(descriptors).sort()) !== JSON.stringify(keys)
    || Object.values(descriptors).some((d) => !d.enumerable || d.get || d.set)
    || !/^[a-f0-9]{40}$/.test(options.sourceCommit) || !/^[a-f0-9]{40}$/.test(options.sourceTree)
    || !/^sha256:[a-f0-9]{64}$/.test(options.imageDigest)
    || !/^pansphaira-e2e-[1-9][0-9]{0,19}-[1-9][0-9]{0,5}$/.test(options.instanceId)
    || !Number.isSafeInteger(options.expectedGeneration) || options.expectedGeneration < 1
    || typeof options.sourceRoot !== "string" || !isAbsolute(options.sourceRoot)) throw new Error("LOCAL_RUNTIME_OPTIONS_DENIED");
  const root = realpathSync(options.sourceRoot);
  if (root !== resolve(options.sourceRoot)) throw new Error("LOCAL_RUNTIME_SOURCE_ALIAS_DENIED");
  if (command("git", ["-C", root, "rev-parse", "HEAD"]) !== options.sourceCommit
    || command("git", ["-C", root, "rev-parse", "HEAD^{tree}"]) !== options.sourceTree
    || command("git", ["-C", root, "status", "--porcelain"])) throw new Error("LOCAL_RUNTIME_SOURCE_PIN_DENIED");
  const stateRoot = join(root, ".chimpmaera-demo");
  if (realpathSync(stateRoot) !== stateRoot) throw new Error("LOCAL_RUNTIME_STATE_ALIAS_DENIED");
  const configBytes = regularBytes(join(stateRoot, "config.env"));
  const config = {};
  for (const line of configBytes.toString("utf8").trim().split("\n")) {
    const match = /^([A-Z][A-Z0-9_]*)=([^\r\n]*)$/.exec(line);
    if (!match || Object.hasOwn(config, match[1])) throw new Error("LOCAL_RUNTIME_CONFIG_DENIED");
    config[match[1]] = match[2];
  }
  if (config.COMPOSE_PROJECT_NAME !== options.instanceId || config.CM_DEMO_RUN_OWNER !== options.instanceId
    || !/^(?:chimpmaera\/v01-runtime@)?sha256:[a-f0-9]{64}$/.test(config.CM_CHIMP_IMAGE) || config.CM_AUTHORITY_PROFILE !== "SAFE_GUIDED"
    || config.CM_DEMO_SEED !== "yes" || config.CM_DEMO_MODE !== "complete"
    || [config.CM_CHIMP_PORT, config.CM_ESPO_PORT, config.CM_DOLI_PORT].some((p) => !/^127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(p))) throw new Error("LOCAL_RUNTIME_CONFIG_BINDING_DENIED");
  if (command("docker", ["image", "inspect", config.CM_CHIMP_IMAGE, "--format", "{{.Id}}"] ) !== options.imageDigest) throw new Error("LOCAL_RUNTIME_IMAGE_PIN_DENIED");
  const fixture = readJson(join(root, "demo/manifests/fixtures/panskys-zoo-demo-v1.json"));
  if (fixture.inventoryPolicy.fullySynthetic !== true) throw new Error("LOCAL_RUNTIME_FIXTURE_DENIED");
  const proof = fixture.erp.orders.find((o) => o.fixtureId === fixture.inventoryPolicy.proofScenarioFixtureId);
  const seed = readJson(join(stateRoot, "public/seed-and-flow.json"));
  const proofId = seed.correlations.erpOrders.find((o) => o.fixtureId === proof.fixtureId)?.id;
  if (!/^[1-9][0-9]*$/.test(String(proofId))) throw new Error("LOCAL_RUNTIME_PROBE_BINDING_DENIED");
  const expectedBusiness = { customerReference: proof.customerReference, lines: proof.lines.map((line) => ({ description: line.description, quantity: line.quantity, unitPriceExcludingTax: line.unitPriceExcludingTax, vatRate: line.vatRate })).sort((a, b) => a.description.localeCompare(b.description, "en")) };
  const nativeVersion = /^FROM node:([0-9]+\.[0-9]+\.[0-9]+)-/m.exec(regularBytes(join(root, "demo/chimpmaera.Dockerfile")).toString("utf8"))?.[1];
  const expectedIdentity = validateRuntimeIdentityV1({
    schemaVersion: "pansphaira.portable-runtime/identity/v1", componentId: "pansphaira-local-demo",
    sourceCommit: options.sourceCommit, sourceTree: options.sourceTree, imageDigest: options.imageDigest,
    architecture: "x86_64", productVersion: readJson(join(root, "package.json")).version,
    runtime: { name: "node", version: nativeVersion }, contractVersion: "1.0.0",
    instanceId: options.instanceId, tenantId: "panskys-zoo-demo", generation: options.expectedGeneration,
    configurationDigest: hash(configBytes), templateDigest: hash(regularBytes(join(root, "demo/manifests/catalog/crm-erp-playable-v1.json"))),
    policyDigest: hash(regularBytes(join(root, "demo/manifests/authority/admin-ai-poc-policy-v1.json"))),
    networkDigest: hash(regularBytes(join(root, "demo/manifests/network/local-egress-policy-v1.json"))),
    authorityProfile: "SAFE_GUIDED", effectiveRights: ["demo.status.read", "demo.provider.bound.read", "demo.governed.effect"],
  });
  const secretReferences = ["api-auth", "control-auth", "espo-auth", "doli-auth"].map((slot) => ({ slot, referenceId: "opaque:" + hash(options.instanceId + ":" + slot).slice(0, 32) }));
  const privateRoot = join(stateRoot, "portable-runtime"); mkdirSync(privateRoot, { mode: 0o700, recursive: true });
  if (realpathSync(privateRoot) !== privateRoot) throw new Error("LOCAL_RUNTIME_STATE_ALIAS_DENIED");
  const storePath = join(privateRoot, "jobs.json");
  let lastRunningIdentity = null;
  const context = (desiredState, nowMs) => ({ expectedIdentity, desiredState, nowMs });
  const desiredState = (phase) => validateRuntimeDesiredStateV1({ schemaVersion: "pansphaira.portable-runtime/desired/v1", identity: expectedIdentity, phase, secretReferences });
  function inspectOwned() {
    const ids = command("docker", ["ps", "-aq", "--filter", "label=com.docker.compose.project=" + options.instanceId]).split("\n").filter(Boolean);
    if (ids.length !== services.length || ids.some((id) => !/^[a-f0-9]{12,64}$/.test(id))) throw new Error("LOCAL_RUNTIME_OWNED_RESOURCES_DENIED");
    const containers = JSON.parse(command("docker", ["inspect", ...ids]));
    if (JSON.stringify(containers.map((c) => c.Config.Labels["com.docker.compose.service"]).sort()) !== JSON.stringify(services)
      || containers.some((c) => c.Config.Labels["com.docker.compose.project"] !== options.instanceId)) throw new Error("LOCAL_RUNTIME_OWNED_RESOURCES_DENIED");
    const chimp = containers.find((c) => c.Config.Labels["com.docker.compose.service"] === "chimpmaera");
    if (chimp.Image !== options.imageDigest || chimp.Config.Labels["io.chimpmaera.demo.run-owner"] !== options.instanceId) throw new Error("LOCAL_RUNTIME_IMAGE_PIN_DENIED");
    const boundaryObservation = {
      loopbackOnly: containers.every((c) => Object.values(c.NetworkSettings.Ports ?? {}).flatMap((p) => p ?? []).every((p) => p.HostIp === "127.0.0.1")) && containers.every((c) => c.HostConfig.NetworkMode !== "host"),
      privileged: containers.some((c) => c.HostConfig.Privileged),
      dockerSocketMounted: containers.some((c) => c.Mounts.some((m) => /(?:^|\/)docker\.sock$/.test(m.Source) || /(?:^|\/)docker\.sock$/.test(m.Destination))),
      ownedResourcesOnly: containers.every((c) => c.Config.Labels["com.docker.compose.project"] === options.instanceId),
    };
    return { chimp, boundaryObservation };
  }
  function observe() {
    const { chimp, boundaryObservation } = inspectOwned();
    let identity;
    if (chimp.State.Running) {
      const actual = JSON.parse(command("docker", ["exec", chimp.Id, "node", "-e", "const fs=require('node:fs'); console.log(JSON.stringify({runtimeVersion:process.versions.node,architecture:process.arch,productVersion:JSON.parse(fs.readFileSync('/opt/chimpmaera/package.json')).version,generation:JSON.parse(fs.readFileSync('/var/lib/chimpmaera/policy-activation-record.json')).active.generation}))"]));
      identity = validateRuntimeIdentityV1({ ...expectedIdentity, runtime: { name: "node", version: actual.runtimeVersion }, architecture: actual.architecture === "x64" ? "x86_64" : actual.architecture, productVersion: actual.productVersion, generation: actual.generation });
      lastRunningIdentity = identity;
    } else {
      if (lastRunningIdentity === null) throw new Error("LOCAL_RUNTIME_STOPPED_IDENTITY_NOT_OBSERVED");
      identity = lastRunningIdentity;
    }
    const state = validateRuntimeObservedStateV1({ schemaVersion: "pansphaira.portable-runtime/observed/v1", identity, phase: chimp.State.Running ? "running" : "stopped", secretReferences, observedAtMs: Date.now() });
    return { state, containerId: chimp.Id, boundaryObservation };
  }
  async function readiness() {
    const observation = observe();
    if (observation.state.phase !== "running") throw new Error("LOCAL_RUNTIME_NOT_RUNNING");
    const token = regularBytes(join(stateRoot, "secrets/chimp-api-token")).toString("utf8").trim();
    const origin = "http://" + config.CM_CHIMP_PORT;
    const response = await fetch(origin + "/api/demo/provider-read", { method: "POST", headers: { authorization: "Bearer " + token, origin, "x-cm-csrf": "chimpmaera-local-v1", "content-type": "application/json" }, body: JSON.stringify({ provider: "dolibarr", path: "/orders/" + proofId, query: {} }), signal: AbortSignal.timeout(10000) });
    const responseBytes = await response.text();
    const value = JSON.parse(responseBytes).value;
    const actualBusiness = value && Array.isArray(value.lines) ? { customerReference: value.ref_client, lines: value.lines.map((line) => ({ description: line.desc, quantity: Number(line.qty), unitPriceExcludingTax: Number(line.subprice), vatRate: Number(line.tva_tx) })).sort((a, b) => a.description.localeCompare(b.description, "en")) } : { missingBusinessValue: true };
    return assessRuntimeReadinessV1({ expectedIdentity, observedIdentity: observation.state.identity, observedAtMs: observation.state.observedAtMs, boundaryObservation: observation.boundaryObservation, probe: { probeId: "pansphaira-demo-order-readback-v1", httpStatus: response.status, expectedValueDigest: hashJson(expectedBusiness), observedValueDigest: hashJson(actualBusiness), sourceObservationDigest: hash(responseBytes) } });
  }
  async function dispatchLifecycle(job) {
    const desired = desiredState(job.action === "stop" ? "stopped" : "running");
    const bound = validateRuntimeLifecycleJobV1(job, context(desired, Date.now()));
    const jobDigest = runtimeLifecycleJobDigestV1(bound, context(desired, Date.now()));
    const lockPath = join(privateRoot, "dispatch.lock");
    const lock = openSync(lockPath, "wx", 0o600);
    try {
      let store;
      try { store = readJson(storePath); } catch (e) { if (e.code !== "ENOENT") throw e; store = {}; }
      if (Object.hasOwn(store, bound.jobId)) {
        const retained = validateRuntimeLifecycleReceiptV1(store[bound.jobId]);
        if (retained.jobDigest !== jobDigest) throw new Error("LOCAL_RUNTIME_JOB_ID_COLLISION_DENIED");
        return retained;
      }
      const before = observe();
      if (runtimeIdentityDigestV1(before.state.identity) !== runtimeIdentityDigestV1(expectedIdentity)
        || !before.boundaryObservation.loopbackOnly || before.boundaryObservation.privileged || before.boundaryObservation.dockerSocketMounted || !before.boundaryObservation.ownedResourcesOnly) throw new Error("LOCAL_RUNTIME_DISPATCH_BOUNDARY_DENIED");
      const unknown = () => validateRuntimeLifecycleReceiptV1({ schemaVersion: "pansphaira.portable-runtime/lifecycle-receipt/v1", jobId: bound.jobId, jobDigest, outcome: "outcome_unknown", reasonCode: "DISPATCH_INTERRUPTED", observedStateDigest: null, completedAtMs: Date.now(), executionAuthorityGranted: false });
      store[bound.jobId] = unknown(); atomicJson(storePath, store);
      let dispatchFailed = false;
      try { command("docker", bound.action === "start" ? ["start", before.containerId] : [bound.action, "--time", "1", before.containerId], bound.deadlineMs); }
      catch (error) {
        if (error.code === "ETIMEDOUT" || error.signal || !Number.isInteger(error.status)) return store[bound.jobId];
        dispatchFailed = true;
      }
      let after;
      try { after = observe(); } catch { return store[bound.jobId]; }
      const target = after.state.phase === desired.phase && runtimeIdentityDigestV1(after.state.identity) === runtimeIdentityDigestV1(expectedIdentity);
      store[bound.jobId] = validateRuntimeLifecycleReceiptV1({ schemaVersion: "pansphaira.portable-runtime/lifecycle-receipt/v1", jobId: bound.jobId, jobDigest, outcome: target ? "succeeded" : "failed", reasonCode: target ? "OBSERVED_TARGET_REACHED" : dispatchFailed ? "DISPATCH_FAILED" : "OBSERVED_TARGET_NOT_REACHED", observedStateDigest: hashJson(after.state), completedAtMs: Date.now(), executionAuthorityGranted: false });
      atomicJson(storePath, store); return store[bound.jobId];
    } finally { closeSync(lock); unlinkSync(lockPath); }
  }
  return Object.freeze({ expectedIdentity, desiredState, observe, readiness, dispatchLifecycle });
}
