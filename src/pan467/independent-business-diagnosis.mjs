// Separate read-only SQL diagnosis, no mutation implementation or grant issuer.
// Reconstructs attribution from retained intent and actual released native event.
import {diagnosePan473WriterScope} from '../pan473/independent-scope-diagnosis.mjs';
import {leaseState} from '../pan473/scope-profile.mjs';
import {PAN467_ACTOR,PAN467_INTENT_V1,PAN467_RECEIPT_V1,readStore,nativeEvidence,originalKey,effectContent,openNative,canonicalJson,digest,exact,integer} from './business-correction-profile.mjs';
const unknown=code=>({outcome:'UNKNOWN',readOnly:true,complete:false,quarantine:[{code}]});
export function diagnosePan467BusinessCorrection({root}){
 let db;
 try{
  const native=diagnosePan473WriterScope({root});if(native.outcome!=='ACTIVE'||!native.complete||native.outsideEffectCount!==0)return unknown('PAN467_NATIVE_RECOVERY_OR_COVERAGE_UNQUALIFIED');
  db=openNative(root,'target');db.exec('BEGIN');const state=readStore(db,root);
  if(!state)return {outcome:'READY_NOT_CORRECTED',readOnly:true,complete:false,correctionCount:0,native,quarantine:[]};
  const ownerState=leaseState(state.lease);if(ownerState==='UNKNOWN')return unknown('PAN467_CORRECTION_OWNER_LIVENESS_UNKNOWN');
  let committed=0,pending=0,observedPending=0;const corrections=[];
  for(const row of state.records){
   const intent=JSON.parse(row.intent);
   if(!exact(intent,['content','effectDigest','firstRequestId','priorOrdinal','recordedAtMs'])||!integer(intent.priorOrdinal)||!integer(intent.recordedAtMs)
     ||typeof intent.firstRequestId!=='string'||!/^synthetic:[a-z0-9-]{3,64}$/.test(intent.firstRequestId))return unknown('PAN467_INTENT_SHAPE_OR_REQUEST_BINDING');
   const c=intent.content;
   if(c.schemaVersion!==PAN467_INTENT_V1||c.actor!==PAN467_ACTOR||c.externalCoverage!=='LOCAL_DRAFT_ONLY'||!integer(c.correctedValue)||c.correctedValue>1000000000
     ||typeof c.reason!=='string'||c.reason.length<1||c.reason.length>120||/[\x00-\x1f]/.test(c.reason))return unknown('PAN467_ATTRIBUTION_OR_COVERAGE_BINDING');
   const e=nativeEvidence(root,c.id,c.originalRevision);
   const request={epoch:native.targetEpoch,id:c.id,originalRevision:c.originalRevision,expectedOriginalValue:e.original.body.priceMinor,correctedValue:c.correctedValue,reason:c.reason};
   const expected=effectContent(request,e);
   if(canonicalJson(c)!==canonicalJson(expected)||intent.effectDigest!==digest(expected)||row.effect_key!==originalKey(e)||c.correctedValue===c.expectedOriginalValue
     ||intent.priorOrdinal>e.events.length)return unknown('PAN467_ORIGINAL_EFFECT_GENERATION_OR_CONTENT_BINDING');
   // Not a writer success flag: find the independently verified native transition.
   const matches=e.events.filter(event=>event.ordinal>intent.priorOrdinal&&event.kind==='FORWARD_CORRECTION'
     &&event.record.id===c.id&&event.correction.originalRevision===c.originalRevision&&event.correction.field==='priceMinor'
     &&event.correction.originalDigest===digest(e.original)&&event.correction.expectedOriginalValue===c.expectedOriginalValue&&event.correction.correctedValue===c.correctedValue);
   if(matches.length>1)return unknown('PAN467_AMBIGUOUS_ORIGINAL_NATIVE_EFFECT');
   if(row.state==='COMMITTED'){
    if(matches.length!==1||row.receipt===null)return unknown('PAN467_COMMITTED_NATIVE_EVENT_REQUIRED');
    const event=matches[0],receipt=JSON.parse(row.receipt),{receiptDigest,...core}=receipt;
    const expectedReceipt={schemaVersion:PAN467_RECEIPT_V1,originalEffectKey:originalKey(e),effectDigest:digest(expected),scopeDigest:e.profile.scopeDigest,sourceGeneration:e.marker.sourceGeneration,epoch:native.targetEpoch,
     actor:PAN467_ACTOR,reason:c.reason,firstRequestId:intent.firstRequestId,originalEvidenceDigest:digest(e.original),nativeEventDigest:event.eventDigest,nativeEventOrdinal:event.ordinal,correctionRevision:event.record.revision,correctedValue:c.correctedValue};
    if(canonicalJson(core)!==canonicalJson(expectedReceipt)||receiptDigest!==digest(expectedReceipt))return unknown('PAN467_ATTRIBUTED_NATIVE_RECEIPT_MISMATCH');
    committed++;corrections.push({originalEffectKey:row.effect_key,actor:receipt.actor,originalRevision:c.originalRevision,correctionRevision:event.record.revision,nativeEventOrdinal:event.ordinal,receiptDigest,firstRequestId:intent.firstRequestId});
   }else if(row.state==='PENDING'&&row.receipt===null){
    pending++;if(matches.length===1)observedPending++;
    else{
     let before=e.original;
     for(const event of e.events){if(event.record.id!==c.id)continue;if(before.body.priceMinor!==event.record.body?.priceMinor)return unknown('PAN467_PENDING_CORRECTION_OBSOLETE_BY_LATER_VALID_PRICE');before=event.record;}
    }
   }else return unknown('PAN467_INTENT_STATE_RECEIPT_CONTRADICTION');
  }
  return {outcome:pending?'PENDING_NATIVE_READBACK_REQUIRED':committed?'VERIFIED':'READY_NOT_CORRECTED',readOnly:true,complete:pending===0&&committed>0,correctionCount:committed,pendingCount:pending,nativeEffectsAwaitingAttributionCommit:observedPending,
   correctionOwnerState:ownerState,originalEvidencePreserved:native.originalEvidencePreserved,laterTargetWorkVerified:native.laterTargetWorkVerified,outsideEffectCount:native.outsideEffectCount,corrections,native,quarantine:[]};
 }catch(error){return unknown(error.message);}finally{db?.close();}
}
