import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
import common from '../../contracts/trade/common-trade-01-v1.json' with {type:'json'};
const cli=new URL('../../scripts/run-pan515-trade-state.mjs',import.meta.url);
const run=(...args)=>{const r=spawnSync(process.execPath,[cli.pathname,...args],{encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stdout+'\n'+r.stderr);return JSON.parse(r.stdout);};
test('P01 actual public CLI prepares the existing native COMMON target and replays all identical source events before fresh-process cutoff readback',()=>{
  const parent=mkdtempSync(join(process.env.TMPDIR,'pan515-cli-')),root=join(parent,'pan472-owned-v1');
  try{
    const init=run('prepare','--root',root,'--owner','LOCAL_SYNTHETIC_OWNER','--case','COMMON-TRADE-01');assert.equal(init.binding.orderQuantity,10);assert.equal(init.binding.caseId,common.id);
    const first=common.receipts[0],input=join(parent,'one-real-command.json');
    writeFileSync(input,JSON.stringify({schemaVersion:'pansphaira.pan515/trade-command/v1',effectId:first.id,transportId:'synthetic:external-cli-request',expectedRevision:0,orderId:common.sales_order.id,lineId:common.sales_order.line_id,articleId:common.scope.item_id,warehouseId:common.scope.warehouse_id,unit:common.scope.quantity_unit,kind:'RECEIPT',quantity:first.accepted_quantity,referenceId:first.po_id,sourceLineId:first.po_line_id,effectiveAt:first.accepted_at,reason:'COMMON-TRADE-01 native RECEIPT'}));
    assert.equal(run('write','--root',root,'--owner','LOCAL_SYNTHETIC_OWNER','--input',input).outcome,'COMMITTED');
    const applied=run('apply-common','--root',root,'--owner','LOCAL_SYNTHETIC_OWNER');assert.equal(applied.revision,6);assert.equal(applied.receipts[0].outcome,'RECONCILED_NO_DUPLICATE');
    const june=run('read','--root',root,'--as-of','2026-06-30T23:59:59+02:00'),july=run('read','--root',root,'--as-of','2026-07-31T23:59:59+02:00');
    assert.deepEqual({physical:june.quantities.physical,reserved:june.quantities.reserved,quarantined:june.quantities.blocked,free:june.quantities.available},common.expected.stock_2026_06_30);
    assert.deepEqual({physical:july.quantities.physical,reserved:july.quantities.reserved,quarantined:july.quantities.blocked,free:july.quantities.available},common.expected.stock_2026_07_31);
    const immutable=nativeRows(root,'SELECT * FROM pan515_events ORDER BY revision');
    const retry=run('apply-common','--root',root,'--owner','LOCAL_SYNTHETIC_OWNER');assert.equal(retry.revision,6);assert.deepEqual(nativeRows(root,'SELECT * FROM pan515_events ORDER BY revision'),immutable);
    assert.deepEqual(july.events.map(e=>e.effectId),['GR-01','GR-02','RS-01','SH-01','SH-02','RET-01']);
    for(const s of common.shipments){const e=july.events.find(e=>e.effectId===s.id),rc=common.reservation_events.find(rc=>rc.cause_shipment===s.id);assert.equal(e.effectiveAt,s.dispatched_at);assert.deepEqual(e.reservationChange,{id:rc.id,delta:rc.delta,causeShipment:rc.cause_shipment,orderId:rc.order_id,lineId:rc.line_id});assert.equal(rc.at,e.effectiveAt);}
    assert.equal(july.events.find(e=>e.effectId==='RS-01').reason,common.reservation_events[0].cause);
    const before=nativeRows(root,'SELECT * FROM pan515_events ORDER BY revision');
    const bad=spawnSync(process.execPath,[cli.pathname,'read','--root',root,'--unknown-option','x'],{encoding:'utf8',timeout:30000});assert.equal(bad.status,2);assert.equal(JSON.parse(bad.stdout).outcome,'DENIED');assert.deepEqual(nativeRows(root,'SELECT * FROM pan515_events ORDER BY revision'),before);
    assert.equal(run('stop','--root',root,'--owner','LOCAL_SYNTHETIC_OWNER','--reason','Retain this exact qualified history').outcome,'TRANSITIONS_DISABLED_RETAINED');
    assert.equal(run('read','--root',root).writeMode,'DISABLED_RETAINED');
    const refused=spawnSync(process.execPath,[cli.pathname,'write','--root',root,'--owner','LOCAL_SYNTHETIC_OWNER','--input',input],{encoding:'utf8',timeout:30000});assert.equal(refused.status,2);assert.equal(JSON.parse(refused.stdout).code,'PAN515_TRANSITIONS_DISABLED_RETAINED_DENIED');
    assert.deepEqual(nativeRows(root,'SELECT * FROM pan515_events ORDER BY revision'),immutable);
  }finally{rmSync(parent,{recursive:true,force:true});}
});
