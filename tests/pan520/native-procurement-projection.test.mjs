import assert from 'node:assert/strict';
import test from 'node:test';
import {nativeTradeFixture,nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
import * as trade from '../../src/pan515/trade-state.mjs';
import * as purchase from '../../src/procurement-434/bestellung-lifecycle.mjs';
import {evaluatePan516ProcurementLiability} from '../../src/procurement-434/bestellung-liability.mjs';
import common from '../../contracts/trade/common-trade-01-v1.json' with {type:'json'};

const owner='LOCAL_SYNTHETIC_OWNER';
const order={bestellungId:'bestellung:pan516-common',lieferantId:'lieferant:synthetic-01',bestellungZeitstempel:'2026-06-20T08:00:00Z',positionen:[{positionId:'position:common-01',artikelId:'EINK-ART-A01',einheit:'STK',waehrung:'EUR',bestellteMenge:common.purchase_order.quantity,berechneteMengeMinor:null}]};
const terms={unitPriceMinor:common.purchase_order.unit_net_minor,currency:'EUR',unit:'STK',promisedAt:common.purchase_order.promised_acceptance_at};
const command=(kind,revision,suffix,receipt=null)=>({schemaVersion:'pansphaira.pan516/procurement-command/v1',effectId:'synthetic:p06-'+suffix,transportId:'synthetic:p06-transport-'+suffix,expectedRevision:revision,orderId:order.bestellungId,positionId:order.positionen[0].positionId,supplierId:order.lieferantId,kind,receipt,sourceReference:'synthetic:p06-source-'+suffix});
const apply=(root,c)=>purchase.executePan516ProcurementCommand({root,command:c,grant:purchase.authorizePan516ProcurementCommand({root,command:c,owner})});
async function receivedPurchase({confirmed=true}={}){
  const f=await nativeTradeFixture({common:true});
  try{
    trade.initializePan515TradeState({root:f.root,owner,caseId:common.id});
    purchase.initializePan516Procurement({root:f.root,owner,purchase:order,terms});
    apply(f.root,command('APPROVE',0,'approve'));
    if(confirmed)apply(f.root,{...command('CONFIRM',1,'confirm'),confirmation:{revision:1,previousConfirmationDigest:null,terms,confirmedAt:'2026-06-21T08:00:00Z'}});
    for(const [i,r] of common.receipts.entries())apply(f.root,command('ACCEPT_RECEIPT',i+(confirmed?2:1),'receipt-'+i,{id:'wareneingang:p06-gr-'+i,quantity:r.accepted_quantity,unit:'STK',acceptedAt:new Date(r.accepted_at).toISOString().replace('.000Z','Z')}));
    return f;
  }catch(error){f.close();throw error;}
}
const request=()=>({schemaVersion:'pansphaira.pan520/projection-request/v1',profile:'P2P',scope:{sourceId:'SYN-COMMON',tenantId:'SYN-TENANT-01',entityId:'SYN-ENTITY-01',orderId:'PO-01',lineId:'1',articleId:'ARTICLE-A',warehouseId:'WH-01',currency:'EUR',unit:'STK'},questions:['PROCUREMENT_QUANTITY','PROCUREMENT_PRICE_VARIANCE','PROCUREMENT_TIMELINESS']});

test('P06 native P2P aggregates two actual receipts before one-grain reused liability, exposes price2000 and original on-time quantity8',async()=>{
  const f=await receivedPurchase();
  try{
    const before=nativeRows(f.root,'SELECT command,event FROM pan516_events ORDER BY revision');
    const actual=evaluatePan516ProcurementLiability({root:f.root,invoiceId:'AP-01',expectedConfirmationRevision:1});
    assert.equal(actual.varianceMinor,2000);assert.equal(actual.acceptedQuantity,10);assert.equal(actual.invoiceGrainCount,1);assert.equal(actual.source.receiptEventDigests.length,2);
    const result=trade.readPan515TradeState({root:f.root,projection:request()});
    assert.equal(result.schemaVersion,'pansphaira.pan520/projection-snapshot/v1');assert.equal(result.profile,'P2P');assert.deepEqual(result.grain,request().scope);
    for(const [key,value] of Object.entries({orderedQuantity:10,acceptedQuantity:10,remainingQuantity:0,invoicedQuantity:10,invoiceAmountMinor:62000,expectedInvoiceNetMinor:60000,supplierPriceVarianceMinor:2000,onTimeAcceptedQuantity:8})){assert.equal(result.facts[key].state,'KNOWN',key);assert.equal(result.facts[key].value,value,key);}
    assert.equal(result.provenance.invoiceGrainCount,1);assert.equal(result.provenance.liabilityCoreOutcome,'CONFLICT');assert.equal(result.provenance.receiptEventDigests.length,2);
    assert.deepEqual(result.receiptFacts.map(r=>r.quantity),[8,2]);assert.deepEqual(result.receiptFacts.map(r=>r.promiseRevision),[1,1]);assert.deepEqual(result.receiptFacts.map(r=>r.promisedAt),[common.purchase_order.promised_acceptance_at,common.purchase_order.promised_acceptance_at]);
    assert.equal(result.readOnly,true);assert.equal(result.productiveAuthority,false);assert.deepEqual(nativeRows(f.root,'SELECT command,event FROM pan516_events ORDER BY revision'),before);
  }finally{f.close();}
});

test('P06 P2P missing confirmed price and promise hold only those questions while real accepted quantity remains known',async()=>{
  const f=await receivedPurchase({confirmed:false});
  try{
    const result=trade.readPan515TradeState({root:f.root,projection:request()});assert.equal(result.facts.acceptedQuantity.state,'KNOWN');assert.equal(result.facts.acceptedQuantity.value,10);
    assert.equal(result.facts.supplierPriceVarianceMinor.state,'UNAVAILABLE');assert.equal(result.facts.supplierPriceVarianceMinor.value,null);assert.equal(result.facts.supplierPriceVarianceMinor.reason,'MISSING_NATIVE_CONFIRMED_PRICE');
    assert.equal(result.facts.onTimeAcceptedQuantity.state,'UNAVAILABLE');assert.equal(result.facts.onTimeAcceptedQuantity.reason,'MISSING_NATIVE_CONFIRMED_PROMISE_AT_RECEIPT');assert.deepEqual(result.receiptFacts.map(r=>r.promiseRevision),[null,null]);
  }finally{f.close();}
});

test('P06 P2P cutoff excludes a later real receipt and does not invent a missing invoice business date for price history',async()=>{
  const f=await receivedPurchase();
  try{
    const result=trade.readPan515TradeState({root:f.root,asOf:'2026-06-25T23:59:59+02:00',projection:request()});assert.equal(result.facts.acceptedQuantity.value,8);assert.equal(result.facts.remainingQuantity.value,2);assert.equal(result.facts.onTimeAcceptedQuantity.value,8);assert.equal(result.receiptFacts.length,1);
    assert.equal(result.facts.supplierPriceVarianceMinor.state,'UNAVAILABLE');assert.equal(result.facts.supplierPriceVarianceMinor.reason,'MISSING_NATIVE_INVOICE_BUSINESS_DATE_FOR_HISTORICAL_PRICE_QUESTION');
  }finally{f.close();}
});

test('P06 original later-promise negative never repairs old receipt timeliness and invalidates only the new price-source revision',async()=>{
  const f=await receivedPurchase();
  try{
    const before=trade.readPan515TradeState({root:f.root,projection:request()}),native=purchase.readPan516Procurement({root:f.root}),rows=nativeRows(f.root,'SELECT event FROM pan516_events ORDER BY revision');
    apply(f.root,{...command('CONFIRM',native.revision,'later-promise'),confirmation:{revision:2,previousConfirmationDigest:native.confirmations[0].confirmationDigest,terms:{...terms,promisedAt:'2026-06-27T23:59:59+02:00'},confirmedAt:'2026-06-27T10:00:00Z'}});
    const after=trade.readPan515TradeState({root:f.root,projection:request()});assert.equal(after.facts.onTimeAcceptedQuantity.value,8);assert.deepEqual(after.receiptFacts.map(r=>r.promiseRevision),[1,1]);assert.deepEqual(after.receiptFacts.map(r=>r.promisedAt),[terms.promisedAt,terms.promisedAt]);
    assert.equal(after.questionDependencies.PROCUREMENT_QUANTITY,before.questionDependencies.PROCUREMENT_QUANTITY);assert.equal(after.questionDependencies.PROCUREMENT_TIMELINESS,before.questionDependencies.PROCUREMENT_TIMELINESS);assert.notEqual(after.questionDependencies.PROCUREMENT_PRICE_VARIANCE,before.questionDependencies.PROCUREMENT_PRICE_VARIANCE);
    assert.deepEqual(nativeRows(f.root,'SELECT event FROM pan516_events WHERE revision<=4 ORDER BY revision'),rows);assert.equal(after.facts.supplierPriceVarianceMinor.value,2000);
  }finally{f.close();}
});
