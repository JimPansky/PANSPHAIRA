import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import {
  VERIFICATION_ATTESTATION_SCHEMA_V2,
  buildVerificationImpactPlanFailClosedV2,
  buildVerificationImpactPlanV2,
  runVerificationShadowComparatorV2,
  validateVerificationDagV2,
  verificationAttestationDigestV2,
  verificationDagDigestV2,
  verificationNodeDigestV2,
  verifyPrototypeAttestationV2,
  type VerificationAttestationV2,
  type VerificationDagInputV2,
  type VerificationDagNodeV2,
  type VerificationDagV2,
} from "../packages/contracts/src/index.js";

const BASE = "1".repeat(40);
const HEAD = "2".repeat(40);
const DIGEST = "a".repeat(64);

function graph(): VerificationDagV2 {
  return JSON.parse(readFileSync("verification/verification-dag-v2.json", "utf8")) as VerificationDagV2;
}

function observed(input = graph()): Record<string, string> {
  return Object.fromEntries(input.nodes.flatMap((node) => node.inputs.map(({ path, sha256 }) => [path, sha256])));
}

function plan(changedPaths: readonly string[], input = graph()) {
  return buildVerificationImpactPlanV2({
    graph: input,
    graphPath: "verification/verification-dag-v2.json",
    baseSha: BASE,
    headSha: HEAD,
    changedPaths,
    observedInputDigests: observed(input),
  });
}

test("VF-002 freezes a closed versioned Evidence DAG schema and canonical manifest", () => {
  const schema = JSON.parse(readFileSync("schemas/contracts/verification-evidence-dag-v2.schema.json", "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  assert.equal(validate(graph()), true, JSON.stringify(validate.errors));
  assert.equal(validateVerificationDagV2(graph()), true);
  assert.match(verificationDagDigestV2(graph()), /^[a-f0-9]{64}$/);
});

test("canonical Evidence DAG input digests match the current repository bytes", () => {
  for (const node of graph().nodes) {
    for (const input of node.inputs) {
      const actual = createHash("sha256").update(readFileSync(input.path)).digest("hex");
      assert.equal(actual, input.sha256, `${node.id}:${input.path}`);
    }
  }
});

test("PAN463 native adapter and reused journal inputs select actual process/transaction checks without removing hard gates", () => {
  const node = graph().nodes.find(({ id }) => id === "pan463-native-update-v1");
  assert.ok(node);
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
  assert.equal(pkg.scripts["pan463:test"], "node --test tests/pan463/native-update-executor.test.mjs");
  assert.ok(pkg.scripts.posttest?.includes("&& npm run pan463:test && npm run pan464:test"));
  for (const changed of ["src/pan463/native-update-executor.mjs", "demo/runtime/enforcement-gate.mjs", "demo/runtime/local-journal-owner.mjs", "schemas/contracts/update-operation-contract-v1.schema.json"]) {
    assert.ok(node.inputs.some((input) => input.path === changed));
    const impact = plan([changed]);
    assert.ok(impact.selectedTests.includes("npm run pan463:test"));
    assert.ok(impact.selectedTests.includes("npm run pan453:test"));
    assert.deepEqual(impact.hardGates, [...graph().hardGates].sort((a, b) => a.localeCompare(b, "en")));
  }
});

test("PAN464 retains native ownership and its mandatory separate exact-head Docker gate without weakening hard gates", () => {
  const node = graph().nodes.find(({ id }) => id === "pan464-retained-pair-v1");
  assert.ok(node);
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
  assert.equal(pkg.scripts["pan464:test"], "node --test tests/pan464/protected-oracle.test.mjs tests/pan464/retained-snapshot.test.mjs tests/pan464/retained-pair-plan.test.mjs");
  assert.equal(pkg.scripts["pan464:native"], "node --test --test-concurrency=1 tests/pan464/native-controller.test.mjs");
  assert.ok(pkg.scripts.posttest?.endsWith("&& npm run pan463:test && npm run pan464:test && npm run pan465:test && npm run pan466:test && npm run pan472:test && npm run pan473:test && npm run pan467:test && npm run pan456:test && npm run pan454:test && npm run pan396:test && npm run pan515:test && npm run pan360:test && npm run pan378:test && npm run erv-workflow:test"));
  for (const changed of ["src/pan464/retained-pair-controller.mjs", "src/pan464/native-consumer.py", "src/pan464/protected-oracle.mjs", "tests/pan464/native-controller.test.mjs", ".github/workflows/retained-native-pair.yml", "demo/runtime/local-journal-owner.mjs"]) {
    assert.ok(node.inputs.some((input) => input.path === changed));
    const impact = plan([changed]);
    assert.ok(impact.selectedTests.includes("npm run pan464:test"));
    assert.deepEqual(impact.hardGates, [...graph().hardGates].sort((a, b) => a.localeCompare(b, "en")));
  }
  const workflow = readFileSync(".github/workflows/retained-native-pair.yml", "utf8");
  for (const required of ["pull_request:", "branches: [main]", "persist-credentials: false", "scripts/run-pan464-native-qualification.mjs", "EXPECTED_PAN_HEAD: ${{ github.event.pull_request.head.sha || github.sha }}", "if-no-files-found: error", "QUALIFICATION_UID", "--network none"]) assert.ok(workflow.includes(required), required);
  assert.ok(!workflow.includes("continue-on-error"));
  assert.ok(!workflow.includes("paths-ignore"));
  const runner = readFileSync("scripts/run-pan464-native-qualification.mjs", "utf8");
  assert.ok(runner.includes("--test-reporter=tap"));
  assert.ok(runner.includes("skipped!==0"));
  assert.ok(runner.includes("sanitizeArtifactText"));
});

test("LIFE-06 adds only a bounded owner and separately required native module-use gate", () => {
  const manifest = graph();
  const nodes = manifest.nodes.filter(({ id }) => id === "pan466-qualified-module-generations-v1");
  assert.equal(manifest.graphVersion, 82);
  assert.equal(nodes.length, 1);
  const node = nodes[0]!;
  assert.deepEqual(node.dependsOn, ["pan468-impact-selection-v1", "pan464-retained-pair-v1"]);
  assert.deepEqual(node.ownedTests, ["npm run pan466:test"]);
  const expected = new Map<string, string>([
    ["docs/architecture/pan466-qualified-module-generations-v1.md", "DERIVED_EVIDENCE"],
    ...["module-lifecycle-descriptor", "module-lifecycle-check", "qualified-retained-module"].map(name => [`src/pan466/${name}.mjs`, "SOURCE"] as [string,string]),
    ["scripts/run-pan466-native-qualification.mjs", "VALIDATOR"],
    ...["module-lifecycle-descriptor.test", "module-lifecycle-check.test", "qualified-module-binding.test", "qualified-module-native.test", "qualified-module-process"].map(name => [`tests/pan466/${name}.mjs`, "VALIDATOR"] as [string,string]),
  ]);
  assert.equal(node.inputs.length, expected.size);
  for (const [path, role] of expected) {
    assert.deepEqual(manifest.nodes.filter(owner => owner.inputs.some(input => input.path === path)).map(({ id }) => id), [node.id], path);
    assert.equal(node.inputs.find(input => input.path === path)?.role, role, path);
    const selected = plan([path]);
    assert.equal(selected.mode, "IMPACTED_SHADOW");
    assert.ok(selected.selectedNodes.includes(node.id));
    assert.ok(selected.selectedTests.includes("npm run pan466:test"));
    assert.deepEqual(selected.hardGates, [...manifest.hardGates].sort((a,b) => a.localeCompare(b,"en")));
  }
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string,string> };
  assert.equal(pkg.scripts["pan466:native"], "node scripts/run-pan466-native-qualification.mjs");
  const workflow = readFileSync(".github/workflows/retained-native-pair.yml", "utf8");
  for (const field of ["pan466-native:", "npm run pan466:native -- --output", "PAN466_SOURCE_ROOT:", "PAN466_KS_ROOT:", "PAN466_OWNED_ROOT:", "pan466-native-${{ github.event.pull_request.head.sha || github.sha }}"]) assert.ok(workflow.includes(field), field);
  const runner = readFileSync("scripts/run-pan466-native-qualification.mjs", "utf8");
  for (const field of ["skipped!==0", "tests!==6", "verifyForwardCheckout", "sanitizeArtifactText", "historyActualReadback!==true"]) assert.ok(runner.includes(field), field);
});

test("REL-TRUTH release authority is canonically owned by repository integrity", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  const node = graph().nodes.find(({ id }) => id === "repository-integrity");
  assert.ok(node);
  assert.equal(
    packageJson.scripts["release-governance:test"],
    "node --test tests/release-governance.test.mjs tests/public-product-spelling.test.mjs",
  );
  assert.equal(
    node.ownedTests.filter((command) => command === "npm run release-governance:test").length,
    1,
  );

  const ownedInputs = new Map(node.inputs.map(({ path, role }) => [path, role]));
  const expectedInputs = new Map([
    [".github/workflows/release-public-readback.yml", "SECURITY"],
    ["CONTRIBUTING.md", "DERIVED_EVIDENCE"],
    ["README.md", "DERIVED_EVIDENCE"],
    ["docs/README.md", "DERIVED_EVIDENCE"],
    ["docs/QUICKSTART.md", "DERIVED_EVIDENCE"],
    ["docs/RELEASE-GOVERNANCE.md", "DERIVED_EVIDENCE"],
    ["docs/index.md", "DERIVED_EVIDENCE"],
    ["release/governance.json", "CONTRACT"],
    ["scripts/verify-release-governance.mjs", "SECURITY"],
    ["tests/public-product-spelling.test.mjs", "VALIDATOR"],
    ["tests/release-governance.test.mjs", "VALIDATOR"],
  ]);
  for (const [path, role] of expectedInputs) {
    assert.equal(ownedInputs.get(path), role, `${path} ownership`);
    const result = plan([path]);
    assert.ok(result.selectedNodes.includes("repository-integrity"), path);
    assert.ok(result.selectedTests.includes("npm run release-governance:test"), path);
  }
  for (const invariant of [
    "Exactly one versioned release class owns GitHub Latest without inflating source/evidence-only records into runnable artifacts.",
    "Every new release body binds exact merge SHA, scope, claim-proof ownership, tests, class-specific assets and nonclaims.",
    "Anonymous post-creation public readback succeeds before issue or Queue terminalization; the workflow has no external-write authority.",
    "Release identity drift, proof-class inflation, missing exact-head paths, circular provenance and stale public status fail closed.",
  ]) assert.ok(node.invariants.includes(invariant), invariant);
});

test("#377 current-head Docker E2E is a focused repository-integrity obligation", () => {
  const manifest = graph();
  const node = manifest.nodes.find(({ id }) => id === "repository-integrity");
  assert.ok(node);
  assert.equal(manifest.graphVersion, 82);
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  const command = "node --test tests/demo-current-head-e2e*.test.mjs";
  assert.equal(packageJson.scripts["demo-current-head-e2e:test"], command);
  assert.equal(node.ownedTests.filter((candidate) => candidate === command).length, 1);
  const expectedInputs = new Map([
    [".github/workflows/demo-current-head-e2e.yml", "SECURITY"],
    ["demo/install.sh", "SECURITY"],
    ["demo/manifests/supply-chain/artifact-lock-v1.json", "CONTRACT"],
    ["demo/uninstall.sh", "SECURITY"],
    ["docs/DEMO-CURRENT-HEAD-E2E.md", "DERIVED_EVIDENCE"],
    ["scripts/demo-current-head-e2e.mjs", "SECURITY"],
    ["tests/demo-current-head-e2e.test.mjs", "VALIDATOR"],
    ["verification/demo-current-head-e2e/contract-v1.json", "CONTRACT"],
  ]);
  const actualInputs = new Map(node.inputs.map(({ path, role }) => [path, role]));
  for (const [path, role] of expectedInputs) {
    assert.equal(actualInputs.get(path), role, path);
    const result = plan([path]);
    assert.ok(result.selectedNodes.includes("repository-integrity"), path);
    assert.ok(result.selectedTests.includes(command), path);
  }
  for (const required of [
    "A successful retained receipt binds exact commit/tree, image and Compose locks, fixtures, health, governed effect, authoritative readback, cleanup and zero owned residue.",
    "Final completion requires public CLOSED issue and authoritative unowned DONE Queue readback without granting credentials, productive effects or Authority mutation.",
  ]) assert.ok(node.invariants.includes(required), required);
});

test("PAN-EVO-03 registers one finite repository-only evidence owner without isolation promotion", () => {
  const manifest=graph();
  const nodes=manifest.nodes.filter(({id})=>id==="pan454-journey-mediation-evidence-v1");
  assert.equal(nodes.length,1);
  const node=nodes[0]!;
  assert.equal(manifest.graphVersion,82);
  assert.equal(node.globalInvalidation,false);
  assert.deepEqual(node.dependsOn,["pan442-bound-task-handles-v1"]);
  assert.deepEqual(node.ownedTests,["npm run pan454:test"]);
  const expected=new Map<string,string>([
    ["docs/architecture/pan454-journey-mediation-evidence-v1.md","DERIVED_EVIDENCE"],
    ["scripts/run-pan454-journey-evidence.mjs","SOURCE"],
    ["src/pan454/journey-canary.mjs","FIXTURE"],
    ["src/pan454/journey-profile.mjs","CONTRACT"],
    ["tests/pan454/journey-mediation-evidence.test.mjs","VALIDATOR"],
  ]);
  assert.deepEqual(new Map(node.inputs.map(({path,role})=>[path,role])),expected);
  const publicPaths=new Set(readFileSync("release/public-files.manifest","utf8").split("\n").filter(line=>line&&!line.startsWith("#")).map(line=>line.split("\t")[0]));
  for(const [path] of expected){
    assert.equal(publicPaths.has(path),false,"preserve SOURCE_EVIDENCE_ONLY archive classification");
    assert.deepEqual(manifest.nodes.filter(owner=>owner.inputs.some(input=>input.path===path)).map(({id})=>id),[node.id]);
    const selected=plan([path]);
    assert.deepEqual(selected.selectedNodes,[node.id]);
    assert.deepEqual(selected.selectedTests,["npm run pan454:test"]);
    assert.deepEqual(selected.hardGates,[...manifest.hardGates].sort((a,b)=>a.localeCompare(b,"en")));
  }
  const reused=plan(["src/pan442/bound-task-handle.mjs"]);
  assert.ok(reused.selectedNodes.includes(node.id));
  assert.ok(reused.selectedTests.includes("npm run pan454:test"));
  const pkg=JSON.parse(readFileSync("package.json","utf8")) as {scripts:Record<string,string>};
  assert.equal(pkg.scripts["pan454:test"],"TMPDIR=\"${TMPDIR:-${RUNNER_TEMP:?PAN454_OWNED_SCRATCH_REQUIRED}}\" node --test tests/pan454/journey-mediation-evidence.test.mjs");
  assert.equal(pkg.scripts["pan454:entry"],"TMPDIR=\"${TMPDIR:-${RUNNER_TEMP:?PAN454_OWNED_SCRATCH_REQUIRED}}\" node scripts/run-pan454-journey-evidence.mjs");
  assert.ok(pkg.scripts.posttest?.endsWith("&& npm run pan456:test && npm run pan454:test && npm run pan396:test && npm run pan515:test && npm run pan360:test && npm run pan378:test && npm run erv-workflow:test"));
  assert.match(readFileSync(".github/workflows/ci.yml","utf8"),/docker pull --platform linux\/amd64 node@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03/);
});

test("PAN-EVO-05 registers exactly one bounded executable tooling owner without runtime activation", () => {
  const manifest=graph();
  const nodes=manifest.nodes.filter(({id})=>id==="pan456-policy-backend-evaluation-v1");
  assert.equal(nodes.length,1);
  const node=nodes[0]!;
  assert.equal(manifest.graphVersion,82);
  assert.equal(node.globalInvalidation,false);
  assert.deepEqual(node.dependsOn,[]);
  assert.deepEqual(node.ownedTests,["npm run pan456:test"]);
  const expected=new Map<string,string>([
    ["docs/architecture/pan456-policy-backend-evaluation-v1.md","DERIVED_EVIDENCE"],
    ["scripts/run-pan456-policy-evaluation.mjs","SOURCE"],
    ["src/pan456/isolated-policy-backend.mjs","SOURCE"],
    ["src/pan456/jsonlogic-policy-worker.mjs","SOURCE"],
    ["src/pan456/policy-backend-profile.mjs","CONTRACT"],
    ["tests/fixtures/pan456/isolated-installation-probe.mjs","FIXTURE"],
    ["tests/pan456/policy-backend-evaluation.test.mjs","VALIDATOR"],
  ]);
  assert.deepEqual(new Map(node.inputs.map(({path,role})=>[path,role])),expected);
  for(const [path] of expected){
    assert.deepEqual(manifest.nodes.filter(owner=>owner.inputs.some(input=>input.path===path)).map(({id})=>id),[node.id]);
    const selected=plan([path]);
    assert.deepEqual(selected.selectedNodes,[node.id]);
    assert.deepEqual(selected.selectedTests,["npm run pan456:test"]);
    assert.deepEqual(selected.hardGates,[...manifest.hardGates].sort((a,b)=>a.localeCompare(b,"en")));
  }
  const pkg=JSON.parse(readFileSync("package.json","utf8")) as {scripts:Record<string,string>,devDependencies:Record<string,string>};
  assert.equal(pkg.scripts["pan456:test"],"TMPDIR=\"${TMPDIR:-${RUNNER_TEMP:?PAN456_OWNED_SCRATCH_REQUIRED}}\" node --test tests/pan456/policy-backend-evaluation.test.mjs");
  assert.equal(pkg.scripts["pan456:entry"],"TMPDIR=\"${TMPDIR:-${RUNNER_TEMP:?PAN456_OWNED_SCRATCH_REQUIRED}}\" node scripts/run-pan456-policy-evaluation.mjs");
  assert.ok(pkg.scripts.posttest?.split(" && ").includes("npm run pan456:test"));
  assert.equal(pkg.devDependencies["json-logic-js"],"2.0.5");
});

test("LIFE-07 registers one bounded attributed correction owner and both actual native suites", () => {
  const manifest = graph();
  const nodes = manifest.nodes.filter(({ id }) => id === "pan467-attributed-business-correction-v1");
  assert.equal(nodes.length, 1);
  const node = nodes[0]!;
  assert.equal(manifest.graphVersion, 82);
  assert.equal(node.globalInvalidation, false);
  assert.deepEqual(node.dependsOn, ["pan473-writer-scope-cutover-v1", "pan462-native-backup-restore-v1"]);
  assert.deepEqual(node.ownedTests, ["npm run pan467:test"]);
  const expected = new Map<string,string>([
    ["docs/architecture/pan467-attributed-business-correction-v1.md", "DERIVED_EVIDENCE"],
    ["scripts/run-pan467-business-correction.mjs", "SOURCE"],
    ["src/pan467/business-correction-profile.mjs", "CONTRACT"],
    ["src/pan467/business-correction.mjs", "SOURCE"],
    ["src/pan467/independent-business-diagnosis.mjs", "VALIDATOR"],
    ["tests/fixtures/pan467/native-business-fixture.mjs", "FIXTURE"],
    ["tests/pan467/business-correction.test.mjs", "VALIDATOR"],
    ["tests/pan467/native-process-correction.test.mjs", "VALIDATOR"],
  ]);
  assert.deepEqual(new Map(node.inputs.map(({path,role})=>[path,role])), expected);
  for (const [path] of expected) {
    assert.deepEqual(manifest.nodes.filter(owner=>owner.inputs.some(input=>input.path===path)).map(({id})=>id), [node.id]);
    const selected = plan([path]);
    assert.deepEqual(selected.selectedNodes, [node.id]);
    assert.deepEqual(selected.selectedTests, ["npm run pan467:test"]);
    assert.deepEqual(selected.hardGates, [...manifest.hardGates].sort((a,b)=>a.localeCompare(b,"en")));
  }
  const pkg=JSON.parse(readFileSync("package.json","utf8")) as {scripts:Record<string,string>};
  assert.equal(pkg.scripts["pan467:test"], "node --test tests/pan467/business-correction.test.mjs tests/pan467/native-process-correction.test.mjs");
  assert.ok(pkg.scripts.posttest?.split(" && ").includes("npm run pan467:test"));
});

test("MIG-03 registers the original scope, mandatory native process tests and unchanged dependency boundaries", () => {
  const manifest = graph();
  const nodes = manifest.nodes.filter(({ id }) => id === "pan473-writer-scope-cutover-v1");
  assert.equal(nodes.length, 1);
  const node = nodes[0]!;
  assert.equal(manifest.graphVersion, 82);
  assert.equal(node.globalInvalidation, false);
  assert.deepEqual(node.dependsOn, ["pan472-persistent-draft-transfer-v1", "pan462-native-backup-restore-v1"]);
  assert.deepEqual(node.ownedTests, ["npm run pan473:test"]);
  const inputs = new Map(node.inputs.map(({ path, role }) => [path, role]));
  assert.deepEqual(inputs, new Map([
    ["docs/architecture/pan473-writer-scope-cutover-v1.md", "DERIVED_EVIDENCE"],
    ["scripts/run-pan473-writer-scope-cutover.mjs", "SOURCE"],
    ["src/pan473/independent-scope-diagnosis.mjs", "VALIDATOR"],
    ["src/pan473/scope-profile.mjs", "CONTRACT"],
    ["src/pan473/writer-scope-cutover.mjs", "SOURCE"],
    ["tests/fixtures/pan473/native-scope-client.mjs", "FIXTURE"],
    ["tests/pan473/native-process-cutover.test.mjs", "VALIDATOR"],
    ["tests/pan473/writer-scope-cutover.test.mjs", "VALIDATOR"],
  ]));
  for (const [path] of inputs) {
    assert.deepEqual(manifest.nodes.filter(owner => owner.inputs.some(input => input.path === path)).map(({ id }) => id), [node.id]);
    const selected = plan([path]);
    assert.deepEqual(selected.selectedNodes, ["pan467-attributed-business-correction-v1", node.id, "pan515-native-trade-state-v1", "pan516-native-procurement-v1", "pan517-native-fulfilment-v1", "pan520-native-projections-v1"]);
    assert.deepEqual(selected.selectedTests, ["npm run pan467:test", "npm run pan473:test", "npm run pan515:test", "npm run pan516:test", "npm run pan517:test", "npm run pan520:test"]);
    assert.deepEqual(selected.hardGates, [...manifest.hardGates].sort((a,b) => a.localeCompare(b,"en")));
  }
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string,string> };
  assert.equal(pkg.scripts["pan473:test"], "node --test tests/pan473/writer-scope-cutover.test.mjs tests/pan473/native-process-cutover.test.mjs");
  assert.ok(pkg.scripts.posttest?.split(" && ").includes("npm run pan473:test"));
});

test("MIG-02 registers only the bounded persistent native entry and preserves mandatory gates", () => {
  const manifest = graph();
  const nodes = manifest.nodes.filter(({ id }) => id === "pan472-persistent-draft-transfer-v1");
  assert.equal(nodes.length, 1);
  const node = nodes[0]!;
  assert.equal(manifest.graphVersion, 82);
  assert.equal(node.globalInvalidation, false);
  assert.deepEqual(node.dependsOn, ["pan442-bound-task-handles-v1", "pan471-capability-inventory-v1"]);
  assert.deepEqual(node.ownedTests, ["npm run pan472:test"]);
  const inputs = new Map(node.inputs.map(({ path, role }) => [path, role]));
  assert.deepEqual(inputs, new Map([
    ["docs/architecture/pan472-persistent-draft-transfer-v1.md", "DERIVED_EVIDENCE"],
    ["scripts/run-pan472-draft-transfer.mjs", "SOURCE"],
    ["src/pan472/draft-profile.mjs", "CONTRACT"],
    ["src/pan472/independent-draft-reconciliation.mjs", "VALIDATOR"],
    ["src/pan472/persistent-draft-transfer.mjs", "SOURCE"],
    ["tests/fixtures/pan472/initial-draft-v1.json", "FIXTURE"],
    ["tests/pan472/persistent-draft-transfer.test.mjs", "VALIDATOR"],
  ]));
  for (const [path] of inputs) {
    assert.deepEqual(manifest.nodes.filter(owner => owner.inputs.some(input => input.path === path)).map(({ id }) => id), [node.id]);
    const selected = plan([path]);
    assert.deepEqual(selected.selectedNodes, ["pan467-attributed-business-correction-v1", node.id, "pan473-writer-scope-cutover-v1", "pan515-native-trade-state-v1", "pan516-native-procurement-v1", "pan517-native-fulfilment-v1", "pan520-native-projections-v1"]);
    assert.deepEqual(selected.selectedTests, ["npm run pan467:test", "npm run pan472:test", "npm run pan473:test", "npm run pan515:test", "npm run pan516:test", "npm run pan517:test", "npm run pan520:test"]);
    assert.deepEqual(selected.hardGates, [...manifest.hardGates].sort((a,b) => a.localeCompare(b,"en")));
  }
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string,string> };
  assert.equal(pkg.scripts["pan472:test"], "node --test tests/pan472/persistent-draft-transfer.test.mjs");
  assert.ok(pkg.scripts.posttest?.split(" && ").includes("npm run pan472:test"));
});

test("SEM-HOLDOUT-01 registers only the explicit semantic successor without implying blind acceptance", () => {
  const manifest = graph();
  const nodes = manifest.nodes.filter(({ id }) => id === "pan487-product-purpose-semantic-successor-v1");
  assert.equal(nodes.length, 1);
  const node = nodes[0]!;
  assert.equal(manifest.graphVersion, 82);
  assert.deepEqual(node.dependsOn, ["cscl-11-idempiere-serial-holdout-gate-v1"]);
  assert.deepEqual(node.ownedTests, ["npm run pan487:test"]);
  assert.equal(node.globalInvalidation, false);
  const inputs = new Map(node.inputs.map(({ path, role }) => [path, role]));
  const expected = new Map([
    ["contracts/sem-holdout487/request-v1.schema.json", "SCHEMA"],
    ["contracts/sem-holdout487/result-v1.schema.json", "SCHEMA"],
    ["contracts/sem-holdout487/decision-rule-v1.json", "CONTRACT"],
    ["src/cscl-11/product-purpose-semantic-v1.mjs", "SOURCE"],
    ["scripts/evaluate-product-purpose-semantic-v1.mjs", "SOURCE"],
    ["tests/cscl-11/product-purpose-semantic-v1.test.mjs", "VALIDATOR"],
    ["tests/fixtures/sem-holdout487/public-calibration.input.json", "FIXTURE"],
    ["tests/fixtures/sem-holdout487/public-calibration.expected.json", "FIXTURE"],
    ["docs/architecture/pan487-product-purpose-semantic-successor-v1.md", "DERIVED_EVIDENCE"],
  ]);
  assert.deepEqual(inputs, expected);
  for (const [path] of expected) {
    const result = plan([path]);
    assert.deepEqual(result.selectedNodes, [node.id], path);
    assert.deepEqual(result.selectedTests, ["npm run pan487:test"], path);
  }
  assert.ok(node.invariants.some((text) => text.includes("Main exclusively")));
  assert.ok(node.invariants.some((text) => text.includes("not blind score")));
});

test("AWI-03 knowledge changes select the bounded critical owner and hard gates", () => {
  const result = plan(["packages/contracts/src/knowledge-envelope.ts"]);
  assert.equal(result.mode, "IMPACTED_SHADOW");
  assert.deepEqual(result.selectedNodes, ["awi-03-knowledge-envelope", "awi-plugin-01-knowledge-harvest-v1", "cks-02-local-knowledge-fabric-closure-v1", "cks-03-fresh-synthetic-qualification-v1", "cks-04-no-finetune-runtime-baseline-v1", "cks-05-comparative-falsification-v1", "cks-07-empty-kb-sufficiency-v1", "cks-08-usage-lineage-attribution-v1", "cks-09-task-pattern-proof-v1", "cks-10-readonly-analytics-bridge-v1", "cks-11-governed-workflow-function-v1", "cks-12-closed-learning-loop-v1", "cks-m1-parent-closure-v1", "cscl-01-cross-system-protocol-freeze-v1", "cscl-02-odoo-source-native-profile-v1", "cscl-03-erpnext-source-native-profile-v1", "cscl-04-dolibarr-source-native-profile-v1", "cscl-05-tryton-source-native-profile-v1", "cscl-06-ofbiz-source-native-profile-v1", "cscl-07-cross-system-semantic-matrix-v1", "cscl-08-party-candidate-v1", "cscl-09-product-candidate-v1", "cscl-10-sales-candidate-v1", "cscl-11-idempiere-serial-holdout-gate-v1", "lkc-files-01-local-file-corpus", "lkc-wiki-01-governed-local-edition-v1", "openclaw-m1-4", "openclaw-m1-5", "pan487-product-purpose-semantic-successor-v1", "repository-integrity", "rks-01-real-source-protocol-falsification-v1", "rks-02-core-small-vs-raw-falsification-v1", "secure-default-proof"]);
  assert.deepEqual(result.selectedTests, ["node --test dist/tests/canonical-json-profile-inventory.test.js", "node --test tests/demo-current-head-e2e*.test.mjs", "node --test tests/supply-chain-verifier.test.mjs", "npm run build --silent && node --test dist/tests/trust-compatibility-foundation-closure.test.js", "npm run cks02:test", "npm run cks03:test", "npm run cks04:test", "npm run cks05:test", "npm run cks07:test", "npm run cks08:test", "npm run cks09:test", "npm run cks10:test", "npm run cks11:test", "npm run cks12:test", "npm run cksm1:test", "npm run cscl01:test", "npm run cscl02:test", "npm run cscl03:test", "npm run cscl04:test", "npm run cscl05:test", "npm run cscl06:test", "npm run cscl07:test", "npm run cscl08:test", "npm run cscl09:test", "npm run cscl10:test", "npm run cscl11:test", "npm run docs:test", "npm run erv-workflow:test", "npm run fnd-ps-fu-01:test", "npm run knowledge-envelope:test", "npm run ks238:test", "npm run local-file-corpus:test", "npm run module:check", "npm run openclaw-m1.4:test", "npm run openclaw-m1.5:evidence", "npm run openclaw-m1.5:test", "npm run paired-analytics:test", "npm run pan360:test", "npm run pan378:test", "npm run pan396:test", "npm run pan433:mapping:test", "npm run pan441:test", "npm run pan442:test", "npm run pan454:test", "npm run pan456:test", "npm run pan461:test", "npm run pan462:test", "npm run pan463:test", "npm run pan464:test", "npm run pan465:test", "npm run pan466:test", "npm run pan467:test", "npm run pan468:test", "npm run pan469:test", "npm run pan470:test", "npm run pan471:test", "npm run pan472:test", "npm run pan473:test", "npm run pan487:test", "npm run pan515:test", "npm run pan516:test", "npm run pan517:test", "npm run pan520:test", "npm run pan524:test", "npm run plugin-knowledge-harvest:test", "npm run proof:secure-default", "npm run release-governance:test", "npm run rks01:test", "npm run rks02:test", "npm run wiki:test"]);
  assert.deepEqual(result.hardGates, [...graph().hardGates].sort((a, b) => a.localeCompare(b, "en")));
});

test("single-node changes select the owner, downstream integrity and mandatory hard gates", () => {
  const result = plan(["scripts/verification-plan.mjs"]);
  assert.equal(result.mode, "IMPACTED_SHADOW");
  assert.deepEqual(result.selectedNodes, ["learning-routing-foundation", "openclaw-m1-4", "openclaw-m1-5", "repository-integrity", "secure-default-proof", "vf-m2-adaptive-evidence-gates-v1", "vf-shadow-v2"]);
  assert.ok(result.selectedTests.includes("node --test dist/tests/verification-fabric-v2.test.js"));
  assert.deepEqual(result.hardGates, [...graph().hardGates].sort((a, b) => a.localeCompare(b, "en")));
});

test("contract and cross-contract changes invalidate downstream dependants", () => {
  for (const changed of [
    "packages/contracts/src/verification-fabric.ts",
    "schemas/contracts/verification-fabric-bundle-v1.schema.json",
  ]) {
    const result = plan([changed]);
    assert.equal(result.mode, "IMPACTED_SHADOW");
    assert.deepEqual(result.selectedNodes, ["awi-plugin-01-knowledge-harvest-v1", "azpp-m1-repository-synthetic-v1", "cap-cell-erp-01", "cks-02-local-knowledge-fabric-closure-v1", "cks-03-fresh-synthetic-qualification-v1", "cks-04-no-finetune-runtime-baseline-v1", "cks-05-comparative-falsification-v1", "cks-07-empty-kb-sufficiency-v1", "cks-08-usage-lineage-attribution-v1", "cks-09-task-pattern-proof-v1", "cks-10-readonly-analytics-bridge-v1", "cks-11-governed-workflow-function-v1", "cks-12-closed-learning-loop-v1", "cks-m1-parent-closure-v1", "cscl-01-cross-system-protocol-freeze-v1", "cscl-02-odoo-source-native-profile-v1", "cscl-03-erpnext-source-native-profile-v1", "cscl-04-dolibarr-source-native-profile-v1", "cscl-05-tryton-source-native-profile-v1", "cscl-06-ofbiz-source-native-profile-v1", "cscl-07-cross-system-semantic-matrix-v1", "cscl-08-party-candidate-v1", "cscl-09-product-candidate-v1", "cscl-10-sales-candidate-v1", "cscl-11-idempiere-serial-holdout-gate-v1", "etl-01-extension-assurance-profile-v1", "etl-02-external-plugin-preflight-v1", "external-bi-service-v2", "intake-001-issue-candidate-v1", "integration-profile-v1", "know-media-m1-audience-learning-v1", "learning-routing-foundation", "lkc-wiki-01-governed-local-edition-v1", "openclaw-m1-4", "openclaw-m1-5", "pan435-436-sales-stock-journey-v1", "pan441-employee-profile-v1", "pan487-product-purpose-semantic-successor-v1", "pan515-native-trade-state-v1", "pan516-native-procurement-v1", "pan517-native-fulfilment-v1", "pan520-native-projections-v1", "pan524-exact-bi-pair-v1", "repository-integrity", "rks-01-real-source-protocol-falsification-v1", "rks-02-core-small-vs-raw-falsification-v1", "secure-default-proof", "vf-contract-v1", "vf-m2-adaptive-evidence-gates-v1", "vf-shadow-v2"]);
  }
});

test("extension assurance changes select their bounded owner and repository integrity closure", () => {
  const result = plan(["packages/contracts/src/extension-assurance-profile.ts"]);
  assert.equal(result.mode, "IMPACTED_SHADOW");
  assert.deepEqual(result.selectedNodes, ["etl-01-extension-assurance-profile-v1", "openclaw-m1-4", "openclaw-m1-5", "repository-integrity", "secure-default-proof"]);
  assert.ok(result.selectedTests.includes("node --test dist/tests/extension-assurance-profile-negative-zero.test.js dist/tests/extension-assurance-profile.test.js"));
  assert.deepEqual(result.hardGates, [...graph().hardGates].sort((a, b) => a.localeCompare(b, "en")));
});

test("either non-security video surface selects one owner and both video commands", () => {
  for (const changed of ["packages/contracts/src/external-video-service.ts", "tools/video-production-reference/README.md"]) {
    const result = plan([changed]);
    assert.equal(result.mode, "IMPACTED_SHADOW");
    assert.deepEqual(result.selectedNodes, ["know-media-m1-audience-learning-v1"]);
    assert.deepEqual(result.selectedTests, ["npm run external-video-service:test", "npm run video:test"]);
  }
});

test("local video security-role changes force full fallback", () => {
  const result = plan(["tools/video-production-reference/src/safe-io.mjs"]);
  assert.equal(result.mode, "FULL_FALLBACK");
  assert.deepEqual(result.reasons, ["CENTRAL_INPUT_CHANGED"]);
  assert.equal(result.selectedNodes.length, graph().nodes.length);
});

test("learning-routing changes select the complete foundation and downstream integrity gates", () => {
  const result = plan(["packages/contracts/src/learning-routing-baseline.ts"]);
  assert.equal(result.mode, "IMPACTED_SHADOW");
  assert.deepEqual(result.selectedNodes, ["learning-routing-foundation", "openclaw-m1-4", "openclaw-m1-5", "repository-integrity", "secure-default-proof"]);
  assert.ok(result.selectedTests.includes("npm run learning-routing:test"));
});

test("integration profile changes select the bounded owner and downstream integrity gates", () => {
  const result = plan(["packages/contracts/src/integration-profile.ts"]);
  assert.equal(result.mode, "IMPACTED_SHADOW");
  assert.deepEqual(result.selectedNodes, ["cap-cell-erp-01", "integration-profile-v1", "openclaw-m1-4", "openclaw-m1-5", "pan435-436-sales-stock-journey-v1", "pan441-employee-profile-v1", "pan515-native-trade-state-v1", "pan516-native-procurement-v1", "pan517-native-fulfilment-v1", "pan520-native-projections-v1", "repository-integrity", "secure-default-proof"]);
  assert.ok(result.selectedTests.includes("npm run integration-profile:test"));
});

test("ERP capability-cell changes select the bounded owner and exact focused suite", () => {
  const result = plan(["packages/contracts/src/erp-order-capability-cell.ts"]);
  assert.equal(result.mode, "IMPACTED_SHADOW");
  assert.deepEqual(result.selectedNodes, ["cap-cell-erp-01", "pan435-436-sales-stock-journey-v1", "pan515-native-trade-state-v1", "pan516-native-procurement-v1", "pan517-native-fulfilment-v1", "pan520-native-projections-v1"]);
  assert.deepEqual(result.selectedTests, ["npm run erp-order-cell:test", "npm run pan515:test", "npm run pan516:test", "npm run pan517:test", "npm run pan520:test", "npm run sales-stock:journey", "npm run sales-stock:journey:test"]);
});

test("AP-01 blueprint changes select its owner and dependent AP-02/AP-03 slices", () => {
  for (const changed of [
    "packages/contracts/src/incoming-invoice-blueprint.ts",
    "schemas/contracts/incoming-invoice-blueprint-v1.schema.json",
    "tests/incoming-invoice-blueprint.test.ts",
  ]) {
    const result = plan([changed]);
    assert.equal(result.mode, "IMPACTED_SHADOW", changed);
    assert.deepEqual(result.selectedNodes, ["ap-01-incoming-invoice-blueprint-v1", "ap-02-incoming-invoice-intake-v1", "ap-03-incoming-invoice-extraction-benchmark-v1", "erv-workflow-native-evidence-v1", "pan360-original-erv-execution-v1", "pan396-original-s3-sqs-lab-v1"], changed);
    assert.deepEqual(result.selectedTests, ["npm run erv-workflow:test", "npm run incoming-invoice-extraction:test", "npm run incoming-invoice-intake:test", "npm run incoming-invoice:test", "npm run pan360:test", "npm run pan396:test"], changed);
  }
});

test("AP-02 intake changes select its owner and dependent AP-03 benchmark", () => {
  for (const changed of [
    "packages/contracts/src/incoming-invoice-intake.ts",
    "schemas/contracts/incoming-invoice-intake-v1.schema.json",
    "tests/fixtures/incoming-invoice/source-manifest-v1.json",
    "tests/fixtures/incoming-invoice/supplier-invoice-v1.txt",
    "tests/incoming-invoice-intake.test.ts",
  ]) {
    const result = plan([changed]);
    assert.equal(result.mode, "IMPACTED_SHADOW", changed);
    assert.deepEqual(result.selectedNodes, ["ap-02-incoming-invoice-intake-v1", "ap-03-incoming-invoice-extraction-benchmark-v1", "erv-workflow-native-evidence-v1", "pan360-original-erv-execution-v1", "pan396-original-s3-sqs-lab-v1"], changed);
    assert.deepEqual(result.selectedTests, ["npm run erv-workflow:test", "npm run incoming-invoice-extraction:test", "npm run incoming-invoice-intake:test", "npm run pan360:test", "npm run pan396:test"], changed);
  }
});

test("AP-03 extraction benchmark changes select one bounded semantic owner and focused suite", () => {
  for (const changed of [
    "packages/contracts/src/incoming-invoice-extraction-benchmark.ts",
    "schemas/contracts/incoming-invoice-extraction-benchmark-v1.schema.json",
    "tests/fixtures/incoming-invoice/ap-03-holdout-v1.json",
    "tests/incoming-invoice-extraction-benchmark.test.ts",
  ]) {
    const result = plan([changed]);
    assert.equal(result.mode, "IMPACTED_SHADOW", changed);
    assert.deepEqual(result.selectedNodes, ["ap-03-incoming-invoice-extraction-benchmark-v1"], changed);
    assert.deepEqual(result.selectedTests, ["npm run incoming-invoice-extraction:test"], changed);
  }
});

test("FND-XR-01 paired external-BI family is canonical, acceptance-mapped and pre-closure", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  const evidencePath = "verification/external-bi-service-paired-compatibility-v1.json";
  const publicManifestPaths = readFileSync("release/public-files.manifest", "utf8")
    .split("\n")
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => line.split("\t")[0]!);
  const publicPaths = new Set(publicManifestPaths);
  const externalBiNode = graph().nodes.find(({ id }) => id === "external-bi-service-v2");
  assert.ok(externalBiNode);
  assert.equal(
    packageJson.scripts["external-bi-service:test"],
    "npm run build --silent && node --test dist/tests/external-bi-service.test.js",
  );
  assert.equal(
    packageJson.scripts.pretest?.split(" && ")
      .filter((command) => command === "npm run external-bi-service:test:compiled").length,
    1,
  );

  for (const changed of [
    "packages/contracts/src/external-bi-service.ts",
    "tests/external-bi-service.test.ts",
    "tests/fixtures/external-bi-service-v2-clean-room.json",
    "scripts/verify-external-bi-service-v2-clean-room.mjs",
    "docs/EXTERNAL-BI-SERVICE.md",
    evidencePath,
  ]) {
    const result = plan([changed]);
    assert.equal(result.mode, "IMPACTED_SHADOW", changed);
    assert.ok(result.selectedNodes.includes("external-bi-service-v2"), changed);
    assert.ok(result.selectedTests.includes("npm run external-bi-service:test"), changed);
  }

  assert.deepEqual(externalBiNode.inputs.find(({ path }) => path === evidencePath)?.role, "DERIVED_EVIDENCE");
  for (const publicPath of [
    "packages/contracts/src/external-bi-service.ts",
    "tests/external-bi-service.test.ts",
    "tests/fixtures/external-bi-service-v2-clean-room.json",
    "scripts/verify-external-bi-service-v2-clean-room.mjs",
    "docs/EXTERNAL-BI-SERVICE.md",
  ]) {
    assert.equal(publicPaths.has(publicPath), true, `public external-BI byte: ${publicPath}`);
  }
  assert.equal(publicManifestPaths.length, 1790, "retain released scopes and add seven bounded PAN-EVO-05 tooling source/test/probe/guide files without runtime activation");
  assert.equal(publicPaths.size, publicManifestPaths.length, "public manifest paths remain unique");
  assert.equal(publicPaths.has(evidencePath), false, "pre-closure paired evidence remains repository-only");

  const acceptanceMarkers = new Map<string, readonly string[]>([
    ["FND-XR-01-AC01", [
      "FND-XR-01 exact #336/#141 released inputs recompute one deterministic bounded evidence record",
      "FND-XR-01 stale, substituted, paired and fully or partially re-digested inputs fail closed",
    ]],
    ["FND-XR-01-AC02", [
      "FND-XR-01 both public releases, issue closures, fixtures, contracts, capabilities and receipts are byte-bound",
    ]],
    ["FND-XR-01-AC03", [
      "FND-XR-01 missing receipt, fixture or capability and every unknown pair remain denied",
      "FND-XR-01 a fully re-digested evidence forgery cannot manufacture a compatibility claim",
    ]],
    ["FND-XR-01-AC04", [
      "FND-XR-01 both public releases, issue closures, fixtures, contracts, capabilities and receipts are byte-bound",
    ]],
  ]);
  assert.deepEqual([...acceptanceMarkers.keys()], [
    "FND-XR-01-AC01",
    "FND-XR-01-AC02",
    "FND-XR-01-AC03",
    "FND-XR-01-AC04",
  ]);
  const focusedValidator = readFileSync("tests/external-bi-service.test.ts", "utf8");
  for (const [acceptanceId, markers] of acceptanceMarkers) {
    for (const marker of markers) assert.equal(focusedValidator.includes(marker), true, `${acceptanceId}:${marker}`);
  }

  const evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as {
    repositoryBindings: Array<{
      issueClosure: { state: string; stateReason: string; deliveredHead: string };
      release: { head: string; prerelease: boolean };
      receiptBytes: Array<{ path: string }>;
    }>;
    claimBoundary: {
      testedCrossRepositoryPairCount: number;
      unknownPairsDenied: boolean;
      externalEffectPerformed: boolean;
      compatibilityClaimOnDeniedPair: boolean;
    };
    reviewPolicy: { publicClosureAndQueueDone: string };
    nonClaims: string[];
  };
  assert.equal(evidence.repositoryBindings.length, 2);
  for (const binding of evidence.repositoryBindings) {
    assert.equal(binding.issueClosure.state, "closed");
    assert.equal(binding.issueClosure.stateReason, "completed");
    assert.equal(binding.issueClosure.deliveredHead, binding.release.head);
    assert.equal(binding.release.prerelease, false);
    assert(binding.receiptBytes.every(({ path }) => path !== evidencePath), "self-referential receipt denied");
  }
  assert.deepEqual(evidence.claimBoundary, {
    ...evidence.claimBoundary,
    testedCrossRepositoryPairCount: 1,
    unknownPairsDenied: true,
    externalEffectPerformed: false,
    compatibilityClaimOnDeniedPair: false,
  });
  assert.equal(
    evidence.reviewPolicy.publicClosureAndQueueDone,
    "FINAL_SOL_OWNER_ONLY_NOT_PERFORMED_BY_LOCAL_WORKER",
  );
  assert(evidence.nonClaims.includes("NO_ISSUE_337_PUBLIC_CLOSURE_OR_QUEUE_DONE_CLAIM"));
});

test("FND-PS-02 edge-evidence focused family is canonical and selects its owner test", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  assert.equal(
    packageJson.scripts["fnd-ps-fu-01:test"],
    "npm run build --silent && node --test dist/tests/cks-12/readonly-kaleidosphere-bridge.test.js",
  );
  assert.equal(
    packageJson.scripts.pretest?.split(" && ")
      .filter((command) => command === "npm run fnd-ps-fu-01:test:compiled").length,
    1,
  );

  for (const changed of [
    "src/cks-12/readonly-kaleidosphere-bridge.ts",
    "tests/cks-12/readonly-kaleidosphere-bridge.test.ts",
    "tests/fixtures/cks-12/edge-authority-v2.json",
  ]) {
    const result = plan([changed]);
    assert.equal(result.mode, "IMPACTED_SHADOW", changed);
    assert.ok(result.selectedNodes.includes("cks-12-closed-learning-loop-v1"), changed);
    assert.ok(result.selectedTests.includes("npm run fnd-ps-fu-01:test"), changed);
  }
});

test("CSCL-11 serial holdout gate is a registered DAG node bound to the frozen reconciled pilot", () => {
  const manifest = graph();
  assert.equal(manifest.graphVersion, 82);
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  assert.equal(
    packageJson.scripts["cscl11:test"],
    "node --test tests/cscl-11/holdout-gate.test.mjs tests/cscl-11/product-purpose-semantic-v1.test.mjs",
  );
  assert.equal(
    packageJson.scripts.posttest?.split(" && ")[0],
    "npm run cscl11:test",
    "the reconciled-pilot gate heads the canonical posttest chain",
  );
  const node = manifest.nodes.find(({ id }) => id === "cscl-11-idempiere-serial-holdout-gate-v1");
  assert.ok(node, "CSCL_11_DAG_NODE_MISSING");
  assert.deepEqual(
    [...node.dependsOn],
    ["cscl-08-party-candidate-v1", "cscl-09-product-candidate-v1", "cscl-10-sales-candidate-v1"],
  );
  assert.deepEqual(node.ownedTests, ["npm run cscl11:test"]);
  assert.equal(node.riskClass, "HIGH");
  assert.equal(node.globalInvalidation, false);
  const ownedInputs = new Map(node.inputs.map(({ path, role }) => [path, role]));
  const expectedInputs = new Map<string, string>([
    ["src/cscl-11/holdout-facts.mjs", "VALIDATOR"],
    ["src/cscl-11/holdout-gate.mjs", "VALIDATOR"],
    ["tests/cscl-11/holdout-gate.test.mjs", "VALIDATOR"],
    ["scripts/capture-cscl-11-source-locators.mjs", "VALIDATOR"],
    ["verification/cscl-11-idempiere-source-capture-receipt-v1.json", "DERIVED_EVIDENCE"],
    ["verification/cscl-11-idempiere-source-locator-verification-v1.json", "DERIVED_EVIDENCE"],
    ["verification/cscl-11-idempiere-holdout-profile-v1.json", "DERIVED_EVIDENCE"],
    ["verification/cscl-11-idempiere-isolation-proof-v1.json", "DERIVED_EVIDENCE"],
    ["verification/cscl-11-idempiere-governance-gates-v1.json", "DERIVED_EVIDENCE"],
    ["verification/cscl-11-idempiere-family-results-v1.json", "DERIVED_EVIDENCE"],
    ["verification/cscl-11-idempiere-mapping-party-v1.json", "DERIVED_EVIDENCE"],
    ["verification/cscl-11-idempiere-mapping-product-v1.json", "DERIVED_EVIDENCE"],
    ["verification/cscl-11-idempiere-mapping-sales-v1.json", "DERIVED_EVIDENCE"],
    ["verification/cscl-11-idempiere-holdout-verdict-party-v1.json", "DERIVED_EVIDENCE"],
    ["verification/cscl-11-idempiere-holdout-verdict-product-v1.json", "DERIVED_EVIDENCE"],
    ["verification/cscl-11-idempiere-holdout-verdict-sales-v1.json", "DERIVED_EVIDENCE"],
    ["verification/cscl-11-idempiere-holdout-verdict-overall-v1.json", "DERIVED_EVIDENCE"],
  ]);
  assert.equal(ownedInputs.size, expectedInputs.size, "exact cscl-11 input set");
  for (const [inputPath, role] of expectedInputs) {
    assert.equal(ownedInputs.get(inputPath), role, `${inputPath} ownership`);
    const entry: VerificationDagInputV2 | undefined = node.inputs.find(({ path }) => path === inputPath);
    assert.equal(entry?.sha256, createHash("sha256").update(readFileSync(inputPath)).digest("hex"), `${inputPath} digest`);
  }
  for (const invariant of [
    "The byte-frozen CSCL-08/09/10 candidates are consumed read-only: raw candidate bytes, frozen digests and frozen slots are replayed without editing, and any drift fails CANDIDATE_BYTES_MUTATED_AFTER_FREEZE.",
    "The exact official iDempiere bytes at the pinned immutable commit 731515dcdd5278b843db33b9d3109d155b881951 are bound: 16-file capture receipt with per-file sha256/byteLength, GPL-2.0-or-later license bytes and committed locator evidence (HTTP 200 plus whole-file digest match for all 16 rawUrls); any dead, drifted or digest-mismatched locator fails the source gate closed.",
    "All 36 holdout source facts, 36 evidence cells and the complete party/product/sales denominators replay deterministically from the frozen bytes; the empty party and sales frozen cores are reported as FALSIFIED_WITH_EVIDENCE narrowing, never patched.",
    "No holdout tuning, no universal-ERP-compatibility claim and no Authority, promotion or execution grant; the overall GO / NARROW_GO / FALSIFIED_WITH_EVIDENCE verdict derives only from the frozen protocol functions and the six governance gates.",
  ]) assert.ok(node.invariants.includes(invariant), invariant);
  // Legacy ownership remains; its explicit successor is now a bounded dependant.
  for (const changed of [
    "src/cscl-11/holdout-gate.mjs",
    "verification/cscl-11-idempiere-holdout-verdict-overall-v1.json",
  ]) {
    const result = plan([changed]);
    assert.equal(result.mode, "IMPACTED_SHADOW", changed);
    assert.deepEqual(result.selectedNodes, ["cscl-11-idempiere-serial-holdout-gate-v1", "pan487-product-purpose-semantic-successor-v1"], changed);
    assert.deepEqual(result.selectedTests, ["npm run cscl11:test", "npm run pan487:test"], changed);
  }
  // Fail-closed: a drifted observed digest on a cscl-11 input forces FULL_FALLBACK.
  const digests = observed(manifest);
  const cscl11InputPath = "src/cscl-11/holdout-gate.mjs";
  digests[cscl11InputPath] = "f".repeat(64);
  const drifted = buildVerificationImpactPlanV2({
    graph: manifest,
    graphPath: "verification/verification-dag-v2.json",
    baseSha: BASE,
    headSha: HEAD,
    changedPaths: [cscl11InputPath],
    observedInputDigests: digests,
  });
  assert.deepEqual(drifted.reasons, ["GRAPH_DRIFT"]);
  // Fail-closed: a tampered node shape or an unknown dependency rejects the graph.
  const tampered = structuredClone(manifest) as VerificationDagV2;
  const tamperedNode = tampered.nodes.find(({ id }) => id === "cscl-11-idempiere-serial-holdout-gate-v1");
  assert.ok(tamperedNode);
    const firstInput = tamperedNode.inputs[0];
  if (firstInput === undefined) throw new Error("input");
  (tamperedNode.inputs as VerificationDagInputV2[])[0] = {
    path: firstInput.path,
    role: firstInput.role,
    sha256: "0".repeat(63) + "g",
  };
  assert.equal(validateVerificationDagV2(tampered), false);
  const orphaned = structuredClone(manifest) as VerificationDagV2;
  const orphanedNode = orphaned.nodes.find(({ id }) => id === "cscl-11-idempiere-serial-holdout-gate-v1");
  if (orphanedNode === undefined) throw new Error("cscl-11 node");
  (orphanedNode as unknown as { dependsOn: string[] }).dependsOn.push("cscl-99-missing-node");
  assert.equal(validateVerificationDagV2(orphaned), false);
});

test("external BI v2 client changes select only the thin client and downstream integrity gates", () => {
  const result = plan(["packages/contracts/src/external-bi-service.ts"]);
  assert.equal(result.mode, "IMPACTED_SHADOW");
  assert.deepEqual(result.selectedNodes, ["external-bi-service-v2", "openclaw-m1-4", "openclaw-m1-5", "pan524-exact-bi-pair-v1", "repository-integrity", "secure-default-proof"]);
  assert.ok(result.selectedTests.includes("npm run external-bi-service:test"));
});

test("E-FND-1 cumulative evidence changes select the exact repository-integrity owner and focused suite", () => {
  for (const changed of [
    "tests/trust-compatibility-foundation-closure.test.ts",
    "verification/trust-compatibility-foundation-closure-v1.json",
  ]) {
    const result = plan([changed]);
    assert.equal(result.mode, "IMPACTED_SHADOW", changed);
    assert.deepEqual(result.selectedNodes, ["openclaw-m1-4", "openclaw-m1-5", "repository-integrity", "secure-default-proof"]);
    assert.ok(result.selectedTests.includes("npm run build --silent && node --test dist/tests/trust-compatibility-foundation-closure.test.js"), changed);
  }
});

test("both canonical JSON implementations invalidate the M1.4 node and secure-default closure", () => {
  const m14 = graph().nodes.find(({ id }) => id === "openclaw-m1-4");
  assert.ok(m14);
  for (const changed of [
    "packages/contracts/src/canonical-json.ts",
    "packages/contracts/src/canonical-json.js",
  ]) {
    assert.ok(m14.inputs.some(({ path }) => path === changed), changed);
    const result = plan([changed]);
    assert.ok(result.selectedNodes.includes("openclaw-m1-4"), changed);
    assert.ok(result.selectedNodes.includes("secure-default-proof"), changed);
    assert.ok(result.selectedTests.includes("npm run openclaw-m1.4:test"), changed);
  }
});

test("central toolchain and security changes invalidate the global closure", () => {
  for (const changed of ["package.json", "scripts/verify-supply-chain.mjs"]) {
    const result = plan([changed]);
    assert.equal(result.mode, "FULL_FALLBACK");
    assert.deepEqual(result.reasons, ["CENTRAL_INPUT_CHANGED"]);
    assert.equal(result.selectedNodes.length, graph().nodes.length);
  }
});

test("unmapped, unsafe, graph and ambiguous changes fail closed", () => {
  assert.deepEqual(plan(["new/unmapped.mjs"]).reasons, ["UNMAPPED_PATH"]);
  assert.deepEqual(plan(["../escape.mjs"]).reasons, ["UNSAFE_PATH"]);
  assert.deepEqual(plan(["verification/verification-dag-v2.json"]).reasons, ["GRAPH_CHANGED"]);

  const ambiguous = structuredClone(graph()) as VerificationDagV2;
  const first = ambiguous.nodes[0]?.inputs[0];
  const second = ambiguous.nodes[1];
  assert.ok(first && second);
  (second.inputs as VerificationDagInputV2[]).push(first);
  const result = buildVerificationImpactPlanV2({
    graph: ambiguous,
    graphPath: "verification/verification-dag-v2.json",
    baseSha: BASE,
    headSha: HEAD,
    changedPaths: [first.path],
    observedInputDigests: observed(ambiguous),
  });
  assert.deepEqual(result.reasons, ["AMBIGUOUS_OWNERSHIP"]);
});

test("invalid, cyclic and unknown-node graphs are rejected", () => {
  const cyclic = structuredClone(graph()) as VerificationDagV2;
  const first = cyclic.nodes.find(({ id }) => id === "intake-001-issue-candidate-v1");
  const dependent = cyclic.nodes.find(({ id }) => id === "vf-contract-v1");
  assert.ok(first && dependent);
  (first.dependsOn as string[]).push(dependent.id);
  assert.equal(validateVerificationDagV2(cyclic), false);
  assert.deepEqual(plan(["packages/contracts/src/verification-fabric.ts"], cyclic).reasons, ["INVALID_GRAPH"]);

  const unknown = structuredClone(graph()) as VerificationDagV2;
  (unknown.nodes[0]?.dependsOn as string[]).push("missing-node");
  assert.equal(validateVerificationDagV2(unknown), false);
});

test("input digest drift produces FULL_FALLBACK", () => {
  const input = graph();
  const digests = observed(input);
  const path = input.nodes[0]?.inputs[0]?.path;
  assert.ok(path);
  digests[path] = "f".repeat(64);
  const result = buildVerificationImpactPlanV2({
    graph: input,
    graphPath: "verification/verification-dag-v2.json",
    baseSha: BASE,
    headSha: HEAD,
    changedPaths: [path],
    observedInputDigests: digests,
  });
  assert.deepEqual(result.reasons, ["GRAPH_DRIFT"]);
});

test("plan generation is deterministic", () => {
  const first = plan(["scripts/verification-shadow.mjs", "scripts/verification-plan.mjs"]);
  const second = plan(["scripts/verification-plan.mjs", "scripts/verification-shadow.mjs"]);
  assert.deepEqual(first, second);
  assert.match(first.planDigest, /^[a-f0-9]{64}$/);
});

function ttlNode(): VerificationDagNodeV2 {
  const node = structuredClone(graph().nodes.find(({ id }) => id === "vf-shadow-v2"));
  assert.ok(node);
  return { ...node, evidenceTtlMs: 1_000, ttlJustification: "Bounded replay probe only." };
}

function attestation(node = ttlNode()): VerificationAttestationV2 {
  const unsigned = {
    schemaVersion: VERIFICATION_ATTESTATION_SCHEMA_V2,
    nodeId: node.id,
    nodeDigest: verificationNodeDigestV2(node),
    graphDigest: DIGEST,
    toolchainDigest: "b".repeat(64),
    environmentDigest: "c".repeat(64),
    createdAtMs: 1_000,
    expiresAtMs: 2_000,
    testResults: node.ownedTests.map((ownedTest) => ({ test: ownedTest, outcome: "PASS" as const })),
  };
  return { ...unsigned, attestationDigest: verificationAttestationDigestV2(unsigned) };
}

function verify(attestationInput: unknown, nowMs = 1_500) {
  return verifyPrototypeAttestationV2({
    attestation: attestationInput,
    node: ttlNode(),
    graphDigest: DIGEST,
    toolchainDigest: "b".repeat(64),
    environmentDigest: "c".repeat(64),
    nowMs,
  });
}

test("prototype attestation schema is closed and exact matches remain non-authoritative", () => {
  const schema = JSON.parse(readFileSync("schemas/contracts/verification-attestation-v2.schema.json", "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  assert.equal(validate(attestation()), true, JSON.stringify(validate.errors));
  assert.deepEqual(verify(attestation()), { outcome: "REUSABLE_PROTOTYPE", authoritative: false });
});

test("missing, tampered and stale attestations deny", () => {
  assert.deepEqual(verify(null), {
    outcome: "DENIED", authoritative: false, reasons: ["ATTESTATION_MISSING_DENIED"],
  });
  const tampered = { ...attestation(), environmentDigest: "d".repeat(64) };
  assert.deepEqual(verify(tampered), {
    outcome: "DENIED", authoritative: false, reasons: ["ATTESTATION_TAMPERED_DENIED"],
  });
  assert.deepEqual(verify(attestation(), 2_001), {
    outcome: "DENIED", authoritative: false, reasons: ["ATTESTATION_STALE_DENIED"],
  });
});

test("exact version, node, toolchain and environment binding is required", () => {
  const mismatched = attestation();
  const unsigned = { ...mismatched, environmentDigest: "d".repeat(64) };
  const { attestationDigest: ignored, ...content } = unsigned;
  const resigned = { ...content, attestationDigest: verificationAttestationDigestV2(content) };
  assert.deepEqual(verify(resigned), {
    outcome: "DENIED", authoritative: false, reasons: ["ATTESTATION_MISMATCH_DENIED"],
  });
});

test("selector exceptions produce FULL_FALLBACK with all hard gates", () => {
  const input = graph();
  const result = buildVerificationImpactPlanFailClosedV2({
    graph: input,
    graphPath: "verification/verification-dag-v2.json",
    baseSha: BASE,
    headSha: HEAD,
    changedPaths: ["scripts/verification-plan.mjs"],
    observedInputDigests: observed(input),
  }, () => { throw new Error("synthetic selector failure"); });
  assert.equal(result.mode, "FULL_FALLBACK");
  assert.deepEqual(result.reasons, ["CLASSIFIER_FAILURE"]);
  assert.deepEqual(result.hardGates, [...input.hardGates].sort((a, b) => a.localeCompare(b, "en")));
});

test("the authoritative full-suite comparator executes for impacted and fallback plans", async () => {
  for (const selectedPlan of [plan(["scripts/verification-plan.mjs"]), plan(["unmapped/new.mjs"])]) {
    let calls = 0;
    const report = await runVerificationShadowComparatorV2(selectedPlan, async () => {
      calls += 1;
      return 0;
    });
    assert.equal(calls, 1);
    assert.deepEqual(report.comparator, {
      command: "npm test", authoritative: true, executed: true, exitCode: 0,
    });
    assert.equal(report.activation, "BLOCKED_SAMPLE_GATE");
  }
});
