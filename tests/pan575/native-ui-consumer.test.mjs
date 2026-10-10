import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,chmodSync} from 'node:fs';
import {createServer} from 'node:http';
import {connectionOptions565,syntheticCredential565} from '../pan565/native-fixture.mjs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {nativeViewFixture546} from '../pan546/native-fixture.mjs';
import {createNativeWorkspaceAgentRunV1,syntheticWorkspaceViewChatFeedbackModelV1} from '../../src/pan548/native-agent-run.mjs';
import {validateWorkspaceAgentReadV1} from '../../dist/packages/contracts/src/workspace-agent-run-v1.js';
import {nativeWorkspaceViewFieldsV1} from '../../src/pan546/native-data-catalog.mjs';
import * as nativeModelConnection from '../../src/pan565/native-model-connection.mjs';

test('575 own missing native565 product-owner capability must exist; delivered synthetic callback is not owner admission',()=>{
 assert.equal(typeof nativeModelConnection.createNativeWorkspaceFeedbackModelV1,'function','OWN INTERNAL MISSING NATIVE MODEL OWNER BINDING; not a user/route blocker');
});
async function fixture(change=()=>{}){
 const f=await nativeViewFixture546(),root=mkdtempSync(join(tmpdir(),'pan575-owned-548-consumer-')),model=syntheticWorkspaceViewChatFeedbackModelV1('tenant-a'),observations=[],original=model.providerCall;
 model.providerCall=async(b,s)=>{observations.push(structuredClone(b));return original(b,s);};change(model);
 const create=()=>createNativeWorkspaceAgentRunV1({sessions:f.sessions,contextSelection:f.context,dataCatalog:f.data,viewOwner:f.view,root,model});let owner=create();const t=f.tab(),c=t.context;t.context=f.context.claim(t.headers,{schemaVersion:'pansphaira.workspace-context/claim/v1',tabId:c.binding.tabId,moduleId:c.moduleId,viewId:c.viewId,primaryObjectId:c.primaryObject.objectId,selection:{elementId:'pan.erv.module-card',rowId:'invoice-value'},expected:{...c.revisions,epoch:c.binding.epoch}}).context;
 const ctx=()=>f.verification(t),plan=()=>owner.plan(t.headers,{schemaVersion:'pansphaira.workspace-agent/plan/v1',context:ctx(),text:'Nur Rechnungswert größer; kein Speichern, keine Fachwirkung.'}),start=p=>owner.start(t.headers,{schemaVersion:'pansphaira.workspace-agent/start/v1',context:ctx(),planHandle:p.planHandle,planDigest:p.planDigest}),read=p=>owner.read(t.headers,{schemaVersion:'pansphaira.workspace-agent/read/v1',context:ctx(),runId:p.runId});
 return {f,t,ctx,plan,start,read,observations,model,get owner(){return owner;},reopen(){owner.close();owner=create();},async close(){owner.close();await f.close();rmSync(root,{recursive:true,force:true});}};
}

test('575 same actual shared candidate consumed by548 two native UI tools and raw tool transcript, preview-only/fresh persisted native readback',async()=>{
 const x=await fixture();try{const before=x.f.view.read(x.t.headers,x.ctx()),p=x.plan(),r=await x.start(p);assert.equal(r.phase,'RESULT_READY',JSON.stringify(r));assert.equal(r.realModelAcceptance,false);assert.equal(x.observations.length,2);assert.deepEqual(x.observations[1].request.messages.map(m=>m.role),['user','assistant','tool','tool']);assert.deepEqual(x.observations[1].request.messages.slice(2).map(m=>m.tool_call_id),['call_UIReadAa9','call_UIProposeBb8']);assert.equal(r.proposal.requiresSeparateNative546PreviewAndConfirmation,true);assert.equal(r.proposal.afterView.instances.find(i=>i.instanceId==='invoice-value').size,'large');assert.deepEqual(x.f.view.read(x.t.headers,x.ctx()),before);assert.equal(r.budget.runtime.consumedUnits,2);assert.equal(validateWorkspaceAgentReadV1(r,x.t.context,nativeWorkspaceViewFieldsV1).phase,'RESULT_READY');assert.deepEqual(x.read(p),r);x.reopen();assert.deepEqual(x.read(p),r);assert.equal(x.observations.length,2);
 }finally{await x.close();}
});

for(const mode of ['UNKNOWN_TOOL','FOREIGN_INSTANCE','PROMPT_ECHO','FOREIGN_CALL_ID'])test('575 direct548 consumer '+mode+' retains full native unknown reservation, no result/proposal/save',async()=>{
 const x=await fixture(model=>{const original=model.providerCall;model.providerCall=async(...args)=>{const r=await original(...args);if(r.toolCalls.length){if(mode==='UNKNOWN_TOOL')r.toolCalls[1].name='ui.personal.save';if(mode==='FOREIGN_INSTANCE')r.toolCalls[1].arguments.operations[0].instanceId='invoice-party';}else{const f=JSON.parse(r.text);if(mode==='PROMPT_ECHO')f.answers[0].sum='prompt-known-answer';if(mode==='FOREIGN_CALL_ID')f.answers[0].callId='call_Foreign';r.text=JSON.stringify(f);}return r;};});try{const p=x.plan(),r=await x.start(p);assert.equal(r.phase,'OUTCOME_UNCONFIRMED');assert.equal(r.proposal,null);assert.equal(r.realModelAcceptance,false);assert.equal(r.budget.model.committedUnits,x.model.policy.maxBudget.maxTokens*4);assert.equal(r.budget.model.consumedUnits,0);assert.equal(x.f.store.read(x.f.sessions.authenticate(x.t.headers)).revision,0);x.reopen();assert.deepEqual(x.read(p),r);}finally{await x.close();}
});

test('575 direct548 model label/provider subscription does not grant real route or shared-loop acceptance',async()=>{
 const x=await fixture();try{assert.throws(()=>createNativeWorkspaceAgentRunV1({sessions:x.f.sessions,contextSelection:x.f.context,dataCatalog:x.f.data,viewOwner:x.f.view,root:x.f.root,model:{...x.model,mode:'OWNER_BOUND_PROVIDER'}}),/AGENT_REAL_ROUTE_NOT_BOUND_DENIED/);assert.equal(x.observations.length,0);}finally{await x.close();}
});

// Controlled LOCAL HTTP framing peer, not a language model. This exercises
// the actual565 owner/secret/profile/cost ledger, not a trusted provider stub.
async function nativeOwnerFixture({taskPurpose=true,mode='OK'}={}){
 const f=await nativeViewFixture546(),peer=syntheticWorkspaceViewChatFeedbackModelV1('tenant-a'),observations=[];let post=0;
 const credentialFile=join(f.root,'owned-synthetic-existing-secret');writeFileSync(credentialFile,syntheticCredential565,{mode:0o600});
 const server=createServer(async(req,res)=>{let bytes='';for await(const chunk of req)bytes+=chunk;const body=bytes?JSON.parse(bytes):null;observations.push({method:req.method,credentialPresent:typeof req.headers.authorization==='string',body});res.writeHead(200,{'content-type':'application/json'});if(req.method==='GET'){res.end(JSON.stringify({data:[{id:'model:synthetic-v1'}]}));return;}post++;const result=await peer.providerCall({request:body},new AbortController().signal);if(mode==='BAD_FRESH_INFORMATION'&&!result.toolCalls.length){const final=JSON.parse(result.text);final.answers[0].sum=0;result.text=JSON.stringify(final);}if(mode==='SECRET_RETIRED_AFTER_FIRST'&&post===1)chmodSync(credentialFile,0o644);res.end(JSON.stringify({model:'model:synthetic-v1',choices:[{message:{content:result.toolCalls.length?null:result.text,tool_calls:result.toolCalls.map(c=>({id:c.id,type:'function',function:{name:c.name,arguments:JSON.stringify(c.arguments)}}))}}],usage:{prompt_tokens:2,completion_tokens:3}}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const options=connectionOptions565({origin:'http://127.0.0.1:'+server.address().port},credentialFile);options.productGrant.limits={...options.productGrant.limits,maxTimeMs:15000,maxInputBytes:32768};if(taskPurpose)options.productGrant.allowedPurposes=['purpose:ui-connection-probe','purpose:ui-view-proposal'];
 let connection=nativeModelConnection.createNativeModelConnectionV1({sessions:f.sessions,profiles:f.legacy,root:f.root,connections:[options]});let model=nativeModelConnection.createNativeWorkspaceFeedbackModelV1(connection,f.sessions.binding);
 const create=()=>createNativeWorkspaceAgentRunV1({sessions:f.sessions,contextSelection:f.context,dataCatalog:f.data,viewOwner:f.view,root:join(f.root,'native-owner-ui-consumer'),model});let agent=create();const t=f.tab(),c=t.context;t.context=f.context.claim(t.headers,{schemaVersion:'pansphaira.workspace-context/claim/v1',tabId:c.binding.tabId,moduleId:c.moduleId,viewId:c.viewId,primaryObjectId:c.primaryObject.objectId,selection:{elementId:'pan.erv.module-card',rowId:'invoice-value'},expected:{...c.revisions,epoch:c.binding.epoch}}).context;
 const headers={...t.headers,'x-pan565-session':t.headers['x-pan548-session']},ctx=()=>f.verification(t),readConnection=()=>connection.read(headers),plan=()=>agent.plan(t.headers,{schemaVersion:'pansphaira.workspace-agent/plan/v1',context:ctx(),text:'Nur ausgewähltes Viewelement als Vorschlag; keine Fachwirkung.'}),command=p=>({schemaVersion:'pansphaira.workspace-agent/start/v1',context:ctx(),planHandle:p.planHandle,planDigest:p.planDigest,inferenceConsent:{offerDigest:p.inferenceConsentOffer.offerDigest,confirm:true}}),start=p=>agent.start(t.headers,command(p)),read=p=>agent.read(t.headers,{schemaVersion:'pansphaira.workspace-agent/read/v1',context:ctx(),runId:p.runId});
 const prerequisites=async()=>{let r=readConnection();connection.select(headers,{schemaVersion:'pansphaira.workspace-model-connection/select/v1',expectedRevision:r.revision,connectionId:options.summary.connectionId});for(const phase of ['REACHABILITY','AUTHENTICATION','MODEL_AVAILABILITY']){r=readConnection();await connection.probe(headers,{schemaVersion:'pansphaira.workspace-model-connection/probe/v1',expectedRevision:r.revision,identityDigest:r.identityDigest,phase});}};
 return {f,t,ctx,headers,model,options,observations,prerequisites,plan,command,start,read,readConnection,posts:()=>post,get connection(){return connection;},get agent(){return agent;},reopen(){agent.close();connection.close();connection=nativeModelConnection.createNativeModelConnectionV1({sessions:f.sessions,profiles:f.legacy,root:f.root,connections:[options]});model=nativeModelConnection.createNativeWorkspaceFeedbackModelV1(connection,f.sessions.binding);agent=create();},async close(){agent.close();connection.close();server.closeAllConnections();await new Promise(r=>server.close(r));await f.close();}};
}

test('575 native565 owner is dynamically selected after assembly, exact task consent then actual HTTP/shared548 read-propose-feedback; cost ledger and independent reopened UI readback',async()=>{
 const x=await nativeOwnerFixture();try{assert.throws(x.plan,/MODEL_CONNECTION_TASK_CONSENT_DENIED/);await x.prerequisites();const p=x.plan(),offer=p.inferenceConsentOffer;assert.equal(p.modelMode,'OWNER_BOUND_PROVIDER');assert.equal(offer.evidenceClass,'SYNTHETIC_ONLY');assert.equal(offer.currency,'NONE');assert.equal(offer.purpose,'purpose:ui-view-proposal');assert.equal(offer.model,x.options.summary.model);assert.equal(x.posts(),0);
 const missing=x.command(p);delete missing.inferenceConsent;await assert.rejects(x.agent.start(x.t.headers,missing),/AGENT_INPUT_DENIED/);await assert.rejects(x.agent.start(x.t.headers,{...x.command(p),inferenceConsent:{offerDigest:'0'.repeat(64),confirm:true}}),/TASK_CONSENT_DENIED/);assert.equal(x.posts(),0);
 const before=x.f.view.read(x.t.headers,x.ctx()),r=await x.start(p);assert.equal(r.phase,'RESULT_READY',JSON.stringify(r));assert.equal(r.realModelAcceptance,false);assert.equal(r.modelMode,'OWNER_BOUND_PROVIDER');assert.equal(x.posts(),2);assert.deepEqual(x.observations.filter(o=>o.method==='POST')[1].body.messages.map(m=>m.role),['user','assistant','tool','tool']);assert.equal(r.proposal.afterView.instances.find(i=>i.instanceId==='invoice-value').size,'large');assert.deepEqual(x.f.view.read(x.t.headers,x.ctx()),before);assert.equal(x.readConnection().checks.INFERENCE.reason,'SYNTHETIC_TOOL_FEEDBACK_ONLY');assert.equal(x.readConnection().consent,'NOT_GRANTED');assert.deepEqual(await x.start(p),r);assert.equal(x.posts(),2);x.reopen();assert.deepEqual(x.read(p),r);assert.equal(x.posts(),2);assert.throws(x.plan,/TASK_CONSENT_DENIED/);
 }finally{await x.close();}
});

test('575 existing probe-only product grant/probe consent cannot authorize UI task data, no synthetic fallback or paid dispatch',async()=>{
 const x=await nativeOwnerFixture({taskPurpose:false});try{await x.prerequisites();const r=x.readConnection();x.connection.consent(x.headers,{schemaVersion:'pansphaira.workspace-model-connection/consent/v1',expectedRevision:r.revision,identityDigest:r.identityDigest,limits:x.options.productGrant.limits,testDataDigest:nativeModelConnection.MODEL_CONNECTION_TEST_DATA_DIGEST_V1,confirm:true});assert.equal(x.readConnection().readyForInference,true);assert.throws(x.plan,/TASK_CONSENT_DENIED/);assert.throws(()=>createNativeWorkspaceAgentRunV1({sessions:x.f.sessions,contextSelection:x.f.context,dataCatalog:x.f.data,viewOwner:x.f.view,root:x.f.root,model:{...x.model}}),/AGENT_REAL_ROUTE_NOT_BOUND_DENIED/);assert.equal(x.posts(),0);
 }finally{await x.close();}
});

for(const mode of ['BAD_FRESH_INFORMATION','SECRET_RETIRED_AFTER_FIRST'])test('575 native owner '+mode+' retains full COST+runtime UNKNOWN across reopen, no synthetic result or blind model retry',async()=>{
 const x=await nativeOwnerFixture({mode});try{await x.prerequisites();const p=x.plan(),r=await x.start(p);assert.equal(r.phase,'OUTCOME_UNCONFIRMED');assert.equal(r.proposal,null);assert.equal(r.realModelAcceptance,false);assert.equal(x.readConnection().checks.INFERENCE.state,'UNKNOWN_USAGE');const count=x.posts();assert.equal(count,mode==='BAD_FRESH_INFORMATION'?2:1);assert.deepEqual(await x.start(p),r);x.reopen();assert.deepEqual(x.read(p),r);assert.throws(x.plan,/TASK_CONSENT_DENIED|STALE_DENIED/);assert.equal(x.posts(),count);
 }finally{await x.close();}
});
