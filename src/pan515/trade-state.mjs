// P01 additive native leading trade ledger in the already-qualified draft target.
// Local synthetic code-owner seam only: no caller role, production or network authority.
import {join} from 'node:path';
import {acquireLocalJournalOwner} from '../../demo/runtime/local-journal-owner.mjs';
import {diagnosePan473WriterScope} from '../pan473/independent-scope-diagnosis.mjs';
import {scopeProfile,openNative,openScope,readMeta,guardsMatch,TARGET_GUARDS,transaction,canonicalJson,digest,fail,exact} from '../pan473/scope-profile.mjs';
import {readLocalJournalControl} from '../../demo/runtime/local-journal-owner.mjs';
import {bestandslageBerechnenV1,bestandAenderungAnwendenV1} from '../../dist/packages/contracts/src/bestand-nachschub-v1.js';
import commonReference from '../../contracts/trade/common-trade-01-v1.json' with {type:'json'};
import {PAN517_COMMAND_V1,validatePan517Command,advancePan517State,isRealTradeInstant,pan517EventEvidence} from '../pan517/fulfilment-state.mjs';
import {readPan517DeliveryMilestones} from '../pan517/delivery-milestones.mjs';
export const PAN515_PROFILE_V1='pansphaira.pan515/common-trade/v1';
const GUARDS=['pan515_binding','pan515_events','pan515_control'].flatMap(table=>['UPDATE','DELETE'].map(action=>({
  name:`${table}_${action.toLowerCase()}_immutable`,
  sql:`CREATE TRIGGER ${table}_${action.toLowerCase()}_immutable BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT,'PAN515_HISTORY_IMMUTABLE_DENIED'); END`,
})));
function current(root,db){
  const {marker,profile}=scopeProfile(root);readMeta(db,marker);
  const gate=db.prepare('SELECT * FROM pan473_gate WHERE id=1').get();
  const control=openScope(root);
  try{
    const route=control.prepare('SELECT * FROM routing WHERE id=1').get();
    if(!gate||gate.mode!=='ACTIVE'||gate.routed!==1||route.destination!=='TARGET'||route.epoch!==gate.epoch||route.acked!==1||!guardsMatch(db,TARGET_GUARDS))fail('PAN515_CURRENT_NATIVE_OWNER_REQUIRED_DENIED');
  }finally{control.close();}
  const row=id=>{
    const r=db.prepare('SELECT kind,revision,deleted,body FROM objects WHERE id=?').get(id);
    if(!r||r.deleted)fail('PAN515_NATIVE_REFERENCE_REQUIRED_DENIED');
    return {...r,body:JSON.parse(r.body)};
  };
  const partner=row('synthetic:customer-7'),order=row('synthetic:order-42'),line=row('synthetic:line-1');
  if(partner.kind!=='customer'||order.kind!=='order'||line.kind!=='line'||order.body.customerId!=='synthetic:customer-7'||line.body.orderId!=='synthetic:order-42'||order.body.currency!=='EUR')fail('PAN515_NATIVE_RELATION_DENIED');
  if(line.body.unit!=='piece'||!Number.isSafeInteger(line.body.quantityMicros)||line.body.quantityMicros<=0||line.body.quantityMicros%1000000!==0)fail('PAN515_EXPLICIT_INTEGER_PIECE_MAPPING_REQUIRED_DENIED');
  const base=db.prepare('SELECT record FROM pan473_baseline WHERE id=?').get('synthetic:line-1');
  if(!base)fail('PAN515_NATIVE_REFERENCE_REQUIRED_DENIED');
  let preceding=JSON.parse(base.record),quantityRevision=preceding.revision;
  for(const row of db.prepare('SELECT event FROM pan473_target_events ORDER BY ordinal LIMIT 65').all()){
    const event=JSON.parse(row.event);if(event.record.id!=="synthetic:line-1")continue;
    if(event.record.body?.quantityMicros!==preceding.body?.quantityMicros)quantityRevision=event.record.revision;
    preceding=event.record;
  }
  return {marker,profile,gate,partner,order,line,quantityRevision};
}
function bindingFor(s,caseId='PAN515-LEGACY-DRAFT-06'){
  if(!['PAN515-LEGACY-DRAFT-06','COMMON-TRADE-01'].includes(caseId))fail('PAN515_CASE_PROFILE_DENIED');
  const common=caseId==='COMMON-TRADE-01';
  if(s.line.body.quantityMicros!==(common?10000000:6000000))fail('PAN515_NATIVE_CASE_QUANTITY_BINDING_DENIED');
  return {schemaVersion:PAN515_PROFILE_V1,caseId,scope:'LOCAL_SYNTHETIC_DISPOSABLE',leadingStore:'PAN472_TARGET_SQLITE',sourceProfileDigest:digest(s.marker),scopeDigest:s.profile.scopeDigest,targetEpoch:s.gate.epoch,
    orderId:common?'SO-01':'synthetic:order-42',lineId:common?'1':'synthetic:line-1',partnerId:'synthetic:customer-7',articleId:common?'ARTICLE-A':'SYN-ART-001',warehouseId:common?'WH-01':'LAGER-01',unit:'STK',unitMapping:'piece-integer-micros-to-STK-exact/v1',orderQuantity:s.line.body.quantityMicros/1000000,
    nativeDateMapping:{nativeDateSeconds:s.order.body.date,canonicalAcceptedAt:common?commonReference.sales_order.accepted_at:null,nativeDateIsBusinessAcceptance:false,businessEventTimeOwner:'PAN515_NATIVE_EVENT_EFFECTIVE_AT'},
    nativeQuantityRevision:s.quantityRevision,commonReferenceRevision:common?commonReference.revision:null,commonReferenceDigest:common?digest(commonReference):null,
    nativeIdentityMapping:{nativeOrderId:'synthetic:order-42',nativeLineId:'synthetic:line-1',nativePartnerId:'synthetic:customer-7',stockArticleId:'SYN-ART-001',stockWarehouseId:'LAGER-01',canonicalOrderId:common?'SO-01':'synthetic:order-42',canonicalLineId:common?'1':'synthetic:line-1',canonicalItemId:common?'ARTICLE-A':'SYN-ART-001',canonicalWarehouseId:common?'WH-01':'LAGER-01',sourceId:common?'SYN-COMMON':'SYN-LEGACY-06',tenantId:common?'SYN-TENANT-01':'tenant:synthetic-pan472',entityId:common?'SYN-ENTITY-01':'SYN-LEGACY-ENTITY'},
    nativeEvidenceDigest:digest({partner:s.partner,order:s.order,line:s.line}),owners:{order:'PAN473_NATIVE_DRAFT',partner:'PAN472_NATIVE_IDENTITY',article:'PAN515_CLOSED_PROFILE',warehouse:'PAN515_CLOSED_PROFILE',quantity:'PAN515_NATIVE_EVENTS'}};
}
function store(db,root){
  if(!guardsMatch(db,GUARDS))fail('PAN515_STORE_GUARDS_REQUIRED_DENIED');
  const b=db.prepare('SELECT binding FROM pan515_binding WHERE id=1').get();
  if(!b)fail('PAN515_NATIVE_TRADE_BINDING_REQUIRED_DENIED');
  const binding=JSON.parse(b.binding),s=current(root,db),expected=bindingFor(s,binding.caseId);
  for(const key of Object.keys(expected).filter(k=>k!=='nativeEvidenceDigest'))if(canonicalJson(binding[key])!==canonicalJson(expected[key]))fail('PAN515_NATIVE_BINDING_DRIFT_DENIED');
  return binding;
}
export function initializePan515TradeState({root,owner,caseId='PAN515-LEGACY-DRAFT-06'}){
  if(owner!=='LOCAL_SYNTHETIC_OWNER')fail('PAN515_LOCAL_SYNTHETIC_OWNER_REQUIRED_DENIED');
  const d=diagnosePan473WriterScope({root});if(d.outcome!=='ACTIVE'||!d.complete)fail('PAN515_CURRENT_NATIVE_OWNER_REQUIRED_DENIED');
  const lease=acquireLocalJournalOwner(join(root,'pan453-owned-v2')),db=openNative(root,'target',false);
  try{return transaction(db,()=>{
    const found=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('pan515_binding','pan515_events','pan515_control')").all();
    if(found.length)fail('PAN515_EXISTING_LEDGER_ADOPTION_DENIED');
    const binding=bindingFor(current(root,db),caseId);
    db.exec('CREATE TABLE pan515_binding(id INTEGER PRIMARY KEY CHECK(id=1),binding TEXT NOT NULL); CREATE TABLE pan515_events(revision INTEGER PRIMARY KEY,effect_key TEXT UNIQUE NOT NULL,command TEXT NOT NULL,event TEXT NOT NULL); CREATE TABLE pan515_control(id INTEGER PRIMARY KEY CHECK(id=1),record TEXT NOT NULL);');
    db.prepare('INSERT INTO pan515_binding VALUES(1,?)').run(canonicalJson(binding));
    for(const g of GUARDS)db.exec(g.sql);
    return {outcome:'INITIALIZED',binding};
  });}finally{db.close();lease.release();}
}
const COMMAND_KEYS=['schemaVersion','effectId','transportId','expectedRevision','orderId','lineId','articleId','warehouseId','unit','kind','quantity','referenceId','effectiveAt','reason'];
const grants=new WeakMap();
const token=v=>typeof v==='string'&&/^(?:synthetic:[a-z0-9-]{3,64}|[A-Z]{2,8}-[0-9]{2})$/.test(v);
function semantic(c){const {transportId,...content}=c;return content;}
function validate(c,b){
  if(c?.schemaVersion===PAN517_COMMAND_V1){validatePan517Command(c,b);return;}
  const extras=c?.kind==='RECEIPT'&&b.caseId==='COMMON-TRADE-01'?['sourceLineId']:c?.kind==='SHIP'?['reservationEventId']:c?.kind==='RETURN'?['disposition','creditRef']:[];
  if(!exact(c,[...COMMAND_KEYS,...extras])||c.schemaVersion!=='pansphaira.pan515/trade-command/v1'||!token(c.effectId)||!token(c.transportId)||!Number.isSafeInteger(c.expectedRevision)||c.expectedRevision<0||!Number.isSafeInteger(c.quantity)||c.quantity<(c.kind==='COUNT_ADJUSTMENT'?0:1)||c.quantity>1000000||typeof c.reason!=='string'||c.reason.length<1||c.reason.length>120||/[\x00-\x1f]/.test(c.reason))fail('PAN515_COMMAND_SHAPE_DENIED');
  if(c.orderId!==b.orderId||c.lineId!==b.lineId||c.articleId!==b.articleId||c.warehouseId!==b.warehouseId)fail('PAN515_COMPOSITE_NATIVE_IDENTITY_DENIED');
  if(c.unit!==b.unit)fail('PAN515_UNIT_CHANGE_DENIED');
  if(!['RECEIPT','RESERVE','SHIP','RETURN','CORRECT_RECEIPT','COUNT_ADJUSTMENT'].includes(c.kind))fail('PAN515_TRANSITION_OR_REFERENCE_DENIED');
  if(c.kind==='RECEIPT'){
    if(b.caseId==='COMMON-TRADE-01'?(c.referenceId!==commonReference.purchase_order.id||c.sourceLineId!==commonReference.purchase_order.line_id):c.referenceId!==null)fail('PAN515_RECEIPT_SOURCE_GRAIN_DENIED');
  }else if(c.kind==='RESERVE'?c.referenceId!==null:!token(c.referenceId))fail('PAN515_TRANSITION_OR_REFERENCE_DENIED');
  if(c.kind==='SHIP'&&(!token(c.reservationEventId)||c.reservationEventId===c.effectId))fail('PAN515_TRANSITION_OR_REFERENCE_DENIED');
  if(c.kind==='RETURN'&&(c.disposition!=='QUARANTINE'||!token(c.creditRef)))fail('PAN515_RETURN_DISPOSITION_OR_SOURCE_REF_DENIED');
  if(!isRealTradeInstant(c.effectiveAt))fail('PAN515_EFFECTIVE_DATE_DENIED');
}
function empty(b){
  const init=bestandslageBerechnenV1([{artikelId:b.nativeIdentityMapping.stockArticleId,lagerortId:b.nativeIdentityMapping.stockWarehouseId,einheit:'STK',physisch:0,reserviert:0,herkunft:null}]);
  if(init.outcome!=='LAGE')fail('PAN515_STOCK_BASE_DENIED');
  return {revision:0,quantities:{physical:0,reserved:0,blocked:0,available:0,shipped:0,returned:0},lots:[],reservations:[],shipments:[],events:[],stock:init.lage,appliedStockIds:[]};
}
function advance(before,c,b){
  validate(c,b);
  if(before.fulfilment&&c.schemaVersion!==PAN517_COMMAND_V1&&['SHIP','RETURN'].includes(c.kind))fail('PAN517_LEGACY_SHIP_RETURN_BYPASS_DENIED');
  if(before.events.some(e=>e.reservationChange?.id===c.effectId))fail('PAN515_RESERVATION_CHANGE_ID_REUSED_DENIED');
  if(c.expectedRevision!==before.revision)fail('PAN515_STALE_REVISION_DENIED');
  if(before.events.length&&Date.parse(c.effectiveAt)<Date.parse(before.events.at(-1).effectiveAt))fail('PAN515_BACKDATED_OVERWRITE_DENIED');
  const next=c.schemaVersion===PAN517_COMMAND_V1?advancePan517State(before,c,b):JSON.parse(canonicalJson(before));
  const move=(art,quantity,part=0)=>{
    if(!quantity)return;
    const date=new Date(c.effectiveAt).toISOString().replace('.000Z','Z');
    const change={schemaVersion:'cm.fachprofil/bestand-aenderung/v1',aenderungsId:'aenderung:bestand-'+digest(c.effectId).slice(0,40)+'-'+part,artikelId:b.nativeIdentityMapping.stockArticleId,lagerortId:b.nativeIdentityMapping.stockWarehouseId,einheit:'STK',art,menge:quantity,zeitstempel:date,beleg:c.kind==='COUNT_ADJUSTMENT'?null:{belegId:'pan515:'+digest({bindingDigest:digest(b),sourceEventId:c.effectId}).slice(0,40),belegArt:['RECEIPT','CORRECT_RECEIPT'].includes(c.kind)?'WARENEINGANG':'KUNDENAUFTRAG',quelle:'pan515-native',zeitstempel:date}};
    const moved=bestandAenderungAnwendenV1(next.stock,change,next.appliedStockIds);
    if(moved.outcome!=='GEAENDERT')fail('PAN515_RELEASED_STOCK_CONTRACT_DENIED:'+moved.code);
    next.stock=moved.lage.lage;next.appliedStockIds=moved.lage.appliedAenderungsIds;
  };
  if(c.kind==='RECEIPT'){
    next.lots.push({id:c.effectId,received:c.quantity,physical:c.quantity,reserved:0,blocked:0});move('EINKUNFT',c.quantity);
  }else if(c.kind==='RESERVE'){
    if(c.quantity>before.quantities.available)fail('PAN515_RESERVATION_EXCEEDS_USABLE_STOCK_DENIED');
    if(c.quantity>b.orderQuantity-before.quantities.reserved-before.quantities.shipped+before.quantities.returned)fail('PAN515_ORDER_RESERVATION_BOUND_DENIED');
    let remaining=c.quantity;const allocations=[];
    for(const lot of next.lots){const take=Math.min(remaining,lot.physical-lot.reserved-lot.blocked);if(take){lot.reserved+=take;allocations.push({lotId:lot.id,quantity:take});remaining-=take;}if(!remaining)break;}
    if(remaining)fail('PAN515_RESERVATION_EXCEEDS_USABLE_STOCK_DENIED');
    next.reservations.push({id:c.effectId,orderId:b.orderId,lineId:b.lineId,remaining:c.quantity,allocations});move('RESERVIERUNG',c.quantity);
  }else if(['SHIP','ISSUE'].includes(c.kind)){
    const reservation=next.reservations.find(r=>r.id===(c.kind==='ISSUE'?c.reservationId:c.referenceId));
    if(!reservation||c.quantity>reservation.remaining)fail('PAN515_SHIPMENT_RESERVATION_REQUIRED_DENIED');
    if(before.events.some(e=>e.effectId===c.reservationEventId||e.reservationChange?.id===c.reservationEventId))fail('PAN515_RESERVATION_CHANGE_ID_REUSED_DENIED');
    let remaining=c.quantity;const allocations=[];
    for(const a of reservation.allocations){const take=Math.min(remaining,a.quantity);if(take){const lot=next.lots.find(l=>l.id===a.lotId);lot.reserved-=take;lot.physical-=take;a.quantity-=take;allocations.push({lotId:a.lotId,quantity:take,returned:0});remaining-=take;}if(!remaining)break;}
    if(remaining)fail('PAN515_SHIPMENT_ALLOCATION_REQUIRED_DENIED');
    reservation.remaining-=c.quantity;next.shipments.push({id:c.effectId,reservationId:reservation.id,quantity:c.quantity,returned:0,allocations});
    next.quantities.shipped+=c.quantity;move('RESERVIERUNG_AUFLUESEN',c.quantity,0);move('VERAUSGABE',c.quantity,1);
  }else if(['RETURN','RETURN_RECEIPT'].includes(c.kind)){
    const shipment=next.shipments.find(s=>s.id===c.referenceId);
    if(!shipment||c.quantity>shipment.quantity-shipment.returned)fail('PAN515_RETURN_EXCEEDS_ACTUAL_SHIPMENT_DENIED');
    let remaining=c.quantity;const returnedAllocations=[];
    for(const a of shipment.allocations){const take=Math.min(remaining,a.quantity-a.returned);if(take){const lot=next.lots.find(l=>l.id===a.lotId);lot.physical+=take;lot.blocked+=take;a.returned+=take;returnedAllocations.push({lotId:a.lotId,remainingBlocked:take});remaining-=take;}if(!remaining)break;}
    if(remaining)fail('PAN515_RETURN_SHIPMENT_ALLOCATION_REQUIRED_DENIED');
    shipment.returned+=c.quantity;next.quantities.returned+=c.quantity;move('EINKUNFT',c.quantity,0);move('RESERVIERUNG',c.quantity,1);
    if(c.kind==='RETURN_RECEIPT')next.fulfilment.returns.at(-1).allocations=returnedAllocations;
  }else if(c.kind==='RETURN_DECISION'&&c.decision.disposition==='RELEASE'){
    const r=next.fulfilment.returns.find(r=>r.id===c.referenceId);let remaining=c.quantity;
    for(const a of r.allocations){const take=Math.min(remaining,a.remainingBlocked);if(take){const lot=next.lots.find(l=>l.id===a.lotId);if(!lot||lot.blocked<take)fail('PAN517_RETURN_ALLOCATION_RELEASE_DENIED');lot.blocked-=take;a.remainingBlocked-=take;remaining-=take;}if(!remaining)break;}
    if(remaining)fail('PAN517_RETURN_ALLOCATION_RELEASE_DENIED');r.remainingQuarantined-=c.quantity;move('RESERVIERUNG_AUFLUESEN',c.quantity);
  }else if(c.schemaVersion!==PAN517_COMMAND_V1){
    const lot=next.lots.find(l=>l.id===c.referenceId);
    if(!lot||!before.events.some(e=>e.effectId===c.referenceId&&e.kind==='RECEIPT'))fail('PAN515_ORIGINAL_RECEIPT_REQUIRED_DENIED');
    const delta=c.quantity-(c.kind==='CORRECT_RECEIPT'?lot.received:lot.physical);
    if(!delta)fail('PAN515_NO_CHANGE_NOT_CORRECTION_DENIED');
    if(lot.physical+delta<lot.reserved+lot.blocked)fail('PAN515_CORRECTION_WOULD_OVERWRITE_LATER_VALID_WORK_DENIED');
    if(c.kind==='CORRECT_RECEIPT')lot.received=c.quantity;lot.physical+=delta;move(delta>0?'EINKUNFT':'VERAUSGABE',Math.abs(delta));
  }
  next.revision++;
  for(const key of ['physical','reserved','blocked'])next.quantities[key]=next.lots.reduce((sum,lot)=>sum+lot[key],0);
  next.quantities.available=next.quantities.physical-next.quantities.reserved-next.quantities.blocked;
  const position=next.stock.positions[0];
  if(position.physisch!==next.quantities.physical||position.reserviert!==next.quantities.reserved+next.quantities.blocked)fail('PAN515_DISTINCT_ALLOCATION_STOCK_PARITY_DENIED');
  return next;
}
function core(before,next,c,b,recordedAtMs){
  return {schemaVersion:'pansphaira.pan515/trade-event/v1',bindingDigest:digest(b),effectId:c.effectId,movementId:c.effectId,stockEvidenceId:'pan515:'+digest({bindingDigest:digest(b),sourceEventId:c.effectId}).slice(0,40),commandDigest:digest(semantic(c)),firstTransportId:c.transportId,orderId:b.orderId,lineId:b.lineId,articleId:b.articleId,warehouseId:b.warehouseId,unit:b.unit,kind:c.kind,quantity:c.quantity,referenceId:c.referenceId,sourceLineId:c.sourceLineId??null,disposition:c.disposition??null,creditRef:c.creditRef??null,reservationChange:['SHIP','ISSUE'].includes(c.kind)?{id:c.reservationEventId,delta:-c.quantity,causeShipment:c.effectId,orderId:b.orderId,lineId:b.lineId}:null,effectiveAt:c.effectiveAt,reason:c.reason,movementDelta:next.quantities.physical-before.quantities.physical,correctionOf:c.kind==='CORRECT_RECEIPT'?before.events.find(e=>e.effectId===c.referenceId)?.eventDigest??null:null,beforeRevision:before.revision,revision:next.revision,beforeQuantities:before.quantities,afterQuantities:next.quantities,previousEventDigest:before.events.at(-1)?.eventDigest??null,recordedAtMs,...(c.schemaVersion===PAN517_COMMAND_V1?{fulfilmentEvidence:pan517EventEvidence(next,c)}:{})};
}
function project(db,b,asOf=null){
  const rows=db.prepare('SELECT revision,effect_key,command,event FROM pan515_events ORDER BY revision LIMIT 129').all();
  if(rows.length>128)fail('PAN515_HISTORY_BOUND_DENIED');
  let state=empty(b);
  for(const row of rows){
    const c=JSON.parse(row.command),event=JSON.parse(row.event);
    if(asOf!==null&&Date.parse(c.effectiveAt)>Date.parse(asOf))break;
    const next=advance(state,c,b);
    if(row.revision!==next.revision||row.effect_key!==c.effectId||!Number.isSafeInteger(event.recordedAtMs)||event.recordedAtMs<0)fail('PAN515_NATIVE_HISTORY_BINDING_DENIED');
    const expected=core(state,next,c,b,event.recordedAtMs);
    if(canonicalJson(event)!==canonicalJson({...expected,eventDigest:digest(expected)}))fail('PAN515_NATIVE_EVENT_READBACK_DENIED');
    next.events.push(event);state=next;
  }
  return state;
}
function mode(db,b){
  const row=db.prepare('SELECT record FROM pan515_control WHERE id=1').get();if(!row)return {mode:'ENABLED'};
  const r=JSON.parse(row.record);if(!exact(r,['mode','bindingDigest','atMs','reason'])||r.mode!=='DISABLED_RETAINED'||r.bindingDigest!==digest(b)||!Number.isSafeInteger(r.atMs)||r.atMs<0||typeof r.reason!=='string'||!r.reason.length||r.reason.length>120)fail('PAN515_CONTROL_BINDING_REQUIRED_DENIED');
  return r;
}
function writable(db,b){if(mode(db,b).mode!=='ENABLED')fail('PAN515_TRANSITIONS_DISABLED_RETAINED_DENIED');}
export function deactivatePan515TradeTransitions({root,owner,reason}){
  if(owner!=='LOCAL_SYNTHETIC_OWNER'||typeof reason!=='string'||!reason.length||reason.length>120||/[\x00-\x1f]/.test(reason))fail('PAN515_LOCAL_SYNTHETIC_OWNER_AND_REASON_REQUIRED_DENIED');
  const d=diagnosePan473WriterScope({root});if(d.outcome!=='ACTIVE'||!d.complete)fail('PAN515_CURRENT_NATIVE_OWNER_REQUIRED_DENIED');
  const lease=acquireLocalJournalOwner(join(root,'pan453-owned-v2'));let db;
  try{db=openNative(root,'target',false);return transaction(db,()=>{
    const b=store(db,root),old=mode(db,b);if(old.mode==='DISABLED_RETAINED')return {outcome:'TRANSITIONS_DISABLED_RETAINED',receipt:old};
    const receipt={mode:'DISABLED_RETAINED',bindingDigest:digest(b),atMs:Date.now(),reason};
    db.prepare('INSERT INTO pan515_control VALUES(1,?)').run(canonicalJson(receipt));
    if(canonicalJson(mode(db,b))!==canonicalJson(receipt))fail('PAN515_CONTROL_READBACK_DENIED');return {outcome:'TRANSITIONS_DISABLED_RETAINED',receipt};
  });}finally{db?.close();lease.release();}
}
function controls(root,b,effectId){
  const {marker}=scopeProfile(root),key='admin-ai:poc:pan515:'+digest({bindingDigest:digest(b),effectId});
  for(const j of [join(root,'pan453-owned-v2'),join(root,'pan473-controller','pan453-owned-v2')])for(const fence of Object.values(readLocalJournalControl(j).fences)){
    if(fence.kind==='STOP'&&fence.sourceIdentity===marker.sourceIdentity&&fence.targetIdentity===marker.targetIdentity||fence.kind==='REVOKE'&&fence.operationKey===key)fail('PAN515_STOP_OR_REVOKE_DENIED');
  }
}
export function authorizePan515TradeCommand({root,command,owner}){
  if(owner!=='LOCAL_SYNTHETIC_OWNER')fail('PAN515_LOCAL_SYNTHETIC_OWNER_REQUIRED_DENIED');
  const d=diagnosePan473WriterScope({root});if(d.outcome!=='ACTIVE'||!d.complete)fail('PAN515_CURRENT_NATIVE_OWNER_REQUIRED_DENIED');
  const db=openNative(root,'target');
  try{const b=store(db,root);writable(db,b);validate(command,b);controls(root,b,command.effectId);const g=Object.freeze({});grants.set(g,{root,bindingDigest:digest(b),commandDigest:digest(semantic(command)),expires:Date.now()+30000});return g;}finally{db.close();}
}
export function executePan515TradeCommand({root,command,grant}){
  const g=grants.get(grant);
  if(!g||g.root!==root||g.commandDigest!==digest(semantic(command))||Date.now()>=g.expires)fail('PAN515_CONTENT_BOUND_AUTHORITY_REQUIRED_DENIED');
  const lease=acquireLocalJournalOwner(join(root,'pan453-owned-v2'));let db;
  try{
    db=openNative(root,'target',false);
    return transaction(db,()=>{
      const b=store(db,root);if(digest(b)!==g.bindingDigest)fail('PAN515_NATIVE_BINDING_DRIFT_DENIED');writable(db,b);validate(command,b);controls(root,b,command.effectId);
      const before=project(db,b),old=db.prepare('SELECT command,event FROM pan515_events WHERE effect_key=?').get(command.effectId);
      if(old){if(digest(semantic(JSON.parse(old.command)))!==g.commandDigest)fail('PAN515_EFFECT_CONTENT_CONFLICT_DENIED');return {outcome:'RECONCILED_NO_DUPLICATE',receipt:JSON.parse(old.event)};}
      if(before.revision>=128)fail('PAN515_HISTORY_BOUND_DENIED');
      const next=advance(before,command,b),eventCore=core(before,next,command,b,Date.now()),receipt={...eventCore,eventDigest:digest(eventCore)};
      db.prepare('INSERT INTO pan515_events VALUES(?,?,?,?)').run(receipt.revision,command.effectId,canonicalJson(command),canonicalJson(receipt));
      const observed=project(db,b);if(observed.revision!==receipt.revision||canonicalJson(observed.quantities)!==canonicalJson(next.quantities))fail('PAN515_NATIVE_EVENT_READBACK_DENIED');
      return {outcome:'COMMITTED',receipt};
    });
  }finally{db?.close();lease.release();}
}
export function readPan515TradeState({root,asOf=null}){
  if(asOf!==null&&!isRealTradeInstant(asOf))fail('PAN515_CUTOFF_DATE_DENIED');
  const db=openNative(root,'target');
  try{db.exec('BEGIN');const binding=store(db,root),latest=project(db,binding),state=asOf===null?latest:project(db,binding,asOf);return {binding,...state,...(state.fulfilment?{deliveryMilestones:readPan517DeliveryMilestones(state,binding,asOf)}:{}),writeMode:mode(db,binding).mode,asOf,latestRevision:latest.revision,coverage:'COMPLETE_OWNED_EVENT_LEDGER_ONLY',readOnly:true};}finally{db.close();}
}
