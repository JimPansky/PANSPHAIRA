// Explicit controlled local protocol fixture: NEVER a language model/real
// route qualification. It feeds the actual transport and actual native574
// kernels to exercise the internal implementation without credential/cost.
import {createServer} from 'node:http';
import {ModelAccessBrokerV1,syntheticCanonicalModelRequestV1,syntheticModelAccessPolicyV1} from '../../dist/packages/contracts/src/model-access-broker.js';
import {bindModelConnectionTransportV1,connectionTransportIdentityV1} from '../../src/pan565/connection-transport.mjs';
import {createNativeCompositionFeedbackToolsV1} from '../../src/pan575/native-composition-tools.mjs';
import {runExistingBrokerToolFeedbackV1} from '../../src/pan575/broker-tool-feedback.mjs';
export const feedbackLimits575={maxCostMicros:50000,maxTimeMs:1500,maxTurns:3,maxTools:2,maxRequests:3,maxTokens:512,maxInputBytes:32768,maxOutputBytes:8192};
export const materialInput575=()=>({schema:'pansphaira.pan522/material-plan-input/v1',asOf:'2026-10-07',horizonEnd:'2026-10-31',calendars:[{id:'CAL575',timezone:'UTC',weekdays:[1,2,3,4,5],holidays:[],validFrom:'2026-01-01',validUntil:'2027-01-01'}],items:[{id:'ITEM575',stockArticleId:'SYN-ART-575',warehouseId:'LAGER-575',unit:'STK',supply:'BUY',safetyStock:0,lotMinimum:0,lotMultiple:1,leadWorkdays:2,calendarId:'CAL575'}],boms:[],demands:[{id:'DEMAND575',itemId:'ITEM575',unit:'STK',quantity:17,dueDate:'2026-10-14'}],stock:[{itemId:'ITEM575',unit:'STK',physical:4,reserved:0,blocked:0,sourceRevision:'snapshot-575',observedOn:'2026-10-07'}],receipts:[]});
export async function protocolFixture575({mode='OK',limits=feedbackLimits575,authorize=()=>true}={}){
 const native=createNativeCompositionFeedbackToolsV1(),observations=[],sockets=new Set();let post=0;
 const server=createServer(async(req,res)=>{
  let text='';for await(const c of req)text+=c;const body=JSON.parse(text||'{}');post++;observations.push({path:req.url,body,authorizationPresent:Object.hasOwn(req.headers,'authorization')});
  if(mode==='TIMEOUT')return;
  if(mode==='REDIRECT'){res.writeHead(302,{location:'http://169.254.169.254/latest/meta-data'});res.end();return;}
  res.writeHead(200,{'content-type':'application/json'});if(mode==='MALFORMED'){res.end('not-json');return;}
  const results=(body.messages??[]).filter(m=>m.role==='tool');let message;
  if(!results.length){
   const candidates=[{id:'call_PlAnAa9',type:'function',function:{name:mode==='UNKNOWN_TOOL'?'unknown.tool.execute':'pan522.material.plan',arguments:JSON.stringify(materialInput575())}},{id:mode==='DUPLICATE_ID'?'call_PlAnAa9':'call_CeLlBb8',type:'function',function:{name:'erp.order.create',arguments:JSON.stringify({requestId:'request:erp-cell-pan575-feedback',sku:'SYN-PAN575',quantity:mode==='BAD_TOOL_ARGS'?101:13})}}];
   message={content:null,tool_calls:candidates};
  }else{
   const answers=results.map(m=>{const r=JSON.parse(m.content),f=r.feedback;return {callId:f.callId,challengeId:f.challengeId,sum:f.left+f.right};});
   if(mode==='FOREIGN_FINAL')answers[0].callId='call_Foreign';if(mode==='STALE_FINAL')answers[0].challengeId='feedback:'+'0'.repeat(32);if(mode==='PROMPT_ECHO')answers[0].sum='public-promptnonce';
   message={content:JSON.stringify({schemaVersion:'pansphaira.broker-tool-feedback/final/v1',text:'Controlled protocol fixture consumed two actual native tool results; not a language model.',answers}),tool_calls:[]};
  }
  res.end(JSON.stringify({model:mode==='WRONG_MODEL'?'model:wrong-model':'model:synthetic-v1',choices:[{message}],usage:{prompt_tokens:2,completion_tokens:3}}));
 });server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const options={summary:{connectionId:'connection:synthetic-feedback',routeId:'route:synthetic-openai-chat-completions',provider:'provider:synthetic-model',model:'model:synthetic-v1',protocol:'OPENAI_CHAT_COMPLETIONS',evidenceClass:'SYNTHETIC_ONLY',secretReference:null,authMethod:'NONE_LOCAL',identity:{...connectionTransportIdentityV1(),deploymentId:'synthetic-controlled-http-fixture-not-model',configurationRevision:1},availability:{runtime:true,provider:true,auth:true,model:true,functions:true},selectable:true},target:{origin:'http://127.0.0.1:'+server.address().port,allowedAddresses:['127.0.0.1'],localOnly:true},credentialFile:null,pricing:null,productGrant:null};
 const transport=bindModelConnectionTransportV1(options),policy=syntheticModelAccessPolicyV1();policy.maxBudget={maxInputBytes:32768,maxOutputBytes:8192,maxTokens:512,maxCostMicros:50000,maxRequests:3,timeoutMs:1500};policy.routes[0].attachmentMediaTypes=[];
 const request={...syntheticCanonicalModelRequestV1(),operationId:'operation:pan575-native-feedback',attachments:[],structuredOutput:null,optionalFields:{},budget:policy.maxBudget,text:'Public synthetic isolated original574 material and compensated ERP demonstration. Promptnonce public-promptnonce is NOT tool knowledge. No product model acceptance.'};
 const broker=new ModelAccessBrokerV1(policy),controller=new AbortController();
 const providerCall=(bound,signal,remaining)=>transport.providerToolStepCall(bound,signal,authorize,remaining);
 return {native,transport,options,request,policy,observations,controller,posts:()=>post,run:(extra={})=>runExistingBrokerToolFeedbackV1({broker,request,providerCall,tools:native.tools,limits,signal:controller.signal,authorize,...extra}),async close(){controller.abort();for(const s of sockets)s.destroy();await new Promise(r=>server.close(r));}};
}
