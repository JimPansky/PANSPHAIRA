import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {FlociLabHttpV1} from '../../src/pan396/floci-http-v1.mjs';
import {verifyPan396DisabledUiV1} from '../../src/pan396/disabled-ui-proof-v1.mjs';
// Explicit transport substitution ONLY; the retained native delta supplies real HTTP evidence.
test('UI negative uses lifecycle routing without unknown AWS credential scope; aliases remain closed',async()=>{
 const original=globalThis.fetch;const calls=[];
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response('{}',{status:200,headers:{'Content-Type':'application/json'}});};
 try{
  const client=new FlociLabHttpV1('http://172.19.0.2:4566',{namespace:'pan396-'+randomUUID()});
  for(const alias of ['_floci','_localstack'])await client.denyDisabledUi(alias,true);
  assert.deepEqual(calls.map(c=>new URL(c.url).pathname),['/_floci/ui/status','/_localstack/ui/status']);
  for(const c of calls){assert.equal(c.options.method,'GET');assert.equal(c.options.headers.authorization,undefined);assert.equal(c.options.headers['x-amz-date'],undefined);assert.equal(c.options.redirect,'error');}
  await assert.rejects(client.denyDisabledUi('foreign'),/NEGATIVE_PROBE_NOT_ADMITTED/);assert.equal(calls.length,2);
 }finally{globalThis.fetch=original;}
});
const disabled='The Floci web console is disabled (set floci.services.ui.enabled=true to enable it).';
const synthetic=error=>({denyDisabledUi:async(_alias,status)=>status?{status:200,text:JSON.stringify({ready:false,url:null,error}),auditRow:{responseSha256:'0'.repeat(64)}}:{status:200,headers:{'content-type':'text/html'}}});
test('HTTP200 alone is never UI-denial proof; requires exact effective disabled reason',async()=>{
 const rows=await verifyPan396DisabledUiV1(synthetic(disabled));assert.equal(rows.length,2);
 for(const row of rows){assert.equal(row.sidecarStartDeniedByEffectiveConfig,true);assert.equal(row.interstitialIsNotAdmission,true);}
 await assert.rejects(verifyPan396DisabledUiV1(synthetic('Docker socket unavailable')),/AssertionError/);
 await assert.rejects(verifyPan396DisabledUiV1({denyDisabledUi:async()=>({status:404,headers:{'content-type':'application/json'}})}),/AssertionError/);
});
