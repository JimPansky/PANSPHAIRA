// Original MIG-03, actual existing SQLite draft scope and composed cutover entry.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { canonicalJson,digest } from '../../src/pan472/draft-profile.mjs';
import * as draft from '../../src/pan472/persistent-draft-transfer.mjs';
const entry=new URL('../../src/pan473/writer-scope-cutover.mjs',import.meta.url);
const diagnosis=new URL('../../src/pan473/independent-scope-diagnosis.mjs',import.meta.url);
const rows=()=>[
 {id:'synthetic:customer-7',kind:'customer',revision:1,deleted:false,body:{nativeId:7,name:'Synthetic Customer'}},
 {id:'synthetic:order-42',kind:'order',revision:1,deleted:false,body:{customerId:'synthetic:customer-7',date:1767225600,refClient:'CM-ADMIN-AI-ESCALATION-001',status:'DRAFT',currency:'EUR',amountMinor:2500}},
 {id:'synthetic:line-1',kind:'line',revision:1,deleted:false,body:{orderId:'synthetic:order-42',quantityMicros:2000000,unit:'piece',priceMinor:1250}},
];
function fixture(){
 const parent=mkdtempSync(join(tmpdir(),'pan473-original-')),root=join(parent,'pan472-owned-v1');
 draft.initializePan472SyntheticDraftStores({root});draft.writePan472SyntheticSource({root,changes:rows()});
 const {plan}=draft.capturePan472TransferPlan({root});const grant=draft.authorizePan472Transfer({root,plan,owner:'LOCAL_SYNTHETIC_OWNER'});
 draft.executePan472DraftTransfer({root,plan,grant});
 return {root,close(){rmSync(parent,{recursive:true,force:true});}};
}
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
function sql(root,which,query,params=[]){const db=new DatabaseSync(join(root,which+'.sqlite'));try{return db.prepare(query).all(...params);}finally{db.close();}}
async function cutover(api,root){const {plan}=api.capturePan473CutoverPlan({root});assert.ok(plan);const grant=api.authorizePan473Scope({root,plan,owner:'LOCAL_SYNTHETIC_OWNER'});return api.executePan473Cutover({root,plan,grant});}

test('MIG-03-AC01 actual source writer and native batch are fenced, final delta verified, target epoch and route read back',async()=>{
 const api=await import(entry),check=await import(diagnosis),x=fixture();try{
  api.initializePan473WriterScope({root:x.root,sourceCapability:'NATIVE_SQLITE_EPOCH_FENCE'});
  draft.writePan472SyntheticSource({root:x.root,changes:[{...rows()[2],revision:2,body:{...rows()[2].body,priceMinor:1500}}]});
  const r=await cutover(api,x.root);assert.equal(r.outcome,'ACTIVE');assert.equal(r.epoch,1);
  const before=hash(join(x.root,'source.sqlite'));
  assert.throws(()=>draft.writePan472SyntheticSource({root:x.root,changes:[{...rows()[2],revision:3}]}),/PAN473_SOURCE_FENCED_DENIED/);
  assert.throws(()=>sql(x.root,'source','UPDATE objects SET revision=revision+1 WHERE id=? RETURNING id',['synthetic:line-1']),/PAN473_SOURCE_FENCED_DENIED/);
  assert.equal(hash(join(x.root,'source.sqlite')),before);
  const d=check.diagnosePan473WriterScope({root:x.root});assert.equal(d.outcome,'ACTIVE',JSON.stringify(d));assert.equal(d.readOnly,true);assert.equal(d.sourceCutoff,4);assert.equal(d.targetEpoch,1);assert.equal(d.routing,'TARGET');assert.equal(d.outsideEffectCount,0);
 }finally{x.close();}
});

test('MIG-03-AC03 later target work forbids old-state rollback and permits only non-clobbering forward correction',async()=>{
 const api=await import(entry),check=await import(diagnosis),x=fixture();try{
  api.initializePan473WriterScope({root:x.root,sourceCapability:'NATIVE_SQLITE_EPOCH_FENCE'});await cutover(api,x.root);
  const original=sql(x.root,'target','SELECT operation_key,receipt FROM receipts ORDER BY operation_key');
  const grant=api.authorizePan473TargetWrite({root:x.root,epoch:1,owner:'LOCAL_SYNTHETIC_OWNER'});
  api.writePan473Target({root:x.root,epoch:1,grant,changes:[{...rows()[2],revision:2,body:{...rows()[2].body,priceMinor:1750}}]});
  assert.throws(()=>api.requestPan473OldStateRollback({root:x.root,owner:'LOCAL_SYNTHETIC_OWNER'}),/NEW_TARGET_WORK_PREVENTS_OLD_STATE_ROLLBACK/);
  api.correctPan473HistoricalField({root:x.root,epoch:1,grant,id:'synthetic:line-1',originalRevision:1,field:'quantityMicros',expectedOriginalValue:2000000,correctedValue:3000000});
  const live=JSON.parse(sql(x.root,'target','SELECT body FROM objects WHERE id=?',['synthetic:line-1'])[0].body);
  assert.equal(live.priceMinor,1750);assert.equal(live.quantityMicros,3000000);assert.deepEqual(sql(x.root,'target','SELECT operation_key,receipt FROM receipts ORDER BY operation_key'),original);
  assert.throws(()=>api.correctPan473HistoricalField({root:x.root,epoch:1,grant,id:'synthetic:line-1',originalRevision:1,field:'priceMinor',expectedOriginalValue:1250,correctedValue:1500}),/LATER_VALID_FIELD_CONFLICT/);
  const d=check.diagnosePan473WriterScope({root:x.root});assert.equal(d.outcome,'ACTIVE',JSON.stringify(d));assert.equal(d.targetEventCount,2);
 }finally{x.close();}
});

test('MIG-03-AC04 unsupported source retains explicit coexistence/offline alternative, never fake cutover',async()=>{
 const api=await import(entry),check=await import(diagnosis),x=fixture();try{
  const before=hash(join(x.root,'source.sqlite'));
  const r=api.initializePan473WriterScope({root:x.root,sourceCapability:'NO_FENCE_GUARANTEE'});assert.equal(r.outcome,'COEXISTENCE_OR_OFFLINE_TRANSFER_REQUIRED');
  assert.equal(hash(join(x.root,'source.sqlite')),before);
  assert.equal(api.capturePan473CutoverPlan({root:x.root}).outcome,'COEXISTENCE_OR_OFFLINE_TRANSFER_REQUIRED');
  assert.equal(check.diagnosePan473WriterScope({root:x.root}).outcome,'COEXISTENCE_OR_OFFLINE_TRANSFER_REQUIRED');
  draft.writePan472SyntheticSource({root:x.root,changes:[{...rows()[2],revision:2}]});
 }finally{x.close();}
});

test('MAIN-AC03-ABA-01 actual writer refuses historical correction after valid same-field A -> B -> A while untouched other field remains correctable',async()=>{
 const api=await import(entry),check=await import(diagnosis),x=fixture();try{
  api.initializePan473WriterScope({root:x.root,sourceCapability:'NATIVE_SQLITE_EPOCH_FENCE'});await cutover(api,x.root);
  const original=sql(x.root,'target','SELECT operation_key,receipt FROM receipts ORDER BY operation_key');
  const grant=api.authorizePan473TargetWrite({root:x.root,epoch:1,owner:'LOCAL_SYNTHETIC_OWNER'});
  for(const [revision,priceMinor] of [[2,1750],[3,1250]])api.writePan473Target({root:x.root,epoch:1,grant,changes:[{...rows()[2],revision,body:{...rows()[2].body,priceMinor}}]});
  const before=hash(join(x.root,'target.sqlite'));
  assert.throws(()=>api.correctPan473HistoricalField({root:x.root,epoch:1,grant,id:'synthetic:line-1',originalRevision:1,field:'priceMinor',expectedOriginalValue:1250,correctedValue:1500}),/LATER_VALID_FIELD_CONFLICT/);
  assert.equal(hash(join(x.root,'target.sqlite')),before);assert.equal(check.diagnosePan473WriterScope({root:x.root}).targetEventCount,2);
  api.correctPan473HistoricalField({root:x.root,epoch:1,grant,id:'synthetic:line-1',originalRevision:1,field:'quantityMicros',expectedOriginalValue:2000000,correctedValue:3000000});
  const live=JSON.parse(sql(x.root,'target','SELECT body FROM objects WHERE id=?',['synthetic:line-1'])[0].body);
  assert.equal(live.priceMinor,1250);assert.equal(live.quantityMicros,3000000);
  assert.deepEqual(sql(x.root,'target','SELECT operation_key,receipt FROM receipts ORDER BY operation_key'),original);
  const d=check.diagnosePan473WriterScope({root:x.root});assert.equal(d.outcome,'ACTIVE',JSON.stringify(d));assert.equal(d.targetEventCount,3);
 }finally{x.close();}
});

test('MAIN-AC03-ABA-01 independent native diagnosis rejects correctly re-digested clobbering correction after valid A -> B -> A',async()=>{
 const api=await import(entry),check=await import(diagnosis),x=fixture();try{
  api.initializePan473WriterScope({root:x.root,sourceCapability:'NATIVE_SQLITE_EPOCH_FENCE'});await cutover(api,x.root);
  const grant=api.authorizePan473TargetWrite({root:x.root,epoch:1,owner:'LOCAL_SYNTHETIC_OWNER'});
  for(const [revision,priceMinor] of [[2,1750],[3,1250]])api.writePan473Target({root:x.root,epoch:1,grant,changes:[{...rows()[2],revision,body:{...rows()[2].body,priceMinor}}]});
  const baseline=JSON.parse(sql(x.root,'target','SELECT record FROM pan473_baseline WHERE id=?',['synthetic:line-1'])[0].record);
  const prior=JSON.parse(sql(x.root,'target','SELECT event FROM pan473_target_events WHERE ordinal=2')[0].event).record;
  const record={...prior,revision:4,sequence:6,body:{...prior.body,priceMinor:1500}};
  const scopeDigest=check.diagnosePan473WriterScope({root:x.root}).scopeDigest;
  const core={schemaVersion:'pansphaira.pan473/target-activity/v1',scopeDigest,epoch:1,kind:'FORWARD_CORRECTION',ordinal:3,beforeDigest:digest(prior),record,
   correction:{id:record.id,originalRevision:1,field:'priceMinor',expectedOriginalValue:1250,correctedValue:1500,originalDigest:digest(baseline)},atMs:Date.now()};
  // Adversarial trusted-host native SQL: not code-owned grant authority.
  // No dropped triggers or mocked database. Re-digested integrity is not semantic acceptance.
  const db=new DatabaseSync(join(x.root,'target.sqlite'));try{
   db.function('pan473_writer_epoch',()=>1);db.function('pan473_route_ready',()=>1);db.exec('BEGIN IMMEDIATE');
   db.prepare('UPDATE objects SET revision=?,body=?,sequence=? WHERE id=?').run(4,canonicalJson(record.body),6,record.id);
   db.prepare('INSERT INTO pan473_target_events VALUES(?,?)').run(3,canonicalJson({...core,eventDigest:digest(core)}));db.exec('COMMIT');
  }finally{db.close();}
  const before=hash(join(x.root,'target.sqlite')),d=check.diagnosePan473WriterScope({root:x.root});
  assert.equal(d.outcome,'UNKNOWN',JSON.stringify(d));assert.equal(d.complete,false);assert.equal(d.readOnly,true);
  assert.equal(d.quarantine[0].code,'PAN473_FORWARD_CORRECTION_CLOBBERS_LATER_WORK_OR_ORIGINAL_EVIDENCE');
  assert.equal(hash(join(x.root,'target.sqlite')),before);
  await assert.rejects(()=>api.recoverPan473Cutover({root:x.root,owner:'LOCAL_SYNTHETIC_OWNER'}),/RECOVERY_ACTUAL_GATES_REQUIRED_DENIED/);
 }finally{x.close();}
});
