// Retained bounded independent regression; original receipt remains separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:https';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {nativeFixture527,request527} from './helpers.mjs';
test('redirect aliases and real TLS WebSocket upgrade cannot bypass tenant session boundary',async()=>{
 const f=await nativeFixture527();try{
 const s=f.gateway.sessionAdapter('tenant-a').issueOwnerSession({subjectId:'reviewer',role:'reviewer',expiresAtMs:Date.now()+60000});
 assert.equal((await request527(f,'/t/tenant-a/api/status',{cookie:s.cookieHeader})).status,200);
 const paths=f.tenants.map(t=>join(t.productRoot,'artifacts/poc-guided-demo/playgrounds/quick-tour/dashboard-events.jsonl'));
 const before=paths.map(p=>readFileSync(p,'utf8'));
 const denied=[];
 for(const path of ['/t/tenant-a/api/status?redirect=https://not-owned.invalid','/t/tenant-a/api/status?next=/t/tenant-b/api/status','//not-owned.invalid/t/tenant-a/api/status','/t/tenant-a/../tenant-b/api/status','/t/tenant-a%2f..%2ftenant-b/api/status']){
  const r=await request527(f,path,{cookie:s.cookieHeader});assert.equal(r.status,404);assert.equal(r.headers.location,undefined);denied.push(r.status);
 }
 const upgrades=[];
 for(const path of ['/t/tenant-a/api/status','/t/tenant-b/api/status']){
  const r=await new Promise((resolve,reject)=>{
   const req=request({hostname:'127.0.0.1',servername:'pan527.test',port:f.port,path,ca:f.cert,rejectUnauthorized:true,headers:{cookie:s.cookieHeader,origin:f.origin,connection:'Upgrade',upgrade:'websocket','sec-websocket-version':'13','sec-websocket-key':'dGhlIHNhbXBsZSBub25jZQ=='}},res=>{res.resume();res.on('end',()=>resolve({status:res.statusCode,authorized:req.socket.authorized}));});
   req.on('upgrade',(_res,socket)=>{socket.destroy();reject(new Error('unexpected upgrade'));});req.on('error',reject);req.setTimeout(3000,()=>req.destroy(new Error('timeout')));req.end();
  });assert.equal(r.status,403);assert.equal(r.authorized,true);upgrades.push(r.status);
 }
 assert.deepEqual(paths.map(p=>readFileSync(p,'utf8')),before);
 console.log(JSON.stringify({redirectAliasDenials:denied,websocketUpgradeDenials:upgrades,tlsCertificateVerified:true,bothTenantEventFilesUnchanged:true}));
 }finally{await f.close();}
});
