// Explicit PAN487 successor: legacy generated flags remain historical proposal scaffolding.
// Business observations come only from the complete independently captured bounded relations.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { canonicalJson, sha256Bytes } from "../cscl-01/protocol.mjs";
import { cloneStrictJson, parseStrictJson } from "../../tools/video-production-reference/src/strict-json.mjs";
const REPO = fileURLToPath(new URL("../..", import.meta.url));
const CONCEPT = "idempiere.product-item-management.objects-roles";
const TARGET = "product-item-shared-purpose";
const BASELINE = Object.freeze({ commit: "5a9ac1a797729471ee853fdcbc4cd552f1e0d73b", candidatePath: "verification/cscl-09-product-candidate-v1.json", candidateSha256: "26b2719ec82280454af9a517a80711a9901c0e288dc6fb7af7a6ef595d745d08" });
const read = (path) => parseStrictJson(readFileSync(resolve(REPO, path)));
const digest = (value) => sha256Bytes(Buffer.from(canonicalJson(value)));
const without = (value, key) => Object.fromEntries(Object.entries(value).filter(([k]) => k !== key));
const equal = (a, b) => canonicalJson(a) === canonicalJson(b);
function requireInput(ok, code) { if (!ok) throw new Error(code); }
const ajv = new Ajv2020({ allErrors: true, strict: true });
ajv.addSchema(read("contracts/cscl-01/mapping-receipt-v1.schema.json"));
const validateRequest = ajv.compile(read("contracts/sem-holdout487/request-v1.schema.json"));
const validateResult = ajv.compile(read("contracts/sem-holdout487/result-v1.schema.json"));
const ruleBytes = readFileSync(resolve(REPO, "contracts/sem-holdout487/decision-rule-v1.json"));
requireInput(sha256Bytes(ruleBytes) === "64060fb673aecb2d9116a461007c1b1d5c8b205eb05db921cda994d8e28d2be8", "FIXED_RULE_SOURCE_DRIFT");
const RULE = parseStrictJson(ruleBytes);
const legacy = read("verification/cscl-11-idempiere-mapping-product-v1.json");
requireInput(sha256Bytes(readFileSync(resolve(REPO, BASELINE.candidatePath))) === BASELINE.candidateSha256, "FROZEN_PRODUCT_CANDIDATE_DRIFT");
function safeWire(value) {
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") { requireInput(/^[\x00-\x7f]*$/.test(value), "NON_ASCII_WIRE_STRING"); return; }
  if (typeof value === "number") { requireInput(Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0), "UNSAFE_WIRE_NUMBER"); return; }
  if (Array.isArray(value)) { value.forEach(safeWire); return; }
  requireInput(value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype, "UNSAFE_WIRE_TYPE");
  for (const [key, child] of Object.entries(value)) { safeWire(key); safeWire(child); }
}
export function parseProductPurposeSemanticRequestV1(bytes) {
  const request = parseStrictJson(bytes, { maxBytes: RULE.maxInputBytes });
  // R1: keep the unchanged public wire's integer type, not merely Number's
  // normalized value. Node's exact token source distinguishes 9 from 9.0/9e0.
  // This second bounded pass observes tokens only; the shared strict parser and
  // its frozen validated result retain duplicate/UTF8/resource protections.
  const text = (Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)).toString("utf8");
  JSON.parse(text, (_key, value, context) => {
    if (typeof value === "number") requireInput(/^(?:0|[1-9][0-9]*)$/.test(context?.source ?? ""), "UNSAFE_WIRE_NUMBER_TOKEN");
    return value;
  });
  return request;
}
function admit(value) {
  const request = cloneStrictJson(value, { maxBytes: RULE.maxInputBytes }); safeWire(request);
  requireInput(validateRequest(request), "REQUEST_SCHEMA_ADMISSION_DENIED");
  requireInput(equal(request.baseline, BASELINE), "SOURCE_OR_CANDIDATE_DRIFT");
  requireInput(digest(without(request, "requestDigest")) === request.requestDigest, "REQUEST_DIGEST_MISMATCH");
  const { obligations, nativeEvidence: ev, mappingReceipt: receipt } = request;
  requireInput(new Set(obligations.map((o) => o.id)).size === obligations.length, "DUPLICATE_OBLIGATION_ID");
  for (const relation of ["catalogueRows", "salesLines"]) requireInput(new Set(ev[relation].map((r) => r.key)).size === ev[relation].length, "DUPLICATE_RELATION_KEY");
  const catalogueKeys = new Set(ev.catalogueRows.map((r) => r.key));
  requireInput(ev.salesLines.every((r) => catalogueKeys.has(r.offeringKey)), "BROKEN_OFFERING_REFERENCE");
  requireInput(new Set(receipt.mappings.map((m) => m.holdoutConceptId)).size === receipt.mappings.length, "DUPLICATE_MAPPING_ID");
  const context = (rows) => rows.filter((m) => m.holdoutConceptId !== CONCEPT);
  requireInput(equal(context(receipt.mappings), context(legacy.mappings)), "OFF_SEAM_CONTEXT_CHANGED");
  for (const key of ["schemaVersion", "holdoutSystemId", "capabilityFamily", "frozenCandidateDigest", "frozenCandidateBytesSha256", "extensions", "boundary"]) requireInput(equal(receipt[key], legacy[key]), `LEGACY_TRANSPORT_CONTEXT_CHANGED:${key}`);
  requireInput(receipt.receiptId === "pan487-synthetic-product-mapping-v1", "RECEIPT_ID");
  const selected = receipt.mappings.find((m) => m.holdoutConceptId === CONCEPT);
  requireInput(!selected || ["CORE", "UNMAPPED"].includes(selected.classification), "OFF_SEAM_CLASSIFICATION");
  requireInput(!selected || selected.classification !== "CORE" || selected.candidateElementId === TARGET, "OFF_SEAM_TARGET");
  for (const key of ["coreTotal", "coreIdentityPreserved", "coreContradictions"]) requireInput(receipt.denominators[key] === legacy.denominators[key], `LEGACY_PROPOSAL_CONTEXT_CHANGED:${key}`);
  requireInput(receipt.denominators.applicable === receipt.mappings.length, "MAPPING_DENOMINATOR_MISMATCH");
  for (const [key, category] of [["mappedToCore", "CORE"], ["mappedToVariant", "VARIANT"], ["unmapped", "UNMAPPED"]]) requireInput(receipt.denominators[key] === receipt.mappings.filter((m) => m.classification === category).length, "MAPPING_CATEGORY_COUNT_MISMATCH");
  const profile = digest({ schemaVersion: "pansphaira.sem-holdout487/synthetic-profile/v1", nativeEvidence: ev, obligations });
  const fact = digest({ schemaVersion: "pansphaira.sem-holdout487/synthetic-fact/v1", questionId: "objects-roles", profileDigest: profile });
  requireInput(receipt.holdoutProfileDigest === profile && (!selected || equal(selected.sourceFactDigests, [fact])), "SYNTHETIC_BINDING_DIGEST_MISMATCH");
  requireInput(digest(without(receipt, "receiptDigest")) === receipt.receiptDigest, "RECEIPT_DIGEST_MISMATCH");
  return { request, selected };
}
export function evaluateProductPurposeSemanticV1(value) {
  const { request, selected } = admit(value);
  const { nativeEvidence: ev, obligations } = request;
  const observations = obligations.map((o) => {
    if (!selected || selected.classification === "UNMAPPED") return { obligationId: o.id, status: "UNMAPPED", reason: "NO_SELECTED_MAPPING", evidencePointers: [] };
    const catalogue = ev.catalogueRows.flatMap((r, i) => r.key === o.nativeKey ? [`/nativeEvidence/catalogueRows/${i}`] : []);
    const sales = ev.salesLines.flatMap((r, i) => r.key === o.nativeKey ? [`/nativeEvidence/salesLines/${i}`] : []);
    const evidencePointers = [...catalogue, ...sales];
    if (sales.length) return { obligationId: o.id, status: "CONTRADICTED", reason: "ORDER_OCCURRENCE_NOT_OFFERING", evidencePointers };
    if (catalogue.length) return { obligationId: o.id, status: "PRESERVED", reason: "CATALOGUE_OFFERING_OBSERVED", evidencePointers };
    return { obligationId: o.id, status: "UNKNOWN", reason: "BOUNDED_CAPTURE_NO_WITNESS", evidencePointers };
  });
  const count = (status) => observations.filter((o) => o.status === status).length;
  const counts = { total: obligations.length, preserved: count("PRESERVED"), contradicted: count("CONTRADICTED"), unmapped: count("UNMAPPED"), unsupported: count("UNKNOWN") };
  requireInput(counts.total === counts.preserved + counts.contradicted + counts.unmapped + counts.unsupported, "OBSERVED_PARTITION_INVARIANT");
  const finalSemanticCounts = counts.unsupported ? null : { preserved: counts.preserved, contradicted: counts.contradicted };
  const verdict = counts.contradicted ? "FALSIFIED_WITH_EVIDENCE" : counts.unsupported ? "UNKNOWN" : counts.unmapped ? "NARROWED_UNMAPPED" : "GO";
  const result = { schemaVersion: "pansphaira.sem-holdout487/result/v1", caseId: request.caseId, scopeId: RULE.scopeId, ruleId: RULE.ruleId, baseline: { ...request.baseline }, requestDigest: request.requestDigest, integrity: "PASS", observations, counts, finalSemanticCounts, verdict, applicability: "SYNTHETIC_PRODUCT_OFFERING_PURPOSE_ONLY" };
  requireInput(validateResult(result), "SEMANTIC_RESULT_SCHEMA_INVARIANT"); return result;
}
