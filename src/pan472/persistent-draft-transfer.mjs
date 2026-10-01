// PAN472 actual composed native entry. Local synthetic owner approval is
// content-bound; it is NOT an organization/host/production authorization.
// The accepted fixed PAN442 business action is neither rewritten nor retargeted.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  acquireLocalJournalOwner, readLocalJournalControl,
  recordLocalJournalTaskIdentity, recordLocalJournalRecoveryAttempt,
} from '../../demo/runtime/local-journal-owner.mjs';
import {
  PAN472_PROFILE_V1, PAN472_PLAN_V1, PAN472_RECEIPT_V1, PAN472_LIMITS_V1,
  PAN472_MAPPING_DIGEST_V1, canonicalJson, digest, copy, exact, integer,
  rootPath, readMarker, openNative, readMeta, validateRecord, decodeRow,
  references, unknown, fail,
} from './draft-profile.mjs';
import { reconcilePan472DraftTransfer } from './independent-draft-reconciliation.mjs';
export { PAN472_MAPPING_DIGEST_V1, PAN472_LIMITS_V1 };
const grants=new WeakMap();
const journal = root => join(root,'pan453-owned-v2');
const ROW_SCHEMA=`CREATE TABLE objects(id TEXT PRIMARY KEY,kind TEXT NOT NULL,revision INTEGER NOT NULL,deleted INTEGER NOT NULL,body TEXT,sequence INTEGER NOT NULL);`;
function transaction(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try {const result=work();db.exec('COMMIT');return result;}
  catch(error){db.exec('ROLLBACK');throw error;}
}
export function initializePan472SyntheticDraftStores({root}) {
  rootPath(root);
  if(existsSync(root))fail('EXISTING_ROOT_ADOPTION_DENIED');
  mkdirSync(root,{mode:0o700});
  const marker={schemaVersion:PAN472_PROFILE_V1,scope:'LOCAL_SYNTHETIC_DISPOSABLE',
    tenant:'tenant:synthetic-pan472',sourceIdentity:randomUUID(),sourceGeneration:randomUUID(),
    targetIdentity:randomUUID(),mappingDigest:PAN472_MAPPING_DIGEST_V1};
  writeFileSync(join(root,'owned-profile.json'),canonicalJson(marker)+'\n',{flag:'wx',mode:0o600,flush:true});
  for(const which of ['source','target']) {
    const db=new DatabaseSync(join(root,`${which}.sqlite`));
    try {
      db.exec('PRAGMA synchronous=FULL; CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);'+ROW_SCHEMA);
      db.prepare('INSERT INTO meta VALUES(?,?)').run('owned-profile',canonicalJson(marker));
      if(which==='source') {
        db.exec('CREATE TABLE events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL,kind TEXT NOT NULL,revision INTEGER NOT NULL,deleted INTEGER NOT NULL,body TEXT);');
        db.prepare('INSERT INTO meta VALUES(?,?)').run('last-sequence','0');
      } else {
        db.exec('CREATE TABLE dedup(operation_key TEXT PRIMARY KEY,plan_digest TEXT NOT NULL); CREATE TABLE approvals(operation_key TEXT PRIMARY KEY,plan_digest TEXT NOT NULL,owner TEXT NOT NULL); CREATE TABLE receipts(operation_key TEXT PRIMARY KEY,receipt TEXT NOT NULL); CREATE TABLE outside_effects(id INTEGER PRIMARY KEY,kind TEXT NOT NULL);');
        db.prepare('INSERT INTO meta VALUES(?,?)').run('cursor','null');
      }
    } finally {db.close();}
  }
  const owner=acquireLocalJournalOwner(journal(root));owner.release();
  return copy(marker);
}
function sourceState(root, throughSequence=null) {
  const marker=readMarker(root),db=openNative(root,'source');
  try {
    db.exec('BEGIN');readMeta(db,marker);
    const raw=db.prepare('SELECT sequence,id,kind,revision,deleted,body FROM events ORDER BY sequence LIMIT ?').all(PAN472_LIMITS_V1.events+1);
    if(raw.length>PAN472_LIMITS_V1.events)return unknown([{code:'SOURCE_EVENT_BOUND'}]);
    const latest=Number(db.prepare('SELECT value FROM meta WHERE key=?').get('last-sequence')?.value);
    if(!integer(latest) || latest!==raw.length)return unknown([{code:'SOURCE_SEQUENCE_GAP'}]);
    if(throughSequence===null)throughSequence=latest;
    if(!integer(throughSequence) || throughSequence>latest)return unknown([{code:'SOURCE_CUTOFF_UNAVAILABLE'}]);
    const state=new Map(),prefix=new Map(),events=[];
    for(let i=0;i<raw.length;i++) {
      if(raw[i].sequence!==i+1)return unknown([{code:'SOURCE_SEQUENCE_GAP'}]);
      const r=decodeRow(raw[i]),prior=state.get(r.id);
      if(r.deleted && !prior)return unknown([{code:'DELETION_WITHOUT_PRIOR_REVISION',id:r.id}]);
      if(r.revision!==(prior?.revision??0)+1 || prior?.deleted || prior && prior.kind!==r.kind)
        return unknown([{code:'SOURCE_REVISION_OR_DELETION_HISTORY',id:r.id}]);
      state.set(r.id,r);
      if(r.sequence<=throughSequence){prefix.set(r.id,r);events.push(r);}
    }
    const actual=db.prepare('SELECT id,kind,revision,deleted,body,sequence FROM objects ORDER BY id LIMIT ?').all(PAN472_LIMITS_V1.objects+1).map(decodeRow);
    if(canonicalJson(actual)!==canonicalJson([...state.values()].sort((a,b)=>a.id.localeCompare(b.id))))
      return unknown([{code:'SOURCE_STATE_HISTORY_MISMATCH'}]);
    const rows=[...prefix.values()].sort((a,b)=>a.id.localeCompare(b.id));
    const quarantine=references(rows);
    if(!rows.some(r=>r.kind==='order'))quarantine.push({code:'NO_BOUNDED_DRAFT_AGGREGATE'});
    if(quarantine.length)return unknown(quarantine);
    if(Buffer.byteLength(canonicalJson({rows,events}))>PAN472_LIMITS_V1.bytes)return unknown([{code:'SOURCE_BYTE_BOUND'}]);
    return {outcome:'QUALIFIED',marker,throughSequence,latest,rows,events};
  } finally {db.close();}
}
export function writePan472SyntheticSource({root,changes}) {
  const marker=readMarker(root);
  if(!Array.isArray(changes) || changes.length<1 || changes.length>PAN472_LIMITS_V1.objects
    || new Set(changes.map(c=>c.id)).size!==changes.length)fail('SOURCE_CHANGE_BOUND_DENIED');
  for(const change of changes)validateRecord(change);
  const owner=acquireLocalJournalOwner(journal(root)),db=openNative(root,'source',false);
  try {
    readMeta(db,marker);
    return transaction(db,()=>{
      const total=db.prepare('SELECT COUNT(*) AS n FROM events').get().n;
      if(total+changes.length>PAN472_LIMITS_V1.events)fail('SOURCE_EVENT_BOUND_DENIED');
      let throughSequence=Number(db.prepare('SELECT value FROM meta WHERE key=?').get('last-sequence').value);
      if(total!==throughSequence)fail('SOURCE_SEQUENCE_GAP_DENIED');
      for(const c of changes) {
        const old=db.prepare('SELECT revision,deleted,kind FROM objects WHERE id=?').get(c.id);
        if(c.deleted && !old)fail('DELETION_WITHOUT_PRIOR_REVISION_DENIED');
        if(c.revision!==(old?.revision??0)+1 || old?.deleted || old && old.kind!==c.kind)fail('STALE_REVISION_OR_RESURRECTION_DENIED');
        const body=c.body===null?null:canonicalJson(c.body);
        const inserted=db.prepare('INSERT INTO events(id,kind,revision,deleted,body) VALUES(?,?,?,?,?)').run(c.id,c.kind,c.revision,c.deleted?1:0,body);
        throughSequence=Number(inserted.lastInsertRowid);
        db.prepare('INSERT INTO objects VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,revision=excluded.revision,deleted=excluded.deleted,body=excluded.body,sequence=excluded.sequence').run(c.id,c.kind,c.revision,c.deleted?1:0,body,throughSequence);
      }
      if(db.prepare('SELECT COUNT(*) AS n FROM objects').get().n>PAN472_LIMITS_V1.objects)fail('SOURCE_OBJECT_BOUND_DENIED');
      db.prepare('UPDATE meta SET value=? WHERE key=?').run(String(throughSequence),'last-sequence');
      return {sourceGeneration:marker.sourceGeneration,throughSequence};
    });
  } finally {db.close();owner.release();}
}
function cursor(root) {
  const m=readMarker(root),db=openNative(root,'target');
  try {readMeta(db,m);return JSON.parse(db.prepare('SELECT value FROM meta WHERE key=?').get('cursor').value);}
  finally{db.close();}
}
function planFor(state,kind,fromSequence) {
  const {marker:m,throughSequence,rows,events}=state;
  if(!['SNAPSHOT','DELTA'].includes(kind) || !integer(fromSequence) || fromSequence>throughSequence
    || kind==='SNAPSHOT' && fromSequence!==0)fail('PLAN_RANGE_DENIED');
  // An empty delta is never a mutating operation or an approval target.
  // Keep the existing strict receipt rule (from < through) unchanged.
  if(kind==='DELTA' && fromSequence===throughSequence)fail('EMPTY_DELTA_NOT_EXECUTABLE_DENIED');
  const opIdentity={sourceIdentity:m.sourceIdentity,sourceGeneration:m.sourceGeneration,targetIdentity:m.targetIdentity,kind,fromSequence,throughSequence};
  const operationKey='admin-ai:poc:pan472-import:'+digest(opIdentity);
  const core={schemaVersion:PAN472_PLAN_V1,scope:'LOCAL_SYNTHETIC_DISPOSABLE',tenant:m.tenant,
    ...opIdentity,operationKey,mappingDigest:PAN472_MAPPING_DIGEST_V1,
    rows:kind==='SNAPSHOT'?rows:events.filter(e=>e.sequence>fromSequence),
    expectedStateDigest:digest(rows),outsideEffects:'DISABLED'};
  return {...core,planDigest:digest(core)};
}
export function capturePan472TransferPlan({root,kind='SNAPSHOT'}) {
  try {
    const state=sourceState(root);
    if(state.outcome!=='QUALIFIED')return state;
    const c=cursor(root);
    if(c && (c.sourceIdentity!==state.marker.sourceIdentity || c.sourceGeneration!==state.marker.sourceGeneration))
      return unknown([{code:'SOURCE_GENERATION_MISMATCH'}]);
    const fromSequence=kind==='SNAPSHOT'?0:c?.throughSequence??0;
    if(kind==='DELTA' && !c)return unknown([{code:'SNAPSHOT_REQUIRED_BEFORE_DELTA'}]);
    if(kind==='DELTA' && fromSequence===state.throughSequence) {
      const observed=reconcilePan472DraftTransfer({root});
      if(observed.outcome!=='VERIFIED')return observed;
      return {outcome:'NO_CHANGES',coverage:'COMPLETE_AT_CUTOFF',readOnly:true,
        throughSequence:state.throughSequence,quarantine:[],verification:observed};
    }
    return {outcome:'PLANNED',coverage:'COMPLETE',plan:planFor(state,kind,fromSequence),quarantine:[]};
  }catch(error){return unknown([{code:error.message}]);}
}
function verifyPlan(root,plan) {
  if(!exact(plan,['schemaVersion','scope','tenant','sourceIdentity','sourceGeneration','targetIdentity','kind','fromSequence','throughSequence','operationKey','mappingDigest','rows','expectedStateDigest','outsideEffects','planDigest']))fail('PLAN_BINDING_DENIED');
  const state=sourceState(root,plan.throughSequence);
  if(state.outcome!=='QUALIFIED' || canonicalJson(plan)!==canonicalJson(planFor(state,plan.kind,plan.fromSequence)))fail('PLAN_BINDING_DENIED');
  return state;
}
export function authorizePan472Transfer({root,plan,owner}) {
  if(owner!=='LOCAL_SYNTHETIC_OWNER')fail('SYNTHETIC_OWNER_REQUIRED_DENIED');
  verifyPlan(root,plan);
  const grant=Object.freeze({});
  grants.set(grant,{root,planDigest:plan.planDigest,expiresAtMs:Date.now()+30000});
  return grant;
}
function assertControls(root,m,plan) {
  const controls=readLocalJournalControl(journal(root));
  for(const f of Object.values(controls.fences)) {
    if(f.kind==='STOP' && f.sourceIdentity===m.sourceIdentity && f.targetIdentity===m.targetIdentity
      || f.kind==='REVOKE' && f.operationKey===plan.operationKey)fail('IMPORT_STOP_OR_REVOKE_DENIED');
  }
}
export function executePan472DraftTransfer({root,plan,grant,fault=null}) {
  if(![null,'ROLLBACK_BEFORE_DEDUP','ACK_LOSS_AFTER_COMMIT'].includes(fault))fail('SYNTHETIC_FAULT_PROFILE_DENIED');
  const a=grants.get(grant);
  if(!a || a.root!==root || a.planDigest!==plan?.planDigest || Date.now()>=a.expiresAtMs)fail('PLAN_AUTHORITY_REQUIRED_DENIED');
  const owner=acquireLocalJournalOwner(journal(root));
  let db;
  try {
    const state=verifyPlan(root,plan),m=state.marker;
    assertControls(root,m,plan);
    db=openNative(root,'target',false);readMeta(db,m);
    const c=JSON.parse(db.prepare('SELECT value FROM meta WHERE key=?').get('cursor').value);
    if(c && c.throughSequence>plan.throughSequence)fail('STALE_SEQUENCE_DENIED');
    if(c && (c.sourceIdentity!==m.sourceIdentity || c.sourceGeneration!==m.sourceGeneration
      || c.mappingDigest!==PAN472_MAPPING_DIGEST_V1))fail('TARGET_CURSOR_BINDING_DENIED');
    const dedup=db.prepare('SELECT plan_digest FROM dedup WHERE operation_key=?').get(plan.operationKey);
    if(dedup) {
      if(dedup.plan_digest!==plan.planDigest)fail('DEDUP_CONTENT_CONFLICT_DENIED');
      const approval=db.prepare('SELECT plan_digest,owner FROM approvals WHERE operation_key=?').get(plan.operationKey);
      const r=db.prepare('SELECT receipt FROM receipts WHERE operation_key=?').get(plan.operationKey);
      if(!approval || approval.plan_digest!==plan.planDigest || approval.owner!=='LOCAL_SYNTHETIC_OWNER' || !r)fail('RECOVERY_APPROVAL_OR_RECEIPT_REQUIRED_DENIED');
      recordLocalJournalRecoveryAttempt(journal(root),{operationKey:plan.operationKey,attemptedAtMs:Date.now(),maxAttempts:3});
      const observed=reconcilePan472DraftTransfer({root});
      if(observed.outcome!=='VERIFIED')fail('TARGET_RECONCILIATION_QUARANTINED');
      return {outcome:'RECONCILED_NO_DUPLICATE',coverage:'COMPLETE',receipt:JSON.parse(r.receipt),verification:observed};
    }
    if(state.latest!==plan.throughSequence)fail('SOURCE_ADVANCED_REPLAN_REQUIRED_DENIED');
    if(c) {
      if(plan.kind!=='DELTA' || plan.fromSequence!==c.throughSequence)fail('TARGET_CONTINUITY_DENIED');
      if(reconcilePan472DraftTransfer({root}).outcome!=='VERIFIED')fail('TARGET_RECONCILIATION_QUARANTINED');
    } else if(plan.kind!=='SNAPSHOT' || db.prepare('SELECT COUNT(*) AS n FROM objects').get().n!==0
      || db.prepare('SELECT COUNT(*) AS n FROM dedup').get().n!==0)fail('TARGET_ADOPTION_DENIED');
    recordLocalJournalTaskIdentity(journal(root),{taskIdentityDigest:digest({operationKey:plan.operationKey}),operationKey:plan.operationKey,handleDigest:plan.planDigest,boundAtMs:Date.now()});
    const receipt=transaction(db,()=>{
      for(const r of plan.rows) {
        const old=db.prepare('SELECT revision,deleted,kind FROM objects WHERE id=?').get(r.id);
        if(old && (r.revision<=old.revision || old.deleted || old.kind!==r.kind))fail('STALE_REVISION_OR_RESURRECTION_DENIED');
        const body=r.body===null?null:canonicalJson(r.body);
        db.prepare('INSERT INTO objects VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,revision=excluded.revision,deleted=excluded.deleted,body=excluded.body,sequence=excluded.sequence').run(r.id,r.kind,r.revision,r.deleted?1:0,body,r.sequence);
      }
      if(fault==='ROLLBACK_BEFORE_DEDUP')fail('SYNTHETIC_ROLLBACK_BEFORE_DEDUP');
      const core={schemaVersion:PAN472_RECEIPT_V1,operationKey:plan.operationKey,planDigest:plan.planDigest,
        sourceIdentity:m.sourceIdentity,sourceGeneration:m.sourceGeneration,targetIdentity:m.targetIdentity,
        fromSequence:plan.fromSequence,throughSequence:plan.throughSequence,mappingDigest:plan.mappingDigest,
        expectedStateDigest:plan.expectedStateDigest,scope:'LOCAL_SYNTHETIC_DISPOSABLE',
        outsideEffectCount:0,atomicTargetAndDedup:true,committedAtMs:Date.now()};
      const r={...core,receiptDigest:digest(core)};
      db.prepare('INSERT INTO approvals VALUES(?,?,?)').run(plan.operationKey,plan.planDigest,'LOCAL_SYNTHETIC_OWNER');
      db.prepare('INSERT INTO dedup VALUES(?,?)').run(plan.operationKey,plan.planDigest);
      db.prepare('INSERT INTO receipts VALUES(?,?)').run(plan.operationKey,canonicalJson(r));
      db.prepare('UPDATE meta SET value=? WHERE key=?').run(canonicalJson({sourceIdentity:m.sourceIdentity,sourceGeneration:m.sourceGeneration,throughSequence:plan.throughSequence,mappingDigest:plan.mappingDigest,expectedStateDigest:plan.expectedStateDigest,operationKey:plan.operationKey}),'cursor');
      return r;
    });
    db.close();db=null;
    if(fault==='ACK_LOSS_AFTER_COMMIT')fail('SYNTHETIC_ACK_LOSS_AFTER_COMMIT');
    const observed=reconcilePan472DraftTransfer({root});
    if(observed.outcome!=='VERIFIED')fail('TARGET_RECONCILIATION_QUARANTINED');
    return {outcome:'TRANSFERRED',coverage:'COMPLETE',receipt,verification:observed};
  } finally {db?.close();owner.release();}
}
