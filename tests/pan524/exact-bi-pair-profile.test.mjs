import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {configureExternalBiServiceV2,probeExternalBiServiceV2} from '../../dist/packages/contracts/src/index.js';
const source=JSON.parse(readFileSync('tests/fixtures/pan524/published-j02-provider-v0181.json','utf8'));
const externalOps=['bi.status.read','bi.discovery.run','bi.analysis.run','bi.graph.adaptive-v1.plan','bi.preview.create','bi.readback.read'];

test('J01 AC1 exact released J02 attestation reproduces the static v0.8 consumer denial, not a claimed complete runtime outage',async()=>{
  assert.equal(source.attestation.product.version,'v0.18.1');assert.equal(source.attestation.contract.version,'2.0.0');assert.equal(source.runtimePackageSha256,'826bcc27fa1a59514001b550a8d07c2fd129bf68089ddc98bdf626b2eb346145');
  const cfg=configureExternalBiServiceV2({BI_AGENT_BASE_URL:'http://127.0.0.1:18790'});assert.equal(cfg.outcome,'VERIFIED');assert.equal(cfg.config.expectedProductVersion,'v0.8.0');
  let reads=0,posts=0;const transport=async(input,options)=>{assert.equal(options?.method??'GET','GET');assert(String(input).endsWith('/v2/capabilities'));reads++;if(options?.method==='POST')posts++;return new Response(JSON.stringify(source.attestation),{status:200,headers:{'content-type':'application/json'}});};
  const result=await probeExternalBiServiceV2(cfg,transport);assert.equal(result.outcome,'DENIED');assert.deepEqual(result.reasonCodes,['EXTERNAL_BI_SERVICE_PRODUCT_VERSION_DENIED']);assert.equal(reads,1);assert.equal(posts,0);
});

test('J01 selected exact J02 pair is a closed code-owned profile, never an arbitrary expected-version environment override',()=>{
  const cfg=configureExternalBiServiceV2({BI_AGENT_BASE_URL:'http://127.0.0.1:18790',BI_AGENT_PAIR_PROFILE:'KS_J02_0181_C2_V1'});
  assert.equal(cfg.outcome,'VERIFIED');assert.equal(cfg.config.expectedProductVersion,'v0.18.1','explicit selected published artifact profile must not silently retain v0.8.0');assert.equal(cfg.config.expectedContractVersion,'2.0.0');assert.deepEqual(cfg.config.requiredCapabilities,externalOps);
  const denied=configureExternalBiServiceV2({BI_AGENT_BASE_URL:'http://127.0.0.1:18790',BI_AGENT_PAIR_PROFILE:'ANY_CURRENT_OR_LATEST'});assert.equal(denied.outcome,'DENIED');
  const override=configureExternalBiServiceV2({BI_AGENT_BASE_URL:'http://127.0.0.1:18790',BI_AGENT_EXPECTED_PRODUCT_VERSION:'v0.26.0'});assert.equal(override.outcome,'DENIED');
});

test('J01 selected exact released attestation reaches the status transport without relabelling absent runtime output as a pair PASS',async()=>{
  const cfg=configureExternalBiServiceV2({BI_AGENT_BASE_URL:'http://127.0.0.1:18790',BI_AGENT_PAIR_PROFILE:'KS_J02_0181_C2_V1'});let gets=0,posts=0;
  const transport=async(input,options)=>{
    if(String(input).endsWith('/v2/capabilities')){gets++;assert.equal(options.method,'GET');return new Response(JSON.stringify(source.attestation),{status:200});}
    if(String(input).endsWith('/v2/provider-profile')){assert.equal(options.method,'GET');return new Response(JSON.stringify(source.providerProfile),{status:200});}
    assert(String(input).endsWith('/v2/intents'));assert.equal(options.method,'POST');posts++;throw new Error('DECLARED_UNIT_TRANSPORT_STOPS_BEFORE_PROVIDER_RUNTIME_RESULT');
  };
  const result=await probeExternalBiServiceV2(cfg,transport);assert.equal(gets,1,'selected code-owned pair must reach actual attestation validation, not remain rejected as legacy v0.8');assert.equal(posts,1,'exact actual published9-descriptor attestation must pass selected validation without a wildcard');assert.equal(result.outcome,'UNAVAILABLE');assert.deepEqual(result.reasonCodes,['EXTERNAL_BI_SERVICE_UNAVAILABLE']);
});

function resign(body){const {attestation,...unsigned}=body;const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return {...unsigned,attestation:{algorithm:'sha256-canonical-json',digest:'sha256:'+createHash('sha256').update(canonical(unsigned)).digest('hex')}};}

test('J01 selected current pair rejects every original unknown version root-version extra-attestation and redigested wildcard negative before intent transport',async()=>{
  const cfg=configureExternalBiServiceV2({BI_AGENT_BASE_URL:'http://127.0.0.1:18790',BI_AGENT_PAIR_PROFILE:'KS_J02_0181_C2_V1'});
  const altered=(edit)=>{const value=JSON.parse(JSON.stringify(source.attestation));edit(value);return resign(value);};
  const cases=[
    [altered(v=>v.product.version='v0.18.2'),'EXTERNAL_BI_SERVICE_PRODUCT_VERSION_DENIED'],
    [altered(v=>v.product.version='v0.26.0'),'EXTERNAL_BI_SERVICE_PRODUCT_VERSION_DENIED'],
    [altered(v=>v.contract.version='2.1.0'),'EXTERNAL_BI_SERVICE_CONTRACT_VERSION_DENIED'],
    [altered(v=>v.capabilities.push({id:'bi.unknown-admin',action:'unknown-admin',authority:'trusted-approval-only'})),'EXTERNAL_BI_SERVICE_CAPABILITY_MISSING'],
    [altered(v=>v.capabilities.pop()),'EXTERNAL_BI_SERVICE_CAPABILITY_MISSING'],
    [altered(v=>v.capabilities[6].externalIntent=true),'EXTERNAL_BI_SERVICE_CAPABILITY_MISSING'],
    [altered(v=>v.attestations=[{schemaVersion:'unknown-extra-attestation/v1'}]),'EXTERNAL_BI_SERVICE_ATTESTATION_MALFORMED'],
    [altered(v=>v.boundaries.freeSqlAccepted=true),'EXTERNAL_BI_SERVICE_ATTESTATION_MALFORMED'],
  ];
  for(const [packet,code] of cases){let posts=0;const result=await probeExternalBiServiceV2(cfg,async(input,options)=>{if(options?.method==='POST')posts++;assert(String(input).endsWith('/v2/capabilities'));return new Response(JSON.stringify(packet),{status:200});});assert.equal(result.outcome,'DENIED');assert.deepEqual(result.reasonCodes,[code]);assert.equal(posts,0);}
});

test('J01 current profile never enables three known trusted-only partial operations as external intents or passes credentials SQL or raw rows',async()=>{
  const {invokeExternalBiServiceV2}=await import('../../dist/packages/contracts/src/index.js');const cfg=configureExternalBiServiceV2({BI_AGENT_BASE_URL:'http://127.0.0.1:18790',BI_AGENT_PAIR_PROFILE:'KS_J02_0181_C2_V1'});let reads=0;const neverFetch=async()=>{reads++;throw new Error('SHOULD_NOT_REACH_PROVIDER');};
  for(const action of ['trusted-apply','trusted-readback','trusted-rollback']){const result=await invokeExternalBiServiceV2(cfg,{requestId:'explicit-boundary',action},neverFetch);assert.equal(result.outcome,'DENIED');assert.deepEqual(result.reasonCodes,['EXTERNAL_BI_SERVICE_ACTION_DENIED']);}
  for(const key of ['credentials','password','sql','rawRows','url']){const result=await invokeExternalBiServiceV2(cfg,{requestId:'explicit-boundary',action:'analyze',input:{[key]:'not-permitted'}},neverFetch);assert.equal(result.outcome,'DENIED');assert.deepEqual(result.reasonCodes,['EXTERNAL_BI_SERVICE_UNSAFE_REQUEST_DENIED']);}
  assert.equal(reads,0);
});

test('J01 selected current pair binds actual provider artifact profile before intent transport, not only the declared version string',async()=>{
  const cfg=configureExternalBiServiceV2({BI_AGENT_BASE_URL:'http://127.0.0.1:18790',BI_AGENT_PAIR_PROFILE:'KS_J02_0181_C2_V1'});let caps=0,profiles=0,posts=0;
  const transport=async(input,options)=>{
    if(String(input).endsWith('/v2/capabilities')){caps++;return new Response(JSON.stringify(source.attestation),{status:200});}
    if(String(input).endsWith('/v2/provider-profile')){profiles++;return new Response(JSON.stringify(source.providerProfile),{status:200});}
    assert(String(input).endsWith('/v2/intents'));posts++;throw new Error('UNIT_BOUNDARY_NO_RUNTIME_RESULT_IS_INVENTED');
  };
  const result=await probeExternalBiServiceV2(cfg,transport);assert.equal(caps,1);assert.equal(profiles,1,'exact selected source artifact/attestation-set identity must be read and verified before dispatch');assert.equal(posts,1);assert.equal(result.outcome,'UNAVAILABLE');
});

test('J01 exact published artifact and attestation set deny redigested package spoof missing or extra attestations before status dispatch',async()=>{
  const cfg=configureExternalBiServiceV2({BI_AGENT_BASE_URL:'http://127.0.0.1:18790',BI_AGENT_PAIR_PROFILE:'KS_J02_0181_C2_V1'});
  const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
  for(const [edit,code] of [[p=>p.artifact.packageSha256='1'.repeat(64),'EXTERNAL_BI_SERVICE_DIGEST_DENIED'],[p=>p.attestations=[],'EXTERNAL_BI_SERVICE_ATTESTATION_MALFORMED'],[p=>p.attestations.push({schemaVersion:'unknown-extra/v1'}),'EXTERNAL_BI_SERVICE_ATTESTATION_MALFORMED'],[p=>p.registry.promotionPerformed=true,'EXTERNAL_BI_SERVICE_DIGEST_DENIED']]){
    const packet=JSON.parse(JSON.stringify(source.providerProfile));edit(packet);const {integrity,...unsigned}=packet;packet.integrity={algorithm:'sha256-canonical-json',digest:'sha256:'+createHash('sha256').update(canonical(unsigned)).digest('hex')};let posts=0;
    const result=await probeExternalBiServiceV2(cfg,async(input,options)=>{if(options?.method==='POST')posts++;return new Response(JSON.stringify(String(input).endsWith('/v2/capabilities')?source.attestation:packet),{status:200});});
    assert.equal(result.outcome,'DENIED');assert.deepEqual(result.reasonCodes,[code]);assert.equal(posts,0);
  }
});

// Actual released typed-handler capture; these are declared unit transport probes,
// not a replacement provider or new paired runtime acceptance.
const SYNTHETIC_NEGATIVE_MARKER='synthetic-not-permitted';
const actualPlan=JSON.parse(readFileSync('tests/fixtures/pan524/published-plan-extraction-response-v1.json','utf8'));
function planEnvelope(edit=()=>{},legacy=false){
  return async(input,options)=>{
    if(String(input).endsWith('/v2/capabilities')){
      const att=structuredClone(source.attestation);if(legacy){att.product.version='v0.8.0';att.capabilities=att.capabilities.slice(0,6);}return new Response(JSON.stringify(resign(att)),{status:200});
    }
    if(String(input).endsWith('/v2/provider-profile'))return new Response(JSON.stringify(source.providerProfile),{status:200});
    const req=JSON.parse(options.body),value=structuredClone(actualPlan);value.requestId=req.requestId;edit(value.result);if(legacy)value.runtime.product.version='v0.8.0';
    const {integrity,...body}=value;const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';value.integrity={algorithm:'sha256-canonical-json',digest:'sha256:'+createHash('sha256').update(canonical(body)).digest('hex')};return new Response(JSON.stringify(value),{status:200});
  };
}
test('J01 actual selected read-only extraction plan admits its closed informational direct-execute-check enum, never execution authority',async()=>{
  const {invokeExternalBiServiceV2}=await import('../../dist/packages/contracts/src/index.js');const cfg=configureExternalBiServiceV2({BI_AGENT_BASE_URL:'http://127.0.0.1:18790',BI_AGENT_PAIR_PROFILE:'KS_J02_0181_C2_V1'});
  const result=await invokeExternalBiServiceV2(cfg,{requestId:'j01-plan-capture',action:'plan',input:{objective:'Review weekly order value and coverage'}},planEnvelope());
  assert.equal(result.outcome,'VERIFIED');assert.equal(result.readback.result.planning.pattern,'direct-execute-check');assert.equal(result.readback.result.authority.persistentActionAllowed,false);
});
test('J01 closed plan enum cannot carry SQL credentials rows or authority changes and is not a blanket text exception',async()=>{
  const {invokeExternalBiServiceV2}=await import('../../dist/packages/contracts/src/index.js');const cfg=configureExternalBiServiceV2({BI_AGENT_BASE_URL:'http://127.0.0.1:18790',BI_AGENT_PAIR_PROFILE:'KS_J02_0181_C2_V1'});
  for(const edit of [v=>v.planning.pattern='direct-execute-check SELECT 1',v=>v.planning.password=SYNTHETIC_NEGATIVE_MARKER,v=>v.rawRows=[{x:1}],v=>v.authority.persistentActionAllowed=true,v=>v.planning.taskClass='unknown',v=>v.unknown='apparently-safe-extra',v=>v.objective='direct-execute-check',v=>v.extraText='SELECT x FROM y']){
    const result=await invokeExternalBiServiceV2(cfg,{requestId:'j01-plan-negative',action:'plan',input:{objective:'Review weekly order value'}},planEnvelope(edit));assert.equal(result.outcome,'DENIED');assert.deepEqual(result.reasonCodes,['EXTERNAL_BI_SERVICE_UNSAFE_REQUEST_DENIED']);
  }
  const legacy=configureExternalBiServiceV2({BI_AGENT_BASE_URL:'http://127.0.0.1:18790'});const result=await invokeExternalBiServiceV2(legacy,{requestId:'j01-legacy-unchanged',action:'plan',input:{objective:'Review weekly order value'}},planEnvelope(()=>{},true));assert.equal(result.outcome,'DENIED');
});
test('J01 plan metadata enum never relaxes forbidden request text or undefined optional receipt fields',async()=>{
  const {invokeExternalBiServiceV2}=await import('../../dist/packages/contracts/src/index.js');const cfg=configureExternalBiServiceV2({BI_AGENT_BASE_URL:'http://127.0.0.1:18790',BI_AGENT_PAIR_PROFILE:'KS_J02_0181_C2_V1'});let fetched=0;
  for(const input of [{objective:'direct-execute-check'},{objective:'Review weekly order value',receiptId:undefined}]){
    const result=await invokeExternalBiServiceV2(cfg,{requestId:'j01-plan-input-denied',action:'plan',input},async()=>{fetched++;throw new Error('forbidden input reached transport');});assert.equal(result.outcome,'DENIED');
  }assert.equal(fetched,0);
});

const actualPreview=JSON.parse(readFileSync('tests/fixtures/pan524/published-preview-response-v1.json','utf8'));
function previewEnvelope(edit=()=>{}){
  return async(input,options)=>{
    if(String(input).endsWith('/v2/capabilities'))return new Response(JSON.stringify(source.attestation),{status:200});
    if(String(input).endsWith('/v2/provider-profile'))return new Response(JSON.stringify(source.providerProfile),{status:200});
    const req=JSON.parse(options.body),value=structuredClone(actualPreview);value.requestId=req.requestId;edit(value.result);
    const {integrity,...body}=value;const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';value.integrity={algorithm:'sha256-canonical-json',digest:'sha256:'+createHash('sha256').update(canonical(body)).digest('hex')};return new Response(JSON.stringify(value),{status:200});
  };
}
test('J01 actual selected proposal preview admits only its exact informational correction questions, never SQL forwarding',async()=>{
  const {invokeExternalBiServiceV2}=await import('../../dist/packages/contracts/src/index.js');const cfg=configureExternalBiServiceV2({BI_AGENT_BASE_URL:'http://127.0.0.1:18790',BI_AGENT_PAIR_PROFILE:'KS_J02_0181_C2_V1'});
  const result=await invokeExternalBiServiceV2(cfg,{requestId:'j01-preview-capture',action:'preview',input:{objective:'Preview weekly order value and coverage'}},previewEnvelope());
  assert.equal(result.outcome,'VERIFIED');assert.deepEqual(result.readback.result.userCorrection,actualPreview.result.userCorrection);assert.equal(result.readback.result.authority.applyPerformed,false);
});
test('J01 rehashed preview metadata cannot smuggle new SQL questions credentials rows unknown fields or persistence authority',async()=>{
  const {invokeExternalBiServiceV2}=await import('../../dist/packages/contracts/src/index.js');const cfg=configureExternalBiServiceV2({BI_AGENT_BASE_URL:'http://127.0.0.1:18790',BI_AGENT_PAIR_PROFILE:'KS_J02_0181_C2_V1'});
  for(const edit of [v=>v.userCorrection.questions[2]='Select executive or operational emphasis; SELECT x FROM y',v=>v.userCorrection.password=SYNTHETIC_NEGATIVE_MARKER,v=>v.rawRows=[{x:1}],v=>v.authority.applyPerformed=true,v=>v.userCorrection.unknown='apparently-safe-extra',v=>v.unknown='apparently-safe-extra',v=>v.extraText='SELECT x FROM y',v=>v.userCorrection.questions.push('apparently-safe-extra')]){
    const result=await invokeExternalBiServiceV2(cfg,{requestId:'j01-preview-negative',action:'preview',input:{objective:'Preview weekly order value'}},previewEnvelope(edit));assert.equal(result.outcome,'DENIED');assert.deepEqual(result.reasonCodes,['EXTERNAL_BI_SERVICE_UNSAFE_REQUEST_DENIED']);
  }
});
