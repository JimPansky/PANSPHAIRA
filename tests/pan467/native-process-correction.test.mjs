// Actual CLI/new processes/SIGKILL, not mocked crash or fabricated callback.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync,fork} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {fixture,LINE,query} from '../fixtures/pan467/native-business-fixture.mjs';
const CLI=fileURLToPath(new URL('../../scripts/run-pan467-business-correction.mjs',import.meta.url));
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
function cli(command,root,...args){const r=spawnSync(process.execPath,[CLI,command,'--root',root,...args],{encoding:'utf8',timeout:30000});assert.equal(r.error,undefined);return {exit:r.status,result:JSON.parse(r.stdout.trim())};}
function body(root){const r=cli('describe',root,'--id',LINE,'--original-revision','2');assert.equal(r.exit,0);return {requestId:'synthetic:cli-request-1',sourceGeneration:r.result.sourceGeneration,epoch:r.result.epoch,id:LINE,originalRevision:2,originalEffectKey:r.result.originalEffectKey,expectedOriginalValue:1750,correctedValue:1250,externalCoverage:'LOCAL_DRAFT_ONLY',reason:'Correct earlier wrong synthetic price'};}
function input(x,value){const p=join(x.parent,'business-request.json');writeFileSync(p,JSON.stringify(value)+'\n',{mode:0o600});return p;}
const applyArgs=p=>['--input',p,'--owner','LOCAL_SYNTHETIC_OWNER','--actor','synthetic:correction-owner'];

test('LIFE-07 actual CLI positive/read-only diagnosis and fresh-request conflicting original effect denial',async()=>{
 const x=await fixture();try{
  const request=body(x.root),p=input(x,request),r=cli('apply',x.root,...applyArgs(p));assert.equal(r.exit,0,JSON.stringify(r));assert.equal(r.result.outcome,'ATTRIBUTED_FORWARD_CORRECTED');assert.equal(r.result.receipt.actor,'synthetic:correction-owner');
  const before=hash(join(x.root,'target.sqlite')),d=cli('diagnose',x.root);assert.equal(d.exit,0);assert.equal(d.result.outcome,'VERIFIED');assert.equal(d.result.readOnly,true);assert.equal(hash(join(x.root,'target.sqlite')),before);
  input(x,{...request,requestId:'synthetic:cli-request-2',correctedValue:1500});const conflict=cli('apply',x.root,...applyArgs(p));assert.equal(conflict.exit,2);assert.equal(conflict.result.code,'PAN467_ORIGINAL_EFFECT_CONTENT_CONFLICT_DENIED');assert.equal(hash(join(x.root,'target.sqlite')),before);
  input(x,{...request,requestId:'synthetic:cli-request-3'});const alias=cli('apply',x.root,...applyArgs(p));assert.equal(alias.exit,0);assert.equal(alias.result.outcome,'RECONCILED_NO_DUPLICATE');assert.equal(alias.result.receipt.firstRequestId,request.requestId);assert.equal(hash(join(x.root,'target.sqlite')),before);
 }finally{x.close();}
});

test('LIFE-07 actual CLI rejects uncovered external outcome/generation/actor/malformed inputs before mutation',async()=>{
 const x=await fixture();try{
  const request=body(x.root),before=hash(join(x.root,'target.sqlite'));
  for(const [patch,code] of [[{externalCoverage:'EXTERNAL_PAYMENT_UNKNOWN'},'PAN467_UNCOVERED_EXTERNAL_OUTCOME_DENIED'],[{sourceGeneration:'00000000-0000-4000-8000-000000000000'},'PAN467_CONFLICTING_GENERATION_DENIED'],[{epoch:2},'PAN467_CONFLICTING_TARGET_EPOCH_DENIED'],[{callerConfirmedExternalSafe:true},'PAN467_CORRECTION_REQUEST_SHAPE_DENIED']]){
   const p=input(x,{...request,...patch}),r=cli('apply',x.root,...applyArgs(p));assert.equal(r.exit,2);assert.equal(r.result.code,code);
  }
  const p=input(x,request),actor=cli('apply',x.root,'--input',p,'--owner','LOCAL_SYNTHETIC_OWNER','--actor','synthetic:untrusted-actor');assert.equal(actor.exit,2);assert.equal(actor.result.code,'PAN467_CODE_OWNED_SYNTHETIC_ACTOR_REQUIRED_DENIED');assert.equal(hash(join(x.root,'target.sqlite')),before);
 }finally{x.close();}
});

for(const phase of ['AFTER_INTENT','AFTER_NATIVE_CORRECTION'])test('LIFE-07 real CLI SIGKILL '+phase+' resumes attributed correction in fresh process without duplicate effect',{timeout:60000},async()=>{
 const x=await fixture();let child;
 try{
  const request=body(x.root),p=input(x,request),originalSource=hash(join(x.root,'source.sqlite')),originalReceipts=query(x.root,'target','SELECT * FROM receipts ORDER BY operation_key');
  child=fork(CLI,['apply','--root',x.root,...applyArgs(p),'--pause-after',phase],{stdio:['ignore','pipe','pipe','ipc']});
  let stdout='',stderr='';child.stdout.on('data',b=>{stdout+=b;});child.stderr.on('data',b=>{stderr+=b;});
  const marker=await Promise.race([once(child,'message').then(([m])=>m),once(child,'exit').then(([c,s])=>{throw Error('CLI exited before boundary '+JSON.stringify({c,s,stdout,stderr}));})]);
  assert.equal(marker.phase,phase);assert.equal(marker.pid,child.pid);assert.equal(marker.schemaVersion,'pansphaira.pan467/native-correction-boundary/v1');
  const done=once(child,'exit');child.kill('SIGKILL');const [exit,signal]=await done;assert.equal(exit,null);assert.equal(signal,'SIGKILL');
  const before=hash(join(x.root,'target.sqlite')),d=cli('diagnose',x.root);assert.equal(d.exit,0);assert.equal(d.result.outcome,'PENDING_NATIVE_READBACK_REQUIRED');assert.equal(d.result.correctionOwnerState,'DEAD');assert.equal(d.result.nativeEffectsAwaitingAttributionCommit,phase==='AFTER_NATIVE_CORRECTION'?1:0);assert.equal(hash(join(x.root,'target.sqlite')),before);
  input(x,{...request,requestId:'synthetic:cli-recovery-2'});const recovered=cli('apply',x.root,...applyArgs(p));assert.equal(recovered.exit,0,JSON.stringify(recovered));assert.equal(recovered.result.receipt.firstRequestId,request.requestId);assert.equal(recovered.result.receipt.correctionRevision,4);
  const current=query(x.root,'target','SELECT revision,body FROM objects WHERE id=?',LINE)[0];assert.equal(current.revision,4);assert.equal(JSON.parse(current.body).priceMinor,1250);assert.equal(JSON.parse(current.body).quantityMicros,3000000);
  assert.equal(query(x.root,'target','SELECT event FROM pan473_target_events').length,2);assert.equal(hash(join(x.root,'source.sqlite')),originalSource);assert.deepEqual(query(x.root,'target','SELECT * FROM receipts ORDER BY operation_key'),originalReceipts);
  const replay=cli('apply',x.root,...applyArgs(p));assert.equal(replay.exit,0);assert.equal(replay.result.outcome,'RECONCILED_NO_DUPLICATE');assert.equal(query(x.root,'target','SELECT event FROM pan473_target_events').length,2);
  console.log(JSON.stringify({phase,pid:marker.pid,actualSignal:signal,recoveryExit:recovered.exit,revision:current.revision,nativeTargetEventCount:2,originalSourceAndReceiptsPreserved:true}));
 }finally{if(child?.exitCode===null&&child?.signalCode===null)child.kill('SIGKILL');x.close();}
});
