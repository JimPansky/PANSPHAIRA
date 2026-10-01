// Original MIG-02 criteria; real native SQLite files and composed product entry.
// All payloads are deliberately synthetic. Direct SQL corruptions below are
// boundary-specific negative probes, not substituted provider readbacks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
const entry = new URL('../../src/pan472/persistent-draft-transfer.mjs', import.meta.url);
const verifier = new URL('../../src/pan472/independent-draft-reconciliation.mjs', import.meta.url);
const changes = () => [
  { id:'synthetic:customer-7', kind:'customer', revision:1, deleted:false, body:{nativeId:7,name:'Synthetic Customer'} },
  { id:'synthetic:order-42', kind:'order', revision:1, deleted:false, body:{customerId:'synthetic:customer-7',date:1767225600,refClient:'CM-ADMIN-AI-ESCALATION-001',status:'DRAFT',currency:'EUR',amountMinor:2500} },
  { id:'synthetic:line-1', kind:'line', revision:1, deleted:false, body:{orderId:'synthetic:order-42',quantityMicros:2000000,unit:'piece',priceMinor:1250} },
];
async function fixture() {
  const api = await import(entry);
  const check = await import(verifier);
  const parent=mkdtempSync(join(tmpdir(),'pan472-original-'));
  const root=join(parent,'pan472-owned-v1');
  api.initializePan472SyntheticDraftStores({root});
  api.writePan472SyntheticSource({root,changes:changes()});
  return {api,check,root,close(){rmSync(parent,{recursive:true,force:true});}};
}
function apply(x, kind='SNAPSHOT', options={}) {
  const captured=x.api.capturePan472TransferPlan({root:x.root,kind});
  assert.equal(captured.outcome,'PLANNED',JSON.stringify(captured));
  const grant=x.api.authorizePan472Transfer({root:x.root,plan:captured.plan,owner:'LOCAL_SYNTHETIC_OWNER'});
  return x.api.executePan472DraftTransfer({root:x.root,plan:captured.plan,grant,...options});
}
function native(x,which,sql,params=[]) {
  const db=new DatabaseSync(join(x.root,`${which}.sqlite`));
  try {return db.prepare(sql).all(...params);} finally {db.close();}
}
function count(x,table) {return native(x,'target',`SELECT COUNT(*) AS n FROM ${table}`)[0].n;}
function hashFile(p) {return createHash('sha256').update(readFileSync(p)).digest('hex');}

test('MIG-02-AC02 empty delta is read-only NO_CHANGES and cannot poison the verified target',async()=>{
  const x=await fixture();try{
    apply(x);
    const before=hashFile(join(x.root,'target.sqlite'));
    const sourceBefore=hashFile(join(x.root,'source.sqlite'));
    const captured=x.api.capturePan472TransferPlan({root:x.root,kind:'DELTA'});
    assert.equal(captured.outcome,'NO_CHANGES',JSON.stringify(captured));
    assert.equal(captured.readOnly,true);
    assert.equal(captured.plan,undefined);
    assert.equal(count(x,'dedup'),1);assert.equal(count(x,'receipts'),1);
    assert.equal(x.check.reconcilePan472DraftTransfer({root:x.root}).outcome,'VERIFIED');
    assert.equal(hashFile(join(x.root,'target.sqlite')),before);
    assert.equal(hashFile(join(x.root,'source.sqlite')),sourceBefore);
    assert.equal(count(x,'outside_effects'),0);
  }finally{x.close();}
});

test('MIG-02-AC01 deletion history must have an observed prior revision, not a first-event tombstone',async()=>{
  const x=await fixture();try{
    const before=hashFile(join(x.root,'source.sqlite'));
    assert.throws(()=>x.api.writePan472SyntheticSource({root:x.root,changes:[{id:'synthetic:unobserved-line',kind:'line',revision:1,deleted:true,body:null}]}),/DELETION_WITHOUT_PRIOR_REVISION_DENIED/);
    assert.equal(hashFile(join(x.root,'source.sqlite')),before);
  }finally{x.close();}
});

test('MIG-02-AC01/02 substituted plans, grants and native generation refuse before target writes',async()=>{
  const x=await fixture();try{
    const plan=x.api.capturePan472TransferPlan({root:x.root}).plan;
    const bad=structuredClone(plan);bad.rows[2].body.amountMinor=999;
    assert.throws(()=>x.api.authorizePan472Transfer({root:x.root,plan:bad,owner:'LOCAL_SYNTHETIC_OWNER'}),/PLAN_BINDING_DENIED/);
    assert.throws(()=>x.api.executePan472DraftTransfer({root:x.root,plan,grant:{}}),/PLAN_AUTHORITY_REQUIRED_DENIED/);
    const m=JSON.parse(readFileSync(join(x.root,'owned-profile.json'),'utf8'));
    const {canonicalJson}=await import('../../src/pan472/draft-profile.mjs');
    native(x,'source','UPDATE meta SET value=? WHERE key=? RETURNING key',[canonicalJson({...m,sourceGeneration:'11111111-1111-4111-8111-111111111111'}),'owned-profile']);
    const observed=x.api.capturePan472TransferPlan({root:x.root});
    assert.equal(observed.outcome,'UNKNOWN');
    assert.ok(observed.quarantine.some(q=>q.code==='SOURCE_GENERATION_OR_STORE_BINDING_DENIED'));
    assert.equal(count(x,'objects'),0);assert.equal(count(x,'dedup'),0);assert.equal(count(x,'outside_effects'),0);
  }finally{x.close();}
});

test('MIG-02-AC01 native object bounds roll back the whole source batch',async()=>{
  const x=await fixture();try{
    const before=hashFile(join(x.root,'source.sqlite'));
    const extra=Array.from({length:x.api.PAN472_LIMITS_V1.objects},(_,i)=>({...changes()[2],id:`synthetic:extra-line-${i}`}));
    assert.throws(()=>x.api.writePan472SyntheticSource({root:x.root,changes:extra}),/SOURCE_OBJECT_BOUND_DENIED/);
    assert.equal(hashFile(join(x.root,'source.sqlite')),before);
    assert.equal(x.api.capturePan472TransferPlan({root:x.root}).outcome,'PLANNED');
  }finally{x.close();}
});

test('MIG-02-AC02 source advance after approval refuses stale initial snapshot without native target intent',async()=>{
  const x=await fixture();try{
    const plan=x.api.capturePan472TransferPlan({root:x.root}).plan;
    const grant=x.api.authorizePan472Transfer({root:x.root,plan,owner:'LOCAL_SYNTHETIC_OWNER'});
    x.api.writePan472SyntheticSource({root:x.root,changes:[{...changes()[2],revision:2,body:{...changes()[2].body,quantityMicros:3000000}}]});
    assert.throws(()=>x.api.executePan472DraftTransfer({root:x.root,plan,grant}),/SOURCE_ADVANCED_REPLAN_REQUIRED_DENIED/);
    assert.equal(count(x,'objects'),0);assert.equal(count(x,'dedup'),0);assert.equal(count(x,'receipts'),0);
  }finally{x.close();}
});

test('MIG-02-AC03 empty delta cannot conceal an already quarantined target',async()=>{
  const x=await fixture();try{
    apply(x);
    native(x,'target','UPDATE objects SET body=? WHERE id=? RETURNING id',[JSON.stringify({...changes()[1].body,status:'BOOKED'}),'synthetic:order-42']);
    const before=hashFile(join(x.root,'target.sqlite'));
    const r=x.api.capturePan472TransferPlan({root:x.root,kind:'DELTA'});
    assert.equal(r.outcome,'QUARANTINED');assert.equal(r.plan,undefined);
    assert.ok(r.quarantine.some(q=>q.code==='STATUS_MUTATION'));
    assert.equal(hashFile(join(x.root,'target.sqlite')),before);
    assert.equal(count(x,'dedup'),1);assert.equal(count(x,'receipts'),1);
  }finally{x.close();}
});

test('MIG-02-AC01: qualified native snapshot plus contiguous delta retain exact generation, mapping and tombstones',async()=>{
  const x=await fixture();try{
    const first=apply(x);
    assert.equal(first.outcome,'TRANSFERRED');
    assert.equal(first.coverage,'COMPLETE');
    assert.equal(first.receipt.outsideEffectCount,0);
    assert.equal(x.check.reconcilePan472DraftTransfer({root:x.root}).outcome,'VERIFIED');
    x.api.writePan472SyntheticSource({root:x.root,changes:[
      {...changes()[1],revision:2,body:{...changes()[1].body,amountMinor:3750}},
      {...changes()[2],revision:2,body:{...changes()[2].body,quantityMicros:3000000}},
    ]});
    const delta=apply(x,'DELTA');
    assert.equal(delta.receipt.fromSequence,first.receipt.throughSequence);
    assert.equal(delta.receipt.sourceGeneration,first.receipt.sourceGeneration);
    assert.equal(delta.receipt.mappingDigest,x.api.PAN472_MAPPING_DIGEST_V1);
    x.api.writePan472SyntheticSource({root:x.root,changes:[{...changes()[2],revision:3,deleted:true,body:null}]});
    apply(x,'DELTA');
    assert.equal(native(x,'target','SELECT deleted,revision FROM objects WHERE id=?',['synthetic:line-1'])[0].deleted,1);
    assert.equal(x.check.reconcilePan472DraftTransfer({root:x.root}).outcome,'VERIFIED');
    const plan=x.api.capturePan472TransferPlan({root:x.root}).plan;
    const wrong={...plan,mappingDigest:'f'.repeat(64)};
    assert.throws(()=>x.api.authorizePan472Transfer({root:x.root,plan:wrong,owner:'LOCAL_SYNTHETIC_OWNER'}),/PLAN_BINDING_DENIED/);
    native(x,'source','DELETE FROM events WHERE sequence=2 RETURNING sequence');
    const gap=x.api.capturePan472TransferPlan({root:x.root});
    assert.equal(gap.outcome,'UNKNOWN');
    assert.ok(gap.quarantine.some(q=>q.code==='SOURCE_SEQUENCE_GAP'));
  }finally{x.close();}
});

test('MIG-02-AC02: target/dedup atomicity, real post-commit ACK loss, conflict refusal and stale resurrection denial',async()=>{
  const x=await fixture();try{
    const captured=x.api.capturePan472TransferPlan({root:x.root});
    const grant=x.api.authorizePan472Transfer({root:x.root,plan:captured.plan,owner:'LOCAL_SYNTHETIC_OWNER'});
    assert.throws(()=>x.api.executePan472DraftTransfer({root:x.root,plan:captured.plan,grant,fault:'ROLLBACK_BEFORE_DEDUP'}),/SYNTHETIC_ROLLBACK_BEFORE_DEDUP/);
    assert.equal(count(x,'objects'),0);assert.equal(count(x,'dedup'),0);assert.equal(count(x,'receipts'),0);
    assert.throws(()=>x.api.executePan472DraftTransfer({root:x.root,plan:captured.plan,grant,fault:'ACK_LOSS_AFTER_COMMIT'}),/SYNTHETIC_ACK_LOSS_AFTER_COMMIT/);
    assert.equal(count(x,'objects'),changes().length);assert.equal(count(x,'dedup'),1);assert.equal(count(x,'receipts'),1);
    const recovered=apply(x);
    assert.equal(recovered.outcome,'RECONCILED_NO_DUPLICATE');
    assert.equal(count(x,'dedup'),1);assert.equal(count(x,'receipts'),1);
    native(x,'target','UPDATE dedup SET plan_digest=? RETURNING operation_key',['0'.repeat(64)]);
    assert.throws(()=>apply(x),/DEDUP_CONTENT_CONFLICT_DENIED/);
    native(x,'target','UPDATE dedup SET plan_digest=? RETURNING operation_key',[captured.plan.planDigest]);
    x.api.writePan472SyntheticSource({root:x.root,changes:[{...changes()[2],revision:2,deleted:true,body:null}]});
    apply(x,'DELTA');
    assert.throws(()=>x.api.executePan472DraftTransfer({root:x.root,plan:captured.plan,grant}),/STALE_SEQUENCE_DENIED/);
    assert.equal(native(x,'target','SELECT deleted,revision FROM objects WHERE id=?',['synthetic:line-1'])[0].deleted,1);
    assert.equal(count(x,'outside_effects'),0);
  }finally{x.close();}
});

test('MIG-02-AC03: independent native reads quarantine missing/reference/scaling/status mutations and retain UNKNOWN',async()=>{
  for(const [code,sql,params] of [
    ['MISSING_OBJECT','DELETE FROM objects WHERE id=? RETURNING id',['synthetic:customer-7']],
    ['BROKEN_REFERENCE','UPDATE objects SET body=? WHERE id=? RETURNING id',[JSON.stringify({...changes()[1].body,customerId:'synthetic:missing-customer'}),'synthetic:order-42']],
    ['SCALING_MUTATION','UPDATE objects SET body=? WHERE id=? RETURNING id',[JSON.stringify({...changes()[2].body,quantityMicros:200000000}),'synthetic:line-1']],
    ['STATUS_MUTATION','UPDATE objects SET body=? WHERE id=? RETURNING id',[JSON.stringify({...changes()[1].body,status:'BOOKED'}),'synthetic:order-42']],
  ]) {
    const x=await fixture();try{
      apply(x);native(x,'target',sql,params);
      const before=hashFile(join(x.root,'target.sqlite'));
      const r=x.check.reconcilePan472DraftTransfer({root:x.root});
      assert.equal(r.outcome,'QUARANTINED',JSON.stringify(r));
      assert.ok(r.quarantine.some(q=>q.code===code),JSON.stringify(r));
      assert.equal(r.readOnly,true);assert.equal(r.complete,false);
      assert.equal(hashFile(join(x.root,'target.sqlite')),before);
      assert.equal(count(x,'outside_effects'),0);
    }finally{x.close();}
  }
  const x=await fixture();try{
    x.api.writePan472SyntheticSource({root:x.root,changes:[{...changes()[2],revision:2,body:{...changes()[2].body,unit:'UNAVAILABLE'}}]});
    const r=x.api.capturePan472TransferPlan({root:x.root});
    assert.equal(r.outcome,'UNKNOWN');assert.equal(r.coverage,'UNKNOWN');
    assert.ok(r.quarantine.some(q=>q.code==='UNAVAILABLE_SEMANTICS'));
    assert.equal(count(x,'objects'),0);
    const fresh=x.check.reconcilePan472DraftTransfer({root:x.root});
    assert.equal(fresh.outcome,'UNKNOWN');assert.equal(fresh.complete,false);
    assert.ok(fresh.quarantine.some(q=>q.code==='UNAVAILABLE_SEMANTICS'));
  }finally{x.close();}
});

test('MIG-02-AC04: actual fresh-process composed native restart retains receipts with zero outside effects',async()=>{
  const x=await fixture();try{
    assert.throws(()=>apply(x,'SNAPSHOT',{fault:'ACK_LOSS_AFTER_COMMIT'}),/SYNTHETIC_ACK_LOSS_AFTER_COMMIT/);
    const script=`const api=await import(${JSON.stringify(entry.href)});const verify=await import(${JSON.stringify(verifier.href)});const root=process.argv[1];const {plan}=api.capturePan472TransferPlan({root,kind:'SNAPSHOT'});const grant=api.authorizePan472Transfer({root,plan,owner:'LOCAL_SYNTHETIC_OWNER'});const result=api.executePan472DraftTransfer({root,plan,grant});console.log(JSON.stringify({pid:process.pid,result,verification:verify.reconcilePan472DraftTransfer({root})}));`;
    const child=spawnSync(process.execPath,['--input-type=module','-e',script,x.root],{encoding:'utf8',timeout:10000});
    assert.equal(child.status,0,child.stdout+child.stderr);
    const r=JSON.parse(child.stdout);
    assert.notEqual(r.pid,process.pid);
    assert.equal(r.result.outcome,'RECONCILED_NO_DUPLICATE');assert.equal(r.verification.outcome,'VERIFIED');
    assert.equal(r.result.receipt.outsideEffectCount,0);
    assert.equal(count(x,'receipts'),1);assert.equal(count(x,'dedup'),1);assert.equal(count(x,'outside_effects'),0);
    assert.throws(()=>x.api.authorizePan472Transfer({root:x.root,plan:x.api.capturePan472TransferPlan({root:x.root}).plan,owner:'OTHER_OWNER'}),/SYNTHETIC_OWNER_REQUIRED_DENIED/);
  }finally{x.close();}
});
