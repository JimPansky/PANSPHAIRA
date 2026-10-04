// P02 source/quantity admission around the unchanged ERV amount evaluator.
// The public common source is code-bound; callers cannot self-seal a substitute.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {canonicalJson,digest,fail} from '../pan473/scope-profile.mjs';
import {readPan516Procurement,isPan516ObservedReadSnapshot} from './bestellung-lifecycle.mjs';
import {evaluateErvMatchingCaseV1,referenceContentSha256V1,AP04_ERV_CASE_PACK_SHA256_V1} from '../../dist/packages/contracts/src/incoming-invoice-erv.js';
import {AP04_ERV_CASE_PACK_CANONICAL_SHA256_V1} from '../../dist/packages/contracts/src/rechnungsabgleich-match-v1.js';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const INVOICE_CASES_RAW_SHA='f0a37f30d200b8bf9ce914fbe2ab26b0bd9170eb31311b413a7b54e82715103c';
const COMMON_RAW_SHA='2b76e8537646f727b75b157a3b5529a44b94e2e8ee551b5fcef9f5d3bd3c8160';
const MAPPING=Object.freeze({caseId:'COMMON-TRADE-01',canonicalOrderId:'PO-01',canonicalLineId:'1',nativeOrderId:'bestellung:pan516-common',nativePositionId:'position:common-01',nativeSupplierId:'lieferant:synthetic-01',sourceSupplierId:'SYN-SUP-001',nativeArticleId:'EINK-ART-A01',sourceAuthority:'CODE_OWNED_LOCAL_SYNTHETIC_PARTY_MAPPING_NOT_EXTERNAL_ATTESTATION'});
function sources(invoiceId){
  const raw=readFileSync(new URL('../../contracts/trade/common-trade-01-v1.json',import.meta.url));if(sha(raw)!==COMMON_RAW_SHA)fail('PAN516_COMMON_SOURCE_BYTES_NOT_ADMITTED_DENIED');const common=JSON.parse(raw);
  const packRaw=readFileSync(new URL('../../tests/fixtures/incoming-invoice/ap-04-erv-cases-v1.json',import.meta.url)),pack=JSON.parse(packRaw);
  if(sha(packRaw)!==AP04_ERV_CASE_PACK_SHA256_V1||digest(pack)!==AP04_ERV_CASE_PACK_CANONICAL_SHA256_V1)fail('PAN516_REUSED_ERV_REGISTRY_NOT_FROZEN_DENIED');
  const invoiceRaw=readFileSync(new URL('../../contracts/trade/pan516-invoice-cases-v1.json',import.meta.url));if(sha(invoiceRaw)!==INVOICE_CASES_RAW_SHA)fail('PAN516_SYNTHETIC_INVOICE_SOURCE_BYTES_NOT_ADMITTED_DENIED');const cases=JSON.parse(invoiceRaw);
  const invoice=invoiceId===common.purchase_invoice.id?common.purchase_invoice:cases.invoices.find(v=>v.id===invoiceId);if(!invoice)fail('PAN516_INVOICE_COMPOSITE_SOURCE_GRAIN_DENIED');
  const invoiceSource=invoiceId===common.purchase_invoice.id?{path:'contracts/trade/common-trade-01-v1.json',sha256:COMMON_RAW_SHA,locator:'contracts/trade/common-trade-01-v1.json#purchase_invoice'}:{path:'contracts/trade/pan516-invoice-cases-v1.json',sha256:INVOICE_CASES_RAW_SHA,locator:'contracts/trade/pan516-invoice-cases-v1.json#'+invoice.id};
  return {common,pack,invoice,invoiceSource};
}
export function evaluatePan516ProcurementLiability({root,invoiceId,expectedConfirmationRevision}){
  return evaluatePan516ProcurementLiabilitySnapshot({state:readPan516Procurement({root}),invoiceId,expectedConfirmationRevision});
}
export function evaluatePan516ProcurementLiabilitySnapshot({state,invoiceId,expectedConfirmationRevision}){
  if(!isPan516ObservedReadSnapshot(state))fail('PAN516_ACTUAL_OBSERVED_SNAPSHOT_REQUIRED_DENIED');
  const b=state.binding,{common,pack,invoice,invoiceSource}=sources(invoiceId),last=state.confirmations.at(-1),position=state.effectiveDraft.positionen[0];
  if(invoiceId!==invoice.id||invoice.po_id!==MAPPING.canonicalOrderId||invoice.po_line_id!==MAPPING.canonicalLineId||b.draft.bestellungId!==MAPPING.nativeOrderId||position.positionId!==MAPPING.nativePositionId||position.artikelId!==MAPPING.nativeArticleId)fail('PAN516_INVOICE_COMPOSITE_SOURCE_GRAIN_DENIED');
  if(b.draft.lieferantId!==MAPPING.nativeSupplierId)fail('PAN516_INVOICE_SOURCE_SUPPLIER_DENIED');
  if(!last||!Number.isSafeInteger(expectedConfirmationRevision)||expectedConfirmationRevision!==last.revision)fail('PAN516_CONFIRMED_TERMS_REVISION_REQUIRED_DENIED');
  if(last.terms.currency!==common.scope.currency||last.terms.unit!==common.scope.quantity_unit)fail('PAN516_INVOICE_DIMENSION_MISMATCH_DENIED');
  if(invoice.quantity>position.bestellteMenge||invoice.quantity>state.acceptedQuantity)fail('PAN516_INVOICE_EXCEEDS_ACCEPTED_QUANTITY_DENIED');
  const expectedAmountMinor=last.terms.unitPriceMinor*invoice.quantity,varianceMinor=invoice.net_minor-expectedAmountMinor;
  if(!Number.isSafeInteger(expectedAmountMinor)||!Number.isSafeInteger(varianceMinor)||invoice.net_minor!==invoice.quantity*invoice.unit_net_minor)fail('PAN516_INVOICE_AMOUNT_DIMENSION_DENIED');
  const receiptEvents=state.events.filter(e=>e.kind==='ACCEPT_RECEIPT');
  // One invoice line is evaluated once AFTER receipt aggregation, never an invoice×receipts join.
  const ref=(referenceKind,referenceId,matchAmountMinor,quantity,locator)=>{const body={referenceKind,referenceId,supplierId:MAPPING.sourceSupplierId,matchAmountMinor,quantity};return {body,evidence:{sourceKind:'LOCAL_SYNTHETIC_FIXTURE',locator,generator:'PAN516_CODE_BOUND_NATIVE_SOURCE_COMPOSITION_V1',contentSha256:referenceContentSha256V1(body)}};};
  const references=[ref('SUPPLIER',MAPPING.sourceSupplierId,0,0,'pan516-native:'+digest(b)+'#supplier-binding'),ref('PURCHASE_ORDER',invoice.po_id,expectedAmountMinor,invoice.quantity,'pan516-native:'+last.confirmationDigest+'#confirmed-purchase'),ref('RECEIPT','PAN516-ACCEPTED-RECEIPTS',expectedAmountMinor,invoice.quantity,'pan516-native:'+digest(receiptEvents)+'#aggregate-adopted-receipts'),ref('INVOICE',invoice.id,invoice.net_minor,invoice.quantity,invoiceSource.locator)];
  const decision=evaluateErvMatchingCaseV1({caseId:'pan516:'+invoice.id,matchingMode:{variantId:'THREE_WAY_INVOICE_PO_RECEIPT_V1',version:'1.0.0'},tolerancePolicy:{variantId:'STRICT_ZERO_V1',version:'1.0.0'},requestedEffects:['READ_SYNTHETIC','WRITE_LOCAL_PROOF'],references},pack);
  let status=decision.outcome==='MATCHED'?'RELEASED_LOCAL_SYNTHETIC':'UNRESOLVED_AMOUNT_DEVIATION';
  if(invoice.quantity<position.bestellteMenge)status='UNRESOLVED_PARTIAL_INVOICE';
  if(canonicalJson(last.terms)!==canonicalJson(state.approval.terms))status='UNRESOLVED_CONFIRMATION_CHANGE_NOT_APPROVED';
  const core={outcome:'LIABILITY_BASIS',status,orderedQuantity:position.bestellteMenge,acceptedQuantity:state.acceptedQuantity,invoicedQuantity:invoice.quantity,remainingInvoiceQuantity:position.bestellteMenge-invoice.quantity,expectedAmountMinor,varianceMinor,invoiceGrainCount:1,decision,source:{invoiceId:invoice.id,invoiceAmountMinor:invoice.net_minor,commonSourceFileSha256:COMMON_RAW_SHA,invoiceSource,mapping:MAPPING,confirmationDigest:last.confirmationDigest,confirmationRevision:last.revision,receiptEventDigests:receiptEvents.map(e=>e.eventDigest),frozenErvRegistryCanonicalSha256:AP04_ERV_CASE_PACK_CANONICAL_SHA256_V1,leadingBindingDigest:digest(b)},paymentOrder:null,authority:{paymentOrderAuthorized:false,productiveDispatchAuthorized:false,bookingAuthorityGranted:false},scope:'LOCAL_SYNTHETIC_CODE_BOUND_SOURCE_AND_NATIVE_LEDGER_ONLY'};
  return {...core,basisDigest:digest(core)};
}
