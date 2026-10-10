import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {nativeFixture527} from '../pan527/helpers.mjs';
import {createBrowserProfileStoreV1} from '../../src/pan543/profile-store.mjs';
import {defaultBrowserProfileV1} from '../../dist/packages/contracts/src/browser-profile-v1.js';
import {connectionTransportIdentityV1} from '../../src/pan565/connection-transport.mjs';
import {createNativeModelConnectionV1,MODEL_CONNECTION_TEST_DATA_DIGEST_V1} from '../../src/pan565/native-model-connection.mjs';
export const limits565={maxCostMicros:50000,maxTimeMs:1500,maxTurns:3,maxTools:2,maxRequests:3,maxTokens:512,maxInputBytes:16384,maxOutputBytes:8192};
export const syntheticCredential565='SYNTHETIC_PRIVATE_FILE_CANARY_NOT_A_REAL_CREDENTIAL';
export async function localModelServer565(){
 let mode='OK',get=0,post=0,release=null;const observations=[],postWaiters=[];
 const server=createServer(async(req,res)=>{let body='';for await(const c of req)body+=c;const method=req.method;if(method==='GET')get++;else{post++;for(const waiter of postWaiters.splice(0))waiter();}observations.push({method,path:req.url,credentialPresent:typeof req.headers.authorization==='string',body:body?JSON.parse(body):null});
  if(mode==='TIMEOUT'){release=()=>{if(!res.destroyed&&!res.writableEnded&&!res.headersSent){res.writeHead(200,{'content-type':'application/json'});res.end('{}');}};return;}
  if(mode==='REDIRECT'){res.writeHead(302,{location:'http://169.254.169.254/latest/meta-data'});res.end();return;}
  const authorized=req.headers.authorization==='Bearer '+syntheticCredential565;
  if(mode==='AUTH_FAILED'||method==='GET'&&!authorized){res.writeHead(401,{'content-type':'application/json'});res.end('{"error":"minimized-auth-failure"}');return;}
  res.writeHead(200,{'content-type':'application/json'});
  if(method==='GET'){res.end(JSON.stringify({data:[{id:mode==='MODEL_MISSING'?'model:not-listed':'model:synthetic-v1'}]}));return;}
  if(mode==='MALFORMED'){res.end('not-json');return;}
  res.end(JSON.stringify({model:mode==='WRONG_MODEL'?'model:wrong-model':'model:synthetic-v1',choices:[{message:{content:mode==='SECRET_ECHO'?syntheticCredential565:'Synthetic framing only; not a model.',tool_calls:[]}}],usage:{prompt_tokens:2,completion_tokens:3}}));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 return {origin:'http://127.0.0.1:'+server.address().port,observations,get:()=>get,post:()=>post,waitForPost(){return post?Promise.resolve():new Promise(r=>postWaiters.push(r));},setMode(v){mode=v;},release(){release?.();},async close(){release?.();server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
export function connectionOptions565(server,credentialFile,{grant=true}={}){return {summary:{connectionId:'connection:synthetic-existing',routeId:'route:synthetic-openai-chat-completions',provider:'provider:synthetic-model',model:'model:synthetic-v1',protocol:'OPENAI_CHAT_COMPLETIONS',evidenceClass:'SYNTHETIC_ONLY',secretReference:'credential-handle:synthetic-model-v1',authMethod:'EXISTING_SECRET_REFERENCE',identity:{...connectionTransportIdentityV1(),deploymentId:'synthetic-local-http-fixture-not-model',configurationRevision:1},availability:{runtime:true,provider:true,auth:true,model:true,functions:true},selectable:true},target:{origin:server.origin,allowedAddresses:['127.0.0.1'],localOnly:true},credentialFile,pricing:null,productGrant:grant?{limits:limits565,testDataDigest:MODEL_CONNECTION_TEST_DATA_DIGEST_V1,expiresAtMs:Date.now()+180000}:null};}
export async function nativeFixture565({grant=true,alter=()=>{}}={}){
 const tls=await nativeFixture527(),server=await localModelServer565(),sessions=tls.gateway.sessionAdapter('tenant-a'),root=tls.tenants[0].productRoot,credentialFile=join(tls.root,'synthetic-model-existing-secret');writeFileSync(credentialFile,syntheticCredential565+'\n',{mode:0o600});
 const profiles=createBrowserProfileStoreV1({root,catalog:()=>defaultBrowserProfileV1().items.map(i=>({id:i.id,version:i.version,state:'AVAILABLE'}))}),options=connectionOptions565(server,credentialFile,{grant});alter(options);let owner=createNativeModelConnectionV1({sessions,profiles,root,connections:[options]});
 const issue=(s=sessions,subject='synthetic:erv-reader')=>{const issued=s.issueOwnerSession({subjectId:subject,role:'reader',expiresAtMs:Date.now()+180000});const sessionId='session:'+createHash('sha256').update(issued.cookieHeader).digest('hex');return {cookie:issued.cookieHeader,origin:tls.origin,'x-pan565-session':sessionId};},headers=issue();
 const read=()=>owner.read(headers),select=()=>owner.select(headers,{schemaVersion:'pansphaira.workspace-model-connection/select/v1',expectedRevision:read().revision,connectionId:options.summary.connectionId}),probe=phase=>{const r=read();return owner.probe(headers,{schemaVersion:'pansphaira.workspace-model-connection/probe/v1',expectedRevision:r.revision,identityDigest:r.identityDigest,phase});},consent=(limits=limits565)=>{const r=read();return owner.consent(headers,{schemaVersion:'pansphaira.workspace-model-connection/consent/v1',expectedRevision:r.revision,identityDigest:r.identityDigest,limits,testDataDigest:MODEL_CONNECTION_TEST_DATA_DIGEST_V1,confirm:true});};
 return {tls,server,sessions,root,credentialFile,profiles,options,headers,issue,read,select,probe,consent,get owner(){return owner;},async prerequisites(){select();for(const p of ['REACHABILITY','AUTHENTICATION','MODEL_AVAILABILITY'])await probe(p);},reopen(){owner.close();owner=createNativeModelConnectionV1({sessions,profiles,root,connections:[options]});},async close(){owner.close();profiles.close();await server.close();tls.gateway.server.closeAllConnections();await tls.close();}};
}
