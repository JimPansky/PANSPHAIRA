// Code-owned bridge to the EXISTING native Human decision ledger. No replacement
// events, role map, approval engine or production dispatch. Explicit owner opt-in.
import {createNativeErvHumanBackendV1} from '../pan542/native-human-backend.mjs';
import {isProtectedSessionAdapterV1} from '../pan527/origin-session-adapter.mjs';
import {isNativeWorkspaceContextSelectionV1} from '../pan548/native-context-selection.mjs';
import {readPan516Procurement} from '../procurement-434/bestellung-lifecycle.mjs';
import {evaluatePan516ProcurementLiabilitySnapshot} from '../procurement-434/bestellung-liability.mjs';
import {digest} from '../pan473/scope-profile.mjs';
const owned=new WeakMap();
function projection(v,root){
 const state=readPan516Procurement({root}),confirmation=state.confirmations.at(-1),liability=evaluatePan516ProcurementLiabilitySnapshot({state,invoiceId:v.invoiceId,expectedConfirmationRevision:confirmation?.revision});
 // Same actual authenticated native invoice/binding/basis, not an inferred join,
 // substitute document service or independently caller-sealed source.
 if(state.revision!==v.nativeRevision||digest(state.binding)!==v.nativeBindingDigest||liability.basisDigest!==v.basisDigest)throw Error('HUMAN_REFERENCE_NATIVE_BASIS_STALE');
 const references=Object.freeze({schemaVersion:'pansphaira.workspace-erv-references/v1',invoiceId:v.invoiceId,orderId:state.effectiveDraft.bestellungId,positionId:state.effectiveDraft.positionen[0].positionId,receiptIds:Object.freeze(state.receiptLedger.eintraege.map(e=>e.eingangsId)),quantityUnit:confirmation.terms.unit,invoiceSourcePath:liability.source.invoiceSource.path,invoiceSourceSha256:liability.source.invoiceSource.sha256});
 return Object.freeze({...Object.fromEntries(['invoiceId','nativeRevision','proposalRevision','proposalDigest','state','nativeRole','lastEventDigest','leadingStore','persisted','bookingAuthorityGranted','paymentOrderAuthorized','productiveDispatchAuthorized','executionAuthorityGranted'].map(k=>[k,v[k]])),references});
}
function exact(value,keys){const d=value&&Object.getPrototypeOf(value)===Object.prototype?Object.getOwnPropertyDescriptors(value):null;if(!d||Reflect.ownKeys(d).length!==keys.length||keys.some(k=>!Object.hasOwn(d,k))||Object.values(d).some(x=>!x.enumerable||!('value' in x)))throw Error('HUMAN_WORKSPACE_COMMAND_DENIED');}
export function createNativeWorkspaceErvHumanV1(options){
 exact(options,['sessions','contextSelection','humanRoot']);const{sessions,contextSelection,humanRoot}=options;
 if(!isProtectedSessionAdapterV1(sessions,sessions?.binding?.tenantId)||!isNativeWorkspaceContextSelectionV1(contextSelection,sessions.binding))throw Error('HUMAN_WORKSPACE_OWNER_DENIED');
 const native=createNativeErvHumanBackendV1({root:humanRoot,sessions});let closed=false;
 const api=Object.freeze({
  call(headers,operation,request){
   if(closed)throw Error('HUMAN_WORKSPACE_ATTACHMENT_RETIRED');
   exact(request,operation==='read'?['context']:operation==='decide'?['context','command']:operation==='reconcile'?['context','effectId']:[]);
   if(!['read','decide','reconcile'].includes(operation))throw Error('HUMAN_WORKSPACE_COMMAND_DENIED');
   const c=contextSelection.verify(headers,request.context);
   if(c.moduleId!=='pan.erv'||!c.primaryObject||headers.origin!==sessions.origin)throw Error('HUMAN_WORKSPACE_SCOPE_DENIED');
   let value;
   if(operation==='read')value=native.read(headers,{invoiceId:c.primaryObject.objectId});
   else if(operation==='decide'){
    if(request.command?.invoiceId!==c.primaryObject.objectId||request.command?.expectedNativeRevision!==c.primaryObject.revision)throw Error('HUMAN_WORKSPACE_SCOPE_DENIED');
    // Native authorizeMutation, exact consent command, role, revision, immutable
    // task fence and local-evidence-only approval remain the original owner.
    value=native.decide(headers,request.command,contextSelection.nativeMutationGuard(headers,request.context));
   }else value=native.reconcile(headers,{invoiceId:c.primaryObject.objectId,effectId:request.effectId});
   value=operation==='reconcile'?Object.freeze({schemaVersion:value.schemaVersion,outcome:value.outcome,newDecisionEffect:value.newDecisionEffect,executionAuthorityGranted:value.executionAuthorityGranted,eventDigest:value.receipt?.eventDigest??null,readback:projection(value.readback,humanRoot)}):projection(value,humanRoot);
   contextSelection.verify(headers,request.context);
   return Object.freeze({schemaVersion:'pansphaira.workspace-erv-human/'+operation+'/v1',contextHandle:c.contextHandle,value,csrfProof:operation==='read'?sessions.workspaceMutationCsrf(headers):null});
  },close(){closed=true;owned.delete(api);}
 });owned.set(api,sessions.binding);return api;
}
export function isNativeWorkspaceErvHumanV1(value,binding){return Boolean(value&&owned.has(value)&&owned.get(value)===binding);}
