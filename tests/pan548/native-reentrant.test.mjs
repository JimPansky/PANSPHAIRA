import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {nativeFixture527} from '../pan527/helpers.mjs';
import {financeFixture} from '../pan519/native-fixture.mjs';
import {createNativeErvReadAdapterV1} from '../../src/pan541/native-erv-read-adapter.mjs';
import {enableWorkspaceBrowserV1} from '../../src/pan541/workspace-browser.mjs';
import {createNativeWorkspaceContextSelectionV1} from '../../src/pan548/native-context-selection.mjs';
import {protectedWorkspaceSetupStatusV1} from '../../src/pan527/origin-session-adapter.mjs';
import {createBrowserProfileStoreV1} from '../../src/pan543/profile-store.mjs';
import {defaultBrowserProfileV1} from '../../dist/packages/contracts/src/browser-profile-v1.js';

async function fixture(){
 const tls=await nativeFixture527();let native,owner,profiles,workspace;
 try{
  native=await financeFixture();const sessions=tls.gateway.sessionAdapter('tenant-a'),reader=createNativeErvReadAdapterV1({tenantId:'tenant-a',root:native.root});
  workspace=enableWorkspaceBrowserV1({optIn:true,gateway:tls.gateway,tenantId:'tenant-a',origin:tls.origin,nativeReader:reader,contextSelection:true});
  const issued=sessions.issueOwnerSession({subjectId:'synthetic-native-reentrant-reader',role:'reader',expiresAtMs:Date.now()+180000});
  const headers={cookie:issued.cookieHeader,origin:tls.origin,'x-pan548-session':'session:'+createHash('sha256').update(issued.cookieHeader).digest('hex')};
  profiles=createBrowserProfileStoreV1({root:tls.tenants[0].productRoot,catalog:()=>defaultBrowserProfileV1().items.map(x=>({id:x.id,version:x.version,state:'AVAILABLE'}))});
  let setup=protectedWorkspaceSetupStatusV1(tls.gateway,{tenantId:'tenant-a',origin:tls.origin,identityDigest:sessions.binding.identityDigest}),duringProfile=null;
  owner=createNativeWorkspaceContextSelectionV1({sessions,identity:tls.tenants[0].identity,nativeReader:reader,readSetup:()=>setup,readProfile:principal=>{const value=profiles.read(principal),callback=duringProfile;duringProfile=null;callback?.();return value;}});
  function tab(){const boot=owner.bootstrap(headers,{}),context=boot.snapshot.context;return {headers:{...headers,'x-pan548-tab':boot.tabProof,'x-pan548-tab-id':context.binding.tabId},snapshot:boot.snapshot};}
  function verify(t,c){return owner.verify(t.headers,{schemaVersion:'pansphaira.workspace-context/verify/v1',tabId:c.binding.tabId,contextHandle:c.contextHandle});}
  return {tls,native,owner,sessions,tab,verify,get setup(){return setup;},set setup(v){setup=v;},arm(fn){duringProfile=fn;},async close(){owner.close();profiles.close();workspace.close();native.close();await tls.close();}};
 }catch(error){owner?.close();profiles?.close();workspace?.close();native?.close();await tls.close();throw error;}
}
test('DUI-02 actual reentrant native profile read cannot combine older Setup selections with a later host revision or verify a removed stage',async()=>{
 const f=await fixture();try{
  const a=f.tab(),b=f.tab(),initial=a.snapshot.context;assert.ok(f.setup.stages.length>0);
  const removed=f.setup.stages[0].stageId,selection={elementId:'pan.setup.stage',rowId:removed};
  const selected=f.owner.claim(a.headers,{schemaVersion:'pansphaira.workspace-context/claim/v1',tabId:initial.binding.tabId,moduleId:initial.moduleId,viewId:initial.viewId,primaryObjectId:null,expected:{...initial.revisions,epoch:initial.binding.epoch},selection});
  const before=selected.context;assert.deepEqual(before.selection,selection);assert.deepEqual(f.verify(a,before),before);
  let nested;f.arm(()=>{f.setup={...f.setup,stages:f.setup.stages.filter(x=>x.stageId!==removed)};nested=f.owner.snapshot(b.headers);});
  let outer,error;try{outer=f.owner.snapshot(a.headers);}catch(e){error=e;}
  assert.ok(nested&&nested.context.revisions.hostRevision>before.revisions.hostRevision,'the real nested native read advanced the shared host revision');
  let removedSelectionVerified=false;if(outer){try{removedSelectionVerified=f.verify(a,outer.context).contextHandle===outer.context.contextHandle;}catch{}}
  console.log('PAN548_ACTUAL_REENTRANT_OBSERVATION '+JSON.stringify({outerIssued:Boolean(outer),nestedHostRevision:nested.context.revisions.hostRevision,outerHostRevision:outer?.context.revisions.hostRevision,obsoleteSelectionIssued:outer?.context.selection?.rowId===removed,obsoleteSelectionVerified:removedSelectionVerified,actualOuterError:error?.message??null}));
  if(error)assert.match(error.message,/CONTEXT_REVISION_STALE/);
  else{
   assert.notDeepEqual(outer.context.selection,selection,'PAN548_REENTRANT_SETUP_MIXED_REVISION_MUST_NOT_ISSUE_REMOVED_SELECTION');
   assert.ok(!outer.selections.some(x=>x.elementId===selection.elementId&&x.rowId===selection.rowId),'current native selections must omit the removed stage');
  }
  assert.throws(()=>f.verify(a,before),/CONTEXT_REVISION_STALE/,'previous selected handle must not verify under changed native Setup');
  const fresh=f.owner.snapshot(a.headers);assert.equal(fresh.context.selection,null);assert.equal(fresh.context.revisions.hostRevision,nested.context.revisions.hostRevision);assert.deepEqual(f.verify(a,fresh.context),fresh.context);
  assert.equal(f.sessions.authenticate(a.headers).subjectId,'synthetic-native-reentrant-reader');
 }finally{await f.close();}
});
test('DUI-02 explicit own-tab retirement during a trusted native profile read cannot resurrect a context for the in-flight snapshot',async()=>{
 const f=await fixture();try{
  const a=f.tab(),before=a.snapshot.context;let retirement;
  f.arm(()=>{retirement=f.owner.retire(a.headers,{schemaVersion:'pansphaira.workspace-context/verify/v1',tabId:before.binding.tabId,contextHandle:before.contextHandle});});
  assert.throws(()=>f.owner.snapshot(a.headers),/CONTEXT_REVISION_STALE/,'PAN548_REENTRANT_TAB_RETIREMENT_MUST_ABORT_OLDER_NATIVE_READ');
  assert.equal(retirement.outcome,'CONTEXT_RETIRED');assert.equal(retirement.executionAuthorityGranted,false);assert.equal(retirement.effectsProduced,false);
  assert.throws(()=>f.verify(a,before),/CONTEXT_REVISION_STALE/);const fresh=f.owner.snapshot(a.headers);assert.ok(fresh.context.binding.epoch>before.binding.epoch);assert.equal(fresh.context.selection,null);assert.deepEqual(f.verify(a,fresh.context),fresh.context);
 }finally{await f.close();}
});
