import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chmodSync,existsSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,isAbsolute,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export const PACKET_RELATIVE_PATH='tests/fixtures/pan378/spent-evaluation-v3';
export const TRUSTED_SPENT_PILOT_V3=Object.freeze({
 manifestSha256:'673c2d406e2b3edf9f612910e1b7bc7c4dc3ecc99a661f7243f47baeaf06204f',
 bundleSha256:'4a1a0795c0c7f9649e05e32d7af0aa4e1d05fda913bd7b3530c7eab5295307b7',
 reportSha256:'93543d7a2e7282431812fc680d9db8b8605095df6b519fdb6ae94201e946448e',
 custodyHead:'151cbc2dd63ca84003b663468e16aadd88f7df1d',
 custodyTree:'820adefce0e5135aba690ed7ee3ae1f924d14b8f',
 parserSha256:'75953ec8d4f2f21626e0e7d520c0a84d39d00644fc7e8d22840f45240245c97a',
 oracleSha256:'941442c935d046401fe811f0ad0066091c9fbaf1c1592af6ad61096f072566c9',
 sourceEntryCount:39,
});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function requireEvidence(condition,code){if(!condition)throw new Error(code);}
function regularBytes(path){
 const absolute=resolve(path);let at=absolute;
 while(true){requireEvidence(!lstatSync(at).isSymbolicLink(),'PACKET_SYMLINK_DENIED');const parent=dirname(at);if(parent===at)break;at=parent;}
 requireEvidence(lstatSync(absolute).isFile(),'PACKET_REGULAR_FILE_REQUIRED');return readFileSync(absolute);
}
function sealedEnvironment(home,tmp){return {
 PATH:'/usr/bin:/bin',HOME:home,TMPDIR:tmp,LANG:'C.UTF-8',LC_ALL:'C.UTF-8',
 GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0',
 GIT_CONFIG_COUNT:'2',GIT_CONFIG_KEY_0:'core.hooksPath',GIT_CONFIG_VALUE_0:'/dev/null',
 GIT_CONFIG_KEY_1:'protocol.file.allow',GIT_CONFIG_VALUE_1:'always',
 NODE_DISABLE_COMPILE_CACHE:'1',
};}
function execute(command,args,cwd,env){
 const out=spawnSync(command,args,{cwd,env,encoding:null,maxBuffer:16*1024*1024,timeout:60000});
 requireEvidence(!out.error&&out.status===0,'SPENT_REPLAY_SUBPROCESS_DENIED');return out;
}
function git(args,cwd,env){return execute('/usr/bin/git',['-c','core.hooksPath=/dev/null',...args],cwd,env).stdout;}
function textGit(args,cwd,env){return git(args,cwd,env).toString('utf8').trim();}
function sourceRows(source,manifest,env){
 requireEvidence(textGit(['rev-parse','HEAD^{tree}'],source,env)===TRUSTED_SPENT_PILOT_V3.custodyTree,'CUSTODY_TREE_DENIED');
 const lines=textGit(['ls-tree','-r','--full-tree','HEAD'],source,env).split('\n');
 requireEvidence(lines.length===TRUSTED_SPENT_PILOT_V3.sourceEntryCount,'CUSTODY_SOURCE_SET_DENIED');
 const seen=new Set();const rows=lines.map(line=>{
  const [meta,path]=line.split('\t');const [mode,type,object]=meta.split(' ');
  requireEvidence(['100644','100755'].includes(mode)&&type==='blob'&&/^[a-f0-9]{40}$/.test(object)&&/^[A-Za-z0-9._/-]+$/.test(path)&&!path.startsWith('/')&&!path.split('/').some(x=>['.','..',''].includes(x))&&Object.hasOwn(manifest.sourceBindings,path)&&!seen.has(path),'CUSTODY_PATH_OR_TYPE_DENIED');
  seen.add(path);const bytes=git(['cat-file','blob',object],source,env);
  requireEvidence(sha(bytes)===manifest.sourceBindings[path],'CUSTODY_SOURCE_DIGEST_DENIED');
  requireEvidence(sha(regularBytes(join(source,path)))===manifest.sourceBindings[path],'CUSTODY_CHECKOUT_DIGEST_DENIED');
  return {path,sha256:sha(bytes)};
 });
 requireEvidence(seen.size===Object.keys(manifest.sourceBindings).length,'CUSTODY_SOURCE_SET_DENIED');return rows;
}
function treeModes(root,readOnly){
 for(const name of readdirSync(root)){
  const path=join(root,name);const metadata=lstatSync(path);requireEvidence(!metadata.isSymbolicLink(),'CUSTODY_SYMLINK_DENIED');
  if(metadata.isDirectory()){if(!readOnly)chmodSync(path,0o700);treeModes(path,readOnly);if(readOnly)chmodSync(path,0o500);}
  else{requireEvidence(metadata.isFile(),'CUSTODY_SPECIAL_FILE_DENIED');chmodSync(path,readOnly?0o400:0o600);}
 }
 chmodSync(root,readOnly?0o500:0o700);
}
export function replaySpentPilotV3({packetDir=join(ROOT,PACKET_RELATIVE_PATH),scratchRoot=process.env.TMPDIR??process.env.RUNNER_TEMP}={}){
 requireEvidence(typeof scratchRoot==='string'&&isAbsolute(scratchRoot)&&scratchRoot!=='/'&&lstatSync(scratchRoot).isDirectory()&&!lstatSync(scratchRoot).isSymbolicLink()&&realpathSync(scratchRoot)===resolve(scratchRoot),'PAN378_OWNED_SCRATCH_REQUIRED');
 const manifestBytes=regularBytes(join(packetDir,'packet-manifest.json'));
 requireEvidence(sha(manifestBytes)===TRUSTED_SPENT_PILOT_V3.manifestSha256,'SPENT_PACKET_MANIFEST_TRUST_ROOT_DENIED');
 const manifest=JSON.parse(manifestBytes.toString('utf8'));
 const bundleBytes=regularBytes(join(packetDir,'new-epoch-v3-evaluated-custody.bundle'));
 requireEvidence(bundleBytes.length===597621&&sha(bundleBytes)===TRUSTED_SPENT_PILOT_V3.bundleSha256,'SPENT_BUNDLE_TRUST_ROOT_DENIED');
 const expectedReport=regularBytes(join(packetDir,'report-v3.json'));
 requireEvidence(expectedReport.length===10104&&sha(expectedReport)===TRUSTED_SPENT_PILOT_V3.reportSha256,'SPENT_REPORT_TRUST_ROOT_DENIED');
 requireEvidence(manifest.custodyHead===TRUSTED_SPENT_PILOT_V3.custodyHead&&manifest.custodyTree===TRUSTED_SPENT_PILOT_V3.custodyTree&&manifest.sourceEntryCount===39&&manifest.verdict==='FALSIFIED_WITH_EVIDENCE'&&manifest.custodyHistoryIsSeparateFromCanonicalProductHistory&&manifest.privateOriginalSeedKeyPlaintextGoldExcluded&&manifest.onlyScopedPostFreezeSyntheticDisclosureIncluded,'SPENT_PACKET_BOUNDARY_DENIED');
 const owned=mkdtempSync(join(scratchRoot,'pan378-replay-'));let result;
 try{
  const home=join(owned,'home');mkdirSync(home,{mode:0o700});const env=sealedEnvironment(home,owned);
  const bundle=join(owned,'custody.bundle');writeFileSync(bundle,bundleBytes,{flag:'wx',mode:0o400});
  const bare=join(owned,'verify.git');git(['init','--bare',bare],owned,env);git(['bundle','verify',bundle],bare,env);
  const source=join(owned,'source');git(['clone','--no-checkout',bundle,source],owned,env);git(['checkout','--detach',TRUSTED_SPENT_PILOT_V3.custodyHead],source,env);
  requireEvidence(textGit(['rev-parse','HEAD'],source,env)===TRUSTED_SPENT_PILOT_V3.custodyHead,'CUSTODY_HEAD_DENIED');
  const rows=sourceRows(source,manifest,env);
  requireEvidence(rows.find(x=>x.path==='scripts/document-ai-pilot-candidate.mjs')?.sha256===TRUSTED_SPENT_PILOT_V3.parserSha256&&rows.find(x=>x.path==='scripts/document-ai-pilot-oracle.mjs')?.sha256===TRUSTED_SPENT_PILOT_V3.oracleSha256,'PARSER_OR_ORACLE_SOURCE_DENIED');
  requireEvidence(textGit(['status','--porcelain=v1'],source,env)==='','CUSTODY_DIRTY_CHECKOUT_DENIED');
  treeModes(source,true);
  const output=join(owned,'complete-oracle-report.json');
  const executed=execute(process.execPath,[join(source,'scripts/document-ai-pilot-oracle.mjs'),'--output',output],source,env);
  requireEvidence(executed.stdout.toString('utf8').startsWith('FALSIFIED_WITH_EVIDENCE report=sha256:'),'FULL_ORACLE_VERDICT_DENIED');
  const bytes=regularBytes(output);requireEvidence(bytes.equals(expectedReport)&&sha(bytes)===TRUSTED_SPENT_PILOT_V3.reportSha256,'FULL_ORACLE_BYTE_REPLAY_DENIED');
  const report=JSON.parse(bytes.toString('utf8'));
  requireEvidence(report.outcome==='SCORED'&&report.verdict==='FALSIFIED_WITH_EVIDENCE'&&report.schemaVersion==='pansphaira.document-ai-pilot/report/v2','FULL_ORACLE_SCOPE_DENIED');
  requireEvidence(report.adversarialMatrix.length===9&&report.adversarialMatrix.every(x=>x.passed===true&&x.outcome==='DENIED'&&x.reasonCode===x.expectedReasonCode),'FULL_ORACLE_ADVERSARIAL_MATRIX_DENIED');
  sourceRows(source,manifest,env);
  result={
   schemaVersion:'pansphaira.pan378/spent-pilot-reproduction/v1',epoch:manifest.epoch,
   outcome:'REPRODUCED_SPENT_EVALUATION',verdict:report.verdict,
   custodyHead:TRUSTED_SPENT_PILOT_V3.custodyHead,custodyTree:TRUSTED_SPENT_PILOT_V3.custodyTree,
   packetManifestSha256:sha(manifestBytes),bundleSha256:sha(bundleBytes),reportFileSha256:sha(bytes),
   reportWireVersion:report.schemaVersion,parserSha256:TRUSTED_SPENT_PILOT_V3.parserSha256,
   oracleSha256:TRUSTED_SPENT_PILOT_V3.oracleSha256,sourceEntryCount:rows.length,
   completeOracleExecuted:true,oracleExit:0,reportByteIdentical:true,adversarialProbes:report.adversarialMatrix.length,
   testedScope:report.testedScope,denominators:report.denominators,metrics:report.metrics,
   errorCount:report.errors.length,abstentionCount:report.abstentions.length,calibration:report.calibration,
   subprocessEnvironment:'CLEARED_NO_CREDENTIALS_NO_GLOBAL_GIT_CONFIG_NO_HOOKS',readOnlyCustody:true,
   bundleIsSeparateEvidenceHistory:true,newBlindTrial:false,newOcrOrParserTrial:false,parserOracleGeneratorChanged:false,
   productionOrBookingAuthority:false,runnableProductPackage:false,original7SelfAccepted:false,
   nonclaims:['POSTFREEZE_DISCLOSED_REPRODUCTION_NOT_NEW_BLIND_TRIAL','NO_AP03_OCR_OR_MODEL_QUALITY_CLAIM','NO_CUSTOMER_OR_CORPUS_GENERALIZATION_CLAIM','LOCAL_PROCESS_HYGIENE_NOT_HOST_SANDBOX'],
  };
 }finally{
  if(existsSync(owned)){treeModes(owned,false);rmSync(owned,{recursive:true,force:false});}
 }
 requireEvidence(!existsSync(owned),'SPENT_REPLAY_CLEANUP_DENIED');return Object.freeze({...result,scratchRemoved:true});
}
