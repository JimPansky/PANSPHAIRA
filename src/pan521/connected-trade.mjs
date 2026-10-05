// P07 connects actual existing native stores and P06 reads, not independent PASS files.
// This bounded development stage cannot qualify missing fiscal/archive/FiBu inputs.
import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readPan515TradeState} from '../pan515/trade-state.mjs';
import {readPan516Procurement} from '../procurement-434/bestellung-lifecycle.mjs';
import {evaluatePan516ProcurementLiability} from '../procurement-434/bestellung-liability.mjs';
import {readPan519Finance} from '../pan519/finance-handoff.mjs';
import {acquireLocalJournalOwner} from '../../demo/runtime/local-journal-owner.mjs';
import {digest,fail} from '../pan473/scope-profile.mjs';
const commonBytes=()=>readFileSync(new URL('../../contracts/trade/common-trade-01-v1.json',import.meta.url));
export function readPan521ConnectedTradeJourney({root,asOf}){
 // The shared local native-owner lease prevents cooperating product writers from
 // changing a revision between reads. No new database, approval or runtime grant.
 const lease=acquireLocalJournalOwner(join(root,'pan453-owned-v2'));
 try{
  const raw=commonBytes(),common=JSON.parse(raw),commonSha256=createHash('sha256').update(raw).digest('hex'),trade=readPan515TradeState({root,asOf}),b=trade.binding;
  if(b.caseId!==common.id||b.commonReferenceDigest!==digest(common)||b.commonReferenceRevision!==common.revision)fail('PAN521_EXACT_COMMON_SOURCE_REQUIRED_DENIED');
  const identity={caseId:common.id,commonRevision:common.revision,commonSha256,sourceId:common.scope.source_id,tenantId:common.scope.tenant_id,entityId:common.scope.entity_id,orderId:common.sales_order.id,lineId:common.sales_order.line_id,articleId:common.scope.item_id,warehouseId:common.scope.warehouse_id,currency:common.scope.currency,unit:common.scope.quantity_unit};
  const id=b.nativeIdentityMapping,projections={};
  const questions={STOCK:['STOCK_POSITION','STOCK_RUNWAY','STOCK_VALUE'],P2P:['PROCUREMENT_QUANTITY','PROCUREMENT_TIMELINESS'],O2C:['ORDER_SOURCE','DISPATCH_TIMELINESS','CUSTOMER_RECEIPT_TIMELINESS','BILLED_NET']};
  for(const [profile,q] of Object.entries(questions)){
   const scope={sourceId:id.sourceId,tenantId:id.tenantId,entityId:id.entityId,orderId:profile==='P2P'?common.purchase_order.id:b.orderId,lineId:b.lineId,articleId:b.articleId,warehouseId:b.warehouseId,currency:identity.currency,unit:b.unit};
   projections[profile]=readPan515TradeState({root,asOf,projection:{schemaVersion:'pansphaira.pan520/projection-request/v1',profile,scope,questions:q}});
   const snap=projections[profile].snapshot;
   if(snap.nativeRevision!==trade.revision||snap.bindingDigest!==digest(b)||snap.nativeEventSetDigest!==digest(trade.events.map(e=>e.eventDigest)))fail('PAN521_PROJECTION_SOURCE_REVISION_DRIFT_DENIED');
  }
  const purchase=readPan516Procurement({root}),confirmation=purchase.confirmations.at(-1),finance=readPan519Finance({root,asOf});
  if(purchase.binding.tradeBindingDigest!==digest(b)||finance.documents.some(d=>d.tenantId!==identity.tenantId||d.entityId!==identity.entityId||d.currency!==identity.currency)||projections.P2P.snapshot.purchaseRevision!==purchase.revision)fail('PAN521_CONNECTED_COMPOSITE_SOURCE_DRIFT_DENIED');
  const originalPurchaseInvoice=evaluatePan516ProcurementLiability({root,invoiceId:common.purchase_invoice.id,expectedConfirmationRevision:confirmation?.revision});
  const referenceOnlyBilling={documents:common.sales_documents.map(d=>({documentId:d.id,type:d.type,invoiceDate:d.invoice_date,sourceShipmentId:d.shipment_id??null,correctionOf:d.correction_of??null,netMinor:d.net_absolute_minor})),totalNetMinor:common.sales_documents.reduce((n,d)=>n+(d.type==='CREDIT'?-d.net_absolute_minor:d.net_absolute_minor),0),basis:'PUBLIC_COMMON_REFERENCE_DOCUMENTS_NOT_NATIVE_FISCAL_INVOICES',nativeFiscalInvoiceOrArchiveQualified:false};
  const openExceptions=[{code:'P04_FISCAL_ARCHIVE_QUALIFICATION_MISSING',scope:'Explicit fiscal/format case and original archive bytes/readback unqualified.'},{code:'P05_TARGET_QUALIFICATION_MISSING',scope:'Actual selected authorized FiBu/test-tenant/readback absent; local references are not its qualification.'}];
  if(originalPurchaseInvoice.status!=='RELEASED_LOCAL_SYNTHETIC')openExceptions.push({code:'ORIGINAL_AP_AMOUNT_DEVIATION',documentId:common.purchase_invoice.id,varianceMinor:originalPurchaseInvoice.varianceMinor});
  for(const d of finance.documents)if(d.openMinor===null||d.paymentState!=='PAID')openExceptions.push({code:d.openMinor===null?'FINANCE_READBACK_UNKNOWN':'FINANCE_SETTLEMENT_OPEN',documentId:d.documentId,paymentState:d.paymentState});
  const final=readPan515TradeState({root,asOf});if(final.revision!==trade.revision||digest(final.events.map(e=>e.eventDigest))!==digest(trade.events.map(e=>e.eventDigest)))fail('PAN521_CONNECTED_END_SOURCE_DRIFT_DENIED');
  return {schemaVersion:'pansphaira.pan521/connected-native-readback/v1',proofClass:'LOCAL_NATIVE_WITH_UNQUALIFIED_FINANCE_CONTRACT',identity,native:{leadingStore:b.leadingStore,tradeRevision:trade.revision,tradeBindingDigest:digest(b),tradeEventDigests:trade.events.map(e=>e.eventDigest),purchaseRevision:purchase.revision,purchaseEventDigests:purchase.events.map(e=>e.eventDigest),physical:trade.quantities.physical,reserved:trade.quantities.reserved,quarantined:trade.quantities.blocked,shipped:trade.quantities.shipped},projections,originalPurchaseInvoice,finance,referenceOnlyBilling,completion:{businessCaseClosed:false,original521Accepted:false,realTargetSandboxQualified:false,fiscalArchiveQualified:false,paymentDispatchAuthorized:false,externalPostingAuthorized:false,openExceptions},readOnly:true};
 }finally{lease.release();}
}
