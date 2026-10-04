#!/usr/bin/env node
// J01 live consumer only: never starts or replaces the independently owned provider.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {canonicalJson,configureExternalBiServiceV2,invokeExternalBiServiceV2,probeExternalBiServiceV2} from '../dist/packages/contracts/src/index.js';

const baseUrl=process.argv[2];
if(!baseUrl)throw new Error('PAN524_EXPLICIT_PROVIDER_URL_REQUIRED');
const config=configureExternalBiServiceV2({BI_AGENT_BASE_URL:baseUrl,BI_AGENT_PAIR_PROFILE:'KS_J02_0181_C2_V1',BI_AGENT_TIMEOUT_MS:'30000'});
assert.equal(config.outcome,'VERIFIED');
const fixture=JSON.parse(await readFile(new URL('../tests/fixtures/pan524/published-j02-provider-v0181.json',import.meta.url),'utf8'));
const runId='pan524-'+randomUUID().replaceAll('-','');
const requests=[];
const auditedFetch=async(input,init)=>{
  const url=new URL(String(input));assert.equal(url.origin,new URL(baseUrl).origin);
  assert(['\/v2/capabilities','\/v2/provider-profile','\/v2/intents'].includes(url.pathname));
  const result=await fetch(input,init);requests.push({route:url.pathname,method:init?.method??'GET',status:result.status});return result;
};
const sha=value=>'sha256:'+createHash('sha256').update(canonicalJson(value)).digest('hex');
const profileResponse=await auditedFetch(new URL('/v2/provider-profile',baseUrl));assert.equal(profileResponse.status,200);
const profile=await profileResponse.json();assert.deepEqual(profile,fixture.providerProfile);
const probe=await probeExternalBiServiceV2(config,auditedFetch);assert.equal(probe.outcome,'VERIFIED',JSON.stringify(probe));
assert.equal(probe.readback.productVersion,'v0.18.1');assert.equal(probe.readback.contractVersion,'2.0.0');assert.equal(probe.readback.directSupersetAccessByCm,false);
async function invoke(action,input){
  const value=await invokeExternalBiServiceV2(config,{requestId:runId+'-'+action,action,...(input===undefined?{}:{input})},auditedFetch);
  assert.equal(value.outcome,'VERIFIED',action+': '+JSON.stringify(value));return value.readback.result;
}
const status=await invoke('status');assert.equal(status.status,'READY');
const discovery=await invoke('discovery',{command:'start',sessionId:runId});
const analysis=await invoke('analyze');assert.equal(analysis.status,'ANALYZED_READ_ONLY');assert.equal(analysis.sourceMode,'fixture');
assert.equal(analysis.safety.sourceReadOnly,true);assert.equal(analysis.safety.rawSourceRowsReturned,false);assert.equal(analysis.safety.credentialsReturned,false);
const plan=await invoke('plan',{objective:'Review weekly order value and coverage',receiptId:analysis.receiptId});
assert.equal(plan.graph.acceptedIncumbent,'adaptive-v1');assert.equal(plan.authority.persistentActionAllowed,false);
const preview=await invoke('preview',{objective:'Preview weekly order value and coverage',receiptId:analysis.receiptId});
assert.equal(preview.authority.proposalOnly,true);assert.equal(preview.authority.applyPerformed,false);assert.equal(preview.authority.approvalRequiredBeforePersistence,true);
const readback=await invoke('readback');assert.equal(readback.superset.status,'NOT_APPLIED');
assert.equal(readback.disclosure.rawSourceRowsReturned,false);assert.equal(readback.disclosure.credentialsReturned,false);assert.equal(readback.disclosure.freeSqlReturned,false);
const operations={status,discovery,analysis,plan,preview,readback};

// Fault injections alter genuine returned packets and recompute public hashes.
// They are negative consumer probes, not alternate provider implementations.
const negatives=[];
async function deniedCapture(name,route,edit,code){
  let intents=0;
  const transport=async(input,init)=>{
    if(init?.method==='POST')intents++;
    const response=await auditedFetch(input,init);if(new URL(String(input)).pathname!==route)return response;
    const value=await response.json();edit(value);
    if(route==='/v2/capabilities'){const {attestation,...body}=value;value.attestation={algorithm:'sha256-canonical-json',digest:sha(body)};}
    if(route==='/v2/provider-profile'){const {integrity,...body}=value;value.integrity={algorithm:'sha256-canonical-json',digest:sha(body)};}
    return new Response(JSON.stringify(value),{status:response.status});
  };
  const value=await probeExternalBiServiceV2(config,transport);
  assert.equal(value.outcome,'DENIED',name+': '+JSON.stringify(value));assert.deepEqual(value.reasonCodes,[code],name);assert.equal(intents,0,name);
  negatives.push({name,outcome:'DENIED',code,intentRequests:0,scope:'FAULT_INJECTED_LIVE_CAPTURE_NOT_PROVIDER_STUB'});
}
await deniedCapture('wrong-product-version','/v2/capabilities',v=>v.product.version='v0.18.2','EXTERNAL_BI_SERVICE_PRODUCT_VERSION_DENIED');
await deniedCapture('root-is-not-agent-version','/v2/capabilities',v=>v.product.version='v0.26.0','EXTERNAL_BI_SERVICE_PRODUCT_VERSION_DENIED');
await deniedCapture('unknown-capability','/v2/capabilities',v=>v.capabilities.push({id:'bi.admin',action:'admin',authority:'trusted-approval-only'}),'EXTERNAL_BI_SERVICE_CAPABILITY_MISSING');
await deniedCapture('extra-attestation','/v2/provider-profile',v=>v.attestations.push({schemaVersion:'unknown/v1'}),'EXTERNAL_BI_SERVICE_ATTESTATION_MALFORMED');
await deniedCapture('missing-attestation','/v2/provider-profile',v=>v.attestations=[],'EXTERNAL_BI_SERVICE_ATTESTATION_MALFORMED');
await deniedCapture('redigested-artifact-spoof','/v2/provider-profile',v=>v.artifact.packageSha256='1'.repeat(64),'EXTERNAL_BI_SERVICE_DIGEST_DENIED');
const wildcard=configureExternalBiServiceV2({BI_AGENT_BASE_URL:baseUrl,BI_AGENT_PAIR_PROFILE:'*'});
assert.equal(wildcard.outcome,'DENIED');assert.deepEqual(wildcard.reasonCodes,['EXTERNAL_BI_SERVICE_COMPATIBILITY_PROFILE_DENIED']);
negatives.push({name:'wildcard-selection',outcome:'DENIED',code:wildcard.reasonCodes[0],intentRequests:0,scope:'ACTUAL_CALLER_BOUNDARY'});
let forbiddenFetches=0;
const noFetch=async()=>{forbiddenFetches++;throw new Error('PAN524_DENIAL_REACHED_TRANSPORT');};
for(const action of ['trusted-apply','trusted-readback','trusted-rollback']){
  const value=await invokeExternalBiServiceV2(config,{requestId:runId+'-deny',action},noFetch);
  assert.equal(value.outcome,'DENIED');assert.deepEqual(value.reasonCodes,['EXTERNAL_BI_SERVICE_ACTION_DENIED']);
  negatives.push({name:action,outcome:'DENIED',code:value.reasonCodes[0],intentRequests:0,scope:'ACTUAL_CALLER_BOUNDARY'});
}
for(const key of ['credentials','sql','rawRows']){
  const value=await invokeExternalBiServiceV2(config,{requestId:runId+'-deny',action:'analyze',input:{[key]:'not-permitted'}},noFetch);
  assert.equal(value.outcome,'DENIED');assert.deepEqual(value.reasonCodes,['EXTERNAL_BI_SERVICE_UNSAFE_REQUEST_DENIED']);
  negatives.push({name:'unsafe-'+key,outcome:'DENIED',code:value.reasonCodes[0],intentRequests:0,scope:'ACTUAL_CALLER_BOUNDARY'});
}
assert.equal(forbiddenFetches,0);
process.stdout.write(JSON.stringify({schemaVersion:'pansphaira.pan524/live-pair-observations/v1',outcome:'PASS',runId,
  pairProfile:'KS_J02_0181_C2_V1',providerProfileDigest:profile.integrity.digest,providerArtifact:profile.artifact,
  consumerCompiledSha256:createHash('sha256').update(await readFile(new URL('../dist/packages/contracts/src/external-bi-service.js',import.meta.url))).digest('hex'),
  operationsActuallyExecuted:['status','discovery','analyze','plan','preview','readback'],
  operationResultDigests:Object.fromEntries(Object.entries(operations).map(([k,v])=>[k,sha(v)])),
  observedSourceMode:analysis.sourceMode,observedRuntimeValidation:analysis.evidence.runtimeValidation,
  graphIncumbent:plan.graph.acceptedIncumbent,previewProposalOnly:preview.authority.proposalOnly,supersetReadback:readback.superset.status,
  actualHttpRequests:requests,negativeProbes:negatives,forbiddenRequestTransportCount:forbiddenFetches,
  providerStartedOrModifiedByConsumer:false,registryPromotionPerformed:false,productivePersistenceClaimed:false,
  independentFrozenAcceptanceClaimed:false},null,2)+'\n');
