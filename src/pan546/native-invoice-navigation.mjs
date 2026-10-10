import {randomBytes} from 'node:crypto';
import {isProtectedSessionAdapterV1} from '../pan527/origin-session-adapter.mjs';
import {isNativeErvReadAdapterV1} from '../pan541/native-erv-read-adapter.mjs';
import {isNativeWorkspaceReaderContextSelectionV1} from '../pan548/native-context-selection.mjs';
import {ervPluginV1} from '../../dist/packages/browser-workspace/src/plugin-erv-v1.js';
import {validateBrowserShellPluginV1} from '../../dist/packages/contracts/src/browser-shell-plugin-v1.js';
const owned=new WeakMap(),factoryIds=new Set(['pan.erv.navigation','pan.erv.view','pan.erv.information','pan.erv.action']);
function exact(value,keys,reason='NAV_INPUT_DENIED'){if(!value||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype)throw new Error(reason);const ds=Object.getOwnPropertyDescriptors(value);if(Reflect.ownKeys(ds).length!==keys.length||Reflect.ownKeys(ds).some(k=>typeof k!=='string'||!keys.includes(k))||Object.values(ds).some(d=>!d.enumerable||!('value'in d)))throw new Error(reason);}
function input(value,schema,keys){exact(value,['schemaVersion','context',...keys]);if(value.schemaVersion!==schema)throw new Error('NAV_INPUT_DENIED');}
function opaque(value,prefix){if(typeof value!=='string'||!new RegExp('^'+prefix+':[a-f0-9]{64}$').test(value))throw new Error('NAV_HANDLE_DENIED');return value;}
function handle(prefix){return prefix+':'+randomBytes(32).toString('hex');}
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;}
function registered(){const result=validateBrowserShellPluginV1(ervPluginV1,factoryIds);if(result.outcome!=='DESCRIPTOR_VALID'||!result.descriptor.enabled||result.descriptor.needs.dependencies.length!==0)throw new Error('NAV_NATIVE_ROUTE_DENIED');const p=result.descriptor,r=p.contributions.find(x=>x.kind==='ROUTE'&&x.id==='pan.erv.route'&&x.path==='/workspace/erv');if(!r||!p.contributions.some(x=>x.kind==='VIEW'&&x.id==='pan.erv.view'&&x.routeId===r.id))throw new Error('NAV_NATIVE_ROUTE_DENIED');return {moduleId:p.id,viewId:'pan.erv.view',routeId:r.id,path:r.path};}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function renderedSnapshot(value){exact(value,['moduleId','viewId','objectId','dataRevision','tabId','epoch']);if(value.moduleId!=='pan.erv'||value.viewId!=='pan.erv.view'||typeof value.objectId!=='string'||!/^AP-PAN516-(MATCHED|PARTIAL)-01$/.test(value.objectId)||!Number.isSafeInteger(value.dataRevision)||value.dataRevision<1||typeof value.tabId!=='string'||!/^tab:[a-f0-9]{32}$/.test(value.tabId)||!Number.isSafeInteger(value.epoch)||value.epoch<1)throw new Error('NAV_RENDER_RECEIPT_DENIED');return Object.freeze({moduleId:value.moduleId,viewId:value.viewId,objectId:value.objectId,dataRevision:value.dataRevision,tabId:value.tabId,epoch:value.epoch});}
// Native, memory-bounded navigation proposals/read receipts, NOT another task
// database/ledger. Search/request/read grant no financial/view write capability.
// A browser ACK is client-reported, NEVER server-certified rendering authority.
export function createNativeWorkspaceInvoiceNavigationV1(options){
 exact(options,['sessions','contextSelection','nativeReader'],'NAV_NATIVE_OWNER_DENIED');const {sessions,contextSelection,nativeReader}=options;
 if(!isProtectedSessionAdapterV1(sessions,sessions?.binding?.tenantId)||!isNativeWorkspaceReaderContextSelectionV1(contextSelection,sessions.binding,nativeReader)||!isNativeErvReadAdapterV1(nativeReader,sessions.binding.tenantId)||typeof nativeReader.search!=='function')throw new Error('NAV_NATIVE_OWNER_DENIED');
 const targets=new Map(),requests=new Map();let closed=false;
 function current(headers,verification){if(closed)throw new Error('NAV_OWNER_CLOSED');const c=contextSelection.verify(headers,verification);registered();if(closed)throw new Error('NAV_OWNER_CLOSED');return c;}
 function prune(){const at=Date.now();for(const [k,v]of targets)if(v.context.lease.expiresAtMs<=at)targets.delete(k);for(const [k,v]of requests)if(v.context.lease.expiresAtMs<=at)requests.delete(k);}
 function basis(headers,verification,row){const c=current(headers,verification);if(!same(c.binding,row.context.binding)||c.contextHandle!==row.context.contextHandle||!same(c.revisions,row.context.revisions)||Date.now()>=row.context.lease.expiresAtMs)throw new Error('NAV_TARGET_STALE_DENIED');return c;}
 function targetRead(headers,verification,row){const c=basis(headers,verification,row);const invoice=nativeReader.read({tenantId:c.binding.tenantId,objectId:row.target.objectId,expectedRevision:row.target.dataRevision});basis(headers,verification,row);return invoice;}
 const owner=Object.freeze({
  search(headers,value){input(value,'pansphaira.workspace-invoice-search/v1',['query']);if(typeof value.query!=='string'||!/^[A-Z0-9][A-Z0-9-]{0,63}$/.test(value.query))throw new Error('NAV_QUERY_DENIED');const c=current(headers,value.context),route=registered();const invoices=nativeReader.search({tenantId:c.binding.tenantId,query:value.query});if(invoices.length>2)throw new Error('NAV_NATIVE_CARDINALITY_DENIED');const after=current(headers,value.context);if(after!==c)throw new Error('NAV_TARGET_STALE_DENIED');prune();if(targets.size+invoices.length>128)throw new Error('NAV_TARGET_CAPACITY_DENIED');const candidates=invoices.map(invoice=>{const targetHandle=handle('nav-target');const target={...route,objectId:invoice.invoiceId,dataRevision:invoice.revision};targets.set(targetHandle,{context:c,target,consumed:false});return {targetHandle,objectId:invoice.invoiceId,dataRevision:invoice.revision,label:'Rechnungsvorgang '+invoice.invoiceId};});return freeze({schemaVersion:'pansphaira.workspace-invoice-search/readback/v1',contextHandle:c.contextHandle,query:value.query,outcome:candidates.length===0?'NONE':candidates.length===1?'ONE':'AMBIGUOUS',candidates,budget:{maxNativeReads:2,maxCandidates:2},executionAuthorityGranted:false,effectsProduced:false});},
  request(headers,value){input(value,'pansphaira.workspace-navigation/request/v1',['targetHandle']);opaque(value.targetHandle,'nav-target');current(headers,value.context);const row=targets.get(value.targetHandle);if(!row)throw new Error('NAV_TARGET_UNKNOWN_DENIED');if(row.consumed)throw new Error('NAV_TARGET_CONSUMED_DENIED');targetRead(headers,value.context,row);prune();if(requests.size>=128)throw new Error('NAV_REQUEST_CAPACITY_DENIED');const requestHandle=handle('nav-request');row.consumed=true;requests.set(requestHandle,{context:row.context,target:row.target,read:null,acknowledged:false});return freeze({schemaVersion:'pansphaira.workspace-navigation/request-readback/v1',requestHandle,outcome:'NAVIGATION_REQUESTED',target:{...row.target},lease:{...row.context.lease},browserRenderConfirmed:false,executionAuthorityGranted:false,effectsProduced:false});},
  read(headers,value){input(value,'pansphaira.workspace-navigation/read/v1',['requestHandle']);opaque(value.requestHandle,'nav-request');current(headers,value.context);const row=requests.get(value.requestHandle);if(!row)throw new Error('NAV_REQUEST_UNKNOWN_DENIED');if(row.acknowledged)throw new Error('NAV_REQUEST_CONSUMED_DENIED');const invoice=targetRead(headers,value.context,row);if(row.read)throw new Error('NAV_READ_ALREADY_CONSUMED_DENIED');const readReceiptHandle=handle('nav-read');row.read={readReceiptHandle,invoice};return freeze({schemaVersion:'pansphaira.workspace-navigation/native-readback/v1',requestHandle:value.requestHandle,readReceiptHandle,outcome:'NATIVE_TARGET_READBACK_RECEIVED',invoice,browserRenderConfirmed:false,executionAuthorityGranted:false,effectsProduced:false});},
  acknowledge(headers,value){
   input(value,'pansphaira.workspace-navigation/render-ack/v1',['requestHandle','readReceiptHandle','rendered']);
   const requestHandle=opaque(value.requestHandle,'nav-request'),readReceiptHandle=opaque(value.readReceiptHandle,'nav-read'),rendered=renderedSnapshot(value.rendered),verification=value.context;
   const c=current(headers,verification),row=requests.get(requestHandle);
   if(!row||row.acknowledged||!row.read||row.read.readReceiptHandle!==readReceiptHandle)throw new Error('NAV_READ_RECEIPT_DENIED');
   const a=c.binding,b=row.context.binding,fields=['origin','tenantId','subjectId','sessionId','instanceId','generation','tabId'];
   if(fields.some(k=>a[k]!==b[k])||Date.now()>=row.context.lease.expiresAtMs)throw new Error('NAV_RENDER_BINDING_DENIED');
   const changed=row.context.moduleId!==row.target.moduleId||row.context.viewId!==row.target.viewId||row.context.primaryObject?.objectId!==row.target.objectId;
   const exactEpoch=b.epoch+(changed?1:0),exactSelection=row.context.revisions.selectionRevision+(changed||row.context.selection!==null?1:0);
   if(a.epoch!==exactEpoch||c.revisions.selectionRevision!==exactSelection||['hostRevision','viewRevision','catalogRevision'].some(k=>c.revisions[k]!==row.context.revisions[k])||c.moduleId!==row.target.moduleId||c.viewId!==row.target.viewId||c.primaryObject?.objectId!==row.target.objectId||c.primaryObject?.revision!==row.target.dataRevision)throw new Error('NAV_RENDER_BINDING_DENIED');
   const expected={moduleId:c.moduleId,viewId:c.viewId,objectId:c.primaryObject.objectId,dataRevision:c.primaryObject.revision,tabId:a.tabId,epoch:a.epoch};
   if(Object.keys(expected).some(k=>rendered[k]!==expected[k]))throw new Error('NAV_RENDER_RECEIPT_DENIED');
   nativeReader.read({tenantId:a.tenantId,objectId:expected.objectId,expectedRevision:expected.dataRevision});
   const after=current(headers,verification);
   if(after!==c||Date.now()>=row.context.lease.expiresAtMs)throw new Error('NAV_RENDER_BINDING_DENIED');
   if(row.acknowledged||requests.get(requestHandle)!==row||row.read.readReceiptHandle!==readReceiptHandle)throw new Error('NAV_READ_RECEIPT_DENIED');
   row.acknowledged=true;
   return freeze({schemaVersion:'pansphaira.workspace-navigation/render-readback/v1',requestHandle,outcome:'BROWSER_RENDER_ACK_REPORTED',rendered:expected,nativeReadVerified:true,serverCertifiedBrowserRender:false,executionAuthorityGranted:false,effectsProduced:false});
  },
  close(){if(closed)return;closed=true;targets.clear();requests.clear();},
 });owned.set(owner,{binding:sessions.binding,contextSelection});return owner;
}
export const isNativeWorkspaceInvoiceNavigationV1=(owner,binding,contextSelection)=>owned.has(owner)&&same(owned.get(owner).binding,binding)&&owned.get(owner).contextSelection===contextSelection;
