/**
 * PAR-XR-01 — paired analytics compatibility gate (producer x consumer).
 *
 * This module is the *real* Paired-Analytics validator. It gates the exact
 * pair (PanSphaira `producer-analytics-manifest` x KaleidoSphere
 * `consumer-support-manifest`) against a code-owned, head-bound pinned
 * expectation (the evidence artifact). It is dependency-free and pure: it
 * receives the two loaded manifest objects plus the pinned expectation and
 * returns a single fail-closed verdict, re-deriving every digest itself.
 *
 * What it enforces (falsification-first, mirroring PAR-XR-01-AC01..AC03):
 *   AC01  exact refs + schemas + digests + fixture + computation + verdict.
 *         Both manifests are re-digested with the cross-repository canonical
 *         JSON algorithm (byte-identical on the PAN and KS sides); a
 *         whole-content canonical digest pins the exact producer and consumer
 *         artifacts, so a floating / unbound / substituted / downloaded
 *         forgery cannot pass.
 *   AC02  promised-scope parity. A removed or changed promised supported
 *         action or channel version blocks. A *new optional* producer gap is
 *         reported (surfaced, not silently ignored) but does not block the
 *         unrelated promised scope. An *unknown* gap or unknown scope blocks.
 *   AC03  unknown / stale / substituted / incomplete pairs fail closed. The
 *         accepted pair claim names only the exact tested heads.
 *
 * Digest model (re-derived here, never trusted from the input):
 *   - producer self-digest   = sha256(canonicalJson(producer minus manifestDigest))
 *   - consumer self-digest   = `sha256:` + sha256(canonicalJson(consumer minus integrity))
 *   - producer exact-ref pin = sha256(canonicalJson(producer minus gaps and manifestDigest))
 *                              (identity + head + computed are pinned strictly;
 *                               the `gaps` disclosure inventory is handled by
 *                               the AC02 gap policy, so a new *optional* gap is
 *                               reported without blocking the promised scope)
 *   - consumer exact-ref pin = sha256(canonicalJson(consumer))
 *                              (the consumer support surface is the promised
 *                               scope and is pinned strictly)
 */
import { createHash } from "node:crypto";
import { generateForwardProducerAnalyticsManifestV1, generateForwardPrProducerAnalyticsManifestV1, generateCurrentProducerAnalyticsManifestV1, generateFrozenCurrentProducerAnalyticsManifestV1 } from "./producer-analytics-manifest.js";

/**
 * Additive current-pair content qualification, NOT an execution attestation.
 * The consumer pin was independently generated twice from the exact KS
 * runtime checkout and compared against its historical support surface.
 * The fixed count contract comes from PAR-XR-01, not the submitted candidate.
 * No caller-supplied expectations, heads, receipts or allowlists are accepted.
 */
export function validateForwardAnalyticsPairV1(input: {
  rawArtifactBytes: Uint8Array;
  candidate: unknown;
  producerManifest: unknown;
  consumerManifest: unknown;
}): { outcome: "PASS" | "DENIED"; reasonCodes: string[];
     runtimeExecutionAttested: false; releaseOrPublicCiAttested: false } {
  return validateForwardPairProfile(input, false);
}

export function validateForwardPrAnalyticsPairV1(input: Parameters<typeof validateForwardAnalyticsPairV1>[0]) {
  return validateForwardPairProfile(input, true);
}

function validateForwardPairProfile(input: Parameters<typeof validateForwardAnalyticsPairV1>[0], pr235: boolean): ReturnType<typeof validateForwardAnalyticsPairV1> {
  const reasonCodes: string[] = [];
  try {
    const generate = pr235 ? generateForwardPrProducerAnalyticsManifestV1 : generateForwardProducerAnalyticsManifestV1;
    const regenerated = generate({
      rawArtifactBytes: input.rawArtifactBytes, candidate: input.candidate,
    }).manifest;
    if (canonicalJson(regenerated) !== canonicalJson(input.producerManifest)) {
      reasonCodes.push("FORWARD_PRODUCER_SUBSTITUTION_DENIED");
    }
    const expectedComputed = {
      nodeCount: 2, edgeCount: 1, evidenceCount: 2,
      knowledgeNodeCount: 1, decisionNodeCount: 1,
      unknownTotal: 0, counterevidenceTotal: 0, frozenReceiptsEstablishingEdge: 2,
    };
    if (!isPlainObject(regenerated.evidence) ||
        canonicalJson(regenerated.evidence["computed"]) !== canonicalJson(expectedComputed)) {
      reasonCodes.push("FORWARD_FIXED_COMPUTATION_DENIED");
    }
    // Whole-content pin includes support, channels, config, immutable Git head,
    // self-digest and nonclaims. Rehashing a forgery cannot replace this pin.
    const consumerPin = pr235 ? "1072c0a4c4c7438fc60ac943feb1850566ab556ee46b34c0a9bf7cefdbe6e88e" :
        "f778a5fabee25fb8b697d616b93b5d8883f65b8d7b69cafaee95a7ee84263251";
    if (bodyDigest(input.consumerManifest) !== consumerPin) {
      reasonCodes.push("FORWARD_CONSUMER_SUBSTITUTION_DENIED");
    }
  } catch {
    reasonCodes.push("FORWARD_INPUT_OR_ADJUDICATION_DENIED");
  }
  return { outcome: reasonCodes.length === 0 ? "PASS" : "DENIED", reasonCodes,
    runtimeExecutionAttested: false, releaseOrPublicCiAttested: false };
}

/**
 * Frozen current release-pair content qualification (PAN 4330cd26 x KS
 * 72d9a4af, release 2026_09_28_v1). Additive and source-only: it is NOT a
 * CI/release or execution receipt. It mirrors the historical current-pair
 * qualification exactly but is bound to the frozen KS head by an independent,
 * code-owned pin (the separately regenerated KS consumer manifest whole-content
 * digest) and re-derives the producer manifest from the real KS service
 * capture at that head. Distinct reason codes keep it fail-closed and
 * independent of the historical profile. No caller-supplied expectations,
 * heads, receipts or allowlists are accepted.
 */
export function validateFrozenCurrentAnalyticsPairV1(input: Parameters<typeof validateCurrentAnalyticsPairV1>[0]) {
  const reasonCodes: string[] = [];
  try {
    const generated = generateFrozenCurrentProducerAnalyticsManifestV1({ rawArtifactBytes: input.rawArtifactBytes, candidate: input.candidate });
    if (canonicalJson(generated.manifest) !== canonicalJson(input.producerManifest)) reasonCodes.push("FROZEN_PRODUCER_SUBSTITUTION_DENIED");
    const consumer = input.consumerManifest as Record<string, unknown>;
    const binding = (consumer?.["bindings"] as Record<string, unknown> | undefined)?.["kaleidosphereHead"];
    const head = generated.manifest.serviceHead as Record<string, unknown>;
    if (canonicalJson(binding) !== canonicalJson(head)) reasonCodes.push("FROZEN_PAIR_HEAD_MISMATCH_DENIED");
    // Whole-content immutable pin from the separately regenerated KS runtime
    // manifest at the frozen head; never derived from submitted consumer input.
    if (pairedAnalyticsConsumerContentSha256(consumer) !== "02106246113b066c94e3d9f3956e39bbfb4f4350ea17ed84f2fa25a50afa1a32") {
      reasonCodes.push("FROZEN_CONSUMER_SUBSTITUTION_DENIED");
    }
    const supported = (consumer?.["support"] as Record<string, unknown> | undefined)?.["supported"];
    const ids = Array.isArray(supported) ? supported.filter((x: any) => x?.status === "SUPPORTED").map((x: any) => x.id) : [];
    if (canonicalJson(ids) !== canonicalJson(PAIRED_ANALYTICS_PROMISED_SCOPE_V1.supportedActionIds)) reasonCodes.push("FROZEN_PROMISED_SCOPE_DENIED");
    const channels = consumer?.["channels"] as Record<string, { status: string; version: string }> | undefined;
    if (!channels || canonicalJson(Object.fromEntries(Object.entries(channels).map(([k, v]) => [k, v?.status === "SUPPORTED" ? v.version : null]))) !== canonicalJson(PAIRED_ANALYTICS_PROMISED_SCOPE_V1.channelVersions)) {
      reasonCodes.push("FROZEN_PROMISED_CHANNEL_DENIED");
    }
    const computed = (generated.manifest.evidence as Record<string, unknown>)?.["computed"] as Record<string, unknown> | undefined;
    if (!computed || canonicalJson({ nodeCount: computed.nodeCount, edgeCount: computed.edgeCount, evidenceCount: computed.evidenceCount,
      knowledgeNodeCount: computed.knowledgeNodeCount, decisionNodeCount: computed.decisionNodeCount, unknownTotal: computed.unknownTotal,
      counterevidenceTotal: computed.counterevidenceTotal, frozenReceiptsEstablishingEdge: computed.frozenReceiptsEstablishingEdge }) !== canonicalJson({ nodeCount: 2, edgeCount: 1, evidenceCount: 2,
      knowledgeNodeCount: 1, decisionNodeCount: 1, unknownTotal: 0, counterevidenceTotal: 0, frozenReceiptsEstablishingEdge: 2 })) reasonCodes.push("FROZEN_FIXED_COMPUTATION_DENIED");
  } catch { reasonCodes.push("FROZEN_SOURCE_OR_ADJUDICATION_DENIED"); }
  return { outcome: reasonCodes.length === 0 ? "PASS" as const : "DENIED" as const, reasonCodes,
    runtimeExecutionAttested: false as const, publicCiAttested: false as const, releaseAttested: false as const };
}

/** Bounded current-head content qualification; NOT a CI/release or execution receipt. */
export function validateCurrentAnalyticsPairV1(input: Parameters<typeof validateForwardAnalyticsPairV1>[0]) {
  const reasonCodes: string[] = [];
  try {
    const generated = generateCurrentProducerAnalyticsManifestV1({ rawArtifactBytes: input.rawArtifactBytes, candidate: input.candidate });
    if (canonicalJson(generated.manifest) !== canonicalJson(input.producerManifest)) reasonCodes.push("CURRENT_PRODUCER_SUBSTITUTION_DENIED");
    const consumer = input.consumerManifest as Record<string, unknown>;
    const binding = (consumer?.["bindings"] as Record<string, unknown> | undefined)?.["kaleidosphereHead"];
    const head = (generated.manifest.serviceHead as Record<string, unknown>);
    if (canonicalJson(binding) !== canonicalJson(head)) reasonCodes.push("CURRENT_PAIR_HEAD_MISMATCH_DENIED");
    // Whole-content immutable pin from a separately regenerated KS runtime manifest,
    // never derived from submitted consumer input. Any support/version drift blocks.
    if (pairedAnalyticsConsumerContentSha256(consumer) !== "11d0451643fbbe2fef3f7c9e861fda0fbb7ab9ffa2e805dee9acfabc41b861a5") {
      reasonCodes.push("CURRENT_CONSUMER_SUBSTITUTION_DENIED");
    }
    const supported = (consumer?.["support"] as Record<string, unknown> | undefined)?.["supported"];
    const ids = Array.isArray(supported) ? supported.filter((x: any) => x?.status === "SUPPORTED").map((x: any) => x.id) : [];
    if (canonicalJson(ids) !== canonicalJson(PAIRED_ANALYTICS_PROMISED_SCOPE_V1.supportedActionIds)) reasonCodes.push("CURRENT_PROMISED_SCOPE_DENIED");
    const channels = consumer?.["channels"] as Record<string, { status: string; version: string }> | undefined;
    if (!channels || canonicalJson(Object.fromEntries(Object.entries(channels).map(([k, v]) => [k, v?.status === "SUPPORTED" ? v.version : null]))) !== canonicalJson(PAIRED_ANALYTICS_PROMISED_SCOPE_V1.channelVersions)) {
      reasonCodes.push("CURRENT_PROMISED_CHANNEL_DENIED");
    }
    const computed = (generated.manifest.evidence as Record<string, unknown>)?.["computed"] as Record<string, unknown> | undefined;
    if (!computed || canonicalJson({ nodeCount: computed.nodeCount, edgeCount: computed.edgeCount, evidenceCount: computed.evidenceCount,
      knowledgeNodeCount: computed.knowledgeNodeCount, decisionNodeCount: computed.decisionNodeCount, unknownTotal: computed.unknownTotal,
      counterevidenceTotal: computed.counterevidenceTotal, frozenReceiptsEstablishingEdge: computed.frozenReceiptsEstablishingEdge }) !== canonicalJson({ nodeCount: 2, edgeCount: 1, evidenceCount: 2,
      knowledgeNodeCount: 1, decisionNodeCount: 1, unknownTotal: 0, counterevidenceTotal: 0, frozenReceiptsEstablishingEdge: 2 })) reasonCodes.push("CURRENT_FIXED_COMPUTATION_DENIED");
  } catch { reasonCodes.push("CURRENT_SOURCE_OR_ADJUDICATION_DENIED"); }
  return { outcome: reasonCodes.length === 0 ? "PASS" as const : "DENIED" as const, reasonCodes,
    runtimeExecutionAttested: false as const, publicCiAttested: false as const, releaseAttested: false as const };
}

import { canonicalJson } from "../../packages/contracts/src/canonical-json.js";

const sha256Hex = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

/** Cross-repository canonical-JSON body digest (hex, no prefix). */
const bodyDigest = (value: unknown): string => sha256Hex(canonicalJson(value));

/** The closed reason-code vocabulary for the paired analytics gate. */
export const PAIRED_ANALYTICS_REASON_CODES_V1 = Object.freeze([
  "PAIRED_ANALYTICS_INPUT_MALFORMED",
  "PAIRED_ANALYTICS_PRODUCER_SCHEMA_DENIED",
  "PAIRED_ANALYTICS_PRODUCER_DIGEST_DENIED",
  "PAIRED_ANALYTICS_PRODUCER_REF_DENIED",
  "PAIRED_ANALYTICS_CONSUMER_SCHEMA_DENIED",
  "PAIRED_ANALYTICS_CONSUMER_DIGEST_DENIED",
  "PAIRED_ANALYTICS_CONSUMER_REF_DENIED",
  "PAIRED_ANALYTICS_HEAD_MISMATCH_DENIED",
  "PAIRED_ANALYTICS_UNKNOWN_PAIR_DENIED",
  "PAIRED_ANALYTICS_CONTRACT_MISMATCH_DENIED",
  "PAIRED_ANALYTICS_PROMISED_SCOPE_REMOVED_DENIED",
  "PAIRED_ANALYTICS_PROMISED_SCOPE_CHANGED_DENIED",
  "PAIRED_ANALYTICS_PROMISED_SCOPE_UNKNOWN_DENIED",
  "PAIRED_ANALYTICS_COMPUTED_MISMATCH_DENIED",
]) as readonly string[];

/** Closed gap-state vocabulary carried by the producer manifest. */
export const PAIRED_ANALYTICS_GAP_STATES_V1 = Object.freeze([
  "HELD",
  "PENDING",
  "DEGRADED",
  "RELEASED",
  "UNKNOWN",
]) as readonly string[];

/**
 * Gap states that are *optional* for the pair: reported (surfaced in
 * `optionalGapReports`) but not blocking. A `UNKNOWN` gap is never optional.
 */
export const PAIRED_ANALYTICS_OPTIONAL_GAP_STATES_V1 = Object.freeze([
  "HELD",
  "PENDING",
  "DEGRADED",
]) as readonly string[];

export interface HeadBindingV1 {
  readonly commitOid: string;
  readonly treeOid: string;
}

export interface PairedAnalyticsPinnedProducerV1 {
  readonly manifestId: string;
  readonly issue: string;
  readonly schemaVersion: string;
  /** sha256(canonicalJson(producer minus gaps and manifestDigest)) — exact content pin. */
  readonly manifestSha256: string;
  /** sha256(canonicalJson(producer minus manifestDigest)) self-digest. */
  readonly manifestDigest: string;
  readonly serviceHead: HeadBindingV1;
  readonly reconciledReleasedHeads: { readonly pansphaira: string; readonly kaleidoSphere: string };
}

export interface PairedAnalyticsPinnedConsumerV1 {
  readonly issue: string;
  readonly schemaVersion: string;
  /** sha256(canonicalJson(whole consumer manifest)) — exact content pin. */
  readonly manifestSha256: string;
  /** `sha256:<hex>` self-digest recorded under `integrity.digest`. */
  readonly integrityDigest: string;
  readonly kaleidosphereHead: HeadBindingV1;
  readonly product: { readonly id: string; readonly version: string };
  readonly contract: { readonly id: string; readonly version: string };
  readonly profileDigest: string;
}

export interface PairedAnalyticsPinnedV1 {
  readonly schemaVersion: string;
  readonly producerRef: PairedAnalyticsPinnedProducerV1;
  readonly consumerRef: PairedAnalyticsPinnedConsumerV1;
  /** Historical declared source refs, never execution provenance. */
  readonly declaredSourceHeads: { readonly pansphaira: string; readonly kaleidoSphere: string };
  /** The promised consumer support surface the pair gates against. */
  readonly promisedScope: {
    readonly supportedActionIds: readonly string[];
    readonly channelVersions: Readonly<Record<string, string>>;
  };
  /** Optional gaps the evidence already knows about (id + state). */
  readonly knownOptionalGaps: ReadonlyArray<{ readonly id: string; readonly state: string }>;
  /** The producer's self-consistent computed evidence block. */
  readonly requiredComputed: {
    readonly nodeCount: number;
    readonly knowledgeNodeCount: number;
    readonly decisionNodeCount: number;
    readonly edgeCount: number;
    readonly evidenceCount: number;
    readonly counterevidenceEntryCount: number;
    readonly counterevidenceTotal: number;
    readonly unknownTotal: number;
    readonly adjudicationOutcome: string;
  };
}

export interface PairedAnalyticsParityInputV1 {
  readonly producerManifest: unknown;
  readonly consumerManifest: unknown;
  readonly pinned: PairedAnalyticsPinnedV1;
}

export interface PairedAnalyticsOptionalGapReportV1 {
  readonly id: string;
  readonly state: string;
  readonly field: string;
  readonly note: string;
}

export interface PairedAnalyticsClaimBoundaryV1 {
  readonly exactTestedPairOnly: boolean;
  readonly unknownPairsDenied: boolean;
  readonly productionOrCustomerEffect: boolean;
  readonly externalEffectPerformed: boolean;
}

export interface PairedAnalyticsParityResultV1 {
  readonly outcome: "PASS" | "DENIED";
  readonly reasonCodes: readonly string[];
  readonly optionalGapReports: readonly PairedAnalyticsOptionalGapReportV1[];
  readonly declaredSourceHeads: { readonly pansphaira: string; readonly kaleidoSphere: string };
  readonly claimBoundary: PairedAnalyticsClaimBoundaryV1;
}

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function immutableOid(value: unknown): boolean {
  return typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
}

function headMatches(head: unknown, expected: HeadBindingV1): boolean {
  if (!isPlainObject(head) || !immutableOid(head["commitOid"]) || !immutableOid(head["treeOid"])) return false;
  return asString(head["commitOid"]) === expected.commitOid && asString(head["treeOid"]) === expected.treeOid;
}

/**
 * Producer exact-ref pin: sha256(canonicalJson(producer minus gaps and manifestDigest)). The
 * `gaps` disclosure inventory is excluded because it is handled by the AC02
 * gap policy (a new *optional* gap is reported without blocking the promised
 * scope); identity, head and computed evidence are pinned strictly.
 */
export function pairedAnalyticsProducerCoreSha256(producer: unknown): string {
  if (!isPlainObject(producer)) return bodyDigest(producer);
  const body: PlainObject = { ...producer };
  delete body["gaps"];
  delete body["manifestDigest"];
  return bodyDigest(body);
}

/**
 * Consumer exact-ref pin: sha256(canonicalJson(whole consumer manifest)).
 * The consumer support surface is the promised scope and is pinned strictly.
 */
export function pairedAnalyticsConsumerContentSha256(consumer: unknown): string {
  return bodyDigest(consumer);
}

/** Producer self-digest: sha256(canonicalJson(producer minus manifestDigest)). */
function producerSelfDigest(producer: PlainObject): string {
  const body: PlainObject = { ...producer };
  delete body["manifestDigest"];
  return bodyDigest(body);
}

/** Consumer self-digest: `sha256:` + sha256(canonicalJson(consumer minus integrity)). */
function consumerSelfDigest(consumer: PlainObject): string {
  const body: PlainObject = { ...consumer };
  delete body["integrity"];
  return `sha256:${bodyDigest(body)}`;
}

function finish(
  reasonCodes: Set<string>,
  optionalGapReports: PairedAnalyticsOptionalGapReportV1[],
  pinned: PlainObject,
): PairedAnalyticsParityResultV1 {
  const declaredSourceHeads: { pansphaira: string; kaleidoSphere: string } =
    isPlainObject(pinned["declaredSourceHeads"])
      ? {
          pansphaira: asString((pinned["declaredSourceHeads"] as PlainObject)["pansphaira"]) ?? "",
          kaleidoSphere: asString((pinned["declaredSourceHeads"] as PlainObject)["kaleidoSphere"]) ?? "",
        }
      : { pansphaira: "", kaleidoSphere: "" };

  return {
    outcome: reasonCodes.size === 0 ? "PASS" : "DENIED",
    reasonCodes: [...reasonCodes].sort(),
    optionalGapReports,
    declaredSourceHeads,
    claimBoundary: {
      exactTestedPairOnly: false,
      unknownPairsDenied: true,
      // The gate is a static two-manifest integrity check: it performs no
      // production, customer, external, publication or closure effect.
      productionOrCustomerEffect: false,
      externalEffectPerformed: false,
    },
  };
}

/**
 * The single fail-closed paired-analytics gate. Returns an empty
 * `reasonCodes` list (and outcome PASS) only when every AC01..AC03 check
 * holds; otherwise it returns the specific blocking codes.
 */
export function verifyPairedAnalyticsParityV1(input: PairedAnalyticsParityInputV1): PairedAnalyticsParityResultV1 {
  const reasonCodes = new Set<string>();
  const optionalGapReports: PairedAnalyticsOptionalGapReportV1[] = [];
  const deny = (code: string): void => {
    if (!PAIRED_ANALYTICS_REASON_CODES_V1.includes(code)) throw new Error(`UNKNOWN_REASON_CODE:${code}`);
    reasonCodes.add(code);
  };

  const producer = input.producerManifest;
  const consumer = input.consumerManifest;
  const pinned = input.pinned;

  if (!isPlainObject(producer) || !isPlainObject(consumer) || !isPlainObject(pinned)) {
    deny("PAIRED_ANALYTICS_INPUT_MALFORMED");
    return finish(reasonCodes, optionalGapReports, (pinned ?? {}) as unknown as PlainObject);
  }

  // --- AC01: exact producer ref + schema + self-digest --------------------------
  const producerRef = pinned.producerRef;
  if (
    asString(producer["manifestId"]) !== producerRef.manifestId ||
    asString(producer["issue"]) !== producerRef.issue ||
    asString(producer["schemaVersion"]) !== producerRef.schemaVersion
  ) {
    deny("PAIRED_ANALYTICS_PRODUCER_SCHEMA_DENIED");
  }
  if (pairedAnalyticsProducerCoreSha256(producer) !== producerRef.manifestSha256) {
    // The exact producer artifact (identity + head + computed) is not the
    // pinned one: a floating, substituted or unbound download cannot pass.
    deny("PAIRED_ANALYTICS_PRODUCER_REF_DENIED");
  }
  const recordedProducerDigest = asString(producer["manifestDigest"]);
  if (
    recordedProducerDigest === null ||
    recordedProducerDigest !== producerSelfDigest(producer)
  ) {
    deny("PAIRED_ANALYTICS_PRODUCER_DIGEST_DENIED");
  }

  // --- AC01: exact consumer ref + schema + self-digest --------------------------
  const consumerRef = pinned.consumerRef;
  if (
    asString(consumer["issue"]) !== consumerRef.issue ||
    asString(consumer["schemaVersion"]) !== consumerRef.schemaVersion
  ) {
    deny("PAIRED_ANALYTICS_CONSUMER_SCHEMA_DENIED");
  }
  if (pairedAnalyticsConsumerContentSha256(consumer) !== consumerRef.manifestSha256) {
    deny("PAIRED_ANALYTICS_CONSUMER_REF_DENIED");
  }
  const integrity = consumer["integrity"];
  const recordedConsumerDigest = isPlainObject(integrity) ? asString(integrity["digest"]) : null;
  if (
    recordedConsumerDigest === null ||
    recordedConsumerDigest !== consumerSelfDigest(consumer) ||
    recordedConsumerDigest !== consumerRef.integrityDigest
  ) {
    deny("PAIRED_ANALYTICS_CONSUMER_DIGEST_DENIED");
  }

  // --- AC03: exact head parity (stale / substituted / unknown) ------------------
  const producerServiceHead = isPlainObject(producer["producer"]) ? (producer["producer"] as PlainObject)["serviceHead"] : null;
  const consumerHead = isPlainObject(consumer["bindings"]) ? (consumer["bindings"] as PlainObject)["kaleidosphereHead"] : null;
  const expectedKsHead = pinned.declaredSourceHeads.kaleidoSphere;

  // The producer must bind the exact tested KaleidoSphere head.
  if (!headMatches(producerServiceHead, producerRef.serviceHead) || producerRef.serviceHead.commitOid !== expectedKsHead) {
    deny("PAIRED_ANALYTICS_HEAD_MISMATCH_DENIED");
  }
  // The consumer must bind the *same* exact tested head. A consumer bound to a
  // different (stale or substituted) head is the core adversarial case.
  if (!headMatches(consumerHead, { commitOid: expectedKsHead, treeOid: producerRef.serviceHead.treeOid })) {
    deny("PAIRED_ANALYTICS_HEAD_MISMATCH_DENIED");
  }
  // A head that is neither the pinned tested head nor the pinned consumer
  // baseline is an unknown pair identity.
  if (
    !headMatches(consumerHead, { commitOid: expectedKsHead, treeOid: producerRef.serviceHead.treeOid }) &&
    !headMatches(consumerHead, consumerRef.kaleidosphereHead)
  ) {
    deny("PAIRED_ANALYTICS_UNKNOWN_PAIR_DENIED");
  }

  // --- AC01: consumer contract/product identity ---------------------------------
  const consumerProduct = isPlainObject(consumer["consumer"]) ? (consumer["consumer"] as PlainObject)["product"] : null;
  const consumerContract = isPlainObject(consumer["consumer"]) ? (consumer["consumer"] as PlainObject)["contract"] : null;
  if (
    !isPlainObject(consumerProduct) ||
    !isPlainObject(consumerContract) ||
    asString(consumerProduct["id"]) !== consumerRef.product.id ||
    asString(consumerProduct["version"]) !== consumerRef.product.version ||
    asString(consumerContract["id"]) !== consumerRef.contract.id ||
    asString(consumerContract["version"]) !== consumerRef.contract.version
  ) {
    deny("PAIRED_ANALYTICS_CONTRACT_MISMATCH_DENIED");
  }

  // --- AC02: promised-scope parity ---------------------------------------------
  const support = isPlainObject(consumer["support"]) ? (consumer["support"] as PlainObject) : null;
  const supported = isPlainObject(support) ? support["supported"] : null;
  const supportedIds = new Set<string>();
  if (Array.isArray(supported)) {
    for (const entry of supported) {
      if (isPlainObject(entry) && asString(entry["status"]) === "SUPPORTED" && typeof entry["id"] === "string") {
        supportedIds.add(entry["id"]);
      }
    }
  }
  const pinnedSupported = new Set<string>(pinned.promisedScope.supportedActionIds);
  for (const id of pinnedSupported) {
    if (!supportedIds.has(id)) deny("PAIRED_ANALYTICS_PROMISED_SCOPE_REMOVED_DENIED");
  }
  // An unexpected extra promised action is unknown scope: it blocks rather than
  // silently widening the pair.
  for (const id of supportedIds) {
    if (!pinnedSupported.has(id)) deny("PAIRED_ANALYTICS_PROMISED_SCOPE_UNKNOWN_DENIED");
  }

  const channels = isPlainObject(consumer["channels"]) ? (consumer["channels"] as PlainObject) : null;
  const pinnedChannelVersions = pinned.promisedScope.channelVersions;
  for (const [channel, expectedVersion] of Object.entries(pinnedChannelVersions)) {
    const entry = isPlainObject(channels) ? channels[channel] : null;
    if (!isPlainObject(entry) || asString(entry["status"]) !== "SUPPORTED") {
      deny("PAIRED_ANALYTICS_PROMISED_SCOPE_REMOVED_DENIED");
      continue;
    }
    if (asString(entry["version"]) !== expectedVersion) {
      deny("PAIRED_ANALYTICS_PROMISED_SCOPE_CHANGED_DENIED");
    }
  }
  // A channel not in the pinned promised scope is unknown scope: it blocks.
  if (isPlainObject(channels)) {
    for (const channel of Object.keys(channels)) {
      if (!Object.prototype.hasOwnProperty.call(pinnedChannelVersions, channel)) {
        deny("PAIRED_ANALYTICS_PROMISED_SCOPE_UNKNOWN_DENIED");
      }
    }
  }

  // --- AC02: producer gap policy (optional reported, unknown blocks) -----------
  if (!Array.isArray(producer["gaps"])) deny("PAIRED_ANALYTICS_INPUT_MALFORMED");
  const gaps = Array.isArray(producer["gaps"]) ? (producer["gaps"] as unknown[]) : [];
  const gapIds = new Set<string>();
  const knownOptional = new Set<string>(pinned.knownOptionalGaps.map((gap) => `${gap.id}\0${gap.state}`));
  for (const raw of gaps) {
    if (!isPlainObject(raw)) {
      deny("PAIRED_ANALYTICS_PROMISED_SCOPE_UNKNOWN_DENIED");
      continue;
    }
    const id = asString(raw["id"]) ?? "";
    const state = asString(raw["state"]) ?? "";
    const field = asString(raw["field"]) ?? "";
    const keys = Object.keys(raw).sort().join(",");
    if (!id || !field || !asString(raw["note"]) || !isPlainObject(raw["observed"]) ||
        keys !== "field,id,note,observed,state" || gapIds.has(id)) {
      deny("PAIRED_ANALYTICS_INPUT_MALFORMED");
    }
    gapIds.add(id);
    if (pinned.promisedScope.supportedActionIds.includes(id) ||
        (!pinned.knownOptionalGaps.some(gap => gap.id === id) &&
          [...Object.keys(producer), ...Object.keys(consumer), ...Object.keys(pinned.promisedScope.channelVersions), ...pinned.promisedScope.supportedActionIds]
            .some(required => field === required || field.startsWith(`${required}.`) || id === required))) {
      deny("PAIRED_ANALYTICS_PROMISED_SCOPE_CHANGED_DENIED");
    }
    if (!PAIRED_ANALYTICS_GAP_STATES_V1.includes(state)) {
      // A gap state outside the closed vocabulary is treated as unknown.
      deny("PAIRED_ANALYTICS_PROMISED_SCOPE_UNKNOWN_DENIED");
      continue;
    }
    if (state === "UNKNOWN") {
      deny("PAIRED_ANALYTICS_PROMISED_SCOPE_UNKNOWN_DENIED");
      continue;
    }
    if (PAIRED_ANALYTICS_OPTIONAL_GAP_STATES_V1.includes(state)) {
      // Optional gap: surfaced (reported) but never blocked. The producer
      // manifest is an exact, digest-verified artifact, so any gap it
      // declares is the disclosed, bounded state; the owner must be able to
      // see it without the unrelated promised scope being falsely blocked or
      // the disclosure silently ignored.
      optionalGapReports.push({
        id,
        state,
        field: asString(raw["field"]) ?? "",
        note: asString(raw["note"]) ?? "",
      });
      continue;
    }
    // A non-optional gap the evidence does not pin is a scope deviation the
    // pair cannot certify.
    if (!knownOptional.has(`${id}\0${state}`)) {
      deny("PAIRED_ANALYTICS_PROMISED_SCOPE_UNKNOWN_DENIED");
    }
  }

  for (const gap of pinned.knownOptionalGaps) {
    if (!gaps.some(raw => isPlainObject(raw) && raw["id"] === gap.id && raw["state"] === gap.state)) {
      deny("PAIRED_ANALYTICS_PROMISED_SCOPE_CHANGED_DENIED");
    }
  }

  // --- AC01: producer computed-evidence consistency ----------------------------
  const evidence = isPlainObject(producer["evidence"]) ? (producer["evidence"] as PlainObject) : null;
  const computed = isPlainObject(evidence) ? evidence["computed"] : null;
  const required = pinned.requiredComputed;
  const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
  const computedOk =
    isPlainObject(computed) &&
    num(computed["nodeCount"]) === required.nodeCount &&
    num(computed["knowledgeNodeCount"]) === required.knowledgeNodeCount &&
    num(computed["decisionNodeCount"]) === required.decisionNodeCount &&
    num(computed["edgeCount"]) === required.edgeCount &&
    num(computed["evidenceCount"]) === required.evidenceCount &&
    num(computed["counterevidenceTotal"]) === required.counterevidenceTotal &&
    num(computed["unknownTotal"]) === required.unknownTotal;
  const counterevidenceEntryCount = isPlainObject(evidence) ? num(evidence["counterevidenceEntryCount"]) : null;
  const adjudication = isPlainObject(producer["runtimeProjection"])
    ? (producer["runtimeProjection"] as PlainObject)["adjudication"]
    : null;
  const adjudicationOutcome = isPlainObject(adjudication) ? asString(adjudication["outcome"]) : null;
  if (
    !computedOk ||
    counterevidenceEntryCount !== required.counterevidenceEntryCount ||
    adjudicationOutcome !== required.adjudicationOutcome
  ) {
    deny("PAIRED_ANALYTICS_COMPUTED_MISMATCH_DENIED");
  }

  return finish(reasonCodes, optionalGapReports, pinned);
}

/**
 * Candidate-pin utility only, NOT an acceptance authority. Neither production
 * runner nor positive tests derive their expectation from submitted inputs.
 * Pin changes require independent review and counterpart execution.
 */
export function derivePairedAnalyticsPinnedV1(
  producer: unknown,
  consumer: unknown,
): PairedAnalyticsPinnedV1 {
  if (!isPlainObject(producer) || !isPlainObject(consumer)) {
    throw new Error("DERIVE_REQUIRES_PLAIN_MANIFESTS");
  }
  const producerObject = producer as PlainObject;
  const consumerObject = consumer as PlainObject;
  const producerProduct = isPlainObject(producerObject["producer"])
    ? (producerObject["producer"] as PlainObject)
    : ({} as PlainObject);
  const producerServiceHead = producerProduct["serviceHead"];
  if (!isPlainObject(producerServiceHead) || !immutableOid(producerServiceHead["commitOid"]) || !immutableOid(producerServiceHead["treeOid"])) {
    throw new Error("DERIVE_PRODUCER_HEAD_INVALID");
  }
  const consumerBindings = isPlainObject(consumerObject["bindings"])
    ? (consumerObject["bindings"] as PlainObject)
    : ({} as PlainObject);
  const consumerHead = consumerBindings["kaleidosphereHead"];
  if (!isPlainObject(consumerHead) || !immutableOid(consumerHead["commitOid"]) || !immutableOid(consumerHead["treeOid"])) {
    throw new Error("DERIVE_CONSUMER_HEAD_INVALID");
  }
  // Head parity is a precondition for a *consistent* derivation: the producer
  // must bind the same KaleidoSphere head the consumer is bound to.
  if (asString(producerServiceHead["commitOid"]) !== asString(consumerHead["commitOid"]) || asString(producerServiceHead["treeOid"]) !== asString(consumerHead["treeOid"])) {
    throw new Error("DERIVE_HEAD_PARITY_REQUIRED");
  }
  const consumerSection = isPlainObject(consumerObject["consumer"])
    ? (consumerObject["consumer"] as PlainObject)
    : ({} as PlainObject);
  const consumerProduct = isPlainObject(consumerSection["product"]) ? (consumerSection["product"] as PlainObject) : null;
  const consumerContract = isPlainObject(consumerSection["contract"]) ? (consumerSection["contract"] as PlainObject) : null;
  if (consumerProduct === null || consumerContract === null || asString(consumerProduct["id"]) === null || asString(consumerProduct["version"]) === null || asString(consumerContract["id"]) === null || asString(consumerContract["version"]) === null) {
    throw new Error("DERIVE_CONSUMER_IDENTITY_INVALID");
  }
  const integrity = isPlainObject(consumerObject["integrity"]) ? (consumerObject["integrity"] as PlainObject) : null;
  const recordedConsumerDigest = integrity === null ? null : asString(integrity["digest"]);
  if (recordedConsumerDigest === null) throw new Error("DERIVE_CONSUMER_DIGEST_INVALID");
  const recordedProducerDigest = asString(producerObject["manifestDigest"]);
  if (recordedProducerDigest === null) throw new Error("DERIVE_PRODUCER_DIGEST_INVALID");

  const supportedRaw = isPlainObject(consumerObject["support"]) ? (consumerObject["support"] as PlainObject)["supported"] : null;
  const supportedActionIds: string[] = [];
  if (Array.isArray(supportedRaw)) {
    for (const entry of supportedRaw) {
      if (isPlainObject(entry) && asString(entry["status"]) === "SUPPORTED" && typeof entry["id"] === "string") supportedActionIds.push(entry["id"]);
    }
  }
  const channelsRaw = isPlainObject(consumerObject["channels"]) ? (consumerObject["channels"] as PlainObject) : {};
  const channelVersions: Record<string, string> = {};
  for (const [key, valueRaw] of Object.entries(channelsRaw)) {
    if (!isPlainObject(valueRaw)) continue;
    const version = asString(valueRaw["version"]);
    if (version !== null) channelVersions[key] = version;
  }
  const gapsRaw = Array.isArray(producerObject["gaps"]) ? (producerObject["gaps"] as unknown[]) : [];
  const knownOptionalGaps: Array<{ id: string; state: string }> = [];
  for (const raw of gapsRaw) {
    if (!isPlainObject(raw)) continue;
    const id = asString(raw["id"]);
    const state = asString(raw["state"]);
    if (id === null || state === null) continue;
    if (PAIRED_ANALYTICS_OPTIONAL_GAP_STATES_V1.includes(state)) knownOptionalGaps.push({ id, state });
  }
  const evidenceRaw = isPlainObject(producerObject["evidence"]) ? (producerObject["evidence"] as PlainObject) : ({} as PlainObject);
  const computedRaw = isPlainObject(evidenceRaw["computed"]) ? (evidenceRaw["computed"] as PlainObject) : ({} as PlainObject);
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
  const adjudication = isPlainObject(producerObject["runtimeProjection"]) ? (producerObject["runtimeProjection"] as PlainObject)["adjudication"] : null;
  const reconciledRaw = isPlainObject(producerProduct["reconciledReleasedHeads"]) ? (producerProduct["reconciledReleasedHeads"] as PlainObject) : null;
  if (!isPlainObject(reconciledRaw) || !immutableOid(reconciledRaw["pansphaira"]) || !immutableOid(reconciledRaw["kaleidoSphere"])) {
    throw new Error("DERIVE_RELEASE_HEAD_INVALID");
  }
  const requiredComputed = {
    nodeCount: num(computedRaw["nodeCount"]),
    knowledgeNodeCount: num(computedRaw["knowledgeNodeCount"]),
    decisionNodeCount: num(computedRaw["decisionNodeCount"]),
    edgeCount: num(computedRaw["edgeCount"]),
    evidenceCount: num(computedRaw["evidenceCount"]),
    counterevidenceTotal: num(computedRaw["counterevidenceTotal"]),
    unknownTotal: num(computedRaw["unknownTotal"]),
    counterevidenceEntryCount: num(evidenceRaw["counterevidenceEntryCount"]),
    adjudicationOutcome: asString(isPlainObject(adjudication) ? adjudication["outcome"] : null) ?? "",
  };
  if (Object.values(requiredComputed).some((v) => (typeof v === "number" ? Number.isNaN(v) : v === ""))) {
    throw new Error("DERIVE_COMPUTED_INVALID");
  }

  return {
    schemaVersion: "pansphaira.par-xr-01/paired-analytics-pinned/v1",
    producerRef: {
      manifestId: asString(producerObject["manifestId"]) as string,
      issue: asString(producerObject["issue"]) as string,
      schemaVersion: asString(producerObject["schemaVersion"]) as string,
      manifestSha256: pairedAnalyticsProducerCoreSha256(producer),
      manifestDigest: recordedProducerDigest,
      serviceHead: { commitOid: asString(producerServiceHead["commitOid"]) as string, treeOid: asString(producerServiceHead["treeOid"]) as string },
      reconciledReleasedHeads: {
        pansphaira: asString(isPlainObject(reconciledRaw) ? reconciledRaw["pansphaira"] : null) as string,
        kaleidoSphere: asString(isPlainObject(reconciledRaw) ? reconciledRaw["kaleidoSphere"] : null) as string,
      },
    },
    consumerRef: {
      issue: asString(consumerObject["issue"]) as string,
      schemaVersion: asString(consumerObject["schemaVersion"]) as string,
      manifestSha256: pairedAnalyticsConsumerContentSha256(consumer),
      integrityDigest: recordedConsumerDigest,
      kaleidosphereHead: { commitOid: asString(consumerHead["commitOid"]) as string, treeOid: asString(consumerHead["treeOid"]) as string },
      product: { id: asString(consumerProduct["id"]) as string, version: asString(consumerProduct["version"]) as string },
      contract: { id: asString(consumerContract["id"]) as string, version: asString(consumerContract["version"]) as string },
      profileDigest: asString(consumerSection["profileDigest"]) ?? "",
    },
    declaredSourceHeads: {
      pansphaira: asString(isPlainObject(reconciledRaw) ? reconciledRaw["pansphaira"] : null) as string,
      kaleidoSphere: asString(consumerHead["commitOid"]) as string,
    },
    promisedScope: { supportedActionIds, channelVersions },
    knownOptionalGaps,
    requiredComputed,
  };
}

/**
 * The exact consumer support surface the accepted pair gates against,
 * derived from the live runtime-derived consumer manifest at the tested head.
 * Exported so the runner and the evidence artifact bind the same set.
 */
export const PAIRED_ANALYTICS_PROMISED_SCOPE_V1 = Object.freeze({
  supportedActionIds: Object.freeze([
    "bi.status.read",
    "bi.discovery.run",
    "bi.analysis.run",
    "bi.graph.adaptive-v1.plan",
    "bi.preview.create",
    "bi.readback.read",
  ]) as readonly string[],
  channelVersions: Object.freeze({
    projection: "superset-bi-agent.external/intent-request/v2",
    semantic: "superset-bi-agent.external/consumer-profile/v1",
    analysis: "superset-bi-agent.external/analysis-readback/v2",
    result: "superset-bi-agent.external/intent-result/v2",
    returnChannel: "superset-bi-agent.external/superset-readback/v2",
  }) as Readonly<Record<string, string>>,
}) as Readonly<{
  supportedActionIds: readonly string[];
  channelVersions: Readonly<Record<string, string>>;
}>;
