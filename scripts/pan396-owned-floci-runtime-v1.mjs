// Finite issue-owned native lifecycle; Docker daemon is trusted parent authority, NEVER mounted in guest.
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const pinBytes=readFileSync(new URL('../tests/fixtures/pan396/floci-pin-v1.json',import.meta.url));
assert.equal(createHash('sha256').update(pinBytes).digest('hex'),'c0e71d8b017b426557204d5da8b6f421c651ab5a3059d010450eb730714d4923');
const PIN=JSON.parse(pinBytes);
export const FLOCI_IMAGE='floci/floci@sha256:2e2343974a15137a6bda6de5a9e0b16207f97a786cc57ee9c2bf25d14a67b84c';
export const FLOCI_SOURCE='560b3e4aae61cea3ac7d4d51843bdffd0e3085fd';
export class OwnedFlociRuntimeV1 {
 constructor(){const disabledServices=PIN.disabledServices;assert.equal(disabledServices.length,120);assert.equal(new Set(disabledServices).size,120);assert(!disabledServices.includes('s3')&&!disabledServices.includes('sqs'));this.disabledServices=Object.freeze([...disabledServices]);this.name='pan396-'+randomUUID();this.label='pan396.owner='+this.name;this.created={network:false,volume:false,container:false};this.observations=[];}
 docker(...args){return execFileSync('docker',args,{encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024});}
 logs(){const r=spawnSync('docker',['logs',this.name],{encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024});assert.equal(r.status,0);return {stdout:r.stdout,stderr:r.stderr};}
 inspect(kind,name){return JSON.parse(this.docker(kind,'inspect',name))[0];}
 assertOwned(kind,name){const r=this.inspect(kind,name);const labels=kind==='container'?r.Config.Labels:r.Labels;assert.equal(labels['pan396.owner'],this.name);return r;}
 async start(){
  const image=this.inspect('image',FLOCI_IMAGE);assert.equal(image.Os,'linux');assert.equal(image.Architecture,'amd64');assert(image.RepoDigests.includes(FLOCI_IMAGE));assert.equal(image.Config.Labels['org.opencontainers.image.revision'],FLOCI_SOURCE);assert(image.Config.Env.includes('FLOCI_VERSION=2.1.0'));
  this.imageIdentity={ref:FLOCI_IMAGE,imageId:image.Id,source:FLOCI_SOURCE,version:'2.1.0',sourceLabelVerified:true,verifiedBeforeCreateAndStart:true};
  this.docker('network','create','--internal','--label',this.label,this.name);this.created.network=true;assert(this.assertOwned('network',this.name).Internal);
  this.docker('volume','create','--label',this.label,this.name);this.created.volume=true;this.assertOwned('volume',this.name);
  const properties=['-Dquarkus.http.host=0.0.0.0','-Dfloci.storage.mode=memory','-Dfloci.services.s3.enabled=true','-Dfloci.services.sqs.enabled=true',...this.disabledServices.map(s=>'-Dfloci.services.'+s+'.enabled=false')];
  assert(properties.every(p=>/^-D[a-z0-9.-]+=[a-z0-9.:]+$/.test(p)));
  this.docker('create','--name',this.name,'--label',this.label,'--network',this.name,'--user','1001:0','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--memory','512m','--cpus','1','--pids-limit','128','--tmpfs','/tmp:rw,noexec,nosuid,size=67108864','--mount','type=volume,source='+this.name+',target=/app/data',FLOCI_IMAGE,'/app/application',...properties);this.created.container=true;
  const c=this.assertOwned('container',this.name);assert.equal(c.Config.User,'1001:0');assert(c.HostConfig.ReadonlyRootfs&&!c.HostConfig.Privileged);assert(c.HostConfig.CapDrop.includes('ALL'));assert.equal(c.HostConfig.NetworkMode,this.name);assert.equal(Object.keys(c.HostConfig.PortBindings??{}).length,0);assert.equal(c.Mounts.length,1);assert.equal(c.Mounts[0].Type,'volume');assert.equal(c.Mounts[0].Name,this.name);assert.equal(c.Mounts[0].Destination,'/app/data');assert(!c.Config.Env.some(s=>/^(AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN)=./.test(s)));assert(!JSON.stringify(c.Mounts).includes('docker.sock'));
  this.docker('start',this.name);const started=this.assertOwned('container',this.name);const network=started.NetworkSettings.Networks[this.name];if(!network.IPAddress){this.failedStart={state:started.State,configuredUser:started.Config.User,command:started.Config.Cmd,logs:this.logs()};throw new Error('PAN396_START_NO_ALLOCATED_IP:'+JSON.stringify(this.failedStart));}this.endpoint='http://'+network.IPAddress+':4566';
  this.actualBoundary={user:c.Config.User,privileged:c.HostConfig.Privileged,readonlyRootfs:c.HostConfig.ReadonlyRootfs,capDrop:c.HostConfig.CapDrop,securityOpt:c.HostConfig.SecurityOpt,publishedPorts:c.HostConfig.PortBindings,mounts:c.Mounts.map(m=>({type:m.Type,name:m.Name,destination:m.Destination,rw:m.RW})),networkInternal:true,explicitEnabledServices:['s3','sqs'],explicitDisabledServiceCount:this.disabledServices.length,properties:[...properties],noRealAwsCredentials:true,noDockerSocket:true,notHostOsSandbox:true};
  const until=Date.now()+30000;let failure;
  while(Date.now()<until){try{const r=await fetch(this.endpoint+'/_localstack/health',{signal:AbortSignal.timeout(1000),redirect:'error'});if(r.status===200){this.health=await r.json();return this;}}catch(error){failure=error.message;}const state=this.inspect('container',this.name).State;if(!state.Running)throw new Error('PAN396_NATIVE_START_FAILED:'+state.ExitCode+':'+this.docker('logs',this.name));await new Promise(resolve=>setTimeout(resolve,200));}
  throw new Error('PAN396_NATIVE_HEALTH_TIMEOUT:'+failure);
 }
 cleanup(){const errors=[];
  for(const [kind,args] of [['container',['container','rm','--force',this.name]],['volume',['volume','rm',this.name]],['network',['network','rm',this.name]]]){
   if(!this.created[kind])continue;try{this.assertOwned(kind,this.name);this.docker(...args);this.created[kind]=false;}catch(error){errors.push(kind+':'+error.message);}
  }
  const residue={containers:this.docker('ps','-aq','--filter','label='+this.label).trim().split('\n').filter(Boolean),volumes:this.docker('volume','ls','-q','--filter','label='+this.label).trim().split('\n').filter(Boolean),networks:this.docker('network','ls','-q','--filter','label='+this.label).trim().split('\n').filter(Boolean)};
  this.cleanupReadback={errors,residue,allOwnedExecutionResourcesZero:errors.length===0&&Object.values(residue).every(xs=>xs.length===0),immutableSharedInputImageAndEvidenceNotPurged:true};assert(this.cleanupReadback.allOwnedExecutionResourcesZero,JSON.stringify(this.cleanupReadback));return this.cleanupReadback;
 }
}
