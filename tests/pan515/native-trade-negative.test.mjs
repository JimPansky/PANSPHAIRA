import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import * as trade from '../../src/pan515/trade-state.mjs';
import {nativeTradeFixture,nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
const c=(patch={})=>({schemaVersion:'pansphaira.pan515/trade-command/v1',effectId:'synthetic:receipt-01',transportId:'synthetic:first-request',expectedRevision:0,orderId:'synthetic:order-42',lineId:'synthetic:line-1',articleId:'SYN-ART-001',warehouseId:'LAGER-01',unit:'STK',kind:'RECEIPT',quantity:6,referenceId:null,effectiveAt:'2026-10-03T10:00:00Z',reason:'Owned negative-case receipt',...patch});
const exec=(root,command)=>trade.executePan515TradeCommand({root,command,grant:trade.authorizePan515TradeCommand({root,command,owner:'LOCAL_SYNTHETIC_OWNER'})});
const unchanged=(root,command,pattern)=>{const before=nativeRows(root,'SELECT * FROM pan515_events ORDER BY revision');assert.throws(()=>exec(root,command),pattern);assert.deepEqual(nativeRows(root,'SELECT * FROM pan515_events ORDER BY revision'),before);};
for(const [name,patch,code] of [
  ['stale revision',{effectId:'synthetic:receipt-stale',expectedRevision:0},/PAN515_STALE_REVISION_DENIED/],
  ['unit change',{effectId:'synthetic:receipt-unit',expectedRevision:1,unit:'KG'},/PAN515_UNIT_CHANGE_DENIED/],
  ['changed content under the same effect identity',{transportId:'synthetic:second-request',quantity:7},/PAN515_EFFECT_CONTENT_CONFLICT_DENIED/],
  ['reservation larger than usable stock',{effectId:'synthetic:reserve-overflow',expectedRevision:1,kind:'RESERVE',quantity:7},/PAN515_RESERVATION_EXCEEDS_USABLE_STOCK_DENIED/],
  ['foreign order',{effectId:'synthetic:foreign-order',expectedRevision:1,orderId:'synthetic:order-999'},/PAN515_COMPOSITE_NATIVE_IDENTITY_DENIED/],
  ['shipment without an actual reservation',{effectId:'synthetic:unreserved-ship',expectedRevision:1,kind:'SHIP',quantity:1,referenceId:'synthetic:missing-reserve',reservationEventId:'synthetic:missing-release'},/PAN515_SHIPMENT_RESERVATION_REQUIRED_DENIED/],
  ['return without an actual shipment',{effectId:'synthetic:unshipped-return',expectedRevision:1,kind:'RETURN',quantity:1,referenceId:'synthetic:missing-shipment',disposition:'QUARANTINE',creditRef:'synthetic:credit-source'},/PAN515_RETURN_EXCEEDS_ACTUAL_SHIPMENT_DENIED/],
  ['backdated overwrite',{effectId:'synthetic:backdated-correction',expectedRevision:1,kind:'CORRECT_RECEIPT',quantity:5,referenceId:'synthetic:receipt-01',effectiveAt:'2026-10-03T09:59:59Z'},/PAN515_BACKDATED_OVERWRITE_DENIED/],
  ['empty inventory reason',{effectId:'synthetic:count-reason',expectedRevision:1,kind:'COUNT_ADJUSTMENT',quantity:5,referenceId:'synthetic:receipt-01',reason:''},/PAN515_COMMAND_SHAPE_DENIED/],
])test('P01 native negative: '+name+' leaves all retained movements byte-identical',async()=>{
  const f=await nativeTradeFixture();try{trade.initializePan515TradeState({root:f.root,owner:'LOCAL_SYNTHETIC_OWNER'});exec(f.root,c());unchanged(f.root,c(patch),code);}finally{f.close();}
});
test('P01 native negative: historical correction cannot consume later valid reservation or shipment',async()=>{
  const f=await nativeTradeFixture();try{
    trade.initializePan515TradeState({root:f.root,owner:'LOCAL_SYNTHETIC_OWNER'});exec(f.root,c());
    exec(f.root,c({effectId:'synthetic:reserved-six',expectedRevision:1,kind:'RESERVE',quantity:6}));
    exec(f.root,c({effectId:'synthetic:shipped-two',expectedRevision:2,kind:'SHIP',quantity:2,referenceId:'synthetic:reserved-six',reservationEventId:'synthetic:release-two'}));
    unchanged(f.root,c({effectId:'synthetic:unsafe-correction',expectedRevision:3,kind:'CORRECT_RECEIPT',quantity:5,referenceId:'synthetic:receipt-01'}),/PAN515_CORRECTION_WOULD_OVERWRITE_LATER_VALID_WORK_DENIED/);
    const s=trade.readPan515TradeState({root:f.root});assert.equal(s.quantities.shipped,2);assert.equal(s.quantities.reserved,4);assert.equal(s.revision,3);
  }finally{f.close();}
});
test('P01 native negative: a shipment reservation-change ID cannot become a second physical movement identity',async()=>{
  const f=await nativeTradeFixture();try{
    trade.initializePan515TradeState({root:f.root,owner:'LOCAL_SYNTHETIC_OWNER'});exec(f.root,c());
    exec(f.root,c({effectId:'synthetic:reserve-identity',expectedRevision:1,kind:'RESERVE',quantity:6}));
    exec(f.root,c({effectId:'synthetic:ship-identity',expectedRevision:2,kind:'SHIP',quantity:2,referenceId:'synthetic:reserve-identity',reservationEventId:'synthetic:release-identity'}));
    unchanged(f.root,c({effectId:'synthetic:release-identity',transportId:'synthetic:other-transport',expectedRevision:3,quantity:1}),/PAN515_RESERVATION_CHANGE_ID_REUSED_DENIED/);
  }finally{f.close();}
});
test('P01 native negative: forged authority and immutable-history overwrites fail closed',async()=>{
  const f=await nativeTradeFixture();try{
    trade.initializePan515TradeState({root:f.root,owner:'LOCAL_SYNTHETIC_OWNER'});
    assert.throws(()=>trade.executePan515TradeCommand({root:f.root,command:c(),grant:{owner:'LOCAL_SYNTHETIC_OWNER'}}),/PAN515_CONTENT_BOUND_AUTHORITY_REQUIRED_DENIED/);exec(f.root,c());
    const db=new DatabaseSync(join(f.root,'target.sqlite'));try{for(const sql of ['UPDATE pan515_events SET event=event','DELETE FROM pan515_events','UPDATE pan515_binding SET binding=binding','DELETE FROM pan515_binding'])assert.throws(()=>db.exec(sql),/PAN515_HISTORY_IMMUTABLE_DENIED/);}finally{db.close();}
    assert.equal(trade.readPan515TradeState({root:f.root}).revision,1);
  }finally{f.close();}
});
