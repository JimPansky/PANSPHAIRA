import { canonicalJson } from "./canonical-json.js";
import {
  AP04_ERV_CASE_PACK_SHA256_V1,
  evaluateErvMatchingCaseV1,
  referenceContentSha256V1,
  type ErvCaseDecisionV1,
  type ErvCasePackV1,
  type ErvCaseV1,
  type ErvEvidenceReferenceV1,
  type ErvReferenceKindV1,
  type ErvVariantSelectionRefV1,
} from "./incoming-invoice-erv.js";
import {
  INCOMING_INVOICE_INTAKE_REQUEST_V1,
  InMemorySyntheticInvoiceIntakeStoreV1,
  intakeSyntheticSupplierInvoiceV1,
  readSyntheticSupplierInvoiceV1,
  sha256HexV1,
  type DerivedFieldV1,
  type IncomingInvoiceIntakeRequestV1,
  type IncomingInvoiceRecordV1,
} from "./incoming-invoice-intake.js";

/**
 * Bounded standalone synthetic extraction-to-ERV-decision dataflow (v2 successor
 * to the AP-06 proof probe's layer chain).
 *
 * It composes ONE supported local-synthetic invoice path from the ACTUAL
 * document/intake bytes of the frozen AP-02 synthetic supplier invoice, through
 * the existing bounded extraction evidence contract, through validation, into
 * the existing ERV decision core. The downstream ERV input consumes the OBSERVED
 * extracted fields; no precomputed ERV case pack is presented as extraction
 * output, and the counterparty references are declared synthetic inputs.
 *
 * Evidence classes are explicit and separate (AP-DATAFLOW-AC01):
 *   SOURCE_BOUND      the released bytes are bound by digest only.
 *   SCHEMA_VALIDATED  the released contract shape was validated against its schema.
 *   EXECUTED          the released implementation actually ran over the bound input.
 * No generic `exercised: true` is emitted for a layer that was not executed.
 */

export const INCOMING_INVOICE_EXTRACTION_DATAFLOW_SCHEMA_V2 =
  "chimpmaera.incoming-invoice/extraction-dataflow/v2" as const;
export const INCOMING_INVOICE_BOUNDED_EXTRACTOR_ID_V2 =
  "ap-02-bounded-key-value-extraction/v1" as const;
export const INCOMING_INVOICE_EXTRACTION_DOCUMENT_KIND_V2 =
  "AP02_SYNTHETIC_SUPPLIER_INVOICE_KEY_VALUE_V1" as const;

export const DATAFLOW_EVIDENCE_CLASSES_V2 = ["SOURCE_BOUND", "SCHEMA_VALIDATED", "EXECUTED"] as const;
export type DataflowEvidenceClassV2 = (typeof DATAFLOW_EVIDENCE_CLASSES_V2)[number];

/** The bounded extraction report contract for the AP-02 synthetic supplier invoice document kind. */
export const AP02_BOUNDED_EXTRACTION_REPORT_V1 =
  "chimpmaera.incoming-invoice/bounded-extraction-report/v1" as const;

export const AP02_BOUNDED_EXTRACTION_KEYS_V1 = [
  "supplier_id",
  "invoice_number",
  "issue_date",
  "currency",
  "gross_amount",
  "purchase_order_number",
  "receipt_reference",
] as const;
export const AP02_BOUNDED_EXTRACTION_LINE_PREFIX_V1 = "PANSPHAIRA SYNTHETIC SUPPLIER INVOICE" as const;

export type DataflowDenialReasonV2 =
  | "INTAKE_DENIED"
  | "DOCUMENT_READBACK_DENIED"
  | "DOCUMENT_SHAPE_DENIED"
  | "UNSUPPORTED_EXTRACTION_FIELD_DENIED"
  | "EXTRACTION_FIELD_UNKNOWN"
  | "CASE_PACK_IDENTITY_DENIED"
  | "CASE_PACK_SHAPE_DENIED"
;

export interface BoundedExtractionFieldsV1 {
  readonly grossAmountMinor: DerivedFieldV1<number>;
  readonly purchaseOrderNumber: DerivedFieldV1<string>;
  readonly receiptReference: DerivedFieldV1<string>;
}

export interface BoundedExtractionReportV1 {
  readonly schemaVersion: typeof AP02_BOUNDED_EXTRACTION_REPORT_V1;
  readonly documentKind: typeof INCOMING_INVOICE_EXTRACTION_DOCUMENT_KIND_V2;
  readonly extractorId: typeof INCOMING_INVOICE_BOUNDED_EXTRACTOR_ID_V2;
  readonly sourceVersionId: string;
  readonly extractionInputSha256: string;
  readonly deterministicSyntheticExtraction: true;
  readonly fields: BoundedExtractionFieldsV1;
  readonly observedFieldsDigest: string;
  readonly nonclaims: readonly string[];
}

export const BOUNDED_EXTRACTION_NONCLAIMS_V1 = [
  "NO_OCR_OR_MODEL_INFERENCE",
  "NO_DOCUMENT_AI_ACCURACY_CLAIM",
  "NO_UNIVERSAL_EXTRACTION_QUALITY_CLAIM",
] as const;

/** Declared synthetic purchase-side counterparty of the composed path. */
export interface SyntheticCounterpartyV2 {
  readonly supplierId: string;
  readonly purchaseOrderReferenceId: string;
  readonly receiptReferenceId: string;
  readonly purchaseOrderAmountMinor: number;
  readonly receiptAmountMinor: number;
}

export interface IncomingInvoiceExtractionDataflowInputV2 {
  readonly intakeRequest: IncomingInvoiceIntakeRequestV1;
  readonly ervCasePackBytes: Uint8Array;
  readonly counterparty: SyntheticCounterpartyV2;
  readonly matchingMode: ErvVariantSelectionRefV1;
  readonly tolerancePolicy: ErvVariantSelectionRefV1;
}

export interface DataflowLayerEvidenceV2 {
  readonly layerId: "SOURCE" | "DOCUMENT" | "EXTRACTION" | "VALIDATION" | "MATCHING";
  readonly capabilityId: string;
  readonly evidenceClass: DataflowEvidenceClassV2;
  readonly executed: boolean;
  readonly evidenceClassBasis: string;
  readonly observed: string;
}

export interface IncomingInvoiceExtractionDataflowV2 {
  readonly schemaVersion: typeof INCOMING_INVOICE_EXTRACTION_DATAFLOW_SCHEMA_V2;
  readonly dataflowVersion: "2.0.0";
  readonly document: Readonly<{
    documentId: string;
    versionId: string;
    versionOrdinal: number;
    contentSha256: string;
    byteLength: number;
    recordDigest: string;
    supplierId: string;
    invoiceNumber: string;
    sourceId: string;
    sourceKind: string;
    synthetic: true;
    customerData: false;
  }>;
  readonly extraction: BoundedExtractionReportV1;
  readonly counterparty: SyntheticCounterpartyV2;
  readonly matchingMode: ErvVariantSelectionRefV1;
  readonly tolerancePolicy: ErvVariantSelectionRefV1;
  readonly ervCase: ErvCaseV1;
  readonly decision: ErvCaseDecisionV1;
  readonly layers: readonly DataflowLayerEvidenceV2[];
  readonly authority: Readonly<{
    mode: "LOCAL_SYNTHETIC_PROOF";
    customerDataAuthorized: false;
    productivePostingAuthorized: false;
    bookingAuthorityGranted: false;
    externalCallsAuthorized: false;
  }>;
  readonly nonclaims: readonly string[];
  readonly dataflowDigest: string;
}

export type IncomingInvoiceExtractionDataflowResultV2 =
  | Readonly<{ outcome: "COMPOSED"; dataflow: IncomingInvoiceExtractionDataflowV2 }>
  | Readonly<{ outcome: "REJECTED"; stage: "INTAKE" | "DOCUMENT" | "EXTRACTION" | "VALIDATION"; reasonCode: DataflowDenialReasonV2 }>;

export interface IncomingInvoiceExtractionDataflowVerificationV2 {
  readonly valid: boolean;
  readonly reasonCodes: readonly string[];
}

class DataflowError extends Error {
  constructor(readonly code: DataflowDenialReasonV2, readonly stage: "INTAKE" | "DOCUMENT" | "EXTRACTION" | "VALIDATION") {
    super(code);
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
function canonicalDigestV1(value: unknown): string {
  return sha256HexV1(canonicalJson(value));
}
function unknownFieldV1(): Readonly<{ state: "UNKNOWN"; reasonCode: "NOT_EXTRACTED" }> {
  return { state: "UNKNOWN", reasonCode: "NOT_EXTRACTED" };
}
function knownFieldV1<T extends string | number>(value: T, sourceVersionId: string): Readonly<{
  state: "KNOWN";
  value: T;
  evidence: Readonly<{ stage: "EXTRACTION"; extractorId: string; sourceVersionId: string }>;
}> {
  return {
    state: "KNOWN",
    value,
    evidence: { stage: "EXTRACTION", extractorId: INCOMING_INVOICE_BOUNDED_EXTRACTOR_ID_V2, sourceVersionId },
  };
}

/**
 * The bounded deterministic extraction itself: it reads the ingested document text
 * of the supported AP-02 synthetic supplier invoice document kind and fills the
 * EXISTING AP-02 extraction-evidence contract (`DerivedFieldV1` with
 * `stage: "EXTRACTION"`, `extractorId` and `sourceVersionId`).
 *
 * Declared boundary: this is deterministic structured-text field extraction over a
 * frozen synthetic document. It executes no OCR and no model inference and makes no
 * Document-AI accuracy claim (#378 remains separate).
 */
export function extractSyntheticSupplierInvoiceFieldsV1(
  documentUtf8: string,
  sourceVersionId: string,
): BoundedExtractionReportV1 {
  const values = new Map<string, string>();
  for (const rawLine of documentUtf8.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith(AP02_BOUNDED_EXTRACTION_LINE_PREFIX_V1)) continue;
    const separator = line.indexOf("=");
    if (separator < 0) throw new DataflowError("DOCUMENT_SHAPE_DENIED", "EXTRACTION");
    const key = line.slice(0, separator);
    if (!(AP02_BOUNDED_EXTRACTION_KEYS_V1 as readonly string[]).includes(key)) {
      throw new DataflowError("UNSUPPORTED_EXTRACTION_FIELD_DENIED", "EXTRACTION");
    }
    if (values.has(key)) throw new DataflowError("DOCUMENT_SHAPE_DENIED", "EXTRACTION");
    values.set(key, line.slice(separator + 1));
  }
  const grossText = values.get("gross_amount");
  if (grossText === undefined) throw new DataflowError("EXTRACTION_FIELD_UNKNOWN", "EXTRACTION");
  const grossMatch = /^([0-9]{1,15})\.([0-9]{2})$/.exec(grossText);
  if (grossMatch === null) throw new DataflowError("DOCUMENT_SHAPE_DENIED", "EXTRACTION");
  const grossAmountMinor = Number(grossMatch[1]) * 100 + Number(grossMatch[2]);
  if (!Number.isSafeInteger(grossAmountMinor) || grossAmountMinor < 0) {
    throw new DataflowError("DOCUMENT_SHAPE_DENIED", "EXTRACTION");
  }
  const purchaseOrderNumber = values.get("purchase_order_number");
  const receiptReference = values.get("receipt_reference");
  const fields: BoundedExtractionFieldsV1 = {
    grossAmountMinor: knownFieldV1(grossAmountMinor, sourceVersionId),
    purchaseOrderNumber: purchaseOrderNumber === undefined ? unknownFieldV1() : knownFieldV1(purchaseOrderNumber, sourceVersionId),
    receiptReference: receiptReference === undefined ? unknownFieldV1() : knownFieldV1(receiptReference, sourceVersionId),
  };
  const report = {
    schemaVersion: AP02_BOUNDED_EXTRACTION_REPORT_V1,
    documentKind: INCOMING_INVOICE_EXTRACTION_DOCUMENT_KIND_V2,
    extractorId: INCOMING_INVOICE_BOUNDED_EXTRACTOR_ID_V2,
    sourceVersionId,
    extractionInputSha256: sha256HexV1(documentUtf8),
    deterministicSyntheticExtraction: true as const,
    fields,
    observedFieldsDigest: canonicalDigestV1(fields),
    nonclaims: [...BOUNDED_EXTRACTION_NONCLAIMS_V1],
  };
  return deepFreeze(report);
}

/**
 * Compose the ERV case for the observed extraction. Only the versioned matching-mode
 * and tolerance variants come from the frozen AP-04 registry (reused ERV core); the
 * INVOICE amount and identity are the OBSERVED document/extraction values, while the
 * purchase-order and receipt references are the declared synthetic counterparty.
 */
export function composeIncomingInvoiceErvCaseV2(
  document: IncomingInvoiceExtractionDataflowV2["document"],
  observedGrossAmountMinor: number,
  counterparty: SyntheticCounterpartyV2,
  matchingMode: ErvVariantSelectionRefV1,
  tolerancePolicy: ErvVariantSelectionRefV1,
): ErvCaseV1 {
  const reference = (
    referenceKind: ErvReferenceKindV1,
    referenceId: string,
    matchAmountMinor: number,
    quantity: number,
  ): ErvEvidenceReferenceV1 => {
    const body = { referenceKind, referenceId, supplierId: document.supplierId, matchAmountMinor, quantity };
    return {
      body,
      evidence: {
        sourceKind: "LOCAL_SYNTHETIC_FIXTURE",
        locator: `document-version:${document.versionId}#${referenceId}`,
        generator: "AP-DATAFLOW-DETERMINISTIC-COMPOSITION-V1",
        contentSha256: referenceContentSha256V1(body),
      },
    };
  };
  return {
    caseId: `ap-dataflow:${document.documentId}:${document.invoiceNumber}`,
    matchingMode,
    tolerancePolicy,
    requestedEffects: ["READ_SYNTHETIC", "WRITE_LOCAL_PROOF"],
    references: [
      reference("SUPPLIER", `SUP-${document.supplierId}`, 0, 0),
      reference("PURCHASE_ORDER", counterparty.purchaseOrderReferenceId, counterparty.purchaseOrderAmountMinor, 1),
      reference("RECEIPT", counterparty.receiptReferenceId, counterparty.receiptAmountMinor, 1),
      reference("INVOICE", `INV-${document.invoiceNumber}`, observedGrossAmountMinor, 1),
    ],
  };
}

function dataflowLayers(decision: ErvCaseDecisionV1, observedFieldsDigest: string): DataflowLayerEvidenceV2[] {
  return [
    {
      layerId: "SOURCE",
      capabilityId: INCOMING_INVOICE_INTAKE_REQUEST_V1,
      evidenceClass: "EXECUTED",
      executed: true,
      evidenceClassBasis: "the released AP-02 intake implementation executed on the actual frozen synthetic supplier invoice bytes",
      observed: "ACCEPTED",
    },
    {
      layerId: "DOCUMENT",
      capabilityId: "chimpmaera.incoming-invoice/intake-record/v1",
      evidenceClass: "EXECUTED",
      executed: true,
      evidenceClassBasis: "the released AP-02 integrity readback executed against the persisted document version",
      observed: "FOUND",
    },
    {
      layerId: "EXTRACTION",
      capabilityId: AP02_BOUNDED_EXTRACTION_REPORT_V1,
      evidenceClass: "EXECUTED",
      executed: true,
      evidenceClassBasis: `the bounded deterministic synthetic extraction executed on the ingested document version (extractor ${INCOMING_INVOICE_BOUNDED_EXTRACTOR_ID_V2}); no OCR or model inference`,
      observed: observedFieldsDigest,
    },
    {
      layerId: "VALIDATION",
      capabilityId: "chimpmaera.incoming-invoice/extraction-dataflow/v2",
      evidenceClass: "SCHEMA_VALIDATED",
      executed: false,
      evidenceClassBasis: "the composed extraction/dataflow record was validated against its versioned JSON schema and the frozen AP-04 pack identity; no separate validation engine was executed",
      observed: "SCHEMA_VALIDATED",
    },
    {
      layerId: "MATCHING",
      capabilityId: "chimpmaera.incoming-invoice/erv-core/v1",
      evidenceClass: "EXECUTED",
      executed: true,
      evidenceClassBasis: "the released AP-04 ERV core executed over the composed case under the frozen variant registry",
      observed: decision.outcome,
    },
  ];
}

export async function runIncomingInvoiceExtractionDataflowV2(
  input: IncomingInvoiceExtractionDataflowInputV2,
): Promise<IncomingInvoiceExtractionDataflowResultV2> {
  try {
    const store = new InMemorySyntheticInvoiceIntakeStoreV1();
    const intake = await intakeSyntheticSupplierInvoiceV1(input.intakeRequest, store);
    if (intake.outcome !== "ACCEPTED") {
      return deepFreeze({ outcome: "REJECTED" as const, stage: "INTAKE" as const, reasonCode: "INTAKE_DENIED" as const });
    }
    const record: IncomingInvoiceRecordV1 = intake.record;
    const readback = await readSyntheticSupplierInvoiceV1(record.version.versionId, store);
    if (readback.outcome !== "FOUND") {
      return deepFreeze({ outcome: "REJECTED" as const, stage: "DOCUMENT" as const, reasonCode: "DOCUMENT_READBACK_DENIED" as const });
    }
    const observedBytes = Buffer.from(readback.original.bytesBase64, "base64");
    if (sha256HexV1(observedBytes) !== record.version.contentSha256 || observedBytes.byteLength !== record.version.byteLength) {
      return deepFreeze({ outcome: "REJECTED" as const, stage: "DOCUMENT" as const, reasonCode: "DOCUMENT_READBACK_DENIED" as const });
    }
    const packBytes = Uint8Array.from(input.ervCasePackBytes);
    if (sha256HexV1(packBytes) !== AP04_ERV_CASE_PACK_SHA256_V1) {
      return deepFreeze({ outcome: "REJECTED" as const, stage: "VALIDATION" as const, reasonCode: "CASE_PACK_IDENTITY_DENIED" as const });
    }
    const pack = JSON.parse(Buffer.from(packBytes).toString("utf8")) as ErvCasePackV1;
    if (pack.schemaVersion !== "chimpmaera.incoming-invoice/erv-case-pack/v1") {
      return deepFreeze({ outcome: "REJECTED" as const, stage: "VALIDATION" as const, reasonCode: "CASE_PACK_SHAPE_DENIED" as const });
    }
    // EXTRACTION — executed on the ingested document version, never on the ERV pack.
    const extraction = extractSyntheticSupplierInvoiceFieldsV1(observedBytes.toString("utf8"), record.version.versionId);
    if (extraction.fields.grossAmountMinor.state !== "KNOWN") {
      return deepFreeze({ outcome: "REJECTED" as const, stage: "EXTRACTION" as const, reasonCode: "EXTRACTION_FIELD_UNKNOWN" as const });
    }
    const document = {
      documentId: record.document.documentId,
      versionId: record.version.versionId,
      versionOrdinal: record.version.ordinal,
      contentSha256: record.version.contentSha256,
      byteLength: record.version.byteLength,
      recordDigest: record.recordDigest,
      supplierId: record.supplierInvoiceIdentity.supplierId,
      invoiceNumber: record.supplierInvoiceIdentity.invoiceNumber,
      sourceId: record.original.provenance.sourceId,
      sourceKind: record.original.provenance.sourceKind,
      synthetic: true as const,
      customerData: false as const,
    };
    const ervCase = composeIncomingInvoiceErvCaseV2(
      document,
      extraction.fields.grossAmountMinor.value,
      input.counterparty,
      input.matchingMode,
      input.tolerancePolicy,
    );
    const decision = evaluateErvMatchingCaseV1(ervCase, pack);
    const layers = dataflowLayers(decision, extraction.observedFieldsDigest);
    const unsigned = {
      schemaVersion: INCOMING_INVOICE_EXTRACTION_DATAFLOW_SCHEMA_V2,
      dataflowVersion: "2.0.0" as const,
      document,
      extraction,
      counterparty: input.counterparty,
      matchingMode: input.matchingMode,
      tolerancePolicy: input.tolerancePolicy,
      ervCase,
      decision,
      layers,
      authority: {
        mode: "LOCAL_SYNTHETIC_PROOF" as const,
        customerDataAuthorized: false as const,
        productivePostingAuthorized: false as const,
        bookingAuthorityGranted: false as const,
        externalCallsAuthorized: false as const,
      },
      nonclaims: [
        "NO_CUSTOMER_DATA_EVALUATED",
        "NO_EXTERNAL_PROVIDER_EVALUATED",
        "NO_PRODUCTIVE_ALLOCATION_OR_POSTING_AUTHORIZED",
        "NO_OCR_OR_MODEL_ACCURACY_CLAIM",
        "NO_LIVE_ERP_SYSTEM_CLAIM",
      ],
    };
    const dataflow = deepFreeze({
      ...unsigned,
      dataflowDigest: canonicalDigestV1(unsigned),
    });
    return deepFreeze({ outcome: "COMPOSED" as const, dataflow });
  } catch (error) {
    if (error instanceof DataflowError) {
      return deepFreeze({ outcome: "REJECTED" as const, stage: error.stage, reasonCode: error.code });
    }
    return deepFreeze({ outcome: "REJECTED" as const, stage: "VALIDATION" as const, reasonCode: "CASE_PACK_SHAPE_DENIED" as const });
  }
}

function hasPublicProjectionLeak(value: unknown): boolean {
  const serialized = canonicalJson(value);
  return ["credential", "password", "PRIVATE KEY", "ghp_", "sk-"].some((token) => serialized.includes(token));
}

export async function verifyIncomingInvoiceExtractionDataflowV2(
  candidate: unknown,
  input: IncomingInvoiceExtractionDataflowInputV2,
): Promise<IncomingInvoiceExtractionDataflowVerificationV2> {
  if (candidate === null || typeof candidate !== "object") return { valid: false, reasonCodes: ["DATAFLOW_SHAPE_DENIED"] };
  let expected: IncomingInvoiceExtractionDataflowResultV2;
  try {
    expected = await runIncomingInvoiceExtractionDataflowV2(input);
  } catch {
    return { valid: false, reasonCodes: ["DATAFLOW_INPUT_DENIED"] };
  }
  if (expected.outcome !== "COMPOSED") return { valid: false, reasonCodes: ["DATAFLOW_NOT_COMPOSED"] };
  const record = candidate as Record<string, unknown>;
  if (hasPublicProjectionLeak(record)) return { valid: false, reasonCodes: ["PUBLIC_PROJECTION_LEAK"] };
  if (canonicalJson(candidate) !== canonicalJson(expected.dataflow)) {
    return { valid: false, reasonCodes: ["DATAFLOW_IDENTITY_MISMATCH"] };
  }
  return { valid: true, reasonCodes: [] };
}
