// Issue-local one-lease broker. Reservation is synchronous before any provider await.
// Reuses UNCHANGED PAN360 intake/core. No productive-provider or cloud authority.
import {admitPan396InvoiceEventV1,validatePan396BindingV1} from '../../dist/packages/contracts/src/floci-invoice-lab-v1.js';
import {loadOriginalErvProfileV1,evaluateOriginalErvCaseV1,originalCoreIdentityV1,digest,sha256,canonical,freeze} from '../pan360/original-erv-core-v1.mjs';
import {createOriginalInvoiceStoreV1,intakeOriginalInvoiceV1,readOriginalInvoiceV1,originalInputIdentityV1} from '../pan360/original-invoice-input-v1.mjs';
import {createHash} from 'node:crypto';
const deny=(reasonCode,partialEffects={})=>freeze({outcome:'DENIED',reasonCode,partialEffects,productivePostingAuthorized:false,bookingAuthorityGranted:false});
export class Pan396InvoiceBrokerV1 {
 #binding;#reader;#store;#persist;#readEvidence;#keys=new Map();#events=new Map();#evidence=new Map();
 #stats={objectReadAttempts:0,intakeInvocations:0,intakeInserted:0,coreInvocations:0,evidencePersisted:0,independentEvidenceReads:0};
 constructor(binding,{readObject,store=createOriginalInvoiceStoreV1(),persistEvidence,readEvidence}={}){
  if(!validatePan396BindingV1(binding)||typeof readObject!=='function')throw new Error('PAN396_BROKER_CONTEXT_DENIED');
  this.#binding=freeze(structuredClone(binding));this.#reader=readObject;this.#store=store;
  this.#persist=persistEvidence??(async(id,record)=>{if(this.#evidence.has(id))throw new Error('EVIDENCE_ID_CONFLICT');this.#evidence.set(id,structuredClone(record));});
  this.#readEvidence=readEvidence??(async(id)=>structuredClone(this.#evidence.get(id)??null));
 }
 get statistics(){return freeze({...this.#stats,reservedKeys:this.#keys.size,reservedEvents:this.#events.size});}
 async #bounded(factory){
  if(Date.now()>=this.#binding.deadlineEpochMs)throw new Error('PAN396_DEADLINE');
  const abort=new AbortController();let timer;
  try{const value=await Promise.race([Promise.resolve().then(()=>factory(abort.signal)),new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(new Error('PAN396_DEADLINE'));},Math.max(0,this.#binding.deadlineEpochMs-Date.now()));})]);if(Date.now()>=this.#binding.deadlineEpochMs)throw new Error('PAN396_DEADLINE');return value;}
  finally{clearTimeout(timer);}
 }
 async process(envelope){
  const admission=admitPan396InvoiceEventV1(envelope,this.#binding);if(admission.outcome!=='ADMITTED')return deny(admission.reasonCode);
  const event=admission.event;const prior=this.#events.get(event.messageId);if(prior)return deny(prior.bodySha256===event.bodySha256?'DUPLICATE_EVENT_DENIED':'DUPLICATE_EVENT_BODY_CONFLICT');
  const key=event.bucket+'/'+event.key;if(this.#keys.has(key))return deny('KEY_CONFLICT_DENIED');
  // The lease is CONSUMED even on uncertain readback. No blind retry or reservation release.
  const reservation={bodySha256:event.bodySha256,phase:'RESERVED'};this.#events.set(event.messageId,reservation);this.#keys.set(key,reservation);
  let read;
  this.#stats.objectReadAttempts++;
  try{read=await this.#bounded(signal=>this.#reader({namespace:event.namespace,bucket:event.bucket,key:event.key,operation:'GetObject',signal}));}
  catch(error){reservation.phase='READ_UNCERTAIN';return deny(error.message==='PAN396_DEADLINE'?'TIMEOUT':'OBJECT_READ_FAILED', {readAttempted:true,leaseConsumed:true});}
  if(Date.now()>=this.#binding.deadlineEpochMs){reservation.phase='READ_LATE';return deny('TIMEOUT',{readAttempted:true,leaseConsumed:true});}
  if(read?.status!==200||!(read.bytes instanceof Uint8Array)){reservation.phase='OBJECT_MISSING';return deny('MISSING_OBJECT_READBACK',{readAttempted:true,leaseConsumed:true});}
  if(read.namespace!==event.namespace||read.bucket!==event.bucket||read.key!==event.key||read.operation!=='GetObject'){reservation.phase='READ_SCOPE_DENIED';return deny('OBJECT_READBACK_SCOPE_DENIED');}
  const bytes=Uint8Array.from(read.bytes);if(bytes.byteLength!==event.byteLength||sha256(bytes)!==event.contentSha256||createHash('md5').update(bytes).digest('hex')!==event.objectMd5||read.eTag!=='"'+event.objectMd5+'"'){reservation.phase='PAYLOAD_DENIED';return deny('STALE_OR_SUBSTITUTED_OBJECT_DENIED',{objectWasRead:true,leaseConsumed:true});}
  const core=originalCoreIdentityV1();const input=originalInputIdentityV1();const profile=loadOriginalErvProfileV1();const doc=profile.documents.find(d=>d.id==='high');
  this.#stats.intakeInvocations++;
  let intake;try{intake=await this.#bounded(()=>intakeOriginalInvoiceV1({schemaVersion:'pansphaira.pan360/invoice-request/v1',documentId:'high',bytes,claimedSha256:event.contentSha256,requestedEffects:['READ_SYNTHETIC','WRITE_LOCAL_PROOF'],cancelled:false},this.#store).then(r=>{if(r.outcome==='ACCEPTED')this.#stats.intakeInserted++;return r;}));}catch(error){reservation.phase='INTAKE_UNCERTAIN';return deny(error.message==='PAN396_DEADLINE'?'TIMEOUT':'INTAKE_FAILED_UNCERTAIN',{intakeAttempted:true,intakeMayHaveLanded:true,leaseConsumed:true});}
  if(intake.outcome!=='ACCEPTED'){reservation.phase='INTAKE_DENIED';return deny('ORIGINAL_INTAKE_'+intake.reasonCode);}
  let reread;try{reread=await this.#bounded(()=>readOriginalInvoiceV1(intake.record.version.versionId,this.#store));}catch(error){reservation.phase='INTAKE_READBACK_UNCERTAIN';return deny(error.message==='PAN396_DEADLINE'?'TIMEOUT':'INTAKE_READBACK_FAILED',{intakeInserted:true,leaseConsumed:true});}
  if(reread.outcome!=='FOUND'||reread.recordDigest!==intake.record.recordDigest){reservation.phase='INTAKE_READBACK_FAILED';return deny('MISSING_INTAKE_READBACK',{intakeInserted:true,leaseConsumed:true});}
  if(Date.now()>=this.#binding.deadlineEpochMs){reservation.phase='INTAKE_READBACK_LATE';return deny('TIMEOUT',{intakeInserted:true,leaseConsumed:true});}
  const candidate=profile.cases.find(c=>c.caseId==='lean-no-po-no-receipt');const invoice=candidate.references.find(r=>r.body.referenceKind==='INVOICE');
  if(reread.extraction.fields.grossAmountMinor.state!=='KNOWN'||reread.extraction.fields.grossAmountMinor.value!==doc.grossAmountMinor||invoice.body.matchAmountMinor!==doc.grossAmountMinor||invoice.body.supplierId!==doc.supplierId||invoice.body.currency!==doc.currency)throw new Error('PAN396_UNCHANGED_CORE_INPUT_BINDING_DENIED');
  this.#stats.coreInvocations++;const decision=evaluateOriginalErvCaseV1(candidate);
  if(decision.outcome!=='MATCHED'||decision.authority.productivePostingAuthorized!==false||decision.authority.bookingAuthorityGranted!==false)throw new Error('PAN396_CORE_AUTHORITY_NONCLAIM_DENIED');
  const unsigned={schemaVersion:'pansphaira.pan396/bounded-invoice-evidence/v1',binding:this.#binding,event,independentObjectReadback:{contentSha256:sha256(bytes),byteLength:bytes.byteLength,eTag:read.eTag},originalInputReadback:reread,originalInputIdentity:input,originalCoreIdentity:core,decision,
   coreInvocation:'evaluateOriginalErvCaseV1',coreCandidateDigest:digest(candidate),nonclaims:['LOCAL_SYNTHETIC_LAB_ONLY','ONE_IN_MEMORY_LEASE_NOT_DURABLE_GLOBAL_DEDUP','EMULATOR_SELECTION_NOT_AUTHENTICATION','NO_HUMAN_WORKFLOW','NO_CUSTOMER_OR_PRODUCTIVE_AUTHORITY','NO_AWS_COMPATIBILITY_OR_SECURITY_PROOF']};
  const evidence=freeze({...unsigned,evidenceSha256:digest(unsigned)});const id='pan396:evidence:'+digest({namespace:event.namespace,messageId:event.messageId,key:event.key});
  try{await this.#bounded(signal=>Promise.resolve(this.#persist(id,evidence,{signal})).then(()=>{this.#stats.evidencePersisted++;}));}catch(error){reservation.phase='EVIDENCE_PERSIST_UNCERTAIN';return deny(error.message==='PAN396_DEADLINE'?'TIMEOUT':'EVIDENCE_PERSIST_FAILED_UNCERTAIN',{intakeInserted:true,coreInvoked:true,evidenceMayHaveLanded:true,leaseConsumed:true});}
  this.#stats.independentEvidenceReads++;let independent;try{independent=await this.#bounded(signal=>this.#readEvidence(id,{signal}));}catch(error){reservation.phase='EVIDENCE_READBACK_UNCERTAIN';return deny(error.message==='PAN396_DEADLINE'?'TIMEOUT':'EVIDENCE_READBACK_FAILED',{intakeInserted:true,coreInvoked:true,evidencePersisted:true,leaseConsumed:true});}
  if(!independent||canonical(independent)!==canonical(evidence)||!verifyPan396BoundedEvidenceV1(independent)){reservation.phase='EVIDENCE_READBACK_FAILED';return deny('MISSING_OR_SUBSTITUTED_EVIDENCE_READBACK',{intakeInserted:true,coreInvoked:true,evidencePersisted:true,leaseConsumed:true});}
  reservation.phase='READBACK_VERIFIED';return freeze({outcome:'BOUNDED_EVIDENCE_VERIFIED',evidenceId:id,evidence:independent,productivePostingAuthorized:false,bookingAuthorityGranted:false});
 }
}
export function verifyPan396BoundedEvidenceV1(value){
 try{const {evidenceSha256,...unsigned}=value;return digest(unsigned)===evidenceSha256&&validatePan396BindingV1(value.binding)&&value.event.contentSha256===value.binding.contentSha256&&value.independentObjectReadback.contentSha256===value.binding.contentSha256&&value.originalInputReadback.contentSha256===value.binding.contentSha256&&value.originalInputReadback.outcome==='FOUND'&&value.decision.outcome==='MATCHED'&&value.decision.matchedAmountMinor===1200000&&value.decision.authority.productivePostingAuthorized===false&&value.decision.authority.bookingAuthorityGranted===false&&value.coreInvocation==='evaluateOriginalErvCaseV1'&&value.originalCoreIdentity.coreDigest===originalCoreIdentityV1().coreDigest&&value.originalInputIdentity.inputDigest===originalInputIdentityV1().inputDigest;}catch{return false;}
}
