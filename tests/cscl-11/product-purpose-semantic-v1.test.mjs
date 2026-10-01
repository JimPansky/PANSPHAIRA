// Public calibration and implementer-authored synthetic checks only; NEVER blind-score evidence.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as actualMappingEntry from "../../src/cscl-11/holdout-gate.mjs";
import { canonicalJson, sha256Bytes } from "../../src/cscl-01/protocol.mjs";
const root = fileURLToPath(new URL("../..", import.meta.url));
const load = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const calibration = load("../fixtures/sem-holdout487/public-calibration.input.json");
const expected = load("../fixtures/sem-holdout487/public-calibration.expected.json");
const concept = "idempiere.product-item-management.objects-roles";
const digest = (value) => sha256Bytes(Buffer.from(canonicalJson(value)));
function redigest(request) {
  const r = request.mappingReceipt;
  r.holdoutProfileDigest = digest({ schemaVersion: "pansphaira.sem-holdout487/synthetic-profile/v1", nativeEvidence: request.nativeEvidence, obligations: request.obligations });
  const fact = digest({ schemaVersion: "pansphaira.sem-holdout487/synthetic-fact/v1", questionId: "objects-roles", profileDigest: r.holdoutProfileDigest });
  for (const row of r.mappings) if (row.holdoutConceptId === concept) row.sourceFactDigests = [fact];
  r.denominators.applicable = r.mappings.length;
  for (const [field, classification] of [["mappedToCore", "CORE"], ["mappedToVariant", "VARIANT"], ["unmapped", "UNMAPPED"]]) r.denominators[field] = r.mappings.filter((m) => m.classification === classification).length;
  const { receiptDigest: unusedReceipt, ...receiptBody } = r; r.receiptDigest = digest(receiptBody);
  const { requestDigest: unusedRequest, ...requestBody } = request; request.requestDigest = digest(requestBody);
  return request;
}
function fixture(mutate = () => {}) { const r = structuredClone(calibration); r.caseId = "implementer.public-purpose"; mutate(r); return redigest(r); }
function cli(r, bytes) {
  return spawnSync(process.execPath, ["scripts/evaluate-product-purpose-semantic-v1.mjs"], { cwd: root, input: bytes ?? JSON.stringify(r), encoding: "utf8", timeout: 10000, env: { PATH: process.env.PATH } });
}
function result(r) { const p = cli(r); assert.equal(p.status, 0, p.stderr); assert.equal(p.stderr, ""); return JSON.parse(p.stdout); }
test("public calibration (not blind evidence): actual CSCL-11 mapping entry and actual CLI equal fixed exact published output", () => {
  assert.equal(typeof actualMappingEntry.evaluateProductPurposeSemanticV1, "function");
  assert.deepEqual(actualMappingEntry.evaluateProductPurposeSemanticV1(calibration), expected);
  assert.deepEqual(result(calibration), expected);
});
test("same-name order occurrence with valid offering reference and freshly digested true legacy flags is materially falsified", () => {
  const r = fixture((v) => { v.obligations[0].nativeKey = v.nativeEvidence.salesLines[0].key; });
  assert.equal(r.mappingReceipt.mappings[0].meaningPreserved, true);
  const out = result(r); assert.equal(out.integrity, "PASS"); assert.equal(out.verdict, "FALSIFIED_WITH_EVIDENCE");
  assert.deepEqual(out.counts, { total: 2, preserved: 1, contradicted: 1, unmapped: 0, unsupported: 0 });
  assert.deepEqual(out.observations[0].evidencePointers, ["/nativeEvidence/salesLines/0"]);
});
test("nonstocked service offering is preserved; labels/key spellings cannot overturn observed relation", () => {
  const r = fixture((v) => { v.nativeEvidence.catalogueRows[1].key = "order-looking-name"; v.obligations[1].nativeKey = "order-looking-name"; v.nativeEvidence.catalogueRows[1].label = "Sales line"; });
  assert.equal(result(r).verdict, "GO");
});
test("cross-relation ownership collision is admitted evidence, contradiction wins and pointers include both witnesses", () => {
  const r = fixture((v) => { v.nativeEvidence.salesLines[0].key = v.nativeEvidence.catalogueRows[0].key; });
  const out = result(r); assert.equal(out.verdict, "FALSIFIED_WITH_EVIDENCE");
  assert.deepEqual(out.observations[0].evidencePointers, ["/nativeEvidence/catalogueRows/0", "/nativeEvidence/salesLines/0"]);
});
test("missing bounded witness stays UNKNOWN with complete denominator, observed lower bounds and null final totals", () => {
  const r = fixture((v) => { v.obligations[0].nativeKey = "capture-not-observed"; });
  const out = result(r); assert.equal(out.verdict, "UNKNOWN"); assert.equal(out.finalSemanticCounts, null);
  assert.deepEqual(out.counts, { total: 2, preserved: 1, contradicted: 0, unmapped: 0, unsupported: 1 });
});
for (const mode of ["UNMAPPED", "OMIT"]) test(`${mode} mapping retains all obligations rather than silently reducing denominator`, () => {
  const r = fixture((v) => {
    const row = v.mappingReceipt.mappings.find((m) => m.holdoutConceptId === concept);
    if (mode === "OMIT") v.mappingReceipt.mappings = v.mappingReceipt.mappings.filter((m) => m !== row);
    else Object.assign(row, { classification: "UNMAPPED", candidateElementId: null, meaningPreserved: false });
  });
  const out = result(r); assert.equal(out.verdict, "NARROWED_UNMAPPED"); assert.equal(out.counts.total, 2); assert.equal(out.counts.unmapped, 2);
});
test("contradiction has verdict precedence over UNKNOWN but final semantic totals still remain null", () => {
  const r = fixture((v) => { v.obligations[0].nativeKey = v.nativeEvidence.salesLines[0].key; v.obligations[1].nativeKey = "unobserved-offering"; });
  const out = result(r); assert.equal(out.verdict, "FALSIFIED_WITH_EVIDENCE"); assert.equal(out.finalSemanticCounts, null); assert.equal(out.counts.unsupported, 1);
});
for (const [name, mutate] of [
  ["duplicate obligation ID", (v) => { v.obligations[1].id = v.obligations[0].id; }],
  ["duplicate within relation", (v) => { v.nativeEvidence.catalogueRows.push(structuredClone(v.nativeEvidence.catalogueRows[0])); }],
  ["broken line offering reference", (v) => { v.nativeEvidence.salesLines[0].offeringKey = "not-observed-catalogue"; }],
  ["off-seam target", (v) => { v.mappingReceipt.mappings[0].candidateElementId = "product-other-purpose"; }],
  ["off-seam context", (v) => { v.mappingReceipt.mappings[1].meaningPreserved = false; }],
  ["source drift", (v) => { v.baseline.commit = "0".repeat(40); }],
  ["unrecognized fields", (v) => { v.nativeEvidence.callerSuccess = true; }],
]) test(`${name}: admission error exit2, no semantic verdict or stdout`, () => {
  const p = cli(fixture(mutate)); assert.equal(p.status, 2); assert.equal(p.stdout, ""); assert.notEqual(p.stderr, "");
});
test("wrong request digest is admission failure, not a semantic negative", () => {
  const r = fixture(); r.requestDigest = "0".repeat(64); const p = cli(r); assert.equal(p.status, 2); assert.equal(p.stdout, "");
});
test("duplicate JSON keys, invalid UTF8 and oversized transport are rejected by actual entry", () => {
  for (const bytes of [JSON.stringify(calibration).replace('"scopeId":', '"scopeId":"product-offering-purpose-v1","scopeId":'), Buffer.from([255]), " ".repeat(131073)]) {
    const p = cli(null, bytes); assert.equal(p.status, 2); assert.equal(p.stdout, "");
  }
});
test("deterministic actual entry returns exact request/source identities without input mutation or time/path fields", () => {
  const r = fixture(); const before = JSON.stringify(r); const a = result(r); const b = result(r); assert.deepEqual(a, b); assert.equal(JSON.stringify(r), before); assert.equal(a.requestDigest, r.requestDigest); assert.deepEqual(a.baseline, r.baseline); assert.equal(a.applicability, "SYNTHETIC_PRODUCT_OFFERING_PURPOSE_ONLY");
});
