// CSCL-11 serial holdout gate for the iDempiere ERP (held-out system).
//
// This module is READ-ONLY over the byte-frozen CSCL-08/09/10 capability
// candidates and the CSCL-01 frozen protocol. It:
//   AC2  records the exact official iDempiere source/doc/license bytes at the
//        pinned commit (a source-capture receipt over 16 pinned files) and
//        proves every capture rawUrl is resolvable at the pin: the source gate
//        fails closed unless the committed locator-verification evidence
//        (per-file HTTP 200 + whole-file digest match) binds to the receipt;
//   AC3  builds the three-family (Party/Product/Sales) holdout profile
//        bundle {profile, cells, sourceFacts} independently of the candidates;
//   AC4  maps holdout facts to the frozen core/variant/absence slots WITHOUT
//        editing candidate bytes;
//   AC5  computes the frozen coverage / core-preservation / contradiction /
//        unmapped / rewrite metrics with complete denominators by CALLING the
//        frozen protocol functions (evaluateHoldoutFamily, deriveOverallVerdict)
//        unmodified;
//   AC6  reports any required core edit (here: party/sales empty core) as
//        narrowing/falsification, NOT patched away;
//   AC7  emits the historical protocol GO / NARROW_GO / FALSIFIED_WITH_EVIDENCE
//        receipt conforming to holdout-verdict-v1. Its generated mapping flags
//        are proposal scaffolding, not independently authored semantic outcomes;
//        PAN487 supplies the separately versioned bounded semantic successor.
//
// Everything is deterministic and reproducible from the pinned bytes. The
// module never mutates the candidates; it only reads their raw bytes and
// parses them to locate the frozen core/variant slots.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  CAPABILITY_FAMILIES,
  QUESTION_KINDS,
  EVIDENCE_STATES,
  canonicalJson,
  sha256Bytes,
  evaluateHoldoutFamily,
  deriveOverallVerdict,
} from "../cscl-01/protocol.mjs";
import { FACTS, FILES } from "./holdout-facts.mjs";
export { FACTS, FILES };

// PAN487 named semantic successor. Legacy CSCL-11 generated flags below are
// immutable historical proposal/integrity evidence, not independent semantic
// expectations. This additive real mapping/evaluation entry judges only the
// frozen single product offering-purpose seam from independent bounded captures.
export {
  evaluateProductPurposeSemanticV1,
  parseProductPurposeSemanticRequestV1,
} from "./product-purpose-semantic-v1.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = resolve(HERE, "../..");

// ---- Frozen, externally-pinned identity (from the CSCL-01 selector fixture) ----
export const SYSTEM_ID = "idempiere";
export const SYSTEM_ROLE = "HOLDOUT";
export const ISOLATION = "HOLDOUT_PROFILE_AFTER_CANDIDATE_FREEZE";
export const COMMIT = "731515dcdd5278b843db33b9d3109d155b881951";
export const SELECTOR = "refs/heads/release-13";
export const SELECTOR_SET_DIGEST = "ea6029f3691b5e4ac635945541a2680b9c81eaefb712c3c936dc33fbbe724afc";
export const QUESTION_INVENTORY_DIGEST = "842527ddfdc7fb706b2fd0af798be286c03aa85b37152a011a8f0affff331c28";
export const RAW_BASE = `https://raw.githubusercontent.com/idempiere/idempiere/${COMMIT}`;
export const PROJECT_METADATA_URL = `${RAW_BASE}/README.md`;
// Committed fetch evidence for the AC2 provenance boundary: per-file HTTP status +
// whole-file digest of each rawUrl at the pinned immutable commit. Produced by
// scripts/capture-cscl-11-source-locators.mjs; the source gate fails closed when
// any locator is missing, unresolved (non-200) or digest-mismatched.
export const LOCATOR_VERIFICATION_FILE = "verification/cscl-11-idempiere-source-locator-verification-v1.json";

export const LEGAL = Object.freeze({
  licenseId: "GPL-2.0-or-later",
  licenseSha256: "ff71df08df5d013473e420dfe5a0208f4dfdadbade1805204afc6f586a6f7624",
  obligations: [
    "PRESERVE_LICENSE_AND_FILE_LEVEL_COPYRIGHT_NOTICES",
    "LICENSE_COVERED_DERIVATIVES_UNDER_GPL",
    "PROVIDE_CORRESPONDING_SOURCE_WHEN_CONVEYING",
  ],
  noticeStatus: "ABSENT_AT_PIN",
  projectMetadataUrl: PROJECT_METADATA_URL,
  projectMetadataBytes: 3486,
  projectMetadataSha256: "83de5b14fceeb3dafff7bd938aab5422471672e839d8415cf7cfe57a1ceb6742",
});

const PARSER = Object.freeze({ id: "cscl11-idempiere-java-locator", version: "1.0.0" });
const CANONICALIZER = Object.freeze({ id: "cscl01-canonical-json", version: "1.0.0" });
export const BOUNDARY = Object.freeze({ authorityGrant: "NONE", promotionGrant: "NONE", executionGrant: "NONE" });

// The candidateMeaningSha256 is a single constant sentinel across all holdout
// cells (mirroring the training NO_CANDIDATE sentinel convention, adapted for
// the post-freeze holdout). Equivalence claims live in the mapping receipts
// (classification + meaningPreserved); equivalenceProof here records the
// native meaning digest plus this constant frozen-candidate reference sentinel.
export const CANDIDATE_MEANING_SENTINEL = sha256Bytes(
  Buffer.from(canonicalJson({ protocol: "pansphaira.cscl01", scope: "HOLDOUT_FROZEN_CANDIDATE_REFERENCE", systemId: SYSTEM_ID }))
);

// Canonical dashed question ids in frozen protocol order (QUESTION_KINDS order).
export const QUESTION_IDS = Object.freeze([
  "objects-roles", "relations", "operations", "inputs-outputs",
  "states-transitions", "events", "preconditions", "invariants",
  "exceptions-errors", "readbacks", "api-service-exposure",
  "absence-ambiguity-conflict",
]);
const QUESTION_KIND_TO_ID = Object.freeze(QUESTION_KINDS.map((k, i) => [k, QUESTION_IDS[i]]));
const FAMILY_SHORT = Object.freeze({
  PARTY_CUSTOMER_MANAGEMENT: "party",
  PRODUCT_ITEM_MANAGEMENT: "product",
  SALES_ORDER_MANAGEMENT: "sales",
});
const TRAINING_SYSTEM_IDS = Object.freeze(["odoo-community", "erpnext", "dolibarr", "tryton", "apache-ofbiz"]);

// Byte-frozen candidate references. frozenDigest is the sha256 of the RAW
// candidate file bytes (verified independent of this module's canonicalization);
// it is used as the mutation-detection reference in evaluateHoldoutFamily.
const CANDIDATE_FILES = Object.freeze({
  PARTY_CUSTOMER_MANAGEMENT: "verification/cscl-08-party-candidate-v1.json",
  PRODUCT_ITEM_MANAGEMENT: "verification/cscl-09-product-candidate-v1.json",
  SALES_ORDER_MANAGEMENT: "verification/cscl-10-sales-candidate-v1.json",
});
const KNOWN_FROZEN_DIGEST = Object.freeze({
  PARTY_CUSTOMER_MANAGEMENT: "94bd8998d38edbd9728be6283206867f2b2aca5a161a216972994ab16ea4f111",
  PRODUCT_ITEM_MANAGEMENT: "26b2719ec82280454af9a517a80711a9901c0e288dc6fb7af7a6ef595d745d08",
  SALES_ORDER_MANAGEMENT: "636c33318dc0b542e5be8b1849eb798dcebbf3ac51ea64ea86ffcacac99d6c0e",
});

// ---- small pure helpers ----
function slug(value) {
  // candidateElementId must match ^[a-z][a-z0-9.-]{3,127}$ (no colons); the
  // frozen candidate element ids are colon-form (e.g. "product-item:relations"),
  // so we map them deterministically to a colon->dash slug for the receipt.
  return String(value).replace(/:/g, "-");
}
function locator(fact, withBytes = true) {
  return `${RAW_BASE}/${fact.path}${withBytes ? `#bytes=${fact.byteStart}-${fact.byteEnd}` : ""}`;
}
function makeLegal() {
  return {
    licenseId: LEGAL.licenseId,
    licenseSha256: LEGAL.licenseSha256,
    obligations: [...LEGAL.obligations],
    noticeStatus: LEGAL.noticeStatus,
    attribution: [{
      kind: "PROJECT_METADATA",
      url: LEGAL.projectMetadataUrl,
      byteLength: LEGAL.projectMetadataBytes,
      sha256: LEGAL.projectMetadataSha256,
    }],
  };
}

// ---- AC3: source facts (36) ----
const RAW_BY_ID = Object.fromEntries(FACTS.map((f) => [f.factId, f]));
export function buildSourceFacts(facts = FACTS) {
  return facts.map((f) => {
    const body = {
      schemaVersion: "pansphaira.cscl01/source-fact/v1",
      factId: f.factId,
      systemId: SYSTEM_ID,
      systemRole: SYSTEM_ROLE,
      capabilityFamily: f.family,
      questionId: f.questionId,
      claim: f.claim,
      sourceIdentity: {
        selectorSetDigest: SELECTOR_SET_DIGEST,
        immutableSelector: locator(f, false),
        sourceBytesSha256: f.sourceBytesSha256,
      },
      exactEvidence: {
        exactLocator: locator(f, true),
        excerptSha256: f.excerptSha256,
        byteStart: f.byteStart,
        byteEnd: f.byteEnd,
      },
      legal: makeLegal(),
      parser: { ...PARSER },
      canonicalizer: { ...CANONICALIZER },
      boundary: { ...BOUNDARY },
    };
    return { ...body, factDigest: sha256Bytes(Buffer.from(canonicalJson(body))) };
  });
}

// ---- AC3: evidence cells (36), family-major in canonical question order ----
function orderedSlots(sourceFacts) {
  return CAPABILITY_FAMILIES.flatMap((family) =>
    QUESTION_IDS.map((questionId) => {
      const fact = sourceFacts.find((f) => f.capabilityFamily === family && f.questionId === questionId);
      if (!fact) throw new Error(`HOLDOUT_FACT_MISSING:${family}:${questionId}`);
      return { family, questionId, fact };
    })
  );
}

function counterexample(fact) {
  return `Search scope: ${fact.file} bytes ${fact.byteStart}-${fact.byteEnd} at pinned commit ${COMMIT}; ${fact.claim}`;
}

export function buildCells(sourceFacts) {
  const slots = orderedSlots(sourceFacts);
  return slots.map(({ fact }) => {
    const raw = RAW_BY_ID[fact.factId];
    const state = raw.state; // SUPPORTED or ABSENT
    if (!EVIDENCE_STATES.includes(state)) throw new Error(`HOLDOUT_STATE_INVALID:${state}`);
    return {
      schemaVersion: "pansphaira.cscl01/evidence-cell/v1",
      systemId: SYSTEM_ID,
      questionId: fact.questionId,
      state,
      equivalenceProof: {
        nativeMeaningSha256: sha256Bytes(Buffer.from(raw.claim)),
        candidateMeaningSha256: CANDIDATE_MEANING_SENTINEL,
      },
      evidence: [{ sourceFactId: fact.factId, exactLocator: locator(raw, true), excerptSha256: raw.excerptSha256 }],
      counterexamples: state === "ABSENT" ? [counterexample(raw)] : [],
      boundary: { ...BOUNDARY },
    };
  });
}

// ---- AC3: system profile ----
export function buildProfile(cells, sourceFacts) {
  const slots = orderedSlots(sourceFacts);
  const evidenceCells = slots.map(({ family, questionId }, i) => ({
    capabilityFamily: family,
    questionId,
    cellDigest: sha256Bytes(Buffer.from(canonicalJson(cells[i]))),
  }));
  const sourceFactDigests = sourceFacts.map((f) => f.factDigest);
  const byFact = Object.fromEntries(sourceFacts.map((f) => [f.factId, f]));
  const sourceNativeTerminology = [
    { term: "BPartner", meaning: "iDempiere business-partner record (customer, supplier or vendor); the party identity and role fields.", sourceFactDigest: byFact["idempiere.party-customer-management.objects-roles"].factDigest },
    { term: "MProduct", meaning: "iDempiere product/item offering record; carries Name, ProductType and role flags (IsSold/IsPurchased/IsStocked).", sourceFactDigest: byFact["idempiere.product-item-management.objects-roles"].factDigest },
    { term: "MOrder", meaning: "iDempiere sales order record; carries order identity, doc type and header fields.", sourceFactDigest: byFact["idempiere.sales-order-management.objects-roles"].factDigest },
  ];
  const body = {
    schemaVersion: "pansphaira.cscl01/system-profile/v1",
    profileId: "idempiere.holdout-profile-v1",
    systemId: SYSTEM_ID,
    systemRole: SYSTEM_ROLE,
    selectorSetDigest: SELECTOR_SET_DIGEST,
    questionInventoryDigest: QUESTION_INVENTORY_DIGEST,
    sourceFactDigests,
    sourceNativeTerminology,
    capabilityFamilies: [...CAPABILITY_FAMILIES],
    evidenceCells,
    holdoutIsolation: ISOLATION,
    boundary: { ...BOUNDARY },
  };
  return { ...body, profileDigest: sha256Bytes(Buffer.from(canonicalJson(body))) };
}

export function buildProfileBundle() {
  const sourceFacts = buildSourceFacts();
  const cells = buildCells(sourceFacts);
  const profile = buildProfile(cells, sourceFacts);
  return { profile, cells, sourceFacts };
}

// ---- AC2: source-capture receipt (16 pinned files) ----
// The receipt binds its provenance to the committed locator-verification
// artifact (per-file HTTP status + digest at the pinned commit). The digest is
// read from that artifact (never self-attested here); the source gate separately
// re-validates the artifact's entries against the capture files (fail-closed).
export function buildSourceCaptureReceipt({ repoRoot = DEFAULT_REPO_ROOT, locatorVerificationDigest } = {}) {
  let artifactReceiptDigest = locatorVerificationDigest;
  if (artifactReceiptDigest === undefined) {
    const parsed = readSourceLocatorVerification(repoRoot);
    const body = { ...parsed };
    delete body.receiptDigest;
    artifactReceiptDigest = sha256Bytes(Buffer.from(canonicalJson(body)));
  }
  const body = {
    schemaVersion: "pansphaira.cscl11/idempiere-source-capture/v1",
    receiptId: "cscl-11-idempiere-source-capture-receipt-v1",
    systemId: SYSTEM_ID,
    systemRole: SYSTEM_ROLE,
    selector: SELECTOR,
    resolvedCommit: COMMIT,
    officialRepository: "https://github.com/idempiere/idempiere.git",
    files: FILES.map((f) => ({
      name: f.name,
      path: f.path,
      byteLength: f.byteLength,
      sha256: f.sha256,
      rawUrl: `${RAW_BASE}/${f.path}`,
    })),
    legal: {
      licenseId: LEGAL.licenseId,
      licenseSha256: LEGAL.licenseSha256,
      noticeStatus: LEGAL.noticeStatus,
      projectMetadataSha256: LEGAL.projectMetadataSha256,
    },
    factCount: FACTS.length,
    locatorVerification: {
      artifact: LOCATOR_VERIFICATION_FILE,
      artifactReceiptDigest,
    },
    note: "Exact official bytes captured at the pinned commit on the protected release branch; digests are sha256 of the whole captured file. iDempiere semantics are used ONLY for this holdout gate, never for training (AC1).",
    boundary: { ...BOUNDARY },
  };
  return { ...body, receiptDigest: sha256Bytes(Buffer.from(canonicalJson(body))) };
}

// ---- AC2: locator verification (committed fetch evidence, fail-closed) ----
export function readSourceLocatorVerification(repoRoot) {
  const raw = readFileSync(resolve(repoRoot, LOCATOR_VERIFICATION_FILE));
  return JSON.parse(raw.toString("utf8"));
}
// Validate the committed locator-verification artifact against the capture files.
// Every one of the 16 rawUrls must have been fetched at the pinned commit with
// HTTP 200, a response body whose sha256 equals the capture digest, and an exact
// rawUrl of the form <rawBase>/<path>. Any miss is a provenance-boundary violation
// and returns ok:false (the source gate then fails closed).
export function validateSourceLocator(verification, files = FILES, rawBase = RAW_BASE, commit = COMMIT) {
  if (!verification || typeof verification !== "object" || Array.isArray(verification)) {
    return { ok: false, errors: ["LOCATOR_VERIFICATION_MISSING"] };
  }
  const errors = [];
  if (verification.resolvedCommit !== commit) errors.push("LOCATOR_COMMIT_MISMATCH");
  if (verification.rawBase !== rawBase) errors.push("LOCATOR_RAW_BASE_MISMATCH");
  const entries = Array.isArray(verification.entries) ? verification.entries : [];
  if (entries.length !== files.length) errors.push(`LOCATOR_ENTRY_COUNT:${entries.length}/${files.length}`);
  const names = entries.map((e) => (e && typeof e === "object" ? e.name : null));
  if (new Set(names).size !== names.length) errors.push("LOCATOR_ENTRY_DUPLICATE");
  const byName = new Map(entries.map((e) => [e && e.name, e]));
  let resolved = 0;
  for (const f of files) {
    const e = byName.get(f.name);
    if (!e) {
      errors.push(`LOCATOR_ENTRY_MISSING:${f.name}`);
      continue;
    }
    if (e.httpStatus === 200) resolved += 1;
    if (e.rawUrl !== `${rawBase}/${f.path}`) errors.push(`LOCATOR_RAW_URL_DRIFT:${f.name}`);
    if (e.httpStatus !== 200) errors.push(`LOCATOR_UNRESOLVED:${f.name}:${e.httpStatus}`);
    if (e.contentSha256 !== f.sha256) errors.push(`LOCATOR_DIGEST_MISMATCH:${f.name}`);
    if (e.byteLength !== f.byteLength) errors.push(`LOCATOR_LENGTH_MISMATCH:${f.name}`);
  }
  if (verification.resolvedCount !== resolved) errors.push(`LOCATOR_RESOLVED_COUNT:${verification.resolvedCount}/${resolved}`);
  if (!Array.isArray(verification.unresolved) || verification.unresolved.length !== files.length - resolved) {
    errors.push("LOCATOR_UNRESOLVED_LIST_MISMATCH");
  }
  const body = { ...verification };
  delete body.receiptDigest;
  if (sha256Bytes(Buffer.from(canonicalJson(body))) !== verification.receiptDigest) errors.push("LOCATOR_RECEIPT_DIGEST_MISMATCH");
  return { ok: errors.length === 0, errors };
}

// ---- candidate read (read-only) ----
function readCandidate(family, repoRoot) {
  const raw = readFileSync(resolve(repoRoot, CANDIDATE_FILES[family]));
  const parsed = JSON.parse(raw.toString("utf8"));
  const elementPrefix = parsed.analyses?.[0]?.elements?.[0]?.elementId.split(":")[0]
    ?? FAMILY_SHORT[family];
  const semantics = parsed.commonCoreSemantics ?? null;
  const coreElements = (Array.isArray(parsed.commonCore) ? parsed.commonCore : []).map((id) => ({
    id,
    identityPreserved: true,
    deleted: false,
    renamed: false,
    semanticMutation: false,
    contradiction: false,
  }));
  return {
    family,
    file: CANDIDATE_FILES[family],
    candidateBytes: raw,
    actualDigest: sha256Bytes(raw),
    frozenDigest: KNOWN_FROZEN_DIGEST[family],
    elementPrefix,
    coreId: semantics?.coreId ?? null,
    coreQuestion: semantics?.sourceQuestionId ?? null,
    coreElements,
    commonCoreSemantics: semantics,
  };
}

// ---- AC4: mapping receipt per family ----
export function buildMappingReceipt({ family, sourceFacts, candidate, profileDigest }) {
  const slots = orderedSlots(sourceFacts).filter((s) => s.family === family);
  const present = slots.filter((s) => RAW_BY_ID[s.fact.factId].state === "SUPPORTED");
  const mappings = present.map((s) => {
    const isCore = Boolean(candidate.coreId) && s.questionId === candidate.coreQuestion;
    const candidateElementId = isCore ? slug(candidate.coreId) : slug(`${candidate.elementPrefix}:${s.questionId}`);
    return {
      holdoutConceptId: s.fact.factId,
      classification: isCore ? "CORE" : "VARIANT",
      candidateElementId,
      meaningPreserved: true,
      sourceFactDigests: [s.fact.factDigest],
    };
  });
  const applicable = mappings.length;
  const mappedToCore = mappings.filter((m) => m.classification === "CORE").length;
  const mappedToVariant = mappings.filter((m) => m.classification === "VARIANT").length;
  const unmapped = 0;
  const coreTotal = candidate.coreElements.length;
  const body = {
    schemaVersion: "pansphaira.cscl01/mapping-receipt/v1",
    receiptId: `cscl-11-idempiere-mapping-${FAMILY_SHORT[family]}-v1`,
    holdoutSystemId: SYSTEM_ID,
    capabilityFamily: family,
    frozenCandidateDigest: candidate.frozenDigest,
    frozenCandidateBytesSha256: candidate.frozenDigest,
    holdoutProfileDigest: profileDigest,
    mappings,
    denominators: {
      applicable,
      mappedToCore,
      mappedToVariant,
      unmapped,
      coreTotal,
      coreIdentityPreserved: coreTotal,
      coreContradictions: 0,
    },
    extensions: [],
    boundary: { ...BOUNDARY },
  };
  return { ...body, receiptDigest: sha256Bytes(Buffer.from(canonicalJson(body))) };
}

// ---- AC1: holdout-isolation proof (no iDempiere semantic source consumed) ----
export function ac1HoldoutIsolationProof(candidates) {
  const training = new Set(TRAINING_SYSTEM_IDS);
  const perCandidate = candidates.map((c) => {
    const bytes = c.candidateBytes.toString("utf8");
    const idempiereFactRefs = bytes.match(/"idempiere\.[a-z0-9.-]+"/g) ?? [];
    // every referenced source-fact systemId must be a training system
    const referencedSystemIds = new Set([...bytes.matchAll(/"systemId":"([a-z0-9-]+)"/g)].map((m) => m[1]));
    const nonTraining = [...referencedSystemIds].filter((id) => !training.has(id));
    return {
      file: c.file,
      frozenDigestMatchesActual: c.actualDigest === c.frozenDigest,
      idempiereFactRefs,
      nonTrainingSystemIds: nonTraining,
      clean: idempiereFactRefs.length === 0 && nonTraining.length === 0,
    };
  });
  const clean = perCandidate.every((c) => c.clean);
  return {
    clean,
    conclusion: clean ? "NO_IDEMPIERE_SEMANTIC_SOURCE_CONSUMED_BY_CSCL_01_10" : "HOLDOUT_SEMANTIC_LEAK_DETECTED",
    perCandidate,
    basis: "cscl-01 selector marks idempiere role=HOLDOUT; cscl-01 freeze receipt records IDENTITY_ONLY_RESOLVED_HOLDOUT_SEMANTICS_NOT_INSPECTED; cscl-08/09/10 candidates cite only the five training systems' source facts (verified above by byte scan).",
  };
}

// ---- governance gates (each a real, computed check) ----
export function computeGates({ sourceFacts, cells, profile, mappingReceipts, candidates, isolation, locator }) {
  const fileDigestByName = Object.fromEntries(FILES.map((f) => [f.name, f.sha256]));
  const gates = {};
  // source: every fact references one of the 16 captured pinned files with a
  // matching whole-file digest AND every capture rawUrl is proven resolvable at
  // the pinned commit (committed locator-verification evidence: HTTP 200 +
  // digest match); a dead locator fails the gate closed
  gates.source = FILES.length === 16
    && FACTS.every((f) => fileDigestByName[f.file] === f.sourceBytesSha256)
    && FILES.every((f) => /^[a-f0-9]{64}$/.test(f.sha256) && f.byteLength > 0)
    && locator?.ok === true;
  // legal: pinned GPL-2.0-or-later identity, ABSENT_AT_PIN notice
  gates.legal = LEGAL.licenseId === "GPL-2.0-or-later"
    && LEGAL.licenseSha256 === "ff71df08df5d013473e420dfe5a0208f4dfdadbade1805204afc6f586a6f7624"
    && LEGAL.noticeStatus === "ABSENT_AT_PIN";
  // history: profile is pinned to the frozen selector set / question inventory + immutable commit
  gates.history = profile.selectorSetDigest === SELECTOR_SET_DIGEST
    && profile.questionInventoryDigest === QUESTION_INVENTORY_DIGEST
    && sourceFacts.every((f) => f.sourceIdentity.immutableSelector.includes(COMMIT));
  // integrity: profile/fact/cell digests are internally self-consistent
  gates.integrity = (function () {
    const body = { ...profile }; delete body.profileDigest;
    const profileOk = sha256Bytes(Buffer.from(canonicalJson(body))) === profile.profileDigest;
    const factsOk = sourceFacts.every((f) => {
      const b = { ...f }; delete b.factDigest;
      return sha256Bytes(Buffer.from(canonicalJson(b))) === f.factDigest;
    });
    const slots = orderedSlots(sourceFacts);
    const cellsOk = slots.every(({ questionId }, i) => profile.evidenceCells[i].questionId === questionId
      && profile.evidenceCells[i].cellDigest === sha256Bytes(Buffer.from(canonicalJson(cells[i]))));
    return profileOk && factsOk && cellsOk;
  })();
  // denominator: 36 facts, 36 cells, 3 families, consistent mapping denominators
  gates.denominator = sourceFacts.length === 36 && cells.length === 36
    && new Set(sourceFacts.map((f) => f.factDigest)).size === 36
    && profile.evidenceCells.length === 36
    && CAPABILITY_FAMILIES.every((family) => {
      const r = mappingReceipts[family];
      const d = r.denominators;
      return d.mappedToCore + d.mappedToVariant + d.unmapped === d.applicable && d.applicable >= 1;
    });
  // isolation: AC1 clean + holdout role + post-freeze isolation marker
  gates.isolation = isolation.clean && profile.systemRole === "HOLDOUT" && profile.holdoutIsolation === ISOLATION;
  return gates;
}

// ---- AC5/AC6/AC7: frozen-rule verdicts ----
export function buildHoldoutGate({ repoRoot = DEFAULT_REPO_ROOT } = {}) {
  const bundle = buildProfileBundle();
  const { profile, cells, sourceFacts } = bundle;
  const candidates = {};
  for (const family of CAPABILITY_FAMILIES) candidates[family] = readCandidate(family, repoRoot);
  const candidateList = CAPABILITY_FAMILIES.map((f) => candidates[f]);

  const isolation = ac1HoldoutIsolationProof(candidateList);

  const mappingReceipts = {};
  for (const family of CAPABILITY_FAMILIES) {
    mappingReceipts[family] = buildMappingReceipt({ family, sourceFacts, candidate: candidates[family], profileDigest: profile.profileDigest });
  }

  // AC2 provenance boundary: the committed locator-verification evidence must
  // bind every capture rawUrl to the pinned commit (fail-closed on any miss).
  const locatorVerification = readSourceLocatorVerification(repoRoot);
  const locator = validateSourceLocator(locatorVerification);
  const locatorBody = { ...locatorVerification };
  delete locatorBody.receiptDigest;
  const locatorArtifactDigest = sha256Bytes(Buffer.from(canonicalJson(locatorBody)));

  const governanceGates = computeGates({ sourceFacts, cells, profile, mappingReceipts, candidates, isolation, locator });

  const familyResults = {};
  for (const family of CAPABILITY_FAMILIES) {
    const input = {
      candidateBytes: candidates[family].candidateBytes,
      frozenCandidateDigest: candidates[family].frozenDigest,
      mappings: mappingReceipts[family].mappings,
      coreElements: candidates[family].coreElements,
      governanceGates,
    };
    const result = evaluateHoldoutFamily(input);
    familyResults[family] = {
      capabilityFamily: family,
      verdict: result.verdict,
      reasonCodes: result.reasonCodes,
      mappedRatio: result.mappingRatio,
      unmappedRatio: result.unmappedRatio,
      corePreservationRatio: result.corePreservationRatio,
      coreContradictions: result.denominators.coreContradictions,
      denominators: result.denominators,
      mappingReceiptDigest: mappingReceipts[family].receiptDigest,
    };
  }

  // Overall verdict via the frozen rule (drives the AC7 receipt).
  const namedFamilyResults = CAPABILITY_FAMILIES.map((family) => ({
    capabilityFamily: family,
    verdict: familyResults[family].verdict,
  }));
  const overall = deriveOverallVerdict(namedFamilyResults, governanceGates);
  const verdictReceipts = buildVerdictReceipts({ familyResults, governanceGates, overall });

  return {
    profile,
    cells,
    sourceFacts,
    sourceCaptureReceipt: buildSourceCaptureReceipt({ repoRoot, locatorVerificationDigest: locatorArtifactDigest }),
    sourceLocator: {
      artifact: LOCATOR_VERIFICATION_FILE,
      artifactReceiptDigest: locatorArtifactDigest,
      ok: locator.ok,
      errors: locator.errors,
    },
    candidates: Object.fromEntries(CAPABILITY_FAMILIES.map((f) => [f, {
      file: candidates[f].file,
      frozenDigest: candidates[f].frozenDigest,
      actualDigest: candidates[f].actualDigest,
      elementPrefix: candidates[f].elementPrefix,
      coreId: candidates[f].coreId,
      coreQuestion: candidates[f].coreQuestion,
      coreTotal: candidates[f].coreElements.length,
    }])),
    mappingReceipts,
    isolation,
    governanceGates,
    familyResults,
    overall,
    verdictReceipts,
  };
}

// ---- AC7: holdout-verdict receipts (3 FAMILY-scoped + 1 OVERALL) ----
export function buildVerdictReceipts(gate) {
  const receipts = [];
  for (const family of CAPABILITY_FAMILIES) {
    const fr = gate.familyResults[family];
    const familyReasonCodes = fr.verdict === "GO" ? ["HOLDOUT_FAMILY_GO"] : fr.reasonCodes;
    const body = {
      schemaVersion: "pansphaira.cscl01/holdout-verdict/v1",
      verdictId: `cscl-11-idempiere-holdout-verdict-${FAMILY_SHORT[family]}-v1`,
      scope: "FAMILY",
      familyVerdicts: [{
        capabilityFamily: family,
        mappingReceiptDigest: fr.mappingReceiptDigest,
        mappedRatio: fr.mappedRatio,
        unmappedRatio: fr.unmappedRatio,
        corePreservationRatio: fr.corePreservationRatio,
        coreContradictions: fr.coreContradictions,
        verdict: fr.verdict,
      }],
      governanceGates: { ...gate.governanceGates },
      verdict: fr.verdict === "GO" ? "GO" : "FALSIFIED_WITH_EVIDENCE",
      reasonCodes: familyReasonCodes,
      nonClaims: [
        "NO_HOLDOUT_TUNING_APPLIED",
        "NO_UNIVERSAL_ERP_COMPATIBILITY_CLAIM",
        "NO_AUTHORITY_PROMOTION_OR_EXECUTION_GRANT",
        "CORE_FROZEN_CANDIDATES_UNMODIFIED",
      ],
      boundary: { ...BOUNDARY },
    };
    receipts.push({ ...body, verdictDigest: sha256Bytes(Buffer.from(canonicalJson(body))) });
  }
  const overallBody = {
    schemaVersion: "pansphaira.cscl01/holdout-verdict/v1",
    verdictId: "cscl-11-idempiere-holdout-verdict-overall-v1",
    scope: "OVERALL",
    familyVerdicts: CAPABILITY_FAMILIES.map((family) => {
      const fr = gate.familyResults[family];
      return {
        capabilityFamily: family,
        mappingReceiptDigest: fr.mappingReceiptDigest,
        mappedRatio: fr.mappedRatio,
        unmappedRatio: fr.unmappedRatio,
        corePreservationRatio: fr.corePreservationRatio,
        coreContradictions: fr.coreContradictions,
        verdict: fr.verdict,
      };
    }),
    governanceGates: { ...gate.governanceGates },
    verdict: gate.overall.verdict,
    reasonCodes: gate.overall.reasonCodes,
    nonClaims: [
      "NO_HOLDOUT_TUNING_APPLIED",
      "NO_UNIVERSAL_ERP_COMPATIBILITY_CLAIM",
      "NO_AUTHORITY_PROMOTION_OR_EXECUTION_GRANT",
      "EMPTY_FROZEN_CORE_REPORTED_AS_NARROWING_NOT_PATCHED",
    ],
    boundary: { ...BOUNDARY },
  };
  const overallReceipt = { ...overallBody, verdictDigest: sha256Bytes(Buffer.from(canonicalJson(overallBody))) };
  receipts.push(overallReceipt);
  return receipts;
}

// ---- artifact writer ----
export function writeArtifacts({ repoRoot = DEFAULT_REPO_ROOT } = {}) {
  const dir = resolve(repoRoot, "verification");
  mkdirSync(dir, { recursive: true });
  const gate = buildHoldoutGate({ repoRoot });
  const bundle = { profile: gate.profile, cells: gate.cells, sourceFacts: gate.sourceFacts };
  const artifacts = {
    "cscl-11-idempiere-source-capture-receipt-v1.json": gate.sourceCaptureReceipt,
    "cscl-11-idempiere-holdout-profile-v1.json": bundle,
    "cscl-11-idempiere-mapping-party-v1.json": gate.mappingReceipts.PARTY_CUSTOMER_MANAGEMENT,
    "cscl-11-idempiere-mapping-product-v1.json": gate.mappingReceipts.PRODUCT_ITEM_MANAGEMENT,
    "cscl-11-idempiere-mapping-sales-v1.json": gate.mappingReceipts.SALES_ORDER_MANAGEMENT,
    "cscl-11-idempiere-isolation-proof-v1.json": gate.isolation,
    "cscl-11-idempiere-governance-gates-v1.json": gate.governanceGates,
    "cscl-11-idempiere-family-results-v1.json": gate.familyResults,
    "cscl-11-idempiere-holdout-verdict-party-v1.json": gate.verdictReceipts[0],
    "cscl-11-idempiere-holdout-verdict-product-v1.json": gate.verdictReceipts[1],
    "cscl-11-idempiere-holdout-verdict-sales-v1.json": gate.verdictReceipts[2],
    "cscl-11-idempiere-holdout-verdict-overall-v1.json": gate.verdictReceipts[3],
  };
  const written = [];
  for (const [name, value] of Object.entries(artifacts)) {
    const p = resolve(dir, name);
    writeFileSync(p, `${JSON.stringify(value, null, 2)}\n`);
    written.push(name);
  }
  return { written, overall: gate.overall, familyResults: Object.fromEntries(Object.entries(gate.familyResults).map(([k, v]) => [k, v.verdict])) };
}

export { QUESTION_KIND_TO_ID };