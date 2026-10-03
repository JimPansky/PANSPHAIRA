import assert from 'node:assert/strict';
import test from 'node:test';
import {nativeTradeFixture,nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
const trade=await import('../../src/pan515/trade-state.mjs').catch(error=>{
  if(error.code==='ERR_MODULE_NOT_FOUND')return {};
  throw error;
});
const command=(patch={})=>({schemaVersion:'pansphaira.pan515/trade-command/v1',effectId:'synthetic:receipt-01',transportId:'synthetic:transport-01',expectedRevision:0,orderId:'synthetic:order-42',lineId:'synthetic:line-1',articleId:'SYN-ART-001',warehouseId:'LAGER-01',unit:'STK',kind:'RECEIPT',quantity:10,referenceId:null,effectiveAt:'2026-10-03T10:00:00Z',reason:'Synthetic goods receipt',...patch});
const execute=(root,c)=>trade.executePan515TradeCommand({root,command:c,grant:trade.authorizePan515TradeCommand({root,command:c,owner:'LOCAL_SYNTHETIC_OWNER'})});
test('P01 AC1/AC2 actual receipt movement retains stable evidence and quantity revision; changed transport ID cannot duplicate a movement',async()=>{
  assert.equal(typeof trade.executePan515TradeCommand,'function','missing native trade command writer');
  const f=await nativeTradeFixture();
  try{
    trade.initializePan515TradeState({root:f.root,owner:'LOCAL_SYNTHETIC_OWNER'});
    const first=execute(f.root,command());
    assert.equal(first.outcome,'COMMITTED');
    assert.equal(first.receipt.revision,1);
    assert.equal(first.receipt.effectId,'synthetic:receipt-01');
    const replay=execute(f.root,command({transportId:'synthetic:transport-retry'}));
    assert.equal(replay.outcome,'RECONCILED_NO_DUPLICATE');
    assert.deepEqual(replay.receipt,first.receipt);
    const observed=trade.readPan515TradeState({root:f.root});
    assert.deepEqual(observed.quantities,{physical:10,reserved:0,blocked:0,available:10,shipped:0,returned:0});
    assert.equal(observed.revision,1);
    const raw=nativeRows(f.root,'SELECT revision,effect_key,command,event FROM pan515_events');
    assert.equal(raw.length,1);
    assert.equal(raw[0].effect_key,'synthetic:receipt-01');
    const event=JSON.parse(raw[0].event);
    assert.equal(event.orderId,'synthetic:order-42');
    assert.equal(event.movementId,'synthetic:receipt-01');
    assert.equal(event.unit,'STK');
    assert.equal(event.beforeRevision,0);
    assert.equal(event.revision,1);
    assert.equal(JSON.parse(raw[0].command).reason,'Synthetic goods receipt');
  }finally{f.close();}
});
test('P01 AC1 reservation binds the native order to receipt quantities without losing available stock',async()=>{
  const f=await nativeTradeFixture();
  try{
    trade.initializePan515TradeState({root:f.root,owner:'LOCAL_SYNTHETIC_OWNER'});
    execute(f.root,command());
    const c=command({effectId:'synthetic:reserve-01',transportId:'synthetic:reserve-request',expectedRevision:1,kind:'RESERVE',quantity:6,reason:'Own native order reservation'});
    assert.equal(execute(f.root,c).outcome,'COMMITTED');
    const s=trade.readPan515TradeState({root:f.root});
    assert.deepEqual(s.quantities,{physical:10,reserved:6,blocked:0,available:4,shipped:0,returned:0});
    assert.deepEqual(s.reservations,[{id:'synthetic:reserve-01',orderId:'synthetic:order-42',lineId:'synthetic:line-1',remaining:6,allocations:[{lotId:'synthetic:receipt-01',quantity:6}]}]);
    assert.equal(s.stock.positions[0].reserviert,6);
    assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS n FROM pan515_events')[0].n,2);
  }finally{f.close();}
});
test('P01 AC3 historical receipt correction is a forward movement preserving later reservation/shipment and original evidence',async()=>{
  const f=await nativeTradeFixture();
  try{
    trade.initializePan515TradeState({root:f.root,owner:'LOCAL_SYNTHETIC_OWNER'});
    execute(f.root,command());
    execute(f.root,command({effectId:'synthetic:reserve-correction',transportId:'synthetic:reserve-corr-request',expectedRevision:1,kind:'RESERVE',quantity:6,reason:'Later valid reservation'}));
    execute(f.root,command({effectId:'synthetic:ship-correction',transportId:'synthetic:ship-corr-request',expectedRevision:2,kind:'SHIP',quantity:2,referenceId:'synthetic:reserve-correction',reservationEventId:'synthetic:reservation-release-corr',reason:'Later valid shipment'}));
    const retained=nativeRows(f.root,'SELECT event FROM pan515_events ORDER BY revision').map(r=>r.event);
    execute(f.root,command({effectId:'synthetic:correction-01',transportId:'synthetic:correction-request',expectedRevision:3,kind:'CORRECT_RECEIPT',quantity:8,referenceId:'synthetic:receipt-01',effectiveAt:'2026-10-03T10:01:00Z',reason:'Earlier receipt overstated by two pieces'}));
    const s=trade.readPan515TradeState({root:f.root});
    assert.deepEqual(s.quantities,{physical:6,reserved:4,blocked:0,available:2,shipped:2,returned:0});
    assert.deepEqual(nativeRows(f.root,'SELECT event FROM pan515_events WHERE revision<=3 ORDER BY revision').map(r=>r.event),retained);
    assert.equal(s.reservations[0].remaining,4);assert.equal(s.shipments[0].quantity,2);
    assert.equal(s.events.at(-1).movementDelta,-2);
    assert.equal(s.events.at(-1).correctionOf,s.events[0].eventDigest);
  }finally{f.close();}
});
test('P01 AC3 physical count difference appends a reason-bearing signed movement instead of overwriting retained receipt or reservations',async()=>{
  const f=await nativeTradeFixture();
  try{
    trade.initializePan515TradeState({root:f.root,owner:'LOCAL_SYNTHETIC_OWNER'});execute(f.root,command());
    execute(f.root,command({effectId:'synthetic:reserve-count',transportId:'synthetic:reserve-count-request',expectedRevision:1,kind:'RESERVE',quantity:6,reason:'Reservation before inventory count'}));
    const retained=nativeRows(f.root,'SELECT event FROM pan515_events ORDER BY revision').map(r=>r.event);
    execute(f.root,command({effectId:'synthetic:physical-count-01',transportId:'synthetic:count-request',expectedRevision:2,kind:'COUNT_ADJUSTMENT',quantity:9,referenceId:'synthetic:receipt-01',effectiveAt:'2026-10-03T10:02:00Z',reason:'Owned physical recount observed nine pieces'}));
    const s=trade.readPan515TradeState({root:f.root});
    assert.deepEqual(s.quantities,{physical:9,reserved:6,blocked:0,available:3,shipped:0,returned:0});
    assert.equal(s.events.at(-1).movementDelta,-1);
    assert.equal(s.events.at(-1).quantity,9);
    assert.equal(s.events.at(-1).reason,'Owned physical recount observed nine pieces');
    assert.equal(s.lots[0].received,10,'original accepted receipt quantity remains ten');
    assert.deepEqual(nativeRows(f.root,'SELECT event FROM pan515_events WHERE revision<=2 ORDER BY revision').map(r=>r.event),retained);
  }finally{f.close();}
});
test('P01 physical zero-count is a legitimate reason-bearing inventory difference when no later allocation is erased',async()=>{
  const f=await nativeTradeFixture();try{
    trade.initializePan515TradeState({root:f.root,owner:'LOCAL_SYNTHETIC_OWNER'});execute(f.root,command());
    execute(f.root,command({effectId:'synthetic:empty-count',transportId:'synthetic:empty-count-request',expectedRevision:1,kind:'COUNT_ADJUSTMENT',quantity:0,referenceId:'synthetic:receipt-01',reason:'Owned recount observed an empty lot'}));
    const s=trade.readPan515TradeState({root:f.root});assert.equal(s.quantities.physical,0);assert.equal(s.quantities.available,0);assert.equal(s.events.at(-1).movementDelta,-10);assert.equal(s.events[0].quantity,10);
  }finally{f.close();}
});
test('P01 AC1 native leading trade state binds the existing order, line and partner; no inventory inferred from order quantity',async()=>{
  assert.equal(typeof trade.initializePan515TradeState,'function','missing native trade initialization on the existing PAN472/PAN473 product path');
  const f=await nativeTradeFixture();
  try{
    const result=trade.initializePan515TradeState({root:f.root,owner:'LOCAL_SYNTHETIC_OWNER'});
    assert.equal(result.outcome,'INITIALIZED');
    assert.equal(result.binding.orderId,'synthetic:order-42');
    assert.equal(result.binding.lineId,'synthetic:line-1');
    assert.equal(result.binding.partnerId,'synthetic:customer-7');
    assert.equal(result.binding.unit,'STK');
    assert.equal(result.binding.orderQuantity,6);
    assert.equal(result.binding.leadingStore,'PAN472_TARGET_SQLITE');
    assert.equal(result.binding.caseId,'PAN515-LEGACY-DRAFT-06');
    const observed=trade.readPan515TradeState({root:f.root});
    assert.equal(observed.revision,0);
    assert.deepEqual(observed.quantities,{physical:0,reserved:0,blocked:0,available:0,shipped:0,returned:0});
    assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS n FROM pan515_events')[0].n,0);
    assert.equal(nativeRows(f.root,"SELECT body FROM objects WHERE id='synthetic:line-1'")[0].body.includes('6000000'),true);
  }finally{f.close();}
});
