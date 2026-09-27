// Bounded two-process synthetic crash fixture: supplied scratch root only.
import { readFileSync, writeFileSync, existsSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import {BoundTaskHandleIssuer,createSyntheticTrustedTaskSource,createOwnedSyntheticBusinessOperation,useBoundTaskHandle} from '../../src/pan442/bound-task-handle.mjs';
import {createAuthoritativeApprovalSnapshot} from '../../demo/runtime/authoritative-approval-snapshot.mjs';
import {DemoMutationGate} from '../../demo/runtime/enforcement-gate.mjs';
const TASK={taskRef:'pan442-order-task-0001',runId:'run:pan442:order:0001',tenant:'panskys-zoo-demo',user:'ops:local-demo',object:{provider:'dolibarr',entity:'Order',operation:'CREATE_IF_ABSENT',refClient:'CM-ADMIN-AI-ESCALATION-001',customerId:7,orderDateEpoch:1767225600},objectVersion:1,purpose:'CREATE_SYNTHETIC_SALES_ORDER',amountLimitMinor:0,currency:'EUR',ttlMs:120000};
const root=process.argv[2], mode=process.argv[3];
if(!root||!['crash','retry','park','before-dispatch','direct-gate'].includes(mode))throw Error('BOUND_ARGS_REQUIRED');
const targetPath=join(root,'synthetic-target.json');const countPath=join(root,'synthetic-mutations.json');
if(mode==='direct-gate'){try{const gate=new DemoMutationGate({apiToken:'a'.repeat(48),controlToken:'b'.repeat(48),expectedOrigin:'http://127.0.0.1:7781',receiptPath:join(root,'effects.json'),provider:{}});console.log(JSON.stringify({mode,reservations:Object.values(gate.state.reservations).map(x=>x.status)}));process.exit(0);}catch(e){console.log(JSON.stringify({mode,error:e.message}));process.exit(67);}}
const target=()=>existsSync(targetPath)?JSON.parse(readFileSync(targetPath,'utf8')):[];
const provider={
 async readAuthoritativeSnapshot(action){return createAuthoritativeApprovalSnapshot(action,target());},
 async mutate(action){if(mode==='before-dispatch')process.exit(65);const count=existsSync(countPath)?JSON.parse(readFileSync(countPath,'utf8')):0;writeFileSync(countPath,JSON.stringify(count+1));
  const fd=openSync(countPath,'r');fsyncSync(fd);closeSync(fd);
  if(mode==='park'){
   writeFileSync(join(root,'parked.marker'),'ready');
   const started=Date.now();
   while(!existsSync(join(root,'resume.marker'))){
    if(Date.now()-started>5000)throw Error('SYNTHETIC_PARK_TIMEOUT');
    await new Promise(resolve=>setTimeout(resolve,20));
   }
  }
  const row={id:42,date:action.payload.body.date,ref_client:action.payload.body.ref_client,socid:action.payload.body.socid};
  writeFileSync(targetPath,JSON.stringify([row]));const targetFd=openSync(targetPath,'r');fsyncSync(targetFd);closeSync(targetFd);
  if(mode==='crash')process.exit(66);return {id:42};},
 async readback(action,result){return target().find(x=>x.id===result.id)??null;},
 async reconcile(action){return target().find(x=>x.ref_client===action.payload.body.ref_client)??null;}
};
const source=createSyntheticTrustedTaskSource({principal:{user:TASK.user,tenant:TASK.tenant},tasks:[TASK]});
const issuer=new BoundTaskHandleIssuer({taskSource:source,secret:'synthetic-composed-recovery-123456',now:()=>1000000});
const {handle}=issuer.createHandle({taskRef:TASK.taskRef});
const input={tenant:TASK.tenant,user:TASK.user,runId:TASK.runId,objectVersion:1,declaredAmountMinor:0,currency:'EUR',object:TASK.object};
try{const result=await useBoundTaskHandle({issuer,handle,operationInput:input,operation:createOwnedSyntheticBusinessOperation({provider,now:()=>1000000,root})});console.log(JSON.stringify({mode,status:result.status,replayState:result.result?.replayState}));}
catch(e){console.log(JSON.stringify({mode,error:e.message}));process.exitCode=67;}
