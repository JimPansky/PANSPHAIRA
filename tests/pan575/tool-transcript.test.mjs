import test from 'node:test';
import assert from 'node:assert/strict';
import {ModelAccessBrokerV1,syntheticCanonicalModelRequestV1,syntheticModelAccessPolicyV1} from '../../dist/packages/contracts/src/model-access-broker.js';

const schemaVersion='chimpmaera.model/tool-transcript/v1';
const call={id:'call_FreshAa9',type:'function',function:{name:'crm.contact.create',arguments:'{"name":"Synthetic"}'}};
function fixture(){const policy=syntheticModelAccessPolicyV1();const request={...syntheticCanonicalModelRequestV1(),attachments:[],structuredOutput:null,optionalFields:{},text:'Public synthetic framing only; use two native tools. No authority.',budget:{...policy.maxBudget,maxRequests:3}};return {request,broker:new ModelAccessBrokerV1(policy)};}
const first=request=>({schemaVersion,messages:[{role:'user',content:request.text}]});
const second=request=>({schemaVersion,messages:[{role:'user',content:request.text},{role:'assistant',content:null,tool_calls:[structuredClone(call)]},{role:'tool',tool_call_id:call.id,content:'{"trust":"UNTRUSTED_TOOL_DATA","nativeResult":"synthetic-only"}'}]});
const response=(toolCalls=[])=>({contentType:'text/plain',text:'Controlled synthetic format fixture, not a language model.',toolCalls,usage:{inputTokens:1,outputTokens:1,costMicros:0}});

test('575 internal additive broker chat tool step preserves raw opaque mixed-case call ID and actual assistant/tool roles, no real-model acceptance',async()=>{
 const {broker,request}=fixture();let count=0;
 const one=await broker.invokeToolStep(request,first(request),async bound=>{count++;assert.deepEqual(bound.request.messages,first(request).messages);return response([{id:call.id,name:call.function.name,arguments:{name:'Synthetic'}}]);});
 assert.equal(one.outcome,'ALLOW');assert.equal(one.response.toolCallCandidates[0].id,call.id);assert.equal(one.response.toolCallCandidates[0].authority,'NONE');
 const history=second(request),two=await broker.invokeToolStep({...request,operationId:'operation:model-step-2'},history,async bound=>{count++;assert.deepEqual(bound.request.messages,history.messages);assert.equal(bound.request.messages[2].tool_call_id,call.id);return response();});
 assert.equal(two.outcome,'ALLOW');assert.equal(count,2);assert.equal(Object.hasOwn(two.response,'realModelAcceptance'),false);
});

for(const [name,mutate]of[
 ['foreign call_id',h=>{h.messages[2].tool_call_id='call_Foreign';}],
 ['unresolved tool candidate',h=>{h.messages.pop();}],
 ['duplicate tool result',h=>{h.messages.push(structuredClone(h.messages[2]));}],
 ['reused provider call_id',h=>{h.messages.push(structuredClone(h.messages[1]),structuredClone(h.messages[2]));}],
 ['extra grant field',h=>{h.messages[2].authority=true;}],
 ['unknown tool name',h=>{h.messages[1].tool_calls[0].function.name='phantom.execute';}],
 ['raw secret in tool output',h=>{h.messages[2].content='api_key='+'PRIVATE_TEST_CANARY_NOT_A_CREDENTIAL';}],
 ['unsupported non-chat protocol',(_h,r)=>{r.protocol='OPENAI_RESPONSES';}],
])test('575 internal transcript refuses '+name+' before provider dispatch',async()=>{
 const {broker,request}=fixture(),h=second(request);mutate(h,request);let count=0;const r=await broker.invokeToolStep(request,h,async()=>{count++;return response();});assert.equal(r.outcome,'DENY');assert.equal(count,0);
});

test('575 internal same operation with changed actual transcript never reuses another request receipt',async()=>{
 const {broker,request}=fixture(),h=second(request);let count=0;const provider=async()=>{count++;return response();};assert.equal((await broker.invokeToolStep(request,h,provider)).outcome,'ALLOW');const changed=structuredClone(h);changed.messages[2].content='{"different":true}';const r=await broker.invokeToolStep(request,changed,provider);assert.equal(r.outcome,'DENY');assert.ok(r.issues.includes('MODEL_REPLAY_CONFLICT_DENIED'));assert.equal(count,1);
});

test('575 internal transcript executable accessor/proxy denies without evaluating caller code',async()=>{
 const {broker,request}=fixture(),base=second(request);let touched=0;const getter={schemaVersion};Object.defineProperty(getter,'messages',{enumerable:true,get(){touched++;return base.messages;}});const proxy=new Proxy(base,{ownKeys(){touched++;return Reflect.ownKeys(base);}});for(const h of[getter,proxy]){let count=0;const r=await broker.invokeToolStep(request,h,async()=>{count++;return response();});assert.equal(r.outcome,'DENY');assert.equal(count,0);}assert.equal(touched,0);
});
