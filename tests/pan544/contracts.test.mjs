import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {browserFixture544,invoiceId544} from './browser-fixture.mjs';
const entry=new URL('../../dist/packages/contracts/src/workspace-notifications-v1.js',import.meta.url);
test('PUI-03 UIDOD02 versioned closed runtime contract consumes actual native feed, selector and open/read receipts',async()=>{
  const f=await browserFixture544();
  try{
    assert.ok(existsSync(entry),'PAN544_TYPED_RUNTIME_NOTIFICATION_CONTRACT_NOT_IMPLEMENTED');
    const v=await import(entry);const raw=JSON.parse(JSON.stringify(f.service.feed(f.approver)));
    const feed=v.validateWorkspaceNotificationsFeedV1(raw,'tenant-a');assert.equal(feed.events[0].status,'OPEN');assert.equal(Object.isFrozen(feed.events[0].target.params),true);
    const e=feed.events[0],selector={schemaVersion:'pansphaira.workspace-notifications/open/v1',eventId:e.eventId,eventRevision:e.eventRevision};
    assert.deepEqual(v.validateWorkspaceNotificationSelectorV1(selector,'open'),selector);
    const opened=v.validateWorkspaceNotificationOpenV1(f.service.open(f.approver,selector),e,'tenant-a');assert.equal(opened.invoice.invoiceId,invoiceId544);
    const marked=f.service.markRead(f.approver,{...selector,schemaVersion:'pansphaira.workspace-notifications/mark-read/v1'});assert.equal(v.validateWorkspaceNotificationReadV1(marked,e,false).read,true);
    const readback=f.service.reconcileRead(f.approver,{...selector,schemaVersion:'pansphaira.workspace-notifications/reconcile-read/v1'});assert.equal(v.validateWorkspaceNotificationReadV1(readback,e,true).read,true);
    for(const bad of [{...raw,url:'https://outside.test/'},{...raw,executionAuthorityGranted:true},{...raw,tenantId:'tenant-b'},{...raw,events:[{...e,html:'<script>run()</script>'}]},{...raw,events:[{...e,target:{...e.target,params:{...e.target.params,revision:'1'}}}]},{...raw,events:[{...e,target:{...e.target,url:'https://outside.test/'}}]}])assert.throws(()=>v.validateWorkspaceNotificationsFeedV1(bad,'tenant-a'),/NOTIFICATION_CONTRACT_DENIED/);
    for(const extra of [{action:'APPROVE_LOCAL_EVIDENCE_ONLY'},{authority:'APPROVER'},{url:'https://outside.test/'}])assert.throws(()=>v.validateWorkspaceNotificationSelectorV1({...selector,...extra},'open'),/NOTIFICATION_CONTRACT_DENIED/);
    const getter={...raw};Object.defineProperty(getter,'events',{enumerable:true,get(){throw new Error('UNTRUSTED_GETTER_INVOKED');}});assert.throws(()=>v.validateWorkspaceNotificationsFeedV1(getter,'tenant-a'),/NOTIFICATION_CONTRACT_DENIED/);
    assert.throws(()=>v.validateWorkspaceNotificationOpenV1({...opened,taskState:'APPROVED'},e,'tenant-a'),/NOTIFICATION_CONTRACT_DENIED/);
    assert.throws(()=>v.validateWorkspaceNotificationReadV1({...marked,eventRevision:e.eventRevision+1},e,false),/NOTIFICATION_CONTRACT_DENIED/);
  }finally{await f.close();}
});
