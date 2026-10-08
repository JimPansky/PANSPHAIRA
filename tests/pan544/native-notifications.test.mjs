import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {financeFixture} from '../pan519/native-fixture.mjs';
import {nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
import {createProtectedSessionAdapterV1} from '../../src/pan527/origin-session-adapter.mjs';
import {initializeNativeErvHumanBackendV1,createNativeErvHumanBackendV1} from '../../src/pan542/native-human-backend.mjs';
import {readLocalJournalTaskIdentity} from '../../demo/runtime/local-journal-owner.mjs';
import * as procurement from '../../src/procurement-434/bestellung-lifecycle.mjs';
const entry=new URL('../../src/pan544/native-notifications.mjs',import.meta.url);
const notifications=existsSync(entry)?await import(entry):null;
// Synthetic session metadata, not an observed installer/image/provider/human identity.
const identity={schemaVersion:'pansphaira.portable-runtime/identity/v1',componentId:'pansphaira-local-demo',
  sourceCommit:'7ede1f3d788434a256055f588cbd2c3871adef19',sourceTree:'9cb931cec75b61727af7b287cbd5baccaf2a6272',
  imageDigest:'sha256:'+'a'.repeat(64),architecture:'x86_64',productVersion:'0.2.0-poc.20260810.5',
  runtime:{name:'node',version:'24.14.1'},contractVersion:'1.0.0',instanceId:'pan544-native-notifications-local',tenantId:'tenant-a',generation:1,
  configurationDigest:'b'.repeat(64),templateDigest:'c'.repeat(64),policyDigest:'d'.repeat(64),networkDigest:'e'.repeat(64),authorityProfile:'SAFE_GUIDED',
  effectiveRights:['demo.status.read','demo.provider.bound.read','demo.governed.effect']};
const invoiceId='AP-PAN516-MATCHED-01';
function issue(sessions,subjectId,role='reviewer'){
  const s=sessions.issueOwnerSession({subjectId,role,expiresAtMs:Date.now()+300000});
  return {cookie:s.cookieHeader,origin:sessions.origin,'x-pan527-csrf':s.csrf};
}
async function fixture(){
  const f=await financeFixture();
  try{
    const authRoot=join(f.parent,'notification-sessions');mkdirSync(authRoot,{mode:0o700});
    const sessions=createProtectedSessionAdapterV1({optIn:true,origin:'https://pan544.test:4443',identity,stateRoot:authRoot});
    initializeNativeErvHumanBackendV1({root:f.root,owner:'LOCAL_SYNTHETIC_OWNER',sessionBinding:sessions.binding});
    const human=createNativeErvHumanBackendV1({root:f.root,sessions});
    return {...f,authRoot,sessions,human,reviewer:issue(sessions,'synthetic:erv-reviewer'),approver:issue(sessions,'synthetic:erv-approver'),reader:issue(sessions,'synthetic:erv-reader','reader')};
  }catch(error){f.close();throw error;}
}
function command(proposal,action,id){return {schemaVersion:'pansphaira.erv-human/decision/v1',invoiceId:proposal.invoiceId,
  effectId:'synthetic:notification-'+id,transportId:'synthetic:notification-wire-'+id,
  expectedNativeRevision:proposal.nativeRevision,expectedProposalRevision:proposal.proposalRevision,proposalDigest:proposal.proposalDigest,action};}

test('PUI-03-AC01 native event source is the leading human event and immutable durable task, not a caller notification',async()=>{
  const f=await fixture();
  try{
    const before=f.human.read(f.reviewer,{invoiceId});
    const reviewed=f.human.decide(f.reviewer,command(before,'REVIEW','native-source-001'));
    assert.equal(typeof f.human.notificationSource,'function','PAN544_ACTUAL_NATIVE_EVENT_TASK_SOURCE_NOT_IMPLEMENTED');
    const source=f.human.notificationSource(f.approver,{invoiceId});
    const event=JSON.parse(nativeRows(f.root,'SELECT event FROM pan542_events WHERE ordinal=1')[0].event);
    assert.deepEqual(source.lastEvent,event);assert.deepEqual(source.readback,f.human.read(f.approver,{invoiceId}));
    assert.equal(source.readback.state,'REVIEWED_LOCAL_EVIDENCE_ONLY');assert.equal(source.readback.proposalRevision,reviewed.proposalRevision);
    assert.deepEqual(readLocalJournalTaskIdentity(join(f.root,'pan453-owned-v2')).identities[event.taskBinding.taskIdentityDigest],source.lastEvent.taskBinding);
    assert.throws(()=>f.human.notificationSource(f.approver,{invoiceId,event:{state:'APPROVED_LOCAL_EVIDENCE_ONLY'}}),/ERV_HUMAN_NOTIFICATION_REQUEST_DENIED/);
    assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,1);
  }finally{f.close();}
});

test('PUI-03-AC01 persisted native approval hint is published before any Fachplugin visit and supplied on authenticated login',async()=>{
  const f=await fixture();
  try{
    const before=f.human.read(f.reviewer,{invoiceId});f.human.decide(f.reviewer,command(before,'REVIEW','first-login-001'));
    assert.equal(typeof notifications?.createNativeNotificationsV1,'function','PAN544_NATIVE_NOTIFICATION_CONNECTION_NOT_IMPLEMENTED');
    const feed=notifications.createNativeNotificationsV1({root:f.root,sessions:f.sessions,catalog:()=>[{id:'pan.erv',version:'1.0.0',state:'AVAILABLE'}]});
    const published=feed.publishNativeEvent(f.reviewer,{invoiceId});
    assert.equal(published.outcome,'PUBLISHED');assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan544_events')[0].count,1);
    const freshHeaders=issue(f.sessions,'synthetic:erv-approver');const login=feed.feed(freshHeaders);
    assert.equal(login.schemaVersion,'pansphaira.workspace-notifications/feed/v1');assert.equal(login.events.length,1);
    const hint=login.events[0];assert.equal(hint.kind,'ERV_LOCAL_EVIDENCE_APPROVAL_REQUIRED');assert.equal(hint.status,'OPEN');assert.equal(hint.read,false);
    assert.deepEqual(hint.target,{pluginId:'pan.erv',routeId:'pan.erv.route',params:{objectId:invoiceId,revision:before.nativeRevision}});
    assert.equal(hint.eventId,published.eventId);assert.equal(hint.eventRevision,1);assert.equal(hint.taskIdentityDigest,f.human.notificationSource(f.approver,{invoiceId}).lastEvent.taskBinding.taskIdentityDigest);
    assert.equal(login.preferences.filter,'ALL');assert.equal(login.preferences.inAppEnabled,true);assert.deepEqual(login.preferences.subscriptions,['ERV_LOCAL_EVIDENCE_APPROVAL_REQUIRED']);
    assert.equal(f.human.read(f.approver,{invoiceId}).state,'REVIEWED_LOCAL_EVIDENCE_ONLY');assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,1);
  }finally{f.close();}
});

test('PUI-03-AC04 canonical event identity deduplicates real repeated server delivery without a new task or decision',async()=>{
  const f=await fixture();
  try{
    f.human.decide(f.reviewer,command(f.human.read(f.reviewer,{invoiceId}),'REVIEW','deduplicate-001'));
    const feed=notifications.createNativeNotificationsV1({root:f.root,sessions:f.sessions,catalog:()=>[{id:'pan.erv',version:'1.0.0',state:'AVAILABLE'}]});
    const first=feed.publishNativeEvent(f.reviewer,{invoiceId});const ledger=readLocalJournalTaskIdentity(join(f.root,'pan453-owned-v2'));
    const second=feed.publishNativeEvent(f.reviewer,{invoiceId});
    assert.equal(second.outcome,'DUPLICATE_NO_NEW_EFFECT');assert.equal(second.eventId,first.eventId);assert.equal(second.eventRevision,first.eventRevision);
    assert.equal(feed.feed(f.approver).events.length,1);assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan544_events')[0].count,1);
    assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,1);assert.deepEqual(readLocalJournalTaskIdentity(join(f.root,'pan453-owned-v2')),ledger);
  }finally{f.close();}
});

test('PUI-03-AC02 closed personal preferences and subscriptions persist for the protected subject, not client tenant or role fields',async()=>{
  const f=await fixture();
  try{
    f.human.decide(f.reviewer,command(f.human.read(f.reviewer,{invoiceId}),'REVIEW','preferences-001'));
    const options={root:f.root,sessions:f.sessions,catalog:()=>[{id:'pan.erv',version:'1.0.0',state:'AVAILABLE'}]},feed=notifications.createNativeNotificationsV1(options);
    feed.publishNativeEvent(f.reviewer,{invoiceId});
    assert.equal(typeof feed.savePreferences,'function','PAN544_PERSISTED_PERSONAL_SUBSCRIPTIONS_NOT_IMPLEMENTED');
    const proposal={schemaVersion:'pansphaira.workspace-notifications/preferences-write/v1',expectedRevision:0,preferences:{inAppEnabled:false,filter:'UNREAD',subscriptions:[]}};
    const saved=feed.savePreferences(f.approver,proposal);assert.equal(saved.revision,1);assert.equal(saved.filter,'UNREAD');assert.equal(saved.inAppEnabled,false);assert.deepEqual(saved.subscriptions,[]);
    const fresh=notifications.createNativeNotificationsV1(options),login=fresh.feed(issue(f.sessions,'synthetic:erv-approver'));
    assert.deepEqual(login.preferences,saved);assert.deepEqual(login.events,[]);
    const rows=nativeRows(f.root,'SELECT tenant_id,subject_id,revision,record FROM pan544_preferences');assert.equal(rows.length,1);assert.equal(rows[0].tenant_id,'tenant-a');assert.equal(rows[0].subject_id,'synthetic:erv-approver');assert.equal(rows[0].revision,1);
    assert.throws(()=>fresh.savePreferences(f.approver,proposal),/NOTIFICATION_PREFERENCES_REVISION_DENIED/);
    for(const preference of [{...proposal.preferences,url:'https://outside.test/'},{...proposal.preferences,filter:'SQL'},{...proposal.preferences,subscriptions:['ANY_EVENT']},{...proposal.preferences,subscriptions:['ERV_LOCAL_EVIDENCE_APPROVAL_REQUIRED','ERV_LOCAL_EVIDENCE_APPROVAL_REQUIRED']}])
      assert.throws(()=>fresh.savePreferences(f.approver,{...proposal,expectedRevision:1,preferences:preference}),/NOTIFICATION_PREFERENCES_SHAPE_DENIED/);
    for(const extra of [{tenantId:'tenant-b'},{subjectId:'synthetic:erv-reviewer'},{role:'APPROVER'},{callback:'https://outside.test/'},{html:'<script>run()</script>'}])
      assert.throws(()=>fresh.savePreferences(f.approver,{...proposal,expectedRevision:1,...extra}),/NOTIFICATION_PREFERENCES_SHAPE_DENIED/);
    assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan544_preferences')[0].count,1);assert.equal(fresh.feed(f.approver).preferences.revision,1);
    assert.equal(f.human.read(f.approver,{invoiceId}).state,'REVIEWED_LOCAL_EVIDENCE_ONLY');
  }finally{f.close();}
});

test('PUI-03-AC03 click resolves the exact active plugin and current authorized native invoice/task without approval or a read mutation',async()=>{
  const f=await fixture();
  try{
    f.human.decide(f.reviewer,command(f.human.read(f.reviewer,{invoiceId}),'REVIEW','open-001'));
    let available=true;const feed=notifications.createNativeNotificationsV1({root:f.root,sessions:f.sessions,catalog:()=>[{id:'pan.erv',version:'1.0.0',state:available?'AVAILABLE':'DISABLED'}]});
    feed.publishNativeEvent(f.reviewer,{invoiceId});const hint=feed.feed(f.approver).events[0],ledger=readLocalJournalTaskIdentity(join(f.root,'pan453-owned-v2'));
    assert.equal(typeof feed.open,'function','PAN544_CURRENT_NATIVE_DEEP_LINK_READ_NOT_IMPLEMENTED');
    const request={schemaVersion:'pansphaira.workspace-notifications/open/v1',eventId:hint.eventId,eventRevision:hint.eventRevision};
    const opened=feed.open(f.approver,request);assert.equal(opened.outcome,'TARGET_READ_CONFIRMED');assert.deepEqual(opened.target,hint.target);
    assert.equal(opened.invoice.invoiceId,invoiceId);assert.equal(opened.invoice.revision,hint.target.params.revision);assert.equal(opened.invoice.readOnly,true);
    assert.equal(opened.taskIdentityDigest,hint.taskIdentityDigest);assert.equal(opened.taskState,'PENDING_LOCAL_EVIDENCE_APPROVAL');assert.equal(opened.executionAuthorityGranted,false);
    assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,1);assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan544_read')[0].count,0);assert.deepEqual(readLocalJournalTaskIdentity(join(f.root,'pan453-owned-v2')),ledger);
    for(const extra of [{target:{pluginId:'other',url:'https://outside.test/'}},{params:{objectId:'FOREIGN-INVOICE'}},{action:'APPROVE_LOCAL_EVIDENCE_ONLY'},{role:'APPROVER'},{tenantId:'tenant-b'}])
      assert.throws(()=>feed.open(f.approver,{...request,...extra}),/NOTIFICATION_OPEN_REQUEST_DENIED/);
    assert.throws(()=>feed.open(f.approver,{...request,eventRevision:hint.eventRevision+1}),/NOTIFICATION_EVENT_SELECTOR_DENIED/);
    assert.throws(()=>feed.open(f.reviewer,request),/NOTIFICATION_NATIVE_ROLE_DENIED/);
    available=false;assert.throws(()=>feed.open(f.approver,request),/NOTIFICATION_PLUGIN_UNAVAILABLE_DENIED/);assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,1);
  }finally{f.close();}
});

test('PUI-03-AC04 explicitly read is persisted per subject/event/revision and never becomes task completion or approval',async()=>{
  const f=await fixture();
  try{
    f.human.decide(f.reviewer,command(f.human.read(f.reviewer,{invoiceId}),'REVIEW','read-state-001'));
    const options={root:f.root,sessions:f.sessions,catalog:()=>[{id:'pan.erv',version:'1.0.0',state:'AVAILABLE'}]},feed=notifications.createNativeNotificationsV1(options);
    feed.publishNativeEvent(f.reviewer,{invoiceId});const hint=feed.feed(f.approver).events[0],ledger=readLocalJournalTaskIdentity(join(f.root,'pan453-owned-v2'));
    assert.equal(typeof feed.markRead,'function','PAN544_DURABLE_PERSONAL_READ_STATE_NOT_IMPLEMENTED');
    const request={schemaVersion:'pansphaira.workspace-notifications/mark-read/v1',eventId:hint.eventId,eventRevision:hint.eventRevision};
    const marked=feed.markRead(f.approver,request);assert.equal(marked.outcome,'READ_CONFIRMED');assert.equal(marked.read,true);assert.equal(marked.newTaskEffect,false);
    const records=nativeRows(f.root,'SELECT * FROM pan544_read');assert.equal(records.length,1);assert.equal(records[0].tenant_id,'tenant-a');assert.equal(records[0].subject_id,'synthetic:erv-approver');assert.equal(records[0].event_id,hint.eventId);assert.equal(records[0].event_revision,hint.eventRevision);
    const second=feed.markRead(f.approver,request);assert.equal(second.outcome,'ALREADY_READ_CONFIRMED');assert.deepEqual(nativeRows(f.root,'SELECT * FROM pan544_read'),records);
    const fresh=notifications.createNativeNotificationsV1(options),login=fresh.feed(issue(f.sessions,'synthetic:erv-approver'));assert.equal(login.events[0].read,true);assert.equal(login.events[0].status,'OPEN');
    const open=fresh.open(f.approver,{...request,schemaVersion:'pansphaira.workspace-notifications/open/v1'});assert.equal(open.taskState,'PENDING_LOCAL_EVIDENCE_APPROVAL');assert.equal(open.executionAuthorityGranted,false);
    assert.equal(f.human.read(f.approver,{invoiceId}).state,'REVIEWED_LOCAL_EVIDENCE_ONLY');assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,1);assert.deepEqual(readLocalJournalTaskIdentity(join(f.root,'pan453-owned-v2')),ledger);
    assert.throws(()=>feed.markRead(f.approver,{...request,action:'APPROVE_LOCAL_EVIDENCE_ONLY'}),/NOTIFICATION_READ_REQUEST_DENIED/);
    assert.throws(()=>feed.markRead(f.reader,request),/HOSTED_ROLE_DENIED/);
  }finally{f.close();}
});

test('PUI-03-AC04 interrupted markRead reconciles a real committed child effect and survives a second process login',async()=>{
  const f=await fixture();
  try{
    f.human.decide(f.reviewer,command(f.human.read(f.reviewer,{invoiceId}),'REVIEW','read-lost-001'));
    const feed=notifications.createNativeNotificationsV1({root:f.root,sessions:f.sessions,catalog:()=>[{id:'pan.erv',version:'1.0.0',state:'AVAILABLE'}]});
    feed.publishNativeEvent(f.reviewer,{invoiceId});const hint=feed.feed(f.approver).events[0];
    assert.equal(typeof feed.reconcileRead,'function','PAN544_NATIVE_READ_RESPONSE_LOSS_RECONCILIATION_NOT_IMPLEMENTED');
    const selection={eventId:hint.eventId,eventRevision:hint.eventRevision};
    assert.equal(feed.reconcileRead(f.approver,{schemaVersion:'pansphaira.workspace-notifications/reconcile-read/v1',...selection}).outcome,'NOT_RECORDED');
    const input={sessionOptions:{optIn:true,origin:f.sessions.origin,identity,stateRoot:f.authRoot},headers:f.approver,mode:'MARK_READ_AND_DROP_RESPONSE',command:{schemaVersion:'pansphaira.workspace-notifications/mark-read/v1',...selection}};
    const child=spawnSync(process.execPath,['tests/pan544/restart-reader.mjs',f.root,f.authRoot],{input:JSON.stringify(input),encoding:'utf8',timeout:15000});
    assert.equal(child.status,73,child.stderr);assert.equal(child.signal,null);assert.equal(child.stdout,'');
    const confirmed=feed.reconcileRead(f.approver,{schemaVersion:'pansphaira.workspace-notifications/reconcile-read/v1',...selection});
    assert.equal(confirmed.outcome,'READ_CONFIRMED');assert.equal(confirmed.read,true);assert.equal(confirmed.newTaskEffect,false);
    const fresh=spawnSync(process.execPath,['tests/pan544/restart-reader.mjs',f.root,f.authRoot],{input:JSON.stringify({...input,mode:'READ_FRESH_LOGIN'}),encoding:'utf8',timeout:15000});
    assert.equal(fresh.status,0,fresh.stderr);assert.equal(fresh.signal,null);const actual=JSON.parse(fresh.stdout);assert.equal(actual.events.length,1);assert.equal(actual.events[0].read,true);assert.equal(actual.events[0].status,'OPEN');
    assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan544_read')[0].count,1);assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,1);assert.equal(f.human.read(f.approver,{invoiceId}).state,'REVIEWED_LOCAL_EVIDENCE_ONLY');
  }finally{f.close();}
});

test('PUI-03-AC05 only a real native evidence approval retires the hint and rejects old open or markRead',async()=>{
  const f=await fixture();
  try{
    const reviewed=f.human.decide(f.reviewer,command(f.human.read(f.reviewer,{invoiceId}),'REVIEW','done-review-001'));
    const feed=notifications.createNativeNotificationsV1({root:f.root,sessions:f.sessions,catalog:()=>[{id:'pan.erv',version:'1.0.0',state:'AVAILABLE'}]});
    feed.publishNativeEvent(f.reviewer,{invoiceId});const hint=feed.feed(f.approver).events[0];
    f.human.decide(f.approver,command(reviewed,'APPROVE_LOCAL_EVIDENCE_ONLY','done-approval-001'));
    const actual=feed.feed(f.approver);assert.equal(actual.events[0].status,'DONE','PAN544_COMPLETED_NATIVE_TASK_STILL_ADVERTISED_OPEN');assert.equal(actual.events[0].read,false);
    const select={eventId:hint.eventId,eventRevision:hint.eventRevision};
    assert.throws(()=>feed.open(f.approver,{schemaVersion:'pansphaira.workspace-notifications/open/v1',...select}),/NOTIFICATION_OBSOLETE_TARGET_DENIED/);
    assert.throws(()=>feed.markRead(f.approver,{schemaVersion:'pansphaira.workspace-notifications/mark-read/v1',...select}),/NOTIFICATION_OBSOLETE_TARGET_DENIED/);
    assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan544_read')[0].count,0);assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,2);assert.equal(f.human.read(f.approver,{invoiceId}).state,'APPROVED_LOCAL_EVIDENCE_ONLY');
  }finally{f.close();}
});

test('PUI-03-AC05 a real native query withdraws the prior approval task without inventing read or completion',async()=>{
  const f=await fixture();
  try{
    const reviewed=f.human.decide(f.reviewer,command(f.human.read(f.reviewer,{invoiceId}),'REVIEW','withdraw-review-001'));
    const feed=notifications.createNativeNotificationsV1({root:f.root,sessions:f.sessions,catalog:()=>[{id:'pan.erv',version:'1.0.0',state:'AVAILABLE'}]});
    feed.publishNativeEvent(f.reviewer,{invoiceId});const hint=feed.feed(f.approver).events[0];
    f.human.decide(f.reviewer,command(reviewed,'QUERY','withdraw-query-001'));
    assert.equal(f.human.read(f.approver,{invoiceId}).state,'QUERY_PENDING_LOCAL_EVIDENCE_ONLY');
    assert.equal(feed.feed(f.approver).events[0].status,'REMOVED','PAN544_WITHDRAWN_NATIVE_TASK_STILL_ADVERTISED_OPEN');
    assert.equal(feed.feed(f.approver).events[0].read,false);
    assert.throws(()=>feed.open(f.approver,{schemaVersion:'pansphaira.workspace-notifications/open/v1',eventId:hint.eventId,eventRevision:hint.eventRevision}),/NOTIFICATION_OBSOLETE_TARGET_DENIED/);
    assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan544_read')[0].count,0);assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,2);
  }finally{f.close();}
});

test('PUI-03-AC05 a real native confirmation revision invalidates the old target and read action rather than rematching it',async()=>{
  const f=await fixture();
  try{
    f.human.decide(f.reviewer,command(f.human.read(f.reviewer,{invoiceId}),'REVIEW','obsolete-review-001'));
    const feed=notifications.createNativeNotificationsV1({root:f.root,sessions:f.sessions,catalog:()=>[{id:'pan.erv',version:'1.0.0',state:'AVAILABLE'}]});
    feed.publishNativeEvent(f.reviewer,{invoiceId});const hint=feed.feed(f.approver).events[0],native=procurement.readPan516Procurement({root:f.root}),last=native.confirmations.at(-1);
    const update={schemaVersion:'pansphaira.pan516/procurement-command/v1',effectId:'synthetic:notification-confirmation-change',transportId:'synthetic:notification-confirmation-wire',expectedRevision:native.revision,
      orderId:native.binding.draft.bestellungId,positionId:native.binding.draft.positionen[0].positionId,supplierId:native.binding.draft.lieferantId,kind:'CONFIRM',receipt:null,sourceReference:'synthetic:notification-confirmation-source',
      confirmation:{revision:last.revision+1,previousConfirmationDigest:last.confirmationDigest,terms:{...last.terms,unitPriceMinor:last.terms.unitPriceMinor+1},confirmedAt:'2026-06-22T08:00:00Z'}};
    procurement.executePan516ProcurementCommand({root:f.root,command:update,grant:procurement.authorizePan516ProcurementCommand({root:f.root,owner:'LOCAL_SYNTHETIC_OWNER',command:update})});
    assert.equal(f.human.read(f.approver,{invoiceId}).state,'STALE_NATIVE_BASIS_REVIEW_REQUIRED');
    const actual=feed.feed(f.approver).events[0];assert.equal(actual.status,'OBSOLETE','PAN544_OBSOLETE_NATIVE_TASK_STILL_ADVERTISED_OPEN');assert.deepEqual(actual.target,hint.target);assert.equal(actual.read,false);
    const select={eventId:hint.eventId,eventRevision:hint.eventRevision};
    assert.throws(()=>feed.open(f.approver,{schemaVersion:'pansphaira.workspace-notifications/open/v1',...select}),/NOTIFICATION_OBSOLETE_TARGET_DENIED/);
    assert.throws(()=>feed.markRead(f.approver,{schemaVersion:'pansphaira.workspace-notifications/mark-read/v1',...select}),/NOTIFICATION_OBSOLETE_TARGET_DENIED/);
    assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan544_read')[0].count,0);assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,1);
  }finally{f.close();}
});

test('PUI-03-AC05 a removed code-owned target plugin cannot advertise or resolve an actionable notification',async()=>{
  const f=await fixture();
  try{
    f.human.decide(f.reviewer,command(f.human.read(f.reviewer,{invoiceId}),'REVIEW','plugin-removed-001'));
    let catalog=[{id:'pan.erv',version:'1.0.0',state:'AVAILABLE'}];
    const feed=notifications.createNativeNotificationsV1({root:f.root,sessions:f.sessions,catalog:()=>catalog});feed.publishNativeEvent(f.reviewer,{invoiceId});const hint=feed.feed(f.approver).events[0];
    catalog=[];assert.equal(feed.feed(f.approver).events[0].status,'PLUGIN_REMOVED','PAN544_REMOVED_PLUGIN_NOTIFICATION_STILL_ACTIONABLE');
    const select={eventId:hint.eventId,eventRevision:hint.eventRevision};
    assert.throws(()=>feed.open(f.approver,{schemaVersion:'pansphaira.workspace-notifications/open/v1',...select}),/NOTIFICATION_PLUGIN_UNAVAILABLE_DENIED/);
    assert.throws(()=>feed.markRead(f.approver,{schemaVersion:'pansphaira.workspace-notifications/mark-read/v1',...select}),/NOTIFICATION_PLUGIN_UNAVAILABLE_DENIED/);
    catalog=[{id:'pan.erv',version:'1.0.0',state:'DISABLED'}];assert.equal(feed.feed(f.approver).events[0].status,'PLUGIN_DISABLED');
    assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan544_read')[0].count,0);assert.equal(f.human.read(f.approver,{invoiceId}).state,'REVIEWED_LOCAL_EVIDENCE_ONLY');
  }finally{f.close();}
});

test('PUI-03-AC05 controlled-clock expiry is checked on a newly authenticated native session, never advertised as success',async t=>{
  const f=await fixture();
  try{
    f.human.decide(f.reviewer,command(f.human.read(f.reviewer,{invoiceId}),'REVIEW','expiry-001'));
    const feed=notifications.createNativeNotificationsV1({root:f.root,sessions:f.sessions,catalog:()=>[{id:'pan.erv',version:'1.0.0',state:'AVAILABLE'}]});
    feed.publishNativeEvent(f.reviewer,{invoiceId});const hint=feed.feed(f.approver).events[0],future=hint.expiresAtMs+1;
    t.mock.method(Date,'now',()=>future);const fresh=issue(f.sessions,'synthetic:erv-approver');
    const actual=feed.feed(fresh).events[0];assert.equal(actual.status,'EXPIRED','PAN544_EXPIRED_NOTIFICATION_STILL_ACTIONABLE');assert.equal(actual.read,false);
    const select={eventId:hint.eventId,eventRevision:hint.eventRevision};
    assert.throws(()=>feed.open(fresh,{schemaVersion:'pansphaira.workspace-notifications/open/v1',...select}),/NOTIFICATION_EVENT_EXPIRED_DENIED/);
    assert.throws(()=>feed.markRead(fresh,{schemaVersion:'pansphaira.workspace-notifications/mark-read/v1',...select}),/NOTIFICATION_EVENT_EXPIRED_DENIED/);
    assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan544_read')[0].count,0);assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,1);
  }finally{t.mock.restoreAll();f.close();}
});

test('PUI-03-AC02 allowed unread and subscription filters affect only the personal feed, not the leading task',async()=>{
  const f=await fixture();
  try{
    f.human.decide(f.reviewer,command(f.human.read(f.reviewer,{invoiceId}),'REVIEW','filters-001'));
    const feed=notifications.createNativeNotificationsV1({root:f.root,sessions:f.sessions,catalog:()=>[{id:'pan.erv',version:'1.0.0',state:'AVAILABLE'}]});
    feed.publishNativeEvent(f.reviewer,{invoiceId});const hint=feed.feed(f.approver).events[0];
    feed.markRead(f.approver,{schemaVersion:'pansphaira.workspace-notifications/mark-read/v1',eventId:hint.eventId,eventRevision:hint.eventRevision});
    const save=(expectedRevision,filter,subscriptions)=>feed.savePreferences(f.approver,{schemaVersion:'pansphaira.workspace-notifications/preferences-write/v1',expectedRevision,preferences:{inAppEnabled:true,filter,subscriptions}});
    save(0,'UNREAD',['ERV_LOCAL_EVIDENCE_APPROVAL_REQUIRED']);assert.deepEqual(feed.feed(f.approver).events,[],'PAN544_UNREAD_FILTER_NOT_APPLIED');
    save(1,'ALL',[]);assert.deepEqual(feed.feed(f.approver).events,[],'PAN544_UNSUBSCRIBED_EVENT_STILL_DELIVERED');
    save(2,'ALL',['ERV_LOCAL_EVIDENCE_APPROVAL_REQUIRED']);const actual=feed.feed(f.approver);assert.equal(actual.events.length,1);assert.equal(actual.events[0].read,true);assert.equal(actual.events[0].status,'OPEN');
    assert.equal(f.human.read(f.approver,{invoiceId}).state,'REVIEWED_LOCAL_EVIDENCE_ONLY');assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,1);
  }finally{f.close();}
});

test('PUI-03-AC02 owner attachment requires the real live adapter and typed present binding, not a copied facade',async()=>{
  const f=await fixture();
  try{
    const feed=notifications.createNativeNotificationsV1({root:f.root,sessions:f.sessions,catalog:()=>[{id:'pan.erv',version:'1.0.0',state:'AVAILABLE'}]});
    assert.equal(typeof notifications.isNativeNotificationsV1,'function','PAN544_LIVE_NOTIFICATION_OWNER_MARKER_NOT_IMPLEMENTED');
    assert.equal(notifications.isNativeNotificationsV1(feed,f.sessions.binding),true);
    assert.equal(notifications.isNativeNotificationsV1({...feed},f.sessions.binding),false);
    assert.equal(notifications.isNativeNotificationsV1({},undefined),false);assert.equal(notifications.isNativeNotificationsV1(feed,undefined),false);
    assert.equal(notifications.isNativeNotificationsV1(feed,{...f.sessions.binding,tenantId:'tenant-b'}),false);
    assert.throws(()=>notifications.createNativeNotificationsV1({root:f.root,sessions:{...f.sessions},catalog:()=>[]}),/NOTIFICATION_PROTECTED_OWNER_DENIED/);
    const before=f.human.read(f.approver,{invoiceId});feed.close();assert.equal(notifications.isNativeNotificationsV1(feed,f.sessions.binding),false);assert.throws(()=>feed.feed(f.approver),/NOTIFICATION_ADAPTER_CLOSED_DENIED/);assert.deepEqual(f.human.read(f.approver,{invoiceId}),before);
  }finally{f.close();}
});

test('PUI-03 negative real foreign realm/tenant/generation, wrong role, headers and arbitrary event payload remain denied',async()=>{
  const f=await fixture();
  try{
    f.human.decide(f.reviewer,command(f.human.read(f.reviewer,{invoiceId}),'REVIEW','authority-001'));
    const feed=notifications.createNativeNotificationsV1({root:f.root,sessions:f.sessions,catalog:()=>[{id:'pan.erv',version:'1.0.0',state:'AVAILABLE'}]});feed.publishNativeEvent(f.reviewer,{invoiceId});
    assert.throws(()=>feed.feed({}),/HOSTED_SESSION_DENIED/);assert.throws(()=>feed.feed(f.reader),/NOTIFICATION_NATIVE_ROLE_DENIED/);
    assert.throws(()=>feed.feed({...f.approver,origin:'https://foreign-pan544.test:4443'}),/NOTIFICATION_ORIGIN_DENIED/);
    assert.throws(()=>feed.feed({...f.approver,'x-tenant-id':'tenant-b'}),/HOSTED_HEADER_AUTHORITY_DENIED/);
    assert.throws(()=>feed.feed({...f.approver,'x-role':'APPROVER'}),/HOSTED_HEADER_AUTHORITY_DENIED/);
    assert.throws(()=>feed.feed(issue(f.sessions,'synthetic:unassigned-human')),/ERV_HUMAN_NATIVE_ROLE_REQUIRED_DENIED/);
    for(const extra of [{event:{kind:'APPROVAL',target:'https://outside.test/'}},{html:'<script>execute()</script>'},{callback:'https://outside.test/'},{tenantId:'tenant-b'}])assert.throws(()=>feed.publishNativeEvent(f.reviewer,{invoiceId,...extra}),/NOTIFICATION_PUBLISH_REQUEST_DENIED/);
    for(const [name,change] of [['tenant',{identity:{...identity,tenantId:'tenant-b'}}],['generation',{identity:{...identity,generation:2}}],['realm',{origin:'https://foreign-pan544.test:4443'}]]){
      const stateRoot=join(f.parent,'foreign-notification-'+name);mkdirSync(stateRoot,{mode:0o700});
      const foreign=createProtectedSessionAdapterV1({optIn:true,origin:f.sessions.origin,identity,stateRoot,...change});
      assert.throws(()=>notifications.createNativeNotificationsV1({root:f.root,sessions:foreign,catalog:()=>[]}),/ERV_HUMAN_SESSION_BINDING_DENIED/,name);
    }
    assert.equal(feed.feed(f.approver).events.length,1);assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan544_read')[0].count,0);assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,1);
  }finally{f.close();}
});

test('PUI-03-AC04 personal browser writes accept only the exact authenticated own-session proof and never publisher authority',async()=>{
  const f=await fixture();
  try{
    f.human.decide(f.reviewer,command(f.human.read(f.reviewer,{invoiceId}),'REVIEW','personal-browser-001'));
    const service=notifications.createNativeNotificationsV1({root:f.root,sessions:f.sessions,catalog:()=>[{id:'pan.erv',version:'1.0.0',state:'AVAILABLE'}]});service.publishNativeEvent(f.reviewer,{invoiceId});
    const {createHash}=await import('node:crypto');const proof='session:'+createHash('sha256').update(f.approver.cookie).digest('hex');
    const browserHeaders={cookie:f.approver.cookie,origin:f.sessions.origin,'x-pan544-context':proof};const event=service.feed(browserHeaders).events[0];
    const saved=service.savePreferences(browserHeaders,{schemaVersion:'pansphaira.workspace-notifications/preferences-write/v1',expectedRevision:0,preferences:{inAppEnabled:true,filter:'ALL',subscriptions:['ERV_LOCAL_EVIDENCE_APPROVAL_REQUIRED']}});
    assert.equal(saved.revision,1,'PAN544_ACTUAL_PERSONAL_BROWSER_PROOF_WRITE_NOT_IMPLEMENTED');
    const request={schemaVersion:'pansphaira.workspace-notifications/mark-read/v1',eventId:event.eventId,eventRevision:event.eventRevision};
    for(const headers of [{cookie:browserHeaders.cookie,origin:browserHeaders.origin},{...browserHeaders,'x-pan544-context':'session:'+'0'.repeat(64)},{...browserHeaders,origin:'https://outside.test/'},{...browserHeaders,cookie:f.reader.cookie}])assert.throws(()=>service.markRead(headers,request),/HOSTED_CSRF_DENIED|NOTIFICATION_ORIGIN_DENIED/);
    assert.equal(service.markRead(browserHeaders,request).outcome,'READ_CONFIRMED');
    assert.throws(()=>service.publishNativeEvent({...browserHeaders,cookie:f.reviewer.cookie,'x-pan544-context':'session:'+createHash('sha256').update(f.reviewer.cookie).digest('hex')},{invoiceId}),/HOSTED_CSRF_DENIED/);
    assert.equal(f.human.read(f.approver,{invoiceId}).state,'REVIEWED_LOCAL_EVIDENCE_ONLY');assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,1);
  }finally{f.close();}
});
