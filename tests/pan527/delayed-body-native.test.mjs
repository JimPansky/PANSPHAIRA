// Retained bounded independent regression; original receipt remains separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:https';
import {readFileSync,unlinkSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {nativeFixture527,request527} from './helpers.mjs';
function slow(f,session,delay,mid=()=>{}) { return new Promise((resolve,reject)=>{
 const body=JSON.stringify({question:'What is happening?'});
 const req=request({hostname:'127.0.0.1',servername:'pan527.test',port:f.port,path:'/t/tenant-a/api/ask',method:'POST',ca:f.cert,rejectUnauthorized:true,headers:{cookie:session.cookieHeader,origin:f.origin,'x-pan527-csrf':session.csrf,'content-type':'application/json','content-length':Buffer.byteLength(body)}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,body:text}));});
 req.on('error',reject);req.write(body.slice(0,1));setTimeout(()=>{try{mid();req.end(body.slice(1));}catch(e){req.destroy();reject(e);}},delay);
 });}
test('Native mutation rechecks expiry and auth availability after reading delayed body',async()=>{
 const f=await nativeFixture527();
 try{
  const adapter=f.gateway.sessionAdapter('tenant-a');
  const valid=adapter.issueOwnerSession({subjectId:'reviewer-positive',role:'reviewer',expiresAtMs:Date.now()+60000});
  const positive=await request527(f,'/t/tenant-a/api/ask',{cookie:valid.cookieHeader,origin:f.origin,'x-pan527-csrf':valid.csrf},'POST',{question:'What is happening?'});assert.equal(positive.status,200);
  const eventPaths=f.tenants.map(t=>join(t.productRoot,'artifacts/poc-guided-demo/playgrounds/quick-tour/dashboard-events.jsonl'));
  const before=eventPaths.map(p=>readFileSync(p,'utf8'));
  const short=adapter.issueOwnerSession({subjectId:'reviewer-expiring',role:'reviewer',expiresAtMs:Date.now()+500});assert.equal(adapter.authenticate({cookie:short.cookieHeader}).role,'reviewer');
  const expired=await slow(f,short,800);assert.equal(expired.status,401);assert.deepEqual(eventPaths.map(p=>readFileSync(p,'utf8')),before);
  const keyPath=join(f.tenants[0].stateRoot,'session-auth.key');const originalKey=readFileSync(keyPath);
  let outage;try{outage=await slow(f,valid,100,()=>unlinkSync(keyPath));assert.equal(outage.status,503);assert.deepEqual(eventPaths.map(p=>readFileSync(p,'utf8')),before);}finally{writeFileSync(keyPath,originalKey,{mode:0o600});}
  const restored=await request527(f,'/t/tenant-a/api/status',{cookie:valid.cookieHeader});assert.equal(restored.status,200);
  console.log(JSON.stringify({positive:positive.status,expiredDuringBody:expired.status,authLostDuringBody:outage.status,denialsPreserveBothTenantEvents:true,restored:restored.status}));
 }finally{await f.close();}
});
