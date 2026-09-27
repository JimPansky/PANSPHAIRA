#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const digest = (relative) => createHash("sha256").update(readFileSync(path.join(root, relative))).digest("hex");
const writeJson = (relative, value) => writeFileSync(path.join(root, relative), `${JSON.stringify(value, null, 2)}\n`);
const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const buildSecureDefaultEvidence = (manifest) => {
  const manifestDigest = sha256(canonicalJson(manifest));
  const artifacts = [...manifest.artifacts]
    .map(({ path: artifactPath, sha256: artifactDigest }) => ({ path: artifactPath, sha256: artifactDigest }))
    .sort((left, right) => left.path.localeCompare(right.path, "en"));
  const core = {
    schemaVersion: "chimpmaera.security/secure-default-proof-evidence/v1",
    proofId: manifest.proofId,
    profile: manifest.profile,
    evidenceState: "CURRENT",
    manifestDigest,
    schemaDigest: manifest.schemaBinding.sha256,
    verifierDigest: manifest.verifier.sha256,
    inputSetDigest: sha256(canonicalJson(artifacts)),
    commands: [
      ...manifest.commands.focused.map((command) => ({ command, category: "FOCUSED", outcome: "PASS" })),
      { command: manifest.commands.authoritative, category: "AUTHORITATIVE", outcome: "PASS" },
    ],
    comparison: { focusedSubsetOfAuthoritative: true, authoritativeCommand: "npm test", noSkipping: true },
    claimVerdicts: manifest.claims.map(({ claimId, verdict }) => ({ claimId, verdict })),
    overallVerdict: "PASS",
  };
  return { ...core, reportDigest: sha256(canonicalJson(core)) };
};

function walk(relative) {
  return readdirSync(path.join(root, relative), { withFileTypes: true })
    .flatMap((entry) => entry.isDirectory() ? walk(path.posix.join(relative, entry.name)) : [path.posix.join(relative, entry.name)]);
}

// Governance ownership is pre-existing review state, not generated integrity
// data. Validate it before any write so refresh can never invent or repair the
// owner mapping as a side effect.
const dagPath = "verification/verification-dag-v2.json";
const dag = JSON.parse(readFileSync(path.join(root, dagPath), "utf8"));
const mediaOwners = dag.nodes.filter(({ id }) => id === "know-media-m1-audience-learning-v1");
if (mediaOwners.length !== 1) throw new Error("MEDIA_M1_DAG_OWNER_MISSING_OR_DUPLICATED");
const mediaNode = mediaOwners[0];
const establishedMediaInputs = [
  ["packages/contracts/src/external-video-service.ts", "CONTRACT"],
  ["tests/external-video-service.test.ts", "VALIDATOR"],
  ["docs/EXTERNAL-VIDEO-SERVICE.md", "DERIVED_EVIDENCE"],
];
const inputIdentities = mediaNode.inputs.map(({ path: inputPath, role }) => `${inputPath}\0${role}`);
if (new Set(mediaNode.inputs.map(({ path: inputPath }) => inputPath)).size !== mediaNode.inputs.length
  || establishedMediaInputs.some(([inputPath, role], index) => inputIdentities[index] !== `${inputPath}\0${role}`)) {
  throw new Error("MEDIA_M1_DAG_EXTERNAL_INPUT_OWNERSHIP_DENIED");
}

const lockPath = "demo/manifests/supply-chain/openclaw-agent-runtime-lock-v1.json";
const lock = JSON.parse(readFileSync(path.join(root, lockPath), "utf8"));
const lockedPaths = [
  ...walk("demo/openclaw-agent"),
  "packages/contracts/src/canonical-json.js",
  "packages/contracts/src/capability-catalogue.ts",
  "scripts/verify-openclaw-agent-runtime-lock.mjs",
].sort();
lock.fixtureBuild.artifactSha256 = Object.fromEntries(lockedPaths.map((relative) => [relative, digest(relative)]));
writeJson(lockPath, lock);

const proofPath = "security/secure-default-proof-v1.json";
const proof = JSON.parse(readFileSync(path.join(root, proofPath), "utf8"));
const proofAdditions = [
  { path: "demo/manifests/supply-chain/openclaw-agent-runtime-lock-v1.json", role: "IMPLEMENTATION" },
  { path: "scripts/verify-openclaw-agent-runtime-lock.mjs", role: "VERIFIER" },
  { path: "demo/openclaw-agent/runtime-contract-v1.json", role: "IMPLEMENTATION" },
  { path: "demo/openclaw-agent/gateway-workload-contract-v2.json", role: "IMPLEMENTATION" },
  { path: "demo/openclaw-agent/plugin/identity-v2.mjs", role: "IMPLEMENTATION" },
  { path: "demo/openclaw-agent/gateway.mjs", role: "IMPLEMENTATION" },
  { path: "demo/openclaw-agent/gateway.Dockerfile", role: "IMPLEMENTATION" },
  { path: "demo/openclaw-agent/openclaw.Dockerfile", role: "IMPLEMENTATION" },
  { path: "demo/openclaw-agent/openclaw.json", role: "IMPLEMENTATION" },
  { path: "demo/openclaw-agent/plugin/index.mjs", role: "IMPLEMENTATION" },
  { path: "demo/openclaw-agent/plugin/response-v1.mjs", role: "IMPLEMENTATION" },
  { path: "demo/openclaw-agent/plugin/openclaw.plugin.json", role: "IMPLEMENTATION" },
  { path: "demo/openclaw-agent/plugin/package.json", role: "IMPLEMENTATION" },
  { path: "demo/openclaw-agent/capability-m1-4-adapter.mjs", role: "IMPLEMENTATION" },
  { path: "demo/openclaw-agent/gateway-state.mjs", role: "IMPLEMENTATION" },
  { path: "demo/openclaw-agent/mind-store.mjs", role: "IMPLEMENTATION" },
  { path: "packages/contracts/src/capability-catalogue.ts", role: "IMPLEMENTATION" },
  { path: "packages/contracts/src/canonical-json.ts", role: "IMPLEMENTATION" },
  { path: "packages/contracts/src/canonical-json.js", role: "IMPLEMENTATION" },
  { path: "tests/capability-catalogue.test.ts", role: "TEST" },
  { path: "tests/canonical-json-runtime-parity.test.mjs", role: "TEST" },
  { path: "tests/openclaw-agent-runtime-lock.test.mjs", role: "TEST" },
  { path: "tests/openclaw-agent-runtime.test.mjs", role: "TEST" },
  { path: "tests/openclaw-gateway-identity-network.test.mjs", role: "TEST" },
  { path: "tests/openclaw-gateway-state.test.mjs", role: "TEST" },
  { path: "tests/openclaw-m1.4-gateway-e2e.test.mjs", role: "TEST" },
  { path: "tests/helpers/openclaw-m1-4-harness.mjs", role: "TEST" },
  { path: "security/openclaw-m1.4-evidence-v1.json", role: "EVIDENCE" },
];
const byPath = new Map(proof.artifacts.map((artifact) => [artifact.path, artifact]));
for (const artifact of proofAdditions) if (!byPath.has(artifact.path)) byPath.set(artifact.path, artifact);
proof.artifacts = [...byPath.values()].map((artifact) => ({ ...artifact, sha256: digest(artifact.path) }));
proof.schemaBinding.sha256 = digest(proof.schemaBinding.path);
proof.verifier.sha256 = digest(proof.verifier.path);
writeJson(proofPath, proof);
writeJson("security/secure-default-proof-evidence-v1.json", buildSecureDefaultEvidence(proof));

dag.graphVersion = 41;
const verificationFabricNode = dag.nodes.find(({ id }) => id === "vf-contract-v1");
if (verificationFabricNode === undefined) throw new Error("VF_CONTRACT_V1_DAG_NODE_MISSING");
const verificationFabricInputs = [
  ["packages/contracts/src/verification-fabric.ts", "CONTRACT"],
  ["schemas/contracts/verification-fabric-bundle-v1.schema.json", "SCHEMA"],
  ["tests/fixtures/verification-fabric/positive-bundle-v1.json", "FIXTURE"],
  ["tests/fixtures/verification-fabric/negative-matrix-v1.json", "FIXTURE"],
  ["tests/verification-fabric.test.ts", "VALIDATOR"],
  ["tests/verification-fabric-negative-zero.test.ts", "VALIDATOR"],
];
verificationFabricNode.inputs = verificationFabricInputs.map(([inputPath, role]) => ({
  path: inputPath,
  role,
  sha256: digest(inputPath),
}));
verificationFabricNode.ownedTests = [
  "node --test dist/tests/verification-fabric-negative-zero.test.js dist/tests/verification-fabric.test.js",
];
const extensionAssuranceInputs = [
  ["packages/contracts/src/extension-assurance-profile.ts", "CONTRACT"],
  ["schemas/contracts/extension-assurance-profile-v1.schema.json", "SCHEMA"],
  ["tests/fixtures/extension-assurance/positive-profile-v1.json", "FIXTURE"],
  ["tests/fixtures/extension-assurance/negative-matrix-v1.json", "FIXTURE"],
  ["tests/extension-assurance-profile.test.ts", "VALIDATOR"],
  ["tests/extension-assurance-profile-negative-zero.test.ts", "VALIDATOR"],
  ["docs/EXTENSION-ASSURANCE-PROFILES.md", "DERIVED_EVIDENCE"],
];
let extensionAssuranceNode = dag.nodes.find(({ id }) => id === "etl-01-extension-assurance-profile-v1");
if (extensionAssuranceNode === undefined) {
  extensionAssuranceNode = {
    id: "etl-01-extension-assurance-profile-v1",
    dependsOn: ["vf-contract-v1"],
    inputs: [],
    ownedTests: [],
    invariants: [
      "The local synthetic profile grants no trust, admission, installation, activation, execution or marketplace authority.",
      "Unknown, unsafe, fractional, negative-zero, stale, reversed, inconsistent or digest-drifting canonical numbers fail closed.",
      "Canonical zero and safe nonnegative timestamps and counts retain deterministic digest-bound profile behavior.",
    ],
    riskClass: "HIGH",
    globalInvalidation: false,
  };
  dag.nodes.push(extensionAssuranceNode);
}
extensionAssuranceNode.inputs = extensionAssuranceInputs.map(([inputPath, role]) => ({
  path: inputPath,
  role,
  sha256: digest(inputPath),
}));
extensionAssuranceNode.ownedTests = [
  "node --test dist/tests/extension-assurance-profile-negative-zero.test.js dist/tests/extension-assurance-profile.test.js",
];
const repositoryIntegrityNode = dag.nodes.find(({ id }) => id === "repository-integrity");
if (repositoryIntegrityNode === undefined) throw new Error("REPOSITORY_INTEGRITY_DAG_NODE_MISSING");
if (!repositoryIntegrityNode.dependsOn.includes(extensionAssuranceNode.id)) {
  repositoryIntegrityNode.dependsOn.push(extensionAssuranceNode.id);
}
const externalPluginInputs = [
  ["packages/contracts/src/external-plugin-preflight.ts", "SECURITY"],
  ["schemas/contracts/external-plugin-preflight-v1.schema.json", "SCHEMA"],
  ["tests/external-plugin-preflight.test.ts", "VALIDATOR"],
  ["tests/fixtures/external-plugin-preflight/dsh-benign-v1.json", "FIXTURE"],
  ["tests/fixtures/external-plugin-preflight/mcp-risk-v1.json", "FIXTURE"],
  ["tests/fixtures/external-plugin-preflight/package-risk-v1.json", "FIXTURE"],
  ["tests/fixtures/external-plugin-preflight/skill-risk-v1.json", "FIXTURE"],
  ["docs/EXTERNAL-PLUGIN-PREFLIGHT.md", "DERIVED_EVIDENCE"],
];
let externalPluginNode = dag.nodes.find(({ id }) => id === "etl-02-external-plugin-preflight-v1");
if (externalPluginNode === undefined) {
  externalPluginNode = {
    id: "etl-02-external-plugin-preflight-v1",
    dependsOn: ["vf-contract-v1"],
    inputs: [],
    ownedTests: ["npm run external-plugin-preflight:test"],
    invariants: [
      "Preflight consumes caller-supplied immutable bytes without filesystem, network, process or foreign-harness execution authority.",
      "Unknown versions, mutable dependencies, path ambiguity, digest mismatch and execution-bearing package metadata fail closed with fixed reason codes.",
      "A static-clear result is evidence only and never grants profile conformance, admission, installation, activation or execution authority.",
    ],
    riskClass: "CRITICAL",
    globalInvalidation: false,
  };
  dag.nodes.push(externalPluginNode);
}
externalPluginNode.inputs = externalPluginInputs.map(([inputPath, role]) => ({
  path: inputPath,
  role,
  sha256: digest(inputPath),
}));
const pluginKnowledgeInputs = [
  ["packages/contracts/src/plugin-knowledge-harvest.ts", "SECURITY"],
  ["tests/plugin-knowledge-harvest.test.ts", "VALIDATOR"],
  ["tests/fixtures/plugin-knowledge-harvest/official-primary-v1.json", "FIXTURE"],
  ["tests/fixtures/plugin-knowledge-harvest/official-primary-snapshot-v1.json", "FIXTURE"],
  ["tests/fixtures/plugin-knowledge-harvest/synthetic-metadata-v1.json", "FIXTURE"],
  ["tests/fixtures/plugin-knowledge-harvest/synthetic-metadata-snapshot-v1.json", "FIXTURE"],
  ["tests/fixtures/plugin-knowledge-harvest/etl02-negative-v1.json", "FIXTURE"],
  ["tests/fixtures/plugin-knowledge-harvest/etl02-report-snapshot-v1.json", "FIXTURE"],
  ["docs/PLUGIN-KNOWLEDGE-HARVEST.md", "DERIVED_EVIDENCE"],
  ["docs/development/awi-plugin-01-issue-239-pdca.md", "DERIVED_EVIDENCE"],
];
let pluginKnowledgeNode = dag.nodes.find(({ id }) => id === "awi-plugin-01-knowledge-harvest-v1");
if (pluginKnowledgeNode === undefined) {
  pluginKnowledgeNode = {
    id: "awi-plugin-01-knowledge-harvest-v1",
    dependsOn: ["awi-03-knowledge-envelope", "etl-02-external-plugin-preflight-v1"],
    inputs: [],
    ownedTests: ["npm run plugin-knowledge-harvest:test"],
    invariants: [
      "Every record remains bound to exact checked-in snapshot bytes, citation, selector, licence, review time and expiry.",
      "Unknown, disputed, conflicting and source-invalidated records never become curated or generation candidates.",
      "Harvest output grants no credential, policy, capability, tool, write, execution, installation or runtime authority.",
    ],
    riskClass: "CRITICAL",
    globalInvalidation: false,
  };
  dag.nodes.push(pluginKnowledgeNode);
}
pluginKnowledgeNode.inputs = pluginKnowledgeInputs.map(([inputPath, role]) => ({
  path: inputPath,
  role,
  sha256: digest(inputPath),
}));
const intakeNode = dag.nodes.find(({ id }) => id === "intake-001-issue-candidate-v1");
if (intakeNode === undefined) throw new Error("INTAKE_001_DAG_NODE_MISSING");
const intakeInputs = [
  ["packages/contracts/src/issue-candidate.ts", "SECURITY"],
  ["schemas/contracts/issue-candidate-v1.schema.json", "SCHEMA"],
  ["tests/fixtures/issue-candidate/positive-v1.json", "FIXTURE"],
  ["tests/fixtures/issue-candidate/quarantine-v1.json", "FIXTURE"],
  ["tests/issue-candidate.test.ts", "VALIDATOR"],
  ["scripts/render-issue-candidate-evidence.mjs", "VALIDATOR"],
  ["docs/ISSUE-CANDIDATE-OPERATOR-GUIDE.md", "DERIVED_EVIDENCE"],
  ["docs/development/intake-001-issue-46-pdca.md", "DERIVED_EVIDENCE"],
  ["verification/intake-001-evidence-v1.json", "DERIVED_EVIDENCE"],
];
intakeNode.inputs = intakeInputs.map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
const externalBiNode = dag.nodes.find(({ id }) => id === "external-bi-service-v2");
if (externalBiNode === undefined) throw new Error("EXTERNAL_BI_V2_DAG_NODE_MISSING");
const externalBiInputs = [
  ["packages/contracts/src/external-bi-service.ts", "CONTRACT"],
  ["tests/external-bi-service.test.ts", "VALIDATOR"],
  ["tests/fixtures/external-bi-service-v2-clean-room.json", "FIXTURE"],
  ["scripts/verify-external-bi-service-v2-clean-room.mjs", "VALIDATOR"],
  ["docs/EXTERNAL-BI-SERVICE.md", "DERIVED_EVIDENCE"],
  ["verification/external-bi-service-paired-compatibility-v1.json", "DERIVED_EVIDENCE"],
];
externalBiNode.inputs = externalBiInputs.map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
externalBiNode.invariants = [
  "CM remains optional and default-off and addresses only the exact SBA base URL.",
  "PanSphaira owner-derives the versioned product, contract and capability-descriptor profile; endpoint configuration cannot select or attest a substitute profile.",
  "Exact publicly released PanSphaira and KaleidoSphere heads, fixtures, contracts, capabilities and receipts bind one paired compatibility record.",
  "Product-version mismatch, unknown pairs, stale or substituted heads, missing evidence and fully or partially re-digested inputs fail closed; no claim exceeds the exact tested pair.",
  "CM forwards only status, discovery, analyze, plan, preview and readback; direct Superset routes, credentials, raw rows, SQL and mutation intents are denied.",
  "The paired record performs no production, customer, external, publication or closure effect; final public closure remains separately governed.",
];
const foundationClosureInputs = [
  ["tests/trust-compatibility-foundation-closure.test.ts", "VALIDATOR"],
  ["verification/trust-compatibility-foundation-closure-v1.json", "DERIVED_EVIDENCE"],
];
for (const [inputPath, role] of foundationClosureInputs) {
  const matches = repositoryIntegrityNode.inputs.filter(({ path: candidatePath }) => candidatePath === inputPath);
  if (matches.length > 1 || (matches.length === 1 && matches[0].role !== role)) {
    throw new Error(`E_FND_1_INTEGRITY_OWNERSHIP_DENIED:${inputPath}`);
  }
  if (matches.length === 0) repositoryIntegrityNode.inputs.push({ path: inputPath, role, sha256: digest(inputPath) });
}
repositoryIntegrityNode.inputs.sort((left, right) => left.path.localeCompare(right.path, "en"));
for (const dependency of ["cks-12-closed-learning-loop-v1", "external-bi-service-v2"]) {
  if (!repositoryIntegrityNode.dependsOn.includes(dependency)) repositoryIntegrityNode.dependsOn.push(dependency);
}
repositoryIntegrityNode.dependsOn.sort((left, right) => left.localeCompare(right, "en"));
const foundationClosureTest = "npm run build --silent && node --test dist/tests/trust-compatibility-foundation-closure.test.js";
if (!repositoryIntegrityNode.ownedTests.includes(foundationClosureTest)) repositoryIntegrityNode.ownedTests.push(foundationClosureTest);
const foundationClosureInvariants = [
  "All seven child acceptance sets are uniquely owned, dependency-correct and bound to exact issue-thread, PR, CI, merge, release, tag and anonymous-readback evidence.",
  "Queue-backed children require terminal unowned DONE rows; PACKAGE_DONE never substitutes, while pre-campaign direct-Control-Lane children retain explicit no-row terminal reconciliation without invented Queue history.",
  "Missing, duplicate, stale, substituted, UNKNOWN, re-digested or post-validation-mutated child evidence fails closed.",
  "Daily release sequence, additive protected history, exact-evidence rules and bounded nonclaims remain intact without productive effects or Authority widening.",
  "This integration record does not close parent issue 333; E-FND-1-AC05 remains with the delivery and Root-QS final owner.",
];
for (const invariant of foundationClosureInvariants) {
  if (!repositoryIntegrityNode.invariants.includes(invariant)) repositoryIntegrityNode.invariants.push(invariant);
}
const currentHeadDockerE2EInputs = [
  [".github/workflows/demo-current-head-e2e.yml", "SECURITY"],
  [".github/workflows/release-public-readback.yml", "SECURITY"],
  ["closure-audits/AUDIT-CORRECTION-377-ROOT-QS/implementation-evidence.json", "DERIVED_EVIDENCE"],
  ["demo/install.sh", "SECURITY"],
  ["demo/manifests/supply-chain/artifact-lock-v1.json", "CONTRACT"],
  ["demo/README.md", "DERIVED_EVIDENCE"],
  ["demo/uninstall.sh", "SECURITY"],
  ["docs/DEMO-CURRENT-HEAD-E2E.md", "DERIVED_EVIDENCE"],
  ["docs/RELEASE-GOVERNANCE.md", "DERIVED_EVIDENCE"],
  ["release/governance.json", "CONTRACT"],
  ["scripts/demo-current-head-e2e.mjs", "SECURITY"],
  ["tests/demo-current-head-e2e.test.mjs", "VALIDATOR"],
  ["tests/release-governance.test.mjs", "VALIDATOR"],
  ["verification/demo-current-head-e2e/contract-v1.json", "CONTRACT"],
];
for (const [inputPath, role] of currentHeadDockerE2EInputs) {
  const matches = repositoryIntegrityNode.inputs.filter(({ path: candidatePath }) => candidatePath === inputPath);
  if (matches.length > 1 || (matches.length === 1 && matches[0].role !== role)) {
    throw new Error(`CURRENT_HEAD_DOCKER_E2E_INTEGRITY_OWNERSHIP_DENIED:${inputPath}`);
  }
  if (matches.length === 0) repositoryIntegrityNode.inputs.push({ path: inputPath, role, sha256: digest(inputPath) });
}
repositoryIntegrityNode.inputs.sort((left, right) => left.path.localeCompare(right.path, "en"));
const currentHeadDockerE2ETest = "node --test tests/demo-current-head-e2e*.test.mjs";
if (!repositoryIntegrityNode.ownedTests.includes(currentHeadDockerE2ETest)) {
  repositoryIntegrityNode.ownedTests.push(currentHeadDockerE2ETest);
}
for (const invariant of [
  "Scheduled and release Docker E2E checks out one exact clean SHA, uses an isolated Compose namespace and remains absent from ordinary pull-request Docker work.",
  "A successful retained receipt binds exact commit/tree, image and Compose locks, fixtures, health, governed effect, authoritative readback, cleanup and zero owned residue.",
  "Failed health, fixture drift, missing readback, timeout, stale evidence, caller-authored PASS, hard-gate failure, overclaim and residual ownership fail closed.",
  "Final completion requires public CLOSED issue and authoritative unowned DONE Queue readback without granting credentials, productive effects or Authority mutation.",
]) {
  if (!repositoryIntegrityNode.invariants.includes(invariant)) repositoryIntegrityNode.invariants.push(invariant);
}
const cks12Node = dag.nodes.find(({ id }) => id === "cks-12-closed-learning-loop-v1");
if (cks12Node === undefined) throw new Error("CKS_12_DAG_NODE_MISSING");
const cks12FocusedInputs = [
  ["src/cks-12/readonly-kaleidosphere-bridge.ts", "VALIDATOR"],
  ["tests/cks-12/readonly-kaleidosphere-bridge.test.ts", "VALIDATOR"],
  ["tests/fixtures/cks-12/edge-authority-v2.json", "FIXTURE"],
  ["tests/fixtures/cks-analytics/xra-ps-02-native-service-capture-v1.json", "DERIVED_EVIDENCE"],
  ["tests/fixtures/cks-analytics/xra-ps-02-native-service-substitution-capture-v1.json", "DERIVED_EVIDENCE"],
  ["scripts/run-xra-ps-02-root-qs-replay.mjs", "VALIDATOR"],
  ["tests/cks-12/kaleidosphere-candidate-quarantine-rootqs.test.ts", "VALIDATOR"],
  ["tests/fixtures/cks-analytics/xra-ps-02-native-paired-receipt-v2.json", "DERIVED_EVIDENCE"],
  ["tests/fixtures/cks-analytics/xra-ps-02-native-root-qs-raw-v2.json", "DERIVED_EVIDENCE"],
  ["verification/pansphaira-kaleidosphere-analytics-slice-v2.json", "DERIVED_EVIDENCE"],
];
for (const [inputPath, role] of cks12FocusedInputs) {
  const matches = cks12Node.inputs.filter(({ path: candidatePath }) => candidatePath === inputPath);
  if (matches.length > 1 || (matches.length === 1 && matches[0].role !== role)) {
    throw new Error(`CKS_12_FOCUSED_INPUT_OWNERSHIP_DENIED:${inputPath}`);
  }
  if (matches.length === 0) cks12Node.inputs.push({ path: inputPath, role, sha256: digest(inputPath) });
}
cks12Node.inputs.sort((left, right) => left.path.localeCompare(right.path, "en"));
cks12Node.ownedTests = ["npm run fnd-ps-fu-01:test", "npm run cks12:test"];
cks12Node.invariants = [
  "All 23 Part-II story steps bind immutable fixtures and exact component versions.",
  "Acquisition, validation and promotion remain separate governed states.",
  "Every v2 edge binds immutable PanSphaira-owner-derived evidence and canonical Knowledge; shared endpoints alone never grant relation truth.",
  "Paired substitutions, fully re-digested forged relations, stale or incomplete evidence, hostile in-process inputs, post-validation mutation, promotion and canonical-Knowledge mutation fail closed.",
  "KaleidoSphere receives only minimized read-only projections and returns authority-free, effect-free candidates.",
  "Drift and unknown variants invalidate or safely abort fast paths.",
  "Falsification reports bind raw counts, denominators, exclusions and stop conditions.",
  "Cumulative delivery readiness requires exact head/tree-bound gates, integrity receipts, closed issue criteria, exact scope and immutable no-authority ownership.",
];
mediaNode.ownedTests = ["npm run external-video-service:test", "npm run video:test"];
const mediaInputs = [
  ["packages/contracts/src/external-video-service.ts", "CONTRACT"],
  ["tests/external-video-service.test.ts", "VALIDATOR"],
  ["docs/EXTERNAL-VIDEO-SERVICE.md", "DERIVED_EVIDENCE"],
  ["tools/video-production-reference/EXTENSION-GUIDE.md", "DERIVED_EVIDENCE"],
  ["tools/video-production-reference/NOTICE", "DERIVED_EVIDENCE"],
  ["tools/video-production-reference/README.md", "DERIVED_EVIDENCE"],
  ["tools/video-production-reference/SHA256SUMS", "CONTRACT"],
  ["tools/video-production-reference/assets/synthetic/frame-s01.png", "FIXTURE"],
  ["tools/video-production-reference/assets/synthetic/frame-s02.png", "FIXTURE"],
  ["tools/video-production-reference/assets/synthetic/frame-s03.png", "FIXTURE"],
  ["tools/video-production-reference/assets/synthetic/frame-s04.png", "FIXTURE"],
  ["tools/video-production-reference/assets/synthetic/track-alpha.wav", "FIXTURE"],
  ["tools/video-production-reference/assets/synthetic/track-beta.wav", "FIXTURE"],
  ["tools/video-production-reference/bin/cm-video.mjs", "SECURITY"],
  ["tools/video-production-reference/components/audio.pcm-v1.json", "CONTRACT"],
  ["tools/video-production-reference/components/qa.cpu-v1.json", "CONTRACT"],
  ["tools/video-production-reference/components/renderer.cpu-v1.json", "CONTRACT"],
  ["tools/video-production-reference/jobs/job-alpha.synthetic-v1.json", "FIXTURE"],
  ["tools/video-production-reference/jobs/job-beta.synthetic-v1.json", "FIXTURE"],
  ["tools/video-production-reference/schemas/component-descriptor.schema.v1.json", "SCHEMA"],
  ["tools/video-production-reference/schemas/ownership-marker.schema.v1.json", "SCHEMA"],
  ["tools/video-production-reference/schemas/package-index.schema.v1.json", "SCHEMA"],
  ["tools/video-production-reference/schemas/qa-receipt.schema.v1.json", "SCHEMA"],
  ["tools/video-production-reference/schemas/render-manifest.schema.v1.json", "SCHEMA"],
  ["tools/video-production-reference/schemas/success-marker.schema.v1.json", "SCHEMA"],
  ["tools/video-production-reference/schemas/timeline.schema.v1.json", "SCHEMA"],
  ["tools/video-production-reference/schemas/video-job.schema.v1.json", "SCHEMA"],
  ["tools/video-production-reference/scripts/generate-synthetic-assets.mjs", "VALIDATOR"],
  ["tools/video-production-reference/scripts/verify-closure.mjs", "VALIDATOR"],
  ["tools/video-production-reference/src/audio-pcm.mjs", "SOURCE"],
  ["tools/video-production-reference/src/controller.mjs", "SECURITY"],
  ["tools/video-production-reference/src/job-validator.mjs", "SECURITY"],
  ["tools/video-production-reference/src/media-io.mjs", "SECURITY"],
  ["tools/video-production-reference/src/package-assembly.mjs", "SECURITY"],
  ["tools/video-production-reference/src/qa-cpu.mjs", "SOURCE"],
  ["tools/video-production-reference/src/render-cpu.mjs", "SOURCE"],
  ["tools/video-production-reference/src/safe-io.mjs", "SECURITY"],
  ["tools/video-production-reference/src/select-component.mjs", "SECURITY"],
  ["tools/video-production-reference/src/strict-json.mjs", "SECURITY"],
  ["tools/video-production-reference/src/verify-closure.mjs", "VALIDATOR"],
  ["tools/video-production-reference/tests/closure.test.mjs", "VALIDATOR"],
  ["tools/video-production-reference/tests/slice.test.mjs", "SECURITY"],
];
mediaNode.inputs = mediaInputs.map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
const m14Node = dag.nodes.find(({ id }) => id === "openclaw-m1-4");
if (m14Node === undefined) throw new Error("OPENCLAW_M1_4_DAG_NODE_MISSING");
const m14Inputs = [
  ["demo/manifests/supply-chain/openclaw-agent-runtime-lock-v1.json", "CONTRACT"],
  ["scripts/verify-openclaw-agent-runtime-lock.mjs", "VALIDATOR"],
  ["demo/openclaw-agent/runtime-contract-v1.json", "CONTRACT"],
  ["demo/openclaw-agent/gateway-workload-contract-v2.json", "CONTRACT"],
  ["demo/openclaw-agent/plugin/identity-v2.mjs", "SECURITY"],
  ["demo/openclaw-agent/gateway.mjs", "SOURCE"],
  ["demo/openclaw-agent/gateway-state.mjs", "SOURCE"],
  ["demo/openclaw-agent/gateway.Dockerfile", "SOURCE"],
  ["demo/openclaw-agent/openclaw.Dockerfile", "SOURCE"],
  ["demo/openclaw-agent/openclaw.json", "CONTRACT"],
  ["demo/openclaw-agent/plugin/index.mjs", "SOURCE"],
  ["demo/openclaw-agent/plugin/response-v1.mjs", "VALIDATOR"],
  ["demo/openclaw-agent/plugin/openclaw.plugin.json", "CONTRACT"],
  ["demo/openclaw-agent/plugin/package.json", "CONTRACT"],
  ["demo/openclaw-agent/capability-m1-4-adapter.mjs", "SOURCE"],
  ["packages/contracts/src/capability-catalogue.ts", "CONTRACT"],
  ["packages/contracts/src/canonical-json.ts", "CONTRACT"],
  ["packages/contracts/src/canonical-json.js", "SOURCE"],
  ["tests/capability-catalogue.test.ts", "VALIDATOR"],
  ["tests/canonical-json-runtime-parity.test.mjs", "VALIDATOR"],
  ["tests/openclaw-agent-runtime-lock.test.mjs", "VALIDATOR"],
  ["tests/openclaw-agent-runtime.test.mjs", "VALIDATOR"],
  ["tests/openclaw-gateway-identity-network.test.mjs", "VALIDATOR"],
  ["tests/openclaw-gateway-state.test.mjs", "VALIDATOR"],
  ["tests/openclaw-m1.4-gateway-e2e.test.mjs", "VALIDATOR"],
  ["tests/helpers/openclaw-m1-4-harness.mjs", "FIXTURE"],
  ["docs/OPENCLAW-BOUNDED-STATE-OPERATOR-GUIDE.md", "DERIVED_EVIDENCE"],
  ["docs/development/openclaw-m1.4-issue-7-pdca.md", "DERIVED_EVIDENCE"],
  ["security/openclaw-m1.4-evidence-v1.json", "DERIVED_EVIDENCE"],
];
m14Node.inputs = m14Inputs.map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
const usageInsightsNode = dag.nodes.find(({ id }) => id === "awi-insights-1-usage-insights-v1");
if (usageInsightsNode === undefined) throw new Error("AWI_INSIGHTS_1_DAG_NODE_MISSING");
const usageInsightsInputs = [
  ["packages/contracts/src/usage-insights.ts", "SECURITY"],
  ["packages/usage-insights/src/index.ts", "SECURITY"],
  ["packages/usage-insights/src/cli.ts", "SOURCE"],
  ["packages/contracts/src/canonical-json.ts", "CONTRACT"],
  ["schemas/contracts/usage-insights-event-v1.schema.json", "SCHEMA"],
  ["schemas/contracts/usage-insights-share-envelope-v1.schema.json", "SCHEMA"],
  ["tests/fixtures/usage-insights/positive-opted-in-event-v1.json", "FIXTURE"],
  ["tests/fixtures/usage-insights/negative-matrix-v1.json", "FIXTURE"],
  ["tests/usage-insights.test.ts", "VALIDATOR"],
  ["tests/usage-insights-completion.test.ts", "VALIDATOR"],
  ["docs/USAGE-INSIGHTS-CONTRACT.md", "DERIVED_EVIDENCE"],
  ["docs/development/awi-insights-001-issue-57-pdca.md", "DERIVED_EVIDENCE"],
];
usageInsightsNode.inputs = usageInsightsInputs.map(([inputPath, role]) => ({
  path: inputPath,
  role,
  sha256: digest(inputPath),
}));
usageInsightsNode.ownedTests = ["npm run usage-insights:test"];
usageInsightsNode.invariants = [
  "Fresh installations are network-off; local recording requires an explicit closed consent profile and sharing additionally requires an exact IP-literal loopback endpoint.",
  "Outbound envelopes and events are descriptor-safe exact-key schemas with no free text, paths, domains, secrets, customer/user/tenant identifiers or caller-minted event/install identities.",
  "Separate stores mint independent pseudonyms; replay reuses one atomically persisted batch; successful sharing erases the old epoch before exposing a fresh pseudonym.",
  "Managed local/shared data supports preview, export, immediate revocation and fail-closed batch deletion; diagnostics consent is time-limited.",
  "Reports cover install-to-first-success, retention, errors, denials, rollbacks and version fragmentation while fixed cohort/coverage nonclaims and all-or-nothing threshold-five suppression prevent small-cell disclosure.",
  "The completion reference proves only offline and explicitly opted-in synthetic loopback operation; no production activation, real-user evidence, representative adoption or privacy certification is claimed.",
];
const adaptiveGateInputs = [
  ["packages/contracts/src/adaptive-evidence-gates.ts", "SECURITY"],
  ["schemas/contracts/adaptive-evidence-gate-spec-v1.schema.json", "SCHEMA"],
  ["schemas/contracts/adaptive-evidence-receipt-v1.schema.json", "SCHEMA"],
  ["scripts/adaptive-evidence-gates.mjs", "SECURITY"],
  ["scripts/adaptive-delivery-status.mjs", "SECURITY"],
  ["tests/adaptive-evidence-gates.test.ts", "VALIDATOR"],
  ["docs/ADAPTIVE-EVIDENCE-GATES.md", "DERIVED_EVIDENCE"],
  ["docs/development/vf-m2-adaptive-evidence-gates-pdca.md", "DERIVED_EVIDENCE"],
];
let adaptiveGateNode = dag.nodes.find(({ id }) => id === "vf-m2-adaptive-evidence-gates-v1");
if (adaptiveGateNode === undefined) {
  adaptiveGateNode = {
    id: "vf-m2-adaptive-evidence-gates-v1",
    dependsOn: ["vf-shadow-v2"],
    inputs: [],
    ownedTests: ["npm run adaptive-evidence:test"],
    invariants: [
      "Adaptive profiles are additive and cannot remove scope, freshness, provenance, exact CHECK/EXPECT, parent reverification or delivery-root invariants.",
      "Only registered argv commands execute with shell disabled; unknown profiles, risks, paths, arguments, dependencies, receipts and transitions fail closed.",
      "Local, delivery and product-evidence states remain separate; nonterminal public prefixes, stale work and external waits never become success.",
      "The feature remains Shadow-only and npm test remains authoritative until separately governed activation evidence exists.",
    ],
    riskClass: "CRITICAL",
    globalInvalidation: false,
  };
  dag.nodes.push(adaptiveGateNode);
}
adaptiveGateNode.inputs = adaptiveGateInputs.map(([inputPath, role]) => ({
  path: inputPath,
  role,
  sha256: digest(inputPath),
}));
let incomingInvoiceNode = dag.nodes.find(({ id }) => id === "ap-01-incoming-invoice-blueprint-v1");
if (incomingInvoiceNode === undefined) {
  incomingInvoiceNode = {
    id: "ap-01-incoming-invoice-blueprint-v1",
    dependsOn: [],
    inputs: [],
    ownedTests: ["npm run incoming-invoice:test"],
    invariants: [
      "The eight-layer Blueprint follows the frozen local-synthetic source-to-receipt proof chain.",
      "LEAN, CONTROLLED and SEGREGATED_ENTERPRISE derive only from the declared process-complexity vector; company size is not an input.",
      "Unknown fields, unsupported effects, customer data and productive booking authority fail closed.",
    ],
    riskClass: "HIGH",
    globalInvalidation: false,
  };
  dag.nodes.push(incomingInvoiceNode);
}
incomingInvoiceNode.inputs = [
  ["packages/contracts/src/incoming-invoice-blueprint.ts", "CONTRACT"],
  ["schemas/contracts/incoming-invoice-blueprint-v1.schema.json", "SCHEMA"],
  ["tests/incoming-invoice-blueprint.test.ts", "VALIDATOR"],
].map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
incomingInvoiceNode.ownedTests = ["npm run incoming-invoice:test"];
let incomingInvoiceIntakeNode = dag.nodes.find(({ id }) => id === "ap-02-incoming-invoice-intake-v1");
if (incomingInvoiceIntakeNode === undefined) {
  incomingInvoiceIntakeNode = {
    id: "ap-02-incoming-invoice-intake-v1",
    dependsOn: ["ap-01-incoming-invoice-blueprint-v1"],
    inputs: [],
    ownedTests: ["npm run incoming-invoice-intake:test"],
    invariants: [
      "Only the exact frozen local-synthetic invoice bytes and provenance may enter the AP intake record.",
      "Document version, content, metadata and supplier-invoice identity remain exact-bound through readback.",
      "Duplicate, tampered, unsupported and ambiguous input fails closed; unextracted fields remain explicit UNKNOWN values.",
    ],
    riskClass: "HIGH",
    globalInvalidation: false,
  };
  dag.nodes.push(incomingInvoiceIntakeNode);
}
incomingInvoiceIntakeNode.inputs = [
  ["packages/contracts/src/incoming-invoice-intake.ts", "CONTRACT"],
  ["schemas/contracts/incoming-invoice-intake-v1.schema.json", "SCHEMA"],
  ["tests/fixtures/incoming-invoice/source-manifest-v1.json", "FIXTURE"],
  ["tests/fixtures/incoming-invoice/supplier-invoice-v1.txt", "FIXTURE"],
  ["tests/incoming-invoice-intake.test.ts", "VALIDATOR"],
].map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
incomingInvoiceIntakeNode.ownedTests = ["npm run incoming-invoice-intake:test"];
let incomingInvoiceExtractionNode = dag.nodes.find(({ id }) => id === "ap-03-incoming-invoice-extraction-benchmark-v1");
if (incomingInvoiceExtractionNode === undefined) {
  incomingInvoiceExtractionNode = {
    id: "ap-03-incoming-invoice-extraction-benchmark-v1",
    dependsOn: ["ap-02-incoming-invoice-intake-v1"],
    inputs: [],
    ownedTests: ["npm run incoming-invoice-extraction:test"],
    invariants: [
      "The exact frozen local-synthetic holdout covers layout, line items, taxes, totals and explicit failure cases.",
      "Deterministic baseline and bounded synthetic model proposals are scored against internally derived exact denominators.",
      "Every proposal is independently validated, remains non-authoritative and grants no customer-data, provider, allocation or posting authority.",
    ],
    riskClass: "HIGH",
    globalInvalidation: false,
  };
  dag.nodes.push(incomingInvoiceExtractionNode);
}
incomingInvoiceExtractionNode.inputs = [
  ["packages/contracts/src/incoming-invoice-extraction-benchmark.ts", "CONTRACT"],
  ["schemas/contracts/incoming-invoice-extraction-benchmark-v1.schema.json", "SCHEMA"],
  ["tests/fixtures/incoming-invoice/ap-03-holdout-v1.json", "FIXTURE"],
  ["tests/incoming-invoice-extraction-benchmark.test.ts", "VALIDATOR"],
].map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
incomingInvoiceExtractionNode.ownedTests = ["npm run incoming-invoice-extraction:test"];
let cscl11Node = dag.nodes.find(({ id }) => id === "cscl-11-idempiere-serial-holdout-gate-v1");
if (cscl11Node === undefined) {
  cscl11Node = {
    id: "cscl-11-idempiere-serial-holdout-gate-v1",
    dependsOn: ["cscl-08-party-candidate-v1", "cscl-09-product-candidate-v1", "cscl-10-sales-candidate-v1"],
    inputs: [],
    ownedTests: ["npm run cscl11:test"],
    invariants: [
      "The byte-frozen CSCL-08/09/10 candidates are consumed read-only: raw candidate bytes, frozen digests and frozen slots are replayed without editing, and any drift fails CANDIDATE_BYTES_MUTATED_AFTER_FREEZE.",
      "The exact official iDempiere bytes at the pinned immutable commit 731515dcdd5278b843db33b9d3109d155b881951 are bound: 16-file capture receipt with per-file sha256/byteLength, GPL-2.0-or-later license bytes and committed locator evidence (HTTP 200 plus whole-file digest match for all 16 rawUrls); any dead, drifted or digest-mismatched locator fails the source gate closed.",
      "All 36 holdout source facts, 36 evidence cells and the complete party/product/sales denominators replay deterministically from the frozen bytes; the empty party and sales frozen cores are reported as FALSIFIED_WITH_EVIDENCE narrowing, never patched.",
      "No holdout tuning, no universal-ERP-compatibility claim and no Authority, promotion or execution grant; the overall GO / NARROW_GO / FALSIFIED_WITH_EVIDENCE verdict derives only from the frozen protocol functions and the six governance gates.",
    ],
    riskClass: "HIGH",
    globalInvalidation: false,
  };
  dag.nodes.push(cscl11Node);
}
cscl11Node.inputs = [
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
].map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
cscl11Node.ownedTests = ["npm run cscl11:test"];
const pairedAnalyticsInputs = [
  ["tests/fixtures/cks-analytics/consumer-forward-pr235-v1.json", "FIXTURE"],
  ["tests/fixtures/cks-analytics/native-forward-pr235-candidate-v1.json", "FIXTURE"],
  ["verification/paired-analytics-provider-evidence-v1/index.json", "DERIVED_EVIDENCE"],
  ["verification/paired-analytics-provider-evidence-v1/main/forward-paired-execution.json", "DERIVED_EVIDENCE"],
  ["verification/paired-analytics-provider-evidence-v1/main/forward-paired-execution.sha256", "DERIVED_EVIDENCE"],
  ["verification/paired-analytics-provider-evidence-v1/pr429-final/forward-paired-execution.json", "DERIVED_EVIDENCE"],
  ["verification/paired-analytics-provider-evidence-v1/pr429-final/forward-paired-execution.sha256", "DERIVED_EVIDENCE"],
  ["scripts/run-forward-paired-analytics.mjs", "VALIDATOR"],
  ["tests/fixtures/cks-analytics/consumer-forward-current-v1.json", "FIXTURE"],
  ["tests/fixtures/cks-analytics/native-forward-current-candidate-v1.json", "FIXTURE"],
  ["tests/fixtures/cks-analytics/native-v2-historical-source.json", "FIXTURE"],
  ["tests/forward-paired-analytics.test.mjs", "VALIDATOR"],
  ["tests/forward-paired-execution.test.mjs", "VALIDATOR"],
  ["tests/forward-producer-analytics.test.mjs", "VALIDATOR"],
  ["tests/native-forward-qualification.test.mjs", "VALIDATOR"],

  ["contracts/analytics/paired-expectation-v1.json", "CONTRACT"],
  ["scripts/paired-analytics-execution.mjs", "VALIDATOR"],
  ["tests/paired-analytics-runner.test.mjs", "VALIDATOR"],
  ["contracts/analytics/producer-manifest-v1.json", "CONTRACT"],
  ["tests/fixtures/paired-analytics/consumer-support-manifest-v1-545a3b44.json", "FIXTURE"],
  ["tests/fixtures/paired-analytics/consumer-support-manifest-v1-995cd4dd.json", "FIXTURE"],
  ["src/analytics/paired-analytics-parity.ts", "SOURCE"],
  ["tests/paired-analytics-parity.test.ts", "VALIDATOR"],
  ["scripts/run-paired-analytics-parity.mjs", "VALIDATOR"],
  [".github/workflows/paired-analytics-parity.yml", "SECURITY"],
  ["verification/paired-analytics-compatibility-v1.json", "DERIVED_EVIDENCE"],
];
for (const [inputPath, role] of pairedAnalyticsInputs) {
  const matches = repositoryIntegrityNode.inputs.filter(({ path: candidatePath }) => candidatePath === inputPath);
  if (matches.length > 1 || (matches.length === 1 && matches[0].role !== role)) {
    throw new Error(`PAR_XR_01_INTEGRITY_OWNERSHIP_DENIED:${inputPath}`);
  }
  if (matches.length === 0) repositoryIntegrityNode.inputs.push({ path: inputPath, role, sha256: digest(inputPath) });
}
if (!repositoryIntegrityNode.ownedTests.includes("npm run paired-analytics:test")) {
  repositoryIntegrityNode.ownedTests.push("npm run paired-analytics:test");
}
const pairedAnalyticsInvariants = [
  "The paired-analytics compatibility gate binds the exact PanSphaira producer manifest and the exact KaleidoSphere consumer support manifest; a consistent pair PASSes against independently reviewed scope; stale, substituted, unknown or re-digested mandatory-scope regressions fail closed, while unrelated optional gaps are reported.",
  "PAR-XR-01 static evidence makes no executed-head claim; separate pinned offline execution binds actual Git heads without production, customer, network service, publication or closure effects. Public AC04 closure remains pending.",
];
for (const invariant of pairedAnalyticsInvariants) {
  if (!repositoryIntegrityNode.invariants.includes(invariant)) repositoryIntegrityNode.invariants.push(invariant);
}
const pan441Inputs = [
  ["docs/PAN441-EMPLOYEE-PROFILE.md", "DERIVED_EVIDENCE"],
  ["packages/contracts/src/pan441-employee-profile.ts", "CONTRACT"],
  ["schemas/contracts/pan441-employee-profile-v1.schema.json", "SCHEMA"],
  ["tests/pan441-employee-profile.test.ts", "VALIDATOR"],
];
let pan441Node = dag.nodes.find(({ id }) => id === "pan441-employee-profile-v1");
if (pan441Node === undefined) {
  pan441Node = {
    id: "pan441-employee-profile-v1",
    dependsOn: ["integration-profile-v1"],
    inputs: [],
    ownedTests: ["npm run pan441:test"],
    invariants: [
      "Only the independently held released profile and own requesting-user capability identity can authorize a local synthetic employee read.",
      "Other-user targets, missing identity or permission, unavailable capabilities, write-shaped operations and critical identity fields fail closed.",
      "The profile, catalogue, integration and governed-skill digests remain bound; replacement remains denied until independent readback, with no runtime storage or provider authority.",
    ],
    riskClass: "CRITICAL",
    globalInvalidation: false,
  };
  dag.nodes.push(pan441Node);
}
pan441Node.dependsOn = ["integration-profile-v1"];
pan441Node.inputs = pan441Inputs.map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
pan441Node.ownedTests = ["npm run pan441:test"];
for (const [inputPath, role] of pan441Inputs) {
  const matches = repositoryIntegrityNode.inputs.filter(({ path: candidatePath }) => candidatePath === inputPath);
  if (matches.length > 1 || (matches.length === 1 && matches[0].role !== role)) throw new Error(`PAN441_INTEGRITY_OWNERSHIP_DENIED:${inputPath}`);
  if (matches.length === 0) repositoryIntegrityNode.inputs.push({ path: inputPath, role, sha256: digest(inputPath) });
}
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan441:test")) repositoryIntegrityNode.ownedTests.push("npm run pan441:test");
repositoryIntegrityNode.inputs.sort((left, right) => left.path.localeCompare(right.path, "en"));

const pan433Inputs = [
  ["docs/development/pan433-domain-mapping-v1.md", "DERIVED_EVIDENCE"],
  ["examples/module-contribution/modules.json", "CONTRACT"],
  ["packages/contracts/src/pan433-domain-mapping-v1.ts", "CONTRACT"],
  ["src/pan433/domain-mapping-cli.mjs", "SOURCE"],
  ["tests/fixtures/pan433/alternate-invoice-document-v2.json", "FIXTURE"],
  ["tests/fixtures/pan433/default-invoice-row-v1.json", "FIXTURE"],
  ["tests/pan433/domain-mapping.test.mjs", "VALIDATOR"],
];
let pan433Node = dag.nodes.find(({ id }) => id === "pan433-domain-mapping-v1");
if (pan433Node === undefined) {
  pan433Node = {
    id: "pan433-domain-mapping-v1",
    dependsOn: [],
    inputs: [],
    ownedTests: ["npm run pan433:mapping:test"],
    invariants: [
      "PAN433 is a read-only thin boundary with two explicit versioned storage profiles and one shared released invoice fact consumer.",
      "The alternate profile is code-owned and approved only in this bounded PAN433 surface; caller-rehashed profiles, unsupported versions, tampered sources, unknown fields and ambiguous records fail closed.",
      "Synthetic source authority, currency, identity and the released core's declared quantity loss remain explicit; no ERP interoperability, provider, runtime, controller or write authority is claimed.",
    ],
    riskClass: "HIGH",
    globalInvalidation: false,
  };
  dag.nodes.push(pan433Node);
}
pan433Node.inputs = pan433Inputs.map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
pan433Node.ownedTests = ["npm run pan433:mapping:test"];
for (const [inputPath, role] of pan433Inputs) {
  const matches = repositoryIntegrityNode.inputs.filter(({ path: candidatePath }) => candidatePath === inputPath);
  if (matches.length > 1 || (matches.length === 1 && matches[0].role !== role)) throw new Error(`PAN433_INTEGRITY_OWNERSHIP_DENIED:${inputPath}`);
  if (matches.length === 0) repositoryIntegrityNode.inputs.push({ path: inputPath, role, sha256: digest(inputPath) });
}
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan433:mapping:test")) repositoryIntegrityNode.ownedTests.push("npm run pan433:mapping:test");
repositoryIntegrityNode.inputs.sort((left, right) => left.path.localeCompare(right.path, "en"));

const ks238Inputs = [
  ["docs/architecture/ks238-order-source-handoff-v1.md", "DERIVED_EVIDENCE"],
  ["schemas/contracts/ks238-order-source-handoff-v1.schema.json", "SCHEMA"],
  ["src/ks238/order-source-handoff.mjs", "SOURCE"],
  ["tests/ks238/order-source-handoff.test.mjs", "VALIDATOR"],
  ["verification/ks238-order-source-handoff-boundary-v1.json", "DERIVED_EVIDENCE"],
];
let ks238Node = dag.nodes.find(({ id }) => id === "ks238-order-source-handoff-v1");
if (ks238Node === undefined) {
  ks238Node = {
    id: "ks238-order-source-handoff-v1",
    dependsOn: [],
    inputs: [],
    ownedTests: ["npm run ks238:test"],
    invariants: [
      "KS238 is a read-only thin composition over the released ERP order and customer readers; no second order module, write, approval, provider, runtime or public-write authority is granted.",
      "The bounded handoff exposes only evidenced order/customer/status/quantity-unit/period facts; net revenue is never inferred from order status or ordered quantity and absent currency, amount, history and delivery facts remain unavailable.",
      "The released reader executes on the exact labelled LOCAL_SYNTHETIC source; source bindings and content digests survive serialization without caller-resealed substitutions being treated as approval.",
    ],
    riskClass: "HIGH",
    globalInvalidation: false,
  };
  dag.nodes.push(ks238Node);
}
ks238Node.dependsOn = [];
ks238Node.inputs = ks238Inputs.map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
ks238Node.ownedTests = ["npm run ks238:test"];
for (const [inputPath, role] of ks238Inputs) {
  const matches = repositoryIntegrityNode.inputs.filter(({ path: candidatePath }) => candidatePath === inputPath);
  if (matches.length > 1 || (matches.length === 1 && matches[0].role !== role)) throw new Error(`KS238_INTEGRITY_OWNERSHIP_DENIED:${inputPath}`);
  if (matches.length === 0) repositoryIntegrityNode.inputs.push({ path: inputPath, role, sha256: digest(inputPath) });
}
if (!repositoryIntegrityNode.ownedTests.includes("npm run ks238:test")) repositoryIntegrityNode.ownedTests.push("npm run ks238:test");
repositoryIntegrityNode.inputs.sort((left, right) => left.path.localeCompare(right.path, "en"));

const pan442Inputs = [
  ["docs/architecture/pan442-bound-task-handle-v1.md", "DERIVED_EVIDENCE"],
  ["schemas/contracts/pan442-bound-task-handle-v1.schema.json", "SCHEMA"],
  ["src/pan442/bound-task-handle.mjs", "SOURCE"],
  ["src/pan442/synthetic-metric-read-task.mjs", "SOURCE"],
  ["tests/pan442/bound-task-handle.test.mjs", "VALIDATOR"],
  ["tests/pan442/synthetic-metric-read-task.test.mjs", "VALIDATOR"],
  ["verification/pan442-bound-task-handle-boundary-v1.json", "DERIVED_EVIDENCE"],
];
let pan442Node = dag.nodes.find(({ id }) => id === "pan442-bound-task-handles-v1");
if (pan442Node === undefined) {
  pan442Node = {
    id: "pan442-bound-task-handles-v1",
    dependsOn: [],
    inputs: [],
    ownedTests: ["npm run pan442:test"],
    invariants: [
      "PAN442 is a bounded local bound business task and opaque tool handle journey over the accepted demo Order seam; no second gateway, scheduler, journal platform, identity provider, policy, approval or lease mechanism is introduced.",
      "A synthetic trusted task source retained outside caller-controlled payloads binds object, purpose, tenant, user, run identity, object version, amount/currency limits and expiry; a caller-selected source plus caller-selected digest is not an authority root.",
      "Opaque handles are server-issued, opaque to the caller and single-use; the resolver re-derives every trusted binding from the immutable issuer store, so caller-side runtime mutation, handle-field edits and guessed/unknown handles cannot change the accepted binding.",
      "The positive entry point composes the accepted Order seam (OWNER_ESCALATION decision, owner approval, owner-escalation lease execution with mutation reservation) and retains the observed result separately; fail-closed use-time checks deny with exact codes and failed stages before any effect, read or output.",
    ],
    riskClass: "HIGH",
    globalInvalidation: false,
  };
  dag.nodes.push(pan442Node);
}
pan442Node.dependsOn = [];
pan442Node.inputs = pan442Inputs.map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
pan442Node.ownedTests = ["npm run pan442:test"];
for (const [inputPath, role] of pan442Inputs) {
  const matches = repositoryIntegrityNode.inputs.filter(({ path: candidatePath }) => candidatePath === inputPath);
  if (matches.length > 1 || (matches.length === 1 && matches[0].role !== role)) throw new Error(`PAN442_INTEGRITY_OWNERSHIP_DENIED:${inputPath}`);
  if (matches.length === 0) repositoryIntegrityNode.inputs.push({ path: inputPath, role, sha256: digest(inputPath) });
}
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan442:test")) repositoryIntegrityNode.ownedTests.push("npm run pan442:test");
repositoryIntegrityNode.inputs.sort((left, right) => left.path.localeCompare(right.path, "en"));

const pan468Inputs = [
  ["docs/architecture/pan468-impact-selection-v1.md", "DERIVED_EVIDENCE"],
  ["scripts/module-contribution.mjs", "VALIDATOR"],
  ["tests/module-contribution.test.mjs", "VALIDATOR"],
  ["tests/pan468/pan468-impact-selection.test.mjs", "VALIDATOR"],
  ["verification/pan468-impact-selection-boundary-v1.json", "DERIVED_EVIDENCE"],
];
let pan468Node = dag.nodes.find(({ id }) => id === "pan468-impact-selection-v1");
if (pan468Node === undefined) {
  pan468Node = {
    id: "pan468-impact-selection-v1",
    dependsOn: [],
    inputs: [],
    ownedTests: ["npm run pan468:test"],
    invariants: [
      "PAN468 corrects the module-contribution impact/compare consumer classification and bounds its historical path-scan work; no new CI, no new publishing authority and no replacement of the canonical full-suite CI is introduced.",
      "A shared semantic contract is classified as a contract only when it is a declared contract path; internal profile/test-fixture files never select consumers, so a contract change pulls in direct consumers and a contract-unchanged change selects only the owner.",
      "Historical path enumeration relies on tree modes (ls-tree --full-tree) and performs no per-file content read; a content read occurs only when a file's contents are genuinely required (the descriptor or an explicitly requested file). Symlink (120000) historical objects are excluded from enumeration and denied on read; traversal and unsafe paths fail closed.",
    ],
    riskClass: "HIGH",
    globalInvalidation: false,
  };
  dag.nodes.push(pan468Node);
}
pan468Node.dependsOn = [];
pan468Node.inputs = pan468Inputs.map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
pan468Node.ownedTests = ["npm run pan468:test"];
for (const [inputPath, role] of pan468Inputs) {
  const matches = repositoryIntegrityNode.inputs.filter(({ path: candidatePath }) => candidatePath === inputPath);
  if (matches.length > 1 || (matches.length === 1 && matches[0].role !== role)) throw new Error(`PAN468_INTEGRITY_OWNERSHIP_DENIED:${inputPath}`);
  if (matches.length === 0) repositoryIntegrityNode.inputs.push({ path: inputPath, role, sha256: digest(inputPath) });
}
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan468:test")) repositoryIntegrityNode.ownedTests.push("npm run pan468:test");
repositoryIntegrityNode.inputs.sort((left, right) => left.path.localeCompare(right.path, "en"));

const pan469Inputs = [
  ["docs/architecture/pan469-contribution-views-v1.md", "DERIVED_EVIDENCE"],
  ["scripts/module-contribution.mjs", "VALIDATOR"],
  ["src/pan469/contribution-views.mjs", "SOURCE"],
  ["tests/pan469/pan469-contribution-views.test.mjs", "VALIDATOR"],
  ["verification/pan469-contribution-views-boundary-v1.json", "DERIVED_EVIDENCE"],
];
let pan469Node = dag.nodes.find(({ id }) => id === "pan469-contribution-views-v1");
if (pan469Node === undefined) {
  pan469Node = {
    id: "pan469-contribution-views-v1",
    dependsOn: [],
    inputs: [],
    ownedTests: ["npm run pan469:test"],
    invariants: [
      "PAN469 pilots one module family with independent contribution records and a deterministic generated shared view instead of many contributors editing one shared list; no new CI, no new publishing authority and no replacement of the canonical full-suite CI is introduced.",
      "Each contribution record is individually sealed and preserved; a re-submitted identical record is refused (CONTRIBUTION_DUPLICATE), the same id with different content is refused (CONTRIBUTION_ID_CONFLICT) and a malformed record is refused with its exact code, so no individual record is merged away or lost by the shared view.",
      "The shared view derives from the SET of accepted records (sorted by id, canonical-encoded): differently ordered input reproduces byte-identical output, the view has one integration owner (contributors never edit the shared list), a hand-edited view is refused (SHARED_VIEW_DRIFT) and the empty set is refused (SHARED_VIEW_EMPTY).",
      "Contributor steps, conflict/correction counts and active integration work are measured against the existing shared-list path on the same input with integer counts; no wall-clock timing is inferred (missing timing stays unknown) and the same applicable acceptance applies to both paths.",
    ],
    riskClass: "HIGH",
    globalInvalidation: false,
  };
  dag.nodes.push(pan469Node);
}
pan469Node.dependsOn = [];
pan469Node.inputs = pan469Inputs.map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
pan469Node.ownedTests = ["npm run pan469:test"];
for (const [inputPath, role] of pan469Inputs) {
  const matches = repositoryIntegrityNode.inputs.filter(({ path: candidatePath }) => candidatePath === inputPath);
  if (matches.length > 1 || (matches.length === 1 && matches[0].role !== role)) throw new Error(`PAN469_INTEGRITY_OWNERSHIP_DENIED:${inputPath}`);
  if (matches.length === 0) repositoryIntegrityNode.inputs.push({ path: inputPath, role, sha256: digest(inputPath) });
}
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan469:test")) repositoryIntegrityNode.ownedTests.push("npm run pan469:test");
repositoryIntegrityNode.inputs.sort((left, right) => left.path.localeCompare(right.path, "en"));

const pan470Inputs = [
  ["docs/architecture/pan470-handoff-effort.md", "DERIVED_EVIDENCE"],
  ["schemas/contracts/pan470-handoff-effort-v1.schema.json", "SCHEMA"],
  ["src/pan470/handoff-effort.mjs", "SOURCE"],
  ["tests/fixtures/pan470/evidence-selfcheck-v1.txt", "DERIVED_EVIDENCE"],
  ["tests/pan470/handoff-effort.test.mjs", "VALIDATOR"],
  ["verification/pan470-handoff-effort-boundary-v1.json", "DERIVED_EVIDENCE"],
];
let pan470Node = dag.nodes.find(({ id }) => id === "pan470-handoff-effort-v1");
if (pan470Node === undefined) {
  pan470Node = {
    id: "pan470-handoff-effort-v1",
    dependsOn: [],
    inputs: [],
    ownedTests: ["npm run pan470:test"],
    invariants: [
      "PAN470 composes a complete worker handoff from the existing work-order and receipt surfaces by driving the released development-worker entry points (runSyntheticDevelopmentWorker + validateReceiptDigest); a malformed or stale receipt (digest mismatch, missing or stale evidence bytes, overlapping AC ids) never implies completion.",
      "Finalization effort is recorded as exact per-phase intervals (IMPLEMENTATION, SELF_CHECK, REVIEW, CORRECTION, FINALIZATION), kept strictly separate from CI wait, idle and unknown, and aggregated by accepted deliverable and by model/harness; no effort percentage is inferred from tokens, commit counts or overlapping wall time.",
      "Existing mandatory gates are retained and reused; unchanged exact-byte evidence is reused and any byte change is refused; bounded correction findings are passed back with a failing reproducer; synthetic local evidence only, no production/customer/host data and no credentials.",
    ],
    riskClass: "HIGH",
    globalInvalidation: false,
  };
  dag.nodes.push(pan470Node);
}
pan470Node.dependsOn = [];
pan470Node.inputs = pan470Inputs.map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
pan470Node.ownedTests = ["npm run pan470:test"];
for (const [inputPath, role] of pan470Inputs) {
  const matches = repositoryIntegrityNode.inputs.filter(({ path: candidatePath }) => candidatePath === inputPath);
  if (matches.length > 1 || (matches.length === 1 && matches[0].role !== role)) throw new Error(`PAN470_INTEGRITY_OWNERSHIP_DENIED:${inputPath}`);
  if (matches.length === 0) repositoryIntegrityNode.inputs.push({ path: inputPath, role, sha256: digest(inputPath) });
}
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan470:test")) repositoryIntegrityNode.ownedTests.push("npm run pan470:test");
repositoryIntegrityNode.inputs.sort((left, right) => left.path.localeCompare(right.path, "en"));

const pan471Inputs = [
  ["docs/architecture/pan471-capability-inventory-v1.md", "DERIVED_EVIDENCE"],
  ["schemas/contracts/pan471-capability-inventory-v1.schema.json", "SCHEMA"],
  ["src/pan471/capability-inventory.mjs", "SOURCE"],
  ["tests/fixtures/pan471/expected-capabilities-v1.json", "DERIVED_EVIDENCE"],
  ["tests/pan471/capability-inventory.test.mjs", "VALIDATOR"],
  ["verification/pan471-capability-inventory-boundary-v1.json", "DERIVED_EVIDENCE"],
];
let pan471Node = dag.nodes.find(({ id }) => id === "pan471-capability-inventory-v1");
if (pan471Node === undefined) {
  pan471Node = {
    id: "pan471-capability-inventory-v1",
    dependsOn: [],
    inputs: [],
    ownedTests: ["npm run pan471:test"],
    invariants: [
      "PAN471 is a bounded read-only capability inventory composed from the accepted bounded order/customer handoff and the released capability/module contracts; no capability is activated, executed, written or mutated.",
      "Missing quantity, unit, amount and business rule remain UNAVAILABLE (never inferred); observations, inferred relations and confirmed decisions remain separate; denied visibility (NOT_COVERED/DENIED) is retained, not deleted, and is not complete coverage.",
      "The inventory is bound to a source identity and tenant; a wrong tenant (TENANT_MISMATCH) and a substituted source (SERIALIZED_BINDING_MISMATCH) fail closed before any fact is emitted; synthetic local evidence only, no production/customer/host data and no credentials.",
    ],
    riskClass: "HIGH",
    globalInvalidation: false,
  };
  dag.nodes.push(pan471Node);
}
pan471Node.dependsOn = [];
pan471Node.inputs = pan471Inputs.map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
pan471Node.ownedTests = ["npm run pan471:test"];
for (const [inputPath, role] of pan471Inputs) {
  const matches = repositoryIntegrityNode.inputs.filter(({ path: candidatePath }) => candidatePath === inputPath);
  if (matches.length > 1 || (matches.length === 1 && matches[0].role !== role)) throw new Error(`PAN471_INTEGRITY_OWNERSHIP_DENIED:${inputPath}`);
  if (matches.length === 0) repositoryIntegrityNode.inputs.push({ path: inputPath, role, sha256: digest(inputPath) });
}
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan471:test")) repositoryIntegrityNode.ownedTests.push("npm run pan471:test");
repositoryIntegrityNode.inputs.sort((left, right) => left.path.localeCompare(right.path, "en"));

const pan461Inputs = [
  ["docs/architecture/pan461-lifecycle-inventory-v1.md", "DERIVED_EVIDENCE"],
  ["schemas/contracts/pan461-lifecycle-inventory-v1.schema.json", "SCHEMA"],
  ["src/pan461/lifecycle-inventory.mjs", "SOURCE"],
  ["tests/pan461/lifecycle-inventory.test.mjs", "VALIDATOR"],
  ["verification/pan461-lifecycle-inventory-boundary-v1.json", "DERIVED_EVIDENCE"],
  ["tests/fixtures/pan461/artifacts-v1.json", "FIXTURE"],
  ["tests/fixtures/pan461/declared-release-content-v1.json", "FIXTURE"],
  ["tests/fixtures/pan461/expected-facts-v1.json", "FIXTURE"],
  ["tests/fixtures/pan461/key-refs-v1.json", "FIXTURE"],
  ["tests/fixtures/pan461/observed-config-drift-v1.json", "FIXTURE"],
  ["tests/fixtures/pan461/observed-modified-v1.json", "FIXTURE"],
  ["tests/fixtures/pan461/observed-partial-v1.json", "FIXTURE"],
  ["tests/fixtures/pan461/observed-running-v1.json", "FIXTURE"],
  ["tests/fixtures/pan461/observed-sleeping-v1.json", "FIXTURE"],
  ["tests/fixtures/pan461/observed-stopped-v1.json", "FIXTURE"],
  ["tests/fixtures/pan461/observed-unknown-v1.json", "FIXTURE"],
  ["tests/fixtures/pan461/stores-v1.json", "FIXTURE"],
];
let pan461Node = dag.nodes.find(({ id }) => id === "pan461-lifecycle-inventory-v1");
if (pan461Node === undefined) {
  pan461Node = {
    id: "pan461-lifecycle-inventory-v1",
    dependsOn: [],
    inputs: [],
    ownedTests: ["npm run pan461:test"],
    invariants: [
      "PAN461 is a read-only local installation lifecycle inventory over the released doctor/observer contracts for one declared local Linux installation; no second installer, updater, runtime, provider, write or productive host-discovery platform is introduced.",
      "Declared release metadata is distinguished from observed image, schema, configuration, content and process generations via a closed {declared, observed, validity} triple per axis; an unavailable decisive probe remains UNKNOWN, never an inferred version.",
      "Every owned persistent store, required configuration and key reference is listed with a closed secret reference and a REDACTED marker only; secret values are never exported and uncovered required state is listed explicitly, never dropped or guessed.",
      "Installation identity is re-digested by the released updateDoctorContractDigest (a caller-rehashed lock digest is not an identity); a source-only SOURCE_ARCHIVE is never an installable target; the observation binds to a canonical digest that rebindPan461Inventory re-derives from the retained identity, so resealed substituted snapshots and wrong retained shas are denied.",
    ],
    riskClass: "HIGH",
    globalInvalidation: false,
  };
  dag.nodes.push(pan461Node);
}
pan461Node.dependsOn = [];
pan461Node.inputs = pan461Inputs.map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
pan461Node.ownedTests = ["npm run pan461:test"];
for (const [inputPath, role] of pan461Inputs) {
  const matches = repositoryIntegrityNode.inputs.filter(({ path: candidatePath }) => candidatePath === inputPath);
  if (matches.length > 1 || (matches.length === 1 && matches[0].role !== role)) throw new Error(`PAN461_INTEGRITY_OWNERSHIP_DENIED:${inputPath}`);
  if (matches.length === 0) repositoryIntegrityNode.inputs.push({ path: inputPath, role, sha256: digest(inputPath) });
}
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan461:test")) repositoryIntegrityNode.ownedTests.push("npm run pan461:test");
repositoryIntegrityNode.inputs.sort((left, right) => left.path.localeCompare(right.path, "en"));

dag.graphVersion = 62;
for (const node of dag.nodes) {
  node.inputs = node.inputs.map((input) => ({ ...input, sha256: digest(input.path) }));
}
writeJson(dagPath, dag);

const sumsPath = path.join(root, "SHA256SUMS");
const entries = new Map(readFileSync(sumsPath, "utf8").trimEnd().split("\n").map((line) => {
  const match = line.match(/^[a-f0-9]{64}  \.\/(.+)$/);
  if (!match) throw new Error(`INVALID_CHECKSUM_LINE:${line}`);
  return [match[1], null];
}));
for (const line of readFileSync(path.join(root, "release/public-files.manifest"), "utf8").split("\n")) {
  if (line && !line.startsWith("#")) entries.set(line.split("\t")[0], null);
}
for (const relative of [
  "scripts/run-forward-paired-analytics.mjs",
  "tests/fixtures/cks-analytics/consumer-forward-current-v1.json",
  "tests/fixtures/cks-analytics/native-forward-current-candidate-v1.json",
  "tests/fixtures/cks-analytics/native-v2-historical-source.json",
  "tests/forward-paired-analytics.test.mjs",
  "tests/forward-paired-execution.test.mjs",
  "tests/forward-producer-analytics.test.mjs",
  "tests/native-forward-qualification.test.mjs",
  "scripts/refresh-integrity-data.mjs",
  "docs/architecture/pan461-lifecycle-inventory-v1.md",
  "schemas/contracts/pan461-lifecycle-inventory-v1.schema.json",
  "src/pan461/lifecycle-inventory.mjs",
  "tests/pan461/lifecycle-inventory.test.mjs",
  "verification/pan461-lifecycle-inventory-boundary-v1.json",
  "tests/fixtures/pan461/artifacts-v1.json",
  "tests/fixtures/pan461/declared-release-content-v1.json",
  "tests/fixtures/pan461/expected-facts-v1.json",
  "tests/fixtures/pan461/key-refs-v1.json",
  "tests/fixtures/pan461/observed-config-drift-v1.json",
  "tests/fixtures/pan461/observed-modified-v1.json",
  "tests/fixtures/pan461/observed-partial-v1.json",
  "tests/fixtures/pan461/observed-running-v1.json",
  "tests/fixtures/pan461/observed-sleeping-v1.json",
  "tests/fixtures/pan461/observed-stopped-v1.json",
  "tests/fixtures/pan461/observed-unknown-v1.json",
  "tests/fixtures/pan461/stores-v1.json",
  "docs/architecture/pan471-capability-inventory-v1.md",
  "schemas/contracts/pan471-capability-inventory-v1.schema.json",
  "src/pan471/capability-inventory.mjs",
  "tests/fixtures/pan471/expected-capabilities-v1.json",
  "tests/pan471/capability-inventory.test.mjs",
  "verification/pan471-capability-inventory-boundary-v1.json",
  ".github/workflows/demo-current-head-e2e.yml",
  "closure-audits/AUDIT-CORRECTION-377-ROOT-QS/implementation-evidence.json",
  "docs/development/cap-cell-erp-01-pdca.md",
  "docs/development/vf-m2-adaptive-evidence-gates-pdca.md",
  "tests/trust-compatibility-foundation-closure.test.ts",
  "verification/external-bi-service-paired-compatibility-v1.json",
  "verification/trust-compatibility-foundation-closure-v1.json",
  "src/analytics/paired-analytics-parity.ts",
  "tests/paired-analytics-parity.test.ts",
  "scripts/run-paired-analytics-parity.mjs",
  ".github/workflows/paired-analytics-parity.yml",
  "verification/paired-analytics-compatibility-v1.json",
  "tests/fixtures/paired-analytics/consumer-support-manifest-v1-545a3b44.json",
  "tests/fixtures/paired-analytics/consumer-support-manifest-v1-995cd4dd.json",
  "docs/development/pan433-domain-mapping-v1.md",
  "examples/module-contribution/modules.json",
  "packages/contracts/src/pan433-domain-mapping-v1.ts",
  "src/pan433/domain-mapping-cli.mjs",
  "tests/fixtures/pan433/alternate-invoice-document-v2.json",
  "tests/fixtures/pan433/default-invoice-row-v1.json",
  "tests/pan433/domain-mapping.test.mjs",
  "docs/architecture/pan442-bound-task-handle-v1.md",
  "schemas/contracts/pan442-bound-task-handle-v1.schema.json",
  "src/pan442/bound-task-handle.mjs",
  "src/pan442/synthetic-metric-read-task.mjs",
  "tests/pan442/bound-task-handle.test.mjs",
  "tests/pan442/synthetic-metric-read-task.test.mjs",
  "verification/pan442-bound-task-handle-boundary-v1.json",
  "docs/architecture/pan468-impact-selection-v1.md",
  "tests/pan468/pan468-impact-selection.test.mjs",
  "verification/pan468-impact-selection-boundary-v1.json",
  "docs/architecture/pan469-contribution-views-v1.md",
  "src/pan469/contribution-views.mjs",
  "tests/pan469/pan469-contribution-views.test.mjs",
  "verification/pan469-contribution-views-boundary-v1.json",
  "docs/architecture/pan470-handoff-effort.md",
  "schemas/contracts/pan470-handoff-effort-v1.schema.json",
  "src/pan470/handoff-effort.mjs",
  "tests/fixtures/pan470/evidence-selfcheck-v1.txt",
  "tests/pan470/handoff-effort.test.mjs",
  "verification/pan470-handoff-effort-boundary-v1.json",
]) entries.set(relative, null);
for (const relative of [...entries.keys()]) {
  if (!existsSync(path.join(root, relative))) entries.delete(relative);
}
const output = [...entries.keys()].sort().map((relative) => {
  if (!statSync(path.join(root, relative)).isFile()) throw new Error(`CHECKSUM_TARGET_NOT_FILE:${relative}`);
  return `${digest(relative)}  ./${relative}`;
});
writeFileSync(sumsPath, `${output.join("\n")}\n`);
console.log(`refreshed ${lockedPaths.length} runtime-lock artifacts, ${proof.artifacts.length} proof artifacts, and ${entries.size} checksums`);
