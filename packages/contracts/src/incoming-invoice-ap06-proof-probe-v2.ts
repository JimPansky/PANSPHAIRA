import { Buffer } from "node:buffer";
import { canonicalJson } from "./canonical-json.js";
import {
  evaluateErvMatchingCaseV1,
  type ErvCaseDecisionV1,
  type ErvCasePackV1,
} from "./incoming-invoice-erv.js";
import {
  INCOMING_INVOICE_INTAKE_REQUEST_V1,
  InMemorySyntheticInvoiceIntakeStoreV1,
  intakeSyntheticSupplierInvoiceV1,
  sha256HexV1,
  type IntakeResultV1,
} from "./incoming-invoice-intake.js";
import {
  AP02_BOUNDED_EXTRACTION_REPORT_V1,
  DATAFLOW_EVIDENCE_CLASSES_V2,
  composeIncomingInvoiceErvCaseV2,
  extractSyntheticSupplierInvoiceFieldsV1,
  runIncomingInvoiceExtractionDataflowV2,
  verifyIncomingInvoiceExtractionDataflowV2,
  type DataflowEvidenceClassV2,
  type IncomingInvoiceExtractionDataflowInputV2,
  type IncomingInvoiceExtractionDataflowV2,
} from "./incoming-invoice-extraction-dataflow-v2.js";

/**
 * AP-06 proof probe v2 — evidence-class successor of the frozen v1 probe.
 *
 * v1 assigned a generic `exercised: true` to every layer of the eight-layer chain,
 * including the EXTRACTION layer, which was only described by a frozen
 * benchmark/holdout that is excluded from the proof inputs. v2 replaces that
 * unqualified flag with an explicit, versioned evidence class per layer
 * (SOURCE_BOUND / SCHEMA_VALIDATED / EXECUTED) plus the observed result, and it
 * carries the actual bounded extraction-to-decision dataflow execution.
 * The v1 artifact is explicitly scoped as a historical release line and its bytes
 * are re-bound unchanged here; nothing historical is overwritten.
 */

export const AP06_PROOF_PROBE_SCHEMA_V2 = "chimpmaera.incoming-invoice/ap06-proof-probe/v2" as const;
export const AP06_HISTORICAL_PROBE_V1_PATH = "verification/incoming-invoice-ap06-proof-probe-v1.json" as const;
export const AP06_HISTORICAL_SCOPE_V1 = "HISTORICAL_RELEASE_LINE_NOT_CURRENT_SOURCE" as const;
export const AP06_EXCLUDED_FROM_PROOF_INPUTS_V2 = "EXCLUDED_FROM_PROOF_INPUTS" as const;
export const DATAFLOW_ACCEPTANCE_CRITERIA_V2 = [
  "AP-DATAFLOW-AC01",
  "AP-DATAFLOW-AC02",
  "AP-DATAFLOW-AC03",
  "AP-DATAFLOW-AC04",
  "AP-DATAFLOW-AC05",
] as const;

export const AP06_NONCLAIMS_V2 = [
  "NO_CUSTOMER_DATA_EVALUATED",
  "NO_EXTERNAL_PROVIDER_EVALUATED",
  "NO_PRODUCTIVE_ALLOCATION_OR_POSTING_AUTHORIZED",
  "NO_BOOKING_AUTHORITY_GRANTED",
  "NO_LIVE_ERP_SYSTEM_CLAIM",
  "NO_OCR_OR_MODEL_ACCURACY_CLAIM",
  "NO_INVENTED_CAPABILITY_OR_AUTHORITY",
] as const;

type LayerIdV2 =
  | "SOURCE"
  | "DOCUMENT"
  | "EXTRACTION"
  | "VALIDATION"
  | "MATCHING"
  | "EXCEPTION_ADVISOR"
  | "ADAPTIVE_UI"
  | "RECEIPT_EVIDENCE_VERDICT";
type ExecutableLayerIdV2 = "SOURCE" | "DOCUMENT" | "EXTRACTION" | "VALIDATION" | "MATCHING" | "EXCEPTION_ADVISOR" | "ADAPTIVE_UI" | "RECEIPT_EVIDENCE_VERDICT";
type EvidenceClassV2 = DataflowEvidenceClassV2 | typeof AP06_EXCLUDED_FROM_PROOF_INPUTS_V2;
type IdentityV2 = Readonly<{ byteLength: number; sha256: string }>;
type SourceInputV2 = Readonly<{ releaseId: string; path: string; bytes: Uint8Array }>;

// Byte-identical v1-frozen predecessor obligations (re-bound unchanged so the
// historical release line stays valid).
const FROZEN_V1_OBLIGATIONS: readonly Readonly<{ releaseId: string; path: string; sha256: string; bytes: number }>[] = [
  { releaseId: "ap01-blueprint-source-v1", path: "packages/contracts/src/incoming-invoice-blueprint.ts", sha256: "aad1b877c096d4605b80b141100897fab41f62622f5434be59059989b8514550", bytes: 7414 },
  { releaseId: "ap02-intake-source-v1", path: "packages/contracts/src/incoming-invoice-intake.ts", sha256: "38490af300dce7965deebf56755ac59be117db711bd7bc478e19538947a412fc", bytes: 17628 },
  { releaseId: "ap02-intake-source-v1", path: "tests/fixtures/incoming-invoice/supplier-invoice-v1.txt", sha256: "fad5979234e5ca8d31e2a10e7a9650c5f4f32693610c2fcf2678b0ab5a5f525b", bytes: 153 },
  { releaseId: "extraction-benchmark-source-v1", path: "packages/contracts/src/incoming-invoice-extraction-benchmark.ts", sha256: "f64575a455e69906f930d8b9c0b6303a73c1a3896d98a9b451aee488229b52df", bytes: 16353 },
  { releaseId: "ap03-holdout-source-v1", path: "tests/fixtures/incoming-invoice/ap-03-holdout-v1.json", sha256: "41959bab323542694b120f8d55314620c214f3a44f7c8d36270e47ac8f9b9edb", bytes: 2991 },
  { releaseId: "ap04-erv-core-v1", path: "packages/contracts/src/incoming-invoice-erv.ts", sha256: "6ba5250783df35f60602a11437c843272ab014bf24e69135cfbf52dfb41750cf", bytes: 21114 },
  { releaseId: "ap04-erv-core-v1", path: "tests/fixtures/incoming-invoice/ap-04-erv-cases-v1.json", sha256: "136bbdfcb61bf48ab0043d828dbf797e9b9156f58d284cc7f9b921da59040845", bytes: 19841 },
  { releaseId: "ap04-erv-core-v1", path: "schemas/contracts/incoming-invoice-erv-v1.schema.json", sha256: "7eabf5156f5a74404499b67d435c879f123f9d842028c739033269edd7959caf", bytes: 12657 },
  { releaseId: "pan365-adaptive-ui-source-v1", path: "packages/contracts/src/incoming-invoice-adaptive-ui.ts", sha256: "e60fb079364bc48d12629825531299bc7abd9986c5299067e450e7577ef75b1f", bytes: 33045 },
  { releaseId: "pan365-ap05-receipt-manifest-source-v1", path: "packages/contracts/src/incoming-invoice-ap05-receipt-manifest.ts", sha256: "fdddfe45d695f5bb6b0f727119b7df6d4e974ed2fe6e1301f174fadee27f3ea4", bytes: 23192 },
];

// Successor modules of this correction. They are bound by the identity recorded from
// their supplied bytes (re-read from the repository path they name), not by a frozen
// historical digest: they are current source, not a historical release line.
const SUCCESSOR_SOURCES_V2: readonly Readonly<{ releaseId: string; path: string }>[] = [
  { releaseId: "pan488-extraction-dataflow-source-v1", path: "packages/contracts/src/incoming-invoice-extraction-dataflow-v2.ts" },
];

export interface Ap06ProofProbeInputV2 {
  readonly predecessorSources: readonly SourceInputV2[];
  readonly dataflowInput: IncomingInvoiceExtractionDataflowInputV2;
  readonly historicalProbeV1Bytes: Uint8Array;
}

export interface Ap06LayerEvidenceV2 {
  readonly ordinal: number;
  readonly layerId: LayerIdV2;
  readonly capabilityId: string;
  readonly modulePath: string;
  readonly moduleIdentity: IdentityV2;
  readonly evidenceClass: EvidenceClassV2;
  readonly executed: boolean;
  readonly evidenceClassBasis: string;
  readonly observed: string;
}

export interface Ap06CaseMatrixRowV2 {
  readonly caseType: string;
  readonly layerId: string;
  readonly observed: string;
  readonly oracle: string;
  readonly matchesOracle: true;
}

export interface Ap06ProofProbeV2 {
  readonly schemaVersion: typeof AP06_PROOF_PROBE_SCHEMA_V2;
  readonly proofProbeVersion: "2.0.0";
  readonly taskId: "PS488-AP-DATAFLOW-01";
  readonly issue: "JoFe2/PANSPHAIRA#488";
  readonly evidenceClasses: readonly DataflowEvidenceClassV2[];
  readonly historicalScoping: Readonly<{
    probeV1Path: typeof AP06_HISTORICAL_PROBE_V1_PATH;
    probeV1Identity: IdentityV2;
    scope: typeof AP06_HISTORICAL_SCOPE_V1;
    note: string;
  }>;
  readonly predecessorBinding: readonly Readonly<{ releaseId: string; path: string; sha256: string; bytes: number }>[];
  readonly chain: readonly Ap06LayerEvidenceV2[];
  readonly frozenInputsExcluded: readonly Readonly<{ releaseId: string; path: string; role: string; excludedFromProofInputs: true; note: string }>[];
  readonly dataflow: Readonly<{
    schemaVersion: string;
    documentVersionId: string;
    documentContentSha256: string;
    recordDigest: string;
    extractionInputSha256: string;
    extractorId: string;
    observedFieldsDigest: string;
    observedGrossAmountMinor: number;
    purchaseOrderNumberState: string;
    receiptReferenceState: string;
    ervCaseId: string;
    ervDecision: string;
    dataflowDigest: string;
    verified: boolean;
  }>;
  readonly caseMatrix: readonly Ap06CaseMatrixRowV2[];
  readonly verdict: Readonly<{ value: "NARROW_GO" | "FALSIFIED_WITH_EVIDENCE"; reasons: readonly string[] }>;
  readonly acceptanceCriteria: readonly string[];
  readonly nonclaims: readonly string[];
  readonly proofProbeDigest: string;
}

export interface Ap06ProofProbeVerificationV2 {
  readonly valid: boolean;
  readonly reasonCodes: readonly string[];
}

class ProbeV2Error extends Error {
  constructor(readonly code: string) { super(code); }
}

function identity(value: Uint8Array | string): IdentityV2 {
  const bytes = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  return { byteLength: bytes.byteLength, sha256: sha256HexV1(bytes) };
}
function canonicalIdentity(value: unknown): IdentityV2 {
  return identity(canonicalJson(value));
}

function bindPredecessors(sources: readonly SourceInputV2[]): ReadonlyMap<string, SourceInputV2> {
  const byPath = new Map<string, SourceInputV2>();
  for (const obligation of FROZEN_V1_OBLIGATIONS) {
    const source = sources.find((candidate) => candidate.releaseId === obligation.releaseId && candidate.path === obligation.path);
    if (source === undefined) throw new ProbeV2Error("SOURCE_MISSING");
    const actual = identity(source.bytes);
    if (actual.sha256 !== obligation.sha256 || actual.byteLength !== obligation.bytes) throw new ProbeV2Error("SOURCE_IDENTITY_MISMATCH");
    byPath.set(obligation.path, source);
  }
  for (const successor of SUCCESSOR_SOURCES_V2) {
    const source = sources.find((candidate) => candidate.releaseId === successor.releaseId && candidate.path === successor.path);
    if (source === undefined) throw new ProbeV2Error("SOURCE_MISSING");
    byPath.set(successor.path, source);
  }
  return byPath;
}

function intakeObserved(result: IntakeResultV1): string {
  return result.outcome === "ACCEPTED" ? "ACCEPTED" : result.reasonCodes[0];
}
function row(caseType: string, layerId: string, observed: string, oracle: string): Ap06CaseMatrixRowV2 {
  if (observed !== oracle) throw new ProbeV2Error(`ORACLE_MISMATCH:${caseType}`);
  return { caseType, layerId, observed, oracle, matchesOracle: true };
}
function decisionOutcome(decision: ErvCaseDecisionV1): string {
  return decision.outcome;
}
function exceptionCodeOf(decision: ErvCaseDecisionV1): string {
  return decision.outcome === "EXCEPTION" ? decision.exceptionCode : decision.outcome;
}

async function buildCaseMatrix(
  dataflowInput: IncomingInvoiceExtractionDataflowInputV2,
  dataflow: IncomingInvoiceExtractionDataflowV2,
  pack: ErvCasePackV1,
  supplierBytes: Uint8Array,
): Promise<Ap06CaseMatrixRowV2[]> {
  const rows: Ap06CaseMatrixRowV2[] = [];
  const request = dataflowInput.intakeRequest;
  const positive = await intakeSyntheticSupplierInvoiceV1(request, new InMemorySyntheticInvoiceIntakeStoreV1());
  rows.push(row("POSITIVE", "SOURCE", intakeObserved(positive), "ACCEPTED"));

  const duplicateStore = new InMemorySyntheticInvoiceIntakeStoreV1();
  await intakeSyntheticSupplierInvoiceV1(request, duplicateStore);
  const duplicate = await intakeSyntheticSupplierInvoiceV1(request, duplicateStore);
  rows.push(row("DUPLICATE", "SOURCE", intakeObserved(duplicate), "DUPLICATE_CONTENT_DENIED"));

  const tampered = Uint8Array.from(supplierBytes);
  tampered[tampered.length - 1] = 48;
  const tamper = await intakeSyntheticSupplierInvoiceV1(
    { ...request, bytes: tampered, claimedSha256: sha256HexV1(tampered) },
    new InMemorySyntheticInvoiceIntakeStoreV1(),
  );
  rows.push(row("TAMPER", "SOURCE", intakeObserved(tamper), "TAMPERED_CONTENT_DENIED"));

  // MISSING_INFORMATION — EXTRACTION: the bounded extractor leaves an absent
  // material amount explicit as a typed rejection rather than inventing a value.
  const missingAmount = (() => {
    try {
      extractSyntheticSupplierInvoiceFieldsV1("supplier_id=SYN-SUP-001\ncurrency=EUR\n", "version:test");
      return "EXTRACTED";
    } catch (error) {
      return error instanceof Error ? error.message : "EXTRACTION_ERROR";
    }
  })();
  rows.push(row("MISSING_INFORMATION", "EXTRACTION", missingAmount, "EXTRACTION_FIELD_UNKNOWN"));

  const unsupportedField = (() => {
    try {
      extractSyntheticSupplierInvoiceFieldsV1("gross_amount=1.00\ninvented_field=1\n", "version:test");
      return "EXTRACTED";
    } catch (error) {
      return error instanceof Error ? error.message : "EXTRACTION_ERROR";
    }
  })();
  rows.push(row("UNSUPPORTED_FIELD", "EXTRACTION", unsupportedField, "UNSUPPORTED_EXTRACTION_FIELD_DENIED"));

  // MATERIAL_FIELD_CHANGE — MATCHING: one changed observed material value changes
  // the downstream business decision under the same frozen variant registry.
  const changedCase = composeIncomingInvoiceErvCaseV2(
    dataflow.document,
    dataflow.extraction.fields.grossAmountMinor.state === "KNOWN" ? dataflow.extraction.fields.grossAmountMinor.value + 1 : 0,
    dataflowInput.counterparty,
    dataflowInput.matchingMode,
    dataflowInput.tolerancePolicy,
  );
  rows.push(row("MATERIAL_FIELD_CHANGE", "MATCHING", decisionOutcome(evaluateErvMatchingCaseV1(changedCase, pack)), "CONFLICT"));

  const tolerantInput = { ...dataflowInput, tolerancePolicy: { variantId: "ABS_MINOR_V1", version: "1.0.0" } };
  const tolerantCase = composeIncomingInvoiceErvCaseV2(
    dataflow.document,
    dataflow.extraction.fields.grossAmountMinor.state === "KNOWN" ? dataflow.extraction.fields.grossAmountMinor.value + 45 : 0,
    tolerantInput.counterparty,
    tolerantInput.matchingMode,
    tolerantInput.tolerancePolicy,
  );
  rows.push(row("TOLERATED_CHANGE", "MATCHING", decisionOutcome(evaluateErvMatchingCaseV1(tolerantCase, pack)), "MATCHED"));

  // MISSING_CONTEXT — EXCEPTION_ADVISOR: an absent required receipt reference stays typed.
  const missingReceiptCase = {
    ...dataflow.ervCase,
    references: dataflow.ervCase.references.filter((reference) => reference.body.referenceKind !== "RECEIPT"),
  };
  rows.push(row("MISSING_CONTEXT", "EXCEPTION_ADVISOR", exceptionCodeOf(evaluateErvMatchingCaseV1(missingReceiptCase, pack)), "MISSING_CONTEXT"));

  // UNVERIFIED_REFERENCE_EVIDENCE — EXCEPTION_ADVISOR: an unbound digest stays typed.
  const unverifiedCase = {
    ...dataflow.ervCase,
    references: dataflow.ervCase.references.map((reference, index) => index === 0
      ? { ...reference, evidence: { ...reference.evidence, contentSha256: "0".repeat(64) } }
      : reference),
  };
  rows.push(row("UNVERIFIED_EVIDENCE", "EXCEPTION_ADVISOR", exceptionCodeOf(evaluateErvMatchingCaseV1(unverifiedCase, pack)), "UNVERIFIED_REFERENCE_EVIDENCE"));

  // CONTRADICTORY_SUBSTITUTION — VALIDATION: a self-consistently re-digested
  // substitution of the observed extraction value must not become success.
  const fabricated = JSON.parse(canonicalJson(dataflow)) as IncomingInvoiceExtractionDataflowV2;
  const fabricatedRecord = fabricated as unknown as Record<string, unknown>;
  const fabricatedExtraction = fabricatedRecord.extraction as Record<string, unknown>;
  const fabricatedFields = fabricatedExtraction.fields as Record<string, unknown>;
  const knownGross = fabricatedFields.grossAmountMinor as { value: number };
  knownGross.value = knownGross.value + 1;
  const verifiedFabrication = await verifyIncomingInvoiceExtractionDataflowV2(fabricated, dataflowInput);
  rows.push(row("CONTRADICTORY_SUBSTITUTION", "VALIDATION", verifiedFabrication.valid ? "ACCEPTED" : verifiedFabrication.reasonCodes[0]!, "DATAFLOW_IDENTITY_MISMATCH"));

  // REPLAY — RECEIPT_EVIDENCE_VERDICT: deterministic re-execution reproduces the digest.
  const replay = await runIncomingInvoiceExtractionDataflowV2(dataflowInput);
  rows.push(row("REPLAY", "RECEIPT_EVIDENCE_VERDICT", replay.outcome === "COMPOSED" ? replay.dataflow.dataflowDigest : "MISSING", dataflow.dataflowDigest));
  return rows;
}

function buildChain(byPath: ReadonlyMap<string, SourceInputV2>, decision: string, observedFieldsDigest: string, verified: boolean): Ap06LayerEvidenceV2[] {
  const layers: ReadonlyArray<Readonly<{
    ordinal: number; layerId: LayerIdV2; capabilityId: string; modulePath: string;
    evidenceClass: EvidenceClassV2; executed: boolean; evidenceClassBasis: string; observed: string;
  }>> = [
    {
      ordinal: 1, layerId: "SOURCE", capabilityId: INCOMING_INVOICE_INTAKE_REQUEST_V1,
      modulePath: "packages/contracts/src/incoming-invoice-intake.ts", evidenceClass: "EXECUTED", executed: true,
      evidenceClassBasis: "the released AP-02 intake implementation was executed on the actual frozen synthetic supplier invoice bytes",
      observed: "ACCEPTED; duplicate and tampered copies denied",
    },
    {
      ordinal: 2, layerId: "DOCUMENT", capabilityId: "chimpmaera.incoming-invoice/intake-record/v1",
      modulePath: "packages/contracts/src/incoming-invoice-intake.ts", evidenceClass: "EXECUTED", executed: true,
      evidenceClassBasis: "the released AP-02 integrity readback was executed against the persisted document version and re-checked content, metadata, identity and record digests",
      observed: "FOUND (version-bound)",
    },
    {
      ordinal: 3, layerId: "EXTRACTION", capabilityId: AP02_BOUNDED_EXTRACTION_REPORT_V1,
      modulePath: "packages/contracts/src/incoming-invoice-extraction-dataflow-v2.ts", evidenceClass: "EXECUTED", executed: true,
      evidenceClassBasis: "the bounded deterministic synthetic extraction executed on the ingested document version (no OCR, no model inference); the frozen AP-03 benchmark/holdout stays excluded from the proof inputs",
      observed: observedFieldsDigest,
    },
    {
      ordinal: 4, layerId: "VALIDATION", capabilityId: "chimpmaera.incoming-invoice/extraction-dataflow/v2",
      modulePath: "packages/contracts/src/incoming-invoice-extraction-dataflow-v2.ts", evidenceClass: "SCHEMA_VALIDATED", executed: false,
      evidenceClassBasis: "the composed extraction/dataflow record was validated against its versioned JSON schema and the frozen AP-04 pack identity; no separate validation engine was executed in this slice",
      observed: verified ? "SCHEMA_VALIDATED" : "NOT_VALIDATED",
    },
    {
      ordinal: 5, layerId: "MATCHING", capabilityId: "chimpmaera.incoming-invoice/erv-core/v1",
      modulePath: "packages/contracts/src/incoming-invoice-erv.ts", evidenceClass: "EXECUTED", executed: true,
      evidenceClassBasis: "the released AP-04 ERV core executed over the case composed from the observed extracted fields under the frozen variant registry",
      observed: decision,
    },
    {
      ordinal: 6, layerId: "EXCEPTION_ADVISOR", capabilityId: "chimpmaera.incoming-invoice/erv-core/v1",
      modulePath: "packages/contracts/src/incoming-invoice-erv.ts", evidenceClass: "EXECUTED", executed: true,
      evidenceClassBasis: "the released AP-04 typed exceptions and evidence-citing advisors executed for the missing-context and unverified-evidence controls",
      observed: "MISSING_CONTEXT; UNVERIFIED_REFERENCE_EVIDENCE",
    },
    {
      ordinal: 7, layerId: "ADAPTIVE_UI", capabilityId: "chimpmaera.incoming-invoice/adaptive-ui/v1",
      modulePath: "packages/contracts/src/incoming-invoice-adaptive-ui.ts", evidenceClass: "SOURCE_BOUND", executed: false,
      evidenceClassBasis: "the released adaptive-UI source is bound by byte-identical digest only; its producer was NOT executed in this bounded slice",
      observed: "NOT_EXECUTED_IN_THIS_SLICE",
    },
    {
      ordinal: 8, layerId: "RECEIPT_EVIDENCE_VERDICT", capabilityId: "chimpmaera.incoming-invoice/ap05-receipt-manifest/v1",
      modulePath: "packages/contracts/src/incoming-invoice-ap05-receipt-manifest.ts", evidenceClass: "SCHEMA_VALIDATED", executed: false,
      evidenceClassBasis: "the released AP-05 receipt-manifest source is bound by byte-identical digest and this v2 probe record is validated against its versioned schema; no receipt-manifest producer ran in this slice",
      observed: "SCHEMA_VALIDATED",
    },
  ];
  return layers.map((layer) => ({
    ordinal: layer.ordinal,
    layerId: layer.layerId,
    capabilityId: layer.capabilityId,
    modulePath: layer.modulePath,
    moduleIdentity: identity(byPath.get(layer.modulePath)!.bytes),
    evidenceClass: layer.evidenceClass,
    executed: layer.executed,
    evidenceClassBasis: layer.evidenceClassBasis,
    observed: layer.observed,
  }));
}

export async function generateIncomingInvoiceAp06ProofProbeV2(
  input: Ap06ProofProbeInputV2,
): Promise<Readonly<{ probe: Ap06ProofProbeV2; serialized: string }>> {
  const byPath = bindPredecessors(input.predecessorSources);
  const composition = await runIncomingInvoiceExtractionDataflowV2(input.dataflowInput);
  if (composition.outcome !== "COMPOSED") throw new ProbeV2Error(`DATAFLOW_${composition.reasonCode}`);
  const dataflow = composition.dataflow;
  const verified = await verifyIncomingInvoiceExtractionDataflowV2(dataflow, input.dataflowInput);
  if (!verified.valid) throw new ProbeV2Error("DATAFLOW_NOT_VERIFIABLE");
  const pack = JSON.parse(Buffer.from(input.dataflowInput.ervCasePackBytes).toString("utf8")) as ErvCasePackV1;
  const supplierBytes = byPath.get("tests/fixtures/incoming-invoice/supplier-invoice-v1.txt")!.bytes;
  const caseMatrix = await buildCaseMatrix(input.dataflowInput, dataflow, pack, supplierBytes);
  const chain = buildChain(byPath, dataflow.decision.outcome, dataflow.extraction.observedFieldsDigest, verified.valid);
  const extractionLayer = chain.find((layer) => layer.layerId === "EXTRACTION")!;
  if (extractionLayer.evidenceClass !== "EXECUTED" || extractionLayer.executed !== true) throw new ProbeV2Error("EXTRACTION_NOT_EXECUTED");
  for (const layer of chain) {
    if (layer.evidenceClass !== "EXECUTED" && layer.executed) throw new ProbeV2Error("UNEXECUTED_LAYER_CLAIMS_EXECUTION");
    if (layer.evidenceClass === "EXECUTED" && !layer.executed) throw new ProbeV2Error("EXECUTED_LAYER_NOT_MARKED");
  }
  const unsigned = {
    schemaVersion: AP06_PROOF_PROBE_SCHEMA_V2,
    proofProbeVersion: "2.0.0" as const,
    taskId: "PS488-AP-DATAFLOW-01" as const,
    issue: "JoFe2/PANSPHAIRA#488" as const,
    evidenceClasses: [...DATAFLOW_EVIDENCE_CLASSES_V2],
    historicalScoping: {
      probeV1Path: AP06_HISTORICAL_PROBE_V1_PATH,
      probeV1Identity: identity(input.historicalProbeV1Bytes),
      scope: AP06_HISTORICAL_SCOPE_V1,
      note: "The v1 probe artifact is retained byte-for-byte and explicitly scoped to its historical release line; it is superseded, not overwritten. Its generic exercised flag is not reused here.",
    },
    predecessorBinding: FROZEN_V1_OBLIGATIONS.map((obligation) => ({ ...obligation })),
    chain,
    frozenInputsExcluded: [
      {
        releaseId: "extraction-benchmark-source-v1",
        path: "packages/contracts/src/incoming-invoice-extraction-benchmark.ts",
        role: "FROZEN_SYNTHETIC_EXTRACTION_SCORING_HARNESS",
        excludedFromProofInputs: true as const,
        note: "The AP-03 scoring harness and its holdout are source-bound only and are excluded from the proof inputs; they are not execution evidence for this dataflow and no OCR/model-quality claim is made (#378 remains separate).",
      },
      {
        releaseId: "ap03-holdout-source-v1",
        path: "tests/fixtures/incoming-invoice/ap-03-holdout-v1.json",
        role: "FROZEN_LOCAL_SYNTHETIC_HOLDOUT",
        excludedFromProofInputs: true as const,
        note: "The frozen holdout is not an input of this dataflow and is never presented as extraction output.",
      },
    ],
    dataflow: {
      schemaVersion: dataflow.schemaVersion,
      documentVersionId: dataflow.document.versionId,
      documentContentSha256: dataflow.document.contentSha256,
      recordDigest: dataflow.document.recordDigest,
      extractionInputSha256: dataflow.extraction.extractionInputSha256,
      extractorId: dataflow.extraction.extractorId,
      observedFieldsDigest: dataflow.extraction.observedFieldsDigest,
      observedGrossAmountMinor: dataflow.extraction.fields.grossAmountMinor.state === "KNOWN" ? dataflow.extraction.fields.grossAmountMinor.value : -1,
      purchaseOrderNumberState: dataflow.extraction.fields.purchaseOrderNumber.state,
      receiptReferenceState: dataflow.extraction.fields.receiptReference.state,
      ervCaseId: dataflow.ervCase.caseId,
      ervDecision: dataflow.decision.outcome,
      dataflowDigest: dataflow.dataflowDigest,
      verified: true,
    },
    caseMatrix,
    verdict: {
      value: "NARROW_GO" as const,
      reasons: [
        "AP-DATAFLOW-AC01: each of the eight chain layers carries an explicit evidence class (SOURCE_BOUND / SCHEMA_VALIDATED / EXECUTED) with its basis and observed result; the ADAPTIVE_UI layer is SOURCE_BOUND and NOT executed in this slice, so no generic exercised flag is emitted for it.",
        "AP-DATAFLOW-AC02: the composed path runs from the actual frozen synthetic supplier-invoice bytes through the released AP-02 intake and integrity readback, through the bounded deterministic synthetic extraction, through validation and into the released AP-04 ERV decision core; the ERV case consumes the observed extracted fields and the frozen AP-04 pack is used only as the versioned variant registry.",
        "AP-DATAFLOW-AC03: the valid document yields independently predicted extraction fields and a business result; a material change of one observed extracted value changes the downstream decision (MATCHED -> CONFLICT, or MATCHED under the declared absolute tolerance), and a self-consistently re-digested substitution is rejected because execution and output are bound to the same document version.",
        "AP-DATAFLOW-AC04: direct duplicate, tamper, missing-information, unsupported-field, contradictory-substitution and replay controls are recorded against the affected handoffs; the expected values are hand-authored independently of the extractor and the extraction is declared deterministic synthetic with no OCR/model claim.",
        "AP-DATAFLOW-AC05: local implementation, focused tests, registration and derived integrity are delivered; independent focused acceptance, current-Main integration, exact-head CI, release and public readback remain delivery-owner work.",
      ],
    },
    acceptanceCriteria: [...DATAFLOW_ACCEPTANCE_CRITERIA_V2],
    nonclaims: [...AP06_NONCLAIMS_V2],
  };
  const probeIdentity = canonicalIdentity(unsigned);
  const probe: Ap06ProofProbeV2 = { ...unsigned, proofProbeDigest: probeIdentity.sha256 };
  return { probe, serialized: `${canonicalJson(probe)}\n` };
}

function errorCode(error: unknown): string {
  return error instanceof ProbeV2Error ? error.code : "PROBE_INPUT_DENIED";
}

export async function verifyIncomingInvoiceAp06ProofProbeV2(
  candidate: unknown,
  input: Ap06ProofProbeInputV2,
): Promise<Ap06ProofProbeVerificationV2> {
  if (candidate === null || typeof candidate !== "object") return { valid: false, reasonCodes: ["PROBE_SHAPE_DENIED"] };
  try {
    const expected = await generateIncomingInvoiceAp06ProofProbeV2(input);
    if (canonicalJson(candidate) !== canonicalJson(expected.probe)) return { valid: false, reasonCodes: ["PROBE_IDENTITY_MISMATCH"] };
    return { valid: true, reasonCodes: [] };
  } catch (error) {
    return { valid: false, reasonCodes: [errorCode(error)] };
  }
}
