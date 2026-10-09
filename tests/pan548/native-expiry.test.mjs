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

test('DUI-02 native lease expiring during the actual leading-profile read is denied before returning a handle while the actual session remains valid',async(tcase)=>{
 const tls=await nativeFixture527();let native,workspace,nativeOwner,profiles;
 try{
  native=await financeFixture();const reader=createNativeErvReadAdapterV1({tenantId:'tenant-a',root:native.root});workspace=enableWorkspaceBrowserV1({optIn:true,gateway:tls.gateway,tenantId:'tenant-a',origin:tls.origin,nativeReader:reader,contextSelection:true});
  const sessions=tls.gateway.sessionAdapter('tenant-a'),issued=sessions.issueOwnerSession({subjectId:'synthetic-native-expiry-reader',role:'reader',expiresAtMs:Date.now()+180000});
  const headers={cookie:issued.cookieHeader,origin:tls.origin,'x-pan548-session':'session:'+createHash('sha256').update(issued.cookieHeader).digest('hex')};
  profiles=createBrowserProfileStoreV1({root:tls.tenants[0].productRoot,catalog:()=>defaultBrowserProfileV1().items.map(x=>({id:x.id,version:x.version,state:'AVAILABLE'}))});
  let expireDuringRead=false;const initial=Date.now(),clock=tcase.mock.method(Date,'now',()=>initial);let context;
  try{
   nativeOwner=createNativeWorkspaceContextSelectionV1({sessions,identity:tls.tenants[0].identity,nativeReader:reader,readSetup:()=>protectedWorkspaceSetupStatusV1(tls.gateway,{tenantId:'tenant-a',origin:tls.origin,identityDigest:sessions.binding.identityDigest}),readProfile:principal=>{const value=profiles.read(principal);if(expireDuringRead)clock.mock.mockImplementation(()=>context.lease.expiresAtMs+1);return value;}});
   const bootstrap=nativeOwner.bootstrap(headers,{});context=bootstrap.snapshot.context;Object.assign(headers,{'x-pan548-tab':bootstrap.tabProof,'x-pan548-tab-id':context.binding.tabId});expireDuringRead=true;
   assert.throws(()=>nativeOwner.verify(headers,{schemaVersion:'pansphaira.workspace-context/verify/v1',tabId:context.binding.tabId,contextHandle:context.contextHandle}),/CONTEXT_LEASE_EXPIRED/,'native verification must not return a lease that expired during the trusted leading read');
   assert.equal(sessions.authenticate(headers).subjectId,'synthetic-native-expiry-reader');
  }finally{clock.mock.restore();}
 }finally{nativeOwner?.close();profiles?.close();workspace?.close();native?.close();await tls.close();}
});
