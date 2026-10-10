// Original #565 minimal owner: existing session authority, personal-profile
// metadata attachment, ModelAccessBroker and native resource-budget ledger.
// No credential store, general controller, worker/provider config or fallback.
import {createHash,randomBytes} from 'node:crypto';
import {join} from 'node:path';
import {canonicalJson} from '../../dist/packages/contracts/src/canonical-json.js';
import {ModelAccessBrokerV1} from '../../dist/packages/contracts/src/model-access-broker.js';
import {modelConnectionClosedV1 as exact,modelConnectionArrayV1,validateModelConnectionReadbackV1,validateModelConnectionLimitsV1,MODEL_CONNECTION_PHASES_V1} from '../../dist/packages/contracts/src/workspace-model-connection-v1.js';
import {isProtectedSessionAdapterV1} from '../pan527/origin-session-adapter.mjs';
import {isBrowserProfileStoreV1} from '../pan543/profile-store.mjs';
import {createResourceBudgetStoreV1} from '../../demo/runtime/atomic-resource-budget.mjs';
import {bindModelConnectionTransportV1} from './connection-transport.mjs';
import {isCompletedBrokerToolFeedbackV1} from '../pan575/broker-tool-feedback.mjs';
const feedbackModels=new WeakMap();
const owned=new WeakMap(),hash=v=>createHash('sha256').update(canonicalJson(v)).digest('hex'),fail=(c='MODEL_CONNECTION_INPUT_DENIED')=>{throw Error(c);};
export const MODEL_CONNECTION_TEST_TEXT_V1='Public synthetic connection qualification only; return a short text. No customer data, no tool execution and no authority.';
export const MODEL_CONNECTION_TEST_DATA_DIGEST_V1=hash(MODEL_CONNECTION_TEST_TEXT_V1);
const emptyChecks=()=>Object.fromEntries(MODEL_CONNECTION_PHASES_V1.map(p=>[p,{state:'NOT_RUN',checkedAtMs:null,identityDigest:null,reason:'NOT_EXECUTED'}]));
const freeze=v=>{if(v&&typeof v==='object'){for(const c of Object.values(v))freeze(c);Object.freeze(v);}return v;};
export function createNativeModelConnectionV1(value){
 const o=exact(value,['sessions','profiles','root','connections']);
 if(!isProtectedSessionAdapterV1(o.sessions,o.sessions?.binding?.tenantId)||!isBrowserProfileStoreV1(o.profiles,o.root)||!Array.isArray(o.connections)||o.connections.length>8)fail('MODEL_CONNECTION_OWNER_DENIED');
 const {sessions,profiles,root}=o,transports=modelConnectionArrayV1(o.connections,8).map(bindModelConnectionTransportV1),map=new Map(transports.map(t=>[t.summary.connectionId,t]));
 if(map.size!==transports.length)fail('MODEL_CONNECTION_OWNER_DENIED');
 const ledgers=new Map(),busy=new Set(),controllers=new Set();let closed=false;
 for(const t of transports)if(t.productGrant!==null){validateModelConnectionLimitsV1(t.productGrant.limits);if(t.productGrant.testDataDigest!==MODEL_CONNECTION_TEST_DATA_DIGEST_V1||!Number.isSafeInteger(t.productGrant.expiresAtMs)||t.productGrant.expiresAtMs<=Date.now())fail('MODEL_CONNECTION_PRODUCT_CONSENT_DENIED');}
 function principal(headers,mutation=false){
  if(closed)fail('MODEL_CONNECTION_OWNER_CLOSED');const p=sessions.authenticate(headers);
  const pair=headers.cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith('__Host-pan527-session='));
  const sessionId='session:'+createHash('sha256').update(pair).digest('hex');
  if(headers['x-pan565-session']!==sessionId||mutation&&headers.origin!==sessions.origin||headers.origin!==undefined&&headers.origin!==sessions.origin)fail('MODEL_CONNECTION_SCOPE_DENIED');
  return {p,sessionId,key:hash({tenantId:p.tenantId,subjectId:p.subjectId,instanceId:p.instanceId,generation:p.generation})};
 }
 const identity=t=>hash({summary:t.snapshot().summary,targetDigest:t.targetDigest,pricing:t.pricing});
 function current(a,t,row,headers,mutation=true){
  const b=principal(headers,mutation),latest=profiles.readModelConnection(b.p),snap=t.snapshot();
  if(b.sessionId!==a.sessionId||b.key!==a.key||latest.revision!==row.revision||latest.state?.connectionId!==t.summary.connectionId||latest.state.identityDigest!==identity(t)||latest.state.secretFingerprint!==snap.secretFingerprint||!snap.summary.selectable)fail('MODEL_CONNECTION_STALE_DENIED');return latest;
 }
 function checkFresh(c,d){return c.state==='PASS'&&c.identityDigest===d&&c.checkedAtMs!==null&&Date.now()-c.checkedAtMs<60000;}
 function ledger(a,t,d){const key=a.key+':'+d;if(!ledgers.has(key)){if(ledgers.size>=128)fail('MODEL_CONNECTION_CAPACITY_DENIED');ledgers.set(key,createResourceBudgetStoreV1({optIn:true,stateRoot:join(root,'native-model-budget-'+hash(key)),tenantId:'tenant:'+a.p.tenantId,bindingDigest:hash({schemaVersion:'pansphaira.model-connection-budget/v1',principalKey:a.key,identityDigest:d}),limits:{modelUnits:100000,runtimeUnits:3}}));}return ledgers.get(key);}
 // Consent is session-bound and tied to the exact current owner grant. Grant
 // changes do not change route/ledger identity and cannot reset prior usage.
 function grantFresh(a,t,g,d,purpose='purpose:ui-connection-probe'){const owner=t.productGrant;return !!g&&!!owner&&(owner.allowedPurposes??['purpose:ui-connection-probe']).includes(purpose)&&(g.purpose??'purpose:ui-connection-probe')===purpose&&g.identityDigest===d&&g.sessionId===a.sessionId&&g.ownerGrantDigest===hash(owner)&&g.expiresAtMs>Date.now()&&owner.expiresAtMs>Date.now()&&g.testDataDigest===owner.testDataDigest&&Object.keys(owner.limits).every(k=>Number.isSafeInteger(g.limits[k])&&g.limits[k]<=owner.limits[k]);}
 function capacity(a,t,d,limits){const owner=t.productGrant;if(!owner)return false;const snapshot=ledger(a,t,d).snapshot();return snapshot.model.committedUnits+limits.maxCostMicros<=owner.limits.maxCostMicros&&snapshot.runtime.committedUnits<owner.limits.maxRequests;}
 function authorizeInference(a,t,row,headers){current(a,t,row,headers);if(!grantFresh(a,t,row.state.grant,row.state.identityDigest)||!MODEL_CONNECTION_PHASES_V1.slice(0,3).every(p=>checkFresh(row.state.checks[p],row.state.identityDigest)))fail('MODEL_CONNECTION_CONSENT_EXPIRED');}
 function projection(headers){
  const a=principal(headers),row=profiles.readModelConnection(a.p),t=map.get(row.state?.connectionId),d=t?identity(t):null,snap=t?.snapshot(),valid=!!t&&snap.summary.selectable&&row.state.identityDigest===d&&row.state.secretFingerprint===snap.secretFingerprint;
  let checks=row.state?.checks??emptyChecks(),reason=row.state?'REFERENCE_SELECTED_NOT_INFERENCE':'NO_CONNECTION_SELECTED';
  if(!valid&&row.state){checks=Object.fromEntries(MODEL_CONNECTION_PHASES_V1.map(p=>[p,{...checks[p],state:checks[p].state==='UNKNOWN_USAGE'?'UNKNOWN_USAGE':checks[p].state==='NOT_RUN'?'NOT_RUN':'STALE',reason:checks[p].state==='UNKNOWN_USAGE'?'UNKNOWN_USAGE_RETAINED':'IDENTITY_OR_SECRET_CHANGED'}]));reason='IDENTITY_OR_SECRET_CHANGED';}
  else if(valid){checks=Object.fromEntries(MODEL_CONNECTION_PHASES_V1.map(p=>[p,{...checks[p],...(checks[p].state==='PASS'&&!checkFresh(checks[p],d)?{state:'STALE',reason:'CHECK_EXPIRED'}:{})}]));}
  const grant=row.state?.grant,fresh=valid&&grantFresh(a,t,grant,d),eligible=valid&&t.productGrant&&t.productGrant.expiresAtMs>Date.now()&&(t.pricing||t.summary.evidenceClass==='SYNTHETIC_ONLY'),offeredLimits=fresh?grant.limits:t?.productGrant?.limits,available=!!eligible&&capacity(a,t,d,offeredLimits);
  const held=row.state?.lastOperation?ledger(a,null,row.state.identityDigest).read(row.state.lastOperation):null;
  if(held&&held.state==='UNKNOWN_USAGE'){checks={...checks,INFERENCE:{state:'UNKNOWN_USAGE',checkedAtMs:checks.INFERENCE.checkedAtMs,identityDigest:row.state.identityDigest,reason:'UNKNOWN_USAGE_RETAINED'}};reason='UNKNOWN_USAGE_RETAINED';}
  if(eligible&&!available&&reason!=='UNKNOWN_USAGE_RETAINED')reason='BUDGET_EXHAUSTED';
  const ready=!!fresh&&available&&MODEL_CONNECTION_PHASES_V1.slice(0,3).every(p=>checkFresh(checks[p],d))&&checks.INFERENCE.state!=='UNKNOWN_USAGE'&&!row.state.lastOperation;
  const synthetic=t?.summary.evidenceClass==='SYNTHETIC_ONLY',inferenceOffer=available?{limits:offeredLimits,testDataDigest:t.productGrant.testDataDigest,expiresAtMs:t.productGrant.expiresAtMs,currency:synthetic?'NONE':t.pricing.currency,pricingClass:synthetic?'CODE_OWNED_SYNTHETIC_ZERO_PRICE':'OWNER_BOUND_FIXED_PRICE',priceRevision:synthetic?null:t.pricing.revision}:null;
  return freeze(validateModelConnectionReadbackV1({inferenceOffer,schemaVersion:'pansphaira.workspace-model-connection/readback/v1',binding:{tenantId:a.p.tenantId,subjectId:a.p.subjectId,instanceId:a.p.instanceId,generation:a.p.generation,sessionId:a.sessionId},revision:row.revision,persisted:row.persisted,connections:transports.map(t=>t.snapshot().summary),selectedConnectionId:t?row.state.connectionId:null,identityDigest:d,checks,consent:!grant?'NOT_GRANTED':fresh?'BOUNDED_ONCE':'EXPIRED_OR_STALE',readyForInference:ready,realModelAcceptance:false,reason}));
 }
 function write(a,t,row,state,headers){return profiles.writeModelConnection(a.p,row.revision,state,()=>{current(a,t,row,headers);return true;});}
 function select(headers,value){
  const c=exact(value,['schemaVersion','expectedRevision','connectionId']),a=principal(headers,true),row=profiles.readModelConnection(a.p),t=map.get(c.connectionId);
  if(c.schemaVersion!=='pansphaira.workspace-model-connection/select/v1'||!Number.isSafeInteger(c.expectedRevision)||c.expectedRevision!==row.revision||!t)fail('MODEL_CONNECTION_REVISION_CONFLICT');
  const snap=t.snapshot(),d=identity(t);if(!snap.summary.selectable||Object.values(snap.summary.availability).some(v=>!v))fail('MODEL_CONNECTION_UNAVAILABLE');
  if(row.state?.lastOperation&&ledger(a,null,row.state.identityDigest).read(row.state.lastOperation)?.state==='UNKNOWN_USAGE')fail('MODEL_CONNECTION_UNKNOWN_USAGE_RETAINED');
  profiles.writeModelConnection(a.p,row.revision,{connectionId:t.summary.connectionId,identityDigest:d,secretFingerprint:snap.secretFingerprint,checks:emptyChecks(),grant:null,lastOperation:null},()=>{const b=principal(headers,true);return b.key===a.key&&b.sessionId===a.sessionId&&identity(t)===d&&t.secretFingerprint()===snap.secretFingerprint;});return projection(headers);
 }
 function consent(headers,value){
  const c=exact(value,['schemaVersion','expectedRevision','identityDigest','limits','testDataDigest','confirm']),a=principal(headers,true),row=profiles.readModelConnection(a.p),t=map.get(row.state?.connectionId);
  if(c.schemaVersion!=='pansphaira.workspace-model-connection/consent/v1'||c.confirm!==true||!t||c.expectedRevision!==row.revision||c.identityDigest!==row.state.identityDigest||c.testDataDigest!==MODEL_CONNECTION_TEST_DATA_DIGEST_V1)fail('MODEL_CONNECTION_CONSENT_DENIED');
  current(a,t,row,headers);const limits=validateModelConnectionLimitsV1(c.limits),g=t.productGrant;
  if(!g||!(g.allowedPurposes??['purpose:ui-connection-probe']).includes('purpose:ui-connection-probe')||g.expiresAtMs<=Date.now()||Object.keys(limits).some(k=>limits[k]>g.limits[k])||!t.pricing&&t.summary.evidenceClass!=='SYNTHETIC_ONLY'||row.state.lastOperation||!MODEL_CONNECTION_PHASES_V1.slice(0,3).every(p=>checkFresh(row.state.checks[p],row.state.identityDigest)))fail('MODEL_CONNECTION_PRODUCT_CONSENT_DENIED');
  if(!capacity(a,t,row.state.identityDigest,limits))fail('MODEL_CONNECTION_BUDGET_EXHAUSTED');
  write(a,t,row,{...row.state,grant:{identityDigest:c.identityDigest,sessionId:a.sessionId,ownerGrantDigest:hash(g),limits,expiresAtMs:Math.min(Date.now()+30000,g.expiresAtMs),consentId:'consent:'+randomBytes(24).toString('hex'),testDataDigest:c.testDataDigest}},headers);return projection(headers);
 }
 async function probe(headers,value){
  const c=exact(value,['schemaVersion','expectedRevision','identityDigest','phase']),a=principal(headers,true),row=profiles.readModelConnection(a.p),t=map.get(row.state?.connectionId);
  if(c.schemaVersion!=='pansphaira.workspace-model-connection/probe/v1'||!t||c.expectedRevision!==row.revision||c.identityDigest!==row.state.identityDigest||!MODEL_CONNECTION_PHASES_V1.includes(c.phase))fail('MODEL_CONNECTION_INPUT_DENIED');
  current(a,t,row,headers);if(busy.has(a.key))fail('MODEL_CONNECTION_BUSY');busy.add(a.key);
  try{
   if(c.phase==='INFERENCE')return await infer(a,t,row,headers);
   const previous=c.phase==='MODEL_AVAILABILITY'?'AUTHENTICATION':c.phase==='AUTHENTICATION'?'REACHABILITY':null;
   if(previous&&!checkFresh(row.state.checks[previous],row.state.identityDigest))fail('MODEL_CONNECTION_PHASE_ORDER_DENIED');
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);controllers.add(controller);let state='FAILED',reason='TRANSPORT_NOT_CONFIRMED';
   try{const r=await t.exchange('GET','/v1/models',null,controller.signal,()=>current(a,t,row,headers),c.phase!=='REACHABILITY');
    if(c.phase==='REACHABILITY'){state=[200,401,403].includes(r.status)?'PASS':'FAILED';reason=state==='PASS'?'TARGET_REACHED_NOT_AUTH_OR_INFERENCE':'TARGET_UNAVAILABLE';}
    else if(c.phase==='AUTHENTICATION'){state=r.status===200?'PASS':'FAILED';reason=state==='PASS'?'AUTHENTICATION_CONFIRMED_NOT_INFERENCE':'AUTHENTICATION_FAILED';}
    else{state=r.status===200&&Array.isArray(r.data?.data)&&r.data.data.some(m=>m&&m.id===t.summary.model)?'PASS':'FAILED';reason=state==='PASS'?'MODEL_LISTED_NOT_INFERENCE':'MODEL_NOT_AVAILABLE';}
   }catch{reason=controller.signal.aborted?'PROBE_TIMEOUT':'TRANSPORT_NOT_CONFIRMED';}finally{clearTimeout(timer);controllers.delete(controller);}
   current(a,t,row,headers);const checks={...row.state.checks,[c.phase]:{state,checkedAtMs:Date.now(),identityDigest:row.state.identityDigest,reason}};
   const index=MODEL_CONNECTION_PHASES_V1.indexOf(c.phase);for(const p of MODEL_CONNECTION_PHASES_V1.slice(index+1))checks[p]={state:'NOT_RUN',checkedAtMs:null,identityDigest:null,reason:'PREREQUISITE_RECHECKED'};
   write(a,t,row,{...row.state,checks,grant:null},headers);return projection(headers);
  }finally{busy.delete(a.key);}
 }
 async function infer(a,t,row,headers){
  const state=row.state,g=state.grant,d=state.identityDigest;
  if(!projection(headers).readyForInference||!g)fail('MODEL_CONNECTION_PRODUCT_CONSENT_DENIED');
  const s=ledger(a,t,d);if(!capacity(a,t,d,g.limits))fail('MODEL_CONNECTION_BUDGET_EXHAUSTED');const operationId='operation:mc-'+randomBytes(20).toString('hex'),requestDigest=hash({identityDigest:d,grant:g,operationId});
  // One grant/operation, persisted BEFORE dispatch. A crash leaves no reusable
  // consent. Unknown holds remain in the existing SQLite ledger across reopen.
  write(a,t,row,{...state,lastOperation:operationId},headers);let active=profiles.readModelConnection(a.p);current(a,t,active,headers);
  s.reserve({operationId,requestDigest,modelUnits:g.limits.maxCostMicros,runtimeUnits:1});current(a,t,active,headers);
  const fence=s.markUnknownUsage(operationId);if(!fence.dispatchGranted)fail('MODEL_CONNECTION_UNKNOWN_USAGE_RETAINED');
  const lifetime=new AbortController();controllers.add(lifetime);let attempted=false,checked={state:'UNKNOWN_USAGE',checkedAtMs:Date.now(),identityDigest:d,reason:'UNKNOWN_USAGE_RETAINED'};
  try{
   const policy={schemaVersion:'chimpmaera.model/model-access-policy/v1',routes:[{routeId:t.summary.routeId,provider:t.summary.provider,model:t.summary.model,protocol:t.summary.protocol,credentialHandle:t.summary.secretReference??'credential-handle:local-no-auth',allowedTenants:['tenant:'+a.p.tenantId],allowedPurposes:['purpose:ui-connection-probe'],optionalFields:[],attachmentMediaTypes:[]}],workloadIdentities:['workload:ui-view-assistant'],userIdentities:['user:workspace-personal-view'],maxBudget:{maxInputBytes:g.limits.maxInputBytes,maxOutputBytes:g.limits.maxOutputBytes,maxTokens:g.limits.maxTokens,maxCostMicros:g.limits.maxCostMicros,maxRequests:1,timeoutMs:Math.max(1,Math.min(g.limits.maxTimeMs,g.expiresAtMs-Date.now()))}};
   const request={schemaVersion:'chimpmaera.model/model-request/v1',workloadIdentity:policy.workloadIdentities[0],userIdentity:policy.userIdentities[0],tenant:'tenant:'+a.p.tenantId,purpose:'purpose:ui-connection-probe',delegationDigest:requestDigest,operationId,correlationId:'correlation:'+operationId.slice(10),routeId:t.summary.routeId,provider:t.summary.provider,model:t.summary.model,protocol:t.summary.protocol,dataClassification:'PUBLIC',trustClass:'UNTRUSTED_AGENT_INPUT',text:MODEL_CONNECTION_TEST_TEXT_V1,attachments:[],tools:[],structuredOutput:null,optionalFields:{},budget:policy.maxBudget};
   const result=await new ModelAccessBrokerV1(policy).invoke(request,async(bound,signal)=>{authorizeInference(a,t,active,headers);attempted=true;return t.providerCall(bound,AbortSignal.any([signal,lifetime.signal]),()=>authorizeInference(a,t,active,headers),g.limits);});
   if(result.outcome==='ALLOW'){current(a,t,active,headers);checked={state:'PASS',checkedAtMs:Date.now(),identityDigest:d,reason:t.summary.evidenceClass==='SYNTHETIC_ONLY'?'SYNTHETIC_INFERENCE_FORMAT_ONLY':'BOUNDED_INFERENCE_OBSERVED_NOT_TOOL_LOOP'};const observed={operationId,identityDigest:d,check:checked,usage:result.response.usage,realModelAcceptance:false};
    s.settle(s.ownerCompletionEvidence({operationId,requestDigest,modelUnits:observed.usage.costMicros,runtimeUnits:1,evidenceDigest:hash(observed)}),observed,()=>{authorizeInference(a,t,active,headers);return true;});
   }else if(!attempted){const observed={operationId,identityDigest:d,noDispatchWitnessed:true};s.settle(s.ownerCompletionEvidence({operationId,requestDigest,modelUnits:0,runtimeUnits:0,evidenceDigest:hash(observed)}),observed,()=>{current(a,t,active,headers);return true;});checked={state:'FAILED',checkedAtMs:Date.now(),identityDigest:d,reason:'NO_DISPATCH'};}
  }catch{ /* No raw transport error, content, secret or invented zero usage. */ }finally{controllers.delete(lifetime);}
  current(a,t,active,headers);active=write(a,t,active,{...active.state,grant:null,checks:{...active.state.checks,INFERENCE:checked}},headers);return projection(headers);
 }
 // Owner-local explicit reconciliation can derive zero price only for this
 // code-owned SYNTHETIC_ONLY route. No caller amount/digest can settle a real
 // unknown bill; absent a qualified independent usage reader it stays held.
 function reconcile(headers,value){const c=exact(value,['operationId','identityDigest']),a=principal(headers,true),row=profiles.readModelConnection(a.p),t=map.get(row.state?.connectionId);if(!t||c.operationId!==row.state.lastOperation||c.identityDigest!==row.state.identityDigest)fail('MODEL_CONNECTION_RECONCILIATION_DENIED');current(a,t,row,headers);if(t.summary.evidenceClass!=='SYNTHETIC_ONLY')fail('MODEL_CONNECTION_USAGE_ORACLE_UNAVAILABLE');const s=ledger(a,t,c.identityDigest),held=s.read(c.operationId);if(!held||held.state!=='UNKNOWN_USAGE')fail('MODEL_CONNECTION_RECONCILIATION_DENIED');const observed={operationId:c.operationId,identityDigest:c.identityDigest,pricingClass:'CODE_OWNED_SYNTHETIC_ZERO_PRICE',realModelAcceptance:false};s.settle(s.ownerCompletionEvidence({operationId:c.operationId,requestDigest:held.request_digest,modelUnits:0,runtimeUnits:held.runtime_units,evidenceDigest:hash(observed)}),observed,()=>{current(a,t,row,headers);return true;});write(a,t,row,{...row.state,grant:null,checks:{...row.state.checks,INFERENCE:{state:'FAILED',checkedAtMs:Date.now(),identityDigest:c.identityDigest,reason:'SYNTHETIC_ZERO_PRICE_RECONCILED_NO_MODEL_PASS'}}},headers);return projection(headers);}
 // Native-only feedback admission reuses this owner, profile grant and COST
 // ledger. A probe consent, client model label or callback is never admitted.
 const feedbackTickets=new Map();
 function workspaceHeaders(headers){sessions.authenticate(headers);if(Object.hasOwn(headers,'x-pan565-session'))return headers;const pair=headers.cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith('__Host-pan527-session='));return {...headers,'x-pan565-session':'session:'+createHash('sha256').update(pair).digest('hex')};}
 function feedbackCurrent(a,t,row,headers,offer){current(a,t,row,headers);const g=t.productGrant;if(!g?.allowedPurposes?.includes('purpose:ui-view-proposal')||hash(g)!==offer.ownerGrantDigest||identity(t)!==offer.identityDigest||offer.expiresAtMs<=Date.now()||!MODEL_CONNECTION_PHASES_V1.slice(0,3).every(p=>checkFresh(row.state.checks[p],offer.identityDigest)))fail('MODEL_CONNECTION_TASK_CONSENT_DENIED');}
 function prepareFeedback(headers,value){
  headers=workspaceHeaders(headers);const c=exact(value,['runId','payloadDigest','expiresAtMs']),a=principal(headers,true),row=profiles.readModelConnection(a.p),t=map.get(row.state?.connectionId),g=t?.productGrant;
  if(typeof c.runId!=='string'||!/^operation:ui-[a-f0-9]{48}$/.test(c.runId)||typeof c.payloadDigest!=='string'||!/^[a-f0-9]{64}$/.test(c.payloadDigest)||!Number.isSafeInteger(c.expiresAtMs)||c.expiresAtMs<=Date.now()||!t||!g?.allowedPurposes?.includes('purpose:ui-view-proposal')||g.expiresAtMs<=Date.now()||row.state.lastOperation||busy.has(a.key)||!t.pricing&&t.summary.evidenceClass!=='SYNTHETIC_ONLY')fail('MODEL_CONNECTION_TASK_CONSENT_DENIED');
  current(a,t,row,headers);if(!MODEL_CONNECTION_PHASES_V1.slice(0,3).every(p=>checkFresh(row.state.checks[p],row.state.identityDigest)))fail('MODEL_CONNECTION_TASK_PREREQUISITES_DENIED');
  const limits=validateModelConnectionLimitsV1(g.limits),budgetSnapshot=ledger(a,t,row.state.identityDigest).snapshot();if(limits.maxTurns<2||limits.maxTools<2||limits.maxRequests<2||budgetSnapshot.model.committedUnits+limits.maxCostMicros>g.limits.maxCostMicros||budgetSnapshot.runtime.committedUnits+limits.maxRequests>g.limits.maxRequests)fail('MODEL_CONNECTION_BUDGET_EXHAUSTED');
  const expiresAtMs=Math.min(Date.now()+30000,g.expiresAtMs,c.expiresAtMs),synthetic=t.summary.evidenceClass==='SYNTHETIC_ONLY';
  const base={schemaVersion:'pansphaira.workspace-model-feedback/offer/v1',purpose:'purpose:ui-view-proposal',payloadDigest:c.payloadDigest,identityDigest:row.state.identityDigest,ownerGrantDigest:hash(g),routeId:t.summary.routeId,provider:t.summary.provider,model:t.summary.model,evidenceClass:t.summary.evidenceClass,limits,currency:synthetic?'NONE':t.pricing.currency,pricingClass:synthetic?'CODE_OWNED_SYNTHETIC_ZERO_PRICE':'OWNER_BOUND_FIXED_PRICE',priceRevision:synthetic?null:t.pricing.revision,expiresAtMs},offer=freeze({...base,offerDigest:hash(base)});
  const policy=freeze({schemaVersion:'chimpmaera.model/model-access-policy/v1',routes:[{routeId:t.summary.routeId,provider:t.summary.provider,model:t.summary.model,protocol:t.summary.protocol,credentialHandle:t.summary.secretReference??'credential-handle:local-no-auth',allowedTenants:['tenant:'+a.p.tenantId],allowedPurposes:['purpose:ui-view-proposal'],optionalFields:[],attachmentMediaTypes:[]}],workloadIdentities:['workload:ui-view-assistant'],userIdentities:['user:workspace-personal-view'],maxBudget:{maxInputBytes:limits.maxInputBytes,maxOutputBytes:limits.maxOutputBytes,maxTokens:limits.maxTokens,maxCostMicros:limits.maxCostMicros,maxRequests:limits.maxRequests,timeoutMs:limits.maxTimeMs}});
  for(const[k,v]of feedbackTickets)if(v.offer.expiresAtMs<=Date.now())feedbackTickets.delete(k);if(feedbackTickets.size>=128)fail('MODEL_CONNECTION_CAPACITY_DENIED');const ticket=Object.freeze({});feedbackTickets.set(ticket,{a,t,row,c,offer,policy,used:false});return {ticket,offer,policy};
 }
 async function runFeedback(headers,ticket,confirmation,execute,verifyTask){
  headers=workspaceHeaders(headers);const r=feedbackTickets.get(ticket),c=exact(confirmation,['offerDigest','confirm']);if(!r||r.used||c.confirm!==true||c.offerDigest!==r.offer.offerDigest||typeof execute!=='function'||typeof verifyTask!=='function')fail('MODEL_CONNECTION_TASK_CONSENT_DENIED');const {a,t,row,offer,policy}=r;
  feedbackCurrent(a,t,row,headers,offer);if(verifyTask()!==true||busy.has(a.key))fail('MODEL_CONNECTION_TASK_CONSENT_DENIED');
  const s=ledger(a,t,offer.identityDigest),b=s.snapshot();if(b.model.committedUnits+offer.limits.maxCostMicros>t.productGrant.limits.maxCostMicros||b.runtime.committedUnits+offer.limits.maxRequests>t.productGrant.limits.maxRequests)fail('MODEL_CONNECTION_BUDGET_EXHAUSTED');
  r.used=true;busy.add(a.key);const lifetime=new AbortController();controllers.add(lifetime);let active=row,loop=null;
  const operationId=r.c.runId,requestDigest=hash({operationId,offer}),g={identityDigest:offer.identityDigest,sessionId:a.sessionId,ownerGrantDigest:offer.ownerGrantDigest,limits:offer.limits,expiresAtMs:offer.expiresAtMs,consentId:'consent:'+randomBytes(24).toString('hex'),testDataDigest:t.productGrant.testDataDigest,purpose:offer.purpose,payloadDigest:offer.payloadDigest};
  const authorize=()=>{feedbackCurrent(a,t,active,headers,offer);if(lifetime.signal.aborted||!grantFresh(a,t,active.state.grant,offer.identityDigest,offer.purpose)||active.state.grant.payloadDigest!==offer.payloadDigest||active.state.lastOperation!==operationId||verifyTask()!==true)fail('MODEL_CONNECTION_TASK_CONSENT_DENIED');return true;};
  try{
   active=write(a,t,row,{...row.state,grant:g,lastOperation:operationId},headers);
   s.reserve({operationId,requestDigest,modelUnits:offer.limits.maxCostMicros,runtimeUnits:offer.limits.maxRequests});authorize();const fence=s.markUnknownUsage(operationId);if(!fence.dispatchGranted)fail('MODEL_CONNECTION_UNKNOWN_USAGE_RETAINED');authorize();
   const providerCall=(bound,signal,remaining)=>{authorize();const limits=validateModelConnectionLimitsV1(remaining);if(Object.keys(limits).some(k=>limits[k]>offer.limits[k]))fail('MODEL_CONNECTION_LIMIT_DENIED');return t.providerToolStepCall(bound,AbortSignal.any([signal,lifetime.signal]),authorize,limits);};
   loop=await execute({policy,limits:offer.limits,providerCall,authorize,signal:lifetime.signal});authorize();
   if(isCompletedBrokerToolFeedbackV1(loop)&&loop.actualToolActions===2&&canonicalJson(loop.toolReadbacks.map(v=>v.toolName))===canonicalJson(['ui.view.read','ui.view.propose'])){
    const observed={operationId,identityDigest:offer.identityDigest,payloadDigest:offer.payloadDigest,purpose:offer.purpose,usage:loop.usage,actualRequests:loop.actualRequests,realModelAcceptance:false};s.settle(s.ownerCompletionEvidence({operationId,requestDigest,modelUnits:loop.usage.costMicros,runtimeUnits:loop.actualRequests,evidenceDigest:hash(observed)}),observed,authorize);
   }
  }finally{
   controllers.delete(lifetime);lifetime.abort();busy.delete(a.key);feedbackTickets.delete(ticket);
   if(!closed){try{current(a,t,active,headers);const held=s.read(operationId),ok=held?.state==='SETTLED';write(a,t,active,{...active.state,grant:null,checks:{...active.state.checks,INFERENCE:{state:ok?'PASS':'UNKNOWN_USAGE',checkedAtMs:Date.now(),identityDigest:offer.identityDigest,reason:ok?t.summary.evidenceClass==='SYNTHETIC_ONLY'?'SYNTHETIC_TOOL_FEEDBACK_ONLY':'OWNER_BOUND_TOOL_FEEDBACK_OBSERVED_NOT_MODEL_ACCEPTANCE':'UNKNOWN_USAGE_RETAINED'}}},headers);}catch{/* Stale/revoked owner cannot write. Existing UNKNOWN remains held. */}}
  }
  return loop;
 }
 const owner=Object.freeze({read:projection,select,probe,consent,reconcile,close(){if(closed)return;closed=true;feedbackTickets.clear();for(const c of controllers)c.abort();controllers.clear();for(const l of ledgers.values())l.close();ledgers.clear();owned.delete(owner);}});owned.set(owner,{binding:sessions.binding,profiles,prepareFeedback,runFeedback});return owner;
}
export const isNativeModelConnectionV1=(owner,binding)=>owned.has(owner)&&canonicalJson(owned.get(owner).binding)===canonicalJson(binding);
// These opaque native capabilities are code-owner plumbing, not HTTP fields.
// policy/provider labels copied from this object cannot reproduce its brand.
export function createNativeWorkspaceFeedbackModelV1(owner,binding){if(!isNativeModelConnectionV1(owner,binding))fail('AGENT_NATIVE_MODEL_OWNER_DENIED');const model=Object.freeze({mode:'OWNER_BOUND_PROVIDER',policy:null,providerCall:()=>fail('MODEL_CONNECTION_TASK_ADMISSION_REQUIRED')});feedbackModels.set(model,{owner,binding});return model;}
export const isNativeWorkspaceFeedbackModelV1=(model,binding)=>feedbackModels.has(model)&&isNativeModelConnectionV1(feedbackModels.get(model).owner,binding)&&canonicalJson(feedbackModels.get(model).binding)===canonicalJson(binding);
export function prepareNativeWorkspaceFeedbackV1(model,headers,value){const x=feedbackModels.get(model);if(!x||!isNativeModelConnectionV1(x.owner,x.binding))fail('AGENT_NATIVE_MODEL_OWNER_DENIED');return owned.get(x.owner).prepareFeedback(headers,value);}
export function runNativeWorkspaceFeedbackV1(model,headers,ticket,confirmation,execute,verifyTask){const x=feedbackModels.get(model);if(!x||!isNativeModelConnectionV1(x.owner,x.binding))fail('AGENT_NATIVE_MODEL_OWNER_DENIED');return owned.get(x.owner).runFeedback(headers,ticket,confirmation,execute,verifyTask);}
