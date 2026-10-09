import assert from 'node:assert/strict';
import test from 'node:test';
import {request as httpsRequest} from 'node:https';
import {nativeFixture527,request527} from '../pan527/helpers.mjs';
import {financeFixture} from '../pan519/native-fixture.mjs';
import {nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
import {createNativeAnalysisReadAdapterV1} from '../../src/pan549/native-analysis-read.mjs';
import {createNativeErvReadAdapterV1} from '../../src/pan541/native-erv-read-adapter.mjs';
import {enableWorkspaceBrowserV1} from '../../src/pan541/workspace-browser.mjs';
import * as ingress from '../../src/pan527/origin-session-adapter.mjs';
const selector={schemaVersion:'pansphaira.workspace-analysis/read/v1',objectId:'analysis:common-trade-01:stock',expectedNativeRevision:null,expectedResultRevision:null,asOf:'2026-06-30T23:59:59+02:00'};

test('PUI-08-AC04 native analysis mounts on the real current protected shell ingress with own-session origin proof; direct stale scope and revoked-session reads fail closed',async()=>{
 assert.equal(typeof ingress.mountProtectedWorkspaceAnalysisV1,'function','PAN549_REAL_PROTECTED_ANALYSIS_INGRESS_NOT_IMPLEMENTED');
 const tls=await nativeFixture527();let native,workspace;
 try{
  native=await financeFixture();const before=nativeRows(native.root,'SELECT revision,command,event FROM pan515_events ORDER BY revision');
  const sessions=tls.gateway.sessionAdapter('tenant-a'),analysisReader=createNativeAnalysisReadAdapterV1({optIn:true,root:native.root,sessions});
  workspace=enableWorkspaceBrowserV1({optIn:true,gateway:tls.gateway,tenantId:'tenant-a',origin:tls.origin,nativeReader:createNativeErvReadAdapterV1({tenantId:'tenant-a',root:native.root}),analysisReader});
  const issued=sessions.issueOwnerSession({subjectId:'synthetic:analysis-transport-reader',role:'reader',expiresAtMs:Date.now()+60000});
  const context=JSON.parse((await request527(tls,'/t/tenant-a/workspace/context',{cookie:issued.cookieHeader})).body);
  const headers={cookie:issued.cookieHeader,origin:tls.origin,'x-pan549-context':context.sessionId};
  const response=await request527(tls,'/t/tenant-a/workspace/analysis',headers,'POST',selector);
  assert.equal(response.status,200);assert.equal(response.tlsAuthorized,true);const actual=JSON.parse(response.body);
  assert.deepEqual(actual,analysisReader.read(headers,selector));assert.equal(actual.rows.find(r=>r.key==='physical').value,2);
  assert.equal(response.headers['set-cookie'],undefined,'readonly late result must never restore a retired session cookie');
  assert.equal((await request527(tls,'/t/tenant-a/workspace/analysis',{cookie:issued.cookieHeader,origin:tls.origin},'POST',selector)).status,401);
  assert.equal((await request527(tls,'/t/tenant-a/workspace/analysis',{...headers,origin:'https://outside.invalid'},'POST',selector)).status,403);
  assert.equal((await request527(tls,'/t/tenant-b/workspace/analysis',headers,'POST',selector)).status,401);
  for(const changes of [{expectedNativeRevision:999},{expectedResultRevision:'0'.repeat(64)}]){
   assert.throws(()=>analysisReader.read(headers,{...selector,...changes}),/ANALYSIS_(NATIVE|RESULT)_REVISION_STALE/);
   assert.equal((await request527(tls,'/t/tenant-a/workspace/analysis',headers,'POST',{...selector,...changes})).status,409);
  }
  assert.throws(()=>analysisReader.read({...headers,origin:'https://outside.invalid'},selector),/ANALYSIS_ORIGIN_OR_ROLE_DENIED/);
  for(const changes of [{tenantId:'tenant-b'},{sql:'SELECT * FROM objects'},{authority:'reviewer'}])assert.equal((await request527(tls,'/t/tenant-a/workspace/analysis',headers,'POST',{...selector,...changes})).status,400);
  assert.equal((await request527(tls,'/t/tenant-a/workspace/logout',{cookie:issued.cookieHeader,origin:tls.origin},'POST')).status,200);
  assert.equal((await request527(tls,'/t/tenant-a/workspace/analysis',headers,'POST',selector)).status,401);
  assert.throws(()=>analysisReader.read(headers,selector),/HOSTED_SESSION_DENIED/);
  assert.deepEqual(nativeRows(native.root,'SELECT revision,command,event FROM pan515_events ORDER BY revision'),before);
 }finally{workspace?.close();native?.close();await tls.close();}
});

function deferred(){let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};}
async function attachmentFixture(){
 const tls=await nativeFixture527();let native,document,attachment;
 try{
  native=await financeFixture();const sessions=tls.gateway.sessionAdapter('tenant-a');
  const reader=createNativeAnalysisReadAdapterV1({optIn:true,root:native.root,sessions});
  const erv=createNativeErvReadAdapterV1({tenantId:'tenant-a',root:native.root});
  const base={optIn:true,tenantId:'tenant-a',origin:tls.origin,identityDigest:sessions.binding.identityDigest};
  const mountDocument=()=>{document=ingress.mountProtectedWorkspaceDocumentV1(tls.gateway,{...base,html:'<h1>Owned analysis boundary test</h1>',script:'',style:'',readErv:(r,p)=>erv.read({tenantId:p.tenantId,objectId:r.objectId,expectedRevision:r.expectedRevision})});};
  const mountRead=read=>{attachment=ingress.mountProtectedWorkspaceAnalysisV1(tls.gateway,{...base,adapterVersion:'pan520-stock-analysis/v1',read});};
  mountDocument();
  const who=sessions.issueOwnerSession({subjectId:'synthetic:analysis-attachment-reader',role:'reader',expiresAtMs:Date.now()+60000});
  const context=JSON.parse((await request527(tls,'/t/tenant-a/workspace/context',{cookie:who.cookieHeader})).body);
  const headers={cookie:who.cookieHeader,origin:tls.origin,'x-pan549-context':context.sessionId};
  return {tls,native,sessions,reader,headers,mountRead,retire(kind){attachment.close();if(kind==='workspace'){document.close();mountDocument();}},async close(){attachment?.close();document?.close();native?.close();await tls.close();}};
 }catch(error){attachment?.close();document?.close();native?.close();await tls.close();throw error;}
}
for(const stage of ['body','read'])for(const kind of ['analysis','workspace'])test('PUI-08 actual protected '+kind+' attachment retirement during '+stage+' denies its old request despite replacement and a still-live cookie',{timeout:15000},async()=>{
 const f=await attachmentFixture(),entered=deferred(),release=deferred();let pendingRequest;
 try{
  let sourceReads=0;
  f.mountRead(async(headers,request)=>{sourceReads++;const actual=f.reader.read(headers,request);entered.resolve();await release.promise;return actual;});
  let response;
  if(stage==='read'){
   response=request527(f.tls,'/t/tenant-a/workspace/analysis',f.headers,'POST',selector);await entered.promise;
  }else{
   const body=JSON.stringify(selector);f.tls.gateway.server.once('request',()=>entered.resolve());
   response=new Promise((resolve,reject)=>{
    pendingRequest=httpsRequest({hostname:'127.0.0.1',servername:'pan527.test',port:f.tls.port,path:'/t/tenant-a/workspace/analysis',method:'POST',ca:f.tls.cert,rejectUnauthorized:true,headers:{...f.headers,'content-type':'application/json','content-length':Buffer.byteLength(body)}},incoming=>{let text='';incoming.setEncoding('utf8');incoming.on('data',chunk=>{text+=chunk;});incoming.on('end',()=>resolve({status:incoming.statusCode,body:text,tlsAuthorized:pendingRequest.socket.authorized}));});
    pendingRequest.on('error',reject);pendingRequest.write(body.slice(0,1));
   });
   await entered.promise;const resolveRead=release.resolve;release.resolve=()=>{resolveRead();if(!pendingRequest.writableEnded)pendingRequest.end(body.slice(1));};
  }
  f.retire(kind);f.mountRead((headers,request)=>f.reader.read(headers,request));
  assert.equal(f.sessions.authenticate(f.headers).role,'reader','attachment retirement must be tested independently of session revocation');
  const fresh=await request527(f.tls,'/t/tenant-a/workspace/analysis',f.headers,'POST',selector);assert.equal(fresh.status,200);assert.equal(JSON.parse(fresh.body).rows[0].value,2);
  release.resolve();const retired=await response;assert.equal(retired.tlsAuthorized,true);assert.equal(retired.status,409,'captured retired attachment must not acquire replacement ownership');assert.doesNotMatch(retired.body,/"rows"|"resultRevision"/);
  assert.equal(sourceReads,stage==='body'?0:1,'retirement during body receipt must be denied before reaching the source');
 }finally{release.resolve();pendingRequest?.end();await f.close();}
});

test('PUI-08 protected ingress admits only a real result matching its requested native revision, result revision and literal cutoff',{timeout:15000},async()=>{
 const f=await attachmentFixture();
 try{
  const actual=f.reader.read(f.headers,selector);
  // The observer returns unchanged genuine native bytes. It ignores only the
  // observed selector to expose missing admission, not a fabricated digest.
  f.mountRead(()=>actual);
  assert.equal((await request527(f.tls,'/t/tenant-a/workspace/analysis',f.headers,'POST',selector)).status,200);
  for(const changes of [{expectedNativeRevision:actual.source.snapshot.nativeRevision+1},{expectedResultRevision:'0'.repeat(64)},{asOf:'2026-07-01T00:00:00Z'},{asOf:null}]){
   const rejected=await request527(f.tls,'/t/tenant-a/workspace/analysis',f.headers,'POST',{...selector,...changes});
   assert.equal(rejected.status,409);assert.doesNotMatch(rejected.body,/"rows"|"resultRevision"/);
  }
 }finally{await f.close();}
});
