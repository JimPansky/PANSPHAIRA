// LIFE-06 bounded CHECK_ONLY qualification preflight. Reads real Git/disk state;
// never grants authority, applies config, builds an index or dispatches effects.
import {createHash} from 'node:crypto';
export const canonicalLifecycleV1=v=>Array.isArray(v)?`[${v.map(canonicalLifecycleV1).join(',')}]`:v&&typeof v==='object'?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonicalLifecycleV1(v[k])}`).join(',')}}`:JSON.stringify(v);
export const lifecycleDigestV1=v=>createHash('sha256').update(canonicalLifecycleV1(v)).digest('hex');
const byteDigest=bytes=>createHash('sha256').update(bytes).digest('hex');
const same=(a,b)=>canonicalLifecycleV1(a)===canonicalLifecycleV1(b);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&same(Object.keys(v).sort(),[...keys].sort());
const fail=code=>{throw Error(`LIFECYCLE_${code}`);};
const missing=Symbol('absent');
const equivalent=(a,b)=>a===missing||b===missing?a===b:same(a,b);
// Object fields merge recursively; arrays/scalars are atomic. Missing is not null.
export function mergeLifecycleConfigV1(base,local,incoming){
 const conflicts=[];
 function merge(b,l,n,path){
  if(equivalent(l,b))return n;
  if(equivalent(n,b)||equivalent(l,n))return l;
  if(object(b)&&object(l)&&object(n)){
   const result=Object.create(null);
   for(const key of [...new Set([...Object.keys(b),...Object.keys(l),...Object.keys(n)])].sort()){
    const value=merge(Object.hasOwn(b,key)?b[key]:missing,Object.hasOwn(l,key)?l[key]:missing,Object.hasOwn(n,key)?n[key]:missing,[...path,key]);
    if(value!==missing)result[key]=value;
   }
   return result;
  }
  conflicts.push(path);return l;
 }
 return {value:merge(base,local,incoming,[]),conflicts};
}
const protectedKeys=new Set(['authority','authorityProfile','permissions','roles','capabilities','scopes','policy','consumers','consumer','grants','credentials']);
function protectedFields(v,path=[],out=[]){
 if(Array.isArray(v))v.forEach((x,i)=>protectedFields(x,[...path,i],out));
 else if(object(v))for(const key of Object.keys(v).sort()){
  if(protectedKeys.has(key))out.push({path:[...path,key],value:v[key]});
  else protectedFields(v[key],[...path,key],out);
 }
 return out;
}
export function checkModuleLifecyclesV1({before,after,oldView,view,stateView,impact,descriptor}){
 const reasons=new Set(),config=Object.create(null),migrations=[],indexes=[],modules=[];
 const work={filesRead:0,bytesRead:0,nativeDispatches:0,indexRebuilds:0,migrationExecutions:0};
 const cache=new Map();
 function read(reader,path){
  let files=cache.get(reader);if(!files){files=new Map();cache.set(reader,files);}
  if(!files.has(path)){
   const bytes=Buffer.from(reader.read(path));
   if(bytes.length>1024*1024||work.filesRead>=512||work.bytesRead+bytes.length>16*1024*1024)fail('READ_BOUND_EXCEEDED');
   files.set(path,bytes);work.filesRead++;work.bytesRead+=bytes.length;
  }
  return files.get(path);
 }
 const json=(reader,path)=>JSON.parse(read(reader,path).toString('utf8'));
 const pairs=(reader,paths)=>[...new Set(paths)].sort().map(path=>({path,sha256:byteDigest(read(reader,path))}));
 const history=json(stateView,'lifecycle-state.json');
 if(!exact(history,['schemaVersion','migrations'])||history.schemaVersion!==1||!Array.isArray(history.migrations)||history.migrations.length>512)fail('RETAINED_HISTORY_SCHEMA_DENIED');
 const priorIds=new Map();
 const remember=(id,identity)=>{if(priorIds.has(id)&&priorIds.get(id)!==identity)reasons.add('MIGRATION_ID_REUSED');priorIds.set(id,identity);};
 for(const m of history.migrations){
  if(!exact(m,['id','identity'])||!/^[a-z][a-z0-9-]*$/.test(m.id)||!/^[a-f0-9]{64}$/.test(m.identity))fail('RETAINED_HISTORY_SCHEMA_DENIED');
  if(priorIds.has(m.id))fail('RETAINED_HISTORY_SCHEMA_DENIED');remember(m.id,m.identity);
 }
 const identity=(module,m,reader)=>lifecycleDigestV1({moduleId:module.id,id:m.id,from:m.from,to:m.to,implementation:pairs(reader,reader.files(m.path))});
 for(const module of before.modules.filter(m=>m.lifecycle))for(const m of module.lifecycle.migrations)remember(m.id,identity(module,m,oldView));
 if(impact.unmapped.length)reasons.add('UNOWNED_CHANGED_FILE');
 if(impact.missingTests.length)reasons.add('SELECTED_TESTS_MISSING');
 const changed=impact.changed;
 for(const module of after.modules){
  const old=before.modules.find(m=>m.id===module.id);
  if(!module.lifecycle){if(changed.some(p=>Object.values(module.files).flat().includes(p)))reasons.add('CHANGED_MODULE_HAS_NO_LIFECYCLE');continue;}
  if(!old?.lifecycle){reasons.add('PREVIOUS_LIFECYCLE_QUALIFICATION_UNAVAILABLE');continue;}
  const now=module.lifecycle,previous=old.lifecycle;
  if(!same(previous.state.authority,now.state.authority)||!same(old.files.lifecycleAuthority,module.files.lifecycleAuthority))reasons.add('AUTHORITY_SURFACE_CHANGED');
  if(!same(old.dependencies,module.dependencies)||!same(previous.consumers,now.consumers))reasons.add('CONSUMER_BINDING_CHANGED_REQUIRES_QUALIFICATION');
  for(const m of now.migrations){
   const bound=identity(module,m,view),known=priorIds.get(m.id);
   if(known&&known!==bound)reasons.add('MIGRATION_ID_REUSED');
   migrations.push({moduleId:module.id,id:m.id,identity:bound,disposition:known===bound?'RETAINED_ID_NO_NEW_EXECUTION':'NEW_ID_REQUIRES_EXECUTION_QUALIFICATION'});
  }
  const currentConfig=[];
  for(const path of module.files.lifecycleConfig){
   if(!old.files.lifecycleConfig.includes(path)||!oldView.exists(path)||!stateView.exists(path)){reasons.add('CONFIG_BASE_OR_LOCAL_UNAVAILABLE');continue;}
   const b=json(oldView,path),l=json(stateView,path),n=json(view,path);
   if(!object(b)||!object(l)||!object(n))fail('CONFIG_OBJECT_REQUIRED');
   const merged=mergeLifecycleConfigV1(b,l,n);config[path]=merged.value;currentConfig.push([path,merged.value]);
   if(merged.conflicts.length)reasons.add('CONFIG_THREE_WAY_CONFLICT');
   if(!same(protectedFields(b),protectedFields(l))||!same(protectedFields(b),protectedFields(n)))reasons.add('AUTHORITY_DISGUISED_AS_CONFIG');
  }
  for(const path of module.files.lifecycleContent){
   // This bounded content adapter accepts JSON; opaque state needs its own adapter.
   const current=json(view,path),prior=old.files.lifecycleContent.includes(path)&&oldView.exists(path)?json(oldView,path):null;
   if(!same(protectedFields(prior),protectedFields(current)))reasons.add('AUTHORITY_DISGUISED_AS_CONTENT');
  }
  const authority=pairs(view,module.files.lifecycleAuthority);
  if(!same(pairs(oldView,old.files.lifecycleAuthority),authority))reasons.add('AUTHORITY_CHANGED_REQUIRES_SEPARATE_ADMISSION');
  const semanticPaths=[...module.files.sources.filter(p=>!p.endsWith('.md')&&!p.endsWith('.txt')),...module.files.contracts,...module.files.profiles];
  const binding={moduleId:module.id,moduleVersion:module.version,contentDigest:lifecycleDigestV1(pairs(view,module.files.lifecycleContent)),configDigest:lifecycleDigestV1(currentConfig.sort((a,b)=>a[0].localeCompare(b[0]))),semanticDigest:lifecycleDigestV1(pairs(view,semanticPaths)),authorityDigest:lifecycleDigestV1(authority)};
  modules.push({id:module.id,binding,generation:lifecycleDigestV1(binding)});
  for(const path of module.files.lifecycleDerived){
   const index=json(view,path),matched=exact(index,['schemaVersion','binding','entries'])&&index.schemaVersion===1&&Array.isArray(index.entries)&&same(index.binding,binding);
   if(!matched)reasons.add('DERIVED_INDEX_GENERATION_MISMATCH');
   indexes.push({moduleId:module.id,path,disposition:matched?'REUSE_MATCHED_INDEX':'HELD_REQUIRES_AUTHORIZED_REBUILD'});
  }
 }
 if(!modules.length)reasons.add('NO_LIFECYCLE_MODULES');
 // Only changed, already-owned small .md/.txt source documents, with identical
 // metadata and no lifecycle-state classification, can take the bounded path.
 const fast=changed.length>0&&changed.length<=32&&changed.every(path=>{
  if(path===descriptor||!/(?:\.md|\.txt)$/.test(path)||!oldView.exists(path)||!view.exists(path))return false;
  const owners=after.modules.filter(m=>m.files.sources.includes(path));
  if(owners.length!==1||!owners[0].lifecycle)return false;
  const old=before.modules.find(m=>m.id===owners[0].id);
  if(!old||!same({...old,files:undefined},{...owners[0],files:undefined})||!old.files.sources.includes(path))return false;
  if([...before.modules,...after.modules].some(m=>Object.entries(m.files).some(([kind,paths])=>kind!=='sources'&&paths.includes(path))))return false;
  return read(view,path).length<=65536&&read(oldView,path).length<=65536;
 });
 return {schemaVersion:1,classification:'CHECK_ONLY',authority:'NONE',eligibleForQualification:reasons.size===0,automaticUpdateCoverage:false,
  path:reasons.size?'HELD':fast?'BOUNDED_NONSEMANTIC_FAST_PATH':'FULL_SCOPED_QUALIFICATION_REQUIRED',base:impact.base,changed,unmapped:impact.unmapped,
  reasonCodes:[...reasons].sort(),modules,config,migrations,indexes,work,
  notice:'Declared Git-visible scope only. Config results are proposals; retained history is input, not authenticated authority. No execution, migration, rebuild, native permission or repository-wide coverage from this preflight.'};
}
