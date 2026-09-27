// PAN453 bounded synthetic composed-path acceptance probe; no provider network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, unlinkSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import {
  BoundTaskHandleIssuer, createSyntheticTrustedTaskSource,
  createLocalBusinessOperation, createOwnedSyntheticBusinessOperation, useBoundTaskHandle,
} from '../../src/pan442/bound-task-handle.mjs';
import { createAuthoritativeApprovalSnapshot } from '../../demo/runtime/authoritative-approval-snapshot.mjs';
import { DemoMutationGate } from '../../demo/runtime/enforcement-gate.mjs';
import { ApprovalWorkbench } from '../../demo/runtime/approval-workbench.mjs';
const TASK={taskRef:'pan442-order-task-0001',runId:'run:pan442:order:0001',tenant:'panskys-zoo-demo',user:'ops:local-demo',object:{provider:'dolibarr',entity:'Order',operation:'CREATE_IF_ABSENT',refClient:'CM-ADMIN-AI-ESCALATION-001',customerId:7,orderDateEpoch:1767225600},objectVersion:1,purpose:'CREATE_SYNTHETIC_SALES_ORDER',amountLimitMinor:0,currency:'EUR',ttlMs:120000};
function context({reconcile=true}={}) {
 const dir=join(mkdtempSync(join(tmpdir(),'pan453-local-')),'pan453-owned-v2');
 mkdirSync(dir);
 const target=[];let mutations=0,reads=0,reconcileReads=0,lose=true;
 let time=1000000;
 const provider={
   async readAuthoritativeSnapshot(action){reads++;return createAuthoritativeApprovalSnapshot(action,target);},
   async mutate(action){mutations++;target.push({id:42,date:action.payload.body.date,ref_client:action.payload.body.ref_client,socid:action.payload.body.socid});if(lose){lose=false;throw Error('SYNTHETIC_RESPONSE_LOSS_AFTER_COMMIT');}return {id:42};},
   async readback(action,result){return target.find(x=>x.id===result.id)??null;},
   ...(reconcile?{async reconcile(action){reconcileReads++;return target.find(x=>x.ref_client===action.payload.body.ref_client)??null;}}:{}),
 };
 const source=createSyntheticTrustedTaskSource({principal:{user:TASK.user,tenant:TASK.tenant},tasks:[TASK]});
 const issuer=new BoundTaskHandleIssuer({taskSource:source,secret:'synthetic-composed-recovery-123456',now:()=>time});
 const {handle}=issuer.createHandle({taskRef:TASK.taskRef});
 const input={tenant:TASK.tenant,user:TASK.user,runId:TASK.runId,objectVersion:1,declaredAmountMinor:0,currency:'EUR',object:TASK.object};
 const run=()=>useBoundTaskHandle({issuer,handle,operationInput:input,operation:createOwnedSyntheticBusinessOperation({provider,now:()=>time,root:dir})});
 return {run,dir,provider,target,issuer,handle,input,mutations:()=>mutations,reads:()=>reads,reconcileReads:()=>reconcileReads,advance:(ms)=>{time+=ms;},close:()=>rmSync(dir,{recursive:true,force:true})};
}
test('composed post-commit response loss: recovered by independently read target with one mutation',async()=>{
 const x=context();try{
  await assert.rejects(x.run(),/BTH_COMPOSE_FAILED/);
  assert.equal(x.target.length,1);assert.equal(x.mutations(),1);
  const result=await x.run();
  assert.equal(result.status,'PASS');assert.equal(result.result.replayState,'RECONCILE_NO_DUPLICATE');
  assert.equal(x.reconcileReads(),1);assert.equal(x.mutations(),1);assert.equal(x.target.length,1);
 }finally{x.close();}
});
test('without an independent reconcile source, ambiguity is unresolved and effect cannot replay',async()=>{
 const x=context({reconcile:false});try{
  await assert.rejects(x.run(),/BTH_COMPOSE_FAILED/);
  await assert.rejects(x.run(),/BTH_COMPOSE_FAILED/);
  assert.equal(x.mutations(),1);assert.equal(x.target.length,1);assert.equal(x.reconcileReads(),0);
 }finally{x.close();}
});
test('missing persisted approval cannot become a recovery authority',async()=>{
 const x=context();try{
  await assert.rejects(x.run(),/BTH_COMPOSE_FAILED/);
  const file=join(x.dir,'approvals.json');const data=JSON.parse(readFileSync(file,'utf8'));data.decisions={};writeFileSync(file,JSON.stringify(data));
  await assert.rejects(x.run(),/BTH_RECOVERY_AUTHORITY_DENIED/);
  assert.equal(x.mutations(),1);assert.equal(x.reconcileReads(),0);
 }finally{x.close();}
});
test('a substituted prior lease or malformed persistent store refuses before target reconciliation',async()=>{
 const x=context();try{
  await assert.rejects(x.run(),/BTH_COMPOSE_FAILED/);
  const file=join(x.dir,'approvals.json');const data=JSON.parse(readFileSync(file,'utf8'));
  const key=Object.keys(data.decisions)[0];data.decisions[key].authority.leaseId='0'.repeat(64);writeFileSync(file,JSON.stringify(data));
  await assert.rejects(x.run());assert.equal(x.mutations(),1);assert.equal(x.reconcileReads(),0);
 }finally{x.close();}
});
test('stale or contradictory target read does not confirm or issue a new effect',async()=>{
 const x=context();try{
  await assert.rejects(x.run(),/BTH_COMPOSE_FAILED/);
  x.provider.reconcile=async()=>({id:42,ref_client:'not-the-confirmed-order',date:1767225600,socid:7});
  await assert.rejects(x.run(),/BTH_COMPOSE_FAILED/);
  assert.equal(x.mutations(),1);assert.equal(x.target.length,1);
 }finally{x.close();}
});
test('expired original handle denies recovery and retains the target unchanged',async()=>{
 const x=context();try{
  await assert.rejects(x.run(),/BTH_COMPOSE_FAILED/);
  x.advance(120001);
  await assert.rejects(x.run(),/BTH_HANDLE_EXPIRED_DENIED/);
  assert.equal(x.mutations(),1);assert.equal(x.reconcileReads(),0);
 }finally{x.close();}
});

test('failed persisted journal read denies recovery without reinvoking the effect',async()=>{
 const x=context();try{
  await assert.rejects(x.run(),/BTH_COMPOSE_FAILED/);
  const file=join(x.dir,'effects.json');writeFileSync(file,JSON.stringify({schemaVersion:'invalid',effects:{}}));
  await assert.rejects(x.run(),/BTH_COMPOSE_FAILED/);
  assert.equal(x.mutations(),1);assert.equal(x.reconcileReads(),0);
 }finally{x.close();}
});
test('unreadable authoritative snapshot refuses recovery before target reconciliation',async()=>{
 const x=context();try{
  await assert.rejects(x.run(),/BTH_COMPOSE_FAILED/);
  x.provider.readAuthoritativeSnapshot=async()=>{throw Error('SYNTHETIC_READ_UNAVAILABLE');};
  await assert.rejects(x.run(),/BTH_COMPOSE_FAILED/);
  assert.equal(x.mutations(),1);assert.equal(x.reconcileReads(),0);
 }finally{x.close();}
});

test('process exit after persisted target: restart fails closed behind retained owner fence',()=>{
 const dir=join(mkdtempSync(join(tmpdir(),'pan453-kill-')),'pan453-owned-v2');try{
  const script=new URL('./crash-fixture.mjs',import.meta.url).pathname;
  const first=spawnSync(process.execPath,[script,dir,'crash'],{encoding:'utf8'});
  assert.equal(first.status,66,first.stdout+first.stderr);
  assert.equal(JSON.parse(readFileSync(join(dir,'synthetic-mutations.json'),'utf8')),1);
  const prior=JSON.parse(readFileSync(join(dir,'effects.json'),'utf8'));
  assert.deepEqual(Object.values(prior.reservations).map(x=>x.status),['EXECUTING']);
  const retry=spawnSync(process.execPath,[script,dir,'retry'],{encoding:'utf8'});
  assert.equal(retry.status,67,retry.stdout+retry.stderr);
  assert.equal(JSON.parse(retry.stdout).error,'BTH_JOURNAL_FENCED_DENIED');
  assert.equal(JSON.parse(readFileSync(join(dir,'synthetic-mutations.json'),'utf8')),1);
  assert.deepEqual(Object.values(JSON.parse(readFileSync(join(dir,'effects.json'),'utf8')).reservations).map(x=>x.status),['EXECUTING']);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('process exit with unavailable persisted target: retained owner fence denies retry without mutation',()=>{
 const dir=join(mkdtempSync(join(tmpdir(),'pan453-kill-')),'pan453-owned-v2');try{
  const script=new URL('./crash-fixture.mjs',import.meta.url).pathname;
  const first=spawnSync(process.execPath,[script,dir,'crash'],{encoding:'utf8'});
  assert.equal(first.status,66,first.stdout+first.stderr);
  unlinkSync(join(dir,'synthetic-target.json'));
  const retry=spawnSync(process.execPath,[script,dir,'retry'],{encoding:'utf8'});
  assert.equal(retry.status,67,retry.stdout+retry.stderr);
  assert.equal(JSON.parse(retry.stdout).error,'BTH_JOURNAL_FENCED_DENIED');
  assert.equal(JSON.parse(readFileSync(join(dir,'synthetic-mutations.json'),'utf8')),1);
  assert.deepEqual(Object.values(JSON.parse(readFileSync(join(dir,'effects.json'),'utf8')).reservations).map(x=>x.status),['EXECUTING']);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('store-write failure before provider call refuses to start a mutation',async()=>{
 const x=context();try{
  mkdirSync(join(x.dir,'effects.json.tmp'));
  await assert.rejects(x.run(),/BTH_COMPOSE_FAILED/);
  assert.equal(x.mutations(),0);assert.equal(x.target.length,0);assert.equal(x.reconcileReads(),0);
 }finally{x.close();}
});
test('store-write failure during read-only confirmation retains durable ambiguity',async()=>{
 const x=context();try{
  await assert.rejects(x.run(),/BTH_COMPOSE_FAILED/);
  const before=readFileSync(join(x.dir,'effects.json'),'utf8');
  assert.deepEqual(Object.values(JSON.parse(before).reservations).map(x=>x.status),['AMBIGUOUS']);
  mkdirSync(join(x.dir,'effects.json.tmp'));
  await assert.rejects(x.run(),/BTH_COMPOSE_FAILED/);
  assert.equal(readFileSync(join(x.dir,'effects.json'),'utf8'),before);
  assert.equal(x.mutations(),1);assert.equal(x.reconcileReads(),1);
  rmSync(join(x.dir,'effects.json.tmp'),{recursive:true});
  const result=await x.run();assert.equal(result.result.replayState,'RECONCILE_NO_DUPLICATE');
  assert.equal(x.mutations(),1);assert.equal(x.reconcileReads(),2);
 }finally{x.close();}
});

test('concurrent second process cannot reclassify a live EXECUTING owner',async()=>{
 const dir=join(mkdtempSync(join(tmpdir(),'pan453-race-')),'pan453-owned-v2');
 const script=new URL('./crash-fixture.mjs',import.meta.url).pathname;
 const worker=spawn(process.execPath,[script,dir,'park'],{stdio:['ignore','pipe','pipe']});
 let output='',error='';worker.stdout.on('data',x=>{output+=x;});worker.stderr.on('data',x=>{error+=x;});
 try{
  const start=Date.now();
  while(!existsSync(join(dir,'parked.marker'))){
   if(worker.exitCode!==null)throw Error('FIRST_WORKER_EXITED: '+error);
   if(Date.now()-start>4000)throw Error('PARK_TIMEOUT');
   await new Promise(resolve=>setTimeout(resolve,20));
  }
  const firstJournal=JSON.parse(readFileSync(join(dir,'effects.json'),'utf8'));
  assert.deepEqual(Object.values(firstJournal.reservations).map(x=>x.status),['EXECUTING']);
  const second=spawnSync(process.execPath,[script,dir,'retry'],{encoding:'utf8',timeout:4000});
  assert.equal(second.status,67,second.stdout+second.stderr);
  assert.equal(JSON.parse(second.stdout).error,'BTH_JOURNAL_FENCED_DENIED');
  assert.equal(JSON.parse(readFileSync(join(dir,'synthetic-mutations.json'),'utf8')),1);
  assert.deepEqual(Object.values(JSON.parse(readFileSync(join(dir,'effects.json'),'utf8')).reservations).map(x=>x.status),['EXECUTING']);
  writeFileSync(join(dir,'resume.marker'),'go');
  const exit=await new Promise(resolve=>worker.once('exit',resolve));
  assert.equal(exit,0,output+error);
  assert.equal(JSON.parse(readFileSync(join(dir,'synthetic-mutations.json'),'utf8')),1);
  assert.deepEqual(Object.values(JSON.parse(readFileSync(join(dir,'effects.json'),'utf8')).reservations).map(x=>x.status),['APPLIED']);
 }finally{
  if(worker.exitCode===null){writeFileSync(join(dir,'resume.marker'),'go');worker.kill();}
  rmSync(dir,{recursive:true,force:true});
 }
});

test('denied principal and object cannot borrow an ambiguous reservation for reconciliation',async()=>{
 const x=context();try{
  await assert.rejects(x.run(),/BTH_COMPOSE_FAILED/);
  const makeOperation=()=>createOwnedSyntheticBusinessOperation({provider:x.provider,now:()=>1000000,root:x.dir});
  await assert.rejects(useBoundTaskHandle({issuer:x.issuer,handle:x.handle,operationInput:{...x.input,user:'intruder:other'},operation:makeOperation()}),/BTH_PRINCIPAL_MISMATCH_DENIED/);
  await assert.rejects(useBoundTaskHandle({issuer:x.issuer,handle:x.handle,operationInput:{...x.input,object:{...x.input.object,customerId:8}},operation:makeOperation()}),/BTH_OBJECT_MISMATCH_DENIED/);
  assert.equal(x.mutations(),1);assert.equal(x.reconcileReads(),0);
 }finally{x.close();}
});

test('bounded local backup/restore of both journals reconciles against retained synthetic target',async()=>{
 const x=context();const restored=join(mkdtempSync(join(tmpdir(),'pan453-restore-')),'pan453-owned-v2');try{
  await assert.rejects(x.run(),/BTH_COMPOSE_FAILED/);
  mkdirSync(restored,{recursive:true});
  for(const file of ['journal-owner.mode','approvals.json','effects.json'])copyFileSync(join(x.dir,file),join(restored,file));
  const result=await useBoundTaskHandle({issuer:x.issuer,handle:x.handle,operationInput:x.input,operation:createOwnedSyntheticBusinessOperation({provider:x.provider,now:()=>1000000,root:restored})});
  assert.equal(result.result.replayState,'RECONCILE_NO_DUPLICATE');assert.equal(x.mutations(),1);assert.equal(x.target.length,1);assert.equal(x.reconcileReads(),1);
 }finally{x.close();rmSync(restored,{recursive:true,force:true});}
});
test('partial local restore without decision journal cannot create recovery authority',async()=>{
 const x=context();const restored=join(mkdtempSync(join(tmpdir(),'pan453-restore-')),'pan453-owned-v2');try{
  await assert.rejects(x.run(),/BTH_COMPOSE_FAILED/);
  mkdirSync(restored,{recursive:true});
  copyFileSync(join(x.dir,'journal-owner.mode'),join(restored,'journal-owner.mode'));
  copyFileSync(join(x.dir,'effects.json'),join(restored,'effects.json'));
  await assert.rejects(useBoundTaskHandle({issuer:x.issuer,handle:x.handle,operationInput:x.input,operation:createOwnedSyntheticBusinessOperation({provider:x.provider,now:()=>1000000,root:restored})}),/BTH_RECOVERY_AUTHORITY_DENIED/);
  assert.equal(x.mutations(),1);assert.equal(x.reconcileReads(),0);
 }finally{x.close();rmSync(restored,{recursive:true,force:true});}
});

test('process exits at provider dispatch boundary: retained fence denies retry with zero effect',()=>{
 const dir=join(mkdtempSync(join(tmpdir(),'pan453-pre-dispatch-')),'pan453-owned-v2');try{
  const script=new URL('./crash-fixture.mjs',import.meta.url).pathname;
  const first=spawnSync(process.execPath,[script,dir,'before-dispatch'],{encoding:'utf8'});
  assert.equal(first.status,65,first.stdout+first.stderr);
  assert.equal(existsSync(join(dir,'synthetic-mutations.json')),false);
  assert.deepEqual(Object.values(JSON.parse(readFileSync(join(dir,'effects.json'),'utf8')).reservations).map(x=>x.status),['EXECUTING']);
  const retry=spawnSync(process.execPath,[script,dir,'retry'],{encoding:'utf8'});
  assert.equal(retry.status,67,retry.stdout+retry.stderr);
  assert.equal(JSON.parse(retry.stdout).error,'BTH_JOURNAL_FENCED_DENIED');
  assert.equal(existsSync(join(dir,'synthetic-mutations.json')),false);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('direct gate constructor denied by persistent shared journal owner mode',async()=>{
 const dir=join(mkdtempSync(join(tmpdir(),'pan453-direct-bypass-')),'pan453-owned-v2');
 const script=new URL('./crash-fixture.mjs',import.meta.url).pathname;
 const worker=spawn(process.execPath,[script,dir,'park'],{stdio:['ignore','pipe','pipe']});
 let output='',error='';worker.stdout.on('data',x=>{output+=x;});worker.stderr.on('data',x=>{error+=x;});
 try{
  const start=Date.now();while(!existsSync(join(dir,'parked.marker'))){
   if(worker.exitCode!==null)throw Error('FIRST_WORKER_EXITED: '+error);
   if(Date.now()-start>4000)throw Error('PARK_TIMEOUT');
   await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(existsSync(join(dir,'operation.lock')),true);
  const bypass=spawnSync(process.execPath,[script,dir,'direct-gate'],{encoding:'utf8',timeout:4000});
  assert.equal(bypass.status,67,bypass.stdout+bypass.stderr);
  assert.equal(JSON.parse(bypass.stdout).error,'JOURNAL_OWNER_REQUIRED_DENIED');
  assert.deepEqual(Object.values(JSON.parse(readFileSync(join(dir,'effects.json'),'utf8')).reservations).map(x=>x.status),['EXECUTING']);
  assert.equal(JSON.parse(readFileSync(join(dir,'synthetic-mutations.json'),'utf8')),1);
  writeFileSync(join(dir,'resume.marker'),'go');
  const exit=await new Promise(resolve=>worker.once('exit',resolve));assert.equal(exit,0,output+error);
  assert.deepEqual(Object.values(JSON.parse(readFileSync(join(dir,'effects.json'),'utf8')).reservations).map(x=>x.status),['APPLIED']);
 }finally{
  if(worker.exitCode===null){writeFileSync(join(dir,'resume.marker'),'go');worker.kill();}
  rmSync(dir,{recursive:true,force:true});
 }
});

test('direct gate and workbench refuse the reserved namespace before mode exists',async()=>{
 const x=context();try{
  const gate=()=>new DemoMutationGate({apiToken:'a'.repeat(48),controlToken:'b'.repeat(48),expectedOrigin:'http://127.0.0.1:7781',receiptPath:join(x.dir,'effects.json'),provider:x.provider});
  const workbench=()=>new ApprovalWorkbench({receiptPath:join(x.dir,'approvals.json'),issueAuthority:()=>({}),readAuthoritativeSnapshot:async()=>({}),policyDigest:'0'.repeat(64),profileGeneration:'pan442-handled-task-0001'});
  assert.throws(gate,/JOURNAL_OWNER_REQUIRED_DENIED/);
  assert.throws(workbench,/JOURNAL_OWNER_REQUIRED_DENIED/);
  assert.equal(existsSync(join(x.dir,'journal-owner.mode')),false);
  assert.equal(existsSync(join(x.dir,'effects.json')),false);
  await assert.rejects(x.run(),/BTH_COMPOSE_FAILED/);
  assert.throws(gate,/JOURNAL_OWNER_REQUIRED_DENIED/);
  assert.throws(workbench,/JOURNAL_OWNER_REQUIRED_DENIED/);
  assert.equal(x.mutations(),1);
 }finally{x.close();}
});
test('forged ownership token cannot open either persistent journal',async()=>{
 const x=context();try{
  await assert.rejects(x.run(),/BTH_COMPOSE_FAILED/);
  assert.throws(()=>new DemoMutationGate({apiToken:'a'.repeat(48),controlToken:'b'.repeat(48),expectedOrigin:'http://127.0.0.1:7781',receiptPath:join(x.dir,'effects.json'),provider:x.provider,journalOwner:{}}),/JOURNAL_OWNER_REQUIRED_DENIED/);
  assert.throws(()=>new ApprovalWorkbench({receiptPath:join(x.dir,'approvals.json'),journalOwner:{},issueAuthority:()=>({}),readAuthoritativeSnapshot:async()=>({}),policyDigest:'0'.repeat(64),profileGeneration:'pan442-handled-task-0001'}),/JOURNAL_OWNER_REQUIRED_DENIED/);
  assert.equal(x.mutations(),1);
 }finally{x.close();}
});

test('unowned legacy journals cannot be silently adopted into owner mode',async()=>{
 const x=context();const restored=join(mkdtempSync(join(tmpdir(),'pan453-unowned-')),'pan453-owned-v2');try{
  await assert.rejects(x.run(),/BTH_COMPOSE_FAILED/);
  mkdirSync(restored,{recursive:true});
  for(const file of ['approvals.json','effects.json'])copyFileSync(join(x.dir,file),join(restored,file));
  await assert.rejects(useBoundTaskHandle({issuer:x.issuer,handle:x.handle,operationInput:x.input,operation:createOwnedSyntheticBusinessOperation({provider:x.provider,now:()=>1000000,root:restored})}),/BTH_COMPOSE_FAILED/);
  assert.equal(existsSync(join(restored,'operation.lock')),false);
  assert.equal(existsSync(join(restored,'journal-owner.mode')),false);
  assert.equal(x.mutations(),1);assert.equal(x.reconcileReads(),0);
 }finally{x.close();rmSync(restored,{recursive:true,force:true});}
});
test('tampered journal owner mode refuses before reconciliation',async()=>{
 const x=context();try{
  await assert.rejects(x.run(),/BTH_COMPOSE_FAILED/);
  writeFileSync(join(x.dir,'journal-owner.mode'),'unrecognized-mode');
  await assert.rejects(x.run(),/BTH_COMPOSE_FAILED/);
  assert.equal(x.mutations(),1);assert.equal(x.reconcileReads(),0);
 }finally{x.close();}
});

test('old failing interleaving: legacy writer cannot pre-open the reserved v2 root',()=>{
 const dir=join(mkdtempSync(join(tmpdir(),'pan453-adoption-')),'pan453-owned-v2');try{
  const script=new URL('./adoption-race-fixture.mjs',import.meta.url).pathname;
  const result=spawnSync(process.execPath,[script,dir,'race'],{encoding:'utf8',timeout:4000});
  assert.equal(result.status,0,result.stdout+result.stderr);
  assert.deepEqual(JSON.parse(result.stdout),{preOpenDenied:true,modeInstalled:true,unownedJournalWritten:false,effects:0});
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('v2 refuses adoption of a legacy direct journal; legacy semantics remain on legacy root',()=>{
 const dir=mkdtempSync(join(tmpdir(),'pan453-legacy-'));try{
  const gate=new DemoMutationGate({apiToken:'a'.repeat(48),controlToken:'b'.repeat(48),expectedOrigin:'http://127.0.0.1:7781',receiptPath:join(dir,'effects.json'),provider:{}});
  gate.persist();
  const script=new URL('./adoption-race-fixture.mjs',import.meta.url).pathname;
  const install=spawnSync(process.execPath,[script,dir,'install'],{encoding:'utf8',timeout:4000});
  assert.notEqual(install.status,0);
  assert.match(install.stderr,/JOURNAL_OWNED_NAMESPACE_REQUIRED_DENIED/);
  assert.equal(existsSync(join(dir,'journal-owner.mode')),false);
  assert.equal(existsSync(join(dir,'effects.json')),true);
  gate.persist();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('legacy adapter explicitly refuses the reserved v2 journal even before mode',()=>{
 const x=context();try{
  const old=createLocalBusinessOperation({provider:x.provider,now:()=>1000000,root:x.dir});
  assert.fail('legacy constructor must deny');
 }catch(error){assert.match(error.message,/JOURNAL_OWNER_REQUIRED_DENIED/);}
 finally{x.close();}
});

test('same pre-write interleaving on a legacy root refuses mode adoption, not the legacy write',()=>{
 const dir=mkdtempSync(join(tmpdir(),'pan453-legacy-race-'));try{
  const script=new URL('./adoption-race-fixture.mjs',import.meta.url).pathname;
  const result=spawnSync(process.execPath,[script,dir,'legacy-interleave'],{encoding:'utf8',timeout:4000});
  assert.equal(result.status,0,result.stdout+result.stderr);
  assert.deepEqual(JSON.parse(result.stdout),{injected:true,adoptionDenied:true,modeInstalled:false,legacyJournalWritten:true});
 }finally{rmSync(dir,{recursive:true,force:true});}
});
