#!/usr/bin/env node
import { readFileSync, lstatSync, readdirSync, realpathSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { validateModuleLifecycles } from '../src/pan466/module-lifecycle-descriptor.mjs';
import { checkModuleLifecyclesV1 } from '../src/pan466/module-lifecycle-check.mjs';
const DEFAULT = 'examples/module-contribution/modules.json';
const fail = message => { throw new Error(message); };
const sorted = values => [...new Set(values)].sort();
function canonical(value) {
 if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
 if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
 return JSON.stringify(value);
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function safe(path) {
 if(typeof path!=='string'||!path||path.includes('\\')||path.includes('\0')||path!==path.normalize('NFC')||path.split('/').some(p=>!p||p==='.'||p==='..')||path.startsWith('-')||/^[A-Za-z]:/.test(path)) fail(`Invalid path: ${path}`);
 return path;
}
function disk(root) {
 function entry(path) {let full=root;for(const part of safe(path).split('/')){full=join(full,part);if(lstatSync(full).isSymbolicLink())fail(`Symlink denied: ${path}`);}return full;}
 return {read:path=>readFileSync(entry(path)), exists:path=>{try{entry(path);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}, files(path){const full=entry(path);const st=lstatSync(full);if(st.isFile())return [path];if(!st.isDirectory())fail(`Not a regular file: ${path}`);return readdirSync(full).sort().flatMap(n=>this.files(`${path}/${n}`));}};
}
function npmGraph(view) {
 const result={packages:[],edges:[],versionResolution:'not performed',coverage:'No root npm workspaces declared',manifests:[]};
 if(!view.exists('package.json'))return result;
 result.manifests.push('package.json');const root=JSON.parse(view.read('package.json'));
 const patterns=Array.isArray(root.workspaces)?root.workspaces:root.workspaces?.packages||[];
 for(const pattern of patterns){
  safe(pattern);if(/[?{}[\]!]/.test(pattern)||pattern.includes('**')||(pattern.includes('*')&&!pattern.endsWith('/*')))fail('Unsupported workspace pattern; use literal directories or parent/*');
  const paths=pattern.endsWith('/*')?view.files(pattern.slice(0,-2)).filter(p=>p.startsWith(pattern.slice(0,-1))&&p.slice(pattern.length-1).split('/').length===2&&p.endsWith('/package.json')):[`${pattern}/package.json`];
  for(const path of paths){const p=JSON.parse(view.read(path));if(!p.name||!p.version)fail('Workspace name/version required');result.packages.push({name:p.name,version:p.version,path});result.manifests.push(path);}
 }
 result.packages.sort((a,b)=>a.name.localeCompare(b.name));
 if(new Set(result.packages.map(p=>p.name)).size!==result.packages.length)fail('Duplicate workspace name');
 for(const pkg of result.packages){const p=JSON.parse(view.read(pkg.path));for(const kind of ['dependencies','devDependencies','peerDependencies','optionalDependencies'])for(const [to,range] of Object.entries(p[kind]||{}))if(result.packages.some(n=>n.name===to))result.edges.push({from:pkg.name,to,range,kind});}
 result.edges.sort((a,b)=>canonical(a).localeCompare(canonical(b)));result.manifests=sorted(result.manifests);
 if(patterns.length)result.coverage='Declared npm workspace edges only; not mapped to semantic tests';return result;
}
function load(view, descriptor, advisory = false) {
 const doc=JSON.parse(view.read(descriptor));
 if(doc.schemaVersion!==1||!Array.isArray(doc.modules))fail('Invalid descriptor schema');
 const modules=doc.modules.map(m=>{
  if(!/^[a-z][a-z0-9-]*$/.test(m.id)||typeof m.version!=='string'||!m.version)fail('Invalid module identity/version');
  const files={};for(const key of ['sources','contracts','profiles','tests']) {if(!Array.isArray(m[key]))fail(`Missing ${key}`);files[key]=sorted(m[key].flatMap(p=>view.files(safe(p))));}
  if(!advisory&&(!files.sources.length||!files.tests.length))fail('Sources and tests required');
  if(!m.dependencies||Array.isArray(m.dependencies)||typeof m.dependencies!=='object')fail('Dependencies must be an object');
  return {...m,files};
 }).sort((a,b)=>a.id.localeCompare(b.id));
 if(new Set(modules.map(m=>m.id)).size!==modules.length)fail('Duplicate module id');
 validateModuleLifecycles(modules, view, {advisory});
 const edges=[];for(const m of modules)for(const [to,version] of Object.entries(m.dependencies)){const target=modules.find(n=>n.id===to);if(!advisory&&!target)fail(`Missing dependency: ${to}`);if(!advisory&&target.version!==version)fail(`Version mismatch: ${to}`);edges.push({from:m.id,to,version,kind:'semantic'});}
 const relations=[];
 for(const m of modules){
  const text=v=>typeof v==='string'&&v.trim().length>0&&!/[\u0000-\u001f\u007f]/.test(v);
  const fields=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
  if('extensionRequests' in m){
   if(!Array.isArray(m.extensionRequests))fail('Invalid extension requests');
   for(const r of m.extensionRequests){
    if(!fields(r,['reference','requirement','capability'])||!text(r.reference)||!text(r.capability)||!['required','optional'].includes(r.requirement))fail('Invalid extension request');
    relations.push({from:m.id,kind:'extension-request',...r});
   }
  }
  if('variant' in m){
   const v=m.variant;
   if(!fields(v,['name','base'])||!text(v.name)||!fields(v.base,['id','version'])||!text(v.base.version)||!/^[a-z][a-z0-9-]*$/.test(v.base.id)||v.base.id===m.id)fail('Invalid variant');
   const base=modules.find(n=>n.id===v.base.id);
   if(!advisory&&(!base||base.version!==v.base.version))fail('Missing or mismatched variant base');
   relations.push({from:m.id,kind:'variant',name:v.name,to:v.base.id,version:v.base.version});
  }
 }
 return {relations:relations.sort((a,b)=>canonical(a).localeCompare(canonical(b))),schemaVersion:1,coverage:'Explicit semantic modules only; no import inference or transitive test selection.',modules,edges:edges.sort((a,b)=>canonical(a).localeCompare(canonical(b)))};
}
function mermaid(graph) {
 // Encode punctuation, including quotes, HTML and Mermaid syntax; no links/directives.
 const label=value=>[...String(value)].map(c=>/[a-zA-Z0-9 .:-]/.test(c)?c:`#${c.codePointAt(0)};`).join('');
 const ids=new Map(graph.modules.map((m,i)=>[m.id,`m${i}`]));
 const lines=['flowchart LR','  %% Semantic declarations only; not compatibility or test evidence.'];
 for(const m of graph.modules)lines.push(`  ${ids.get(m.id)}["${label(`${m.id} @ ${m.version}`)}"]`);
 for(const e of graph.edges)lines.push(`  ${ids.get(e.from)} -->|"${label(`depends on ${e.version}`)}"| ${ids.get(e.to)}`);
 graph.relations.forEach((r,i)=>{
  if(r.kind==='variant')lines.push(`  ${ids.get(r.from)} -.->|"${label(`variant ${r.name} of ${r.version}`)}"| ${ids.get(r.to)}`);
  else {lines.push(`  r${i}["${label(`${r.reference}: ${r.capability}`)}"]`);lines.push(`  ${ids.get(r.from)} -.->|"extension request ${r.requirement}"| r${i}`);}
 });
 return lines.join('\n');
}
const telemetry = { gitCommands: 0, gitContentReads: 0 };
const resetTelemetry = () => { telemetry.gitCommands = 0; telemetry.gitContentReads = 0; };
function git(root, ...args) { telemetry.gitCommands++; return execFileSync('git', args, {cwd:root,encoding:'utf8',maxBuffer:32*1024*1024}); }
function snapshot(root, commit) {
 const entries=git(root,'ls-tree','-rz','--full-tree',commit).split('\0').filter(Boolean).map(row=>{const [meta,path]=row.split('\t');return {path,mode:meta.split(' ')[0]};});
 // ls-tree --full-tree lists blob (regular-file) entries only, so a path's
 // regular-file safety is known from its tree mode: enumerating historical
 // paths needs no `git show` content read. A content read is genuinely
 // required only by read() (the descriptor and any explicitly requested file).
 // Symlink (120000) and gitlink (160000) historical objects are excluded from
 // enumeration and still denied on read.
 const safeModes=['100644','100755'];
 const paths=entries.filter(e=>safeModes.includes(e.mode)).map(e=>e.path);
 return {exists:path=>paths.includes(safe(path)), read(path){safe(path);const e=entries.find(e=>e.path===path);if(!e||!safeModes.includes(e.mode))fail(`Missing or unsafe historical path: ${path}`);telemetry.gitContentReads++;return execFileSync('git',['show',`${commit}:${path}`],{cwd:root,maxBuffer:32*1024*1024});},files(path){const base=safe(path);return paths.filter(p=>p===base||p.startsWith(`${base}/`));}};
}
function impact(root, descriptor, base) {
 const commit=git(root,'rev-parse','--verify','--end-of-options',`${base}^{commit}`).trim();
 const oldView=snapshot(root,commit);const current=disk(root);
 // Deleted files must retain ownership from the old graph, not fail validation.
 const tolerant={...current,files(path){return current.exists(path)?current.files(path):[safe(path)];}};
 const old=oldView.exists(descriptor)?load(oldView,descriptor):{modules:[],edges:[]};
 const now=current.exists(descriptor)?load(tolerant,descriptor,true):{modules:[],edges:[]};
 const changed=sorted([...git(root,'diff','--name-only','--no-renames','-z',commit,'--').split('\0'),...git(root,'ls-files','--others','--exclude-standard','-z').split('\0')].filter(Boolean));
 const own=new Set(), contract=new Set();
 for(const graph of [old,now])for(const m of graph.modules){
  const previous=old.modules.find(n=>n.id===m.id),next=now.modules.find(n=>n.id===m.id);
  const descriptorChanged=!previous||!next||canonical({...previous,files:undefined})!==canonical({...next,files:undefined});
  if(descriptorChanged||Object.values(m.files).flat().some(p=>changed.includes(p)))own.add(m.id);
  if(descriptorChanged||m.files.contracts.some(p=>changed.includes(p)))contract.add(m.id);
 }
 const affected=new Set(own);for(const e of [...old.edges,...now.edges])if(contract.has(e.to))affected.add(e.from);
 const candidates=sorted([...old.modules,...now.modules].filter(m=>affected.has(m.id)).flatMap(m=>m.files.tests));
 return {advisory:true,base:commit,changed,affected:sorted(affected),tests:candidates.filter(p=>current.exists(p)),missingTests:candidates.filter(p=>!current.exists(p)),unmapped:changed.filter(p=>p!==descriptor&&![...old.modules,...now.modules].some(m=>Object.values(m.files).flat().includes(p))),coverage:now.coverage||old.coverage,diagnostics:{gitCommands:telemetry.gitCommands,gitContentReads:telemetry.gitContentReads}};
}
function release(root, descriptor) {
 const view=disk(root), graph=load(view,descriptor);
 const paths=sorted([descriptor,...graph.modules.flatMap(m=>Object.values(m.files).flat())]);
 const payload={schemaVersion:2,sourceCommit:git(root,'rev-parse','HEAD').trim(),descriptor,descriptorContent:view.read(descriptor).toString('utf8'),coverage:graph.coverage,modules:graph.modules,files:paths.map(path=>({path,sha256:hash(view.read(path))}))};
 return {...payload,sha256:hash(canonical(payload))};
}
function validateSnapshot(manifest) {
 if(!manifest||manifest.schemaVersion!==2)fail('Unsupported release schema; comparison requires version 2 ownership snapshots');
 const {sha256,...payload}=manifest;
 if(!/^[a-f0-9]{64}$/.test(sha256)||sha256!==hash(canonical(payload)))fail('Release digest mismatch');
 if(!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(manifest.sourceCommit)||typeof manifest.descriptorContent!=='string'||!Array.isArray(manifest.files)||!Array.isArray(manifest.modules))fail('Invalid release snapshot');
 safe(manifest.descriptor);
 const inventory=new Map();
 for(const f of manifest.files){
  if(!f||Object.keys(f).sort().join(',')!=='path,sha256'||typeof f.sha256!=='string'||!/^[a-f0-9]{64}$/.test(f.sha256))fail('Invalid file digest');
  safe(f.path);if(inventory.has(f.path))fail('Duplicate inventory path');inventory.set(f.path,f.sha256);
 }
 if(inventory.get(manifest.descriptor)!==hash(manifest.descriptorContent))fail('Descriptor digest mismatch');
 // Re-expand declarations against the bound inventory, never today's checkout.
 const view={read:path=>{if(path!==manifest.descriptor)fail('Unexpected snapshot read');return manifest.descriptorContent;},files(path){safe(path);const paths=[...inventory.keys()].filter(p=>p===path||p.startsWith(`${path}/`));return paths.sort();}};
 const graph=load(view,manifest.descriptor);
 const expected=sorted([manifest.descriptor,...graph.modules.flatMap(m=>Object.values(m.files).flat())]);
 if(canonical(expected)!==canonical(manifest.files.map(f=>f.path))||canonical(graph.modules)!==canonical(manifest.modules)||graph.coverage!==manifest.coverage)fail('Snapshot inventory or module facts mismatch');
 return manifest;
}
function compare(root, beforePath, afterPath) {
 const view=disk(root);
 const before=validateSnapshot(JSON.parse(view.read(safe(beforePath)))),after=validateSnapshot(JSON.parse(view.read(safe(afterPath))));
 const oldFiles=new Map(before.files.map(f=>[f.path,f.sha256])),newFiles=new Map(after.files.map(f=>[f.path,f.sha256]));
 const changed=sorted([...oldFiles.keys(),...newFiles.keys()]).filter(p=>oldFiles.get(p)!==newFiles.get(p));
 const own=new Set(),contract=new Set();
 for(const m of [...before.modules,...after.modules]){
  const old=before.modules.find(n=>n.id===m.id),now=after.modules.find(n=>n.id===m.id);
  const metadataChanged=!old||!now||canonical({...old,files:undefined})!==canonical({...now,files:undefined});
  if(metadataChanged||Object.values(m.files).flat().some(p=>changed.includes(p)))own.add(m.id);
  if(metadataChanged||m.files.contracts.some(p=>changed.includes(p)))contract.add(m.id);
 }
 const affected=new Set(own);
 for(const m of [...before.modules,...after.modules])if(Object.keys(m.dependencies).some(id=>contract.has(id)))affected.add(m.id);
 return {advisory:true,before:before.sha256,after:after.sha256,changed,changedModules:sorted(own),affected:sorted(affected),tests:sorted([...before.modules,...after.modules].filter(m=>affected.has(m.id)).flatMap(m=>m.files.tests)),notice:'Snapshot consistency only, not authentication; no tests executed. Direct semantic consumers only; no transitive or runtime resolution.',diagnostics:{gitCommands:telemetry.gitCommands,gitContentReads:telemetry.gitContentReads}};
}
function verify(root, path, descriptor) {
 const manifest=JSON.parse(disk(root).read(safe(path)));
 // Rebuild the full expected inventory, not just the attacker-supplied file list.
 const expected=release(root,descriptor);
 if(canonical(manifest)!==canonical(expected))fail('Release integrity mismatch (bytes, inventory, dependencies, or source commit)');
 return {valid:true,sha256:expected.sha256,notice:'Integrity only; not attestation or semantic proof.'};
}
function scaffold(root, slug) {
 if(!/^[a-z][a-z0-9-]*$/.test(slug))fail('Invalid scaffold slug');
 const parent='examples/module-contribution';disk(root).files(parent); // reject hostile ancestors before any write
 const dir=`${parent}/${slug}`;mkdirSync(join(root,dir)); // exclusive directory: no overwrite
 const files={'source.mjs':'// Runnable template, not a business product.\nexport const greet = name => `Hello, ${name}`;\n','test.mjs':"import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { greet } from './source.mjs';\ntest('template greeting',()=>assert.equal(greet('world'),'Hello, world'));\n",'contract.json':JSON.stringify({input:'name: string',output:'greeting: string',template:true})};
 files['modules.json']=JSON.stringify({schemaVersion:1,modules:[{id:slug,version:'1',sources:[`${dir}/source.mjs`],contracts:[`${dir}/contract.json`],profiles:[],tests:[`${dir}/test.mjs`],dependencies:{}}]},null,2)+'\n';
 for(const [path,bytes] of Object.entries(files))writeFileSync(join(root,dir,path),bytes,{flag:'wx'});
 return {directory:dir,template:true,next:`node --test ${dir}/test.mjs`,check:`node scripts/module-contribution.mjs check --descriptor ${dir}/modules.json`};
}
function main() {
 resetTelemetry();
 const args=process.argv.slice(2);const command=args.shift();let descriptor=DEFAULT;const root=realpathSync(process.cwd());const view=disk(root);
 const index=args.indexOf('--descriptor');if(index>=0){if(!args[index+1])fail('Missing descriptor');descriptor=safe(args[index+1]);args.splice(index,2);}
 if(command==='lifecycle-check'&&args.length===4&&args[0]==='--base'&&args[2]==='--state-root') {
  const stateRoot=resolve(args[3]);
  if(realpathSync(stateRoot)!==stateRoot||!lstatSync(stateRoot).isDirectory())fail('Lifecycle state root denied');
  const plan=impact(root,descriptor,args[1]),oldView=snapshot(root,plan.base);
  const result=checkModuleLifecyclesV1({before:load(oldView,descriptor),after:load(view,descriptor),oldView,view,stateView:disk(stateRoot),impact:plan,descriptor});
  return {...result,diagnostics:{gitCommands:telemetry.gitCommands,gitContentReads:telemetry.gitContentReads}};
 }
 if(command==='scaffold'&&args.length===1)return scaffold(root,args[0]);
 if(command==='test'&&args.length===2&&args[0]==='--base') {
  load(view,descriptor);
  const plan=impact(root,descriptor,args[1]);
  if(plan.missingTests.length)fail('Selected tests are missing');
  for(const path of plan.tests) {safe(path);view.read(path);if(!/\.(?:mjs|cjs|js)$/.test(path))fail(`Build required or unsupported test: ${path}`);}
  if(plan.tests.length) {
   // Explicit opt-in executes reviewed test files, never descriptor shell commands.
   // Prefix paths to avoid option interpretation; retain native failure status.
   const testEnv={...process.env};delete testEnv.NODE_TEST_CONTEXT;
   try {const output=execFileSync(process.execPath,['--test',...plan.tests.map(p=>`./${p}`)],{cwd:root,env:testEnv,encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});process.stderr.write(output);}
   catch(error){if(error.stdout)process.stderr.write(error.stdout);if(error.stderr)process.stderr.write(error.stderr);fail('Selected tests failed or timed out');}
  }
  return {...plan,advisory:false,executed:plan.tests.length>0,notice:'Only declared selected tests executed; unmapped changes require separate checks.'};
 }
 if(command==='compare'&&args.length===4&&args[0]==='--before'&&args[2]==='--after')return compare(root,args[1],args[3]);
 if(command==='impact'&&args.length===2&&args[0]==='--base')return impact(root,descriptor,args[1]);
 if(command==='verify'&&args.length===2&&args[0]==='--manifest')return verify(root,args[1],descriptor);
 if(command==='graph'&&args.length===2&&args[0]==='--format'&&args[1]==='mermaid')return mermaid(load(view,descriptor));
 if(args.length)fail('Unexpected arguments');
 if(command==='release')return release(root,descriptor);
 const graph=load(view,descriptor);
 if(command==='check')return {valid:true,modules:graph.modules.length,coverage:graph.coverage};
 if(command==='graph')return {...graph,npm:npmGraph(view)};
 fail('Usage: module-contribution.mjs check|graph');
}
try {const result=main();console.log(typeof result==='string'?result:canonical(result));}catch(error){console.error(`module-contribution: ${error.message}`);process.exitCode=1;}
