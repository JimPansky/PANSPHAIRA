// Composed original MIG-03 entry over the accepted bounded PAN472 stores.
// Only code-owned LOCAL_SYNTHETIC grants; trusted-host DDL is not sandboxed.
import { randomUUID } from 'node:crypto';
import { existsSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { acquireLocalJournalOwner,recordLocalJournalTaskIdentity,readLocalJournalControl } from '../../demo/runtime/local-journal-owner.mjs';
import {capturePan472TransferPlan,authorizePan472Transfer,executePan472DraftTransfer} from '../pan472/persistent-draft-transfer.mjs';
import {reconcilePan472DraftTransfer} from '../pan472/independent-draft-reconciliation.mjs';
import {diagnosePan473WriterScope} from './independent-scope-diagnosis.mjs';
import {
 PAN473_PROFILE_V1,PAN473_PLAN_V1,PAN473_EVENT_V1,capabilities,profileCore,scopeProfile,openScope,
 canonicalJson,digest,exact,integer,readMarker,openNative,readMeta,decodeRow,validateRecord,references,fail,
 transaction,metadata,storeMetadata,SOURCE_GUARDS,TARGET_GUARDS,guardsMatch,processBirth,leaseState,alternative,PAN472_LIMITS_V1,
} from './scope-profile.mjs';
const grants=new WeakMap();
const journal=root=>join(root,'pan473-controller','pan453-owned-v2');
const GATE_SCHEMA=`CREATE TABLE pan473_gate(id INTEGER PRIMARY KEY CHECK(id=1),scope_digest TEXT NOT NULL,mode TEXT NOT NULL,epoch INTEGER NOT NULL,cutoff INTEGER,cutoff_digest TEXT,plan_digest TEXT,routed INTEGER NOT NULL);`;
const nativeRows=db=>db.prepare('SELECT id,kind,revision,deleted,body,sequence FROM objects ORDER BY id LIMIT ?').all(PAN472_LIMITS_V1.objects+1).map(decodeRow);
function controls(root,operationKey){
 const {marker:m}=scopeProfile(root);
 for(const path of [join(root,'pan453-owned-v2'),journal(root)])for(const f of Object.values(readLocalJournalControl(path).fences))
  if(f.kind==='STOP'&&f.sourceIdentity===m.sourceIdentity&&f.targetIdentity===m.targetIdentity||f.kind==='REVOKE'&&f.operationKey===operationKey)fail('PAN473_STOP_OR_REVOKE_DENIED');
}
function bindTask(root,operationKey,handleDigest){
 const owner=acquireLocalJournalOwner(journal(root));try{recordLocalJournalTaskIdentity(journal(root),{operationKey,handleDigest,taskIdentityDigest:digest({operationKey}),boundAtMs:Date.now()});}finally{owner.release();}
}
export function initializePan473WriterScope({root,sourceCapability}){
 const marker=readMarker(root);if(!capabilities.includes(sourceCapability))fail('PAN473_SOURCE_CAPABILITY_PROFILE_DENIED');
 if(existsSync(join(root,'pan473-profile.json'))||existsSync(join(root,'pan473-scope.sqlite')))fail('PAN473_EXISTING_SCOPE_ADOPTION_DENIED');
 for(const which of ['source','target']){const db=openNative(root,which);try{readMeta(db,marker);}finally{db.close();}}
 const core=profileCore(marker,sourceCapability),profile={...core,scopeDigest:digest(core)};
 writeFileSync(join(root,'pan473-profile.json'),canonicalJson(profile)+'\n',{flag:'wx',mode:0o600,flush:true});
 const control=new DatabaseSync(join(root,'pan473-scope.sqlite'));
 try{
  control.exec('PRAGMA synchronous=FULL; CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE routing(id INTEGER PRIMARY KEY CHECK(id=1),scope_digest TEXT NOT NULL,destination TEXT NOT NULL,epoch INTEGER NOT NULL,acked INTEGER NOT NULL);');
  transaction(control,()=>{
   for(const [k,v] of [['profile',profile],['plan',null],['lease',null]])control.prepare('INSERT INTO meta VALUES(?,?)').run(k,canonicalJson(v));
   control.prepare('INSERT INTO routing VALUES(?,?,?,?,?)').run(1,profile.scopeDigest,'SOURCE',0,1);
  });
 }finally{control.close();}
 const owner=acquireLocalJournalOwner(journal(root));owner.release();
 if(sourceCapability==='NO_FENCE_GUARANTEE')return alternative();
 for(const which of ['source','target']){
  const db=openNative(root,which,false);try{transaction(db,()=>{
   db.exec(GATE_SCHEMA);db.prepare('INSERT INTO pan473_gate VALUES(?,?,?,?,?,?,?,?)').run(1,profile.scopeDigest,which==='source'?'ACTIVE':'INACTIVE',0,null,null,null,0);
   if(which==='source')for(const g of SOURCE_GUARDS)db.exec(g.sql);
   else db.exec('CREATE TABLE pan473_baseline(id TEXT PRIMARY KEY,record TEXT NOT NULL); CREATE TABLE pan473_target_events(ordinal INTEGER PRIMARY KEY,event TEXT NOT NULL);');
  });}finally{db.close();}
 }
 return {outcome:'PREPARED',scopeDigest:profile.scopeDigest,readOnly:false,sourceCapability,externalEffects:'DISABLED'};
}
function sourceAt(root){const {marker,profile}=scopeProfile(root),db=openNative(root,'source');try{readMeta(db,marker);const gate=db.prepare('SELECT * FROM pan473_gate WHERE id=1').get();const rows=nativeRows(db);return {profile,gate,rows,cutoff:Number(db.prepare('SELECT value FROM meta WHERE key=?').get('last-sequence')?.value)};}finally{db.close();}}
export function capturePan473CutoverPlan({root}){
 const {profile}=scopeProfile(root);if(profile.sourceCapability==='NO_FENCE_GUARANTEE')return alternative();
 const state=sourceAt(root);if(state.gate.mode!=='ACTIVE')fail('PAN473_SOURCE_ALREADY_FENCED_RECOVERY_REQUIRED');
 const target=openNative(root,'target');let kind;try{kind=metadata(target,'cursor')===null?'SNAPSHOT':'DELTA';}finally{target.close();}
 const captured=capturePan472TransferPlan({root,kind});
 if(!['PLANNED','NO_CHANGES'].includes(captured.outcome))fail('PAN473_SOURCE_OR_TARGET_UNQUALIFIED_DENIED');
 const core={schemaVersion:PAN473_PLAN_V1,scopeDigest:profile.scopeDigest,sourceCutoff:state.cutoff,sourceStateDigest:digest(state.rows),targetEpoch:1,transferPlan:captured.plan??null};
 const plan={...core,planDigest:digest(core)};
 return {outcome:'PLANNED',plan,coverage:'BOUNDED_NATIVE_SINGLE_SCOPE'};
}
function validatePlan(root,plan){
 if(!exact(plan,['schemaVersion','scopeDigest','sourceCutoff','sourceStateDigest','targetEpoch','transferPlan','planDigest']))fail('PAN473_PLAN_BINDING_DENIED');
 const {planDigest,...core}=plan,state=sourceAt(root);
 if(state.profile.sourceCapability!=='NATIVE_SQLITE_EPOCH_FENCE'||plan.schemaVersion!==PAN473_PLAN_V1||plan.scopeDigest!==state.profile.scopeDigest
  ||!integer(plan.sourceCutoff)||plan.sourceCutoff<1||plan.sourceCutoff>PAN472_LIMITS_V1.events||plan.targetEpoch!==1||digest(core)!==planDigest
  ||state.cutoff!==plan.sourceCutoff||digest(state.rows)!==plan.sourceStateDigest||!sourceGuardsMatch(root))fail('PAN473_PLAN_BINDING_DENIED');
 if(plan.transferPlan&&(plan.transferPlan.throughSequence!==plan.sourceCutoff||plan.transferPlan.expectedStateDigest!==plan.sourceStateDigest))fail('PAN473_PLAN_BINDING_DENIED');
 return state;
}
// Guard inspection gets its own read-only connection and closes it immediately.
function sourceGuardsMatch(root){const db=openNative(root,'source');try{return guardsMatch(db,SOURCE_GUARDS);}finally{db.close();}}
export function authorizePan473Scope({root,plan,owner}){
 if(owner!=='LOCAL_SYNTHETIC_OWNER')fail('PAN473_SYNTHETIC_OWNER_REQUIRED_DENIED');validatePlan(root,plan);
 const grant=Object.freeze({});grants.set(grant,{kind:'CUTOVER',root,planDigest:plan.planDigest,expires:Date.now()+30000});return grant;
}
function assertGrant(root,grant,kind,identity){const g=grants.get(grant);if(!g||g.root!==root||g.kind!==kind||Date.now()>=g.expires||(kind==='CUTOVER'?g.planDigest!==identity:g.epoch!==identity))fail('PAN473_CODE_OWNED_CURRENT_AUTHORITY_REQUIRED_DENIED');return g;}
function takeController(root,plan){
 const db=openScope(root,false);try{return transaction(db,()=>{
  const lease=metadata(db,'lease'),state=leaseState(lease);if(state==='LIVE'||state==='UNKNOWN')fail('PAN473_CONTROLLER_LIVE_OR_UNKNOWN_DENIED');
  const old=metadata(db,'plan');if(old&&canonicalJson(old)!==canonicalJson(plan))fail('PAN473_RETAINED_PLAN_CONFLICT_DENIED');
  const birth=processBirth(process.pid);if(birth.state!=='LIVE')fail('PAN473_CONTROLLER_IDENTITY_UNAVAILABLE_DENIED');
  const current={pid:process.pid,birth:birth.birth,token:randomUUID()};storeMetadata(db,'plan',plan);storeMetadata(db,'lease',current);return current;
 });}finally{db.close();}
}
function assertController(root,lease){const db=openScope(root);try{if(canonicalJson(metadata(db,'lease'))!==canonicalJson(lease))fail('PAN473_CONTROLLER_FENCED_DENIED');}finally{db.close();}}
function releaseController(root,lease){const db=openScope(root,false);try{transaction(db,()=>{if(canonicalJson(metadata(db,'lease'))!==canonicalJson(lease))fail('PAN473_CONTROLLER_FENCED_DENIED');storeMetadata(db,'lease',null);});}finally{db.close();}}
async function pause(phase,pauseAfter){
 if(phase!==pauseAfter)return;
 if(typeof process.send!=='function')fail('PAN473_OWNED_IPC_CRASH_PROBE_REQUIRED_DENIED');
 await new Promise(resolve=>{process.once('message',message=>{if(message==='CONTINUE')resolve();});process.send({schemaVersion:'pansphaira.pan473/crash-boundary/v1',phase,pid:process.pid});});
}
export async function executePan473Cutover({root,plan,grant,pauseAfter=null}){
 if(![null,'AFTER_SOURCE_FENCE','AFTER_TARGET_ACTIVATION','BEFORE_ROUTING_ACK'].includes(pauseAfter)||pauseAfter&&typeof process.send!=='function')fail('PAN473_FAULT_PROFILE_DENIED');
 assertGrant(root,grant,'CUTOVER',plan?.planDigest);validatePlan(root,plan);
 const op='admin-ai:poc:pan473-cutover:'+plan.planDigest;controls(root,op);bindTask(root,op,plan.planDigest);
 const lease=takeController(root,plan);
 try{
  assertController(root,lease);const source=openNative(root,'source',false);
  try{transaction(source,()=>{
   const g=source.prepare('SELECT * FROM pan473_gate WHERE id=1').get();
   if(g.scope_digest!==plan.scopeDigest||!['ACTIVE','FENCED'].includes(g.mode))fail('PAN473_SOURCE_GATE_DENIED');
   if(Number(source.prepare('SELECT value FROM meta WHERE key=?').get('last-sequence').value)!==plan.sourceCutoff||digest(nativeRows(source))!==plan.sourceStateDigest)fail('PAN473_FINAL_SOURCE_CUTOFF_CHANGED_DENIED');
   if(g.mode==='FENCED'){if(g.plan_digest!==plan.planDigest||g.cutoff!==plan.sourceCutoff||g.cutoff_digest!==plan.sourceStateDigest)fail('PAN473_SOURCE_FENCE_CONFLICT_DENIED');}
   else source.prepare('UPDATE pan473_gate SET mode=?,cutoff=?,cutoff_digest=?,plan_digest=? WHERE id=1').run('FENCED',plan.sourceCutoff,plan.sourceStateDigest,plan.planDigest);
  });}finally{source.close();}
  await pause('AFTER_SOURCE_FENCE',pauseAfter);assertController(root,lease);controls(root,op);
  const target=openNative(root,'target');let gate;try{gate=target.prepare('SELECT * FROM pan473_gate WHERE id=1').get();}finally{target.close();}
  if(gate.mode==='INACTIVE'){
   let observed=reconcilePan472DraftTransfer({root});
   if(!(observed.outcome==='VERIFIED'&&observed.throughSequence===plan.sourceCutoff)){
    if(!plan.transferPlan)fail('PAN473_FINAL_TRANSFER_PLAN_REQUIRED_DENIED');
    const imported=authorizePan472Transfer({root,plan:plan.transferPlan,owner:'LOCAL_SYNTHETIC_OWNER'});
    executePan472DraftTransfer({root,plan:plan.transferPlan,grant:imported});observed=reconcilePan472DraftTransfer({root});
   }
   if(observed.outcome!=='VERIFIED'||observed.sourceAhead||observed.throughSequence!==plan.sourceCutoff)fail('PAN473_FINAL_TARGET_RECONCILIATION_DENIED');
   assertController(root,lease);const db=openNative(root,'target',false);
   try{transaction(db,()=>{
    const current=db.prepare('SELECT * FROM pan473_gate WHERE id=1').get();if(current.mode!=='INACTIVE'||current.epoch!==0||current.scope_digest!==plan.scopeDigest)fail('PAN473_TARGET_ACTIVATION_CONFLICT_DENIED');
    const actual=nativeRows(db);if(digest(actual)!==plan.sourceStateDigest)fail('PAN473_FINAL_TARGET_RECONCILIATION_DENIED');
    for(const row of actual)db.prepare('INSERT INTO pan473_baseline VALUES(?,?)').run(row.id,canonicalJson(row));
    db.prepare('UPDATE pan473_gate SET mode=?,epoch=?,cutoff=?,cutoff_digest=?,plan_digest=? WHERE id=1').run('ACTIVE',plan.targetEpoch,plan.sourceCutoff,plan.sourceStateDigest,plan.planDigest);
    for(const guard of TARGET_GUARDS)db.exec(guard.sql);
   });}finally{db.close();}
  }else if(gate.mode!=='ACTIVE'||gate.epoch!==plan.targetEpoch||gate.plan_digest!==plan.planDigest)fail('PAN473_TARGET_ACTIVATION_CONFLICT_DENIED');
  await pause('AFTER_TARGET_ACTIVATION',pauseAfter);assertController(root,lease);controls(root,op);
  const observed=diagnosePan473WriterScope({root});if(observed.quarantine.length||observed.sourceCutoff!==plan.sourceCutoff||observed.targetEpoch!==plan.targetEpoch)fail('PAN473_OBSERVED_GATES_OR_DATA_DENIED');
  const route=openScope(root,false);try{transaction(route,()=>{
   const r=route.prepare('SELECT * FROM routing WHERE id=1').get();
   if(r.scope_digest!==plan.scopeDigest||!(r.destination==='SOURCE'&&r.epoch===0&&r.acked===1||r.destination==='TARGET'&&r.epoch===plan.targetEpoch&&[0,1].includes(r.acked)))fail('PAN473_ROUTING_CONFLICT_DENIED');
   if(r.destination==='SOURCE')route.prepare('UPDATE routing SET destination=?,epoch=?,acked=? WHERE id=1').run('TARGET',plan.targetEpoch,0);
  });}finally{route.close();}
  const active=openNative(root,'target',false);try{transaction(active,()=>{active.prepare('UPDATE pan473_gate SET routed=1 WHERE id=1 AND epoch=? AND plan_digest=?').run(plan.targetEpoch,plan.planDigest);});}finally{active.close();}
  await pause('BEFORE_ROUTING_ACK',pauseAfter);assertController(root,lease);controls(root,op);
  const ack=openScope(root,false);try{transaction(ack,()=>{
   const r=ack.prepare('SELECT * FROM routing WHERE id=1').get();if(r.destination!=='TARGET'||r.epoch!==plan.targetEpoch||r.scope_digest!==plan.scopeDigest)fail('PAN473_ROUTING_ACK_CONFLICT_DENIED');
   ack.prepare('UPDATE routing SET acked=1 WHERE id=1').run();
  });}finally{ack.close();}
  const final=diagnosePan473WriterScope({root});if(final.outcome!=='ACTIVE')fail('PAN473_FINAL_ROUTING_READBACK_DENIED');
  return {outcome:'ACTIVE',epoch:plan.targetEpoch,verification:final};
 }finally{releaseController(root,lease);}
}
export async function recoverPan473Cutover({root,owner}){
 if(owner!=='LOCAL_SYNTHETIC_OWNER')fail('PAN473_SYNTHETIC_OWNER_REQUIRED_DENIED');const {profile}=scopeProfile(root);if(profile.sourceCapability==='NO_FENCE_GUARANTEE')return alternative();
 const d=diagnosePan473WriterScope({root});if(d.quarantine.length||d.outcome==='UNKNOWN')fail('PAN473_RECOVERY_ACTUAL_GATES_REQUIRED_DENIED');
 const db=openScope(root);let plan,lease;try{plan=metadata(db,'plan');lease=metadata(db,'lease');}finally{db.close();}
 if(!plan)fail('PAN473_RETAINED_PLAN_REQUIRED_DENIED');if(['LIVE','UNKNOWN'].includes(leaseState(lease)))fail('PAN473_CONTROLLER_LIVE_OR_UNKNOWN_DENIED');
 const grant=authorizePan473Scope({root,plan,owner});return executePan473Cutover({root,plan,grant});
}
export function importPan473LateDraft({root,plan,owner}){
 if(owner!=='LOCAL_SYNTHETIC_OWNER')fail('PAN473_SYNTHETIC_OWNER_REQUIRED_DENIED');const {profile}=scopeProfile(root);if(profile.sourceCapability==='NO_FENCE_GUARANTEE')return alternative();
 const d=diagnosePan473WriterScope({root});if(d.targetEpoch!==0||d.routing!=='SOURCE'||d.outcome!=='PREPARED')fail('PAN473_STALE_LATE_IMPORT_DENIED');
 const grant=authorizePan472Transfer({root,plan,owner});return executePan472DraftTransfer({root,plan,grant});
}
function routeReady(root,epoch){const db=openScope(root);try{const r=db.prepare('SELECT * FROM routing WHERE id=1').get();return r.destination==='TARGET'&&r.epoch===epoch&&r.acked===1?1:0;}finally{db.close();}}
export function authorizePan473TargetWrite({root,epoch,owner}){
 if(owner!=='LOCAL_SYNTHETIC_OWNER')fail('PAN473_SYNTHETIC_OWNER_REQUIRED_DENIED');const d=diagnosePan473WriterScope({root});
 if(d.outcome!=='ACTIVE'||epoch!==d.targetEpoch||routeReady(root,epoch)!==1)fail('PAN473_CURRENT_TARGET_EPOCH_REQUIRED_DENIED');
 const grant=Object.freeze({});grants.set(grant,{kind:'TARGET',root,epoch,expires:Date.now()+30000});return grant;
}
function targetTransaction(root,epoch,grant,work){
 assertGrant(root,grant,'TARGET',epoch);const d=diagnosePan473WriterScope({root});if(d.outcome!=='ACTIVE'||d.targetEpoch!==epoch)fail('PAN473_CURRENT_TARGET_EPOCH_REQUIRED_DENIED');
 const db=openNative(root,'target',false);db.function('pan473_writer_epoch',()=>{assertGrant(root,grant,'TARGET',epoch);return epoch;});db.function('pan473_route_ready',()=>routeReady(root,epoch));
 try{return transaction(db,()=>{
  const gate=db.prepare('SELECT * FROM pan473_gate WHERE id=1').get();if(gate.mode!=='ACTIVE'||gate.epoch!==epoch||gate.routed!==1||!guardsMatch(db,TARGET_GUARDS)||routeReady(root,epoch)!==1)fail('PAN473_CURRENT_TARGET_EPOCH_REQUIRED_DENIED');
  const result=work(db,gate);const issues=references(nativeRows(db));if(issues.length)fail('PAN473_TARGET_REFERENCE_OR_SEMANTICS_DENIED');return result;
 });}finally{db.close();}
}
function appendTarget(db,gate,record,kind,correction=null){
 const old=db.prepare('SELECT id,kind,revision,deleted,body,sequence FROM objects WHERE id=?').get(record.id);const before=old?decodeRow(old):null;
 if(record.revision!==(before?.revision??0)+1||before?.deleted||before&&before.kind!==record.kind||record.deleted&&!before)fail('PAN473_STALE_REVISION_OR_RESURRECTION_DENIED');
 const ordinal=db.prepare('SELECT COUNT(*) AS n FROM pan473_target_events').get().n+1;
 if(ordinal+gate.cutoff>PAN472_LIMITS_V1.events)fail('PAN473_TARGET_HISTORY_BOUND_DENIED');
 const after={...record,sequence:gate.cutoff+ordinal};const core={schemaVersion:PAN473_EVENT_V1,scopeDigest:gate.scope_digest,epoch:gate.epoch,kind,ordinal,beforeDigest:digest(before),record:after,correction,atMs:Date.now()};
 const event={...core,eventDigest:digest(core)};
 db.prepare('INSERT INTO objects VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,revision=excluded.revision,deleted=excluded.deleted,body=excluded.body,sequence=excluded.sequence').run(record.id,record.kind,record.revision,record.deleted?1:0,record.body===null?null:canonicalJson(record.body),after.sequence);
 db.prepare('INSERT INTO pan473_target_events VALUES(?,?)').run(ordinal,canonicalJson(event));if(nativeRows(db).length>PAN472_LIMITS_V1.objects)fail('PAN473_TARGET_OBJECT_BOUND_DENIED');return event;
}
export function writePan473Target({root,epoch,grant,changes}){
 assertGrant(root,grant,'TARGET',epoch);
 if(!Array.isArray(changes)||changes.length<1||changes.length>PAN472_LIMITS_V1.objects||new Set(changes.map(x=>x.id)).size!==changes.length)fail('PAN473_TARGET_BATCH_BOUND_DENIED');for(const r of changes)validateRecord(r);
 const op='admin-ai:poc:pan473-target:'+digest({epoch,changes});controls(root,op);bindTask(root,op,digest(changes));
 return targetTransaction(root,epoch,grant,(db,gate)=>({outcome:'TARGET_WRITTEN',events:changes.map(r=>appendTarget(db,gate,r,'WRITE'))}));
}
export function correctPan473HistoricalField({root,epoch,grant,id,originalRevision,field,expectedOriginalValue,correctedValue}){
 assertGrant(root,grant,'TARGET',epoch);
 if(!['quantityMicros','priceMinor','amountMinor'].includes(field)||!integer(correctedValue))fail('PAN473_CORRECTION_FIELD_DENIED');
 const op='admin-ai:poc:pan473-correction:'+digest({id,originalRevision,field,expectedOriginalValue,correctedValue});controls(root,op);bindTask(root,op,digest({epoch,id,originalRevision,field,expectedOriginalValue,correctedValue}));
 return targetTransaction(root,epoch,grant,(db,gate)=>{
  const base=db.prepare('SELECT record FROM pan473_baseline WHERE id=?').get(id);const actual=db.prepare('SELECT id,kind,revision,deleted,body,sequence FROM objects WHERE id=?').get(id);
  if(!base||!actual)fail('PAN473_ORIGINAL_EVIDENCE_REQUIRED_DENIED');const original=JSON.parse(base.record),current=decodeRow(actual);
  if(original.revision!==originalRevision||original.deleted||original.body[field]!==expectedOriginalValue||!Object.hasOwn(original.body,field))fail('PAN473_ORIGINAL_EVIDENCE_REQUIRED_DENIED');
  if(current.deleted||current.body[field]!==expectedOriginalValue)fail('PAN473_LATER_VALID_FIELD_CONFLICT_DENIED');
  // Current equality is insufficient: valid A -> B -> A remains a later choice.
  // Walk actual immutable native events inside this target write transaction.
  let preceding=original;
  for(const retained of db.prepare('SELECT event FROM pan473_target_events ORDER BY ordinal LIMIT ?').all(PAN472_LIMITS_V1.events+1)){
   const event=JSON.parse(retained.event);if(event.record.id!==id)continue;
   if(preceding.body[field]!==event.record.body?.[field])fail('PAN473_LATER_VALID_FIELD_CONFLICT_DENIED');
   preceding=event.record;
  }
  const next={id,kind:current.kind,revision:current.revision+1,deleted:false,body:{...current.body,[field]:correctedValue}};validateRecord(next);
  const correction={id,originalRevision,field,expectedOriginalValue,correctedValue,originalDigest:digest(original)};
  return {outcome:'FORWARD_CORRECTED',event:appendTarget(db,gate,next,'FORWARD_CORRECTION',correction)};
 });
}
export function requestPan473OldStateRollback({root,owner}){
 if(owner!=='LOCAL_SYNTHETIC_OWNER')fail('PAN473_SYNTHETIC_OWNER_REQUIRED_DENIED');const d=diagnosePan473WriterScope({root});
 if(d.outcome==='UNKNOWN'||d.quarantine.length)fail('PAN473_ROLLBACK_ACTUAL_GATES_UNKNOWN_DENIED');
 if(d.targetEventCount>0)fail('PAN473_NEW_TARGET_WORK_PREVENTS_OLD_STATE_ROLLBACK');
 fail('PAN473_OLD_STATE_RESTORE_NOT_AUTOMATIC_FORWARD_OR_OFFLINE_ALTERNATIVE_REQUIRED');
}
