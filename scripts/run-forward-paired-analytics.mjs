// Actual loopback execution of the separately qualified forward pair.
// No network fetch, credentials, publication or release authority.
import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {readFileSync, realpathSync, writeFileSync} from 'node:fs';
import {resolve, relative, isAbsolute} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {createServer} from 'node:net';
import {createHash} from 'node:crypto';

export function forwardExecutionProfile(name='main') {
  if(name==='main')return Object.freeze({name,head:'792e5e38cd4fb612ee034b3edc62aa8b4f58fe0f',producer:'generateForwardProducerAnalyticsManifestV1',pair:'validateForwardAnalyticsPairV1'});
  if(name==='pr235')return Object.freeze({name,head:'bb52b249feb5968eee286963989f98f3bb673996',producer:'generateForwardPrProducerAnalyticsManifestV1',pair:'validateForwardPrAnalyticsPairV1'});
  // Retained historical current pair (the retained PAN346 source candidate).
  if(name==='current-ks')return Object.freeze({name,head:'994ac80113af284ffe9fde93bb11f2341aaace91',tree:'b3b033b02a3e35d1d30646856409011ce625def6',producer:'generateCurrentProducerAnalyticsManifestV1',pair:'validateCurrentAnalyticsPairV1'});
  // Frozen current release pair (PAN 4330cd26 x KS 72d9a4af, release 2026_09_28_v1).
  if(name==='current-frozen')return Object.freeze({name,head:'72d9a4af87fbbc5b23cb52835cd2f85415b8ddc7',tree:'3ef9faab703c8a44b39b2d32f11d6abd641ee35f',producer:'generateFrozenCurrentProducerAnalyticsManifestV1',pair:'validateFrozenCurrentAnalyticsPairV1'});
  throw new Error('FORWARD_EXECUTION_PROFILE_UNQUALIFIED');
}
const KS_TREE='759baccaa077d24f2f78c7e82d6fab801050bc63';
const cleanEnv=()=>Object.fromEntries(Object.entries(process.env).filter(([key])=>! /TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL/i.test(key)));
const command=(cwd,exe,args)=>execFileSync(exe,args,{cwd,env:{...cleanEnv(),GIT_OPTIONAL_LOCKS:'0',GIT_TERMINAL_PROMPT:'0'},encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024}).trim();
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function verifyForwardEnvironment(value={version:process.version,abi:process.versions.modules,platform:process.platform,arch:process.arch}) {
  if(value.version!=='v24.19.0'||value.abi!=='137'||value.platform!=='linux'||value.arch!=='x64') throw new Error('FORWARD_EXECUTION_ENVIRONMENT_UNQUALIFIED');
}
export function verifyForwardCheckout(root,expected) {
  if(!/^[a-f0-9]{40}$/.test(expected)) throw new Error('FORWARD_EXECUTION_IMMUTABLE_HEAD_REQUIRED');
  if(realpathSync(root)!==realpathSync(command(root,'git',['rev-parse','--show-toplevel']))) throw new Error('FORWARD_EXECUTION_ROOT_MISMATCH');
  const commitOid=command(root,'git',['rev-parse','HEAD']);
  const treeOid=command(root,'git',['rev-parse','HEAD^{tree}']);
  if(commitOid!==expected) throw new Error('FORWARD_EXECUTION_HEAD_MISMATCH');
  if(command(root,'git',['status','--porcelain=v1','--untracked-files=all'])) throw new Error('FORWARD_EXECUTION_DIRTY_CHECKOUT');
  return {commitOid,treeOid};
}
async function stop(child) {
  if(child.exitCode!==null||child.signalCode!==null)return;
  await new Promise(resolveExit=>{
    const timer=setTimeout(()=>child.kill('SIGKILL'),3000);
    child.once('exit',()=>{clearTimeout(timer);resolveExit();});
    child.kill('SIGTERM');
  });
}
async function execute(root,ks,expectedPanHead,profile) {
  verifyForwardEnvironment();
  const panHead=verifyForwardCheckout(root,expectedPanHead);
  const ksHead=verifyForwardCheckout(ks,profile.head);
  assert.equal(ksHead.treeOid,profile.tree??KS_TREE,'FORWARD_EXECUTION_TREE_MISMATCH');
  command(root,'npm',['run','build','--silent']);
  // Imports happen only after a fresh source build, in this dedicated process.
  const load=path=>import(pathToFileURL(resolve(root,path)).href);
  const {nativeTransportBytesV1}=await load('dist/src/cks-12/kaleidosphere-candidate-quarantine.js');
  const generateForwardProducerAnalyticsManifestV1=(await load('dist/src/analytics/producer-analytics-manifest.js'))[profile.producer];
  const validateForwardAnalyticsPairV1=(await load('dist/src/analytics/paired-analytics-parity.js'))[profile.pair];
  const rawArtifactBytes=readFileSync(resolve(root,'tests/fixtures/cks-analytics/projection-v1.json'));
  const probe=createServer(); await new Promise(r=>probe.listen(0,'127.0.0.1',r));
  const port=probe.address().port; await new Promise(r=>probe.close(r));
  const child=spawn(process.execPath,['services/bi-agent/src/pansphaira-analytics/server.mjs'],{cwd:ks,env:{...cleanEnv(),PORT:String(port)},stdio:['ignore','ignore','pipe']});
  let serviceError=''; child.stderr.on('data',bytes=>{serviceError=(serviceError+bytes).slice(-4000);});
  let spawnError;child.once('error',error=>{spawnError=error;});
  try {
    const base=`http://127.0.0.1:${port}`;
    const request=(path,options={})=>fetch(base+path,{...options,signal:AbortSignal.timeout(5000)});
    let ready=false;
    for(let i=0;i<100;i++) {
      if(spawnError)throw spawnError;
      if(child.exitCode!==null)throw new Error('FORWARD_SERVICE_EXIT: '+serviceError);
      try {if((await request('/healthz')).ok){ready=true;break;}}catch{}
      await new Promise(r=>setTimeout(r,50));
    }
    assert(ready,'FORWARD_SERVICE_NOT_READY');
    const headsResponse=await request('/v1/pansphaira-analytics/heads');assert.equal(headsResponse.status,200);
    const heads=await headsResponse.json();assert.deepEqual(heads.kaleidosphereHead,ksHead);
    const options={method:'POST',headers:{'Content-Type':'application/json'},body:nativeTransportBytesV1(rawArtifactBytes)};
    const response=await request('/v1/pansphaira-analytics/native-projection',options);assert.equal(response.status,200);
    const capture=await response.json();assert.equal(capture.status,'CANDIDATE');
    const repeated=await request('/v1/pansphaira-analytics/native-projection',options);assert.equal(repeated.status,200);assert.deepEqual(await repeated.json(),capture);
    const input={rawArtifactBytes,candidate:capture.candidate};
    const producer=generateForwardProducerAnalyticsManifestV1(input);
    assert.equal(producer.serialized,generateForwardProducerAnalyticsManifestV1(input).serialized);
    const consumerSource=`import * as m from './scripts/build-consumer-support-manifest.mjs';const heads=m.gitHeads();const {config,configSha256}=m.buildConfigIdentity();const manifest=await m.buildConsumerSupportManifest({heads,config});await m.verifyConsumerSupportManifest(manifest,{expectedHead:heads,configSha256,strict:true});console.log(JSON.stringify(manifest));`;
    const freshConsumer=()=>JSON.parse(command(ks,process.execPath,['--input-type=module','-e',consumerSource]));
    const consumerManifest=freshConsumer();assert.deepEqual(freshConsumer(),consumerManifest);
    const pairInput={...input,producerManifest:producer.manifest,consumerManifest};
    const pair=validateForwardAnalyticsPairV1(pairInput);assert.equal(pair.outcome,'PASS');
    const forged=structuredClone(consumerManifest);forged.support.supported.pop();
    assert.equal(validateForwardAnalyticsPairV1({...pairInput,consumerManifest:forged}).outcome,'DENIED');
    const altered=structuredClone(capture.candidate);altered.bindings.environmentSha256='0'.repeat(64);
    assert.equal(validateForwardAnalyticsPairV1({...pairInput,candidate:altered}).outcome,'DENIED');
    const tests={counterpart:command(ks,process.execPath,['--test','tests/consumer-support-manifest.test.mjs','tests/pansphaira-analytics-service.test.mjs']),producer:command(root,process.execPath,['--test','tests/forward-producer-analytics.test.mjs','tests/forward-paired-analytics.test.mjs','tests/forward-paired-execution.test.mjs'])};
    assert.deepEqual(verifyForwardCheckout(root,expectedPanHead),panHead);
    assert.deepEqual(verifyForwardCheckout(ks,profile.head),ksHead);
    return {schemaVersion:'pansphaira/forward-pair-execution/v1',state:'PASS',profile:profile.name,testedHeads:{pansphaira:panHead,kaleidoSphere:ksHead},environment:{node:process.version,abi:process.versions.modules,platform:process.platform,arch:process.arch},sourceDigests:Object.fromEntries(['scripts/run-forward-paired-analytics.mjs','src/cks-12/kaleidosphere-candidate-quarantine.ts','src/analytics/producer-analytics-manifest.ts','src/analytics/paired-analytics-parity.ts'].map(f=>[f,sha(readFileSync(resolve(root,f)))])),capture,consumerManifest,producerManifest:producer.manifest,pair,tests,negative:['CONSUMER_SUBSTITUTION_DENIED','ENVIRONMENT_SUBSTITUTION_DENIED'],nonclaim:'Exact local process execution only; public CI, release and issue closure require independent provider readback.'};
  } finally {await stop(child);}
}
async function main() {
  const args=process.argv.slice(2);const names=['--counterpart','--pan-head','--output'];
  if(args.includes('--profile'))names.push('--profile');
  if(args.length!==names.length*2||names.some(n=>args.filter(a=>a===n).length!==1)||args.some((a,i)=>i%2===0&&!names.includes(a)))throw new Error('FORWARD_EXECUTION_ARGUMENTS_REQUIRED');
  const option=n=>args[args.indexOf(n)+1];
  const root=realpathSync(resolve(fileURLToPath(import.meta.url),'../..'));
  const ks=realpathSync(resolve(option('--counterpart')));
  const output=resolve(option('--output'));
  const outputParent=realpathSync(resolve(output,'..'));
  for(const checkout of [root,ks]){const rel=relative(checkout,outputParent);if(rel===''||(rel!=='..'&&!rel.startsWith('../')&&!isAbsolute(rel)))throw new Error('FORWARD_RECEIPT_OUTSIDE_CHECKOUT_REQUIRED');}
  const profile=forwardExecutionProfile(args.includes('--profile')?option('--profile'):'main');
  const receipt=await execute(root,ks,option('--pan-head'),profile);
  writeFileSync(output,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({state:receipt.state,testedHeads:receipt.testedHeads}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error);process.exitCode=1;});
