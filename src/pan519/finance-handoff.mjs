// P05 adds bounded contract evidence to the existing PAN472 target, not a main ledger.
// Local synthetic owner capability and net-minor examples grant no external posting/payment rights.
import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readCcpClosedObjectV1,readCcpDenseArrayV1,ccpStrictDenyV1} from '../../dist/packages/contracts/src/ccp-event-envelope.js';
import {acquireLocalJournalOwner,readLocalJournalControl} from '../../demo/runtime/local-journal-owner.mjs';
import {diagnosePan473WriterScope} from '../pan473/independent-scope-diagnosis.mjs';
import {openNative,transaction,canonicalJson,digest,exact,fail,guardsMatch,scopeProfile} from '../pan473/scope-profile.mjs';
import {readPan515TradeState} from '../pan515/trade-state.mjs';
import {evaluatePan516ProcurementLiability} from '../procurement-434/bestellung-liability.mjs';
const OWNER='LOCAL_SYNTHETIC_OWNER';
// Shared CCP descriptor-safe object/array guards; caller code is not JSON data.
function snapshotData(value,seen=new WeakSet(),depth=0){
 const code='PAN519_INPUT_DATA_DENIED';if(depth>16)ccpStrictDenyV1(code);
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'&&Number.isFinite(value)&&!Object.is(value,-0))return value;
 if(typeof value!=='object')ccpStrictDenyV1(code);
 if(Array.isArray(value)){const values=readCcpDenseArrayV1(value,seen,code);if(values.length>128)ccpStrictDenyV1(code);return values.map(v=>snapshotData(v,seen,depth+1));}
 const record=readCcpClosedObjectV1(value,Object.keys(value),seen,code);return Object.fromEntries(Object.entries(record).map(([k,v])=>[k,snapshotData(v,seen,depth+1)]));
}
const COMMON_SHA='2b76e8537646f727b75b157a3b5529a44b94e2e8ee551b5fcef9f5d3bd3c8160';
const GRANTS=new WeakMap();
const GUARDS=['pan519_binding','pan519_events','pan519_observations','pan519_dispatches'].flatMap(table=>['UPDATE','DELETE'].map(action=>({name:table+'_'+action.toLowerCase()+'_immutable',sql:`CREATE TRIGGER ${table}_${action.toLowerCase()}_immutable BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT,'PAN519_HISTORY_IMMUTABLE_DENIED'); END`})));
const token=v=>typeof v==='string'&&/^synthetic:[a-z0-9-]{3,64}$/.test(v);
const authority=()=>({paymentDispatchAuthorized:false,externalPostingAuthorized:false,externalAdapterSelected:false});
const qualification=()=>({scope:'LOCAL_SYNTHETIC_CONTRACT_ONLY',realTargetSandboxQualified:false,fiscalArchiveQualified:false});
function timestamp(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().replace('.000Z','Z')!==v)fail('PAN519_EXACT_TIMESTAMP_DENIED');return Date.parse(v);}
function common(){const raw=readFileSync(new URL('../../contracts/trade/common-trade-01-v1.json',import.meta.url));if(createHash('sha256').update(raw).digest('hex')!==COMMON_SHA)fail('PAN519_COMMON_SOURCE_BYTES_DENIED');return JSON.parse(raw);}
function native(root){
 const d=diagnosePan473WriterScope({root});if(d.outcome!=='ACTIVE'||!d.complete)fail('PAN519_CURRENT_NATIVE_OWNER_REQUIRED_DENIED');
 const t=readPan515TradeState({root});if(t.binding.caseId!=='COMMON-TRADE-01'||t.writeMode==='DISABLED_RETAINED')fail('PAN519_CURRENT_COMMON_NATIVE_SCOPE_DENIED');
 return {tradeBindingDigest:digest(t.binding),sourceProfileDigest:t.binding.sourceProfileDigest,targetEpoch:t.binding.targetEpoch};
}
function binding(db,root){
 if(!guardsMatch(db,GUARDS))fail('PAN519_HISTORY_GUARDS_REQUIRED_DENIED');
 const row=db.prepare('SELECT record FROM pan519_binding WHERE id=1').get();if(!row)fail('PAN519_NATIVE_FINANCE_BINDING_REQUIRED_DENIED');
 const b=JSON.parse(row.record),current=native(root);for(const k of Object.keys(current))if(b[k]!==current[k])fail('PAN519_NATIVE_BINDING_DRIFT_DENIED');return b;
}
function fences(root,b,key){
 const {marker}=scopeProfile(root),operationKey='admin-ai:poc:pan519:'+key;
 for(const journal of [join(root,'pan453-owned-v2'),join(root,'pan473-controller','pan453-owned-v2')])for(const f of Object.values(readLocalJournalControl(journal).fences))if(f.kind==='STOP'&&f.sourceIdentity===marker.sourceIdentity&&f.targetIdentity===marker.targetIdentity||f.kind==='REVOKE'&&f.operationKey===operationKey)fail('PAN519_STOP_OR_REVOKE_DENIED');
 if(b.tenantId!==common().scope.tenant_id)fail('PAN519_TENANT_BINDING_DENIED');
}
function sourceDocument(root,documentId,b){
 const c=common(),t=readPan515TradeState({root});let core;
 if(documentId==='AR-01'){
  const invoice=c.sales_documents.find(d=>d.id===documentId),event=t.events.find(e=>e.effectId===invoice.shipment_id&&(e.kind==='SHIP'||e.kind==='ISSUE'&&e.fulfilmentEvidence?.eventType==='DISPATCH'&&t.fulfilment.deliveryNotes.some(n=>n.shipmentId===e.effectId&&n.orderId===t.binding.orderId&&n.lineId===t.binding.lineId&&n.quantity===e.quantity)));
  if(!event||event.quantity!==invoice.quantity_absolute||invoice.net_absolute_minor!==invoice.quantity_absolute*c.sales_order.unit_net_minor)fail('PAN519_CONFIRMED_SALES_SOURCE_REQUIRED_DENIED');
  core={documentId,kind:'AR',amountMinor:invoice.net_absolute_minor,currency:c.scope.currency,tenantId:b.tenantId,entityId:b.entityId,invoiceDate:invoice.invoice_date,source:{commonSha256:COMMON_SHA,invoiceLocator:'contracts/trade/common-trade-01-v1.json#sales_documents/'+documentId,shipmentEventDigest:event.eventDigest},amountBasis:'PUBLIC_SYNTHETIC_NET_MINOR_NOT_FISCAL_GROSS'};
 }else if(['AP-PAN516-MATCHED-01','AP-01'].includes(documentId)){
  const liability=evaluatePan516ProcurementLiability({root,invoiceId:documentId,expectedConfirmationRevision:1});if(liability.status!=='RELEASED_LOCAL_SYNTHETIC')fail('PAN519_UNRESOLVED_LIABILITY_NOT_ADMITTED_DENIED');
  core={documentId,kind:'AP',amountMinor:liability.source.invoiceAmountMinor,currency:c.scope.currency,tenantId:b.tenantId,entityId:b.entityId,invoiceDate:null,source:{liabilityBasisDigest:liability.basisDigest,invoiceSource:liability.source.invoiceSource,confirmationDigest:liability.source.confirmationDigest,receiptEventDigests:liability.source.receiptEventDigests},amountBasis:'PUBLIC_SYNTHETIC_NET_MINOR_NOT_FISCAL_GROSS'};
 }else fail('PAN519_CODE_OWNED_DOCUMENT_SOURCE_DENIED');
 return {...core,sourceDigest:digest(core)};
}
function keyFor(b,doc){return digest({tenantId:b.tenantId,entityId:b.entityId,documentId:doc.documentId,kind:doc.kind});}
function events(db,b){
 const rows=db.prepare('SELECT revision,business_key,record FROM pan519_events ORDER BY revision LIMIT 129').all();if(rows.length>128)fail('PAN519_HISTORY_BOUND_DENIED');let previous=null;
 return rows.map((r,index)=>{const e=JSON.parse(r.record),{receiptDigest,...core}=e;
  if(r.revision!==index+1||e.revision!==r.revision||r.business_key!==e.businessKey||e.bindingDigest!==digest(b)||e.previousReceiptDigest!==previous||receiptDigest!==digest(core))fail('PAN519_EVENT_READBACK_DENIED');previous=receiptDigest;return e;
 });
}
function validPlan(plan,root,b){
 if(!exact(plan,['schemaVersion','bindingDigest','document','businessKey','handedOffAt'])||plan.schemaVersion!=='pansphaira.pan519/handoff-plan/v1'||plan.bindingDigest!==digest(b))fail('PAN519_PLAN_BINDING_DENIED');
 timestamp(plan.handedOffAt);const doc=sourceDocument(root,plan.document?.documentId,b);if(canonicalJson(doc)!==canonicalJson(plan.document)||plan.businessKey!==keyFor(b,doc))fail('PAN519_PLAN_SOURCE_DRIFT_DENIED');
 if(doc.invoiceDate&&Date.parse(plan.handedOffAt)<Date.parse(doc.invoiceDate+'T00:00:00Z'))fail('PAN519_HANDOFF_PRECEDES_INVOICE_DENIED');fences(root,b,plan.businessKey);
}
export function initializePan519Finance({root,owner}){
 if(owner!==OWNER)fail('PAN519_LOCAL_SYNTHETIC_OWNER_REQUIRED_DENIED');const current=native(root),c=common(),lease=acquireLocalJournalOwner(join(root,'pan453-owned-v2'));let db;
 try{db=openNative(root,'target',false);return transaction(db,()=>{
  if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('pan519_binding','pan519_events','pan519_observations','pan519_dispatches')").all().length)fail('PAN519_EXISTING_FINANCE_ADOPTION_DENIED');
  const record={schemaVersion:'pansphaira.pan519/native-finance-contract/v1',leadingStore:'PAN472_TARGET_SQLITE',...current,tenantId:c.scope.tenant_id,entityId:c.scope.entity_id,currency:c.scope.currency,...qualification()};
  db.exec('CREATE TABLE pan519_binding(id INTEGER PRIMARY KEY CHECK(id=1),record TEXT NOT NULL);CREATE TABLE pan519_events(revision INTEGER PRIMARY KEY,business_key TEXT UNIQUE NOT NULL,record TEXT NOT NULL);CREATE TABLE pan519_observations(revision INTEGER PRIMARY KEY,observation_key TEXT UNIQUE NOT NULL,business_key TEXT NOT NULL,record TEXT NOT NULL);CREATE TABLE pan519_dispatches(business_key TEXT PRIMARY KEY,record TEXT NOT NULL);');
  db.prepare('INSERT INTO pan519_binding VALUES(1,?)').run(canonicalJson(record));for(const g of GUARDS)db.exec(g.sql);
  return {outcome:'FINANCE_CONTRACT_INITIALIZED',binding:record,qualification:qualification(),authority:authority()};
 });}finally{db?.close();lease.release();}
}
export function capturePan519HandoffPlan({root,owner,documentId,handedOffAt}){
 if(owner!==OWNER)fail('PAN519_LOCAL_SYNTHETIC_OWNER_REQUIRED_DENIED');const db=openNative(root,'target');
 try{db.exec('BEGIN');const b=binding(db,root),document=sourceDocument(root,documentId,b),businessKey=keyFor(b,document);timestamp(handedOffAt);fences(root,b,businessKey);
  const plan={schemaVersion:'pansphaira.pan519/handoff-plan/v1',bindingDigest:digest(b),document,businessKey,handedOffAt};validPlan(plan,root,b);
  const prior=events(db,b).find(e=>e.businessKey===businessKey);
  return {plan,diff:{before:prior?'HANDOFF_PENDING_READBACK':'NOT_HANDED_OFF',after:'HANDOFF_PENDING_READBACK',documentId,kind:document.kind,amountMinor:document.amountMinor,currency:document.currency,risks:['Local handoff/export is not external booking','Payments and main ledger remain external','Fiscal/archive and actual target sandbox qualification absent']},qualification:qualification()};
 }finally{db.close();}
}
export function authorizePan519HandoffPlan({root,owner,plan}){
 plan=snapshotData(plan);if(owner!==OWNER)fail('PAN519_LOCAL_SYNTHETIC_OWNER_REQUIRED_DENIED');const db=openNative(root,'target');
 try{const b=binding(db,root);validPlan(plan,root,b);const grant=Object.freeze({});GRANTS.set(grant,{root,planDigest:digest(plan),expires:Date.now()+30000});return grant;}finally{db.close();}
}
export function executePan519Handoff({root,plan,grant,transportId}){
 plan=snapshotData(plan);const g=GRANTS.get(grant);if(!g||g.root!==root||g.planDigest!==digest(plan)||Date.now()>=g.expires)fail('PAN519_CONTENT_BOUND_AUTHORITY_REQUIRED_DENIED');if(!token(transportId))fail('PAN519_TRANSPORT_TOKEN_DENIED');
 const lease=acquireLocalJournalOwner(join(root,'pan453-owned-v2'));let db;
 try{db=openNative(root,'target',false);return transaction(db,()=>{const b=binding(db,root);validPlan(plan,root,b);const history=events(db,b),prior=history.find(e=>e.businessKey===plan.businessKey);
  if(prior){if(prior.document.sourceDigest!==plan.document.sourceDigest)fail('PAN519_DOCUMENT_REPLAY_CONFLICT_DENIED');return {outcome:'RECONCILED_NO_DUPLICATE',receipt:prior,qualification:qualification()};}
  if(history.length>=128)fail('PAN519_HISTORY_BOUND_DENIED');const core={schemaVersion:'pansphaira.pan519/finance-event/v1',revision:history.length+1,bindingDigest:digest(b),previousReceiptDigest:history.at(-1)?.receiptDigest??null,businessKey:plan.businessKey,document:plan.document,handedOffAt:plan.handedOffAt,firstTransportId:transportId,kind:'HANDOFF',externalBookingProven:false};const receipt={...core,receiptDigest:digest(core)};
  db.prepare('INSERT INTO pan519_events VALUES(?,?,?)').run(core.revision,core.businessKey,canonicalJson(receipt));if(events(db,b).at(-1)?.receiptDigest!==receipt.receiptDigest)fail('PAN519_HANDOFF_TARGET_READBACK_DENIED');return {outcome:'HANDOFF_PERSISTED',receipt,qualification:qualification(),authority:authority()};
 });}finally{db?.close();lease.release();}
}
// Only an explicitly selected local synthetic endpoint is admitted here. No real
// FiBu selection, generic URL, redirect, credential, payment or production capability.
export function capturePan519ContractDispatch({root,owner,endpoint,businessKey}){
 if(owner!==OWNER)fail('PAN519_LOCAL_SYNTHETIC_OWNER_REQUIRED_DENIED');const match=typeof endpoint==='string'&&endpoint.match(/^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})\/pan519-contract-v1$/);
 if(!match||Number(match[1])>65535||typeof businessKey!=='string'||!/^[0-9a-f]{64}$/.test(businessKey))fail('PAN519_LOCAL_CONTRACT_ENDPOINT_BINDING_DENIED');
 const lease=acquireLocalJournalOwner(join(root,'pan453-owned-v2'));let db;
 try{db=openNative(root,'target',false);return transaction(db,()=>{const b=binding(db,root),doc=events(db,b).find(e=>e.businessKey===businessKey);if(!doc)fail('PAN519_HANDED_OFF_DOCUMENT_REQUIRED_DENIED');fences(root,b,businessKey);
  const prior=db.prepare('SELECT record FROM pan519_dispatches WHERE business_key=?').get(businessKey);
  if(prior){const v=JSON.parse(prior.record),{intentDigest,...core}=v;if(v.businessKey!==businessKey||v.bindingDigest!==digest(b)||v.documentSourceDigest!==doc.document.sourceDigest||v.endpoint!==endpoint||intentDigest!==digest(core))fail('PAN519_DISPATCH_BINDING_DRIFT_DENIED');return {firstAttempt:false,intent:v,document:doc.document,handedOffAt:doc.handedOffAt,qualification:qualification()};}
  const core={schemaVersion:'pansphaira.pan519/contract-dispatch-intent/v1',bindingDigest:digest(b),businessKey,documentSourceDigest:doc.document.sourceDigest,endpoint,firstIntentAtMs:Date.now(),state:'UNKNOWN_TARGET_OUTCOME',proofClass:'LOCAL_SYNTHETIC_CONTRACT_ONLY'},intent={...core,intentDigest:digest(core)};
  db.prepare('INSERT INTO pan519_dispatches VALUES(?,?)').run(businessKey,canonicalJson(intent));if(db.prepare('SELECT record FROM pan519_dispatches WHERE business_key=?').get(businessKey).record!==canonicalJson(intent))fail('PAN519_DISPATCH_FENCE_READBACK_DENIED');return {firstAttempt:true,intent,document:doc.document,handedOffAt:doc.handedOffAt,qualification:qualification()};
 });}finally{db?.close();lease.release();}
}
function amount(v,signed=false){if(!Number.isSafeInteger(v)||Object.is(v,-0)||Math.abs(v)>1_000_000_000_000||!signed&&v<0)fail('PAN519_EXACT_MINOR_UNITS_DENIED');return v;}
function sum(values){const n=values.reduce((a,v)=>a+BigInt(amount(v,true)),0n);if(n>BigInt(Number.MAX_SAFE_INTEGER)||n<BigInt(Number.MIN_SAFE_INTEGER))fail('PAN519_MINOR_SUM_OVERFLOW_DENIED');return Number(n);}
function validateReadback(v,doc,b){
 if(!exact(v,['schemaVersion','proofClass','observationId','tenantId','entityId','currency','businessKey','documentSourceDigest','booking','payments','observedAt'])||v.schemaVersion!=='pansphaira.pan519/contract-readback/v1'||v.proofClass!=='LOCAL_SYNTHETIC_CONTRACT_ONLY'||!token(v.observationId))fail('PAN519_CONTRACT_READBACK_SHAPE_DENIED');
 if(v.tenantId!==b.tenantId||v.entityId!==b.entityId||v.currency!==b.currency||v.businessKey!==doc.businessKey||v.documentSourceDigest!==doc.document.sourceDigest)fail('PAN519_READBACK_COMPOSITE_BINDING_DENIED');
 const observed=timestamp(v.observedAt),booking=v.booking,p=v.payments;
 if(!exact(booking,['state','reference','bookedAt'])||!['POSTED','NOT_POSTED','UNKNOWN'].includes(booking.state))fail('PAN519_BOOKING_READBACK_SHAPE_DENIED');
 if(booking.state==='POSTED'){if(!token(booking.reference)||timestamp(booking.bookedAt)>observed||timestamp(booking.bookedAt)<timestamp(doc.handedOffAt))fail('PAN519_BOOKING_REFERENCE_REQUIRED_DENIED');}
 else if(booking.reference!==null||booking.bookedAt!==null)fail('PAN519_UNKNOWN_NOT_BOOKED_REFERENCE_DENIED');
 if(!exact(p,['complete','coverageThrough','allocations','differences'])||typeof p.complete!=='boolean'||timestamp(p.coverageThrough)>observed)fail('PAN519_PAYMENT_COVERAGE_REQUIRED_DENIED');
 if(!p.complete){if(p.allocations!==null||p.differences!==null)fail('PAN519_UNKNOWN_PAYMENT_READBACK_SHAPE_DENIED');return;}
 if(booking.state!=='POSTED'||!Array.isArray(p.allocations)||!Array.isArray(p.differences)||p.allocations.length>32||p.differences.length>32)fail('PAN519_COMPLETE_PAYMENT_READBACK_REQUIRED_DENIED');
 const ids=new Set();
 for(const a of p.allocations){if(!exact(a,['id','documentId','amountMinor','confirmedAt'])||!token(a.id)||ids.has(a.id)||a.documentId!==null&&a.documentId!==doc.document.documentId||timestamp(a.confirmedAt)>observed)fail('PAN519_PAYMENT_ALLOCATION_BINDING_DENIED');ids.add(a.id);amount(a.amountMinor);}
 for(const d of p.differences){if(!exact(d,['id','amountMinor','confirmedAt'])||!token(d.id)||ids.has(d.id)||timestamp(d.confirmedAt)>observed)fail('PAN519_PAYMENT_DIFFERENCE_BINDING_DENIED');ids.add(d.id);amount(d.amountMinor,true);}
}
function observations(db,b,history){
 const rows=db.prepare('SELECT revision,observation_key,business_key,record FROM pan519_observations ORDER BY revision LIMIT 129').all();if(rows.length>128)fail('PAN519_READBACK_HISTORY_BOUND_DENIED');let previous=null;
 return rows.map((r,i)=>{const e=JSON.parse(r.record),{observationDigest,...core}=e,doc=history.find(d=>d.businessKey===r.business_key);
  if(!doc||r.revision!==i+1||e.revision!==r.revision||r.observation_key!==e.readback?.observationId||r.business_key!==e.readback?.businessKey||e.bindingDigest!==digest(b)||e.previousObservationDigest!==previous||observationDigest!==digest(core))fail('PAN519_OBSERVATION_HISTORY_READBACK_DENIED');
  validateReadback(e.readback,doc,b);previous=observationDigest;return e;
 });
}
export function recordPan519ContractReadback({root,owner,readback}){
 readback=snapshotData(readback);if(owner!==OWNER)fail('PAN519_LOCAL_SYNTHETIC_OWNER_REQUIRED_DENIED');const lease=acquireLocalJournalOwner(join(root,'pan453-owned-v2'));let db;
 try{db=openNative(root,'target',false);return transaction(db,()=>{const b=binding(db,root),history=events(db,b),doc=history.find(d=>d.businessKey===readback?.businessKey);if(!doc)fail('PAN519_HANDED_OFF_DOCUMENT_REQUIRED_DENIED');
  validateReadback(readback,doc,b);fences(root,b,doc.businessKey);const prior=observations(db,b,history),same=prior.find(e=>e.readback.observationId===readback.observationId);
  if(same){if(canonicalJson(same.readback)!==canonicalJson(readback))fail('PAN519_READBACK_REPLAY_CONFLICT_DENIED');return {outcome:'RECONCILED_SAME_READBACK',receipt:same,qualification:qualification()};}
  const latest=prior.filter(e=>e.readback.businessKey===doc.businessKey).at(-1);if(latest&&timestamp(readback.observedAt)<timestamp(latest.readback.observedAt))fail('PAN519_STALE_READBACK_OBSERVATION_DENIED');if(prior.length>=128)fail('PAN519_READBACK_HISTORY_BOUND_DENIED');
  const core={schemaVersion:'pansphaira.pan519/contract-observation/v1',revision:prior.length+1,bindingDigest:digest(b),previousObservationDigest:prior.at(-1)?.observationDigest??null,readback};const receipt={...core,observationDigest:digest(core)};
  db.prepare('INSERT INTO pan519_observations VALUES(?,?,?,?)').run(core.revision,readback.observationId,doc.businessKey,canonicalJson(receipt));if(observations(db,b,history).at(-1)?.observationDigest!==receipt.observationDigest)fail('PAN519_OBSERVATION_PERSISTED_READBACK_DENIED');return {outcome:'CONTRACT_READBACK_RECORDED',receipt,qualification:qualification(),authority:authority()};
 });}finally{db?.close();lease.release();}
}
function projectDocument(e,observation,cutoff){
 const base={...e.document,businessKey:e.businessKey,handoffReceiptDigest:e.receiptDigest,handedOffAt:e.handedOffAt,bookingState:'UNKNOWN',bookingReference:null,allocatedMinor:null,differenceMinor:null,unallocatedPaymentMinor:null,openMinor:null,paymentState:'UNKNOWN_ALLOCATION',excludedFuturePaymentIds:[],paymentOrder:null};
 if(!observation)return base;const v=observation.readback;
 if(v.booking.state==='UNKNOWN')return base;if(v.booking.state==='NOT_POSTED')return {...base,bookingState:'NOT_POSTED_LOCAL_CONTRACT'};
 if(timestamp(v.booking.bookedAt)>cutoff)return {...base,bookingState:'NOT_POSTED_AS_OF_LOCAL_CONTRACT'};
 base.bookingState='POSTED_LOCAL_CONTRACT';base.bookingReference=v.booking.reference;
 if(!v.payments.complete||timestamp(v.payments.coverageThrough)<cutoff)return base;
 const admitted=v.payments.allocations.filter(p=>timestamp(p.confirmedAt)<=cutoff),differences=v.payments.differences.filter(d=>timestamp(d.confirmedAt)<=cutoff);
 const allocatedMinor=sum(admitted.filter(p=>p.documentId!==null).map(p=>p.amountMinor)),differenceMinor=sum(differences.map(d=>d.amountMinor)),unallocatedPaymentMinor=sum(admitted.filter(p=>p.documentId===null).map(p=>p.amountMinor));
 const openMinor=sum([e.document.amountMinor,allocatedMinor===0?0:-allocatedMinor,differenceMinor===0?0:-differenceMinor]),paymentState=unallocatedPaymentMinor?'UNALLOCATED_PAYMENT_REQUIRES_REVIEW':differenceMinor?'DIFFERENCE_REQUIRES_REVIEW':openMinor<0?'OVERPAID_REQUIRES_REVIEW':openMinor===0?'PAID':allocatedMinor>0?'PARTIALLY_PAID':'OPEN';
 return {...base,allocatedMinor,differenceMinor,unallocatedPaymentMinor,openMinor,paymentState,excludedFuturePaymentIds:v.payments.allocations.filter(p=>timestamp(p.confirmedAt)>cutoff).map(p=>p.id)};
}
export function readPan519Finance({root,asOf}){
 const cutoff=timestamp(asOf),db=openNative(root,'target');try{db.exec('BEGIN');const b=binding(db,root),allHistory=events(db,b),history=allHistory.filter(e=>timestamp(e.handedOffAt)<=cutoff),reads=observations(db,b,allHistory);
  const documents=history.map(e=>projectDocument(e,reads.filter(r=>r.readback.businessKey===e.businessKey).at(-1),cutoff)),reconciliation={};
  for(const kind of ['AR','AP']){const rows=documents.filter(d=>d.kind===kind),posted=rows.filter(d=>d.bookingState==='POSTED_LOCAL_CONTRACT'),known=posted.filter(d=>d.openMinor!==null),unknown=rows.filter(d=>d.openMinor===null),complete=unknown.length===0;
   const handedOffMinor=sum(rows.map(d=>d.amountMinor)),postedMinor=sum(posted.map(d=>d.amountMinor));
   const allocatedMinor=complete?sum(known.map(d=>d.allocatedMinor)):null,differenceMinor=complete?sum(known.map(d=>d.differenceMinor)):null,openMinor=complete?sum(known.map(d=>d.openMinor)):null,unallocatedPaymentMinor=complete?sum(known.map(d=>d.unallocatedPaymentMinor)):null;
   reconciliation[kind]={handedOffMinor,postedMinor,allocatedMinor,differenceMinor,openMinor,unknownDocumentMinor:sum(unknown.map(d=>d.amountMinor)),unallocatedPaymentMinor,balanced:complete?postedMinor===sum([allocatedMinor,differenceMinor,openMinor]):null};
  }
  return {schemaVersion:'pansphaira.pan519/finance-readback/v1',leadingStore:'PAN472_TARGET_SQLITE',asOf,documents,reconciliation,qualification:qualification(),authority:authority(),readOnly:true};
 }finally{db.close();}
}
