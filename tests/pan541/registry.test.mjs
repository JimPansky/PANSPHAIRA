import test from "node:test";
import assert from "node:assert/strict";

let module;
try { module = await import("../../dist/packages/browser-shell/src/registry-v1.js"); }
catch (error) { if (error.code !== "ERR_MODULE_NOT_FOUND") throw error; }
const descriptor = (id, factoryId) => ({
  schemaVersion: "pansphaira.browser-plugin/v1", id, version: "1.0.0", shellVersion: "1.0.0", enabled: true,
  trustBoundary: "TRUSTED_IN_PROCESS_CODE_OWNED_FACTORIES",
  contributions: [
    { id: id + ".route", kind: "ROUTE", slot: "shell.routes", routeId: id + ".route", path: "/workspace/" + id.split(".")[1], factoryId: null, label: "Fachmodul" },
    { id: id + ".view", kind: "VIEW", slot: "shell.main", routeId: id + ".route", path: null, factoryId, label: "Arbeitsplatz" },
  ], needs: { data: [], context: ["tenantId", "sessionId"], rights: [], dependencies: [] },
});

test("PUI-01-AC02/05 additive closed registry retires its own render lifetime and contains a throwing owned renderer", async () => {
  assert.equal(typeof module?.createBrowserShellRegistryV1, "function", "PAN541_OWNED_SLOT_REGISTRY_NOT_IMPLEMENTED");
  let disposed = 0; let signal; const faults = [];
  const registry = module.createBrowserShellRegistryV1({ factories: new Map([
    ["setup.view", { kind: "VIEW", render(frame) { signal = frame.signal; return () => { disposed++; }; } }],
    ["erv.view", { kind: "VIEW", render() { throw new Error("synthetic renderer failure"); } }],
  ]), reportFault: fault => faults.push(fault) });
  assert.equal(registry.register(descriptor("pan.setup", "setup.view")).outcome, "REGISTERED");
  assert.equal(registry.register(descriptor("pan.erv", "erv.view")).outcome, "REGISTERED");
  assert.equal((await registry.render("pan.setup.view", Object.freeze({}))).outcome, "RENDERED");
  assert.equal((await registry.render("pan.erv.view", Object.freeze({}))).outcome, "RENDER_FAILED");
  assert.equal(signal.aborted, true); assert.equal(disposed, 1);
  assert.deepEqual(registry.routes().map(x => x.routeId), ["pan.setup.route", "pan.erv.route"]);
  assert.equal(faults.at(-1).outcome, "RENDER_FAILED");
  assert.equal(registry.register(descriptor("pan.setup", "setup.view")).outcome, "DENIED");
  assert.equal(registry.unregister("pan.setup"), true);
  assert.deepEqual(registry.routes().map(x => x.routeId), ["pan.erv.route"]);
  registry.close(); registry.close();
  assert.throws(() => registry.register(descriptor("pan.setup", "setup.view")), /SHELL_REGISTRY_CLOSED/);
});

test("PUI-01-AC05 disabled/missing exact dependencies and factory-kind mismatch stay visible without invoking code", async () => {
  assert.equal(typeof module?.createBrowserShellRegistryV1, "function");
  let invocations = 0;
  const registry = module.createBrowserShellRegistryV1({ factories: new Map([
    ["setup.view", { kind: "VIEW", render() { invocations++; } }],
    ["wrong.panel", { kind: "PANEL", render() { invocations++; } }],
  ]), reportFault() {} });
  const disabled = descriptor("pan.disabled", "setup.view"); disabled.enabled = false;
  assert.equal(registry.register(disabled).outcome, "DISABLED");
  assert.equal((await registry.render("pan.disabled.view", {})).outcome, "DISABLED");
  const dependent = descriptor("pan.dependent", "setup.view"); dependent.needs.dependencies = [{ id: "pan.base", version: "1.0.0" }];
  assert.equal(registry.register(dependent).outcome, "MISSING_DEPENDENCY");
  assert.equal((await registry.render("pan.dependent.view", {})).outcome, "MISSING_DEPENDENCY");
  const wrong = descriptor("pan.wrong", "wrong.panel");
  assert.equal(registry.register(wrong).outcome, "DENIED");
  const base = descriptor("pan.base", "setup.view"); base.version = "2.0.0";
  assert.equal(registry.register(base).outcome, "REGISTERED");
  assert.equal(registry.status("pan.dependent").outcome, "MISSING_DEPENDENCY");
  registry.unregister("pan.base"); base.version = "1.0.0"; registry.register(base);
  assert.equal(registry.status("pan.dependent").outcome, "REGISTERED");
  assert.equal((await registry.render("pan.dependent.view", {})).outcome, "RENDERED");
  assert.equal(invocations, 1);
  const a = descriptor("pan.cyclea", "setup.view"), b = descriptor("pan.cycleb", "setup.view");
  a.needs.dependencies = [{ id: b.id, version: b.version }]; b.needs.dependencies = [{ id: a.id, version: a.version }];
  registry.register(a); registry.register(b);
  assert.equal(registry.status(a.id).outcome, "MISSING_DEPENDENCY");
  assert.equal(registry.status(b.id).outcome, "MISSING_DEPENDENCY");
  assert.equal(registry.routes().find(x => x.pluginId === disabled.id).state, "DISABLED");
  registry.close();
});

test("PUI-01-AC04 stale rejected render after module change is discarded instead of surfacing an old-session fault", async () => {
  let rejectOld; let disposed = 0; const faults = [];
  const registry = module.createBrowserShellRegistryV1({ factories: new Map([
    ["setup.view", { kind: "VIEW", render() { return new Promise((resolve, reject) => { rejectOld = reject; }); } }],
    ["erv.view", { kind: "VIEW", render() { return () => { disposed++; }; } }],
  ]), reportFault: fault => faults.push(fault) });
  registry.register(descriptor("pan.setup", "setup.view")); registry.register(descriptor("pan.erv", "erv.view"));
  const old = registry.render("pan.setup.view", {});
  assert.equal((await registry.render("pan.erv.view", {})).outcome, "RENDERED");
  rejectOld(new Error("old backend request failed after context retirement"));
  assert.equal((await old).outcome, "STALE_RENDER");
  assert.deepEqual(faults, []);
  registry.close(); assert.equal(disposed, 1);
});
