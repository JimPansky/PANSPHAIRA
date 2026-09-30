// LIFE-03: real PostgreSQL DDL/transactions + actual process SIGKILL/restart.
// Generic synthetic invoices only; no mocked target/journal or production work.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { createNativeUpdateExecutorV1, nativeUpdatePlanDigestV1 } from '../../src/pan463/native-update-executor.mjs';
import { startRealPostgres, PG_PORT, PG_DATABASE, PG_ADMIN_USER, PG_ADMIN_PASSWORD } from '../../dist/packages/knowledge-solution/src/pg-harness.js';
import { updateDoctorContractDigest } from '../../dist/packages/contracts/src/update-doctor.js';
import { recordLocalJournalControl } from '../../demo/runtime/local-journal-owner.mjs';

let ownedRoot, pg, originalRows;
const database = {host:'127.0.0.1',port:PG_PORT,database:PG_DATABASE,user:PG_ADMIN_USER,password:PG_ADMIN_PASSWORD};
function plan() {
  const checkPlan = { schemaVersion:'chimpmaera.update/operation-plan/v1',operationId:'native:update-0001',mode:'CHECK_ONLY',
    fromLockDigest:'a'.repeat(64),targetLockDigest:'b'.repeat(64),requiredAuthorityProfileDigest:'c'.repeat(64),
    authorityDelta:{added:[],removed:[]},issuedAtMs:1 };
  checkPlan.planDigest = updateDoctorContractDigest(checkPlan, 'planDigest');
  const value = {schemaVersion:'pansphaira.pan463/native-update-plan/v1',mode:'LOCAL_SYNTHETIC_NATIVE_UPDATE',installationId:'synthetic-installation',
    checkPlan,fromGeneration:1,toGeneration:2,steps:[{kind:'ADD_INVOICE_REVISION_NOTE_V1'}]};
  value.planDigest = nativeUpdatePlanDigestV1(value);
  return value;
}
function make(overrides={}) {
  const root = join(mkdtempSync(join(ownedRoot,'case-')),'pan453-owned-v2','pan463-native-v1');
  mkdirSync(root,{recursive:true});
  const p = plan(); const time=Date.now();
  const grant = {grantId:'synthetic-grant',planDigest:p.planDigest,executorId:'executor-one',fence:7,notBeforeMs:time-1000,expiresAtMs:time+120000,revoked:false};
  const request = {plan:p,executorId:grant.executorId,fence:7};
  const options = {root,ownedRoot,database,admittedPlan:p};
  const executor = createNativeUpdateExecutorV1({...options,readGrant:()=>structuredClone(grant),...overrides});
  return {root,grant,request,options,executor};
}
async function state() {
  const rows=await pg.admin.query('SELECT * FROM pan463_native_state');
  const col=await pg.admin.query("SELECT column_name FROM information_schema.columns WHERE table_name='kts_invoices' AND column_name='native_revision_note'");
  return {row:rows.rows[0],columns:col.rows.length};
}
async function unchanged() {
  const s=await state();assert.equal(s.row.generation,1);assert.equal(s.row.migration_count,0);assert.equal(s.columns,0);
  assert.deepEqual((await pg.admin.query('SELECT * FROM kts_invoices ORDER BY kts_invoice_id')).rows,originalRows);
}
function launch(x, phase='none') {
  const configFile=join(x.root,'process-config.json');const grantFile=join(x.root,'trusted-grant.json');
  writeFileSync(grantFile,JSON.stringify(x.grant));
  writeFileSync(configFile,JSON.stringify({options:x.options,request:x.request,grantFile}));
  const child=fork(new URL('./executor-process.mjs',import.meta.url),[configFile,phase],{stdio:['ignore','pipe','pipe','ipc']});
  let output='';child.stdout.on('data',x=>{output+=x;});child.stderr.on('data',x=>{output+=x;});
  const exit=once(child,'exit');
  const message=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('EXECUTOR_TIMEOUT '+output));},15000);
    child.once('message',msg=>{clearTimeout(timer);resolve(msg);});
    child.once('error',err=>{clearTimeout(timer);reject(err);});
    child.once('exit',()=>{clearTimeout(timer);reject(Error('EARLY_EXIT '+output));});
  });
  return {child,exit,message};
}
before(async()=>{
  ownedRoot=mkdtempSync(join(tmpdir(),'pan463-'));
  pg=await startRealPostgres(join(ownedRoot,'postgres'));
  originalRows=(await pg.admin.query('SELECT * FROM kts_invoices ORDER BY kts_invoice_id')).rows;
  await pg.admin.query('CREATE TABLE pan463_native_state (installation_id text PRIMARY KEY,generation integer NOT NULL,lock_digest text NOT NULL,fence integer NOT NULL,migration_count integer NOT NULL,last_operation text,last_plan_digest text)');
});
after(async()=>{if(pg)await pg.stop();if(ownedRoot)rmSync(ownedRoot,{recursive:true,force:true});});
beforeEach(async()=>{
  await pg.admin.query('ALTER TABLE kts_invoices DROP COLUMN IF EXISTS native_revision_note');
  await pg.admin.query('TRUNCATE pan463_native_state');
  await pg.admin.query('INSERT INTO pan463_native_state VALUES ($1,1,$2,7,0,NULL,NULL)',['synthetic-installation','a'.repeat(64)]);
});

test('AC01: native typed step applies once, reads actual schema/generation, preserves invoice rows and reuses PAN453 durable store',async()=>{
  const x=make();const result=await x.executor.execute(x.request);
  assert.equal(result.status,'PASS');assert.equal(result.dispatched,true);assert.equal(result.readback.generation,2);
  assert.equal((await state()).row.migration_count,1);
  assert.deepEqual((await pg.admin.query('SELECT kts_invoice_id,kts_order_id,kts_customer_id,betrag_eur,waehrung,faellig,grenzwert_eur FROM kts_invoices ORDER BY kts_invoice_id')).rows,originalRows);
  const journal=JSON.parse(readFileSync(join(x.root,'effects.json'),'utf8'));
  assert.equal(journal.schemaVersion,'chimpmaera.demo/effect-store/v4');assert.equal(journal.reservations['native:update-0001'].status,'APPLIED');
  const second=await createNativeUpdateExecutorV1({...x.options,readGrant:()=>x.grant}).execute(x.request);
  assert.equal(second.status,'PASS');assert.equal(second.dispatched,false);assert.equal((await state()).row.migration_count,1);
});
test('AC01: CHECK_ONLY by itself cannot enter effect adapter and original plan remains unchanged',async()=>{
  const x=make();const before=JSON.stringify(x.request.plan.checkPlan);
  assert.throws(()=>createNativeUpdateExecutorV1({...x.options,admittedPlan:x.request.plan.checkPlan,readGrant:()=>x.grant}),/PAN463_NATIVE_PLAN_REQUIRED/);
  assert.equal(JSON.stringify(x.request.plan.checkPlan),before);await unchanged();
});
test('AC01: arbitrary step, widened CHECK_ONLY and rehashed conflicting payload are denied before effect',async()=>{
  const x=make();const other=structuredClone(x.request.plan);other.steps=[{kind:'SHELL',command:'not-executed'}];other.planDigest=nativeUpdatePlanDigestV1(other);
  await assert.rejects(x.executor.execute({...x.request,plan:other}),/PAN463_NATIVE_PLAN_REQUIRED/);
  const widened=structuredClone(x.request.plan);widened.checkPlan.mode='APPLY';widened.checkPlan.planDigest=updateDoctorContractDigest(widened.checkPlan,'planDigest');widened.planDigest=nativeUpdatePlanDigestV1(widened);
  assert.throws(()=>createNativeUpdateExecutorV1({...x.options,admittedPlan:widened,readGrant:()=>x.grant}),/PAN463_CHECK_PLAN_DENIED/);
  const conflict=structuredClone(x.request.plan);conflict.checkPlan.targetLockDigest='d'.repeat(64);conflict.checkPlan.planDigest=updateDoctorContractDigest(conflict.checkPlan,'planDigest');conflict.planDigest=nativeUpdatePlanDigestV1(conflict);
  await assert.rejects(x.executor.execute({...x.request,plan:conflict}),/PAN463_PAYLOAD_CONFLICT_DENIED/);await unchanged();
});
for(const phase of ['BEFORE_DISPATCH','DURING_TRANSACTION','AFTER_COMMIT_BEFORE_RECEIPT']) {
  test(`AC02 real SIGKILL at ${phase}: restart observes retained target without replay`,async()=>{
    const x=make();const process=launch(x,phase);
    try {
      assert.deepEqual(await process.message,{kind:'phase',phase});
      process.child.kill('SIGKILL');const [code,signal]=await process.exit;assert.equal(code,null);assert.equal(signal,'SIGKILL');
      const durable=JSON.parse(readFileSync(join(x.root,'effects.json'),'utf8'));
      assert.equal(durable.reservations['native:update-0001'].status,'EXECUTING');assert.equal(Object.keys(durable.effects).length,0);
      const restarted=launch(x);const msg=await restarted.message;await restarted.exit;
      assert.equal(msg.kind,'result',JSON.stringify(msg));assert.equal(msg.result.dispatched,false);
      if(phase==='AFTER_COMMIT_BEFORE_RECEIPT') {
        assert.equal(msg.result.status,'PASS');assert.equal(msg.result.outcome,'APPLIED');assert.equal((await state()).row.migration_count,1);
      } else {
        assert.equal(msg.result.status,'HELD');assert.equal(msg.result.outcome,'NOT_APPLIED');await unchanged();
      }
    } finally {if(process.child.exitCode===null&&process.child.signalCode===null)process.child.kill('SIGKILL');}
  });
}
test('AC03: real competing process and a different journal root cannot dispatch while first executor owns target',async()=>{
  const x=make();const first=launch(x,'DURING_TRANSACTION');
  try {
    assert.equal((await first.message).kind,'phase');
    const competitor=make();await assert.rejects(competitor.executor.execute(competitor.request),/PAN463_COMPETING_EXECUTOR_DENIED/);
    first.child.kill('SIGKILL');await first.exit;await unchanged();
  } finally {if(first.child.exitCode===null&&first.child.signalCode===null)first.child.kill('SIGKILL');}
});
for(const kind of ['stale-fence','wrong-executor','expired','revoked','invalid-clock']) {
  test(`AC03 ${kind}: denies before mutation`,async()=>{
    const x=make(kind==='invalid-clock'?{now:()=>NaN}:{});
    if(kind==='stale-fence')x.request.fence=6;
    if(kind==='wrong-executor')x.request.executorId='executor-two';
    if(kind==='expired')x.grant.expiresAtMs=Date.now()-1;
    if(kind==='revoked')x.grant.revoked=true;
    const code={'stale-fence':'STALE_FENCE','wrong-executor':'GRANT_BINDING','expired':'GRANT_EXPIRED','revoked':'GRANT_REVOKED','invalid-clock':'CLOCK'}[kind];
    await assert.rejects(x.executor.execute(x.request),new RegExp(`PAN463_${code}_DENIED`));await unchanged();
  });
}
test('AC03: grant revoked during actual transaction rolls back both DDL and target marker',async()=>{
  const x=make();const ex=createNativeUpdateExecutorV1({...x.options,readGrant:()=>x.grant,observePhase:async phase=>{if(phase==='DURING_TRANSACTION')x.grant.revoked=true;}});
  await assert.rejects(ex.execute(x.request),/PAN463_GRANT_REVOKED_DENIED/);await unchanged();
});
test('AC03: durable PAN453 REVOKE is consumed before a native effect',async()=>{
  const x=make();recordLocalJournalControl(x.root,{kind:'REVOKE',operationKey:'native:update-0001',sourceIdentity:'local-synthetic|installer:local-native-update',targetIdentity:'native-postgres|InvoiceSchema|synthetic-installation',stopEpoch:1,issuedAtMs:Date.now(),reason:'synthetic operator revoke'});
  await assert.rejects(x.executor.execute(x.request),/EFFECT_REVOKED_DENIED/);await unchanged();
});
test('AC03: contradictory target after response loss remains UNKNOWN, never replays',async()=>{
  const x=make();const first=launch(x,'AFTER_COMMIT_BEFORE_RECEIPT');assert.equal((await first.message).kind,'phase');first.child.kill('SIGKILL');await first.exit;
  await pg.admin.query('UPDATE pan463_native_state SET last_plan_digest=$1',['e'.repeat(64)]);
  const retry=launch(x);const msg=await retry.message;await retry.exit;
  assert.equal(msg.kind,'result',JSON.stringify(msg));assert.equal(msg.result.status,'HELD');assert.equal(msg.result.outcome,'UNKNOWN');assert.equal(msg.result.dispatched,false);
  assert.equal((await state()).row.migration_count,1);
});
test('AC01/03: wrong observed generation or database fence cannot be repaired from caller plan',async()=>{
  const x=make();await pg.admin.query('UPDATE pan463_native_state SET generation=9');
  await assert.rejects(x.executor.execute(x.request),/GENERATION_OR_TARGET_UNKNOWN_HELD/);assert.equal((await state()).row.migration_count,0);assert.equal((await state()).columns,0);
});
test('AC01 ownership: unowned, legacy or symlink root and remote database refuse',async()=>{
  const x=make();assert.throws(()=>createNativeUpdateExecutorV1({...x.options,root:ownedRoot,readGrant:()=>x.grant}),/OWNED_ROOT_REQUIRED/);
  const alias=join(ownedRoot,'alias');symlinkSync(x.root,alias);
  assert.throws(()=>createNativeUpdateExecutorV1({...x.options,root:alias,readGrant:()=>x.grant}),/OWNED_ROOT_REQUIRED|SYMLINK_DENIED/);
  assert.throws(()=>createNativeUpdateExecutorV1({...x.options,database:{...database,host:'example.invalid'},readGrant:()=>x.grant}),/LOCAL_DATABASE_REQUIRED/);await unchanged();
});

test('AC03: unavailable grant source is held with a sanitized code and no effect',async()=>{
  const x=make({readGrant:()=>{throw Error('synthetic backend detail not for receipt');}});
  await assert.rejects(x.executor.execute(x.request),{message:'PAN463_GRANT_UNAVAILABLE_HELD'});await unchanged();
});

test('AC03: expiry during transaction rolls back before commit',async()=>{
  const x=make();let clock=Date.now();
  const ex=createNativeUpdateExecutorV1({...x.options,readGrant:()=>x.grant,now:()=>clock,
    observePhase:async phase=>{if(phase==='DURING_TRANSACTION')clock=x.grant.expiresAtMs;}});
  await assert.rejects(ex.execute(x.request),/PAN463_GRANT_EXPIRED_DENIED/);await unchanged();
});
test('AC03: authoritative database fence mismatch refuses with no DDL',async()=>{
  const x=make();await pg.admin.query('UPDATE pan463_native_state SET fence=8');
  await assert.rejects(x.executor.execute(x.request),/PAN463_STALE_FENCE_DENIED/);await unchanged();
});
test('AC03: unavailable target state after real postcommit kill is UNKNOWN and held',async()=>{
  const x=make();const first=launch(x,'AFTER_COMMIT_BEFORE_RECEIPT');assert.equal((await first.message).kind,'phase');first.child.kill('SIGKILL');await first.exit;
  await pg.admin.query('DELETE FROM pan463_native_state');
  const retry=launch(x);const msg=await retry.message;await retry.exit;
  assert.equal(msg.kind,'result',JSON.stringify(msg));assert.equal(msg.result.status,'HELD');assert.equal(msg.result.outcome,'UNKNOWN');assert.equal(msg.result.dispatched,false);
  const column=await pg.admin.query("SELECT column_name FROM information_schema.columns WHERE table_name='kts_invoices' AND column_name='native_revision_note'");
  assert.equal(column.rows.length,1);
});
test('AC01/03: malformed CHECK_ONLY digest cannot become native authority',async()=>{
  const x=make();const p=structuredClone(x.request.plan);p.checkPlan.planDigest='f'.repeat(64);p.planDigest=nativeUpdatePlanDigestV1(p);
  assert.throws(()=>createNativeUpdateExecutorV1({...x.options,admittedPlan:p,readGrant:()=>x.grant}),/PAN463_CHECK_PLAN_DENIED/);await unchanged();
});
test('AC03: persisted grant conflict cannot reuse an earlier reservation',async()=>{
  const x=make();const first=launch(x,'BEFORE_DISPATCH');assert.equal((await first.message).kind,'phase');first.child.kill('SIGKILL');await first.exit;
  x.grant.grantId='replacement-grant';
  await assert.rejects(x.executor.execute(x.request),/REPLAY_AUTHORITY_CONFLICT_DENIED/);await unchanged();
});
