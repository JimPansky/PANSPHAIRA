// Bounded P03 state transitions composed inside the existing native trade transaction.
// Source events are explicit local synthetic evidence, not warehouse/customer identity authority.
import {canonicalJson,digest,exact,fail} from '../pan473/scope-profile.mjs';
import common from '../../contracts/trade/common-trade-01-v1.json' with {type:'json'};
export const PAN517_COMMAND_V1='pansphaira.pan517/fulfilment-command/v1';
const BASE=['schemaVersion','effectId','transportId','expectedRevision','orderId','lineId','articleId','warehouseId','unit','kind','quantity','referenceId','effectiveAt','reason'];
const extras={PROMISE:['promise'],PICK:[],PACK:[],ISSUE:['reservationId','reservationEventId','dispatchNoteId','physicalEvidenceId','promiseRevision'],RETURN_RECEIPT:['physicalEvidenceId'],RETURN_DECISION:['decision'],COMPLAINT:[],COMPLAINT_DECISION:['decision'],CREDIT:['credit'],CUSTOMER_RECEIPT:['customerEvidenceId','promiseRevision'],DISABLE:[]};
const token=v=>typeof v==='string'&&/^(?:synthetic:[a-z0-9-]{3,64}|[A-Z]{2,8}-[0-9]{2})$/.test(v);
export function isRealTradeInstant(v){
  if(typeof v!=='string')return false;
  const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(v);
  if(!m)return false;
  const [y,month,day,hour,minute,second]=m.slice(1,7).map(Number);
  if(month<1||month>12||day<1||hour>23||minute>59||second>59||Number(m[8]??0)>23||Number(m[9]??0)>59)return false;
  const end=new Date(0);end.setUTCFullYear(y,month,0);
  return day<=end.getUTCDate()&&Number.isFinite(Date.parse(v));
}
const instant=isRealTradeInstant;
export function validatePan517Command(c,b){
  if(!instant(c?.effectiveAt))fail('PAN517_REAL_EVENT_INSTANT_REQUIRED_DENIED');
  if(c?.kind==='PROMISE'&&!instant(c.promise?.dueAt))fail('PAN517_REAL_PROMISE_INSTANT_REQUIRED_DENIED');
  if(!Object.hasOwn(extras,c?.kind??'')||!exact(c,[...BASE,...extras[c.kind]])||c.schemaVersion!==PAN517_COMMAND_V1||b.caseId!=='COMMON-TRADE-01'||!token(c.effectId)||!token(c.transportId)||!Number.isSafeInteger(c.expectedRevision)||c.expectedRevision<0||!Number.isSafeInteger(c.quantity)||c.quantity<1||c.quantity>1000000||typeof c.reason!=='string'||!c.reason.length||c.reason.length>120||/[\x00-\x1f]/.test(c.reason)||!instant(c.effectiveAt))fail('PAN517_COMMAND_SHAPE_DENIED');
  for(const key of ['orderId','lineId','articleId','warehouseId','unit'])if(c[key]!==b[key])fail('PAN517_COMPOSITE_NATIVE_IDENTITY_DENIED');
  if(c.kind==='PROMISE'){
    const p=c.promise;
    if(c.referenceId!==null||c.quantity!==b.orderQuantity||!exact(p,['revision','kind','dueAt','previousPromiseDigest','sourceReference'])||!Number.isSafeInteger(p.revision)||p.revision<1||!['DISPATCH','CUSTOMER_RECEIPT'].includes(p.kind)||!instant(p.dueAt)||Date.parse(p.dueAt)<Date.parse(c.effectiveAt)||typeof p.sourceReference!=='string'||!p.sourceReference.length||p.sourceReference.length>100)fail('PAN517_PROMISE_SHAPE_DENIED');
  }else if(c.kind==='DISABLE'?c.referenceId!==null:!token(c.referenceId))fail('PAN517_REFERENCE_REQUIRED_DENIED');
  if(c.kind==='RETURN_RECEIPT'&&!token(c.physicalEvidenceId))fail('PAN517_PHYSICAL_RETURN_EVIDENCE_REQUIRED_DENIED');
  if(c.kind==='COMPLAINT_DECISION'){
    const d=c.decision;
    if(!exact(d,['disposition','rationale'])||!['CREDIT_ALLOWED','RETURN_REQUESTED','REJECTED'].includes(d.disposition)||typeof d.rationale!=='string'||!d.rationale.length||d.rationale.length>120||/[\x00-\x1f]/.test(d.rationale))fail('PAN517_COMPLAINT_DECISION_REQUIRED_DENIED');
  }
  if(c.kind==='CREDIT'){
    const v=c.credit,document=common.sales_documents.find(d=>d.type==='CREDIT'&&d.id===v?.documentId),invoice=common.sales_documents.find(d=>d.type==='INVOICE'&&d.id===v?.invoiceId);
    if(!exact(v,['documentId','invoiceId','invoiceLineId','amountMinor','currency'])||!document||!invoice||v.currency!==common.scope.currency||v.invoiceLineId!==invoice.line_id||canonicalJson(document.correction_of)!==canonicalJson([invoice.id,invoice.line_id])||v.amountMinor!==document.net_absolute_minor||c.quantity!==document.quantity_absolute||c.referenceId!==invoice.shipment_id)fail('PAN517_CODE_BOUND_TECHNICAL_CREDIT_REQUIRED_DENIED');
  }
  if(c.kind==='RETURN_DECISION'){
    const d=c.decision;
    if(!exact(d,['disposition','inspectionEvidenceId','rationale'])||!['RELEASE','RETAIN_QUARANTINE'].includes(d.disposition)||!token(d.inspectionEvidenceId)||typeof d.rationale!=='string'||!d.rationale.length||d.rationale.length>120||/[\x00-\x1f]/.test(d.rationale))fail('PAN517_DOCUMENTED_INSPECTION_REQUIRED_DENIED');
  }
  if(c.kind==='CUSTOMER_RECEIPT'&&(!token(c.customerEvidenceId)||!Number.isSafeInteger(c.promiseRevision)||c.promiseRevision<1))fail('PAN517_CUSTOMER_RECEIPT_EVIDENCE_REQUIRED_DENIED');
  if(c.kind==='ISSUE'&&(![c.reservationId,c.reservationEventId,c.dispatchNoteId,c.physicalEvidenceId].every(token)||!Number.isSafeInteger(c.promiseRevision)||c.promiseRevision<1))fail('PAN517_DISPATCH_EVIDENCE_REQUIRED_DENIED');
}
export function advancePan517State(before,c,b){
  const next=JSON.parse(canonicalJson(before));
  next.fulfilment??={promises:[],picks:[],packs:[],deliveryNotes:[],returns:[],decisions:[],complaints:[],complaintDecisions:[],credits:[],customerReceipts:[],writeMode:'ENABLED'};
  const f=next.fulfilment;
  if(f.writeMode!=='ENABLED')fail('PAN517_TRANSITIONS_DISABLED_RETAINED_DENIED');
  if(c.kind==='DISABLE'){f.writeMode='DISABLED_RETAINED';f.disabledBy={effectId:c.effectId,effectiveAt:c.effectiveAt,reason:c.reason};}
  else if(c.kind==='PROMISE'){
    const old=f.promises.at(-1),p=c.promise;
    if(!old&&(p.kind!=='DISPATCH'||Date.parse(p.dueAt)!==Date.parse(common.sales_order.promised_dispatch_at)||Date.parse(c.effectiveAt)!==Date.parse(common.sales_order.accepted_at)||p.sourceReference!=='COMMON-TRADE-01.sales_order'))fail('PAN517_ORIGINAL_COMMON_PROMISE_BINDING_DENIED');
    if(p.revision!==(old?.revision??0)+1||p.previousPromiseDigest!==(old?.promiseDigest??null))fail('PAN517_PROMISE_REVISION_CHAIN_DENIED');
    const record={...p,effectId:c.effectId,acceptedAt:c.effectiveAt};f.promises.push({...record,promiseDigest:digest(record)});
  }else if(c.kind==='PICK'){
    const reservation=next.reservations.find(r=>r.id===c.referenceId);
    const held=f.picks.filter(p=>p.reservationId===c.referenceId).reduce((sum,p)=>sum+p.quantity-p.issued,0);
    if(!reservation||c.quantity>reservation.remaining-held)fail('PAN517_PICK_RESERVATION_REQUIRED_DENIED');
    f.picks.push({id:c.effectId,reservationId:c.referenceId,quantity:c.quantity,packed:0,issued:0,effectiveAt:c.effectiveAt});
  }else if(c.kind==='PACK'){
    const pick=f.picks.find(p=>p.id===c.referenceId);
    if(!pick||c.quantity>pick.quantity-pick.packed)fail('PAN517_PACK_PICK_REQUIRED_DENIED');
    pick.packed+=c.quantity;f.packs.push({id:c.effectId,pickId:pick.id,reservationId:pick.reservationId,quantity:c.quantity,issued:0,effectiveAt:c.effectiveAt});
  }else if(c.kind==='ISSUE'){
    const pack=f.packs.find(p=>p.id===c.referenceId),promise=f.promises.find(p=>p.revision===c.promiseRevision),reservation=next.reservations.find(r=>r.id===c.reservationId);
    if(!pack||pack.reservationId!==c.reservationId||!reservation||c.quantity>pack.quantity-pack.issued||c.quantity>reservation.remaining)fail('PAN517_ISSUE_PACK_RESERVATION_REQUIRED_DENIED');
    if(!promise)fail('PAN517_ISSUE_PROMISE_REQUIRED_DENIED');
    if(f.deliveryNotes.some(n=>n.id===c.dispatchNoteId||n.physicalEvidenceId===c.physicalEvidenceId))fail('PAN517_DUPLICATE_PHYSICAL_DISPATCH_DENIED');
    pack.issued+=c.quantity;f.picks.find(p=>p.id===pack.pickId).issued+=c.quantity;
    f.deliveryNotes.push({id:c.dispatchNoteId,shipmentId:c.effectId,reservationId:c.reservationId,orderId:b.orderId,lineId:b.lineId,quantity:c.quantity,reservationRemainder:reservation.remaining-c.quantity,orderBackorder:b.orderQuantity-before.quantities.shipped-c.quantity,physicalEvidenceId:c.physicalEvidenceId,eventType:'DISPATCH',effectiveAt:c.effectiveAt,promiseKind:promise.kind,promiseRevision:promise.revision});
  }else if(c.kind==='RETURN_RECEIPT'){
    const shipment=next.shipments.find(s=>s.id===c.referenceId);
    if(!shipment||!f.deliveryNotes.some(n=>n.shipmentId===shipment.id)||c.quantity>shipment.quantity-shipment.returned)fail('PAN517_RETURN_EXCEEDS_ACTUAL_ISSUE_DENIED');
    if([...f.deliveryNotes,...f.returns].some(r=>r.physicalEvidenceId===c.physicalEvidenceId))fail('PAN517_DUPLICATE_PHYSICAL_RETURN_DENIED');
    f.returns.push({id:c.effectId,shipmentId:shipment.id,quantity:c.quantity,remainingQuarantined:c.quantity,allocations:[],physicalEvidenceId:c.physicalEvidenceId,effectiveAt:c.effectiveAt,eventType:'RETURN_RECEIPT',creditId:null});
  }else if(c.kind==='RETURN_DECISION'){
    const r=f.returns.find(r=>r.id===c.referenceId);
    if(!r||c.quantity>r.remainingQuarantined)fail('PAN517_QUARANTINED_RETURN_REQUIRED_DENIED');
    if(f.decisions.some(d=>d.inspectionEvidenceId===c.decision.inspectionEvidenceId))fail('PAN517_INSPECTION_EVIDENCE_REPLAY_DENIED');
    f.decisions.push({id:c.effectId,returnId:r.id,quantity:c.quantity,...c.decision,effectiveAt:c.effectiveAt,eventType:'RETURN_DECISION'});
  }else if(['COMPLAINT','CREDIT'].includes(c.kind)){
    const shipment=next.shipments.find(s=>s.id===c.referenceId);
    if(!shipment||c.quantity>shipment.quantity)fail('PAN517_ACTUAL_ISSUE_REFERENCE_REQUIRED_DENIED');
    if(c.kind==='COMPLAINT')f.complaints.push({id:c.effectId,shipmentId:shipment.id,quantity:c.quantity,effectiveAt:c.effectiveAt,eventType:'COMPLAINT'});
    else{
      if(f.credits.some(v=>v.documentId===c.credit.documentId))fail('PAN517_CREDIT_DOCUMENT_REPLAY_DENIED');
      f.credits.push({id:c.effectId,shipmentId:shipment.id,quantity:c.quantity,...c.credit,effectiveAt:c.effectiveAt,eventType:'CREDIT',physicalReturnRequired:false,productivePostingAuthorized:false});
    }
  }else if(c.kind==='COMPLAINT_DECISION'){
    const claim=f.complaints.find(q=>q.id===c.referenceId);
    if(!claim||c.quantity>claim.quantity)fail('PAN517_COMPLAINT_REFERENCE_REQUIRED_DENIED');
    f.complaintDecisions.push({id:c.effectId,complaintId:claim.id,quantity:c.quantity,...c.decision,effectiveAt:c.effectiveAt,eventType:'COMPLAINT_DECISION'});
  }else if(c.kind==='CUSTOMER_RECEIPT'){
    const shipment=next.shipments.find(s=>s.id===c.referenceId),promise=f.promises.find(p=>p.revision===c.promiseRevision),received=f.customerReceipts.filter(r=>r.shipmentId===c.referenceId).reduce((sum,r)=>sum+r.quantity,0);
    if(!shipment||!f.deliveryNotes.some(n=>n.shipmentId===shipment.id)||!promise||c.quantity>shipment.quantity-received)fail('PAN517_CUSTOMER_RECEIPT_ACTUAL_ISSUE_BINDING_DENIED');
    if(f.customerReceipts.some(r=>r.customerEvidenceId===c.customerEvidenceId))fail('PAN517_CUSTOMER_RECEIPT_EVIDENCE_REPLAY_DENIED');
    f.customerReceipts.push({id:c.effectId,shipmentId:shipment.id,quantity:c.quantity,customerEvidenceId:c.customerEvidenceId,promiseKind:promise.kind,promiseRevision:promise.revision,effectiveAt:c.effectiveAt,eventType:'CUSTOMER_RECEIPT',externalCustomerIdentityProven:false});
  }
  return next;
}
export function pan517EventEvidence(next,c){
  const promise=c.kind==='PROMISE'?c.promise:next.fulfilment.promises.find(p=>p.revision===c.promiseRevision);
  return {eventType:c.kind==='ISSUE'?'DISPATCH':c.kind,promiseKind:promise?.kind??null,promiseRevision:promise?.revision??null,sourceEvidenceId:c.physicalEvidenceId??c.customerEvidenceId??null,dispatchNoteId:c.dispatchNoteId??null,decision:c.decision??null,credit:c.credit??null,scope:'LOCAL_SYNTHETIC_DISPOSABLE',physicalProductiveMovementAuthorized:false};
}
