// Execute LIFE-06 real native integration before emitting public-safe facts.
// No pass from a supplied receipt; no publication of grants/history/raw stores.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,realpathSync,readdirSync,lstatSync} from 'node:fs';
import {resolve,relative,isAbsolute,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {runBoundedProcess,sanitizeArtifactText} from './demo-current-head-e2e.mjs';
import {verifyForwardCheckout,verifyForwardEnvironment} from './run-forward-paired-analytics.mjs';
import {SOURCE_PAN_V1,CONSUMER_KS_V1,NODE_OCI_V1,SUPERSET_OCI_V1} from '../src/pan464/retained-pair-plan.mjs';
const pan=realpathSync(resolve(fileURLToPath(import.meta.url),'../..'));
if(process.argv.length!==4||process.argv[2]!=='--output')throw Error('PAN466_SUMMARY_ARGUMENTS_REQUIRED');
const output=resolve(process.argv[3]);
const source=realpathSync(process.env.PAN466_SOURCE_ROOT),consumer=realpathSync(process.env.PAN466_KS_ROOT),scratch=realpathSync(process.env.PAN466_OWNED_ROOT);
for(const root of [pan,source,consumer]){const p=relative(root,output);if(!p||(!isAbsolute(p)&&p!=='..'&&!p.startsWith('../')))throw Error('PAN466_SUMMARY_OUTSIDE_SOURCE_REQUIRED');}
verifyForwardEnvironment();
const head=execFileSync('git',['rev-parse','HEAD'],{cwd:pan,encoding:'utf8'}).trim();
if(process.env.EXPECTED_PAN_HEAD!==head)throw Error('PAN466_EXPECTED_HEAD_REQUIRED');
const identities={source:verifyForwardCheckout(source,SOURCE_PAN_V1),target:verifyForwardCheckout(pan,head),consumer:verifyForwardCheckout(consumer,CONSUMER_KS_V1)};
const imageId=process.env.PAN466_IMAGE_ID;
if(!/^sha256:[a-f0-9]{64}$/.test(imageId??'')||execFileSync('docker',['image','inspect','--format','{{.Id}}',imageId],{encoding:'utf8'}).trim()!==imageId)throw Error('PAN466_QUALIFIED_IMAGE_REQUIRED');
const before=new Set(readdirSync(scratch));
const env=Object.fromEntries(['PATH','HOME','LANG','LC_ALL','TMPDIR','PAN466_SOURCE_ROOT','PAN466_KS_ROOT','PAN466_OWNED_ROOT','PAN466_IMAGE_ID'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
const command=['--test','--test-reporter=tap','--test-concurrency=1','tests/pan466/qualified-module-native.test.mjs'];
const result=await runBoundedProcess(process.execPath,command,{cwd:pan,env,timeoutMs:2400000});
const transcript=result.stdout+result.stderr;
console.log(sanitizeArtifactText(transcript,{privateRoots:[pan,source,consumer,scratch]}));
const count=name=>Number(transcript.match(new RegExp(`^# ${name} (\\d+)$`,'m'))?.[1]??NaN);
const tests=count('tests'),passed=count('pass'),failed=count('fail'),skipped=count('skipped');
if(result.code!==0||result.timedOut||failed!==0||skipped!==0||tests!==6||passed!==tests)throw Error('PAN466_NATIVE_GATE_FAILED');
const created=readdirSync(scratch).filter(name=>!before.has(name)&&name.startsWith('pan466-actor-'));
if(created.length!==1)throw Error('PAN466_OBSERVED_CASE_BINDING_REQUIRED');
const observedPath=join(scratch,created[0],'safe-native-case-observations.json');
if(!lstatSync(observedPath).isFile()||lstatSync(observedPath).isSymbolicLink()||lstatSync(observedPath).size>65536)throw Error('PAN466_OBSERVED_CASE_BYTES_DENIED');
const observed=JSON.parse(readFileSync(observedPath,'utf8'));
const expected=['current-authorized','generation-changed','permission-revoked','generation-changed-and-revoked','fresh-compatible-rebinding'];
if(observed.schemaVersion!==1||observed.targetHead!==head||observed.imageId!==imageId||observed.classification!=='LOCAL_SYNTHETIC_EXACT_NATIVE_MODULE_USE'
 ||!Array.isArray(observed.cases)||observed.cases.length!==expected.length||observed.cases.some((x,i)=>x.case!==expected[i]||x.historyActualReadback!==true)
 ||new Set(observed.cases.map(x=>x.pid)).size!==1)throw Error('PAN466_OBSERVED_CASE_BINDING_DENIED');
verifyForwardCheckout(pan,head);verifyForwardCheckout(source,SOURCE_PAN_V1);verifyForwardCheckout(consumer,CONSUMER_KS_V1);
const paths=['src/pan466/qualified-retained-module.mjs','src/pan466/module-lifecycle-check.mjs','scripts/run-pan466-native-qualification.mjs','tests/pan466/qualified-module-native.test.mjs','tests/pan466/qualified-module-process.mjs'];
const bindings=Object.fromEntries(paths.map(path=>[path,createHash('sha256').update(readFileSync(resolve(pan,path))).digest('hex')]));
const summary={schemaVersion:'pansphaira.pan466/native-qualified-module-summary/v1',classification:'LOCAL_SYNTHETIC_EXACT_NATIVE_MODULE_USE',outcome:'PASS',identities,
 runtime:{node:process.version,abi:process.versions.modules,nodeOci:NODE_OCI_V1,supersetOci:SUPERSET_OCI_V1,imageId},command:['node',...command],exit:result.code,tests,passed,failed,skipped,scenarioCount:observed.cases.length,cases:observed.cases,bindings,
 nonclaims:['NO_GRANT_FROM_MODULE_METADATA_OR_HISTORY','NO_WHOLE_REPOSITORY_PILOT_COVERAGE','NO_GENERIC_SCHEDULER_OR_ARBITRARY_PAIR','NO_PRODUCTION_OR_CUSTOMER_EFFECTS','NO_HOST_ADMIN_CONFINEMENT','COOPERATIVE_IPC_WAIT_NOT_OS_SUSPENSION_OR_POWER_LOSS','NO_PUBLICATION_OR_ISSUE_CLOSURE_AUTHORITY']};
writeFileSync(output,JSON.stringify(summary,null,2)+'\n',{flag:'wx',mode:0o600});
