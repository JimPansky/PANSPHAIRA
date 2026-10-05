import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import * as native from '../../src/pan515/trade-state.mjs';
import {nativeTradeFixture,nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
import {productionConfiguration,productionReport} from '../fixtures/pan523/native-production-fixture.mjs';
async function setup(){const f=await nativeTradeFixture();native.initializePan515TradeState({root:f.root,owner:'LOCAL_SYNTHETIC_OWNER'});native.initializePan523ProductionState({root:f.root,owner:'LOCAL_SYNTHETIC_OWNER',configuration:productionConfiguration()});return f;}
const snapshot=root=>({trade:native.readPan515TradeState({root}),production:native.readPan523ProductionState({root}),tradeRows:nativeRows(root,'SELECT * FROM pan515_events'),productionRows:nativeRows(root,'SELECT * FROM pan523_events')});
function run(root,command){const grant=native.authorizePan515TradeCommand({root,owner:'LOCAL_SYNTHETIC_OWNER',command});return native.executePan515TradeCommand({root,command,grant});}

for(const [name,mutate,denial] of [
 ['negative Materialmenge',c=>({...c,materials:[{itemId:'A',quantity:-6},c.materials[1]]}),/PAN523_MATERIAL_QUANTITY_DENIED/],
 ['unbekannter Kostensatz',c=>({...c,resources:[{resourceId:'UNKNOWN',minutes:5}]}),/PAN523_UNKNOWN_RESOURCE_RATE_DENIED/],
 ['Stücklistenrevision nach Beginn geändert',c=>({...c,bomVersion:'KIT-V2'}),/PAN523_FROZEN_BOM_OR_VALUATION_REVISION_DENIED/],
 ['Ausschuss als Gutmenge',c=>({...c,quantity:3}),/PAN523_GOOD_SCRAP_QUANTITY_DENIED/],
])test('P09 original negative '+name+' leaves both coupled native histories/stock unchanged',async()=>{
 const f=await setup();try{const before=snapshot(f.root);const c=mutate(productionReport(before.trade.binding));assert.throws(()=>run(f.root,c),denial);assert.deepEqual(snapshot(f.root),before);}finally{f.close();}
});

test('P09 original new-event overreport after partial cannot double production or bypass stable order bounds',async()=>{
 const f=await setup();try{
  const first=productionReport(native.readPan515TradeState({root:f.root}).binding);run(f.root,first);const before=snapshot(f.root);
  const c=productionReport(before.trade.binding,{effectId:'synthetic:production-02',transportId:'synthetic:production-transport-02',expectedRevision:1,expectedProductionRevision:1,quantity:4,goodQuantity:4,scrapQuantity:0,materials:[{itemId:'A',quantity:8},{itemId:'B',quantity:12}],final:true});
  assert.throws(()=>run(f.root,c),/PAN523_ORDER_REPORT_QUANTITY_BOUND_DENIED/);assert.deepEqual(snapshot(f.root),before);
 }finally{f.close();}
});

test('P09 actual SQL insert failure rolls the existing leading receipt and all production effects back in one native transaction',async()=>{
 const f=await setup();try{
  const before=snapshot(f.root),command=productionReport(before.trade.binding);const db=new DatabaseSync(join(f.root,'target.sqlite'));
  try{db.exec("CREATE TRIGGER pan523_test_fail_insert BEFORE INSERT ON pan523_events BEGIN SELECT RAISE(ABORT,'PAN523_TEST_NATIVE_INSERT_FAIL'); END;");}finally{db.close();}
  assert.throws(()=>run(f.root,command),/PAN523_TEST_NATIVE_INSERT_FAIL/);assert.deepEqual(snapshot(f.root),before);
  const cleanup=new DatabaseSync(join(f.root,'target.sqlite'));try{cleanup.exec('DROP TRIGGER pan523_test_fail_insert');}finally{cleanup.close();}
  assert.equal(run(f.root,command).outcome,'COMMITTED');assert.equal(snapshot(f.root).trade.quantities.physical,2);
 }finally{f.close();}
});

test('P09 partial transport retry reconciles exact same report; final report consumes remaining material once with good and scrap separate',async()=>{
 const f=await setup();try{
  const first=productionReport(native.readPan515TradeState({root:f.root}).binding),receipt=run(f.root,first).receipt;
  const before=snapshot(f.root),retry=run(f.root,{...first,transportId:'synthetic:production-transport-retry'});
  assert.equal(retry.outcome,'RECONCILED_NO_DUPLICATE');assert.deepEqual(retry.receipt,receipt);assert.deepEqual(snapshot(f.root),before);
  const final=productionReport(before.trade.binding,{effectId:'synthetic:production-02',transportId:'synthetic:production-transport-02',expectedRevision:1,expectedProductionRevision:1,quantity:3,goodQuantity:3,scrapQuantity:0,resources:[{resourceId:'ASSEMBLY',minutes:4}],effectiveAt:'2026-10-05T11:00:00Z',final:true});
  assert.equal(run(f.root,final).outcome,'COMMITTED');const after=snapshot(f.root);
  assert.equal(after.production.processedQuantity,6);assert.equal(after.production.goodQuantity,5);assert.equal(after.production.scrapQuantity,1);assert.equal(after.trade.quantities.physical,5);
  assert.equal(after.production.stock.positions[0].physisch,0);assert.equal(after.production.stock.positions[1].physisch,0);assert.equal(after.production.events.length,2);assert.equal(after.tradeRows.length,2);
 }finally{f.close();}
});
