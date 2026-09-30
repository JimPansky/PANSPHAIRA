// Explicitly authorized LOCAL SYNTHETIC qualification; not a deploy command.
import {readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {relative,resolve,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRetainedPairControllerV1} from '../src/pan464/retained-pair-controller.mjs';
const names=['--source','--counterpart','--owned-root','--image-id','--pan-head','--permission-file','--output'];
const args=process.argv.slice(2);
if(args.length!==names.length*2||names.some(n=>args.filter(x=>x===n).length!==1)||args.some((x,i)=>i%2===0&&!names.includes(x)))throw Error('PAN464_ARGUMENTS_REQUIRED');
const option=n=>args[args.indexOf(n)+1];
const panRoot=realpathSync(resolve(fileURLToPath(import.meta.url),'../..'));
const ownedRoot=realpathSync(option('--owned-root'));
const permissionFile=realpathSync(option('--permission-file'));
const output=resolve(option('--output'));
function within(parent,path){const rel=relative(parent,path);return !rel||(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('../'));}
if(within(resolve(ownedRoot,'pan464-owned-v1'),permissionFile)||within(panRoot,output)||within(option('--source'),output)||within(option('--counterpart'),output))throw Error('PAN464_PROTECTED_PATH_REQUIRED');
const controller=createRetainedPairControllerV1({ownedRoot,panRoot,sourceRoot:realpathSync(option('--source')),ksRoot:realpathSync(option('--counterpart')),
  targetHead:option('--pan-head'),imageId:option('--image-id'),readPermission:()=>JSON.parse(readFileSync(permissionFile,'utf8'))});
const pairs=await controller.qualifyPairs();
const source=await controller.initialize();
const unadmitted=await controller.probeUnadmitted();
const upgraded=await controller.upgrade({operation:'UPGRADE',planDigest:controller.edge.nativePlan.planDigest});
const postActivation=upgraded.outcome==='ACTIVE'?await controller.writeAfterActivation():null;
const recovery=await controller.readRecovery();
const result={classification:'LOCAL_SYNTHETIC_RETAINED_PAIR_EXECUTION',edge:controller.edge,pairs,source,unadmitted,upgraded,postActivation,
  recovery:{outcome:recovery.outcome,phase:recovery.phase,retainedDigest:recovery.retainedDigest,checkpointPresent:recovery.checkpointPresent,containerCount:recovery.containers.length},
  nonclaims:['NO_PRODUCTION_DEPLOYMENT','NO_ARBITRARY_VERSION_SUPPORT','NO_HOST_ADMIN_CONFINEMENT','NO_OFFHOST_BACKUP','SUPERSET_COMMAND_EXECUTED_SCHEMA_CHANGE_NOT_ASSERTED','NOT_PUBLICATION_OR_ACCEPTANCE_AUTHORITY']};
writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({outcome:upgraded.outcome,postActivation:postActivation!==null,releaseAuthority:false}));
