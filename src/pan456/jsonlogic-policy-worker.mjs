import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { canonicalJson,sha256 } from '../../demo/runtime/enforcement-gate.mjs';
import { createInternalStaticPolicyEvaluator,validatePolicyEvaluationInput,validateTrustedPolicyContext,validatePolicyDecision,POLICY_DECISION_SCHEMA } from '../../demo/runtime/policy-evaluator.mjs';
import { CANDIDATE,PROGRAM_TEXT,verifyInstalledCandidate } from './policy-backend-profile.mjs';
function exact(x,keys,code){if(!x||typeof x!=='object'||Array.isArray(x)||canonicalJson(Object.keys(x).sort())!==canonicalJson([...keys].sort()))throw Error(code);}
try {
 verifyInstalledCandidate();
 const require=createRequire(import.meta.url);const logic=require('json-logic-js');
 const bytes=readFileSync(new URL('../../demo/manifests/authority/admin-ai-poc-policy-v1.json',import.meta.url));const policy=JSON.parse(bytes);const base=createInternalStaticPolicyEvaluator({policy,policySourceDigest:sha256(bytes)});
 const stdin=readFileSync(0);if(stdin.length>32768)throw Error('PAN456_WORKER_INPUT_SIZE_DENIED');const request=JSON.parse(stdin);
 exact(request,['input','context','programText','iterations'],'PAN456_WORKER_ENVELOPE_DENIED');
 if(request.programText!==PROGRAM_TEXT)throw Error('PAN456_PROGRAM_SUBSTITUTION_DENIED');
 if(!Number.isSafeInteger(request.iterations)||request.iterations<1||request.iterations>1000)throw Error('PAN456_ITERATION_BOUND_DENIED');
 const input=validatePolicyEvaluationInput(request.input);const context=validateTrustedPolicyContext(request.context);
 if(context.policyId!==policy.policyId||context.policySourceDigest!==sha256(bytes)||context.policySemanticDigest!==base.policySemanticDigest)throw Error('POLICY_PROVIDER_CONTEXT_MISMATCH_DENIED');
 const program=JSON.parse(PROGRAM_TEXT);const sourceDigest=sha256(bytes);let decision;const start=process.hrtime.bigint();
 for(let n=0;n<request.iterations;n++){
  validatePolicyEvaluationInput(input);validateTrustedPolicyContext(context);
  if(context.policySourceDigest!==sourceDigest||context.policySemanticDigest!==base.policySemanticDigest)throw Error('POLICY_PROVIDER_CONTEXT_MISMATCH_DENIED');
  const index=logic.apply(program,{capability:input.capability});if(![0,1,2].includes(index))throw Error('PAN456_BACKEND_RESULT_DENIED');const row=policy.rules[index];
  const core={schemaVersion:POLICY_DECISION_SCHEMA,inputDigest:sha256(canonicalJson(input)),contextDigest:sha256(canonicalJson(context)),evaluator:{providerId:'jsonlogic-isolated-tooling',providerVersion:CANDIDATE.version},outcome:row.outcome,reasonCodes:[row.reasonCode],constraints:{authorityIssuer:'CHIMPMAERA_GATE_ONLY',maximumEffects:row.outcome==='DENY'?0:1,exactInputRequired:true}};
  decision={...core,decisionDigest:sha256(canonicalJson(core))};
 }
 const evaluationNs=Number(process.hrtime.bigint()-start);validatePolicyDecision(decision,input,context);
 process.stdout.write(JSON.stringify({decision,evaluationNs,iterations:request.iterations,workerPid:process.pid,credentialCanaryPresent:Object.hasOwn(process.env,'PAN456_CREDENTIAL_CANARY'),isolation:'PROCESS_SEPARATION_NOT_OS_SANDBOX'})+'\n');
}catch(error){process.stdout.write(JSON.stringify({denied:true,code:error.message})+'\n');process.exitCode=2;}
