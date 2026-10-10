// One code-owned transport attached to the EXISTING ModelAccessBroker. No
// client URL, credential store, provider fallback, environment credentials or
// generic controller. Initially only existing OPENAI_CHAT_COMPLETIONS framing.
import {request as httpsRequest} from 'node:https';
import {request as httpRequest} from 'node:http';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readProtectedOwnerSecretFileV1} from '../pan527/origin-session-adapter.mjs';
import {modelConnectionClosedV1 as exact,modelConnectionArrayV1,validateModelConnectionSummaryV1,validateModelConnectionLimitsV1} from '../../dist/packages/contracts/src/workspace-model-connection-v1.js';
const sha=v=>createHash('sha256').update(v).digest('hex'),fail=(c='MODEL_CONNECTION_TARGET_DENIED')=>{throw Error(c);};
export const connectionTransportIdentityV1=()=>({adapterDigest:sha(readFileSync(new URL('./connection-transport.mjs',import.meta.url))),parserDigest:sha(readFileSync(new URL('./connection-transport.mjs',import.meta.url)))});
const publicV4=ip=>{if(isIP(ip)!==4)return false;const[a,b]=ip.split('.').map(Number);return !(a===0||a===10||a===127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&[0,168].includes(b)||a===100&&b>=64&&b<=127||a===198&&[18,19,51].includes(b)||a===203&&b===0||a>=224);};
export function bindModelConnectionTransportV1(value){
 const o=exact(value,['summary','target','credentialFile','pricing','productGrant']),summary=validateModelConnectionSummaryV1(o.summary),target=exact(o.target,['origin','allowedAddresses','localOnly']),pricing=o.pricing===null?null:exact(o.pricing,['currency','revision','inputMicrosPerMillionTokens','outputMicrosPerMillionTokens']);
 target.allowedAddresses=modelConnectionArrayV1(target.allowedAddresses,8);Object.freeze(target);
 if(summary.identity.adapterDigest!==connectionTransportIdentityV1().adapterDigest||summary.identity.parserDigest!==connectionTransportIdentityV1().parserDigest||typeof target.localOnly!=='boolean'||!Array.isArray(target.allowedAddresses)||target.allowedAddresses.length<1||target.allowedAddresses.length>8||target.allowedAddresses.some(v=>typeof v!=='string'||isIP(v)!==4)||new Set(target.allowedAddresses).size!==target.allowedAddresses.length)fail();
 let url;try{url=new URL(target.origin);}catch{fail();}
 if(typeof target.origin!=='string'||url.origin!==target.origin||url.username||url.password||url.hash||url.search||url.pathname!=='/'||url.hostname.endsWith('.'))fail();
 if(target.localOnly){if(url.hostname!=='127.0.0.1'||target.allowedAddresses.length!==1||target.allowedAddresses[0]!=='127.0.0.1'||!['http:','https:'].includes(url.protocol))fail();}
 else if(url.protocol!=='https:'||summary.authMethod==='NONE_LOCAL'||target.allowedAddresses.some(a=>!publicV4(a))||isIP(url.hostname)&&!publicV4(url.hostname))fail();
 if(summary.evidenceClass==='SYNTHETIC_ONLY'&&(summary.provider!=='provider:synthetic-model'||summary.model!=='model:synthetic-v1'||!target.localOnly)||summary.evidenceClass==='OWNER_BOUND_NOT_QUALIFIED'&&summary.provider==='provider:synthetic-model')fail();
 if(summary.authMethod==='NONE_LOCAL'&&o.credentialFile!==null||summary.authMethod==='EXISTING_SECRET_REFERENCE'&&(typeof o.credentialFile!=='string'||!o.credentialFile.startsWith('/')))fail('MODEL_CONNECTION_SECRET_UNAVAILABLE');
 if(pricing&&(typeof pricing.currency!=='string'||!/^[A-Z]{3}$/.test(pricing.currency)||!Number.isSafeInteger(pricing.revision)||pricing.revision<1||['inputMicrosPerMillionTokens','outputMicrosPerMillionTokens'].some(k=>!Number.isSafeInteger(pricing[k])||pricing[k]<0||pricing[k]>1000000000)))fail('MODEL_CONNECTION_PRICING_DENIED');
 // Nonzero-priced real calls require an independently owner-bound product
 // grant in addition to the exact browser confirmation. Null is default deny.
 const grant=o.productGrant===null?null:exact(o.productGrant,['limits','testDataDigest','expiresAtMs']);
 if(grant)grant.limits=validateModelConnectionLimitsV1(grant.limits);
 const secret=()=>{if(summary.authMethod==='NONE_LOCAL')return {value:null,fingerprint:null};let b;try{b=readProtectedOwnerSecretFileV1(o.credentialFile);}catch{fail('MODEL_CONNECTION_SECRET_UNAVAILABLE');}const value=b.toString('utf8').trim();b.fill(0);if(!/^[A-Za-z0-9._~-]{8,4096}$/.test(value))fail('MODEL_CONNECTION_SECRET_UNAVAILABLE');return {value,fingerprint:sha(value)};};
 async function addresses(signal){
  if(signal.aborted)fail('MODEL_CONNECTION_TIMEOUT');
  const pending=isIP(url.hostname)?Promise.resolve([{address:url.hostname,family:4}]):lookup(url.hostname,{all:true,verbatim:true});
  // lookup itself cannot be cancelled. Detach admission on timeout or owner
  // retirement; a late result/rejection is consumed and can open no socket.
  const ips=await new Promise((resolve,reject)=>{let done=false;const finish=(error,value)=>{if(done)return;done=true;signal.removeEventListener('abort',abort);error?reject(Error(error)):resolve(value);},abort=()=>finish('MODEL_CONNECTION_TIMEOUT');signal.addEventListener('abort',abort,{once:true});pending.then(value=>finish(null,value),()=>finish('MODEL_CONNECTION_DNS_CHANGED_DENIED'));if(signal.aborted)abort();});
  if(signal.aborted)fail('MODEL_CONNECTION_TIMEOUT');if(!ips.length||ips.some(a=>a.family!==4||!target.allowedAddresses.includes(a.address))||new Set(ips.map(a=>a.address)).size!==target.allowedAddresses.length)fail('MODEL_CONNECTION_DNS_CHANGED_DENIED');return ips[0].address;
 }
 async function exchange(method,path,body,signal,authorize,withCredential=true){
  if(!['/v1/models','/v1/chat/completions'].includes(path)||method!=='GET'&&method!=='POST'||method==='GET'&&path!=='/v1/models'||method==='POST'&&path!=='/v1/chat/completions')fail();
  const address=await addresses(signal);authorize();const material=withCredential?secret():{value:null};authorize();if(signal.aborted)fail('MODEL_CONNECTION_TIMEOUT');
  return await new Promise((resolve,reject)=>{let settled=false;const done=(e,v)=>{if(settled)return;settled=true;e?reject(Error(e)):resolve(v);};
   const headers={'content-type':'application/json','accept':'application/json',...(material.value?{authorization:'Bearer '+material.value}:{})};
   const req=(url.protocol==='https:'?httpsRequest:httpRequest)(url,{method,path,headers,agent:false,signal,lookup:(_host,_opts,cb)=>cb(null,address,4)},res=>{
    if(res.socket.remoteAddress!==address&&res.socket.remoteAddress!=='::ffff:'+address){res.destroy();done('MODEL_CONNECTION_PEER_DENIED');return;}
    if(res.statusCode>=300&&res.statusCode<400){res.destroy();done('MODEL_CONNECTION_REDIRECT_DENIED');return;}
    const chunks=[];let size=0;res.on('data',chunk=>{size+=chunk.length;if(size>65536){res.destroy();done('MODEL_CONNECTION_RESPONSE_SIZE_DENIED');}else chunks.push(chunk);});res.on('error',()=>done('MODEL_CONNECTION_TRANSPORT_UNKNOWN'));res.on('end',()=>{
     let data=null;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{}
     if(res.statusCode===200&&(!/^application\/json(?:\s*;|$)/i.test(res.headers['content-type']??'')||!data||typeof data!=='object'||Array.isArray(data))){done('MODEL_CONNECTION_RESPONSE_DENIED');return;}
     done(null,{status:res.statusCode,data});
    });
   });req.on('error',()=>done(signal.aborted?'MODEL_CONNECTION_TIMEOUT':'MODEL_CONNECTION_TRANSPORT_UNKNOWN'));req.end(body===null?undefined:JSON.stringify(body));
  });
 }
 async function providerCall(bound,signal,authorize,limits){
  limits=validateModelConnectionLimitsV1(limits);
  if(summary.evidenceClass!=='SYNTHETIC_ONLY'){if(!pricing)fail('MODEL_CONNECTION_PRICING_DENIED');const maximum=(BigInt(Buffer.byteLength(JSON.stringify(bound.request),'utf8'))*BigInt(pricing.inputMicrosPerMillionTokens)+BigInt(limits.maxTokens)*BigInt(pricing.outputMicrosPerMillionTokens)+999999n)/1000000n;if(maximum>BigInt(limits.maxCostMicros))fail('MODEL_CONNECTION_PRICE_BOUND_DENIED');}
  const r=await exchange('POST','/v1/chat/completions',bound.request,signal,authorize);
  if(r.status!==200||r.data.model!==summary.model)fail('MODEL_CONNECTION_MODEL_ID_DENIED');
  const data=r.data,msg=data.choices?.[0]?.message,u=data.usage;
  const credential=secret().value;if(credential&&JSON.stringify(data).includes(credential))fail('MODEL_CONNECTION_SECRET_ECHO_DENIED');
  if(!msg||typeof msg.content!=='string'||!u||!Number.isSafeInteger(u.prompt_tokens)||u.prompt_tokens<0||!Number.isSafeInteger(u.completion_tokens)||u.completion_tokens<0)fail('MODEL_CONNECTION_USAGE_UNKNOWN');
  const toolCalls=(msg.tool_calls??[]).map(t=>{if(!t||typeof t.id!=='string'||!/^tool:[a-z0-9._-]{3,80}$/.test(t.id)||t.type!=='function'||typeof t.function?.name!=='string'||typeof t.function.arguments!=='string')fail('MODEL_CONNECTION_TOOL_FORMAT_DENIED');let args;try{args=JSON.parse(t.function.arguments);}catch{fail('MODEL_CONNECTION_TOOL_FORMAT_DENIED');}return {id:t.id,name:t.function.name,arguments:args};});
  let costMicros=0;if(summary.evidenceClass!=='SYNTHETIC_ONLY'){if(!pricing)fail('MODEL_CONNECTION_USAGE_UNKNOWN');costMicros=Math.ceil((u.prompt_tokens*pricing.inputMicrosPerMillionTokens+u.completion_tokens*pricing.outputMicrosPerMillionTokens)/1000000);if(!Number.isSafeInteger(costMicros))fail('MODEL_CONNECTION_USAGE_UNKNOWN');}
  return {contentType:'text/plain',text:msg.content,toolCalls,usage:{inputTokens:u.prompt_tokens,outputTokens:u.completion_tokens,costMicros}};
 }
 const snapshot=()=>{let fingerprint=null,available=true;try{fingerprint=secret().fingerprint;}catch{available=false;}return {summary:{...summary,selectable:summary.selectable&&available,availability:{...summary.availability,auth:summary.availability.auth&&available}},secretFingerprint:fingerprint};};
 return Object.freeze({snapshot,exchange,providerCall,secretFingerprint:()=>secret().fingerprint,productGrant:grant===null?null:structuredClone(grant),pricing:pricing===null?null:structuredClone(pricing),targetDigest:sha(JSON.stringify(target)),summary});
}
