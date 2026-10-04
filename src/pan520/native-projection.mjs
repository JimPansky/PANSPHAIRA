// P06 bounded native source seam; source facts are not portable authority.
import {types} from 'node:util';
import {join} from 'node:path';
import {readLocalJournalControl} from '../../demo/runtime/local-journal-owner.mjs';
import {canonicalJson,digest,fail,scopeProfile} from '../pan473/scope-profile.mjs';
import {isRealTradeInstant} from '../pan517/fulfilment-state.mjs';
import {readPan517DeliveryMilestones} from '../pan517/delivery-milestones.mjs';
import {readPan516ProcurementProjectionSnapshot} from '../procurement-434/bestellung-lifecycle.mjs';
import {evaluatePan516ProcurementLiabilitySnapshot} from '../procurement-434/bestellung-liability.mjs';

export const PAN520_REQUEST_V1='pansphaira.pan520/projection-request/v1';
export const PAN520_SNAPSHOT_V1='pansphaira.pan520/projection-snapshot/v1';
const QUESTIONS=Object.freeze({STOCK:['STOCK_POSITION','STOCK_RUNWAY','STOCK_VALUE'],P2P:['PROCUREMENT_QUANTITY','PROCUREMENT_PRICE_VARIANCE','PROCUREMENT_TIMELINESS'],O2C:['ORDER_SOURCE','DISPATCH_TIMELINESS','CUSTOMER_RECEIPT_TIMELINESS','BILLED_NET']});
function record(v,keys){
  if(v===null||typeof v!=='object'||Array.isArray(v)||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype)return false;
  const own=Reflect.ownKeys(v);if(own.length!==keys.length||own.some(k=>typeof k!=='string'||!keys.includes(k)))return false;
  return own.every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return d&&'value'in d&&d.enumerable;});
}
function safeQuestions(q,allowed){
  if(!Array.isArray(q)||types.isProxy(q)||Object.getPrototypeOf(q)!==Array.prototype)return false;
  const size=Object.getOwnPropertyDescriptor(q,'length');if(!size||!('value'in size)||size.value<1||size.value>allowed.length)return false;
  const keys=Reflect.ownKeys(q);if(keys.length!==size.value+1||keys.some(k=>typeof k!=='string'||k!=='length'&&!/^(0|[1-9][0-9]*)$/.test(k)))return false;
  const values=[];
  for(let i=0;i<size.value;i++){const d=Object.getOwnPropertyDescriptor(q,String(i));if(!d||!('value'in d)||!d.enumerable||!allowed.includes(d.value))return false;values.push(d.value);}
  return new Set(values).size===values.length;
}
const QUESTION_FACTS=Object.freeze({STOCK_POSITION:['physical','reserved','quarantined','free'],STOCK_RUNWAY:['stockRunwayDays'],STOCK_VALUE:['stockValueMinor'],ORDER_SOURCE:['orderQuantity','nativeOrderStatus','nativeOperationalDateSeconds','businessAcceptanceAt','declaredReferenceAcceptanceAt','orderUnitNetMinor','orderSourceNetMinor'],DISPATCH_TIMELINESS:['totalIssuedQuantity','onTimeDispatchedQuantity','dispatchPositionOtif'],CUSTOMER_RECEIPT_TIMELINESS:['customerReceiptOnTimeQuantity'],BILLED_NET:['billedNetMinor','billedNetByMonth'],PROCUREMENT_QUANTITY:['orderedQuantity','acceptedQuantity','remainingQuantity'],PROCUREMENT_PRICE_VARIANCE:['invoicedQuantity','invoiceAmountMinor','expectedInvoiceNetMinor','supplierPriceVarianceMinor'],PROCUREMENT_TIMELINESS:['onTimeAcceptedQuantity']});
function questionDependencies({binding,asOf,request,grain,facts,provenance,extra,control}){
  const result={};
  for(const question of request.questions){
    const inputs={contract:'pan520/'+request.profile+'/'+question+'/v1',grain,asOf,scopeDigest:binding.scopeDigest,targetEpoch:binding.targetEpoch,controlDigest:control.controlDigest,facts:Object.fromEntries(QUESTION_FACTS[question].map(key=>[key,facts[key]]))};
    if(question==='DISPATCH_TIMELINESS')inputs.originalDispatchPromise=provenance.dispatchOriginalPromise??null;
    if(question==='CUSTOMER_RECEIPT_TIMELINESS')inputs.originalCustomerReceiptPromise=provenance.customerReceiptPromise??null;
    if(question==='PROCUREMENT_PRICE_VARIANCE'){inputs.invoiceSource=provenance.invoiceSource??null;inputs.confirmationRevision=provenance.priceConfirmationRevision??null;inputs.priceBasis=provenance.priceBasis??null;}
    if(question==='PROCUREMENT_TIMELINESS')inputs.receiptAssignedPromises=(extra.receiptFacts??[]).map(r=>({quantity:r.quantity,unit:r.unit,acceptedAt:r.acceptedAt,promiseRevision:r.promiseRevision,promisedAt:r.promisedAt,eventDigest:r.eventDigest}));
    result[question]=digest(inputs);
  }
  return result;
}
const known=(value,unit,basis)=>({state:'KNOWN',value,unit,basis});
const unavailable=(reason,unit)=>({state:'UNAVAILABLE',value:null,unit,reason});
function validate(binding,request){
  if(!record(request,['schemaVersion','profile','scope','questions'])||request.schemaVersion!==PAN520_REQUEST_V1)fail('PAN520_PROJECTION_REQUEST_SHAPE_DENIED');
  if(typeof request.profile!=='string'||!Object.hasOwn(QUESTIONS,request.profile))fail('PAN520_PROFILE_NOT_IMPLEMENTED_DENIED');
  if(binding.caseId!=='COMMON-TRADE-01')fail('PAN520_SOURCE_PROFILE_NOT_ADMITTED_DENIED');
  const id=binding.nativeIdentityMapping,grain={sourceId:id.sourceId,tenantId:id.tenantId,entityId:id.entityId,orderId:request.profile==='P2P'?'PO-01':binding.orderId,lineId:binding.lineId,articleId:binding.articleId,warehouseId:binding.warehouseId,currency:'EUR',unit:binding.unit};
  if(!record(request.scope,Object.keys(grain))||Object.keys(grain).some(k=>request.scope[k]!==grain[k]))fail('PAN520_COMPOSITE_SOURCE_GRAIN_DENIED');
  const q=request.questions,allowed=QUESTIONS[request.profile];
  if(!safeQuestions(q,allowed))fail('PAN520_QUESTION_NOT_ADMITTED_DENIED');
  return grain;
}
function projectionControl({root,binding,request}){
  const {marker}=scopeProfile(root),operationKey='admin-ai:poc:pan520-read:'+digest({bindingDigest:digest(binding),profile:request.profile});
  for(const path of [join(root,'pan453-owned-v2'),join(root,'pan473-controller','pan453-owned-v2')]){
    for(const fence of Object.values(readLocalJournalControl(path).fences)){
      if(fence.sourceIdentity!==marker.sourceIdentity||fence.targetIdentity!==marker.targetIdentity)continue;
      if(fence.kind==='STOP'||fence.kind==='REVOKE'&&fence.operationKey===operationKey)fail('PAN520_PROJECTION_STOP_OR_REVOKE_DENIED');
    }
  }
  return {operationKey,controlDigest:digest({scopeDigest:binding.scopeDigest,targetEpoch:binding.targetEpoch,profile:request.profile,sourceIdentity:marker.sourceIdentity,targetIdentity:marker.targetIdentity,activeRelevantFences:[]})};
}
function envelope({binding,state,asOf,request,grain,facts,control,provenance={},extra={},purchaseRevision=null}){
  const nativeEventDigests=state.events.map(e=>e.eventDigest),snapshot={asOf,nativeRevision:state.revision,bindingDigest:digest(binding),nativeEventSetDigest:digest(nativeEventDigests)};
  if(request.profile==='P2P')snapshot.purchaseRevision=purchaseRevision;
  const dependencies=questionDependencies({binding,asOf,request,grain,facts,provenance,extra,control});
  const unsigned={schemaVersion:PAN520_SNAPSHOT_V1,profile:request.profile,grain,snapshot,facts,questionDependencies:dependencies,rights:{basis:'CURRENT_EXISTING_NATIVE_OWNER_AND_EXACT_CODE_BOUND_SOURCE',scopeDigest:binding.scopeDigest,targetEpoch:binding.targetEpoch,allowedOperations:[...request.questions].sort(),operationKey:control.operationKey,controlDigest:control.controlDigest,portableGrant:false},provenance:{leadingStore:binding.leadingStore,commonReferenceRevision:binding.commonReferenceRevision,commonReferenceDigest:binding.commonReferenceDigest,nativeEventDigests,quantityOwner:binding.owners.quantity,coverage:state.coverage??'COMPLETE_OWNED_EVENT_LEDGER_ONLY',...provenance},...extra,readOnly:true,productiveAuthority:false,independentAcceptance:false};
  return JSON.parse(canonicalJson({...unsigned,projectionDigest:digest(unsigned)}));
}
function stock(context){
  const {binding,state,request}=context,q=request.questions,facts={},quantity=v=>known(v,binding.unit,'ACTUAL_NATIVE_PAN515_EVENT_STOCK_READBACK');
  if(q.includes('STOCK_POSITION')){facts.physical=quantity(state.quantities.physical);facts.reserved=quantity(state.quantities.reserved);facts.quarantined=quantity(state.quantities.blocked);facts.free=quantity(state.quantities.available);}
  if(q.includes('STOCK_RUNWAY'))facts.stockRunwayDays=unavailable('MISSING_NATIVE_CONSUMPTION_HISTORY','DAYS');
  if(q.includes('STOCK_VALUE'))facts.stockValueMinor=unavailable('MISSING_QUALIFIED_VALUATION_PROFILE','EUR_MINOR');
  return envelope({...context,facts});
}
function procurement(context){
  const {binding,db,asOf,request}=context,q=request.questions,facts={};
  const present=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('pan516_binding','pan516_events','pan516_target_orders')").all();
  if(present.length===0){
    const fields={PROCUREMENT_QUANTITY:['orderedQuantity','acceptedQuantity','remainingQuantity'],PROCUREMENT_PRICE_VARIANCE:['invoicedQuantity','invoiceAmountMinor','expectedInvoiceNetMinor','supplierPriceVarianceMinor'],PROCUREMENT_TIMELINESS:['onTimeAcceptedQuantity']};
    for(const question of q)for(const key of fields[question])facts[key]=unavailable('MISSING_NATIVE_PURCHASE_STATE',key.endsWith('Minor')?'EUR_MINOR':binding.unit);
    return envelope({...context,facts,extra:{receiptFacts:[]},provenance:{purchaseSourceState:'UNAVAILABLE',receiptEventDigests:[],invoiceGrainCount:null,liabilityCoreOutcome:null}});
  }
  if(present.length!==3)fail('PAN520_PARTIAL_NATIVE_PURCHASE_SOURCE_DENIED');
  const p=readPan516ProcurementProjectionSnapshot({db,tradeBinding:binding}),b=p.binding,position=p.effectiveDraft.positionen[0];
  if(b.draft.bestellungId!=='bestellung:pan516-common'||position.positionId!=='position:common-01'||position.artikelId!=='EINK-ART-A01'||b.draft.lieferantId!=='lieferant:synthetic-01')fail('PAN520_COMPOSITE_PURCHASE_MAPPING_DENIED');
  if(position.einheit!==binding.unit||position.waehrung!=='EUR')fail('PAN520_PURCHASE_SOURCE_DIMENSION_DENIED');
  const commands=db.prepare('SELECT command,event FROM pan516_events ORDER BY revision LIMIT 129').all();
  let confirmation=null;const receiptFacts=[];
  for(const row of commands){
    const c=JSON.parse(row.command),e=JSON.parse(row.event);
    if(c.kind==='CONFIRM')confirmation=c.confirmation;
    if(c.kind==='ACCEPT_RECEIPT'){
      if(!isRealTradeInstant(c.receipt.acceptedAt))fail('PAN520_NATIVE_RECEIPT_EVENT_TIME_DENIED');
      if(asOf!==null&&Date.parse(c.receipt.acceptedAt)>Date.parse(asOf))continue;
      receiptFacts.push({sourceReceiptId:c.receipt.id,eventDigest:e.eventDigest,quantity:c.receipt.quantity,unit:c.receipt.unit,acceptedAt:c.receipt.acceptedAt,orderId:'PO-01',lineId:'1',promiseRevision:confirmation?.revision??null,promisedAt:confirmation?.terms.promisedAt??null,promiseKind:confirmation?'CONFIRMED_LOCAL_SUPPLIER_ACCEPTANCE':'UNKNOWN_NO_CONFIRMATION_AT_RECEIPT',sourceAuthority:'LOCAL_SYNTHETIC_NATIVE_RECORD_NOT_EXTERNAL_SUPPLIER_ATTESTATION'});
    }
  }
  const quantity=receiptFacts.reduce((sum,r)=>sum+r.quantity,0),quantityFact=v=>known(v,binding.unit,'ACTUAL_NATIVE_PAN516_APPROVED_ORDER_AND_RECEIPT_GRAIN');
  if(q.includes('PROCUREMENT_QUANTITY')){facts.orderedQuantity=quantityFact(position.bestellteMenge);facts.acceptedQuantity=quantityFact(quantity);facts.remainingQuantity=quantityFact(position.bestellteMenge-quantity);}
  const provenance={purchaseSourceState:'ACTUAL_NATIVE_SAME_TARGET_TRANSACTION',purchaseBindingDigest:digest(b),purchaseEventDigests:p.events.map(e=>e.eventDigest),receiptEventDigests:receiptFacts.map(r=>r.eventDigest),invoiceGrainCount:null,liabilityCoreOutcome:null};
  if(q.includes('PROCUREMENT_TIMELINESS')){
    if(receiptFacts.some(r=>r.promisedAt===null))facts.onTimeAcceptedQuantity=unavailable('MISSING_NATIVE_CONFIRMED_PROMISE_AT_RECEIPT',binding.unit);
    else if(receiptFacts.some(r=>!isRealTradeInstant(r.promisedAt)))facts.onTimeAcceptedQuantity=unavailable('INVALID_NATIVE_CONFIRMED_PROMISE_TIME',binding.unit);
    else facts.onTimeAcceptedQuantity=known(receiptFacts.filter(r=>Date.parse(r.acceptedAt)<=Date.parse(r.promisedAt)).reduce((sum,r)=>sum+r.quantity,0),binding.unit,'ACTUAL_RECEIPT_EVENT_TIME_VERSUS_ITS_OWN_ASSIGNED_CONFIRMATION_REVISION');
  }
  if(q.includes('PROCUREMENT_PRICE_VARIANCE')){
    const fields=['invoicedQuantity','invoiceAmountMinor','expectedInvoiceNetMinor','supplierPriceVarianceMinor'];
    let reason=null;
    if(asOf!==null)reason='MISSING_NATIVE_INVOICE_BUSINESS_DATE_FOR_HISTORICAL_PRICE_QUESTION';
    else if(!p.confirmations.length)reason='MISSING_NATIVE_CONFIRMED_PRICE';
    else if(p.acceptedQuantity<10)reason='REFERENCE_INVOICE_NOT_COVERED_BY_NATIVE_ACCEPTED_QUANTITY';
    if(reason)for(const key of fields)facts[key]=unavailable(reason,key.endsWith('Minor')?'EUR_MINOR':binding.unit);
    else{
      const liability=evaluatePan516ProcurementLiabilitySnapshot({state:p,invoiceId:'AP-01',expectedConfirmationRevision:p.confirmations.at(-1).revision});
      facts.invoicedQuantity=known(liability.invoicedQuantity,binding.unit,'EXACT_CODE_BOUND_COMMON_REFERENCE_INVOICE_GRAIN');
      facts.invoiceAmountMinor=known(liability.source.invoiceAmountMinor,'EUR_MINOR','EXACT_CODE_BOUND_COMMON_REFERENCE_INVOICE_GRAIN');
      facts.expectedInvoiceNetMinor=known(liability.expectedAmountMinor,'EUR_MINOR','UNCHANGED_NATIVE_PAN516_LIABILITY_AND_FROZEN_ERV_CORE');
      facts.supplierPriceVarianceMinor=known(liability.varianceMinor,'EUR_MINOR','UNCHANGED_NATIVE_PAN516_LIABILITY_AND_FROZEN_ERV_CORE');
      provenance.invoiceGrainCount=liability.invoiceGrainCount;provenance.liabilityCoreOutcome=liability.decision.outcome;provenance.liabilityBasisDigest=liability.basisDigest;provenance.invoiceSource=liability.source.invoiceSource;provenance.priceConfirmationRevision=liability.source.confirmationRevision;provenance.priceBasis='LATEST_NATIVE_CONFIRMED_TERMS_WITH_EXPLICIT_SOURCE_REVISION';
    }
  }
  return envelope({...context,facts,provenance,extra:{receiptFacts},purchaseRevision:p.revision});
}
function o2c(context){
  const {binding,state,db,request,asOf}=context,q=request.questions,facts={};
  const row=id=>{const r=db.prepare('SELECT body,revision,kind,deleted FROM objects WHERE id=?').get(id);if(!r||r.deleted)fail('PAN520_NATIVE_ORDER_SOURCE_MISSING_DENIED');return {...r,body:JSON.parse(r.body)};};
  const order=row(binding.nativeIdentityMapping.nativeOrderId),line=row(binding.nativeIdentityMapping.nativeLineId);
  const provenance={nativeOperationalDateIsBusinessAcceptance:false,declaredReferenceTimeIsNativeBusinessEvent:false,nativeOrderRecordDigest:digest(order),nativeLineRecordDigest:digest(line),nativeOrderFieldLocator:'objects/'+binding.nativeIdentityMapping.nativeOrderId,nativeLinePriceFieldLocator:'objects/'+binding.nativeIdentityMapping.nativeLineId+'#priceMinor',dispatchPromiseRevisions:[]};
  if(q.includes('ORDER_SOURCE')){
    facts.orderQuantity=known(binding.orderQuantity,binding.unit,'ACTUAL_LEADING_NATIVE_LINE_EXACT_INTEGER_MICROS_MAPPING');
    facts.nativeOrderStatus=known(order.body.status,'NATIVE_SOURCE_STATUS','ACTUAL_LEADING_NATIVE_ORDER_STATUS_NOT_INFERRED_BUSINESS_ACCEPTANCE');
    facts.nativeOperationalDateSeconds=known(order.body.date,'SECONDS','ACTUAL_NATIVE_OPERATIONAL_DATE_NOT_BUSINESS_ACCEPTANCE');
    facts.businessAcceptanceAt=unavailable('MISSING_NATIVE_BUSINESS_ACCEPTANCE_EVENT','BUSINESS_INSTANT');
    const mapped=binding.nativeDateMapping.canonicalAcceptedAt;
    facts.declaredReferenceAcceptanceAt=mapped===null?unavailable('MISSING_EXPLICIT_CANONICAL_REFERENCE_TIME','BUSINESS_INSTANT'):known(mapped,'BUSINESS_INSTANT','EXPLICIT_CODE_BOUND_COMMON_REFERENCE_MAPPING_NOT_NATIVE_BUSINESS_EVENT');
    if(asOf!==null){facts.orderUnitNetMinor=unavailable('MISSING_NATIVE_PRICE_VALID_TIME_HISTORY','EUR_MINOR');facts.orderSourceNetMinor=unavailable('MISSING_NATIVE_PRICE_VALID_TIME_HISTORY','EUR_MINOR');}
    else{
      const price=line.body.priceMinor;if(!Number.isSafeInteger(price)||price<0)fail('PAN520_NATIVE_ORDER_PRICE_DIMENSION_DENIED');
      const total=BigInt(binding.orderQuantity)*BigInt(price);if(total>BigInt(Number.MAX_SAFE_INTEGER))fail('PAN520_NATIVE_ORDER_PRICE_OVERFLOW_DENIED');
      facts.orderUnitNetMinor=known(price,'EUR_MINOR','ACTUAL_CURRENT_LEADING_NATIVE_LINE_PRICE_NOT_HISTORICAL_PRICE_VALID_TIME');
      facts.orderSourceNetMinor=known(Number(total),'EUR_MINOR','ACTUAL_CURRENT_NATIVE_LINE_QUANTITY_TIMES_NATIVE_UNIT_NET_PRICE_NOT_BILLED_NET');
    }
  }
  const milestones=state.fulfilment?readPan517DeliveryMilestones(state,binding,asOf):null;
  if(q.includes('DISPATCH_TIMELINESS')){
    const metric=milestones?.dispatch,notes=state.fulfilment?.deliveryNotes??[];provenance.dispatchPromiseRevisions=[...new Set(notes.map(n=>n.promiseRevision))];provenance.dispatchOriginalPromise=metric?{kind:metric.promiseKind,revision:metric.originalPromiseRevision,dueAt:metric.originalDueAt,digest:metric.originalPromiseDigest}:null;
    facts.totalIssuedQuantity=known(state.quantities.shipped,binding.unit,'ACTUAL_NATIVE_PHYSICAL_ISSUE_EVENTS_NOT_CUSTOMER_RECEIPT');
    facts.onTimeDispatchedQuantity=metric?.onTimeQuantity===null||!metric?unavailable('MISSING_NATIVE_DISPATCH_OR_ORIGINAL_DISPATCH_PROMISE',binding.unit):known(metric.onTimeQuantity,binding.unit,'UNCHANGED_NATIVE_PAN517_ORIGINAL_DISPATCH_PROMISE_METRIC');
    facts.dispatchPositionOtif=metric?.positionOtif===null||!metric?unavailable('NATIVE_DISPATCH_COMPLETION_OR_DEADLINE_NOT_REACHED','BOOLEAN'):known(metric.positionOtif,'BOOLEAN','UNCHANGED_NATIVE_PAN517_ORIGINAL_DISPATCH_POSITION_OTIF');
  }
  if(q.includes('CUSTOMER_RECEIPT_TIMELINESS')){
    const metric=milestones?.customerReceipt;provenance.customerReceiptPromise=metric?{kind:metric.promiseKind,revision:metric.originalPromiseRevision,dueAt:metric.originalDueAt,digest:metric.originalPromiseDigest}:null;
    const reason=!state.fulfilment?.customerReceipts.length?'MISSING_NATIVE_CUSTOMER_RECEIPT_EVIDENCE':'MISSING_NATIVE_CUSTOMER_RECEIPT_PROMISE';
    facts.customerReceiptOnTimeQuantity=metric?.onTimeQuantity===null||!metric?unavailable(reason,binding.unit):known(metric.onTimeQuantity,binding.unit,'UNCHANGED_NATIVE_PAN517_CUSTOMER_RECEIPT_NOT_DISPATCH_METRIC');
  }
  if(q.includes('BILLED_NET')){facts.billedNetMinor=unavailable('MISSING_NATIVE_OUTBOUND_BILLING_DOCUMENTS','EUR_MINOR');facts.billedNetByMonth=unavailable('MISSING_NATIVE_OUTBOUND_BILLING_DOCUMENTS','EUR_MINOR_BY_BUSINESS_MONTH');}
  return envelope({...context,facts,provenance});
}

export function projectPan520Stock(context){
  const grain=validate(context.binding,context.request),control=projectionControl(context),validated={...context,grain,control};
  return context.request.profile==='STOCK'?stock(validated):context.request.profile==='P2P'?procurement(validated):o2c(validated);
}
