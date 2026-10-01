// Closed, additive LOCAL_SYNTHETIC native SQLite draft profile. No legacy
// CREATE_IF_ABSENT, inventory or maintenance-preview permission is widened.
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { canonicalJson } from '../../dist/packages/contracts/src/canonical-json.js';
export { canonicalJson };
export const PAN472_PROFILE_V1 = 'pansphaira.pan472/synthetic-sqlite-draft/v1';
export const PAN472_PLAN_V1 = 'pansphaira.pan472/draft-transfer-plan/v1';
export const PAN472_RECEIPT_V1 = 'pansphaira.pan472/draft-transfer-receipt/v1';
export const PAN472_LIMITS_V1 = Object.freeze({objects:16,events:64,bytes:32768});
export const PAN472_MAPPING_V1 = Object.freeze({
  id:'pan472.synthetic-draft-exact-copy/v1',
  customer:Object.freeze(['nativeId','name']),
  order:Object.freeze(['customerId','date','refClient','status','currency','amountMinor']),
  line:Object.freeze(['orderId','quantityMicros','unit','priceMinor']),
  quantities:'INTEGER_MICROS_EXACT_NO_CONVERSION', money:'INTEGER_MINOR_EXACT_NO_CONVERSION',
  status:'DRAFT_ONLY', deletion:'VERSIONED_TOMBSTONE_NOT_ABSENCE', outsideEffects:'DISABLED',
});
export const digest = value => createHash('sha256').update(canonicalJson(value)).digest('hex');
export const PAN472_MAPPING_DIGEST_V1 = digest(PAN472_MAPPING_V1);
export const copy = value => JSON.parse(canonicalJson(value));
export const fail = code => { throw new Error(code); };
export const exact = (value, keys) => value!==null && typeof value==='object'
  && !Array.isArray(value) && Object.getPrototypeOf(value)===Object.prototype
  && canonicalJson(Object.keys(value).sort())===canonicalJson([...keys].sort());
export const integer = value => Number.isSafeInteger(value) && value>=0;
export const objectId = value => typeof value==='string' && /^synthetic:[a-z][a-z0-9-]{2,63}$/.test(value);
export const uuid = value => typeof value==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
export function rootPath(root) {
  if(typeof root!=='string' || !isAbsolute(root) || root!==resolve(root)
    || basename(root)!=='pan472-owned-v1') fail('OWNED_SYNTHETIC_ROOT_REQUIRED_DENIED');
  for(let p=root;;p=dirname(p)) {
    if(existsSync(p) && lstatSync(p).isSymbolicLink()) fail('SYMLINK_ROOT_DENIED');
    if(p===dirname(p))break;
  }
  return root;
}
export function readMarker(root) {
  rootPath(root);
  if(realpathSync(root)!==root)fail('SYMLINK_ROOT_DENIED');
  const p=join(root,'owned-profile.json');
  if(lstatSync(p).isSymbolicLink() || lstatSync(p).size>4096)fail('OWNED_MARKER_INVALID_DENIED');
  const m=JSON.parse(readFileSync(p,'utf8'));
  if(!exact(m,['schemaVersion','scope','tenant','sourceIdentity','sourceGeneration','targetIdentity','mappingDigest'])
    || m.schemaVersion!==PAN472_PROFILE_V1 || m.scope!=='LOCAL_SYNTHETIC_DISPOSABLE'
    || m.tenant!=='tenant:synthetic-pan472' || !uuid(m.sourceIdentity)
    || !uuid(m.sourceGeneration) || !uuid(m.targetIdentity)
    || m.mappingDigest!==PAN472_MAPPING_DIGEST_V1) fail('OWNED_MARKER_INVALID_DENIED');
  return m;
}
export function openNative(root,which,readOnly=true) {
  if(!['source','target'].includes(which))fail('STORE_KIND_DENIED');
  const p=join(root,`${which}.sqlite`);
  if(!existsSync(p) || !lstatSync(p).isFile() || lstatSync(p).isSymbolicLink())fail('NATIVE_STORE_REQUIRED_DENIED');
  const db=new DatabaseSync(p,{readOnly});
  db.exec('PRAGMA busy_timeout=5000;');
  if(!readOnly) db.exec('PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;');
  return db;
}
export function readMeta(db,m) {
  const r=db.prepare('SELECT value FROM meta WHERE key=?').get('owned-profile');
  if(!r || r.value!==canonicalJson(m))fail('SOURCE_GENERATION_OR_STORE_BINDING_DENIED');
}
export function validateRecord(r) {
  if(!exact(r,['id','kind','revision','deleted','body']) || !objectId(r.id)
    || !['customer','order','line'].includes(r.kind) || !integer(r.revision) || r.revision<1
    || typeof r.deleted!=='boolean')fail('DRAFT_RECORD_SHAPE_DENIED');
  if(r.deleted) {if(r.body!==null)fail('TOMBSTONE_CONTENT_DENIED');return;}
  const b=r.body;
  if(!exact(b,PAN472_MAPPING_V1[r.kind]))fail('DRAFT_MAPPING_SHAPE_DENIED');
  if(r.kind==='customer') {
    if(b.nativeId!==7 || b.name!=='Synthetic Customer')fail('SYNTHETIC_CUSTOMER_ONLY_DENIED');
  } else if(r.kind==='order') {
    if(!objectId(b.customerId) || b.date!==1767225600 || b.refClient!=='CM-ADMIN-AI-ESCALATION-001'
      || b.status!=='DRAFT' || b.currency!=='EUR' || !integer(b.amountMinor) || b.amountMinor>1000000000)
      fail('SYNTHETIC_DRAFT_ORDER_ONLY_DENIED');
  } else if(!objectId(b.orderId)
    || !(integer(b.quantityMicros) && b.quantityMicros<=100000000 || b.quantityMicros==='UNAVAILABLE')
    || !['piece','UNAVAILABLE'].includes(b.unit)
    || !(integer(b.priceMinor) && b.priceMinor<=1000000000 || b.priceMinor==='UNAVAILABLE'))fail('DRAFT_LINE_SEMANTICS_DENIED');
}
export function decodeRow(r) {
  if(!integer(r.sequence) || r.sequence<1 || ![0,1].includes(r.deleted))fail('NATIVE_ROW_SHAPE_DENIED');
  const decoded={id:r.id,kind:r.kind,revision:r.revision,deleted:r.deleted===1,body:r.body===null?null:JSON.parse(r.body)};
  validateRecord(decoded);
  return {...decoded,sequence:r.sequence};
}
export function references(rows) {
  const live=new Map(rows.filter(r=>!r.deleted).map(r=>[r.id,r]));
  const issues=[];
  if(rows.length>PAN472_LIMITS_V1.objects)issues.push({code:'SOURCE_OBJECT_BOUND'});
  if([...live.values()].filter(r=>r.kind==='order').length>1
    || [...live.values()].filter(r=>r.kind==='customer').length>1)issues.push({code:'AGGREGATE_SCOPE_BOUND'});
  for(const r of live.values()) {
    const reference=r.kind==='order'?r.body.customerId:r.kind==='line'?r.body.orderId:null;
    const expectedKind=r.kind==='order'?'customer':'order';
    if(reference && live.get(reference)?.kind!==expectedKind)issues.push({code:'BROKEN_REFERENCE',id:r.id});
    if(r.kind==='line' && Object.values(r.body).includes('UNAVAILABLE'))issues.push({code:'UNAVAILABLE_SEMANTICS',id:r.id});
  }
  return issues;
}
export function unknown(quarantine) {
  return {outcome:'UNKNOWN',coverage:'UNKNOWN',complete:false,quarantine,readOnly:true};
}
