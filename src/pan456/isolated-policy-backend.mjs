import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { canonicalJson,sha256 } from '../../demo/runtime/enforcement-gate.mjs';
import { createInternalStaticPolicyEvaluator,validatePolicyEvaluationInput,validateTrustedPolicyContext,validatePolicyDecision } from '../../demo/runtime/policy-evaluator.mjs';
import { CANDIDATE,PROGRAM_TEXT,verifyInstalledCandidate } from './policy-backend-profile.mjs';
const worker=new URL('./jsonlogic-policy-worker.mjs',import.meta.url);
const policyBytes=()=>readFileSync(new URL('../../demo/manifests/authority/admin-ai-poc-policy-v1.json',import.meta.url));
function exact(x,keys){if(!x||typeof x!=='object'||Array.isArray(x)||canonicalJson(Object.keys(x).sort())!==canonicalJson([...keys].sort()))throw Error('PAN456_OWNER_CONFIG_DENIED');}
export function createIsolatedJsonLogicPolicyEvaluator(config) {
 exact(config,['policy','policySourceDigest']);verifyInstalledCandidate();
 const bytes=policyBytes();const snapshot=JSON.parse(bytes);const baseline=createInternalStaticPolicyEvaluator({policy:snapshot,policySourceDigest:sha256(bytes)});
 if(canonicalJson(config.policy)!==canonicalJson(snapshot)||config.policySourceDigest!==sha256(bytes))throw Error('PAN456_OWNER_POLICY_SNAPSHOT_DENIED');
 function observe(input,context,{programText=PROGRAM_TEXT,iterations=1}={}) {
  validatePolicyEvaluationInput(input);validateTrustedPolicyContext(context);
  if(context.policySourceDigest!==sha256(bytes)||context.policySemanticDigest!==baseline.policySemanticDigest)throw Error('POLICY_PROVIDER_CONTEXT_MISMATCH_DENIED');
  const started=process.hrtime.bigint();
  const result=spawnSync(process.execPath,[worker.pathname],{input:JSON.stringify({input,context,programText,iterations}),encoding:'utf8',timeout:15000,maxBuffer:65536,env:{PATH:process.env.PATH??'/usr/bin:/bin'},stdio:['pipe','pipe','pipe']});
  if(result.error)throw Error('PAN456_BACKEND_PROCESS_UNAVAILABLE_DENIED');
  let out;try{out=JSON.parse(result.stdout);}catch{throw Error('PAN456_BACKEND_OUTPUT_MALFORMED_DENIED');}
  if(result.status!==0){if(out.denied===true&&typeof out.code==='string')throw Error(out.code);throw Error('PAN456_BACKEND_PROCESS_FAILURE_DENIED');}
  if(Object.keys(out).sort().join(',')!==['credentialCanaryPresent','decision','evaluationNs','isolation','iterations','workerPid'].sort().join(',')||out.iterations!==iterations||!Number.isSafeInteger(out.workerPid)||out.workerPid===process.pid||!Number.isSafeInteger(out.evaluationNs)||out.evaluationNs<0||out.credentialCanaryPresent!==false||out.isolation!=='PROCESS_SEPARATION_NOT_OS_SANDBOX')throw Error('PAN456_BACKEND_OBSERVATION_DENIED');
  validatePolicyDecision(out.decision,input,context);
  if(out.decision.evaluator.providerId!=='jsonlogic-isolated-tooling'||out.decision.evaluator.providerVersion!==CANDIDATE.version)throw Error('PAN456_BACKEND_IDENTITY_DENIED');
  return {...out,roundTripNs:Number(process.hrtime.bigint()-started)};
 }
 return Object.freeze({providerId:'jsonlogic-isolated-tooling',providerVersion:CANDIDATE.version,policySemanticDigest:baseline.policySemanticDigest,evaluate:(input,context)=>observe(input,context).decision,observeForTooling:observe});
}
