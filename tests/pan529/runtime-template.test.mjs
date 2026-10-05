import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createResourceBudgetStoreV1 } from "../../demo/runtime/atomic-resource-budget.mjs";

// Shape/example inputs, not new portable-runtime image qualification.
export const identityExample = () => ({
  schemaVersion: "pansphaira.portable-runtime/identity/v1", componentId: "pansphaira-local-demo",
  sourceCommit: "0402460150ab461978a8ab960cc9958914cb2a49", sourceTree: "a7e29155f80ef1fdb1b64a4e16a21f9e437e4b45",
  imageDigest: "sha256:" + "a".repeat(64), architecture: "x86_64", productVersion: "0.2.0-poc.20260810.5",
  runtime: { name: "node", version: process.versions.node }, contractVersion: "1.0.0",
  instanceId: "pan529-contract-example", tenantId: "synthetic-zoo", generation: 1, authorityProfile: "SAFE_GUIDED",
  effectiveRights: ["demo.status.read", "demo.provider.bound.read"], configurationDigest: "b".repeat(64),
  templateDigest: "c".repeat(64), policyDigest: "d".repeat(64), networkDigest: "e".repeat(64),
});

test("PAN529 shared closed template yields a readable effect-free plan bound to the unchanged RuntimeIdentity", async () => {
  assert.ok(existsSync(new URL("../../src/pan529/runtime-template-contract.mjs", import.meta.url)), "Closed server-owned H05 template/plan contract must exist before activation wiring");
  const { bindRuntimeTemplateV1, planRuntimeTemplateV1 } = await import("../../src/pan529/runtime-template-contract.mjs");
  const identity = identityExample();
  const template = bindRuntimeTemplateV1(identity);
  assert.equal(template.identity.componentId, "pansphaira-local-demo");
  assert.deepEqual(template.identity.effectiveRights, identity.effectiveRights);
  assert.equal(template.providerMode, "SYNTHETIC_ONLY");
  assert.equal(template.resourceClass.name, "bounded-native-read-v1");
  const command = { schemaVersion: "pansphaira.portable-runtime/template-plan-request/v1", operationId: "operation:plan-001", componentId: identity.componentId, templateId: template.templateId, identityDigest: template.identityDigest, runtimeTemplateDigest: template.runtimeTemplateDigest };
  const root = mkdtempSync(join(tmpdir(), "pan529-effect-free-plan-"));
  const store = createResourceBudgetStoreV1({ optIn: true, stateRoot: root, tenantId: "tenant:synthetic-zoo", bindingDigest: template.runtimeTemplateDigest, limits: { modelUnits: 10, runtimeUnits: 10 } });
  const sql = () => {
    const db = new DatabaseSync(join(root, "resource-budget.sqlite"), { readOnly: true });
    try { return JSON.stringify(db.prepare("SELECT * FROM reservations ORDER BY operation_id").all()); }
    finally { db.close(); }
  };
  try {
    const before = sql();
    const plan = planRuntimeTemplateV1(command, identity, null);
    assert.equal(plan.activationAuthorized, false);
    assert.equal(plan.planOnly, true);
    assert.equal(plan.diff.from, null);
    assert.equal(plan.diff.to, template.runtimeTemplateDigest);
    assert.match(plan.humanReadableDiff, /pansphaira-local-demo/);
    assert.match(plan.humanReadableDiff, /demo.status.read/);
    assert.match(plan.humanReadableDiff, /SYNTHETIC_ONLY/);
    assert.equal(sql(), before, "Planning must not write native reservation/activation state");
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});
