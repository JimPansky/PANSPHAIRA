import test from 'node:test';
import assert from 'node:assert/strict';
import * as trade from '../../src/pan515/trade-state.mjs';
import {nativeTradeFixture,nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
import {productionConfiguration,productionReport} from '../fixtures/pan523/native-production-fixture.mjs';
import common from '../../contracts/trade/common-trade-01-v1.json' with {type:'json'};
const owner='LOCAL_SYNTHETIC_OWNER';
function apply(root,c){return trade.executePan515TradeCommand({root,command:c,grant:trade.authorizePan515TradeCommand({root,owner,command:c})});}
const fulfil=(kind,revision,id,quantity,referenceId,effectiveAt,extra={})=>({schemaVersion:'pansphaira.pan517/fulfilment-command/v1',effectId:id,transportId:'synthetic:transport-'+id.toLowerCase(),expectedRevision:revision,orderId:'SO-01',lineId:'1',articleId:'ARTICLE-A',warehouseId:'WH-01',unit:'STK',kind,quantity,referenceId,effectiveAt,reason:'Explicit separate synthetic manufacturing provenance',...extra});
test('P09 AC4 newly produced native stock enters the existing real P03 pick/pack/dispatch path without a fake purchase receipt or changed COMMON reference',async()=>{
 const f=await nativeTradeFixture({common:true});try{
  trade.initializePan515TradeState({root:f.root,owner,caseId:common.id});const b=trade.readPan515TradeState({root:f.root}).binding,c=productionConfiguration();
  c.orderQuantity=10;c.bom.version='ARTICLE-A-ASSEMBLY-V1';c.openingStock[0].physisch=20;c.openingStock[1].physisch=30;for(const p of c.openingStock)p.herkunft.beobachtetAm='2026-06-25T00:00:00Z';
  trade.initializePan523ProductionState({root:f.root,owner,configuration:c});
  apply(f.root,fulfil('PROMISE',0,'PR-01',10,null,common.sales_order.accepted_at,{promise:{revision:1,kind:'DISPATCH',dueAt:common.sales_order.promised_dispatch_at,previousPromiseDigest:null,sourceReference:'COMMON-TRADE-01.sales_order'}}));
  apply(f.root,productionReport(b,{expectedRevision:1,quantity:8,goodQuantity:8,scrapQuantity:0,bomVersion:c.bom.version,materials:[{itemId:'A',quantity:16},{itemId:'B',quantity:24}],resources:[{resourceId:'ASSEMBLY',minutes:8}],effectiveAt:'2026-06-27T10:00:00Z'}));
  apply(f.root,{...fulfil('RESERVE',2,'RS-01',8,null,'2026-06-28T10:00:00Z'),schemaVersion:'pansphaira.pan515/trade-command/v1'});
  apply(f.root,fulfil('PICK',3,'PK-01',8,'RS-01','2026-06-29T10:00:00Z'));
  apply(f.root,fulfil('PACK',4,'PA-01',8,'PK-01','2026-06-29T11:00:00Z'));
  apply(f.root,fulfil('ISSUE',5,'SH-01',8,'PA-01',common.shipments[0].dispatched_at,{reservationId:'RS-01',reservationEventId:'RC-01',dispatchNoteId:'DN-01',physicalEvidenceId:'EV-01',promiseRevision:1}));
  const native=trade.readPan515TradeState({root:f.root}),production=trade.readPan523ProductionState({root:f.root});
  assert.equal(native.quantities.shipped,8);assert.equal(native.quantities.physical,0);assert.equal(native.fulfilment.deliveryNotes[0].shipmentId,'SH-01');
  assert.deepEqual(native.shipments[0].allocations.map(a=>({lotId:a.lotId,quantity:a.quantity})),[{lotId:'synthetic:production-01',quantity:8}]);
  assert.equal(production.goodQuantity,8);assert.equal(nativeRows(f.root,"SELECT * FROM pan515_events WHERE json_extract(event,'$.kind')='RECEIPT'").length,0);
  assert.equal(native.binding.commonReferenceDigest,b.commonReferenceDigest);assert.equal(production.financialValuationQualified,false);
 }finally{f.close();}
});
