// LIFE-07: attributed durable intent, released forward correction, native readback.
// No old database rewind; LOCAL_SYNTHETIC owner is not human/host/organization PKI.
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {acquireLocalJournalOwner,recordLocalJournalTaskIdentity,readLocalJournalControl} from '../../demo/runtime/local-journal-owner.mjs';
import {authorizePan473TargetWrite,correctPan473HistoricalField} from '../pan473/writer-scope-cutover.mjs';
import {diagnosePan473WriterScope} from '../pan473/independent-scope-diagnosis.mjs';
import {transaction,leaseState,processBirth} from '../pan473/scope-profile.mjs';
import {diagnosePan467BusinessCorrection} from './independent-business-diagnosis.mjs';
import {PAN467_ACTOR,PAN467_LIMIT,GUARDS,REQUEST_KEYS,journal,binding,readStore,nativeEvidence,originalKey,effectContent,matchingEvents,receiptCore,openNative,canonicalJson,digest,exact,integer,fail} from './business-correction-profile.mjs';
const grants=new WeakMap();
function ready(root){const d=diagnosePan473WriterScope({root});if(d.outcome!=='ACTIVE'||!d.complete||d.outsideEffectCount!==0)fail('PAN467_CURRENT_NATIVE_RECOVERY_AND_COVERAGE_REQUIRED_DENIED');return d;}
export function describePan467OriginalEffect({root,id,originalRevision}){
 const d=ready(root),e=nativeEvidence(root,id,originalRevision);
 return {outcome:'ORIGINAL_EFFECT_OBSERVED',readOnly:true,originalEffectKey:originalKey(e),sourceGeneration:e.marker.sourceGeneration,epoch:d.targetEpoch,id,originalRevision,expectedOriginalValue:e.original.body.priceMinor,originalEvidenceDigest:digest(e.original)};
}
function validate(root,request){
 if(!exact(request,REQUEST_KEYS)||typeof request.requestId!=='string'||!/^synthetic:[a-z0-9-]{3,64}$/.test(request.requestId)
   ||!integer(request.originalRevision)||!integer(request.correctedValue)||request.correctedValue>1000000000
   ||!integer(request.expectedOriginalValue)||!integer(request.epoch)||typeof request.reason!=='string'||request.reason.length<1||request.reason.length>120||/[\x00-\x1f]/.test(request.reason))fail('PAN467_CORRECTION_REQUEST_SHAPE_DENIED');
 if(request.externalCoverage!=='LOCAL_DRAFT_ONLY')fail('PAN467_UNCOVERED_EXTERNAL_OUTCOME_DENIED');
 const d=ready(root),e=nativeEvidence(root,request.id,request.originalRevision);
 if(request.sourceGeneration!==e.marker.sourceGeneration)fail('PAN467_CONFLICTING_GENERATION_DENIED');
 if(request.epoch!==d.targetEpoch)fail('PAN467_CONFLICTING_TARGET_EPOCH_DENIED');
 if(request.originalEffectKey!==originalKey(e)||request.expectedOriginalValue!==e.original.body.priceMinor)fail('PAN467_ORIGINAL_EFFECT_BINDING_DENIED');
 if(request.correctedValue===request.expectedOriginalValue)fail('PAN467_NO_CHANGE_NOT_CORRECTION_DENIED');
 return {e,content:effectContent(request,e)};
}
function control(root,e,key){
 for(const path of [journal(root),join(root,'pan473-controller','pan453-owned-v2')])for(const f of Object.values(readLocalJournalControl(path).fences))
  if(f.kind==='STOP'&&f.sourceIdentity===e.marker.sourceIdentity&&f.targetIdentity===e.marker.targetIdentity||f.kind==='REVOKE'&&f.operationKey===key)fail('PAN467_STOP_OR_REVOKE_DENIED');
}
function rowFor(root,key){const db=openNative(root,'target');try{return readStore(db,root)?.records.find(r=>r.effect_key===key)??null;}finally{db.close();}}
function existing(row,content){
 if(!row)return null;
 const intent=JSON.parse(row.intent);
 if(intent.effectDigest!==digest(content)||canonicalJson(intent.content)!==canonicalJson(content))fail('PAN467_ORIGINAL_EFFECT_CONTENT_CONFLICT_DENIED');
 return intent;
}
export function authorizePan467BusinessCorrection({root,request,owner,actor}){
 if(owner!=='LOCAL_SYNTHETIC_OWNER'||actor!==PAN467_ACTOR)fail('PAN467_CODE_OWNED_SYNTHETIC_ACTOR_REQUIRED_DENIED');
 const {e,content}=validate(root,request);control(root,e,content.originalEffectKey);existing(rowFor(root,content.originalEffectKey),content);
 const nativeGrant=authorizePan473TargetWrite({root,epoch:request.epoch,owner});
 const grant=Object.freeze({});grants.set(grant,{root,requestDigest:digest(request),contentDigest:digest(content),nativeGrant,expires:Date.now()+30000});return grant;
}
function schema(db,root){
 if(readStore(db,root))return;
 transaction(db,()=>{
  db.exec("CREATE TABLE pan467_meta(id INTEGER PRIMARY KEY CHECK(id=1),binding TEXT NOT NULL,lease TEXT NOT NULL); CREATE TABLE pan467_intents(effect_key TEXT PRIMARY KEY,intent TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('PENDING','COMMITTED')),receipt TEXT);");
  db.prepare('INSERT INTO pan467_meta VALUES(?,?,?)').run(1,canonicalJson(binding(root)),'null');
  for(const g of GUARDS)db.exec(g.sql);
 });
}
function take(root){const db=openNative(root,'target',false);try{schema(db,root);return transaction(db,()=>{
 const state=readStore(db,root),status=leaseState(state.lease);if(status==='LIVE'||status==='UNKNOWN')fail('PAN467_LIVE_OR_UNKNOWN_CORRECTION_OWNER_DENIED');
 const p=processBirth(process.pid);if(p.state!=='LIVE')fail('PAN467_OWNER_IDENTITY_UNAVAILABLE_DENIED');
 const lease={pid:process.pid,birth:p.birth,token:randomUUID()};db.prepare('UPDATE pan467_meta SET lease=? WHERE id=1').run(canonicalJson(lease));return lease;
});}finally{db.close();}}
function withLease(root,lease,work){const db=openNative(root,'target',false);try{return transaction(db,()=>{
 if(canonicalJson(readStore(db,root).lease)!==canonicalJson(lease))fail('PAN467_CORRECTION_OWNER_FENCED_DENIED');return work(db);
});}finally{db.close();}}
async function pause(phase,pauseAfter){if(phase!==pauseAfter)return;await new Promise(resolve=>{process.once('message',m=>{if(m==='CONTINUE')resolve();});process.send({schemaVersion:'pansphaira.pan467/native-correction-boundary/v1',phase,pid:process.pid});});}
function eligible(e){
 if(e.current.body.priceMinor!==e.original.body.priceMinor)fail('PAN467_LATER_VALID_PRICE_CONFLICT_DENIED');
 let prior=e.original;
 for(const event of e.events){if(event.record.id!==e.original.id)continue;if(prior.body.priceMinor!==event.record.body?.priceMinor)fail('PAN467_LATER_VALID_PRICE_CONFLICT_DENIED');prior=event.record;}
}
export async function executePan467BusinessCorrection({root,request,grant,pauseAfter=null,fault=null}){
 if(![null,'AFTER_INTENT','AFTER_NATIVE_CORRECTION'].includes(pauseAfter)||pauseAfter&&typeof process.send!=='function'||![null,'ACK_LOSS_AFTER_NATIVE'].includes(fault))fail('PAN467_OWNED_FAULT_PROFILE_DENIED');
 const a=grants.get(grant);if(!a||a.root!==root||a.requestDigest!==digest(request)||Date.now()>=a.expires)fail('PAN467_CURRENT_CONTENT_BOUND_GRANT_REQUIRED_DENIED');
 const {e,content}=validate(root,request);if(digest(content)!==a.contentDigest)fail('PAN467_CURRENT_CONTENT_BOUND_GRANT_REQUIRED_DENIED');control(root,e,content.originalEffectKey);
 const old=rowFor(root,content.originalEffectKey);existing(old,content);
 if(old?.state==='COMMITTED'){
  const d=diagnosePan467BusinessCorrection({root});if(d.outcome!=='VERIFIED')fail('PAN467_NATIVE_RECEIPT_RECONCILIATION_REQUIRED_DENIED');
  return {outcome:'RECONCILED_NO_DUPLICATE',receipt:JSON.parse(old.receipt),verification:d};
 }
 if(!old)eligible(e);
 // Consume the released stable task/effect identity convention BEFORE mutation.
 const owner=acquireLocalJournalOwner(journal(root));try{recordLocalJournalTaskIdentity(journal(root),{operationKey:content.originalEffectKey,taskIdentityDigest:digest({originalEffectKey:content.originalEffectKey}),handleDigest:digest(content),boundAtMs:Date.now()});}finally{owner.release();}
 const lease=take(root);
 try{
  let intent=withLease(root,lease,db=>{
   const row=db.prepare('SELECT effect_key,intent,state,receipt FROM pan467_intents WHERE effect_key=?').get(content.originalEffectKey);
   if(row){const retained=existing(row,content);if(row.state!=='PENDING')fail('PAN467_RETAINED_INTENT_STATE_DENIED');return retained;}
   if(db.prepare('SELECT COUNT(*) AS n FROM pan467_intents').get().n>=PAN467_LIMIT)fail('PAN467_HISTORY_BOUND_DENIED');
   const current=nativeEvidence(root,request.id,request.originalRevision);eligible(current);
   const value={content,effectDigest:digest(content),firstRequestId:request.requestId,priorOrdinal:current.events.length,recordedAtMs:Date.now()};
   db.prepare('INSERT INTO pan467_intents VALUES(?,?,?,?)').run(content.originalEffectKey,canonicalJson(value),'PENDING',null);return value;
  });
  await pause('AFTER_INTENT',pauseAfter);control(root,e,content.originalEffectKey);
  let observed=nativeEvidence(root,request.id,request.originalRevision),matches=matchingEvents(intent,observed.events);
  if(matches.length>1)fail('PAN467_AMBIGUOUS_ORIGINAL_EFFECT_DENIED');
  if(!matches.length){
   correctPan473HistoricalField({root,epoch:request.epoch,grant:a.nativeGrant,id:request.id,originalRevision:request.originalRevision,field:'priceMinor',expectedOriginalValue:request.expectedOriginalValue,correctedValue:request.correctedValue});
   observed=nativeEvidence(root,request.id,request.originalRevision);matches=matchingEvents(intent,observed.events);
  }
  if(matches.length!==1||ready(root).outcome!=='ACTIVE')fail('PAN467_NATIVE_CORRECTION_READBACK_REQUIRED_DENIED');
  await pause('AFTER_NATIVE_CORRECTION',pauseAfter);
  if(fault==='ACK_LOSS_AFTER_NATIVE')fail('PAN467_SYNTHETIC_ACK_LOSS_AFTER_NATIVE');
  const core=receiptCore(intent,matches[0]),receipt={...core,receiptDigest:digest(core)};
  withLease(root,lease,db=>{const result=db.prepare("UPDATE pan467_intents SET state='COMMITTED',receipt=? WHERE effect_key=? AND state='PENDING'").run(canonicalJson(receipt),content.originalEffectKey);if(result.changes!==1)fail('PAN467_ORIGINAL_EFFECT_COMMIT_CONFLICT_DENIED');});
  const d=diagnosePan467BusinessCorrection({root});if(d.outcome!=='VERIFIED')fail('PAN467_NATIVE_RECEIPT_RECONCILIATION_REQUIRED_DENIED');
  return {outcome:'ATTRIBUTED_FORWARD_CORRECTED',receipt,verification:d};
 }finally{withLease(root,lease,db=>db.prepare('UPDATE pan467_meta SET lease=? WHERE id=1').run('null'));}
}
