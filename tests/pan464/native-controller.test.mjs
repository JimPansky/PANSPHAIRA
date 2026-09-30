// Required native gate: no mock backend and no optional/skipped prerequisites.
// Run on a disposable Docker-capable host with the documented exact inputs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,fork} from 'node:child_process';
import {once} from 'node:events';
import {existsSync,mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createRetainedPairControllerV1} from '../../src/pan464/retained-pair-controller.mjs';
import {retainedPairPlanV1,SOURCE_PAN_V1,CONSUMER_KS_V1} from '../../src/pan464/retained-pair-plan.mjs';
import {retainedTreeV1,digestV1} from '../../src/pan464/retained-snapshot.mjs';
import {verifyRetainedBusinessV1} from '../../src/pan464/protected-oracle.mjs';
import {updateMigrationCheckpointDigestV1} from '../../dist/packages/contracts/src/update-migration-checkpoint.js';
import {recordLocalJournalControl} from '../../demo/runtime/local-journal-owner.mjs';
const panRoot=resolve(import.meta.dirname,'../..');
const sourceRoot=process.env.PAN464_SOURCE_ROOT,ksRoot=process.env.PAN464_KS_ROOT,imageId=process.env.PAN464_IMAGE_ID,scratch=process.env.PAN464_OWNED_ROOT;
for(const value of [sourceRoot,ksRoot,imageId,scratch])assert(value,'PAN464_NATIVE_PREREQUISITES_REQUIRED');
const docker=args=>execFileSync('docker',args,{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']}).trim();
const targetHead=execFileSync('git',['rev-parse','HEAD'],{cwd:panRoot,encoding:'utf8'}).trim();
const edge=retainedPairPlanV1({sourcePan:SOURCE_PAN_V1,targetPan:targetHead,consumerKs:CONSUMER_KS_V1,imageId,issuedAtMs:1});
const json=path=>JSON.parse(readFileSync(path,'utf8'));
function fixture(t,hook=async()=>{}){
  const ownedRoot=mkdtempSync(join(scratch,'native-controller-'));
  const options={ownedRoot,panRoot,sourceRoot,ksRoot,targetHead,imageId};
  const permissionFile=join(ownedRoot,'protected-permission.json');
  const grant={grantId:'pan464-test-grant',planDigest:edge.nativePlan.planDigest,executorId:'pan464-executor',fence:1,notBeforeMs:Date.now()-1000,expiresAtMs:Date.now()+1800000,revoked:false};
  const put=value=>writeFileSync(permissionFile,JSON.stringify(value),{mode:0o600});put(grant);
  const controller=createRetainedPairControllerV1({...options,readPermission:()=>json(permissionFile),observePhase:phase=>hook(phase,x)});
  const root=join(ownedRoot,'pan464-owned-v1'),state=join(root,'state'),control=join(root,'pan453-owned-v2');
  const x={options,permissionFile,grant,put,controller,root,state,control,request:{operation:'UPGRADE',planDigest:edge.nativePlan.planDigest}};
  t.after(()=>{
    const ids=docker(['ps','-aq','--filter',`label=io.pansphaira.pan464.owner=${controller.namespace}`]);
    if(ids)docker(['rm','-f',...ids.split(/\s+/)]);
    assert.equal(docker(['ps','-aq','--filter',`label=io.pansphaira.pan464.owner=${controller.namespace}`]),'');
  });
  return x;
}
async function ready(x){await x.controller.qualifyPairs();return x.controller.initialize();}
function containerArgs(x,{readonly=false,label=true}={}){
  return ['--network','none','--user',`${process.getuid()}:${process.getgid()}`,'--cap-drop','ALL','--security-opt','no-new-privileges','--read-only','--restart','no',
    ...(label?['--label',`io.pansphaira.pan464.owner=${x.controller.namespace}`]:[]),'--tmpfs','/scratch:rw,nosuid,nodev,mode=1777',
    '-v',`${panRoot}:/pan:ro`,'-v',`${ksRoot}:/ks:ro`,'-v',`${ksRoot}/services/superset/runtime:/opt/chimpmaera-bi:ro`,
    '-v',`${x.state}:/state:${readonly?'ro':'rw'}`,'-e','HOME=/scratch','-e','TMPDIR=/scratch','-e','CHIMPMAERA_BI_ROOT=/state/consumer',
    '-e','CHIMPMAERA_BI_SECRET_ROOT=/state/keys','-e','SUPERSET_CONFIG_PATH=/ks/services/superset/runtime/superset_config.py'];
}
function mutateMetric(x){
  execFileSync('docker',['run','--rm',...containerArgs(x),imageId,'/app/.venv/bin/python','/pan/src/pan464/native-consumer.py','wrong-business'],{encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']});
}
function launch(t,x,pauseAt,{pause=true}={}){
  const config=join(x.options.ownedRoot,'process.json');writeFileSync(config,JSON.stringify({options:x.options,permissionFile:x.permissionFile,pauseAt:pause?pauseAt:null}),{mode:0o600});
  const child=fork(new URL('./controller-process.mjs',import.meta.url),[config],{stdio:['ignore','pipe','pipe','ipc']});
  let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{output=(output+bytes).slice(-4000);});
  const exit=once(child,'exit');const messages=[];child.on('message',m=>messages.push(m));
  const phase=new Promise((resolvePhase,reject)=>{
    const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('PAN464_CONTROLLER_PHASE_TIMEOUT'));},240000);
    child.on('message',m=>{if(m.kind==='phase'&&m.phase===pauseAt){clearTimeout(timer);resolvePhase(m);}});
    child.once('exit',()=>{clearTimeout(timer);reject(Error('PAN464_EARLY_EXIT '+output));});
  });
  t.after(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');});
  return {child,exit,phase,messages};
}
async function waitUntil(probe,timeoutMs=30000){
  const end=Date.now()+timeoutMs;
  while(Date.now()<end){const value=probe();if(value)return value;await new Promise(r=>setTimeout(r,100));}
  throw Error('PAN464_REAL_PROCESS_OBSERVATION_TIMEOUT');
}

test('AC01/02/03 positive: exact paired paths, native RO bypasses, retained DDL/init and correct new writes',async t=>{
  const x=fixture(t);const source=await ready(x);
  assert.throws(()=>{x.controller.edge.nativePlan.planDigest='f'.repeat(64);},TypeError);
  const denied=await x.controller.probeUnadmitted();assert.equal(denied.length,2);assert(denied.every(r=>r.denial==='READ_ONLY_FILESYSTEM'&&r.exitCode!==0));
  const upgraded=await x.controller.upgrade(x.request);assert.equal(upgraded.outcome,'ACTIVE');
  assert.equal(upgraded.observed.producer.dataDigest,source.producer.dataDigest);assert.equal(upgraded.observed.producer.migrationCount,1);
  const after=await x.controller.writeAfterActivation();assert.equal(verifyRetainedBusinessV1(after,source.consumer,{postActivation:true}).outcome,'PASS');
  const before=retainedTreeV1(x.state).digest;assert.equal((await x.controller.readRecovery()).outcome,'HELD_NO_AUTOMATIC_RESTORE');
  assert.equal(retainedTreeV1(x.state).digest,before);
  await assert.rejects(x.controller.upgrade(x.request),/PRIOR_OPERATION_HELD/);
  writeFileSync(join(x.options.ownedRoot,'positive.json'),JSON.stringify({edge,source,upgraded,after,denied},null,2));
});
test('AC02 authority, request substitution and concurrent owner cannot dispatch native startup',async t=>{
  const x=fixture(t);await ready(x);const before=retainedTreeV1(x.state).digest;
  for(const changes of [{revoked:true},{expiresAtMs:Date.now()-1},{fence:2},{executorId:'another-executor'},{planDigest:'f'.repeat(64)}]){
    x.put({...x.grant,...changes});await assert.rejects(x.controller.upgrade(x.request),/PERMISSION_DENIED/);assert.equal(retainedTreeV1(x.state).digest,before);
  }
  x.put(x.grant);await assert.rejects(x.controller.upgrade({...x.request,command:'arbitrary',mountMode:'rw',journalRoot:'alternate'}),/REQUEST_DENIED/);
  // Actual live native materializer/Gunicorn, not a supplied quiescent flag.
  const writer=docker(['run','-d',...containerArgs(x),imageId,'bash','/opt/chimpmaera-bi/start.sh']);
  try{
    const info=JSON.parse(docker(['inspect',writer]))[0];assert.equal(info.State.Running,true);
    await waitUntil(()=>{const processes=docker(['top',writer,'-eo','pid,args']);return processes.includes('materializer_server.py')&&processes.includes('gunicorn');});
    await assert.rejects(x.controller.upgrade(x.request),/WRITERS_NOT_QUIESCENT_HELD/);
    assert.equal(existsSync(join(x.root,'checkpoint')),false);
  }finally{docker(['rm','-f',writer]);}
  // Mount consumer without expected label must also be observed and held.
  const foreign=docker(['run','-d',...containerArgs(x,{label:false}),imageId,'node','-e','setInterval(()=>{},1000)']);
  try{await assert.rejects(x.controller.upgrade(x.request),/WRITERS_NOT_QUIESCENT_HELD/);}finally{docker(['rm','-f',foreign]);}
});
for(const fault of ['rehashed-checkpoint','modified-copy','changed-permission','durable-revoke']){
  test(`AC02 ${fault} after real checkpoint is denied before native migration`,async t=>{
    const x=fixture(t,async(phase,f)=>{
      if(phase!=='CHECKPOINTED')return;
      if(fault==='rehashed-checkpoint'){
        const path=join(f.control,'checkpoint.json'),value=json(path);value.snapshotContentDigest='f'.repeat(64);value.checkpointDigest=updateMigrationCheckpointDigestV1(value);writeFileSync(path,JSON.stringify(value));
      }else if(fault==='modified-copy')writeFileSync(join(f.root,'checkpoint','unexpected-file'),'substitution');
      else if(fault==='changed-permission')f.put({...f.grant,grantId:'pan464-replacement-grant'});
      else recordLocalJournalControl(f.control,{kind:'REVOKE',operationKey:edge.nativePlan.checkPlan.operationId,sourceIdentity:'local-synthetic|installer:local-retained-pair',targetIdentity:'native-pair|PairGeneration|pan464-synthetic',stopEpoch:1,issuedAtMs:Date.now(),reason:'synthetic qualification revoke'});
    });
    await ready(x);const before=retainedTreeV1(x.state).digest;
    await assert.rejects(x.controller.upgrade(x.request),/CHECKPOINT_DENIED|PERMISSION_CHANGED_DENIED|EFFECT_REVOKED_DENIED/);
    assert.equal(retainedTreeV1(x.state).digest,before);assert.equal((await x.controller.readRecovery()).containers.length,0);
  });
}
for(const [kind,when] of [['STOP','before-call'],['STOP','before-dispatch'],['REVOKE','before-call']]){
  test(`AC02/05 ${kind} ${when}: post-activation new writes are denied before dispatch; recovery stays observational`,async t=>{
    const control=f=>recordLocalJournalControl(f.control,{kind,operationKey:kind==='STOP'?null:edge.nativePlan.checkPlan.operationId,
      sourceIdentity:'local-synthetic|installer:local-retained-pair',targetIdentity:'native-pair|PairGeneration|pan464-synthetic',
      stopEpoch:1,issuedAtMs:Date.now(),reason:'synthetic post-activation control boundary'});
    const x=fixture(t,async(phase,f)=>{if(when==='before-dispatch'&&phase==='POST_ACTIVATION_WRITE_INTENT')control(f);});
    await ready(x);assert.equal((await x.controller.upgrade(x.request)).outcome,'ACTIVE');
    const before=retainedTreeV1(x.state).digest,checkpoint=retainedTreeV1(join(x.root,'checkpoint')).digest;
    const logs=retainedTreeV1(join(x.root,'internal-logs')).digest;
    if(when==='before-call')control(x);
    await assert.rejects(x.controller.writeAfterActivation(),{message:kind==='STOP'?'EFFECT_STOPPED_DENIED':'EFFECT_REVOKED_DENIED'});
    assert.equal(retainedTreeV1(x.state).digest,before,'denied new effects must not touch retained state');
    assert.equal(retainedTreeV1(join(x.root,'internal-logs')).digest,logs,'no native job may start or emit completion');
    const recovery=await x.controller.readRecovery();
    assert.equal(recovery.outcome,'HELD_NO_AUTOMATIC_RESTORE');assert.equal(recovery.containers.length,0);
    assert.equal(recovery.phase,when==='before-call'?'ACTIVE':'POST_ACTIVATION_WRITE_INTENT');
    assert.equal(recovery.retainedDigest,before);assert.equal(retainedTreeV1(x.state).digest,before);
    assert.equal(retainedTreeV1(join(x.root,'checkpoint')).digest,checkpoint,'observational recovery must not change checkpoint');
    assert.equal(retainedTreeV1(join(x.root,'internal-logs')).digest,logs);
  });
}

test('AC04 healthy actual HTTP wrong metric is rejected and stopped pre-activation source copy is restored',async t=>{
  const x=fixture(t,async(phase,f)=>{if(phase==='VALIDATING')mutateMetric(f);});
  const source=await ready(x);const result=await x.controller.upgrade(x.request);
  assert.equal(result.outcome,'REJECTED_RESTORED');assert(result.oracle.reasonCodes.includes('NATIVE_BUSINESS_MISMATCH'));
  const rejected=json(join(x.root,'rejected','consumer-observed.json'));
  assert.equal(rejected.httpStatus,200);assert.equal(rejected.healthStatus,200);assert.equal(rejected.data[0].total_minor,8500);
  const recovered={producer:json(join(x.state,'producer-observed.json')),consumer:json(join(x.state,'consumer-observed.json'))};
  assert.equal(recovered.producer.generation,1);assert.equal(verifyRetainedBusinessV1(recovered,source.consumer).outcome,'PASS');
});
for(const phase of ['CHECKPOINTED','ACTIVATION_INTENT','ACTIVE_WITH_NEW_WRITES']){
  test(`AC05 actual controller SIGKILL at ${phase}: restart does not replay or discard retained work`,async t=>{
    const x=fixture(t);const process=launch(t,x,phase);await process.phase;
    await assert.rejects(x.controller.upgrade(x.request),/BTH_JOURNAL_FENCED_DENIED/);
    process.child.kill('SIGKILL');const [code,signal]=await process.exit;assert.equal(code,null);assert.equal(signal,'SIGKILL');
    const before=retainedTreeV1(x.state).digest;
    const restarted=createRetainedPairControllerV1({...x.options,readPermission:()=>json(x.permissionFile)});
    const recovery=await restarted.readRecovery();assert.equal(recovery.outcome,'HELD_NO_AUTOMATIC_RESTORE');assert.equal(recovery.phase,phase);
    assert.equal(retainedTreeV1(x.state).digest,before);assert.equal(recovery.containers.length,0);
    await assert.rejects(restarted.upgrade(x.request),/BTH_JOURNAL_FENCED_DENIED/);
    if(phase==='ACTIVE_WITH_NEW_WRITES'){
      const observed={producer:json(join(x.state,'producer-observed.json')),consumer:json(join(x.state,'consumer-observed.json'))};
      assert.equal(verifyRetainedBusinessV1(observed,null,{postActivation:true}).outcome,'PASS');
      assert.equal(observed.consumer.postActivationDashboards,1);
    }
  });
}
test('AC05 kill the real container during native Superset db upgrade: no orphan, replay or automatic restore',async t=>{
  const x=fixture(t);const process=launch(t,x,'NATIVE_STARTUP',{pause:false});await process.phase;
  const id=await waitUntil(()=>{
    const ids=docker(['ps','-q','--filter',`label=io.pansphaira.pan464.owner=${x.controller.namespace}`]);
    for(const id of ids.split(/\s+/).filter(Boolean)){
      const processes=docker(['top',id,'-eo','pid,args']);
      if(processes.includes('/app/.venv/bin/superset db upgrade'))return id;
    }
    return null;
  },60000);
  docker(['kill','--signal','KILL',id]);
  const [code]=await process.exit;assert.equal(code,1);
  assert(process.messages.some(m=>m.kind==='held'&&m.code==='PAN464_NATIVE_JOB_FAILED_HELD'));
  const completions=readdirSync(join(x.root,'internal-logs')).filter(name=>name.endsWith('consumer-install-exit.json')).map(name=>json(join(x.root,'internal-logs',name)));
  assert(completions.some(value=>value.exitCode===137));
  const before=retainedTreeV1(x.state).digest;const recovery=await x.controller.readRecovery();
  assert.equal(recovery.outcome,'HELD_NO_AUTOMATIC_RESTORE');assert.equal(recovery.phase,'NATIVE_STARTUP');assert.equal(recovery.containers.length,0);
  assert.equal(retainedTreeV1(x.state).digest,before);await assert.rejects(x.controller.upgrade(x.request),/PRIOR_OPERATION_HELD/);
});
