import {createHash,randomBytes} from 'node:crypto';
import {isProtectedSessionAdapterV1} from '../pan527/origin-session-adapter.mjs';
import {isNativeWorkspaceModuleViewContextSelectionV1} from '../pan548/native-context-selection.mjs';
import {isWorkspaceModuleViewStoreV1} from '../pan543/profile-store.mjs';
import {isNativeWorkspaceDataCatalogV1,nativeWorkspaceViewFieldsV1} from './native-data-catalog.mjs';
import {reduceWorkspaceModuleViewV1,validateWorkspaceModuleViewV1} from '../../dist/packages/contracts/src/workspace-module-view-v1.js';
const owned=new WeakMap(),hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function exact(value,keys,code){if(!value||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype)throw new Error(code);const ds=Object.getOwnPropertyDescriptors(value);if(Reflect.ownKeys(ds).length!==keys.length||keys.some(k=>!Object.hasOwn(ds,k))||Object.values(ds).some(d=>!d.enumerable||!('value'in d)))throw new Error(code);}
function frozen(value){if(value&&typeof value==='object'){for(const v of Object.values(value))frozen(v);Object.freeze(value);}return value;}
// One shared reducer and ordinary profile owner for manual/later agent inputs.
// A preview is not consent, persistence, a native read receipt or business grant.
export function createNativeWorkspaceViewOwnerV1(options){
 exact(options,['sessions','contextSelection','dataCatalog','store'],'VIEW_NATIVE_OWNER_DENIED');
 const {sessions,contextSelection,dataCatalog,store}=options;
 if(!isProtectedSessionAdapterV1(sessions,sessions?.binding?.tenantId)||!isNativeWorkspaceModuleViewContextSelectionV1(contextSelection,sessions.binding,store)||!isNativeWorkspaceDataCatalogV1(dataCatalog,sessions.binding,contextSelection)||!isWorkspaceModuleViewStoreV1(store))throw new Error('VIEW_NATIVE_OWNER_DENIED');
 const candidates=new Map();let closed=false;
 function leading(headers,verification,mutation=false){
  if(closed)throw new Error('VIEW_NATIVE_CLOSED');
  const principal=sessions.authenticate(headers);
  // Existing #543 personal presentation is not reviewer-only business work.
  // Same-origin + native session/tab/context secrets bind personal consent;
  // this never bypasses the unchanged Human authorizeMutation/native-role gate.
  if(mutation&&headers.origin!==sessions.origin)throw new Error('HOSTED_CSRF_DENIED');
  const context=contextSelection.verify(headers,verification),catalog=dataCatalog.metadata(headers,verification);
  if(context.moduleId!=='pan.erv'||context.viewId!=='pan.erv.view'||catalog.contextHandle!==context.contextHandle)throw new Error('VIEW_NATIVE_CONTEXT_DENIED');
  contextSelection.verify(headers,verification);
  return {principal,context,catalog};
 }
 function scopedRead(headers,verification){const a=leading(headers,verification),current=store.read(a.principal);contextSelection.verify(headers,verification);return frozen({...current,moduleId:a.context.moduleId,viewId:a.context.viewId,binding:a.context.binding,contextHandle:a.context.contextHandle,independentNativeRead:true});}
 function issue(headers,command,undo){
  exact(command,['schemaVersion','context',undo?'targetRevision':'delta'],'VIEW_PREVIEW_COMMAND_DENIED');
  if(command.schemaVersion!==(undo?'pansphaira.workspace-module-view/undo-preview/v1':'pansphaira.workspace-module-view/preview/v1'))throw new Error('VIEW_PREVIEW_COMMAND_DENIED');
  const a=leading(headers,command.context),before=store.read(a.principal);
  const after=undo?validateWorkspaceModuleViewV1(store.historical(a.principal,command.targetRevision).view,nativeWorkspaceViewFieldsV1):reduceWorkspaceModuleViewV1(before.view,command.delta,nativeWorkspaceViewFieldsV1);
  contextSelection.verify(headers,command.context);
  const at=Date.now();for(const[id,c]of candidates)if(c.expiresAtMs<=at)candidates.delete(id);
  // Replacing the same tab's preview never writes a view or native fact.
  for(const[id,c]of candidates)if(c.core.binding.sessionId===a.context.binding.sessionId&&c.core.binding.tabId===a.context.binding.tabId)candidates.delete(id);
  if(candidates.size>=128)throw new Error('VIEW_PREVIEW_CAPACITY_DENIED');
  const core=frozen({schemaVersion:'pansphaira.workspace-module-view/candidate/v1',kind:undo?'UNDO':'DELTA',binding:a.context.binding,contextHandle:a.context.contextHandle,sourceDigest:a.catalog.sourceDigest,expectedRevision:before.revision,beforeDigest:before.viewDigest,afterView:after,afterDigest:hash(after)});
  const candidateDigest=hash(core),candidateHandle='view-preview:'+randomBytes(32).toString('hex'),expiresAtMs=a.context.lease.expiresAtMs;
  candidates.set(candidateHandle,{core,candidateDigest,expiresAtMs});
  return frozen({schemaVersion:'pansphaira.workspace-module-view/preview-readback/v1',candidateHandle,candidateDigest,expiresAtMs,kind:core.kind,binding:core.binding,expectedRevision:before.revision,beforeView:before.view,afterView:after,beforeDigest:before.viewDigest,afterDigest:core.afterDigest,consequence:'PERSONAL_MODULE_VIEW_ONLY',previewOnly:true,persistenceProduced:false,businessEffectProduced:false,executionAuthorityGranted:false});
 }
 function candidate(headers,command,mutation,issued){
  exact(command,['schemaVersion','context','candidateHandle','candidateDigest',...(mutation?['confirmation']:[])],'VIEW_CANDIDATE_COMMAND_DENIED');
  if(command.schemaVersion!==(mutation?'pansphaira.workspace-module-view/confirm/v1':'pansphaira.workspace-module-view/cancel/v1')||typeof command.candidateHandle!=='string'||!/^view-preview:[a-f0-9]{64}$/.test(command.candidateHandle)||typeof command.candidateDigest!=='string'||!/^[a-f0-9]{64}$/.test(command.candidateDigest)||mutation&&command.confirmation!=='CONFIRM_PERSONAL_VIEW')throw new Error('VIEW_CONFIRMATION_DENIED');
  const a=leading(headers,command.context,mutation),c=issued??candidates.get(command.candidateHandle);
  if(!c||c.expiresAtMs<=Date.now())throw new Error('VIEW_CANDIDATE_EXPIRED_OR_CONSUMED');
  if(command.candidateDigest!==c.candidateDigest||hash(c.core)!==c.candidateDigest)throw new Error('VIEW_CANDIDATE_MODIFIED_DENIED');
  if(JSON.stringify(c.core.binding)!==JSON.stringify(a.context.binding)||c.core.contextHandle!==a.context.contextHandle||c.core.sourceDigest!==a.catalog.sourceDigest)throw new Error('VIEW_CANDIDATE_STALE');
  const current=store.read(a.principal);if(current.revision!==c.core.expectedRevision||current.viewDigest!==c.core.beforeDigest)throw new Error('VIEW_REVISION_CONFLICT');
  contextSelection.verify(headers,command.context);
  sessions.authenticate(headers);
  if(mutation&&headers.origin!==sessions.origin)throw new Error('HOSTED_CSRF_DENIED');
  if(closed||c.expiresAtMs<=Date.now())throw new Error('VIEW_CANDIDATE_EXPIRED_OR_CONSUMED');
  return {a,c};
 }
 const owner=Object.freeze({
  read(headers,verification){return scopedRead(headers,verification);},
  preview(headers,command){return issue(headers,command,false);},
  previewUndo(headers,command){return issue(headers,command,true);},
  cancel(headers,command){candidate(headers,command,false);candidates.delete(command.candidateHandle);return frozen({outcome:'VIEW_PREVIEW_CANCELLED',persistenceProduced:false,businessEffectProduced:false,executionAuthorityGranted:false});},
  confirm(headers,command){
   const {a,c}=candidate(headers,command,true);
   // Consume before the one CAS call. A lost reply requires independent read;
   // never replay a save/undo or convert a preview into a successful readback.
   candidates.delete(command.candidateHandle);
   const reservation=store.reserve(a.principal);
   try{
    // SQLite acquisition may have waited. Re-read genuine session/context,
    // source digest, candidate lease and before-state UNDER the reservation,
    // before the first history/view insertion. No caller callback is invoked.
    const fresh=candidate(headers,command,true,c);
    const result=store.writeReserved(reservation,fresh.a.principal,{expectedRevision:c.core.expectedRevision,view:c.core.afterView,viewDigest:c.core.afterDigest,candidateDigest:c.candidateDigest});
    return frozen({schemaVersion:'pansphaira.workspace-module-view/write-receipt/v1',outcome:'VIEW_PERSISTED',kind:c.core.kind,revision:result.revision,viewDigest:result.viewDigest,confirmedCandidateDigest:result.confirmedCandidateDigest,binding:c.core.binding,personalViewPersistenceProduced:true,businessEffectProduced:false,executionAuthorityGranted:false,independentReadbackRequired:true});
   }finally{store.cancelReservation(reservation);}
  },
  close(){closed=true;candidates.clear();},
 });owned.set(owner,{binding:sessions.binding,contextSelection});return owner;
}
export const isNativeWorkspaceViewOwnerV1=(owner,binding,contextSelection)=>owned.has(owner)&&JSON.stringify(owned.get(owner).binding)===JSON.stringify(binding)&&(contextSelection===undefined||owned.get(owner).contextSelection===contextSelection);
