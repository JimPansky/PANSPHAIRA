export const MODEL_CONNECTION_SCHEMA_V1 = 'pansphaira.workspace-model-connection/readback/v1' as const;
export const MODEL_CONNECTION_PHASES_V1 = ['REACHABILITY','AUTHENTICATION','MODEL_AVAILABILITY','INFERENCE'] as const;
export type ModelConnectionPhaseV1 = typeof MODEL_CONNECTION_PHASES_V1[number];
export type ModelConnectionCheckStateV1 = 'NOT_RUN'|'PASS'|'FAILED'|'STALE'|'UNKNOWN_USAGE';
export interface ModelConnectionLimitsV1 {readonly maxCostMicros:number;readonly maxTimeMs:number;readonly maxTurns:number;readonly maxTools:number;readonly maxRequests:number;readonly maxTokens:number;readonly maxInputBytes:number;readonly maxOutputBytes:number}
export interface ModelConnectionCheckV1 {readonly state:ModelConnectionCheckStateV1;readonly checkedAtMs:number|null;readonly identityDigest:string|null;readonly reason:string}
export interface ModelConnectionSummaryV1 {
 readonly connectionId:string;readonly routeId:string;readonly provider:string;readonly model:string;readonly protocol:'OPENAI_CHAT_COMPLETIONS';readonly evidenceClass:'SYNTHETIC_ONLY'|'OWNER_BOUND_NOT_QUALIFIED';readonly secretReference:string|null;readonly authMethod:'NONE_LOCAL'|'EXISTING_SECRET_REFERENCE';
 readonly identity:{readonly adapterDigest:string;readonly deploymentId:string;readonly parserDigest:string;readonly configurationRevision:number};
 readonly availability:{readonly runtime:boolean;readonly provider:boolean;readonly auth:boolean;readonly model:boolean;readonly functions:boolean};readonly selectable:boolean;
}
export interface ModelConnectionReadbackV1 {
 readonly inferenceOffer:{readonly limits:ModelConnectionLimitsV1;readonly testDataDigest:string;readonly expiresAtMs:number;readonly currency:string;readonly pricingClass:'CODE_OWNED_SYNTHETIC_ZERO_PRICE'|'OWNER_BOUND_FIXED_PRICE';readonly priceRevision:number|null}|null;
 readonly schemaVersion:typeof MODEL_CONNECTION_SCHEMA_V1;readonly binding:{readonly tenantId:string;readonly subjectId:string;readonly instanceId:string;readonly generation:number;readonly sessionId:string};readonly revision:number;readonly persisted:boolean;readonly connections:readonly ModelConnectionSummaryV1[];readonly selectedConnectionId:string|null;readonly identityDigest:string|null;readonly checks:Readonly<Record<ModelConnectionPhaseV1,ModelConnectionCheckV1>>;readonly consent:'NOT_GRANTED'|'EXPIRED_OR_STALE'|'BOUNDED_ONCE';readonly readyForInference:boolean;readonly realModelAcceptance:false;readonly reason:string;
}
export function modelConnectionClosedV1(value:unknown,keys:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype)throw Error('MODEL_CONNECTION_INPUT_DENIED');
 const ds=Object.getOwnPropertyDescriptors(value);
 if(Reflect.ownKeys(ds).length!==keys.length||keys.some(k=>!Object.hasOwn(ds,k))||Reflect.ownKeys(ds).some(k=>typeof k!=='string')||Object.values(ds).some(d=>!d.enumerable||!('value'in d)))throw Error('MODEL_CONNECTION_INPUT_DENIED');
 return Object.fromEntries(keys.map(k=>[k,ds[k]!.value as unknown]));
}
export function validateModelConnectionLimitsV1(value:unknown):ModelConnectionLimitsV1{
 const r=modelConnectionClosedV1(value,['maxCostMicros','maxTimeMs','maxTurns','maxTools','maxRequests','maxTokens','maxInputBytes','maxOutputBytes']);
 const ceilings={maxCostMicros:100000,maxTimeMs:30000,maxTurns:3,maxTools:2,maxRequests:3,maxTokens:4096,maxInputBytes:65536,maxOutputBytes:65536};
 for(const [k,max]of Object.entries(ceilings))if(!Number.isSafeInteger(r[k])||Number(r[k])<1||Number(r[k])>max)throw Error('MODEL_CONNECTION_LIMIT_DENIED');
 return Object.freeze(r)as unknown as ModelConnectionLimitsV1;
}
export function modelConnectionArrayV1(value:unknown,max:number):readonly unknown[]{
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>max||Reflect.ownKeys(value).length!==value.length+1)throw Error('MODEL_CONNECTION_INPUT_DENIED');
 return Object.freeze(Array.from({length:value.length},(_,index)=>{const d=Object.getOwnPropertyDescriptor(value,String(index));if(!d||!d.enumerable||!('value'in d))throw Error('MODEL_CONNECTION_INPUT_DENIED');return d.value as unknown;}));
}
const id=(v:unknown,prefix:string)=>typeof v==='string'&&new RegExp('^'+prefix+':[a-z0-9][a-z0-9._-]{2,63}$').test(v);
const digest=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const atom=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,95}$/.test(v)&&!/(?:sk-|password|api[_-]?key|access[_-]?token|https?:|\.\.)/i.test(v);
const unsigned=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0;
export function validateModelConnectionSummaryV1(value:unknown):ModelConnectionSummaryV1{
 const r=modelConnectionClosedV1(value,['connectionId','routeId','provider','model','protocol','evidenceClass','secretReference','authMethod','identity','availability','selectable']);
 const i=modelConnectionClosedV1(r.identity,['adapterDigest','deploymentId','parserDigest','configurationRevision']),a=modelConnectionClosedV1(r.availability,['runtime','provider','auth','model','functions']);
 if(!id(r.connectionId,'connection')||!id(r.routeId,'route')||!id(r.provider,'provider')||!atom(r.model)||r.protocol!=='OPENAI_CHAT_COMPLETIONS'||!['SYNTHETIC_ONLY','OWNER_BOUND_NOT_QUALIFIED'].includes(String(r.evidenceClass))||!['NONE_LOCAL','EXISTING_SECRET_REFERENCE'].includes(String(r.authMethod))||r.secretReference!==null&&!id(r.secretReference,'credential-handle')||r.authMethod==='EXISTING_SECRET_REFERENCE'&&r.secretReference===null||r.authMethod==='NONE_LOCAL'&&r.secretReference!==null||!digest(i.adapterDigest)||!atom(i.deploymentId)||!digest(i.parserDigest)||!Number.isSafeInteger(i.configurationRevision)||Number(i.configurationRevision)<1||Object.values(a).some(v=>typeof v!=='boolean')||typeof r.selectable!=='boolean')throw Error('MODEL_CONNECTION_READBACK_DENIED');
 return Object.freeze({...r,identity:Object.freeze(i),availability:Object.freeze(a)})as unknown as ModelConnectionSummaryV1;
}
export function validateModelConnectionReadbackV1(value:unknown):ModelConnectionReadbackV1{
 const r=modelConnectionClosedV1(value,['schemaVersion','binding','revision','persisted','connections','selectedConnectionId','identityDigest','checks','consent','inferenceOffer','readyForInference','realModelAcceptance','reason']),b=modelConnectionClosedV1(r.binding,['tenantId','subjectId','instanceId','generation','sessionId']),checks=modelConnectionClosedV1(r.checks,MODEL_CONNECTION_PHASES_V1);
 if(r.schemaVersion!==MODEL_CONNECTION_SCHEMA_V1||!unsigned(r.revision)||typeof r.persisted!=='boolean'||!Array.isArray(r.connections)||r.connections.length>8||r.selectedConnectionId!==null&&!id(r.selectedConnectionId,'connection')||r.identityDigest!==null&&!digest(r.identityDigest)||!['NOT_GRANTED','EXPIRED_OR_STALE','BOUNDED_ONCE'].includes(String(r.consent))||typeof r.readyForInference!=='boolean'||r.realModelAcceptance!==false||typeof r.reason!=='string'||!/^[A-Z_]{3,96}$/.test(r.reason)||!atom(b.tenantId)||!atom(b.subjectId)||!atom(b.instanceId)||!Number.isSafeInteger(b.generation)||Number(b.generation)<1||typeof b.sessionId!=='string'||!/^session:[a-f0-9]{64}$/.test(b.sessionId))throw Error('MODEL_CONNECTION_READBACK_DENIED');
 if(r.inferenceOffer!==null){const offer=modelConnectionClosedV1(r.inferenceOffer,['limits','testDataDigest','expiresAtMs','currency','pricingClass','priceRevision']);validateModelConnectionLimitsV1(offer.limits);if(!digest(offer.testDataDigest)||!unsigned(offer.expiresAtMs)||!['CODE_OWNED_SYNTHETIC_ZERO_PRICE','OWNER_BOUND_FIXED_PRICE'].includes(String(offer.pricingClass))||offer.pricingClass==='CODE_OWNED_SYNTHETIC_ZERO_PRICE'&&(offer.currency!=='NONE'||offer.priceRevision!==null)||offer.pricingClass==='OWNER_BOUND_FIXED_PRICE'&&(typeof offer.currency!=='string'||!/^[A-Z]{3}$/.test(offer.currency)||!Number.isSafeInteger(offer.priceRevision)||Number(offer.priceRevision)<1))throw Error('MODEL_CONNECTION_READBACK_DENIED');r.inferenceOffer=Object.freeze(offer);}
 const connections=modelConnectionArrayV1(r.connections,8).map(validateModelConnectionSummaryV1);if(new Set(connections.map(c=>c.connectionId)).size!==connections.length||r.selectedConnectionId!==null&&!connections.some(c=>c.connectionId===r.selectedConnectionId))throw Error('MODEL_CONNECTION_READBACK_DENIED');
 for(const phase of MODEL_CONNECTION_PHASES_V1){const c=modelConnectionClosedV1(checks[phase],['state','checkedAtMs','identityDigest','reason']);if(!['NOT_RUN','PASS','FAILED','STALE','UNKNOWN_USAGE'].includes(String(c.state))||c.checkedAtMs!==null&&!unsigned(c.checkedAtMs)||c.identityDigest!==null&&!digest(c.identityDigest)||typeof c.reason!=='string'||!/^[A-Z_]{3,96}$/.test(c.reason)||c.state==='PASS'&&(r.selectedConnectionId===null||r.identityDigest===null||c.checkedAtMs===null||c.identityDigest!==r.identityDigest))throw Error('MODEL_CONNECTION_READBACK_DENIED');checks[phase]=Object.freeze(c);}
 const selected=connections.find(c=>c.connectionId===r.selectedConnectionId),offer=r.inferenceOffer as ModelConnectionReadbackV1['inferenceOffer'];
 if(offer&&(!selected||r.identityDigest===null||selected.evidenceClass==='SYNTHETIC_ONLY'&&offer.pricingClass!=='CODE_OWNED_SYNTHETIC_ZERO_PRICE'||selected.evidenceClass==='OWNER_BOUND_NOT_QUALIFIED'&&offer.pricingClass!=='OWNER_BOUND_FIXED_PRICE'))throw Error('MODEL_CONNECTION_READBACK_DENIED');
 if(r.readyForInference&&(!selected||!selected.selectable||Object.values(selected.availability).some(v=>!v)||r.identityDigest===null||!offer||r.consent!=='BOUNDED_ONCE'||MODEL_CONNECTION_PHASES_V1.slice(0,3).some(p=>(checks[p]as ModelConnectionCheckV1).state!=='PASS')||(checks.INFERENCE as ModelConnectionCheckV1).state!=='NOT_RUN'))throw Error('MODEL_CONNECTION_READBACK_DENIED');
 return Object.freeze({...r,binding:Object.freeze(b),connections:Object.freeze(connections),checks:Object.freeze(checks)})as unknown as ModelConnectionReadbackV1;
}
