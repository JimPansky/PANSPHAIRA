import {types} from 'node:util';
import {createHash} from 'node:crypto';
import {canonicalJson} from '../../dist/packages/contracts/src/canonical-json.js';
import {readPan515TradeState} from '../pan515/trade-state.mjs';
import {isProtectedSessionAdapterV1} from '../pan527/origin-session-adapter.mjs';
import {validateWorkspaceAnalysisReadV1,validateWorkspaceAnalysisResultV1} from '../../dist/packages/contracts/src/workspace-analysis-v1.js';
import {UsageInsightsLocalServiceV1,validateUsageInsightsReportV1} from '../../dist/packages/usage-insights/src/index.js';

const owned=new WeakMap();
const objectId='analysis:common-trade-01:stock';
const request=Object.freeze({schemaVersion:'pansphaira.pan520/projection-request/v1',profile:'STOCK',scope:Object.freeze({sourceId:'SYN-COMMON',tenantId:'SYN-TENANT-01',entityId:'SYN-ENTITY-01',orderId:'SO-01',lineId:'1',articleId:'ARTICLE-A',warehouseId:'WH-01',currency:'EUR',unit:'STK'}),questions:Object.freeze(['STOCK_POSITION','STOCK_RUNWAY','STOCK_VALUE'])});
function exact(value,keys,code){
 if(!value||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype)throw new Error(code);
 const ds=Object.getOwnPropertyDescriptors(value);
 if(Reflect.ownKeys(ds).length!==keys.length||Reflect.ownKeys(ds).some(k=>typeof k!=='string'||!keys.includes(k))||Object.values(ds).some(d=>!d.enumerable||!('value' in d)))throw new Error(code);
}
const labels=Object.freeze({physical:'Physischer Bestand',reserved:'Reservierter Bestand',quarantined:'Gesperrter Bestand',free:'Frei verfügbarer Bestand',stockRunwayDays:'Bestandsreichweite',stockValueMinor:'Qualifizierter Bestandswert'});

// Code-owned COMMON-TRADE-01 mapping is explicit. Protected tenant-a is NOT
// inferred to equal SYN-TENANT-01. Existing leading SQLite is read, not copied.
export function createNativeAnalysisReadAdapterV1(options){
 const hasCohort=!!options&&Object.hasOwn(options,'usageInsightsStore');
 exact(options,['optIn','root','sessions',...(hasCohort?['usageInsightsStore']:[])],'ANALYSIS_NATIVE_OWNER_DENIED');
 const {root,sessions}=options;
 if(options.optIn!==true||typeof root!=='string'||!isProtectedSessionAdapterV1(sessions,sessions?.binding?.tenantId))throw new Error('ANALYSIS_NATIVE_OWNER_DENIED');
 const initial=readPan515TradeState({root,projection:request});
 const initialBinding=initial.snapshot.bindingDigest;
 // An owner-selected local report is an immutable attachment-time snapshot,
 // not a new collector or an inferred population. It has its own real cutoff.
 const cohort=hasCohort?{entrypoint:'packages/usage-insights/src/index.ts#UsageInsightsLocalServiceV1.localReport',populationDenominator:null,denominatorState:'UNKNOWN',report:validateUsageInsightsReportV1(UsageInsightsLocalServiceV1.open(options.usageInsightsStore).localReport())}:null;
 const binding={origin:sessions.binding.origin,tenantId:sessions.binding.tenantId,instanceId:sessions.binding.instanceId,generation:sessions.binding.generation,identityDigest:sessions.binding.identityDigest};
 const reader=Object.freeze({read(headers,selector){
  exact(selector,['schemaVersion','objectId','expectedNativeRevision','expectedResultRevision','asOf'],'ANALYSIS_READ_REQUEST_DENIED');
  if(selector.schemaVersion!=='pansphaira.workspace-analysis/read/v1'||selector.objectId!==objectId)throw new Error('ANALYSIS_OBJECT_BINDING_DENIED');
  const principal=sessions.authenticate(headers);
  if(headers.origin!==sessions.origin||!['reader','reviewer'].includes(principal.role))throw new Error('ANALYSIS_ORIGIN_OR_ROLE_DENIED');
  if(selector.expectedNativeRevision!==null&&(!Number.isSafeInteger(selector.expectedNativeRevision)||selector.expectedNativeRevision<0))throw new Error('ANALYSIS_NATIVE_REVISION_STALE');
  if(selector.expectedResultRevision!==null&&(typeof selector.expectedResultRevision!=='string'||!/^[a-f0-9]{64}$/.test(selector.expectedResultRevision)))throw new Error('ANALYSIS_RESULT_REVISION_STALE');
  try{selector=validateWorkspaceAnalysisReadV1(selector);}catch{throw new Error('ANALYSIS_READ_REQUEST_DENIED');}
  const projection=readPan515TradeState({root,asOf:selector.asOf,projection:request});
  if(projection.snapshot.bindingDigest!==initialBinding)throw new Error('ANALYSIS_NATIVE_BINDING_DRIFT_DENIED');
  if(selector.expectedNativeRevision!==null&&selector.expectedNativeRevision!==projection.snapshot.nativeRevision)throw new Error('ANALYSIS_NATIVE_REVISION_STALE');
  // Keep the native projection identity distinct from the complete view bytes.
  // No new metric is computed; the view revision also binds cohort/binding data.
  const rows=Object.keys(labels).map(key=>{const fact=projection.facts[key];return {key,label:labels[key],state:fact.state,value:fact.value,unit:fact.unit,reason:fact.reason??null,basis:fact.basis??null};});
  sessions.authenticate(headers);
  const unsigned={schemaVersion:'pansphaira.workspace-analysis/result/v1',objectId,binding:{origin:sessions.binding.origin,tenantId:principal.tenantId,instanceId:principal.instanceId,generation:principal.generation,identityDigest:sessions.binding.identityDigest},source:{entrypoint:'src/pan515/trade-state.mjs#readPan515TradeState',schemaVersion:projection.schemaVersion,profile:projection.profile,projectionDigest:projection.projectionDigest,snapshot:projection.snapshot,grain:projection.grain,coverage:projection.provenance.coverage},rows,cohort,availability:rows.some(row=>row.state!=='KNOWN')?'PARTIAL':'KNOWN',proposalOnly:false,effectsProduced:false,executionAuthorityGranted:false,consentChanged:false,transportEnabled:false};
  const resultRevision=createHash('sha256').update(canonicalJson(unsigned),'utf8').digest('hex');
  if(selector.expectedResultRevision!==null&&selector.expectedResultRevision!==resultRevision)throw new Error('ANALYSIS_RESULT_REVISION_STALE');
  return validateWorkspaceAnalysisResultV1({...unsigned,resultRevision},binding);
 }});
 owned.set(reader,sessions.binding);return reader;
}
export const isNativeAnalysisReadAdapterV1=(reader,binding)=>typeof binding?.tenantId==='string'&&owned.has(reader)&&owned.get(reader)===binding;
