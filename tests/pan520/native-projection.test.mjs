import assert from 'node:assert/strict';
import test from 'node:test';
import {nativeTradeFixture,nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
import * as trade from '../../src/pan515/trade-state.mjs';
import common from '../../contracts/trade/common-trade-01-v1.json' with {type:'json'};
import {join} from 'node:path';
import {scopeProfile} from '../../src/pan473/scope-profile.mjs';
import {recordLocalJournalControl} from '../../demo/runtime/local-journal-owner.mjs';

const owner='LOCAL_SYNTHETIC_OWNER';
const command=(kind,revision,id,quantity,referenceId=null,extra={})=>({schemaVersion:'pansphaira.pan517/fulfilment-command/v1',effectId:id,transportId:'synthetic:projection-'+id.toLowerCase(),expectedRevision:revision,orderId:'SO-01',lineId:'1',articleId:'ARTICLE-A',warehouseId:'WH-01',unit:'STK',kind,quantity,referenceId,effectiveAt:'2026-06-29T10:00:00Z',reason:'Local synthetic native projection source only',...extra});
const apply=(root,c)=>trade.executePan515TradeCommand({root,command:c,grant:trade.authorizePan515TradeCommand({root,command:c,owner})});
async function nativePartialShipment(){
  const f=await nativeTradeFixture({common:true});
  try{
    trade.initializePan515TradeState({root:f.root,owner,caseId:common.id});
    apply(f.root,command('PROMISE',0,'PR-01',10,null,{effectiveAt:common.sales_order.accepted_at,promise:{revision:1,kind:'DISPATCH',dueAt:common.sales_order.promised_dispatch_at,previousPromiseDigest:null,sourceReference:'COMMON-TRADE-01.sales_order'}}));
    for(const [i,r] of common.receipts.entries())apply(f.root,{...command('RECEIPT',i+1,r.id,r.accepted_quantity,common.purchase_order.id,{effectiveAt:r.accepted_at,sourceLineId:'1'}),schemaVersion:'pansphaira.pan515/trade-command/v1'});
    apply(f.root,{...command('RESERVE',3,'RS-01',10,null,{effectiveAt:common.reservation_events[0].at}),schemaVersion:'pansphaira.pan515/trade-command/v1'});
    apply(f.root,command('PICK',4,'PK-01',8,'RS-01'));apply(f.root,command('PACK',5,'PA-01',8,'PK-01'));
    apply(f.root,command('ISSUE',6,'SH-01',8,'PA-01',{reservationId:'RS-01',reservationEventId:'RC-01',dispatchNoteId:'DN-01',physicalEvidenceId:'EV-01',promiseRevision:1,effectiveAt:common.shipments[0].dispatched_at}));
    return f;
  }catch(error){f.close();throw error;}
}
const stockRequest=()=>({schemaVersion:'pansphaira.pan520/projection-request/v1',profile:'STOCK',scope:{sourceId:'SYN-COMMON',tenantId:'SYN-TENANT-01',entityId:'SYN-ENTITY-01',orderId:'SO-01',lineId:'1',articleId:'ARTICLE-A',warehouseId:'WH-01',currency:'EUR',unit:'STK'},questions:['STOCK_POSITION','STOCK_RUNWAY','STOCK_VALUE']});

test('P06 AC1 real native June stock is projected as2/2/0/0 and absent history or valuation stays unavailable, never zero',async()=>{
  const f=await nativePartialShipment();
  try{
    const cutoff='2026-06-30T23:59:59+02:00',before=nativeRows(f.root,'SELECT command,event FROM pan515_events ORDER BY revision');
    const ordinary=trade.readPan515TradeState({root:f.root,asOf:cutoff});
    assert.deepEqual(ordinary.quantities,{physical:2,reserved:2,blocked:0,available:0,shipped:8,returned:0});
    const result=trade.readPan515TradeState({root:f.root,asOf:cutoff,projection:stockRequest()});
    assert.equal(result.schemaVersion,'pansphaira.pan520/projection-snapshot/v1','existing native entry must produce an explicit typed source snapshot, not silently ignore the projection request');
    assert.equal(result.profile,'STOCK');assert.equal(result.snapshot.asOf,cutoff);assert.deepEqual(result.grain,stockRequest().scope);
    for(const [key,value] of Object.entries({physical:2,reserved:2,quarantined:0,free:0})){assert.equal(result.facts[key].state,'KNOWN');assert.equal(result.facts[key].value,value);assert.equal(result.facts[key].unit,'STK');}
    assert.equal(result.facts.stockRunwayDays.state,'UNAVAILABLE');assert.equal(result.facts.stockRunwayDays.value,null);assert.equal(result.facts.stockRunwayDays.reason,'MISSING_NATIVE_CONSUMPTION_HISTORY');
    assert.equal(result.facts.stockValueMinor.state,'UNAVAILABLE');assert.equal(result.facts.stockValueMinor.value,null);assert.equal(result.facts.stockValueMinor.reason,'MISSING_QUALIFIED_VALUATION_PROFILE');
    assert.equal(result.readOnly,true);assert.ok(result.provenance.nativeEventDigests.includes(ordinary.events.find(e=>e.effectId==='SH-01').eventDigest));
    assert.deepEqual(nativeRows(f.root,'SELECT command,event FROM pan515_events ORDER BY revision'),before,'source projection read cannot mutate native events');
  }finally{f.close();}
});

test('P06 O2C current native order price and actual dispatch remain distinct from unavailable billed net and customer receipt facts',async()=>{
  const f=await nativePartialShipment();
  try{
    const req={...stockRequest(),profile:'O2C',questions:['ORDER_SOURCE','DISPATCH_TIMELINESS','CUSTOMER_RECEIPT_TIMELINESS','BILLED_NET']};
    const before=nativeRows(f.root,'SELECT command,event FROM pan515_events ORDER BY revision');
    const ordinary=trade.readPan515TradeState({root:f.root});assert.equal(ordinary.quantities.shipped,8);assert.equal(ordinary.binding.nativeDateMapping.nativeDateIsBusinessAcceptance,false);
    const result=trade.readPan515TradeState({root:f.root,projection:req});assert.equal(result.profile,'O2C');assert.equal(result.schemaVersion,'pansphaira.pan520/projection-snapshot/v1');
    for(const [key,value] of Object.entries({orderQuantity:10,orderUnitNetMinor:10000,orderSourceNetMinor:100000,nativeOperationalDateSeconds:1767225600,totalIssuedQuantity:8,onTimeDispatchedQuantity:8})){assert.equal(result.facts[key].state,'KNOWN',key);assert.equal(result.facts[key].value,value,key);}
    assert.equal(result.facts.nativeOrderStatus.value,'DRAFT');assert.equal(result.facts.businessAcceptanceAt.state,'UNAVAILABLE');assert.equal(result.facts.businessAcceptanceAt.reason,'MISSING_NATIVE_BUSINESS_ACCEPTANCE_EVENT');
    assert.equal(result.facts.declaredReferenceAcceptanceAt.value,common.sales_order.accepted_at);assert.equal(result.facts.dispatchPositionOtif.state,'UNAVAILABLE');assert.equal(result.facts.dispatchPositionOtif.value,null);assert.equal(result.facts.dispatchPositionOtif.reason,'NATIVE_DISPATCH_COMPLETION_OR_DEADLINE_NOT_REACHED');
    assert.equal(result.facts.customerReceiptOnTimeQuantity.state,'UNAVAILABLE');assert.equal(result.facts.customerReceiptOnTimeQuantity.value,null);assert.equal(result.facts.customerReceiptOnTimeQuantity.reason,'MISSING_NATIVE_CUSTOMER_RECEIPT_EVIDENCE');
    assert.equal(result.facts.billedNetMinor.state,'UNAVAILABLE');assert.equal(result.facts.billedNetMinor.value,null);assert.equal(result.facts.billedNetMinor.reason,'MISSING_NATIVE_OUTBOUND_BILLING_DOCUMENTS');assert.equal(result.facts.billedNetByMonth.value,null);
    assert.equal(result.provenance.nativeOperationalDateIsBusinessAcceptance,false);assert.equal(result.provenance.declaredReferenceTimeIsNativeBusinessEvent,false);assert.deepEqual(result.provenance.dispatchPromiseRevisions,[1]);
    assert.equal(result.readOnly,true);assert.deepEqual(nativeRows(f.root,'SELECT command,event FROM pan515_events ORDER BY revision'),before);
  }finally{f.close();}
});

test('P06 closed source request rejects question-array getters without invoking untrusted code or mutating the native source',async()=>{
  const f=await nativePartialShipment();
  try{
    const before=nativeRows(f.root,'SELECT command,event FROM pan515_events ORDER BY revision');let calls=0;
    const q=['STOCK_POSITION'];Object.defineProperty(q,'0',{enumerable:true,get(){calls++;return 'STOCK_POSITION';}});
    assert.throws(()=>trade.readPan515TradeState({root:f.root,projection:{...stockRequest(),questions:q}}),/PAN520_QUESTION_NOT_ADMITTED_DENIED/);
    assert.equal(calls,0,'untrusted source request accessors cannot run inside the trusted read path');assert.deepEqual(nativeRows(f.root,'SELECT command,event FROM pan515_events ORDER BY revision'),before);
  }finally{f.close();}
});

test('P06 original revoked-after-plan negative uses the existing durable native control and cannot reuse an opaque planned read',async()=>{
  const f=await nativePartialShipment();
  try{
    const before=nativeRows(f.root,'SELECT command,event FROM pan515_events ORDER BY revision'),req=stockRequest();
    const actual=trade.readPan515TradeState({root:f.root,projection:req});assert.equal(actual.facts.physical.value,2);
    assert.equal(typeof trade.capturePan520ProjectionPlan,'function','existing native source lacks a bounded opaque projection plan/use entry');
    const {plan,handle}=trade.capturePan520ProjectionPlan({root:f.root,owner,projection:req});assert.equal(plan.proposalOnly,true);assert.equal(plan.effectsProduced,false);
    assert.equal(trade.executePan520ProjectionRead({root:f.root,plan,handle}).facts.physical.value,2);
    const {marker}=scopeProfile(f.root);recordLocalJournalControl(join(f.root,'pan453-owned-v2'),{kind:'REVOKE',sourceIdentity:marker.sourceIdentity,targetIdentity:marker.targetIdentity,operationKey:plan.operationKey,stopEpoch:1,issuedAtMs:Date.now(),reason:'Explicit synthetic source projection read revoked after planning'});
    assert.throws(()=>trade.executePan520ProjectionRead({root:f.root,plan,handle}),/PAN520_PROJECTION_STOP_OR_REVOKE_DENIED/);
    assert.throws(()=>trade.readPan515TradeState({root:f.root,projection:req}),/PAN520_PROJECTION_STOP_OR_REVOKE_DENIED/);
    assert.deepEqual(trade.readPan515TradeState({root:f.root}).quantities,{physical:2,reserved:2,blocked:0,available:0,shipped:8,returned:0},'feature-specific projection revoke does not globally reinterpret or disable old direct read');
    assert.deepEqual(nativeRows(f.root,'SELECT command,event FROM pan515_events ORDER BY revision'),before);
  }finally{f.close();}
});

test('P06 selective invalidation changes only customer-receipt dependencies when a real later customer promise is appended',async()=>{
  const f=await nativePartialShipment();
  try{
    const req={...stockRequest(),profile:'O2C',questions:['ORDER_SOURCE','DISPATCH_TIMELINESS','CUSTOMER_RECEIPT_TIMELINESS','BILLED_NET']};
    const before=trade.readPan515TradeState({root:f.root,projection:req}),stockBefore=trade.readPan515TradeState({root:f.root,projection:stockRequest()}),original=trade.readPan515TradeState({root:f.root}).fulfilment.promises[0];
    assert.equal(typeof before.questionDependencies,'object','native source must expose per-question dependencies rather than invalidating every answer by whole-ledger revision');
    apply(f.root,command('PROMISE',7,'PR-02',10,null,{effectiveAt:'2026-06-29T14:00:00Z',promise:{revision:2,kind:'CUSTOMER_RECEIPT',dueAt:'2026-07-01T23:59:59+02:00',previousPromiseDigest:original.promiseDigest,sourceReference:'SYN-CUSTOMER-PROMISE-02'}}));
    const after=trade.readPan515TradeState({root:f.root,projection:req}),stockAfter=trade.readPan515TradeState({root:f.root,projection:stockRequest()});
    for(const q of ['ORDER_SOURCE','DISPATCH_TIMELINESS','BILLED_NET'])assert.equal(after.questionDependencies[q],before.questionDependencies[q],q+' must not be invalidated by an unrelated customer-promise change');
    assert.notEqual(after.questionDependencies.CUSTOMER_RECEIPT_TIMELINESS,before.questionDependencies.CUSTOMER_RECEIPT_TIMELINESS);assert.deepEqual(stockAfter.questionDependencies,stockBefore.questionDependencies);
    assert.equal(after.facts.customerReceiptOnTimeQuantity.state,'UNAVAILABLE');assert.equal(after.provenance.customerReceiptPromise.revision,2);assert.equal(after.provenance.dispatchOriginalPromise.revision,1);
    assert.notEqual(after.projectionDigest,before.projectionDigest,'whole snapshot identity still binds the actual new native source revision');
  }finally{f.close();}
});

test('P06 original foreign-position plus closed SQL credential role and currency negatives leave actual source rows unchanged',async()=>{
  const f=await nativePartialShipment();
  try{
    const before=nativeRows(f.root,'SELECT command,event FROM pan515_events ORDER BY revision');
    for(const [changes,pattern] of [[{orderId:'SO-99'},/PAN520_COMPOSITE_SOURCE_GRAIN_DENIED/],[{tenantId:'SYN-TENANT-99'},/PAN520_COMPOSITE_SOURCE_GRAIN_DENIED/],[{currency:'USD'},/PAN520_COMPOSITE_SOURCE_GRAIN_DENIED/],[{unit:'KG'},/PAN520_COMPOSITE_SOURCE_GRAIN_DENIED/]])assert.throws(()=>trade.readPan515TradeState({root:f.root,projection:{...stockRequest(),scope:{...stockRequest().scope,...changes}}}),pattern);
    for(const key of ['sql','credentials','role','approved','capabilities'])assert.throws(()=>trade.readPan515TradeState({root:f.root,projection:{...stockRequest(),[key]:'caller-supplied-not-authority'}}),/PAN520_PROJECTION_REQUEST_SHAPE_DENIED/);
    assert.throws(()=>trade.readPan515TradeState({root:f.root,projection:{...stockRequest(),questions:['SELECT * FROM private_source']}}),/PAN520_QUESTION_NOT_ADMITTED_DENIED/);
    let calls=0;assert.throws(()=>trade.readPan515TradeState({root:f.root,projection:{...stockRequest(),profile:{toString(){calls++;return 'STOCK';}}}}),/PAN520_PROFILE_NOT_IMPLEMENTED_DENIED/);assert.equal(calls,0);
    assert.deepEqual(nativeRows(f.root,'SELECT command,event FROM pan515_events ORDER BY revision'),before);
  }finally{f.close();}
});

test('P06 opaque plans reject cloned handles and plans rather than trusting portable caller metadata',async()=>{
  const f=await nativePartialShipment();
  try{
    const {plan,handle}=trade.capturePan520ProjectionPlan({root:f.root,owner,projection:stockRequest()});
    assert.throws(()=>trade.executePan520ProjectionRead({root:f.root,plan,handle:{}}),/PAN520_OPAQUE_CONTENT_BOUND_PLAN_REQUIRED_DENIED/);
    assert.throws(()=>trade.executePan520ProjectionRead({root:f.root,plan:JSON.parse(JSON.stringify(plan)),handle}),/PAN520_OPAQUE_CONTENT_BOUND_PLAN_REQUIRED_DENIED/);
    assert.equal(trade.executePan520ProjectionRead({root:f.root,plan,handle}).facts.reserved.value,2);
  }finally{f.close();}
});

test('P06 actual later issue and quarantined return retain the original June stock cutoff and produce July1/0/1/0 without dispatch repairing OTIF',async()=>{
  const f=await nativePartialShipment();
  try{
    apply(f.root,command('PICK',7,'PK-02',2,'RS-01',{effectiveAt:'2026-07-02T10:00:00Z'}));
    apply(f.root,command('PACK',8,'PA-02',2,'PK-02',{effectiveAt:'2026-07-02T11:00:00Z'}));
    apply(f.root,command('ISSUE',9,'SH-02',2,'PA-02',{reservationId:'RS-01',reservationEventId:'RC-02',dispatchNoteId:'DN-02',physicalEvidenceId:'EV-02',promiseRevision:1,effectiveAt:common.shipments[1].dispatched_at}));
    apply(f.root,command('RETURN_RECEIPT',10,'RT-01',1,'SH-01',{physicalEvidenceId:'EV-03',effectiveAt:common.returns[0].at}));
    const june=trade.readPan515TradeState({root:f.root,asOf:'2026-06-30T23:59:59+02:00',projection:stockRequest()}),july=trade.readPan515TradeState({root:f.root,asOf:'2026-07-31T23:59:59+02:00',projection:stockRequest()});
    assert.deepEqual(['physical','reserved','quarantined','free'].map(k=>june.facts[k].value),[2,2,0,0]);assert.deepEqual(['physical','reserved','quarantined','free'].map(k=>july.facts[k].value),[1,0,1,0]);
    assert.equal(june.snapshot.nativeRevision,7);assert.equal(july.snapshot.nativeRevision,11);
    const metric=trade.readPan515TradeState({root:f.root,projection:{...stockRequest(),profile:'O2C',questions:['DISPATCH_TIMELINESS','CUSTOMER_RECEIPT_TIMELINESS']}});
    assert.equal(metric.facts.totalIssuedQuantity.value,10);assert.equal(metric.facts.onTimeDispatchedQuantity.value,8);assert.equal(metric.facts.dispatchPositionOtif.state,'KNOWN');assert.equal(metric.facts.dispatchPositionOtif.value,false);assert.equal(metric.facts.customerReceiptOnTimeQuantity.state,'UNAVAILABLE');
  }finally{f.close();}
});
