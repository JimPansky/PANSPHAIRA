// Original MIG-03 actual multi-process writer/batch and SIGKILL/CLI qualification.
// Process crash only: not power loss, hostsandbox or production qualification.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fork,spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import * as draft from '../../src/pan472/persistent-draft-transfer.mjs';
import * as api from '../../src/pan473/writer-scope-cutover.mjs';
import {diagnosePan473WriterScope} from '../../src/pan473/independent-scope-diagnosis.mjs';
const cli=new URL('../../scripts/run-pan473-writer-scope-cutover.mjs',import.meta.url),client=new URL('../fixtures/pan473/native-scope-client.mjs',import.meta.url);
const owner='LOCAL_SYNTHETIC_OWNER';
const rows=()=>[
 {id:'synthetic:customer-7',kind:'customer',revision:1,deleted:false,body:{nativeId:7,name:'Synthetic Customer'}},
 {id:'synthetic:order-42',kind:'order',revision:1,deleted:false,body:{customerId:'synthetic:customer-7',date:1767225600,refClient:'CM-ADMIN-AI-ESCALATION-001',status:'DRAFT',currency:'EUR',amountMinor:2500}},
 {id:'synthetic:line-1',kind:'line',revision:1,deleted:false,body:{orderId:'synthetic:order-42',quantityMicros:2000000,unit:'piece',priceMinor:1250}},
];
function fixture({virgin=false}={}){
 const parent=mkdtempSync(join(tmpdir(),'pan473-process-')),root=join(parent,'pan472-owned-v1');draft.initializePan472SyntheticDraftStores({root});draft.writePan472SyntheticSource({root,changes:rows()});
 const {plan}=draft.capturePan472TransferPlan({root});if(!virgin)draft.executePan472DraftTransfer({root,plan,grant:draft.authorizePan472Transfer({root,plan,owner})});
 return {root,parent,oldPlan:plan,close(){rmSync(parent,{recursive:true,force:true});}};
}
function read(root,which,query,values=[]){const db=new DatabaseSync(join(root,which+'.sqlite'),{readOnly:true});try{return db.prepare(query).all(...values);}finally{db.close();}}
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const storeHashes=root=>Object.fromEntries(['source','target','pan473-scope'].map(which=>[which,hash(join(root,which+'.sqlite'))]));
function command(...args){const r=spawnSync(process.execPath,[cli.pathname,...args],{encoding:'utf8',timeout:15000});assert.equal(r.error,undefined);const body=JSON.parse(r.stdout.trim());return {...r,body};}
function success(...args){const r=command(...args);assert.equal(r.status,0,r.stdout+r.stderr);return r.body;}
function start(file,args){
 const child=fork(file,args,{stdio:['ignore','pipe','pipe','ipc']});let output='';child.stdout.on('data',s=>{output+=s;});child.stderr.on('data',s=>{output+=s;});
 const closed=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal,output})));return {child,closed};
}
function message(child,action){return new Promise((resolve,reject)=>{
 const onError=e=>{cleanup();reject(e);},onExit=(c,s)=>{cleanup();reject(Error('Owned client exited before expected IPC '+c+' '+s));},onMessage=m=>{cleanup();resolve(m);};
 const cleanup=()=>{child.off('error',onError);child.off('exit',onExit);child.off('message',onMessage);};
 child.once('error',onError);child.once('exit',onExit);child.once('message',onMessage);if(action)child.send(action);
});}
async function stop(handle){if(handle.child.exitCode===null&&handle.child.signalCode===null)handle.child.send({action:'EXIT'});return handle.closed;}
async function cutover(root){const {plan}=api.capturePan473CutoverPlan({root});return api.executePan473Cutover({root,plan,grant:api.authorizePan473Scope({root,plan,owner})});}

test('MIG-03-AC01 actual already-running old writer and already-open native batch both write before fence and are denied after fence', {timeout:30000},async()=>{
 const x=fixture(),children=[];try{
  success('prepare','--root',x.root,'--source-capability','NATIVE_SQLITE_EPOCH_FENCE');
  for(const mode of ['old-writer','old-batch']){const h=start(client,[x.root,mode]);children.push(h);const ready=await message(h.child);assert.equal(ready.outcome,'READY');assert.equal(ready.pid,h.child.pid);assert.equal(ready.preopenedNativeBatchConnection,mode==='old-batch');}
  assert.notEqual(children[0].child.pid,children[1].child.pid);
  const beforeWriter=await message(children[0].child,{action:'WRITE',change:{...rows()[2],revision:2,body:{...rows()[2].body,priceMinor:1500}}});assert.equal(beforeWriter.outcome,'SOURCE_WRITTEN',JSON.stringify(beforeWriter));
  const beforeBatch=await message(children[1].child,{action:'WRITE',change:{...rows()[2],revision:3,body:{...rows()[2].body,priceMinor:1550}}});assert.equal(beforeBatch.outcome,'SOURCE_WRITTEN',JSON.stringify(beforeBatch));
  const active=success('cutover','--root',x.root,'--owner',owner);assert.equal(active.outcome,'ACTIVE');assert.equal(active.epoch,1);assert.equal(active.verification.sourceCutoff,5);
  const before=hash(join(x.root,'source.sqlite'));
  for(const h of children){const denied=await message(h.child,{action:'WRITE',change:{...rows()[2],revision:4}});assert.equal(denied.pid,h.child.pid);assert.equal(denied.outcome,'DENIED');assert.match(denied.code,/PAN473_SOURCE_FENCED_DENIED/);}
  assert.equal(hash(join(x.root,'source.sqlite')),before);
  const native=read(x.root,'target','SELECT revision,body,sequence FROM objects WHERE id=?',['synthetic:line-1'])[0];assert.equal(native.revision,3);assert.equal(native.sequence,5);assert.equal(JSON.parse(native.body).priceMinor,1550);
  const hashes=storeHashes(x.root),d=success('diagnose','--root',x.root);assert.equal(d.outcome,'ACTIVE');assert.equal(d.controllerDown,true);assert.equal(d.readOnly,true);assert.deepEqual(storeHashes(x.root),hashes);
 }finally{for(const h of children)await stop(h);x.close();}
});

for(const [phase,held] of [
 ['AFTER_SOURCE_FENCE','HELD_SOURCE_FENCED_FINAL_TRANSFER_REQUIRED'],
 ['AFTER_TARGET_ACTIVATION','HELD_ACTIVATED_ROUTING_REQUIRED'],
 ['BEFORE_ROUTING_ACK','HELD_ROUTING_ACK_REQUIRED'],
])test('MIG-03-AC02 actual SIGKILL '+phase+'; controller-down SQL diagnosis and fresh-process recovery without duplicate import/epoch', {timeout:30000},async()=>{
 const x=fixture();let h;try{
  success('prepare','--root',x.root,'--source-capability','NATIVE_SQLITE_EPOCH_FENCE');
  draft.writePan472SyntheticSource({root:x.root,changes:[{...rows()[2],revision:2,body:{...rows()[2].body,priceMinor:1500}}]});
  h=start(cli,['cutover','--root',x.root,'--owner',owner,'--pause-after',phase]);const boundary=await message(h.child);
  assert.equal(boundary.phase,phase);assert.equal(boundary.pid,h.child.pid);
  const live=diagnosePan473WriterScope({root:x.root});assert.equal(live.outcome,held,JSON.stringify(live));assert.equal(live.controllerState,'LIVE');assert.equal(live.sourceFenced,true);
  const conflict=command('recover','--root',x.root,'--owner',owner);assert.equal(conflict.status,2);assert.match(conflict.body.code,/CONTROLLER_LIVE_OR_UNKNOWN_DENIED/);
  assert.throws(()=>api.authorizePan473TargetWrite({root:x.root,epoch:1,owner}),/CURRENT_TARGET_EPOCH_REQUIRED_DENIED/);
  assert.throws(()=>draft.writePan472SyntheticSource({root:x.root,changes:[{...rows()[2],revision:3}]}),/PAN473_SOURCE_FENCED_DENIED/);
  assert.equal(h.child.kill('SIGKILL'),true);const exited=await h.closed;assert.equal(exited.signal,'SIGKILL');
  const hashes=storeHashes(x.root),down=success('diagnose','--root',x.root);assert.equal(down.outcome,held,JSON.stringify(down));assert.equal(down.controllerState,'DEAD');assert.equal(down.controllerDown,true);assert.equal(down.readOnly,true);assert.deepEqual(storeHashes(x.root),hashes);
  const recovered=success('recover','--root',x.root,'--owner',owner);assert.equal(recovered.outcome,'ACTIVE');assert.equal(recovered.epoch,1);assert.equal(recovered.verification.sourceCutoff,4);
  const receipts=read(x.root,'target','SELECT operation_key,receipt FROM receipts ORDER BY operation_key');assert.equal(receipts.length,2);
  assert.equal(read(x.root,'target','SELECT COUNT(*) AS n FROM dedup')[0].n,2);assert.equal(read(x.root,'target','SELECT COUNT(*) AS n FROM pan473_target_events')[0].n,0);
  assert.equal(read(x.root,'source','SELECT COUNT(*) AS n FROM events')[0].n,4);
  const target=read(x.root,'target','SELECT revision,body FROM objects WHERE id=?',['synthetic:line-1'])[0];assert.equal(target.revision,2);assert.equal(JSON.parse(target.body).priceMinor,1500);
  success('recover','--root',x.root,'--owner',owner);assert.deepEqual(read(x.root,'target','SELECT operation_key,receipt FROM receipts ORDER BY operation_key'),receipts);
  const final=success('diagnose','--root',x.root);assert.equal(final.outcome,'ACTIVE');assert.equal(final.targetEpoch,1);assert.equal(final.routingAcked,true);assert.equal(final.outsideEffectCount,0);assert.equal(final.controllerDown,true);
 }finally{if(h&&h.child.exitCode===null&&h.child.signalCode===null){h.child.kill('SIGKILL');await h.closed;}x.close();}
});

test('MIG-03-AC03 actual CLI later work, untouched-field forward correction, stale native import and old-state refusal', {timeout:30000},async()=>{
 const x=fixture();try{
  success('prepare','--root',x.root,'--source-capability','NATIVE_SQLITE_EPOCH_FENCE');success('cutover','--root',x.root,'--owner',owner);
  const baseline=read(x.root,'target','SELECT operation_key,receipt FROM receipts ORDER BY operation_key');
  const input=join(x.parent,'synthetic-changes.json');writeFileSync(input,JSON.stringify([{...rows()[2],revision:2,body:{...rows()[2].body,priceMinor:1750}}]));
  assert.equal(success('write','--root',x.root,'--owner',owner,'--epoch','1','--input',input).outcome,'TARGET_WRITTEN');
  writeFileSync(input,JSON.stringify({id:'synthetic:line-1',originalRevision:1,field:'quantityMicros',expectedOriginalValue:2000000,correctedValue:3000000}));
  assert.equal(success('correct','--root',x.root,'--owner',owner,'--epoch','1','--input',input).outcome,'FORWARD_CORRECTED');
  const hashes=storeHashes(x.root);assert.throws(()=>api.importPan473LateDraft({root:x.root,plan:x.oldPlan,owner}),/STALE_LATE_IMPORT_DENIED/);
  // Unchanged legacy replay observes later target data and quarantines instead of replaying.
  assert.throws(()=>draft.executePan472DraftTransfer({root:x.root,plan:x.oldPlan,grant:draft.authorizePan472Transfer({root:x.root,plan:x.oldPlan,owner})}),/TARGET_RECONCILIATION_QUARANTINED/);
  // Actual native import metadata is also guarded, even a no-op UPDATE.
  const legacy=new DatabaseSync(join(x.root,'target.sqlite'));try{assert.throws(()=>legacy.prepare('UPDATE approvals SET owner=owner WHERE operation_key=?').run(x.oldPlan.operationKey),/PAN473_LATE_IMPORT_OR_OLD_EVIDENCE_MUTATION_DENIED/);}finally{legacy.close();}
  const rollback=command('request-old-state','--root',x.root,'--owner',owner);assert.equal(rollback.status,2);assert.match(rollback.body.code,/NEW_TARGET_WORK_PREVENTS_OLD_STATE_ROLLBACK/);
  const stale=command('write','--root',x.root,'--owner',owner,'--epoch','2','--input',input);assert.equal(stale.status,2);assert.match(stale.body.code,/CURRENT_TARGET_EPOCH_REQUIRED_DENIED/);
  assert.deepEqual(storeHashes(x.root),hashes);assert.deepEqual(read(x.root,'target','SELECT operation_key,receipt FROM receipts ORDER BY operation_key'),baseline);
  const body=JSON.parse(read(x.root,'target','SELECT body FROM objects WHERE id=?',['synthetic:line-1'])[0].body);assert.equal(body.priceMinor,1750);assert.equal(body.quantityMicros,3000000);
  const down=success('diagnose','--root',x.root);assert.equal(down.outcome,'ACTIVE');assert.equal(down.targetEventCount,2);assert.equal(down.controllerDown,true);
 }finally{x.close();}
});

test('MIG-03-AC04 actual independent controller-down CLI detects contradictory native routing and refuses recovery read-only', {timeout:30000},async()=>{
 const x=fixture();try{
  success('prepare','--root',x.root,'--source-capability','NATIVE_SQLITE_EPOCH_FENCE');await cutover(x.root);
  const db=new DatabaseSync(join(x.root,'pan473-scope.sqlite'));try{db.prepare('UPDATE routing SET epoch=? WHERE id=1').run(2);}finally{db.close();}
  const before=storeHashes(x.root),bad=command('diagnose','--root',x.root);assert.equal(bad.status,2);assert.equal(bad.body.outcome,'UNKNOWN');assert.equal(bad.body.readOnly,true);assert.equal(bad.body.complete,false);assert.equal(bad.body.quarantine[0].code,'PAN473_NATIVE_ROUTING_ACK_OR_EPOCH_MISMATCH');
  const recovery=command('recover','--root',x.root,'--owner',owner);assert.equal(recovery.status,2);assert.match(recovery.body.code,/RECOVERY_ACTUAL_GATES_REQUIRED_DENIED/);assert.deepEqual(storeHashes(x.root),before);
 }finally{x.close();}
});

test('MIG-03-AC01 virgin target snapshot cutover uses actual inherited import and verifies its immutable original evidence', {timeout:30000},async()=>{
 const x=fixture({virgin:true});try{success('prepare','--root',x.root,'--source-capability','NATIVE_SQLITE_EPOCH_FENCE');const result=success('cutover','--root',x.root,'--owner',owner);assert.equal(result.outcome,'ACTIVE');assert.equal(result.verification.sourceCutoff,3);assert.equal(result.verification.originalReceiptCount,1);}finally{x.close();}
});
