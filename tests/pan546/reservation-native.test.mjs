import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {nativeViewFixture546} from './native-fixture.mjs';
import {createNativeWorkspaceContextSelectionV1} from '../../src/pan548/native-context-selection.mjs';
import {protectedWorkspaceSetupStatusV1} from '../../src/pan527/origin-session-adapter.mjs';
import {createNativeWorkspaceDataCatalogV1} from '../../src/pan546/native-data-catalog.mjs';
import {createNativeWorkspaceViewOwnerV1} from '../../src/pan546/native-view-owner.mjs';
import {nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
const move=[{kind:'MOVE',instanceId:'native-review',position:0}];
function counts(f){const db=new DatabaseSync(join(f.root,'browser-profiles.sqlite'),{readOnly:true});try{return {views:db.prepare('SELECT COUNT(*) AS n FROM workspace_module_views').get().n,history:db.prepare('SELECT COUNT(*) AS n FROM workspace_module_view_history').get().n};}finally{db.close();}}
async function reservation(f,t,kind){
 const child=fork(new URL('./native-profile-reservation-probe.mjs',import.meta.url),[],{execPath:process.execPath,stdio:['ignore','ignore','pipe','ipc']});let stderr='';child.stderr.setEncoding('utf8');child.stderr.on('data',s=>stderr+=s);const rows=[];child.on('message',m=>rows.push(m));const exited=once(child,'exit');
 const acquired=new Promise((resolve,reject)=>{child.on('message',m=>{if(m.outcome==='ACTUAL_PROFILE_RESERVATION_HELD')resolve(m);else if(m.outcome==='ACTUAL_TEST_CHILD_FAILED')reject(Error(m.code));});child.once('error',reject);child.once('exit',code=>{if(!rows.some(x=>x.outcome==='ACTUAL_PROFILE_RESERVATION_HELD'))reject(Error('ACTUAL_PROFILE_RESERVATION_NOT_HELD '+code+' '+stderr));});});
 child.send({profileRoot:f.root,kind,holdMs:2200,...(kind==='HUMAN_SOURCE'?{nativeRoot:f.native.root,invoiceId:t.context.primaryObject.objectId,headers:t.headers,sessionOptions:{origin:f.tls.origin,identity:f.tls.tenants[0].identity,stateRoot:f.tls.tenants[0].stateRoot}}:{})});
 await acquired;return {child,rows,async done(){const[code]=await exited;assert.equal(code,0,stderr);assert.equal(rows.filter(x=>x.outcome==='ACTUAL_PROFILE_RESERVATION_RELEASED').length,1);assert.equal(rows.filter(x=>x.outcome==='ACTUAL_TEST_CHILD_FAILED').length,0);}};
}
test('DUI-03 genuine old548 native owner without store association is rejected at native546 composition, not silently accepted as zero revision',async()=>{
 const f=await nativeViewFixture546();let context,data,view;
 try{
  context=createNativeWorkspaceContextSelectionV1({sessions:f.sessions,identity:f.tls.tenants[0].identity,nativeReader:f.reader,readSetup:()=>protectedWorkspaceSetupStatusV1(f.tls.gateway,{tenantId:'tenant-a',origin:f.tls.origin,identityDigest:f.sessions.binding.identityDigest}),readProfile:p=>f.legacy.read(p)});
  data=createNativeWorkspaceDataCatalogV1({sessions:f.sessions,contextSelection:context,nativeReader:f.reader,humanRoot:f.native.root});
  assert.throws(()=>{view=createNativeWorkspaceViewOwnerV1({sessions:f.sessions,contextSelection:context,dataCatalog:data,store:f.store});},/VIEW_NATIVE_OWNER_DENIED/,'PAN546_NATIVE_UNBOUND_VIEW_REVISION_COMPOSITION_ACCEPTED');assert.deepEqual(counts(f),{views:0,history:0});
 }finally{view?.close();data?.close();context?.close();await f.close();}
});
test('DUI-03 actual separate Node SQLite reservation crossing REAL native 60000ms context/candidate expiry cannot persist after the lease', {timeout:90000},async()=>{
 const f=await nativeViewFixture546();let lock;
 try{
  const t=f.tab(),p=f.preview(t,move);assert.ok(p.expiresAtMs>Date.now());
  // Wait against the REAL server-issued lease, never adjust Date.now, a native
  // owner clock, default TTL, busy_timeout or production/test gate.
  await delay(Math.max(0,p.expiresAtMs-Date.now()-1800));lock=await reservation(f,t,'LEASE');const began=Date.now();assert.ok(began<p.expiresAtMs,'LEASE_ALREADY_EXPIRED_BEFORE_CONFIRMATION');
  let receipt=null,error=null;try{receipt=f.view.confirm(t.headers,f.confirmation(t,p));}catch(e){error=e;}
  const ended=Date.now(),actual=counts(f);await lock.done();const release=lock.rows.find(x=>x.outcome==='ACTUAL_PROFILE_RESERVATION_RELEASED');
  console.log('PAN546_REAL_SQLITE_WAIT_LEASE_BOUNDARY '+JSON.stringify({realLeaseExpiresAtMs:p.expiresAtMs,confirmationStartedAtMs:began,confirmationEndedAtMs:ended,actualOtherProcessReservationReleasedAtMs:release.atMs,actualWriteOutcome:receipt?.outcome??null,actualError:error?.message??null,actualViewsAndHistory:actual,nativeDefaultLease60000Unchanged:true,sqliteBusyTimeout3000Unchanged:true}));
  assert.ok(ended>=p.expiresAtMs,'ACTUAL_RESERVATION_DID_NOT_CROSS_REAL_NATIVE_LEASE');assert.ok(error&&/CONTEXT_LEASE_EXPIRED|VIEW_CANDIDATE_EXPIRED_OR_CONSUMED/.test(error.message),'PAN546_CURRENT_NATIVE_CAS_PERSISTED_AFTER_REAL_LEASE_EXPIRY');assert.equal(receipt,null);assert.deepEqual(actual,{views:0,history:0});assert.equal(nativeRows(f.native.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,0);
 }finally{if(lock?.child.connected)lock.child.kill();await f.close();}
});
test('DUI-03 actual separate Node reservation plus separately authorized native Human REVIEW invalidates source consent BEFORE any personal persistence',async()=>{
 const f=await nativeViewFixture546();let lock;
 try{
  const t=f.tab(),p=f.preview(t,move),before=f.human.read(t.headers,{invoiceId:t.context.primaryObject.objectId});lock=await reservation(f,t,'HUMAN_SOURCE');
  let receipt=null,error=null;try{receipt=f.view.confirm(t.headers,f.confirmation(t,p));}catch(e){error=e;}
  const actual=counts(f);await lock.done();const event=lock.rows.find(x=>x.outcome==='ACTUAL_INDEPENDENT_AUTHORIZED_HUMAN_REVIEW');assert.ok(event);assert.equal(event.proposalBefore,before.proposalRevision);assert.equal(event.proposalAfter,before.proposalRevision+1);assert.equal(event.nativeRevision,event.afterNativeRevision);assert.equal(event.sourceChanged,true);
  console.log('PAN546_REAL_SQLITE_WAIT_SEPARATE_NATIVE_HUMAN_SOURCE '+JSON.stringify({actualAuthorizedHumanObservation:event,actualWriteOutcome:receipt?.outcome??null,actualError:error?.message??null,actualViewsAndHistory:actual}));
  assert.ok(error&&/VIEW_CANDIDATE_STALE/.test(error.message),'PAN546_CURRENT_NATIVE_CAS_PERSISTED_AFTER_INDEPENDENT_HUMAN_SOURCE_CHANGE_DURING_SQLITE_WAIT');assert.equal(receipt,null);assert.deepEqual(actual,{views:0,history:0});assert.equal(nativeRows(f.native.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,1,'only the separate authorized real Human REVIEW, not personal or productive/business output');
 }finally{if(lock?.child.connected)lock.child.kill();await f.close();}
});
