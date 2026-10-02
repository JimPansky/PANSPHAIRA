// Run only as the fixed, source-bound program inside the network-none fixture.
// All targets, principals, effects and authority values are declared synthetic.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {readFileSync,writeFileSync,mkdirSync,readlinkSync,unlinkSync,statfsSync} from 'node:fs';
import {join} from 'node:path';
import {release as kernelRelease} from 'node:os';
import {fileURLToPath} from 'node:url';
import {BoundTaskHandleIssuer,createSyntheticTrustedTaskSource,createOwnedSyntheticBusinessOperation,SUPPORTED_ORDER_BINDING,useBoundTaskHandle} from '../pan442/bound-task-handle.mjs';
import {createAuthoritativeApprovalSnapshot} from '../../demo/runtime/authoritative-approval-snapshot.mjs';
import {canonicalJson,sha256} from '../../demo/runtime/enforcement-gate.mjs';
import {BASE_FILES,QUALIFIER_FILES,conformanceDecision} from './journey-profile.mjs';
const root='/scratch/pan454-owned';
function request(){const s=SUPPORTED_ORDER_BINDING;return {tenant:s.tenant,user:'operator:pan454-synthetic',runId:'run:pan454:order:0001',objectVersion:1,declaredAmountMinor:0,currency:s.currency,object:{provider:s.provider,entity:s.entity,operation:s.operation,refClient:s.refClient,customerId:s.customerId,orderDateEpoch:s.orderDateEpoch}};}
function fixture(id){
 const input=request(),s=SUPPORTED_ORDER_BINDING,taskRef='pan454-order-task-0001',dir=join(root,'pan453-owned-v2',id);mkdirSync(dir,{recursive:true});
 const taskSource=createSyntheticTrustedTaskSource({principal:{user:input.user,tenant:input.tenant},tasks:[{taskRef,runId:input.runId,tenant:input.tenant,user:input.user,object:input.object,objectVersion:1,purpose:s.purpose,amountLimitMinor:0,currency:s.currency,ttlMs:120000}]});
 const issuer=new BoundTaskHandleIssuer({taskSource,secret:'pan454-local-synthetic-issuer-not-a-real-credential',now:()=>1000000});
 const counts={snapshots:0,mutations:0,readbacks:0};const target=join(dir,'synthetic-provider-target.json');
 const provider={async readAuthoritativeSnapshot(action){counts.snapshots++;return createAuthoritativeApprovalSnapshot(action,[]);},async mutate(action){counts.mutations++;writeFileSync(target,JSON.stringify({id:'synthetic-order-454',date:action.payload.body.date,ref_client:action.payload.body.ref_client,socid:action.payload.body.socid}),{flag:'wx',mode:0o600});return {id:'synthetic-order-454'};},async readback(){counts.readbacks++;return JSON.parse(readFileSync(target,'utf8'));}};
 const operation=createOwnedSyntheticBusinessOperation({provider,now:()=>1000000,root:dir});const {handle}=issuer.createHandle({taskRef});
 return {input,issuer,operation,handle,counts,target,dir};
}
async function permitted(f){
 const out=await useBoundTaskHandle({issuer:f.issuer,operation:f.operation,handle:f.handle,operationInput:f.input});
 assert.equal(out.status,'PASS');assert.equal(out.decision.outcome,'OWNER_ESCALATION');assert.equal(out.authority.kind,'OWNER_ESCALATION_LEASE_HMAC_V1');assert.equal(out.authority.maxUses,1);
 assert.deepEqual(f.counts,{snapshots:3,mutations:1,readbacks:1});assert.equal(out.result.readback.ref_client,'CM-ADMIN-AI-ESCALATION-001');assert.equal(out.result.receipt.ownerDecisionReceiptDigest,out.authority.ownerDecisionReceiptDigest);
 assert.equal(f.issuer.observations.length,1);const target=JSON.parse(readFileSync(f.target,'utf8'));assert.deepEqual(target,{id:'synthetic-order-454',date:1767225600,ref_client:'CM-ADMIN-AI-ESCALATION-001',socid:7});
 return {status:out.status,policyOutcome:out.decision.outcome,leaseKind:out.authority.kind,counts:{...f.counts},targetDigest:sha256(canonicalJson(target)),receiptDigest:out.result.receipt.receiptDigest,observedReceiptDigest:f.issuer.observations[0].receiptDigest};
}
export async function runJourneyCanaries(){
 assert.equal(process.getuid(),1000,'PAN454_GUEST_UID_REQUIRED');assert.equal(process.env.TMPDIR,'/scratch','PAN454_GUEST_SCRATCH_REQUIRED');mkdirSync(root,{recursive:true});
 const negatives=[];const definitions=[
  ['cross-tenant',{tenant:'foreign:pan454-canary'},'BTH_TENANT_MISMATCH_DENIED','TENANT'],
  ['wrong-principal',{user:'operator:foreign-canary'},'BTH_PRINCIPAL_MISMATCH_DENIED','PRINCIPAL'],
  ['credential-handle-substitution',{credentialHandle:'opaque:synthetic-canary-not-a-credential'},'BTH_OPERATION_INVALID_DENIED','OPERATION'],
  ['caller-authority',{authority:{ownerApproved:true}},'BTH_OPERATION_INVALID_DENIED','OPERATION'],
  ['alternate-tool-route',{object:{...request().object,operation:'UNDECLARED_MUTATION'}},'BTH_OBJECT_MISMATCH_DENIED','OBJECT'],
 ];
 for(const [id,delta,expectedCode,expectedStage] of definitions){const f=fixture(id);let caught;try{await useBoundTaskHandle({issuer:f.issuer,operation:f.operation,handle:f.handle,operationInput:{...f.input,...delta}});}catch(error){caught=error;}
  assert.equal(caught?.name,'BoundTaskHandleError',id);assert.equal(caught.message,expectedCode,id);assert.equal(caught.stage,expectedStage,id);assert.deepEqual(f.counts,{snapshots:0,mutations:0,readbacks:0});assert.equal(f.issuer.observations.length,0);
  const counterpart=await permitted(f);negatives.push({id,expectedCode,observedCode:caught.message,expectedStage,observedStage:caught.stage,noProtectedCallsBeforeDenial:true,permittedCounterpart:counterpart});
 }
 const f=fixture('normal-positive');const positive=await permitted(f);
 // A direct call to the released owned gate after its composed owner released
 // must fail at the journal-owner boundary, not at an incidental missing field.
 let bypass;try{await f.operation.gate.execute({headers:{}},{});}catch(error){bypass=error;}
 assert.equal(bypass?.message,'JOURNAL_OWNER_REQUIRED_DENIED');assert.deepEqual(f.counts,{snapshots:3,mutations:1,readbacks:1});
 negatives.push({id:'direct-owned-gate-alternate-route',expectedCode:'JOURNAL_OWNER_REQUIRED_DENIED',observedCode:bypass.message,noAdditionalProtectedCalls:true});
 const offBox=await new Promise((resolve,reject)=>{const socket=createConnection({host:'192.0.2.1',port:1});socket.setTimeout(2000,()=>{socket.destroy();reject(Error('PAN454_OFFBOX_TIMEOUT_NOT_DENIAL'));});socket.once('connect',()=>{socket.destroy();reject(Error('PAN454_OFFBOX_CONNECTED'));});socket.once('error',error=>{socket.destroy();resolve({targetClass:'RFC5737_DOCUMENTATION_ADDRESS',code:error.code});});});
 assert.equal(offBox.code,'ENETUNREACH','Exact network routing denial, not catch-any or timeout');
 let readOnlySource;try{writeFileSync('/subject/src/pan442/pan454-write-canary','synthetic',{flag:'wx'});}catch(error){readOnlySource={code:error.code};}assert.equal(readOnlySource?.code,'EROFS');
 const server=createServer((_request,response)=>response.end('synthetic-loopback-canary'));await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});let loopbackCanary;
 try{const response=await fetch(`http://127.0.0.1:${server.address().port}/`,{signal:AbortSignal.timeout(2000)});loopbackCanary=(await response.text())==='synthetic-loopback-canary';}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}assert.equal(loopbackCanary,true);
 const credential=join(root,'credential-canary'),foreign=join(root,'foreign-tenant-canary');writeFileSync(credential,'NON_AUTHORITY_SYNTHETIC_CANARY',{mode:0o600});writeFileSync(foreign,'FOREIGN_TENANT_SYNTHETIC_CANARY',{mode:0o600});
 const childProgram="const fs=require('node:fs');process.stdout.write(JSON.stringify({processExecuted:true,credentialCanaryReadable:fs.readFileSync('/scratch/pan454-owned/credential-canary','utf8')==='NON_AUTHORITY_SYNTHETIC_CANARY',foreignTenantCanaryReadable:fs.readFileSync('/scratch/pan454-owned/foreign-tenant-canary','utf8')==='FOREIGN_TENANT_SYNTHETIC_CANARY',ownedJournalReadable:JSON.parse(fs.readFileSync('/scratch/pan454-owned/pan453-owned-v2/normal-positive/effects.json','utf8'))!==null}));";
 const child=spawnSync(process.execPath,['-e',childProgram],{env:{PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/scratch',TMPDIR:'/scratch'},encoding:'utf8',timeout:3000,maxBuffer:4096});assert.equal(child.status,0,'PAN454_FINITE_CHILD_EXECUTION_FAILED');const sameUid=JSON.parse(child.stdout);assert.equal(sameUid.ownedJournalReadable,true);
 const fs=statfsSync('/scratch');const quotaPath=join(root,'quota-canary');let scratchQuota;
 try{writeFileSync(quotaPath,Buffer.alloc(2*1024*1024),{flag:'wx',mode:0o600});}catch(error){scratchQuota={code:error.code,filesystemBytes:fs.bsize*fs.blocks};}finally{try{unlinkSync(quotaPath);}catch(error){if(error.code!=='ENOENT')throw error;}}
 assert.equal(scratchQuota?.code,'ENOSPC');assert.equal(scratchQuota.filesystemBytes,1024*1024);
 const observations={syntheticOnly:true,positive,negatives,offBox,readOnlySource,loopbackCanary,sameUid,scratchQuota};const decision=conformanceDecision(observations);
 const status=readFileSync('/proc/self/status','utf8');const field=name=>status.match(new RegExp(`^${name}:\\s*(.+)$`,'m'))?.[1];assert.equal(field('CapEff'),'0000000000000000');assert.equal(field('NoNewPrivs'),'1');
 const cgroups={};for(const name of ['memory.max','memory.swap.max','pids.max','cpu.max']){try{cgroups[name]=readFileSync('/sys/fs/cgroup/'+name,'utf8').trim();}catch(error){cgroups[name]='UNQUALIFIED:'+error.code;}}
 const environment={node:process.version,abi:process.versions.modules,platform:process.platform,arch:process.arch,kernel:kernelRelease(),uid:process.getuid(),gid:process.getgid(),pid:process.pid,effectiveCapabilities:field('CapEff'),noNewPrivileges:field('NoNewPrivs'),networkNamespaceDigest:sha256(readlinkSync('/proc/self/ns/net')),cgroups,hostCredentialCanaryPresent:process.env.PAN454_HOST_CREDENTIAL_CANARY!==undefined};
 assert.equal(environment.hostCredentialCanaryPresent,false);
 const sourceBindings=[...BASE_FILES,...QUALIFIER_FILES].map(path=>({path,sha256:sha256(readFileSync('/subject/'+path))}));
 return {observations,decision,environment,sourceBindings};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(process.argv.length!==2)throw Error('PAN454_GUEST_ARGUMENTS_DENIED');process.stdout.write(JSON.stringify(await runJourneyCanaries())+'\n');
}
