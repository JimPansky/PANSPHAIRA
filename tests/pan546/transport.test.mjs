import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeViewFixture546} from './native-fixture.mjs';
import {request527} from '../pan527/helpers.mjs';
import {nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
import {mountProtectedWorkspaceModuleViewsV1} from '../../src/pan527/origin-session-adapter.mjs';
const path='/t/tenant-a/workspace/module-view';
function previewCommand(f,t,position=0){return {schemaVersion:'pansphaira.workspace-module-view/preview/v1',context:f.verification(t),delta:{schemaVersion:'pansphaira.workspace-module-view/delta/v1',operations:[{kind:'MOVE',instanceId:'native-review',position}]}};}
async function post(f,t,suffix,value,headers={}){return request527(f.tls,path+suffix,{...t.headers,...headers},'POST',value);}
async function read(f,t){return request527(f.tls,path,{...t.headers,'x-pan546-context':t.context.contextHandle});}
async function refresh(f,t){const r=await request527(f.tls,'/t/tenant-a/workspace/context-selection',t.headers);assert.equal(r.status,200,r.body);t.context=JSON.parse(r.body).context;return r;}
test('DUI-03 actual protected HTTPS native read/preview/cancel/confirmation/independent GET/Undo preserve cookie and business boundary',async()=>{
 const f=await nativeViewFixture546();try{
  const t=f.tab(f.issue('synthetic:erv-reader','reader'));let r=await read(f,t);assert.equal(r.status,200,r.body);assert.equal(r.tlsAuthorized,true);assert.equal(JSON.parse(r.body).revision,0);
  r=await post(f,t,'/catalog',f.verification(t));assert.equal(r.status,200,r.body);assert.equal(JSON.parse(r.body).budgets.maximumFieldsPerRead,8);
  r=await post(f,t,'/data',{schemaVersion:'pansphaira.workspace-data-read/v1',context:f.verification(t),fieldIds:['erv.invoice.amountMinor','erv.human.reviewState']});assert.equal(r.status,200,r.body);assert.equal(JSON.parse(r.body).cells[1].source,'HUMAN_NATIVE');
  r=await post(f,t,'/preview',previewCommand(f,t));assert.equal(r.status,200,r.body);let p=JSON.parse(r.body);assert.equal(p.previewOnly,true);assert.equal(f.store.revision(f.sessions.authenticate(t.headers)),0);
  const {confirmation,...cancel}=f.confirmation(t,p);r=await post(f,t,'/cancel',{...cancel,schemaVersion:'pansphaira.workspace-module-view/cancel/v1'});assert.equal(r.status,200,r.body);assert.equal(f.store.revision(f.sessions.authenticate(t.headers)),0);
  r=await post(f,t,'/preview',previewCommand(f,t));assert.equal(r.status,200,r.body);p=JSON.parse(r.body);r=await post(f,t,'/confirm',f.confirmation(t,p));assert.equal(r.status,200,r.body);const receipt=JSON.parse(r.body);assert.equal(receipt.independentReadbackRequired,true);assert.equal(r.headers['set-cookie'],undefined);
  r=await read(f,t);assert.equal(r.status,409,r.body);await refresh(f,t);r=await read(f,t);assert.equal(r.status,200,r.body);let actual=JSON.parse(r.body);assert.equal(actual.revision,1);assert.equal(actual.viewDigest,p.afterDigest);assert.equal(actual.confirmedCandidateDigest,p.candidateDigest);assert.equal(actual.independentNativeRead,true);assert.equal(r.headers['set-cookie'],undefined);
  r=await post(f,t,'/undo-preview',{schemaVersion:'pansphaira.workspace-module-view/undo-preview/v1',context:f.verification(t),targetRevision:0});assert.equal(r.status,200,r.body);p=JSON.parse(r.body);r=await post(f,t,'/confirm',f.confirmation(t,p));assert.equal(r.status,200,r.body);assert.equal(JSON.parse(r.body).revision,2);await refresh(f,t);r=await read(f,t);actual=JSON.parse(r.body);assert.equal(actual.revision,2);assert.equal(actual.view.instances[0].instanceId,'invoice-value');assert.equal(nativeRows(f.native.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,0);
 }finally{await f.close();}
});
test('DUI-03 actual concurrent native HTTPS confirms from two authentic tabs produce one CAS winner; stale loser stays unchanged',async()=>{
 const f=await nativeViewFixture546();try{
  const headers=f.issue(),a=f.tab(headers),b=f.tab(headers),ra=await post(f,a,'/preview',previewCommand(f,a,0)),rb=await post(f,b,'/preview',previewCommand(f,b,1));assert.equal(ra.status,200,ra.body);assert.equal(rb.status,200,rb.body);const pa=JSON.parse(ra.body),pb=JSON.parse(rb.body);
  const replies=await Promise.all([post(f,a,'/confirm',f.confirmation(a,pa)),post(f,b,'/confirm',f.confirmation(b,pb))]);assert.deepEqual(replies.map(r=>r.status).sort(),[200,409]);assert.equal(f.store.revision(f.sessions.authenticate(headers)),1);await refresh(f,a);const independent=await read(f,a);assert.equal(independent.status,200,independent.body);const actual=JSON.parse(independent.body),winner=JSON.parse(replies.find(r=>r.status===200).body);assert.equal(actual.revision,1);assert.equal(actual.viewDigest,winner.viewDigest);assert.equal(actual.confirmedCandidateDigest,winner.confirmedCandidateDigest);assert.equal(nativeRows(f.native.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,0);
 }finally{await f.close();}
});
test('DUI-03 actual HTTP response loss AFTER native CAS is reconciled by fresh independent GET; the original write is never blindly replayed',async()=>{
 const f=await nativeViewFixture546();try{
  const t=f.tab(),r=await post(f,t,'/preview',previewCommand(f,t));assert.equal(r.status,200,r.body);const p=JSON.parse(r.body);let actualDroppedReceipt=null;
  const intercept=(request,response)=>{if(request.url!==path+'/confirm')return;const original=response.end;response.end=function(body,...args){const parsed=typeof body==='string'?JSON.parse(body):null;if(parsed?.schemaVersion==='pansphaira.workspace-module-view/write-receipt/v1'&&parsed.outcome==='VIEW_PERSISTED'){actualDroppedReceipt=parsed;response.destroy();return response;}return original.call(this,body,...args);};};
  f.tls.gateway.server.once('request',intercept);await assert.rejects(()=>post(f,t,'/confirm',f.confirmation(t,p)),/socket hang up|ECONNRESET|aborted/i);assert.ok(actualDroppedReceipt);assert.equal(actualDroppedReceipt.revision,1);assert.equal(f.store.revision(f.sessions.authenticate(t.headers)),1);
  await refresh(f,t);const authoritative=await read(f,t);assert.equal(authoritative.status,200,authoritative.body);const actual=JSON.parse(authoritative.body);assert.equal(actual.revision,1);assert.equal(actual.viewDigest,p.afterDigest);assert.equal(actual.confirmedCandidateDigest,p.candidateDigest);assert.equal(actual.confirmedCandidateDigest,actualDroppedReceipt.confirmedCandidateDigest);assert.equal(nativeRows(f.native.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,0);
  console.log('PAN546_ACTUAL_LOST_NATIVE_HTTP_REPLY_RECONCILED '+JSON.stringify({actualDroppedNativeCASRevision:actualDroppedReceipt.revision,independentGETRevision:actual.revision,digestMatched:true,confirmRequests:1,noBlindRetry:true}));
 }finally{await f.close();}
});
test('DUI-04 native HTTP denies spoofed scope/free queries/field leaks/oversized body and changed consent before any personal persistence',async()=>{
 const f=await nativeViewFixture546();try{
  const t=f.tab(),r=await post(f,t,'/preview',previewCommand(f,t));assert.equal(r.status,200,r.body);const p=JSON.parse(r.body);
  for(const [suffix,body,extra,status] of [
   ['/confirm',{...f.confirmation(t,p),candidateDigest:'f'.repeat(64)},{},409],
   ['/confirm',f.confirmation(t,p),{origin:'https://foreign.invalid'},403],
   ['/confirm',f.confirmation(t,p),{'x-role':'reviewer'},403],
   ['/data',{schemaVersion:'pansphaira.workspace-data-read/v1',context:f.verification(t),fieldIds:['erv.human.assignee']},{},403],
   ['/data',{schemaVersion:'pansphaira.workspace-data-read/v1',context:f.verification(t),fieldIds:['erv.invoice.currency'],query:'SELECT *'},{},400],
   ['/preview',{...previewCommand(f,t),html:'<script>'},{},400],
   ['/preview',{...previewCommand(f,t),padding:'x'.repeat(9000)},{},413],
  ]){const denied=await post(f,t,suffix,body,extra);assert.equal(denied.status,status,denied.body);}
  let denied=await request527(f.tls,path+'?url=https://outside.invalid',t.headers);assert.equal(denied.status,404);denied=await request527(f.tls,path+'/confirm',t.headers);assert.equal(denied.status,404);denied=await request527(f.tls,'/t/tenant-b/workspace/module-view',t.headers);assert.equal(denied.status,401);assert.equal(f.store.revision(f.sessions.authenticate(t.headers)),0);assert.equal(nativeRows(f.native.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,0);
 }finally{await f.close();}
});
test('DUI-03 native owner markers reject copied facades; actual attachment retirement during streamed body cannot save',async()=>{
 const f=await nativeViewFixture546();try{
  const t=f.tab(),p=f.preview(t,[{kind:'MOVE',instanceId:'native-review',position:0}]);const opts={optIn:true,tenantId:'tenant-a',origin:f.tls.origin,identityDigest:f.sessions.binding.identityDigest,adapterVersion:'pan546-native-personal-view/v1',dataCatalog:f.data,viewOwner:{...f.view}};f.viewAttachment.close();assert.throws(()=>mountProtectedWorkspaceModuleViewsV1(f.tls.gateway,opts),/VIEW_NATIVE_OWNER_DENIED/);
  const attachment=mountProtectedWorkspaceModuleViewsV1(f.tls.gateway,{...opts,viewOwner:f.view});f.tls.gateway.server.once('request',()=>attachment.close());const denied=await post(f,t,'/confirm',f.confirmation(t,p));assert.equal(denied.status,409,denied.body);assert.equal(JSON.parse(denied.body).error,'VIEW_ATTACHMENT_RETIRED');assert.equal(f.store.revision(f.sessions.authenticate(t.headers)),0);assert.equal(nativeRows(f.native.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,0);
 }finally{await f.close();}
});
