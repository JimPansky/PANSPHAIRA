// Bounded LOCAL_SYNTHETIC ERV human-decision attachment to the existing leading
// SQLite target. Privileged constructors are code-owner APIs, never HTTP routes.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {acquireLocalJournalOwner,readLocalJournalTaskIdentity,recordLocalJournalTaskIdentity,readLocalJournalControl} from '../../demo/runtime/local-journal-owner.mjs';
import {canonicalJson,digest,readMarker,openNative,transaction,guardsMatch,fail} from '../pan473/scope-profile.mjs';
import {readPan515TradeState} from '../pan515/trade-state.mjs';
import {readPan516ProcurementProjectionSnapshot} from '../procurement-434/bestellung-lifecycle.mjs';
import {evaluatePan516ProcurementLiabilitySnapshot} from '../procurement-434/bestellung-liability.mjs';
import {isProtectedSessionAdapterV1} from '../pan527/origin-session-adapter.mjs';

const invoiceIds=['AP-PAN516-MATCHED-01','AP-PAN516-PARTIAL-01'];
const roles=[{subjectId:'synthetic:erv-reviewer',nativeRole:'REVIEWER'},
  {subjectId:'synthetic:erv-approver',nativeRole:'APPROVER'},
  {subjectId:'synthetic:erv-reader',nativeRole:'READER'}];
const sourcePaths=['src/pan542/native-human-backend.mjs','src/pan527/origin-session-adapter.mjs',
  'src/pan472/draft-profile.mjs','src/pan473/scope-profile.mjs','src/pan515/trade-state.mjs',
  'src/procurement-434/bestellung-lifecycle.mjs','src/procurement-434/bestellung-liability.mjs',
  'dist/packages/contracts/src/incoming-invoice-erv.js','contracts/trade/pan516-invoice-cases-v1.json',
  'demo/runtime/local-journal-owner.mjs'];
const guards=['pan542_binding','pan542_events'].flatMap(table=>['UPDATE','DELETE'].map(action=>({
  name:`${table}_${action.toLowerCase()}_immutable`,
  sql:`CREATE TRIGGER ${table}_${action.toLowerCase()}_immutable BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT,'ERV_HUMAN_HISTORY_IMMUTABLE_DENIED'); END`})));
function closed(value,keys,code){
  if(!value||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype)fail(code);
  const ds=Object.getOwnPropertyDescriptors(value);
  if(Reflect.ownKeys(ds).length!==keys.length||Reflect.ownKeys(ds).some(k=>typeof k!=='string'||!keys.includes(k))
    ||Object.values(ds).some(d=>!d.enumerable||!('value' in d)))fail(code);
}
function frozen(value){if(value&&typeof value==='object'){for(const v of Object.values(value))frozen(v);Object.freeze(value);}return value;}
function sourceIdentity(){return sourcePaths.map(path=>({path,sha256:createHash('sha256').update(readFileSync(new URL('../../'+path,import.meta.url))).digest('hex')}));}
function sessionScope(binding){
  return {origin:binding.origin,audience:binding.audience,tenantId:binding.tenantId,instanceId:binding.instanceId,generation:binding.generation,identityDigest:binding.identityDigest};
}
function local(root,write,work){
  const lease=acquireLocalJournalOwner(join(root,'pan453-owned-v2'));let db;
  try{
    const trade=readPan515TradeState({root});db=openNative(root,'target',!write);
    if(write)return transaction(db,()=>work(db,trade.binding));
    db.exec('BEGIN');return work(db,trade.binding);
  }finally{db?.close();lease.release();}
}
function leading(db,tradeBinding,invoiceId){
  if(!invoiceIds.includes(invoiceId))fail('ERV_HUMAN_INVOICE_BINDING_DENIED');
  const state=readPan516ProcurementProjectionSnapshot({db,tradeBinding});
  const liability=evaluatePan516ProcurementLiabilitySnapshot({state,invoiceId,expectedConfirmationRevision:state.confirmations.at(-1)?.revision});
  return {nativeRevision:state.revision,nativeBindingDigest:digest(state.binding),basisDigest:liability.basisDigest,
    invoiceSource:liability.source.invoiceSource,confirmationDigest:liability.source.confirmationDigest,
    decisionOutcome:liability.decision.outcome,nativeStatus:liability.status};
}
function binding(db,tradeBinding){
  if(!guardsMatch(db,guards))fail('ERV_HUMAN_HISTORY_GUARDS_DENIED');
  const row=db.prepare('SELECT record FROM pan542_binding WHERE id=1').get();if(!row)fail('ERV_HUMAN_CONFIGURATION_REQUIRED_DENIED');
  const record=JSON.parse(row.record),{bindingDigest,...core}=record;
  if(bindingDigest!==digest(core)||canonicalJson(core.sourceIdentity)!==canonicalJson(sourceIdentity())
    ||core.tradeBindingDigest!==digest(tradeBinding)||core.roleMappingVersion!==1||canonicalJson(core.roles)!==canonicalJson(roles)
    ||canonicalJson(core.invoiceIds)!==canonicalJson(invoiceIds))fail('ERV_HUMAN_CONFIGURATION_BINDING_DENIED');
  return record;
}
function mapped(record,principal){
  if(principal.tenantId!==record.sessionBinding.tenantId||principal.instanceId!==record.sessionBinding.instanceId
    ||principal.generation!==record.sessionBinding.generation)fail('ERV_HUMAN_PRINCIPAL_BINDING_DENIED');
  const role=record.roles.find(r=>r.subjectId===principal.subjectId);if(!role)fail('ERV_HUMAN_NATIVE_ROLE_REQUIRED_DENIED');
  return role.nativeRole;
}
function history(db,record,invoiceId,root){
  const taskIdentities=readLocalJournalTaskIdentity(join(root,'pan453-owned-v2')).identities;
  const rows=db.prepare('SELECT ordinal,effect_key,command,event FROM pan542_events ORDER BY ordinal LIMIT 129').all();
  if(rows.length>128)fail('ERV_HUMAN_HISTORY_BOUND_DENIED');let ordinal=0;const events=[];let previous=null;
  for(const row of rows){
    const c=JSON.parse(row.command),e=JSON.parse(row.event),{eventDigest,...core}=e;
    if(row.ordinal!==++ordinal||row.effect_key!==c.effectId||e.ordinal!==ordinal||e.bindingDigest!==record.bindingDigest
      ||e.previousEventDigest!==previous||e.commandDigest!==digest(c)||eventDigest!==digest(core)
      ||!e.taskBinding||canonicalJson(taskIdentities[e.taskBinding.taskIdentityDigest]??null)!==canonicalJson(e.taskBinding))fail('ERV_HUMAN_NATIVE_HISTORY_UNKNOWN_DENIED');
    previous=eventDigest;if(e.invoiceId===invoiceId)events.push(e);
  }
  return {events,ordinal,previous};
}
function projection(db,record,tradeBinding,principal,invoiceId,root){
  const nativeRole=mapped(record,principal),fact=leading(db,tradeBinding,invoiceId),journal=history(db,record,invoiceId,root),last=journal.events.at(-1);
  const state=!last?'REVIEW_REQUIRED':last.basisDigest===fact.basisDigest&&last.nativeRevision===fact.nativeRevision?last.state:'STALE_NATIVE_BASIS_REVIEW_REQUIRED';
  const core={schemaVersion:'pansphaira.erv-human/readback/v1',scenarioId:'PAN542_COMMON_TRADE_NATIVE_ERV_V1',
    invoiceId,...fact,bindingDigest:record.bindingDigest,sourceIdentity:record.sourceIdentity,sessionBinding:record.sessionBinding,
    roleMappingVersion:record.roleMappingVersion,nativeRole,subjectId:principal.subjectId,
    proposalRevision:journal.events.length,state,lastEventDigest:last?.eventDigest??null,
    leadingStore:'PAN472_TARGET_SQLITE',persisted:true,bookingAuthorityGranted:false,paymentOrderAuthorized:false,
    productiveDispatchAuthorized:false,executionAuthorityGranted:false};
  const {nativeRole:_role,subjectId:_subject,...proposal}=core;
  return frozen({...core,proposalDigest:digest(proposal)});
}
export function initializeNativeErvHumanBackendV1(options){
  closed(options,['root','owner','sessionBinding'],'ERV_HUMAN_INITIALIZER_DENIED');
  if(options.owner!=='LOCAL_SYNTHETIC_OWNER')fail('ERV_HUMAN_LOCAL_OWNER_REQUIRED_DENIED');
  const scope=sessionScope(options.sessionBinding);
  if(typeof scope.tenantId!=='string'||!/^tenant-[a-z0-9-]{1,48}$/.test(scope.tenantId)||typeof scope.instanceId!=='string'
    ||!Number.isSafeInteger(scope.generation)||scope.generation<1||typeof scope.identityDigest!=='string'||! /^[a-f0-9]{64}$/.test(scope.identityDigest))fail('ERV_HUMAN_SESSION_BINDING_DENIED');
  return local(options.root,true,(db,tradeBinding)=>{
    leading(db,tradeBinding,invoiceIds[0]);
    if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('pan542_binding','pan542_events')").all().length)fail('ERV_HUMAN_EXISTING_STORE_ADOPTION_DENIED');
    const core={schemaVersion:'pansphaira.erv-human/native-configuration/v1',scenarioId:'PAN542_COMMON_TRADE_NATIVE_ERV_V1',
      sessionBinding:scope,roleMappingVersion:1,roles,invoiceIds,sourceIdentity:sourceIdentity(),tradeBindingDigest:digest(tradeBinding),
      scope:'LOCAL_SYNTHETIC_BACKEND_ONLY',executionAuthorityGranted:false};
    const record={...core,bindingDigest:digest(core)};
    db.exec('CREATE TABLE pan542_binding(id INTEGER PRIMARY KEY CHECK(id=1),record TEXT NOT NULL) STRICT; CREATE TABLE pan542_events(ordinal INTEGER PRIMARY KEY,effect_key TEXT UNIQUE NOT NULL,command TEXT NOT NULL,event TEXT NOT NULL) STRICT;');
    db.prepare('INSERT INTO pan542_binding VALUES(1,?)').run(canonicalJson(record));for(const guard of guards)db.exec(guard.sql);
    return frozen(record);
  });
}
export function createNativeErvHumanBackendV1(options){
  closed(options,['root','sessions'],'ERV_HUMAN_BACKEND_OPTIONS_DENIED');const {root,sessions}=options;
  if(!isProtectedSessionAdapterV1(sessions,sessions?.binding?.tenantId))fail('ERV_HUMAN_PROTECTED_SESSION_OWNER_REQUIRED_DENIED');
  local(root,false,(db,tradeBinding)=>{if(canonicalJson(binding(db,tradeBinding).sessionBinding)!==canonicalJson(sessionScope(sessions.binding)))fail('ERV_HUMAN_SESSION_BINDING_DENIED');});
  return Object.freeze({
    read(headers,request){
      closed(request,['invoiceId'],'ERV_HUMAN_READ_REQUEST_DENIED');const principal=sessions.authenticate(headers);
      return local(root,false,(db,tradeBinding)=>projection(db,binding(db,tradeBinding),tradeBinding,principal,request.invoiceId,root));
    },
    notificationSource(headers,request){
      closed(request,['invoiceId'],'ERV_HUMAN_NOTIFICATION_REQUEST_DENIED');const principal=sessions.authenticate(headers);
      return local(root,false,(db,tradeBinding)=>{
        const record=binding(db,tradeBinding),readback=projection(db,record,tradeBinding,principal,request.invoiceId,root);
        const journal=history(db,record,request.invoiceId,root);
        return frozen({schemaVersion:'pansphaira.erv-human/notification-source/v1',readback,lastEvent:journal.events.at(-1)??null});
      });
    },
    reconcile(headers,request){
      closed(request,['invoiceId','effectId'],'ERV_HUMAN_RECONCILIATION_REQUEST_DENIED');
      if(typeof request.effectId!=='string'||!/^synthetic:[a-z0-9-]{3,64}$/.test(request.effectId))fail('ERV_HUMAN_RECONCILIATION_REQUEST_DENIED');
      const principal=sessions.authenticate(headers);
      return local(root,false,(db,tradeBinding)=>{
        const record=binding(db,tradeBinding),readback=projection(db,record,tradeBinding,principal,request.invoiceId,root);
        const row=db.prepare('SELECT command,event FROM pan542_events WHERE effect_key=?').get(request.effectId);
        const event=row?JSON.parse(row.event):null;
        const confirmed=event&&event.invoiceId===request.invoiceId&&event.nativeRevision===readback.nativeRevision&&event.basisDigest===readback.basisDigest;
        return frozen({schemaVersion:'pansphaira.erv-human/reconciliation/v1',outcome:confirmed?'RECONCILED_LOCAL_DECISION_NO_NEW_EFFECT':'OUTCOME_UNKNOWN',
          receipt:confirmed?event:null,readback,newDecisionEffect:false,executionAuthorityGranted:false});
      });
    },
    decide(headers,command){
      closed(command,['schemaVersion','invoiceId','effectId','transportId','expectedNativeRevision','expectedProposalRevision','proposalDigest','action'],'ERV_HUMAN_COMMAND_SHAPE_DENIED');
      if(command.schemaVersion!=='pansphaira.erv-human/decision/v1'||!['effectId','transportId'].every(k=>typeof command[k]==='string'&&/^synthetic:[a-z0-9-]{3,64}$/.test(command[k])))fail('ERV_HUMAN_COMMAND_SHAPE_DENIED');
      const principal=sessions.authorizeMutation(headers);
      return local(root,true,(db,tradeBinding)=>{
        const record=binding(db,tradeBinding),before=projection(db,record,tradeBinding,principal,command.invoiceId,root);
        if(!['REVIEW','QUERY','APPROVE_LOCAL_EVIDENCE_ONLY'].includes(command.action))fail('ERV_HUMAN_UNSUPPORTED_ACTION_DENIED');
        if(before.nativeRole!==(command.action==='APPROVE_LOCAL_EVIDENCE_ONLY'?'APPROVER':'REVIEWER'))fail('ERV_HUMAN_NATIVE_ROLE_DENIED');
        if(db.prepare('SELECT ordinal FROM pan542_events WHERE effect_key=?').get(command.effectId))fail('ERV_HUMAN_ALREADY_DECIDED_RECONCILE_REQUIRED');
        if(command.expectedNativeRevision!==before.nativeRevision||command.expectedProposalRevision!==before.proposalRevision||command.proposalDigest!==before.proposalDigest)fail('ERV_HUMAN_PROPOSAL_REVISION_DENIED');
        if(command.action==='REVIEW'&&!['REVIEW_REQUIRED','STALE_NATIVE_BASIS_REVIEW_REQUIRED','QUERY_PENDING_LOCAL_EVIDENCE_ONLY'].includes(before.state)
          ||command.action==='QUERY'&&!['REVIEW_REQUIRED','REVIEWED_LOCAL_EVIDENCE_ONLY','STALE_NATIVE_BASIS_REVIEW_REQUIRED'].includes(before.state))fail('ERV_HUMAN_TRANSITION_DENIED');
        const h=history(db,record,command.invoiceId,root);if(h.ordinal>=128)fail('ERV_HUMAN_HISTORY_BOUND_DENIED');
        if(command.action==='APPROVE_LOCAL_EVIDENCE_ONLY'){
          if(before.state!=='REVIEWED_LOCAL_EVIDENCE_ONLY'||h.events.at(-1)?.subjectId===principal.subjectId)fail('ERV_HUMAN_SEPARATE_REVIEW_REQUIRED_DENIED');
          if(before.decisionOutcome!=='MATCHED'||before.nativeStatus!=='RELEASED_LOCAL_SYNTHETIC')fail('ERV_HUMAN_NATIVE_UNRESOLVED_APPROVAL_DENIED');
        }
        const marker=readMarker(root);
        const operationKey='admin-ai:poc:erv-human:pan542:'+command.effectId;
        for(const path of [join(root,'pan453-owned-v2'),join(root,'pan473-controller','pan453-owned-v2')])
          for(const fence of Object.values(readLocalJournalControl(path).fences))
            if(fence.kind==='STOP'&&fence.sourceIdentity===marker.sourceIdentity&&fence.targetIdentity===marker.targetIdentity
              ||fence.kind==='REVOKE'&&fence.operationKey===operationKey)fail('ERV_HUMAN_STOP_OR_REVOKE_DENIED');
        // Reuse the existing bounded durable task fence before the only native
        // decision effect. No Order executor or productive handle is issued.
        const taskIdentityDigest=digest({schemaVersion:'pansphaira.erv-human/task-identity/v1',bindingDigest:record.bindingDigest,
          tenantId:principal.tenantId,subjectId:principal.subjectId,invoiceId:command.invoiceId,proposalDigest:before.proposalDigest,action:command.action});
        const journalRoot=join(root,'pan453-owned-v2');
        if(readLocalJournalTaskIdentity(journalRoot).identities[taskIdentityDigest])fail('ERV_HUMAN_TASK_FENCED_RECONCILE_REQUIRED');
        const taskBinding=recordLocalJournalTaskIdentity(journalRoot,{taskIdentityDigest,
          operationKey:'admin-ai:poc:erv-human:pan542:'+command.effectId,handleDigest:digest({taskIdentityDigest,effectId:command.effectId}),boundAtMs:Date.now()});
        const core={schemaVersion:'pansphaira.erv-human/event/v1',ordinal:h.ordinal+1,bindingDigest:record.bindingDigest,taskBinding,
          invoiceId:command.invoiceId,commandDigest:digest(command),previousEventDigest:h.previous,
          subjectId:principal.subjectId,nativeRole:before.nativeRole,roleMappingVersion:record.roleMappingVersion,
          nativeRevision:before.nativeRevision,basisDigest:before.basisDigest,proposalRevision:before.proposalRevision+1,
          state:command.action==='QUERY'?'QUERY_PENDING_LOCAL_EVIDENCE_ONLY':command.action==='APPROVE_LOCAL_EVIDENCE_ONLY'?'APPROVED_LOCAL_EVIDENCE_ONLY':'REVIEWED_LOCAL_EVIDENCE_ONLY',bookingAuthorityGranted:false,executionAuthorityGranted:false};
        const event={...core,eventDigest:digest(core)};
        db.prepare('INSERT INTO pan542_events VALUES(?,?,?,?)').run(core.ordinal,command.effectId,canonicalJson(command),canonicalJson(event));
        return projection(db,record,tradeBinding,principal,command.invoiceId,root);
      });
    },
  });
}
