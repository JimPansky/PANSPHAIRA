// Direct loopback-only local contract transport; Node http does not use ambient proxies.
// This executes no selected FiBu adapter and exposes no payment route or credentials.
import {request} from 'node:http';
import {capturePan519ContractDispatch,recordPan519ContractReadback} from './finance-handoff.mjs';
function boundedRequest(url,method,body,timeoutMs){
 return new Promise((resolve,reject)=>{
  let timer;const req=request(url,{method,headers:{accept:'application/json',...(body?{'content-type':'application/json','content-length':Buffer.byteLength(body)}:{})}},res=>{
   const chunks=[];let bytes=0;if(res.statusCode!==200&&res.statusCode!==202){res.resume();req.destroy(Error('PAN519_CONTRACT_RESPONSE_STATUS_UNKNOWN'));return;}
   res.on('data',chunk=>{bytes+=chunk.length;if(bytes>32768){req.destroy(Error('PAN519_CONTRACT_RESPONSE_BOUND_DENIED'));return;}chunks.push(chunk);});
   res.once('error',reject);res.once('end',()=>{clearTimeout(timer);resolve({status:res.statusCode,text:Buffer.concat(chunks).toString('utf8')});});
  });
  req.once('error',error=>{clearTimeout(timer);reject(error);});timer=setTimeout(()=>req.destroy(Error('PAN519_CONTRACT_REQUEST_TIMEOUT_UNKNOWN')),timeoutMs);req.end(body);
 });
}
export async function executePan519ContractTransport({root,owner,endpoint,businessKey,timeoutMs=1000}){
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<10||timeoutMs>5000)throw Error('PAN519_CONTRACT_TIMEOUT_BOUND_DENIED');
 const captured=capturePan519ContractDispatch({root,owner,endpoint,businessKey}),boundary={scope:'LOCAL_SYNTHETIC_CONTRACT_ONLY',realTargetSandboxQualified:false,paymentDispatchAuthorized:false};
 if(captured.firstAttempt){
  const body=JSON.stringify({schemaVersion:'pansphaira.pan519/contract-handoff/v1',businessKey,document:captured.document,handedOffAt:captured.handedOffAt});if(Buffer.byteLength(body)>32768)throw Error('PAN519_CONTRACT_REQUEST_BOUND_DENIED');
  try{await boundedRequest(endpoint+'/handoffs','POST',body,timeoutMs);return {outcome:'HANDOFF_ACKNOWLEDGED_READBACK_REQUIRED',businessKey,newDispatchAttempted:true,...boundary};}
  catch{return {outcome:'UNKNOWN_TARGET_OUTCOME',businessKey,newDispatchAttempted:true,durableUnknownFence:true,...boundary};}
 }
 let response;
 try{response=await boundedRequest(endpoint+'/readbacks/'+businessKey,'GET',null,timeoutMs);}
 catch{return {outcome:'UNKNOWN_READBACK_NO_REDISPATCH',businessKey,newDispatchAttempted:false,...boundary};}
 let readback;try{readback=JSON.parse(response.text);}catch{throw Error('PAN519_CONTRACT_JSON_READBACK_DENIED');}
 // Transport success remains data. The native recorder validates exact tenant,
 // document/source, currency, reference, timestamps and complete allocation bounds.
 const recorded=recordPan519ContractReadback({root,owner,readback});
 return {outcome:readback.booking.state==='POSTED'?'EXACT_CONTRACT_READBACK_RECONCILED_NO_REDISPATCH':'CONTRACT_READBACK_OBSERVED_UNKNOWN',businessKey,newDispatchAttempted:false,observationDigest:recorded.receipt.observationDigest,...boundary};
}
