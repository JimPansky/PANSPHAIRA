// Execute, then emit a minimal public native-gate summary. Never publish state,
// keys, permission files or raw internal container logs. No pass from receipts.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {runBoundedProcess,sanitizeArtifactText} from './demo-current-head-e2e.mjs';
import {verifyForwardCheckout,verifyForwardEnvironment} from './run-forward-paired-analytics.mjs';
import {SOURCE_PAN_V1,CONSUMER_KS_V1,NODE_OCI_V1,SUPERSET_OCI_V1} from '../src/pan464/retained-pair-plan.mjs';
const pan=realpathSync(resolve(fileURLToPath(import.meta.url),'../..'));
if(process.argv.length!==4||process.argv[2]!=='--output')throw Error('PAN464_SUMMARY_ARGUMENTS_REQUIRED');
const output=resolve(process.argv[3]);
const source=realpathSync(process.env.PAN464_SOURCE_ROOT),consumer=realpathSync(process.env.PAN464_KS_ROOT),scratch=realpathSync(process.env.PAN464_OWNED_ROOT);
for(const root of [pan,source,consumer]){const rel=relative(root,output);if(!rel||(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('../')))throw Error('PAN464_SUMMARY_OUTSIDE_SOURCE_REQUIRED');}
verifyForwardEnvironment();
const head=execFileSync('git',['rev-parse','HEAD'],{cwd:pan,encoding:'utf8'}).trim();
if(process.env.EXPECTED_PAN_HEAD!==head)throw Error('PAN464_EXPECTED_HEAD_REQUIRED');
const identities={source:verifyForwardCheckout(source,SOURCE_PAN_V1),target:verifyForwardCheckout(pan,head),consumer:verifyForwardCheckout(consumer,CONSUMER_KS_V1)};
const imageId=process.env.PAN464_IMAGE_ID;
if(!/^sha256:[a-f0-9]{64}$/.test(imageId??''))throw Error('PAN464_IMAGE_REQUIRED');
if(execFileSync('docker',['image','inspect','--format','{{.Id}}',imageId],{encoding:'utf8'}).trim()!==imageId)throw Error('PAN464_IMAGE_UNAVAILABLE');
const env=Object.fromEntries(['PATH','HOME','LANG','LC_ALL','TMPDIR','PAN464_SOURCE_ROOT','PAN464_KS_ROOT','PAN464_OWNED_ROOT','PAN464_IMAGE_ID'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
const command=['--test','--test-reporter=tap','--test-concurrency=1','tests/pan464/native-controller.test.mjs'];
const result=await runBoundedProcess(process.execPath,command,{cwd:pan,env,timeoutMs:2400000});
const transcript=result.stdout+result.stderr;
console.log(sanitizeArtifactText(transcript,{privateRoots:[pan,source,consumer,scratch]}));
const count=name=>Number(transcript.match(new RegExp(`^# ${name} (\\d+)$`,'m'))?.[1]??NaN);
const tests=count('tests'),passed=count('pass'),failed=count('fail'),skipped=count('skipped');
const checks=[...transcript.matchAll(/^ok \d+ - (.+)$/gm)].map(match=>match[1]);
if(result.code!==0||result.timedOut||failed!==0||skipped!==0||tests!==11||passed!==tests||checks.length!==tests)throw Error('PAN464_NATIVE_GATE_FAILED');
verifyForwardCheckout(pan,head);verifyForwardCheckout(source,SOURCE_PAN_V1);verifyForwardCheckout(consumer,CONSUMER_KS_V1);
const bindings=Object.fromEntries(['src/pan464/retained-pair-controller.mjs','src/pan464/native-producer.mjs','src/pan464/native-consumer.py','src/pan464/protected-oracle.mjs','tests/pan464/native-controller.test.mjs'].map(path=>[path,createHash('sha256').update(readFileSync(resolve(pan,path))).digest('hex')]));
const summary={schemaVersion:'pansphaira.pan464/native-qualification-summary/v1',classification:'LOCAL_SYNTHETIC_RETAINED_PAIR_EXECUTION',outcome:'PASS',identities,
 runtime:{node:process.version,abi:process.versions.modules,nodeOci:NODE_OCI_V1,supersetOci:SUPERSET_OCI_V1,imageId},command:['node',...command],exit:result.code,tests,passed,failed,skipped,checks,bindings,
 nonclaims:['NO_PRODUCTION_OR_CUSTOMER_DATA','NO_ARBITRARY_VERSION_OR_ROLLING_UPDATE','NO_HOST_ADMIN_CONFINEMENT','NO_OFFHOST_BACKUP','NO_POWER_LOSS_GUARANTEE','SUPERSET_DB_UPGRADE_COMMAND_NOT_SCHEMA_CHANGE_ASSERTION','NO_PUBLICATION_OR_ISSUE_CLOSURE_AUTHORITY']};
writeFileSync(output,JSON.stringify(summary,null,2)+'\n',{flag:'wx',mode:0o600});
