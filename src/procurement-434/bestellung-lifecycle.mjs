// Bounded P02 purchase lifecycle in the already-qualified native leading target.
// This local synthetic owner seam is not productive dispatch or payment authority.
import {join} from 'node:path';
import {acquireLocalJournalOwner,readLocalJournalControl} from '../../demo/runtime/local-journal-owner.mjs';
import {diagnosePan473WriterScope} from '../pan473/independent-scope-diagnosis.mjs';
import {openNative,transaction,canonicalJson,digest,exact,fail,guardsMatch,scopeProfile} from '../pan473/scope-profile.mjs';
import {readPan515TradeState} from '../pan515/trade-state.mjs';
import {bestellungsentwurfBildenV1,wareneingangLedgerBildenV1,wareneingangErfassenV1,mengenzustandV1} from '../../dist/packages/contracts/src/beschaffung-wareneingang-v1.js';

const OWNER='LOCAL_SYNTHETIC_OWNER';
const SCHEMA='pansphaira.pan516/procurement-command/v1';
const GUARDS=['pan516_binding','pan516_events','pan516_target_orders'].flatMap(table=>['UPDATE','DELETE'].map(action=>({name:table+'_'+action.toLowerCase()+'_immutable',sql:`CREATE TRIGGER ${table}_${action.toLowerCase()}_immutable BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT,'PAN516_HISTORY_IMMUTABLE_DENIED'); END`})));
const grants=new WeakMap();
const token=v=>typeof v==='string'&&/^synthetic:[a-z0-9-]{3,64}$/.test(v);
const semantic=c=>{const {transportId,...value}=c;return value;};
function native(root){const s=readPan515TradeState({root});return {tradeBindingDigest:digest(s.binding),sourceProfileDigest:s.binding.sourceProfileDigest,targetEpoch:s.binding.targetEpoch};}
function qualified(root){const d=diagnosePan473WriterScope({root});if(d.outcome!=='ACTIVE'||!d.complete)fail('PAN516_CURRENT_NATIVE_OWNER_REQUIRED_DENIED');return native(root);}
function termsValid(t,draft){
  if(!exact(t,['unitPriceMinor','currency','unit','promisedAt'])||!Number.isSafeInteger(t.unitPriceMinor)||t.unitPriceMinor<0||t.unitPriceMinor>1000000000||t.currency!==draft.positionen[0].waehrung||t.unit!==draft.positionen[0].einheit||typeof t.promisedAt!=='string'||!Number.isFinite(Date.parse(t.promisedAt)))fail('PAN516_PROPOSED_TERMS_DENIED');
}
function binding(db,root){
  if(!guardsMatch(db,GUARDS))fail('PAN516_HISTORY_GUARDS_REQUIRED_DENIED');
  const row=db.prepare('SELECT record FROM pan516_binding WHERE id=1').get();if(!row)fail('PAN516_LEADING_BINDING_REQUIRED_DENIED');
  const b=JSON.parse(row.record),now=native(root);for(const key of Object.keys(now))if(b[key]!==now[key])fail('PAN516_LEADING_BINDING_DRIFT_DENIED');
  const rebuilt=bestellungsentwurfBildenV1(b.purchase);if(rebuilt.outcome!=='ENTWURF'||canonicalJson(rebuilt.entwurf)!==canonicalJson(b.draft))fail('PAN516_PURCHASE_DRAFT_BINDING_DENIED');termsValid(b.proposedTerms,b.draft);return b;
}
export function initializePan516Procurement({root,owner,purchase,terms}){
  if(owner!==OWNER)fail('PAN516_LOCAL_SYNTHETIC_OWNER_REQUIRED_DENIED');
  const profile=qualified(root),built=bestellungsentwurfBildenV1(purchase);if(built.outcome!=='ENTWURF'||built.entwurf.positionen.length!==1)fail('PAN516_CLOSED_SINGLE_POSITION_PURCHASE_REQUIRED_DENIED');
  termsValid(terms,built.entwurf);const lease=acquireLocalJournalOwner(join(root,'pan453-owned-v2'));let db;
  try{db=openNative(root,'target',false);return transaction(db,()=>{
    if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('pan516_binding','pan516_events','pan516_target_orders')").all().length)fail('PAN516_EXISTING_LIFECYCLE_ADOPTION_DENIED');
    const record={schemaVersion:'pansphaira.pan516/native-purchase/v1',scope:'LOCAL_SYNTHETIC_DISPOSABLE',leadingStore:'PAN472_TARGET_SQLITE',...profile,purchase,draft:built.entwurf,proposedTerms:terms};
    db.exec('CREATE TABLE pan516_binding(id INTEGER PRIMARY KEY CHECK(id=1),record TEXT NOT NULL);CREATE TABLE pan516_events(revision INTEGER PRIMARY KEY,effect_key TEXT UNIQUE NOT NULL,command TEXT NOT NULL,event TEXT NOT NULL);CREATE TABLE pan516_target_orders(order_key TEXT PRIMARY KEY,record TEXT NOT NULL);');
    db.prepare('INSERT INTO pan516_binding VALUES(1,?)').run(canonicalJson(record));for(const guard of GUARDS)db.exec(guard.sql);
    return {outcome:'PROCUREMENT_INITIALIZED',binding:record};
  });}finally{db?.close();lease.release();}
}
function validate(c,b){
  if(!exact(c,['schemaVersion','effectId','transportId','expectedRevision','orderId','positionId','supplierId','kind','receipt','sourceReference',...(c?.kind==='CONFIRM'?['confirmation']:[])])||c.schemaVersion!==SCHEMA||!token(c.effectId)||!token(c.transportId)||!token(c.sourceReference)||!Number.isSafeInteger(c.expectedRevision)||c.expectedRevision<0)fail('PAN516_COMMAND_SHAPE_DENIED');
  if(c.orderId!==b.draft.bestellungId||c.positionId!==b.draft.positionen[0].positionId)fail('PAN516_COMPOSITE_ORDER_POSITION_DENIED');
  if(c.supplierId!==b.draft.lieferantId)fail('PAN516_SUPPLIER_BINDING_DENIED');
  if(!['APPROVE','ACCEPT_RECEIPT','CONFIRM','TRANSMIT'].includes(c.kind))fail('PAN516_TRANSITION_KIND_DENIED');
  if(['APPROVE','TRANSMIT'].includes(c.kind)){if(c.receipt!==null)fail('PAN516_APPROVAL_OR_TRANSMISSION_SHAPE_DENIED');}
  else if(c.kind==='CONFIRM'){
    const v=c.confirmation,t=v?.terms;
    if(c.receipt!==null||!exact(v,['revision','previousConfirmationDigest','terms','confirmedAt'])||!Number.isSafeInteger(v.revision)||v.revision<1||v.revision>128||v.previousConfirmationDigest!==null&&(typeof v.previousConfirmationDigest!=='string'||!/^([0-9a-f]{64})$/.test(v.previousConfirmationDigest))||typeof v.confirmedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v.confirmedAt)||!Number.isFinite(Date.parse(v.confirmedAt))||!exact(t,['unitPriceMinor','currency','unit','promisedAt'])||!Number.isSafeInteger(t.unitPriceMinor)||t.unitPriceMinor<0||t.unitPriceMinor>1000000000||typeof t.currency!=='string'||!/^([A-Z]{3})$/.test(t.currency)||typeof t.unit!=='string'||!/^([A-Z]{1,4})$/.test(t.unit)||typeof t.promisedAt!=='string'||!Number.isFinite(Date.parse(t.promisedAt)))fail('PAN516_CONFIRMATION_SHAPE_DENIED');
  }
  else if(!exact(c.receipt,['id','quantity','unit','acceptedAt'])||typeof c.receipt.id!=='string'||!/^wareneingang:[a-z0-9-]{3,64}$/.test(c.receipt.id)||!Number.isSafeInteger(c.receipt.quantity)||c.receipt.quantity<1||c.receipt.quantity>1000000||typeof c.receipt.acceptedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(c.receipt.acceptedAt)||!Number.isFinite(Date.parse(c.receipt.acceptedAt)))fail('PAN516_RECEIPT_SHAPE_DENIED');
}
function empty(b){
  const opened=wareneingangLedgerBildenV1(b.draft,b.draft.positionen[0].positionId);if(opened.outcome!=='LEDGER')fail('PAN516_EXISTING_RECEIPT_CONTRACT_DENIED');
  return {phase:'DRAFT',revision:0,transmissionState:'NOT_RECORDED',transmissions:[],confirmations:[],effectiveDraft:b.draft,acceptedQuantity:0,remainingQuantity:b.draft.positionen[0].bestellteMenge,remainingQuantityHistory:[{revision:0,sourceReference:null,remainingQuantity:b.draft.positionen[0].bestellteMenge}],receiptLedger:opened.ledger,events:[]};
}
function advance(before,c,b){
  validate(c,b);if(c.expectedRevision!==before.revision)fail('PAN516_STALE_REVISION_DENIED');const next=JSON.parse(canonicalJson(before));
  if(c.kind==='APPROVE'){if(before.phase!=='DRAFT')fail('PAN516_ALREADY_APPROVED_DENIED');next.phase='APPROVED';next.approval={effectId:c.effectId,sourceReference:c.sourceReference,terms:b.proposedTerms};}
  else if(c.kind==='TRANSMIT'){
    if(!['APPROVED','CONFIRMED'].includes(before.phase))fail('PAN516_APPROVED_UNSENT_ORDER_REQUIRED_DENIED');
    if(before.confirmations.length&&canonicalJson(before.confirmations.at(-1).terms)!==canonicalJson(before.approval.terms))fail('PAN516_UNAPPROVED_CONFIRMATION_DISPATCH_DENIED');
    next.transmissions.push({effectId:c.effectId,sourceReference:c.sourceReference,orderDigest:digest(targetPayload(b,before)),channel:'LOCAL_SYNTHETIC_SQLITE',externalDeliveryProven:false});next.transmissionState='LOCAL_TARGET_PERSISTED_EXTERNAL_UNPROVEN';next.phase='TRANSMITTED';
  }
  else if(c.kind==='CONFIRM'){
    if(before.phase==='DRAFT')fail('PAN516_APPROVED_ORDER_REQUIRED_DENIED');
    const v=c.confirmation,last=before.confirmations.at(-1);
    if(v.revision!==(last?.revision??0)+1||v.previousConfirmationDigest!==(last?.confirmationDigest??null)||last&&Date.parse(v.confirmedAt)<Date.parse(last.confirmedAt))fail('PAN516_CONFIRMATION_REVISION_CHAIN_DENIED');
    const old=before.effectiveDraft.positionen[0];
    if(before.acceptedQuantity&&(v.terms.unit!==old.einheit||v.terms.currency!==old.waehrung))fail('PAN516_EXISTING_RECEIPT_DIMENSION_CHANGE_DENIED');
    const built=bestellungsentwurfBildenV1({...b.purchase,positionen:b.purchase.positionen.map(p=>({...p,einheit:v.terms.unit,waehrung:v.terms.currency}))});if(built.outcome!=='ENTWURF')fail('PAN516_CONFIRMED_PURCHASE_DIMENSION_DENIED');next.effectiveDraft=built.entwurf;
    if(!before.acceptedQuantity)next.receiptLedger=wareneingangLedgerBildenV1(next.effectiveDraft,c.positionId).ledger;
    const record={...v,sourceReference:c.sourceReference,supplierId:c.supplierId,orderId:c.orderId,positionId:c.positionId,sourceAuthority:'LOCAL_SYNTHETIC_OWNER_RECORD_NOT_EXTERNAL_ATTESTATION'};
    next.confirmations.push({...record,confirmationDigest:digest(record)});next.phase='CONFIRMED';
  }
  else{
    if(!['APPROVED','CONFIRMED','TRANSMITTED'].includes(before.phase))fail('PAN516_APPROVED_ORDER_REQUIRED_DENIED');
    const r=c.receipt;const result=wareneingangErfassenV1(before.effectiveDraft,before.receiptLedger,{eingangsId:r.id,bestellungId:c.orderId,positionId:c.positionId,einheit:r.unit,menge:r.quantity,zeitstempel:r.acceptedAt,korrekturVon:null});
    if(result.outcome!=='WARENEINGANG_ERFASST')fail('PAN516_RECEIPT_CONTRACT_DENIED:'+result.code);
    next.receiptLedger=result.ledger;const read=mengenzustandV1(next.effectiveDraft,next.receiptLedger);next.acceptedQuantity=read.angenommeneMenge;next.remainingQuantity=read.bestellteMenge-read.angenommeneMenge;
    next.remainingQuantityHistory.push({revision:before.revision+1,sourceReference:c.sourceReference,receiptId:r.id,remainingQuantity:next.remainingQuantity});
  }
  next.revision++;return next;
}
function targetPayload(b,state){if(!state.approval)fail('PAN516_APPROVED_ORDER_REQUIRED_DENIED');return {schemaVersion:'pansphaira.pan516/local-synthetic-transmission-target/v1',bindingDigest:digest(b),targetEpoch:b.targetEpoch,orderId:b.draft.bestellungId,supplierId:b.draft.lieferantId,position:b.draft.positionen[0],approvedTerms:state.approval.terms,approvalEffectId:state.approval.effectId,channel:'LOCAL_SYNTHETIC_SQLITE',productiveDispatchAuthorized:false};}
function observeTarget(db,b,state){
  const expected=targetPayload(b,state),key=digest({bindingDigest:digest(b),orderId:b.draft.bestellungId}),row=db.prepare('SELECT record FROM pan516_target_orders WHERE order_key=?').get(key);
  if(!row){if(state.transmissions.length)fail('PAN516_TARGET_STATE_UNKNOWN_NO_REDISPATCH_DENIED');return {outcome:'EXACT_TARGET_NOT_APPLIED',key,payload:expected,readBeforeAnyNewOrderEffect:true,newOrderEffect:false};}
  const record=JSON.parse(row.record),{recordDigest,...core}=record;
  if(!exact(core,['payload','firstEffectId','firstTransportId','recordedAtMs'])||!token(core.firstEffectId)||!token(core.firstTransportId)||!Number.isSafeInteger(core.recordedAtMs)||core.recordedAtMs<0||recordDigest!==digest(core)||canonicalJson(core.payload)!==canonicalJson(expected)||!state.transmissions.some(t=>t.effectId===core.firstEffectId&&t.orderDigest===digest(expected)))fail('PAN516_TARGET_STATE_UNKNOWN_NO_REDISPATCH_DENIED');
  return {outcome:'EXACT_TARGET_ALREADY_APPLIED',key,recordDigest,firstEffectId:core.firstEffectId,readBeforeAnyNewOrderEffect:true,newOrderEffect:false};
}
function eventCore(before,next,c,b,atMs){return {schemaVersion:'pansphaira.pan516/purchase-event/v1',bindingDigest:digest(b),revision:next.revision,kind:c.kind,effectId:c.effectId,commandDigest:digest(semantic(c)),firstTransportId:c.transportId,sourceReference:c.sourceReference,previousEventDigest:before.events.at(-1)?.eventDigest??null,acceptedQuantity:next.acceptedQuantity,remainingQuantity:next.remainingQuantity,recordedAtMs:atMs};}
function project(db,b){
  const rows=db.prepare('SELECT revision,effect_key,command,event FROM pan516_events ORDER BY revision LIMIT 129').all();if(rows.length>128)fail('PAN516_HISTORY_BOUND_DENIED');let state=empty(b);
  for(const row of rows){const c=JSON.parse(row.command),e=JSON.parse(row.event),next=advance(state,c,b);if(row.revision!==next.revision||row.effect_key!==c.effectId||!Number.isSafeInteger(e.recordedAtMs)||e.recordedAtMs<0)fail('PAN516_NATIVE_HISTORY_BINDING_DENIED');const expected=eventCore(state,next,c,b,e.recordedAtMs);if(canonicalJson(e)!==canonicalJson({...expected,eventDigest:digest(expected)}))fail('PAN516_EVENT_READBACK_DENIED');next.events.push(e);state=next;}return state;
}
function fences(root,b,effectId){
  const {marker}=scopeProfile(root),key='admin-ai:poc:pan516:'+digest({bindingDigest:digest(b),effectId});
  for(const journal of [join(root,'pan453-owned-v2'),join(root,'pan473-controller','pan453-owned-v2')])for(const fence of Object.values(readLocalJournalControl(journal).fences))if(fence.kind==='STOP'&&fence.sourceIdentity===marker.sourceIdentity&&fence.targetIdentity===marker.targetIdentity||fence.kind==='REVOKE'&&fence.operationKey===key)fail('PAN516_STOP_OR_REVOKE_DENIED');
}
export function authorizePan516ProcurementCommand({root,owner,command}){
  if(owner!==OWNER)fail('PAN516_LOCAL_SYNTHETIC_OWNER_REQUIRED_DENIED');qualified(root);const db=openNative(root,'target');
  try{const b=binding(db,root);validate(command,b);fences(root,b,command.effectId);const grant=Object.freeze({});grants.set(grant,{root,bindingDigest:digest(b),commandDigest:digest(semantic(command)),expires:Date.now()+30000});return grant;}finally{db.close();}
}
export function executePan516ProcurementCommand({root,command,grant}){
  const g=grants.get(grant);if(!g||g.root!==root||g.commandDigest!==digest(semantic(command))||Date.now()>=g.expires)fail('PAN516_CONTENT_BOUND_AUTHORITY_REQUIRED_DENIED');
  const lease=acquireLocalJournalOwner(join(root,'pan453-owned-v2'));let db;
  try{db=openNative(root,'target',false);return transaction(db,()=>{
    const b=binding(db,root);if(digest(b)!==g.bindingDigest)fail('PAN516_LEADING_BINDING_DRIFT_DENIED');validate(command,b);fences(root,b,command.effectId);
    const before=project(db,b),old=db.prepare('SELECT command,event FROM pan516_events WHERE effect_key=?').get(command.effectId);
    let targetObservation=null;
    if(command.kind==='TRANSMIT'){
      targetObservation=observeTarget(db,b,before);
      if(targetObservation.outcome==='EXACT_TARGET_ALREADY_APPLIED'){
        if(old&&digest(semantic(JSON.parse(old.command)))!==g.commandDigest)fail('PAN516_EFFECT_CONTENT_CONFLICT_DENIED');
        const receipt=before.events.find(e=>e.effectId===targetObservation.firstEffectId&&e.kind==='TRANSMIT');if(!receipt)fail('PAN516_TARGET_STATE_UNKNOWN_NO_REDISPATCH_DENIED');
        return {outcome:old?'RECONCILED_NO_DUPLICATE':'RECONCILED_EXISTING_BUSINESS_ORDER_NO_DUPLICATE',receipt,targetObservation};
      }
    }
    if(old){if(digest(semantic(JSON.parse(old.command)))!==g.commandDigest)fail('PAN516_EFFECT_CONTENT_CONFLICT_DENIED');return {outcome:'RECONCILED_NO_DUPLICATE',receipt:JSON.parse(old.event)};}
    if(before.revision>=128)fail('PAN516_HISTORY_BOUND_DENIED');const next=advance(before,command,b),core=eventCore(before,next,command,b,Date.now()),event={...core,eventDigest:digest(core)};
    if(command.kind==='TRANSMIT'){const core={payload:targetObservation.payload,firstEffectId:command.effectId,firstTransportId:command.transportId,recordedAtMs:event.recordedAtMs};const record={...core,recordDigest:digest(core)};db.prepare('INSERT INTO pan516_target_orders VALUES(?,?)').run(targetObservation.key,canonicalJson(record));targetObservation={...observeTarget(db,b,next),newOrderEffect:true};}
    db.prepare('INSERT INTO pan516_events VALUES(?,?,?,?)').run(next.revision,command.effectId,canonicalJson(command),canonicalJson(event));const observed=project(db,b);if(observed.revision!==next.revision||observed.acceptedQuantity!==next.acceptedQuantity||observed.remainingQuantity!==next.remainingQuantity)fail('PAN516_NATIVE_EFFECT_READBACK_DENIED');
    return {outcome:'COMMITTED',receipt:event,...(targetObservation?{targetObservation}:{})};
  });}finally{db?.close();lease.release();}
}
export function readPan516Procurement({root}){
  const db=openNative(root,'target');try{db.exec('BEGIN');const b=binding(db,root),state=project(db,b);return {...state,binding:b,leadingStore:b.leadingStore,readOnly:true,authority:{productiveDispatchAuthorized:false,paymentOrderAuthorized:false,externalChannelSelected:false}};}finally{db.close();}
}
