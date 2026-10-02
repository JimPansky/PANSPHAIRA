// Journey-specific executable consumer of the retained Docker NETWORK_NONE
// Reference Adapter profile. No new sandbox implementation, model or gateway.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,lstatSync,rmSync,readdirSync,realpathSync} from 'node:fs';
import {resolve,join,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {canonicalJson,sha256} from '../demo/runtime/enforcement-gate.mjs';
import {JOURNEY_SCHEMA,IMAGE_ID,ADAPTER,BASE_FILES,QUALIFIER_FILES,CROSSINGS,NONCLAIMS,conformanceDecision} from '../src/pan454/journey-profile.mjs';
const repository=resolve(fileURLToPath(import.meta.url),'../..');
const env=()=>Object.fromEntries(['PATH','HOME','LANG','LC_ALL','TMPDIR'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
function docker(args){const r=spawnSync('docker',args,{env:env(),encoding:'utf8',timeout:20000,maxBuffer:262144});if(r.error||r.signal)throw Error('PAN454_DOCKER_PROCESS_UNKNOWN_HELD');return r;}
function checked(args){const r=docker(args);if(r.status!==0)throw Error('PAN454_DOCKER_COMMAND_FAILED:'+args[0]);return r.stdout.trim();}
const inspect=id=>JSON.parse(checked(['inspect',id]))[0];
function checkedSource(path){const absolute=resolve(repository,path);assert.equal(relative(repository,absolute),path,'PAN454_SOURCE_OUTSIDE_REPOSITORY_DENIED');assert.equal(realpathSync(absolute),absolute,'PAN454_SOURCE_SYMLINK_DENIED');assert.equal(lstatSync(absolute).isFile(),true);return readFileSync(absolute);}
export function runJourneyEvidence(){
 if(!process.env.TMPDIR||!process.env.TMPDIR.startsWith('/'))throw Error('PAN454_OWNED_SCRATCH_REQUIRED');
 const scratchParent=realpathSync(process.env.TMPDIR);if(scratchParent==='/tmp'||scratchParent.startsWith(repository+'/'))throw Error('PAN454_OWNED_SCRATCH_OUTSIDE_SOURCE_REQUIRED');
 const profilePath='packages/contracts/src/extension-dynamic-synthetic.ts';const profile=checkedSource(profilePath).toString();
 // Bind reuse to the actual retained profile, not merely our own flag list.
 for(const fragment of ['"--network",\n    "none"','"--read-only"','"--cap-drop",\n    "ALL"','"no-new-privileges"','"--user",\n    "1000:1000"',IMAGE_ID])if(!profile.includes(fragment))throw Error('PAN454_RETAINED_ADAPTER_PROFILE_DRIFT_DENIED');
 const scratchProfile=checkedSource('demo/openclaw-agent/compose.yaml').toString();if(!scratchProfile.includes('/scratch:rw,noexec,nosuid,nodev,size=1m,mode=700,uid=1000,gid=1000'))throw Error('PAN454_RETAINED_SCRATCH_PROFILE_DRIFT_DENIED');
 const imageReference='node@'+IMAGE_ID;const [image]=JSON.parse(checked(['image','inspect',imageReference]));assert(image.RepoDigests.includes(imageReference));assert.equal(image.Os,'linux');assert.equal(image.Architecture,'amd64');
 const publicPaths=new Set(checkedSource('release/public-files.manifest').toString().split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.split('\t')[0]));
 // The retained BTH seam is already published in the real Git source archive
 // but deliberately excluded from the runnable product-increment manifest.
 // Preserve that exact classification; do not promote it to the product set.
 const sourceOnlyBth='src/pan442/bound-task-handle.mjs';const publicBuilder=checkedSource('scripts/build-public-release.sh').toString();
 if(!publicBuilder.includes('"'+sourceOnlyBth+'"')||!publicBuilder.includes('SOURCE_EVIDENCE_ONLY real GitHub source archive'))throw Error('PAN454_RETAINED_SOURCE_ONLY_CLASSIFICATION_DRIFT_DENIED');
 const files=[...BASE_FILES,...QUALIFIER_FILES];const bindings=files.map(path=>{if(!publicPaths.has(path)&&path!==sourceOnlyBth&&!QUALIFIER_FILES.includes(path))throw Error('PAN454_NON_PUBLIC_IMPORT_DENIED');return {path,sha256:sha256(checkedSource(path))};});
 const allowed=new Set(files);for(const path of files.filter(p=>p.endsWith('.mjs'))){const source=checkedSource(path).toString();for(const [,target] of source.matchAll(/(?:from\s*|import\s*\()\s*["']([^"']+)["']/g)){if(target.startsWith('node:'))continue;if(!target.startsWith('.'))throw Error('PAN454_EXTERNAL_IMPORT_DENIED');const imported=relative(repository,resolve(dirname(join(repository,path)),target));if(!allowed.has(imported))throw Error('PAN454_IMPORT_CLOSURE_INCOMPLETE:'+imported);}}
 const owner='pan454-'+randomUUID(),stage=mkdtempSync(join(scratchParent,'pan454-journey-')),subject=join(stage,'public-source');mkdirSync(subject,{mode:0o755});
 for(const path of files){const destination=join(subject,path);mkdirSync(dirname(destination),{recursive:true,mode:0o755});writeFileSync(destination,checkedSource(path),{mode:0o644});}
 const before=bindings.map(x=>({...x,sha256:sha256(readFileSync(join(subject,x.path)))}));assert.deepEqual(before,bindings);
 const startedAt=new Date().toISOString();let id,guest,created,kernelControls,exit,containerRemoved=false;let residueCount;
 try{
  const args=['create','--name',owner,'--label','io.pansphaira.pan454.owner='+owner,'--pull','never','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user','1000:1000','--memory','134217728','--memory-swap','134217728','--cpus','0.5','--pids-limit','64','--restart','no','--mount',`type=bind,src=${subject},dst=/subject,readonly`,'--tmpfs','/scratch:rw,noexec,nosuid,nodev,size=1m,mode=700,uid=1000,gid=1000','--env','HOME=/scratch','--env','TMPDIR=/scratch',imageReference,'node','/subject/src/pan454/journey-canary.mjs'];
  id=checked(args);created=inspect(id);const c=created.HostConfig;
  assert.equal(created.Config.Labels['io.pansphaira.pan454.owner'],owner);assert.equal(created.Image,image.Id);assert.equal(created.Config.User,'1000:1000');assert.equal(c.NetworkMode,'none');assert.equal(c.ReadonlyRootfs,true);assert.equal(c.Privileged,false);assert.deepEqual(c.CapDrop,['ALL']);assert(c.SecurityOpt.includes('no-new-privileges'));assert.equal(c.PidMode,'');assert.equal(c.Memory,134217728);assert.equal(c.MemorySwap,134217728);assert.equal(c.PidsLimit,64);assert.equal(c.NanoCpus,500000000);assert.equal(c.RestartPolicy.Name,'no');assert.deepEqual(c.PortBindings,{});
  const mounts=created.Mounts.map(m=>({type:m.Type,source:m.Source,destination:m.Destination,rw:m.RW})).sort((a,b)=>a.destination.localeCompare(b.destination));
  assert.deepEqual(mounts,[{type:'bind',source:subject,destination:'/subject',rw:false}]);
  assert.deepEqual(c.Tmpfs,{'/scratch':'rw,noexec,nosuid,nodev,size=1m,mode=700,uid=1000,gid=1000'});
  const names=created.Config.Env.map(x=>x.split('=')[0]).sort();assert.deepEqual(names,['HOME','NODE_VERSION','PATH','TMPDIR','YARN_VERSION']);
  kernelControls={networkMode:c.NetworkMode,readonlyRootfs:c.ReadonlyRootfs,capDrop:c.CapDrop,noNewPrivileges:true,user:created.Config.User,memoryBytes:c.Memory,memorySwapBytes:c.MemorySwap,pidsLimit:c.PidsLimit,nanoCpus:c.NanoCpus,binds:mounts.map(({type,destination,rw})=>({type,destination,rw})),scratchTmpfs:c.Tmpfs,pidMode:c.PidMode,privileged:c.Privileged,portBindings:c.PortBindings,environmentVariableNames:names};
  const result=docker(['start','--attach',id]);const after=inspect(id);exit={cli:result.status,container:after.State.ExitCode,running:after.State.Running,pid:after.State.Pid,oomKilled:after.State.OOMKilled};
  if(result.status!==0||after.State.ExitCode!==0||after.State.Running||after.State.Pid!==0||after.State.OOMKilled)throw Error('PAN454_GUEST_EXECUTION_FAILED:'+JSON.stringify(exit)+'\n'+result.stderr);
  guest=JSON.parse(result.stdout);assert.deepEqual(guest.sourceBindings,bindings);assert.deepEqual(guest.decision,conformanceDecision(guest.observations));assert.equal(guest.environment.uid,1000);assert.equal(guest.environment.effectiveCapabilities,'0000000000000000');assert.equal(guest.environment.noNewPrivileges,'1');
  const afterBindings=bindings.map(x=>({...x,sha256:sha256(readFileSync(join(subject,x.path)))}));assert.deepEqual(afterBindings,bindings);
 }finally{
  if(id){const current=inspect(id);if(current.Config.Labels?.['io.pansphaira.pan454.owner']!==owner)throw Error('PAN454_CLEANUP_OWNERSHIP_UNKNOWN_HELD');checked(['rm','--force',id]);const absent=docker(['inspect',id]);if(absent.status===0||!/No such (object|container)/i.test(absent.stderr))throw Error('PAN454_CONTAINER_RESIDUE_HELD');containerRemoved=true;}
  if(containerRemoved||!id){rmSync(stage,{recursive:true,force:false});residueCount=existsSync(stage)?readdirSync(stage).length:0;if(existsSync(stage)||residueCount!==0)throw Error('PAN454_STAGE_RESIDUE_HELD');}
 }
 const report={schemaVersion:JOURNEY_SCHEMA,scope:'LOCAL_SYNTHETIC_NETWORK_FREE_EVIDENCE_ONLY',sourceClosureClassification:'SOURCE_EVIDENCE_ONLY_NOT_RUNNABLE_PRODUCT_PACKAGE',adapter:ADAPTER,image:{id:image.Id,reference:imageReference,ociIndexDigest:IMAGE_ID,os:image.Os,arch:image.Architecture},sourceBindings:bindings,retainedProfileSha256:sha256(profile),retainedScratchProfileSha256:sha256(scratchProfile),dockerServerVersion:checked(['version','--format','{{.Server.Version}}']),inventory:CROSSINGS,observations:guest.observations,decision:guest.decision,guestEnvironment:guest.environment,actualContainerControls:kernelControls,execution:{startedAt,finishedAt:new Date().toISOString(),exit},cleanup:{containerRemoved,stageRemoved:!existsSync(stage),residueCount},canon:{'CM-CAN-09':'Synthetic scratch credential-separation hypothesis falsified; real custodian trigger absent/unqualified.','CM-CAN-18':'No host mount or live credential admitted; intra-container same-UID process/read access observed, broader no-ambient claim unqualified.','CM-CAN-19':'Current typed task denies are observed; complete intra-container mediation falsified by loopback/process/scratch canaries.','CM-CAN-20':'Actual network route and readonly write refusals are OS observations, not agent instructions. Host/daemon containment remains unqualified.','CM-CAN-22':'Current composed Policy/Approval/gate journey observed; shared-UID co-deployment is not a credential/state separation proof.','CM-CAN-23':'Model request/response trigger absent; unqualified.','CM-CAN-24':'Synthetic task journal observed; managed Mind trigger absent; same-UID foreign-state canary readable, no production multi-tenancy claim.','CM-CAN-27':'Only counts, typed errors, booleans, public-source/runtime hashes and synthetic receipt correlations retained; no state/key dump.','CM-CAN-28':'Exact image/source/profile/runtime scope only; no OpenClaw, other adapter or production maturity promotion.'},nonclaims:NONCLAIMS,deliveryGates:'Independent focused review, registered canonical CI, protected exact-head merge, functional evidence tooling release and public readbacks remain separate.'};
 return {...report,reportDigest:sha256(canonicalJson(report))};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(process.argv.length!==2)throw Error('PAN454_CLI_ARGUMENTS_DENIED');process.stdout.write(JSON.stringify(runJourneyEvidence(),null,2)+'\n');
}
