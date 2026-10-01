import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  validateRecordedPublicState,
  validateReleaseContract,
  validateRepository,
  verifyPublicReadback,
} from "../scripts/verify-release-governance.mjs";

const ROOT = resolve(import.meta.dirname, "..");

test("DOC-AI-AC01 current entry points distinguish synthetic scoring from the real pilot", () => {
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  const provingGround = readFileSync(join(ROOT, "docs/INCOMING-INVOICE-PROVING-GROUND.md"), "utf8");
  const history = readFileSync(join(ROOT, "docs/evidence/PS360-SOURCE-CLOSURE-v1.md"), "utf8");
  assert.match(readme, /synthetic invoice example/);
  assert.match(readme, /there is no released executable variant for it yet/);
  assert.doesNotMatch(readme, /(?:released|proven|delivered) OCR model/i);
  assert.match(provingGround, /→ Synthetic extraction scoring harness/);
  assert.doesNotMatch(provingGround, /→ Document-AI extraction/);
  assert.match(history, /historical issue title; synthetic scoring, not model-quality evidence/);
  for (const text of [provingGround, history]) {
    assert.ok(text.includes("https://github.com/JoFe2/PANSPHAIRA/issues/378"));
  }
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "cm-release-governance-"));
  cpSync(ROOT, root, {
    recursive: true,
    filter: (source) => !source.includes("node_modules") && !/(?:^|\/)\.git(?:\/|$)/.test(source) && !source.includes("/dist")
  });
  return root;
}

function replace(root, path, before, after) {
  const file = join(root, path);
  writeFileSync(file, readFileSync(file, "utf8").replace(before, after));
}

function replaceAll(root, path, before, after) {
  const file = join(root, path);
  writeFileSync(file, readFileSync(file, "utf8").replaceAll(before, after));
}

function append(root, path, value) {
  const file = join(root, path);
  writeFileSync(file, `${readFileSync(file, "utf8")}\n${value}\n`);
}

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

function conformingReleaseFixture(releaseClass) {
  const governance = structuredClone(JSON.parse(readFileSync(join(ROOT, "release", "governance.json"), "utf8")));
  governance.releaseTaxonomy.githubLatestOwnerClass = releaseClass;
  const mergeSha = releaseClass === "REGULAR_RUNNABLE_ARTIFACT" ? "a".repeat(40) : "b".repeat(40);
  const tag = releaseClass === "REGULAR_RUNNABLE_ARTIFACT" ? "v9.9.9-poc.20260902.1" : "2026_09_02_v8";
  const archiveBytes = Buffer.from("bounded runnable fixture\n");
  const archiveName = "cm-product-increment-rc-20260902-release-authority.tar.gz";
  const archiveDigest = digest(archiveBytes);
  const sidecarName = `${archiveName}.sha256`;
  const sidecarBytes = Buffer.from(`${archiveDigest}  ${archiveName}\n`);
  const assets = releaseClass === "REGULAR_RUNNABLE_ARTIFACT"
    ? [
      { name: archiveName, size: archiveBytes.length, sha256: archiveDigest },
      { name: sidecarName, size: sidecarBytes.length, sha256: digest(sidecarBytes) },
    ]
    : [];
  const maturity = releaseClass === "REGULAR_RUNNABLE_ARTIFACT" ? "RELEASED_LOCAL_SYNTHETIC" : "SOURCE_EVIDENCE_ONLY";
  const proofClass = releaseClass === "REGULAR_RUNNABLE_ARTIFACT" ? "LOCAL_EXECUTABLE" : "SOURCE_EVIDENCE";
  const artifactPath = "README.md";
  const artifactDigest = digest(readFileSync(join(ROOT, artifactPath)));
  const assetBody = releaseClass === "REGULAR_RUNNABLE_ARTIFACT"
    ? assets.map(({ name, size, sha256 }) => `- ASSET: ${name} | SIZE=${size} | SHA256=${sha256}`).join("\n")
    : "NO_ASSETS_SOURCE_ONLY";
  const body = [
    "## Release class",
    `RELEASE_CLASS: ${releaseClass}`,
    "",
    "## Exact merge SHA",
    `MERGE_SHA: ${mergeSha}`,
    "",
    "## Included capabilities and issues",
    "- CAPABILITY: REL-TRUTH-AC01",
    "- ISSUE: #376",
    "",
    "## Evidence boundary",
    `- CLAIM_PROOF: REL-TRUTH-AC01 | MATURITY=${maturity} | PROOF_CLASS=${proofClass} | ARTIFACT=${artifactPath} | EXACT_IDENTITY=sha256:${artifactDigest} | GATE=EXECUTABLE:npm run release-governance:test | NONCLAIM=No production fitness or authority expansion is claimed.`,
    "",
    "## Tests",
    "- TEST: npm run release-governance:test => PASS",
    "",
    "## Assets and checksums",
    assetBody,
    "",
    "## Nonclaims",
    "- NONCLAIM: No production readiness, credential, tenant, publication, or runtime authority is claimed.",
    "",
    "## Closure state",
    "PUBLIC_READBACK: PENDING",
    "ISSUE_QUEUE_TERMINAL: BLOCKED_PENDING_PUBLIC_READBACK",
  ].join("\n");
  const release = {
    id: releaseClass === "REGULAR_RUNNABLE_ARTIFACT" ? 900000001 : 900000002,
    tag_name: tag,
    name: "PanSphaira release-authority correction",
    target_commitish: mergeSha,
    draft: false,
    prerelease: false,
    published_at: "2026-09-02T16:00:00Z",
    html_url: `https://github.com/JoFe2/PANSPHAIRA/releases/tag/${tag}`,
    body,
    assets: assets.map(({ name, size }) => ({
      name,
      size,
      browser_download_url: `https://github.com/JoFe2/PANSPHAIRA/releases/download/${tag}/${name}`,
    })),
  };
  const downloadedAssets = new Map(releaseClass === "REGULAR_RUNNABLE_ARTIFACT"
    ? [[archiveName, archiveBytes], [sidecarName, sidecarBytes]]
    : []);
  return {
    root: ROOT,
    governance,
    release,
    latest: { tag_name: tag },
    tagRef: { ref: `refs/tags/${tag}`, object: { sha: mergeSha, type: "commit" } },
    downloadedAssets,
  };
}

test("repository release governance passes", () => {
  assert.deepEqual(validateRepository(ROOT), []);
});

test("REL-TRUTH taxonomy reconciles current Main, GitHub Latest, and the historical runnable artifact", () => {
  const governance = JSON.parse(readFileSync(join(ROOT, "release", "governance.json"), "utf8"));
  assert.equal(governance.schemaVersion, "chimpmaera.release-governance/v2");
  assert.equal(governance.releaseTaxonomy.schemaVersion, "chimpmaera.release-taxonomy/v1");
  assert.equal(governance.releaseTaxonomy.githubLatestOwnerClass, "SOURCE_EVIDENCE_ONLY");
  assert.deepEqual(
    governance.releaseTaxonomy.classes.map(({ id }) => id),
    ["REGULAR_RUNNABLE_ARTIFACT", "SOURCE_EVIDENCE_ONLY"],
  );
  assert.equal(governance.publicLatestRelease.tag, "2026_09_02_v7");
  assert.equal(governance.publicLatestRelease.targetCommitish, "1e65fee46c609ba7239d63b9c245b32e045e004c");
  assert.equal(governance.publicLatestRelease.releaseClass, "SOURCE_EVIDENCE_ONLY");
  assert.deepEqual(governance.publicLatestRelease.assets, []);
  assert.equal(governance.currentRelease.tag, "v0.2.0-poc.20260825.1");
  assert.equal(governance.currentRelease.releaseClass, "REGULAR_RUNNABLE_ARTIFACT");
  assert.equal(governance.currentRelease.mustBeLatest, false);
  assert.equal(governance.currentRelease.historical, true);
});

test("regular/runnable and source/evidence-only releases pass only their class-specific public contract", () => {
  for (const releaseClass of ["REGULAR_RUNNABLE_ARTIFACT", "SOURCE_EVIDENCE_ONLY"]) {
    const input = conformingReleaseFixture(releaseClass);
    assert.deepEqual(validateReleaseContract(input), [], releaseClass);
  }
});

function nonLatestRunnableFixture() {
  const input = conformingReleaseFixture("REGULAR_RUNNABLE_ARTIFACT");
  const owner = conformingReleaseFixture("SOURCE_EVIDENCE_ONLY");
  input.governance = owner.governance;
  const tag = input.governance.forwardRunnableReleases.designations[0].tag;
  const oldTag = input.release.tag_name;
  input.release.tag_name = tag;
  input.tagRef.ref = `refs/tags/${tag}`;
  input.release.html_url = input.release.html_url.replace(oldTag, tag);
  input.release.body = input.release.body.replace("- ISSUE: #376", "- ISSUE: #465");
  for (const asset of input.release.assets) asset.browser_download_url = asset.browser_download_url.replace(oldTag, tag);
  input.latest = owner.release;
  input.latestByTag = structuredClone(owner.release);
  input.latestTagRef = owner.tagRef;
  return input;
}

test("PAN465 forward designated runnable remains non-Latest without promoting or rewriting historical identities", () => {
  const input = nonLatestRunnableFixture();
  assert.deepEqual(validateReleaseContract(input), []);
  assert.notEqual(input.latest.tag_name, input.release.tag_name);
  assert.equal(input.governance.releaseTaxonomy.githubLatestOwnerClass, "SOURCE_EVIDENCE_ONLY");
  assert.equal(input.governance.currentRelease.historical, true);
  assert.equal(input.governance.legacyReleaseExceptions.length, 2);
});

test("PAN465 non-Latest runnable does not bypass current owner, exact target, archive, or historical authority", async (t) => {
  const probes = [
    ["undesignated tag", "PUBLIC_NONLATEST_RUNNABLE_NOT_DESIGNATED", (x) => { x.governance.forwardRunnableReleases.designations = []; }],
    ["owner policy weakened", "PUBLIC_NONLATEST_RUNNABLE_NOT_DESIGNATED", (x) => { x.governance.forwardRunnableReleases.requiresAnonymousLatestTagReadback = false; }],
    ["scope substituted", "PUBLIC_NONLATEST_DESIGNATED_SCOPE_MISMATCH", (x) => { x.release.body = x.release.body.replace("- ISSUE: #465", "- ISSUE: #999"); }],
    ["accidental promotion", "PUBLIC_NONOWNER_BECAME_LATEST", (x) => { x.latest = structuredClone(x.release); }],
    ["owner has assets", "PUBLIC_NONLATEST_OWNER_CLASS_OR_ASSETS_INVALID", (x) => { x.latest.assets = structuredClone(x.release.assets); }],
    ["owner class forged", "PUBLIC_NONLATEST_OWNER_CLASS_OR_ASSETS_INVALID", (x) => { x.latest.body = x.latest.body.replace("RELEASE_CLASS: SOURCE_EVIDENCE_ONLY", "RELEASE_CLASS: REGULAR_RUNNABLE_ARTIFACT"); }],
    ["owner still draft", "PUBLIC_NONLATEST_OWNER_METADATA_INVALID", (x) => { x.latest.draft = true; }],
    ["owner ref unavailable", "PUBLIC_NONLATEST_OWNER_TARGET_UNOBSERVED", (x) => { delete x.latestTagRef; }],
    ["owner target moved", "PUBLIC_NONLATEST_OWNER_TARGET_UNOBSERVED", (x) => { x.latestTagRef.object.sha = "c".repeat(40); }],
    ["owner metadata unavailable", "PUBLIC_NONLATEST_OWNER_TAG_READBACK_MISMATCH", (x) => { delete x.latestByTag; }],
    ["owner id drift", "PUBLIC_NONLATEST_OWNER_TAG_READBACK_MISMATCH", (x) => { x.latestByTag.id += 1; }],
    ["own target moved", "PUBLIC_TARGET_MISMATCH", (x) => { x.tagRef.object.sha = "c".repeat(40); }],
    ["unlisted extra asset", "PUBLIC_ASSET_SET_OR_SIZE_MISMATCH", (x) => { x.release.assets.push({name:"invented.sig", size:7, browser_download_url:"https://example.invalid"}); }],
    ["archive corruption", `PUBLIC_ASSET_SHA256_MISMATCH:cm-product-increment-rc-20260902-release-authority.tar.gz`, (x) => { x.downloadedAssets.set(x.release.assets[0].name, Buffer.from("corrupted")); }],
  ];
  for (const [name, expected, mutate] of probes) await t.test(name, () => {
    const input = nonLatestRunnableFixture(); mutate(input);
    assert.ok(validateReleaseContract(input).includes(expected), validateReleaseContract(input).join("\n"));
  });
});

async function syntheticForwardReadback(input, {requestedTag = input.release.tag_name, root = ROOT} = {}) {
  const repository = input.governance.repository;
  const api = `https://api.github.com/repos/${repository}`;
  const rawPrefix = `https://raw.githubusercontent.com/${repository}/${input.tagRef.object.sha}/`;
  const requested = [];
  const response = (value, bytes = Buffer.alloc(0)) => ({ok:true, status:200,
    async json() { return structuredClone(value); }, async text() { return bytes.toString("utf8"); },
    async arrayBuffer() { return bytes; }});
  const fetchImpl = async (url, options = {}) => {
    requested.push(url);
    assert.equal(options.headers?.Authorization, undefined);
    assert.equal(options.headers?.authorization, undefined);
    if (url === `${api}/releases/tags/${requestedTag}`) return response(input.release);
    if (url === `${api}/releases/latest`) return response(input.latest);
    if (url === `${api}/git/ref/tags/${requestedTag}`) return response(input.tagRef);
    if (url === `${api}/git/ref/tags/${input.latest.tag_name}`) return response(input.latestTagRef);
    if (url === `${api}/releases/tags/${input.latest.tag_name}`) return response(input.latestByTag);
    if (url.startsWith(rawPrefix)) return response(undefined, readFileSync(join(root, url.slice(rawPrefix.length))));
    const asset = input.release.assets.find((item) => item.browser_download_url === url);
    if (asset) return response(undefined, input.downloadedAssets.get(asset.name));
    throw new Error(`UNEXPECTED_READBACK_URL:${url}`);
  };
  const result = await verifyPublicReadback(root, {releaseTag:requestedTag, requireConforming:true,
    fetchImpl, readLocalHead:() => input.tagRef.object.sha});
  return {result, requested};
}

test("PAN465 anonymous non-Latest readback fetches both full owner metadata and exact owner tag; returns latest:false", async () => {
  const input = nonLatestRunnableFixture();
  const api = `https://api.github.com/repos/${input.governance.repository}`;
  const {result, requested} = await syntheticForwardReadback(input);
  assert.equal(result.latest, false);
  assert.equal(result.releaseClass, "REGULAR_RUNNABLE_ARTIFACT");
  assert.ok(requested.includes(`${api}/git/ref/tags/${input.latest.tag_name}`));
  assert.ok(requested.includes(`${api}/releases/tags/${input.latest.tag_name}`));
});

test("PAN465 GOV-01 designated tag cannot change class to bypass issue/assets/non-Latest constraints", async () => {
  const input = conformingReleaseFixture("SOURCE_EVIDENCE_ONLY");
  const tag = input.governance.forwardRunnableReleases.designations[0].tag;
  input.release.tag_name = tag;
  input.release.html_url = `https://github.com/${input.governance.repository}/releases/tag/${tag}`;
  input.release.body = input.release.body.replace("- ISSUE: #376", "- ISSUE: #999");
  input.tagRef.ref = `refs/tags/${tag}`;
  input.latest = structuredClone(input.release);
  await assert.rejects(syntheticForwardReadback(input), /PUBLIC_DESIGNATED_RELEASE_CLASS_MISMATCH/);
});

test("PAN465 GOV-01 ordinary non-designated source-only owner retains its conforming path", async () => {
  const input = conformingReleaseFixture("SOURCE_EVIDENCE_ONLY");
  const {result} = await syntheticForwardReadback(input);
  assert.equal(result.latest, true);
  assert.equal(result.releaseClass, "SOURCE_EVIDENCE_ONLY");
});

test("PAN465 GOV-02 recognized historical tag or release ID cannot be rewritten as auxiliary owner or new release", async (t) => {
  for (const collision of ["owner-tag", "owner-id", "own-id"]) await t.test(collision, async () => {
    const input = nonLatestRunnableFixture();
    const historical = input.governance.publicLatestRelease;
    if (collision === "owner-tag") {
      input.latest.tag_name = historical.tag;
      input.latest.html_url = historical.url;
      input.latestTagRef.ref = `refs/tags/${historical.tag}`;
    } else if (collision === "owner-id") input.latest.id = historical.releaseId;
    else input.release.id = input.governance.currentRelease.releaseId;
    input.latestByTag = structuredClone(input.latest);
    await assert.rejects(syntheticForwardReadback(input), collision === "own-id"
      ? /PUBLIC_HISTORICAL_IDENTITY_NOT_NEW_RELEASE/ : /PUBLIC_NONLATEST_HISTORICAL_OWNER_NOT_SUPPORTED/);
  });
});

test("PAN465 GOV-02 historical tags cannot be shadowed by forward policy, even in a new schema-valid designation", async (t) => {
  const policy = nonLatestRunnableFixture().governance;
  for (const tag of [policy.currentRelease.tag, policy.publicLatestRelease.tag, policy.historicalReleasePolicy.namedHistoricalIdentity.tag]) {
    await t.test(tag, async () => {
      const root = fixture();
      try {
        const input = nonLatestRunnableFixture();
        input.governance.forwardRunnableReleases.designations[0].tag = tag;
        writeFileSync(join(root, "release/governance.json"), JSON.stringify(input.governance));
        assert.ok(validateRepository(root).includes("FORWARD_RUNNABLE_POLICY_INVALID"));
        await assert.rejects(syntheticForwardReadback(input, {root}), /FORWARD_RUNNABLE_POLICY_INVALID/);
      } finally { rmSync(root, {recursive:true, force:true}); }
    });
  }
});

test("PAN465 HOLD-01 explicit conforming nonhistorical owner policy does not grant legacy conformance", async () => {
  const input = nonLatestRunnableFixture();
  const legacy = input.governance.publicLatestRelease;
  const owner = {id:legacy.releaseId, tag_name:legacy.tag, name:legacy.title, target_commitish:legacy.targetCommitish,
    draft:legacy.draft, prerelease:legacy.prerelease, published_at:legacy.publishedAt, html_url:legacy.url,
    body:legacy.legacyBody, assets:structuredClone(legacy.assets)};
  input.latest = owner;
  input.latestByTag = structuredClone(owner);
  input.latestTagRef = {ref:`refs/tags/${legacy.tag}`, object:{type:"commit",sha:legacy.tagObjectSha}};
  assert.deepEqual(validateRecordedPublicState({governance:input.governance, latestRelease:owner,
    latest:{tag_name:legacy.tag}, latestTagRef:input.latestTagRef}), []);
  await assert.rejects(syntheticForwardReadback(input), /PUBLIC_NONLATEST_HISTORICAL_OWNER_NOT_SUPPORTED/);
});

test("PAN465 GOV-03 duplicate or contradictory owner merge declarations never use first-match precedence", async (t) => {
  for (const other of ["b".repeat(40), "c".repeat(40)]) await t.test(other, async () => {
    const input = nonLatestRunnableFixture();
    input.latest.body = input.latest.body.replace(`MERGE_SHA: ${"b".repeat(40)}`,
      `MERGE_SHA: ${"b".repeat(40)}\nMERGE_SHA: ${other}`);
    input.latestByTag = structuredClone(input.latest);
    await assert.rejects(syntheticForwardReadback(input), /PUBLIC_NONLATEST_OWNER_TARGET_UNOBSERVED/);
  });
});

test("PAN465 OBS-01 requested tag, response release tag and both response ref names are bound", async (t) => {
  await t.test("own requested tag", async () => {
    await assert.rejects(syntheticForwardReadback(nonLatestRunnableFixture(), {requestedTag:"different-requested-tag"}),
      /PUBLIC_REQUESTED_TAG_RESPONSE_MISMATCH/);
  });
  await t.test("own ref name", async () => {
    const input = nonLatestRunnableFixture(); input.tagRef.ref = "refs/tags/different-ref";
    await assert.rejects(syntheticForwardReadback(input), /PUBLIC_REQUESTED_TAG_RESPONSE_MISMATCH/);
  });
  await t.test("owner ref name", async () => {
    const input = nonLatestRunnableFixture(); input.latestTagRef.ref = "refs/tags/different-owner";
    await assert.rejects(syntheticForwardReadback(input), /PUBLIC_NONLATEST_OWNER_TARGET_UNOBSERVED/);
  });
});

test("bounded contradiction preflight has one closed ownership and failure matrix", () => {
  const governance = JSON.parse(readFileSync(join(ROOT, "release", "governance.json"), "utf8"));
  assert.deepEqual(governance.contradictionPreflight.requiredClaimOwnership, [
    "materialClaimId",
    "maturity",
    "proofClass",
    "authoritativeArtifact",
    "exactIdentity",
    "executableOrAnonymousReadbackGate",
    "explicitNonclaim",
  ]);
  assert.deepEqual(
    governance.contradictionPreflight.failureModes.map(({ id, disposition, negativeProbe }) => ({ id, disposition, negativeProbe })),
    [
      { id: "RELEASE_IDENTITY_DRIFT", disposition: "FAIL_CLOSED", negativeProbe: "wrong Latest and wrong target" },
      { id: "PROOF_CLASS_INFLATION", disposition: "FAIL_CLOSED", negativeProbe: "proof-class inflation" },
      { id: "MISSING_EXACT_HEAD_DOCUMENTED_PATH", disposition: "FAIL_CLOSED", negativeProbe: "missing exact-head documented path" },
      { id: "CIRCULAR_OR_CALLER_MINTED_PROVENANCE", disposition: "FAIL_CLOSED", negativeProbe: "circular provenance" },
      { id: "STALE_PUBLIC_STATUS", disposition: "FAIL_CLOSED", negativeProbe: "stale public status" },
      { id: "STALE_GOVERNANCE", disposition: "FAIL_CLOSED", negativeProbe: "stale recorded governance" },
    ],
  );
  assert.deepEqual(governance.contradictionPreflight.exceptionContract, {
    acceptanceIdRequired: true,
    negativeRegressionProbeRequired: true,
    mayGrantConformance: false,
    mayAuthorizeHistoricalMutation: false,
  });
});

test("complete release-authority adversarial matrix fails closed", async (t) => {
  const probes = [
    ["wrong Latest", "PUBLIC_LATEST_MISMATCH", (input) => { input.latest.tag_name = "stale-tag"; }],
    ["wrong class", "PUBLIC_LATEST_CLASS_MISMATCH", (input) => { input.governance.releaseTaxonomy.githubLatestOwnerClass = "REGULAR_RUNNABLE_ARTIFACT"; }],
    ["missing body scope", "PUBLIC_BODY_SCOPE_MISSING", (input) => { input.release.body = input.release.body.replace("## Included capabilities and issues", "## Scope removed"); }],
    ["unexpected or reordered body section", "PUBLIC_BODY_SECTION_ORDER_OR_EXTRA_INVALID", (input) => { input.release.body = input.release.body.replace("## Nonclaims", "## Undeclared evidence\n- value\n\n## Nonclaims"); }],
    ["unowned extra claim proof", "PUBLIC_BODY_CLAIM_PROOF_OWNERSHIP_MISSING", (input) => { const line = input.release.body.split("\n").find((value) => value.startsWith("- CLAIM_PROOF:")); input.release.body = input.release.body.replace(line, `${line}\n${line.replaceAll("REL-TRUTH-AC01", "REL-TRUTH-AC99")}`); }],
    ["missing NO_ASSETS_SOURCE_ONLY", "PUBLIC_SOURCE_ONLY_MARKER_MISSING", (input) => { input.release.body = input.release.body.replace("NO_ASSETS_SOURCE_ONLY", "No files attached"); }],
    ["absent expected asset", "PUBLIC_ASSET_SET_OR_SIZE_MISMATCH", (input) => { input.release.assets.pop(); }],
    ["asset checksum mismatch", "PUBLIC_ASSET_SHA256_MISMATCH:cm-product-increment-rc-20260902-release-authority.tar.gz", (input) => { input.release.body = input.release.body.replace(/SHA256=[a-f0-9]{64}/, `SHA256=${"f".repeat(64)}`); }],
    ["asset URL drift", "PUBLIC_ASSET_URL_MISMATCH", (input) => { input.release.assets[0].browser_download_url = "https://example.invalid/substitute"; }],
    ["wrong target", "PUBLIC_TARGET_MISMATCH", (input) => { input.release.target_commitish = "main"; }],
    ["draft drift", "PUBLIC_DRAFT_MISMATCH", (input) => { input.release.draft = true; }],
    ["prerelease drift", "PUBLIC_PRERELEASE_MISMATCH", (input) => { input.release.prerelease = true; }],
    ["proof-class inflation", "PUBLIC_BODY_PROOF_CLASS_INFLATION", (input) => { input.release.body = input.release.body.replace("MATURITY=SOURCE_EVIDENCE_ONLY", "MATURITY=PRODUCTION"); }],
    ["missing exact-head documented path", "PUBLIC_BODY_ARTIFACT_MISSING:docs/missing-release-proof.md", (input) => { input.release.body = input.release.body.replace("ARTIFACT=README.md", "ARTIFACT=docs/missing-release-proof.md"); }],
    ["circular provenance", "PUBLIC_BODY_PROVENANCE_CIRCULAR_OR_CALLER_MINTED", (input) => { input.release.body = input.release.body.replace("ARTIFACT=README.md", "ARTIFACT=CALLER_MINTED"); }],
    ["stale public status", "PUBLIC_STATUS_TERMINAL_BEFORE_READBACK", (input) => { input.release.body = input.release.body.replace("BLOCKED_PENDING_PUBLIC_READBACK", "DONE"); }],
  ];
  for (const [name, expected, mutate] of probes) {
    await t.test(name, () => {
      const input = conformingReleaseFixture(["absent expected asset", "asset checksum mismatch", "asset URL drift"].includes(name) ? "REGULAR_RUNNABLE_ARTIFACT" : "SOURCE_EVIDENCE_ONLY");
      mutate(input);
      assert.ok(validateReleaseContract(input).includes(expected), validateReleaseContract(input).join("\n"));
    });
  }
});

test("stale recorded governance fails public-state readback", () => {
  const governance = JSON.parse(readFileSync(join(ROOT, "release", "governance.json"), "utf8"));
  const live = {
    latestRelease: {
      ...governance.publicLatestRelease,
      tag_name: governance.publicLatestRelease.tag,
      name: governance.publicLatestRelease.title,
      published_at: governance.publicLatestRelease.publishedAt,
      html_url: governance.publicLatestRelease.url,
      body: governance.publicLatestRelease.legacyBody,
    },
    latest: { tag_name: governance.publicLatestRelease.tag },
    latestTagRef: { object: { sha: governance.publicLatestRelease.tagObjectSha, type: "commit" } },
  };
  governance.publicLatestRelease.tag = "2026_09_02_stale";
  assert.ok(validateRecordedPublicState({ governance, ...live }).includes("PUBLIC_GOVERNANCE_STALE"));
});

test("post-creation publication workflow gates terminalization on anonymous public readback", () => {
  const workflow = readFileSync(join(ROOT, ".github", "workflows", "release-public-readback.yml"), "utf8");
  assert.match(workflow, /^\s*release:\s*$/m);
  assert.match(workflow, /^\s*types:\s*\[published\]\s*$/m);
  assert.match(workflow, /^permissions:\s*\n\s+contents: read$/m);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /github\.event\.release\.tag_name/);
  assert.match(workflow, /env -u GH_TOKEN -u GITHUB_TOKEN npm run release-governance:test/);
  assert.match(workflow, /env -u GH_TOKEN -u GITHUB_TOKEN npm run release-governance:public-readback -- --release-tag "\$RELEASE_TAG" --require-conforming/);
  assert.ok(workflow.indexOf("release-governance:test") < workflow.indexOf("release-governance:public-readback"));
  assert.doesNotMatch(workflow, /contents: write|issues: write|pull-requests: write|gh issue close|queue[^\n]*done/i);
});

test("post-creation readback derives a conforming gate only from anonymous provider responses", async () => {
  const input = conformingReleaseFixture("SOURCE_EVIDENCE_ONLY");
  const repository = input.governance.repository;
  const api = `https://api.github.com/repos/${repository}`;
  const rawPrefix = `https://raw.githubusercontent.com/${repository}/${input.tagRef.object.sha}/`;
  const requested = [];
  const response = (value, text = undefined) => ({
    ok: true,
    status: 200,
    async json() { return structuredClone(value); },
    async text() { return text; },
    async arrayBuffer() { return Buffer.from(text ?? ""); },
  });
  const fetchImpl = async (url, options = {}) => {
    requested.push(url);
    assert.equal(options.headers?.Authorization, undefined);
    assert.equal(options.headers?.authorization, undefined);
    if (url === `${api}/releases/tags/${input.release.tag_name}`) return response(input.release);
    if (url === `${api}/releases/latest`) return response(input.latest);
    if (url === `${api}/git/ref/tags/${input.release.tag_name}`) return response(input.tagRef);
    if (url.startsWith(rawPrefix)) {
      const path = url.slice(rawPrefix.length);
      return response(undefined, readFileSync(join(ROOT, path), "utf8"));
    }
    throw new Error(`UNEXPECTED_READBACK_URL:${url}`);
  };

  const result = await verifyPublicReadback(ROOT, {
    releaseTag: input.release.tag_name,
    requireConforming: true,
    fetchImpl,
    readLocalHead: () => input.tagRef.object.sha,
  });
  assert.equal(result.tag, input.release.tag_name);
  assert.equal(result.releaseClass, "SOURCE_EVIDENCE_ONLY");
  assert.equal(result.anonymous, true);
  assert.equal(result.terminalizationEligible, true);
  assert.equal(requested.length, 8);
});

test("all seven public issue criteria are verbatim and solely owned by this correction", () => {
  const evidence = JSON.parse(readFileSync(
    join(ROOT, "closure-audits", "AUDIT-CORRECTION-376-ROOT-QS", "implementation-evidence.json"),
    "utf8",
  ));
  const criteria = [
    "Versioned schema distinguishes regular/runnable artifact releases from source/evidence-only releases and defines which class may own GitHub Latest.",
    "`release/governance.json`, Quickstart, README and release docs agree on current/latest/historical identities and asset expectations.",
    "Every new release body names exact merge SHA, included capability/issues, evidence boundary, tests, assets/checksums or explicit `NO_ASSETS_SOURCE_ONLY`, and nonclaims.",
    "Publication workflow executes anonymous `release-governance:public-readback` after release creation; mismatch fails closure and cannot leave issue/queue DONE.",
    "Negative probes cover wrong Latest, wrong class, missing body scope, absent expected asset, wrong target, draft/prerelease drift and stale governance.",
    "Current public state is reconciled without rewriting tags or silently reclassifying historical evidence.",
    "`CONTRIBUTING.md`, release governance and the machine validator define one bounded contradiction preflight for every public delivery: each material claim maps to its maturity/proof class, authoritative artifact, exact identity, executable or anonymous-readback gate and explicit nonclaim. Release-identity drift, proof-class inflation, missing exact-head documented paths, circular/caller-minted provenance and stale public status must fail or be owned by an explicit acceptance ID with a negative regression probe.",
  ];
  assert.deepEqual(evidence.acceptanceOwnership.map(({ criterion }) => criterion), criteria);
  assert.deepEqual(evidence.acceptanceOwnership.map(({ id }) => id), criteria.map((_, index) => `REL-TRUTH-AC0${index + 1}`));
  assert.ok(evidence.acceptanceOwnership.every(({ soleTaskOwner }) => soleTaskOwner === "AUDIT-CORRECTION-376-IMPLEMENT"));
  assert.equal(new Set(evidence.acceptanceOwnership.map(({ canonicalTest }) => canonicalTest)).size, 7);
});

test("the full Quickstart owns the immutable runnable archive tuple while README stays version-agnostic", () => {
  const governance = JSON.parse(readFileSync(join(ROOT, "release", "governance.json"), "utf8"));
  const archive = governance.currentRelease.assets.find(({ name }) => name.endsWith(".tar.gz"));
  assert.ok(archive, "CURRENT_RELEASE_ARCHIVE_MISSING");
  const extractedDirectory = archive.name.replace(/\.tar\.gz$/, "");

  const quickstart = readFileSync(join(ROOT, "docs/QUICKSTART.md"), "utf8");
  assert.match(quickstart, new RegExp(`^release=${governance.currentRelease.tag.replaceAll(".", "\\.")}$`, "m"), "Quickstart: stale release tag");
  assert.match(quickstart, new RegExp(`^archive=${archive.name.replaceAll(".", "\\.")}$`, "m"), "Quickstart: stale archive name");
  assert.match(quickstart, new RegExp(`^cd ${extractedDirectory.replaceAll(".", "\\.")}$`, "m"), "Quickstart: stale extracted directory");
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  assert.doesNotMatch(readme, /^\s*(?:release|archive)=/m);
  assert.doesNotMatch(readme, /^\s*cd cm-product-increment-/m);
});

test("public release builder binds its exact file count to the manifest", () => {
  const manifest = readFileSync(join(ROOT, "release", "public-files.manifest"), "utf8");
  const count = manifest.split("\n").filter((line) => line && !line.startsWith("#")).length;
  const builder = readFileSync(join(ROOT, "scripts", "build-public-release.sh"), "utf8");
  const binding = builder.match(/^if count != (\d+):$/m);
  assert.ok(binding, "PUBLIC_MANIFEST_EXACT_COUNT_BINDING_MISSING");
  assert.equal(Number(binding[1]), count);
  assert.equal(count, 1741);
  assert.doesNotMatch(builder, /if count\s*(?:>|>=|<|<=)\s*\d+/);
});

test("E-FND-1 exact-input closure bytes are explicitly repository-only", () => {
  const repositoryOnlyPaths = [
    "tests/trust-compatibility-foundation-closure.test.ts",
    "verification/trust-compatibility-foundation-closure-v1.json",
  ];
  const manifest = readFileSync(join(ROOT, "release", "public-files.manifest"), "utf8").split("\n");
  const builder = readFileSync(join(ROOT, "scripts", "build-public-release.sh"), "utf8");
  for (const path of repositoryOnlyPaths) {
    assert.equal(manifest.filter((line) => line.startsWith(`${path}\t`)).length, 0, path);
    assert.ok(builder.includes(`    "${path}",`), `repository-only classification: ${path}`);
  }
});

test("XRA-PS-02 independent adjudicator/proof closure is publicly registered and canonically bound", () => {
  const closureRoles = new Map([
    ["src/cks-12/kaleidosphere-candidate-quarantine.ts", "VALIDATOR"],
    ["tests/cks-12/kaleidosphere-candidate-quarantine.test.ts", "VALIDATOR"],
    ["tests/cks-12/kaleidosphere-candidate-quarantine-native.test.ts", "VALIDATOR"],
    ["verification/pansphaira-kaleidosphere-analytics-slice-v1.json", "DERIVED_EVIDENCE"],
    ["scripts/run-xra-ps-02-root-qs-replay.mjs", "VALIDATOR"],
    ["tests/cks-12/kaleidosphere-candidate-quarantine-rootqs.test.ts", "VALIDATOR"],
    ["tests/fixtures/cks-analytics/xra-ps-02-native-paired-receipt-v2.json", "DERIVED_EVIDENCE"],
    ["tests/fixtures/cks-analytics/xra-ps-02-native-root-qs-raw-v2.json", "DERIVED_EVIDENCE"],
    ["verification/pansphaira-kaleidosphere-analytics-slice-v2.json", "DERIVED_EVIDENCE"],
  ]);
  const closurePaths = [...closureRoles.keys()];
  const manifest = readFileSync(join(ROOT, "release", "public-files.manifest"), "utf8").split("\n");
  const builder = readFileSync(join(ROOT, "scripts", "build-public-release.sh"), "utf8");
  // The complete proof closure (adjudicator implementation, the focused and
  // Root-QS tests, the executable replay runner, the v2 successor receipt and
  // raw execution evidence, and both slice receipts) is registered in the
  // public manifest with an identity mapping and mode 0644; the builder
  // carries none of these paths as a repository-only exception.
  for (const path of closurePaths) {
    assert.equal(manifest.filter((line) => line === `${path}\t${path}\t0644`).length, 1, `public manifest registration: ${path}`);
    assert.ok(!builder.includes(`    "${path}",`), `repository-only exception reconciled: ${path}`);
  }
  // The exact public count is derived from the manifest itself and must bind
  // the builder's count check; the reconciled exceptions keep the builder,
  // the governance tests and the manifest on one computed final count.
  const publicCount = manifest.filter((line) => line && !line.startsWith("#")).length;
  const binding = builder.match(/^if count != (\d+):$/m);
  assert.ok(binding, "PUBLIC_MANIFEST_EXACT_COUNT_BINDING_MISSING");
  assert.equal(Number(binding[1]), publicCount, "builder count binding derives the actual manifest count");
  assert.equal(publicCount, 1741, "R1 adds thirteen public explanation/diagram files to the retained manifest");
  // Every closure byte is registered in the root SHA256SUMS with its exact
  // current digest, including the native adjudicator test.
  const sums = readFileSync(join(ROOT, "SHA256SUMS"), "utf8").split("\n");
  for (const path of closurePaths) {
    const expected = `${digest(readFileSync(join(ROOT, path)))}  ./${path}`;
    assert.equal(sums.filter((line) => line === expected).length, 1, `root SHA256SUMS registration: ${path}`);
  }
  // The complete closure is registered as exactly one input with the correct
  // role and digest on the CKS-12 closed-loop DAG owner.
  const dag = JSON.parse(readFileSync(join(ROOT, "verification", "verification-dag-v2.json"), "utf8"));
  const node = dag.nodes.find(({ id }) => id === "cks-12-closed-learning-loop-v1");
  assert.ok(node, "CKS_12_DAG_NODE_MISSING");
  const expectedRoles = closureRoles;
  for (const [path, role] of expectedRoles) {
    const inputs = node.inputs.filter((input) => input.path === path);
    assert.equal(inputs.length, 1, `DAG path registration: ${path}`);
    assert.equal(inputs[0].role, role, `DAG role: ${path}`);
    assert.equal(inputs[0].sha256, digest(readFileSync(join(ROOT, path))), `DAG digest: ${path}`);
  }
});

test("Verification Fabric release truth delegates volatile Shadow progress to its issue", () => {
  const governance = JSON.parse(readFileSync(join(ROOT, "release", "governance.json"), "utf8"));
  const verification = governance.claimEvidence.find(({ claimId }) => claimId === "CM-REL-004");
  assert.ok(verification);
  const nonClaims = verification.nonClaims.join(" ");
  assert.match(nonClaims, /issue #34/);
  assert.doesNotMatch(nonClaims, /\b\d+\/24\b/);
});

test("root security and support documents remain version-agnostic", () => {
  const security = readFileSync(join(ROOT, "SECURITY.md"), "utf8");
  const support = readFileSync(join(ROOT, "SUPPORT.md"), "utf8");
  assert.match(security, /\]\(https:\/\/github\.com\/JoFe2\/PANSPHAIRA\/releases\/latest\)/);
  assert.match(security, /\]\(https:\/\/github\.com\/JoFe2\/PANSPHAIRA\/releases\)/);
  assert.doesNotMatch(`${security}\n${support}`, /\b(?:v(?:ersion)?\s*)?\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?\b/i);
  assert.match(support, /without warranty, service-level objective or\s+production-support commitment/i);
});

test("README presents governed adaptability and evidence-driven improvement without overstating scope", () => {
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  const diagram = readFileSync(join(ROOT, "assets", "diagrams", "caged-agent-gateway-constellation.svg"), "utf8");
  const manifest = readFileSync(join(ROOT, "release", "public-files.manifest"), "utf8");
  const positiveIcon = readFileSync(join(ROOT, "assets", "brand", "pansphaira-icon-positive.svg"), "utf8");
  const negativeIcon = readFileSync(join(ROOT, "assets", "brand", "pansphaira-icon-negative.svg"), "utf8");
  const capabilityDiagram = readFileSync(join(ROOT, "assets", "diagrams", "capability-provider-bindings.svg"), "utf8");
  const hierarchySource = readFileSync(join(ROOT, "tools", "readme-visuals", "application-hierarchy.html"), "utf8");
  const incomingInvoice = readFileSync(join(ROOT, "docs", "INCOMING-INVOICE-PROVING-GROUND.md"), "utf8");
  const koFi = readFileSync(join(ROOT, "assets", "support", "ko-fi.svg"), "utf8");
  const buyMeACoffee = readFileSync(join(ROOT, "assets", "support", "buy-me-a-coffee.svg"), "utf8");


  // R1 is a byte-fixed, benefit-led entry route, not another generic rewrite.
  assert.equal(createHash("sha256").update(readme).digest("hex"), "fcb6619af13ffd9ec8e5f17ed7c4f105d50f7e9d21962d1bf1cd079e97c45c3f");
  assert.match(readme, /^# PanSphaira$/m);
  assert.match(readme, /Enterprise software that adapts to the way your business works/);
  assert.match(readme, /srcset="assets\/brand\/pansphaira-icon-negative\.svg"/);
  assert.match(readme, /srcset="assets\/brand\/pansphaira-icon-positive\.svg"/);
  assert.match(readme, /alt="PanSphaira: seven connected circles"/);
  assert.doesNotMatch(readme, /^\s*Text fallback:/im);
  assert.doesNotMatch(readme, /assets\/brand\/chimpmaera-(?:master|negative)\.(?:png|svg)/);
  assert.doesNotMatch(readme, /(?:youtu\.be\/|youtube\.com\/)/);
  assert.ok(readme.indexOf("## Applications") < readme.indexOf("## How the pieces fit together"));
  assert.ok(readme.indexOf("## What is available, and what comes next?") < readme.indexOf("## Quickstart"));
  assert.match(readme, /\*\*Adaptive Knowledge Engineering\*\*/);
  assert.match(readme, /explicit controls outside the agent determine what may run/);
  assert.match(readme, /General end-to-end adaptation[\s\S]*development direction, not an established product capability/);
  assert.match(readme, /Conceptual model, not a generally automated pipeline/);
  assert.match(readme, /Knowing how an operation works is separate from having permission/);
  assert.match(readme, /Each contribution still needs its own applicability and evidence/);
  assert.match(readme, /Source, runnable packaging and execution evidence are different identities/);
  assert.match(readme, /Latest label is not itself a promise of an installable archive/);
  assert.match(readme, /releases\/tag\/ap-06-frozen-adapted-erv-proof-probe-with-narrow-go-verdict-issue-366-95ecd4d587d9/);
  assert.match(readme, /there is no released executable variant for it yet/);
  assert.match(readme, /new independent release does not automatically qualify a new pairing/);
  assert.match(readme, /two local synthetic provider bindings/);
  assert.match(readme, /fictional CRM\/ERP workflow/);
  assert.match(readme, /fictional data, not production systems or real business records/);
  const applications = readFileSync(join(ROOT, "docs/use-cases/index.md"), "utf8");
  assert.match(applications, /baseline reaches `MATCHED` through the released core/);
  assert.match(applications, /200-bps tolerance \(2%\) has no released executable variant and remains `UNKNOWN`/);
  assert.doesNotMatch(applications, /200-bps (?:tolerance|variant) is (?:released|supported|proven)/i);
  assert.match(applications, /github\.com\/JoFe2\/PANSPHAIRA\/issues\/378/);
  assert.match(hierarchySource, /ROWS · SHARED HIERARCHY/);
  assert.match(hierarchySource, /COLUMNS · APPLICATION-SPECIFIC INSTANTIATIONS/);
  assert.match(hierarchySource, /t=q\.get\('theme'\)\|\|'blueprint'/);
  assert.doesNotMatch(hierarchySource, /<(?:script|img)[^>]+(?:src|href)="https?:\/\//i);
  assert.match(incomingInvoice, /`PROVEN_LOCAL_SYNTHETIC_POC_NARROW_GO`/);
  assert.doesNotMatch(incomingInvoice, /WORK_IN_PROGRESS_PLANNED_NOT_DELIVERED/);
  assert.doesNotMatch(incomingInvoice, /Product implementation \| Not started/);
  assert.doesNotMatch(incomingInvoice, /Product release \| None/);
  assert.match(incomingInvoice, /The general end-to-end product is\s+not delivered/);
  assert.match(incomingInvoice, /Work-package specifications \| `6\/6` frozen and executed/);
  assert.match(incomingInvoice, /Public AP implementation issues \|[^\n]*`6\/6` closed\/completed/);
  // PS373: ERV setup-agent dialogue and baseline-vs-adapted variant proof.
  // The detailed setup pipeline remains in its proof document; R1 links it
  // through the applications route without claiming general delivery.
  // The ERV doc documents the setup pipeline.
  assert.match(incomingInvoice, /requirement\s*→\s*clarification dialogue/);
  assert.match(incomingInvoice, /versioned configuration delta/);
  assert.match(incomingInvoice, /reused capabilities/);
  assert.match(incomingInvoice, /reuse receipt/);
  // Both valid compositions: self-contained core and optional ERP-enhanced.
  assert.match(incomingInvoice, /ERV Capability Core/);
  assert.match(incomingInvoice, /local decision and\s+evidence package/);
  assert.match(incomingInvoice, /ERP-enhanced/);
  assert.match(incomingInvoice, /authoritative ERP reads/);
  assert.match(incomingInvoice, /system-of-record readback/);
  assert.match(incomingInvoice, /not a prerequisite for the core proof/);
  assert.match(incomingInvoice, /productive posting remains separately authorized/);
  // Baseline vs adapted variant: digests preserved, oracle-predicted behavior.
  assert.match(incomingInvoice, /preserve the exact core and\s+module digests/);
  assert.match(incomingInvoice, /oracle-predicted/);
  assert.match(incomingInvoice, /configuration-specific behavior/);
  // Falsifiers remain explicit.
  assert.match(incomingInvoice, /Core mutation, substituting an answer/);
  assert.match(incomingInvoice, /omitting the delta/);
  assert.match(incomingInvoice, /unsupported\s+function or requirement/);
  assert.match(incomingInvoice, /hiding Authority are falsifiers/);
  // Public acceptance count moves 28 → 34 without a delivered claim.
  assert.match(incomingInvoice, /Acceptance identifiers \| `34\/34`/);
  assert.doesNotMatch(incomingInvoice, /`28\/28`/);
  assert.match(incomingInvoice, /AP-05-AC05/);
  assert.match(incomingInvoice, /AP-05-AC08/);
  assert.match(incomingInvoice, /AP-06-AC06/);
  assert.match(incomingInvoice, /AP-06-AC07/);
  assert.match(incomingInvoice, /not delivered/);
  // PS378 DOC-AI-AC01: the current AP-03 capability label is a synthetic
  // extraction scoring harness. No OCR / Document-AI model-quality claim
  // remains in the proving-ground doc, and the separate real pilot is
  // tracked under #378 (pinned runtime + sealed holdout + independent oracle).
  assert.match(incomingInvoice, /AP-03 — Synthetic extraction scoring harness/);
  assert.doesNotMatch(incomingInvoice, /AP-03 — Document-AI benchmark/);
  assert.match(
    incomingInvoice,
    /does not execute OCR or Document-AI model\s+inference and makes no OCR or model-quality claim/,
  );
  assert.ok(incomingInvoice.includes("github.com/JoFe2/PANSPHAIRA/issues/378"), "PS378 real Document-AI pilot tracked under issue 378");
  // Replay and promotion gating on the new criteria.
  assert.match(incomingInvoice, /replays on Current Main/);
  assert.match(incomingInvoice, /dependency order/);
  assert.match(incomingInvoice, /`GO` or `NARROW_GO` verdict satisfying/);
  // Required standalone ERV package extensions and optional BI composition.
  assert.match(incomingInvoice, /github\.com\/JoFe2\/PANSPHAIRA\/issues\/374/);
  assert.match(incomingInvoice, /github\.com\/JoFe2\/PANSPHAIRA\/issues\/375/);
  assert.match(incomingInvoice, /github\.com\/JoFe2\/KaleidoSphere\/issues\/157/);
  assert.match(incomingInvoice, /does not gate core use/);
  assert.doesNotMatch(readme, /\b(?:infinite|one-click|minutes?|hours?|production-ready)\b/i);
  // DOC-README-03 explicitly has no arbitrary word limit; exact R1 bytes
  // and the independently inspected reading order own presentation acceptance.

  assert.match(diagram, /role="img" aria-labelledby="caged-title caged-desc"/);
  assert.match(diagram, /<title id="caged-title">/);
  assert.match(diagram, /<desc id="caged-desc">/);
  assert.match(diagram, /PanSphaira Agent Sphere to Gateway Sphere architecture/);
  assert.match(diagram, /Sphere is visualization vocabulary, not a protocol, schema, API, or runtime abstraction/);
  assert.match(diagram, /AGENT SPHERE/);
  assert.match(diagram, /GATEWAY SPHERE/);
  assert.match(diagram, /GOVERNED[\s\S]{0,80}CROSSING/);
  assert.ok(diagram.indexOf("<!-- Connectors are behind nodes.") < diagram.indexOf("<!-- Left containment -->"));
  assert.equal((diagram.match(/marker-end=/g) ?? []).length, 8);
  assert.match(diagram, /ADAPTIVE KNOWLEDGE ENGINEERING/);
  assert.match(diagram, /Solid routes = locally evidenced reference paths/);
  assert.match(diagram, /Dashed routes = prepared add\/replace direction/);
  assert.match(diagram, /Security boundary = containment \+ mediated execution/);
  assert.doesNotMatch(diagram, /<(?:image|script|linearGradient|radialGradient)\b|(?:href|src)="https?:\/\//i);
  assert.match(positiveIcon, /role="img" aria-labelledby="pansphaira-icon-positive-title pansphaira-icon-positive-desc"/);
  assert.match(positiveIcon, /Black geometric icon composed of seven connected circles/);
  assert.match(negativeIcon, /role="img" aria-labelledby="pansphaira-icon-negative-title pansphaira-icon-negative-desc"/);
  assert.match(negativeIcon, /White geometric icon composed of seven connected circles/);
  assert.match(capabilityDiagram, /<title id="title">PanSphaira capability contracts and provider bindings<\/title>/);
  assert.match(koFi, /<title id="title">Support PanSphaira on Ko-fi<\/title>/);
  assert.match(buyMeACoffee, /<title id="title">Support PanSphaira on Buy Me a Coffee<\/title>/);
  assert.match(manifest, /^assets\/diagrams\/caged-agent-gateway-constellation\.svg\tassets\/diagrams\/caged-agent-gateway-constellation\.svg\t0644$/m);
  assert.match(manifest, /^assets\/diagrams\/layers\/02-control-architecture-v3\.png\tassets\/diagrams\/layers\/02-control-architecture-v3\.png\t0644$/m);
  assert.match(manifest, /^assets\/diagrams\/layers\/04-application-hierarchy-blueprint\.png\tassets\/diagrams\/layers\/04-application-hierarchy-blueprint\.png\t0644$/m);
  assert.match(manifest, /^docs\/INCOMING-INVOICE-PROVING-GROUND\.md\tdocs\/INCOMING-INVOICE-PROVING-GROUND\.md\t0644$/m);
  assert.match(manifest, /^tools\/readme-visuals\/application-hierarchy\.html\ttools\/readme-visuals\/application-hierarchy\.html\t0644$/m);
  assert.match(manifest, /^tools\/readme-visuals\/README\.md\ttools\/readme-visuals\/README\.md\t0644$/m);
  for (const path of [
    "assets/brand/README.md",
    "assets/brand/pansphaira-icon-negative.png",
    "assets/brand/pansphaira-icon-negative.svg",
    "assets/brand/pansphaira-icon-positive.png",
    "assets/brand/pansphaira-icon-positive.svg",
    "docs/OPERATING-FIELD-GUIDE.md",
    "docs/PANSPHAIRA-TERMINOLOGY.md",
  ]) {
    assert.match(manifest, new RegExp(`^${path.replaceAll(".", "\\.")}\\t${path.replaceAll(".", "\\.")}\\t0644$`, "m"));
  }
  assert.doesNotMatch(manifest, /^assets\/brand\/chimpmaera-(?:master|negative)\.(?:png|svg)\t/m);
  assert.doesNotMatch(manifest, /^docs\/ZOO-FIELD-GUIDE\.md\t/m);
});

test("public documentation presentation gate accepts encapsulated or linked accessibility text", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  append(root, "README.md", [
    "<details>",
    "<summary>Accessible fixture description</summary>",
    "",
    "Text fallback: A governed proposal crosses a mediated boundary.",
    "",
    "</details>",
    "",
    "Extended accessibility context is available in [the architecture documentation](docs/ARCHITECTURE.md).",
  ].join("\n"));
  assert.deepEqual(
    validateRepository(root).filter((value) => value.startsWith("PUBLIC_DOC_")),
    [],
  );
});

test("release governance negative probes fail closed", async (t) => {
  const probes = [
    ["visible README text fallback", "PUBLIC_DOC_UNENCAPSULATED_FALLBACK_LABEL:README.md", (root) => append(root, "README.md", "Text fallback: technical architecture copy")],
    ["visible public-doc placeholder", "PUBLIC_DOC_UNENCAPSULATED_FALLBACK_LABEL:docs/index.md", (root) => append(root, "docs/index.md", "Placeholder: replace this architecture explanation")],
    ["empty HTML image alt", "PUBLIC_DOC_IMAGE_ALT_UNUSABLE:README.md", (root) => replace(root, "README.md", "alt=\"PanSphaira: seven connected circles\"", "alt=\"\"")],
    ["empty Markdown image alt", "PUBLIC_DOC_IMAGE_ALT_UNUSABLE:README.md", (root) => append(root, "README.md", "![](assets/diagrams/caged-agent-gateway-constellation.svg)")],
    ["README version-bound release link", "README_STABLE_RELEASE_NAVIGATION_MISSING", (root) => replace(root, "README.md", "[release history](https://github.com/JoFe2/PANSPHAIRA/releases)", "[Version-bound release](https://github.com/JoFe2/PANSPHAIRA/releases/tag/v0.1.0)")],
    ["README volatile release tuple", "README_VOLATILE_RELEASE_TUPLE_DENIED", (root) => append(root, "README.md", "release=v0.2.0-poc.20260825.1\narchive=cm-product-increment-rc-20260825-canonical-number.tar.gz\ncd cm-product-increment-rc-20260825-canonical-number")],
    ["Quickstart stale duplicate release tuple", "PUBLIC_QUICKSTART_RELEASE_TUPLE_STALE:docs/QUICKSTART.md", (root) => append(root, "docs/QUICKSTART.md", "release=v0.2.0-poc.20260821.1\narchive=cm-product-increment-rc-20260821-adaptive-evidence-controller.tar.gz\ncd cm-product-increment-rc-20260821-adaptive-evidence-controller")],
    ["release archive declaration drift", "PUBLIC_QUICKSTART_RELEASE_TUPLE_STALE:docs/QUICKSTART.md", (root) => { const p = join(root, "release/governance.json"); const j = JSON.parse(readFileSync(p)); j.currentRelease.assetManifest.declares = "other.tar.gz"; writeFileSync(p, JSON.stringify(j)); }],
    ["duplicate declared release archive", "PUBLIC_QUICKSTART_RELEASE_TUPLE_STALE:docs/QUICKSTART.md", (root) => { const p = join(root, "release/governance.json"); const j = JSON.parse(readFileSync(p)); const archive = j.currentRelease.assets.find(({ name }) => name === j.currentRelease.assetManifest.declares); j.currentRelease.assets.push({ ...archive }); writeFileSync(p, JSON.stringify(j)); }],
    ["Quickstart stale increment prose", "PUBLIC_QUICKSTART_RELEASE_TUPLE_STALE:docs/QUICKSTART.md", (root) => replace(root, "docs/QUICKSTART.md", "canonical-number hardening", "adaptive-evidence controller")],
    ["README indented release tuple", "README_VOLATILE_RELEASE_TUPLE_DENIED", (root) => append(root, "README.md", "```sh\n  release=v0.2.0-poc.20260825.1\n  archive=cm-product-increment-rc-20260825-canonical-number.tar.gz\n  cd cm-product-increment-rc-20260825-canonical-number\n```")],
    ["missing Quickstart document", "PUBLIC_QUICKSTART_MISSING:docs/QUICKSTART.md", (root) => rmSync(join(root, "docs/QUICKSTART.md"))],
    ["README Daily identity", "README_ACTIVE_DAILY_IDENTITY_DENIED", (root) => replace(root, "README.md", "Use the [release history]", "Today's Daily snapshot owns included capabilities. Use the [release history]")],
    ["Knowledge OS promoted as current maturity", "README_POC_POSITIONING_MISSING", (root) => replace(root, "README.md", "remains a development direction, not an established product capability", "is an established product capability")],
    ["root Security static Latest claim", "ROOT_SECURITY_VERSION_BINDING_DENIED", (root) => append(root, "SECURITY.md", "The latest tagged release is v9.9.9.")],
    ["root Security version-bound release link", "ROOT_SECURITY_STABLE_RELEASE_NAVIGATION_MISSING", (root) => replace(root, "SECURITY.md", "https://github.com/JoFe2/PANSPHAIRA/releases/latest", "https://github.com/JoFe2/PANSPHAIRA/releases/tag/v9.9.9")],
    ["root Support product-version binding", "ROOT_SUPPORT_VERSION_BINDING_DENIED", (root) => replace(root, "SUPPORT.md", "PanSphaira is provided", "PanSphaira v9.9 is provided")],
    ["stale Security claim", "SECURITY_STALE_RELEASE_CLAIM_DENIED", (root) => replace(root, "docs/SECURITY-ASSURANCE.md", "## Claim maturity", "v0.1.0 remains the only tagged and published release.\n\n## Claim maturity")],
    ["System Advisor stale pre-release status", "RELEASED_LOCAL_SYNTHETIC_STATUS_MISSING:System Advisor", (root) => replace(root, "docs/SYSTEM-ADVISOR-GUIDE.md", "Status: **RELEASED, LOCAL-SYNTHETIC CONTRACT SURFACE**", "Status: **LOCALLY VALIDATED, NOT RELEASED**")],
    ["Builder defaults stale pre-release status", "RELEASED_LOCAL_SYNTHETIC_STATUS_MISSING:Builder defaults", (root) => replace(root, "docs/BUILDER-CONFIGURATION-DEFAULTS.md", "Status: **RELEASED, LOCAL-SYNTHETIC CONTRACT SURFACE**", "Status: **LOCALLY VALIDATED, NOT RELEASED**")],
    ["Canon lab profile mislabeled as fully mediated", "FULL_CONTROL_LAB_BOUNDARY_MISSING:docs/CANON.md", (root) => replaceAll(root, "docs/CANON.md", "may bypass", "remains completely mediated by")],
    ["Canon core rule count changed", "CANON_RULE_SET_INVALID:EXPECTED_CM-CAN-01_THROUGH_CM-CAN-28", (root) => replace(root, "docs/CANON.md", "### CM-CAN-28 —", "### CM-CAN-29 —")],
    ["HMI release evidence mapped to Azure", "CAPABILITY_MAPPING_INVALID:CM-REL-006", (root) => replace(root, "docs/capabilities.md", "[`CM-REL-006` HMI/Harness release evidence]", "[`CM-REL-007` HMI/Harness release evidence]")],
    ["extension assurance release evidence misbound", "CAPABILITY_MAPPING_INVALID:CM-REL-014", (root) => replace(root, "docs/capabilities.md", "[`CM-REL-014` release binding]", "[`CM-REL-013` release binding]")],
    ["agent-work event release evidence misbound", "CAPABILITY_MAPPING_INVALID:CM-REL-015", (root) => replace(root, "docs/capabilities.md", "[`CM-REL-015` release binding]", "[`CM-REL-014` release binding]")],
    ["maintenance contract release evidence misbound", "CAPABILITY_MAPPING_INVALID:CM-REL-005", (root) => replace(root, "docs/capabilities.md", "[`CM-REL-005` release binding]", "[`CM-REL-004` release binding]")],
    ["External video release evidence misbound", "CAPABILITY_MAPPING_INVALID:CM-REL-016", (root) => replace(root, "docs/capabilities.md", "[`CM-REL-016` release binding]", "[`CM-REL-015` release binding]")],
    ["ASF intake release evidence misbound", "CAPABILITY_MAPPING_INVALID:CM-REL-017", (root) => replace(root, "docs/capabilities.md", "[`CM-REL-017` release binding]", "[`CM-REL-016` release binding]")],
    ["integration profile release evidence misbound", "CAPABILITY_MAPPING_INVALID:CM-REL-018", (root) => replace(root, "docs/capabilities.md", "[`CM-REL-018` release binding]", "[`CM-REL-017` release binding]")],
    ["stale limitation version", "LIMITATIONS_STALE_V01_BINDING_DENIED", (root) => replace(root, "docs/KNOWN-LIMITATIONS.md", "The current local demo", "The v0.1 demo")],
    ["withdrawn video", "WITHDRAWN_ACTIVE_VIDEO_DENIED:8mB7O81Y2xA", (root) => append(root, "README.md", "https://youtu.be/8mB7O81Y2xA")],
    ["missing non-claim", "NON_CLAIMS_MISSING:CM-REL-001", (root) => { const p = join(root, "release/governance.json"); const j = JSON.parse(readFileSync(p)); j.claimEvidence[0].nonClaims = []; writeFileSync(p, JSON.stringify(j)); }],
    ["missing evidence path", "CLAIM_EVIDENCE_MISSING:CM-REL-001:docs/missing.md", (root) => { const p = join(root, "release/governance.json"); const j = JSON.parse(readFileSync(p)); j.claimEvidence[0].evidencePaths.push("docs/missing.md"); writeFileSync(p, JSON.stringify(j)); }],
    ["missing grouped component evidence", "RELEASE_COMPONENT_EVIDENCE_MISSING:Verification Fabric", (root) => { const p = join(root, "release/governance.json"); const j = JSON.parse(readFileSync(p)); j.claimEvidence = j.claimEvidence.filter((claim) => claim.component !== "Verification Fabric"); writeFileSync(p, JSON.stringify(j)); }],
    ["component byte not in public manifest", "COMPONENT_PATH_UNMANIFESTED:CM-REL-004:packages/contracts/src/verification-fabric.ts", (root) => replace(root, "release/public-files.manifest", "packages/contracts/src/verification-fabric.ts\tpackages/contracts/src/verification-fabric.ts\t0644\n", "")],
    ["release taxonomy class drift", "RELEASE_CLASS_TAXONOMY_INVALID", (root) => { const p = join(root, "release/governance.json"); const j = JSON.parse(readFileSync(p)); j.releaseTaxonomy.classes[1].runnable = true; writeFileSync(p, JSON.stringify(j)); }],
    ["release body contract drift", "RELEASE_BODY_CONTRACT_INVALID", (root) => { const p = join(root, "release/governance.json"); const j = JSON.parse(readFileSync(p)); j.releaseBodyContract.sourceOnlyNoAssetsMarker = "NO_FILES"; writeFileSync(p, JSON.stringify(j)); }],
    ["reconciled Latest target stale", "PUBLIC_LATEST_RECONCILIATION_INVALID", (root) => { const p = join(root, "release/governance.json"); const j = JSON.parse(readFileSync(p)); j.publicLatestRelease.targetCommitish = "f".repeat(40); writeFileSync(p, JSON.stringify(j)); }],
    ["legacy exception tries to grant precedent", "LEGACY_RELEASE_EXCEPTION_INVALID", (root) => { const p = join(root, "release/governance.json"); const j = JSON.parse(readFileSync(p)); j.legacyReleaseExceptions[0].futureReleasePrecedent = true; writeFileSync(p, JSON.stringify(j)); }],
    ["contradiction preflight loses circular-provenance probe", "CONTRADICTION_PREFLIGHT_INVALID", (root) => { const p = join(root, "release/governance.json"); const j = JSON.parse(readFileSync(p)); j.contradictionPreflight.failureModes = j.contradictionPreflight.failureModes.filter(({ id }) => id !== "CIRCULAR_OR_CALLER_MINTED_PROVENANCE"); writeFileSync(p, JSON.stringify(j)); }],
    ["publication workflow loses anonymous command", "PUBLICATION_READBACK_WORKFLOW_INVALID", (root) => replace(root, ".github/workflows/release-public-readback.yml", "release-governance:public-readback", "release-governance:verify")],
    ["asset hash removed", "ASSET_INVENTORY_INVALID", (root) => { const p = join(root, "release/governance.json"); const j = JSON.parse(readFileSync(p)); j.currentRelease.assets[0].sha256 = "unknown"; writeFileSync(p, JSON.stringify(j)); }],
    ["publication metadata removed", "CURRENT_PUBLICATION_METADATA_INVALID", (root) => { const p = join(root, "release/governance.json"); const j = JSON.parse(readFileSync(p)); delete j.currentRelease.releaseId; writeFileSync(p, JSON.stringify(j)); }],
    ["functional increment title drift", "FUNCTIONAL_INCREMENT_TITLE_MISSING", (root) => { const p = join(root, "release/governance.json"); const j = JSON.parse(readFileSync(p)); j.currentRelease.increment = "MSSQL Scope Compatibility"; writeFileSync(p, JSON.stringify(j)); }],
    ["private path leak", "LEAK_PRIVATE_HOME_PATH:README.md", (root) => append(root, "README.md", ["Current files: ", "home", "alice", "private", ""].join("/"))],
    ["calendar generator title", "GENERATOR_CALENDAR_RELEASE_TITLE_DENIED", (root) => replace(root, "scripts/daily-poc.mjs", "const releaseTitle = incrementCandidateTitle(manifest);", "const releaseTitle = `PanSphaira POC Daily — ${manifest.date}`;")]
  ];
  for (const [name, expected, mutate] of probes) {
    await t.test(name, (t) => {
      const root = fixture();
      t.after(() => rmSync(root, { recursive: true, force: true }));
      mutate(root);
      assert.ok(validateRepository(root).some((value) => value.includes(expected)), validateRepository(root).join("\n"));
    });
  }
});

test("release closure is gated by the bounded exact-head Docker E2E contract", () => {
  const governance = JSON.parse(readFileSync(join(ROOT, "release/governance.json"), "utf8"));
  const policy = governance.currentHeadDockerE2E;
  assert.equal(policy.schemaVersion, "pansphaira.release/current-head-docker-e2e/v1");
  assert.equal(policy.workflowPath, ".github/workflows/demo-current-head-e2e.yml");
  assert.equal(policy.contractPath, "verification/demo-current-head-e2e/contract-v1.json");
  assert.equal(policy.maximumReceiptAgeHours, 168);
  assert.equal(policy.releaseReadbackRequiresE2E, true);
  assert.equal(policy.ordinaryPullRequestDockerRunRequired, false);
  assert.equal(policy.terminalIssueState, "CLOSED_COMPLETED_PUBLIC_PROVIDER_READBACK");
  assert.equal(policy.terminalQueueState, "DONE_UNOWNED_ZERO_RESIDUAL_OWNERSHIP");
  assert.equal(policy.requiredHardGates.includes("demo-current-head-e2e"), true);
  assert.equal(policy.requiredNegativeProofCaseIds.length, 14);

  const workflow = readFileSync(join(ROOT, ".github/workflows/release-public-readback.yml"), "utf8");
  assert.match(workflow, /current-head-docker-e2e:[\s\S]*uses: \.\/\.github\/workflows\/demo-current-head-e2e\.yml/);
  assert.match(workflow, /target_sha: \$\{\{ github\.event\.release\.target_commitish \}\}/);
  assert.match(workflow, /anonymous-public-readback-before-terminalization:[\s\S]*needs: current-head-docker-e2e/);
});

// AP-04 ERV relational hardening candidate (issue #393, candidate base
// ec7b60b29700aa8d1b66280f756f5d11315dac9b): the repository-only candidate
// record must declare the functional release title required by the exact
// release-body contract (release/governance.json#releaseBodyContract) and
// the taxonomy class SOURCE_EVIDENCE_ONLY. The declaration is deterministic
// and fail-closed; it grants no publication, tag, release or delivery
// authority.
const AP04_RELATIONAL_RELEASE_TITLE_DECLARATION = "docs/evidence/ap-04-erv-relational-release-title-v1.json";
const AP04_RELATIONAL_RELEASE_TITLE_SCHEMA = "chimpmaera.candidate-release-title/v1";
const AP04_RELATIONAL_FUNCTIONAL_INCREMENT = "AP-04 ERV relational hardening: bounded relational matching and exact evidence semantics";
const AP04_RELATIONAL_EXPECTED_TAG = "pan364-ap04-erv-relational-v2-source-v1";
const AP04_RELATIONAL_CANDIDATE_BASE_COMMIT = "ec7b60b29700aa8d1b66280f756f5d11315dac9b";
const AP04_RELATIONAL_NONCLAIMS = [
  "NO_SYSTEM_OF_RECORD_READBACK_PERFORMED",
  "NOT_DELIVERED_NO_PUBLIC_MUTATION_NO_TAG_NO_RELEASE",
  "NO_PRODUCTIVE_POSTING_OR_ALLOCATION_AUTHORITY",
];
const AP04_RELATIONAL_TITLE_KEYS = [
  "assetContract",
  "bodyContract",
  "candidateBaseCommit",
  "closureState",
  "delivered",
  "expectedTag",
  "functionalIncrement",
  "intendedClass",
  "issue",
  "nonclaims",
  "portfolio",
  "releaseTitle",
  "repository",
  "schemaVersion",
];

function validateCandidateReleaseTitle(root = ROOT) {
  const issues = [];
  let declaration;
  try {
    declaration = JSON.parse(readFileSync(join(root, AP04_RELATIONAL_RELEASE_TITLE_DECLARATION), "utf8"));
  } catch {
    return ["CANDIDATE_RELEASE_TITLE_MISSING"];
  }
  const governance = JSON.parse(readFileSync(join(root, "release", "governance.json"), "utf8"));
  if (typeof declaration !== "object" || declaration === null || Array.isArray(declaration)
    || JSON.stringify(Object.keys(declaration).sort()) !== JSON.stringify(AP04_RELATIONAL_TITLE_KEYS)) {
    return ["CANDIDATE_RELEASE_TITLE_SCHEMA_INVALID"];
  }
  if (declaration.schemaVersion !== AP04_RELATIONAL_RELEASE_TITLE_SCHEMA
    || declaration.repository !== governance.repository
    || declaration.issue !== 393
    || declaration.portfolio !== "PS364"
    || typeof declaration.functionalIncrement !== "string"
    || declaration.candidateBaseCommit !== AP04_RELATIONAL_CANDIDATE_BASE_COMMIT) {
    issues.push("CANDIDATE_RELEASE_TITLE_SCHEMA_INVALID");
  }
  const functional = declaration.functionalIncrement ?? "";
  if (functional !== AP04_RELATIONAL_FUNCTIONAL_INCREMENT
    || !/AP-04/.test(functional)
    || /\b(?:daily|today(?:'s)?|calendar)\b/i.test(functional)
    || typeof declaration.releaseTitle !== "string"
    || declaration.releaseTitle !== `PanSphaira — ${functional} (Increment Candidate)`
    || !declaration.releaseTitle.toLowerCase().includes(functional.toLowerCase())) {
    issues.push("CANDIDATE_RELEASE_TITLE_NOT_FUNCTIONAL");
  }
  const sourceClass = governance.releaseTaxonomy?.classes?.[1] ?? {};
  if (declaration.intendedClass !== "SOURCE_EVIDENCE_ONLY"
    || declaration.intendedClass !== sourceClass.id
    || sourceClass.evidenceOnly !== true
    || declaration.assetContract !== sourceClass.assetContract
    || declaration.assetContract !== "NO_CUSTOM_ASSETS_SOURCE_ONLY") {
    issues.push("CANDIDATE_RELEASE_TITLE_CLASS_DRIFT");
  }
  if (declaration.expectedTag !== AP04_RELATIONAL_EXPECTED_TAG
    || !/^pan\d+-[a-z0-9-]+-source-v1$/.test(declaration.expectedTag)) {
    issues.push("CANDIDATE_RELEASE_TITLE_TAG_DRIFT");
  }
  const bodyContract = governance.releaseBodyContract ?? {};
  if (JSON.stringify(declaration.bodyContract?.requiredSections) !== JSON.stringify(bodyContract.requiredSections)
    || declaration.bodyContract?.sourceOnlyNoAssetsMarker !== bodyContract.sourceOnlyNoAssetsMarker
    || declaration.closureState?.pendingPublicReadback !== bodyContract.pendingPublicReadback
    || declaration.closureState?.blockedTerminalState !== bodyContract.blockedTerminalState) {
    issues.push("CANDIDATE_RELEASE_TITLE_CONTRACT_DRIFT");
  }
  if (declaration.delivered !== false
    || JSON.stringify(declaration.nonclaims) !== JSON.stringify(AP04_RELATIONAL_NONCLAIMS)) {
    issues.push("CANDIDATE_RELEASE_TITLE_DELIVERY_CLAIM_DENIED");
  }
  return issues;
}

test("candidate AP-04 relational hardening declares a functional release title (issue #393)", async (t) => {
  assert.deepEqual(validateCandidateReleaseTitle(), []);

  const probes = [
    ["candidate release title missing", "CANDIDATE_RELEASE_TITLE_MISSING", (root) => rmSync(join(root, AP04_RELATIONAL_RELEASE_TITLE_DECLARATION))],
    ["candidate release title calendar identity", "CANDIDATE_RELEASE_TITLE_NOT_FUNCTIONAL", (root) => replace(root, AP04_RELATIONAL_RELEASE_TITLE_DECLARATION, "bounded relational matching", "today's relational matching")],
    ["candidate release title non-functional increment", "CANDIDATE_RELEASE_TITLE_NOT_FUNCTIONAL", (root) => replace(root, AP04_RELATIONAL_RELEASE_TITLE_DECLARATION, AP04_RELATIONAL_FUNCTIONAL_INCREMENT, "MSSQL Scope Compatibility")],
    ["candidate release title class drift", "CANDIDATE_RELEASE_TITLE_CLASS_DRIFT", (root) => replace(root, AP04_RELATIONAL_RELEASE_TITLE_DECLARATION, "\"intendedClass\": \"SOURCE_EVIDENCE_ONLY\"", "\"intendedClass\": \"REGULAR_RUNNABLE_ARTIFACT\"")],
    ["candidate release title tag drift", "CANDIDATE_RELEASE_TITLE_TAG_DRIFT", (root) => replace(root, AP04_RELATIONAL_RELEASE_TITLE_DECLARATION, AP04_RELATIONAL_EXPECTED_TAG, "pan364-ap04-erv-relational-v3-source-v1")],
    ["candidate release title claims delivered", "CANDIDATE_RELEASE_TITLE_DELIVERY_CLAIM_DENIED", (root) => replace(root, AP04_RELATIONAL_RELEASE_TITLE_DECLARATION, "\"delivered\": false", "\"delivered\": true")],
  ];
  for (const [name, expected, mutate] of probes) {
    await t.test(name, (t) => {
      const root = fixture();
      t.after(() => rmSync(root, { recursive: true, force: true }));
      mutate(root);
      assert.ok(validateCandidateReleaseTitle(root).includes(expected), validateCandidateReleaseTitle(root).join("\n"));
    });
  }
});