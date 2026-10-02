// Closed vocabulary/native guards only. No controller decisions or grant issuer.
import { existsSync,lstatSync,readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
 canonicalJson,digest,exact,integer,readMarker,openNative,readMeta,decodeRow,
 validateRecord,references,fail,PAN472_LIMITS_V1,PAN472_MAPPING_DIGEST_V1,
} from '../pan472/draft-profile.mjs';
export {canonicalJson,digest,exact,integer,readMarker,openNative,readMeta,decodeRow,validateRecord,references,fail,PAN472_LIMITS_V1,PAN472_MAPPING_DIGEST_V1};
export const PAN473_PROFILE_V1='pansphaira.pan473/native-sqlite-writer-scope/v1';
export const PAN473_PLAN_V1='pansphaira.pan473/writer-scope-cutover-plan/v1';
export const PAN473_EVENT_V1='pansphaira.pan473/target-activity/v1';
export const ALTERNATIVE='COEXISTENCE_OR_OFFLINE_TRANSFER_REQUIRED';
export const capabilities=Object.freeze(['NATIVE_SQLITE_EPOCH_FENCE','NO_FENCE_GUARANTEE']);
export function profileCore(marker,sourceCapability){return {schemaVersion:PAN473_PROFILE_V1,sourceProfileDigest:digest(marker),sourceCapability};}
export function scopeProfile(root){
 const marker=readMarker(root),p=join(root,'pan473-profile.json');
 if(!existsSync(p)||!lstatSync(p).isFile()||lstatSync(p).isSymbolicLink()||lstatSync(p).size>4096)fail('PAN473_OWNED_PROFILE_REQUIRED_DENIED');
 const v=JSON.parse(readFileSync(p,'utf8'));
 if(!exact(v,['schemaVersion','sourceProfileDigest','sourceCapability','scopeDigest'])||!capabilities.includes(v.sourceCapability)
  ||v.schemaVersion!==PAN473_PROFILE_V1||v.sourceProfileDigest!==digest(marker)||v.scopeDigest!==digest(profileCore(marker,v.sourceCapability)))fail('PAN473_SCOPE_BINDING_DENIED');
 return {marker,profile:v};
}
export function openScope(root,readOnly=true){
 scopeProfile(root);const p=join(root,'pan473-scope.sqlite');
 if(!existsSync(p)||!lstatSync(p).isFile()||lstatSync(p).isSymbolicLink()||lstatSync(p).size>2097152)fail('PAN473_SCOPE_STORE_REQUIRED_DENIED');
 const db=new DatabaseSync(p,{readOnly});db.exec('PRAGMA busy_timeout=5000;');if(!readOnly)db.exec('PRAGMA synchronous=FULL;');return db;
}
export function transaction(db,work){db.exec('BEGIN IMMEDIATE');try{const r=work();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}
export function metadata(db,key){const r=db.prepare('SELECT value FROM meta WHERE key=?').get(key);if(!r)fail('PAN473_METADATA_REQUIRED_DENIED');return JSON.parse(r.value);}
export function storeMetadata(db,key,value){db.prepare('UPDATE meta SET value=? WHERE key=?').run(canonicalJson(value),key);}
export const SOURCE_GUARDS=Object.freeze(['objects','events','meta'].flatMap(table=>['INSERT','UPDATE','DELETE'].map(action=>({
 name:`pan473_source_${table}_${action.toLowerCase()}`,
 sql:`CREATE TRIGGER pan473_source_${table}_${action.toLowerCase()} BEFORE ${action} ON ${table} WHEN (SELECT mode FROM pan473_gate WHERE id=1)!='ACTIVE' BEGIN SELECT RAISE(ABORT,'PAN473_SOURCE_FENCED_DENIED'); END`,
}))));
const epochGuard=`SELECT CASE WHEN pan473_writer_epoch()!=(SELECT epoch FROM pan473_gate WHERE id=1) OR pan473_route_ready()!=1 THEN RAISE(ABORT,'PAN473_STALE_TARGET_AUTHORITY_DENIED') END;`;
export const TARGET_GUARDS=Object.freeze([
 ...['objects'].flatMap(table=>['INSERT','UPDATE','DELETE'].map(action=>({name:`pan473_target_${table}_${action.toLowerCase()}`,sql:`CREATE TRIGGER pan473_target_${table}_${action.toLowerCase()} BEFORE ${action} ON ${table} BEGIN ${epochGuard} END`}))),
 {name:'pan473_target_event_insert',sql:`CREATE TRIGGER pan473_target_event_insert BEFORE INSERT ON pan473_target_events BEGIN ${epochGuard} END`},
 ...['UPDATE','DELETE'].map(action=>({name:`pan473_target_event_${action.toLowerCase()}`,sql:`CREATE TRIGGER pan473_target_event_${action.toLowerCase()} BEFORE ${action} ON pan473_target_events BEGIN SELECT RAISE(ABORT,'PAN473_TARGET_HISTORY_IMMUTABLE_DENIED'); END`})),
 ...['pan473_baseline','dedup','approvals','receipts','outside_effects','meta'].flatMap(table=>['INSERT','UPDATE','DELETE'].map(action=>({name:`pan473_preserve_${table}_${action.toLowerCase()}`,sql:`CREATE TRIGGER pan473_preserve_${table}_${action.toLowerCase()} BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT,'PAN473_LATE_IMPORT_OR_OLD_EVIDENCE_MUTATION_DENIED'); END`}))),
]);
export function guardsMatch(db,guards){return guards.every(g=>db.prepare('SELECT sql FROM sqlite_master WHERE type=? AND name=?').get('trigger',g.name)?.sql===g.sql);}
export function processBirth(pid){
 if(!Number.isSafeInteger(pid)||pid<1)return {state:'UNKNOWN'};
 try{
  const raw=readFileSync(`/proc/${pid}/stat`,'utf8');const fields=raw.slice(raw.lastIndexOf(')')+2).trim().split(/\s+/);
  return {state:fields[0]==='Z'?'DEAD':'LIVE',birth:readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim()+':'+fields[19]};
 }catch(e){return {state:e.code==='ENOENT'?'DEAD':'UNKNOWN'};}
}
export function leaseState(lease){if(lease===null)return 'IDLE';if(!exact(lease,['pid','birth','token']))return 'UNKNOWN';const p=processBirth(lease.pid);return p.state==='LIVE'&&p.birth!==lease.birth?'DEAD':p.state;}
export const alternative=()=>({outcome:ALTERNATIVE,complete:false,readOnly:true,alternative:'COEXISTENCE_OR_OFFLINE_TRANSFER',cutoverAuthorized:false});
