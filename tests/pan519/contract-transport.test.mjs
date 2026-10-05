import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import * as finance from '../../src/pan519/finance-handoff.mjs';
import {financeFixture,handoff} from './native-fixture.mjs';
import {nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
const url=new URL('../../src/pan519/contract-transport.mjs',import.meta.url);
const adapter=existsSync(url)?await import(url):finance;
const owner='LOCAL_SYNTHETIC_OWNER';
// This is a declared local contract target with real HTTP and persisted target rows,
// NOT a selected or qualified FiBu sandbox or an external provider replacement.
async function contractTarget(parent){
 const db=new DatabaseSync(join(parent,'explicit-local-contract-target.sqlite'));db.exec('CREATE TABLE postings(business_key TEXT PRIMARY KEY,record TEXT NOT NULL);');let postRequests=0,getRequests=0;
 const server=createServer(async(req,res)=>{
  try{
   if(req.method==='POST'&&req.url==='/pan519-contract-v1/handoffs'){
    postRequests++;let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>32768)throw Error('TARGET_REQUEST_BOUND_DENIED');}const v=JSON.parse(raw),old=db.prepare('SELECT record FROM postings WHERE business_key=?').get(v.businessKey);
    if(!old){const d=v.document,reply={schemaVersion:'pansphaira.pan519/contract-readback/v1',proofClass:'LOCAL_SYNTHETIC_CONTRACT_ONLY',observationId:'synthetic:read-'+v.businessKey.slice(0,16),tenantId:d.tenantId,entityId:d.entityId,currency:d.currency,businessKey:v.businessKey,documentSourceDigest:d.sourceDigest,booking:{state:'POSTED',reference:'synthetic:book-'+v.businessKey.slice(0,16),bookedAt:'2026-07-03T12:01:00Z'},payments:{complete:true,coverageThrough:'2026-07-31T23:59:59Z',allocations:[],differences:[]},observedAt:'2026-08-01T00:00:00Z'};db.prepare('INSERT INTO postings VALUES(?,?)').run(v.businessKey,JSON.stringify(reply));}
    // Genuine persisted target effect, followed by loss of the acknowledgement.
    res.destroy();return;
   }
   const match=req.url.match(/^\/pan519-contract-v1\/readbacks\/([0-9a-f]{64})$/);
   if(req.method==='GET'&&match){getRequests++;const row=db.prepare('SELECT record FROM postings WHERE business_key=?').get(match[1]);if(!row){res.writeHead(404);res.end();return;}res.setHeader('content-type','application/json');res.end(row.record);return;}
   res.writeHead(405);res.end();
  }catch{res.writeHead(400);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {endpoint:'http://127.0.0.1:'+server.address().port+'/pan519-contract-v1',counts:()=>({posts:postRequests,gets:getRequests,rows:db.prepare('SELECT count(*) AS n FROM postings').get().n}),close:async()=>{await new Promise(resolve=>server.close(resolve));db.close();}};
}
function freshClient(root,endpoint,businessKey){
 const program="import {executePan519ContractTransport} from './src/pan519/contract-transport.mjs';const [root,endpoint,businessKey]=process.argv.slice(1);const r=await executePan519ContractTransport({root,owner:'LOCAL_SYNTHETIC_OWNER',endpoint,businessKey,timeoutMs:1000});console.log(JSON.stringify(r));";
 return new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','-e',program,root,endpoint,businessKey],{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('CLIENT_BOUND_EXPIRED'));},15000);child.stdout.on('data',c=>stdout+=c);child.stderr.on('data',c=>stderr+=c);child.once('error',reject);child.once('close',code=>{clearTimeout(timer);if(code!==0)reject(Error(stderr));else resolve(JSON.parse(stdout));});});
}
test('P05 actual HTTP target commits before acknowledgement loss; restarted client reads the same booking instead of posting again',async()=>{
 const f=await financeFixture();let target;
 try{
  finance.initializePan519Finance({root:f.root,owner});const first=handoff(f.root,'AR-01');target=await contractTarget(f.parent);
  assert.equal(typeof adapter.executePan519ContractTransport,'function','real native handoff has no bounded persistent HTTP dispatch fence/read-before-retry adapter');
  const result=await adapter.executePan519ContractTransport({root:f.root,owner,endpoint:target.endpoint,businessKey:first.receipt.businessKey,timeoutMs:1000});assert.equal(result.outcome,'UNKNOWN_TARGET_OUTCOME');assert.equal(target.counts().posts,1);assert.equal(target.counts().rows,1);
  const unknown=finance.readPan519Finance({root:f.root,asOf:'2026-07-31T23:59:59Z'}).documents[0];assert.equal(unknown.bookingState,'UNKNOWN');assert.equal(unknown.openMinor,null);
  const resumed=await freshClient(f.root,target.endpoint,first.receipt.businessKey);assert.equal(resumed.outcome,'EXACT_CONTRACT_READBACK_RECONCILED_NO_REDISPATCH');assert.equal(target.counts().posts,1);assert.equal(target.counts().gets,1);assert.equal(target.counts().rows,1);
  const read=finance.readPan519Finance({root:f.root,asOf:'2026-07-31T23:59:59Z'});assert.equal(read.documents[0].bookingState,'POSTED_LOCAL_CONTRACT');assert.equal(read.documents[0].openMinor,80000);assert.equal(read.qualification.realTargetSandboxQualified,false);assert.equal(read.authority.paymentDispatchAuthorized,false);
  const ap=handoff(f.root,'AP-PAN516-MATCHED-01');const apUnknown=await adapter.executePan519ContractTransport({root:f.root,owner,endpoint:target.endpoint,businessKey:ap.receipt.businessKey,timeoutMs:1000});assert.equal(apUnknown.outcome,'UNKNOWN_TARGET_OUTCOME');
  assert.equal((await freshClient(f.root,target.endpoint,ap.receipt.businessKey)).outcome,'EXACT_CONTRACT_READBACK_RECONCILED_NO_REDISPATCH');assert.deepEqual(target.counts(),{posts:2,gets:2,rows:2});
  assert.equal(nativeRows(f.root,'SELECT * FROM pan519_dispatches').length,2);assert.equal(nativeRows(f.root,'SELECT * FROM pan519_observations').length,2);
 }finally{if(target)await target.close();f.close();}
});
