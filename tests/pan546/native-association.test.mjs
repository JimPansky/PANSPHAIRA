import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {nativeViewFixture546} from './native-fixture.mjs';
import {createWorkspaceModuleViewStoreV1,sameWorkspaceModuleViewStoreV1} from '../../src/pan543/profile-store.mjs';
import {createNativeWorkspaceContextSelectionV1} from '../../src/pan548/native-context-selection.mjs';
import {protectedWorkspaceSetupStatusV1} from '../../src/pan527/origin-session-adapter.mjs';
import {createNativeWorkspaceDataCatalogV1,nativeWorkspaceViewFieldsV1} from '../../src/pan546/native-data-catalog.mjs';
import {createNativeWorkspaceViewOwnerV1} from '../../src/pan546/native-view-owner.mjs';
const move=[{kind:'MOVE',instanceId:'native-review',position:0}];
function options(f){return {sessions:f.sessions,identity:f.tls.tenants[0].identity,nativeReader:f.reader,readSetup:()=>protectedWorkspaceSetupStatusV1(f.tls.gateway,{tenantId:'tenant-a',origin:f.tls.origin,identityDigest:f.sessions.binding.identityDigest}),readProfile:p=>f.legacy.read(p)};}
test('DUI-03 native context association rejects callback/store facades and a different genuine database but accepts independent connections to same file and scope',async()=>{
 const f=await nativeViewFixture546(),foreignRoot=join(f.tls.root,'pan546-actual-other-personal-database');let store,context,data;
 try{
  assert.equal(sameWorkspaceModuleViewStoreV1(f.store,f.otherStore),true);assert.equal(sameWorkspaceModuleViewStoreV1(f.store,{...f.store}),false);
  assert.throws(()=>createNativeWorkspaceContextSelectionV1({...options(f),moduleViewStore:{...f.store}}),/CONTEXT_NATIVE_OWNER_DENIED/);
  assert.throws(()=>createNativeWorkspaceContextSelectionV1({...options(f),readModuleViewRevision:()=>0}),/CONTEXT_NATIVE_OWNER_DENIED/);
  mkdirSync(foreignRoot,{mode:0o700});store=createWorkspaceModuleViewStoreV1({root:foreignRoot,fields:nativeWorkspaceViewFieldsV1});assert.equal(sameWorkspaceModuleViewStoreV1(f.store,store),false);
  context=createNativeWorkspaceContextSelectionV1({...options(f),moduleViewStore:store});data=createNativeWorkspaceDataCatalogV1({sessions:f.sessions,contextSelection:context,nativeReader:f.reader,humanRoot:f.native.root});
  assert.throws(()=>createNativeWorkspaceViewOwnerV1({sessions:f.sessions,contextSelection:context,dataCatalog:data,store:f.store}),/VIEW_NATIVE_OWNER_DENIED/);
  const t=f.tab(),p=f.preview(t,move,f.otherView),receipt=f.otherView.confirm(t.headers,f.confirmation(t,p));assert.equal(receipt.revision,1);assert.throws(()=>f.context.verify(t.headers,f.verification(t)),/CONTEXT_REVISION_STALE/);f.fresh(t);assert.equal(f.view.read(t.headers,f.verification(t)).confirmedCandidateDigest,p.candidateDigest);
 }finally{data?.close();context?.close();store?.close();await f.close();}
});
test('DUI-03 opaque native store reservation rejects copied token and cross-principal use, rolls back, then independent native confirm remains usable',async()=>{
 const f=await nativeViewFixture546();try{
  const t=f.tab(),p=f.preview(t,move),principal=f.sessions.authenticate(t.headers),command={expectedRevision:0,view:p.afterView,viewDigest:p.afterDigest,candidateDigest:p.candidateDigest};
  let token=f.store.reserve(principal);assert.throws(()=>f.store.writeReserved({...token},principal,command),/VIEW_STORE_RESERVATION_DENIED/);assert.equal(f.store.revision(principal),0);assert.throws(()=>f.store.reserve(principal),/VIEW_STORE_RESERVATION_DENIED/);assert.equal(f.store.cancelReservation(token),true);
  token=f.store.reserve(principal);const foreign=f.sessions.authenticate(f.issue('synthetic:erv-reader','reader'));assert.throws(()=>f.store.writeReserved(token,foreign,command),/VIEW_STORE_RESERVATION_DENIED/);assert.equal(f.store.revision(principal),0);assert.equal(f.store.cancelReservation(token),false);
  const receipt=f.view.confirm(t.headers,f.confirmation(t,p));assert.equal(receipt.revision,1);f.fresh(t);assert.equal(f.otherView.read(t.headers,f.verification(t)).confirmedCandidateDigest,p.candidateDigest);
 }finally{await f.close();}
});
