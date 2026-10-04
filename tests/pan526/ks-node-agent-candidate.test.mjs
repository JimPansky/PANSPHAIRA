import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

// Synthetic identity-shape regression only; runtime/product version values
// were separately observed by KS. This test does not start a native container.
const agentIdentity = () => ({
  schemaVersion: "pansphaira.portable-runtime/identity/v1",
  componentId: "kaleidosphere-bi-agent",
  sourceCommit: "dfc7f2ae2399109b90fe8a101f2d4eed465a7cef",
  sourceTree: "1".repeat(40),
  imageDigest: "sha256:" + "2".repeat(64),
  architecture: "x86_64",
  productVersion: "0.18.1",
  runtime: { name: "node", version: "24.14.0" },
  contractVersion: "1.0.0",
  instanceId: "ks-agent-shape-regression",
  tenantId: "synthetic-contract-tenant",
  generation: 1,
  configurationDigest: "3".repeat(64),
  templateDigest: "4".repeat(64),
  policyDigest: "5".repeat(64),
  networkDigest: "6".repeat(64),
  authorityProfile: "SAFE_GUIDED",
  effectiveRights: ["bi.catalog.read"],
});

function candidateValidator() {
  const schema = JSON.parse(readFileSync(new URL(
    "../../contracts/runtime-portability/candidates/runtime-identity-development-v2.schema.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(schema.$defs).sort(), ["Commit", "Digest", "RuntimeIdentity", "ScopeId", "Version"],
    "successor remains Identity-only, not a Readiness/Lifecycle contract");
  return new Ajv2020({ strict: true, coerceTypes: false, removeAdditional: false, useDefaults: false }).compile(schema);
}

test("partial candidate binds the KS BI agent to Node, not the distinct Superset component", () => {
  const validate = candidateValidator();
  const agent = agentIdentity();
  assert.equal(validate(agent), true, "KS Node24.14.0/product0.18.1 agent must satisfy the identity shape");
  const wrongRuntime = agentIdentity();
  wrongRuntime.runtime = { name: "superset", version: "6.1.0" };
  assert.equal(validate(wrongRuntime), false, "Superset6.1.0 must not be accepted as the Node BI agent");
  const wrongComponent = agentIdentity(); wrongComponent.componentId = "kaleidosphere-superset";
  assert.equal(validate(wrongComponent), false, "this partial contract does not introduce a Superset identity component");
  const wrongRights = agentIdentity(); wrongRights.effectiveRights = ["demo.governed.effect"];
  assert.equal(validate(wrongRights), false, "Node runtime does not cross the existing component-rights boundary");
});
