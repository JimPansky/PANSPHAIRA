import { readPan516Procurement } from "../procurement-434/bestellung-lifecycle.mjs";
import { evaluatePan516ProcurementLiabilitySnapshot } from "../procurement-434/bestellung-liability.mjs";
import { validateBrowserErvReadV1 } from "../../dist/packages/contracts/src/browser-erv-read-v1.js";

const owned = new WeakMap();
const invoiceIds = new Set(["AP-PAN516-MATCHED-01", "AP-PAN516-PARTIAL-01"]);
function exact(value, keys, reason) {
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(reason);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== keys.length || Reflect.ownKeys(descriptors).some(k => typeof k !== "string" || !keys.includes(k))
    || Object.values(descriptors).some(d => !d.enumerable || !("value" in d))) throw new Error(reason);
}

// Owner-local composition on the existing P02 leading SQLite target. No new
// store, browser writer, rematcher, booking/payment grant or external provider.
export function createNativeErvReadAdapterV1(options) {
  exact(options, ["tenantId", "root"], "ERV_NATIVE_OWNER_BINDING_DENIED");
  if (typeof options.tenantId !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(options.tenantId) || typeof options.root !== "string") throw new Error("ERV_NATIVE_OWNER_BINDING_DENIED");
  const { tenantId, root } = options;
  const initial = readPan516Procurement({ root });
  const initialBinding = JSON.stringify(initial.binding);
  const reader = Object.freeze({
    read(request) {
      exact(request, ["tenantId", "objectId", "expectedRevision"], "ERV_READ_REQUEST_DENIED");
      if (request.tenantId !== tenantId) throw new Error("ERV_TENANT_BINDING_DENIED");
      if (!invoiceIds.has(request.objectId)) throw new Error("ERV_OBJECT_BINDING_DENIED");
      if (request.expectedRevision !== null && (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 1)) throw new Error("ERV_OBJECT_REVISION_STALE");
      const state = readPan516Procurement({ root });
      if (JSON.stringify(state.binding) !== initialBinding) throw new Error("ERV_NATIVE_LEADING_BINDING_DRIFT_DENIED");
      if (request.expectedRevision !== null && request.expectedRevision !== state.revision) throw new Error("ERV_OBJECT_REVISION_STALE");
      const confirmation = state.confirmations.at(-1);
      if (!confirmation) throw new Error("ERV_NATIVE_CONFIRMED_TERMS_REQUIRED");
      const liability = evaluatePan516ProcurementLiabilitySnapshot({ state, invoiceId: request.objectId, expectedConfirmationRevision: confirmation.revision });
      return validateBrowserErvReadV1({ schemaVersion: "pansphaira.browser-erv-read/v1", tenantId, invoiceId: request.objectId,
        revision: state.revision, currency: confirmation.terms.currency, leadingStore: state.leadingStore,
        orderedQuantity: liability.orderedQuantity, acceptedQuantity: liability.acceptedQuantity, invoicedQuantity: liability.invoicedQuantity,
        invoiceAmountMinor: liability.source.invoiceAmountMinor, expectedAmountMinor: liability.expectedAmountMinor, varianceMinor: liability.varianceMinor,
        status: liability.status, decisionOutcome: liability.decision.outcome, basisDigest: liability.basisDigest,
        confirmationDigest: liability.source.confirmationDigest, invoiceSourceSha256: liability.source.invoiceSource.sha256,
        readOnly: true, bookingAuthorityGranted: false, paymentOrderAuthorized: false });
    },
  });
  owned.set(reader, tenantId); return reader;
}
export const isNativeErvReadAdapterV1 = (reader, tenantId) => typeof tenantId === "string" && owned.has(reader) && owned.get(reader) === tenantId;
