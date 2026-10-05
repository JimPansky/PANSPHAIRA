import test from 'node:test';
import assert from 'node:assert/strict';
import * as native from '../../src/pan515/trade-state.mjs';
import * as scope from '../../src/pan473/writer-scope-cutover.mjs';
import {nativeTradeFixture,nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
import {productionConfiguration,productionReport} from '../fixtures/pan523/native-production-fixture.mjs';
test('P09 real authorized native order-line revision after production began invalidates a preissued report grant without rewriting confirmed movement history',async()=>{
 const f=await nativeTradeFixture();try{
  const owner='LOCAL_SYNTHETIC_OWNER';native.initializePan515TradeState({root:f.root,owner});native.initializePan523ProductionState({root:f.root,owner,configuration:productionConfiguration()});const b=native.readPan515TradeState({root:f.root}).binding,c=productionReport(b);native.executePan515TradeCommand({root:f.root,command:c,grant:native.authorizePan515TradeCommand({root:f.root,owner,command:c})});
  const next=productionReport(b,{effectId:'synthetic:production-02',transportId:'synthetic:production-transport-02',expectedRevision:1,expectedProductionRevision:1,quantity:3,goodQuantity:3,scrapQuantity:0,effectiveAt:'2026-10-05T11:00:00Z',final:true}),grant=native.authorizePan515TradeCommand({root:f.root,owner,command:next});
  const before=nativeRows(f.root,'SELECT * FROM pan523_events'),leading=nativeRows(f.root,'SELECT * FROM pan515_events'),line=nativeRows(f.root,"SELECT body FROM objects WHERE id='synthetic:line-1'")[0];
  const nativeGrant=scope.authorizePan473TargetWrite({root:f.root,epoch:b.targetEpoch,owner});scope.writePan473Target({root:f.root,epoch:b.targetEpoch,grant:nativeGrant,changes:[{id:'synthetic:line-1',kind:'line',revision:2,deleted:false,body:{...JSON.parse(line.body),priceMinor:1300}}]});
  assert.throws(()=>native.readPan523ProductionState({root:f.root}),/PAN523_STABLE_NATIVE_BINDING_DRIFT_DENIED/);
  assert.throws(()=>native.executePan515TradeCommand({root:f.root,command:next,grant}),/PAN523_STABLE_NATIVE_BINDING_DRIFT_DENIED/);
  assert.deepEqual(nativeRows(f.root,'SELECT * FROM pan523_events'),before);assert.deepEqual(nativeRows(f.root,'SELECT * FROM pan515_events'),leading);
 }finally{f.close();}
});
