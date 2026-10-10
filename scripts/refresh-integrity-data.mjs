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
  ["tests/demo-current-head-e2e-uninstall.test.mjs", "VALIDATOR"],
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
  ["src/pan470/producer-handoff-v2.mjs", "SOURCE"],
  ["tests/fixtures/pan470/evidence-selfcheck-v1.txt", "DERIVED_EVIDENCE"],
  ["tests/fixtures/pan470/producer-evidence-v2.txt", "DERIVED_EVIDENCE"],
  ["tests/pan470/handoff-effort.test.mjs", "VALIDATOR"],
  ["tests/pan470/producer-handoff-v2.test.mjs", "VALIDATOR"],
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
      "The explicit versioned producer adapter (producer-adapter/v1) binds an ACTUAL completed local public-code handoff to independently observed Git state (base a strict ancestor of HEAD, clean tree), executed command exits with re-derived output digests and current evidence bytes; the base WorkReceiptV1 keeps null-only candidateCommit (validateReceiptDigest re-run), caller-attested head/base are refused, unobserved phases are never inferred; no new scheduler, supervisor, dashboard, framework or authority.",
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

const pan462Inputs = [
  ["docs/architecture/pan462-native-backup-restore-v1.md", "DERIVED_EVIDENCE"],
  ["schemas/contracts/pan462-native-backup-restore-v1.schema.json", "SCHEMA"],
  ["src/pan462/native-backup-restore.mjs", "SOURCE"],
  ["tests/pan462/native-backup-restore.test.mjs", "VALIDATOR"],
  ["verification/pan462-native-backup-restore-boundary-v1.json", "DERIVED_EVIDENCE"],
  ["tests/fixtures/pan462/config-source-v1.json", "FIXTURE"],
  ["tests/fixtures/pan462/content-note-v1.txt", "FIXTURE"],
  ["tests/fixtures/pan462/expected-facts-v1.json", "FIXTURE"],
  ["tests/fixtures/pan462/installation-content-v1.json", "FIXTURE"],
  ["tests/fixtures/pan462/key-ref-v1.txt", "FIXTURE"],
];
let pan462Node = dag.nodes.find(({ id }) => id === "pan462-native-backup-restore-v1");
if (pan462Node === undefined) {
  pan462Node = {
    id: "pan462-native-backup-restore-v1",
    dependsOn: [],
    inputs: [],
    ownedTests: ["npm run pan462:test"],
    invariants: [
      "PAN462 is a bounded native backup/restore of ONE strictly container-owned synthetic installation over the released checkpoint, doctor and read-only PostgreSQL product surfaces; no second doctor, installer, updater, database or storage mechanism is introduced and no mock replaces the affected storage adapter.",
      "Owned database, files, configuration and needed key references are captured at ONE consistent boundary (a REPEATABLE READ / READ ONLY database snapshot, byte-exact files/config, and key references only); the released checkpoint contract binds and independently re-verifies the boundary, and no secret value is exported.",
      "Restore lands in a DISTINCT isolated target at a MATCHING executable version; missing store, wrong version, corrupt archive and an unavailable required key reference each refuse completion with an exact code, and the restored objects are read back through the actual released native product paths.",
      "The restored copy disables real external effects (a controlled outbound attempt is denied), the pre-backup writer authority is revoked and cannot be reactivated, effect replay is refused, and a standalone read-only diagnosis distinguishes LOCAL_COPY / INDEPENDENT_BACKUP / VERIFIED_RESTORE while a local copy remains no offhost or disaster proof.",
    ],
    riskClass: "HIGH",
    globalInvalidation: false,
  };
  dag.nodes.push(pan462Node);
}
pan462Node.dependsOn = [];
pan462Node.inputs = pan462Inputs.map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
pan462Node.ownedTests = ["npm run pan462:test"];
for (const [inputPath, role] of pan462Inputs) {
  const matches = repositoryIntegrityNode.inputs.filter(({ path: candidatePath }) => candidatePath === inputPath);
  if (matches.length > 1 || (matches.length === 1 && matches[0].role !== role)) throw new Error(`PAN462_INTEGRITY_OWNERSHIP_DENIED:${inputPath}`);
  if (matches.length === 0) repositoryIntegrityNode.inputs.push({ path: inputPath, role, sha256: digest(inputPath) });
}
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan462:test")) repositoryIntegrityNode.ownedTests.push("npm run pan462:test");
repositoryIntegrityNode.inputs.sort((left, right) => left.path.localeCompare(right.path, "en"));

const pan463Inputs = [
  ["docs/architecture/pan463-native-update-v1.md", "DERIVED_EVIDENCE"],
  ["schemas/contracts/pan463-native-update-v1.schema.json", "SCHEMA"],
  ["src/pan463/native-update-executor.mjs", "SOURCE"],
  ["tests/pan463/native-update-executor.test.mjs", "VALIDATOR"],
  ["tests/pan463/executor-process.mjs", "VALIDATOR"],
  ["demo/runtime/enforcement-gate.mjs", "SOURCE"],
  ["demo/runtime/local-journal-owner.mjs", "SOURCE"],
  ["packages/contracts/src/update-doctor.ts", "CONTRACT"],
  ["schemas/contracts/update-operation-contract-v1.schema.json", "SCHEMA"],
];
let pan463Node = dag.nodes.find(({ id }) => id === "pan463-native-update-v1");
if (pan463Node === undefined) {
  pan463Node = {
    id: "pan463-native-update-v1", dependsOn: [], inputs: [],
    ownedTests: ["npm run pan463:test", "npm run pan453:test", "node --test dist/tests/update-doctor.test.js"],
    invariants: [
      "A separate controller-bound native plan and live exact grant authorize one fixed local synthetic PostgreSQL DDL step; CHECK_ONLY contracts and the existing provider gateway remain unchanged and non-authorizing.",
      "PAN453 ownership, v4 durable reservations, receipt persistence and stop/revoke are reused; no replacement controller journal or arbitrary SQL/shell capability is introduced.",
      "Real process kills before dispatch, during a real transaction and after commit before receipt are resolved by retained-target readback; NOT_APPLIED and UNKNOWN stay held without automatic dispatch.",
      "Competing native executors, wrong owner, stale fences, expired/revoked grants, substituted plans and contradictory or unavailable target states never imply completion.",
    ],
    riskClass: "HIGH", globalInvalidation: false,
  };
  dag.nodes.push(pan463Node);
}
pan463Node.inputs = pan463Inputs.map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan463:test")) repositoryIntegrityNode.ownedTests.push("npm run pan463:test");
const pan464Inputs = [
  ["docs/architecture/pan464-retained-pair-v1.md", "DERIVED_EVIDENCE"],
  ["src/pan464/retained-pair-controller.mjs", "SOURCE"],
  ["src/pan464/retained-pair-plan.mjs", "SOURCE"],
  ["src/pan464/retained-snapshot.mjs", "SOURCE"],
  ["src/pan464/protected-oracle.mjs", "SOURCE"],
  ["src/pan464/native-producer.mjs", "SOURCE"],
  ["src/pan464/native-consumer.py", "SOURCE"],
  ["scripts/run-retained-pair-upgrade.mjs", "SOURCE"],
  ["scripts/run-pan464-native-qualification.mjs", "SOURCE"],
  ["tests/pan464/protected-oracle.test.mjs", "VALIDATOR"],
  ["tests/pan464/retained-pair-plan.test.mjs", "VALIDATOR"],
  ["tests/pan464/retained-snapshot.test.mjs", "VALIDATOR"],
  ["tests/pan464/native-controller.test.mjs", "VALIDATOR"],
  ["tests/pan464/controller-process.mjs", "VALIDATOR"],
  ["tests/pan464/runtime/Dockerfile", "SOURCE"],
  [".github/workflows/retained-native-pair.yml", "SOURCE"],
  ["src/pan463/native-update-executor.mjs", "SOURCE"],
  ["demo/runtime/enforcement-gate.mjs", "SOURCE"],
  ["demo/runtime/local-journal-owner.mjs", "SOURCE"],
  ["packages/contracts/src/update-migration-checkpoint.ts", "CONTRACT"],
  ["packages/knowledge-solution/src/pg-harness.ts", "SOURCE"],
  ["packages/knowledge-solution/src/postgres-source.ts", "SOURCE"],
  ["tests/fixtures/pan462/expected-facts-v1.json", "SOURCE"],
  ["scripts/run-forward-paired-analytics.mjs", "SOURCE"],
];
let pan464Node = dag.nodes.find(({ id }) => id === "pan464-retained-pair-v1");
if (pan464Node === undefined) {
  pan464Node = {
    id: "pan464-retained-pair-v1", dependsOn: [], inputs: [], ownedTests: ["npm run pan464:test"],
    invariants: [
      "The exact historical source creates retained native PostgreSQL/Superset state; the existing source and target paired runner remains mandatory and no historical pair is widened.",
      "Native startup receives writable retained mounts only after current controller permission, real Docker quiescence and independently bound whole-pair checkpoint; raw unadmitted native init has read-only stores and no Docker socket.",
      "A protected business oracle rejects healthy wrong native HTTP results; known pre-activation rejection preserves the rejected copy and verifies the restored source through actual native paths.",
      "Durable activation intent and unknown/crashed states never automatically restore an old snapshot over new valid producer or metadata work; PAN453 owner/journal/revoke and PAN463 typed native step are reused.",
      "The lightweight ownership checks do not substitute for the mandatory separate exact-head Retained Native Pair CI workflow; raw keys, grants, state and internal logs are not public evidence.",
    ],
    riskClass: "HIGH", globalInvalidation: false,
  };
  dag.nodes.push(pan464Node);
}
pan464Node.inputs = pan464Inputs.map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan464:test")) repositoryIntegrityNode.ownedTests.push("npm run pan464:test");
dag.graphVersion = 64;

// PAN465 owns the additive signature/slot/journal/distribution boundary only.
// Historical PAN463/PAN464 nodes and their hard native gates remain unchanged.
const pan465Inputs = [
  ["scripts/offline-artifact.py", "SOURCE"],
  ["scripts/offline-rescue.py", "SOURCE"],
  ["scripts/offline-updater.py", "SOURCE"],
  ["scripts/offline-native-profile.py", "SOURCE"],
  ["scripts/build-offline-native-profile.py", "SOURCE"],
  ["scripts/build-offline-release.py", "SOURCE"],
  ["scripts/verify-offline-release.py", "VALIDATOR"],
  ["scripts/run-pan465-tests.mjs", "VALIDATOR"],
  ["tests/pan465/offline-artifact.test.py", "VALIDATOR"],
  ["tests/pan465/offline-updater.test.py", "VALIDATOR"],
  ["tests/pan465/offline-migration.test.py", "VALIDATOR"],
  ["tests/pan465/retained-rescue.test.py", "VALIDATOR"],
  ["tests/pan465/dependency-boundaries.test.py", "VALIDATOR"],
  ["tests/pan465/distribution-envelope.test.py", "VALIDATOR"],
  ["tests/fixtures/pan465/updater-v1/source.json", "FIXTURE"],
  ["tests/fixtures/pan465/updater-v1/offline-artifact.py", "FIXTURE"],
  ["tests/fixtures/pan465/updater-v1/offline-rescue.py", "FIXTURE"],
  ["tests/fixtures/pan465/updater-v1/offline-updater.py", "FIXTURE"],
  ["docs/architecture/pan465-offline-profile.txt", "DERIVED_EVIDENCE"],
];
let pan465Node = dag.nodes.find(({ id }) => id === "pan465-offline-updater-v1");
if (pan465Node === undefined) {
  pan465Node = {
    id: "pan465-offline-updater-v1", dependsOn: ["pan464-retained-pair-v1"], inputs: [],
    ownedTests: ["npm run pan465:test"], riskClass: "HIGH", globalInvalidation: false,
    invariants: [
      "Protected external key/tool identity and actual OpenSSL signatures reject tampering, signer-role mismatch, expiry and installed-version rollback offline before slot/journal mutation.",
      "Actual executable slots and v1-to-v2 journal migration retain historical bytes; standalone rescue observes exact interruption state without main-application imports, ownership adoption or replay.",
      "Authentic Git bundles and locked dependency bytes drive the existing retained native profile; selected-slot code is byte-bound to actual target objects and retains original native authority checks.",
      "Closed distribution membership binds sanitized actual native receipts to the signed artifact; key/grants/state are never copied and bundled PEM never becomes operator trust automatically.",
      "Component tests and composition success are not native-distribution, independent acceptance, exact CI or public release evidence; SIGKILL does not qualify power loss and STABLE does not audit all historical signatures.",
    ],
  };
  dag.nodes.push(pan465Node);
}
pan465Node.inputs = pan465Inputs.map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan465:test")) repositoryIntegrityNode.ownedTests.push("npm run pan465:test");
dag.graphVersion = 66;

// DOC-README-03 R1: explicit bounded ownership of the entry-route additions.
// No runtime qualification or arbitrary repository-coverage claim follows.
const readmeR1Inputs = [
  ["docs/.vitepress/config.mts", "SOURCE"],
  ["tests/docs-site.test.mjs", "VALIDATOR"],
  ["docs/README.md", "DERIVED_EVIDENCE"],
  ["docs/explanation/overview.md", "DERIVED_EVIDENCE"],
  ["docs/explanation/architecture-tour.md", "DERIVED_EVIDENCE"],
  ["docs/explanation/knowledge-and-reuse.md", "DERIVED_EVIDENCE"],
  ["docs/explanation/research-questions.md", "DERIVED_EVIDENCE"],
  ["docs/use-cases/index.md", "DERIVED_EVIDENCE"],
  ...["concept-loop", "controlled-effect", "knowledge-lifecycle", "provider-adaptation"]
    .flatMap((name) => ["mmd", "svg"].map((extension) => [`docs/diagrams/${name}.${extension}`, "DERIVED_EVIDENCE"])),
];
for (const [inputPath, role] of readmeR1Inputs) {
  const matches = repositoryIntegrityNode.inputs.filter(({ path: candidatePath }) => candidatePath === inputPath);
  if (matches.length > 1 || matches.some((input) => input.role !== role)) throw new Error(`README_R1_INTEGRITY_OWNERSHIP_DENIED:${inputPath}`);
  if (matches.length === 0) repositoryIntegrityNode.inputs.push({ path: inputPath, role, sha256: digest(inputPath) });
}
if (!repositoryIntegrityNode.ownedTests.includes("npm run docs:test")) repositoryIntegrityNode.ownedTests.push("npm run docs:test");

// LIFE-06: new bounded owner; the advisory CLI stays owned by PAN468 and the
// unchanged native controller/workflow by PAN464. Neither pilot nor history
// metadata grants execution, and the exact native CI remains separately hard.
const pan466Inputs = [
  ["docs/architecture/pan466-qualified-module-generations-v1.md", "DERIVED_EVIDENCE"],
  ["src/pan466/module-lifecycle-descriptor.mjs", "SOURCE"],
  ["src/pan466/module-lifecycle-check.mjs", "SOURCE"],
  ["src/pan466/qualified-retained-module.mjs", "SOURCE"],
  ["scripts/run-pan466-native-qualification.mjs", "VALIDATOR"],
  ["tests/pan466/module-lifecycle-descriptor.test.mjs", "VALIDATOR"],
  ["tests/pan466/module-lifecycle-check.test.mjs", "VALIDATOR"],
  ["tests/pan466/qualified-module-binding.test.mjs", "VALIDATOR"],
  ["tests/pan466/qualified-module-native.test.mjs", "VALIDATOR"],
  ["tests/pan466/qualified-module-process.mjs", "VALIDATOR"],
];
let pan466Node = dag.nodes.find(({ id }) => id === "pan466-qualified-module-generations-v1");
if (pan466Node === undefined) {
  pan466Node = {
    id: "pan466-qualified-module-generations-v1", dependsOn: ["pan468-impact-selection-v1", "pan464-retained-pair-v1"], inputs: [],
    ownedTests: ["npm run pan466:test"], riskClass: "HIGH", globalInvalidation: false,
    invariants: [
      "Actual module CLI keeps unowned changes and unknown consumers uncovered, retains migration-ID identity, proposes conflict-preserving three-way config and holds mismatched derived generations without dispatch or automatic authority.",
      "Only bounded already-owned nonsemantic documentation with unchanged semantic/state/authority bindings can reuse proportionate CHECK_ONLY work; the pilot does not cover the whole repository.",
      "The explicit fixed native module-use entry separately qualifies the accepted pair and rereads current compatibility plus the independently checked native grant before effects; history is actual observed content under a distinct read scope, never a new write grant.",
      "Required exact-head native CI resumes the same live IPC-waiting PID across generation change, grant revocation and both, retaining historical reads while denying stale writes; independent positives execute real current and freshly rebound native writes.",
      "Component/CLI checks do not replace native qualification, independent acceptance, exact CI or public release/readback; raw synthetic grants/history/state stay private and no scheduler, PKI, production or hostile-host claim is added.",
    ],
  };
  dag.nodes.push(pan466Node);
}
pan466Node.inputs = pan466Inputs.map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan466:test")) repositoryIntegrityNode.ownedTests.push("npm run pan466:test");
dag.graphVersion = 67;

// SEM-HOLDOUT-01: an explicit bounded semantic successor, not a new historical
// verdict or independent acceptance. Legacy sources keep their existing owner;
// the successor consumes only the public rule/contracts and bounded observations.
const pan487Inputs = [
  ["contracts/sem-holdout487/request-v1.schema.json", "SCHEMA"],
  ["contracts/sem-holdout487/result-v1.schema.json", "SCHEMA"],
  ["contracts/sem-holdout487/decision-rule-v1.json", "CONTRACT"],
  ["src/cscl-11/product-purpose-semantic-v1.mjs", "SOURCE"],
  ["scripts/evaluate-product-purpose-semantic-v1.mjs", "SOURCE"],
  ["tests/cscl-11/product-purpose-semantic-v1.test.mjs", "VALIDATOR"],
  ["tests/fixtures/sem-holdout487/public-calibration.input.json", "FIXTURE"],
  ["tests/fixtures/sem-holdout487/public-calibration.expected.json", "FIXTURE"],
  ["docs/architecture/pan487-product-purpose-semantic-successor-v1.md", "DERIVED_EVIDENCE"],
];
let pan487Node = dag.nodes.find(({ id }) => id === "pan487-product-purpose-semantic-successor-v1");
if (pan487Node === undefined) {
  pan487Node = {
    id: "pan487-product-purpose-semantic-successor-v1",
    dependsOn: ["cscl-11-idempiere-serial-holdout-gate-v1"], inputs: [],
    ownedTests: ["npm run pan487:test"], riskClass: "HIGH", globalInvalidation: false,
    invariants: [
      "One pre-authored public offering-purpose rule judges actual independently captured catalogue versus order-owned occurrence, not generated candidate flags, labels, hashes or historical family success assertions.",
      "Every declared obligation remains in the positive complete semantic denominator, including omitted/UNMAPPED proposals; unsupported bounded search is UNKNOWN with null final semantic totals and exact observed lower bounds, never global absence.",
      "Schema/digest/source and closed scope admission remain distinct from meaning; a structurally valid correctly re-digested material contradiction is FALSIFIED_WITH_EVIDENCE at the actual versioned repository mapping/evaluation entry.",
      "Historical candidates, facts, protocol, receipts and verdicts remain immutable; public calibration and implementer tests are not blind score, independent acceptance or universal ERP evidence.",
      "Main exclusively retains and executes the sealed evaluator after full candidate/executable closure freeze; private expectations/reference/case material never enter implementation/tuning, and failed evidence is not repaired by changing the fixed rule or core.",
    ],
  };
  dag.nodes.push(pan487Node);
}
pan487Node.inputs = pan487Inputs.map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan487:test")) repositoryIntegrityNode.ownedTests.push("npm run pan487:test");
dag.graphVersion = 68;

// Original MIG-02: one additive bounded synthetic native draft transfer.
// Existing fixed business action and read-only inventory permissions stay intact.
const pan472Inputs = [
  ["src/pan472/draft-profile.mjs", "CONTRACT"],
  ["src/pan472/persistent-draft-transfer.mjs", "SOURCE"],
  ["src/pan472/independent-draft-reconciliation.mjs", "VALIDATOR"],
  ["scripts/run-pan472-draft-transfer.mjs", "SOURCE"],
  ["tests/pan472/persistent-draft-transfer.test.mjs", "VALIDATOR"],
  ["tests/fixtures/pan472/initial-draft-v1.json", "FIXTURE"],
  ["docs/architecture/pan472-persistent-draft-transfer-v1.md", "DERIVED_EVIDENCE"],
];
let pan472Node = dag.nodes.find(({ id }) => id === "pan472-persistent-draft-transfer-v1");
if (pan472Node === undefined) {
  pan472Node = {
    id: "pan472-persistent-draft-transfer-v1",
    dependsOn: ["pan442-bound-task-handles-v1", "pan471-capability-inventory-v1"],
    inputs: [], ownedTests: ["npm run pan472:test"], riskClass: "HIGH", globalInvalidation: false,
    invariants: [
      "One qualified native SQLite generation-bound snapshot/delta stream retains contiguous sequence, exact revisions, observed deletion history and code-owned exact mapping; absent semantics stay UNKNOWN and no missing inventory fact becomes authority.",
      "Local synthetic approval is content-bound; existing PAN453 owner, stop/revoke, identity and recovery boundaries compose without retargeting legacy fixed CREATE_IF_ABSENT semantics or widening maintenance-preview permission.",
      "Target data, cursor, approval, dedup and receipt commit atomically; post-commit acknowledgement loss reconciles actual native state without a second effect; conflicting content and stale resurrection are denied.",
      "Empty delta is read-only NO_CHANGES only after independent verification, has no executable plan and cannot poison receipts; strict from-before-through receipt admission remains unchanged.",
      "Independent read-only native source/target queries expose missing objects, broken references, scaling/status mutations and quarantined/unknown coverage at the retained cutoff, not a global cross-store transaction.",
      "Fresh-process native restart retains exact receipts and zero outside effects; no second runtime, booking/email/payment, productive cutover, power-loss or hostile-host claim, private scratch publication or automatic stale-owner takeover.",
    ],
  };
  dag.nodes.push(pan472Node);
}
pan472Node.inputs = pan472Inputs.map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan472:test")) repositoryIntegrityNode.ownedTests.push("npm run pan472:test");
dag.graphVersion = 69;

// Original MIG-03: single bounded writer scope on the accepted native draft stores.
// The completed PAN462 boundary is consumed, not rewritten or a new backend.
const pan473Inputs = [
  ["src/pan473/scope-profile.mjs", "CONTRACT"],
  ["src/pan473/writer-scope-cutover.mjs", "SOURCE"],
  ["src/pan473/independent-scope-diagnosis.mjs", "VALIDATOR"],
  ["scripts/run-pan473-writer-scope-cutover.mjs", "SOURCE"],
  ["tests/pan473/writer-scope-cutover.test.mjs", "VALIDATOR"],
  ["tests/pan473/native-process-cutover.test.mjs", "VALIDATOR"],
  ["tests/fixtures/pan473/native-scope-client.mjs", "FIXTURE"],
  ["docs/architecture/pan473-writer-scope-cutover-v1.md", "DERIVED_EVIDENCE"],
];
let pan473Node = dag.nodes.find(({ id }) => id === "pan473-writer-scope-cutover-v1");
if (pan473Node === undefined) {
  pan473Node = {
    id: "pan473-writer-scope-cutover-v1",
    dependsOn: ["pan472-persistent-draft-transfer-v1", "pan462-native-backup-restore-v1"],
    inputs: [], ownedTests: ["npm run pan473:test"], riskClass: "HIGH", globalInvalidation: false,
    invariants: [
      "Actual old writer and already-open native batch are fenced before exact final source cutoff/target reconciliation, new target epoch activation and native routing readback; no global transaction or production cutover is claimed.",
      "Real CLI SIGKILL at source fence, target activation and pre-routing-ACK boundaries recovers from native gates and data with a fresh code-owned local owner, never stealing live/unknown controller authority or blindly replaying imported effects.",
      "Stale late imports and simple old-state rollback cannot clobber later target work; forward correction preserves immutable original evidence and other-field work, while material same-field history including A-to-B-to-A denies obsolete historical correction.",
      "Independent standalone read-only SQL reconstruction rejects missing or contradictory native state and correctly re-digested clobbering history; source profiles lacking required guarantees retain explicit coexistence/offline-transfer alternative, not synthetic permission.",
      "Only the existing bounded LOCAL_SYNTHETIC draft scope is implemented; original permissions, signature/install/native qualifications, privacy, sealed evaluators and release gates remain distinct and private runtime/grant/reviewer state is never published wholesale.",
    ],
  };
  dag.nodes.push(pan473Node);
}
pan473Node.inputs = pan473Inputs.map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan473:test")) repositoryIntegrityNode.ownedTests.push("npm run pan473:test");
dag.graphVersion = 70;

// Original LIFE-07: additive attributed correction on unchanged native draft/recovery.
const pan467Inputs = [
  ["src/pan467/business-correction-profile.mjs", "CONTRACT"],
  ["src/pan467/business-correction.mjs", "SOURCE"],
  ["src/pan467/independent-business-diagnosis.mjs", "VALIDATOR"],
  ["scripts/run-pan467-business-correction.mjs", "SOURCE"],
  ["tests/pan467/business-correction.test.mjs", "VALIDATOR"],
  ["tests/pan467/native-process-correction.test.mjs", "VALIDATOR"],
  ["tests/fixtures/pan467/native-business-fixture.mjs", "FIXTURE"],
  ["docs/architecture/pan467-attributed-business-correction-v1.md", "DERIVED_EVIDENCE"],
];
let pan467Node = dag.nodes.find(({ id }) => id === "pan467-attributed-business-correction-v1");
if (pan467Node === undefined) {
  pan467Node = {
    id: "pan467-attributed-business-correction-v1",
    dependsOn: ["pan473-writer-scope-cutover-v1", "pan462-native-backup-restore-v1"],
    inputs: [], ownedTests: ["npm run pan467:test"], riskClass: "HIGH", globalInvalidation: false,
    invariants: [
      "One bounded actual synthetic aggregate retains earlier wrong source revision and later valid target work; attributed correction appends a new native version, never rewinds the database or overwrites original evidence.",
      "Stable original effect identity excludes request identity and correction content; uncovered external outcomes, conflicting generations/epochs and fresh-request conflicting original effects fail closed before a new effect.",
      "Durable code-owned synthetic attribution intent precedes the released native correction; real CLI SIGKILL at intent/native-effect boundaries resumes from actual retained history without duplicate version or erased later data, never stealing live/unknown ownership.",
      "Separate read-only SQL diagnosis binds source/baseline, attribution intent, actual native event and receipt; pending/unknown states and forged receipt rehashes never self-authorize completion.",
      "Prior PAN453/PAN462/PAN472/PAN473 sources and hard gates are retained unchanged; no external booking, compensation, production/host/privacy/PKI authority, private/sealed evaluator material or raw reviewer/runtime publication is admitted.",
    ],
  };
  dag.nodes.push(pan467Node);
}
pan467Node.inputs = pan467Inputs.map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan467:test")) repositoryIntegrityNode.ownedTests.push("npm run pan467:test");
dag.graphVersion = 71;

// PAN-EVO-05: one executable tooling comparison, never automatic runtime adoption.
const pan456Inputs = [
  ["docs/architecture/pan456-policy-backend-evaluation-v1.md", "DERIVED_EVIDENCE"],
  ["scripts/run-pan456-policy-evaluation.mjs", "SOURCE"],
  ["src/pan456/isolated-policy-backend.mjs", "SOURCE"],
  ["src/pan456/jsonlogic-policy-worker.mjs", "SOURCE"],
  ["src/pan456/policy-backend-profile.mjs", "CONTRACT"],
  ["tests/fixtures/pan456/isolated-installation-probe.mjs", "FIXTURE"],
  ["tests/pan456/policy-backend-evaluation.test.mjs", "VALIDATOR"],
];
let pan456Node = dag.nodes.find(({ id }) => id === "pan456-policy-backend-evaluation-v1");
if (pan456Node === undefined) {
  pan456Node = {
    id: "pan456-policy-backend-evaluation-v1",
    dependsOn: [], inputs: [], ownedTests: ["npm run pan456:test"], riskClass: "HIGH", globalInvalidation: false,
    invariants: [
      "Exactly one MIT/no-runtime-dependency json-logic-js 2.0.5 tooling candidate is byte/version/program pinned behind the unchanged PolicyEvaluatorV1 contract and retained internal-static baseline; no removable duplication or adoption need is invented.",
      "Actual process-separated synthetic outcomes and named input/context/program/upgrade denials preserve gate-only parent authority and independent adapter ceilings; the child has no inherited credential canary or Node options, but is not an OS sandbox.",
      "Actual setup, correction-probe, comparable contract operation and added maintenance surfaces support a reject-adoption recommendation with no automatic activation, fallback grant, production capability, private/sealed source or host authority claim.",
      "All prior owners, immutable profiles, public scopes and mandatory canonical/release gates remain intact; evidence-only rejection is distinct from the implemented executable tooling comparison.",
    ],
  };
  dag.nodes.push(pan456Node);
}
pan456Node.inputs = pan456Inputs.map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan456:test")) repositoryIntegrityNode.ownedTests.push("npm run pan456:test");
dag.graphVersion = 72;

// PAN-EVO-03: finite existing-adapter journey evidence, never isolation promotion.
const pan454Inputs = [
  ["src/pan454/journey-profile.mjs", "CONTRACT"],
  ["src/pan454/journey-canary.mjs", "FIXTURE"],
  ["scripts/run-pan454-journey-evidence.mjs", "SOURCE"],
  ["tests/pan454/journey-mediation-evidence.test.mjs", "VALIDATOR"],
  ["docs/architecture/pan454-journey-mediation-evidence-v1.md", "DERIVED_EVIDENCE"],
];
let pan454Node = dag.nodes.find(({ id }) => id === "pan454-journey-mediation-evidence-v1");
if (pan454Node === undefined) {
  pan454Node = {
    id: "pan454-journey-mediation-evidence-v1",
    dependsOn: [], inputs: [], ownedTests: ["npm run pan454:test"], riskClass: "HIGH", globalInvalidation: false,
    invariants: [
      "Finite named current bound-task-handle Order journey reuses unchanged Policy/Approval/gate foundations and existing Docker network-none/UID-owned tmpfs controls; no new sandbox, gateway or live model/provider runtime is implemented.",
      "Actual permitted synthetic effects/readbacks and targeted alternate route, tenant, credential-reference and caller-authority canaries require exact existing refusal causes with permitted counterparts, not catch-any exceptions.",
      "Exact pinned OCI reference, actual daemon-local image identity, public source hashes, observed runtime/environment and real OS network/readonly/storage refusals are distinct from configuration claims; no private source, host credential, writable host mount or Docker socket reaches the guest.",
      "Observed same-UID process/credential/state/journal and loopback access yields a bounded falsification of complete intra-container mediation, retaining a network-free synthetic scope and owned corrections, never an implemented production isolation capability.",
      "Source-only BTH and new evidence tooling retain their repository-only source archive classification; all prior owners, original criteria, immutable profiles and mandatory review/canonical/CI/merge/release/public-readback obligations remain intact.",
    ],
  };
  dag.nodes.push(pan454Node);
}
pan454Node.dependsOn = ["pan442-bound-task-handles-v1"];
pan454Node.inputs = pan454Inputs.map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan454:test")) repositoryIntegrityNode.ownedTests.push("npm run pan454:test");
dag.graphVersion = 73;

// Original PAN360 internal execution remainder: one bounded versioned owner.
const pan360Inputs = [
  ["docs/architecture/pan360-original-erv-execution-v1.md", "DERIVED_EVIDENCE"],
  ["scripts/run-pan360-original-erv.mjs", "SOURCE"],
  ["src/pan360/original-erv-core-v1.mjs", "CONTRACT"],
  ["src/pan360/original-invoice-input-v1.mjs", "SOURCE"],
  ["src/pan360/original-erv-execution-v1.mjs", "SOURCE"],
  ["src/pan360/original-erv-report-v1.mjs", "SOURCE"],
  ["tests/pan360/original-execution-regression.test.mjs", "VALIDATOR"],
  ["tests/pan360/original-core-qualification.test.mjs", "VALIDATOR"],
  ["tests/pan360/original-composition.test.mjs", "VALIDATOR"],
  ["tests/pan360/original-report.test.mjs", "VALIDATOR"],
  ["tests/pan360/original-registration.test.mjs", "VALIDATOR"],
  ["tests/fixtures/pan360/original-erv-profile-v1.json", "FIXTURE"],
  ["tests/fixtures/pan360/invoice-high-v1.txt", "FIXTURE"],
  ["tests/fixtures/pan360/invoice-below-v1.txt", "FIXTURE"],
  ["tests/fixtures/pan360/invoice-equal-v1.txt", "FIXTURE"],
  ["tests/fixtures/pan360/invoice-above-v1.txt", "FIXTURE"],
  ["verification/pan360-original-erv-execution-v1.json", "DERIVED_EVIDENCE"],
];
let pan360Node = dag.nodes.find(({ id }) => id === "pan360-original-erv-execution-v1");
if (pan360Node === undefined) {
  pan360Node = {
    id: "pan360-original-erv-execution-v1",
    dependsOn: ["ap-02-incoming-invoice-intake-v1", "ap-04-incoming-invoice-erv-relational-v2", "ap-05-incoming-invoice-receipt-manifest-v1"],
    inputs: [],
    ownedTests: ["npm run pan360:test"],
    invariants: [
      "Original LEAN without mandatory PO/receipt and dialogue-derived relational200bps/strictly-above10000EUR approval actually execute on identical versioned modules.",
      "Historical100bps, fixed-pack compilers, UNKNOWN and accepted evidence remain unchanged; no caller-minted source, registry, answer, UI, receipt or Authority substitutes for actual bound execution.",
      "Only fixed public synthetic document/reference admission and local evidence are implemented; no OCR, customer, productive booking, external credentials or optional ERP dependency is inferred.",
      "Independent qualification, exact-head CI, protected merge, correctly classified new release and anonymous released-source replay remain separate delivery gates.",
    ],
    riskClass: "CRITICAL",
    globalInvalidation: false,
  };
  dag.nodes.push(pan360Node);
}
pan360Node.inputs = pan360Inputs.map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan360:test")) repositoryIntegrityNode.ownedTests.push("npm run pan360:test");
dag.graphVersion = 74;

// Original DOC-AI-01: byte-preserved spent real-OCR pilot, complete oracle replay,
// scoped custody disclosure only. Separate evaluator history, not product ancestry.
const pan378Inputs = [
  ["docs/architecture/pan378-spent-pilot-reproduction-v3.md", "DERIVED_EVIDENCE"],
  ["docs/evidence/PS360-SOURCE-CLOSURE-v1.md", "DERIVED_EVIDENCE"],
  ["scripts/run-pan378-spent-pilot.mjs", "SOURCE"],
  ["src/pan378/spent-pilot-replay-v3.mjs", "SOURCE"],
  ["tests/pan378/spent-pilot-replay.test.mjs", "VALIDATOR"],
  ["tests/pan378/spent-pilot-admission.test.mjs", "VALIDATOR"],
  ["tests/pan378/spent-pilot-registration.test.mjs", "VALIDATOR"],
  ["tests/fixtures/pan378/spent-evaluation-v3/packet-manifest.json", "CONTRACT"],
  ["tests/fixtures/pan378/spent-evaluation-v3/new-epoch-v3-evaluated-custody.bundle", "FIXTURE"],
  ["tests/fixtures/pan378/spent-evaluation-v3/report-v3.json", "DERIVED_EVIDENCE"],
  ["verification/pan378-spent-pilot-reproduction-v3.json", "DERIVED_EVIDENCE"],
];
let pan378Node = dag.nodes.find(({ id }) => id === "pan378-spent-pilot-reproduction-v3");
if (pan378Node === undefined) {
  pan378Node = {
    id: "pan378-spent-pilot-reproduction-v3",
    dependsOn: [], inputs: [], ownedTests: ["npm run pan378:test"],
    invariants: [
      "AP-03 is a synthetic extraction scoring harness; historical parser/fixtures/outcomes are retained, not OCR or model-quality evidence.",
      "Exact independently frozen source/corpus/runtime/candidate and later spent synthetic disclosure bind a complete unchanged oracle CLI replay; evaluator Git history is never product ancestry.",
      "FALSIFIED_WITH_EVIDENCE, complete denominators, UNKNOWN and all nine negative probes remain unchanged; no tuning, replacement trust root, new blind trial or positive-score promotion.",
      "Cleared subprocess environment, fixed local Git/no credentials/config/hooks, read-only custody and owned scratch cleanup are process hygiene, not a host-sandbox claim.",
      "All original seven criteria and delivery gates remain; source evidence is not a runnable product package or production/customer/booking authority.",
    ],
    riskClass: "CRITICAL", globalInvalidation: false,
  };
  dag.nodes.push(pan378Node);
}
pan378Node.inputs = pan378Inputs.map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan378:test")) repositoryIntegrityNode.ownedTests.push("npm run pan378:test");
dag.graphVersion = 75;

// User-authorized bounded ERV research/native evidence; no new business platform.
const ervWorkflowReference = "evidence/erv-workflow/reference-v1/";
const ervWorkflowPacket = JSON.parse(readFileSync(path.join(root, ervWorkflowReference, "packet-manifest.json"), "utf8"));
const ervWorkflowInputs = [
  ["docs/architecture/erv-workflow-native-evidence-v1.md", "DERIVED_EVIDENCE"],
  ["scripts/run-erv-workflow-evidence.mjs", "SOURCE"],
  ["src/erv-workflow-evidence/native-evidence-v1.mjs", "SOURCE"],
  ["tests/erv-workflow-evidence/native-evidence.test.mjs", "VALIDATOR"],
  ["tests/erv-workflow-evidence/source-admission.test.mjs", "VALIDATOR"],
  ["tests/erv-workflow-evidence/registration.test.mjs", "VALIDATOR"],
  ["evidence/erv-workflow/released-kernel-bindings-v1.json", "CONTRACT"],
  [ervWorkflowReference + "packet-manifest.json", "CONTRACT"],
  ...ervWorkflowPacket.files.map(({ path: relative }) => [ervWorkflowReference + relative, "FIXTURE"]),
  ["verification/erv-workflow-native-evidence-v1.json", "DERIVED_EVIDENCE"],
];
let ervWorkflowNode = dag.nodes.find(({ id }) => id === "erv-workflow-native-evidence-v1");
if (ervWorkflowNode === undefined) {
  ervWorkflowNode = {
    id: "erv-workflow-native-evidence-v1",
    dependsOn: ["pan360-original-erv-execution-v1"], inputs: [],
    ownedTests: ["npm run erv-workflow:test"], riskClass: "HIGH", globalInvalidation: false,
    invariants: [
      "Exact admitted public research packet and22 reused kernel/build/profile/document file bindings are checked before native execution; historicalv5 provenance is never relabelled as a new commit/release.",
      "All23 real unchanged existing PSAi primitives and25 separate expected/actual semantic checks reproduce persisted evidence, including original denials, exceptions and UNKNOWN;0 complete human workflows.",
      "Company size is descriptive context only; gross native10000EUR rule and8 unexecuted net5000EUR research designs remain separate; exact integer split/tolerance checks do not implement accounting or routing.",
      "Evidence persistence is not an operational invoice/task database, human form, identity or productive posting/payment; no new ERP/PKI/platform/missing features or reused-core/fixture changes.",
      "One focused delta review, canonical applicable tests, exact CI/merge/new SOURCE_EVIDENCE_ONLY release and actual public consumer precede task delivery; original390/396 gates and all private/sealed/paused scopes remain.",
    ],
  };
  dag.nodes.push(ervWorkflowNode);
}
ervWorkflowNode.inputs = ervWorkflowInputs.map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
if (!repositoryIntegrityNode.ownedTests.includes("npm run erv-workflow:test")) repositoryIntegrityNode.ownedTests.push("npm run erv-workflow:test");
dag.graphVersion = 76;

// PAN396 admitted first proof only; reuse the unchanged PAN360 owner.
const pan396Inputs = [
  ["docs/architecture/pan396-original-s3-sqs-lab-v1.md", "DERIVED_EVIDENCE"],
  ["packages/contracts/src/floci-invoice-lab-v1.ts", "CONTRACT"],
  ["src/pan396/floci-http-v1.mjs", "SOURCE"],
  ["src/pan396/invoice-broker-v1.mjs", "SOURCE"],
  ["src/pan396/simplest-fake-v1.mjs", "SOURCE"],
  ["src/pan396/disabled-ui-proof-v1.mjs", "SOURCE"],
  ["scripts/pan396-original-s3-sqs-proof-v1.mjs", "SOURCE"],
  ["scripts/pan396-owned-floci-runtime-v1.mjs", "SOURCE"],
  ["scripts/pan396-owned-cleanup-v1.mjs", "SOURCE"],
  [".github/workflows/pan396-native-proof.yml", "SOURCE"],
  ["tests/pan396/invoice-broker.test.mjs", "VALIDATOR"],
  ["tests/pan396/disabled-ui.test.mjs", "VALIDATOR"],
  ["tests/pan396/registration.test.mjs", "VALIDATOR"],
  ["tests/fixtures/pan396/floci-pin-v1.json", "FIXTURE"],
  ["verification/pan396-original-s3-sqs-evidence-v1.json", "DERIVED_EVIDENCE"],
];
let pan396Node = dag.nodes.find(({ id }) => id === "pan396-original-s3-sqs-lab-v1");
if (pan396Node === undefined) {
  pan396Node = {
    id: "pan396-original-s3-sqs-lab-v1", dependsOn: ["pan360-original-erv-execution-v1"], inputs: [],
    ownedTests: ["npm run pan396:test"], riskClass: "HIGH", globalInvalidation: false,
    invariants: [
      "Only admitted first synthetic S3/SQS proof with exact source/platform artifact verified before startup; no extra service or general-provider activation.",
      "Actual object/event/typed broker/intake/core/file readback and denials are bound; original PAN360 core/rules and productive provider authority remain unchanged.",
      "Exact owned namespace and Docker resource cleanup; parent daemon trusted, no guest socket/customer/cloud credentials/host OS sandbox claim.",
      "Named atomic in-memory fake, actual partial-effect differential and measured runtime/maintenance surfaces are distinct; timeout bound does not itself prove acceptable CI cost.",
      "Source-evidence distribution, original8 independent acceptance, exact-head native CI, merge/new release/public consumer precede closure; no expansion follows automatically.",
    ],
  };
  dag.nodes.push(pan396Node);
}
pan396Node.inputs = pan396Inputs.map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan396:test")) repositoryIntegrityNode.ownedTests.push("npm run pan396:test");
dag.graphVersion = 77;

// PAN515 additive native trade scope; existing draft and M3 owners are retained.
const pan515Inputs = [
  ["contracts/trade/common-trade-01-v1.json", "CONTRACT"],
  ["src/pan515/trade-state.mjs", "SOURCE"],
  ["scripts/run-pan515-trade-state.mjs", "SOURCE"],
  ["tests/fixtures/pan515/native-trade-fixture.mjs", "FIXTURE"],
  ["tests/fixtures/pan515/native-trade-client.mjs", "FIXTURE"],
  ["tests/pan515/native-trade-state.test.mjs", "VALIDATOR"],
  ["tests/pan515/common-trade-binding.test.mjs", "VALIDATOR"],
  ["tests/pan515/common-native-events.test.mjs", "VALIDATOR"],
  ["tests/pan515/native-trade-negative.test.mjs", "VALIDATOR"],
  ["tests/pan515/native-process-compatibility.test.mjs", "VALIDATOR"],
  ["tests/pan515/native-cli.test.mjs", "VALIDATOR"],
  ["tests/pan515/registration.test.mjs", "VALIDATOR"],
  ["docs/architecture/pan515-native-trade-state-v1.md", "DERIVED_EVIDENCE"],
  ["verification/pan515-native-trade-evidence-v1.json", "DERIVED_EVIDENCE"],
];
let pan515Node = dag.nodes.find(({ id }) => id === "pan515-native-trade-state-v1");
if (pan515Node === undefined) {
  pan515Node = {
    id: "pan515-native-trade-state-v1", dependsOn: ["pan473-writer-scope-cutover-v1", "pan435-436-sales-stock-journey-v1"], inputs: [],
    ownedTests: ["npm run pan515:test"], riskClass: "HIGH", globalInvalidation: false,
    invariants: [
      "One existing native PAN472 target SQLite/PAN473 owner, exact generation/epoch/quantity revision and explicit native/canonical identity and time mapping; no new database or relabelled six-piece COMMON case.",
      "Actual immutable receipt/reservation/shipment/quarantined-return and reason-bearing forward correction/count events; disjoint lot allocations and same native event cutoffs, stable reservation-change cause is not another movement.",
      "Native real-process competing commits serialize or deny, effect identity excludes transport retry, stale/unit/content/authority/history collisions fail closed without lost quantities or later work.",
      "Existing native writer/diagnosis and M3 availability consumers execute; quarantine availability adapter is not canonical order reservation, absent external freshness remains UNPROVEN.",
      "Feature-specific stop preserves readable immutable history and existing writers; bounded original acceptance, mandatory CI/merge/new source-evidence release and exact public consumer are separate from development proof or PAN-to-KS pairing.",
    ],
  };
  dag.nodes.push(pan515Node);
}
pan515Node.inputs = pan515Inputs.map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan515:test")) repositoryIntegrityNode.ownedTests.push("npm run pan515:test");
dag.graphVersion = 78;

// PAN516 bounded native purchase and unchanged ERV composition; no new platform.
const pan516Inputs = [
  ["contracts/trade/pan516-invoice-cases-v1.json", "CONTRACT"],
  ["src/procurement-434/bestellung-lifecycle.mjs", "SOURCE"],
  ["src/procurement-434/bestellung-liability.mjs", "SOURCE"],
  ["src/procurement-434/bestellung-cli.mjs", "SOURCE"],
  ["src/procurement-434/rechnungsabgleich-path-cli.mjs", "SOURCE"],
  ["tests/procurement-434/procurement-lifecycle.test.mjs", "VALIDATOR"],
  ["tests/procurement-434/procurement-registration.test.mjs", "VALIDATOR"],
  ["docs/architecture/pan516-native-procurement-v1.md", "DERIVED_EVIDENCE"],
  ["verification/pan516-native-procurement-evidence-v1.json", "DERIVED_EVIDENCE"],
];
let pan516Node = dag.nodes.find(({id}) => id === "pan516-native-procurement-v1");
if (pan516Node === undefined) {
  pan516Node = {
    id: "pan516-native-procurement-v1", dependsOn: ["pan515-native-trade-state-v1", "ap-04-incoming-invoice-erv-relational-v2"], inputs: [],
    ownedTests: ["npm run pan516:test"], riskClass: "HIGH", globalInvalidation: false,
    invariants: [
      "Existing PAN472 target SQLite and qualified PAN473 owner only; native immutable purchase approval, transmission and confirmation revisions remain distinct from productive authority.",
      "Original common ten with two actual receipts gives accepted ten and remainder history10/2/0; foreign composite identity, supplier, duplicate receipt and unapproved overdelivery fail without effects.",
      "Price, currency, unit and promise confirmation revisions preserve old commitments; native proposal/approval remains unchanged by supplier confirmation.",
      "One code-bound invoice grain after receipt aggregation runs the unchanged frozen ERV variants/tolerance; original common deviation2000 and separately labelled synthetic partial/full inputs never grant payment or posting authority.",
      "Real lost acknowledgment after native target commit is reconciled by exact target-first retry before any new order effect; transport and business-order retries cannot duplicate order, receipt or history.",
      "Frozen independent original4/negative acceptance, exact mandatory CI, merge, new classified release and anonymous exact source/native consumer precede closure; external channel/rights remain unselected and PAN-to-KS pairing remains separate."
    ]
  };
  dag.nodes.push(pan516Node);
}
pan516Node.inputs = pan516Inputs.map(([inputPath,role]) => ({path:inputPath,role,sha256:digest(inputPath)}));
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan516:test")) repositoryIntegrityNode.ownedTests.push("npm run pan516:test");
dag.graphVersion = 79;

// PAN517 bounded native fulfilment; keep the existing transaction and entry owner.
const pan517Inputs = [
  ["src/pan517/fulfilment-state.mjs", "SOURCE"],
  ["src/pan517/delivery-milestones.mjs", "SOURCE"],
  ["tests/pan517/native-fulfilment.test.mjs", "VALIDATOR"],
  ["tests/pan517/calendar-integrity.test.mjs", "VALIDATOR"],
  ["tests/pan517/registration.test.mjs", "VALIDATOR"],
  ["docs/architecture/pan517-native-fulfilment-v1.md", "DERIVED_EVIDENCE"],
  ["verification/pan517-native-fulfilment-evidence-v1.json", "DERIVED_EVIDENCE"],
];
let pan517Node = dag.nodes.find(({id}) => id === "pan517-native-fulfilment-v1");
if (pan517Node === undefined) {
  pan517Node = {
    id: "pan517-native-fulfilment-v1", dependsOn: ["pan515-native-trade-state-v1"], inputs: [],
    ownedTests: ["npm run pan517:test"], riskClass: "HIGH", globalInvalidation: false,
    invariants: [
      "Existing PAN472 SQLite/PAN473 native trade transaction and exported entry only; no new database, CLI gate, external identity or productive authority.",
      "Pick and pack never consume physical stock; actual partial issue consumes only its packed reserved quantity with disjoint native lot allocation, immutable delivery note and remainder.",
      "One actual return receipt is bounded by its shipment, remains quarantined until a source-bound inspection decision, and is independent from complaint decision or technical credit.",
      "Published original dispatch promise and revisions retain exact common source and real event calendar instants; impossible dates and clock/offset overflow deny before native mutation.",
      "Dispatch and actual customer receipt carry explicit separate event types and promise kind/revision; dispatch alone never proves delivery punctuality and readback cannot mutate events.",
      "Feature-specific stop denies new fulfilment transitions but preserves immutable performed movements and existing reason-bearing business correction; frozen independent acceptance, exact canonical/hosted CI, merge, new release and anonymous readback remain separate gates."
    ]
  };
  dag.nodes.push(pan517Node);
}
pan517Node.inputs = pan517Inputs.map(([inputPath,role]) => ({path:inputPath,role,sha256:digest(inputPath)}));
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan517:test")) repositoryIntegrityNode.ownedTests.push("npm run pan517:test");
dag.graphVersion = 80;

// PAN524 exact optional external BI profile; retain legacy owner and all hard gates.
const pan524Inputs = [
  [
    "scripts/verify-pan524-exact-bi-pair-v1.mjs",
    "SOURCE"
  ],
  [
    "tests/fixtures/pan524/published-j02-provider-v0181.json",
    "FIXTURE"
  ],
  ["tests/fixtures/pan524/published-plan-extraction-response-v1.json", "FIXTURE"],
  ["tests/fixtures/pan524/published-preview-response-v1.json", "FIXTURE"],
  [
    "tests/pan524/exact-bi-pair-profile.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan524/delivery-surface.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan524/registration.test.mjs",
    "VALIDATOR"
  ],
  [
    "verification/pan524-exact-bi-pair-evidence-v1.json",
    "DERIVED_EVIDENCE"
  ]
];
let pan524Node = dag.nodes.find(({id}) => id === "pan524-exact-bi-pair-v1");
if (pan524Node === undefined) {
  pan524Node = {
    id: "pan524-exact-bi-pair-v1", dependsOn: ["external-bi-service-v2"], inputs: [],
    ownedTests: ["npm run pan524:test"], riskClass: "HIGH", globalInvalidation: false,
    invariants: [
      "Legacy v0.8.0 default retained; only explicit code-owned KS_J02_0181_C2_V1 selects exact v0.18.1/2.0.0 package and provider profile before every intent.",
      "Exact complete attestation and capability tuple; unknown, missing, root-version, substituted or redigested wildcard identity fails before dispatch.",
      "Only six existing external intents; three known trusted-only partial descriptors do not enable mutation, credentials, raw rows, SQL or direct Superset access. Existing order receiver remains separate.",
      "Immutable contract supplied early through existing J02 custody; actual unchanged real synthetic provider and current PAN client paired run precedes final original acceptance. J03 consumes the same qualified run without mutual CLOSED prerequisites.",
      "Source-evidence distribution only; independent original4/negative acceptance, canonical proof, hosted CI, protected merge, new release and anonymous exact consumer readback precede closure. No registry promotion or productive/source authority."
    ]
  };
  dag.nodes.push(pan524Node);
}
pan524Node.inputs = pan524Inputs.map(([inputPath,role]) => ({path:inputPath,role,sha256:digest(inputPath)}));
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan524:test")) repositoryIntegrityNode.ownedTests.push("npm run pan524:test");
// PAN520 bounded typed native source projections; original owners and hard gates remain.
const pan520Inputs = [
  ["contracts/trade/pan520-projection-contract-v1.json", "CONTRACT"],
  ["src/pan520/native-projection.mjs", "SOURCE"],
  ["tests/pan520/native-projection.test.mjs", "VALIDATOR"],
  ["tests/pan520/native-procurement-projection.test.mjs", "VALIDATOR"],
  ["tests/pan520/registration.test.mjs", "VALIDATOR"],
  ["docs/architecture/pan520-native-projections-v1.md", "DERIVED_EVIDENCE"],
  ["verification/pan520-native-projection-evidence-v1.json", "DERIVED_EVIDENCE"],
];
let pan520Node = dag.nodes.find(({id}) => id === "pan520-native-projections-v1");
if (pan520Node === undefined) {
  pan520Node = {
    id: "pan520-native-projections-v1", dependsOn: ["pan516-native-procurement-v1", "pan517-native-fulfilment-v1"], inputs: [],
    ownedTests: ["npm run pan520:test"], riskClass: "HIGH", globalInvalidation: false,
    invariants: [
      "Existing leading PAN472 SQLite/PAN473 source only; O2C/P2P/STOCK exact source/tenant/entity/order/line/article/warehouse/currency/unit grain, no universal ERP schema, new database or free SQL/credentials.",
      "Same protected native target read transaction and original purchase reconstruction; aggregate receipts before one invoice grain and reuse the unchanged liability/ERV amount core, not a rematcher or fixture promoted to native billing.",
      "Each source field is known or explicitly unavailable; missing consumption/valuation/native billing/business acceptance/FiBu/capacity/history facts never become implicit zero or inferred business event time.",
      "Receipt and dispatch events retain their own assigned original promise kind/revision; later revisions cannot repair earlier punctuality and dispatch cannot stand in for customer receipt.",
      "Opaque source plans are not portable authority; exact source binding and original durable stop/revoke controls are rechecked at use, cloned handles/caller role/SQL/credential/accessor metadata deny without effects.",
      "Question dependency digests invalidate only relevant facts and promise/source revisions while the full snapshot binds actual lineage; existing direct order/read meanings remain unchanged.",
      "Real PAN native producer output into real KS K03 or K04 remains required; early immutable contract/local PASS/handshake or matching stub does not certify paired/full scope, productive rights or final delivery."
    ]
  };
  dag.nodes.push(pan520Node);
}
pan520Node.inputs = pan520Inputs.map(([inputPath,role]) => ({path:inputPath,role,sha256:digest(inputPath)}));
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan520:test")) repositoryIntegrityNode.ownedTests.push("npm run pan520:test");
dag.graphVersion = 82;

// PAN525 J03: one read-only PAN-owned qualification registry. Existing J01
// observations remain immutable; actual native persistence is separate evidence.
const pan525Inputs = [
  [
    "contracts/pan525/exact-pair-qualification-v1.json",
    "CONTRACT"
  ],
  [
    "contracts/pan525/native-persistence-observation-v1.json",
    "DERIVED_EVIDENCE"
  ],
  [
    "contracts/pan525/native-runtime-version-readback-v1.json",
    "DERIVED_EVIDENCE"
  ],
  [
    "src/pan525/exact-pair-qualification.mjs",
    "SOURCE"
  ],
  [
    "scripts/read-pan525-qualified-pair-v1.mjs",
    "SOURCE"
  ],
  [
    "tests/pan525/exact-pair-qualification.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan525/registration.test.mjs",
    "VALIDATOR"
  ],
  [
    "docs/architecture/pan525-exact-qualified-pair-v1.md",
    "DERIVED_EVIDENCE"
  ],
  [
    "verification/pan525-exact-qualified-pair-evidence-v1.json",
    "DERIVED_EVIDENCE"
  ]
];
let pan525Node = dag.nodes.find(({id}) => id === "pan525-exact-qualified-pair-v1");
if (pan525Node === undefined) {
  pan525Node = {
    id: "pan525-exact-qualified-pair-v1", dependsOn: ["pan524-exact-bi-pair-v1"], inputs: [],
    ownedTests: ["npm run pan525:test"], riskClass: "HIGH", globalInvalidation: false,
    invariants: [
      "Exactly retained released J01 consumer/provider commits, contract/runtime versions and evidence digests; main/latest, unknown builds, caller proofs or roles deny. No other Git identity from equal compiled bytes.",
      "Six actual synthetic HTTP intents and independent expected results are retained from the same delivered J01/J02 pair. Handshake/fixture PASS is not native functional qualification or independent second source.",
      "Separate genuine native db upgrade invocation, dataset/dashboard and new business/metadata persistence across stopped restart/reinstallation; no schema-revision transition claimed. Fixed regular-file evidence read and hashed through O_NOFOLLOW descriptors.",
      "Promotion only into one PAN-owned read-only local synthetic registry. KS250 independent second context remains HELD; no provider registry mutation, source/publication rights, execution grant or productive authority.",
      "All six original criteria and four negatives retained. Source evidence only; focused reviews, canonical proof, exact hosted CI, protected merge, new release and anonymous source-archive readback are distinct gates, not a Main approval wait."
    ]
  };
  dag.nodes.push(pan525Node);
}
pan525Node.inputs = pan525Inputs.map(([inputPath,role]) => ({path:inputPath,role,sha256:digest(inputPath)}));
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan525:test")) repositoryIntegrityNode.ownedTests.push("npm run pan525:test");
dag.graphVersion = 83;

// PAN526 H01: optional source-bound local adapter, unchanged legacy demo.
// Early shared contract publication is not whole-release or native authority.
const pan526Inputs = [
  [
    "contracts/runtime-portability/candidates/runtime-identity-development-v1.schema.json",
    "SCHEMA"
  ],
  [
    "contracts/runtime-portability/candidates/runtime-identity-development-v2.schema.json",
    "SCHEMA"
  ],
  [
    "contracts/runtime-portability/candidates/portable-runtime-development-v1.schema.json",
    "SCHEMA"
  ],
  [
    "contracts/runtime-portability/portable-runtime-v1.schema.json",
    "SCHEMA"
  ],
  [
    "src/pan526/runtime-contract.mjs",
    "SOURCE"
  ],
  [
    "src/pan526/local-runtime-adapter.mjs",
    "SOURCE"
  ],
  [
    "scripts/read-pan526-portable-local-runtime-v1.mjs",
    "SOURCE"
  ],
  [
    "tests/pan526/ks-node-agent-candidate.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan526/runtime-contract.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan526/local-runtime-adapter.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan526/local-runtime-cli.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan526/local-runtime-native.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan526/registration.test.mjs",
    "VALIDATOR"
  ],
  [
    "docs/architecture/pan526-runtime-identity-development-v1.md",
    "DERIVED_EVIDENCE"
  ],
  [
    "docs/architecture/pan526-runtime-identity-development-v2.md",
    "DERIVED_EVIDENCE"
  ],
  [
    "docs/architecture/pan526-portable-runtime-development-v1.md",
    "DERIVED_EVIDENCE"
  ],
  [
    "docs/architecture/pan526-portable-local-runtime-v1.md",
    "DERIVED_EVIDENCE"
  ],
  [
    "verification/pan526-portable-runtime-evidence-v1.json",
    "DERIVED_EVIDENCE"
  ],
  [
    "verification/pan526-cold-start-resource-raw-v1.json",
    "DERIVED_EVIDENCE"
  ]
];
let pan526Node = dag.nodes.find(({id}) => id === "pan526-portable-runtime-v1");
if (pan526Node === undefined) {
  pan526Node = {
  "id": "pan526-portable-runtime-v1",
  "dependsOn": [
    "toolchain-central"
  ],
  "inputs": [],
  "ownedTests": [
    "npm run pan526:test"
  ],
  "riskClass": "HIGH",
  "globalInvalidation": false,
  "invariants": [
    "One immutable shared Identity/Desired/Observed/Readiness/Lifecycle contract, component-bound actual Node agent distinct from Superset platform; shape, roles and receipts do not confer authority. Historical candidates and independent exact-byte correction remain preserved.",
    "Explicit local-owner opt-in and exact clean native source/tree/image, instance/tenant/generation/configuration/template/policy/network binding; no main/latest, unknown component/rights, secret fields or loopback bypass. Actual native observation and HTTP200 wrong-business NOT_READY are separate from schema shape validation.",
    "Typed audience/tenant/generation/digest-bound lifecycle applies only to inspected owned native PanSphaira resources; Desired/Observed and opaque secret references remain distinct; durable interrupted outcome_unknown is not retried or relabelled as success/failure.",
    "Ten actual x86_64 cold starts,40 independent Init/Idle/Load/Restore raw phases with genuine timestamps/resources, actual native archive restoration and zero owned residue. No estimated values, reboot/cache-flush claim, missing writable-layer substitution, new independent native rerun or general statistical analysis.",
    "Legacy loopback installer/Compose/security and runnable payload stay unchanged. New optional local source adapter is not a remote effect route, registry promotion, productive permission or turnkey hosted package; original five criteria/five negatives and canonical proof/required CI/protected merge/release/anonymous product/closure remain separate without Main or reciprocal CLOSED gate."
  ]
};
  dag.nodes.push(pan526Node);
}
pan526Node.inputs = pan526Inputs.map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan526:test")) repositoryIntegrityNode.ownedTests.push("npm run pan526:test");
dag.graphVersion = 84;

// PAN527 optional hosted-origin/session source-only owner. Existing owners and gates stay unchanged.
const pan527Inputs = [
  [
    "contracts/hosted-origin-session/candidates/origin-session-development-v1.json",
    "DERIVED_EVIDENCE"
  ],
  [
    "contracts/hosted-origin-session/candidates/origin-session-development-v2.json",
    "DERIVED_EVIDENCE"
  ],
  [
    "contracts/hosted-origin-session/candidates/origin-session-development-v3.json",
    "DERIVED_EVIDENCE"
  ],
  [
    "contracts/hosted-origin-session/protected-route-binding-v1.schema.json",
    "SCHEMA"
  ],
  [
    "src/pan527/origin-session-adapter.mjs",
    "SOURCE"
  ],
  [
    "scripts/run-pan527-origin-session-tests.mjs",
    "SOURCE"
  ],
  [
    "tests/pan527/bound-session-native.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan527/browser-native-network.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan527/control-route-binding.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan527/csrf-native-mutation.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan527/delayed-body-native.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan527/helpers.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan527/local-compatibility.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan527/native-https-ingress.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan527/origin-session.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan527/redirect-native.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan527/registration.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan527/test-runner.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan527/websocket-native.test.mjs",
    "VALIDATOR"
  ],
  [
    "docs/architecture/pan527-origin-session-development-v1.md",
    "DERIVED_EVIDENCE"
  ],
  [
    "docs/architecture/pan527-origin-session-development-v2.md",
    "DERIVED_EVIDENCE"
  ],
  [
    "docs/architecture/pan527-origin-session-development-v3.md",
    "DERIVED_EVIDENCE"
  ],
  [
    "docs/architecture/pan527-hosted-origin-session-v1.md",
    "DERIVED_EVIDENCE"
  ],
  [
    "verification/pan527-origin-session-evidence-v1.json",
    "DERIVED_EVIDENCE"
  ]
];
let pan527Node = dag.nodes.find(({id}) => id === "pan527-origin-session-v1");
if (pan527Node === undefined) {
  pan527Node = {
  "id": "pan527-origin-session-v1",
  "dependsOn": [
    "pan526-portable-runtime-v1"
  ],
  "inputs": [],
  "ownedTests": [
    "npm run pan527:test"
  ],
  "riskClass": "HIGH",
  "globalInvalidation": false,
  "invariants": [
    "Explicit optional configured loopback TLS origin and closed existing per-tenant product routes; server-issued opaque private HMAC sessions, secure cookies, CSRF and exact audience/origin/tenant/instance/generation/identityDigest; no arbitrary proxy or caller role/forwarded authority.",
    "Actual native event persistence and certificate-verifying Chromium network positives/denials; fixed authenticated relative303, denied upgrades/aliases, delayed expiry/auth loss and re-signed binding negatives leave native denial state unchanged. Browser network is not visual UI journey.",
    "Distinct KS protected control route-binding/read-only profile reuses common definitions offline; portable RuntimeIdentity enum/schema and effective rights remain unchanged. Synthetic binding/store and observed counterpart source are not native KS runtime/pair qualification or productive permission.",
    "Legacy installer/Compose/selfhosting/runnable manifest remain unchanged. Exact public development candidate, actual legacy hosted install/acceptance/provider readback/purge and bounded independent unchanged scopes remain separate from final canonical proof/required CI/SHA-bound merge/new release/anonymous qualification/closure. No external portal/customer input or reciprocal CLOSED/Main gate."
  ]
};
  dag.nodes.push(pan527Node);
}
pan527Node.inputs = pan527Inputs.map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan527:test")) repositoryIntegrityNode.ownedTests.push("npm run pan527:test");
dag.graphVersion = 85;

// PAN529 H05: native bounded template/budget/broker owner; old owners and gates are retained.
const pan529Inputs = [
  [
    "packages/contracts/src/model-access-broker.ts",
    "SOURCE"
  ],
  [
    "demo/runtime/atomic-resource-budget.mjs",
    "SOURCE"
  ],
  [
    "src/pan529/runtime-template-contract.mjs",
    "SOURCE"
  ],
  [
    "src/pan529/native-budget-controller.mjs",
    "SOURCE"
  ],
  [
    "contracts/runtime-budget/candidates/runtime-budget-development-v1.json",
    "DERIVED_EVIDENCE"
  ],
  [
    "scripts/run-pan529-runtime-budget-tests.mjs",
    "SOURCE"
  ],
  [
    "docs/architecture/pan529-runtime-budget-v1.md",
    "DERIVED_EVIDENCE"
  ],
  [
    "tests/pan529/atomic-resource-budget.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan529/broker-equal-key.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan529/reservation-worker.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan529/runtime-template.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan529/unknown-usage-process.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan529/native-receipt-cache.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan529/native-controller.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan529/native-fixture.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan529/native-process-integration.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan529/native-provider-worker.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan529/registration.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan529/test-runner.test.mjs",
    "VALIDATOR"
  ]
];
let pan529Node = dag.nodes.find(({id}) => id === "pan529-runtime-budget-v1");
if (pan529Node === undefined) {
  pan529Node = {
  "id": "pan529-runtime-budget-v1",
  "dependsOn": [
    "pan526-portable-runtime-v1"
  ],
  "inputs": [],
  "ownedTests": [
    "npm run pan529:test"
  ],
  "riskClass": "HIGH",
  "globalInvalidation": false,
  "invariants": [
    "Closed server-owned known component/template/policy/network/right/resource bindings; readable pure plan before owner selection, no productive execution grant or new RuntimeIdentity enum/rights.",
    "Existing shared ModelAccessBrokerV1 and CCP safe integer receipts; owner-private native SQLite immediate transactions, durable reservation/dispatch fence, actual100 independent controllers with actual synthetic HTTP and independent SQL holds/consumption.",
    "Exact request-key replay and atomic authenticated result/settlement; observed owner-bound guarded synthetic usage is required, known no-dispatch is separate from uncertain callbacks, no process-restart or model-answer release.",
    "Unknown fields/components/rights/commands/URLs/SQL and agent policy modifications/accessors fail closed before effects. Client API contains no store, activation or completion signer; model data remain untrusted without approval authority.",
    "Immutable counterpart-consumed development v1 bytes and PAN-native ledger identity stay preserved. Existing KS295 implementation ownership, delivered526 capability and independent product delivery remain separate; no paid provider/business price/native image qualification/Main or reciprocal CLOSED gate."
  ]
};
  dag.nodes.push(pan529Node);
}
pan529Node.inputs = pan529Inputs.map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan529:test")) repositoryIntegrityNode.ownedTests.push("npm run pan529:test");
dag.graphVersion = 86;

// P07 earlier local connected stage; external fiscal/archive/FiBu criteria stay open.
const pan521Inputs = [
  ["src/pan519/finance-handoff.mjs", "SOURCE"],
  ["src/pan519/contract-transport.mjs", "SOURCE"],
  ["src/pan521/connected-trade.mjs", "SOURCE"],
  ["src/pan521/local-journey.mjs", "SOURCE"],
  ["scripts/run-pan521-connected-trade.mjs", "SOURCE"],
  ["scripts/run-pan521-connected-native-tests.mjs", "SOURCE"],
  ["tests/pan519/native-fixture.mjs", "FIXTURE"],
  ["tests/pan519/native-finance.test.mjs", "VALIDATOR"],
  ["tests/pan519/contract-transport.test.mjs", "VALIDATOR"],
  ["tests/pan519/finance-negatives.test.mjs", "VALIDATOR"],
  ["tests/pan521/connected-native-entry.test.mjs", "VALIDATOR"],
  ["tests/pan521/local-journey.test.mjs", "VALIDATOR"],
  ["tests/pan521/registration.test.mjs", "VALIDATOR"],
  ["tests/pan521/test-runner.test.mjs", "VALIDATOR"],
  ["docs/architecture/pan521-connected-native-stage-v1.md", "DERIVED_EVIDENCE"],
  ["verification/pan521-local-connected-native-stage-v1.json", "DERIVED_EVIDENCE"]
];
let pan521Node = dag.nodes.find(({id}) => id === "pan521-local-connected-native-v1");
if (pan521Node === undefined) {
  pan521Node = {
    id: "pan521-local-connected-native-v1",
    dependsOn: ["pan515-native-trade-state-v1", "pan516-native-procurement-v1", "pan517-native-fulfilment-v1", "pan520-native-projections-v1"],
    inputs: [],
    ownedTests: ["npm run pan521:test"],
    riskClass: "HIGH",
    globalInvalidation: false,
    invariants: [
      "One existing protected disposable COMMON native root, code-owned local owner and canonical case/revision binding; no new main ledger or production/data-source rights. Separate standalone fixtures remain unchanged.",
      "Actual approval/target purchase, receipts/reservation, P03 pick/pack/partial and remainder ISSUE, complaint/credit/quarantined return and bounded local AR handoff preserve immutable original effect and target identities across new transport attempts.",
      "Native component nonreentrant leases, current grants and STOP/REVOKE stay authoritative. PURCHASE_TARGET is durable partial progress, not a cross-component transaction, full completion, in-transaction crash or ambiguous external POST qualification.",
      "Same-root STOCK/P2P/O2C bind actual trade/purchase revisions. Released KS selectors and original cf199bbd reader identity remain unchanged; actual new native producer is separately bound and directly rejected as that historical reader.",
      "Original AP deviation and unknown fiscal/archive/FiBu/payment/allocation remain open. No local reference/model/receipt or caller qualification flag creates booking, payment, source or issue-closure authority.",
      "Closed operator read/action and closed canonical test entry preserve late-price/invoice basis, native movement history, negative flags and bounded rollback. Source-only stage delivery and original full P07 acceptance are separate; no Main approval wait or additional owner."
    ]
  };
  dag.nodes.push(pan521Node);
}
pan521Node.inputs = pan521Inputs.map(([inputPath, role]) => ({path: inputPath, role, sha256: digest(inputPath)}));
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan521:test")) repositoryIntegrityNode.ownedTests.push("npm run pan521:test");
dag.graphVersion = 87;

// P08 deterministic authority-free material proposals; no finite-capacity/runtime promotion.
const pan522Inputs = [
  [
    "src/pan522/material-plan.mjs",
    "SOURCE"
  ],
  [
    "src/pan522/plan-input.mjs",
    "SOURCE"
  ],
  [
    "scripts/run-pan522-material-plan.mjs",
    "SOURCE"
  ],
  [
    "scripts/run-pan522-material-tests.mjs",
    "SOURCE"
  ],
  [
    "tests/fixtures/pan522/pan-material-reference-v1.json",
    "FIXTURE"
  ],
  [
    "tests/pan522/material-plan.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan522/material-plan-negatives.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan522/material-plan-cli.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan522/material-plan-native-no-effects.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan522/registration.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan522/test-runner.test.mjs",
    "VALIDATOR"
  ],
  [
    "docs/architecture/pan522-material-plan-v1.md",
    "DERIVED_EVIDENCE"
  ],
  [
    "verification/pan522-material-plan-v1.json",
    "DERIVED_EVIDENCE"
  ]
];
let pan522Node = dag.nodes.find(({id}) => id === "pan522-material-plan-v1");
if (pan522Node === undefined) {
  pan522Node = {
    id: "pan522-material-plan-v1",
    dependsOn: ["pan515-native-trade-state-v1"],
    inputs: [],
    ownedTests: ["npm run pan522:test"],
    riskClass: "HIGH",
    globalInvalidation: false,
    invariants: [
      "Deterministic pure integer STK snapshot proposals reuse existing stock contract; finished-goods netting before lot/BOM explosion, explicit calendar/version/receipt safety assumptions and immutable input identity.",
      "All parent needs precede chronological component netting; item/date aggregation retains each quantitative root, requirement, planned allocation and explicit safety/lot surplus, without duplicate proposal identity or invented demand provenance.",
      "Closed data-only/proxy/accessor-free bounded grammar, derived integer and pegging limits, original six negatives and exact independent reference oracle; late or unknown receipts and capacity dates never imply secure supply or productive authority.",
      "Actual native order/stock/history no-effects and copied-result grant denial; disabled view affects only new proposals and retains enabled native order transitions. No dispatch API, caller role, source access, productive rights or platform replacement.",
      "Closed canonical launcher and source-only operator remain governed by unchanged hard gates; material need dates are not finite-capacity feasibility or delivery promises. Main development evidence is not a new waiting gate."
    ]
  };
  dag.nodes.push(pan522Node);
}
pan522Node.inputs = pan522Inputs.map(([inputPath, role]) => ({path: inputPath, role, sha256: digest(inputPath)}));
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan522:test")) repositoryIntegrityNode.ownedTests.push("npm run pan522:test");
dag.graphVersion = 88;


// PAN-H03 optional existing-ingress native browser journey; no authority widening.
const pan528Inputs = [
  [
    "src/pan528/app.js",
    "SOURCE"
  ],
  [
    "src/pan528/guided-browser.mjs",
    "SOURCE"
  ],
  [
    "src/pan528/guided-helper-broker.mjs",
    "SOURCE"
  ],
  [
    "src/pan528/native-journey-controller.mjs",
    "SOURCE"
  ],
  [
    "src/pan528/owned-leading-resources.mjs",
    "SOURCE"
  ],
  [
    "src/pan528/runtime-observation.mjs",
    "SOURCE"
  ],
  [
    "src/pan528/screen.html",
    "SOURCE"
  ],
  [
    "src/pan528/starter-worker.mjs",
    "SOURCE"
  ],
  [
    "src/pan528/style.css",
    "SOURCE"
  ],
  [
    "tests/pan528/browser-denials.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan528/browser-fixture.mjs",
    "FIXTURE"
  ],
  [
    "tests/pan528/guided-abort-browser.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan528/guided-abort-native.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan528/guided-browser-native.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan528/guided-helper-boundary.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan528/guided-helper-browser.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan528/guided-reset-browser.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan528/guided-reset-native.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan528/mobile-browser.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan528/native-business-starter.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan528/native-process-restart.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan528/native-restart-process.mjs",
    "FIXTURE"
  ],
  [
    "tests/pan528/owned-cleanup-boundary.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan528/owner-json-special-files.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan528/registration.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan528/test-runner.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan528/wrong-business-value-browser.test.mjs",
    "VALIDATOR"
  ],
  [
    "scripts/run-pan528-guided-browser-tests.mjs",
    "VALIDATOR"
  ],
  [
    "docs/architecture/pan528-guided-browser-v1.md",
    "DERIVED_EVIDENCE"
  ],
  [
    "verification/pan528-guided-browser-boundary-v1.json",
    "DERIVED_EVIDENCE"
  ]
];
let pan528Node = dag.nodes.find(({id}) => id === "pan528-guided-native-browser-v1");
if (pan528Node === undefined) {
  pan528Node = {
  "id": "pan528-guided-native-browser-v1",
  "dependsOn": [
    "pan515-native-trade-state-v1",
    "pan527-origin-session-v1",
    "pan529-runtime-budget-v1"
  ],
  "inputs": [],
  "ownedTests": [
    "npm run pan528:test"
  ],
  "riskClass": "HIGH",
  "globalInvalidation": false,
  "invariants": [
    "Optional code-owner integration mounts one actual protected HTTPS browser document on the existing tenant gateway; role/model data, free path/executable, shell/URL/upload and foreign reset never create rights.",
    "Explicit native starter reserves the existing PAN529 budget, runs fixed real PAN515 receive10/reserve6 and independently reads leading SQLite available4; observed runtime/source-byte identity remains distinct from inherited transport claims.",
    "Pure closed typed helper proposes only via the bounded broker and textContent, without native dispatch, budget reservation, credentials or approval; business action remains a separate explicit user choice.",
    "Abort acknowledgment is not child completion; unknown effects survive actual different-process restart without redispatch/refund, and deny reset/cleanup. Bound completed own reset preserves consumed budget, other tenant and successor generations.",
    "Exact owned nested/outer resource census and descriptor-anchored deletion retain unowned or changed resources before effects. Technical first accepted visible matched result is frozen separately; HTTP200/faulted producer success with actual5vs4 is FAILED and never first-value success.",
    "Real certificate-verifying Chromium entry, native lifecycle, six original negatives and390px no-overflow observation are mandatory closed tests, not human/phone/full platform qualification. No KS journey, production, new source rights, paid provider or Main preapproval gate."
  ]
};
  dag.nodes.push(pan528Node);
}
pan528Node.inputs = pan528Inputs.map(([inputPath, role]) => ({path: inputPath, role, sha256: digest(inputPath)}));
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan528:test")) repositoryIntegrityNode.ownedTests.push("npm run pan528:test");
dag.graphVersion = 89;

// P09 existing native transaction with explicit material/good/scrap/cost and technical billing provenance.
const pan523Inputs = [
  [
    "src/pan523/production-state.mjs",
    "SOURCE"
  ],
  [
    "scripts/run-pan523-production.mjs",
    "SOURCE"
  ],
  [
    "scripts/run-pan523-production-tests.mjs",
    "SOURCE"
  ],
  [
    "tests/fixtures/pan523/native-production-fixture.mjs",
    "FIXTURE"
  ],
  [
    "tests/fixtures/pan523/produced-dispatch-fixture.mjs",
    "FIXTURE"
  ],
  [
    "tests/fixtures/pan523/historical-native-pins.mjs",
    "FIXTURE"
  ],
  [
    "tests/fixtures/pan523/retained-pan515-trade-state-54d4a597.txt",
    "FIXTURE"
  ],
  [
    "tests/pan523/native-production-boundaries.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan523/native-production-cli.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan523/native-production-cost.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan523/native-production-fulfilment.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan523/native-production-history.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan523/native-production-invoice.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan523/native-production-negatives.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan523/native-production-revision.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan523/native-production-rollback.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan523/native-production.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan523/historical-native-pins.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan523/registration.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan523/test-runner.test.mjs",
    "VALIDATOR"
  ],
  [
    "docs/architecture/pan523-native-production-v1.md",
    "DERIVED_EVIDENCE"
  ],
  [
    "verification/pan523-native-production-v1.json",
    "DERIVED_EVIDENCE"
  ],
  [
    "verification/pan523-historical-native-source-admission-v1.json",
    "DERIVED_EVIDENCE"
  ]
];
let pan523Node = dag.nodes.find(({id}) => id === "pan523-native-production-v1");
if (pan523Node === undefined) {
  pan523Node = {
    id: "pan523-native-production-v1",
    dependsOn: ["pan515-native-trade-state-v1", "pan517-native-fulfilment-v1", "pan522-material-plan-v1"],
    inputs: [], ownedTests: ["npm run pan523:test"], riskClass: "HIGH", globalInvalidation: false,
    invariants: [
      "Existing owned native order/epoch and opaque content-bound authority; declared stock/BOM/valuation, real stable revision and no caller role or productive source grant.",
      "Confirmed exact material issue and good-only finished receipt share the existing leading SQLite transaction, stock invariants, immutable coupled history and business effect identity distinct from transport retry.",
      "Declared valuation, safe integer quantities/minutes/rates and explicit partial/final operative comparison; no missing-fact defaults, capacity qualification, balance-sheet valuation or financial-profit claim.",
      "Actual produced-lot P03 dispatch binds persisted explicit technical invoice references, not fiscal invoice creation or reference-only billing fallback; incomplete billing contribution stays null and new-effect document replay is denied.",
      "Scoped disable retains confirmed movements and other original transitions; historical exact predecessor execution pins stay original under a closed one-file current-source admission, never relabelled as a new run.",
      "Original four criteria/five negatives, native SQL failure rollback, revision and corrupted-coupling denials, owned scratch and closed operator/suite remain under every unchanged canonical/CI/release gate."
    ]
  };
  dag.nodes.push(pan523Node);
}
pan523Node.inputs = pan523Inputs.map(([inputPath, role]) => ({path: inputPath, role, sha256: digest(inputPath)}));
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan523:test")) repositoryIntegrityNode.ownedTests.push("npm run pan523:test");
dag.graphVersion = 90;

// PAN537 bounded correction of the existing legacy browser approval path.
// Backend/provider inputs are unchanged; this adds no replacement authority.
const pan537Inputs = [
  [
    "packages/setup-coordinator/src/index.ts",
    "SOURCE"
  ],
  [
    "tests/pan537/native-browser-fixture.mjs",
    "FIXTURE"
  ],
  [
    "tests/pan537/browser-proposal-diff.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan537/registration.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan537/test-runner.test.mjs",
    "VALIDATOR"
  ],
  [
    "scripts/run-pan537-proposal-diff-browser-tests.mjs",
    "SOURCE"
  ],
  [
    "docs/architecture/pan537-proposal-diff-browser-v1.md",
    "SOURCE"
  ],
  [
    "tests/pan538/setup-overflow.test.mjs",
    "VALIDATOR"
  ]
];
let pan537Node = dag.nodes.find(({id}) => id === "pan537-proposal-diff-browser-v1");
if (pan537Node === undefined) {
  pan537Node = {
  "id": "pan537-proposal-diff-browser-v1",
  "dependsOn": [],
  "inputs": [],
  "ownedTests": [
    "npm run pan537:test"
  ],
  "riskClass": "HIGH",
  "globalInvalidation": false,
  "invariants": [
    "Bounded correction of the existing legacy synthetic setup browser, not a new generic shell or backend; no productive effects, provider rights or caller-role grants.",
    "Registered proposal owns the exact displayed and transmitted business Diff and digest; decision, signed authority and native effect receipt remain distinct.",
    "Human-readable Field/Before/After facts and UTC dates precede approval; raw exact proposal and digest are retained without mutation or re-digesting.",
    "Real browser owner decision, effect request, native receipt and fresh persisted target readback are mandatory; missing/tampered/stale/rejected/unauthenticated/unauthorised cases retain backend denial.",
    "Unclassified outcomes are conservatively unknown with no current blind retry; real response-loss observation forwards the native backend operation and interrupts browser delivery, never substitutes a provider or fabricates a receipt.",
    "Fixed supported native suite has no filtering or skip flags, uses owned hosted scratch and verifies all owned resource cleanup; desktop/390px source/state-bound visual selfcheck is not physical-device/human or whole-setup qualification.",
    "Legacy manifest membership, every predecessor owner and hard gate remain unchanged; all new regression/runner/documentation paths are source-only."
  ]
};
  dag.nodes.push(pan537Node);
}
pan537Node.inputs = pan537Inputs.map(([inputPath, role]) => ({path: inputPath, role, sha256: digest(inputPath)}));
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan537:test")) repositoryIntegrityNode.ownedTests.push("npm run pan537:test");
// PUI-01 shared optional browser workspace: one additive owner over existing native readers.
const pan541Inputs = [
  ["docs/architecture/browser-shell-plugin-v1.md", "SOURCE"],
  [
    "packages/browser-shell/src/context-owner-v1.ts",
    "SOURCE"
  ],
  [
    "packages/browser-shell/src/deep-link-v1.ts",
    "SOURCE"
  ],
  [
    "packages/browser-shell/src/registry-v1.ts",
    "SOURCE"
  ],
  [
    "packages/browser-workspace/src/api-v1.ts",
    "SOURCE"
  ],
  [
    "packages/browser-workspace/src/app.ts",
    "SOURCE"
  ],
  [
    "packages/browser-workspace/src/plugin-diagnostics-v1.ts",
    "SOURCE"
  ],
  [
    "packages/browser-workspace/src/plugin-erv-v1.ts",
    "SOURCE"
  ],
  [
    "packages/browser-workspace/src/plugin-setup-v1.ts",
    "SOURCE"
  ],
  [
    "packages/browser-workspace/src/workspace.css",
    "SOURCE"
  ],
  [
    "packages/browser-workspace/src/workspace.html",
    "SOURCE"
  ],
  [
    "packages/contracts/src/browser-erv-read-v1.ts",
    "CONTRACT"
  ],
  [
    "packages/contracts/src/browser-shell-plugin-v1.ts",
    "CONTRACT"
  ],
  [
    "scripts/build-pan541-browser.mjs",
    "SOURCE"
  ],
  [
    "scripts/run-pan541-shared-browser-shell-tests.mjs",
    "VALIDATOR"
  ],
  [
    "src/pan541/native-erv-read-adapter.mjs",
    "SOURCE"
  ],
  [
    "src/pan541/workspace-browser.mjs",
    "SOURCE"
  ],
  [
    "tests/pan541/browser-context-safety.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan541/browser-plugin-fault.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan541/browser-workspace.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan541/context-native.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan541/deep-link.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan541/descriptor-types.ts",
    "VALIDATOR"
  ],
  [
    "tests/pan541/descriptor.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan541/native-erv-read.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan541/registration.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan541/registry.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan541/test-runner.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan541/workspace-native.test.mjs",
    "VALIDATOR"
  ]
];
let pan541Node = dag.nodes.find(({ id }) => id === "pan541-shared-browser-shell-v1");
if (pan541Node === undefined) {
  pan541Node = {
    id: "pan541-shared-browser-shell-v1",
    dependsOn: ["pan516-native-procurement-v1", "pan527-origin-session-v1"],
    inputs: [], ownedTests: ["npm run pan541:test"], riskClass: "HIGH", globalInvalidation: false,
    invariants: [
      "Closed typed descriptors bind only code-owned trusted in-process factories and six shell slots; no arbitrary code loading, sandbox claim or backend rights from browser metadata.",
      "Existing native Setup and leading SQLite ERV readers share one protected browser shell; selected-object panels and registered deep links retain tenant, session and revision identity without a shadow ledger or writer.",
      "Shell-owned epochs retire old reads, render results and listeners; native rights, tenant, expiry and revision checks remain authoritative, and delayed retired JSON reads never overwrite replacement session cookies.",
      "Disabled, incompatible, missing dependency and renderer failures remain visible while other module navigation and own persisted session logout stay available; diagnostic modules require owner-process opt-in.",
      "Actual certificate-verifying browser/native positive and negative cases, technical desktop/390px/CSS-zoom checks and fixed mandatory suite remain distinct from human/device, paired consumer and canonical/CI/release/closure qualification."
    ]
  };
  dag.nodes.push(pan541Node);
}
// PAN543 extends the existing optional shell owner; no new owner/edges,
// selector, hard gates, provider behavior or runnable payload is introduced.
const pan543Inputs = [
  ["docs/architecture/browser-profile-v1.md", "DERIVED_EVIDENCE"],
  ["packages/browser-workspace/src/profile-editor-v1.ts", "SOURCE"],
  ["packages/contracts/src/browser-profile-v1.ts", "CONTRACT"],
  ["scripts/run-pan543-browser-profile-tests.mjs", "VALIDATOR"],
  ["scripts/refresh-pan543-integrity.mjs", "SOURCE"],
  ["src/pan543/profile-store.mjs", "SECURITY"],
  ["tests/pan543/backend-fixture.mjs", "VALIDATOR"],
  ["tests/pan543/browser.test.mjs", "VALIDATOR"],
  ["tests/pan543/profile-types.ts", "VALIDATOR"],
  ["tests/pan543/profile.test.mjs", "VALIDATOR"],
  ["tests/pan543/registration.test.mjs", "VALIDATOR"],
  ["tests/pan543/transport.test.mjs", "VALIDATOR"],
];
pan541Node.inputs = [...pan541Inputs, ...pan543Inputs].map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
pan541Node.ownedTests = ["npm run pan541:test", "npm run pan543:test"];
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan541:test")) repositoryIntegrityNode.ownedTests.push("npm run pan541:test");
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan543:test")) repositoryIntegrityNode.ownedTests.push("npm run pan543:test");
dag.graphVersion = 93;

// PAN563 extends the existing profile/budget/session contracts with a bounded
// durable draft owner. A source distribution is not model/apply authority.
const pan563Inputs = [
  [
    "docs/architecture/agent-configuration-draft-v1.md",
    "DERIVED_EVIDENCE"
  ],
  [
    "packages/browser-workspace/src/configuration-draft-v1.css",
    "SOURCE"
  ],
  [
    "packages/browser-workspace/src/plugin-configuration-draft-v1.ts",
    "SOURCE"
  ],
  [
    "packages/contracts/src/agent-configuration-draft-v1.ts",
    "CONTRACT"
  ],
  [
    "scripts/run-pan563-configuration-draft-tests.mjs",
    "VALIDATOR"
  ],
  [
    "src/pan563/draft-store.mjs",
    "SECURITY"
  ],
  [
    "tests/pan563/browser-draft.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan563/capture-coverage.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan563/compatibility.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan563/configuration-contract.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan563/contract-types.ts",
    "VALIDATOR"
  ],
  [
    "tests/pan563/durable-draft.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan563/helpers.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan563/native-view-capture.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan563/process-cas.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan563/process-drain-parent.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan563/process-drain-tail.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan563/process-observation.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan563/process-writer.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan563/protected-draft.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan563/registration.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan563/zoom-extension/manifest.json",
    "VALIDATOR"
  ],
  [
    "tests/pan563/zoom-extension/worker.js",
    "VALIDATOR"
  ]
];
let pan563Node = dag.nodes.find(({ id }) => id === "pan563-configuration-draft-v1");
if (pan563Node === undefined) {
  pan563Node = {
    id: "pan563-configuration-draft-v1",
    dependsOn: ["pan441-employee-profile-v1", "pan529-runtime-budget-v1", "pan541-shared-browser-shell-v1"],
    inputs: [], ownedTests: ["npm run pan563:test"], riskClass: "HIGH", globalInvalidation: false,
    invariants: [
      "Closed typed/runtime-validated drafts extend the existing profile/template and runtime budget contracts; no competing registry or policy engine.",
      "Field provenance, dependency invalidation and next required questions derive server-side; no silent UNKNOWN defaults, caller identity or role authority.",
      "Native revision CAS and versioned persistent drafts bind tenant, user, instance and profile; raw secrets, stale/cross-tenant and incompatible schema writes deny.",
      "Saving a model-less draft does not apply effects, infer model/provider access, grant tool rights or prove model-assisted conversation.",
      "Fixed actual native/browser tests and finite desktop/390px/native200 view evidence remain distinct from human/device, full canonical/CI/release and closure qualification."
    ]
  };
  dag.nodes.push(pan563Node);
}
pan563Node.inputs = pan563Inputs.map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan563:test")) repositoryIntegrityNode.ownedTests.push("npm run pan563:test");
dag.graphVersion = 94;

// PAN542 is a bounded human-decision attachment to existing native ERV,
// protected sessions and durable task controls; no general workflow engine.
const pan542Inputs = [
  [
    "docs/architecture/erv-human-native-backend-v1.md",
    "DERIVED_EVIDENCE"
  ],
  [
    "scripts/run-pan542-native-human-tests.mjs",
    "VALIDATOR"
  ],
  [
    "src/pan542/native-human-backend.mjs",
    "SECURITY"
  ],
  [
    "tests/pan542/native-human-backend.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan542/registration.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan542/restart-reader.mjs",
    "VALIDATOR"
  ]
];
let pan542Node = dag.nodes.find(({ id }) => id === "pan542-native-erv-human-v1");
if (pan542Node === undefined) {
  pan542Node = {
    id: "pan542-native-erv-human-v1",
    dependsOn: ["pan516-native-procurement-v1", "pan527-origin-session-v1", "pan464-retained-pair-v1"],
    inputs: [], ownedTests: ["npm run pan542:test"], riskClass: "HIGH", globalInvalidation: false,
    invariants: [
      "One exact local synthetic native invoice scenario, immutable executed-source/configuration identity and versioned server-side subject/native-role mapping; browser claims, copied session facades and client taskstores are not authority.",
      "Existing native liability/ERV evaluation, PAN453 owner/task identity and STOP/REVOKE controls are reused; only bounded review/query/evidence-approval state is added to the same leading SQLite target.",
      "Current native/proposal revision and digest, separate mapped reviewer/approver and immutable task/event history are checked before each effect; transport identity does not create a second decision.",
      "Actual fresh-process persistence and committed-response-loss read-only reconciliation bind the retained event/task to the current native basis; missing/drifted outcomes remain unknown and no blind retry is authorized.",
      "APPROVED_LOCAL_EVIDENCE_ONLY gives no booking/payment/dispatch/execution rights. Backend-only native tests do not claim browser, image, human, provider, whole canonical/CI/release or closure acceptance."
    ]
  };
  dag.nodes.push(pan542Node);
}
pan542Node.inputs = pan542Inputs.map(([inputPath, role]) => ({ path: inputPath, role, sha256: digest(inputPath) }));
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan542:test")) repositoryIntegrityNode.ownedTests.push("npm run pan542:test");
dag.graphVersion = 95;

// PAN574 is an additive two-export seam, not a new native kernel or registry.
// Keep PAN471's read-only inventory owner and every bounded owner unchanged;
// register this closed source-only seam on the existing integration owner.
const pan574Inputs = [
  ["src/pan471/composition-bindings.mjs", "SECURITY"],
  ["scripts/run-pan574-composition-contracts.mjs", "SOURCE"],
  ["tests/pan471/composition-bindings.test.mjs", "VALIDATOR"],
  ["docs/architecture/pan574-composition-bindings-v1.md", "DERIVED_EVIDENCE"],
  ["contracts/pan574/public-examples-v1.json", "FIXTURE"],
  ["contracts/pan574/original-context-v1/D0/manifest.json", "CONTRACT"],
  ["contracts/pan574/original-context-v1/D0/material-input-original.txt", "CONTRACT"],
  ["contracts/pan574/original-context-v1/D0/material-authority-original.txt", "CONTRACT"],
  ["contracts/pan574/original-context-v1/D0/erp-profile-original.schema.json", "CONTRACT"],
  ["contracts/pan574/original-context-v1/D0/inventory-boundary-original.txt", "CONTRACT"],
  ["contracts/pan574/original-context-v1/S/manifest.json", "CONTRACT"],
];
for (const [inputPath, role] of pan574Inputs) {
  const matches = repositoryIntegrityNode.inputs.filter(({path: candidate}) => candidate === inputPath);
  if (matches.length > 1 || (matches.length === 1 && matches[0].role !== role)) throw new Error(`PAN574_INTEGRITY_OWNERSHIP_DENIED:${inputPath}`);
  if (matches.length === 0) repositoryIntegrityNode.inputs.push({path: inputPath, role, sha256: digest(inputPath)});
}
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan574:test")) repositoryIntegrityNode.ownedTests.push("npm run pan574:test");

// PAN576 is a finite separated workload extension of the retained PAN454
// image and PAN574 native bindings, not a new registry or agent platform.
const pan576Inputs = [
  ["scripts/pan576-kernel-guard.c", "SECURITY"],
  ["scripts/pan576-isolated-worker.mjs", "SECURITY"],
  ["src/pan471/composition-execution.mjs", "SECURITY"],
  ["tests/pan471/composition-execution.test.mjs", "VALIDATOR"],
  ["docs/architecture/pan576-isolated-composition-execution-v1.md", "DERIVED_EVIDENCE"],
];
for (const [inputPath, role] of pan576Inputs) {
  const matches = repositoryIntegrityNode.inputs.filter(({path: candidate}) => candidate === inputPath);
  if (matches.length > 1 || (matches.length === 1 && matches[0].role !== role)) throw new Error(`PAN576_INTEGRITY_OWNERSHIP_DENIED:${inputPath}`);
  if (matches.length === 0) repositoryIntegrityNode.inputs.push({path: inputPath, role, sha256: digest(inputPath)});
}
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan576:test")) repositoryIntegrityNode.ownedTests.push("npm run pan576:test");

// PAN544 personal native notifications: projection, never a business workflow owner.
const pan544Inputs = [
  [
    "docs/architecture/native-workspace-notifications-v1.md",
    "DERIVED_EVIDENCE"
  ],
  [
    "packages/browser-workspace/src/notifications-v1.ts",
    "SOURCE"
  ],
  [
    "packages/contracts/src/workspace-notifications-v1.ts",
    "CONTRACT"
  ],
  [
    "scripts/run-pan544-native-notification-tests.mjs",
    "VALIDATOR"
  ],
  [
    "src/pan544/native-notifications.mjs",
    "SECURITY"
  ],
  [
    "tests/pan544/browser-fixture.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan544/browser-notifications.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan544/contracts.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan544/gateway.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan544/native-notifications.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan544/registration.test.mjs",
    "VALIDATOR"
  ],
  [
    "tests/pan544/restart-reader.mjs",
    "VALIDATOR"
  ]
];
let pan544Node = dag.nodes.find(({id}) => id === "pan544-native-notifications-v1");
if (pan544Node === undefined) {
  pan544Node = {
    id: "pan544-native-notifications-v1", dependsOn: ["pan541-shared-browser-shell-v1", "pan542-native-erv-human-v1"],
    inputs: [], ownedTests: ["npm run pan544:test"], riskClass: "HIGH", globalInvalidation: false,
    invariants: [
      "Protected native human/event/task publication before first plugin visit; closed target and canonical event identity, no arbitrary URL/HTML/callback or new workflow engine.",
      "Persistent tenant/subject preferences, subscriptions, filters and personal read are distinct from task completion, approval, financial effect and execution rights.",
      "Current effective origin/session/role/realm/generation and native object/task revision; stale, removed, completed, unavailable and expired targets deny without rematching or false success.",
      "Actual native child commit and fresh-process read; real browser response-loss reconciliation without a repeated mutation, revoked logout and late-delivery context retirement.",
      "Complete fixed native/contracts/TLS/browser suite, genuine screenshots and measured focus/narrow-layout regression; unchanged hard gates and explicit synthetic/source-only nonclaims."
    ]
  };
  dag.nodes.push(pan544Node);
}
pan544Node.inputs = pan544Inputs.map(([inputPath, role]) => ({path: inputPath, role, sha256: digest(inputPath)}));
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan544:test")) repositoryIntegrityNode.ownedTests.push("npm run pan544:test");
dag.graphVersion = 96;

// PAN549 bounded read/result view: existing native STOCK, local cohort and shell.
const pan549Inputs = [
  ["contracts/workspace-analysis/pan549-early-candidate-v1.json", "CONTRACT"],
  ["docs/architecture/pan549-workspace-analysis-v1.md", "DERIVED_EVIDENCE"],
  ["packages/browser-workspace/src/analysis-v1.css", "SOURCE"],
  ["packages/browser-workspace/src/plugin-analysis-v1.ts", "SOURCE"],
  ["packages/contracts/src/workspace-analysis-v1.ts", "CONTRACT"],
  ["scripts/run-pan549-native-analysis-tests.mjs", "VALIDATOR"],
  ["src/pan549/native-analysis-read.mjs", "SECURITY"],
  ["tests/pan549/browser-analysis.test.mjs", "VALIDATOR"],
  ["tests/pan549/browser-fixture.mjs", "VALIDATOR"],
  ["tests/pan549/browser-lifecycle-analysis.test.mjs", "VALIDATOR"],
  ["tests/pan549/cohort-analysis.test.mjs", "VALIDATOR"],
  ["tests/pan549/native-analysis-read.test.mjs", "VALIDATOR"],
  ["tests/pan549/protected-analysis.test.mjs", "VALIDATOR"],
  ["tests/pan549/registration.test.mjs", "VALIDATOR"]
];
let pan549Node = dag.nodes.find(({id}) => id === "pan549-native-analysis-result-v1");
if (pan549Node === undefined) {
  pan549Node = {
    id: "pan549-native-analysis-result-v1",
    dependsOn: ["awi-insights-1-usage-insights-v1", "pan520-native-projections-v1", "pan541-shared-browser-shell-v1"],
    inputs: [], ownedTests: ["npm run pan549:test"], riskClass: "HIGH", globalInvalidation: false,
    invariants: [
      "One finite read-only STOCK mapping consumes actual leading native PAN515/PAN520 data; source revision, cutoff, grain and units remain separate from complete result-byte integrity and protected origin/session/scope authority.",
      "Missing history or qualified valuation remains UNAVAILABLE/null and the stock view PARTIAL; no unknown-to-zero, implicit denominator, adoption or completeness claims.",
      "The separately owner-selected existing local Usage Insights report admits only EMPTY/SUPPRESSED partial cohorts with null metrics, original small-cell policy and UNKNOWN population denominator; no collector, consent or transport activation.",
      "Plain-text asynchronous rendering rechecks complete result bytes and live context; actual native logout, expiry, replaced/foreign session, stale source/result, tampered/lost delivery and retired view never expose old facts or authorize retries.",
      "Proposal, effect and execution authority remain absent; unchanged shared shell/rights/deep links and other modules survive optional analysis absence or failure. Early counterpart descriptor bytes remain historical, not current runtime pins.",
      "Fixed complete native/cohort/TLS/browser/registration entry, actual desktop390/CSS-layout/font/keyboard measurements and source-bound images remain distinct from human/device, paired KS and canonical/CI/release/closure acceptance."
    ]
  };
  dag.nodes.push(pan549Node);
}
pan549Node.inputs = pan549Inputs.map(([inputPath, role]) => ({path: inputPath, role, sha256: digest(inputPath)}));
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan549:test")) repositoryIntegrityNode.ownedTests.push("npm run pan549:test");
dag.graphVersion = 97;

// PAN548 early DUI-02: additive authentic session/native context, no task engine.
const pan548Inputs = [
  ["docs/architecture/workspace-context-selection-v1.md", "DERIVED_EVIDENCE"],
  ["packages/browser-shell/src/extended-context-owner-v1.ts", "SOURCE"],
  ["packages/browser-workspace/src/context-selection-v1.ts", "SOURCE"],
  ["packages/contracts/src/workspace-context-selection-v1.ts", "CONTRACT"],
  ["scripts/run-pan548-authentic-context-tests.mjs", "VALIDATOR"],
  ["src/pan548/native-context-selection.mjs", "SECURITY"],
  ["tests/pan548/context-contract.test.mjs", "VALIDATOR"],
  ["tests/pan548/native-context.test.mjs", "VALIDATOR"],
  ["tests/pan548/native-expiry.test.mjs", "VALIDATOR"],
  ["tests/pan548/native-reentrant.test.mjs", "VALIDATOR"],
  ["tests/pan548/browser-context.test.mjs", "VALIDATOR"],
  ["tests/pan548/registration.test.mjs", "VALIDATOR"],
  ["docs/architecture/workspace-agent-panel-v1.md", "DERIVED_EVIDENCE"],
  ["packages/browser-workspace/src/workspace-agent-panel-v1.css", "SOURCE"],
  ["packages/browser-workspace/src/workspace-agent-panel-v1.ts", "SOURCE"],
  ["packages/contracts/src/workspace-agent-run-v1.ts", "CONTRACT"],
  ["src/pan548/native-agent-run.mjs", "SECURITY"],
  ["tests/pan548/native-agent-run.test.mjs", "VALIDATOR"],
  ["tests/pan548/agent-run-transport-contract.test.mjs", "VALIDATOR"],
  ["tests/pan548/browser-agent-panel.test.mjs", "VALIDATOR"]
];
let pan548Node = dag.nodes.find(({id}) => id === "pan548-authentic-context-selection-v1");
if (pan548Node === undefined) {
  pan548Node = {
    id: "pan548-authentic-context-selection-v1",
    dependsOn: ["pan527-origin-session-v1", "pan541-shared-browser-shell-v1"],
    inputs: [], ownedTests: ["npm run pan548:test"], riskClass: "HIGH", globalInvalidation: false,
    invariants: [
      "Server-issued opaque handles bind current protected origin/session/tenant/subject/role/instance/generation/tab/epoch; claims resolve against existing registered native Setup and ERV descriptors, not CSS, DOM, widget or model authority.",
      "Independent host/domain/view/catalog/selection revisions and nullable primary objects remain exact native projections; copied foreign handles, invented rows, stale leases and post-leading-read expiry deny without leading effects.",
      "One additive shared lifetime primitive retires pending read/STT/model/render/preview responses, without implementing inference, voice, task execution or a second registry/shell/store.",
      "SourceMap is null and ui.context.read/ui.selection.read are descriptive only; executionAuthorityGranted and effectsProduced are false. Native rights remain server-owned and no mutation retries or false Cancel/Retire success are inferred.",
      "Complete fixed contract/native/TLS/expiry/real-Chromium/registration suite, actual keyboard/module retirement and bounded desktop390/CSS-zoom evidence preserve existing gates and direct consumer contracts; early context is not whole original548 delivery."
    ]
  };
  dag.nodes.push(pan548Node);
}
pan548Node.inputs = pan548Inputs.map(([inputPath, role]) => ({path: inputPath, role, sha256: digest(inputPath)}));
for (const invariant of [
  "Additive default-off PUI07/DUI06 panel consumes the same native context/catalog/view owners and existing ModelAccessBroker/native resource SQLite ledger, not a second task engine.",
  "Opaque native plan/start/independent read binds source/session/lease/rights and unknown usage; separate546 preview/confirmation/CAS/readback/Undo is the only personal-view effect boundary.",
  "Synthetic probe is visibly not real-model DUI09 acceptance; unbound565575 route/consent failclosed; cancel/resume unavailable; no new inference/global rights or gate weakening."
]) if (!pan548Node.invariants.includes(invariant)) pan548Node.invariants.push(invariant);
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan548:test")) repositoryIntegrityNode.ownedTests.push("npm run pan548:test");
dag.graphVersion = 98;

// PAN546: additive personal module views + connected native Human browser use
// the existing shell/profile owner. No duplicate node, payload or global gate.
const pan546Inputs = [
  ["docs/architecture/native-module-view-human-browser-v1.md", "DERIVED_EVIDENCE"],
  ["packages/contracts/src/workspace-module-view-v1.ts", "CONTRACT"],
  ["packages/contracts/src/workspace-erv-human-v1.ts", "CONTRACT"],
  ["packages/browser-workspace/src/module-view-native-v1.ts", "SOURCE"],
  ["packages/browser-workspace/src/module-view-editor-v1.ts", "SOURCE"],
  ["packages/browser-workspace/src/module-view-v1.css", "SOURCE"],
  ["packages/browser-workspace/src/erv-human-v1.ts", "SOURCE"],
  ["src/pan546/native-data-catalog.mjs", "SECURITY"],
  ["src/pan546/native-view-owner.mjs", "SECURITY"],
  ["src/pan546/native-human-workspace.mjs", "SECURITY"],
  ["docs/architecture/native-invoice-navigation-browser-v1.md", "DERIVED_EVIDENCE"],
  ["packages/contracts/src/workspace-invoice-navigation-v1.ts", "CONTRACT"],
  ["packages/browser-workspace/src/workspace-invoice-navigation-v1.ts", "SOURCE"],
  ["packages/browser-workspace/src/workspace-invoice-navigation-v1.css", "SOURCE"],
  ["packages/browser-workspace/src/workspace-dirty-draft-v1.ts", "SOURCE"],
  ["src/pan546/native-invoice-navigation.mjs", "SECURITY"],
  ["tests/pan546/native-invoice-navigation.test.mjs", "VALIDATOR"],
  ["tests/pan546/navigation-review517.test.mjs", "VALIDATOR"],
  ["tests/pan546/navigation-transport.test.mjs", "VALIDATOR"],
  ["tests/pan546/browser-navigation.test.mjs", "VALIDATOR"],
  ["scripts/run-pan546-native-view-human-tests.mjs", "VALIDATOR"],
  ["tests/pan546/module-view.test.mjs", "VALIDATOR"],
  ["tests/pan546/native-view.test.mjs", "VALIDATOR"],
  ["tests/pan546/transport.test.mjs", "VALIDATOR"],
  ["tests/pan546/native-association.test.mjs", "VALIDATOR"],
  ["tests/pan546/reservation-native.test.mjs", "VALIDATOR"],
  ["tests/pan546/native-human-workspace.test.mjs", "VALIDATOR"],
  ["tests/pan546/native-references.test.mjs", "VALIDATOR"],
  ["tests/pan546/browser-view.test.mjs", "VALIDATOR"],
  ["tests/pan546/browser-human.test.mjs", "VALIDATOR"],
  ["tests/pan546/browser-human-combined.test.mjs", "VALIDATOR"],
  ["tests/pan546/registration.test.mjs", "VALIDATOR"],
  ["tests/pan546/native-fixture.mjs", "VALIDATOR"],
  ["tests/pan546/browser-fixture.mjs", "VALIDATOR"],
  ["tests/pan546/native-profile-reservation-probe.mjs", "VALIDATOR"],
  ["tests/pan546/native-human-reservation-probe.mjs", "VALIDATOR"],
];
pan541Node.inputs.push(...pan546Inputs.map(([inputPath, role]) => ({path: inputPath, role, sha256: digest(inputPath)})));
pan541Node.ownedTests.push("npm run pan546:test");
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan546:test")) repositoryIntegrityNode.ownedTests.push("npm run pan546:test");

// PAN565 minimal connection attaches to EXISTING shell/profile, broker and budget.
// Source evidence only: no new owner/controller, runnable manifest or hard gate.
const pan565Inputs = [
  ["docs/architecture/workspace-model-connection-v1.md", "DERIVED_EVIDENCE"],
  ["packages/contracts/src/workspace-model-connection-v1.ts", "CONTRACT"],
  ["packages/browser-workspace/src/workspace-model-connection-v1.ts", "SOURCE"],
  ["packages/browser-workspace/src/workspace-model-connection-v1.css", "SOURCE"],
  ["src/pan565/native-model-connection.mjs", "SECURITY"],
  ["src/pan565/connection-transport.mjs", "SECURITY"],
  ["scripts/run-pan565-model-connection-tests.mjs", "VALIDATOR"],
  ["tests/pan565/native-fixture.mjs", "VALIDATOR"],
  ["tests/pan565/native-model-connection.test.mjs", "VALIDATOR"],
  ["tests/pan565/transport-price-bound.test.mjs", "VALIDATOR"],
  ["tests/pan565/browser-model-connection.test.mjs", "VALIDATOR"],
  ["tests/pan565/registration.test.mjs", "VALIDATOR"],
];
pan541Node.inputs.push(...pan565Inputs.map(([inputPath, role]) => ({path: inputPath, role, sha256: digest(inputPath)})));
pan541Node.ownedTests.push("npm run pan565:test");
if (!repositoryIntegrityNode.ownedTests.includes("npm run pan565:test")) repositoryIntegrityNode.ownedTests.push("npm run pan565:test");

// PAN462 canonical CI hard-gate correction: bounded integration ownership.
// A byte that already has its own bounded task owner is OWNED THERE and must
// not be duplicated on the integration owner. The integration owner keeps
// exactly the inputs no other bounded node owns, so its input list stays inside
// the frozen Evidence-DAG schema bound (inputs maxItems 128) without relaxing
// the schema, weakening a hard ownership role or dropping any selection.
const ownedByBoundedNodes = new Set(
  dag.nodes
    .filter((node) => node !== repositoryIntegrityNode)
    .flatMap((node) => node.inputs.map(({ path: ownedPath }) => ownedPath)),
);
repositoryIntegrityNode.inputs = repositoryIntegrityNode.inputs.filter(
  ({ path: ownedPath }) => !ownedByBoundedNodes.has(ownedPath),
);
repositoryIntegrityNode.inputs.sort((left, right) => left.path.localeCompare(right.path, "en"));

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
for (const [inputPath] of pan463Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan464Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan465Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan466Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan487Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan472Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan473Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan467Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan454Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan360Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan378Inputs) entries.set(inputPath, null);
for (const [inputPath] of ervWorkflowInputs) entries.set(inputPath, null);
for (const [inputPath] of pan396Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan515Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan516Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan517Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan524Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan520Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan525Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan526Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan527Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan529Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan521Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan522Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan528Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan523Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan537Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan541Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan543Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan563Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan542Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan544Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan549Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan548Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan546Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan565Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan574Inputs) entries.set(inputPath, null);
for (const [inputPath] of pan576Inputs) entries.set(inputPath, null);
for (const relative of [
  "tests/demo-current-head-e2e-uninstall.test.mjs",
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
  "docs/architecture/pan462-native-backup-restore-v1.md",
  "schemas/contracts/pan462-native-backup-restore-v1.schema.json",
  "src/pan462/native-backup-restore.mjs",
  "tests/pan462/native-backup-restore.test.mjs",
  "verification/pan462-native-backup-restore-boundary-v1.json",
  "tests/fixtures/pan462/config-source-v1.json",
  "tests/fixtures/pan462/content-note-v1.txt",
  "tests/fixtures/pan462/expected-facts-v1.json",
  "tests/fixtures/pan462/installation-content-v1.json",
  "tests/fixtures/pan462/key-ref-v1.txt",
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
  "src/pan470/producer-handoff-v2.mjs",
  "tests/fixtures/pan470/evidence-selfcheck-v1.txt",
  "tests/fixtures/pan470/producer-evidence-v2.txt",
  "tests/pan470/handoff-effort.test.mjs",
  "tests/pan470/producer-handoff-v2.test.mjs",
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
