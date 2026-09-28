import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import {
  AP06_HISTORICAL_PROBE_V1_PATH,
  AP06_HISTORICAL_SCOPE_V1,
  AP06_PROOF_PROBE_SCHEMA_V2,
  DATAFLOW_ACCEPTANCE_CRITERIA_V2,
  DATAFLOW_EVIDENCE_CLASSES_V2,
  generateIncomingInvoiceAp06ProofProbeV1,
  generateIncomingInvoiceAp06ProofProbeV2,
  verifyIncomingInvoiceAp06ProofProbeV2,
  type Ap06ProofProbeInputV2,
  type IncomingInvoiceAp06ProofProbeInputV1,
} from "../packages/contracts/src/index.js";

const SETUP = "tests/fixtures/incoming-invoice/ap-05-frozen-setup-v1.json";
const EXPECTATIONS = "tests/fixtures/incoming-invoice/ap-02-extraction-dataflow-expectations-v1.json";
const PROBE_V1 = "verification/incoming-invoice-ap06-proof-probe-v1.json";
const PROBE_V2 = "verification/incoming-invoice-ap06-proof-probe-v2.json";
const expectations = JSON.parse(readFileSync(EXPECTATIONS, "utf8"));
const sourceManifest = JSON.parse(readFileSync("tests/fixtures/incoming-invoice/source-manifest-v1.json", "utf8"));

const FROZEN_SOURCES: ReadonlyArray<readonly [string, string]> = [
  ["ap01-blueprint-source-v1", "packages/contracts/src/incoming-invoice-blueprint.ts"],
  ["ap02-intake-source-v1", "packages/contracts/src/incoming-invoice-intake.ts"],
  ["ap02-intake-source-v1", "tests/fixtures/incoming-invoice/supplier-invoice-v1.txt"],
  ["extraction-benchmark-source-v1", "packages/contracts/src/incoming-invoice-extraction-benchmark.ts"],
  ["ap03-holdout-source-v1", "tests/fixtures/incoming-invoice/ap-03-holdout-v1.json"],
  ["ap04-erv-core-v1", "packages/contracts/src/incoming-invoice-erv.ts"],
  ["ap04-erv-core-v1", "tests/fixtures/incoming-invoice/ap-04-erv-cases-v1.json"],
  ["ap04-erv-core-v1", "schemas/contracts/incoming-invoice-erv-v1.schema.json"],
  ["pan365-adaptive-ui-source-v1", "packages/contracts/src/incoming-invoice-adaptive-ui.ts"],
  ["pan365-ap05-receipt-manifest-source-v1", "packages/contracts/src/incoming-invoice-ap05-receipt-manifest.ts"],
];
const SUCCESSOR: readonly [string, string] = ["pan488-extraction-dataflow-source-v1", "packages/contracts/src/incoming-invoice-extraction-dataflow-v2.ts"];

function bytes(path: string): Uint8Array {
  return Uint8Array.from(readFileSync(path));
}
function probeInput(): Ap06ProofProbeInputV2 {
  return {
    predecessorSources: [...FROZEN_SOURCES, SUCCESSOR].map(([releaseId, path]) => ({ releaseId, path, bytes: bytes(path) })),
    historicalProbeV1Bytes: bytes(PROBE_V1),
    dataflowInput: {
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
      },
      ervCasePackBytes: bytes(expectations.ervCasePackPath),
      counterparty: structuredClone(expectations.counterparty),
      matchingMode: structuredClone(expectations.matchingMode),
      tolerancePolicy: structuredClone(expectations.tolerancePolicy),
    },
  } as Ap06ProofProbeInputV2;
}
function probeV1Input(): IncomingInvoiceAp06ProofProbeInputV1 {
  return {
    setup: JSON.parse(readFileSync(SETUP, "utf8")),
    predecessorSources: FROZEN_SOURCES.map(([releaseId, path]) => ({ releaseId, path, bytes: bytes(path) })),
  };
}
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

test("AP-DATAFLOW-AC01 the v2 probe regenerates byte-for-byte with explicit evidence classes and no generic exercised flag", async () => {
  const first = await generateIncomingInvoiceAp06ProofProbeV2(probeInput());
  const replay = await generateIncomingInvoiceAp06ProofProbeV2(probeInput());
  assert.equal(first.serialized, replay.serialized);
  assert.equal(readFileSync(PROBE_V2, "utf8"), first.serialized);
  assert.equal(first.probe.schemaVersion, AP06_PROOF_PROBE_SCHEMA_V2);
  assert.deepEqual([...first.probe.evidenceClasses], [...DATAFLOW_EVIDENCE_CLASSES_V2]);
  assert.deepEqual([...first.probe.acceptanceCriteria], [...DATAFLOW_ACCEPTANCE_CRITERIA_V2]);
  assert.equal(first.probe.verdict.value, "NARROW_GO");
  assert.equal(first.probe.chain.length, 8);
  for (const layer of first.probe.chain) {
    assert.equal("exercised" in (layer as unknown as Record<string, unknown>), false, `${layer.layerId} must not carry the v1 generic exercised flag`);
    assert.equal(layer.executed, layer.evidenceClass === "EXECUTED", `${layer.layerId} class/executed coherence`);
  }
  const extraction = first.probe.chain.find((layer) => layer.layerId === "EXTRACTION");
  assert.ok(extraction);
  assert.equal(extraction.evidenceClass, "EXECUTED");
  assert.equal(extraction.executed, true);
  assert.equal(extraction.observed, first.probe.dataflow.observedFieldsDigest);
  const adaptiveUi = first.probe.chain.find((layer) => layer.layerId === "ADAPTIVE_UI");
  assert.ok(adaptiveUi);
  assert.equal(adaptiveUi.evidenceClass, "SOURCE_BOUND");
  assert.equal(adaptiveUi.executed, false);
  assert.equal(adaptiveUi.observed, "NOT_EXECUTED_IN_THIS_SLICE");
  assert.equal((await verifyIncomingInvoiceAp06ProofProbeV2(first.probe, probeInput())).valid, true);
});

test("AP-DATAFLOW-AC01 the historical v1 probe artifact is retained byte-for-byte and explicitly scoped, not overwritten", async () => {
  const v1 = await generateIncomingInvoiceAp06ProofProbeV1(probeV1Input());
  const checkedIn = readFileSync(PROBE_V1, "utf8");
  assert.equal(checkedIn, v1.serialized);
  assert.equal(v1.probe.verdict.value, "NARROW_GO");
  assert.equal(v1.probe.chain.every((layer) => layer.exercised === true), true);
  const v2 = await generateIncomingInvoiceAp06ProofProbeV2(probeInput());
  assert.equal(v2.probe.historicalScoping.probeV1Path, AP06_HISTORICAL_PROBE_V1_PATH);
  assert.equal(v2.probe.historicalScoping.scope, AP06_HISTORICAL_SCOPE_V1);
  assert.equal(v2.probe.historicalScoping.probeV1Identity.sha256, createHash("sha256").update(readFileSync(PROBE_V1)).digest("hex"));
  assert.notEqual(v2.probe.proofProbeDigest, v1.probe.proofProbeDigest);
});

test("AP-DATAFLOW-AC03/AC04 the probe case matrix records the real controls and the excluded frozen inputs", async () => {
  const probe = (await generateIncomingInvoiceAp06ProofProbeV2(probeInput())).probe;
  assert.equal(probe.caseMatrix.length, 11);
  for (const row of probe.caseMatrix) assert.equal(row.matchesOracle, true);
  const byType = new Map(probe.caseMatrix.map((row) => [row.caseType, row.observed]));
  assert.equal(byType.get("POSITIVE"), "ACCEPTED");
  assert.equal(byType.get("DUPLICATE"), "DUPLICATE_CONTENT_DENIED");
  assert.equal(byType.get("TAMPER"), "TAMPERED_CONTENT_DENIED");
  assert.equal(byType.get("MISSING_INFORMATION"), "EXTRACTION_FIELD_UNKNOWN");
  assert.equal(byType.get("UNSUPPORTED_FIELD"), "UNSUPPORTED_EXTRACTION_FIELD_DENIED");
  assert.equal(byType.get("MATERIAL_FIELD_CHANGE"), "CONFLICT");
  assert.equal(byType.get("TOLERATED_CHANGE"), "MATCHED");
  assert.equal(byType.get("MISSING_CONTEXT"), "MISSING_CONTEXT");
  assert.equal(byType.get("UNVERIFIED_EVIDENCE"), "UNVERIFIED_REFERENCE_EVIDENCE");
  assert.equal(byType.get("CONTRADICTORY_SUBSTITUTION"), expectations.controls.contradictorySubstitutionExpectedReasonCode);
  assert.equal(byType.get("REPLAY"), probe.dataflow.dataflowDigest);
  assert.equal(probe.dataflow.observedGrossAmountMinor, expectations.expectedExtraction.grossAmountMinor);
  assert.equal(probe.dataflow.purchaseOrderNumberState, "UNKNOWN");
  assert.equal(probe.dataflow.receiptReferenceState, "UNKNOWN");
  assert.equal(probe.dataflow.ervDecision, expectations.expectedDecision);
  assert.equal(probe.dataflow.verified, true);
  assert.deepEqual(probe.frozenInputsExcluded.map((entry) => entry.path).sort(), [
    "packages/contracts/src/incoming-invoice-extraction-benchmark.ts",
    "tests/fixtures/incoming-invoice/ap-03-holdout-v1.json",
  ]);
  assert.equal(probe.frozenInputsExcluded.every((entry) => entry.excludedFromProofInputs === true), true);
});

test("AP-DATAFLOW-AC03 the probe verifier rejects self-consistent substitutions, class laundering and substituted sources", async () => {
  const generated = (await generateIncomingInvoiceAp06ProofProbeV2(probeInput())).probe as unknown as Record<string, unknown>;
  const mutations: Array<[string, (value: any) => void]> = [
    ["substituted observed amount", (value) => { value.dataflow.observedGrossAmountMinor += 1; }],
    ["laundered evidence class", (value) => { value.chain[6].evidenceClass = "EXECUTED"; }],
    ["flipped executed flag", (value) => { value.chain[6].executed = true; }],
    ["dropped frozen-input exclusion", (value) => { value.frozenInputsExcluded = []; }],
    ["re-digested verdict", (value) => { value.verdict.value = "FALSIFIED_WITH_EVIDENCE"; }],
    ["substituted historical scope", (value) => { value.historicalScoping.scope = "CURRENT_SOURCE"; }],
  ];
  for (const [name, mutate] of mutations) {
    const candidate = clone(generated);
    mutate(candidate);
    const result = await verifyIncomingInvoiceAp06ProofProbeV2(candidate, probeInput());
    assert.equal(result.valid, false, name);
    assert.deepEqual(result.reasonCodes, ["PROBE_IDENTITY_MISMATCH"], name);
  }

  const substitutedHistory = probeInput() as any;
  substitutedHistory.historicalProbeV1Bytes = Uint8Array.from([...substitutedHistory.historicalProbeV1Bytes, 32]);
  const historyResult = await verifyIncomingInvoiceAp06ProofProbeV2(generated, substitutedHistory);
  assert.equal(historyResult.valid, false);
  assert.deepEqual(historyResult.reasonCodes, ["PROBE_IDENTITY_MISMATCH"]);

  const substitutedPredecessor = probeInput() as any;
  substitutedPredecessor.predecessorSources = (substitutedPredecessor.predecessorSources as Array<{ releaseId: string; path: string; bytes: Uint8Array }>).map((source) =>
    source.path === "packages/contracts/src/incoming-invoice-extraction-benchmark.ts"
      ? { ...source, bytes: Uint8Array.from([...source.bytes, 32]) }
      : source);
  await assert.rejects(generateIncomingInvoiceAp06ProofProbeV2(substitutedPredecessor), /SOURCE_IDENTITY_MISMATCH/);

  const missingSuccessor = probeInput() as any;
  missingSuccessor.predecessorSources = (missingSuccessor.predecessorSources as Array<{ releaseId: string }>).filter((source) => source.releaseId !== SUCCESSOR[0]);
  await assert.rejects(generateIncomingInvoiceAp06ProofProbeV2(missingSuccessor), /SOURCE_MISSING/);

  const nonObject = await verifyIncomingInvoiceAp06ProofProbeV2(null, probeInput());
  assert.deepEqual(nonObject, { valid: false, reasonCodes: ["PROBE_SHAPE_DENIED"] });
});

test("AP-DATAFLOW-AC01 the v2 probe record validates against its versioned JSON schema", async () => {
  const probe = (await generateIncomingInvoiceAp06ProofProbeV2(probeInput())).probe;
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(
    JSON.parse(readFileSync("schemas/contracts/incoming-invoice-ap06-proof-probe-v2.schema.json", "utf8")),
  );
  assert.equal(validate(clone(probe)), true, JSON.stringify(validate.errors));
  const invalid = clone(probe) as unknown as Record<string, unknown>;
  (invalid.chain as Array<Record<string, unknown>>)[0]!.evidenceClass = "NOT_A_CLASS";
  assert.equal(validate(invalid), false);
});
