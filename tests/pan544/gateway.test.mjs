import assert from 'node:assert/strict';
import test from 'node:test';
import {browserFixture544,invoiceId544} from './browser-fixture.mjs';
import {nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
import {readLocalJournalTaskIdentity} from '../../demo/runtime/local-journal-owner.mjs';
import {join} from 'node:path';
import {enableWorkspaceBrowserV1} from '../../src/pan541/workspace-browser.mjs';
import {validateWorkspaceNotificationsFeedV1} from '../../dist/packages/contracts/src/workspace-notifications-v1.js';
test('PUI-03 AC01-04 real same-ingress notification feed resolves the native invoice and persists only personal read state',async()=>{
  const f=await browserFixture544();let workspace;
  try{
    const options={optIn:true,gateway:f.tls.gateway,tenantId:'tenant-a',origin:f.tls.origin,nativeReader:f.nativeReader,notifications:f.service};
    assert.doesNotThrow(()=>{workspace=enableWorkspaceBrowserV1(options);},'PAN544_PROTECTED_SAME_INGRESS_NOTIFICATION_OWNER_NOT_IMPLEMENTED');
    const leadingBefore=JSON.stringify(nativeRows(f.native.root,'SELECT * FROM pan542_events ORDER BY ordinal')),tasks=readLocalJournalTaskIdentity(join(f.native.root,'pan453-owned-v2'));
    const first=await f.request('');assert.equal(first.status,200);assert.equal(first.tlsAuthorized,true);
    const feed=validateWorkspaceNotificationsFeedV1(JSON.parse(first.body),'tenant-a');assert.equal(feed.events.length,1);const e=feed.events[0];
    const selector={schemaVersion:'pansphaira.workspace-notifications/open/v1',eventId:e.eventId,eventRevision:e.eventRevision};
    const open=await f.request('/open','POST',selector);assert.equal(open.status,200);assert.equal(JSON.parse(open.body).invoice.invoiceId,invoiceId544);
    assert.equal(nativeRows(f.native.root,'SELECT COUNT(*) AS count FROM pan544_read')[0].count,0);
    const read=await f.request('/read','POST',{...selector,schemaVersion:'pansphaira.workspace-notifications/mark-read/v1'});assert.equal(read.status,200);assert.equal(JSON.parse(read.body).newTaskEffect,false);
    const reconcile=await f.request('/reconcile','POST',{...selector,schemaVersion:'pansphaira.workspace-notifications/reconcile-read/v1'});assert.equal(reconcile.status,200);assert.equal(JSON.parse(reconcile.body).outcome,'READ_CONFIRMED');
    const prefs=await f.request('/preferences','POST',{schemaVersion:'pansphaira.workspace-notifications/preferences-write/v1',expectedRevision:0,preferences:{inAppEnabled:true,filter:'UNREAD',subscriptions:['ERV_LOCAL_EVIDENCE_APPROVAL_REQUIRED']}});assert.equal(prefs.status,200);
    assert.equal(JSON.parse((await f.request('')).body).events.length,0);assert.equal(nativeRows(f.native.root,'SELECT COUNT(*) AS count FROM pan544_read')[0].count,1);
    assert.equal(JSON.stringify(nativeRows(f.native.root,'SELECT * FROM pan542_events ORDER BY ordinal')),leadingBefore);assert.deepEqual(readLocalJournalTaskIdentity(join(f.native.root,'pan453-owned-v2')),tasks);
    workspace.close();workspace=null;assert.equal((await f.request('')).status,404);
  }finally{workspace?.close();await f.close();}
});
