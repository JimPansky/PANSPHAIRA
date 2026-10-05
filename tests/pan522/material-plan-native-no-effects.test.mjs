import test from 'node:test';
import assert from 'node:assert/strict';
import reference from '../fixtures/pan522/pan-material-reference-v1.json' with {type:'json'};
import * as material from '../../src/pan522/material-plan.mjs';
import * as trade from '../../src/pan515/trade-state.mjs';
import {nativeTradeFixture,nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';

test('P08 proposal and MRP-only disable leave real native orders, stock and movement history untouched; copied proposal is not a grant',async()=>{
  const f=await nativeTradeFixture();try{
    trade.initializePan515TradeState({root:f.root,owner:'LOCAL_SYNTHETIC_OWNER'});
    const command={schemaVersion:'pansphaira.pan515/trade-command/v1',effectId:'synthetic:receipt-p08',transportId:'synthetic:request-p08',expectedRevision:0,orderId:'synthetic:order-42',lineId:'synthetic:line-1',articleId:'SYN-ART-001',warehouseId:'LAGER-01',unit:'STK',kind:'RECEIPT',quantity:6,referenceId:null,effectiveAt:'2026-10-05T10:00:00Z',reason:'Independent owned P08 no-effects witness'};
    trade.executePan515TradeCommand({root:f.root,command,grant:trade.authorizePan515TradeCommand({root:f.root,command,owner:'LOCAL_SYNTHETIC_OWNER'})});
    const before={objects:nativeRows(f.root,'SELECT * FROM objects ORDER BY id'),events:nativeRows(f.root,'SELECT * FROM pan515_events ORDER BY revision'),state:trade.readPan515TradeState({root:f.root})};
    const proposals=material.planMaterialRequirements(reference);assert.equal(proposals.executionAuthorized,false);assert.equal(proposals.capacityQualified,false);
    assert.throws(()=>trade.executePan515TradeCommand({root:f.root,command,grant:proposals}),/PAN515_CONTENT_BOUND_AUTHORITY_REQUIRED_DENIED/);
    assert.equal(typeof material.materialProposalView,'function','PAN522_MRP_ONLY_DISABLE_NOT_IMPLEMENTED');
    const disabled=material.materialProposalView(reference,'DISABLED');assert.equal(disabled.outcome,'MATERIAL_PROPOSALS_DISABLED');assert.deepEqual(disabled.proposals,[]);assert.equal(disabled.executionAuthorized,false);assert.equal(disabled.capacityQualified,false);
    assert.deepEqual(material.materialProposalView(reference,'ENABLED'),proposals);
    const after={objects:nativeRows(f.root,'SELECT * FROM objects ORDER BY id'),events:nativeRows(f.root,'SELECT * FROM pan515_events ORDER BY revision'),state:trade.readPan515TradeState({root:f.root})};
    assert.deepEqual(after,before);assert.equal(after.state.writeMode,'ENABLED');
  }finally{f.close();}
});
