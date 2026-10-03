import assert from 'node:assert/strict';
import test from 'node:test';
import {nativeTradeFixture,nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
import * as trade from '../../src/pan515/trade-state.mjs';
import common from '../../contracts/trade/common-trade-01-v1.json' with {type:'json'};
const owner='LOCAL_SYNTHETIC_OWNER';
const promise=(patch={},p={})=>({schemaVersion:'pansphaira.pan517/fulfilment-command/v1',effectId:'PR-01',transportId:'synthetic:date-test',expectedRevision:0,orderId:'SO-01',lineId:'1',articleId:'ARTICLE-A',warehouseId:'WH-01',unit:'STK',kind:'PROMISE',quantity:10,referenceId:null,effectiveAt:common.sales_order.accepted_at,reason:'Real calendar instant integrity test',...patch,promise:{revision:1,kind:'DISPATCH',dueAt:common.sales_order.promised_dispatch_at,previousPromiseDigest:null,sourceReference:'COMMON-TRADE-01.sales_order',...p}});
const apply=(root,c)=>trade.executePan515TradeCommand({root,command:c,grant:trade.authorizePan515TradeCommand({root,command:c,owner})});
const bad=['2026-02-30T10:00:00Z','2026-06-31T10:00:00Z','2025-02-29T10:00:00Z','2026-13-01T10:00:00Z','2026-07-01T24:00:00Z','2026-07-01T12:60:00Z','2026-07-01T12:00:60Z','2026-07-01T12:00:00+24:00','2026-07-01T12:00:00+02:60'];
test('P03 AC4 Main impossible calendar date and overflow clocks/offsets are denied before any native event mutation',async()=>{
  const f=await nativeTradeFixture({common:true});
  try{
    trade.initializePan515TradeState({root:f.root,owner,caseId:common.id});
    for(const value of bad){
      assert.throws(()=>apply(f.root,promise({effectiveAt:value})),/PAN517_REAL_EVENT_INSTANT_REQUIRED_DENIED/,value);
      assert.equal(nativeRows(f.root,'SELECT event FROM pan515_events').length,0,value);
    }
    apply(f.root,promise());const state=trade.readPan515TradeState({root:f.root}),hash=state.fulfilment.promises[0].promiseDigest;
    for(const value of bad){
      assert.throws(()=>apply(f.root,promise({effectId:'PR-02',expectedRevision:1,effectiveAt:'2026-06-21T10:00:00Z'},{revision:2,previousPromiseDigest:hash,dueAt:value,sourceReference:'SYN-REVISED-DUE-02'})),/PAN517_REAL_PROMISE_INSTANT_REQUIRED_DENIED/,value);
      assert.deepEqual(trade.readPan515TradeState({root:f.root}),state,value);
    }
  }finally{f.close();}
});
test('P03 AC4 valid UTC and numeric-offset instants including real leap day remain admitted and preserve literal event/promise time',async()=>{
  const f=await nativeTradeFixture({common:true});
  try{
    trade.initializePan515TradeState({root:f.root,owner,caseId:common.id});
    const p=promise({effectiveAt:'2026-06-20T08:00:00Z'},{dueAt:'2026-06-30T21:59:59Z'});assert.equal(apply(f.root,p).outcome,'COMMITTED');
    const s=trade.readPan515TradeState({root:f.root}),digest=s.fulfilment.promises[0].promiseDigest;
    const next=promise({effectId:'PR-02',expectedRevision:1,effectiveAt:'2026-06-21T05:00:00-05:00'},{revision:2,previousPromiseDigest:digest,kind:'CUSTOMER_RECEIPT',dueAt:'2028-02-29T23:59:59+05:30',sourceReference:'SYN-LEAP-DAY-PROMISE'});
    assert.equal(apply(f.root,next).outcome,'COMMITTED');
    const after=trade.readPan515TradeState({root:f.root});assert.equal(after.events[1].effectiveAt,next.effectiveAt);assert.equal(after.fulfilment.promises[1].dueAt,next.promise.dueAt);
  }finally{f.close();}
});
