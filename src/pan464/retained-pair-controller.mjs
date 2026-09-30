// PAN464 trusted controller for ONE disposable local synthetic installation.
// Docker/host administrators and hostile code in an already admitted RW
// principal are outside this boundary. Requests cannot select commands/mounts.
import {randomBytes} from 'node:crypto';
import {closeSync,existsSync,fsyncSync,lstatSync,mkdirSync,openSync,readFileSync,readdirSync,realpathSync,renameSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {runBoundedProcess} from '../../scripts/demo-current-head-e2e.mjs';
import {verifyForwardCheckout,verifyForwardEnvironment} from '../../scripts/run-forward-paired-analytics.mjs';
import {acquireLocalJournalOwner} from '../../demo/runtime/local-journal-owner.mjs';
import {DemoMutationGate,canonicalJson} from '../../demo/runtime/enforcement-gate.mjs';
import {buildUpdateMigrationCheckpointV1,verifyUpdateMigrationCheckpointV1} from '../../dist/packages/contracts/src/update-migration-checkpoint.js';
import {retainedPairPlanV1,SOURCE_PAN_V1,CONSUMER_KS_V1} from './retained-pair-plan.mjs';
import {strictOwnedPathV1,retainedTreeV1,copyRetainedCheckpointV1,preserveAndRestoreV1,digestV1} from './retained-snapshot.mjs';
import {verifyRetainedBusinessV1} from './protected-oracle.mjs';
const fail=code=>{throw Error(`PAN464_${code}`);};
const json=path=>JSON.parse(readFileSync(path,'utf8'));
const same=(a,b)=>canonicalJson(a)===canonicalJson(b);
function durable(path,value){
  const temporary=path+'.tmp';writeFileSync(temporary,JSON.stringify(value)+'\n',{mode:0o600,flush:true});renameSync(temporary,path);
  const fd=openSync(resolve(path,'..'),'r');try{fsyncSync(fd);}finally{closeSync(fd);}
}
const environment=()=>Object.fromEntries(['PATH','HOME','LANG','LC_ALL','TMPDIR'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
const pairedCache=new Map();
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
export function createRetainedPairControllerV1({ownedRoot,panRoot,sourceRoot,ksRoot,targetHead,imageId,readPermission,observePhase=async()=>{}}) {
  verifyForwardEnvironment();
  for(const path of [ownedRoot,panRoot,sourceRoot,ksRoot]){
    if(typeof path!=='string'||resolve(path)!==path||realpathSync(path)!==path||!lstatSync(path).isDirectory())fail('CONTROLLER_ROOT_DENIED');
  }
  if(typeof readPermission!=='function'||typeof observePhase!=='function')fail('CONTROLLER_REQUIRED');
  // One deterministic controller/journal mapping per installation. Neither
  // execution requests nor alternate journal paths can create another owner.
  const root=join(ownedRoot,'pan464-owned-v1');
  strictOwnedPathV1(ownedRoot,root,{exists:false});mkdirSync(root,{recursive:true,mode:0o700});
  const state=join(root,'state'),checkpoint=join(root,'checkpoint');
  const control=join(root,'pan453-owned-v2');mkdirSync(control,{recursive:true,mode:0o700});
  const admission=join(root,'native-input');mkdirSync(admission,{recursive:true,mode:0o700});
  const logRoot=join(root,'internal-logs');mkdirSync(logRoot,{recursive:true,mode:0o700});
  const recordFile=join(control,'pair-state.json');
  const namespace='pan464-'+digestV1(root).slice(0,24);
  const edge=freeze(retainedPairPlanV1({sourcePan:SOURCE_PAN_V1,targetPan:targetHead,consumerKs:CONSUMER_KS_V1,imageId,issuedAtMs:1}));
  const operation=edge.nativePlan.checkPlan.operationId;
  const action={actor:'installer:local-retained-pair',scope:{tenant:'local-synthetic',provider:'native-pair',entity:'PairGeneration'},payload:{body:{ref_client:'pan464-synthetic'}}};
  let running=false,serial=0;
  function identities(){verifyForwardCheckout(sourceRoot,SOURCE_PAN_V1);verifyForwardCheckout(panRoot,targetHead);verifyForwardCheckout(ksRoot,CONSUMER_KS_V1);}
  async function docker(args,timeoutMs=30000){return runBoundedProcess('docker',args,{env:environment(),timeoutMs});}
  async function checked(args,timeoutMs){const result=await docker(args,timeoutMs);if(result.code!==0||result.timedOut)fail('DOCKER_OBSERVATION_UNKNOWN_HELD');return result.stdout.trim();}
  async function containers(){
    const ids=new Set();
    // Exact owned namespace AND actual retained bind consumers. A container
    // mounting this state but lacking the expected label is held, not killed.
    for(const filter of [`label=io.pansphaira.pan464.owner=${namespace}`,`volume=${state}`,`volume=${join(state,'postgres')}`,`volume=${join(state,'consumer')}`,`volume=${join(state,'consumer','metadata')}`]){
      const value=await checked(['ps','-aq','--filter',filter]);if(value)for(const id of value.split(/\s+/))ids.add(id);
    }
    if(!ids.size)return [];
    return JSON.parse(await checked(['inspect',...ids])).map(c=>({id:c.Id,owned:c.Config.Labels?.['io.pansphaira.pan464.owner']===namespace,
      running:c.State.Running,pid:c.State.Pid,status:c.State.Status,restart:c.HostConfig.RestartPolicy?.Name,
      mounts:c.Mounts.map(m=>({source:m.Source,destination:m.Destination,rw:m.RW})).sort((a,b)=>a.destination.localeCompare(b.destination))}));
  }
  async function quiescent(){
    const observed=await containers();
    if(observed.some(c=>!c.owned||c.running||c.pid!==0||!['no',''].includes(c.restart)))fail('WRITERS_NOT_QUIESCENT_HELD');
    return observed;
  }
  async function authority(){
    let grant;try{grant=await readPermission();}catch{fail('PERMISSION_UNAVAILABLE_HELD');}
    if(!grant||Object.keys(grant).sort().join('|')!==['executorId','expiresAtMs','fence','grantId','notBeforeMs','planDigest','revoked'].sort().join('|')
      ||grant.planDigest!==edge.nativePlan.planDigest||grant.executorId!=='pan464-executor'||grant.fence!==1
      ||typeof grant.grantId!=='string'||!/^pan464-[a-z0-9-]+$/.test(grant.grantId)||grant.revoked!==false
      ||!Number.isSafeInteger(grant.notBeforeMs)||!Number.isSafeInteger(grant.expiresAtMs)
      ||Date.now()<grant.notBeforeMs||Date.now()>=grant.expiresAtMs)fail('PERMISSION_DENIED');
    return structuredClone(grant);
  }
  async function exclusive(fn){
    if(running)fail('COMPETING_CONTROLLER_DENIED');running=true;
    let owner;
    try{owner=acquireLocalJournalOwner(control);return await fn(owner);}finally{try{owner?.release();}finally{running=false;}}
  }
  function journal(owner){const secret=randomBytes(32).toString('hex');return new DemoMutationGate({apiToken:secret,controlToken:secret,expectedOrigin:'http://127.0.0.1',receiptPath:join(control,'effects.json'),journalOwner:owner.token,provider:{}});}
  function record(phase,extra={}){const old=existsSync(recordFile)?json(recordFile):{};const value={...old,...extra,phase,edgeDigest:edge.edgeDigest};durable(recordFile,value);return value;}
  async function phase(name,extra={}){record(name,extra);await observePhase(name);}
  async function job(kind,mode,{writable=true,beforeStart=async()=>{},extraEnv=[]}={}){
    const commands={producer:['node','/pan/src/pan464/native-producer.mjs',mode],consumer:['/app/.venv/bin/python','/pan/src/pan464/native-consumer.py',mode],
      rawInit:['bash','/ks/services/superset/runtime/init.sh','install'],rawPython:['/app/.venv/bin/python','/ks/services/superset/runtime/ks254_install.py','install']};
    if(!commands[kind]||!['seed','migrate','observe','install','new-write','wrong-business','probe'].includes(mode))fail('JOB_DENIED');
    const name=`${namespace}-${++serial}`;
    const args=['create','--name',name,'--label',`io.pansphaira.pan464.owner=${namespace}`,'--network','none','--user',`${process.getuid()}:${process.getgid()}`,
      '--cap-drop','ALL','--security-opt','no-new-privileges','--read-only','--restart','no','--tmpfs','/scratch:rw,nosuid,nodev,mode=1777',
      '-v',`${panRoot}:/pan:ro`,'-v',`${sourceRoot}:/source:ro`,'-v',`${ksRoot}:/ks:ro`,'-v',`${state}:/state:${writable?'rw':'ro'}`,'-v',`${admission}:/admission:ro`,
      '-e','HOME=/scratch','-e','TMPDIR=/scratch','-e','CHIMPMAERA_BI_ROOT=/state/consumer','-e','CHIMPMAERA_BI_SECRET_ROOT=/state/keys',
      '-e','SUPERSET_CONFIG_PATH=/ks/services/superset/runtime/superset_config.py','-e','SUPERSET_BIN=/app/.venv/bin/superset','-e','PYTHON_BIN=/app/.venv/bin/python'];
    // Once seeded, native init cannot write keys, projection or the producer.
    if(kind==='consumer'&&mode==='install')for(const path of ['keys','postgres','consumer/projection'])args.push('-v',`${join(state,path)}:/state/${path}:ro`);
    for(const value of extraEnv)args.push('-e',value);
    args.push(imageId,...commands[kind]);
    let id;
    try{
      id=await checked(args);
      const [observed]=JSON.parse(await checked(['inspect',id]));
      const expectedMounts=[{destination:'/pan',source:panRoot,rw:false},{destination:'/source',source:sourceRoot,rw:false},{destination:'/ks',source:ksRoot,rw:false},
        {destination:'/state',source:state,rw:writable},{destination:'/admission',source:admission,rw:false}];
      if(kind==='consumer'&&mode==='install')for(const path of ['keys','postgres','consumer/projection'])expectedMounts.push({destination:`/state/${path}`,source:join(state,path),rw:false});
      const actualMounts=observed.Mounts.filter(m=>m.Type==='bind').map(m=>({destination:m.Destination,source:m.Source,rw:m.RW}));
      const byDest=(a,b)=>a.destination.localeCompare(b.destination);
      if(observed.Image!==imageId||observed.Config.User!==`${process.getuid()}:${process.getgid()}`||!same(observed.Config.Cmd,commands[kind])
        ||observed.Config.Entrypoint?.length||observed.HostConfig.NetworkMode!=='none'||observed.HostConfig.Privileged||!observed.HostConfig.ReadonlyRootfs
        ||observed.HostConfig.PidMode||observed.HostConfig.RestartPolicy.Name!=='no'||!same(observed.HostConfig.CapDrop,['ALL'])
        ||!observed.HostConfig.SecurityOpt.includes('no-new-privileges')||!same(actualMounts.sort(byDest),expectedMounts.sort(byDest)))fail('CREATED_JOB_BOUNDARY_DENIED');
      await beforeStart();
      const result=await docker(['start','--attach',id],240000);
      writeFileSync(join(logRoot,`${serial}-${kind}-${mode}.log`),result.stdout+result.stderr,{mode:0o600});
      const [after]=JSON.parse(await checked(['inspect',id]));
      if(result.timedOut||after.State.Running||after.State.Pid!==0)fail('NATIVE_JOB_UNKNOWN_HELD');
      const completion={exitCode:after.State.ExitCode,cliExit:result.code,timedOut:result.timedOut};
      durable(join(logRoot,`${serial}-${kind}-${mode}-exit.json`),completion);
      return completion;
    } finally {
      if(id){
        const [before]=JSON.parse(await checked(['inspect',id]));
        if(before.Config.Labels?.['io.pansphaira.pan464.owner']!==namespace)fail('JOB_OWNERSHIP_UNKNOWN_HELD');
        if(before.State.Running)await checked(['kill',id]);
        const [stopped]=JSON.parse(await checked(['inspect',id]));if(stopped.State.Running||stopped.State.Pid!==0)fail('JOB_STOP_UNKNOWN_HELD');
        await checked(['rm',id]);
      }
    }
  }
  async function success(kind,mode,options){const result=await job(kind,mode,options);if(result.exitCode!==0||result.cliExit!==0)fail('NATIVE_JOB_FAILED_HELD');return result;}
  async function observations(){await success('producer','observe');await success('consumer','observe');return {producer:json(join(state,'producer-observed.json')),consumer:json(join(state,'consumer-observed.json'))};}
  function checkpointContext(saved){return {expectedOperationDigest:edge.nativePlan.planDigest,expectedMigrationEdgeDigest:edge.edgeDigest,expectedCurrentTupleDigest:digestV1(edge.from),
    expectedSnapshotDigest:saved.snapshotDigest,expectedSnapshotContentDigest:saved.snapshotDigest,expectedOwnerStateDigest:saved.ownerDigest,expectedCheckpointOrdinal:1,
    expectedAuthorityProfileDigest:edge.authorityProfileDigest,expectedRecorder:{recorderId:'recorder:checkpoint-recorder',recorderVersion:'1.0.0'},expectedCapturedAtMs:saved.capturedAtMs};}
  async function admissionGuard(gate,saved,binding){
    identities();const grant=await authority();if(digestV1(grant)!==binding)fail('PERMISSION_CHANGED_DENIED');
    gate.assertEffectControl({action,operationKey:operation,reconcileEligible:false});
    await quiescent();
    if(retainedTreeV1(checkpoint).digest!==saved.snapshotDigest||verifyUpdateMigrationCheckpointV1(json(join(control,'checkpoint.json')),checkpointContext(saved)).outcome!=='RECORDED')fail('CHECKPOINT_DENIED');
  }
  return Object.freeze({edge,namespace,
    async qualifyPairs(){
      identities();
      const key=digestV1({sourceRoot,panRoot,ksRoot,edge});
      if(!pairedCache.has(key))pairedCache.set(key,(async()=>{
        const results=[];
        for(const [path,head,label]of [[sourceRoot,SOURCE_PAN_V1,'source'],[panRoot,targetHead,'target']]){
          const output=join(root,`${label}-pair.json`);
          const result=await docker(['run','--rm','--network','none','--user',`${process.getuid()}:${process.getgid()}`,'--cap-drop','ALL','--security-opt','no-new-privileges',
            '-v',`${path}:/pan`,'-v',`${ksRoot}:/ks:ro`,'-v',`${root}:/evidence`,'-w','/pan','-e','HOME=/scratch','-e','TMPDIR=/scratch','--tmpfs','/scratch:rw,nosuid,nodev,mode=1777',
            imageId,'node','scripts/run-forward-paired-analytics.mjs','--counterpart','/ks','--pan-head',head,'--output',`/evidence/${label}-pair.json`,'--profile','current-frozen'],240000);
          writeFileSync(join(logRoot,`${label}-pair.log`),result.stdout+result.stderr,{mode:0o600});
          if(result.code!==0||result.timedOut)fail('PAIRED_EXECUTION_FAILED');
          const value=json(output);if(value.state!=='PASS'||value.testedHeads.pansphaira.commitOid!==head||value.testedHeads.kaleidoSphere.commitOid!==CONSUMER_KS_V1)fail('PAIR_BINDING_DENIED');
          results.push({head,digest:digestV1(value)});
        }
        identities();return results;
      })());
      return pairedCache.get(key);
    },
    async initialize(){return exclusive(async()=>{
      identities();if(existsSync(recordFile)||existsSync(state))fail('SOURCE_OVERWRITE_DENIED');
      await quiescent();const grant=await authority();durable(join(admission,'plan.json'),edge.nativePlan);durable(join(admission,'grant.json'),grant);
      mkdirSync(state,{mode:0o700});await phase('SOURCE_CREATING');
      await success('producer','seed');await success('consumer','seed');
      const observed={producer:json(join(state,'producer-observed.json')),consumer:json(join(state,'consumer-observed.json'))};
      if(verifyRetainedBusinessV1(observed).outcome!=='PASS'||observed.producer.generation!==1)fail('SOURCE_ORACLE_DENIED');
      await quiescent();record('SOURCE_READY',{sourceIdentity:{datasetId:observed.consumer.datasetId,dashboardId:observed.consumer.dashboardId},sourceDataDigest:observed.producer.dataDigest});return observed;
    });},
    async upgrade(request){return exclusive(async owner=>{
      if(!same(request,{operation:'UPGRADE',planDigest:edge.nativePlan.planDigest}))fail('REQUEST_DENIED');
      identities();const prior=json(recordFile);if(prior.phase!=='SOURCE_READY'||prior.edgeDigest!==edge.edgeDigest)fail('PRIOR_OPERATION_HELD');
      if(!pairedCache.has(digestV1({sourceRoot,panRoot,ksRoot,edge})))fail('PAIR_EXECUTION_REQUIRED');
      await pairedCache.get(digestV1({sourceRoot,panRoot,ksRoot,edge}));
      const grant=await authority(),binding=digestV1(grant),gate=journal(owner);
      gate.assertEffectControl({action,operationKey:operation,reconcileEligible:false});
      if(gate.state.reservations[operation])fail('PRIOR_RESERVATION_HELD');
      const writers=await quiescent();
      const snapshot=copyRetainedCheckpointV1({ownedRoot:root,state,checkpoint});
      const saved={snapshotDigest:snapshot.digest,ownerDigest:digestV1({writers,namespace,edgeDigest:edge.edgeDigest}),capturedAtMs:Date.now()};
      const cp=buildUpdateMigrationCheckpointV1({operationDigest:edge.nativePlan.planDigest,migrationEdgeDigest:edge.edgeDigest,currentTupleDigest:digestV1(edge.from),rollbackTargetTupleDigest:digestV1(edge.from),
        snapshotDigest:saved.snapshotDigest,snapshotContentDigest:saved.snapshotDigest,ownerStateDigest:saved.ownerDigest,checkpointOrdinal:1,authorityProfileDigest:edge.authorityProfileDigest,
        recorder:{recorderId:'recorder:checkpoint-recorder',recorderVersion:'1.0.0'},capturedAtMs:saved.capturedAtMs});
      durable(join(control,'checkpoint.json'),cp);
      gate.reserveOperation({operationKey:operation,action,computedDigest:edge.nativePlan.planDigest,authorityBinding:binding,authorityKind:'INSTALLER_APPROVAL_V1',reservedAtMs:Date.now()});
      await phase('CHECKPOINTED',saved);
      const guard=()=>admissionGuard(gate,saved,binding);
      try{
        await guard();durable(join(admission,'grant.json'),grant);
        await phase('MIGRATING');await success('producer','migrate',{beforeStart:guard});
        await phase('NATIVE_STARTUP');await success('consumer','install',{beforeStart:guard});
        await phase('VALIDATING');await guard();const observed=await observations();
        const oracle=verifyRetainedBusinessV1(observed,prior.sourceIdentity);
        if(oracle.outcome!=='PASS'){
          await guard();await phase('RESTORING');
          const restored=preserveAndRestoreV1({ownedRoot:root,state,checkpoint,rejected:join(root,'rejected'),expectedDigest:saved.snapshotDigest});
          const recovered=await observations();if(verifyRetainedBusinessV1(recovered,prior.sourceIdentity).outcome!=='PASS'||recovered.producer.generation!==1)fail('RESTORE_ORACLE_HELD');
          gate.markAmbiguous(operation);record('REJECTED_RESTORED',{oracle,restored});return {outcome:'REJECTED_RESTORED',oracle,restored};
        }
        if(observed.producer.generation!==2||observed.producer.migrationCount!==1||observed.producer.dataDigest!==prior.sourceDataDigest)fail('NATIVE_GENERATION_HELD');
        await guard();
        // Durable intent precedes every post-validation writer capability. Any
        // loss after here is conservatively HELD; no old snapshot replay.
        await phase('ACTIVATION_INTENT');
        const receiptCore={schemaVersion:'pansphaira.pan464/retained-pair-receipt/v1',replayKey:operation,actionDigest:edge.nativePlan.planDigest,
          outcome:'LOCAL_RETAINED_PAIR_VERIFIED',readbackDigest:digestV1(observed),checkpointDigest:cp.checkpointDigest};
        const receipt={...receiptCore,receiptDigest:digestV1(receiptCore)};
        gate.state.effects[operation]={actionDigest:edge.nativePlan.planDigest,providerResult:{generation:2},readback:observed,receipt};
        gate.state.reservations[operation].status='APPLIED';gate.state.reservations[operation].recovery='NONE';gate.persist();
        await phase('ACTIVE');return {outcome:'ACTIVE',observed,oracle,checkpointDigest:cp.checkpointDigest};
      }catch(error){
        // Never make an APPLIED effect inconsistent with its durable v4
        // reservation. Lost activation acknowledgement remains held by intent.
        if(gate.state.reservations[operation]?.status!=='APPLIED')gate.markAmbiguous(operation);
        throw error;
      }
    });},
    async readRecovery(){
      // No lock adoption, container kill, native replay, restore or file write.
      const recordValue=existsSync(recordFile)?json(recordFile):null;
      let retainedDigest=null;
      try{if(existsSync(state))retainedDigest=retainedTreeV1(state).digest;}catch{retainedDigest='UNKNOWN_LIVE_OR_UNREADABLE_STATE';}
      return {outcome:'HELD_NO_AUTOMATIC_RESTORE',phase:recordValue?.phase??'UNKNOWN',containers:await containers(),
        retainedDigest,checkpointPresent:existsSync(checkpoint)};
    },
    async writeAfterActivation(){return exclusive(async owner=>{
      const recordValue=json(recordFile);if(recordValue.phase!=='ACTIVE')fail('ACTIVATION_REQUIRED');
      const gate=journal(owner);
      const guard=async()=>{await authority();gate.assertEffectControl({action,operationKey:operation,reconcileEligible:true});await quiescent();};
      await guard();await phase('POST_ACTIVATION_WRITE_INTENT');
      await success('producer','new-write',{beforeStart:guard});await success('consumer','new-write',{beforeStart:guard});
      const observed={producer:json(join(state,'producer-observed.json')),consumer:json(join(state,'consumer-observed.json'))};
      if(verifyRetainedBusinessV1(observed,recordValue.sourceIdentity,{postActivation:true}).outcome!=='PASS')fail('POST_ACTIVATION_ORACLE_HELD');
      await phase('ACTIVE_WITH_NEW_WRITES');return observed;
    });},
    async probeUnadmitted(){return exclusive(async()=>{
      await quiescent();const before=retainedTreeV1(state).digest;const results=[];
      for(const kind of ['rawInit','rawPython']){
        const result=await job(kind,'probe',{writable:false});
        if(result.exitCode===0||retainedTreeV1(state).digest!==before)fail('UNADMITTED_STARTUP_BYPASS');
        const log=readFileSync(join(logRoot,`${serial}-${kind}-probe.log`),'utf8');
        if(!/Read-only file system/.test(log))fail('BYPASS_FAILURE_NOT_STORAGE_DENIAL');
        results.push({kind,...result,retainedDigest:before,denial:'READ_ONLY_FILESYSTEM'});
      }
      return results;
    });}
  });
}
