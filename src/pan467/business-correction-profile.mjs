// Closed additive LIFE-07 vocabulary over released LOCAL_SYNTHETIC draft stores.
import {join} from 'node:path';
import {scopeProfile,openNative,readMeta,decodeRow,canonicalJson,digest,exact,integer,fail,guardsMatch} from '../pan473/scope-profile.mjs';
export {openNative,canonicalJson,digest,exact,integer,fail};
export const PAN467_STORE_V1='pansphaira.pan467/business-correction-store/v1';
export const PAN467_INTENT_V1='pansphaira.pan467/business-correction-intent/v1';
export const PAN467_RECEIPT_V1='pansphaira.pan467/attributed-correction-receipt/v1';
export const PAN467_ACTOR='synthetic:correction-owner';
export const PAN467_LIMIT=4;
export const REQUEST_KEYS=Object.freeze(['requestId','sourceGeneration','epoch','id','originalRevision','originalEffectKey','expectedOriginalValue','correctedValue','externalCoverage','reason']);
export const GUARDS=Object.freeze([
 {name:'pan467_meta_delete',sql:"CREATE TRIGGER pan467_meta_delete BEFORE DELETE ON pan467_meta BEGIN SELECT RAISE(ABORT,'PAN467_BINDING_IMMUTABLE_DENIED'); END"},
 {name:'pan467_meta_binding',sql:"CREATE TRIGGER pan467_meta_binding BEFORE UPDATE ON pan467_meta WHEN NEW.id!=OLD.id OR NEW.binding!=OLD.binding BEGIN SELECT RAISE(ABORT,'PAN467_BINDING_IMMUTABLE_DENIED'); END"},
 {name:'pan467_intent_delete',sql:"CREATE TRIGGER pan467_intent_delete BEFORE DELETE ON pan467_intents BEGIN SELECT RAISE(ABORT,'PAN467_ORIGINAL_EFFECT_IMMUTABLE_DENIED'); END"},
 {name:'pan467_intent_core',sql:"CREATE TRIGGER pan467_intent_core BEFORE UPDATE ON pan467_intents WHEN NEW.effect_key!=OLD.effect_key OR NEW.intent!=OLD.intent BEGIN SELECT RAISE(ABORT,'PAN467_ORIGINAL_EFFECT_IMMUTABLE_DENIED'); END"},
 {name:'pan467_committed',sql:"CREATE TRIGGER pan467_committed BEFORE UPDATE ON pan467_intents WHEN OLD.state='COMMITTED' BEGIN SELECT RAISE(ABORT,'PAN467_COMMITTED_RECEIPT_IMMUTABLE_DENIED'); END"},
]);
export const journal=root=>join(root,'pan453-owned-v2');
export function binding(root){const {marker,profile}=scopeProfile(root);return {schemaVersion:PAN467_STORE_V1,scopeDigest:profile.scopeDigest,sourceProfileDigest:digest(marker)};}
export function readStore(db,root){
 const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('pan467_meta','pan467_intents') ORDER BY name").all();
 if(!tables.length)return null;
 if(tables.length!==2||!guardsMatch(db,GUARDS))fail('PAN467_STORE_SCHEMA_OR_GUARDS_DENIED');
 const meta=db.prepare('SELECT id,binding,lease FROM pan467_meta').all();
 if(meta.length!==1||meta[0].id!==1||meta[0].binding!==canonicalJson(binding(root)))fail('PAN467_STORE_BINDING_DENIED');
 const records=db.prepare('SELECT effect_key,intent,state,receipt FROM pan467_intents ORDER BY effect_key LIMIT ?').all(PAN467_LIMIT+1);
 if(records.length>PAN467_LIMIT)fail('PAN467_HISTORY_BOUND_DENIED');
 return {lease:JSON.parse(meta[0].lease),records};
}
export function nativeEvidence(root,id,originalRevision){
 const {marker,profile}=scopeProfile(root),source=openNative(root,'source'),target=openNative(root,'target');
 try{
  source.exec('BEGIN');target.exec('BEGIN');readMeta(source,marker);readMeta(target,marker);
  const old=source.prepare('SELECT id,kind,revision,deleted,body,sequence FROM events WHERE id=? AND revision=?').get(id,originalRevision);
  const retained=target.prepare('SELECT record FROM pan473_baseline WHERE id=?').get(id);
  const live=target.prepare('SELECT id,kind,revision,deleted,body,sequence FROM objects WHERE id=?').get(id);
  if(!old||!retained||!live)fail('PAN467_ORIGINAL_NATIVE_EVIDENCE_REQUIRED_DENIED');
  const original=decodeRow(old),baseline=JSON.parse(retained.record),current=decodeRow(live);
  if(id!=='synthetic:line-1'||originalRevision<2||original.kind!=='line'||original.deleted||original.body.orderId!=='synthetic:order-42'
    ||canonicalJson(original)!==canonicalJson(baseline)||current.deleted||current.kind!=='line')fail('PAN467_BOUNDED_ORIGINAL_REVISION_REQUIRED_DENIED');
  const events=target.prepare('SELECT event FROM pan473_target_events ORDER BY ordinal LIMIT 65').all().map(r=>JSON.parse(r.event));
  return {marker,profile,original,current,events};
 }finally{source.close();target.close();}
}
export function originalKey(e){return 'admin-ai:poc:pan467-correction:'+digest({scopeDigest:e.profile.scopeDigest,sourceGeneration:e.marker.sourceGeneration,id:e.original.id,originalRevision:e.original.revision,field:'priceMinor'});}
export function effectContent(request,e){
 return {schemaVersion:PAN467_INTENT_V1,scopeDigest:e.profile.scopeDigest,sourceGeneration:e.marker.sourceGeneration,targetIdentity:e.marker.targetIdentity,epoch:request.epoch,
  originalEffectKey:originalKey(e),id:request.id,originalRevision:request.originalRevision,field:'priceMinor',expectedOriginalValue:request.expectedOriginalValue,correctedValue:request.correctedValue,
  originalEvidenceDigest:digest(e.original),actor:PAN467_ACTOR,reason:request.reason,externalCoverage:'LOCAL_DRAFT_ONLY'};
}
export function nativeCorrection(content){return {id:content.id,originalRevision:content.originalRevision,field:'priceMinor',expectedOriginalValue:content.expectedOriginalValue,correctedValue:content.correctedValue,originalDigest:content.originalEvidenceDigest};}
export function matchingEvents(intent,events){return events.filter(e=>e.ordinal>intent.priorOrdinal&&e.kind==='FORWARD_CORRECTION'&&canonicalJson(e.correction)===canonicalJson(nativeCorrection(intent.content)));}
export function receiptCore(intent,event){return {schemaVersion:PAN467_RECEIPT_V1,originalEffectKey:intent.content.originalEffectKey,effectDigest:intent.effectDigest,scopeDigest:intent.content.scopeDigest,sourceGeneration:intent.content.sourceGeneration,epoch:intent.content.epoch,
 actor:intent.content.actor,reason:intent.content.reason,firstRequestId:intent.firstRequestId,originalEvidenceDigest:intent.content.originalEvidenceDigest,nativeEventDigest:event.eventDigest,nativeEventOrdinal:event.ordinal,correctionRevision:event.record.revision,correctedValue:intent.content.correctedValue};}
