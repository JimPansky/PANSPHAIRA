// Narrow versioned synthetic intake admission. Historical AP02 bytes/pins and
// intake contract are not loosened. Only four explicitly owned, pinned documents
// enter this successor; extraction and the actual in-memory store are reused.
import { readFileSync } from 'node:fs';
import { InMemorySyntheticInvoiceIntakeStoreV1 } from '../../dist/packages/contracts/src/incoming-invoice-intake.js';
import { extractSyntheticSupplierInvoiceFieldsV1 } from '../../dist/packages/contracts/src/incoming-invoice-extraction-dataflow-v2.js';
import { loadOriginalErvProfileV1, originalCoreIdentityV1, sha256, digest, canonical, freeze } from './original-erv-core-v1.mjs';
const ROOT = new URL('../../', import.meta.url);
const EXTRACTOR_PINS = [
  ['packages/contracts/src/incoming-invoice-extraction-dataflow-v2.ts','d7aaf42607c521db66b0b6fd209c033c4eb75a01ae023d430888a6681f98d2fe'],
  ['dist/packages/contracts/src/incoming-invoice-extraction-dataflow-v2.js','f05ab917dc1a6cac2fbbaf67162eb01b146be3972801e899ba9c58020bb039e8'],
];
export function originalInputIdentityV1() {
  originalCoreIdentityV1();
  const bindings=EXTRACTOR_PINS.map(([path,expected])=>{
    const actual=sha256(readFileSync(new URL(path,ROOT)));
    if(actual!==expected)throw new Error('PAN360_EXTRACTOR_SOURCE_IDENTITY_DENIED:'+path);
    return {path,sha256:actual};
  });
  bindings.push({path:'src/pan360/original-invoice-input-v1.mjs',sha256:sha256(readFileSync(new URL('./original-invoice-input-v1.mjs',import.meta.url)))});
  return freeze({schemaVersion:'pansphaira.pan360/invoice-input-identity/v1',bindings,inputDigest:digest(bindings)});
}
export const createOriginalInvoiceStoreV1=()=>new InMemorySyntheticInvoiceIntakeStoreV1();
function buildRecord(doc,bytes) {
  const versionId='pan360:version:sha256:'+digest({documentId:doc.id,contentSha256:doc.sha256});
  const identity={supplierId:doc.supplierId,invoiceNumber:doc.invoiceNumber};
  const unsigned={schemaVersion:'pansphaira.pan360/invoice-record/v1',document:{documentId:doc.id,documentKind:'SUPPLIER_INVOICE'},
    version:{versionId,ordinal:1,contentSha256:doc.sha256,byteLength:bytes.byteLength},
    supplierInvoiceIdentity:{...identity,identityDigest:digest(identity)},
    original:{bytesBase64:Buffer.from(bytes).toString('base64'),path:doc.path,provenance:doc.provenance},
    extraction:extractSyntheticSupplierInvoiceFieldsV1(Buffer.from(bytes).toString('utf8'),versionId),
    authority:{mode:'LOCAL_SYNTHETIC_PROOF',customerDataAuthorized:false,productiveBookingAuthorized:false,externalCallsAuthorized:false}};
  return freeze({...unsigned,recordDigest:digest(unsigned)});
}
export function originalInvoiceRequestV1(documentId='high') {
  const doc=loadOriginalErvProfileV1().documents.find(x=>x.id===documentId);
  if(!doc)throw new Error('PAN360_DOCUMENT_VARIANT_UNKNOWN');
  return {schemaVersion:'pansphaira.pan360/invoice-request/v1',documentId,bytes:Uint8Array.from(readFileSync(new URL(doc.path,ROOT))),claimedSha256:doc.sha256,requestedEffects:['READ_SYNTHETIC','WRITE_LOCAL_PROOF'],cancelled:false};
}
const deny=reason=>freeze({outcome:'DENIED',reasonCode:reason});
function requestShape(r) {
  return r!==null && typeof r==='object' && Object.getPrototypeOf(r)===Object.prototype
    && canonical(Object.keys(r).sort())===canonical(['schemaVersion','documentId','bytes','claimedSha256','requestedEffects','cancelled'].sort())
    && r.schemaVersion==='pansphaira.pan360/invoice-request/v1' && typeof r.documentId==='string'
    && r.bytes instanceof Uint8Array && typeof r.claimedSha256==='string' && Array.isArray(r.requestedEffects) && typeof r.cancelled==='boolean';
}
export async function intakeOriginalInvoiceV1(request,store) {
  originalInputIdentityV1();
  if(!requestShape(request))return deny('INPUT_SHAPE_DENIED');
  if(canonical(request.requestedEffects)!==canonical(['READ_SYNTHETIC','WRITE_LOCAL_PROOF']))return deny('EFFECT_DENIED');
  if(request.cancelled)return freeze({outcome:'CANCELLED',reasonCode:'CANCELLED_BEFORE_INTAKE'});
  const doc=loadOriginalErvProfileV1().documents.find(x=>x.id===request.documentId);
  if(!doc)return deny('DOCUMENT_VARIANT_UNKNOWN');
  const bytes=Uint8Array.from(request.bytes);
  if(request.claimedSha256!==doc.sha256 || sha256(bytes)!==doc.sha256)return deny('TAMPERED_CONTENT_DENIED');
  const versionId='pan360:version:sha256:'+digest({documentId:doc.id,contentSha256:doc.sha256});
  const text=Buffer.from(bytes).toString('utf8');
  const fields=Object.fromEntries(text.trim().split('\n').slice(1).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));
  if(fields.supplier_id!==doc.supplierId || fields.invoice_number!==doc.invoiceNumber || fields.currency!==doc.currency)return deny('DOCUMENT_IDENTITY_DENIED');
  const extraction=extractSyntheticSupplierInvoiceFieldsV1(text,versionId);
  if(extraction.fields.grossAmountMinor.state!=='KNOWN' || extraction.fields.grossAmountMinor.value!==doc.grossAmountMinor)return deny('OBSERVED_AMOUNT_BINDING_DENIED');
  const record=buildRecord(doc,bytes);
  const result=await store.insertIfAbsent(record);
  if(result!=='INSERTED')return deny(result==='DUPLICATE_CONTENT'?'DUPLICATE_CONTENT_DENIED':result==='DUPLICATE_IDENTITY'?'DUPLICATE_IDENTITY_DENIED':'STORE_DENIED');
  return freeze({outcome:'ACCEPTED',record});
}
export async function readOriginalInvoiceV1(versionId,store) {
  const stored=await store.getByVersionId(versionId);
  if(!stored)return freeze({outcome:'NOT_FOUND'});
  try {
    const doc=loadOriginalErvProfileV1().documents.find(d=>d.id===stored.document.documentId);
    const {recordDigest,...unsigned}=stored;
    const bytes=Buffer.from(stored.original.bytesBase64,'base64');
    if(!doc || versionId!==stored.version.versionId || sha256(bytes)!==doc.sha256
      || digest(unsigned)!==recordDigest || canonical(stored)!==canonical(buildRecord(doc,bytes)))return deny('INTEGRITY_READBACK_DENIED');
    return freeze({outcome:'FOUND',versionId,contentSha256:doc.sha256,recordDigest,extraction:stored.extraction,source:doc.provenance});
  } catch{return deny('INTEGRITY_READBACK_DENIED');}
}
