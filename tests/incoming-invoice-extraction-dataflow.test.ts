import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import {
  AP04_ERV_CASE_PACK_SHA256_V1,
  AP02_BOUNDED_EXTRACTION_REPORT_V1,
  DATAFLOW_EVIDENCE_CLASSES_V2,
  INCOMING_INVOICE_EXTRACTION_DATAFLOW_SCHEMA_V2,
  composeIncomingInvoiceErvCaseV2,
  evaluateErvMatchingCaseV1,
  extractSyntheticSupplierInvoiceFieldsV1,
  runIncomingInvoiceExtractionDataflowV2,
  verifyIncomingInvoiceExtractionDataflowV2,
  type ErvCaseDecisionV1,
  type ErvCasePackV1,
  type IncomingInvoiceExtractionDataflowInputV2,
} from "../packages/contracts/src/index.js";

const expectations = JSON.parse(readFileSync("tests/fixtures/incoming-invoice/ap-02-extraction-dataflow-expectations-v1.json", "utf8"));
const sourceManifest = JSON.parse(readFileSync("tests/fixtures/incoming-invoice/source-manifest-v1.json", "utf8"));

function bytes(path: string): Uint8Array {
  return Uint8Array.from(readFileSync(path));
}
function dataflowInput(): IncomingInvoiceExtractionDataflowInputV2 {
  return {
    intakeRequest: {
      schemaVersion: "chimpmaera.incoming-invoice/intake-request/v1",
      blueprintSchemaVersion: "chimpmaera.incoming-invoice/blueprint/v1",
      requestedAuthority: "LOCAL_SYNTHETIC_PROOF",
      requestedEffects: ["READ_SYNTHETIC", "WRITE_LOCAL_PROOF"],
      fileName: sourceManifest.fileName,
      mediaType: sourceManifest.mediaType,
      bytes: bytes(expectations.documentPath),
      claimedSha256: sourceManifest.sha256,
      provenance: structuredClone(sourceManifest.provenance),
      metadata: {
        documentId: "doc:synthetic:ap-02:supplier-invoice-v1",
        versionOrdinal: 1,
        documentKind: "SUPPLIER_INVOICE",
        issueDate: "2026-09-02",
        currency: "EUR",
      },
      identityCandidates: [structuredClone(sourceManifest.declaredIdentity)],
    } as IncomingInvoiceExtractionDataflowInputV2["intakeRequest"],
    ervCasePackBytes: bytes(expectations.ervCasePackPath),
    counterparty: structuredClone(expectations.counterparty),
    matchingMode: structuredClone(expectations.matchingMode),
    tolerancePolicy: structuredClone(expectations.tolerancePolicy),
  };
}
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

test("AP-DATAFLOW-AC02 the bounded dataflow composes from the actual document/intake bytes into the existing ERV decision path", async () => {
  const input = dataflowInput();
  const result = await runIncomingInvoiceExtractionDataflowV2(input);
  assert.equal(result.outcome, "COMPOSED");
  if (result.outcome !== "COMPOSED") return;
  const dataflow = result.dataflow;
  assert.equal(dataflow.schemaVersion, INCOMING_INVOICE_EXTRACTION_DATAFLOW_SCHEMA_V2);
  // The executed extraction input IS the ingested document version, byte for byte.
  assert.equal(dataflow.extraction.extractionInputSha256, dataflow.document.contentSha256);
  assert.equal(dataflow.extraction.sourceVersionId, dataflow.document.versionId);
  assert.equal(dataflow.document.contentSha256, sourceManifest.sha256);
  assert.equal(dataflow.document.synthetic, true);
  assert.equal(dataflow.document.customerData, false);
  // The observed extracted field is the downstream business input.
  const invoiceReference = dataflow.ervCase.references.find((reference) => reference.body.referenceKind === "INVOICE");
  assert.ok(invoiceReference);
  assert.equal(invoiceReference.body.matchAmountMinor, 12345);
  assert.equal(dataflow.decision.outcome, "MATCHED");
  assert.equal(dataflow.decision.caseId, dataflow.ervCase.caseId);
  // The frozen AP-04 pack is used as the versioned registry only; its precomputed
  // invoice amounts are NOT the business input here.
  assert.notEqual(invoiceReference.body.matchAmountMinor, 2400);
  assert.equal(AP04_ERV_CASE_PACK_SHA256_V1, expectations.ervCasePackSha256);
  assert.equal((await verifyIncomingInvoiceExtractionDataflowV2(dataflow, input)).valid, true);
  assert.equal(Object.isFrozen(dataflow), true);
  assert.match(dataflow.dataflowDigest, /^[a-f0-9]{64}$/);
});

test("AP-DATAFLOW-AC03 observed fields match independently authored expectations, a material change moves the decision and a re-digested substitution is denied", async () => {
  const input = dataflowInput();
  const result = await runIncomingInvoiceExtractionDataflowV2(input);
  assert.equal(result.outcome, "COMPOSED");
  if (result.outcome !== "COMPOSED") return;
  const dataflow = result.dataflow;
  assert.equal(expectations.provenance, "HAND_AUTHORED_INDEPENDENT_EXPECTATION_NOT_PRODUCED_BY_THE_EXTRACTOR");
  const fields = dataflow.extraction.fields;
  assert.equal(fields.grossAmountMinor.state, "KNOWN");
  if (fields.grossAmountMinor.state === "KNOWN") {
    assert.equal(fields.grossAmountMinor.value, expectations.expectedExtraction.grossAmountMinor);
    assert.equal(fields.grossAmountMinor.evidence.stage, "EXTRACTION");
    assert.equal(fields.grossAmountMinor.evidence.sourceVersionId, dataflow.document.versionId);
  }
  assert.deepEqual(clone(fields.purchaseOrderNumber), expectations.expectedExtraction.purchaseOrderNumber);
  assert.deepEqual(clone(fields.receiptReference), expectations.expectedExtraction.receiptReference);
  assert.equal(dataflow.decision.outcome, expectations.expectedDecision);

  const pack = JSON.parse(readFileSync(expectations.ervCasePackPath, "utf8")) as ErvCasePackV1;
  const observed = expectations.expectedExtraction.grossAmountMinor as number;
  const changed = composeIncomingInvoiceErvCaseV2(dataflow.document, observed + expectations.controls.materialFieldChangeDeltaMinor, input.counterparty, input.matchingMode, input.tolerancePolicy);
  const changedDecision: ErvCaseDecisionV1 = evaluateErvMatchingCaseV1(changed, pack);
  assert.equal(changedDecision.outcome, expectations.controls.materialFieldChangeExpectedDecision);
  const tolerated = composeIncomingInvoiceErvCaseV2(dataflow.document, observed + expectations.controls.toleratedFieldChangeDeltaMinor, input.counterparty, input.matchingMode, expectations.controls.toleratedTolerancePolicy);
  assert.equal(evaluateErvMatchingCaseV1(tolerated, pack).outcome, expectations.controls.toleratedExpectedDecision);

  // A correctly re-digested but semantically contradictory substitution must not succeed.
  const fabricated = clone(dataflow) as unknown as { extraction: { fields: { grossAmountMinor: { value: number } } } };
  fabricated.extraction.fields.grossAmountMinor.value = observed + 1;
  const verdict = await verifyIncomingInvoiceExtractionDataflowV2(fabricated, input);
  assert.equal(verdict.valid, false);
  assert.deepEqual(verdict.reasonCodes, ["DATAFLOW_IDENTITY_MISMATCH"]);

  const forgedDecision = clone(dataflow) as unknown as { decision: { outcome: string } };
  forgedDecision.decision.outcome = "DENIED";
  assert.equal((await verifyIncomingInvoiceExtractionDataflowV2(forgedDecision, input)).valid, false);
});

test("AP-DATAFLOW-AC04 duplicate, tamper, missing-information, unsupported-field and replay controls are typed on the affected handoffs", async () => {
  const input = dataflowInput();
  const controls = expectations.controls;
  const missing = (() => {
    try {
      extractSyntheticSupplierInvoiceFieldsV1(controls.missingInformationDocument, "version:control");
      return "EXTRACTED";
    } catch (error) {
      return error instanceof Error ? error.message : "ERROR";
    }
  })();
  assert.equal(missing, controls.missingInformationExpectedReasonCode);
  const unsupported = (() => {
    try {
      extractSyntheticSupplierInvoiceFieldsV1(controls.unsupportedFieldDocument, "version:control");
      return "EXTRACTED";
    } catch (error) {
      return error instanceof Error ? error.message : "ERROR";
    }
  })();
  assert.equal(unsupported, controls.unsupportedFieldExpectedReasonCode);

  // duplicate and tamper are denied by the released intake before any extraction runs.
  const tampered = Uint8Array.from(input.intakeRequest.bytes);
  tampered[tampered.length - 1] = 48;
  const denied = await runIncomingInvoiceExtractionDataflowV2({
    ...input,
    intakeRequest: { ...input.intakeRequest, bytes: tampered },
  });
  assert.deepEqual(denied, { outcome: "REJECTED", stage: "INTAKE", reasonCode: "INTAKE_DENIED" });

  const substitutedPack = await runIncomingInvoiceExtractionDataflowV2({
    ...input,
    ervCasePackBytes: Uint8Array.from([...input.ervCasePackBytes, 32]),
  });
  assert.deepEqual(substitutedPack, { outcome: "REJECTED", stage: "VALIDATION", reasonCode: "CASE_PACK_IDENTITY_DENIED" });

  const replay = await runIncomingInvoiceExtractionDataflowV2(input);
  const replayAgain = await runIncomingInvoiceExtractionDataflowV2(input);
  assert.equal(replay.outcome, "COMPOSED");
  assert.equal(replayAgain.outcome, "COMPOSED");
  if (replay.outcome === "COMPOSED" && replayAgain.outcome === "COMPOSED") {
    assert.equal(replay.dataflow.dataflowDigest, replayAgain.dataflow.dataflowDigest);
  }

  const report = extractSyntheticSupplierInvoiceFieldsV1(readFileSync(expectations.documentPath, "utf8"), "version:control");
  assert.equal(report.schemaVersion, AP02_BOUNDED_EXTRACTION_REPORT_V1);
  assert.equal(report.deterministicSyntheticExtraction, true);
  assert.deepEqual([...report.nonclaims], ["NO_OCR_OR_MODEL_INFERENCE", "NO_DOCUMENT_AI_ACCURACY_CLAIM", "NO_UNIVERSAL_EXTRACTION_QUALITY_CLAIM"]);
  assert.equal(Object.isFrozen(report), true);
});

test("AP-DATAFLOW-AC01 no unexecuted layer claims execution and no generic exercised flag exists", async () => {
  const result = await runIncomingInvoiceExtractionDataflowV2(dataflowInput());
  assert.equal(result.outcome, "COMPOSED");
  if (result.outcome !== "COMPOSED") return;
  const layers = result.dataflow.layers;
  assert.equal(layers.length, 5);
  for (const layer of layers) {
    assert.equal(layer.executed, layer.evidenceClass === "EXECUTED", `${layer.layerId} class/executed coherence`);
    assert.equal("exercised" in (layer as unknown as Record<string, unknown>), false, `${layer.layerId} must not carry the v1 generic exercised flag`);
    assert.ok(DATAFLOW_EVIDENCE_CLASSES_V2.includes(layer.evidenceClass));
    assert.ok(layer.evidenceClassBasis.length > 0);
  }
  const extractionLayer = layers.find((layer) => layer.layerId === "EXTRACTION");
  assert.ok(extractionLayer);
  assert.equal(extractionLayer.evidenceClass, "EXECUTED");
  assert.equal(extractionLayer.observed, result.dataflow.extraction.observedFieldsDigest);
  const validationLayer = layers.find((layer) => layer.layerId === "VALIDATION");
  assert.ok(validationLayer);
  assert.equal(validationLayer.evidenceClass, "SCHEMA_VALIDATED");
  assert.equal(validationLayer.executed, false);
});

test("AP-DATAFLOW-AC02/AC04 the dataflow and probe v2 records validate against their versioned JSON schemas", async () => {
  const result = await runIncomingInvoiceExtractionDataflowV2(dataflowInput());
  assert.equal(result.outcome, "COMPOSED");
  if (result.outcome !== "COMPOSED") return;
  const validateDataflow = new Ajv2020({ allErrors: true, strict: true }).compile(
    JSON.parse(readFileSync("schemas/contracts/incoming-invoice-extraction-dataflow-v2.schema.json", "utf8")),
  );
  assert.equal(validateDataflow(clone(result.dataflow)), true, JSON.stringify(validateDataflow.errors));
  const invalid = clone(result.dataflow) as unknown as Record<string, unknown>;
  (invalid as { document: { contentSha256: string } }).document.contentSha256 = "not-a-digest";
  assert.equal(validateDataflow(invalid), false);
});

test("AP-DATAFLOW focused suites are registered exactly once in the canonical pretest", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
  assert.equal(packageJson.scripts["incoming-invoice-extraction-dataflow:test"],
    "npm run build --silent && node --test dist/tests/incoming-invoice-extraction-dataflow.test.js");
  assert.equal(packageJson.scripts["incoming-invoice-extraction-dataflow:test:compiled"],
    "node --test dist/tests/incoming-invoice-extraction-dataflow.test.js");
  assert.equal(packageJson.scripts["incoming-invoice-ap06-proof-probe-v2:test:compiled"],
    "node --test dist/tests/incoming-invoice-ap06-proof-probe-v2.test.js");
  const pretest = packageJson.scripts.pretest ?? "";
  assert.equal((pretest.match(/npm run incoming-invoice-extraction-dataflow:test/g) ?? []).length, 1);
  assert.equal((pretest.match(/npm run incoming-invoice-ap06-proof-probe-v2:test/g) ?? []).length, 1);
});
