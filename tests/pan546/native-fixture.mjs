import {createHash} from 'node:crypto';
import {nativeFixture527} from '../pan527/helpers.mjs';
import {financeFixture} from '../pan519/native-fixture.mjs';
import {createNativeErvReadAdapterV1} from '../../src/pan541/native-erv-read-adapter.mjs';
import {enableWorkspaceBrowserV1} from '../../src/pan541/workspace-browser.mjs';
import {initializeNativeErvHumanBackendV1,createNativeErvHumanBackendV1} from '../../src/pan542/native-human-backend.mjs';
import {createBrowserProfileStoreV1,createWorkspaceModuleViewStoreV1} from '../../src/pan543/profile-store.mjs';
import {defaultBrowserProfileV1} from '../../dist/packages/contracts/src/browser-profile-v1.js';
import {createNativeWorkspaceContextSelectionV1} from '../../src/pan548/native-context-selection.mjs';
import {protectedWorkspaceSetupStatusV1,mountProtectedWorkspaceContextSelectionV1,mountProtectedWorkspaceModuleViewsV1} from '../../src/pan527/origin-session-adapter.mjs';
import {createNativeWorkspaceDataCatalogV1,nativeWorkspaceViewFieldsV1} from '../../src/pan546/native-data-catalog.mjs';
import {createNativeWorkspaceViewOwnerV1} from '../../src/pan546/native-view-owner.mjs';
export async function nativeViewFixture546(){
 const tls=await nativeFixture527();let native,workspace,legacy,store,context,data,view,otherStore,otherView,contextAttachment,viewAttachment;
 try{
  native=await financeFixture();const sessions=tls.gateway.sessionAdapter('tenant-a'),root=tls.tenants[0].productRoot;
  const reader=createNativeErvReadAdapterV1({tenantId:'tenant-a',root:native.root});
  workspace=enableWorkspaceBrowserV1({optIn:true,gateway:tls.gateway,tenantId:'tenant-a',origin:tls.origin,nativeReader:reader});
  initializeNativeErvHumanBackendV1({root:native.root,owner:'LOCAL_SYNTHETIC_OWNER',sessionBinding:sessions.binding});
  const human=createNativeErvHumanBackendV1({root:native.root,sessions});
  legacy=createBrowserProfileStoreV1({root,catalog:()=>defaultBrowserProfileV1().items.map(x=>({id:x.id,version:x.version,state:'AVAILABLE'}))});
  store=createWorkspaceModuleViewStoreV1({root,fields:nativeWorkspaceViewFieldsV1});otherStore=createWorkspaceModuleViewStoreV1({root,fields:nativeWorkspaceViewFieldsV1});
  context=createNativeWorkspaceContextSelectionV1({sessions,identity:tls.tenants[0].identity,nativeReader:reader,readSetup:()=>protectedWorkspaceSetupStatusV1(tls.gateway,{tenantId:'tenant-a',origin:tls.origin,identityDigest:sessions.binding.identityDigest}),readProfile:p=>legacy.read(p),moduleViewStore:store});
  data=createNativeWorkspaceDataCatalogV1({sessions,contextSelection:context,nativeReader:reader,humanRoot:native.root});
  view=createNativeWorkspaceViewOwnerV1({sessions,contextSelection:context,dataCatalog:data,store});otherView=createNativeWorkspaceViewOwnerV1({sessions,contextSelection:context,dataCatalog:data,store:otherStore});
  contextAttachment=mountProtectedWorkspaceContextSelectionV1(tls.gateway,{optIn:true,tenantId:'tenant-a',origin:tls.origin,identityDigest:sessions.binding.identityDigest,adapterVersion:'pan548-native-context-selection/v1',owner:context});
  viewAttachment=mountProtectedWorkspaceModuleViewsV1(tls.gateway,{optIn:true,tenantId:'tenant-a',origin:tls.origin,identityDigest:sessions.binding.identityDigest,adapterVersion:'pan546-native-personal-view/v1',dataCatalog:data,viewOwner:view});
  function issue(subjectId='synthetic:erv-reviewer',role='reviewer'){
   const issued=sessions.issueOwnerSession({subjectId,role,expiresAtMs:Date.now()+180000});
   return {cookie:issued.cookieHeader,origin:tls.origin,'x-pan527-csrf':issued.csrf,'x-pan548-session':'session:'+createHash('sha256').update(issued.cookieHeader).digest('hex')};
  }
  function tab(headers=issue(),invoiceId='AP-PAN516-MATCHED-01'){
   const boot=context.bootstrap(headers,{}),c=boot.snapshot.context,headers2={...headers,'x-pan548-tab':boot.tabProof,'x-pan548-tab-id':c.binding.tabId};
   const invoice=reader.read({tenantId:'tenant-a',objectId:invoiceId,expectedRevision:null});
   const current=context.claim(headers2,{schemaVersion:'pansphaira.workspace-context/claim/v1',tabId:c.binding.tabId,moduleId:'pan.erv',viewId:'pan.erv.view',primaryObjectId:invoiceId,selection:null,expected:{...c.revisions,domainRevision:invoice.revision,epoch:c.binding.epoch}}).context;
   return {headers:headers2,context:current};
  }
  function fresh(t){t.context=context.snapshot(t.headers).context;return t.context;}
  function verification(t){return {schemaVersion:'pansphaira.workspace-context/verify/v1',tabId:t.context.binding.tabId,contextHandle:t.context.contextHandle};}
  function preview(t,operations,owner=view){return owner.preview(t.headers,{schemaVersion:'pansphaira.workspace-module-view/preview/v1',context:verification(t),delta:{schemaVersion:'pansphaira.workspace-module-view/delta/v1',operations}});}
  function confirmation(t,p){return {schemaVersion:'pansphaira.workspace-module-view/confirm/v1',context:verification(t),candidateHandle:p.candidateHandle,candidateDigest:p.candidateDigest,confirmation:'CONFIRM_PERSONAL_VIEW'};}
  function query(t,fieldIds){return data.read(t.headers,{schemaVersion:'pansphaira.workspace-data-read/v1',context:verification(t),fieldIds});}
  return {tls,native,root,sessions,reader,human,legacy,store,otherStore,context,data,view,otherView,viewAttachment,contextAttachment,issue,tab,fresh,verification,preview,confirmation,query,async close(){viewAttachment?.close();contextAttachment?.close();view?.close();otherView?.close();data?.close();context?.close();store?.close();otherStore?.close();legacy?.close();workspace?.close();native?.close();await tls.close();}};
 }catch(error){viewAttachment?.close();contextAttachment?.close();view?.close();otherView?.close();data?.close();context?.close();store?.close();otherStore?.close();legacy?.close();workspace?.close();native?.close();await tls.close();throw error;}
}
