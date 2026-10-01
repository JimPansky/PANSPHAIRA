// Same live actor and captured module binding across an explicit IPC wait.
// Qualification-only fixture: not a scheduler, grant service or public daemon.
// All current bindings/permissions are independently parent-owned disk files.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createQualifiedRetainedModuleV1,retainedModuleBindingV1} from '../../src/pan466/qualified-retained-module.mjs';
import {retainedTreeV1,digestV1} from '../../src/pan464/retained-snapshot.mjs';
import {verifyRetainedBusinessV1} from '../../src/pan464/protected-oracle.mjs';
const config=JSON.parse(readFileSync(process.argv[2],'utf8'));
const json=p=>JSON.parse(readFileSync(p,'utf8'));
const send=m=>process.send?.({...m,pid:process.pid});
const panRoot=resolve(import.meta.dirname,'../..');
const targetHead=execFileSync('git',['rev-parse','HEAD'],{cwd:panRoot,encoding:'utf8'}).trim();
assert.equal(config.options.panRoot,panRoot);assert.equal(config.options.targetHead,targetHead);
const cases=new Set(['current-authorized','generation-changed','permission-revoked','generation-changed-and-revoked','fresh-compatible-rebinding']);
let active=false,waiting=null,stopping=false;
async function runFixture(m){
 assert.equal(active,false);assert(cases.has(m.case));active=true;
 const captured=retainedModuleBindingV1({targetHead,imageId:config.options.imageId,generation:m.case==='fresh-compatible-rebinding'?2:1});
 const c=createQualifiedRetainedModuleV1({...config.options,ownedRoot:m.ownedRoot,processBinding:captured,
  readCurrentModule:()=>json(m.currentModuleFile),readPermission:()=>json(m.writePermissionFile),readHistoryPermission:()=>json(m.historyPermissionFile),
  observePhase:async phase=>{
   if(phase!=='POST_ACTIVATION_WRITE_INTENT')return;
   assert.equal(waiting,null);
   const pause=new Promise(resolveResume=>{waiting={case:m.case,resolve:resolveResume};});
   send({kind:'sleeping',case:m.case,phase,capturedGeneration:captured.generation,capturedBindingDigest:digestV1(captured)});
   await pause;
   send({kind:'resumed',case:m.case,capturedGeneration:captured.generation,capturedBindingDigest:digestV1(captured)});
  }});
 send({kind:'fixture',case:m.case,namespace:c.namespace,capturedGeneration:captured.generation});
 try{
  const qualified=await c.qualifyPairs();assert.equal(qualified.classification,'LOCAL_SYNTHETIC_EXACT_NATIVE_PAIR');
  const source=await c.initialize();
  const upgraded=await c.upgrade({operation:'UPGRADE',planDigest:c.edge.nativePlan.planDigest});assert.equal(upgraded.outcome,'ACTIVE');
  const state=resolve(m.ownedRoot,'pan464-owned-v1/state');
  const checkpoint=resolve(m.ownedRoot,'pan464-owned-v1/checkpoint');
  const logs=resolve(m.ownedRoot,'pan464-owned-v1/internal-logs');
  const history=await c.readHistory({generation:captured.generation});
  assert.equal(history.classification,'HISTORICAL_OBSERVED_CONTENT_NOT_CURRENT_AUTHORITY');
  assert.equal(history.records.length,2);
  assert.deepEqual(history.records.map(r=>r.stage),['SOURCE','ACTIVE']);
  assert.deepEqual(history.records[0].content.producer.rows,source.producer.rows);
  assert.deepEqual(history.records[1].content.producer.rows,upgraded.observed.producer.rows);
  assert.deepEqual(history.records[1].content.consumer,upgraded.observed.consumer);
  const before={state:retainedTreeV1(state).digest,checkpoint:retainedTreeV1(checkpoint).digest,logs:retainedTreeV1(logs).digest,history:digestV1(history)};
  // This is the actual protected controller write entry, not a receipt/counter.
  let observed=null,denial=null;
  try{observed=await c.writeAfterActivation();}catch(error){denial=error.message;}
  const current=json(m.currentModuleFile),permission=json(m.writePermissionFile);
  const generationChanged=m.case==='generation-changed'||m.case==='generation-changed-and-revoked';
  const revoked=m.case==='permission-revoked'||m.case==='generation-changed-and-revoked';
  assert.equal(current.generation,generationChanged?captured.generation+1:captured.generation);
  assert.equal(permission.revoked,revoked);
  if(generationChanged||revoked){
   assert.equal(observed,null);
   assert.equal(denial,generationChanged?'PAN466_CURRENT_GENERATION_OR_COMPATIBILITY_CHANGED_HELD':'PAN464_PERMISSION_DENIED');
   assert.equal(retainedTreeV1(state).digest,before.state,'deferred denial must preserve actual retained data');
   assert.equal(retainedTreeV1(checkpoint).digest,before.checkpoint,'no checkpoint rewrite/restore');
   assert.equal(retainedTreeV1(logs).digest,before.logs,'neither native new-write job may start or emit completion');
   const recovered=await c.readRecovery();assert.equal(recovered.containers.length,0);assert.equal(recovered.retainedDigest,before.state);
   const historical=await c.readHistory({generation:captured.generation});assert.equal(digestV1(historical),before.history);
   assert.equal(retainedTreeV1(state).digest,before.state,'historical read is not write authority');
  }else{
   assert.equal(denial,null);
   assert.equal(verifyRetainedBusinessV1(observed,source.consumer,{postActivation:true}).outcome,'PASS');
   assert.equal(observed.consumer.postActivationDashboards,1);
   assert.notEqual(retainedTreeV1(state).digest,before.state);
   const historical=await c.readHistory({generation:captured.generation});assert.equal(historical.records.length,3);
   assert.deepEqual(historical.records.map(r=>r.stage),['SOURCE','ACTIVE','NEW_WRITES']);
   assert.deepEqual(historical.records[2].content.producer.rows,observed.producer.rows);
   assert.deepEqual(historical.records[2].content.consumer,observed.consumer);
  }
  // Intentionally emit no raw grant, native rows, history contents or log text.
  send({kind:'complete',case:m.case,classification:'LOCAL_SYNTHETIC_EXACT_NATIVE_MODULE_USE',outcome:'PASS',capturedGeneration:captured.generation,currentGeneration:current.generation,
   actualWritePermissionRevoked:permission.revoked,denial,nativeNewWriteObserved:observed!==null,historicalActualContentReadback:true,
   noNewNativeJobOrRetainedMutationOnDenial:observed===null,qualificationDigest:qualified.qualificationDigest});
 }finally{active=false;}
}
process.on('message',m=>{
 try{
  assert(m&&typeof m==='object');
  if(m.kind==='resume'){
   assert(waiting&&waiting.case===m.case);const paused=waiting;waiting=null;paused.resolve();return;
  }
  if(m.kind==='stop'){assert.equal(active,false);stopping=true;process.disconnect?.();return;}
  assert.equal(m.kind,'fixture');assert.equal(stopping,false);
  runFixture(m).catch(error=>{send({kind:'fatal',case:m.case,code:error.message});process.exitCode=1;process.disconnect?.();});
 }catch(error){send({kind:'fatal',case:m?.case,code:error.message});process.exitCode=1;process.disconnect?.();}
});
send({kind:'ready',targetHead});
