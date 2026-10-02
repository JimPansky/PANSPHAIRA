import { readFileSync,writeFileSync,mkdirSync,mkdtempSync } from 'node:fs';
import { resolve,dirname,relative,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
// Owned synthetic installation copies only; never modify the actual repository/dependency.
const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const variants=new Set(['UNCHANGED','DECLARED_VERSION_DRIFT','SAME_VERSION_BYTES','MALFORMED_RESULT']);
export function probeCopiedInstallation({input,context},variant){
 if(!variants.has(variant)||!process.env.TMPDIR)throw Error('PAN456_COPY_PROBE_SCOPE_DENIED');
 const dir=mkdtempSync(join(process.env.TMPDIR,'pan456-installation-probe-'));
 const publicPaths=new Set(readFileSync(join(ROOT,'release/public-files.manifest'),'utf8').split('\n').filter(x=>x&&!x.startsWith('#')).map(x=>x.split('\t')[0]));
 const copied=new Set();
 function copySource(path){
  if(copied.has(path))return;
  if(!publicPaths.has(path)||path.startsWith('../'))throw Error('PAN456_COPY_SOURCE_NOT_PUBLIC_DENIED');
  const bytes=readFileSync(join(ROOT,path));const target=join(dir,path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes);copied.add(path);
  if(path.endsWith('.mjs'))for(const match of bytes.toString().matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)){const spec=match[1];if(spec.startsWith('.'))copySource(relative(ROOT,resolve(ROOT,dirname(path),spec)));}
 }
 copySource('src/pan456/isolated-policy-backend.mjs');
 copySource('src/pan456/jsonlogic-policy-worker.mjs');
 copySource('demo/manifests/authority/admin-ai-poc-policy-v1.json');
 for(const name of ['package.json','logic.js','LICENSE']){
  const path='node_modules/json-logic-js/'+name;let bytes=readFileSync(join(ROOT,path));
  if(variant==='DECLARED_VERSION_DRIFT'&&name==='package.json')bytes=Buffer.from(JSON.stringify({...JSON.parse(bytes),version:'2.0.6'}));
  if(variant==='SAME_VERSION_BYTES'&&name==='logic.js')bytes=Buffer.concat([bytes,Buffer.from('\n// owned synthetic byte drift\n')]);
  const target=join(dir,path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes);
 }
 if(variant==='MALFORMED_RESULT'){
  const path=join(dir,'src/pan456/jsonlogic-policy-worker.mjs');const text=readFileSync(path,'utf8');const old='JSON.stringify({decision,evaluationNs';
  if(text.split(old).length!==2)throw Error('PAN456_COPY_WORKER_SEAM_CHANGED_DENIED');
  writeFileSync(path,text.replace(old,'JSON.stringify({decision:{...decision,authority:{forged:true}},evaluationNs'));
 }
 writeFileSync(join(dir,'probe-input.json'),JSON.stringify({input,context}));
 writeFileSync(join(dir,'actual-entry.mjs'),`import {readFileSync} from 'node:fs';
import {createIsolatedJsonLogicPolicyEvaluator} from './src/pan456/isolated-policy-backend.mjs';
import {sha256} from './demo/runtime/enforcement-gate.mjs';
try{const bytes=readFileSync('demo/manifests/authority/admin-ai-poc-policy-v1.json');const f=JSON.parse(readFileSync('probe-input.json'));const p=createIsolatedJsonLogicPolicyEvaluator({policy:JSON.parse(bytes),policySourceDigest:sha256(bytes)});const observed=p.observeForTooling(f.input,f.context);process.stdout.write(JSON.stringify({outcome:observed.decision.outcome,workerPid:observed.workerPid,adapterPid:process.pid})+'\\n');}
catch(e){process.stdout.write(JSON.stringify({denied:true,code:e.message})+'\\n');process.exitCode=2;}
`);
 const r=spawnSync(process.execPath,['actual-entry.mjs'],{cwd:dir,encoding:'utf8',timeout:15000,maxBuffer:65536,env:{PATH:process.env.PATH??'/usr/bin:/bin'}});
 if(r.error)throw Error('PAN456_COPY_PROBE_PROCESS_FAILURE');
 let observation;try{observation=JSON.parse(r.stdout);}catch{throw Error('PAN456_COPY_PROBE_OUTPUT_FAILURE');}
 return {variant,scope:'OWNED_SYNTHETIC_COPY_NOT_IN_PLACE_UPGRADE',exitCode:r.status,observation,copiedSourceCount:copied.size};
}
export function requireCopiedInstallationDenial(fixture,variant){
 const r=probeCopiedInstallation(fixture,variant);
 if(r.exitCode!==2||r.observation.denied!==true||typeof r.observation.code!=='string')throw Error('PAN456_EXPECTED_COPY_DENIAL_NOT_OBSERVED');
 throw Error(r.observation.code);
}
