import test from 'node:test';
import assert from 'node:assert/strict';
import * as native from '../../src/pan515/trade-state.mjs';
import {nativeTradeFixture,nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
import {productionConfiguration,productionReport} from '../fixtures/pan523/native-production-fixture.mjs';

// Actual existing native target/owner and stock contract, not a schema-only or mock pass.
test('P09 AC1 starts a production binding at the existing native order revision with explicit stock and valuation facts',async()=>{
  const fixture=await nativeTradeFixture();
  try{
    native.initializePan515TradeState({root:fixture.root,owner:'LOCAL_SYNTHETIC_OWNER'});
    const before=native.readPan515TradeState({root:fixture.root});
    assert.equal(typeof native.initializePan523ProductionState,'function','PAN523_EXISTING_NATIVE_PRODUCTION_ENTRY_REQUIRED');
    const configuration=productionConfiguration();
    const initialized=native.initializePan523ProductionState({root:fixture.root,owner:'LOCAL_SYNTHETIC_OWNER',configuration});
    assert.equal(initialized.outcome,'INITIALIZED');
    assert.equal(initialized.binding.productionOrderId,'MO-01');
    assert.equal(initialized.binding.nativeQuantityRevision,before.binding.nativeQuantityRevision);
    assert.equal(initialized.binding.nativeBindingDigest.length,64);
    assert.equal(initialized.binding.configurationDigest.length,64);
    const production=native.readPan523ProductionState({root:fixture.root});
    assert.equal(production.processedQuantity,0);
    assert.equal(production.goodQuantity,0);
    assert.equal(production.scrapQuantity,0);
    assert.equal(production.stock.positions[0].physisch,12);
    assert.equal(production.stock.positions[1].physisch,18);
    assert.equal(nativeRows(fixture.root,'SELECT count(*) AS n FROM pan523_events')[0].n,0);
    assert.deepEqual(native.readPan515TradeState({root:fixture.root}),before);
    assert.throws(()=>native.initializePan523ProductionState({root:fixture.root,owner:'caller-role',configuration}),/PAN523_LOCAL_SYNTHETIC_OWNER_REQUIRED_DENIED/);
    assert.throws(()=>native.initializePan523ProductionState({root:fixture.root,owner:'LOCAL_SYNTHETIC_OWNER',configuration}),/PAN523_EXISTING_LEDGER_ADOPTION_DENIED/);
  }finally{fixture.close();}
});

test('P09 AC1/AC2/AC3 confirms materials, good/scrap and exact operative costs atomically in the existing leading stock transaction',async()=>{
  const fixture=await nativeTradeFixture();
  try{
    native.initializePan515TradeState({root:fixture.root,owner:'LOCAL_SYNTHETIC_OWNER'});
    native.initializePan523ProductionState({root:fixture.root,owner:'LOCAL_SYNTHETIC_OWNER',configuration:productionConfiguration()});
    const before=native.readPan515TradeState({root:fixture.root});
    const command=productionReport(before.binding);
    const grant=native.authorizePan515TradeCommand({root:fixture.root,owner:'LOCAL_SYNTHETIC_OWNER',command});
    const result=native.executePan515TradeCommand({root:fixture.root,command,grant});
    assert.equal(result.outcome,'COMMITTED');
    const after=native.readPan515TradeState({root:fixture.root});
    const production=native.readPan523ProductionState({root:fixture.root});
    assert.equal(after.quantities.physical,2);
    assert.equal(after.revision,1);
    assert.equal(production.processedQuantity,3);
    assert.equal(production.goodQuantity,2);
    assert.equal(production.scrapQuantity,1);
    assert.equal(production.stock.positions[0].physisch,6);
    assert.equal(production.stock.positions[1].physisch,9);
    assert.equal(production.stock.verlauf.length,2);
    assert.equal(production.events.length,1);
    assert.equal(production.events[0].tradeEventDigest,result.receipt.eventDigest);
    assert.equal(production.events[0].actualCost.materialMinor,240);
    assert.equal(production.events[0].actualCost.resourceMinor,5);
    assert.equal(production.events[0].actualCost.totalMinor,245);
    assert.equal(production.events[0].standardProcessedCostMinor,243);
    assert.equal(production.standardPlannedCostMinor,486);
    assert.equal(production.costStatus,'OPERATIVE_ONLY');
    assert.equal(production.financialValuationQualified,false);
    assert.equal(production.capacityQualified,false);
    assert.equal(after.events[0].productionEvidence.reportDigest,production.events[0].reportDigest);
    assert.equal(nativeRows(fixture.root,'SELECT count(*) AS n FROM pan523_events')[0].n,1);
    assert.equal(nativeRows(fixture.root,'SELECT count(*) AS n FROM pan515_events')[0].n,1);
  }finally{fixture.close();}
});

