// Read projection only: these discriminants never authorize a booking/payment.
export const BROWSER_ERV_READ_SCHEMA_V1 = "pansphaira.browser-erv-read/v1" as const;
export type BrowserErvInvoiceIdV1 = "AP-PAN516-MATCHED-01" | "AP-PAN516-PARTIAL-01";
export interface BrowserErvReadV1 {
  readonly schemaVersion: typeof BROWSER_ERV_READ_SCHEMA_V1;
  readonly tenantId: string;
  readonly invoiceId: BrowserErvInvoiceIdV1;
  readonly revision: number;
  readonly currency: "EUR";
  readonly leadingStore: "PAN472_TARGET_SQLITE";
  readonly orderedQuantity: number;
  readonly acceptedQuantity: number;
  readonly invoicedQuantity: number;
  readonly invoiceAmountMinor: number;
  readonly expectedAmountMinor: number;
  readonly varianceMinor: number;
  readonly status: "RELEASED_LOCAL_SYNTHETIC" | "UNRESOLVED_AMOUNT_DEVIATION" | "UNRESOLVED_PARTIAL_INVOICE" | "UNRESOLVED_CONFIRMATION_CHANGE_NOT_APPROVED";
  readonly decisionOutcome: "MATCHED" | "CONFLICT" | "EXCEPTION" | "DENIED";
  readonly basisDigest: string;
  readonly confirmationDigest: string;
  readonly invoiceSourceSha256: string;
  readonly readOnly: true;
  readonly bookingAuthorityGranted: false;
  readonly paymentOrderAuthorized: false;
}
export function validateBrowserErvReadV1(value: unknown): BrowserErvReadV1 {
  const denied = () => { throw new Error("BROWSER_ERV_READ_SHAPE_DENIED"); };
  if (value === null || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return denied();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = ["schemaVersion", "tenantId", "invoiceId", "revision", "currency", "leadingStore", "orderedQuantity", "acceptedQuantity", "invoicedQuantity", "invoiceAmountMinor", "expectedAmountMinor", "varianceMinor", "status", "decisionOutcome", "basisDigest", "confirmationDigest", "invoiceSourceSha256", "readOnly", "bookingAuthorityGranted", "paymentOrderAuthorized"];
  if (Reflect.ownKeys(descriptors).length !== keys.length || Reflect.ownKeys(descriptors).some(k => typeof k !== "string" || !keys.includes(k))
    || Object.values(descriptors).some(d => !d.enumerable || !("value" in d))) return denied();
  const v = value as Record<string, unknown>;
  if (v.schemaVersion !== BROWSER_ERV_READ_SCHEMA_V1 || typeof v.tenantId !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(v.tenantId)
    || !["AP-PAN516-MATCHED-01", "AP-PAN516-PARTIAL-01"].includes(v.invoiceId as string)
    || v.currency !== "EUR" || v.leadingStore !== "PAN472_TARGET_SQLITE" || v.readOnly !== true || v.bookingAuthorityGranted !== false || v.paymentOrderAuthorized !== false
    || !["RELEASED_LOCAL_SYNTHETIC", "UNRESOLVED_AMOUNT_DEVIATION", "UNRESOLVED_PARTIAL_INVOICE", "UNRESOLVED_CONFIRMATION_CHANGE_NOT_APPROVED"].includes(v.status as string)
    || !["MATCHED", "CONFLICT", "EXCEPTION", "DENIED"].includes(v.decisionOutcome as string)
    || ["revision", "orderedQuantity", "acceptedQuantity", "invoicedQuantity", "invoiceAmountMinor", "expectedAmountMinor"].some(k => !Number.isSafeInteger(v[k]) || (v[k] as number) < 0)
    || !Number.isSafeInteger(v.varianceMinor) || (v.revision as number) < 1
    || [v.basisDigest, v.confirmationDigest, v.invoiceSourceSha256].some(x => typeof x !== "string" || !/^[a-f0-9]{64}$/.test(x))) return denied();
  return Object.freeze({ ...(v as unknown as BrowserErvReadV1) });
}
