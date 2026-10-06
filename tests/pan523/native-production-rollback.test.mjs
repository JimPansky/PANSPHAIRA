import test from 'node:test';
import assert from 'node:assert/strict';
import * as native from '../../src/pan515/trade-state.mjs';
import {nativeTradeFixture,nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
import {productionConfiguration,productionReport} from '../fixtures/pan523/native-production-fixture.mjs';
const owner='LOCAL_SYNTHETIC_OWNER';
test('P09 specific fallback blocks fresh reports and a pre-disable grant without erasing confirmed material/finished movements or stopping original P01 work',async()=>{
 const f=await nativeTradeFixture();try{
  native.initializePan515TradeState({root:f.root,owner});native.initializePan523ProductionState({root:f.root,owner,configuration:productionConfiguration()});
  const b=native.readPan515TradeState({root:f.root}).binding,first=productionReport(b);native.executePan515TradeCommand({root:f.root,command:first,grant:native.authorizePan515TradeCommand({root:f.root,owner,command:first})});
  const next=productionReport(b,{effectId:'synthetic:production-02',transportId:'synthetic:production-transport-02',expectedRevision:1,expectedProductionRevision:1,quantity:3,goodQuantity:3,scrapQuantity:0,resources:[{resourceId:'ASSEMBLY',minutes:4}],effectiveAt:'2026-10-05T11:00:00Z',final:true}),grant=native.authorizePan515TradeCommand({root:f.root,owner,command:next});
  const rows=nativeRows(f.root,'SELECT * FROM pan515_events'),productionRows=nativeRows(f.root,'SELECT * FROM pan523_events'),before=native.readPan523ProductionState({root:f.root});
  assert.equal(typeof native.deactivatePan523ProductionReports,'function','confirmed production exists but new reports have no scoped disable/retain operator');
  assert.throws(()=>native.deactivatePan523ProductionReports({root:f.root,owner:'caller-role',reason:'unauthorized'}),/PAN523_LOCAL_SYNTHETIC_OWNER_AND_REASON_REQUIRED_DENIED/);
  assert.equal(native.deactivatePan523ProductionReports({root:f.root,owner,reason:'Disable only new synthetic production reports'}).outcome,'PRODUCTION_REPORTS_DISABLED_RETAINED');
  assert.throws(()=>native.executePan515TradeCommand({root:f.root,command:next,grant}),/PAN523_NEW_REPORTS_DISABLED_RETAINED_DENIED/);
  const after=native.readPan523ProductionState({root:f.root});assert.equal(after.writeMode,'DISABLED_RETAINED');assert.deepEqual(after.events,before.events);assert.deepEqual(after.stock,before.stock);assert.deepEqual(nativeRows(f.root,'SELECT * FROM pan515_events'),rows);assert.deepEqual(nativeRows(f.root,'SELECT * FROM pan523_events'),productionRows);
  const c={schemaVersion:'pansphaira.pan515/trade-command/v1',effectId:'synthetic:other-receipt-01',transportId:'synthetic:other-receipt-transport-01',expectedRevision:1,orderId:b.orderId,lineId:b.lineId,articleId:b.articleId,warehouseId:b.warehouseId,unit:b.unit,kind:'RECEIPT',quantity:1,referenceId:null,effectiveAt:'2026-10-05T12:00:00Z',reason:'Original P01 remains enabled with explicit other receipt'};
  assert.equal(native.executePan515TradeCommand({root:f.root,command:c,grant:native.authorizePan515TradeCommand({root:f.root,owner,command:c})}).outcome,'COMMITTED');assert.deepEqual(native.readPan523ProductionState({root:f.root}).events,before.events);
 }finally{f.close();}
});
