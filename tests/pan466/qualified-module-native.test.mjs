// Required LIFE-06 actual-native gate: no mock backend or skipped prerequisites.
// One separate live actor retains its own captured binding during typed IPC wait.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,fork} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {retainedModuleBindingV1} from '../../src/pan466/qualified-retained-module.mjs';
import {retainedPairPlanV1,SOURCE_PAN_V1,CONSUMER_KS_V1} from '../../src/pan464/retained-pair-plan.mjs';
import {digestV1,retainedTreeV1} from '../../src/pan464/retained-snapshot.mjs';
const panRoot=realpathSync(resolve(import.meta.dirname,'../..'));
const required=['PAN466_SOURCE_ROOT','PAN466_KS_ROOT','PAN466_IMAGE_ID','PAN466_OWNED_ROOT'];
for(const key of required)assert(process.env[key],`PAN466_NATIVE_PREREQUISITE_REQUIRED:${key}`);
const sourceRoot=realpathSync(process.env.PAN466_SOURCE_ROOT),ksRoot=realpathSync(process.env.PAN466_KS_ROOT),scratch=realpathSync(process.env.PAN466_OWNED_ROOT),imageId=process.env.PAN466_IMAGE_ID;
assert.match(imageId,/^sha256:[a-f0-9]{64}$/);
const targetHead=execFileSync('git',['rev-parse','HEAD'],{cwd:panRoot,encoding:'utf8'}).trim();
const options={panRoot,sourceRoot,ksRoot,targetHead,imageId};
const edge=retainedPairPlanV1({sourcePan:SOURCE_PAN_V1,targetPan:targetHead,consumerKs:CONSUMER_KS_V1,imageId,issuedAtMs:1});
const docker=args=>execFileSync('docker',args,{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']}).trim();
const put=(path,value)=>writeFileSync(path,JSON.stringify(value)+'\n',{mode:0o600});
const cases=['current-authorized','generation-changed','permission-revoked','generation-changed-and-revoked','fresh-compatible-rebinding'];

test('LIFE-06 AC03 same-PID deferred native use: current generation/security and actual historical content',async t=>{
 const root=mkdtempSync(join(scratch,'pan466-actor-'));
 const config=join(root,'actor.json');put(config,{options});
 const actor=fork(new URL('./qualified-module-process.mjs',import.meta.url),[config],{stdio:['ignore','pipe','pipe','ipc'],env:Object.fromEntries(['PATH','HOME','LANG','LC_ALL','TMPDIR'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]))});
 let output='';for(const stream of [actor.stdout,actor.stderr])stream.on('data',b=>{output=(output+b).slice(-6000);});
 const messages=[],pending=new Set();let failure=null;
 actor.on('message',m=>{
  messages.push(m);
  if(m.kind==='fatal'){failure=Error(`PAN466_NATIVE_ACTOR_FATAL:${m.code}`);for(const waiter of [...pending])waiter.reject(failure);}
  for(const waiter of [...pending])if(waiter.matches(m))waiter.resolve(m);
 });
 actor.on('error',e=>{failure=e;for(const waiter of [...pending])waiter.reject(e);});
 actor.on('exit',(code,signal)=>{
  if(code!==0||signal){failure=Error(`PAN466_NATIVE_ACTOR_EXIT:${code}:${signal}:${output}`);for(const waiter of [...pending])waiter.reject(failure);}
 });
 const exited=once(actor,'exit');
 function wait(kind,caseName=null){
  const matches=m=>m.kind===kind&&(caseName===null||m.case===caseName);
  if(failure)return Promise.reject(failure);
  const prior=messages.find(matches);if(prior)return Promise.resolve(prior);
  return new Promise((resolveWait,rejectWait)=>{
   let timer;
   const done=(fn,value)=>{clearTimeout(timer);pending.delete(waiter);fn(value);};
   const waiter={matches,resolve:m=>done(resolveWait,m),reject:e=>done(rejectWait,e)};
   pending.add(waiter);timer=setTimeout(()=>waiter.reject(Error(`PAN466_NATIVE_ACTOR_MESSAGE_TIMEOUT:${kind}:${caseName}:${output}`)),720000);
  });
 }
 t.after(async()=>{if(actor.exitCode===null&&actor.signalCode===null){actor.kill('SIGKILL');await exited;}for(const waiter of [...pending])waiter.reject(Error('PAN466_TEST_FINISHED'));});
 const ready=await wait('ready');assert.equal(ready.targetHead,targetHead);assert.equal(ready.pid,actor.pid);
 const observedCases=[];
 for(const name of cases)await t.test(`AC03 actual ${name}: same sleeping PID, fresh use checks and real history`,async st=>{
  const ownedRoot=mkdtempSync(join(root,'fixture-'));
  const currentModuleFile=join(ownedRoot,'protected-current-module.json'),writePermissionFile=join(ownedRoot,'protected-write-permission.json'),historyPermissionFile=join(ownedRoot,'protected-history-permission.json');
  const captured=retainedModuleBindingV1({targetHead,imageId,generation:name==='fresh-compatible-rebinding'?2:1});
  const grant={grantId:'pan464-life06-synthetic-grant',planDigest:edge.nativePlan.planDigest,executorId:'pan464-executor',fence:1,notBeforeMs:Date.now()-1000,expiresAtMs:Date.now()+1800000,revoked:false};
  const historyGrant={allowed:true,expiresAtMs:Date.now()+1800000,scope:'PAN466_SYNTHETIC_HISTORY'};
  put(currentModuleFile,captured);put(writePermissionFile,grant);put(historyPermissionFile,historyGrant);
  const namespace='pan464-'+digestV1(join(ownedRoot,'pan464-owned-v1')).slice(0,24);
  st.after(()=>{
   const ids=docker(['ps','-aq','--filter',`label=io.pansphaira.pan464.owner=${namespace}`]);
   if(ids)docker(['rm','-f',...ids.split(/\s+/)]);
   assert.equal(docker(['ps','-aq','--filter',`label=io.pansphaira.pan464.owner=${namespace}`]),'');
  });
  actor.send({kind:'fixture',case:name,ownedRoot,currentModuleFile,writePermissionFile,historyPermissionFile});
  const fixture=await wait('fixture',name);assert.equal(fixture.namespace,namespace);assert.equal(fixture.pid,actor.pid);
  const sleeping=await wait('sleeping',name);assert.equal(sleeping.pid,actor.pid);assert.equal(sleeping.capturedGeneration,captured.generation);assert.equal(sleeping.capturedBindingDigest,digestV1(captured));
  // Child is already awaiting IPC AFTER its real controller has persisted
  // POST_ACTIVATION_WRITE_INTENT, before either protected native new-write start.
  assert.equal(actor.exitCode,null);assert.equal(actor.signalCode,null);
  const state=join(ownedRoot,'pan464-owned-v1/state'),logs=join(ownedRoot,'pan464-owned-v1/internal-logs');
  const stateBefore=retainedTreeV1(state).digest,logsBefore=retainedTreeV1(logs).digest;
  const historyBefore=retainedTreeV1(join(ownedRoot,'pan466-history-v1')).digest;
  const generationChanged=name==='generation-changed'||name==='generation-changed-and-revoked';
  const revoked=name==='permission-revoked'||name==='generation-changed-and-revoked';
  if(generationChanged)put(currentModuleFile,retainedModuleBindingV1({targetHead,imageId,generation:captured.generation+1}));
  if(revoked)put(writePermissionFile,{...grant,revoked:true});
  // Separate read permission intentionally stays active; not new-write authority.
  actor.send({kind:'resume',case:name});
  const resumed=await wait('resumed',name);assert.equal(resumed.pid,sleeping.pid);assert.equal(resumed.capturedGeneration,sleeping.capturedGeneration);assert.equal(resumed.capturedBindingDigest,sleeping.capturedBindingDigest);
  const result=await wait('complete',name);assert.equal(result.pid,actor.pid);assert.equal(result.outcome,'PASS');assert.equal(result.historicalActualContentReadback,true);
  assert.equal(result.actualWritePermissionRevoked,revoked);
  assert.equal(result.currentGeneration,generationChanged?captured.generation+1:captured.generation);
  assert.equal(result.nativeNewWriteObserved,!generationChanged&&!revoked);
  if(generationChanged||revoked){
   assert.equal(result.denial,generationChanged?'PAN466_CURRENT_GENERATION_OR_COMPATIBILITY_CHANGED_HELD':'PAN464_PERMISSION_DENIED');
   assert.equal(retainedTreeV1(state).digest,stateBefore);assert.equal(retainedTreeV1(logs).digest,logsBefore);
   assert.equal(retainedTreeV1(join(ownedRoot,'pan466-history-v1')).digest,historyBefore);
   assert.equal(docker(['ps','-aq','--filter',`label=io.pansphaira.pan464.owner=${namespace}`]),'');
  }else{assert.equal(result.denial,null);assert.notEqual(retainedTreeV1(state).digest,stateBefore);}
  observedCases.push({case:name,pid:result.pid,capturedGeneration:result.capturedGeneration,currentGeneration:result.currentGeneration,denial:result.denial,actualWritePermissionRevoked:revoked,nativeNewWriteObserved:result.nativeNewWriteObserved,historyActualReadback:true,qualificationDigest:result.qualificationDigest});
 });
 assert.deepEqual(observedCases.map(x=>x.case),cases);
 assert.equal(new Set(observedCases.map(x=>x.pid)).size,1);
 // Only a sanitized observed-case record; never the owned directory/raw history.
 put(join(root,'safe-native-case-observations.json'),{schemaVersion:1,targetHead,imageId,classification:'LOCAL_SYNTHETIC_EXACT_NATIVE_MODULE_USE',cases:observedCases,
  nonclaims:['NO_GENERIC_SCHEDULER','NO_GRANT_FROM_MODULE_METADATA_OR_HISTORY','NO_WHOLE_REPOSITORY_PILOT_COVERAGE','NO_PRODUCTION_OR_CUSTOMER_EFFECTS','NO_HOST_ADMIN_CONFINEMENT','COOPERATIVE_IPC_WAIT_NOT_OS_SUSPENSION_OR_POWER_LOSS']});
 actor.send({kind:'stop'});const [code,signal]=await exited;assert.equal(code,0);assert.equal(signal,null);
});
