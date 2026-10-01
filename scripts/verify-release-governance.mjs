#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { request } from "node:https";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const read = (root, path) => readFileSync(resolve(root, path), "utf8");
const issue = (issues, condition, code) => { if (!condition) issues.push(code); };
const ROOT_DOC_VERSION_BINDING = /\b(?:v(?:ersion)?\s*)?\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?\b/i;

function section(markdown, heading) {
  const start = markdown.indexOf(`## ${heading}`);
  if (start < 0) return "";
  const rest = markdown.slice(start);
  const next = rest.slice(3).search(/^## /m);
  return next < 0 ? rest : rest.slice(0, next + 3);
}

function releaseTupleMatches(markdown, release, archive) {
  if (!archive?.name || release.assetManifest?.declares !== archive.name) return false;
  const visibleProse = markdown
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/```[\s\S]*?```/g, "");
  const blocks = [...markdown.matchAll(/```sh\s*\n([\s\S]*?)```/g)]
    .map((match) => match[1])
    .filter((block) => /^\s*release=/m.test(block));
  if (blocks.length !== 1) return false;
  const block = blocks[0];
  const assignments = (name) => [...block.matchAll(new RegExp(`^\\s*${name}=([^\\s]+)\\s*$`, "gm"))].map((match) => match[1]);
  const releaseValues = assignments("release");
  const archiveValues = assignments("archive");
  const directoryValues = [...block.matchAll(/^\s*cd (cm-product-increment-[^\s]+)\s*$/gm)].map((match) => match[1]);
  return visibleProse.toLowerCase().includes(release.increment.toLowerCase())
    && releaseValues.length === 1 && releaseValues[0] === release.tag
    && archiveValues.length === 1 && archiveValues[0] === archive.name
    && directoryValues.length === 1 && directoryValues[0] === archive.name.replace(/\.tar\.gz$/, "")
    && [...markdown.matchAll(/^\s*release=/gm)].length === 1
    && [...markdown.matchAll(/^\s*archive=/gm)].length === 1
    && [...markdown.matchAll(/^\s*cd cm-product-increment-/gm)].length === 1;
}

function scanUnsafe(text, path) {
  const patterns = [
    ["PRIVATE_KEY", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ["GITHUB_TOKEN", /\bgh[pousr]_[A-Za-z0-9]{20,}\b/],
    ["OPENAI_KEY", /\bsk-[A-Za-z0-9_-]{20,}\b/],
    ["HUGGINGFACE_TOKEN", /\bhf_[A-Za-z0-9]{20,}\b/],
    ["TELEGRAM_TOKEN", /\b[0-9]{8,12}:[A-Za-z0-9_-]{30,}\b/],
    ["CREDENTIAL_URL", /https?:\/\/[^/\s:@]+:[^/\s@]+@/],
    ["PRIVATE_HOME_PATH", /\/home\/[A-Za-z0-9._-]+(?:\/|\b)/],
    ["PRIVATE_MOUNT_PATH", /\/mnt\/[A-Za-z0-9._-]+(?:\/|\b)/],
    ["SESSION_ID", /\bagent:[A-Za-z0-9._-]+:[A-Za-z0-9._:-]+\b/]
  ];
  return patterns.filter(([, regex]) => regex.test(text)).map(([name]) => `LEAK_${name}:${path}`);
}

function usableImageAlt(value) {
  const normalized = value
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length >= 5
    && /[\p{L}\p{N}]/u.test(normalized)
    && !/^(?:alt(?: text)?|diagram|graphic|icon|image|img|logo|none|null|n\/?a|photo|picture|placeholder|screenshot|tbd|todo)[.!]?$/i.test(normalized);
}

function publicDocumentationPresentationIssues(text, path) {
  if (!/\.(?:html?|markdown|md)$/i.test(path)) return [];
  const issues = [];
  const visible = text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<details(?:\s[^>]*)?>[\s\S]*?<\/details\s*>/gi, "");
  if (/^\s*(?:[-*>]\s*)?(?:\*\*|__)?(?:text\s+fallback|fallback\s+text|placeholder(?:\s+text)?)(?:\*\*|__)?\s*:/im.test(visible)) {
    issues.push(`PUBLIC_DOC_UNENCAPSULATED_FALLBACK_LABEL:${path}`);
  }

  for (const match of text.matchAll(/<img\b[^>]*>/gi)) {
    const alt = match[0].match(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i);
    if (!alt || !usableImageAlt(alt[1] ?? alt[2] ?? alt[3] ?? "")) {
      issues.push(`PUBLIC_DOC_IMAGE_ALT_UNUSABLE:${path}`);
    }
  }
  for (const match of text.matchAll(/!\[([^\]\n]*)\](?:\([^\n)]*\)|\[[^\]\n]*\])/g)) {
    if (!usableImageAlt(match[1])) issues.push(`PUBLIC_DOC_IMAGE_ALT_UNUSABLE:${path}`);
  }
  return [...new Set(issues)];
}

function markdownSections(markdown) {
  const headings = [...markdown.matchAll(/^## ([^\n]+)\s*$/gm)];
  const sections = new Map();
  for (const [index, heading] of headings.entries()) {
    const name = heading[1].trim();
    const start = heading.index + heading[0].length;
    const end = headings[index + 1]?.index ?? markdown.length;
    const values = sections.get(name) ?? [];
    values.push(markdown.slice(start, end).trim());
    sections.set(name, values);
  }
  return sections;
}

function oneSection(sections, name) {
  const values = sections.get(name) ?? [];
  return values.length === 1 ? values[0] : "";
}

function exactPublicMetadata(record, release) {
  return release?.tag_name === record?.tag
    && release?.id === record?.releaseId
    && release?.name === record?.title
    && release?.target_commitish === record?.targetCommitish
    && release?.draft === record?.draft
    && release?.prerelease === record?.prerelease
    && release?.published_at === record?.publishedAt
    && release?.html_url === record?.url;
}

function assetInventoryMatches(expectedAssets, actualAssets) {
  const normalize = (assets) => [...(assets ?? [])]
    .map(({ name, size }) => ({ name, size }))
    .sort((left, right) => left.name.localeCompare(right.name, "en"));
  return JSON.stringify(normalize(expectedAssets)) === JSON.stringify(normalize(actualAssets));
}

function validateDownloadedAssets(issues, expectedAssets, downloadedAssets, assetManifest) {
  if (!(downloadedAssets instanceof Map)) return;
  for (const asset of expectedAssets ?? []) {
    const bytes = downloadedAssets.get(asset.name);
    issue(issues, bytes !== undefined, `PUBLIC_ASSET_BYTES_MISSING:${asset.name}`);
    if (bytes === undefined) continue;
    const buffer = Buffer.from(bytes);
    issue(issues, buffer.length === asset.size, `PUBLIC_ASSET_SIZE_MISMATCH:${asset.name}`);
    issue(issues, sha256(buffer) === asset.sha256, `PUBLIC_ASSET_SHA256_MISMATCH:${asset.name}`);
  }
  if (assetManifest?.name && assetManifest?.declares) {
    const declarationBytes = downloadedAssets.get(assetManifest.name);
    const declaredAsset = (expectedAssets ?? []).find(({ name }) => name === assetManifest.declares);
    if (declarationBytes !== undefined && declaredAsset !== undefined) {
      issue(
        issues,
        Buffer.from(declarationBytes).toString("utf8").trim() === `${declaredAsset.sha256}  ${declaredAsset.name}`,
        "PUBLIC_ASSET_MANIFEST_CONTENT_MISMATCH",
      );
    }
  }
}

function protectedHistoricalIdentity(governance, candidate) {
  const records = [governance?.currentRelease, governance?.publicLatestRelease,
    governance?.historicalReleasePolicy?.namedHistoricalIdentity,
    ...(Array.isArray(governance?.legacyReleaseExceptions) ? governance.legacyReleaseExceptions : [])];
  return records.some((record) => (typeof record?.tag === "string"
      && record.tag === (candidate?.tag_name ?? candidate?.tag))
    || (Number.isSafeInteger(record?.releaseId) && record.releaseId > 0 && record.releaseId === candidate?.id));
}

export function validateReleaseContract({
  root = process.cwd(),
  governance,
  release,
  latest,
  tagRef,
  latestTagRef,
  latestByTag,
  downloadedAssets = new Map(),
}) {
  const issues = [];
  const body = typeof release?.body === "string" ? release.body : "";
  issue(issues, !protectedHistoricalIdentity(governance, release), "PUBLIC_HISTORICAL_IDENTITY_NOT_NEW_RELEASE");
  const sections = markdownSections(body);
  const requiredSections = governance?.releaseBodyContract?.requiredSections ?? [];
  const observedHeadings = [...body.matchAll(/^## ([^\n]+)\s*$/gm)].map((match) => match[1].trim());
  issue(
    issues,
    JSON.stringify(observedHeadings) === JSON.stringify(requiredSections),
    "PUBLIC_BODY_SECTION_ORDER_OR_EXTRA_INVALID",
  );
  for (const name of requiredSections) {
    const values = sections.get(name) ?? [];
    issue(
      issues,
      values.length === 1 && values[0].length > 0,
      name === "Included capabilities and issues" ? "PUBLIC_BODY_SCOPE_MISSING" : `PUBLIC_BODY_SECTION_MISSING:${name}`,
    );
  }

  const classSection = oneSection(sections, "Release class");
  const classMatches = [...classSection.matchAll(/^RELEASE_CLASS: ([A-Z_]+)$/gm)];
  const releaseClass = classMatches.length === 1 ? classMatches[0][1] : "";
  const knownClasses = new Set((governance?.releaseTaxonomy?.classes ?? []).map(({ id }) => id));
  issue(issues, knownClasses.has(releaseClass), "PUBLIC_RELEASE_CLASS_INVALID");
  const ownerClass = governance?.releaseTaxonomy?.githubLatestOwnerClass;
  const nonOwnerRunnable = releaseClass === "REGULAR_RUNNABLE_ARTIFACT" && ownerClass === "SOURCE_EVIDENCE_ONLY";
  const forwardPolicy = governance?.forwardRunnableReleases;
  const designation = (Array.isArray(forwardPolicy?.designations) ? forwardPolicy.designations : [])
    .find((entry) => entry?.tag === release?.tag_name);
  // Designation is authoritative before choosing a body-class branch.
  // Calling the designated runnable tag source-only cannot waive its scope.
  if (designation !== undefined) {
    issue(issues, releaseClass === "REGULAR_RUNNABLE_ARTIFACT", "PUBLIC_DESIGNATED_RELEASE_CLASS_MISMATCH");
    issue(issues, latest?.tag_name !== release?.tag_name, "PUBLIC_NONOWNER_BECAME_LATEST");
  }
  if (nonOwnerRunnable) {
    issue(issues, forwardPolicy?.schemaVersion === "pansphaira.release/non-latest-runnable/v1"
      && forwardPolicy.latestOwnerClass === ownerClass && forwardPolicy.requiresAnonymousLatestTagReadback === true
      && forwardPolicy.auxiliaryOwnerPolicy === "CONFORMING_NONHISTORICAL_SOURCE_ONLY"
      && designation !== undefined, "PUBLIC_NONLATEST_RUNNABLE_NOT_DESIGNATED");
    issue(issues, latest?.tag_name !== release?.tag_name, "PUBLIC_NONOWNER_BECAME_LATEST");
    issue(issues, !protectedHistoricalIdentity(governance, latest), "PUBLIC_NONLATEST_HISTORICAL_OWNER_NOT_SUPPORTED");
    const ownerSections = markdownSections(latest?.body ?? "");
    const ownerMergeSection = oneSection(ownerSections, "Exact merge SHA");
    const ownerMergeMatches = [...ownerMergeSection.matchAll(/^MERGE_SHA: ([a-f0-9]{40})$/gm)];
    const ownerMerge = ownerMergeMatches.length === 1 ? ownerMergeMatches[0][1] : "";
    issue(issues, oneSection(ownerSections, "Release class") === `RELEASE_CLASS: ${ownerClass}`
      && oneSection(ownerSections, "Assets and checksums") === governance?.releaseBodyContract?.sourceOnlyNoAssetsMarker
      && Array.isArray(latest?.assets) && latest.assets.length === 0,
    "PUBLIC_NONLATEST_OWNER_CLASS_OR_ASSETS_INVALID");
    issue(issues, /^[A-Za-z0-9._-]+$/.test(latest?.tag_name ?? "")
      && Number.isSafeInteger(latest?.id) && latest.id > 0
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(latest?.published_at ?? "")
      && latest?.draft === false && latest?.prerelease === false
      && latest?.html_url === `https://github.com/${governance?.repository}/releases/tag/${latest?.tag_name}`,
    "PUBLIC_NONLATEST_OWNER_METADATA_INVALID");
    issue(issues, /^[a-f0-9]{40}$/.test(ownerMerge) && ownerMergeSection === `MERGE_SHA: ${ownerMerge}`
      && latest?.target_commitish === ownerMerge && latestTagRef?.ref === `refs/tags/${latest?.tag_name}`
      && latestTagRef?.object?.type === "commit" && latestTagRef?.object?.sha === ownerMerge,
    "PUBLIC_NONLATEST_OWNER_TARGET_UNOBSERVED");
    issue(issues, latestByTag?.id === latest?.id && latestByTag?.tag_name === latest?.tag_name
      && latestByTag?.body === latest?.body && latestByTag?.target_commitish === latest?.target_commitish
      && latestByTag?.published_at === latest?.published_at && latestByTag?.html_url === latest?.html_url
      && latestByTag?.draft === false && latestByTag?.prerelease === false
      && Array.isArray(latestByTag?.assets) && latestByTag.assets.length === 0,
    "PUBLIC_NONLATEST_OWNER_TAG_READBACK_MISMATCH");
  } else {
    issue(issues, releaseClass !== "" && releaseClass === ownerClass, "PUBLIC_LATEST_CLASS_MISMATCH");
    issue(issues, latest?.tag_name === release?.tag_name, "PUBLIC_LATEST_MISMATCH");
  }
  issue(issues, release?.draft === false, "PUBLIC_DRAFT_MISMATCH");
  issue(issues, release?.prerelease === false, "PUBLIC_PRERELEASE_MISMATCH");
  issue(
    issues,
    Number.isSafeInteger(release?.id) && release.id > 0
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(release?.published_at ?? "")
      && release?.html_url === `https://github.com/${governance?.repository}/releases/tag/${release?.tag_name}`,
    "PUBLIC_RELEASE_METADATA_MISMATCH",
  );
  issue(
    issues,
    typeof release?.name === "string" && release.name.trim().length > 0
      && !/\b(?:daily|today(?:'s)?|calendar)\b/i.test(release.name),
    "PUBLIC_FUNCTIONAL_TITLE_MISSING",
  );

  const mergeSection = oneSection(sections, "Exact merge SHA");
  const mergeMatches = [...mergeSection.matchAll(/^MERGE_SHA: ([a-f0-9]{40})$/gm)];
  const mergeSha = mergeMatches.length === 1 ? mergeMatches[0][1] : "";
  issue(issues, mergeSha !== "", "PUBLIC_BODY_MERGE_SHA_MISSING");
  issue(
    issues,
    mergeSha !== ""
      && release?.target_commitish === mergeSha
      && tagRef?.object?.sha === mergeSha
      && tagRef?.object?.type === "commit" && tagRef?.ref === `refs/tags/${release?.tag_name}`,
    "PUBLIC_TARGET_MISMATCH",
  );

  const scope = oneSection(sections, "Included capabilities and issues");
  const capabilityIds = [...scope.matchAll(/^- CAPABILITY: ([A-Z0-9][A-Z0-9._:-]*)$/gm)].map((match) => match[1]);
  const issueIds = [...scope.matchAll(/^- ISSUE: #(\d+)$/gm)].map((match) => Number(match[1]));
  if (nonOwnerRunnable || designation !== undefined) issue(issues, designation !== undefined && issueIds.includes(designation.requiredIssue),
    "PUBLIC_NONLATEST_DESIGNATED_SCOPE_MISMATCH");
  issue(
    issues,
    capabilityIds.length > 0 && new Set(capabilityIds).size === capabilityIds.length
      && issueIds.length > 0 && issueIds.every((value) => Number.isSafeInteger(value) && value > 0),
    "PUBLIC_BODY_SCOPE_MISSING",
  );

  const evidence = oneSection(sections, "Evidence boundary");
  const proofLines = evidence.split("\n").filter((line) => line.startsWith("- CLAIM_PROOF:"));
  const proofPattern = /^- CLAIM_PROOF: ([A-Z0-9][A-Z0-9._:-]*) \| MATURITY=([A-Z_]+) \| PROOF_CLASS=([A-Z_]+) \| ARTIFACT=([^|\n]+) \| EXACT_IDENTITY=([^|\n]+) \| GATE=([^|\n]+) \| NONCLAIM=(.+)$/;
  const proofs = proofLines.map((line) => line.match(proofPattern)).filter(Boolean).map((match) => ({
    claimId: match[1],
    maturity: match[2],
    proofClass: match[3],
    artifact: match[4].trim(),
    exactIdentity: match[5].trim(),
    gate: match[6].trim(),
    nonclaim: match[7].trim(),
  }));
  issue(
    issues,
    proofs.length > 0 && proofs.length === proofLines.length && new Set(proofs.map(({ claimId }) => claimId)).size === proofs.length,
    "PUBLIC_BODY_CLAIM_PROOF_INVALID",
  );
  const proofIds = new Set(proofs.map(({ claimId }) => claimId));
  issue(
    issues,
    capabilityIds.length === proofs.length && capabilityIds.every((claimId) => proofIds.has(claimId)),
    "PUBLIC_BODY_CLAIM_PROOF_OWNERSHIP_MISSING",
  );

  const matrix = new Map((governance?.contradictionPreflight?.maturityProofMatrix ?? [])
    .map((entry) => [`${entry.maturity}\0${entry.proofClass}`, entry.gate]));
  const testsSection = oneSection(sections, "Tests");
  let packageScripts = {};
  let publicManifestPaths = new Set();
  try {
    packageScripts = JSON.parse(read(root, "package.json")).scripts ?? {};
    publicManifestPaths = new Set(read(root, "release/public-files.manifest").split("\n")
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => line.split("\t")[0]));
  } catch {
    issues.push("PUBLIC_BODY_PROOF_REPOSITORY_CONTEXT_UNREADABLE");
  }
  for (const proof of proofs) {
    const gateContract = matrix.get(`${proof.maturity}\0${proof.proofClass}`);
    issue(issues, gateContract !== undefined, "PUBLIC_BODY_PROOF_CLASS_INFLATION");
    const executable = proof.gate.startsWith("EXECUTABLE:");
    const anonymous = proof.gate === "ANONYMOUS_PUBLIC_READBACK";
    issue(
      issues,
      gateContract === "EXECUTABLE" ? executable
        : gateContract === "ANONYMOUS_PUBLIC_READBACK" ? anonymous
          : gateContract === "EXECUTABLE_OR_ANONYMOUS_PUBLIC_READBACK" && (executable || anonymous),
      "PUBLIC_BODY_PROOF_GATE_INVALID",
    );
    issue(issues, proof.nonclaim.length >= 10 && !/^none$/i.test(proof.nonclaim), "PUBLIC_BODY_CLAIM_NONCLAIM_MISSING");

    const localArtifact = /^[A-Za-z0-9._/-]+$/.test(proof.artifact)
      && !proof.artifact.startsWith("/")
      && !proof.artifact.split("/").some((part) => part === "" || part === "." || part === "..");
    const providerArtifact = proof.artifact === `https://github.com/${governance?.repository}/commit/${mergeSha}`;
    const callerMinted = /(?:CALLER|RELEASE[_ -]?BODY|SELF[_ -]?ASSERT)/i.test(proof.artifact);
    issue(
      issues,
      !callerMinted && (localArtifact || providerArtifact),
      "PUBLIC_BODY_PROVENANCE_CIRCULAR_OR_CALLER_MINTED",
    );
    if (localArtifact) {
      let bytes;
      try { bytes = readFileSync(resolve(root, proof.artifact)); } catch { /* handled below */ }
      issue(issues, bytes !== undefined && publicManifestPaths.has(proof.artifact), `PUBLIC_BODY_ARTIFACT_MISSING:${proof.artifact}`);
      issue(
        issues,
        bytes !== undefined && proof.exactIdentity === `sha256:${sha256(bytes)}`,
        `PUBLIC_BODY_ARTIFACT_IDENTITY_MISMATCH:${proof.artifact}`,
      );
    } else if (providerArtifact) {
      issue(issues, proof.exactIdentity === `git:${mergeSha}`, "PUBLIC_BODY_PROVIDER_IDENTITY_MISMATCH");
    }
    if (executable) {
      const command = proof.gate.slice("EXECUTABLE:".length);
      issue(issues, testsSection.includes(`- TEST: ${command} => PASS`), "PUBLIC_BODY_EXECUTABLE_GATE_UNLISTED");
      const npmScript = command.match(/^npm run ([A-Za-z0-9:_-]+)$/)?.[1];
      issue(issues, npmScript !== undefined && typeof packageScripts[npmScript] === "string", "PUBLIC_BODY_EXECUTABLE_GATE_UNKNOWN");
    }
  }

  const nonclaims = oneSection(sections, "Nonclaims");
  issue(issues, /^- NONCLAIM: .{10,}$/m.test(nonclaims), "PUBLIC_BODY_NONCLAIMS_MISSING");
  const closure = oneSection(sections, "Closure state");
  issue(
    issues,
    closure.includes(governance?.releaseBodyContract?.pendingPublicReadback ?? "__missing__")
      && closure.includes(governance?.releaseBodyContract?.blockedTerminalState ?? "__missing__")
      && !/^(?:PUBLIC_READBACK|ISSUE_QUEUE_TERMINAL):\s*(?:DONE|PASS|CLOSED|RELEASED)\b/im.test(closure),
    "PUBLIC_STATUS_TERMINAL_BEFORE_READBACK",
  );

  const assetSection = oneSection(sections, "Assets and checksums");
  const assetPattern = /^- ASSET: ([A-Za-z0-9._-]+) \| SIZE=(\d+) \| SHA256=([a-f0-9]{64})$/;
  const assetLines = assetSection.split("\n").filter((line) => line.startsWith("- ASSET:"));
  const bodyAssets = assetLines.map((line) => line.match(assetPattern)).filter(Boolean).map((match) => ({
    name: match[1],
    size: Number(match[2]),
    sha256: match[3],
  }));
  if (releaseClass === "REGULAR_RUNNABLE_ARTIFACT") {
    const archives = bodyAssets.filter(({ name }) => name.endsWith(".tar.gz"));
    const sidecars = bodyAssets.filter(({ name }) => name.endsWith(".tar.gz.sha256"));
    issue(
      issues,
      bodyAssets.length === 2 && bodyAssets.length === assetLines.length && archives.length === 1 && sidecars.length === 1
        && sidecars[0].name === `${archives[0].name}.sha256`,
      "PUBLIC_REGULAR_ASSET_CONTRACT_INVALID",
    );
    issue(
      issues,
      bodyAssets.every(({ size }) => Number.isSafeInteger(size) && size > 0),
      "PUBLIC_REGULAR_ASSET_CONTRACT_INVALID",
    );
    issue(issues, assetInventoryMatches(bodyAssets, release?.assets), "PUBLIC_ASSET_SET_OR_SIZE_MISMATCH");
    issue(
      issues,
      (release?.assets ?? []).every(({ name, browser_download_url: url }) => url === `https://github.com/${governance?.repository}/releases/download/${release?.tag_name}/${name}`),
      "PUBLIC_ASSET_URL_MISMATCH",
    );
    validateDownloadedAssets(issues, bodyAssets, downloadedAssets, {
      name: sidecars[0]?.name,
      declares: archives[0]?.name,
    });
    issue(issues, !assetSection.includes("NO_ASSETS_SOURCE_ONLY"), "PUBLIC_REGULAR_SOURCE_ONLY_MARKER_DENIED");
  } else if (releaseClass === "SOURCE_EVIDENCE_ONLY") {
    issue(issues, assetSection === governance?.releaseBodyContract?.sourceOnlyNoAssetsMarker, "PUBLIC_SOURCE_ONLY_MARKER_MISSING");
    issue(
      issues,
      (release?.assets ?? []).length === 0 && bodyAssets.length === 0 && downloadedAssets.size === 0,
      "PUBLIC_SOURCE_ONLY_ASSET_DENIED",
    );
  }
  return [...new Set(issues)].sort();
}

export function validateRecordedPublicState({
  governance,
  latestRelease,
  latest,
  latestTagRef,
  runnableRelease,
  runnableTagRef,
  downloadedRunnableAssets,
}) {
  const issues = [];
  const expectedLatest = governance?.publicLatestRelease ?? {};
  const latestMatches = exactPublicMetadata(expectedLatest, latestRelease)
    && latest?.tag_name === expectedLatest.tag
    && latestTagRef?.object?.sha === expectedLatest.tagObjectSha
    && latestTagRef?.object?.type === "commit"
    && sha256(Buffer.from(latestRelease?.body ?? "", "utf8")) === expectedLatest.bodySha256
    && assetInventoryMatches(expectedLatest.assets, latestRelease?.assets);
  issue(issues, latestMatches, "PUBLIC_GOVERNANCE_STALE");
  issue(issues, latest?.tag_name === expectedLatest.tag, "PUBLIC_LATEST_MISMATCH");
  issue(
    issues,
    expectedLatest.releaseClass === governance?.releaseTaxonomy?.githubLatestOwnerClass,
    "PUBLIC_LATEST_CLASS_MISMATCH",
  );

  if (runnableRelease !== undefined || runnableTagRef !== undefined) {
    const expectedRunnable = governance?.currentRelease ?? {};
    const runnableMatches = exactPublicMetadata(expectedRunnable, runnableRelease)
      && runnableTagRef?.object?.sha === expectedRunnable.tagObjectSha
      && runnableTagRef?.object?.type === "commit"
      && sha256(Buffer.from(runnableRelease?.body ?? "", "utf8")) === expectedRunnable.bodySha256
      && assetInventoryMatches(expectedRunnable.assets, runnableRelease?.assets);
    issue(issues, runnableMatches, "PUBLIC_RUNNABLE_GOVERNANCE_STALE");
    issue(issues, latest?.tag_name !== expectedRunnable.tag, "PUBLIC_RUNNABLE_INCORRECTLY_LATEST");
    validateDownloadedAssets(issues, expectedRunnable.assets ?? [], downloadedRunnableAssets, expectedRunnable.assetManifest);
  }
  return [...new Set(issues)].sort();
}

export function validateRepository(root = process.cwd()) {
  const issues = [];
  let governance;
  try {
    governance = JSON.parse(read(root, "release/governance.json"));
  } catch (error) {
    return [`GOVERNANCE_CONFIG_UNREADABLE:${error.code ?? error.message}`];
  }

  issue(issues, governance.schemaVersion === "chimpmaera.release-governance/v2", "GOVERNANCE_SCHEMA_DENIED");
  const taxonomy = governance.releaseTaxonomy ?? {};
  const classes = taxonomy.classes ?? [];
  issue(issues, taxonomy.schemaVersion === "chimpmaera.release-taxonomy/v1", "RELEASE_TAXONOMY_SCHEMA_DENIED");
  issue(
    issues,
    JSON.stringify(classes.map(({ id }) => id)) === JSON.stringify(["REGULAR_RUNNABLE_ARTIFACT", "SOURCE_EVIDENCE_ONLY"])
      && classes[0]?.runnable === true && classes[0]?.evidenceOnly === false
      && classes[0]?.assetContract === "ARCHIVE_AND_SHA256_SIDECAR"
      && classes[1]?.runnable === false && classes[1]?.evidenceOnly === true
      && classes[1]?.assetContract === "NO_CUSTOM_ASSETS_SOURCE_ONLY",
    "RELEASE_CLASS_TAXONOMY_INVALID",
  );
  issue(issues, taxonomy.githubLatestOwnerClass === "SOURCE_EVIDENCE_ONLY", "LATEST_OWNER_CLASS_INVALID");
  const forward = governance.forwardRunnableReleases;
  issue(issues, forward?.schemaVersion === "pansphaira.release/non-latest-runnable/v1"
    && forward.latestOwnerClass === taxonomy.githubLatestOwnerClass && forward.requiresAnonymousLatestTagReadback === true
    && forward.auxiliaryOwnerPolicy === "CONFORMING_NONHISTORICAL_SOURCE_ONLY"
    && Array.isArray(forward.designations) && forward.designations.length > 0
    && new Set(forward.designations.map((entry) => entry?.tag)).size === forward.designations.length
    && forward.designations.every((entry) => entry !== null && typeof entry === "object"
      && Object.keys(entry).sort().join("|") === "profile|requiredIssue|tag"
      && /^[A-Za-z0-9._-]+$/.test(entry.tag ?? "") && /^[A-Z][A-Z0-9_]+$/.test(entry.profile ?? "")
      && Number.isSafeInteger(entry.requiredIssue) && entry.requiredIssue > 0
      && !protectedHistoricalIdentity(governance, entry)),
  "FORWARD_RUNNABLE_POLICY_INVALID");
  issue(
    issues,
    governance.releaseBodyContract?.schemaVersion === "chimpmaera.release-body/v1"
      && governance.releaseBodyContract?.appliesTo === "EVERY_NEW_RELEASE_NO_RETROACTIVE_CONFORMANCE"
      && JSON.stringify(governance.releaseBodyContract?.requiredSections) === JSON.stringify([
        "Release class",
        "Exact merge SHA",
        "Included capabilities and issues",
        "Evidence boundary",
        "Tests",
        "Assets and checksums",
        "Nonclaims",
        "Closure state",
      ])
      && governance.releaseBodyContract?.sourceOnlyNoAssetsMarker === "NO_ASSETS_SOURCE_ONLY"
      && governance.releaseBodyContract?.pendingPublicReadback === "PUBLIC_READBACK: PENDING"
      && governance.releaseBodyContract?.blockedTerminalState === "ISSUE_QUEUE_TERMINAL: BLOCKED_PENDING_PUBLIC_READBACK",
    "RELEASE_BODY_CONTRACT_INVALID",
  );

  const preflight = governance.contradictionPreflight ?? {};
  const expectedFailureModes = [
    "RELEASE_IDENTITY_DRIFT",
    "PROOF_CLASS_INFLATION",
    "MISSING_EXACT_HEAD_DOCUMENTED_PATH",
    "CIRCULAR_OR_CALLER_MINTED_PROVENANCE",
    "STALE_PUBLIC_STATUS",
    "STALE_GOVERNANCE",
  ];
  issue(
    issues,
    preflight.schemaVersion === "chimpmaera.public-delivery-contradiction-preflight/v1"
      && preflight.appliesTo === "EVERY_PUBLIC_DELIVERY"
      && JSON.stringify(preflight.requiredClaimOwnership) === JSON.stringify([
        "materialClaimId",
        "maturity",
        "proofClass",
        "authoritativeArtifact",
        "exactIdentity",
        "executableOrAnonymousReadbackGate",
        "explicitNonclaim",
      ])
      && JSON.stringify((preflight.failureModes ?? []).map(({ id }) => id)) === JSON.stringify(expectedFailureModes)
      && preflight.failureModes.every(({ disposition, negativeProbe }) => disposition === "FAIL_CLOSED" && typeof negativeProbe === "string" && negativeProbe.length > 0)
      && preflight.exceptionContract?.acceptanceIdRequired === true
      && preflight.exceptionContract?.negativeRegressionProbeRequired === true
      && preflight.exceptionContract?.mayGrantConformance === false
      && preflight.exceptionContract?.mayAuthorizeHistoricalMutation === false,
    "CONTRADICTION_PREFLIGHT_INVALID",
  );
  issue(
    issues,
    JSON.stringify((preflight.maturityProofMatrix ?? []).map(({ maturity, proofClass, gate }) => [maturity, proofClass, gate])) === JSON.stringify([
      ["RELEASED_LOCAL_SYNTHETIC", "LOCAL_EXECUTABLE", "EXECUTABLE"],
      ["SOURCE_EVIDENCE_ONLY", "SOURCE_EVIDENCE", "EXECUTABLE_OR_ANONYMOUS_PUBLIC_READBACK"],
      ["PUBLIC_PROVIDER_OBSERVED", "ANONYMOUS_PUBLIC_READBACK", "ANONYMOUS_PUBLIC_READBACK"],
    ]),
    "CLAIM_PROOF_MATRIX_INVALID",
  );

  const release = governance.currentRelease ?? {};
  issue(issues, /^v\d+\.\d+\.\d+-poc\.\d{8}\.\d+$/.test(release.tag ?? ""), "CURRENT_TAG_INVALID");
  issue(issues, Number.isSafeInteger(release.releaseId) && release.releaseId > 0
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(release.publishedAt ?? "")
    && release.url === `https://github.com/${governance.repository}/releases/tag/${release.tag}`, "CURRENT_PUBLICATION_METADATA_INVALID");
  issue(issues, typeof release.title === "string"
    && release.title.toLowerCase().includes((release.increment ?? "__missing__").toLowerCase()), "FUNCTIONAL_INCREMENT_TITLE_MISSING");
  issue(issues, !/\b(?:daily|today(?:'s)?|calendar)\b/i.test(release.title ?? ""), "CALENDAR_RELEASE_IDENTITY_DENIED");
  issue(
    issues,
    release.draft === false && release.prerelease === false && release.mustBeLatest === false
      && release.releaseClass === "REGULAR_RUNNABLE_ARTIFACT" && release.historical === true
      && /^[a-f0-9]{64}$/.test(release.bodySha256 ?? ""),
    "RUNNABLE_ARTIFACT_IDENTITY_INVALID",
  );

  const publicLatest = governance.publicLatestRelease ?? {};
  issue(
    issues,
    Number.isSafeInteger(publicLatest.releaseId) && publicLatest.releaseId > 0
      && /^\d{4}_\d{2}_\d{2}_v\d+$/.test(publicLatest.tag ?? "")
      && /^[a-f0-9]{40}$/.test(publicLatest.targetCommitish ?? "")
      && publicLatest.targetCommitish === publicLatest.tagObjectSha
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(publicLatest.publishedAt ?? "")
      && publicLatest.url === `https://github.com/${governance.repository}/releases/tag/${publicLatest.tag}`
      && publicLatest.draft === false && publicLatest.prerelease === false && publicLatest.mustBeLatest === true
      && publicLatest.releaseClass === "SOURCE_EVIDENCE_ONLY"
      && publicLatest.contractStatus === "LEGACY_PRE_V2_NONCONFORMING_RECONCILED"
      && publicLatest.classificationBasis === "REL-TRUTH-AC06_EXPLICIT_FORWARD_ONLY_RECONCILIATION"
      && Array.isArray(publicLatest.assets) && publicLatest.assets.length === 0
      && sha256(Buffer.from(publicLatest.legacyBody ?? "", "utf8")) === publicLatest.bodySha256,
    "PUBLIC_LATEST_RECONCILIATION_INVALID",
  );
  const exceptions = governance.legacyReleaseExceptions ?? [];
  issue(
    issues,
    exceptions.length === 2
      && exceptions.map(({ tag }) => tag).join("\0") === `${publicLatest.tag}\0${release.tag}`
      && exceptions.every(({ acceptanceId, futureReleasePrecedent, metadataTagOrAssetMutationAuthorized, nonconformities }) => acceptanceId === "REL-TRUTH-AC06"
        && futureReleasePrecedent === false && metadataTagOrAssetMutationAuthorized === false
        && Array.isArray(nonconformities) && nonconformities.length > 0),
    "LEGACY_RELEASE_EXCEPTION_INVALID",
  );
  issue(
    issues,
    governance.historicalReleasePolicy?.tagsAndAssetsImmutable === true
      && governance.historicalReleasePolicy?.retroactiveV2ConformanceDenied === true
      && governance.historicalReleasePolicy?.unlistedPreV2Records === "LEGACY_UNCLASSIFIED_PRESERVE_AS_EVIDENCE"
      && governance.historicalReleasePolicy?.namedHistoricalIdentity?.tag === "v0.1.0"
      && governance.historicalReleasePolicy?.namedHistoricalIdentity?.releaseClass === "LEGACY_UNCLASSIFIED",
    "HISTORICAL_RELEASE_POLICY_INVALID",
  );
  issue(
    issues,
    governance.policy?.anonymousReadbackRequired === true
      && governance.policy?.issueQueueTerminalizationRequiresPublicReadback === true,
    "ANONYMOUS_READBACK_NOT_REQUIRED",
  );
  issue(
    issues,
    governance.policy?.classSpecificAssetContractRequired === true
      && governance.policy?.regularAssetManifestRequired === true
      && governance.policy?.regularAssetHashesRequired === true
      && governance.policy?.sourceOnlyMarkerRequired === true,
    "ASSET_EVIDENCE_NOT_REQUIRED",
  );
  issue(issues, /draft=false/.test(governance.policy?.latest ?? "") && /prerelease=false/.test(governance.policy?.latest ?? ""), "LATEST_POLICY_UNSPECIFIED");

  const files = new Map();
  for (const path of governance.activePublicFiles ?? []) {
    try { files.set(path, read(root, path)); } catch { issues.push(`ACTIVE_PUBLIC_FILE_MISSING:${path}`); }
  }
  const historicalArchivePrefixes = governance.historicalArchivePrefixes ?? [];
  for (const [path, text] of files) {
    if (!historicalArchivePrefixes.some((prefix) => path.startsWith(prefix))) {
      issues.push(...publicDocumentationPresentationIssues(text, path));
    }
  }
  const readme = files.get("README.md") ?? "";
  // Exact DOC-README-03 R1 presentation profile. This byte-bound exception
  // replaces only legacy entry-page wording; it grants no release/runtime
  // authority and does not bypass privacy, evidence, asset or readback gates.
  const approvedReadmeR1 = sha256(readme) === "fcb6619af13ffd9ec8e5f17ed7c4f105d50f7e9d21962d1bf1cd079e97c45c3f";
  let quickstart = "";
  try { quickstart = read(root, "docs/QUICKSTART.md"); } catch { issues.push("PUBLIC_QUICKSTART_MISSING:docs/QUICKSTART.md"); }
  const releaseSection = section(readme, "Releases") || section(readme, "Releases and evidence");
  const quickstartSection = section(readme, "Quickstart");
  const readmeOutsideQuickstart = readme.replace(quickstartSection, "");
  const releaseArchives = (release.assets ?? []).filter(({ name }) => name === release.assetManifest?.declares && name.endsWith(".tar.gz"));
  const releaseArchive = releaseArchives.length === 1 ? releaseArchives[0] : undefined;
  issue(issues, releaseTupleMatches(quickstart, release, releaseArchive), "PUBLIC_QUICKSTART_RELEASE_TUPLE_STALE:docs/QUICKSTART.md");
  issue(
    issues,
    !/^\s*(?:release|archive)=/m.test(readme) && !/^\s*cd cm-product-increment-/m.test(readme),
    "README_VOLATILE_RELEASE_TUPLE_DENIED",
  );
  issue(
    issues,
    [
      "](https://github.com/JoFe2/PANSPHAIRA/releases/latest)",
      "](https://github.com/JoFe2/PANSPHAIRA/releases)",
      "](https://github.com/JoFe2/PANSPHAIRA/releases.atom)",
    ].every((link) => releaseSection.includes(link)) || approvedReadmeR1,
    "README_STABLE_RELEASE_NAVIGATION_MISSING",
  );
  issue(
    issues,
    approvedReadmeR1 || /included capabilities/i.test(releaseSection)
      && /evidence boundaries/i.test(releaseSection)
      && /issues\/PRs/i.test(releaseSection)
      && /SHA-256/i.test(releaseSection),
    "README_RELEASE_NOTE_SCOPE_MISSING",
  );
  issue(issues, approvedReadmeR1 || !/\/releases\/tag\//.test(releaseSection) && !/\bv\d+\.\d+\.\d+\b/.test(readmeOutsideQuickstart), "README_VERSION_BOUND_RELEASE_NAVIGATION_DENIED");
  issue(issues, !/Today's Daily|Previous Daily|POC Daily|Daily snapshot/i.test(releaseSection), "README_ACTIVE_DAILY_IDENTITY_DENIED");
  issue(
    issues,
    approvedReadmeR1 || /An open, knowledge-driven operating system for governed,\s+adaptable AI ecosystems\./i.test(readme)
      && /public repository provides an open-source proof-of-concept control\s+plane/i.test(readme)
      && /runnable local synthetic demo/i.test(readme)
      && /broader direction is not a claim of current\s+product maturity or universal live compatibility/i.test(readme),
    "README_POC_POSITIONING_MISSING",
  );

  const rootSecurity = files.get("SECURITY.md") ?? "";
  issue(
    issues,
    /\]\(https:\/\/github\.com\/JoFe2\/PANSPHAIRA\/releases\/latest\)/.test(rootSecurity)
      && /\]\(https:\/\/github\.com\/JoFe2\/PANSPHAIRA\/releases\)/.test(rootSecurity),
    "ROOT_SECURITY_STABLE_RELEASE_NAVIGATION_MISSING",
  );
  issue(issues, !ROOT_DOC_VERSION_BINDING.test(rootSecurity), "ROOT_SECURITY_VERSION_BINDING_DENIED");
  issue(
    issues,
    /bounded local, synthetic proofs of concept/i.test(rootSecurity)
      && /Production\s+operation[^.]*unsupported/i.test(rootSecurity),
    "ROOT_SECURITY_POC_BOUNDARY_MISSING",
  );

  const rootSupport = files.get("SUPPORT.md") ?? "";
  issue(issues, !ROOT_DOC_VERSION_BINDING.test(rootSupport), "ROOT_SUPPORT_VERSION_BINDING_DENIED");
  issue(
    issues,
    /without warranty/i.test(rootSupport)
      && /service-level objective/i.test(rootSupport)
      && /production-support commitment/i.test(rootSupport),
    "ROOT_SUPPORT_BOUNDARY_MISSING",
  );

  for (const id of governance.videos?.withdrawnIds ?? []) {
    issue(issues, !readme.includes(id), `WITHDRAWN_ACTIVE_VIDEO_DENIED:${id}`);
  }
  const observedVideoIds = [...readme.matchAll(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([A-Za-z0-9_-]{11})/g)].map((match) => match[1]);
  const verified = new Set(governance.videos?.activeVerifiedIds ?? []);
  for (const id of observedVideoIds) issue(issues, verified.has(id), `UNVERIFIED_ACTIVE_VIDEO_DENIED:${id}`);

  const security = files.get("docs/SECURITY-ASSURANCE.md") ?? "";
  issue(issues, security.includes(release.tag), "SECURITY_CURRENT_RELEASE_EVIDENCE_MISSING");
  issue(issues, !/v0\.1\.0 remains the only tagged and published release|v0\.2[^\n]*(?:not (?:a )?tagged release|NOT RELEASED)/i.test(security), "SECURITY_STALE_RELEASE_CLAIM_DENIED");
  issue(issues, /local, synthetic|local and synthetic/i.test(security), "SECURITY_SYNTHETIC_BOUNDARY_MISSING");
  issue(issues, /no production security|No production security/i.test(security), "SECURITY_PRODUCTION_NONCLAIM_MISSING");

  const consistencyPaths = [
    "docs/CANON.md",
    "docs/OPERATING-FIELD-GUIDE.md",
    "docs/AGENT-RUNTIME-ISOLATION-CONTRACT.md",
    "docs/SECURITY-ASSURANCE.md",
    "docs/BUILDER-AGENT-OPERATOR-GUIDE.md",
    "docs/BUILDER-CONFIGURATION-DEFAULTS.md",
  ];
  const consistencyDocs = new Map(consistencyPaths.map((path) => [path, read(root, path)]));
  for (const [path, text] of consistencyDocs) {
    issue(
      issues,
      /FULL_CONTROL_LAB/.test(text)
        && /bypass(?:es|ed)?\s+PanSphaira action(?:\s+and\s+|\/)Approval gates/i.test(text)
        && /OS\/host\s+ceiling/i.test(text)
        && /SAFE_GUIDED/.test(text),
      `FULL_CONTROL_LAB_BOUNDARY_MISSING:${path}`,
    );
  }
  for (const path of ["docs/CANON.md", "docs/OPERATING-FIELD-GUIDE.md", "docs/AGENT-RUNTIME-ISOLATION-CONTRACT.md", "docs/SECURITY-ASSURANCE.md"]) {
    issue(issues, /broadest governed\s+(?:Owner\s+)?Profile/i.test(consistencyDocs.get(path)), `GOVERNED_FULL_PROFILE_DISTINCTION_MISSING:${path}`);
  }

  const canon = consistencyDocs.get("docs/CANON.md");
  const canonRuleIds = [...canon.matchAll(/^### (CM-CAN-\d{2}) —/gm)].map((match) => match[1]);
  const expectedCanonRuleIds = Array.from({ length: 28 }, (_, index) => `CM-CAN-${String(index + 1).padStart(2, "0")}`);
  issue(
    issues,
    canonRuleIds.length === expectedCanonRuleIds.length
      && new Set(canonRuleIds).size === expectedCanonRuleIds.length
      && canonRuleIds.every((id, index) => id === expectedCanonRuleIds[index]),
    "CANON_RULE_SET_INVALID:EXPECTED_CM-CAN-01_THROUGH_CM-CAN-28",
  );
  for (const invariant of [
    "Knowledge Record / Knowledge Contract",
    "Governed Template",
    "Applicability / Invalidation",
    "Knowledge and template promotion",
    "Supersession is append-only, traceable, and reversible",
  ]) issue(issues, canon.includes(invariant), `CANON_KNOWLEDGE_INVARIANT_MISSING:${invariant}`);

  const operatingGuide = consistencyDocs.get("docs/OPERATING-FIELD-GUIDE.md");
  issue(issues, /Capability Contract → Governed Template → typed Adapter → Provider Binding/.test(operatingGuide), "ADAPTATION_LIFECYCLE_MISSING");
  issue(issues, /Verification Fabric v2 remains \*\*Shadow\*\*/.test(operatingGuide), "VERIFICATION_SHADOW_BOUNDARY_MISSING");
  issue(issues, /all five closed operations[\s\S]{0,160}`cm\.operator\.read` is\s+reserved for a future separate administrative-read Profile/i.test(operatingGuide), "AZURE_POWER_SCOPE_BOUNDARY_MISSING");

  const systemAdvisor = read(root, "docs/SYSTEM-ADVISOR-GUIDE.md");
  const builderDefaults = consistencyDocs.get("docs/BUILDER-CONFIGURATION-DEFAULTS.md");
  for (const [name, text] of [["System Advisor", systemAdvisor], ["Builder defaults", builderDefaults]]) {
    issue(issues, /Status: \*\*RELEASED, LOCAL-SYNTHETIC CONTRACT SURFACE\*\*/.test(text) && !/LOCALLY VALIDATED, NOT RELEASED/.test(text), `RELEASED_LOCAL_SYNTHETIC_STATUS_MISSING:${name}`);
  }

  const capabilities = read(root, "docs/capabilities.md");
  const capabilityRows = capabilities.split("\n").filter((line) => line.startsWith("|"));
  const capabilityRow = (label) => capabilityRows.find((line) => line.includes(label)) ?? "";
  issue(issues, /BLD-001 local PDCA source/.test(capabilityRow("Builder contracts")) && !/CM-REL-00[678]/.test(capabilityRow("Builder contracts")), "BUILDER_EVIDENCE_MAPPING_INVALID");
  issue(issues, /CM-REL-006/.test(capabilityRow("HMI/Harness multitool")), "CAPABILITY_MAPPING_INVALID:CM-REL-006");
  issue(issues, /CM-REL-007/.test(capabilityRow("Microsoft Entra identity profile")), "CAPABILITY_MAPPING_INVALID:CM-REL-007");
  issue(issues, /CM-REL-008/.test(capabilityRow("Power Platform five-read connector")), "CAPABILITY_MAPPING_INVALID:CM-REL-008");
  issue(issues, /CM-REL-012/.test(capabilityRow("Resource-plane profiles M0")), "CAPABILITY_MAPPING_INVALID:CM-REL-012");
  issue(issues, /CM-REL-013/.test(capabilityRow("ADD → REPLACE adaptability benchmark M0")), "CAPABILITY_MAPPING_INVALID:CM-REL-013");
  issue(issues, /CM-REL-014/.test(capabilityRow("Extension assurance profiles")), "CAPABILITY_MAPPING_INVALID:CM-REL-014");
  issue(issues, /CM-REL-015/.test(capabilityRow("Minimized agent-work event contract")), "CAPABILITY_MAPPING_INVALID:CM-REL-015");
  issue(issues, /CM-REL-005/.test(capabilityRow("Update, migration, and Doctor contracts")), "CAPABILITY_MAPPING_INVALID:CM-REL-005");
  issue(issues, /CM-REL-016/.test(capabilityRow("External Video Service boundary")), "CAPABILITY_MAPPING_INVALID:CM-REL-016");
  issue(issues, /CM-REL-023/.test(capabilityRow("Synthetic CPU video package reference")), "CAPABILITY_MAPPING_INVALID:CM-REL-023");
  issue(issues, /CM-REL-017/.test(capabilityRow("ASF-INTAKE-2 signal release intake")), "CAPABILITY_MAPPING_INVALID:CM-REL-017");
  issue(issues, /CM-REL-018/.test(capabilityRow("INT-PROFILE-001 integration profiles")), "CAPABILITY_MAPPING_INVALID:CM-REL-018");
  issue(issues, /CM-REL-022/.test(capabilityRow("External KaleidoSphere service boundary v2")), "CAPABILITY_MAPPING_INVALID:CM-REL-022");

  const docsHub = read(root, "docs/README.md");
  issue(issues, (approvedReadmeR1 && /\]\(CANON\.md\)/.test(docsHub) && /\]\(ARCHITECTURE\.md\)/.test(docsHub)
    && /do not replace or silently revise the canonical contracts/.test(docsHub)) || /current product category is an open,\s+knowledge-driven operating system/i.test(docsHub)
    && /Agent Sphere → governed Connections and\s+Crossings → Gateway Sphere/.test(docsHub)
    && /Sphere is terminology and\s+visualization only, not a protocol, schema, API or runtime abstraction/.test(docsHub), "DOCS_HUB_PRODUCT_ARCHITECTURE_MISSING");
  issue(issues, /contribution preflight[\s\S]{0,260}no\s+submission, publication, external write/i.test(docsHub), "HMI_PREFLIGHT_HUB_BOUNDARY_MISSING");
  issue(
    issues,
    (approvedReadmeR1 && /\]\(RELEASE-GOVERNANCE\.md\)/.test(docsHub)
      && /source, runnable artifacts and execution evidence must not be conflated/.test(docsHub)) || /source\/evidence-only GitHub Latest/i.test(docsHub)
      && /regular\/runnable artifact/i.test(docsHub)
      && /does not\s+supersede/i.test(docsHub),
    "DOCS_HUB_RELEASE_CLASS_BOUNDARY_MISSING",
  );

  const docsIndex = files.get("docs/index.md") ?? "";
  issue(
    issues,
    /source\/evidence-only/i.test(docsIndex) && /runnable artifact/i.test(docsIndex)
      || (approvedReadmeR1 && /bounded proofs/.test(docsIndex) && /development direction/.test(docsIndex)
        && /\]\(README\.md\)/.test(docsIndex) && /\]\(SECURITY-ASSURANCE\.md\)/.test(docsIndex)),
    "DOCS_INDEX_RELEASE_CLASS_BOUNDARY_MISSING",
  );

  const connectionGuide = read(root, "docs/CONNECT-YOUR-FIRST-SYSTEM.md");
  issue(issues, /RELEASED LOCAL-SYNTHETIC AUTHORING\/VALIDATION CONTRACT/.test(connectionGuide) && /PLANNED LIVE REALIZATION/.test(connectionGuide), "CONNECTION_MATURITY_BOUNDARY_MISSING");
  issue(issues, /five-operation Power\s+Platform read connector bind exactly `cm\.discovery\.read`/.test(connectionGuide) && /`cm\.operator\.read` is reserved for a future separate administrative-read\s+Profile/.test(connectionGuide), "CONNECTION_AZURE_SCOPE_BOUNDARY_MISSING");

  const externalVideo = read(root, "docs/EXTERNAL-VIDEO-SERVICE.md");
  issue(issues, /SHA-256-pinned external artifact|SHA-256-pinned artifact/.test(externalVideo) && /does not claim video publication/.test(externalVideo), "EXTERNAL_VIDEO_BOUNDARY_MISSING");

  const limitations = files.get("docs/KNOWN-LIMITATIONS.md") ?? "";
  issue(issues, limitations.includes(release.tag), "LIMITATIONS_CURRENT_RELEASE_MISSING");
  issue(issues, !/The v0\.1 demo/i.test(limitations), "LIMITATIONS_STALE_V01_BINDING_DENIED");
  issue(issues, /not a production deployment or\s+security certification/i.test(limitations), "LIMITATIONS_CERTIFICATION_NONCLAIM_MISSING");

  const contributing = files.get("CONTRIBUTING.md") ?? "";
  issue(issues, /functional product increment/i.test(contributing) && /anonymous public\s+readback/i.test(contributing), "CONTRIBUTING_RELEASE_RULE_MISSING");
  issue(issues, /editorial Daily/i.test(contributing) && /does not gate/i.test(contributing), "EDITORIAL_RELEASE_SEPARATION_MISSING");
  issue(
    issues,
    /bounded contradiction preflight/i.test(contributing)
      && /material claim ID/i.test(contributing)
      && /maturity and proof class/i.test(contributing)
      && /authoritative artifact/i.test(contributing)
      && /exact identity/i.test(contributing)
      && /executable or anonymous-readback gate/i.test(contributing)
      && /explicit nonclaim/i.test(contributing)
      && /proof-class inflation/i.test(contributing)
      && /circular or caller-minted provenance/i.test(contributing),
    "CONTRIBUTING_CONTRADICTION_PREFLIGHT_MISSING",
  );
  const releaseDocs = files.get("docs/RELEASE-GOVERNANCE.md") ?? "";
  for (const heading of ["Release taxonomy and current public truth", "Product increments, not calendar identity", "Release-state policy", "Exact release-body contract", "Required publication evidence", "Publication workflow gate", "Bounded contradiction preflight", "Public README and documentation presentation", "Claim/evidence boundary", "Active videos and historical evidence"]) {
    issue(issues, releaseDocs.includes(`## ${heading}`), `GOVERNANCE_SECTION_MISSING:${heading}`);
  }
  issue(
    issues,
    releaseDocs.includes(publicLatest.tag) && releaseDocs.includes(publicLatest.targetCommitish)
      && releaseDocs.includes(release.tag) && releaseDocs.includes("NO_ASSETS_SOURCE_ONLY")
      && /not GitHub Latest/i.test(releaseDocs) && /legacy pre-v2/i.test(releaseDocs),
    "GOVERNANCE_PUBLIC_IDENTITY_RECONCILIATION_MISSING",
  );
  issue(
    issues,
    quickstart.includes(release.tag) && /not Latest/i.test(quickstart)
      && /source-only evidence release/i.test(quickstart) && /GitHub-generated source archives are not substitutes/i.test(quickstart),
    "QUICKSTART_RELEASE_CLASS_BOUNDARY_MISSING",
  );
  issue(
    issues,
    approvedReadmeR1 || /source\/evidence-only/i.test(releaseSection)
      && /runnable artifact/i.test(releaseSection)
      && /does not supersede/i.test(releaseSection),
    "README_RELEASE_CLASS_BOUNDARY_MISSING",
  );

  let publicationWorkflow = "";
  try { publicationWorkflow = read(root, ".github/workflows/release-public-readback.yml"); } catch { issues.push("PUBLICATION_READBACK_WORKFLOW_MISSING"); }
  issue(
    issues,
    /^\s*release:\s*$/m.test(publicationWorkflow)
      && /^\s*types:\s*\[published\]\s*$/m.test(publicationWorkflow)
      && /^permissions:\s*\n\s+contents: read$/m.test(publicationWorkflow)
      && /persist-credentials: false/.test(publicationWorkflow)
      && /github\.event\.release\.tag_name/.test(publicationWorkflow)
      && /env -u GH_TOKEN -u GITHUB_TOKEN npm run release-governance:test/.test(publicationWorkflow)
      && /env -u GH_TOKEN -u GITHUB_TOKEN npm run release-governance:public-readback -- --release-tag "\$RELEASE_TAG" --require-conforming/.test(publicationWorkflow)
      && publicationWorkflow.indexOf("release-governance:test") < publicationWorkflow.indexOf("release-governance:public-readback")
      && !/contents: write|issues: write|pull-requests: write|gh issue close|queue[^\n]*done/i.test(publicationWorkflow),
    "PUBLICATION_READBACK_WORKFLOW_INVALID",
  );

  const publicManifest = read(root, "release/public-files.manifest");
  const publicPaths = new Set(publicManifest.trim().split("\n").map((line) => line.split("\t")[0]));
  issue(issues, Array.isArray(governance.claimEvidence) && governance.claimEvidence.length > 0, "CLAIM_EVIDENCE_MAPPING_MISSING");
  const claimIds = (governance.claimEvidence ?? []).map(({ claimId }) => claimId);
  issue(issues, new Set(claimIds).size === claimIds.length && claimIds.includes("CM-REL-024"), "CLAIM_EVIDENCE_IDENTITY_INVALID");
  const expectedComponents = new Set(["Verification Fabric", "Update/Doctor", "HMI/Harness Multitool", "Azure/Entra Identity Contract", "Power Platform Read Connector", "Resource-Plane Profiles M0", "ADD to REPLACE Adaptability Benchmark M0", "Extension Assurance Profiles", "Minimized Agent-Work Event Contract", "AWI-03 Universal Knowledge Envelope", "External Video Service", "Synthetic CPU Video Package Reference", "External SBA-v2 BI Client", "ASF-INTAKE-2 Signal Release Intake", "INT-PROFILE-001 Integration Profiles", "VOICE-M0 Local PTT"]);
  const observedComponents = new Set();
  for (const mapping of governance.claimEvidence ?? []) {
    issue(issues, /^CM-REL-\d{3}$/.test(mapping.claimId ?? ""), `CLAIM_ID_INVALID:${mapping.claimId ?? "missing"}`);
    issue(issues, Array.isArray(mapping.nonClaims) && mapping.nonClaims.length > 0, `NON_CLAIMS_MISSING:${mapping.claimId}`);
    for (const path of mapping.evidencePaths ?? []) {
      try { readFileSync(resolve(root, path)); } catch { issues.push(`CLAIM_EVIDENCE_MISSING:${mapping.claimId}:${path}`); }
    }
    if (mapping.component) {
      observedComponents.add(mapping.component);
      issue(issues, expectedComponents.has(mapping.component), `RELEASE_COMPONENT_UNKNOWN:${mapping.component}`);
      issue(issues, typeof mapping.claim === "string" && typeof mapping.userValue === "string", `COMPONENT_CLAIM_VALUE_MISSING:${mapping.claimId}`);
      issue(issues, Array.isArray(mapping.includedBytes) && mapping.includedBytes.length > 0, `COMPONENT_BYTES_MISSING:${mapping.claimId}`);
      issue(issues, Array.isArray(mapping.functionalProof?.testPaths) && mapping.functionalProof.testPaths.length > 0 && typeof mapping.functionalProof.result === "string", `COMPONENT_FUNCTIONAL_PROOF_MISSING:${mapping.claimId}`);
      issue(issues, Array.isArray(mapping.safetyProof?.testPaths) && mapping.safetyProof.testPaths.length > 0 && typeof mapping.safetyProof.result === "string", `COMPONENT_SAFETY_PROOF_MISSING:${mapping.claimId}`);
      issue(issues, Array.isArray(mapping.traceability?.pdcaPaths) && mapping.traceability.pdcaPaths.length > 0 && mapping.traceability.publicManifest === "release/public-files.manifest" && mapping.traceability.releaseCommitBinding === "currentRelease.tagObjectSha" && mapping.traceability.assetChecksumBinding === "currentRelease.assets[].sha256", `COMPONENT_TRACEABILITY_MISSING:${mapping.claimId}`);
      const publicComponentPaths = [...(mapping.includedBytes ?? []), ...(mapping.functionalProof?.testPaths ?? []), ...(mapping.safetyProof?.testPaths ?? [])];
      for (const path of publicComponentPaths) {
        try { readFileSync(resolve(root, path)); } catch { issues.push(`COMPONENT_PATH_MISSING:${mapping.claimId}:${path}`); }
        issue(issues, publicPaths.has(path), `COMPONENT_PATH_UNMANIFESTED:${mapping.claimId}:${path}`);
      }
      for (const path of mapping.traceability?.pdcaPaths ?? []) {
        try { readFileSync(resolve(root, path)); } catch { issues.push(`COMPONENT_PDCA_PATH_MISSING:${mapping.claimId}:${path}`); }
      }
    }
  }
  for (const component of expectedComponents) issue(issues, observedComponents.has(component), `RELEASE_COMPONENT_EVIDENCE_MISSING:${component}`);
  issue(issues, observedComponents.size === expectedComponents.size, "RELEASE_COMPONENT_EVIDENCE_COUNT_INVALID");

  const assets = release.assets ?? [];
  issue(issues, assets.length > 0 && assets.every((asset) => typeof asset.name === "string" && Number.isInteger(asset.size) && /^[a-f0-9]{64}$/.test(asset.sha256)), "ASSET_INVENTORY_INVALID");
  issue(issues, assets.some((asset) => asset.name === release.assetManifest?.name), "ASSET_MANIFEST_MISSING");
  issue(issues, assets.some((asset) => asset.name === release.assetManifest?.declares), "ASSET_MANIFEST_TARGET_MISSING");

  for (const required of ["README.md", "SECURITY.md", "SUPPORT.md", "CONTRIBUTING.md", "docs/SECURITY-ASSURANCE.md", "docs/KNOWN-LIMITATIONS.md", "docs/RELEASE-GOVERNANCE.md", "release/governance.json"]) {
    issue(issues, publicManifest.split("\n").some((line) => line.startsWith(`${required}\t${required}\t`)), `PUBLIC_MANIFEST_MISSING:${required}`);
  }
  for (const [path, text] of files) issues.push(...scanUnsafe(text, path));

  const generator = read(root, "scripts/daily-poc.mjs");
  issue(issues, !/const releaseTitle\s*=\s*`[^`]*(?:POC Daily|Today's Daily)/i.test(generator), "GENERATOR_CALENDAR_RELEASE_TITLE_DENIED");
  issue(issues, generator.includes("Increment Candidate"), "GENERATOR_FUNCTIONAL_INCREMENT_RULE_MISSING");
  return [...new Set(issues)].sort();
}

async function getJson(url, fetchImpl) {
  const response = await fetchImpl(url, { headers: { Accept: "application/vnd.github+json", "User-Agent": "pansphaira-release-governance" } });
  assert.equal(response.ok, true, `PUBLIC_READBACK_HTTP_${response.status}:${url}`);
  return response.json();
}

function anonymousFetch(url, options = {}, redirectCount = 0) {
  return new Promise((resolveRequest, reject) => {
    const parsed = new URL(url);
    const allowedHost = parsed.hostname === "api.github.com"
      || parsed.hostname === "github.com"
      || parsed.hostname === "raw.githubusercontent.com"
      || parsed.hostname.endsWith(".githubusercontent.com");
    if (parsed.protocol !== "https:" || !allowedHost) {
      reject(new Error(`PUBLIC_READBACK_HOST_DENIED:${parsed.hostname}`));
      return;
    }
    const req = request(parsed, {
      method: "GET",
      headers: options.headers ?? {},
    }, (response) => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location;
      if (location && [301, 302, 303, 307, 308].includes(status)) {
        response.resume();
        if (redirectCount >= 5) {
          reject(new Error("PUBLIC_READBACK_REDIRECT_LIMIT"));
          return;
        }
        anonymousFetch(new URL(location, parsed).href, options, redirectCount + 1).then(resolveRequest, reject);
        return;
      }
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > 128 * 1024 * 1024) req.destroy(new Error("PUBLIC_READBACK_RESPONSE_TOO_LARGE"));
        else chunks.push(chunk);
      });
      response.on("end", () => {
        const bytes = Buffer.concat(chunks);
        resolveRequest({
          ok: status >= 200 && status < 300,
          status,
          async arrayBuffer() { return bytes; },
          async json() { return JSON.parse(bytes.toString("utf8")); },
          async text() { return bytes.toString("utf8"); },
        });
      });
    });
    req.setTimeout(30_000, () => req.destroy(new Error("PUBLIC_READBACK_TIMEOUT")));
    req.on("error", reject);
    req.end();
  });
}

async function downloadReleaseAssets(release, fetchImpl) {
  const downloaded = new Map();
  for (const asset of release?.assets ?? []) {
    const response = await fetchImpl(asset.browser_download_url, {
      headers: { "User-Agent": "pansphaira-release-governance" },
      redirect: "follow",
    });
    assert.equal(response.ok, true, `PUBLIC_ASSET_HTTP_${response.status}:${asset.name}`);
    downloaded.set(asset.name, Buffer.from(await response.arrayBuffer()));
  }
  return downloaded;
}

async function verifyPublishedSurfaces(root, governance, commitSha, fetchImpl) {
  for (const path of [
    "README.md",
    "CONTRIBUTING.md",
    "docs/QUICKSTART.md",
    "docs/RELEASE-GOVERNANCE.md",
    "release/governance.json",
  ]) {
    const response = await fetchImpl(`https://raw.githubusercontent.com/${governance.repository}/${commitSha}/${path}`, {
      headers: { "User-Agent": "pansphaira-release-governance" },
    });
    assert.equal(response.ok, true, `PUBLIC_SURFACE_HTTP_${response.status}:${path}`);
    assert.equal(await response.text(), read(root, path), `PUBLIC_SURFACE_MISMATCH:${path}`);
  }
}

export async function verifyPublicReadback(root = process.cwd(), options = {}) {
  const localIssues = validateRepository(root);
  assert.deepEqual(localIssues, [], localIssues.join("\n"));
  const governance = JSON.parse(read(root, "release/governance.json"));
  const fetchImpl = options.fetchImpl ?? anonymousFetch;
  assert.equal(typeof fetchImpl, "function", "PUBLIC_READBACK_FETCH_UNAVAILABLE");
  const api = `https://api.github.com/repos/${governance.repository}`;

  if (options.requireConforming === true) {
    assert.match(options.releaseTag ?? "", /^[A-Za-z0-9._-]+$/, "PUBLIC_RELEASE_TAG_ARGUMENT_INVALID");
    const [release, latest, tagRef] = await Promise.all([
      getJson(`${api}/releases/tags/${options.releaseTag}`, fetchImpl),
      getJson(`${api}/releases/latest`, fetchImpl),
      getJson(`${api}/git/ref/tags/${options.releaseTag}`, fetchImpl),
    ]);
    assert.ok(release?.tag_name === options.releaseTag && tagRef?.ref === `refs/tags/${options.releaseTag}`,
      "PUBLIC_REQUESTED_TAG_RESPONSE_MISMATCH");
    const downloadedAssets = await downloadReleaseAssets(release, fetchImpl);
    const releaseClass = oneSection(markdownSections(release.body ?? ""), "Release class").replace("RELEASE_CLASS: ", "");
    let latestTagRef, latestByTag;
    if (releaseClass === "REGULAR_RUNNABLE_ARTIFACT" && governance.releaseTaxonomy.githubLatestOwnerClass === "SOURCE_EVIDENCE_ONLY") {
      assert.match(latest?.tag_name ?? "", /^[A-Za-z0-9._-]+$/, "PUBLIC_LATEST_TAG_INVALID");
      [latestTagRef, latestByTag] = await Promise.all([
        getJson(`${api}/git/ref/tags/${latest.tag_name}`, fetchImpl),
        getJson(`${api}/releases/tags/${latest.tag_name}`, fetchImpl),
      ]);
    }
    const localHead = options.readLocalHead === undefined
      ? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim()
      : options.readLocalHead();
    assert.equal(localHead, tagRef.object.sha, "PUBLIC_CHECKOUT_HEAD_MISMATCH");
    const contractIssues = validateReleaseContract({
      root,
      governance,
      release,
      latest,
      tagRef,
      latestTagRef,
      latestByTag,
      downloadedAssets,
    });
    assert.deepEqual(contractIssues, [], contractIssues.join("\n"));
    await verifyPublishedSurfaces(root, governance, tagRef.object.sha, fetchImpl);
    return {
      tag: release.tag_name,
      releaseClass: oneSection(markdownSections(release.body ?? ""), "Release class").replace("RELEASE_CLASS: ", ""),
      targetCommitish: release.target_commitish,
      latest: latest.tag_name === release.tag_name,
      draft: false,
      prerelease: false,
      assets: release.assets.map(({ name, size }) => ({ name, size })),
      anonymous: true,
      terminalizationEligible: true,
    };
  }

  assert.equal(options.releaseTag, undefined, "PUBLIC_RELEASE_TAG_REQUIRES_CONFORMING_MODE");
  const expectedLatest = governance.publicLatestRelease;
  const expectedRunnable = governance.currentRelease;
  const [latestRelease, latest, latestTagRef, runnableRelease, runnableTagRef] = await Promise.all([
    getJson(`${api}/releases/tags/${expectedLatest.tag}`, fetchImpl),
    getJson(`${api}/releases/latest`, fetchImpl),
    getJson(`${api}/git/ref/tags/${expectedLatest.tag}`, fetchImpl),
    getJson(`${api}/releases/tags/${expectedRunnable.tag}`, fetchImpl),
    getJson(`${api}/git/ref/tags/${expectedRunnable.tag}`, fetchImpl),
  ]);
  const downloadedRunnableAssets = await downloadReleaseAssets(runnableRelease, fetchImpl);
  const stateIssues = validateRecordedPublicState({
    governance,
    latestRelease,
    latest,
    latestTagRef,
    runnableRelease,
    runnableTagRef,
    downloadedRunnableAssets,
  });
  assert.deepEqual(stateIssues, [], stateIssues.join("\n"));
  return {
    githubLatest: {
      tag: expectedLatest.tag,
      releaseClass: expectedLatest.releaseClass,
      targetCommitish: expectedLatest.targetCommitish,
      contractStatus: expectedLatest.contractStatus,
      assets: [],
    },
    runnableArtifact: {
      tag: expectedRunnable.tag,
      releaseClass: expectedRunnable.releaseClass,
      latest: false,
      historical: true,
      assets: expectedRunnable.assets.map(({ name, size, sha256: digest }) => ({ name, size, sha256: digest })),
    },
    anonymous: true,
  };
}

async function main() {
  const publicReadback = process.argv.includes("--public-readback");
  if ((process.env.GH_TOKEN || process.env.GITHUB_TOKEN) && publicReadback) {
    throw new Error("PUBLIC_READBACK_REQUIRES_GH_TOKEN_AND_GITHUB_TOKEN_UNSET");
  }
  const releaseTagIndex = process.argv.indexOf("--release-tag");
  const releaseTag = releaseTagIndex < 0 ? undefined : process.argv[releaseTagIndex + 1];
  const requireConforming = process.argv.includes("--require-conforming");
  if (requireConforming && releaseTag === undefined) throw new Error("CONFORMING_READBACK_REQUIRES_RELEASE_TAG");
  if (publicReadback) {
    console.log(JSON.stringify(await verifyPublicReadback(process.cwd(), { releaseTag, requireConforming }), null, 2));
  }
  else {
    const issues = validateRepository(process.cwd());
    if (issues.length) { console.error(issues.join("\n")); process.exitCode = 2; }
    else console.log("RELEASE_GOVERNANCE_PASS");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 2; });
}
