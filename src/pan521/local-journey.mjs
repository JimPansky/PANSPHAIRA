// P07 finite COMMON native journey. This is a local unqualified stage, not FiBu,
// fiscal/archive integration, an authority selector or permission to post/pay.
import common from '../../contracts/trade/common-trade-01-v1.json' with {type:'json'};
import {readCcpClosedObjectV1} from '../../dist/packages/contracts/src/ccp-event-envelope.js';
import {openNative,canonicalJson,digest,fail} from '../pan473/scope-profile.mjs';
import * as trade from '../pan515/trade-state.mjs';
import * as purchase from '../procurement-434/bestellung-lifecycle.mjs';
import * as finance from '../pan519/finance-handoff.mjs';
import {readPan521ConnectedTradeJourney} from './connected-trade.mjs';
const OWNER='LOCAL_SYNTHETIC_OWNER';
const reason='Code-owned COMMON P07 local native journey; no productive authority';
const semantic=command=>{const {transportId,...value}=command;return value;};
function commands(attemptId){
 const all=[],native=[];let purchaseRevision=0;
 const wire=id=>'synthetic:p07-'+attemptId+'-'+id.toLowerCase();
 function stock(kind,id,quantity,referenceId,effectiveAt,extra={},legacy=false){const command={schemaVersion:legacy?'pansphaira.pan515/trade-command/v1':'pansphaira.pan517/fulfilment-command/v1',effectId:id,transportId:wire(id),expectedRevision:native.length,orderId:common.sales_order.id,lineId:common.sales_order.line_id,articleId:common.scope.item_id,warehouseId:common.scope.warehouse_id,unit:common.scope.quantity_unit,kind,quantity,referenceId,effectiveAt,reason,...extra};native.push(command);all.push({family:'trade',command});}
 function procure(kind,id,receipt=null,extra={}){all.push({family:'purchase',command:{schemaVersion:'pansphaira.pan516/procurement-command/v1',effectId:'synthetic:p07-'+id.toLowerCase(),transportId:wire(id),expectedRevision:purchaseRevision++,orderId:'bestellung:pan516-common',positionId:'position:common-01',supplierId:'lieferant:synthetic-01',kind,receipt,sourceReference:'synthetic:p07-source-'+id.toLowerCase(),...extra}});}
 stock('PROMISE','PR-01',common.sales_order.quantity,null,common.sales_order.accepted_at,{promise:{revision:common.sales_order.promise_revision,kind:'DISPATCH',dueAt:common.sales_order.promised_dispatch_at,previousPromiseDigest:null,sourceReference:'COMMON-TRADE-01.sales_order'}});
 procure('APPROVE','PL-01');
 procure('TRANSMIT','PT-01');
 procure('CONFIRM','PC-01',null,{confirmation:{revision:1,previousConfirmationDigest:null,terms:purchaseTerms(),confirmedAt:'2026-06-21T10:00:00Z'}});
 for(const receipt of common.receipts){procure('ACCEPT_RECEIPT',receipt.id,{id:'wareneingang:p07-'+receipt.id.toLowerCase(),quantity:receipt.accepted_quantity,unit:common.scope.quantity_unit,acceptedAt:new Date(receipt.accepted_at).toISOString().replace('.000Z','Z')});stock('RECEIPT',receipt.id,receipt.accepted_quantity,receipt.po_id,receipt.accepted_at,{sourceLineId:receipt.po_line_id},true);}
 stock('RESERVE','RS-01',common.sales_order.quantity,null,common.reservation_events[0].at,{},true);
 for(const [index,shipment] of common.shipments.entries()){
  const suffix=String(index+1).padStart(2,'0'),day=shipment.dispatched_at.slice(0,10);
  stock('PICK','PK-'+suffix,shipment.quantity,'RS-01',day+'T10:00:00Z');
  stock('PACK','PA-'+suffix,shipment.quantity,'PK-'+suffix,day+'T11:00:00Z');
  stock('ISSUE',shipment.id,shipment.quantity,'PA-'+suffix,shipment.dispatched_at,{reservationId:'RS-01',reservationEventId:common.reservation_events[index+1].id,dispatchNoteId:'DN-'+suffix,physicalEvidenceId:'EV-'+suffix,promiseRevision:shipment.promise_revision});
 }
 const credit=common.sales_documents.find(d=>d.type==='CREDIT'),invoice=common.sales_documents.find(d=>d.id===credit.correction_of[0]),returned=common.returns[0];
 stock('COMPLAINT','CL-01',credit.quantity_absolute,invoice.shipment_id,'2026-07-05T09:00:00Z');
 stock('COMPLAINT_DECISION','CD-01',credit.quantity_absolute,'CL-01','2026-07-05T10:00:00Z',{decision:{disposition:'CREDIT_ALLOWED',rationale:'Explicit local synthetic credit is separate from physical return'}});
 stock('CREDIT','CR-01',credit.quantity_absolute,invoice.shipment_id,'2026-07-05T11:00:00Z',{credit:{documentId:credit.id,invoiceId:invoice.id,invoiceLineId:invoice.line_id,amountMinor:credit.net_absolute_minor,currency:common.scope.currency}});
 stock('RETURN_RECEIPT',returned.id,returned.quantity,returned.original_shipment_id,returned.at,{physicalEvidenceId:'EV-03'});
 return {all,native};
}
function purchaseRecord(){return {bestellungId:'bestellung:pan516-common',lieferantId:'lieferant:synthetic-01',bestellungZeitstempel:new Date(common.sales_order.accepted_at).toISOString().replace('.000Z','Z'),positionen:[{positionId:'position:common-01',artikelId:'EINK-ART-A01',einheit:common.scope.quantity_unit,waehrung:common.scope.currency,bestellteMenge:common.purchase_order.quantity,berechneteMengeMinor:null}]};}
function purchaseTerms(){return {unitPriceMinor:common.purchase_order.unit_net_minor,currency:common.scope.currency,unit:common.scope.quantity_unit,promisedAt:common.purchase_order.promised_acceptance_at};}
function tables(root,names){const db=openNative(root,'target');try{return db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().filter(row=>names.includes(row.name)).length;}finally{db.close();}}
export function executePan521LocalJourney(input){
 const keys=['root','owner','attemptId','asOf'];if(input!==null&&typeof input==='object'&&Object.hasOwn(input,'through'))keys.push('through');
 const packet=readCcpClosedObjectV1(input,keys,new WeakSet(),'PAN521_LOCAL_ACTION_INPUT_DENIED'),{root,owner,attemptId,asOf}=packet,through=Object.hasOwn(packet,'through')?packet.through:'FULL_NATIVE';
 if(owner!==OWNER||typeof root!=='string'||!root.length||typeof attemptId!=='string'||!/^attempt-[a-z0-9-]{1,24}$/.test(attemptId)||!['FULL_NATIVE','PURCHASE_TARGET'].includes(through))fail('PAN521_LOCAL_ACTION_INPUT_DENIED');
 // Validate the exact UTC readback instant before any business effect.
 if(typeof asOf!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/.test(asOf)||!Number.isFinite(Date.parse(asOf))||new Date(asOf).toISOString().replace('.000Z','Z')!==asOf)fail('PAN521_LOCAL_ACTION_CUTOFF_DENIED');
 // The released component writer leases are intentionally non-reentrant.
 // Compose durable steps, not a second cross-component lock or transaction.
  const initial=trade.readPan515TradeState({root,asOf}),plan=commands(attemptId);
  if(initial.binding.caseId!==common.id||initial.binding.commonReferenceDigest!==digest(common)||initial.binding.commonReferenceRevision!==common.revision)fail('PAN521_EXACT_COMMON_SOURCE_REQUIRED_DENIED');
  if(initial.writeMode!=='ENABLED'||initial.fulfilment&&initial.fulfilment.writeMode!=='ENABLED')fail('PAN521_NATIVE_ACTIONS_DISABLED_RETAINED_DENIED');
  const db=openNative(root,'target');try{for(const [index,row] of db.prepare('SELECT command FROM pan515_events ORDER BY revision LIMIT 129').all().entries()){if(index>=plan.native.length)break;if(canonicalJson(semantic(JSON.parse(row.command)))!==canonicalJson(semantic(plan.native[index])))fail('PAN521_EXISTING_WORKFLOW_ADOPTION_DENIED');}}finally{db.close();}
  const purchaseTables=tables(root,['pan516_binding','pan516_events','pan516_target_orders']);
  if(purchaseTables===0)purchase.initializePan516Procurement({root,owner,purchase:purchaseRecord(),terms:purchaseTerms()});
  else if(purchaseTables!==3)fail('PAN521_PARTIAL_PURCHASE_STORE_DENIED');
  else{const observed=purchase.readPan516Procurement({root});if(canonicalJson(observed.binding.purchase)!==canonicalJson(purchaseRecord())||canonicalJson(observed.binding.proposedTerms)!==canonicalJson(purchaseTerms()))fail('PAN521_EXISTING_PURCHASE_ADOPTION_DENIED');}
  // Native component APIs retain their own content-bound grants, STOP/REVOKE,
  // expected revisions and durable business-effect identities on every step.
  const receipts=[];
  for(const {family,command} of plan.all){
   const api=family==='trade'?trade:purchase,grant=family==='trade'?api.authorizePan515TradeCommand({root,owner,command}):api.authorizePan516ProcurementCommand({root,owner,command});
   const receipt=family==='trade'?api.executePan515TradeCommand({root,command,grant}):api.executePan516ProcurementCommand({root,command,grant});receipts.push(receipt);
   if(through==='PURCHASE_TARGET'&&family==='purchase'&&command.kind==='TRANSMIT')return {outcome:'LOCAL_PURCHASE_TARGET_COMMITTED_UNQUALIFIED',partial:true,compoundReadbackAvailable:false,original521Accepted:false,externalPostingAuthorized:false,paymentDispatchAuthorized:false,targetObservation:receipt.targetObservation,receipts};
  }
  const financeTables=tables(root,['pan519_binding','pan519_events','pan519_observations','pan519_dispatches']);
  if(financeTables===0)finance.initializePan519Finance({root,owner});else if(financeTables!==4)fail('PAN521_PARTIAL_FINANCE_STORE_DENIED');
  const {plan:handoffPlan}=finance.capturePan519HandoffPlan({root,owner,documentId:'AR-01',handedOffAt:'2026-07-06T10:00:00Z'});
  receipts.push(finance.executePan519Handoff({root,plan:handoffPlan,grant:finance.authorizePan519HandoffPlan({root,owner,plan:handoffPlan}),transportId:'synthetic:p07-'+attemptId+'-finance'}));
  return {outcome:'LOCAL_CONNECTED_ACTIONS_COMPLETED_UNQUALIFIED',original521Accepted:false,externalPostingAuthorized:false,paymentDispatchAuthorized:false,receipts,result:readPan521ConnectedTradeJourney({root,asOf})};
}
