// PAN576: a finite workload qualifier extending the existing Docker profile.
// Native tools, verifier and private state stay outside this workload.
import {spawn, spawnSync} from 'node:child_process';
import {createHash, createHmac, randomBytes, randomUUID, timingSafeEqual} from 'node:crypto';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, lstatSync, rmSync, readdirSync, existsSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {types} from 'node:util';
import {IMAGE_ID} from '../pan454/journey-profile.mjs';
import {runBoundedProcessV1} from '../../scripts/extension-dynamic-process-lifecycle.mjs';
import {canonicalJson} from '../../dist/packages/contracts/src/canonical-json.js';
import {createPan471CompositionSession, discoverPan471CompositionBindings} from './composition-bindings.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const IMAGE = 'node@' + IMAGE_ID;
// Exact Linux/amd64 child/config digests of that unchanged primary OCI index.
// Docker image-store representations are distinct; no alternate image is admitted.
const IMAGE_PLATFORM_ID='sha256:65932751ed4073ed02f5c04e494e4b2572a891b7dbea0568a863dc80341bf848';
const IMAGE_CONFIG_ID='sha256:9da0264deb61958d09c073001c1bd3a110ae3874be3375e92e0c0f16683986dd';
export function describePan471PinnedRuntimeImage(untrustedImage) {
  let image;
  try {image=dataCopy(untrustedImage);} catch {throw new Error('PAN576_RUNTIME_IDENTITY_DENIED');}
  if(!image||!Object.hasOwn(image,'Id')||![IMAGE_ID,IMAGE_PLATFORM_ID,IMAGE_CONFIG_ID].includes(image.Id)
    ||image.Os!=='linux'||image.Architecture!=='amd64'||!Array.isArray(image.RepoDigests)
    ||!image.RepoDigests.includes(IMAGE)||Object.hasOwn(image,'activationAuthority'))
    throw new Error('PAN576_RUNTIME_IDENTITY_DENIED');
  return Object.freeze({imageId:image.Id,indexDigest:IMAGE_ID,platformDigest:IMAGE_PLATFORM_ID,
    configDigest:IMAGE_CONFIG_ID,activationAuthority:false});
}
const UID=process.getuid(),GID=process.getgid(),USER=UID+':'+GID;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function nodeIncludeDirectory() {
  const include=join(dirname(dirname(process.execPath)),'include/node');
  try {
    const header=lstatSync(join(include,'node_api.h'));
    if(!header.isFile()||header.isSymbolicLink())throw new Error();
  } catch {throw new Error('PAN576_ACTIVE_NODE_HEADERS_REQUIRED');}
  return include;
}
function runtimeEnvelope(container,image,invocation,ownedPaths,program) {
  const env=container.Config.Env??[],imageEnv=image.Config.Env??[];
  const names=env.map(row=>row.split('=',1)[0]).sort();
  const host=container.HostConfig;
  const expectedMounts=new Map([['/stage',ownedPaths.stage],['/artifact',ownedPaths.artifact],['/guarded',ownedPaths.guarded]]);
  const mounts=container.Mounts??[],tmpfs=host.Tmpfs??{};
  const expectedTmpfs=`rw,noexec,nosuid,nodev,size=1048576,uid=${UID},gid=${GID},mode=0700`;
  const mountsClosed=mounts.length===expectedMounts.size&&new Set(mounts.map(row=>row.Destination)).size===expectedMounts.size
    &&mounts.every(row=>row.Type==='bind'&&!row.RW&&row.Source===expectedMounts.get(row.Destination)&&row.Propagation==='rprivate');
  if(UID===0||container.Config.Labels['io.pansphaira.pan576.invocation']!==invocation||container.Image!==image.Id
    ||container.Config.User!==USER||host.NetworkMode!=='none'||host.PidMode!==''||host.IpcMode!=='private'
    ||host.Privileged||!host.ReadonlyRootfs||host.PidsLimit!==32||host.Memory!==268435456
    ||host.MemorySwap!==268435456||host.NanoCpus!==1000000000
    ||!host.SecurityOpt.includes('no-new-privileges')||JSON.stringify(host.CapDrop)!==JSON.stringify(['ALL'])
    ||JSON.stringify(names)!==JSON.stringify(['NODE_VERSION','PATH','YARN_VERSION'])
    ||JSON.stringify([...env].sort())!==JSON.stringify([...imageEnv].sort())||!mountsClosed
    ||JSON.stringify(Object.keys(tmpfs).sort())!==JSON.stringify(['/output','/scratch'])
    ||tmpfs['/scratch']!==expectedTmpfs||tmpfs['/output']!==expectedTmpfs
    ||JSON.stringify(container.Config.Cmd)!==JSON.stringify(['node',program])
    ||JSON.stringify(container.Config.Entrypoint)!==JSON.stringify(image.Config.Entrypoint)
    ||(host.Devices??[]).length!==0||(host.DeviceRequests??[]).length!==0)
    throw new Error('PAN576_EFFECTIVE_RUNTIME_ENVELOPE_DENIED');
  return {imageId:container.Image,network:host.NetworkMode,readOnlyRoot:host.ReadonlyRootfs,
    privileged:host.Privileged,user:container.Config.User,pidMode:host.PidMode,ipcMode:host.IpcMode,
    noNewPrivileges:true,capabilitiesDropped:host.CapDrop,pidsLimit:host.PidsLimit,memory:host.Memory,
    environmentNames:names,mounts:mounts.map(row=>({destination:row.Destination,writable:row.RW})),
    exactOwnedMountSources:true,closedTmpfs:true,entrypointAndCommandBound:true};
}
function control(args) {
  const result = spawnSync('docker', args, {encoding:'utf8', timeout:10000, maxBuffer:65536});
  if (result.error || result.status !== 0) throw new Error('PAN576_DOCKER_CONTROL_DENIED');
  return result.stdout.trim();
}
const PROBE = `import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,symlinkSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {Socket} from 'node:net';
const require=createRequire(import.meta.url);
// Deliberately create libuv workers before the seal to test TSYNC coverage.
await readFile('/artifact/input.json');
const abi=require('/stage/guard.node').seal();
const code=fn=>{try{fn();return 'UNEXPECTED_ALLOW'}catch(e){return e.code}};
const context=JSON.parse(readFileSync('/artifact/input.json','utf8'));
writeFileSync('/scratch/permitted','scratch');writeFileSync('/output/permitted','output');
symlinkSync('/guarded/protected.txt','/scratch/escape');
let asyncProtected;try{await readFile('/guarded/protected.txt');asyncProtected='UNEXPECTED_ALLOW'}catch(e){asyncProtected=e.code}
const child=spawnSync('/usr/local/bin/node',['-e','0']);
const socket=new Socket();const networkSocket=await new Promise(resolve=>{socket.once('error',e=>resolve(e.code));socket.connect(9,'127.0.0.1')});socket.destroy();
console.log(JSON.stringify({uid:process.getuid(),node:process.version,landlockABI:abi,
permittedContextRead:context.value===7,permittedScratchWrite:readFileSync('/scratch/permitted','utf8')==='scratch',
permittedOutputWrite:readFileSync('/output/permitted','utf8')==='output',
protectedRead:code(()=>readFileSync('/guarded/protected.txt')),asyncProtectedRead:asyncProtected,
symlinkEscape:code(()=>readFileSync('/scratch/escape')),childProcess:child.error?.code??'UNEXPECTED_ALLOW',
networkSocket,rootWrite:code(()=>writeFileSync('/outside','forbidden'))}));`;

export async function probePan471CompositionIsolation() {
  const parent = process.env.TMPDIR ?? process.env.RUNNER_TEMP;
  if (!parent || !parent.startsWith('/') || lstatSync(parent).isSymbolicLink()
      || !lstatSync(parent).isDirectory() || lstatSync(parent).uid !== process.getuid()) throw new Error('PAN576_OWNED_SCRATCH_REQUIRED');
  const root = mkdtempSync(join(parent,'pan576-kernel-'));
  const stage=join(root,'stage'), artifact=join(root,'artifact'), guarded=join(root,'guarded');
  for(const path of [stage,artifact,guarded]) mkdirSync(path,{mode:0o700});
  const invocation = 'pan576-' + randomUUID().replaceAll('-','').slice(0,20);
  let id, observed, actualContainer, execution, compiledSha;
  let ownContainerRemovedAndAbsent=false;
  try {
    writeFileSync(join(stage,'probe.mjs'),PROBE,{mode:0o600});
    writeFileSync(join(artifact,'input.json'),JSON.stringify({value:7}),{mode:0o600});
    writeFileSync(join(guarded,'protected.txt'),'NON_AUTHORITY_SYNTHETIC_CANARY',{mode:0o600});
    const build=spawnSync('gcc',['-shared','-fPIC','-O2','-Wall','-Wextra','-Werror','-I'+nodeIncludeDirectory(),
      join(ROOT,'scripts/pan576-kernel-guard.c'),'-o',join(stage,'guard.node')],{encoding:'utf8',timeout:30000});
    if(build.error || build.status!==0) throw new Error('PAN576_KERNEL_PROFILE_BUILD_DENIED: '+build.stderr);
    compiledSha=sha(readFileSync(join(stage,'guard.node')));
    const image=JSON.parse(control(['image','inspect',IMAGE,'--format','{{json .}}']));
    describePan471PinnedRuntimeImage(image);
    id=control(['create','--name',invocation,'--pull','never','--network','none','--read-only',
      '--cap-drop','ALL','--security-opt','no-new-privileges','--user',USER,'--ipc','private','--memory','268435456',
      '--memory-swap','268435456','--cpus','1','--pids-limit','32','--label','io.pansphaira.pan576.invocation='+invocation,
      '--tmpfs',`/scratch:rw,noexec,nosuid,nodev,size=1048576,uid=${UID},gid=${GID},mode=0700`,
      '--tmpfs',`/output:rw,noexec,nosuid,nodev,size=1048576,uid=${UID},gid=${GID},mode=0700`,
      '--mount','type=bind,src='+stage+',dst=/stage,readonly',
      '--mount','type=bind,src='+artifact+',dst=/artifact,readonly',
      '--mount','type=bind,src='+guarded+',dst=/guarded,readonly',IMAGE,'node','/stage/probe.mjs']);
    const container=JSON.parse(control(['container','inspect',id,'--format','{{json .}}']));
    if(container.Config.Labels['io.pansphaira.pan576.invocation']!==invocation || container.Image!==image.Id) throw new Error('PAN576_OWN_RESOURCE_IDENTITY_DENIED');
    actualContainer=runtimeEnvelope(container,image,invocation,{stage,artifact,guarded},'/stage/probe.mjs');
    execution=await runBoundedProcessV1('docker',['start','-a',id],{timeoutMs:15000,maxOutputBytes:65536});
    if(execution.timedOut || execution.exitCode!==0) throw new Error('PAN576_KERNEL_CROSSINGS_DENIED: '+execution.stderr);
    observed=JSON.parse(execution.stdout.trim());
  } finally {
    if(id) {
      const container=JSON.parse(control(['container','inspect',id,'--format','{{json .}}']));
      if(container.Id!==id || container.Config.Labels['io.pansphaira.pan576.invocation']!==invocation) throw new Error('PAN576_FOREIGN_CLEANUP_DENIED');
      control(['container','rm','--force',id]);
      const absence=spawnSync('docker',['container','inspect',id],{encoding:'utf8',timeout:10000});
      ownContainerRemovedAndAbsent=absence.status!==0 && /No such (object|container)/.test(absence.stderr);
      if(!ownContainerRemovedAndAbsent) throw new Error('PAN576_OWN_CLEANUP_UNPROVEN');
    }
    rmSync(root,{recursive:true,force:true});
  }
  return {outcome:'BOUNDED_KERNEL_CROSSINGS_OBSERVED',observed,actualContainer,ownContainerRemovedAndAbsent,
    ownStagingRemoved:true,compiledKernelGuardSha256:compiledSha,
    guardSourceSha256:sha(readFileSync(join(ROOT,'scripts/pan576-kernel-guard.c'))),
    guestProgramSha256:sha(PROBE),executionExit:execution.exitCode,executionTimedOut:execution.timedOut,
    earlier454FalsificationUnchanged:true,nodePermissionIsSecurityBoundary:false,modelRun:'NOT_RUN',
    scope:'FINITE_SYNTHETIC_KERNEL_PROFILE_NOT_HOST_DAEMON_KERNEL_OR_UNIVERSAL_SANDBOX_ACCEPTANCE'};
}

const denied = code => ({outcome:'DENIED',code});
const digest = value => sha(canonicalJson(value));
function dataCopy(value) {
  const active=new Set();let count=0;
  function visit(node,depth=0) {
    if(++count>8192||depth>16)throw new Error('DATA_ONLY_DENIED');
    if(node===null||typeof node==='string'||typeof node==='boolean')return;
    if(typeof node==='number'&&Number.isFinite(node))return;
    if(typeof node!=='object'||types.isProxy(node)||active.has(node))throw new Error('DATA_ONLY_DENIED');
    const array=Array.isArray(node);
    if(Object.getPrototypeOf(node)!==(array?Array.prototype:Object.prototype))throw new Error('DATA_ONLY_DENIED');
    const descriptors=Object.getOwnPropertyDescriptors(node),keys=Reflect.ownKeys(descriptors);
    for(const key of keys) {
      const row=descriptors[key];
      if(typeof key!=='string'||!Object.hasOwn(row,'value')||row.get||row.set)throw new Error('DATA_ONLY_DENIED');
      if(array&&key==='length')continue;
      if(!row.enumerable)throw new Error('DATA_ONLY_DENIED');
    }
    if(array&&(keys.length!==descriptors.length.value+1||descriptors.length.value>4096))throw new Error('DATA_ONLY_DENIED');
    active.add(node);for(const key of keys)if(!array||key!=='length')visit(descriptors[key].value,depth+1);active.delete(node);
  }
  visit(value);const bytes=canonicalJson(value);
  if(Buffer.byteLength(bytes)>65536)throw new Error('DATA_ONLY_DENIED');
  return JSON.parse(bytes);
}
function keysEqual(value,keys) {
  return value!==null&&typeof value==='object'&&!Array.isArray(value)
    &&canonicalJson(Object.keys(value).sort())===canonicalJson([...keys].sort());
}
function parentOwned() {
  const parent=process.env.TMPDIR??process.env.RUNNER_TEMP;
  if(!parent||!parent.startsWith('/')||lstatSync(parent).isSymbolicLink()||!lstatSync(parent).isDirectory()
    ||lstatSync(parent).uid!==process.getuid())throw new Error('PAN576_OWNED_SCRATCH_REQUIRED');
  return parent;
}
function compiledBuildFiles(directory,files=[]) {
  for(const row of readdirSync(directory,{withFileTypes:true})) {
    const path=join(directory,row.name);
    if(row.isSymbolicLink())throw new Error('PAN576_BUILD_LINK_DENIED');
    if(row.isDirectory())compiledBuildFiles(path,files);
    else if(row.isFile()&&row.name.endsWith('.js'))files.push(path);
  }
  return files.sort();
}
function freezeBuild(stage) {
  const runtime=describePan471PinnedRuntimeImage(JSON.parse(control(['image','inspect',IMAGE,'--format','{{json .}}'])));
  const guard=join(stage,'guard.node');
  const flags=['-shared','-fPIC','-O2','-Wall','-Wextra','-Werror','-I'+nodeIncludeDirectory()];
  const build=spawnSync('gcc',[...flags,join(ROOT,'scripts/pan576-kernel-guard.c'),'-o',guard],{encoding:'utf8',timeout:30000});
  if(build.error||build.status!==0)throw new Error('PAN576_KERNEL_PROFILE_BUILD_DENIED');
  const dependencies=spawnSync('gcc',['-M','-I'+nodeIncludeDirectory(),join(ROOT,'scripts/pan576-kernel-guard.c')],{encoding:'utf8',timeout:10000});
  if(dependencies.error||dependencies.status!==0)throw new Error('PAN576_BUILD_DEPENDENCY_DENIED');
  const paths=dependencies.stdout.replace(/\\\n/g,' ').split(':').slice(1).join(':').trim().split(/\s+/);
  const bindings=discoverPan471CompositionBindings().bindings;
  const selected=['package.json','package-lock.json','tsconfig.json','scripts/pan576-kernel-guard.c',
    'scripts/pan576-isolated-worker.mjs','src/pan471/composition-execution.mjs','src/pan471/composition-bindings.mjs',
    'src/pan454/journey-profile.mjs','scripts/extension-dynamic-process-lifecycle.mjs','scripts/extension-dynamic-synthetic.mjs',
    ...bindings.flatMap(binding=>binding.runtimeBinding.members.map(member=>member.path))].map(path=>join(ROOT,path));
  const files=[...new Set([...paths,...selected,...compiledBuildFiles(join(ROOT,'dist'))])].sort()
    .map(path=>({path,sha256:sha(readFileSync(path))}));
  const compiler=spawnSync('gcc',['--version'],{encoding:'utf8',timeout:10000});
  if(compiler.status!==0)throw new Error('PAN576_COMPILER_IDENTITY_DENIED');
  return {guardBytes:readFileSync(guard),binding:{schemaVersion:'pansphaira.pan471/composition-build/v1',
    moduleContracts:bindings,files,compiler:compiler.stdout.split('\n')[0],compilerFlags:flags,
    compiledKernelGuardSha256:sha(readFileSync(guard)),hostNode:process.version,
    runtimeImageId:runtime.imageId,runtimeIndexDigest:runtime.indexDigest,
    runtimePlatformDigest:runtime.platformDigest,runtimeConfigDigest:runtime.configDigest,
    guestNode:'v24.19.0',guestUser:USER,platform:'linux/amd64',requiredLandlockABI:8,
    callerHashIsAuthority:false,activationAuthority:false}};
}

// Deliberately independent arithmetic for one declared synthetic test family;
// not an independent person review or an oracle for arbitrary MRP semantics.
function finiteOracle(input) {
  const m=input.material;
  if(!m||m.items?.length!==1||m.demands?.length!==1||m.stock?.length!==1||m.boms?.length!==0||m.receipts?.length!==0)
    throw new Error('PAN576_ORACLE_PROFILE_DENIED');
  const item=m.items[0],stock=m.stock[0],demand=m.demands[0];
  if(item.supply!=='BUY'||item.unit!=='STK'||item.safetyStock!==0||item.lotMinimum!==0||item.lotMultiple!==1
    ||stock.itemId!==item.id||demand.itemId!==item.id||stock.reserved!==0||stock.blocked!==0
    ||!Number.isSafeInteger(demand.quantity)||!Number.isSafeInteger(stock.physical)||stock.physical<0)
    throw new Error('PAN576_ORACLE_PROFILE_DENIED');
  const plannedQuantity=Math.max(0,demand.quantity-stock.physical);
  if(plannedQuantity<1||plannedQuantity>100)throw new Error('PAN576_ORACLE_PROFILE_DENIED');
  return {plannedQuantity,profile:'ONE_BUY_ITEM_STK_TO_EXPLICIT_SYNTHETIC_EACH_CHECK_ONLY',procurementOrderEquivalence:false};
}

function streamNativeWorkload(id,input,onInvoke,onAbortReady) {
  return new Promise((resolve,reject)=>{
    const child=spawn('docker',['start','-a','-i',id],{shell:false,stdio:['pipe','pipe','pipe']});
    let pending='',stdoutBytes=0,stderr='',sealed=null,finish=null,protocolDenied=false,timedOut=false,aborted=false;
    let gateOpen=true;
    const stop=()=>{gateOpen=false;child.kill('SIGKILL');};
    onAbortReady(()=>{aborted=true;stop();});
    const timeout=setTimeout(()=>{timedOut=true;stop();},15000);
    child.stdin.on('error',()=>{gateOpen=false;});
    child.stderr.on('data',chunk=>{stderr+=chunk.toString();if(Buffer.byteLength(stderr)>65536)stop();});
    child.stdout.on('data',chunk=>{
      stdoutBytes+=chunk.length;if(stdoutBytes>65536){protocolDenied=true;stop();return;}
      pending+=chunk.toString();let end;
      while((end=pending.indexOf('\n'))!==-1) {
        const line=pending.slice(0,end);pending=pending.slice(end+1);
        if(!gateOpen)continue;
        try {
          const message=dataCopy(JSON.parse(line));
          if(message.kind==='sealed'&&!sealed&&keysEqual(message,['kind','node','uid','landlockABI'])
            &&message.node==='v24.19.0'&&message.uid===UID&&message.landlockABI>=8) {
            sealed=message;child.stdin.write(JSON.stringify({kind:'begin',input})+'\n');
          } else if(sealed&&message.kind==='invoke'&&keysEqual(message,['kind','callId','capabilityId','input'])) {
            const result=onInvoke(message);child.stdin.write(JSON.stringify({kind:'reply',callId:message.callId,result})+'\n');
          } else if(sealed&&message.kind==='finish'&&!finish&&keysEqual(message,['kind','result'])) {
            finish=message.result;gateOpen=false;child.stdin.end();
          } else if(message.kind==='artifactError'&&keysEqual(message,['kind'])) {
            gateOpen=false;child.stdin.end();
          } else {protocolDenied=true;stop();}
        } catch {protocolDenied=true;stop();}
      }
    });
    child.once('error',error=>{clearTimeout(timeout);gateOpen=false;reject(error);});
    child.once('close',(exitCode,signal)=>{clearTimeout(timeout);gateOpen=false;
      resolve({exitCode,signal,timedOut,aborted,protocolDenied,sealed,finish,stderr,pendingTail:pending.length>0});});
  });
}

// Owner-only constructor. Neither controller nor opaque grants nor source
// code paths/signers are exposed in the untrusted ctx or any registered model tool.
export function createPan471CompositionExecutor() {
  const root=mkdtempSync(join(parentOwned(),'pan576-owner-'));
  const grants=new WeakMap(),results=new WeakMap(),records=new Map(),unreconciled=new Set();
  const signingKey=randomBytes(32);let busy=false,closed=false,activeWorkload=null,pendingFailure=null;
  function freeze(untrusted) {
    if(closed||busy)throw new Error('PAN576_OWNER_STATE_DENIED');
    const submission=dataCopy(untrusted);
    if(!keysEqual(submission,['schemaVersion','version','entrypoint','code'])
      ||submission.schemaVersion!=='pansphaira.pan471/composition-submission/v1'||submission.version!=='1.0.0'
      ||submission.entrypoint!=='run(ctx,input)'||typeof submission.code!=='string'
      ||Buffer.byteLength(submission.code)>32768||submission.code.length===0||submission.code.includes('\0'))
      throw new Error('PAN576_SUBMISSION_CONTRACT_DENIED');
    const buildStage=mkdtempSync(join(root,'build-'));
    try {
      const build=freezeBuild(buildStage),code=Buffer.from(submission.code,'utf8');
      const handle=Object.freeze({schemaVersion:submission.schemaVersion,version:submission.version,
        artifactDigest:sha(code),buildBindingDigest:digest(build.binding)});
      grants.set(handle,{code,build});return handle;
    } finally {rmSync(buildStage,{recursive:true,force:true});}
  }
  async function run(handle,untrustedInput) {
    if(closed||busy||!handle||typeof handle!=='object'||!grants.has(handle))return denied('AUTHORITY_DENIED');
    if(pendingFailure)return denied('OWN_RESOURCE_OR_EFFECT_RECONCILIATION_REQUIRED');
    if(unreconciled.size>0)return denied('UNRECONCILED_NATIVE_EFFECT');
    const held=grants.get(handle);
    try {
      for(const member of held.build.binding.files)if(sha(readFileSync(member.path))!==member.sha256)return denied('BUILD_DRIFT_DENIED');
    } catch {return denied('BUILD_DRIFT_DENIED');}
    let input,oracle;
    try {input=dataCopy(untrustedInput);if(!keysEqual(input,['material','requestId','sku']))throw new Error();oracle=finiteOracle(input);}
    catch{return denied('INPUT_OR_ORACLE_PROFILE_DENIED');}
    busy=true;
    const own=mkdtempSync(join(root,'run-')),stage=join(own,'stage'),artifact=join(own,'artifact'),guarded=join(own,'guarded');
    for(const path of [stage,artifact,guarded])mkdirSync(path,{mode:0o700});
    const invocation='pan576-'+randomUUID().replaceAll('-','').slice(0,20);
    let id,actualContainer,execution,ownContainerRemovedAndAbsent=false;
    const session=createPan471CompositionSession(),bindings=held.build.binding.moduleContracts;
    activeWorkload={session,abort:null};
    const nativeGrants=new Map(bindings.map(binding=>[binding.capabilityId,session.controller.issue(binding.capabilityId)]));
    const calls=[],seen=new Set();let attempts=0;
    function invoke(message) {
      if(++attempts>2||typeof message.callId!=='string'||!/^(call-[1-9][0-9]?)$/.test(message.callId)
        ||seen.has(message.callId))return denied('TOOL_BUDGET_OR_REPLAY_DENIED');
      seen.add(message.callId);
      const binding=bindings.find(row=>row.capabilityId===message.capabilityId);
      if(!binding)return denied('CAPABILITY_UNKNOWN');
      const envelope={schemaVersion:'pansphaira.pan471/composition-call/v1',capabilityId:binding.capabilityId,
        contractDigest:binding.contractDigest,operation:binding.operation,unit:binding.quantity.unit,input:message.input};
      const result=session.tools.invoke(nativeGrants.get(binding.capabilityId),envelope);
      if(result.outcome==='NATIVE_READBACK')calls.push({capabilityId:binding.capabilityId,input:dataCopy(message.input),result:dataCopy(result)});
      return result;
    }
    try {
      writeFileSync(join(stage,'guard.node'),held.build.guardBytes,{mode:0o600});
      writeFileSync(join(stage,'worker.mjs'),readFileSync(join(ROOT,'scripts/pan576-isolated-worker.mjs')),{mode:0o600});
      writeFileSync(join(artifact,'submission.mjs'),held.code,{mode:0o600});
      writeFileSync(join(artifact,'input.json'),canonicalJson(input),{mode:0o600});
      writeFileSync(join(guarded,'protected.txt'),'NON_AUTHORITY_SYNTHETIC_KEY_OR_ORACLE_CANARY',{mode:0o600});
      const image=JSON.parse(control(['image','inspect',IMAGE,'--format','{{json .}}']));
      const runtime=describePan471PinnedRuntimeImage(image);
      if(runtime.imageId!==held.build.binding.runtimeImageId)throw new Error('PAN576_RUNTIME_IDENTITY_DENIED');
      id=control(['create','-i','--name',invocation,'--pull','never','--network','none','--read-only','--cap-drop','ALL',
        '--security-opt','no-new-privileges','--user',USER,'--ipc','private','--memory','268435456','--memory-swap','268435456',
        '--cpus','1','--pids-limit','32','--label','io.pansphaira.pan576.invocation='+invocation,
        '--tmpfs',`/scratch:rw,noexec,nosuid,nodev,size=1048576,uid=${UID},gid=${GID},mode=0700`,
        '--tmpfs',`/output:rw,noexec,nosuid,nodev,size=1048576,uid=${UID},gid=${GID},mode=0700`,
        '--mount','type=bind,src='+stage+',dst=/stage,readonly','--mount','type=bind,src='+artifact+',dst=/artifact,readonly',
        '--mount','type=bind,src='+guarded+',dst=/guarded,readonly',IMAGE,'node','/stage/worker.mjs']);
      const observed=JSON.parse(control(['container','inspect',id,'--format','{{json .}}']));
      if(observed.Config.Labels['io.pansphaira.pan576.invocation']!==invocation||observed.Image!==held.build.binding.runtimeImageId)
        throw new Error('PAN576_OWN_RESOURCE_IDENTITY_DENIED');
      actualContainer=runtimeEnvelope(observed,image,invocation,{stage,artifact,guarded},'/stage/worker.mjs');
      execution=await streamNativeWorkload(id,input,invoke,stop=>{activeWorkload.abort=stop;});
    } finally {
      try {
        if(id) {
          const observed=JSON.parse(control(['container','inspect',id,'--format','{{json .}}']));
          if(observed.Id!==id||observed.Config.Labels['io.pansphaira.pan576.invocation']!==invocation)
            throw new Error('PAN576_FOREIGN_CLEANUP_DENIED');
          control(['container','rm','--force',id]);
          const absence=spawnSync('docker',['container','inspect',id],{encoding:'utf8',timeout:10000});
          ownContainerRemovedAndAbsent=absence.status!==0&&/No such (object|container)/.test(absence.stderr);
          if(!ownContainerRemovedAndAbsent)throw new Error('PAN576_OWN_CLEANUP_UNPROVEN');
        }
      } catch(error) {
        pendingFailure={id,invocation,own,session,receipt:calls.find(row=>row.capabilityId==='erp.order.create')?.result.nativeResult??null};
        throw error;
      } finally {if(!pendingFailure)rmSync(own,{recursive:true,force:true});busy=false;activeWorkload=null;}
    }
    const nativeEvidence=session.controller.evidence(),plan=calls.find(row=>row.capabilityId==='pan522.material.plan');
    const cell=calls.find(row=>row.capabilityId==='erp.order.create');
    const targetOK=execution.exitCode===0&&!execution.timedOut&&!execution.aborted&&!execution.protocolDenied&&!execution.pendingTail
      &&execution.sealed&&execution.finish&&calls.length===2&&nativeEvidence.materialInvocations===1
      &&nativeEvidence.cell.executions===1&&nativeEvidence.cell.providerOrderCount===0
      &&plan?.result.nativeResult.proposals[0]?.plannedQuantity===oracle.plannedQuantity
      &&digest(plan.input)===digest(input.material)&&cell?.input.quantity===oracle.plannedQuantity
      &&cell.input.requestId===input.requestId&&cell.input.sku===input.sku
      &&execution.finish.quantity===oracle.plannedQuantity&&execution.finish.receiptDigest===cell.result.nativeResult.receiptDigest;
    const report={schemaVersion:'pansphaira.pan471/composition-execution/v1',runId:invocation,
      outcome:targetOK?'NATIVE_COMPOSITION_ARTIFACT_READ_BACK':'NATIVE_TARGET_NOT_VERIFIED',
      artifactDigest:handle.artifactDigest,buildBindingDigest:handle.buildBindingDigest,inputDigest:digest(input),
      exitCode:execution.exitCode,timedOut:execution.timedOut,aborted:execution.aborted,protocolDenied:execution.protocolDenied,
      workflowState:targetOK?'VERIFIED':(execution.finish?'FAILED':'OUTCOME_UNKNOWN'),
      effectState:nativeEvidence.cell.executions===0?'NO_NATIVE_EFFECT_RECORDED':
        (targetOK?'OBSERVED_COMPENSATED':'REQUIRES_NATIVE_RECONCILIATION'),
      allowedToolCalls:calls.length,nativeEvidence,nativeCellReceipt:cell?.result.nativeResult??null,oracle,
      actualContainer,guestSeal:execution.sealed,ownContainerRemovedAndAbsent,ownStagingRemoved:!existsSync(own),
      modelRun:'NOT_RUN',newCompositionClaimed:false,crashDurableExactlyOnceClaimed:false,
      nativeTargetMode:'EXISTING_SYNTHETIC_MEMORY_NATIVE_CELL_WITH_IMMEDIATE_COMPENSATING_DELETE',
      automaticRetries:0};
    const record={report:dataCopy(report),session,input:dataCopy(input)};
    results.set(report,record);records.set(invocation,record);
    if(report.effectState==='REQUIRES_NATIVE_RECONCILIATION')unreconciled.add(invocation);
    return report;
  }
  function verify(report) {
    if(closed||!report||typeof report!=='object'||!results.has(report))return denied('TARGET_RECORD_UNKNOWN');
    const actual=results.get(report);
    if(digest(report)!==digest(actual.report)||digest(actual.session.controller.evidence())!==digest(actual.report.nativeEvidence)
      ||actual.report.outcome!=='NATIVE_COMPOSITION_ARTIFACT_READ_BACK')return denied('NATIVE_TARGET_NOT_VERIFIED');
    return {outcome:'VERIFIED_NATIVE_TARGET',artifactDigest:actual.report.artifactDigest,inputDigest:actual.report.inputDigest};
  }
  function reconcile(report) {
    if(closed||!report||typeof report!=='object'||!results.has(report))return denied('TARGET_RECORD_UNKNOWN');
    const actual=results.get(report),readback=actual.session.controller.evidence(),receipt=actual.report.nativeCellReceipt;
    if(digest(readback)!==digest(actual.report.nativeEvidence)||readback.cell.providerOrderCount!==0
      ||!receipt||receipt.effectCount!==1||receipt.rollbackCount!==1||receipt.beforeDigest!==receipt.finalDigest
      ||!readback.cell.receiptDigests.includes(receipt.receiptDigest))return denied('NATIVE_RECONCILIATION_REQUIRED');
    unreconciled.delete(actual.report.runId);
    return {outcome:'RECONCILED_NATIVE_TARGET',effectState:'OBSERVED_COMPENSATED',
      nativeExecutions:readback.cell.executions,providerOrderCount:readback.cell.providerOrderCount,
      actualReceiptDigest:receipt.receiptDigest,automaticRetryPermitted:false,
      crashDurableExactlyOnceClaimed:false};
  }
  function activeEvidence() {
    return {running:busy,nativeEvidence:activeWorkload?.session.controller.evidence()??null};
  }
  function abort() {
    if(closed||!busy||typeof activeWorkload?.abort!=='function')return denied('NO_OWN_ACTIVE_WORKLOAD');
    activeWorkload.abort();return {outcome:'OWN_WORKLOAD_ABORT_REQUESTED'};
  }
  function pendingOutcome() {
    if(!pendingFailure)return denied('NO_OWN_PENDING_RECOVERY');
    return {workflowState:'OUTCOME_UNKNOWN',effectState:'REQUIRES_NATIVE_RECONCILIATION',
      ownContainerRemovedAndAbsent:false,nativeEvidence:pendingFailure.session.controller.evidence(),automaticRetryPermitted:false};
  }
  function recoverPending() {
    if(closed||busy||!pendingFailure)return denied('NO_OWN_PENDING_RECOVERY');
    const pending=pendingFailure;
    if(pending.id) {
      const observed=spawnSync('docker',['container','inspect',pending.id,'--format','{{json .}}'],{encoding:'utf8',timeout:10000});
      if(observed.error)throw new Error('PAN576_OWN_RECOVERY_UNPROVEN');
      if(observed.status===0) {
        const container=JSON.parse(observed.stdout);
        if(container.Id!==pending.id||container.Config.Labels['io.pansphaira.pan576.invocation']!==pending.invocation)
          throw new Error('PAN576_FOREIGN_CLEANUP_DENIED');
        control(['container','rm','--force',pending.id]);
      } else if(!/No such (object|container)/.test(observed.stderr))throw new Error('PAN576_OWN_RECOVERY_UNPROVEN');
      const absent=spawnSync('docker',['container','inspect',pending.id],{encoding:'utf8',timeout:10000});
      if(absent.error||absent.status===0||!/No such (object|container)/.test(absent.stderr))throw new Error('PAN576_OWN_RECOVERY_UNPROVEN');
    }
    const readback=pending.session.controller.evidence(),receipt=pending.receipt;
    if(readback.cell.providerOrderCount!==0||(readback.cell.executions!==0
      &&(!receipt||receipt.effectCount!==1||receipt.rollbackCount!==1||receipt.beforeDigest!==receipt.finalDigest
        ||!readback.cell.receiptDigests.includes(receipt.receiptDigest))))return denied('NATIVE_RECONCILIATION_REQUIRED');
    rmSync(pending.own,{recursive:true,force:true});if(existsSync(pending.own))throw new Error('PAN576_OWN_RECOVERY_UNPROVEN');
    pendingFailure=null;
    return {outcome:'RECOVERED_OWNED_RESOURCES_AND_NATIVE_TARGET',workflowState:'FAILED_RECONCILED',
      effectState:readback.cell.executions===0?'NO_NATIVE_EFFECT_RECORDED':'OBSERVED_COMPENSATED',
      nativeExecutions:readback.cell.executions,providerOrderCount:readback.cell.providerOrderCount,
      ownContainerRemovedAndAbsent:true,ownStagingRemoved:true,automaticRetryPermitted:false,crashDurableExactlyOnceClaimed:false};
  }
  // Only this external trusted owner can seal a statement. A correct MAC is
  // intentionally not a statement of business truth; the verifier rereads
  // the actual native target record and an independent finite input oracle.
  function sealStatement(report,untrustedClaim) {
    if(closed||!report||typeof report!=='object'||!results.has(report))throw new Error('PAN576_TARGET_RECORD_UNKNOWN');
    const claim=dataCopy(untrustedClaim),actual=results.get(report).report;
    if(!keysEqual(claim,['quantity'])||!Number.isSafeInteger(claim.quantity)||claim.quantity<1||claim.quantity>100)
      throw new Error('PAN576_STATEMENT_CONTRACT_DENIED');
    const core={schemaVersion:'pansphaira.pan471/composition-statement/v1',runId:actual.runId,
      artifactDigest:actual.artifactDigest,buildBindingDigest:actual.buildBindingDigest,inputDigest:actual.inputDigest,claim};
    return {...core,signature:createHmac('sha256',signingKey).update(canonicalJson(core)).digest('hex')};
  }
  function verifyStatement(untrusted) {
    let statement;
    try {statement=dataCopy(untrusted);}catch{return denied('STATEMENT_CONTRACT_DENIED');}
    if(!keysEqual(statement,['schemaVersion','runId','artifactDigest','buildBindingDigest','inputDigest','claim','signature'])
      ||statement.schemaVersion!=='pansphaira.pan471/composition-statement/v1'
      ||typeof statement.signature!=='string'||!/^[a-f0-9]{64}$/.test(statement.signature))return denied('SIGNATURE_DENIED');
    const {signature,...core}=statement;
    const expected=createHmac('sha256',signingKey).update(canonicalJson(core)).digest();
    if(!timingSafeEqual(Buffer.from(signature,'hex'),expected))return denied('SIGNATURE_DENIED');
    const actual=records.get(statement.runId);
    if(!actual||actual.report.outcome!=='NATIVE_COMPOSITION_ARTIFACT_READ_BACK'
      ||statement.artifactDigest!==actual.report.artifactDigest||statement.inputDigest!==actual.report.inputDigest
      ||statement.buildBindingDigest!==actual.report.buildBindingDigest||!keysEqual(statement.claim,['quantity'])
      ||statement.claim.quantity!==finiteOracle(actual.input).plannedQuantity
      ||digest(actual.session.controller.evidence())!==digest(actual.report.nativeEvidence))
      return {...denied('NATIVE_TARGET_NOT_VERIFIED'),signatureValid:true};
    return {outcome:'VERIFIED_NATIVE_TARGET',signatureValid:true,runId:actual.report.runId};
  }
  function close() {
    if(busy)throw new Error('PAN576_OWN_WORKLOAD_ACTIVE');
    if(pendingFailure)throw new Error('PAN576_OWN_RESOURCE_RECOVERY_REQUIRED');
    if(unreconciled.size>0)throw new Error('PAN576_NATIVE_RECONCILIATION_REQUIRED');
    closed=true;signingKey.fill(0);records.clear();unreconciled.clear();rmSync(root,{recursive:true,force:true});
  }
  return {controller:Object.freeze({freeze,verify,reconcile,activeEvidence,abort,pendingOutcome,recoverPending,sealStatement,verifyStatement,close}),tools:Object.freeze({run})};
}
