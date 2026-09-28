import { createHash } from "node:crypto";

import { canonicalJson } from "../../packages/contracts/src/canonical-json.js";
import {
  KALEIDOSPHERE_CANDIDATE_QUARANTINE_SCHEMA_V1,
  NATIVE_CANDIDATE_SCHEMA_V1,
  RECONCILED_RELEASED_HEADS_V1,
  adjudicateNativeCandidateV1,
  adjudicateNativeForwardCandidateV1,
  adjudicateNativeForwardPrCandidateV1,
  adjudicateNativeCurrentCandidateV1,
  adjudicateNativeFrozenCurrentCandidateV1,
  CURRENT_KS_PROFILES_V1,
  buildAuthoritativeAdjudicationInputs,
  createNativeAdjudicationContextV1,
  nativeCandidateDigestV1,
  nativeProjectionDigestV1,
  nativeTransportBytesV1,
} from "../cks-12/kaleidosphere-candidate-quarantine.js";
import type { CurrentKsProfileNameV1 } from "../cks-12/kaleidosphere-candidate-quarantine.js";

/**
 * PAR-PS-01 (#345) — Producer Analytics Manifest.
 *
 * Derives, from the delivered XRA-PS-02 (#344) slice, a deterministic manifest
 * describing ONLY the concepts, fields, evidence, coverage, and semantics the
 * delivered slice actually emits. The manifest is never authored as prose:
 * every documented surface is re-walked from the observed runtime capture bytes
 * and every digest is independently re-derived through the PAN adjudicator.
 *
 * AC01: the field surface and the re-derived projection digests are compared to
 *       the runtime-recorded digests (generated-vs-runtime projection
 *       comparison); a documented but unobserved field or capability is denied.
 * AC02: producer head/profile digests are bound and missing/optional/new state
 *       is carried as EXPLICIT typed gaps, never collapsed to absent/zero;
 *       unknown fields fail closed.
 * AC03: regeneration on the same head is byte-identical (canonical JSON, no
 *       wall-clock, random, host, or caller-derived bytes in the output).
 *
 * Required product nonclaims: no future-roadmap capability, no consumer-support
 * claim, no historical-retention semantics.
 */

export const PRODUCER_ANALYTICS_MANIFEST_SCHEMA_V1 = "pansphaira.par-ps-01/producer-analytics-manifest/v1" as const;
export const PRODUCER_ANALYTICS_MANIFEST_ID_V1 = "pansphaira:par-ps-01-producer-analytics-manifest-001" as const;
export const PRODUCER_ANALYTICS_MANIFEST_CONTEXT_ID_V1 = "pansphaira:par-ps-01-producer-manifest-context-001" as const;
export const PRODUCER_ANALYTICS_MANIFEST_ISSUE_V1 = "PANSPHAIRA#345" as const;

export const PRODUCER_ANALYTICS_PRODUCT_NONCLAIMS_V1: readonly string[] = Object.freeze([
  "NO_FUTURE_ROADMAP_CAPABILITY",
  "NO_CONSUMER_SUPPORT_CLAIM",
  "NO_HISTORICAL_RETENTION_SEMANTICS",
]);

/** Closed gap-state vocabulary: an explicit gap is never collapsed to absent/zero. */
export const PRODUCER_ANALYTICS_GAP_STATES_V1: readonly string[] = Object.freeze([
  "MISSING",
  "OPTIONAL",
  "NEW",
  "HELD",
  "NOT_PROVEN",
]);

export type ProducerAnalyticsManifestInputV1 = Readonly<{
  rawArtifact: Readonly<{ path: string; bytes: Uint8Array }>;
  nativeServiceCapture: Readonly<{ path: string; bytes: Uint8Array }>;
  sliceReceipt: Readonly<{ path: string; bytes: Uint8Array }>;
  adjudicatorSource: Readonly<{ path: string; bytes: Uint8Array }>;
}>;

export type ProducerAnalyticsManifestErrorCodeV1 =
  | "SOURCE_MISSING"
  | "SOURCE_IDENTITY_MISMATCH"
  | "RUNTIME_PROJECTION_MISMATCH"
  | "ADJUDICATION_DENIED"
  | "UNOBSERVED_FIELD";

export class ProducerAnalyticsManifestError extends Error {
  readonly code: ProducerAnalyticsManifestErrorCodeV1;
  constructor(code: ProducerAnalyticsManifestErrorCodeV1, message: string) {
    super(`${code}: ${message}`);
    this.name = "ProducerAnalyticsManifestError";
    this.code = code;
  }
}

const sha256Hex = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const digest = (value: unknown): string => sha256Hex(Buffer.from(canonicalJson(value), "utf8"));

function plainJson(bytes: Uint8Array, label: string): any {
  if (bytes.byteLength === 0) throw new ProducerAnalyticsManifestError("SOURCE_MISSING", `${label} is empty`);
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    throw new ProducerAnalyticsManifestError("SOURCE_MISSING", `${label} is not valid JSON`);
  }
}

/** Fail-closed dotted-field reader: a missing or non-object path is SOURCE_MISSING. */
function field(obj: any, path: string, label: string): any {
  let value = obj;
  for (const segment of path.split(".")) {
    if (value === null || typeof value !== "object") {
      throw new ProducerAnalyticsManifestError("SOURCE_MISSING", `${label} has no "${path}"`);
    }
    const next = (value as Record<string, unknown>)[segment];
    if (next === undefined) {
      throw new ProducerAnalyticsManifestError("SOURCE_MISSING", `${label} is missing "${path}"`);
    }
    value = next;
  }
  return value;
}

type FieldSurfaceKind = "object" | "array" | "string" | "number" | "boolean" | "null";
export type FieldSurfaceEntryV1 = Readonly<{ path: string; kind: FieldSurfaceKind; digest: string }>;

function kindOf(value: unknown): FieldSurfaceKind {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "object") return "object";
  return "null";
}

/** Deterministic leaf+internal walk of one JSON value; sorted by path. */
function fieldSurface(rootValue: unknown, rootPath: string): FieldSurfaceEntryV1[] {
  const entries: FieldSurfaceEntryV1[] = [];
  const walk = (value: unknown, path: string): void => {
    entries.push({ path, kind: kindOf(value), digest: digest(value) });
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
    } else if (value !== null && typeof value === "object") {
      for (const key of Object.keys(value as Record<string, unknown>).sort()) {
        walk((value as Record<string, unknown>)[key], path === "" ? key : `${path}.${key}`);
      }
    }
  };
  walk(rootValue, rootPath);
  return entries.sort((left, right) => left.path.localeCompare(right.path, "en"));
}

function requireDigestString(value: any, path: string, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new ProducerAnalyticsManifestError("SOURCE_MISSING", `${label} "${path}" is not a sha256 hex string`);
  }
  return value;
}

function requireString(value: any, path: string, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProducerAnalyticsManifestError("SOURCE_MISSING", `${label} "${path}" is not a nonempty string`);
  }
  return value;
}

function requireArray(value: any, path: string, label: string): any[] {
  if (!Array.isArray(value)) {
    throw new ProducerAnalyticsManifestError("SOURCE_MISSING", `${label} "${path}" is not an array`);
  }
  return value;
}

export type GapStateV1 = (typeof PRODUCER_ANALYTICS_GAP_STATES_V1)[number];
export type GapRecordV1 = Readonly<{
  id: string;
  field: string;
  state: GapStateV1;
  observed: Record<string, unknown>;
  note: string;
}>;

function assertGapState(state: unknown): asserts state is GapStateV1 {
  if (typeof state !== "string" || !(PRODUCER_ANALYTICS_GAP_STATES_V1 as readonly string[]).includes(state)) {
    throw new ProducerAnalyticsManifestError("UNOBSERVED_FIELD", `gap state "${String(state)}" is not in the closed vocabulary`);
  }
}

/** Historical evidence bytes only; this does not attest current-source execution. */
export function historicalProducerAdjudicatorSourceV1(archiveBytes: Uint8Array): { path: string; bytes: Uint8Array } {
  const archive = JSON.parse(Buffer.from(archiveBytes).toString("utf8"));
  const expected = "3712c9fc41b7704aabfa04db1b0e76398e44d3b520694a7aac475c12e02a4d5b";
  if (archive?.schemaVersion !== "pansphaira/historical-source-archive/v1" ||
      archive.sourceCommit !== "28b993b721a61ca98fc66a0c9e3dd40b86b9cb30" ||
      archive.sourcePath !== "src/cks-12/kaleidosphere-candidate-quarantine.ts" ||
      typeof archive.sourceUtf8 !== "string" || archive.sha256 !== expected ||
      sha256Hex(Buffer.from(archive.sourceUtf8, "utf8")) !== expected) {
    throw new Error("HISTORICAL_SOURCE_DENIED");
  }
  return { path: archive.sourcePath, bytes: Uint8Array.from(Buffer.from(archive.sourceUtf8, "utf8")) };
}

export function generateProducerAnalyticsManifestV1(
  input: ProducerAnalyticsManifestInputV1,
): Readonly<{ manifest: Record<string, unknown>; serialized: string }> {
  const capture = plainJson(input.nativeServiceCapture.bytes, "nativeServiceCapture");
  const receipt = plainJson(input.sliceReceipt.bytes, "sliceReceipt");
  const projection = plainJson(input.rawArtifact.bytes, "rawArtifact");
  const candidate = field(capture, "response.candidate", "nativeServiceCapture");
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new ProducerAnalyticsManifestError("SOURCE_MISSING", "nativeServiceCapture response.candidate is not an object");
  }

  // ---- Fail-closed identity binding (substitution / missing source) ----
  const receiptFixture = ((): any => {
    const fixtures = requireArray(field(receipt, "nativeScope.evidenceFixtures", "sliceReceipt"), "nativeScope.evidenceFixtures", "sliceReceipt");
    const match = fixtures.find((fixture) => fixture && fixture.path === input.nativeServiceCapture.path);
    if (match === undefined) throw new ProducerAnalyticsManifestError("SOURCE_IDENTITY_MISMATCH", "capture path is not attested by the slice receipt");
    return match;
  })();
  const captureSha256 = sha256Hex(input.nativeServiceCapture.bytes);
  if (requireDigestString(receiptFixture.sha256, "nativeScope.evidenceFixtures[].sha256", "sliceReceipt") !== captureSha256) {
    throw new ProducerAnalyticsManifestError("SOURCE_IDENTITY_MISMATCH", "capture bytes do not match the receipt-attested sha256");
  }
  const rawArtifactSha256 = sha256Hex(input.rawArtifact.bytes);
  if (requireDigestString(field(capture, "input.rawArtifactSha256", "nativeServiceCapture"), "input.rawArtifactSha256", "nativeServiceCapture") !== rawArtifactSha256) {
    throw new ProducerAnalyticsManifestError("SOURCE_IDENTITY_MISMATCH", "raw artifact bytes do not match the capture-attested sha256");
  }
  const adjudicatorSha256 = sha256Hex(input.adjudicatorSource.bytes);
  if (requireDigestString(field(receipt, "implementationSha256", "sliceReceipt"), "implementationSha256", "sliceReceipt") !== adjudicatorSha256) {
    throw new ProducerAnalyticsManifestError("SOURCE_IDENTITY_MISMATCH", "adjudicator source bytes do not match the receipt-attested sha256");
  }

  // ---- Generated-vs-runtime projection re-derivation (AC01) ----
  const rawBytes = input.rawArtifact.bytes;
  const rederived = nativeProjectionDigestV1(rawBytes);
  const canonicalTransportSha256 = rederived.canonicalTransportSha256;
  const projectionBodyDigest = rederived.projectionBodyDigest;
  const candidateDigest = nativeCandidateDigestV1(candidate);
  const context = createNativeAdjudicationContextV1({ contextId: PRODUCER_ANALYTICS_MANIFEST_CONTEXT_ID_V1 });
  const adjudication = adjudicateNativeCandidateV1({
    canonicalTransportBytes: nativeTransportBytesV1(rawBytes),
    candidate,
    context,
    rawArtifactBytes: rawBytes,
    releasedHeads: RECONCILED_RELEASED_HEADS_V1,
  });
  if (adjudication.outcome !== "ACCEPTED_BOUNDED") {
    throw new ProducerAnalyticsManifestError("ADJUDICATION_DENIED", `captured candidate adjudicates ${adjudication.outcome}, not ACCEPTED_BOUNDED`);
  }

  // Cross-check re-derived digests against the runtime-recorded digests.
  const runtimeChecks: Array<[string, string, string]> = [
    [requireString(field(capture, "input.rawArtifactSha256", "nativeServiceCapture"), "input.rawArtifactSha256", "nativeServiceCapture"), rederived.rawArtifactSha256, "rawArtifactSha256"],
    [requireString(field(capture, "input.canonicalTransportSha256", "nativeServiceCapture"), "input.canonicalTransportSha256", "nativeServiceCapture"), canonicalTransportSha256, "input.canonicalTransportSha256"],
    [requireString(field(candidate, "bindings.canonicalTransportSha256", "candidate"), "candidate.bindings.canonicalTransportSha256", "candidate"), canonicalTransportSha256, "candidate.bindings.canonicalTransportSha256"],
    [requireString(field(candidate, "bindings.projectionBodyDigest", "candidate"), "candidate.bindings.projectionBodyDigest", "candidate"), projectionBodyDigest, "candidate.bindings.projectionBodyDigest"],
    [requireString(field(receipt, "authoritativeInputs.projectionDigest", "sliceReceipt"), "authoritativeInputs.projectionDigest", "sliceReceipt"), projectionBodyDigest, "authoritativeInputs.projectionDigest"],
    [requireString(field(receipt, "authoritativeInputs.sourceContractSha256", "sliceReceipt"), "authoritativeInputs.sourceContractSha256", "sliceReceipt"), requireString(field(projection, "source.contractSha256", "rawArtifact"), "source.contractSha256", "rawArtifact"), "sourceContractSha256"],
    [requireString(field(receipt, "authoritativeInputs.canonicalKnowledgeSha256", "sliceReceipt"), "authoritativeInputs.canonicalKnowledgeSha256", "sliceReceipt"), buildAuthoritativeAdjudicationInputs().canonicalKnowledgeSha256, "canonicalKnowledgeSha256"],
    [requireString(field(capture, "response.candidate.resultSha256", "nativeServiceCapture"), "response.candidate.resultSha256", "nativeServiceCapture"), requireString(field(candidate, "resultSha256", "candidate"), "candidate.resultSha256", "candidate"), "candidate.resultSha256"],
  ];
  for (const [left, right, name] of runtimeChecks) {
    if (left !== right) {
      throw new ProducerAnalyticsManifestError("RUNTIME_PROJECTION_MISMATCH", `generated and runtime disagree on ${name}`);
    }
  }

  // ---- Producer head/profile binding (AC02) ----
  const reconciled = {
    pansphaira: RECONCILED_RELEASED_HEADS_V1.pansphaira,
    kaleidoSphere: RECONCILED_RELEASED_HEADS_V1.kaleidoSphere,
  };
  const producer = {
    serviceHead: {
      commitOid: requireString(field(capture, "service.head.commitOid", "nativeServiceCapture"), "service.head.commitOid", "nativeServiceCapture"),
      treeOid: requireString(field(capture, "service.head.treeOid", "nativeServiceCapture"), "service.head.treeOid", "nativeServiceCapture"),
    },
    reconciledReleasedHeads: reconciled,
    consumerReleasedHead: {
      status: requireString(field(candidate, "bindings.pansphairaHead.status", "candidate"), "bindings.pansphairaHead.status", "candidate"),
      commitOid: requireString(field(candidate, "bindings.pansphairaHead.commitOid", "candidate"), "bindings.pansphairaHead.commitOid", "candidate"),
      releaseTag: requireString(field(candidate, "bindings.pansphairaHead.releaseTag", "candidate"), "bindings.pansphairaHead.releaseTag", "candidate"),
      releaseCommit: requireString(field(candidate, "bindings.pansphairaHead.releaseCommit", "candidate"), "bindings.pansphairaHead.releaseCommit", "candidate"),
      releaseReceiptSha256: requireDigestString(field(candidate, "bindings.pansphairaHead.releaseReceiptSha256", "candidate"), "bindings.pansphairaHead.releaseReceiptSha256", "candidate"),
    },
    profile: {
      analysisContractSha256: requireDigestString(field(candidate, "analysis.contractSha256", "candidate"), "analysis.contractSha256", "candidate"),
      nativeProjectionContractSha256: requireDigestString(field(candidate, "bindings.nativeProjectionContractSha256", "candidate"), "bindings.nativeProjectionContractSha256", "candidate"),
      sourceContractSha256: requireDigestString(field(projection, "source.contractSha256", "rawArtifact"), "source.contractSha256", "rawArtifact"),
      projectionBodyDigest,
      releaseSidecarSha256: requireDigestString(field(candidate, "bindings.releaseSidecarSha256", "candidate"), "bindings.releaseSidecarSha256", "candidate"),
      environmentSha256: requireDigestString(field(candidate, "bindings.environmentSha256", "candidate"), "bindings.environmentSha256", "candidate"),
      canonicalKnowledgeSha256: buildAuthoritativeAdjudicationInputs().canonicalKnowledgeSha256,
    },
  };

  // ---- Observed field surface (AC01): only what the slice actually emitted ----
  const surface = fieldSurface(candidate, "candidate");
  const fieldSurfaceDigest = digest(surface);

  // ---- Explicit gaps (AC02): missing/optional/new state, derived from observed ----
  const gaps: GapRecordV1[] = [];
  const releaseRegistry = field(capture, "service.releaseRegistry", "nativeServiceCapture");
  if (releaseRegistry && releaseRegistry.status === "HELD" && releaseRegistry.releasedEntryCount === 0) {
    const state: unknown = "HELD";
    assertGapState(state);
    gaps.push({
      id: "RELEASE_REGISTRY_HELD",
      field: "service.releaseRegistry",
      state,
      observed: {
        status: releaseRegistry.status,
        entryCount: releaseRegistry.entryCount,
        releasedEntryCount: releaseRegistry.releasedEntryCount,
        nativeReleaseRegistryStatus: requireString(field(capture, "service.nativeReleaseRegistry.status", "nativeServiceCapture"), "service.nativeReleaseRegistry.status", "nativeServiceCapture"),
      },
      note: "The KaleidoSphere general release registry is HELD with zero released entries; only the native release registry is RELEASED in the delivered slice.",
    });
  }
  const ac03 = field(receipt, "acceptance.XRA-PS-02-AC03", "sliceReceipt");
  if (ac03 && ac03.status === "NOT_PROVEN") {
    const state: unknown = "NOT_PROVEN";
    assertGapState(state);
    gaps.push({
      id: "PUBLIC_CHAIN_NOT_PROVEN",
      field: "acceptance.XRA-PS-02-AC03",
      state,
      observed: {
        status: ac03.status,
        chainStages: requireArray(ac03.chainStages, "acceptance.XRA-PS-02-AC03.chainStages", "sliceReceipt"),
      },
      note: requireString(ac03.nonclaim, "acceptance.XRA-PS-02-AC03.nonclaim", "sliceReceipt"),
    });
  }
  gaps.sort((left, right) => left.id.localeCompare(right.id, "en"));

  const manifestBody: Record<string, unknown> = {
    schemaVersion: PRODUCER_ANALYTICS_MANIFEST_SCHEMA_V1,
    manifestId: PRODUCER_ANALYTICS_MANIFEST_ID_V1,
    issue: PRODUCER_ANALYTICS_MANIFEST_ISSUE_V1,
    derivedFrom: {
      sliceReceipt: {
        path: input.sliceReceipt.path,
        sha256: sha256Hex(input.sliceReceipt.bytes),
        receiptIssue: requireString(field(receipt, "issue", "sliceReceipt"), "issue", "sliceReceipt"),
        receiptSchemaVersion: requireString(field(receipt, "schemaVersion", "sliceReceipt"), "schemaVersion", "sliceReceipt"),
        baseHead: requireString(field(receipt, "baseHead", "sliceReceipt"), "baseHead", "sliceReceipt"),
      },
      nativeServiceCapture: {
        path: input.nativeServiceCapture.path,
        sha256: captureSha256,
        scope: requireString(field(capture, "scope", "nativeServiceCapture"), "scope", "nativeServiceCapture"),
        httpStatus: field(capture, "httpStatus", "nativeServiceCapture"),
        endpoint: requireString(field(capture, "service.endpoint", "nativeServiceCapture"), "service.endpoint", "nativeServiceCapture"),
      },
      rawProjection: {
        path: input.rawArtifact.path,
        sha256: rawArtifactSha256,
        schemaVersion: requireString(field(projection, "schemaVersion", "rawArtifact"), "schemaVersion", "rawArtifact"),
        projectionDigest: projectionBodyDigest,
        sourceContractSha256: requireDigestString(field(projection, "source.contractSha256", "rawArtifact"), "source.contractSha256", "rawArtifact"),
      },
      adjudicator: {
        path: input.adjudicatorSource.path,
        sha256: adjudicatorSha256,
        schemaVersion: KALEIDOSPHERE_CANDIDATE_QUARANTINE_SCHEMA_V1,
        nativeCandidateSchema: NATIVE_CANDIDATE_SCHEMA_V1,
      },
    },
    producer,
    fieldSurface: surface,
    fieldSurfaceDigest,
    runtimeProjection: {
      rawArtifactSha256: rederived.rawArtifactSha256,
      canonicalTransportSha256,
      projectionBodyDigest,
      candidateDigest,
      resultSha256: requireString(field(candidate, "resultSha256", "candidate"), "candidate.resultSha256", "candidate"),
      adjudication: {
        outcome: adjudication.outcome,
        reasonCodes: [...adjudication.reasonCodes],
        authority: adjudication.authority,
      },
    },
    coverage: field(candidate, "coverage", "candidate"),
    evidence: {
      nodeIds: requireArray(field(candidate, "claims.observed.nodeIds", "candidate"), "claims.observed.nodeIds", "candidate"),
      nodeKinds: requireArray(field(candidate, "claims.observed.nodeKinds", "candidate"), "claims.observed.nodeKinds", "candidate"),
      edgeRelation: requireString(field(candidate, "claims.observed.edgeRelation", "candidate"), "claims.observed.edgeRelation", "candidate"),
      evidenceRoles: requireArray(field(candidate, "claims.observed.evidenceRoles", "candidate"), "claims.observed.evidenceRoles", "candidate"),
      sourceContract: requireString(field(candidate, "claims.observed.sourceContract", "candidate"), "claims.observed.sourceContract", "candidate"),
      sourceContractVersion: requireString(field(candidate, "claims.observed.sourceContractVersion", "candidate"), "claims.observed.sourceContractVersion", "candidate"),
      counterevidenceChannel: requireString(field(candidate, "coverage.counterevidence", "candidate"), "coverage.counterevidence", "candidate"),
      counterevidenceEntryCount: requireArray(field(candidate, "counterevidence", "candidate"), "counterevidence", "candidate").length,
      computed: field(candidate, "claims.computed", "candidate"),
    },
    semantics: {
      state: requireString(field(candidate, "state", "candidate"), "candidate.state", "candidate"),
      authority: {
        promote: field(candidate, "authority.promote", "candidate"),
        mutate: field(candidate, "authority.mutate", "candidate"),
        execute: field(candidate, "authority.execute", "candidate"),
        publish: field(candidate, "authority.publish", "candidate"),
        capabilities: requireArray(field(candidate, "authority.capabilities", "candidate"), "authority.capabilities", "candidate"),
        effects: requireArray(field(candidate, "authority.effects", "candidate"), "authority.effects", "candidate"),
      },
      nonclaims: requireArray(field(candidate, "nonclaims", "candidate"), "nonclaims", "candidate"),
    },
    gaps,
    productNonclaims: [...PRODUCER_ANALYTICS_PRODUCT_NONCLAIMS_V1],
    authorityState: {
      authority: requireString(field(receipt, "authorityState.authority", "sliceReceipt"), "authorityState.authority", "sliceReceipt"),
      capabilityDelta: requireString(field(receipt, "authorityState.capabilityDelta", "sliceReceipt"), "authorityState.capabilityDelta", "sliceReceipt"),
      effect: requireString(field(receipt, "authorityState.effect", "sliceReceipt"), "authorityState.effect", "sliceReceipt"),
      capabilities: requireArray(field(candidate, "authority.capabilities", "candidate"), "authority.capabilities", "candidate"),
      effects: requireArray(field(candidate, "authority.effects", "candidate"), "authority.effects", "candidate"),
    },
  };

  const manifest: Record<string, unknown> = { ...manifestBody, manifestDigest: digest(manifestBody) };
  return { manifest, serialized: `${canonicalJson(manifest)}\n` };
}

/** Current candidate derivation only: execution provenance belongs to the external paired runner. */
export function generateForwardProducerAnalyticsManifestV1(input: Readonly<{
  rawArtifactBytes: Uint8Array;
  candidate: unknown;
}>): Readonly<{ manifest: Record<string, unknown>; serialized: string }> {
  return generateForwardProducerForProfile(input, false);
}

export function generateForwardPrProducerAnalyticsManifestV1(input: Readonly<{
  rawArtifactBytes: Uint8Array; candidate: unknown;
}>): Readonly<{ manifest: Record<string, unknown>; serialized: string }> {
  return generateForwardProducerForProfile(input, true);
}

/**
 * Historical current-pair producer (retained PAN346 source candidate), bound to
 * the exact 994ac801 KaleidoSphere head. Source-only: no executed-head or
 * release assertion.
 */
export function generateCurrentProducerAnalyticsManifestV1(input: Readonly<{
  rawArtifactBytes: Uint8Array; candidate: unknown;
}>): Readonly<{ manifest: Record<string, unknown>; serialized: string }> {
  return generateForwardProducerForProfile(input, "current-994ac801");
}

/**
 * Frozen current release-pair producer, bound to the exact 72d9a4af
 * KaleidoSphere head (release 2026_09_28_v1). Source-only: no executed-head or
 * release assertion.
 */
export function generateFrozenCurrentProducerAnalyticsManifestV1(input: Readonly<{
  rawArtifactBytes: Uint8Array; candidate: unknown;
}>): Readonly<{ manifest: Record<string, unknown>; serialized: string }> {
  return generateForwardProducerForProfile(input, "current-frozen-72d9a4af");
}

function generateForwardProducerForProfile(input: Readonly<{ rawArtifactBytes: Uint8Array; candidate: unknown }>, profile: boolean | "pr235" | CurrentKsProfileNameV1) {
  const currentProfile: CurrentKsProfileNameV1 | null =
    typeof profile === "string" && (profile in CURRENT_KS_PROFILES_V1) ? (profile as CurrentKsProfileNameV1) : null;
  const adjudicate = currentProfile === "current-frozen-72d9a4af"
    ? adjudicateNativeFrozenCurrentCandidateV1
    : currentProfile === "current-994ac801"
      ? adjudicateNativeCurrentCandidateV1
      : profile === true
        ? adjudicateNativeForwardPrCandidateV1
        : adjudicateNativeForwardCandidateV1;
  const adjudication = adjudicate({
    rawArtifactBytes: input.rawArtifactBytes,
    canonicalTransportBytes: nativeTransportBytesV1(input.rawArtifactBytes),
    candidate: input.candidate,
    context: createNativeAdjudicationContextV1({ contextId: "pansphaira:forward-producer-001" }),
    qualifiedHeads: {
      pansphaira: RECONCILED_RELEASED_HEADS_V1.pansphaira,
      kaleidoSphere: currentProfile !== null
        ? CURRENT_KS_PROFILES_V1[currentProfile].commitOid
        : profile === true ? "bb52b249feb5968eee286963989f98f3bb673996" : "792e5e38cd4fb612ee034b3edc62aa8b4f58fe0f",
    },
  });
  if (adjudication.outcome !== "ACCEPTED_BOUNDED") {
    throw new ProducerAnalyticsManifestError("ADJUDICATION_DENIED", "forward candidate failed independent content and identity qualification");
  }
  const candidate = input.candidate;
  const surface = fieldSurface(candidate, "candidate");
  const body = {
    schemaVersion: currentProfile !== null
      ? "pansphaira/current-producer-analytics-manifest/v1"
      : "pansphaira/forward-producer-analytics-manifest/v1",
    serviceHead: field(candidate, "bindings.kaleidosphereHead", "candidate"),
    projectionSourceHead: field(candidate, "bindings.pansphairaHead", "candidate"),
    environmentSha256: field(candidate, "bindings.environmentSha256", "candidate"),
    rawArtifactSha256: sha256Hex(input.rawArtifactBytes),
    candidateDigest: nativeCandidateDigestV1(candidate),
    fieldSurface: surface,
    fieldSurfaceDigest: digest(surface),
    evidence: field(candidate, "claims", "candidate"),
    coverage: field(candidate, "coverage", "candidate"),
    counterevidence: field(candidate, "counterevidence", "candidate"),
    adjudication,
    authority: "NONE",
    nonclaims: ["NO_RUNTIME_EXECUTION_ATTESTATION", "NO_RELEASE_OR_PUBLIC_CI_CLAIM", ...PRODUCER_ANALYTICS_PRODUCT_NONCLAIMS_V1],
  };
  const manifest = { ...body, manifestDigest: digest(body) };
  return { manifest, serialized: `${canonicalJson(manifest)}\n` };
}

export type VerifyReasonCodeV1 =
  | "SOURCE_MISSING"
  | "SOURCE_IDENTITY_MISMATCH"
  | "RUNTIME_PROJECTION_MISMATCH"
  | "ADJUDICATION_DENIED"
  | "UNOBSERVED_OR_MISSING_FIELD"
  | "GAP_INVENTORY_MISMATCH"
  | "PRODUCER_BINDING_MISMATCH"
  | "AUTHORITY_OR_NONCLAIM_MISMATCH"
  | "MANIFEST_NOT_OBJECT"
  | "MANIFEST_NOT_CANONICAL"
  | "MANIFEST_MISMATCH";

export function verifyProducerAnalyticsManifestV1(
  candidate: unknown,
  input: ProducerAnalyticsManifestInputV1,
): Readonly<{ valid: boolean; reasonCodes: VerifyReasonCodeV1[] }> {
  let expected: Record<string, unknown>;
  try {
    expected = generateProducerAnalyticsManifestV1(input).manifest;
  } catch (error) {
    const generatorCodeToVerify: Record<ProducerAnalyticsManifestErrorCodeV1, VerifyReasonCodeV1> = {
      SOURCE_MISSING: "SOURCE_MISSING",
      SOURCE_IDENTITY_MISMATCH: "SOURCE_IDENTITY_MISMATCH",
      RUNTIME_PROJECTION_MISMATCH: "RUNTIME_PROJECTION_MISMATCH",
      ADJUDICATION_DENIED: "ADJUDICATION_DENIED",
      UNOBSERVED_FIELD: "UNOBSERVED_OR_MISSING_FIELD",
    };
    const code = error instanceof ProducerAnalyticsManifestError ? generatorCodeToVerify[error.code] : "RUNTIME_PROJECTION_MISMATCH";
    return { valid: false, reasonCodes: [code] };
  }
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    return { valid: false, reasonCodes: ["MANIFEST_NOT_OBJECT"] };
  }
  let candidateJson: string;
  try {
    candidateJson = canonicalJson(candidate);
  } catch {
    return { valid: false, reasonCodes: ["MANIFEST_NOT_CANONICAL"] };
  }
  if (candidateJson === canonicalJson(expected)) {
    return { valid: true, reasonCodes: [] };
  }
  const codes: VerifyReasonCodeV1[] = [];
  const as = (value: unknown): Record<string, unknown> => (value as Record<string, unknown>);
  const differs = (candidateValue: unknown, expectedValue: unknown): boolean => canonicalJson(candidateValue) !== canonicalJson(expectedValue);
  if (differs(as(candidate).fieldSurface, expected.fieldSurface)) codes.push("UNOBSERVED_OR_MISSING_FIELD");
  if (differs(as(candidate).gaps, expected.gaps)) codes.push("GAP_INVENTORY_MISMATCH");
  if (differs(as(candidate).runtimeProjection, expected.runtimeProjection)) codes.push("RUNTIME_PROJECTION_MISMATCH");
  if (differs(as(candidate).producer, expected.producer)) codes.push("PRODUCER_BINDING_MISMATCH");
  if (differs(as(candidate).authorityState, expected.authorityState) || differs(as(candidate).productNonclaims, expected.productNonclaims)) {
    codes.push("AUTHORITY_OR_NONCLAIM_MISMATCH");
  }
  if (codes.length === 0) codes.push("MANIFEST_MISMATCH");
  return { valid: false, reasonCodes: codes };
}