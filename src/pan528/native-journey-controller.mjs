import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { constants, closeSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../../dist/packages/contracts/src/canonical-json.js";
import { validateRuntimeIdentityV1 } from "../pan526/runtime-contract.mjs";
import { bindRuntimeTemplateV1 } from "../pan529/runtime-template-contract.mjs";
import { createResourceBudgetStoreV1 } from "../../demo/runtime/atomic-resource-budget.mjs";
import { readPan515TradeState } from "../pan515/trade-state.mjs";
import { observeGuidedNativeProcessV1 } from "./runtime-observation.mjs";
import { captureGuidedLeadingResourcesV1, assertGuidedLeadingResourcesV1, removeGuidedLeadingResourcesV1 } from "./owned-leading-resources.mjs";
const digest = value => createHash("sha256").update(canonicalJson(value)).digest("hex");
const copy = value => JSON.parse(canonicalJson(value));
function closed(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) throw new Error("GUIDED_COMMAND_DENIED");
  const ds = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(ds).some(key => typeof key !== "string") || JSON.stringify(Object.keys(ds).sort()) !== JSON.stringify([...keys].sort()) || Object.values(ds).some(d => d.get || d.set || !d.enumerable)) throw new Error("GUIDED_COMMAND_DENIED");
}
function privateRoot(path) {
  if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path || realpathSync(path) !== path) throw new Error("GUIDED_OWNED_RESOURCE_DENIED");
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700) throw new Error("GUIDED_OWNED_RESOURCE_DENIED");
  return { dev: stat.dev, ino: stat.ino };
}
function json(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try { const stat = fstatSync(fd); if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600 || stat.size > 32768) throw new Error("GUIDED_OWNED_RESOURCE_DENIED"); return JSON.parse(readFileSync(fd, "utf8")); }
  finally { closeSync(fd); }
}
function atomic(path, value) {
  const temp = path + "." + randomBytes(16).toString("hex");
  writeFileSync(temp, canonicalJson(value) + "\n", { flag: "wx", mode: 0o600 }); renameSync(temp, path);
}
const expected = Object.freeze({ physical: 10, reserved: 6, blocked: 0, available: 4, shipped: 0, returned: 0 });

// Code-owner opt-in only; native owner capabilities never become browser fields.
export function createGuidedNativeOwnerV1(options) {
  closed(options, ["optIn", "identity", "parentRoot", "probeMode"]);
  if (options.optIn !== true || options.probeMode !== "NORMAL") throw new Error("GUIDED_OWNER_OPT_IN_REQUIRED");
  const identity = validateRuntimeIdentityV1(options.identity);
  if (identity.authorityProfile !== "SAFE_GUIDED" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(identity.tenantId)) throw new Error("GUIDED_SAFE_GUIDED_REQUIRED");
  const parentIdentity = privateRoot(options.parentRoot);
  const binding = Object.freeze({ tenantId: identity.tenantId, instanceId: identity.instanceId, generation: identity.generation });
  const template = bindRuntimeTemplateV1(identity); const runtimeObservation = observeGuidedNativeProcessV1();
  const root = join(options.parentRoot, "pan528-guided-native"); const markerPath = join(root, "invocation-owner.json"); const journalPath = join(root, "journey.json"); const leadingRoot = join(root, "pan472-owned-v1");
  const existed = existsSync(root); if (!existed) mkdirSync(root, { mode: 0o700 });
  const rootIdentity = privateRoot(root);
  if (!existed) writeFileSync(markerPath, canonicalJson({ schemaVersion: "pansphaira.guided-native/owner/v1", binding, nonce: randomBytes(32).toString("hex"), rootIdentity }) + "\n", { flag: "wx", mode: 0o600 });
  const marker = json(markerPath); closed(marker, ["schemaVersion", "binding", "nonce", "rootIdentity"]);
  if (marker.schemaVersion !== "pansphaira.guided-native/owner/v1" || canonicalJson(marker.binding) !== canonicalJson(binding) || canonicalJson(marker.rootIdentity) !== canonicalJson(rootIdentity) || !/^[a-f0-9]{64}$/.test(marker.nonce)) throw new Error("GUIDED_OWNED_RESOURCE_DENIED");
  function assertOwned() {
    if (canonicalJson(privateRoot(options.parentRoot)) !== canonicalJson(parentIdentity) || canonicalJson(privateRoot(root)) !== canonicalJson(rootIdentity) || canonicalJson(json(markerPath)) !== canonicalJson(marker)) throw new Error("GUIDED_OWNED_RESOURCE_DENIED");
  }
  if (!existsSync(journalPath)) atomic(journalPath, { schemaVersion: "pansphaira.guided-native/journal/v1", binding, invocationNonce: marker.nonce, status: "IDLE", operationId: null, requestDigest: null, childCompleted: true, abortRequested: false, resetOperationId: null, result: null, leadingIdentity: null });
  function state() {
    assertOwned(); const value = json(journalPath);
    closed(value, ["schemaVersion", "binding", "invocationNonce", "status", "operationId", "requestDigest", "childCompleted", "abortRequested", "resetOperationId", "result", "leadingIdentity"]);
    if (value.schemaVersion !== "pansphaira.guided-native/journal/v1" || canonicalJson(value.binding) !== canonicalJson(binding) || value.invocationNonce !== marker.nonce || !["IDLE", "OUTCOME_UNKNOWN", "SUCCEEDED", "FAILED"].includes(value.status) || typeof value.childCompleted !== "boolean" || typeof value.abortRequested !== "boolean") throw new Error("GUIDED_PERSISTED_STATE_DENIED");
    return value;
  }
  state();
  const budget = createResourceBudgetStoreV1({ optIn: true, stateRoot: join(root, "native-budget"), tenantId: "tenant:" + identity.tenantId, bindingDigest: digest({ binding, nonce: marker.nonce, runtimeTemplateDigest: template.runtimeTemplateDigest }), limits: { modelUnits: 128, runtimeUnits: 8 } });
  const budgetRoot = join(root, "native-budget"); const budgetRootIdentity = privateRoot(budgetRoot);
  function budgetFileIdentity(path) {
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try { const stat = fstatSync(fd); if (!stat.isFile() || stat.uid !== process.getuid() || stat.nlink !== 1 || ![0o600, 0o644].includes(stat.mode & 0o777)) throw new Error("GUIDED_OWNED_RESOURCE_DENIED"); return { dev: stat.dev, ino: stat.ino }; }
    finally { closeSync(fd); }
  }
  const budgetEntries = new Map();
  for (const name of readdirSync(budgetRoot)) {
    if (!["resource-budget.sqlite", "resource-budget.sqlite-wal", "resource-budget.sqlite-shm"].includes(name)) { budget.close(); throw new Error("GUIDED_OWNED_RESOURCE_DENIED"); }
    budgetEntries.set(name, budgetFileIdentity(join(budgetRoot, name)));
  }
  function assertCleanupScope(s) {
    assertOwned();
    const expectedNames = ["invocation-owner.json", "journey.json", "native-budget", ...(s.leadingIdentity ? ["pan472-owned-v1"] : [])].sort();
    if (canonicalJson(readdirSync(root).sort()) !== canonicalJson(expectedNames) || canonicalJson(privateRoot(budgetRoot)) !== canonicalJson(budgetRootIdentity)) throw new Error("GUIDED_OWNED_RESOURCE_DENIED");
    for (const name of readdirSync(budgetRoot)) if (!budgetEntries.has(name) || canonicalJson(budgetFileIdentity(join(budgetRoot, name))) !== canonicalJson(budgetEntries.get(name))) throw new Error("GUIDED_OWNED_RESOURCE_DENIED");
    if (s.leadingIdentity) assertGuidedLeadingResourcesV1(leadingRoot, s.leadingIdentity);
  }
  let handle = null; let completion = null; let isClosed = false; let escalation = null;
  function stopOwnedChild() {
    const child = handle; if (!child) return;
    child.kill("SIGTERM");
    if (!escalation) escalation = setTimeout(() => { if (handle === child && child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); }, 1000);
  }
  const readback = () => {
    const s = state(); return copy({ binding, status: s.status, operationId: s.operationId, childCompleted: s.childCompleted, abortAcknowledged: s.abortRequested, authorityProfile: "SAFE_GUIDED", modelInvocation: "NOT_REQUESTED", expectedBusinessValue: expected,
      observedBusinessValue: s.result?.observedBusinessValue ?? null, nativeEvidence: s.result?.nativeEvidence ?? null, runtimeObservation: s.result?.runtimeObservation ?? runtimeObservation,
      runtimeTemplateDigest: template.runtimeTemplateDigest, templateId: template.templateId, sessionBindingIsNotRuntimeQualification: true, budget: budget.snapshot() });
  };
  async function command(value, principal) {
    if (isClosed) throw new Error("GUIDED_OWNER_CLOSED");
    closed(value, ["action", "operationId", "binding"]); closed(value.binding, ["tenantId", "instanceId", "generation"]);
    if (canonicalJson(value.binding) !== canonicalJson(binding) || !principal || principal.role !== "reviewer" || principal.tenantId !== binding.tenantId || principal.instanceId !== binding.instanceId || principal.generation !== binding.generation) throw new Error("GUIDED_BOUND_PRINCIPAL_DENIED");
    if (!["RUN_STARTER", "ABORT_STARTER", "RESET_STARTER"].includes(value.action) || typeof value.operationId !== "string" || !/^operation:[a-z0-9][a-z0-9._-]{2,63}$/.test(value.operationId)) throw new Error("GUIDED_COMMAND_DENIED");
    const s = state();
    if (value.action === "ABORT_STARTER") {
      if (s.status !== "OUTCOME_UNKNOWN" || s.operationId !== value.operationId || !handle) throw new Error("GUIDED_OUTCOME_UNKNOWN_RETAINED");
      atomic(journalPath, { ...s, abortRequested: true }); stopOwnedChild(); return readback();
    }
    if (value.action === "RESET_STARTER") {
      if (s.status === "OUTCOME_UNKNOWN" || !s.childCompleted || handle) throw new Error("GUIDED_OUTCOME_UNKNOWN_RETAINED");
      if (s.resetOperationId === value.operationId) return readback();
      if (!["SUCCEEDED", "FAILED"].includes(s.status) || !s.leadingIdentity) throw new Error("GUIDED_STARTER_NOT_IDLE_DENIED");
      assertGuidedLeadingResourcesV1(leadingRoot, s.leadingIdentity);
      // Fence before any deletion. A crash or failed cleanup remains unresolved;
      // an HTTP retry cannot turn partial reset into a blind new dispatch.
      atomic(journalPath, { ...s, status: "OUTCOME_UNKNOWN" });
      removeGuidedLeadingResourcesV1(leadingRoot, s.leadingIdentity);
      atomic(journalPath, { ...s, status: "IDLE", operationId: null, requestDigest: null, childCompleted: true, abortRequested: false, resetOperationId: value.operationId, result: null, leadingIdentity: null });
      return readback();
    }
    const requestDigest = digest({ ...value, invocationNonce: marker.nonce });
    if (s.operationId === value.operationId) { if (s.requestDigest !== requestDigest) throw new Error("GUIDED_RETRY_CONFLICT_DENIED"); return readback(); }
    if (s.status !== "IDLE" || existsSync(leadingRoot)) throw new Error("GUIDED_STARTER_NOT_IDLE_DENIED");
    budget.reserve({ operationId: value.operationId, requestDigest, modelUnits: 0, runtimeUnits: 1 });
    const fence = budget.markUnknownUsage(value.operationId); if (!fence.dispatchGranted) throw new Error("GUIDED_OUTCOME_UNKNOWN_RETAINED");
    atomic(journalPath, { ...s, status: "OUTCOME_UNKNOWN", operationId: value.operationId, requestDigest, childCompleted: false });
    const child = spawn(process.execPath, [fileURLToPath(new URL("./starter-worker.mjs", import.meta.url))], { cwd: fileURLToPath(new URL("../../", import.meta.url)), env: Object.fromEntries(["PATH", "LANG", "LC_ALL", "TMPDIR"].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]])), stdio: ["pipe", "pipe", "pipe"] });
    handle = child; let stdout = ""; let stderr = ""; let overflow = false; let childError = false;
    child.stdout.on("data", chunk => { stdout += chunk; if (Buffer.byteLength(stdout) > 16384) { overflow = true; child.kill("SIGTERM"); } });
    child.stderr.on("data", chunk => { if (Buffer.byteLength(stderr) < 16384) stderr += chunk; });
    child.on("error", () => { childError = true; }); child.stdin.on("error", () => { childError = true; });
    const timer = setTimeout(stopOwnedChild, 10000);
    completion = new Promise(resolveCompletion => child.once("close", (code, signal) => {
      clearTimeout(timer); if (escalation) clearTimeout(escalation); escalation = null; handle = null;
      try {
        const current = state();
        if (code !== 0 || signal || childError || overflow || isClosed) { atomic(journalPath, { ...current, childCompleted: true }); resolveCompletion(); return; }
        const result = JSON.parse(stdout); closed(result, ["schemaVersion", "operationId", "invocationNonce", "runtimeObservation", "observedBusinessValue", "nativeEvidence"]);
        if (result.schemaVersion !== "pansphaira.guided-native/worker-result/v1" || result.operationId !== value.operationId || result.invocationNonce !== marker.nonce || canonicalJson(result.runtimeObservation) !== canonicalJson(runtimeObservation)) throw new Error("GUIDED_CHILD_RESULT_BINDING_DENIED");
        captureGuidedLeadingResourcesV1(leadingRoot);
        const leading = readPan515TradeState({ root: leadingRoot });
        if (canonicalJson(leading.quantities) !== canonicalJson(result.observedBusinessValue) || leading.revision !== result.nativeEvidence.revision) throw new Error("GUIDED_CHILD_NATIVE_READBACK_DENIED");
        const success = canonicalJson(result.observedBusinessValue) === canonicalJson(expected);
        const evidence = budget.ownerCompletionEvidence({ operationId: value.operationId, requestDigest, modelUnits: 0, runtimeUnits: 1, evidenceDigest: digest(result) }); budget.settle(evidence, result);
        atomic(journalPath, { ...current, status: success ? "SUCCEEDED" : "FAILED", childCompleted: true, result, leadingIdentity: captureGuidedLeadingResourcesV1(leadingRoot) });
      } catch { /* Retain the persisted unknown fence: an exit alone proves no business outcome. */ }
      resolveCompletion();
    }));
    child.stdin.end(JSON.stringify({ schemaVersion: "pansphaira.guided-native/worker-input/v1", operationId: value.operationId, invocationNonce: marker.nonce, leadingRoot, runtimeObservation, probeMode: options.probeMode }));
    return readback();
  }
  const close = () => { if (handle) throw new Error("GUIDED_OUTCOME_UNKNOWN_RETAINED"); assertOwned(); if (!isClosed) { budget.close(); isClosed = true; } };
  async function suspend() {
    if (handle) { const s = state(); atomic(journalPath, { ...s, abortRequested: true }); stopOwnedChild(); if (completion) await completion; }
    const s = state(); close(); return Object.freeze({ binding, status: s.status, childCompleted: s.childCompleted });
  }
  const cleanup = () => {
    const s = state(); if (!s.childCompleted || s.status === "OUTCOME_UNKNOWN" || handle) throw new Error("GUIDED_OUTCOME_UNKNOWN_RETAINED");
    assertCleanupScope(s); close(); assertCleanupScope(s);
    const handles = [];
    const directory = path => { const fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NONBLOCK); handles.push(fd); return { anchor: "/proc/self/fd/" + fd, identity: { dev: fstatSync(fd).dev, ino: fstatSync(fd).ino } }; };
    try {
      const parent = directory(options.parentRoot); const owned = directory(join(parent.anchor, "pan528-guided-native")); const ledger = directory(join(owned.anchor, "native-budget"));
      if (canonicalJson(parent.identity) !== canonicalJson(parentIdentity) || canonicalJson(owned.identity) !== canonicalJson(rootIdentity) || canonicalJson(ledger.identity) !== canonicalJson(budgetRootIdentity)) throw new Error("GUIDED_OWNED_RESOURCE_DENIED");
      if (s.leadingIdentity) removeGuidedLeadingResourcesV1(leadingRoot, s.leadingIdentity);
      for (const name of readdirSync(ledger.anchor)) { if (!budgetEntries.has(name) || canonicalJson(budgetFileIdentity(join(ledger.anchor, name))) !== canonicalJson(budgetEntries.get(name))) throw new Error("GUIDED_OWNED_RESOURCE_DENIED"); unlinkSync(join(ledger.anchor, name)); }
      rmdirSync(join(owned.anchor, "native-budget"));
      if (canonicalJson(json(join(owned.anchor, "invocation-owner.json"))) !== canonicalJson(marker)) throw new Error("GUIDED_OWNED_RESOURCE_DENIED");
      json(join(owned.anchor, "journey.json")); unlinkSync(join(owned.anchor, "journey.json")); unlinkSync(join(owned.anchor, "invocation-owner.json"));
      const target = lstatSync(join(parent.anchor, "pan528-guided-native")); if (target.dev !== rootIdentity.dev || target.ino !== rootIdentity.ino || target.isSymbolicLink()) throw new Error("GUIDED_OWNED_RESOURCE_DENIED");
      rmdirSync(join(parent.anchor, "pan528-guided-native"));
    } finally { for (const fd of handles.reverse()) closeSync(fd); }
  };
  return Object.freeze({ client: Object.freeze({ command, readback }), owner: Object.freeze({ leadingRoot, close, suspend, cleanup, async waitForChildCompletion() { if (completion) await completion; } }) });
}
