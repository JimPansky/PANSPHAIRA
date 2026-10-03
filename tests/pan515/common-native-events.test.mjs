import assert from 'node:assert/strict';
import test from 'node:test';
import * as trade from '../../src/pan515/trade-state.mjs';
import {nativeTradeFixture,nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
import common from '../../contracts/trade/common-trade-01-v1.json' with {type:'json'};
const make=(revision,record,kind,quantity,date,extra={})=>({schemaVersion:'pansphaira.pan515/trade-command/v1',effectId:record.id,transportId:'synthetic:common-'+record.id.toLowerCase(),expectedRevision:revision,orderId:common.sales_order.id,lineId:common.sales_order.line_id,articleId:common.scope.item_id,warehouseId:common.scope.warehouse_id,unit:common.scope.quantity_unit,kind,quantity,referenceId:null,effectiveAt:date,reason:'COMMON-TRADE-01 native '+kind,...extra});
const exec=(root,c)=>trade.executePan515TradeCommand({root,command:c,grant:trade.authorizePan515TradeCommand({root,command:c,owner:'LOCAL_SYNTHETIC_OWNER'})});
export function receiveAndReserveCommon(root){
  let revision=0;
  for(const r of common.receipts)exec(root,make(revision++,r,'RECEIPT',r.accepted_quantity,r.accepted_at,{referenceId:r.po_id,sourceLineId:r.po_line_id}));
  const r=common.reservation_events[0];exec(root,make(revision++,r,'RESERVE',r.delta,r.at));return revision;
}
export {make,exec};
test('P01 AC5 actual July shipment and quarantined return preserve both published month cutoffs from the same immutable native events',async()=>{
  const f=await nativeTradeFixture({common:true});
  try{
    trade.initializePan515TradeState({root:f.root,owner:'LOCAL_SYNTHETIC_OWNER',caseId:common.id});
    let revision=receiveAndReserveCommon(f.root);
    for(const s of common.shipments){const rc=common.reservation_events.find(r=>r.cause_shipment===s.id);exec(f.root,make(revision++,s,'SHIP',s.quantity,s.dispatched_at,{referenceId:'RS-01',reservationEventId:rc.id}));}
    const r=common.returns[0];exec(f.root,make(revision,r,'RETURN',r.quantity,r.at,{referenceId:r.original_shipment_id,disposition:r.disposition,creditRef:r.credit_ref}));
    const june=trade.readPan515TradeState({root:f.root,asOf:'2026-06-30T23:59:59+02:00'}),july=trade.readPan515TradeState({root:f.root,asOf:'2026-07-31T23:59:59+02:00'});
    for(const [actual,expected] of [[june,common.expected.stock_2026_06_30],[july,common.expected.stock_2026_07_31]]){
      assert.deepEqual({physical:actual.quantities.physical,reserved:actual.quantities.reserved,quarantined:actual.quantities.blocked,free:actual.quantities.available},expected);
      for(const lot of actual.lots)assert.ok(lot.reserved+lot.blocked<=lot.physical);
    }
    assert.equal(june.revision,4);assert.equal(july.revision,6);
    assert.equal(july.quantities.shipped,10);assert.equal(july.quantities.returned,1);
    assert.equal(july.stock.positions[0].reserviert,1,'legacy stock bridge counts quarantine as unavailable, not a free item or another order reservation');
    assert.equal(july.events.at(-1).effectId,'RET-01');
    assert.equal(july.events.at(-1).referenceId,'SH-01');
    assert.equal(july.events.at(-1).disposition,'QUARANTINE');
    assert.equal(july.events.at(-1).creditRef,'CN-01');
    assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS n FROM pan515_events')[0].n,6,'cutoff reads create no extra movements');
    assert.deepEqual(july.events.filter(e=>e.reservationChange).map(e=>e.reservationChange.id),['RC-01','RC-02']);
  }finally{f.close();}
});
test('P01 AC5 common actual June receipt/reservation/shipment events yield the published disjoint cutoff quantities and stable RC-01 cause',async()=>{
  const f=await nativeTradeFixture({common:true});
  try{
    trade.initializePan515TradeState({root:f.root,owner:'LOCAL_SYNTHETIC_OWNER',caseId:common.id});
    const revision=receiveAndReserveCommon(f.root),s=common.shipments[0],rc=common.reservation_events.find(r=>r.cause_shipment===s.id);
    exec(f.root,make(revision,s,'SHIP',s.quantity,s.dispatched_at,{referenceId:common.reservation_events[0].id,reservationEventId:rc.id}));
    const observed=trade.readPan515TradeState({root:f.root}),expected=common.expected.stock_2026_06_30;
    assert.deepEqual(observed.quantities,{physical:expected.physical,reserved:expected.reserved,blocked:expected.quarantined,available:expected.free,shipped:8,returned:0});
    assert.equal(observed.revision,4);
    assert.deepEqual(observed.lots.map(l=>({id:l.id,physical:l.physical,reserved:l.reserved,blocked:l.blocked})),[{id:'GR-01',physical:0,reserved:0,blocked:0},{id:'GR-02',physical:2,reserved:2,blocked:0}]);
    const events=nativeRows(f.root,'SELECT event FROM pan515_events ORDER BY revision').map(r=>JSON.parse(r.event));
    assert.deepEqual(events.map(e=>e.effectId),['GR-01','GR-02','RS-01','SH-01']);
    assert.equal(events[0].quantity,common.receipts[0].accepted_quantity);
    assert.equal(events[1].quantity,common.receipts[1].accepted_quantity);
    assert.equal(events[0].effectiveAt,common.receipts[0].accepted_at);
    assert.equal(events[0].referenceId,'PO-01');
    assert.equal(events[0].sourceLineId,'1');
    assert.deepEqual(events[3].reservationChange,{id:'RC-01',delta:-8,causeShipment:'SH-01',orderId:'SO-01',lineId:'1'});
    assert.equal(events[3].effectiveAt,common.shipments[0].dispatched_at);
  }finally{f.close();}
});
