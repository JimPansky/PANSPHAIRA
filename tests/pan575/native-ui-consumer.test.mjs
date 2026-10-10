import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {nativeViewFixture546} from '../pan546/native-fixture.mjs';
import {createNativeWorkspaceAgentRunV1,syntheticWorkspaceViewChatFeedbackModelV1} from '../../src/pan548/native-agent-run.mjs';
import {validateWorkspaceAgentReadV1} from '../../dist/packages/contracts/src/workspace-agent-run-v1.js';
import {nativeWorkspaceViewFieldsV1} from '../../src/pan546/native-data-catalog.mjs';
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
