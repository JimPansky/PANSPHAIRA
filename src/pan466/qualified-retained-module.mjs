// Additive LIFE-06 composition of the accepted fixed native controller.
// Trusted owner inputs only; not a scheduler, general sandbox, arbitrary pair,
// native grant mint or automatic authority from the CHECK_ONLY module CLI.
import {readFileSync,mkdirSync,writeFileSync,readdirSync,openSync,closeSync,fsyncSync,lstatSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createRetainedPairControllerV1} from '../pan464/retained-pair-controller.mjs';
import {strictOwnedPathV1} from '../pan464/retained-snapshot.mjs';
import {CONSUMER_KS_V1} from '../pan464/retained-pair-plan.mjs';
import {lifecycleDigestV1,canonicalLifecycleV1} from './module-lifecycle-check.mjs';
const same=(a,b)=>canonicalLifecycleV1(a)===canonicalLifecycleV1(b);
const fields=['schemaVersion','moduleId','generation','descriptorDigest','consumerCommit','targetCommit','imageId'];
const fail=code=>{throw Error(`PAN466_${code}`);};
function descriptorIdentity({targetCommit,imageId}){
 return {moduleId:'pan466-retained-pair',source:'PAN464_FIXED_POSTGRES_SUPERSET',consumerCommit:CONSUMER_KS_V1,
  recovery:{history:'APPEND_ONLY_OBSERVED_ROWS',deferred:'REVALIDATE_CURRENT_BEFORE_NATIVE_START'},targetCommit,imageId};
}
function validBinding(value){
 return value&&typeof value==='object'&&!Array.isArray(value)&&same(Object.keys(value).sort(),[...fields].sort())&&value.schemaVersion===1
  &&value.moduleId==='pan466-retained-pair'&&Number.isSafeInteger(value.generation)&&value.generation>0
  &&/^[a-f0-9]{64}$/.test(value.descriptorDigest)&&value.consumerCommit===CONSUMER_KS_V1
  &&/^[a-f0-9]{40}$/.test(value.targetCommit)&&/^sha256:[a-f0-9]{64}$/.test(value.imageId)
  &&value.descriptorDigest===lifecycleDigestV1(descriptorIdentity(value));
}
// The descriptor is this closed native adapter's semantic identity, not a
// claim that the eight-module pilot graph covers all native/repository code.
export function retainedModuleBindingV1({targetHead,imageId,generation=1}){
 const semantic=descriptorIdentity({targetCommit:targetHead,imageId});
 const value={schemaVersion:1,moduleId:semantic.moduleId,generation,descriptorDigest:lifecycleDigestV1(semantic),consumerCommit:CONSUMER_KS_V1,targetCommit:targetHead,imageId};
 if(!validBinding(value))fail('BINDING_REQUIRED');return Object.freeze(value);
}
export function createQualifiedRetainedModuleV1({processBinding,readCurrentModule,readHistoryPermission,...nativeOptions}){
 if(!validBinding(processBinding)||processBinding.targetCommit!==nativeOptions.targetHead||processBinding.imageId!==nativeOptions.imageId
  ||typeof readCurrentModule!=='function'||typeof readHistoryPermission!=='function'||typeof nativeOptions.readPermission!=='function')fail('TRUSTED_INPUTS_REQUIRED');
 const binding=Object.freeze(structuredClone(processBinding)),permissionReader=nativeOptions.readPermission;
 const historyRoot=join(nativeOptions.ownedRoot,'pan466-history-v1');strictOwnedPathV1(nativeOptions.ownedRoot,historyRoot,{exists:false});mkdirSync(historyRoot,{mode:0o700});
 let qualification=null,denial=null;
 async function guardedPermission(){
  denial=null;
  try{
   if(!qualification)fail('PAIR_QUALIFICATION_REQUIRED');
   const current=await readCurrentModule();
   if(!validBinding(current))fail('CURRENT_MODULE_UNKNOWN_HELD');
   if(!same(current,binding))fail('CURRENT_GENERATION_OR_COMPATIBILITY_CHANGED_HELD');
  }catch(error){denial=error.message;throw error;}
  // Existing native authority() checks the exact independent grant fields,
  // actual revocation/expiry/fence, and current durable STOP/REVOKE separately.
  return permissionReader();
 }
 const native=createRetainedPairControllerV1({...nativeOptions,readPermission:guardedPermission});
 async function invoke(fn){denial=null;try{return await fn();}catch(error){if(denial)throw Error(denial);throw error;}}
 function retain(stage,observed){
  // Actual observed invoice rows and consumer readback, never expected rows.
  const content={producer:{rows:observed.producer.rows,dataDigest:observed.producer.dataDigest,generation:observed.producer.generation,migrationCount:observed.producer.migrationCount},consumer:observed.consumer};
  const core={schemaVersion:1,binding,qualificationDigest:qualification,stage,content};
  const record={...core,digest:lifecycleDigestV1(core)};
  const path=join(historyRoot,`${binding.generation}-${stage}.json`);
  writeFileSync(path,JSON.stringify(record)+'\n',{flag:'wx',mode:0o400,flush:true});
  const fd=openSync(historyRoot,'r');try{fsyncSync(fd);}finally{closeSync(fd);}
  return record.digest;
 }
 return Object.freeze({namespace:native.namespace,edge:native.edge,processBinding:binding,
  async qualifyPairs(){const pairs=await native.qualifyPairs();qualification=lifecycleDigestV1({binding,pairs});return {classification:'LOCAL_SYNTHETIC_EXACT_NATIVE_PAIR',qualificationDigest:qualification};},
  async initialize(){const observed=await invoke(()=>native.initialize());retain('SOURCE',observed);return observed;},
  async upgrade(request){const result=await invoke(()=>native.upgrade(request));if(result.outcome==='ACTIVE')retain('ACTIVE',result.observed);return result;},
  async writeAfterActivation(...args){if(args.length)fail('WRITE_REQUEST_SUBSTITUTION_DENIED');const observed=await invoke(()=>native.writeAfterActivation());retain('NEW_WRITES',observed);return observed;},
  readRecovery:()=>native.readRecovery(),
  async readHistory({generation}={}){
   if(!Number.isSafeInteger(generation)||generation<1)fail('HISTORY_GENERATION_DENIED');
   let grant;try{grant=await readHistoryPermission();}catch{fail('HISTORY_PERMISSION_UNKNOWN_HELD');}
   if(!grant||!same(Object.keys(grant).sort(),['allowed','expiresAtMs','scope'])||grant.allowed!==true||grant.scope!=='PAN466_SYNTHETIC_HISTORY'
    ||!Number.isSafeInteger(grant.expiresAtMs)||Date.now()>=grant.expiresAtMs)fail('HISTORY_PERMISSION_DENIED');
   strictOwnedPathV1(nativeOptions.ownedRoot,historyRoot);
   const records=[];
   for(const stage of ['SOURCE','ACTIVE','NEW_WRITES']){
    const name=`${generation}-${stage}.json`;if(!readdirSync(historyRoot).includes(name))continue;
    const path=join(historyRoot,name),stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)fail('HISTORY_BYTES_DENIED');
    const record=JSON.parse(readFileSync(path,'utf8')),{digest,...core}=record;
    if(digest!==lifecycleDigestV1(core)||!validBinding(core.binding)||core.binding.generation!==generation||core.stage!==stage||core.schemaVersion!==1)fail('HISTORY_BINDING_DENIED');
    records.push(record);
   }
   if(!records.length)fail('HISTORY_NOT_FOUND');
   return {classification:'HISTORICAL_OBSERVED_CONTENT_NOT_CURRENT_AUTHORITY',generation,records};
  }
 });
}
