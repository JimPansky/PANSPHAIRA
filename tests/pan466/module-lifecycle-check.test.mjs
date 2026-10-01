import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const CLI=resolve(import.meta.dirname,'../../scripts/module-contribution.mjs');
const descriptor='examples/module-contribution/modules.json';
const canonical=v=>Array.isArray(v)?`[${v.map(canonical).join(',')}]`:v&&typeof v==='object'?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`:JSON.stringify(v);
const digest=v=>createHash('sha256').update(canonical(v)).digest('hex');
const bytes=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
function put(root,path,value){mkdirSync(resolve(root,path,'..'),{recursive:true});writeFileSync(join(root,path),typeof value==='string'?value:JSON.stringify(value));}
function fixture(t){
 const parent=mkdtempSync(join(tmpdir(),'pan466-check-')),root=join(parent,'repo'),state=join(parent,'state');mkdirSync(root);mkdirSync(state);
 t.after(()=>rmSync(parent,{recursive:true,force:true}));
 const git=(...args)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 git('init','-q');git('config','user.name','Synthetic');git('config','user.email','synthetic@example.invalid');
 const modules=['provider','consumer'].map(id=>({id,version:'1',sources:[`${id}/source.mjs`],contracts:[`${id}/contract.json`],profiles:[],tests:[`${id}/test.mjs`],dependencies:id==='consumer'?{provider:'1'}:{}}));
 for(const m of modules){put(root,m.sources[0],'export const value=1;');put(root,m.contracts[0],{schemaVersion:1});put(root,m.tests[0],'export {};');}
 put(root,'provider/notes.md','Original bounded notes.');modules[0].sources.push('provider/notes.md');
 const lifecycle={schemaVersion:1,state:{content:['provider/content.json'],config:['provider/config.json'],derived:[],authority:['provider/authority.json']},migrations:[{id:'provider-first',from:'0',to:'1',path:'provider/migration.mjs'}],consumers:[{id:'consumer',version:'1'}],recovery:{history:'APPEND_ONLY',deferred:'REVALIDATE_CURRENT'}};
 modules[0].lifecycle=lifecycle;
 const config={display:'compact',locale:'en'},content={label:'original'},authority={permissions:['read']};
 put(root,'provider/content.json',content);put(root,'provider/config.json',config);put(state,'provider/config.json',config);
 put(root,'provider/authority.json',authority);put(root,'provider/migration.mjs','export const generation=1;');
 const history={schemaVersion:1,migrations:[]};put(state,'lifecycle-state.json',history);
 const save=()=>put(root,descriptor,{schemaVersion:1,modules});save();put(root,'unowned-tracked.txt','original');git('add','.');git('commit','-qm','lifecycle baseline');let base=git('rev-parse','HEAD');
 const run=()=>spawnSync(process.execPath,[CLI,'lifecycle-check','--base',base,'--state-root',state],{cwd:root,encoding:'utf8'});
 const result=()=>{const r=run();assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
 const commit=()=>{git('add','.');git('commit','-qm','retained generation');base=git('rev-parse','HEAD');};
 const bindIndex=()=>{
  // Independent fixture construction from the declared raw bytes, not a returned eligibility flag.
  const pairs=paths=>paths.sort().map(path=>({path,sha256:bytes(readFileSync(join(root,path),'utf8'))}));
  return {moduleId:'provider',moduleVersion:'1',contentDigest:digest(pairs(lifecycle.state.content)),configDigest:digest([['provider/config.json',JSON.parse(readFileSync(join(state,'provider/config.json'),'utf8'))]]),semanticDigest:digest(pairs(['provider/source.mjs','provider/contract.json'])),authorityDigest:digest(pairs(lifecycle.state.authority))};
 };
 return {root,state,modules,lifecycle,history,save,run,result,commit,bindIndex};
}
function held(f,reason){const before=readFileSync(join(f.state,'lifecycle-state.json'));const result=f.result();assert.equal(result.eligibleForQualification,false);assert.equal(result.automaticUpdateCoverage,false);assert(result.reasonCodes.includes(reason),JSON.stringify(result));assert.deepEqual(readFileSync(join(f.state,'lifecycle-state.json')),before);return result;}

test('AC01 actual lifecycle-check accepts owned change/known consumer/fresh migration, without effect authority',t=>{
 const f=fixture(t);f.lifecycle.migrations.push({id:'provider-next',from:'1',to:'2',path:'provider/next.mjs'});put(f.root,'provider/next.mjs','export const generation=2;');f.save();
 const r=f.result();assert.equal(r.eligibleForQualification,true);assert.equal(r.automaticUpdateCoverage,false);assert.equal(r.authority,'NONE');assert(r.migrations.some(m=>m.id==='provider-next'&&m.disposition==='NEW_ID_REQUIRES_EXECUTION_QUALIFICATION'));
});
for(const path of ['unowned-tracked.txt','unowned-new.txt'])test(`AC01 actual Git-visible unowned change ${path} is uncovered`,t=>{
 const f=fixture(t);put(f.root,path,'changed');const r=held(f,'UNOWNED_CHANGED_FILE');assert(r.unmapped.includes(path));
});
test('AC01 actual cross-generation reuse of migration ID with different bytes is held',t=>{
 const f=fixture(t);put(f.root,'provider/migration.mjs','export const generation=999;');held(f,'MIGRATION_ID_REUSED');
});
test('AC01 retained applied migration identity survives deletion from prior descriptor; rehash cannot reuse ID',t=>{
 const f=fixture(t);const original=f.result().migrations[0];f.history.migrations=[{id:original.id,identity:original.identity}];put(f.state,'lifecycle-state.json',f.history);
 f.lifecycle.migrations=[];f.save();f.commit();f.lifecycle.migrations=[{id:'provider-first',from:'1',to:'2',path:'provider/migration.mjs'}];f.save();put(f.root,'provider/migration.mjs','different bytes');held(f,'MIGRATION_ID_REUSED');
});
test('AC01 unknown direct consumer cannot enter qualification',t=>{
 const f=fixture(t);f.lifecycle.consumers[0].id='unknown';f.save();const r=f.run();assert.notEqual(r.status,0);assert.match(r.stderr,/LIFECYCLE_CONSUMER_UNKNOWN/);
});
test('AC02 actual three-way config nonconflicting edits merge without writing retained local state',t=>{
 const f=fixture(t);put(f.root,'provider/config.json',{display:'expanded',locale:'en'});put(f.state,'provider/config.json',{display:'compact',locale:'de'});
 const before=readFileSync(join(f.state,'provider/config.json'));const r=f.result();assert.equal(r.eligibleForQualification,true);assert.deepEqual(r.config['provider/config.json'],{display:'expanded',locale:'de'});assert.deepEqual(readFileSync(join(f.state,'provider/config.json')),before);
});
test('AC02 actual three-way conflict preserves both local config and retained history bytes',t=>{
 const f=fixture(t);put(f.root,'provider/config.json',{display:'expanded',locale:'en'});put(f.state,'provider/config.json',{display:'local-custom',locale:'en'});
 const before=readFileSync(join(f.state,'provider/config.json'));held(f,'CONFIG_THREE_WAY_CONFLICT');assert.deepEqual(readFileSync(join(f.state,'provider/config.json')),before);
});
test('AC02 config deletion is merged only when local and incoming edits do not conflict',t=>{
 const f=fixture(t);put(f.root,'provider/config.json',{locale:'en'});const r=f.result();assert.equal(r.eligibleForQualification,true);assert.deepEqual(r.config['provider/config.json'],{locale:'en'});
});
for(const stale of [false,true])test(`AC02 actual declared index ${stale?'generation mismatch holds':'matched binding reuses'}`,t=>{
 const f=fixture(t);f.lifecycle.state.derived=['provider/index.json'];f.save();put(f.root,'provider/index.json',{schemaVersion:1,binding:f.bindIndex(),entries:['original']});f.commit();
 if(stale)put(f.root,'provider/content.json',{label:'new generation'});
 const before=readFileSync(join(f.root,'provider/index.json'));const r=stale?held(f,'DERIVED_INDEX_GENERATION_MISMATCH'):f.result();
 assert.equal(r.indexes[0].disposition,stale?'HELD_REQUIRES_AUTHORIZED_REBUILD':'REUSE_MATCHED_INDEX');assert.deepEqual(readFileSync(join(f.root,'provider/index.json')),before);
});
test('AC02 permissions delta disguised inside content invalidates qualification',t=>{
 const f=fixture(t);put(f.root,'provider/content.json',{label:'original',permissions:['write']});held(f,'AUTHORITY_DISGUISED_AS_CONTENT');
});
test('AC02 authority surface cannot be moved into content by changing the descriptor',t=>{
 const f=fixture(t);f.lifecycle.state.authority=[];f.lifecycle.state.content.push('provider/authority.json');f.save();held(f,'AUTHORITY_SURFACE_CHANGED');
});
test('AC02 changed protected authority bytes require separate authority admission',t=>{
 const f=fixture(t);put(f.root,'provider/authority.json',{permissions:['read','write']});held(f,'AUTHORITY_CHANGED_REQUIRES_SEPARATE_ADMISSION');
});
test('AC02 bounded owned nonsemantic document fast path checks unchanged semantic/state/index bindings',t=>{
 const f=fixture(t);const before=f.result().modules[0].binding;put(f.root,'provider/notes.md','Only a bounded wording correction.');
 const r=f.result();assert.equal(r.eligibleForQualification,true);assert.equal(r.path,'BOUNDED_NONSEMANTIC_FAST_PATH');assert.equal(r.work.nativeDispatches,0);assert.equal(r.work.indexRebuilds,0);assert.equal(r.work.migrationExecutions,0);assert.deepEqual(r.modules[0].binding,before);assert(r.work.filesRead>0);assert(r.work.bytesRead>0);
});
test('AC02 semantic source edits and large documents cannot claim nonsemantic fast path',t=>{
 const f=fixture(t);put(f.root,'provider/source.mjs','export const value=2;');assert.notEqual(f.result().path,'BOUNDED_NONSEMANTIC_FAST_PATH');
 put(f.root,'provider/notes.md','x'.repeat(65537));assert.notEqual(f.result().path,'BOUNDED_NONSEMANTIC_FAST_PATH');
});
test('LIFE-06 qualification state is required; symlink state reader and caller-owned eligibility cannot substitute',t=>{
 const f=fixture(t);put(f.state,'lifecycle-state.json',{schemaVersion:1,migrations:[],eligible:true});assert.notEqual(f.run().status,0);
 rmSync(join(f.state,'lifecycle-state.json'));symlinkSync(join(f.root,'provider/authority.json'),join(f.state,'lifecycle-state.json'));assert.notEqual(f.run().status,0);
});
