import { createHash } from "node:crypto";
import { types } from "node:util";

import { canonicalJson } from "../../packages/contracts/src/canonical-json.js";
import {
  buildKaleidosphereAnalyticsProjectionV1,
  SOURCE_CONTRACT_SHA256,
  type KaleidosphereAnalyticsProjectionV1,
} from "../../packages/contracts/src/kaleidosphere-analytics-projection.js";

export const KALEIDOSPHERE_CANDIDATE_QUARANTINE_SCHEMA_V1 = "pansphaira.xra-ps-02/candidate-adjudication/v1" as const;
export const PANSPHAIRA_EXACT_RELEASED_HEAD_V1 = "24db4e926385b006c9f2fbca3588adece72e7fb0" as const;
export const KALEIDOSPHERE_EXACT_RELEASED_HEAD_V1 = "90c574e9a06cb752be06270395d44a31eabc44ae" as const;
export const CANDIDATE_ID_V1 = "pansphaira:xra-ps-02-candidate-001" as const;
export const ADJUDICATION_RECEIPT_ID_V1 = "pansphaira:xra-ps-02-paired-receipt-001" as const;

export const ADJUDICATION_CHAIN_STAGES = Object.freeze([
  "GENERATION",
  "PROJECTION",
  "INGESTION",
  "SEMANTICS",
  "ANALYSIS",
  "CANDIDATE",
  "ADJUDICATION",
] as const);

const CANONICAL_KNOWLEDGE_SHA256 = "d756437db8c991ee78ea7a9fcc7a9d4749daf8eebda51d5ba31fcc53e1b1242a" as const;
const HEX64 = /^[a-f0-9]{64}$/;
const HEAD40 = /^[a-f0-9]{40}$/;
const INVALID = Symbol("xra-ps-02-invalid");

type PlainRecord = Record<string, unknown>;

type ConsumerVerdictV1 = "ACCEPTED_BOUNDED" | "RESTRICTED" | "DENIED" | "UNKNOWN";

export type ReleasedHeadsV1 = Readonly<{
  pansphaira: string;
  kaleidoSphere: string;
}>;

export type CandidateEvidenceV1 = Readonly<{
  evidenceId: string;
  evidenceRole: string;
  evidenceSha256: string;
  evidenceVersion: string;
}>;

export type CounterevidenceV1 = Readonly<{
  evidenceId: string;
  evidenceSha256: string;
  reason: "CONTRADICTS_OWNER_EVIDENCE";
}>;

export type CandidateV1 = Readonly<{
  candidateDigest: string;
  candidateHead: string;
  candidateId: typeof CANDIDATE_ID_V1;
  canonicalKnowledgeSha256: string;
  counterevidence: readonly CounterevidenceV1[];
  evidence: readonly CandidateEvidenceV1[];
  kaleidoSphereHead: string;
  kaleidoSphereVerdict: ConsumerVerdictV1;
  pansphairaHead: string;
  projectionDigest: string;
  releasedHeads: ReleasedHeadsV1;
  schemaVersion: typeof KALEIDOSPHERE_CANDIDATE_QUARANTINE_SCHEMA_V1;
  unknown: boolean;
}>;

export type AdjudicationReasonCodeV1 =
  | "AUTHORITATIVE_EVIDENCE_ACCEPTED"
  | "AUTHORITATIVE_EVIDENCE_RESTRICTED_UNKNOWN"
  | "CANDIDATE_SCHEMA_DENIED"
  | "CONFLICTING_COUNTEREVIDENCE_DENIED"
  | "FORGED_CANDIDATE_DENIED"
  | "STALE_HEAD_DENIED";

export type AdjudicationV1 = Readonly<{
  authoritativeProjectionDigest: string;
  authoritativeSourceContractSha256: string;
  authority: "NONE";
  canonicalKnowledgeAfterSha256: string;
  canonicalKnowledgeBeforeSha256: string;
  canonicalKnowledgeMutation: "NONE";
  capabilityDelta: "NONE";
  candidateDigest: string;
  effect: "NONE";
  kaleidoSphereVerdictAuthoritative: false;
  outcome: "ACCEPTED_BOUNDED" | "RESTRICTED" | "DENIED";
  reasonCodes: readonly AdjudicationReasonCodeV1[];
  schemaVersion: typeof KALEIDOSPHERE_CANDIDATE_QUARANTINE_SCHEMA_V1;
}>;

type ChainStageV1 = Readonly<{
  digest: string;
  stage: (typeof ADJUDICATION_CHAIN_STAGES)[number];
}>;

export type PairedAdjudicationReceiptV1 = Readonly<{
  adjudication: AdjudicationV1;
  adjudicationDigest: string;
  authority: "NONE";
  candidate: CandidateV1;
  candidateDigest: string;
  chain: readonly ChainStageV1[];
  effect: "NONE";
  receiptDigest: string;
  receiptId: typeof ADJUDICATION_RECEIPT_ID_V1;
  releasedHeads: ReleasedHeadsV1;
  schemaVersion: typeof KALEIDOSPHERE_CANDIDATE_QUARANTINE_SCHEMA_V1;
}>;

export type PairedReceiptVerificationV1 =
  | Readonly<{
    authority: "NONE";
    chainStages: readonly (typeof ADJUDICATION_CHAIN_STAGES)[number][];
    effect: "NONE";
    outcome: "VERIFIED";
    receiptDigest: string;
    releasedHeads: ReleasedHeadsV1;
  }>
  | Readonly<{ outcome: "DENIED"; reasonCodes: readonly ["RECEIPT_DENIED"] }>;

const freeze = <T>(value: T): T => {
  if (Array.isArray(value)) {
    for (const entry of value) freeze(entry);
    return Object.freeze(value);
  }
  if (value !== null && typeof value === "object") {
    for (const entry of Object.values(value as PlainRecord)) freeze(entry);
    return Object.freeze(value);
  }
  return value;
};

const digest = (value: unknown): string => {
  const snapshot = plainSnapshot(value);
  if (snapshot === INVALID) throw new TypeError("XRA_PS_02_INVALID_JSON");
  return createHash("sha256").update(canonicalJson(snapshot), "utf8").digest("hex");
};

function plainSnapshot(value: unknown, seen = new Set<unknown>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : INVALID;
  if (typeof value !== "object" || types.isProxy(value) || seen.has(value)) return INVALID;
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const keys = Reflect.ownKeys(value);
      if (keys.length !== value.length + 1 || keys.some((key) => key !== "length" && (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length))) return INVALID;
      const length = Object.getOwnPropertyDescriptor(value, "length");
      if (!length || length.enumerable || !("value" in length) || length.value !== value.length) return INVALID;
      const output: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return INVALID;
        const child = plainSnapshot(descriptor.value, seen);
        if (child === INVALID) return INVALID;
        output.push(child);
      }
      return output;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) return INVALID;
    const output: PlainRecord = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") return INVALID;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return INVALID;
      const child = plainSnapshot(descriptor.value, seen);
      if (child === INVALID) return INVALID;
      output[key] = child;
    }
    return output;
  } catch {
    return INVALID;
  }
}

const exactRecord = (value: unknown, keys: readonly string[]): PlainRecord | undefined => {
  if (value === null || typeof value !== "object" || types.isProxy(value) || Array.isArray(value)) return undefined;
  const record = value as PlainRecord;
  try {
    if (Object.getPrototypeOf(record) !== Object.prototype) return undefined;
    if (Reflect.ownKeys(record).length !== keys.length || Reflect.ownKeys(record).some((key) => typeof key !== "string" || !keys.includes(key))) return undefined;
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return undefined;
    }
  } catch {
    return undefined;
  }
  return record;
};

const expectedEvidence = (): readonly CandidateEvidenceV1[] => {
  const projection = buildKaleidosphereAnalyticsProjectionV1();
  return projection.edges[0]!.evidence.map((entry) => ({
    evidenceId: entry.evidenceId,
    evidenceRole: entry.evidenceRole,
    evidenceSha256: entry.evidenceSha256,
    evidenceVersion: entry.evidenceVersion,
  }));
};

export type AuthoritativeAdjudicationInputsV1 = Readonly<{
  canonicalKnowledgeSha256: typeof CANONICAL_KNOWLEDGE_SHA256;
  evidence: readonly CandidateEvidenceV1[];
  kaleidoSphereReleasedHead: typeof KALEIDOSPHERE_EXACT_RELEASED_HEAD_V1;
  projectionDigest: string;
  releasedPansphairaHead: typeof PANSPHAIRA_EXACT_RELEASED_HEAD_V1;
  schemaVersion: typeof KALEIDOSPHERE_CANDIDATE_QUARANTINE_SCHEMA_V1;
  sourceContractSha256: typeof SOURCE_CONTRACT_SHA256;
}>;

export function buildAuthoritativeAdjudicationInputs(): AuthoritativeAdjudicationInputsV1 {
  const projection = buildKaleidosphereAnalyticsProjectionV1();
  return freeze({
    canonicalKnowledgeSha256: CANONICAL_KNOWLEDGE_SHA256,
    evidence: expectedEvidence(),
    kaleidoSphereReleasedHead: KALEIDOSPHERE_EXACT_RELEASED_HEAD_V1,
    projectionDigest: projection.projectionDigest,
    releasedPansphairaHead: PANSPHAIRA_EXACT_RELEASED_HEAD_V1,
    schemaVersion: KALEIDOSPHERE_CANDIDATE_QUARANTINE_SCHEMA_V1,
    sourceContractSha256: SOURCE_CONTRACT_SHA256,
  });
}

const candidateBody = (candidate: CandidateV1): Omit<CandidateV1, "candidateDigest"> => {
  const { candidateDigest: _candidateDigest, ...body } = candidate;
  return body;
};

export function candidateDigestV1(candidate: CandidateV1): string {
  return digest(candidateBody(candidate));
}

export function createCandidateV1(options: Readonly<{
  kaleidoSphereVerdict: ConsumerVerdictV1;
  releasedHeads: ReleasedHeadsV1;
  counterevidence?: readonly CounterevidenceV1[];
  unknown?: boolean;
}>): CandidateV1 {
  const authoritative = buildAuthoritativeAdjudicationInputs();
  const body = {
    candidateHead: options.releasedHeads.kaleidoSphere,
    candidateId: CANDIDATE_ID_V1,
    canonicalKnowledgeSha256: authoritative.canonicalKnowledgeSha256,
    counterevidence: [...(options.counterevidence ?? [])],
    evidence: authoritative.evidence.map((entry) => ({ ...entry })),
    kaleidoSphereHead: options.releasedHeads.kaleidoSphere,
    kaleidoSphereVerdict: options.kaleidoSphereVerdict,
    pansphairaHead: options.releasedHeads.pansphaira,
    projectionDigest: authoritative.projectionDigest,
    releasedHeads: { ...options.releasedHeads },
    schemaVersion: KALEIDOSPHERE_CANDIDATE_QUARANTINE_SCHEMA_V1,
    unknown: options.unknown ?? false,
  } as const;
  return freeze({ ...body, candidateDigest: digest(body) });
}

const result = (
  authoritative: AuthoritativeAdjudicationInputsV1,
  outcome: AdjudicationV1["outcome"],
  reasonCodes: readonly AdjudicationReasonCodeV1[],
  candidateDigest = "",
): AdjudicationV1 => freeze({
  authoritativeProjectionDigest: authoritative.projectionDigest,
  authoritativeSourceContractSha256: authoritative.sourceContractSha256,
  authority: "NONE",
  canonicalKnowledgeAfterSha256: authoritative.canonicalKnowledgeSha256,
  canonicalKnowledgeBeforeSha256: authoritative.canonicalKnowledgeSha256,
  canonicalKnowledgeMutation: "NONE",
  capabilityDelta: "NONE",
  candidateDigest,
  effect: "NONE",
  kaleidoSphereVerdictAuthoritative: false,
  outcome,
  reasonCodes: [...reasonCodes],
  schemaVersion: KALEIDOSPHERE_CANDIDATE_QUARANTINE_SCHEMA_V1,
});

const validHeads = (value: unknown): value is ReleasedHeadsV1 => {
  const heads = exactRecord(value, ["kaleidoSphere", "pansphaira"]);
  return heads !== undefined
    && typeof heads.pansphaira === "string"
    && typeof heads.kaleidoSphere === "string"
    && HEAD40.test(heads.pansphaira)
    && HEAD40.test(heads.kaleidoSphere);
};

const validCandidateRecord = (value: unknown): value is CandidateV1 => {
  const candidate = exactRecord(value, [
    "candidateDigest", "candidateHead", "candidateId", "canonicalKnowledgeSha256", "counterevidence", "evidence",
    "kaleidoSphereHead", "kaleidoSphereVerdict", "pansphairaHead", "projectionDigest", "releasedHeads", "schemaVersion", "unknown",
  ]);
  if (!candidate || !validHeads(candidate.releasedHeads)) return false;
  if (
    typeof candidate.candidateDigest !== "string" || !HEX64.test(candidate.candidateDigest)
    || typeof candidate.candidateHead !== "string" || !HEAD40.test(candidate.candidateHead)
    || candidate.candidateId !== CANDIDATE_ID_V1
    || typeof candidate.canonicalKnowledgeSha256 !== "string" || !HEX64.test(candidate.canonicalKnowledgeSha256)
    || typeof candidate.kaleidoSphereHead !== "string" || !HEAD40.test(candidate.kaleidoSphereHead)
    || typeof candidate.pansphairaHead !== "string" || !HEAD40.test(candidate.pansphairaHead)
    || typeof candidate.projectionDigest !== "string" || !HEX64.test(candidate.projectionDigest)
    || candidate.schemaVersion !== KALEIDOSPHERE_CANDIDATE_QUARANTINE_SCHEMA_V1
    || typeof candidate.unknown !== "boolean"
    || !["ACCEPTED_BOUNDED", "RESTRICTED", "DENIED", "UNKNOWN"].includes(candidate.kaleidoSphereVerdict as string)
    || !Array.isArray(candidate.evidence)
    || !Array.isArray(candidate.counterevidence)
  ) return false;
  return candidate.evidence.every((entry) => {
    const evidence = exactRecord(entry, ["evidenceId", "evidenceRole", "evidenceSha256", "evidenceVersion"]);
    return evidence !== undefined
      && typeof evidence.evidenceId === "string"
      && typeof evidence.evidenceRole === "string"
      && typeof evidence.evidenceSha256 === "string"
      && HEX64.test(evidence.evidenceSha256)
      && typeof evidence.evidenceVersion === "string";
  }) && candidate.counterevidence.every((entry) => {
    const counterevidence = exactRecord(entry, ["evidenceId", "evidenceSha256", "reason"]);
    return counterevidence !== undefined
      && typeof counterevidence.evidenceId === "string"
      && typeof counterevidence.evidenceSha256 === "string"
      && HEX64.test(counterevidence.evidenceSha256)
      && counterevidence.reason === "CONTRADICTS_OWNER_EVIDENCE";
  });
};

const validAdjudicationRecord = (value: unknown): value is AdjudicationV1 => {
  const adjudication = exactRecord(value, [
    "authoritativeProjectionDigest", "authoritativeSourceContractSha256", "authority", "canonicalKnowledgeAfterSha256",
    "canonicalKnowledgeBeforeSha256", "canonicalKnowledgeMutation", "capabilityDelta", "candidateDigest", "effect",
    "kaleidoSphereVerdictAuthoritative", "outcome", "reasonCodes", "schemaVersion",
  ]);
  if (!adjudication || !Array.isArray(adjudication.reasonCodes)) return false;
  return typeof adjudication.authoritativeProjectionDigest === "string"
    && HEX64.test(adjudication.authoritativeProjectionDigest)
    && typeof adjudication.authoritativeSourceContractSha256 === "string"
    && HEX64.test(adjudication.authoritativeSourceContractSha256)
    && adjudication.authority === "NONE"
    && typeof adjudication.canonicalKnowledgeAfterSha256 === "string"
    && HEX64.test(adjudication.canonicalKnowledgeAfterSha256)
    && typeof adjudication.canonicalKnowledgeBeforeSha256 === "string"
    && HEX64.test(adjudication.canonicalKnowledgeBeforeSha256)
    && adjudication.canonicalKnowledgeMutation === "NONE"
    && adjudication.capabilityDelta === "NONE"
    && typeof adjudication.candidateDigest === "string"
    && HEX64.test(adjudication.candidateDigest)
    && adjudication.effect === "NONE"
    && adjudication.kaleidoSphereVerdictAuthoritative === false
    && ["ACCEPTED_BOUNDED", "RESTRICTED", "DENIED"].includes(adjudication.outcome as string)
    && adjudication.reasonCodes.every((reason) => [
      "AUTHORITATIVE_EVIDENCE_ACCEPTED",
      "AUTHORITATIVE_EVIDENCE_RESTRICTED_UNKNOWN",
      "CANDIDATE_SCHEMA_DENIED",
      "CONFLICTING_COUNTEREVIDENCE_DENIED",
      "FORGED_CANDIDATE_DENIED",
      "STALE_HEAD_DENIED",
    ].includes(reason as string))
    && adjudication.schemaVersion === KALEIDOSPHERE_CANDIDATE_QUARANTINE_SCHEMA_V1;
};

const authoritativeHeads = (heads: ReleasedHeadsV1, authoritative: AuthoritativeAdjudicationInputsV1): boolean => (
  heads.pansphaira === authoritative.releasedPansphairaHead
  && heads.kaleidoSphere === authoritative.kaleidoSphereReleasedHead
);

const arraysEqual = (left: unknown, right: unknown): boolean => canonicalJson(left) === canonicalJson(right);

export function adjudicateCandidateV1(input: unknown): AdjudicationV1 {
  const authoritative = buildAuthoritativeAdjudicationInputs();
  const envelope = exactRecord(input, ["candidate", "releasedHeads"]);
  if (!envelope || !validHeads(envelope.releasedHeads)) return result(authoritative, "DENIED", ["CANDIDATE_SCHEMA_DENIED"]);
  const releasedHeads = envelope.releasedHeads;
  if (!authoritativeHeads(releasedHeads, authoritative)) return result(authoritative, "DENIED", ["STALE_HEAD_DENIED"]);

  const candidate = exactRecord(envelope.candidate, [
    "candidateDigest", "candidateHead", "candidateId", "canonicalKnowledgeSha256", "counterevidence", "evidence",
    "kaleidoSphereHead", "kaleidoSphereVerdict", "pansphairaHead", "projectionDigest", "releasedHeads", "schemaVersion", "unknown",
  ]);
  if (!candidate || plainSnapshot(candidate) === INVALID) return result(authoritative, "DENIED", ["CANDIDATE_SCHEMA_DENIED"]);
  const candidateDigest = typeof candidate.candidateDigest === "string" ? candidate.candidateDigest : "";
  if (
    candidate.schemaVersion !== authoritative.schemaVersion
    || candidate.candidateId !== CANDIDATE_ID_V1
    || !validHeads(candidate.releasedHeads)
    || !arraysEqual(candidate.releasedHeads, releasedHeads)
    || candidate.pansphairaHead !== releasedHeads.pansphaira
    || candidate.kaleidoSphereHead !== releasedHeads.kaleidoSphere
    || candidate.candidateHead !== releasedHeads.kaleidoSphere
    || typeof candidate.candidateDigest !== "string" || !HEX64.test(candidate.candidateDigest)
  ) return result(authoritative, "DENIED", ["FORGED_CANDIDATE_DENIED"], candidateDigest);
  let computedCandidateDigest: string;
  try {
    computedCandidateDigest = candidateDigestV1(candidate as CandidateV1);
  } catch {
    return result(authoritative, "DENIED", ["CANDIDATE_SCHEMA_DENIED"], candidateDigest);
  }
  if (computedCandidateDigest !== candidate.candidateDigest) return result(authoritative, "DENIED", ["FORGED_CANDIDATE_DENIED"], candidateDigest);
  if (![
    "ACCEPTED_BOUNDED", "RESTRICTED", "DENIED", "UNKNOWN",
  ].includes(candidate.kaleidoSphereVerdict as string) || typeof candidate.unknown !== "boolean" || !Array.isArray(candidate.counterevidence)) return result(authoritative, "DENIED", ["CANDIDATE_SCHEMA_DENIED"], candidateDigest);
  if (
    candidate.canonicalKnowledgeSha256 !== authoritative.canonicalKnowledgeSha256
    || candidate.projectionDigest !== authoritative.projectionDigest
    || !arraysEqual(candidate.evidence, authoritative.evidence)
  ) return result(authoritative, "DENIED", ["FORGED_CANDIDATE_DENIED"], candidateDigest);
  if (candidate.counterevidence.length > 0) return result(authoritative, "DENIED", ["CONFLICTING_COUNTEREVIDENCE_DENIED"], candidateDigest);
  if (candidate.unknown) return result(authoritative, "RESTRICTED", ["AUTHORITATIVE_EVIDENCE_RESTRICTED_UNKNOWN"], candidateDigest);
  return result(authoritative, "ACCEPTED_BOUNDED", ["AUTHORITATIVE_EVIDENCE_ACCEPTED"], candidateDigest);
}

const receiptBody = (receipt: PairedAdjudicationReceiptV1): Omit<PairedAdjudicationReceiptV1, "receiptDigest"> => {
  const { receiptDigest: _receiptDigest, ...body } = receipt;
  return body;
};

const authoritativeChain = (
  authoritative: AuthoritativeAdjudicationInputsV1,
  candidate: CandidateV1,
  adjudication: AdjudicationV1,
): readonly ChainStageV1[] => {
  const generationDigest = digest({
    schemaVersion: KALEIDOSPHERE_CANDIDATE_QUARANTINE_SCHEMA_V1,
    sourceContractSha256: authoritative.sourceContractSha256,
    stage: "GENERATION",
  });
  const projectionDigest = authoritative.projectionDigest;
  const ingestionDigest = digest({
    inputDigest: projectionDigest,
    schemaVersion: KALEIDOSPHERE_CANDIDATE_QUARANTINE_SCHEMA_V1,
    stage: "INGESTION",
  });
  const semanticsDigest = digest({
    evidence: authoritative.evidence,
    inputDigest: ingestionDigest,
    schemaVersion: KALEIDOSPHERE_CANDIDATE_QUARANTINE_SCHEMA_V1,
    stage: "SEMANTICS",
  });
  const analysisDigest = digest({
    candidateCounterevidence: candidate.counterevidence,
    candidateUnknown: candidate.unknown,
    consumerVerdict: candidate.kaleidoSphereVerdict,
    inputDigest: semanticsDigest,
    projectionDigest,
    schemaVersion: KALEIDOSPHERE_CANDIDATE_QUARANTINE_SCHEMA_V1,
    stage: "ANALYSIS",
  });
  return [
    { stage: "GENERATION", digest: generationDigest },
    { stage: "PROJECTION", digest: projectionDigest },
    { stage: "INGESTION", digest: ingestionDigest },
    { stage: "SEMANTICS", digest: semanticsDigest },
    { stage: "ANALYSIS", digest: analysisDigest },
    { stage: "CANDIDATE", digest: candidate.candidateDigest },
    { stage: "ADJUDICATION", digest: digest(adjudication) },
  ];
};

export function createPairedAdjudicationReceiptV1(input: Readonly<{
  adjudication: AdjudicationV1;
  candidate: CandidateV1;
  releasedHeads: ReleasedHeadsV1;
}>): PairedAdjudicationReceiptV1 {
  const authoritative = buildAuthoritativeAdjudicationInputs();
  if (!validHeads(input.releasedHeads) || !authoritativeHeads(input.releasedHeads, authoritative)) throw new TypeError("XRA_PS_02_RELEASED_HEAD_DENIED");
  if (
    !validCandidateRecord(input.candidate)
    || !validAdjudicationRecord(input.adjudication)
    ||
    candidateDigestV1(input.candidate) !== input.candidate.candidateDigest
    || canonicalJson(input.candidate.releasedHeads) !== canonicalJson(input.releasedHeads)
    || canonicalJson(input.adjudication) !== canonicalJson(adjudicateCandidateV1({ candidate: input.candidate, releasedHeads: input.releasedHeads }))
  ) throw new TypeError("XRA_PS_02_RECEIPT_INPUT_DENIED");
  const chain = authoritativeChain(authoritative, input.candidate, input.adjudication);
  const body = {
    adjudication: input.adjudication,
    adjudicationDigest: digest(input.adjudication),
    authority: "NONE",
    candidate: input.candidate,
    candidateDigest: input.candidate.candidateDigest,
    chain,
    effect: "NONE",
    receiptId: ADJUDICATION_RECEIPT_ID_V1,
    releasedHeads: { ...input.releasedHeads },
    schemaVersion: KALEIDOSPHERE_CANDIDATE_QUARANTINE_SCHEMA_V1,
  } as const;
  return freeze({ ...body, receiptDigest: digest(body) });
}

export function verifyPairedAdjudicationReceiptV1(value: unknown): PairedReceiptVerificationV1 {
  const snapshot = plainSnapshot(value);
  if (snapshot === INVALID || snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) return { outcome: "DENIED", reasonCodes: ["RECEIPT_DENIED"] };
  const receipt = snapshot as PlainRecord;
  const keys = ["adjudication", "adjudicationDigest", "authority", "candidate", "candidateDigest", "chain", "effect", "receiptDigest", "receiptId", "releasedHeads", "schemaVersion"] as const;
  if (Reflect.ownKeys(receipt).length !== keys.length || Reflect.ownKeys(receipt).some((key) => typeof key !== "string" || !keys.includes(key as (typeof keys)[number]))) return { outcome: "DENIED", reasonCodes: ["RECEIPT_DENIED"] };
  try {
    const authoritative = buildAuthoritativeAdjudicationInputs();
    if (
      receipt.schemaVersion !== KALEIDOSPHERE_CANDIDATE_QUARANTINE_SCHEMA_V1
      || receipt.receiptId !== ADJUDICATION_RECEIPT_ID_V1
      || receipt.authority !== "NONE"
      || receipt.effect !== "NONE"
      || typeof receipt.adjudicationDigest !== "string"
      || !HEX64.test(receipt.adjudicationDigest)
      || typeof receipt.candidateDigest !== "string"
      || !HEX64.test(receipt.candidateDigest)
      || typeof receipt.receiptDigest !== "string"
      || !HEX64.test(receipt.receiptDigest)
      || !validHeads(receipt.releasedHeads)
      || !authoritativeHeads(receipt.releasedHeads, authoritative)
      || !validCandidateRecord(receipt.candidate)
      || !validAdjudicationRecord(receipt.adjudication)
    ) return { outcome: "DENIED", reasonCodes: ["RECEIPT_DENIED"] };
    const candidate = receipt.candidate;
    const adjudication = receipt.adjudication;
    const expectedAdjudication = adjudicateCandidateV1({ candidate, releasedHeads: receipt.releasedHeads });
    if (
      receipt.candidateDigest !== candidate.candidateDigest
      || candidate.candidateDigest !== candidateDigestV1(candidate)
      || receipt.adjudicationDigest !== digest(adjudication)
      || canonicalJson(adjudication) !== canonicalJson(expectedAdjudication)
    ) return { outcome: "DENIED", reasonCodes: ["RECEIPT_DENIED"] };
    const chain = receipt.chain;
    if (!Array.isArray(chain) || chain.length !== ADJUDICATION_CHAIN_STAGES.length || chain.some((entry, index) => {
      const stage = exactRecord(entry, ["digest", "stage"]);
      return !stage || stage.stage !== ADJUDICATION_CHAIN_STAGES[index] || typeof stage.digest !== "string" || !HEX64.test(stage.digest);
    })) return { outcome: "DENIED", reasonCodes: ["RECEIPT_DENIED"] };
    if (!arraysEqual(chain, authoritativeChain(authoritative, candidate, adjudication))) return { outcome: "DENIED", reasonCodes: ["RECEIPT_DENIED"] };
    const expectedDigest = digest(receiptBody({ ...receipt, receiptDigest: receipt.receiptDigest } as PairedAdjudicationReceiptV1));
    if (receipt.receiptDigest !== expectedDigest) return { outcome: "DENIED", reasonCodes: ["RECEIPT_DENIED"] };
    return {
      authority: "NONE",
      chainStages: [...ADJUDICATION_CHAIN_STAGES],
      effect: "NONE",
      outcome: "VERIFIED",
      receiptDigest: receipt.receiptDigest,
      releasedHeads: receipt.releasedHeads,
    };
  } catch {
    return { outcome: "DENIED", reasonCodes: ["RECEIPT_DENIED"] };
  }
}

// ===== XRA-PS-02 native wire/head integration (reconciled released pair) =====
//
// The local flat synthetic candidate above and its bound heads
// (24db4e92…/90c574e9…) are superseded, for the native scope, by the reconciled
// released pair below. The independent PAN adjudicator here consumes the real
// KaleidoSphere native authority-free service candidate (served over loopback
// HTTP by the service at its exact released head) and re-derives everything it
// can from the canonical transport bytes and PAN-owned authority: it never
// trusts the service envelope, the KS verifier, or any service-side verdict.

export const PANSPHAIRA_RECONCILED_RELEASED_HEAD_V1 = "7f662672bfc45087342f23e5c589d43598f5c20d" as const;
export const KALEIDOSPHERE_RECONCILED_RELEASED_HEAD_V1 = "545a3b44ea88c96eded060c11c7c3a2afe0edff6" as const;
/** Released KaleidoSphere service tree bound to the exact released head. */
export const KALEIDOSPHERE_RECONCILED_RELEASED_TREE_V1 = "c0699e1b4cfdfaf3076928e644ba5da3e9b7798c" as const;
/** Later byte-equivalent PANSPHAIRA head bound by the released sidecar; deliberately DISTINCT from the release commit. */
export const PANSPHAIRA_RECONCILED_HEAD_COMMIT_V1 = "988395110a9189d1b8cd4ee98184ed5c1d77a15d" as const;
export const PANSPHAIRA_RECONCILED_RELEASE_TAG_V1 = "2026_09_05_v1" as const;
export const PANSPHAIRA_RECONCILED_RELEASE_RECEIPT_SHA256_V1 = "bd485d4525cfce9b843de54b2fb6e30e30e560857e6f06faa0f494f65dddb1c6" as const;
const NATIVE_SOURCE_FILE_IDENTITY_PATH_V1 = "tests/fixtures/cks-analytics/projection-v1.json" as const;
const NATIVE_PROJECTION_CONTRACT_SHA256_V1 = "99e1ac62cfda3bef59ba310e00f7daa16d80b170ae5e7a7eaa3fff314d1a5d9a" as const;
const NATIVE_ANALYSIS_CONTRACT_SHA256_V1 = "913c2599099e7324a17a6dcab6008b107e7869fc4ba840317c1534ee013302bd" as const;
const NATIVE_RELEASE_SIDECAR_SHA256_V1 = "1b6f55dd5507ec6c8894d2b35377439ee206d832d4cf19d9e3dc687ab4a3bce4" as const;
const NATIVE_ANALYSIS_ID_V1 = "pansphaira/native-edge-evidence-coverage-analysis" as const;

export const NATIVE_CANDIDATE_SCHEMA_V1 = "kaleidosphere.pansphaira-analytics/native-authority-free-candidate/v1" as const;
export const NATIVE_ADJUDICATION_SCHEMA_V1 = "pansphaira.xra-ps-02/native-candidate-adjudication/v1" as const;
export const NATIVE_ADJUDICATION_CONTEXT_SCHEMA_V1 = "pansphaira.xra-ps-02/native-adjudication-context/v1" as const;
export const NATIVE_RECEIPT_SCHEMA_V1 = "pansphaira.xra-ps-02/native-paired-receipt/v1" as const;
export const NATIVE_ADJUDICATION_RECEIPT_ID_V1 = "pansphaira:xra-ps-02-native-paired-receipt-001" as const;

export const RECONCILED_RELEASED_HEADS_V1: ReleasedHeadsV1 = freeze({
  pansphaira: PANSPHAIRA_RECONCILED_RELEASED_HEAD_V1,
  kaleidoSphere: KALEIDOSPHERE_RECONCILED_RELEASED_HEAD_V1,
});

const NATIVE_CANDIDATE_NONCLAIMS_V1 = Object.freeze([
  "No autonomous promotion: this native candidate is state CANDIDATE and carries no promotion, mutation, execution, or publication authority.",
  "No relation-truth or knowledge-effectiveness claim: the analysis emits structural node/edge/evidence coverage only; no relation truth or effectiveness is asserted.",
  "No generic PANSPHAIRA domain in KaleidoSphere: the analysis is confined to the one closed native nodes/edges projection v1 shape.",
  "No external effect: no push, publish, release, credential use, customer data access, or production-data claim is made or implied by this candidate.",
]);

/** Identity frame of the versioned native candidate that PAN adjudicates. */
const NATIVE_CANDIDATE_FRAME_V1 = Object.freeze({
  schemaVersion: NATIVE_CANDIDATE_SCHEMA_V1,
  issue: "XRA-KS-01",
  state: "CANDIDATE",
  authority: { promote: false, mutate: false, execute: false, publish: false, capabilities: [], effects: [] },
  nonclaims: [...NATIVE_CANDIDATE_NONCLAIMS_V1],
});

const NATIVE_EXPECTED_KALEIDOSPHERE_HEAD_V1 = Object.freeze({
  commitOid: KALEIDOSPHERE_RECONCILED_RELEASED_HEAD_V1,
  treeOid: KALEIDOSPHERE_RECONCILED_RELEASED_TREE_V1,
});

const NATIVE_EXPECTED_PANSPHAIRA_HEAD_V1 = Object.freeze({
  commitOid: PANSPHAIRA_RECONCILED_HEAD_COMMIT_V1,
  releaseCommit: PANSPHAIRA_RECONCILED_RELEASED_HEAD_V1,
  releaseReceiptSha256: PANSPHAIRA_RECONCILED_RELEASE_RECEIPT_SHA256_V1,
  releaseTag: PANSPHAIRA_RECONCILED_RELEASE_TAG_V1,
  status: "RELEASED",
});

const NATIVE_CANDIDATE_KEYS_V1 = [
  "analysis", "authority", "bindings", "claims", "coverage", "counterevidence",
  "issue", "nonclaims", "resultSha256", "schemaVersion", "state",
] as const;

const NATIVE_ANALYSIS_KEYS_V1 = ["claims", "contractSha256", "coverage", "counterevidence", "resultSha256"] as const;

export type NativeAdjudicationReasonCodeV1 =
  | "NATIVE_CANDIDATE_SCHEMA_DENIED"
  | "NATIVE_CONFLICTING_COUNTEREVIDENCE_DENIED"
  | "NATIVE_EVIDENCE_ACCEPTED"
  | "NATIVE_EVIDENCE_RESTRICTED_UNKNOWN"
  | "NATIVE_FORGED_CANDIDATE_DENIED"
  | "NATIVE_INDEPENDENT_PROVENANCE_DENIED"
  | "NATIVE_STALE_HEAD_DENIED";

/**
 * Versioned, independently sourced PAN adjudication context. Native v1 service
 * output freezes unknown=false and an empty counterevidence channel, so the
 * restriction and conflict cases for AC02 are defined HERE, by PAN adjudication
 * context, never fabricated as normal service output.
 */
export type NativeAdjudicationContextV1 = Readonly<{
  contextId: string;
  counterevidence: readonly CounterevidenceV1[];
  provenance: Readonly<{
    canonicalKnowledgeSha256: string;
    source: "PANSPHAIRA_INDEPENDENT_ADJUDICATION";
    sourceContractSha256: string;
  }>;
  schemaVersion: typeof NATIVE_ADJUDICATION_CONTEXT_SCHEMA_V1;
  unknown: boolean;
}>;

export type NativeAdjudicationV1 = Readonly<{
  adjudicationContextId: string;
  authoritativeProjectionDigest: string;
  authoritativeSourceContractSha256: string;
  authority: "NONE";
  canonicalKnowledgeAfterSha256: string;
  canonicalKnowledgeBeforeSha256: string;
  canonicalKnowledgeMutation: "NONE";
  canonicalTransportSha256: string;
  capabilityDelta: "NONE";
  candidateDigest: string;
  effect: "NONE";
  kaleidoSphereServiceVerdictAuthoritative: false;
  outcome: "ACCEPTED_BOUNDED" | "RESTRICTED" | "DENIED";
  projectionBodyDigest: string;
  rawArtifactSha256: string;
  reasonCodes: readonly NativeAdjudicationReasonCodeV1[];
  releasedHeads: ReleasedHeadsV1;
  schemaVersion: typeof NATIVE_ADJUDICATION_SCHEMA_V1;
}>;

export type NativePairedAdjudicationReceiptV1 = Readonly<{
  adjudication: NativeAdjudicationV1;
  adjudicationDigest: string;
  authority: "NONE";
  candidate: unknown;
  candidateDigest: string;
  canonicalTransportSha256: string;
  chain: readonly ChainStageV1[];
  context: unknown;
  effect: "NONE";
  rawArtifactSha256: string;
  receiptDigest: string;
  receiptId: typeof NATIVE_ADJUDICATION_RECEIPT_ID_V1;
  releasedHeads: ReleasedHeadsV1;
  schemaVersion: typeof NATIVE_RECEIPT_SCHEMA_V1;
}>;

export type NativePairedReceiptVerificationV1 =
  | Readonly<{
    authority: "NONE";
    chainStages: readonly (typeof ADJUDICATION_CHAIN_STAGES)[number][];
    effect: "NONE";
    outcome: "VERIFIED";
    receiptDigest: string;
    releasedHeads: ReleasedHeadsV1;
  }>
  | Readonly<{ outcome: "DENIED"; reasonCodes: readonly ["NATIVE_RECEIPT_DENIED"] }>;

export type NativeServiceWireCodeV1 = "XRA_PS_02_NATIVE_SERVICE_UNAVAILABLE" | "XRA_PS_02_NATIVE_WIRE_SHAPE_DENIED";

export type NativeServiceResponseV1 =
  | Readonly<{ candidate: unknown; issue: "XRA-KS-01"; requestSha256: string; status: "CANDIDATE" }>
  | Readonly<{ candidate: null; code: string; issue: "XRA-KS-01"; ordinaryAnswer: null; requestSha256: string | null; successfulOrdinaryAnswer: false; status: "DENIED" }>
  | Readonly<{ candidate: null; code: NativeServiceWireCodeV1; issue: "XRA-KS-01"; requestSha256: null; status: "UNAVAILABLE" }>;

const isByteView = (value: unknown): value is Uint8Array => value instanceof Uint8Array;
const digestBytes = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

export function createNativeAdjudicationContextV1(options: Readonly<{
  contextId: string;
  counterevidence?: readonly CounterevidenceV1[];
  unknown?: boolean;
}>): NativeAdjudicationContextV1 {
  if (typeof options.contextId !== "string" || options.contextId.length === 0) throw new TypeError("XRA_PS_02_NATIVE_CONTEXT_INPUT_DENIED");
  const body = {
    contextId: options.contextId,
    counterevidence: [...(options.counterevidence ?? [])],
    provenance: {
      canonicalKnowledgeSha256: CANONICAL_KNOWLEDGE_SHA256,
      source: "PANSPHAIRA_INDEPENDENT_ADJUDICATION",
      sourceContractSha256: SOURCE_CONTRACT_SHA256,
    },
    schemaVersion: NATIVE_ADJUDICATION_CONTEXT_SCHEMA_V1,
    unknown: options.unknown ?? false,
  } as const;
  return freeze(body);
}

/** Canonical transport form of the raw released artifact (byte-identical to the service canonicalizer). */
export function nativeTransportBytesV1(rawArtifactBytes: Uint8Array): Buffer {
  if (!isByteView(rawArtifactBytes)) throw new TypeError("XRA_PS_02_NATIVE_ARTIFACT_INPUT_DENIED");
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(rawArtifactBytes).toString("utf8"));
  } catch {
    throw new TypeError("XRA_PS_02_NATIVE_ARTIFACT_INVALID");
  }
  const snapshot = plainSnapshot(parsed);
  if (snapshot === INVALID) throw new TypeError("XRA_PS_02_NATIVE_ARTIFACT_INVALID");
  return Buffer.from(canonicalJson(snapshot), "utf8");
}

/** The PAN-side digest trio re-derived independently from the raw artifact bytes. */
export function nativeProjectionDigestV1(rawArtifactBytes: Uint8Array): Readonly<{
  canonicalTransportSha256: string;
  projectionBodyDigest: string;
  rawArtifactSha256: string;
}> {
  const transportBytes = nativeTransportBytesV1(rawArtifactBytes);
  const body: PlainRecord = {};
  for (const [key, value] of Object.entries(JSON.parse(transportBytes.toString("utf8")))) {
    if (key !== "projectionDigest") body[key] = value;
  }
  return freeze({
    canonicalTransportSha256: digestBytes(transportBytes),
    projectionBodyDigest: digestBytes(Buffer.from(canonicalJson(body), "utf8")),
    rawArtifactSha256: digestBytes(rawArtifactBytes),
  });
}

/** PAN-side digest over the whole native candidate frame (independent of the service result digest). */
export function nativeCandidateDigestV1(candidate: unknown): string {
  const record = exactRecord(candidate, [...NATIVE_CANDIDATE_KEYS_V1]);
  if (record === undefined) throw new TypeError("XRA_PS_02_NATIVE_CANDIDATE_INVALID");
  const { resultSha256: _resultSha256, ...body } = record;
  return digest(body);
}

const validNativeContextRecord = (value: unknown): boolean => {
  const context = exactRecord(value, ["contextId", "counterevidence", "provenance", "schemaVersion", "unknown"]);
  if (context === undefined || plainSnapshot(value) === INVALID) return false;
  if (typeof context.contextId !== "string" || context.contextId.length === 0) return false;
  if (context.schemaVersion !== NATIVE_ADJUDICATION_CONTEXT_SCHEMA_V1 || typeof context.unknown !== "boolean") return false;
  if (!Array.isArray(context.counterevidence)) return false;
  if (!context.counterevidence.every((entry) => {
    const record = exactRecord(entry, ["evidenceId", "evidenceSha256", "reason"]);
    return record !== undefined
      && typeof record.evidenceId === "string"
      && typeof record.evidenceSha256 === "string"
      && HEX64.test(record.evidenceSha256)
      && record.reason === "CONTRADICTS_OWNER_EVIDENCE";
  })) return false;
  const provenance = exactRecord(context.provenance, ["canonicalKnowledgeSha256", "source", "sourceContractSha256"]);
  return provenance !== undefined
    && provenance.source === "PANSPHAIRA_INDEPENDENT_ADJUDICATION"
    && provenance.canonicalKnowledgeSha256 === CANONICAL_KNOWLEDGE_SHA256
    && provenance.sourceContractSha256 === SOURCE_CONTRACT_SHA256;
};

const validNativeCandidateRecord = (value: unknown): boolean => {
  const candidate = exactRecord(value, [...NATIVE_CANDIDATE_KEYS_V1]);
  if (candidate === undefined || plainSnapshot(value) === INVALID) return false;
  if (
    typeof candidate.schemaVersion !== "string"
    || typeof candidate.issue !== "string"
    || typeof candidate.state !== "string"
    || typeof candidate.resultSha256 !== "string"
    || !HEX64.test(candidate.resultSha256)
    || !Array.isArray(candidate.nonclaims)
    || !candidate.nonclaims.every((entry) => typeof entry === "string")
    || !Array.isArray(candidate.counterevidence)
    || !candidate.counterevidence.every((entry) => {
      const record = exactRecord(entry, ["check", "claim", "observed", "status"]);
      return record !== undefined
        && typeof record.claim === "string"
        && typeof record.check === "string"
        && typeof record.observed === "number"
        && typeof record.status === "string";
    })
  ) return false;
  const analysis = exactRecord(candidate.analysis, ["contractSha256", "id", "version"]);
  if (analysis === undefined || !Object.values(analysis).every((entry) => typeof entry === "string" && entry.length > 0)) return false;
  const claims = exactRecord(candidate.claims, ["computed", "observed"]);
  if (claims === undefined) return false;
  const computed = exactRecord(claims.computed, [
    "counterevidenceTotal", "decisionNodeCount", "edgeCount", "evidenceCount",
    "frozenReceiptsEstablishingEdge", "knowledgeNodeCount", "nodeCount", "unknownTotal",
  ]);
  if (computed === undefined || !Object.values(computed).every((entry) => typeof entry === "number" && Number.isInteger(entry) && entry >= 0)) return false;
  const observed = exactRecord(claims.observed, [
    "authority", "edgeRelation", "evidenceRoles", "nodeIds", "nodeKinds",
    "nonclaimCount", "promotion", "relationTruth", "sourceContract", "sourceContractVersion",
  ]);
  if (
    observed === undefined
    || !Array.isArray(observed.nodeIds)
    || !Array.isArray(observed.nodeKinds)
    || !Array.isArray(observed.evidenceRoles)
    || typeof observed.nonclaimCount !== "number"
  ) return false;
  const coverage = exactRecord(candidate.coverage, ["counterevidence", "edges", "evidence", "nodes", "source", "unknownChannel"]);
  if (coverage === undefined || !Object.values(coverage).every((entry) => typeof entry === "string")) return false;
  const bindings = exactRecord(candidate.bindings, [
    "analysisContractSha256", "canonicalTransportSha256", "environmentSha256", "kaleidosphereHead",
    "nativeProjectionContractSha256", "pansphairaHead", "projectionBodyDigest", "rawArtifactSha256", "releaseSidecarSha256",
  ]);
  if (bindings === undefined) return false;
  for (const key of ["analysisContractSha256", "canonicalTransportSha256", "environmentSha256", "nativeProjectionContractSha256", "projectionBodyDigest", "rawArtifactSha256", "releaseSidecarSha256"]) {
    if (typeof bindings[key] !== "string" || !HEX64.test(bindings[key])) return false;
  }
  const kaleidosphereHead = exactRecord(bindings.kaleidosphereHead, ["commitOid", "treeOid"]);
  if (kaleidosphereHead === undefined || !HEAD40.test(String(kaleidosphereHead.commitOid)) || !HEAD40.test(String(kaleidosphereHead.treeOid))) return false;
  const pansphairaHead = exactRecord(bindings.pansphairaHead, ["commitOid", "releaseCommit", "releaseReceiptSha256", "releaseTag", "sourceFileIdentity", "status"]);
  if (
    pansphairaHead === undefined
    || !HEAD40.test(String(pansphairaHead.commitOid))
    || !HEAD40.test(String(pansphairaHead.releaseCommit))
    || typeof pansphairaHead.releaseReceiptSha256 !== "string"
    || !HEX64.test(String(pansphairaHead.releaseReceiptSha256))
    || typeof pansphairaHead.releaseTag !== "string"
    || typeof pansphairaHead.status !== "string"
  ) return false;
  const sourceFileIdentity = exactRecord(pansphairaHead.sourceFileIdentity, ["path", "sha256"]);
  if (sourceFileIdentity === undefined || typeof sourceFileIdentity.path !== "string" || !HEX64.test(String(sourceFileIdentity.sha256))) return false;
  const authority = exactRecord(candidate.authority, ["capabilities", "effects", "execute", "mutate", "promote", "publish"]);
  return authority !== undefined
    && authority.execute === false
    && authority.mutate === false
    && authority.promote === false
    && authority.publish === false
    && Array.isArray(authority.capabilities)
    && authority.capabilities.length === 0
    && Array.isArray(authority.effects)
    && authority.effects.length === 0;
};

const validNativeAdjudicationRecord = (value: unknown): boolean => {
  const adjudication = exactRecord(value, [
    "adjudicationContextId", "authoritativeProjectionDigest", "authoritativeSourceContractSha256", "authority",
    "canonicalKnowledgeAfterSha256", "canonicalKnowledgeBeforeSha256", "canonicalKnowledgeMutation", "canonicalTransportSha256",
    "capabilityDelta", "candidateDigest", "effect", "kaleidoSphereServiceVerdictAuthoritative", "outcome", "projectionBodyDigest",
    "rawArtifactSha256", "reasonCodes", "releasedHeads", "schemaVersion",
  ]);
  if (adjudication === undefined || !Array.isArray(adjudication.reasonCodes)) return false;
  return typeof adjudication.adjudicationContextId === "string"
    && adjudication.schemaVersion === NATIVE_ADJUDICATION_SCHEMA_V1
    && adjudication.authority === "NONE"
    && adjudication.canonicalKnowledgeMutation === "NONE"
    && adjudication.capabilityDelta === "NONE"
    && adjudication.effect === "NONE"
    && adjudication.kaleidoSphereServiceVerdictAuthoritative === false
    && ["ACCEPTED_BOUNDED", "RESTRICTED", "DENIED"].includes(adjudication.outcome as string)
    && typeof adjudication.candidateDigest === "string"
    && (adjudication.candidateDigest === "" || HEX64.test(adjudication.candidateDigest))
    && [
      adjudication.authoritativeProjectionDigest,
      adjudication.canonicalKnowledgeAfterSha256,
      adjudication.canonicalKnowledgeBeforeSha256,
      adjudication.canonicalTransportSha256,
      adjudication.projectionBodyDigest,
      adjudication.rawArtifactSha256,
    ].every((entry) => typeof entry === "string" && HEX64.test(entry))
    && validHeads(adjudication.releasedHeads)
    && adjudication.reasonCodes.every((reason) => [
      "NATIVE_CANDIDATE_SCHEMA_DENIED",
      "NATIVE_CONFLICTING_COUNTEREVIDENCE_DENIED",
      "NATIVE_EVIDENCE_ACCEPTED",
      "NATIVE_EVIDENCE_RESTRICTED_UNKNOWN",
      "NATIVE_FORGED_CANDIDATE_DENIED",
      "NATIVE_INDEPENDENT_PROVENANCE_DENIED",
      "NATIVE_STALE_HEAD_DENIED",
    ].includes(reason as string));
};

const reconciledHeads = (heads: unknown): heads is ReleasedHeadsV1 => {
  const record = exactRecord(heads, ["kaleidoSphere", "pansphaira"]);
  return record !== undefined
    && record.pansphaira === PANSPHAIRA_RECONCILED_RELEASED_HEAD_V1
    && record.kaleidoSphere === KALEIDOSPHERE_RECONCILED_RELEASED_HEAD_V1;
};

/**
 * Independent deterministic re-derivation of the native analysis from the
 * PAN-owned projection. Mirrors the service's closed-shape analysis field for
 * field; any divergence between this derivation and a candidate's claims,
 * coverage, counterevidence, or result digest is a forgery.
 */
const deriveNativeAnalysisV1 = (projection: KaleidosphereAnalyticsProjectionV1): Readonly<{
  claims: Readonly<{
    computed: Readonly<{
      counterevidenceTotal: number;
      decisionNodeCount: number;
      edgeCount: number;
      evidenceCount: number;
      frozenReceiptsEstablishingEdge: number;
      knowledgeNodeCount: number;
      nodeCount: number;
      unknownTotal: number;
    }>;
    observed: Readonly<{
      authority: string;
      edgeRelation: string;
      evidenceRoles: string[];
      nodeIds: string[];
      nodeKinds: string[];
      nonclaimCount: number;
      promotion: string;
      relationTruth: string;
      sourceContract: string;
      sourceContractVersion: string;
    }>;
  }>;
  coverage: Readonly<Record<string, "OBSERVED">>;
  counterevidence: readonly Readonly<{ check: string; claim: string; observed: number; status: string }>[];
  resultSha256: string;
}> => {
  const nodes = projection.nodes;
  const edge = projection.edges[0];
  if (edge === undefined) throw new TypeError("XRA_PS_02_NATIVE_PROJECTION_INVALID");
  const unknownTotal = nodes.reduce((total, node) => total + (node.unknown ? 1 : 0), 0) + (edge.unknown ? 1 : 0);
  const counterevidenceTotal = nodes.reduce((total, node) => total + node.counterevidence.length, 0) + edge.counterevidence.length;
  const duplicateNodeIdentifiers = new Set(nodes.map((node) => node.id)).size !== nodes.length;
  const computed = {
    counterevidenceTotal,
    decisionNodeCount: nodes.filter((node) => node.kind === "DECISION").length,
    edgeCount: projection.edges.length,
    evidenceCount: edge.evidence.length,
    frozenReceiptsEstablishingEdge: edge.evidence.length,
    knowledgeNodeCount: nodes.filter((node) => node.kind === "KNOWLEDGE").length,
    nodeCount: nodes.length,
    unknownTotal,
  } as const;
  const observed = {
    authority: projection.authority,
    edgeRelation: edge.relation,
    evidenceRoles: edge.evidence.map((entry) => entry.evidenceRole),
    nodeIds: nodes.map((node) => node.id),
    nodeKinds: nodes.map((node) => node.kind),
    nonclaimCount: projection.nonclaims.length,
    promotion: projection.promotion,
    relationTruth: projection.relationTruth,
    sourceContract: projection.source.contract,
    sourceContractVersion: projection.source.contractVersion,
  } as const;
  const coverage = {
    counterevidence: "OBSERVED",
    edges: "OBSERVED",
    evidence: "OBSERVED",
    nodes: "OBSERVED",
    source: "OBSERVED",
    unknownChannel: "OBSERVED",
  } as const;
  const counterevidence = [
    { check: "frozen subject inventory and duplicate node identifiers", claim: "nodes", observed: computed.nodeCount, status: duplicateNodeIdentifiers ? "EVIDENCE_FOUND" : "NONE_FOUND" },
    { check: "the single frozen purpose-bound relation", claim: "edges", observed: computed.edgeCount, status: edge.counterevidence.length > 0 ? "EVIDENCE_FOUND" : "NONE_FOUND" },
    { check: "the edge established by its frozen source receipts", claim: "evidence", observed: computed.evidenceCount, status: computed.evidenceCount > 0 ? "NONE_FOUND" : "EVIDENCE_FOUND" },
    { check: "native source binding to the pinned CKS proof input", claim: "source", observed: 1, status: "EVIDENCE_FOUND" },
    { check: "unknown frozen to false on every node and edge", claim: "unknownChannel", observed: computed.unknownTotal, status: computed.unknownTotal === 0 ? "NONE_FOUND" : "EVIDENCE_FOUND" },
    { check: "per-node and per-edge counterevidence arrays remain empty", claim: "counterevidence", observed: computed.counterevidenceTotal, status: computed.counterevidenceTotal === 0 ? "NONE_FOUND" : "EVIDENCE_FOUND" },
  ] as const;
  const body = { claims: { computed, observed }, coverage, counterevidence };
  return {
    claims: { computed, observed },
    coverage,
    counterevidence,
    resultSha256: digest(body),
  };
};

/**
 * Independent PAN adjudication of a real native service candidate.
 * Gate order: envelope shape -> reconciled envelope heads -> candidate closed
 * shape -> byte digests vs bindings -> transport provenance vs the PAN-owned
 * projection -> independent analysis re-derivation -> head bindings ->
 * independently sourced context -> context conflict -> context restriction.
 */
export function adjudicateNativeCandidateV1(input: unknown): NativeAdjudicationV1 {
  return adjudicateNativeCandidateForProfile(input, false);
}

/**
 * Additive, code-owned qualification of the measured current service identity.
 * This is NOT a released-pair receipt and does not admit caller-selected heads.
 * Candidate bytes are never rewritten; all PAN content/provenance gates apply.
 */
export function adjudicateNativeForwardCandidateV1(input: unknown) {
  return adjudicateNativeForwardProfile(input, true);
}

/** Separate exact PR235 qualification; it does not admit other PR heads. */
export function adjudicateNativeForwardPrCandidateV1(input: unknown) {
  return adjudicateNativeForwardProfile(input, "pr235");
}

/**
 * Frozen current-pair profiles. Each binds an exact KaleidoSphere service head
 * (commit + tree) and the environment identity the service reports at that
 * head. The native-projection analysis is head-independent in content (it is
 * re-derived from the frozen projection input, not the head), so only the KS
 * head binding and the environment identity move between current pairs. The
 * historical current pair (994ac801, the retained PAN346 source candidate) is
 * the default; the frozen current release pair (72d9a4af, release
 * 2026_09_28_v1) is added without disturbing it.
 */
export const CURRENT_KS_PROFILES_V1 = freeze({
  "current-994ac801": {
    commitOid: "994ac80113af284ffe9fde93bb11f2341aaace91",
    treeOid: "b3b033b02a3e35d1d30646856409011ce625def6",
    environmentSha256: "dbdf8bef805d77bc3158409184042b44e6dcd0abe6645efab8f7b82d7630d002",
  },
  "current-frozen-72d9a4af": {
    commitOid: "72d9a4af87fbbc5b23cb52835cd2f85415b8ddc7",
    treeOid: "3ef9faab703c8a44b39b2d32f11d6abd641ee35f",
    environmentSha256: "dbdf8bef805d77bc3158409184042b44e6dcd0abe6645efab8f7b82d7630d002",
  },
} as const);

export type CurrentKsProfileNameV1 = keyof typeof CURRENT_KS_PROFILES_V1;

/** Historical current pair (retained PAN346 source candidate): exact 994ac801 head. */
export function adjudicateNativeCurrentCandidateV1(input: unknown) {
  return adjudicateNativeForwardProfile(input, "current-994ac801");
}

/** Frozen current release pair: exact 72d9a4af head (release 2026_09_28_v1). */
export function adjudicateNativeFrozenCurrentCandidateV1(input: unknown) {
  return adjudicateNativeForwardProfile(input, "current-frozen-72d9a4af");
}

function adjudicateNativeForwardProfile(input: unknown, profile: true | "pr235" | CurrentKsProfileNameV1) {
  const envelope = exactRecord(input, ["canonicalTransportBytes", "candidate", "context", "rawArtifactBytes", "qualifiedHeads"]);
  const result = adjudicateNativeCandidateForProfile(envelope === undefined ? undefined : {
    canonicalTransportBytes: envelope.canonicalTransportBytes,
    candidate: envelope.candidate,
    context: envelope.context,
    rawArtifactBytes: envelope.rawArtifactBytes,
    releasedHeads: envelope.qualifiedHeads,
  }, profile);
  const { releasedHeads, schemaVersion: _historicalSchema, ...evidence } = result;
  return freeze({ ...evidence, qualifiedHeads: releasedHeads, schemaVersion: "pansphaira/native-forward-qualification/v1" as const });
}

const FORWARD_QUALIFIED_HEADS_V1: ReleasedHeadsV1 = freeze({
  pansphaira: PANSPHAIRA_RECONCILED_RELEASED_HEAD_V1,
  kaleidoSphere: "792e5e38cd4fb612ee034b3edc62aa8b4f58fe0f",
});
const FORWARD_SERVICE_HEAD_V1 = freeze({
  commitOid: "792e5e38cd4fb612ee034b3edc62aa8b4f58fe0f",
  treeOid: "759baccaa077d24f2f78c7e82d6fab801050bc63",
});

const FORWARD_PR_HEAD_V1 = freeze({
  commitOid: "bb52b249feb5968eee286963989f98f3bb673996",
  treeOid: "759baccaa077d24f2f78c7e82d6fab801050bc63",
});

function adjudicateNativeCandidateForProfile(input: unknown, forward: boolean | "pr235" | CurrentKsProfileNameV1): NativeAdjudicationV1 {
  const currentProfile: CurrentKsProfileNameV1 | null =
    typeof forward === "string" && (forward in CURRENT_KS_PROFILES_V1) ? (forward as CurrentKsProfileNameV1) : null;
  const expectedServiceHead = currentProfile !== null
    ? freeze({ commitOid: CURRENT_KS_PROFILES_V1[currentProfile].commitOid, treeOid: CURRENT_KS_PROFILES_V1[currentProfile].treeOid })
    : forward === "pr235" ? FORWARD_PR_HEAD_V1 : FORWARD_SERVICE_HEAD_V1;
  const expectedHeads = forward ? { ...FORWARD_QUALIFIED_HEADS_V1, kaleidoSphere: expectedServiceHead.commitOid } : RECONCILED_RELEASED_HEADS_V1;
  const authoritative = buildAuthoritativeAdjudicationInputs();
  const fields = {
    adjudicationContextId: "",
    candidateDigest: "",
    canonicalTransportSha256: "",
    projectionBodyDigest: "",
    rawArtifactSha256: "",
  };
  const outcome = (adjudicationOutcome: NativeAdjudicationV1["outcome"], code: NativeAdjudicationReasonCodeV1): NativeAdjudicationV1 => freeze({
    adjudicationContextId: fields.adjudicationContextId,
    authoritativeProjectionDigest: authoritative.projectionDigest,
    authoritativeSourceContractSha256: authoritative.sourceContractSha256,
    authority: "NONE",
    canonicalKnowledgeAfterSha256: authoritative.canonicalKnowledgeSha256,
    canonicalKnowledgeBeforeSha256: authoritative.canonicalKnowledgeSha256,
    canonicalKnowledgeMutation: "NONE",
    canonicalTransportSha256: fields.canonicalTransportSha256,
    capabilityDelta: "NONE",
    candidateDigest: fields.candidateDigest,
    effect: "NONE",
    kaleidoSphereServiceVerdictAuthoritative: false,
    outcome: adjudicationOutcome,
    projectionBodyDigest: fields.projectionBodyDigest,
    rawArtifactSha256: fields.rawArtifactSha256,
    reasonCodes: [code],
    releasedHeads: { ...expectedHeads },
    schemaVersion: NATIVE_ADJUDICATION_SCHEMA_V1,
  });

  const envelope = exactRecord(input, ["canonicalTransportBytes", "candidate", "context", "rawArtifactBytes", "releasedHeads"]);
  if (
    envelope === undefined
    || !isByteView(envelope.canonicalTransportBytes)
    || !isByteView(envelope.rawArtifactBytes)
    || !validHeads(envelope.releasedHeads)
  ) return outcome("DENIED", "NATIVE_CANDIDATE_SCHEMA_DENIED");
  if (canonicalJson(envelope.releasedHeads) !== canonicalJson(expectedHeads)) return outcome("DENIED", "NATIVE_STALE_HEAD_DENIED");

  const candidate = exactRecord(envelope.candidate, [...NATIVE_CANDIDATE_KEYS_V1]);
  if (candidate === undefined || plainSnapshot(envelope.candidate) === INVALID || !validNativeCandidateRecord(envelope.candidate)) {
    return outcome("DENIED", "NATIVE_CANDIDATE_SCHEMA_DENIED");
  }
  try {
    fields.candidateDigest = nativeCandidateDigestV1(envelope.candidate);
  } catch {
    return outcome("DENIED", "NATIVE_CANDIDATE_SCHEMA_DENIED");
  }

  let rawDigests: ReturnType<typeof nativeProjectionDigestV1>;
  let transportBytes: Buffer;
  try {
    rawDigests = nativeProjectionDigestV1(envelope.rawArtifactBytes);
    transportBytes = nativeTransportBytesV1(envelope.canonicalTransportBytes);
  } catch {
    return outcome("DENIED", "NATIVE_CANDIDATE_SCHEMA_DENIED");
  }
  fields.rawArtifactSha256 = rawDigests.rawArtifactSha256;
  fields.canonicalTransportSha256 = rawDigests.canonicalTransportSha256;
  fields.projectionBodyDigest = rawDigests.projectionBodyDigest;
  // The provided transport bytes must be exactly the canonical form of the provided raw artifact.
  if (digestBytes(transportBytes) !== rawDigests.canonicalTransportSha256) return outcome("DENIED", "NATIVE_FORGED_CANDIDATE_DENIED");

  const bindings = candidate.bindings as PlainRecord;
  const expectedEnvironmentSha256 = currentProfile !== null
    ? CURRENT_KS_PROFILES_V1[currentProfile].environmentSha256
    : "eee228014a53272b822c6b9872c2dc93dcb8a5ef62abae206e8ee32343990f05";
  if (forward && bindings.environmentSha256 !== expectedEnvironmentSha256) {
    return outcome("DENIED", "NATIVE_FORGED_CANDIDATE_DENIED");
  }
  if (
    bindings.rawArtifactSha256 !== fields.rawArtifactSha256
    || bindings.canonicalTransportSha256 !== fields.canonicalTransportSha256
    || bindings.projectionBodyDigest !== fields.projectionBodyDigest
    || bindings.nativeProjectionContractSha256 !== NATIVE_PROJECTION_CONTRACT_SHA256_V1
    || bindings.analysisContractSha256 !== NATIVE_ANALYSIS_CONTRACT_SHA256_V1
    || bindings.releaseSidecarSha256 !== NATIVE_RELEASE_SIDECAR_SHA256_V1
  ) return outcome("DENIED", "NATIVE_FORGED_CANDIDATE_DENIED");

  // Provenance: the canonical transport must be byte-equivalent (canonical form)
  // to the projection PAN itself publishes; the KS sidecar/verifier is not trusted.
  let parsedTransport: unknown;
  try {
    parsedTransport = JSON.parse(transportBytes.toString("utf8"));
  } catch {
    return outcome("DENIED", "NATIVE_INDEPENDENT_PROVENANCE_DENIED");
  }
  if (plainSnapshot(parsedTransport) === INVALID) return outcome("DENIED", "NATIVE_INDEPENDENT_PROVENANCE_DENIED");
  const authoritativeProjection = buildKaleidosphereAnalyticsProjectionV1();
  if (canonicalJson(parsedTransport) !== canonicalJson(authoritativeProjection)) return outcome("DENIED", "NATIVE_INDEPENDENT_PROVENANCE_DENIED");

  // Independent re-derivation of the deterministic analysis, field for field.
  const analysis = deriveNativeAnalysisV1(authoritativeProjection);
  const expectedAnalysisRecord = {
    contractSha256: NATIVE_ANALYSIS_CONTRACT_SHA256_V1,
    id: NATIVE_ANALYSIS_ID_V1,
    version: "v1",
  } as const;
  if (
    canonicalJson(candidate.analysis) !== canonicalJson(expectedAnalysisRecord)
    || canonicalJson(candidate.claims) !== canonicalJson(analysis.claims)
    || canonicalJson(candidate.coverage) !== canonicalJson(analysis.coverage)
    || canonicalJson(candidate.counterevidence) !== canonicalJson(analysis.counterevidence)
    || candidate.resultSha256 !== analysis.resultSha256
    || canonicalJson({
      authority: candidate.authority,
      issue: candidate.issue,
      nonclaims: candidate.nonclaims,
      state: candidate.state,
      schemaVersion: candidate.schemaVersion,
    }) !== canonicalJson(NATIVE_CANDIDATE_FRAME_V1)
  ) return outcome("DENIED", "NATIVE_FORGED_CANDIDATE_DENIED");

  // Head bindings must bind the reconciled released pair exactly.
  const expectedPansphairaHead = {
    ...NATIVE_EXPECTED_PANSPHAIRA_HEAD_V1,
    sourceFileIdentity: { path: NATIVE_SOURCE_FILE_IDENTITY_PATH_V1, sha256: fields.rawArtifactSha256 },
  };
  if (
    canonicalJson(bindings.kaleidosphereHead) !== canonicalJson(forward ? expectedServiceHead : NATIVE_EXPECTED_KALEIDOSPHERE_HEAD_V1)
    || canonicalJson(bindings.pansphairaHead) !== canonicalJson(expectedPansphairaHead)
  ) return outcome("DENIED", "NATIVE_STALE_HEAD_DENIED");

  if (!validNativeContextRecord(envelope.context)) return outcome("DENIED", "NATIVE_CANDIDATE_SCHEMA_DENIED");
  const context = envelope.context as PlainRecord;
  fields.adjudicationContextId = typeof context.contextId === "string" ? context.contextId : "";
  if (Array.isArray(context.counterevidence) && context.counterevidence.length > 0) return outcome("DENIED", "NATIVE_CONFLICTING_COUNTEREVIDENCE_DENIED");
  if (context.unknown === true) return outcome("RESTRICTED", "NATIVE_EVIDENCE_RESTRICTED_UNKNOWN");
  return outcome("ACCEPTED_BOUNDED", "NATIVE_EVIDENCE_ACCEPTED");
}

const nativeChain = (
  adjudication: NativeAdjudicationV1,
  candidate: unknown,
  context: unknown,
  digests: Readonly<{ canonicalTransportSha256: string; projectionBodyDigest: string; rawArtifactSha256: string }>,
): readonly ChainStageV1[] => {
  const authoritative = buildAuthoritativeAdjudicationInputs();
  const generation = digest({
    schemaVersion: NATIVE_ADJUDICATION_SCHEMA_V1,
    sourceContractSha256: authoritative.sourceContractSha256,
    stage: "GENERATION",
  });
  const projection = digests.projectionBodyDigest;
  const ingestion = digest({
    canonicalTransportSha256: digests.canonicalTransportSha256,
    rawArtifactSha256: digests.rawArtifactSha256,
    schemaVersion: NATIVE_ADJUDICATION_SCHEMA_V1,
    stage: "INGESTION",
  });
  const semantics = digest({
    inputDigest: ingestion,
    projectionBodyDigest: projection,
    schemaVersion: NATIVE_ADJUDICATION_SCHEMA_V1,
    stage: "SEMANTICS",
  });
  const analysis = digest({
    candidateResultSha256: (candidate as PlainRecord).resultSha256,
    contextId: (context as PlainRecord).contextId,
    inputDigest: semantics,
    schemaVersion: NATIVE_ADJUDICATION_SCHEMA_V1,
    stage: "ANALYSIS",
  });
  return [
    { stage: "GENERATION", digest: generation },
    { stage: "PROJECTION", digest: projection },
    { stage: "INGESTION", digest: ingestion },
    { stage: "SEMANTICS", digest: semantics },
    { stage: "ANALYSIS", digest: analysis },
    { stage: "CANDIDATE", digest: nativeCandidateDigestV1(candidate) },
    { stage: "ADJUDICATION", digest: digest(adjudication) },
  ];
};

export function createNativePairedAdjudicationReceiptV1(input: Readonly<{
  adjudication: NativeAdjudicationV1;
  candidate: unknown;
  canonicalTransportBytes: Uint8Array;
  context: unknown;
  rawArtifactBytes: Uint8Array;
  releasedHeads: ReleasedHeadsV1;
}>): NativePairedAdjudicationReceiptV1 {
  if (!reconciledHeads(input.releasedHeads)) throw new TypeError("XRA_PS_02_NATIVE_RELEASED_HEAD_DENIED");
  if (!validNativeCandidateRecord(input.candidate) || !validNativeContextRecord(input.context)) throw new TypeError("XRA_PS_02_NATIVE_RECEIPT_INPUT_DENIED");
  let digests: ReturnType<typeof nativeProjectionDigestV1>;
  try {
    digests = nativeProjectionDigestV1(input.rawArtifactBytes);
  } catch {
    throw new TypeError("XRA_PS_02_NATIVE_RECEIPT_INPUT_DENIED");
  }
  const expected = adjudicateNativeCandidateV1({
    canonicalTransportBytes: input.canonicalTransportBytes,
    candidate: input.candidate,
    context: input.context,
    rawArtifactBytes: input.rawArtifactBytes,
    releasedHeads: input.releasedHeads,
  });
  if (expected.outcome !== "ACCEPTED_BOUNDED" || canonicalJson(expected) !== canonicalJson(input.adjudication)) {
    throw new TypeError("XRA_PS_02_NATIVE_RECEIPT_INPUT_DENIED");
  }
  const chain = nativeChain(input.adjudication, input.candidate, input.context, digests);
  const body = {
    adjudication: input.adjudication,
    adjudicationDigest: digest(input.adjudication),
    authority: "NONE",
    candidate: input.candidate,
    candidateDigest: nativeCandidateDigestV1(input.candidate),
    canonicalTransportSha256: digests.canonicalTransportSha256,
    chain,
    context: input.context,
    effect: "NONE",
    rawArtifactSha256: digests.rawArtifactSha256,
    receiptId: NATIVE_ADJUDICATION_RECEIPT_ID_V1,
    releasedHeads: { ...input.releasedHeads },
    schemaVersion: NATIVE_RECEIPT_SCHEMA_V1,
  } as const;
  return freeze({ ...body, receiptDigest: digest(body) });
}

const nativeReceiptDenied = (): NativePairedReceiptVerificationV1 => ({ outcome: "DENIED", reasonCodes: ["NATIVE_RECEIPT_DENIED"] });

export function verifyNativePairedAdjudicationReceiptV1(
  value: unknown,
  material?: Readonly<{ canonicalTransportBytes: Uint8Array; rawArtifactBytes: Uint8Array }>,
): NativePairedReceiptVerificationV1 {
  const snapshot = plainSnapshot(value);
  if (snapshot === INVALID || snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) return nativeReceiptDenied();
  const receipt = snapshot as PlainRecord;
  const keys = [
    "adjudication", "adjudicationDigest", "authority", "candidate", "candidateDigest", "canonicalTransportSha256",
    "chain", "context", "effect", "rawArtifactSha256", "receiptDigest", "receiptId", "releasedHeads", "schemaVersion",
  ];
  if (Reflect.ownKeys(receipt).length !== keys.length || Reflect.ownKeys(receipt).some((key) => typeof key !== "string" || !keys.includes(key))) return nativeReceiptDenied();
  if (material === undefined || !isByteView(material.canonicalTransportBytes) || !isByteView(material.rawArtifactBytes)) return nativeReceiptDenied();
  try {
    if (
      receipt.schemaVersion !== NATIVE_RECEIPT_SCHEMA_V1
      || receipt.receiptId !== NATIVE_ADJUDICATION_RECEIPT_ID_V1
      || receipt.authority !== "NONE"
      || receipt.effect !== "NONE"
      || typeof receipt.adjudicationDigest !== "string"
      || !HEX64.test(receipt.adjudicationDigest)
      || typeof receipt.candidateDigest !== "string"
      || !HEX64.test(receipt.candidateDigest)
      || typeof receipt.canonicalTransportSha256 !== "string"
      || !HEX64.test(receipt.canonicalTransportSha256)
      || typeof receipt.rawArtifactSha256 !== "string"
      || !HEX64.test(receipt.rawArtifactSha256)
      || typeof receipt.receiptDigest !== "string"
      || !HEX64.test(receipt.receiptDigest)
      || !validHeads(receipt.releasedHeads)
      || !reconciledHeads(receipt.releasedHeads)
      || !validNativeCandidateRecord(receipt.candidate)
      || !validNativeContextRecord(receipt.context)
      || !validNativeAdjudicationRecord(receipt.adjudication)
    ) return nativeReceiptDenied();
    let digests: ReturnType<typeof nativeProjectionDigestV1>;
    try {
      digests = nativeProjectionDigestV1(material.rawArtifactBytes);
    } catch {
      return nativeReceiptDenied();
    }
    if (
      digestBytes(material.canonicalTransportBytes) !== digests.canonicalTransportSha256
      || receipt.rawArtifactSha256 !== digests.rawArtifactSha256
      || receipt.canonicalTransportSha256 !== digests.canonicalTransportSha256
    ) return nativeReceiptDenied();
    const expectedAdjudication = adjudicateNativeCandidateV1({
      canonicalTransportBytes: material.canonicalTransportBytes,
      candidate: receipt.candidate,
      context: receipt.context,
      rawArtifactBytes: material.rawArtifactBytes,
      releasedHeads: receipt.releasedHeads,
    });
    if (
      receipt.candidateDigest !== nativeCandidateDigestV1(receipt.candidate)
      || receipt.adjudicationDigest !== digest(receipt.adjudication)
      || canonicalJson(receipt.adjudication) !== canonicalJson(expectedAdjudication)
    ) return nativeReceiptDenied();
    const chain = receipt.chain;
    if (!Array.isArray(chain) || chain.length !== ADJUDICATION_CHAIN_STAGES.length || chain.some((entry, index) => {
      const stage = exactRecord(entry, ["digest", "stage"]);
      return stage === undefined || stage.stage !== ADJUDICATION_CHAIN_STAGES[index] || typeof stage.digest !== "string" || !HEX64.test(stage.digest);
    })) return nativeReceiptDenied();
    if (!arraysEqual(chain, nativeChain(
      receipt.adjudication as NativeAdjudicationV1,
      receipt.candidate,
      receipt.context,
      { canonicalTransportSha256: digests.canonicalTransportSha256, projectionBodyDigest: digests.projectionBodyDigest, rawArtifactSha256: digests.rawArtifactSha256 },
    ))) return nativeReceiptDenied();
    const body: PlainRecord = { ...receipt };
    delete body.receiptDigest;
    if (receipt.receiptDigest !== digest(body)) return nativeReceiptDenied();
    return {
      authority: "NONE",
      chainStages: [...ADJUDICATION_CHAIN_STAGES],
      effect: "NONE",
      outcome: "VERIFIED",
      receiptDigest: receipt.receiptDigest as string,
      releasedHeads: receipt.releasedHeads as ReleasedHeadsV1,
    };
  } catch {
    return nativeReceiptDenied();
  }
}

/**
 * Loopback wire ingestor for the native projection endpoint. Fail-closed:
 * transport failure, non-JSON bodies, and non-conformant envelopes are typed
 * UNAVAILABLE/DENIED results — never coerced into a candidate. The wire is a
 * pure ingestion surface; all authority remains with the PAN adjudicator.
 */
export async function fetchNativeProjectionV1(options: Readonly<{
  canonicalTransportBytes: Uint8Array;
  timeoutMs?: number;
  url: string;
}>): Promise<NativeServiceResponseV1> {
  const unavailable = (code: NativeServiceWireCodeV1): NativeServiceResponseV1 => ({
    candidate: null,
    code,
    issue: "XRA-KS-01",
    requestSha256: null,
    status: "UNAVAILABLE",
  });
  if (!isByteView(options.canonicalTransportBytes)) return unavailable("XRA_PS_02_NATIVE_WIRE_SHAPE_DENIED");
  let response: Response;
  try {
    response = await fetch(options.url, {
      body: Buffer.from(options.canonicalTransportBytes),
      headers: { "content-type": "application/octet-stream" },
      method: "POST",
      signal: AbortSignal.timeout(options.timeoutMs ?? 1500),
    });
  } catch {
    return unavailable("XRA_PS_02_NATIVE_SERVICE_UNAVAILABLE");
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return unavailable("XRA_PS_02_NATIVE_WIRE_SHAPE_DENIED");
  }
  const envelope = exactRecord(body, ["candidate", "issue", "requestSha256", "status"]);
  if (
    envelope !== undefined
    && envelope.status === "CANDIDATE"
    && envelope.issue === "XRA-KS-01"
    && typeof envelope.requestSha256 === "string"
    && HEX64.test(envelope.requestSha256)
    && validNativeCandidateRecord(envelope.candidate)
  ) {
    return { candidate: envelope.candidate, issue: "XRA-KS-01", requestSha256: envelope.requestSha256, status: "CANDIDATE" };
  }
  const denial = exactRecord(body, ["candidate", "code", "issue", "ordinaryAnswer", "requestSha256", "successfulOrdinaryAnswer", "status"]);
  if (
    denial !== undefined
    && denial.status === "DENIED"
    && denial.issue === "XRA-KS-01"
    && denial.candidate === null
    && denial.ordinaryAnswer === null
    && denial.successfulOrdinaryAnswer === false
    && typeof denial.code === "string"
    && (typeof denial.requestSha256 === "string" || denial.requestSha256 === null)
  ) {
    return {
      candidate: null,
      code: denial.code,
      issue: "XRA-KS-01",
      ordinaryAnswer: null,
      requestSha256: denial.requestSha256,
      successfulOrdinaryAnswer: false,
      status: "DENIED",
    };
  }
  return unavailable("XRA_PS_02_NATIVE_WIRE_SHAPE_DENIED");
}

// ---------------------------------------------------------------------------
// v2 successor paired receipt (additive; every v1 frozen constant is untouched).
//
// The v1 source-local paired receipt (NATIVE_ADJUDICATION_RECEIPT_ID_V1) binds
// the reconciled released heads and the complete seven-stage chain, but it is a
// source-local proof: it never independently binds the tested PAN adjudicator
// source, and it is exercised against historical captures, not a live
// repository-rooted Root-QS execution. That is the AC03 gap. The v2 successor
// therefore separately and independently binds
//   (1) the immutable released INPUT heads the seven-stage chain operates on,
//   and
//   (2) the tested PAN adjudicator SOURCE (adjudicator implementation + focused
//       native test + pinned KS native-projection service server + node runtime),
// pairs both with the live Root-QS execution evidence (the five paired outcomes,
// the real service-down / substitution / malformed falsifiers, and the
// before/after canonical-Knowledge / authority / capability / effect comparison),
// and preserves the original v1 receipt identity and bytes by reference
// (baseReceiptId + baseReceiptDigest + baseAdjudicationDigest).
// ---------------------------------------------------------------------------

export const NATIVE_RECEIPT_SCHEMA_V2 = "pansphaira.xra-ps-02/native-paired-receipt/v2" as const;
export const NATIVE_ADJUDICATION_RECEIPT_ID_V2 = "pansphaira:xra-ps-02-native-paired-receipt-002" as const;

/** Binding group 1: the immutable released INPUT heads the seven-stage chain operates on. */
export type NativeInputHeadsV2 = Readonly<{
  canonicalTransportSha256: string;
  kaleidoSphereHeadCommit: typeof KALEIDOSPHERE_RECONCILED_RELEASED_HEAD_V1;
  kaleidoSphereHeadTree: typeof KALEIDOSPHERE_RECONCILED_RELEASED_TREE_V1;
  pansphairaHeadCommit: typeof PANSPHAIRA_RECONCILED_HEAD_COMMIT_V1;
  pansphairaReleaseCommit: typeof PANSPHAIRA_RECONCILED_RELEASED_HEAD_V1;
  pansphairaReleaseReceiptSha256: typeof PANSPHAIRA_RECONCILED_RELEASE_RECEIPT_SHA256_V1;
  pansphairaReleaseTag: typeof PANSPHAIRA_RECONCILED_RELEASE_TAG_V1;
  projectionDigest: string;
  rawArtifactSha256: string;
  sourceContractSha256: string;
}>;

/** Binding group 2: the tested PAN adjudicator SOURCE, bound separately from the input heads. Pure source/code identity (no runtime). */
export type NativeTestedSourceV2 = Readonly<{
  adjudicatorSha256: string;
  focusedNativeTestSha256: string;
  kaleidoSphereHeadCommit: typeof KALEIDOSPHERE_RECONCILED_RELEASED_HEAD_V1;
  kaleidoSphereHeadTree: typeof KALEIDOSPHERE_RECONCILED_RELEASED_TREE_V1;
  kaleidoSphereServerSha256: string;
}>;

export type NativeRootQsOutcomeV2 = Readonly<{
  case: string;
  outcome: "ACCEPTED_BOUNDED" | "DENIED" | "RESTRICTED";
  reasonCodes: readonly string[];
}>;

export type NativeRootQsBeforeAfterV2 = Readonly<{
  authorityAfter: "NONE";
  authorityBefore: "NONE";
  capabilityDeltaAfter: "NONE";
  capabilityDeltaBefore: "NONE";
  canonicalKnowledgeAfterSha256: string;
  canonicalKnowledgeBeforeSha256: string;
  effectAfter: "NONE";
  effectBefore: "NONE";
}>;

export type NativeRootQsExecutionV2 = Readonly<{
  beforeAfter: NativeRootQsBeforeAfterV2;
  command: string;
  falsifiers: readonly Readonly<{ code: string; label: string }>[];
  outcomes: readonly NativeRootQsOutcomeV2[];
  rawResultsDigest: string;
  scope: "LOCAL_VM_REAL_HTTP";
  transport: "loopback HTTP (127.0.0.1)";
}>;

/** The live Root-QS execution summary before the raw-results digest is bound. */
export type NativeRootQsExecutionSummaryV2 = Omit<NativeRootQsExecutionV2, "rawResultsDigest">;

export type NativePairedAdjudicationReceiptV2 = Readonly<{
  authority: "NONE";
  baseAdjudicationDigest: string;
  baseReceiptDigest: string;
  baseReceiptId: typeof NATIVE_ADJUDICATION_RECEIPT_ID_V1;
  chain: readonly ChainStageV1[];
  effect: "NONE";
  inputHeads: NativeInputHeadsV2;
  inputHeadsDigest: string;
  receiptDigest: string;
  receiptId: typeof NATIVE_ADJUDICATION_RECEIPT_ID_V2;
  rootQsExecution: NativeRootQsExecutionV2;
  schemaVersion: typeof NATIVE_RECEIPT_SCHEMA_V2;
  testedSource: NativeTestedSourceV2;
  testedSourceDigest: string;
}>;

export type NativePairedReceiptVerificationV2 =
  | Readonly<{
    authority: "NONE";
    chainStages: readonly (typeof ADJUDICATION_CHAIN_STAGES)[number][];
    effect: "NONE";
    inputHeads: NativeInputHeadsV2;
    outcome: "VERIFIED";
    receiptDigest: string;
    testedSource: NativeTestedSourceV2;
  }>
  | Readonly<{ outcome: "DENIED"; reasonCodes: readonly ["NATIVE_V2_RECEIPT_DENIED"] }>;

/** The five exact paired outcomes the live Root-QS chain must reproduce. */
export const NATIVE_EXPECTED_OUTCOMES_V2: readonly NativeRootQsOutcomeV2[] = Object.freeze([
  { case: "positive", outcome: "ACCEPTED_BOUNDED", reasonCodes: ["NATIVE_EVIDENCE_ACCEPTED"] },
  { case: "restricted-unknown", outcome: "RESTRICTED", reasonCodes: ["NATIVE_EVIDENCE_RESTRICTED_UNKNOWN"] },
  { case: "conflicting-counterevidence", outcome: "DENIED", reasonCodes: ["NATIVE_CONFLICTING_COUNTEREVIDENCE_DENIED"] },
  { case: "forged-candidate", outcome: "DENIED", reasonCodes: ["NATIVE_FORGED_CANDIDATE_DENIED"] },
  { case: "stale-head", outcome: "DENIED", reasonCodes: ["NATIVE_STALE_HEAD_DENIED"] },
]);

const NATIVE_V2_INPUT_HEADS_KEYS = [
  "canonicalTransportSha256", "kaleidoSphereHeadCommit", "kaleidoSphereHeadTree", "pansphairaHeadCommit",
  "pansphairaReleaseCommit", "pansphairaReleaseReceiptSha256", "pansphairaReleaseTag", "projectionDigest",
  "rawArtifactSha256", "sourceContractSha256",
] as const;
const NATIVE_V2_TESTED_SOURCE_KEYS = [
  "adjudicatorSha256", "focusedNativeTestSha256", "kaleidoSphereHeadCommit", "kaleidoSphereHeadTree",
  "kaleidoSphereServerSha256",
] as const;
const NATIVE_V2_BEFORE_AFTER_KEYS = [
  "authorityAfter", "authorityBefore", "capabilityDeltaAfter", "capabilityDeltaBefore",
  "canonicalKnowledgeAfterSha256", "canonicalKnowledgeBeforeSha256", "effectAfter", "effectBefore",
] as const;
const NATIVE_V2_OUTCOME_KEYS = ["case", "outcome", "reasonCodes"] as const;
const NATIVE_V2_FALSIFIER_KEYS = ["code", "label"] as const;
const NATIVE_V2_EXECUTION_KEYS = ["beforeAfter", "command", "falsifiers", "outcomes", "rawResultsDigest", "scope", "transport"] as const;
const NATIVE_V2_RECEIPT_KEYS: readonly string[] = [
  "authority", "baseAdjudicationDigest", "baseReceiptDigest", "baseReceiptId", "chain", "effect",
  "inputHeads", "inputHeadsDigest", "receiptDigest", "receiptId", "rootQsExecution", "schemaVersion",
  "testedSource", "testedSourceDigest",
];

const v2IsHex64 = (value: unknown): value is string => typeof value === "string" && HEX64.test(value);
const v2IsHead40 = (value: unknown): value is string => typeof value === "string" && HEAD40.test(value);

const validNativeV2InputHeads = (value: unknown): value is NativeInputHeadsV2 => {
  const record = exactRecord(value, [...NATIVE_V2_INPUT_HEADS_KEYS]);
  if (record === undefined) return false;
  return record.pansphairaReleaseCommit === PANSPHAIRA_RECONCILED_RELEASED_HEAD_V1
    && record.pansphairaHeadCommit === PANSPHAIRA_RECONCILED_HEAD_COMMIT_V1
    && record.pansphairaReleaseTag === PANSPHAIRA_RECONCILED_RELEASE_TAG_V1
    && record.pansphairaReleaseReceiptSha256 === PANSPHAIRA_RECONCILED_RELEASE_RECEIPT_SHA256_V1
    && record.kaleidoSphereHeadCommit === KALEIDOSPHERE_RECONCILED_RELEASED_HEAD_V1
    && record.kaleidoSphereHeadTree === KALEIDOSPHERE_RECONCILED_RELEASED_TREE_V1
    && v2IsHex64(record.canonicalTransportSha256)
    && v2IsHex64(record.projectionDigest)
    && v2IsHex64(record.rawArtifactSha256)
    && v2IsHex64(record.sourceContractSha256);
};

const validNativeV2TestedSource = (value: unknown): value is NativeTestedSourceV2 => {
  const record = exactRecord(value, [...NATIVE_V2_TESTED_SOURCE_KEYS]);
  if (record === undefined) return false;
  return v2IsHex64(record.adjudicatorSha256)
    && v2IsHex64(record.focusedNativeTestSha256)
    && v2IsHex64(record.kaleidoSphereServerSha256)
    && record.kaleidoSphereHeadCommit === KALEIDOSPHERE_RECONCILED_RELEASED_HEAD_V1
    && record.kaleidoSphereHeadTree === KALEIDOSPHERE_RECONCILED_RELEASED_TREE_V1;
};

const validNativeV2Chain = (value: unknown): boolean => {
  if (!Array.isArray(value) || value.length !== ADJUDICATION_CHAIN_STAGES.length) return false;
  return value.every((entry, index) => {
    const stage = exactRecord(entry, ["digest", "stage"]);
    return stage !== undefined && stage.stage === ADJUDICATION_CHAIN_STAGES[index] && typeof stage.digest === "string" && HEX64.test(stage.digest);
  });
};

const validNativeV2BeforeAfter = (value: unknown): value is NativeRootQsBeforeAfterV2 => {
  const record = exactRecord(value, [...NATIVE_V2_BEFORE_AFTER_KEYS]);
  if (record === undefined) return false;
  return record.authorityBefore === "NONE"
    && record.authorityAfter === "NONE"
    && record.capabilityDeltaBefore === "NONE"
    && record.capabilityDeltaAfter === "NONE"
    && record.effectBefore === "NONE"
    && record.effectAfter === "NONE"
    && v2IsHex64(record.canonicalKnowledgeBeforeSha256)
    && record.canonicalKnowledgeBeforeSha256 === CANONICAL_KNOWLEDGE_SHA256
    && record.canonicalKnowledgeAfterSha256 === record.canonicalKnowledgeBeforeSha256;
};

const validNativeV2Outcomes = (value: unknown): value is readonly NativeRootQsOutcomeV2[] => {
  if (!Array.isArray(value) || value.length !== NATIVE_EXPECTED_OUTCOMES_V2.length) return false;
  return value.every((entry) => {
    const record = exactRecord(entry, [...NATIVE_V2_OUTCOME_KEYS]);
    return record !== undefined
      && typeof record.case === "string"
      && (record.outcome === "ACCEPTED_BOUNDED" || record.outcome === "RESTRICTED" || record.outcome === "DENIED")
      && Array.isArray(record.reasonCodes)
      && record.reasonCodes.every((code) => typeof code === "string");
  })
    && arraysEqual(value, NATIVE_EXPECTED_OUTCOMES_V2);
};

const validNativeV2Falsifiers = (value: unknown): boolean => {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((entry) => {
    const record = exactRecord(entry, [...NATIVE_V2_FALSIFIER_KEYS]);
    return record !== undefined && typeof record.code === "string" && record.code.length > 0 && typeof record.label === "string" && record.label.length > 0;
  });
};

const validNativeV2Execution = (value: unknown, rawResultsDigest: string): value is NativeRootQsExecutionV2 => {
  const record = exactRecord(value, [...NATIVE_V2_EXECUTION_KEYS]);
  if (record === undefined) return false;
  return record.scope === "LOCAL_VM_REAL_HTTP"
    && record.transport === "loopback HTTP (127.0.0.1)"
    && typeof record.command === "string"
    && record.command.length > 0
    && v2IsHex64(record.rawResultsDigest)
    && record.rawResultsDigest === rawResultsDigest
    && validNativeV2BeforeAfter(record.beforeAfter)
    && validNativeV2Outcomes(record.outcomes)
    && validNativeV2Falsifiers(record.falsifiers);
};

/**
 * Build the v2 successor paired receipt. Pairs the live Root-QS execution
 * (bound by the raw-results digest) with the v1 base receipt and the two
 * independent binding groups (released input heads, tested PAN source).
 */
export function createNativePairedAdjudicationReceiptV2(input: Readonly<{
  baseReceipt: NativePairedAdjudicationReceiptV1;
  inputHeads: NativeInputHeadsV2;
  rawResults: unknown;
  rootQsExecution: NativeRootQsExecutionSummaryV2;
  testedSource: NativeTestedSourceV2;
}>): NativePairedAdjudicationReceiptV2 {
  if (!validNativeV2InputHeads(input.inputHeads)) throw new TypeError("XRA_PS_02_NATIVE_V2_INPUT_HEADS_DENIED");
  if (!validNativeV2TestedSource(input.testedSource)) throw new TypeError("XRA_PS_02_NATIVE_V2_TESTED_SOURCE_DENIED");
  if (!validNativeV2Chain(input.baseReceipt.chain)) throw new TypeError("XRA_PS_02_NATIVE_V2_BASE_CHAIN_DENIED");
  if (input.baseReceipt.schemaVersion !== NATIVE_RECEIPT_SCHEMA_V1 || input.baseReceipt.receiptId !== NATIVE_ADJUDICATION_RECEIPT_ID_V1) {
    throw new TypeError("XRA_PS_02_NATIVE_V2_BASE_RECEIPT_DENIED");
  }
  if (!v2IsHex64(input.baseReceipt.receiptDigest) || !v2IsHex64(input.baseReceipt.adjudicationDigest)) {
    throw new TypeError("XRA_PS_02_NATIVE_V2_BASE_RECEIPT_DENIED");
  }
  const baseBody: PlainRecord = { ...input.baseReceipt };
  delete baseBody.receiptDigest;
  if (input.baseReceipt.receiptDigest !== digest(baseBody)) throw new TypeError("XRA_PS_02_NATIVE_V2_BASE_RECEIPT_DENIED");
  const rawResultsDigest = digest(input.rawResults);
  const summary = input.rootQsExecution;
  if (
    summary.scope !== "LOCAL_VM_REAL_HTTP"
    || summary.transport !== "loopback HTTP (127.0.0.1)"
    || typeof summary.command !== "string" || summary.command.length === 0
    || !validNativeV2BeforeAfter(summary.beforeAfter)
    || !validNativeV2Outcomes(summary.outcomes)
    || !validNativeV2Falsifiers(summary.falsifiers)
  ) throw new TypeError("XRA_PS_02_NATIVE_V2_EXECUTION_DENIED");
  const rootQsExecution: NativeRootQsExecutionV2 = freeze({
    beforeAfter: summary.beforeAfter,
    command: summary.command,
    falsifiers: summary.falsifiers,
    outcomes: summary.outcomes,
    rawResultsDigest,
    scope: summary.scope,
    transport: summary.transport,
  });
  const body = {
    authority: "NONE",
    baseAdjudicationDigest: input.baseReceipt.adjudicationDigest,
    baseReceiptDigest: input.baseReceipt.receiptDigest,
    baseReceiptId: input.baseReceipt.receiptId,
    chain: input.baseReceipt.chain,
    effect: "NONE",
    inputHeads: { ...input.inputHeads },
    inputHeadsDigest: digest(input.inputHeads),
    receiptId: NATIVE_ADJUDICATION_RECEIPT_ID_V2,
    rootQsExecution,
    schemaVersion: NATIVE_RECEIPT_SCHEMA_V2,
    testedSource: { ...input.testedSource },
    testedSourceDigest: digest(input.testedSource),
  } as const;
  return freeze({ ...body, receiptDigest: digest(body) });
}

const nativeV2Denied = (): NativePairedReceiptVerificationV2 => ({ outcome: "DENIED", reasonCodes: ["NATIVE_V2_RECEIPT_DENIED"] });

/**
 * Fail-closed verification of the v2 successor paired receipt. Independently
 * re-checks both binding groups (released input heads against the reconciled
 * constants; tested source against the provided current source), the seven-stage
 * chain, the live Root-QS execution binding (raw-results digest + five outcomes
 * + falsifiers + before/after invariant), and the original v1 receipt reference.
 */
export function verifyNativePairedAdjudicationReceiptV2(
  value: unknown,
  material: Readonly<{ rawResults: unknown; testedSource: NativeTestedSourceV2 }>,
): NativePairedReceiptVerificationV2 {
  const snapshot = plainSnapshot(value);
  if (snapshot === INVALID || snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) return nativeV2Denied();
  const receipt = snapshot as PlainRecord;
  if (Reflect.ownKeys(receipt).length !== NATIVE_V2_RECEIPT_KEYS.length || Reflect.ownKeys(receipt).some((key) => typeof key !== "string" || !NATIVE_V2_RECEIPT_KEYS.includes(key))) {
    return nativeV2Denied();
  }
  if (!validNativeV2TestedSource(material.testedSource)) return nativeV2Denied();
  try {
    if (
      receipt.schemaVersion !== NATIVE_RECEIPT_SCHEMA_V2
      || receipt.receiptId !== NATIVE_ADJUDICATION_RECEIPT_ID_V2
      || receipt.authority !== "NONE"
      || receipt.effect !== "NONE"
      || receipt.baseReceiptId !== NATIVE_ADJUDICATION_RECEIPT_ID_V1
      || !v2IsHex64(receipt.baseAdjudicationDigest)
      || !v2IsHex64(receipt.baseReceiptDigest)
      || !validNativeV2InputHeads(receipt.inputHeads)
      || !validNativeV2TestedSource(receipt.testedSource)
      || !validNativeV2Chain(receipt.chain)
      || typeof receipt.inputHeadsDigest !== "string"
      || typeof receipt.testedSourceDigest !== "string"
    ) return nativeV2Denied();
    const rawResultsDigest = digest(material.rawResults);
    if (
      receipt.inputHeadsDigest !== digest(receipt.inputHeads)
      || receipt.testedSourceDigest !== digest(receipt.testedSource)
      || !arraysEqual(receipt.testedSource, material.testedSource)
      || !validNativeV2Execution(receipt.rootQsExecution, rawResultsDigest)
    ) return nativeV2Denied();
    const body: PlainRecord = { ...receipt };
    delete body.receiptDigest;
    if (typeof receipt.receiptDigest !== "string" || !HEX64.test(receipt.receiptDigest) || receipt.receiptDigest !== digest(body)) return nativeV2Denied();
    return {
      authority: "NONE",
      chainStages: [...ADJUDICATION_CHAIN_STAGES],
      effect: "NONE",
      inputHeads: receipt.inputHeads as NativeInputHeadsV2,
      outcome: "VERIFIED",
      receiptDigest: receipt.receiptDigest,
      testedSource: receipt.testedSource as NativeTestedSourceV2,
    };
  } catch {
    return nativeV2Denied();
  }
}
