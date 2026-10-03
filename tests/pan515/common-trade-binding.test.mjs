import assert from 'node:assert/strict';
import test from 'node:test';
import * as trade from '../../src/pan515/trade-state.mjs';
import {nativeTradeFixture,nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
import common from '../../contracts/trade/common-trade-01-v1.json' with {type:'json'};
test('P01 AC5 COMMON binding is the published ten-piece source with explicit native order/line/article/warehouse mapping, not the legacy six-piece label',async()=>{
  const f=await nativeTradeFixture({common:true});
  try{
    const r=trade.initializePan515TradeState({root:f.root,owner:'LOCAL_SYNTHETIC_OWNER',caseId:'COMMON-TRADE-01'});
    assert.equal(r.binding.caseId,common.id);
    assert.equal(r.binding.orderQuantity,common.sales_order.quantity);
    assert.equal(r.binding.articleId,common.scope.item_id);
    assert.equal(r.binding.warehouseId,common.scope.warehouse_id);
    assert.equal(r.binding.orderId,common.sales_order.id);
    assert.equal(r.binding.lineId,common.sales_order.line_id);
    assert.deepEqual(r.binding.nativeIdentityMapping,{nativeOrderId:'synthetic:order-42',nativeLineId:'synthetic:line-1',nativePartnerId:'synthetic:customer-7',stockArticleId:'SYN-ART-001',stockWarehouseId:'LAGER-01',canonicalOrderId:'SO-01',canonicalLineId:'1',canonicalItemId:'ARTICLE-A',canonicalWarehouseId:'WH-01',sourceId:'SYN-COMMON',tenantId:'SYN-TENANT-01',entityId:'SYN-ENTITY-01'});
    assert.equal(r.binding.commonReferenceRevision,1);
    assert.equal(r.binding.nativeQuantityRevision,1);
    const order=JSON.parse(nativeRows(f.root,"SELECT body FROM objects WHERE id='synthetic:order-42'")[0].body),line=JSON.parse(nativeRows(f.root,"SELECT body FROM objects WHERE id='synthetic:line-1'")[0].body);
    assert.equal(order.date,1767225600,'unchanged PAN472 synthetic draft guard remains in force');
    assert.equal(r.binding.nativeDateMapping.nativeDateSeconds,order.date);
    assert.equal(r.binding.nativeDateMapping.canonicalAcceptedAt,common.sales_order.accepted_at);
    assert.equal(r.binding.nativeDateMapping.nativeDateIsBusinessAcceptance,false,'the legacy scaffold timestamp is not relabelled as COMMON business time');
    assert.equal(order.amountMinor,common.sales_order.quantity*common.sales_order.unit_net_minor);
    assert.equal(line.priceMinor,common.sales_order.unit_net_minor);
  }finally{f.close();}
});
