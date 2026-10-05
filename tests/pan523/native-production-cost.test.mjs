import test from 'node:test';
import assert from 'node:assert/strict';
import * as native from '../../src/pan515/trade-state.mjs';
import {nativeTradeFixture} from '../fixtures/pan515/native-trade-fixture.mjs';
import {productionConfiguration,productionReport} from '../fixtures/pan523/native-production-fixture.mjs';
const owner='LOCAL_SYNTHETIC_OWNER';
function apply(root,c){return native.executePan515TradeCommand({root,command:c,grant:native.authorizePan515TradeCommand({root,owner,command:c})});}
test('P09 AC2 aggregate operative cost compares declared valuation, actual quantities and confirmed minutes, including scrap',async()=>{
 const f=await nativeTradeFixture();try{
  native.initializePan515TradeState({root:f.root,owner});native.initializePan523ProductionState({root:f.root,owner,configuration:productionConfiguration()});
  const b=native.readPan515TradeState({root:f.root}).binding;
  apply(f.root,productionReport(b));let p=native.readPan523ProductionState({root:f.root});
  assert.deepEqual(p.costComparison,{status:'PARTIAL_OPERATIVE',currency:'EUR',valuationVersion:'synthetic-standard-v1',plannedMinor:486,standardProcessedMinor:243,actualMinor:245,varianceMinor:2,processedQuantity:3,goodQuantity:2,scrapQuantity:1,financialProfit:false});
  apply(f.root,productionReport(b,{effectId:'synthetic:production-02',transportId:'synthetic:production-transport-02',expectedRevision:1,expectedProductionRevision:1,quantity:3,goodQuantity:3,scrapQuantity:0,resources:[{resourceId:'ASSEMBLY',minutes:4}],effectiveAt:'2026-10-05T11:00:00Z',final:true}));p=native.readPan523ProductionState({root:f.root});
  assert.deepEqual(p.costComparison,{status:'FINAL_OPERATIVE',currency:'EUR',valuationVersion:'synthetic-standard-v1',plannedMinor:486,standardProcessedMinor:486,actualMinor:489,varianceMinor:3,processedQuantity:6,goodQuantity:5,scrapQuantity:1,financialProfit:false});
 }finally{f.close();}
});
