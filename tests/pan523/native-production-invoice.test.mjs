import test from 'node:test';
import assert from 'node:assert/strict';
import * as trade from '../../src/pan515/trade-state.mjs';
import {producedDispatchFixture,apply,invoiceReference,fulfil} from '../fixtures/pan523/produced-dispatch-fixture.mjs';
import {productionReport} from '../fixtures/pan523/native-production-fixture.mjs';
import {nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
import common from '../../contracts/trade/common-trade-01-v1.json' with {type:'json'};
test('P09 AC4 actual native produced dispatch links explicit operative invoice references and closes contribution without fiscal or balance-sheet-profit authority',async()=>{
 const f=await producedDispatchFixture();try{
  const originalRows=nativeRows(f.root,'SELECT command,event FROM pan515_events ORDER BY revision');
  const c=invoiceReference();assert.equal(apply(f.root,c).outcome,'COMMITTED');let p=trade.readPan523ProductionState({root:f.root});
  assert.equal(p.invoices.length,1);assert.equal(p.operativeContribution.revenueMinor,80000);assert.equal(p.operativeContribution.costMinor,648);assert.equal(p.operativeContribution.contributionMinor,79352);assert.equal(p.operativeContribution.financialProfit,false);assert.equal(p.operativeContribution.fiscalInvoiceQualified,false);
  const before=trade.readPan515TradeState({root:f.root});assert.equal(apply(f.root,{...c,transportId:'synthetic:operative-invoice-retry'}).outcome,'RECONCILED_NO_DUPLICATE');assert.deepEqual(trade.readPan515TradeState({root:f.root}),before);
  apply(f.root,productionReport(f.b,{effectId:'synthetic:production-02',transportId:'synthetic:production-transport-02',expectedRevision:7,expectedProductionRevision:1,quantity:2,goodQuantity:2,scrapQuantity:0,bomVersion:f.configuration.bom.version,materials:[{itemId:'A',quantity:4},{itemId:'B',quantity:6}],resources:[{resourceId:'ASSEMBLY',minutes:2}],effectiveAt:'2026-06-30T11:00:00Z',final:true}));
  assert.equal(trade.readPan523ProductionState({root:f.root}).operativeContribution.contributionMinor,null,'unbilled finished quantity is not hidden by full-cost allocation or implicit invoice facts');
  apply(f.root,{...fulfil('RESERVE',8,'RS-02',2,null,'2026-07-01T10:00:00Z'),schemaVersion:'pansphaira.pan515/trade-command/v1'});
  apply(f.root,fulfil('PICK',9,'PK-02',2,'RS-02','2026-07-02T10:00:00Z'));apply(f.root,fulfil('PACK',10,'PA-02',2,'PK-02','2026-07-02T11:00:00Z'));
  apply(f.root,fulfil('ISSUE',11,'SH-02',2,'PA-02',common.shipments[1].dispatched_at,{reservationId:'RS-02',reservationEventId:'RC-02',dispatchNoteId:'DN-02',physicalEvidenceId:'EV-02',promiseRevision:1}));
  apply(f.root,invoiceReference({effectId:'synthetic:operative-invoice-02',transportId:'synthetic:operative-invoice-transport-02',expectedRevision:12,expectedProductionRevision:2,quantity:2,referenceId:'SH-02',effectiveAt:'2026-07-03T10:00:00Z',invoice:{documentId:'AR-02',documentLineId:'1',invoiceDate:'2026-07-03',netMinor:20000,currency:'EUR'}}));p=trade.readPan523ProductionState({root:f.root});
  assert.deepEqual(p.operativeContribution,{status:'FINAL_OPERATIVE_CONTRIBUTION',currency:'EUR',revenueMinor:100000,costMinor:810,contributionMinor:99190,invoicedQuantity:10,goodQuantity:10,basis:'NATIVE_PRODUCED_DISPATCH_AND_EXPLICIT_OPERATIVE_INVOICE_REFERENCES',fiscalInvoiceQualified:false,financialProfit:false});
  const after=trade.readPan515TradeState({root:f.root});assert.equal(after.quantities.physical,0);assert.equal(after.quantities.shipped,10);assert.equal(after.revision,13);assert.equal(p.invoices.length,2);assert.equal(p.events.length,2);
  assert.deepEqual(nativeRows(f.root,'SELECT command,event FROM pan515_events WHERE revision<=6 ORDER BY revision'),originalRows);
 }finally{f.close();}
});
