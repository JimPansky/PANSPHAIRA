import test from "node:test";
import assert from "node:assert/strict";

let contract;
try { contract = await import("../../packages/contracts/src/browser-shell-plugin-v1.ts"); }
catch (error) { if (error.code !== "ERR_MODULE_NOT_FOUND") throw error; }

const descriptor = () => ({
  schemaVersion: "pansphaira.browser-plugin/v1",
  id: "pan.setup", version: "1.0.0", shellVersion: "1.0.0", enabled: true,
  trustBoundary: "TRUSTED_IN_PROCESS_CODE_OWNED_FACTORIES",
  contributions: [
    { id: "pan.setup.nav", kind: "NAVIGATION", slot: "shell.navigation", factoryId: "setup.navigation", routeId: "pan.setup.route", path: null, label: "Einrichtung" },
    { id: "pan.setup.route", kind: "ROUTE", slot: "shell.routes", factoryId: null, routeId: "pan.setup.route", path: "/workspace/setup", label: "Einrichtung" },
    { id: "pan.setup.view", kind: "VIEW", slot: "shell.main", factoryId: "setup.view", routeId: "pan.setup.route", path: null, label: "Einrichtungsarbeitsplatz" },
  ],
  needs: { data: ["setup.workbench.read"], context: ["tenantId", "sessionId"], rights: ["setup.read"], dependencies: [] },
});
const factories = new Set(["setup.navigation", "setup.view"]);

test("PUI-01-AC01 closed typed browser descriptor validates code-owned contributions without granting backend rights", () => {
  assert.equal(typeof contract?.validateBrowserShellPluginV1, "function", "PAN541_CLOSED_RUNTIME_DESCRIPTOR_VALIDATOR_NOT_IMPLEMENTED");
  const result = contract.validateBrowserShellPluginV1(descriptor(), factories);
  assert.equal(result.outcome, "DESCRIPTOR_VALID");
  assert.deepEqual(result.grantedRights, []);
  assert.equal(result.descriptor.contributions.length, 3);
  assert.ok(Object.isFrozen(result.descriptor));
  assert.ok(Object.isFrozen(result.descriptor.contributions));
});

test("PUI-01-AC01 descriptor denies reserved/duplicate IDs, foreign code and incompatible bindings without executing accessors", () => {
  const cases = [
    d => { d.id = "shell"; for (const c of d.contributions) { c.id = c.id.replace("pan.setup.", "shell."); c.routeId = c.routeId?.replace("pan.setup.", "shell.") ?? null; } },
    d => { d.contributions.push(structuredClone(d.contributions[0])); },
    d => { d.contributions[0].factoryId = "unknown.factory"; },
    d => { d.script = "https://untrusted.example.invalid/code.js"; },
    d => { d.contributions[2].factoryId = "https://untrusted.example.invalid/code.js"; },
    d => { d.shellVersion = "2.0.0"; },
    d => { d.schemaVersion = "unknown"; },
    d => { d.contributions[1].path = "https://untrusted.example.invalid/route"; },
    d => { d.contributions[2].slot = "shell.navigation"; },
    d => { d.contributions[0].routeId = "missing.route"; },
    d => { d.needs.context.push("callerAuthority"); },
    d => { d.needs.rights.push("setup.read"); },
    d => { Object.setPrototypeOf(d, { callerAuthority: true }); },
    d => { d[Symbol("invisibleExtension")] = true; },
  ];
  for (const mutate of cases) {
    const d = descriptor(); mutate(d);
    assert.equal(contract.validateBrowserShellPluginV1(d, factories).outcome, "DENIED");
  }
  let reads = 0;
  const d = descriptor();
  Object.defineProperty(d, "id", { enumerable: true, get() { reads++; return "pan.setup"; } });
  assert.equal(contract.validateBrowserShellPluginV1(d, factories).outcome, "DENIED");
  assert.equal(reads, 0);
  const disabled = descriptor(); disabled.enabled = false;
  const result = contract.validateBrowserShellPluginV1(disabled, factories);
  assert.equal(result.outcome, "DESCRIPTOR_VALID");
  assert.equal(result.descriptor.enabled, false);
  assert.deepEqual(result.grantedRights, []);
});
