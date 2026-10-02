// Independent controller-down native diagnosis: separate read-only SQL,
// reconstruct source history, imported evidence and every later target event.
// No controller/writer implementation, receipt success flag or caller boolean.
import {reconcilePan472DraftTransfer} from '../pan472/independent-draft-reconciliation.mjs';
import {PAN472_PLAN_V1,PAN472_RECEIPT_V1} from '../pan472/draft-profile.mjs';
import {
 PAN473_PLAN_V1,PAN473_EVENT_V1,scopeProfile,openScope,openNative,readMeta,metadata,
 canonicalJson,digest,exact,integer,decodeRow,validateRecord,references,fail,
 SOURCE_GUARDS,TARGET_GUARDS,guardsMatch,leaseState,alternative,PAN472_LIMITS_V1,PAN472_MAPPING_DIGEST_V1,
} from './scope-profile.mjs';
const ordered=rows=>[...rows].sort((a,b)=>a.id.localeCompare(b.id));
const denial=code=>({outcome:'UNKNOWN',coverage:'UNKNOWN',readOnly:true,complete:false,quarantine:[{code}],alternative:'COEXISTENCE_OR_OFFLINE_TRANSFER',cutoverAuthorized:false});
export function diagnosePan473WriterScope({root}){
 let source,target,scope;
 try{
  const {marker:m,profile:p}=scopeProfile(root);if(p.sourceCapability==='NO_FENCE_GUARANTEE')return {...alternative(),quarantine:[]};
  source=openNative(root,'source');target=openNative(root,'target');scope=openScope(root);
  source.exec('BEGIN');target.exec('BEGIN');scope.exec('BEGIN');readMeta(source,m);readMeta(target,m);
  if(canonicalJson(metadata(scope,'profile'))!==canonicalJson(p))return denial('PAN473_SCOPE_STORE_BINDING_MISMATCH');
  const route=scope.prepare('SELECT * FROM routing WHERE id=1').get(),sg=source.prepare('SELECT * FROM pan473_gate WHERE id=1').get(),tg=target.prepare('SELECT * FROM pan473_gate WHERE id=1').get();
  if(!sg||!tg||!route||sg.scope_digest!==p.scopeDigest||tg.scope_digest!==p.scopeDigest||route.scope_digest!==p.scopeDigest
   ||sg.epoch!==0||!['ACTIVE','FENCED'].includes(sg.mode)||!['INACTIVE','ACTIVE'].includes(tg.mode)||sg.routed!==0||!guardsMatch(source,SOURCE_GUARDS))return denial('PAN473_NATIVE_GATE_OR_GUARD_BINDING_MISMATCH');
  const raw=source.prepare('SELECT sequence,id,kind,revision,deleted,body FROM events ORDER BY sequence LIMIT ?').all(PAN472_LIMITS_V1.events+1);
  const head=Number(source.prepare('SELECT value FROM meta WHERE key=?').get('last-sequence')?.value);
  if(!integer(head)||head<1||head!==raw.length||raw.length>PAN472_LIMITS_V1.events)return denial('PAN473_SOURCE_HISTORY_BOUND_OR_GAP');
  const state=new Map(),histories=new Map(),events=[];
  for(let i=0;i<raw.length;i++){
   if(raw[i].sequence!==i+1)return denial('PAN473_SOURCE_HISTORY_GAP');const r=decodeRow(raw[i]),old=state.get(r.id);
   if(r.revision!==(old?.revision??0)+1||old?.deleted||old&&old.kind!==r.kind||r.deleted&&!old)return denial('PAN473_SOURCE_REVISION_OR_DELETION_HISTORY');
   state.set(r.id,r);events.push(r);histories.set(r.sequence,ordered(state.values()));
  }
  const sourceRows=source.prepare('SELECT id,kind,revision,deleted,body,sequence FROM objects ORDER BY id LIMIT ?').all(PAN472_LIMITS_V1.objects+1).map(decodeRow);
  if(canonicalJson(sourceRows)!==canonicalJson(ordered(state.values()))||references(sourceRows).length)return denial('PAN473_SOURCE_STATE_OR_REFERENCES');
  const plan=metadata(scope,'plan'),lease=metadata(scope,'lease'),controllerState=leaseState(lease);
  if(controllerState==='UNKNOWN')return denial('PAN473_CONTROLLER_LIVENESS_UNKNOWN');
  if(sg.mode==='FENCED'){
   if(!plan||!exact(plan,['schemaVersion','scopeDigest','sourceCutoff','sourceStateDigest','targetEpoch','transferPlan','planDigest']))return denial('PAN473_RETAINED_CUTOVER_PLAN_REQUIRED');
   const {planDigest,...core}=plan;
   if(plan.schemaVersion!==PAN473_PLAN_V1||plan.scopeDigest!==p.scopeDigest||digest(core)!==planDigest||plan.targetEpoch!==1
    ||plan.sourceCutoff!==head||plan.sourceStateDigest!==digest(sourceRows)||sg.cutoff!==head||sg.cutoff_digest!==digest(sourceRows)||sg.plan_digest!==planDigest)return denial('PAN473_FINAL_SOURCE_FENCE_CUTOFF_MISMATCH');
  }else if(sg.cutoff!==null||sg.cutoff_digest!==null||sg.plan_digest!==null)return denial('PAN473_SOURCE_ACTIVE_FENCE_CONTRADICTION');
  const outside=target.prepare('SELECT COUNT(*) AS n FROM outside_effects').get().n;
  if(outside!==0)return denial('PAN473_OUTSIDE_EFFECT_PRESENT');
  const baselineRows=target.prepare('SELECT id,record FROM pan473_baseline ORDER BY id LIMIT ?').all(PAN472_LIMITS_V1.objects+1);
  const activity=target.prepare('SELECT ordinal,event FROM pan473_target_events ORDER BY ordinal LIMIT ?').all(PAN472_LIMITS_V1.events+1);
  const base={readOnly:true,complete:false,quarantine:[],scopeDigest:p.scopeDigest,sourceCutoff:sg.cutoff??head,sourceFenced:sg.mode==='FENCED',targetEpoch:tg.epoch,
   routing:route.destination,routingAcked:route.acked===1,targetEventCount:activity.length,outsideEffectCount:outside,controllerState,controllerDown:controllerState!=='LIVE',alternative:'COEXISTENCE_OR_OFFLINE_TRANSFER'};
  if(tg.mode==='INACTIVE'){
   if(tg.epoch!==0||tg.routed!==0||tg.cutoff!==null||tg.plan_digest!==null||baselineRows.length||activity.length||route.destination!=='SOURCE'||route.epoch!==0||route.acked!==1)return denial('PAN473_INACTIVE_TARGET_OR_ROUTING_CONTRADICTION');
   const old=reconcilePan472DraftTransfer({root});
   const virgin=old.outcome==='UNKNOWN'&&old.quarantine.length===1&&old.quarantine[0].code==='TARGET_NOT_TRANSFERRED'
    &&target.prepare('SELECT COUNT(*) AS n FROM objects').get().n===0&&target.prepare('SELECT COUNT(*) AS n FROM receipts').get().n===0;
   if(!virgin&&old.outcome!=='VERIFIED')return denial('PAN473_PREACTIVATION_TARGET_RECONCILIATION_REQUIRED');
   const phase=sg.mode==='ACTIVE'?'PREPARED':old.outcome==='VERIFIED'&&old.throughSequence===head?'HELD_SOURCE_FENCED_ACTIVATION_REQUIRED':'HELD_SOURCE_FENCED_FINAL_TRANSFER_REQUIRED';
   return {...base,outcome:phase,coverage:phase==='PREPARED'?'KNOWN_PREPARATION':'HELD_NO_WRITER',canRecover:sg.mode==='FENCED'};
  }
  if(sg.mode!=='FENCED'||tg.epoch!==1||tg.cutoff!==head||tg.cutoff_digest!==digest(sourceRows)||tg.plan_digest!==plan.planDigest||!guardsMatch(target,TARGET_GUARDS))return denial('PAN473_ACTIVATED_EPOCH_SOURCE_FENCE_OR_GUARDS_MISMATCH');
  if(baselineRows.length>PAN472_LIMITS_V1.objects||canonicalJson(baselineRows.map(r=>JSON.parse(r.record)))!==canonicalJson(sourceRows)
   ||baselineRows.some(r=>JSON.parse(r.record).id!==r.id))return denial('PAN473_ORIGINAL_IMPORTED_EVIDENCE_MISMATCH');
  const cursor=metadata(target,'cursor');
  if(!exact(cursor,['sourceIdentity','sourceGeneration','throughSequence','mappingDigest','expectedStateDigest','operationKey'])
   ||cursor.sourceIdentity!==m.sourceIdentity||cursor.sourceGeneration!==m.sourceGeneration||cursor.throughSequence!==head
   ||cursor.mappingDigest!==PAN472_MAPPING_DIGEST_V1||cursor.expectedStateDigest!==digest(sourceRows))return denial('PAN473_IMPORTED_CURSOR_BINDING_MISMATCH');
  const approvals=target.prepare('SELECT operation_key,plan_digest,owner FROM approvals ORDER BY operation_key LIMIT ?').all(PAN472_LIMITS_V1.events+1);
  const dedup=target.prepare('SELECT operation_key,plan_digest FROM dedup ORDER BY operation_key LIMIT ?').all(PAN472_LIMITS_V1.events+1);
  const receipts=target.prepare('SELECT operation_key,receipt FROM receipts ORDER BY operation_key LIMIT ?').all(PAN472_LIMITS_V1.events+1);
  if(!receipts.length||receipts.length>PAN472_LIMITS_V1.events||approvals.length!==receipts.length||dedup.length!==receipts.length)return denial('PAN473_ORIGINAL_APPROVAL_DEDUP_RECEIPT_SET_MISMATCH');
  const approve=new Map(approvals.map(r=>[r.operation_key,r])),duplicates=new Map(dedup.map(r=>[r.operation_key,r]));let finalReceipt=false;
  for(const stored of receipts){
   const r=JSON.parse(stored.receipt),{receiptDigest,...core}=r;
   if(!integer(r.fromSequence)||!integer(r.throughSequence)||r.fromSequence>=r.throughSequence||r.throughSequence>head||!integer(r.committedAtMs)
    ||r.schemaVersion!==PAN472_RECEIPT_V1||r.sourceIdentity!==m.sourceIdentity||r.sourceGeneration!==m.sourceGeneration||r.targetIdentity!==m.targetIdentity
    ||r.operationKey!==stored.operation_key||r.mappingDigest!==PAN472_MAPPING_DIGEST_V1||r.scope!=='LOCAL_SYNTHETIC_DISPOSABLE'||r.atomicTargetAndDedup!==true||r.outsideEffectCount!==0
    ||digest(core)!==receiptDigest||approve.get(r.operationKey)?.owner!=='LOCAL_SYNTHETIC_OWNER'||approve.get(r.operationKey)?.plan_digest!==r.planDigest||duplicates.get(r.operationKey)?.plan_digest!==r.planDigest)return denial('PAN473_ORIGINAL_IMPORT_RECEIPT_BINDING_MISMATCH');
   const expected=histories.get(r.throughSequence),kind=r.fromSequence===0?'SNAPSHOT':'DELTA';
   const op={sourceIdentity:m.sourceIdentity,sourceGeneration:m.sourceGeneration,targetIdentity:m.targetIdentity,kind,fromSequence:r.fromSequence,throughSequence:r.throughSequence};
   const operationKey='admin-ai:poc:pan472-import:'+digest(op);
   const originalPlan={schemaVersion:PAN472_PLAN_V1,scope:'LOCAL_SYNTHETIC_DISPOSABLE',tenant:m.tenant,...op,operationKey,mappingDigest:PAN472_MAPPING_DIGEST_V1,
    rows:kind==='SNAPSHOT'?expected:events.filter(e=>e.sequence>r.fromSequence&&e.sequence<=r.throughSequence),expectedStateDigest:digest(expected),outsideEffects:'DISABLED'};
   if(operationKey!==r.operationKey||digest(originalPlan)!==r.planDigest||digest(expected)!==r.expectedStateDigest)return denial('PAN473_ORIGINAL_SOURCE_PLAN_RECONSTRUCTION_MISMATCH');
   if(r.operationKey===cursor.operationKey&&r.throughSequence===head&&r.expectedStateDigest===cursor.expectedStateDigest)finalReceipt=true;
  }
  if(!finalReceipt)return denial('PAN473_FINAL_IMPORT_RECEIPT_REQUIRED');
  if(activity.length+head>PAN472_LIMITS_V1.events)return denial('PAN473_TARGET_HISTORY_BOUND');
  const reconstructed=new Map(sourceRows.map(r=>[r.id,r])),originalById=new Map(sourceRows.map(r=>[r.id,r]));
  const laterChangedFields=new Map();
  for(let i=0;i<activity.length;i++){
   const stored=activity[i],e=JSON.parse(stored.event),{eventDigest,...core}=e;
   if(!exact(e,['schemaVersion','scopeDigest','epoch','kind','ordinal','beforeDigest','record','correction','atMs','eventDigest'])
    ||e.schemaVersion!==PAN473_EVENT_V1||e.scopeDigest!==p.scopeDigest||e.epoch!==tg.epoch||!['WRITE','FORWARD_CORRECTION'].includes(e.kind)
    ||e.ordinal!==i+1||stored.ordinal!==i+1||!integer(e.atMs)||digest(core)!==eventDigest||!exact(e.record,['id','kind','revision','deleted','body','sequence']))return denial('PAN473_TARGET_EVENT_BINDING_MISMATCH');
   const {sequence,...r}=e.record;validateRecord(r);const before=reconstructed.get(r.id)??null;
   if(sequence!==head+i+1||e.beforeDigest!==digest(before)||r.revision!==(before?.revision??0)+1||before?.deleted||before&&before.kind!==r.kind||r.deleted&&!before)return denial('PAN473_TARGET_HISTORY_REVISION_OR_PRIOR_STATE_MISMATCH');
   if(e.kind==='WRITE'){if(e.correction!==null)return denial('PAN473_TARGET_EVENT_KIND_MISMATCH');}
   else{
    const c=e.correction,old=originalById.get(r.id);
    if(!exact(c,['id','originalRevision','field','expectedOriginalValue','correctedValue','originalDigest'])||c.id!==r.id||!old||!before||old.deleted||before.deleted
     ||!['quantityMicros','priceMinor','amountMinor'].includes(c.field)||!Object.hasOwn(old.body,c.field)||old.revision!==c.originalRevision
     ||digest(old)!==c.originalDigest||old.body[c.field]!==c.expectedOriginalValue||before.body[c.field]!==c.expectedOriginalValue
     ||!integer(c.correctedValue)||r.deleted||r.kind!==before.kind||canonicalJson(r.body)!==canonicalJson({...before.body,[c.field]:c.correctedValue}))return denial('PAN473_FORWARD_CORRECTION_CLOBBERS_LATER_WORK_OR_ORIGINAL_EVIDENCE');
    // Reconstructed material changes are historical facts, not writer flags.
    if(laterChangedFields.get(r.id)?.has(c.field))return denial('PAN473_FORWARD_CORRECTION_CLOBBERS_LATER_WORK_OR_ORIGINAL_EVIDENCE');
   }
   if(before){
    const changed=laterChangedFields.get(r.id)??new Set();
    for(const field of ['quantityMicros','priceMinor','amountMinor'])if(before.body?.[field]!==r.body?.[field])changed.add(field);
    laterChangedFields.set(r.id,changed);
   }
   reconstructed.set(r.id,e.record);
   if(reconstructed.size>PAN472_LIMITS_V1.objects||references(ordered(reconstructed.values())).length)return denial('PAN473_TARGET_EVENT_REFERENCES_OR_SEMANTICS');
  }
  const actual=target.prepare('SELECT id,kind,revision,deleted,body,sequence FROM objects ORDER BY id LIMIT ?').all(PAN472_LIMITS_V1.objects+1).map(decodeRow);
  if(canonicalJson(actual)!==canonicalJson(ordered(reconstructed.values())))return denial('PAN473_ACTUAL_TARGET_VS_INDEPENDENT_HISTORY_MISMATCH');
  let outcome;
  if(route.destination==='SOURCE'&&route.epoch===0&&route.acked===1&&tg.routed===0)outcome='HELD_ACTIVATED_ROUTING_REQUIRED';
  else if(route.destination==='TARGET'&&route.epoch===1&&route.acked===0&&[0,1].includes(tg.routed))outcome='HELD_ROUTING_ACK_REQUIRED';
  else if(route.destination==='TARGET'&&route.epoch===1&&route.acked===1&&tg.routed===1)outcome='ACTIVE';
  else return denial('PAN473_NATIVE_ROUTING_ACK_OR_EPOCH_MISMATCH');
  return {...base,outcome,coverage:outcome==='ACTIVE'?'BOUNDED_SCOPE_VERIFIED':'HELD_NO_WRITER',complete:outcome==='ACTIVE',canRecover:true,
   targetObjectCount:actual.length,originalReceiptCount:receipts.length,originalEvidencePreserved:true,laterTargetWorkVerified:activity.length>0,
   simpleOldStateRollbackAllowed:false,currentSourceCoverage:'FINAL_FENCED_CUTOFF'};
 }catch(error){return denial(error.message);}finally{scope?.close();target?.close();source?.close();}
}
