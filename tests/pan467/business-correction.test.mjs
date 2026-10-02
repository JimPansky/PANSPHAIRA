// Original LIFE-07 actual native APIs; immutable prior product seams, no mocks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fixture,LINE,query} from '../fixtures/pan467/native-business-fixture.mjs';
import * as api from '../../src/pan467/business-correction.mjs';
import {PAN467_ACTOR,digest,receiptCore} from '../../src/pan467/business-correction-profile.mjs';
import {diagnosePan467BusinessCorrection} from '../../src/pan467/independent-business-diagnosis.mjs';
import {recoverPan473Cutover,authorizePan473TargetWrite,writePan473Target} from '../../src/pan473/writer-scope-cutover.mjs';
import {recordLocalJournalControl} from '../../demo/runtime/local-journal-owner.mjs';
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
export function request(root,patch={}){const original=api.describePan467OriginalEffect({root,id:LINE,originalRevision:2});return {requestId:'synthetic:correction-request-1',sourceGeneration:original.sourceGeneration,epoch:original.epoch,id:LINE,originalRevision:2,originalEffectKey:original.originalEffectKey,expectedOriginalValue:1750,correctedValue:1250,externalCoverage:'LOCAL_DRAFT_ONLY',reason:'Correct earlier wrong synthetic price',...patch};}
const authorize=(root,body)=>api.authorizePan467BusinessCorrection({root,request:body,owner:'LOCAL_SYNTHETIC_OWNER',actor:PAN467_ACTOR});
const run=(root,body,extras={})=>api.executePan467BusinessCorrection({root,request:body,grant:authorize(root,body),...extras});

test('LIFE-07-AC01 one actual synthetic aggregate retains earlier wrong price and later correct quantity through native recovery',async()=>{
 const x=await fixture();try{
  const source=query(x.root,'source','SELECT revision,body FROM events WHERE id=? ORDER BY sequence',LINE);
  assert.deepEqual(source.map(r=>[r.revision,JSON.parse(r.body).priceMinor]),[[1,1250],[2,1750]]);
  const live=query(x.root,'target','SELECT revision,body FROM objects WHERE id=?',LINE)[0];assert.equal(live.revision,3);assert.equal(JSON.parse(live.body).priceMinor,1750);assert.equal(JSON.parse(live.body).quantityMicros,3000000);
  const native=query(x.root,'target','SELECT event FROM pan473_target_events ORDER BY ordinal');
  const r=await recoverPan473Cutover({root:x.root,owner:'LOCAL_SYNTHETIC_OWNER'});assert.equal(r.outcome,'ACTIVE');
  assert.deepEqual(query(x.root,'target','SELECT event FROM pan473_target_events ORDER BY ordinal'),native);
  assert.equal(diagnosePan467BusinessCorrection({root:x.root}).outcome,'READY_NOT_CORRECTED');
 }finally{x.close();}
});

test('LIFE-07-AC02 GREEN new attributed revision4 preserves original source/baseline/import receipts and later valid quantity',async()=>{
 const x=await fixture();try{
  const before={source:hash(join(x.root,'source.sqlite')),baseline:query(x.root,'target','SELECT * FROM pan473_baseline ORDER BY id'),receipts:query(x.root,'target','SELECT * FROM receipts ORDER BY operation_key'),firstEvent:query(x.root,'target','SELECT event FROM pan473_target_events WHERE ordinal=1')};
  const r=await run(x.root,request(x.root));assert.equal(r.outcome,'ATTRIBUTED_FORWARD_CORRECTED');assert.equal(r.receipt.actor,PAN467_ACTOR);assert.equal(r.receipt.firstRequestId,'synthetic:correction-request-1');assert.equal(r.receipt.correctionRevision,4);
  const live=query(x.root,'target','SELECT revision,body FROM objects WHERE id=?',LINE)[0];assert.equal(live.revision,4);assert.equal(JSON.parse(live.body).priceMinor,1250);assert.equal(JSON.parse(live.body).quantityMicros,3000000);
  assert.equal(hash(join(x.root,'source.sqlite')),before.source);assert.deepEqual(query(x.root,'target','SELECT * FROM pan473_baseline ORDER BY id'),before.baseline);assert.deepEqual(query(x.root,'target','SELECT * FROM receipts ORDER BY operation_key'),before.receipts);assert.deepEqual(query(x.root,'target','SELECT event FROM pan473_target_events WHERE ordinal=1'),before.firstEvent);
  const dbhash=hash(join(x.root,'target.sqlite')),d=diagnosePan467BusinessCorrection({root:x.root});assert.equal(d.outcome,'VERIFIED',JSON.stringify(d));assert.equal(d.readOnly,true);assert.equal(d.outsideEffectCount,0);assert.equal(d.corrections[0].correctionRevision,4);assert.equal(hash(join(x.root,'target.sqlite')),dbhash);
 }finally{x.close();}
});

test('LIFE-07-AC03 actual admission rejects uncovered external outcomes, conflicting generation and target epoch without mutation',async()=>{
 const x=await fixture();try{
  const body=request(x.root),before=hash(join(x.root,'target.sqlite'));
  for(const [patch,code] of [[{externalCoverage:'PAYMENT_CONFIRMED'},/UNCOVERED_EXTERNAL_OUTCOME/],[{externalCoverage:'UNKNOWN'},/UNCOVERED_EXTERNAL_OUTCOME/],[{sourceGeneration:randomUUID()},/CONFLICTING_GENERATION/],[{epoch:2},/CONFLICTING_TARGET_EPOCH/],[{originalEffectKey:'admin-ai:poc:pan467-invented-new-key'},/ORIGINAL_EFFECT_BINDING/],[{correctedValue:1750},/NO_CHANGE_NOT_CORRECTION/]])assert.throws(()=>authorize(x.root,{...body,...patch}),code);
  assert.equal(hash(join(x.root,'target.sqlite')),before);assert.equal(query(x.root,'target',"SELECT name FROM sqlite_master WHERE name='pan467_meta'").length,0);
 }finally{x.close();}
});

test('LIFE-07-AC03 new request identity cannot hide conflicting original effect; equivalent alias only reads existing receipt',async()=>{
 const x=await fixture();try{
  const body=request(x.root),first=await run(x.root,body),before=hash(join(x.root,'target.sqlite'));
  const alias=await run(x.root,{...body,requestId:'synthetic:correction-request-2'});assert.equal(alias.outcome,'RECONCILED_NO_DUPLICATE');assert.deepEqual(alias.receipt,first.receipt);
  assert.throws(()=>authorize(x.root,{...body,requestId:'synthetic:correction-request-3',correctedValue:1500}),/ORIGINAL_EFFECT_CONTENT_CONFLICT/);
  assert.equal(query(x.root,'target','SELECT event FROM pan473_target_events').length,2);assert.equal(hash(join(x.root,'target.sqlite')),before);
 }finally{x.close();}
});

test('LIFE-07 recovery lost native ACK is independently pending then resumed with no duplicate version or erased later work',async()=>{
 const x=await fixture();try{
  const body=request(x.root);await assert.rejects(()=>run(x.root,body,{fault:'ACK_LOSS_AFTER_NATIVE'}),/ACK_LOSS_AFTER_NATIVE/);
  const d=diagnosePan467BusinessCorrection({root:x.root});assert.equal(d.outcome,'PENDING_NATIVE_READBACK_REQUIRED');assert.equal(d.complete,false);assert.equal(d.nativeEffectsAwaitingAttributionCommit,1);
  const grant=authorizePan473TargetWrite({root:x.root,epoch:1,owner:'LOCAL_SYNTHETIC_OWNER'});
  writePan473Target({root:x.root,epoch:1,grant,changes:[{id:LINE,kind:'line',revision:5,deleted:false,body:{orderId:'synthetic:order-42',quantityMicros:4000000,unit:'piece',priceMinor:1250}}]});
  const r=await run(x.root,{...body,requestId:'synthetic:correction-recovery-2'});assert.equal(r.receipt.correctionRevision,4);assert.equal(r.receipt.firstRequestId,body.requestId);
  assert.equal(query(x.root,'target','SELECT revision FROM objects WHERE id=?',LINE)[0].revision,5);assert.equal(query(x.root,'target','SELECT event FROM pan473_target_events').length,3);assert.equal(JSON.parse(query(x.root,'target','SELECT body FROM objects WHERE id=?',LINE)[0].body).quantityMicros,4000000);
 }finally{x.close();}
});

test('LIFE-07 attribution requires real content-bound synthetic grant and fixed actor, not caller claimed attribution',async()=>{
 const x=await fixture();try{
  const body=request(x.root),before=hash(join(x.root,'target.sqlite'));
  assert.throws(()=>api.authorizePan467BusinessCorrection({root:x.root,request:body,owner:'LOCAL_SYNTHETIC_OWNER',actor:'synthetic:invented-owner'}),/CODE_OWNED_SYNTHETIC_ACTOR/);
  await assert.rejects(()=>api.executePan467BusinessCorrection({root:x.root,request:body,grant:{}}),/CURRENT_CONTENT_BOUND_GRANT/);
  const grant=authorize(x.root,body);await assert.rejects(()=>api.executePan467BusinessCorrection({root:x.root,request:{...body,correctedValue:1000},grant}),/CURRENT_CONTENT_BOUND_GRANT/);
  assert.equal(hash(join(x.root,'target.sqlite')),before);
 }finally{x.close();}
});

test('LIFE-07 later valid same-field choice is not erased even after price returns to the earlier wrong value',async()=>{
 const x=await fixture();try{
  const body=request(x.root),grant=authorizePan473TargetWrite({root:x.root,epoch:1,owner:'LOCAL_SYNTHETIC_OWNER'});
  for(const [revision,priceMinor] of [[4,1500],[5,1750]])writePan473Target({root:x.root,epoch:1,grant,changes:[{id:LINE,kind:'line',revision,deleted:false,body:{orderId:'synthetic:order-42',quantityMicros:3000000,unit:'piece',priceMinor}}]});
  const before=hash(join(x.root,'target.sqlite'));await assert.rejects(()=>run(x.root,body),/LATER_VALID_PRICE_CONFLICT/);assert.equal(hash(join(x.root,'target.sqlite')),before);
 }finally{x.close();}
});

test('LIFE-07 existing durable source/target STOP denies new business correction before mutation',async()=>{
 const x=await fixture();try{
  const body=request(x.root),m=JSON.parse(readFileSync(join(x.root,'owned-profile.json'),'utf8'));
  recordLocalJournalControl(join(x.root,'pan453-owned-v2'),{kind:'STOP',sourceIdentity:m.sourceIdentity,targetIdentity:m.targetIdentity,operationKey:null,stopEpoch:1,issuedAtMs:Date.now(),reason:'Synthetic bounded stop'});
  const before=hash(join(x.root,'target.sqlite'));assert.throws(()=>authorize(x.root,body),/STOP_OR_REVOKE/);assert.equal(hash(join(x.root,'target.sqlite')),before);
 }finally{x.close();}
});

test('LIFE-07 independent diagnosis refuses self-rehashed attribution not bound to the actual native correction event',async()=>{
 const x=await fixture();try{
  const body=request(x.root);await assert.rejects(()=>run(x.root,body,{fault:'ACK_LOSS_AFTER_NATIVE'}),/ACK_LOSS_AFTER_NATIVE/);
  const intent=JSON.parse(query(x.root,'target','SELECT intent FROM pan467_intents')[0].intent),event=JSON.parse(query(x.root,'target','SELECT event FROM pan473_target_events WHERE ordinal=2')[0].event);
  const forged={...receiptCore(intent,event),nativeEventDigest:digest({synthetic:'invented-native-event'})},receipt={...forged,receiptDigest:digest(forged)};
  assert.equal(receipt.receiptDigest,digest(forged));assert.notEqual(receipt.nativeEventDigest,event.eventDigest);
  const db=new DatabaseSync(join(x.root,'target.sqlite'));try{db.prepare("UPDATE pan467_intents SET state='COMMITTED',receipt=?").run(JSON.stringify(receipt));}finally{db.close();}
  const before=hash(join(x.root,'target.sqlite')),d=diagnosePan467BusinessCorrection({root:x.root});assert.equal(d.outcome,'UNKNOWN');assert.equal(d.quarantine[0].code,'PAN467_ATTRIBUTED_NATIVE_RECEIPT_MISMATCH');assert.equal(hash(join(x.root,'target.sqlite')),before);
 }finally{x.close();}
});
