import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {isProtectedSessionAdapterV1} from '../pan527/origin-session-adapter.mjs';
import {isNativeErvReadAdapterV1} from '../pan541/native-erv-read-adapter.mjs';
import {runtimeIdentityDigestV1,validateRuntimeIdentityV1} from '../pan526/runtime-contract.mjs';
import {setupPluginV1} from '../../dist/packages/browser-workspace/src/plugin-setup-v1.js';
import {ervPluginV1} from '../../dist/packages/browser-workspace/src/plugin-erv-v1.js';
import {validateBrowserShellPluginV1} from '../../dist/packages/contracts/src/browser-shell-plugin-v1.js';
import {validateBrowserProfileReadV1} from '../../dist/packages/contracts/src/browser-profile-v1.js';
import {validateWorkspaceContextClaimV1,validateWorkspaceContextReadbackV1,validateWorkspaceContextSnapshotV1,validateWorkspaceContextVerifyV1} from '../../dist/packages/contracts/src/workspace-context-selection-v1.js';
const owned=new WeakMap(),hash=x=>createHash('sha256').update(x).digest('hex');
function exact(v,keys,reason){if(!v||typeof v!=='object'||Object.getPrototypeOf(v)!==Object.prototype)throw new Error(reason);const ds=Object.getOwnPropertyDescriptors(v);if(Reflect.ownKeys(ds).length!==keys.length||Reflect.ownKeys(ds).some(k=>typeof k!=='string'||!keys.includes(k))||Object.values(ds).some(d=>!d.enumerable||!('value'in d)))throw new Error(reason);}
function clock(){const n=Date.now();if(!Number.isSafeInteger(n)||n<1||n>Number.MAX_SAFE_INTEGER-300000)throw new Error('CONTEXT_CLOCK_UNAVAILABLE');return n;}
function next(n){if(!Number.isSafeInteger(n)||n<1||n>=Number.MAX_SAFE_INTEGER)throw new Error('CONTEXT_REVISION_LIMIT');return n+1;}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function equalSecret(a,b){return typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
// Projection of the EXISTING code-owned Setup/ERV plugin descriptors. There is
// no second plugin installer, HTTP catalog registration, taskstore or ledger.
const nativeFactoryIds=new Set(['pan.setup.navigation','pan.setup.view','pan.erv.navigation','pan.erv.view','pan.erv.information','pan.erv.action']);
function registered(moduleId,viewId){const source=moduleId==='pan.setup'?setupPluginV1:moduleId==='pan.erv'?ervPluginV1:null;if(!source)throw new Error('CONTEXT_NATIVE_VIEW_DENIED');const result=validateBrowserShellPluginV1(source,nativeFactoryIds);if(result.outcome!=='DESCRIPTOR_VALID')throw new Error('CONTEXT_NATIVE_VIEW_DENIED');const p=result.descriptor;if(!p.enabled||p.needs.dependencies.length!==0||!p.contributions.some(x=>x.kind==='VIEW'&&x.id===viewId))throw new Error('CONTEXT_NATIVE_VIEW_DENIED');return p;}
export function createNativeWorkspaceContextSelectionV1(options){
 exact(options,['sessions','identity','nativeReader','readSetup','readProfile'],'CONTEXT_NATIVE_OWNER_DENIED');
 const {sessions,nativeReader,readSetup,readProfile}=options,identity=validateRuntimeIdentityV1(options.identity);
 if(!isProtectedSessionAdapterV1(sessions,identity?.tenantId)||!isNativeErvReadAdapterV1(nativeReader,identity.tenantId)||typeof readSetup!=='function'||typeof readProfile!=='function'||sessions.binding.instanceId!==identity.instanceId||sessions.binding.generation!==identity.generation)throw new Error('CONTEXT_NATIVE_OWNER_DENIED');
 if(runtimeIdentityDigestV1(identity)!==sessions.binding.identityDigest)throw new Error('CONTEXT_NATIVE_OWNER_DENIED');
 const tabs=new Map();let closed=false,hostDigest=null,hostRevision=1;
 function authorize(headers){
  if(closed)throw new Error('CONTEXT_ATTACHMENT_RETIRED');
  const principal=sessions.authenticate(headers),pair=headers.cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith('__Host-pan527-session='));
  const sessionId='session:'+hash(pair);
  if(headers['x-pan548-session']!==sessionId)throw new Error('HOSTED_SESSION_DENIED');
  if(headers.origin!==undefined&&headers.origin!==sessions.origin)throw new Error('HOSTED_CSRF_DENIED');
  if(!['reader','reviewer'].includes(principal.role)||principal.tenantId!==identity.tenantId||principal.instanceId!==identity.instanceId||principal.generation!==identity.generation||identity.authorityProfile!=='SAFE_GUIDED'||!identity.effectiveRights.includes('demo.status.read'))throw new Error('CONTEXT_NATIVE_RIGHTS_DENIED');
  return {principal,sessionId};
 }
 function state(a,tab,target=tab){
  registered(target.moduleId,target.viewId);
  // Trusted native readers may re-enter this owner. Keep data paired with its
  // captured revision, and never resurrect a tab retired during a leading read.
  const keys=['moduleId','viewId','primaryObjectId','epoch','selectionRevision','selection','catalogRevision','catalogDigest','context'];
  const before=keys.map(key=>tab[key]);
  const stableTab=()=>{const fresh=authorize(a.headers??{});if(fresh.sessionId!==a.sessionId||fresh.principal.subjectId!==a.principal.subjectId||fresh.principal.role!==a.principal.role||keys.some((key,i)=>tab[key]!==before[i]))throw new Error('CONTEXT_REVISION_STALE');if(clock()>=tab.expiresAtMs)throw new Error('CONTEXT_LEASE_EXPIRED');};
  const setupBytes=JSON.stringify(readSetup(a.principal));let setup;try{setup=JSON.parse(setupBytes);}catch{throw new Error('CONTEXT_NATIVE_RIGHTS_DENIED');}stableTab();
  if(setup?.apiVersion!=='chimpmaera.dev/poc-early-admin-status/v1'||setup.kind!=='PocEarlyAdminStatus'||setup.authority?.profile?.profileId!=='SAFE_GUIDED'||!Array.isArray(setup.stages)||setup.stages.length>16)throw new Error('CONTEXT_NATIVE_RIGHTS_DENIED');
  const digest=hash(setupBytes);if(hostDigest!==null&&hostDigest!==digest)hostRevision=next(hostRevision);hostDigest=digest;const capturedHostRevision=hostRevision;
  const profile=validateBrowserProfileReadV1(readProfile(a.principal)),main=profile.catalog.find(x=>x.id==='shell.main');
  stableTab();
  if(main?.state!=='AVAILABLE'||!profile.effectiveItems.some(x=>x.id==='shell.main'&&x.visible))throw new Error('CONTEXT_NATIVE_VIEW_DENIED');
  const catalog=hash(JSON.stringify([setupPluginV1,ervPluginV1,profile.catalog]));
  let primaryObject=null,selections=[];
  if(target.moduleId==='pan.setup'){
   if(target.primaryObjectId!==null)throw new Error('CONTEXT_NATIVE_OBJECT_DENIED');
   selections=[{elementId:'pan.setup.progress',rowId:null,label:'Abgeschlossene Einrichtungsstufen'},{elementId:'pan.setup.health',rowId:null,label:'Aktueller Health-Zustand'},...setup.stages.map(s=>({elementId:'pan.setup.stage',rowId:s.stageId,label:'Einrichtungsstufe: '+s.label}))];
  }else if(target.primaryObjectId!==null){
   const invoice=nativeReader.read({tenantId:a.principal.tenantId,objectId:target.primaryObjectId,expectedRevision:null});
   primaryObject={objectId:invoice.invoiceId,revision:invoice.revision};
   selections=[{elementId:'pan.erv.amount',rowId:null,label:'Rechnungsbetrag in EUR'},{elementId:'pan.erv.status',rowId:null,label:'Aktueller fachlicher Rechnungsstatus'},{elementId:'pan.erv.summary',rowId:invoice.invoiceId,label:'Zusammenfassung der Rechnung '+invoice.invoiceId}];
  }
  stableTab(); // Fresh same-session rights and tab lifetime after native reads.
  if(hostDigest!==digest||hostRevision!==capturedHostRevision)throw new Error('CONTEXT_REVISION_STALE');
  const catalogRevision=tab.catalogDigest!==null&&tab.catalogDigest!==catalog?next(tab.catalogRevision):tab.catalogRevision;
  tab.catalogDigest=catalog;tab.catalogRevision=catalogRevision;
  return {primaryObject,selections,revisions:{hostRevision:capturedHostRevision,domainRevision:primaryObject?.revision??null,viewRevision:profile.revision+1,catalogRevision,selectionRevision:tab.selectionRevision}};
 }
 function tabFor(headers){const a=authorize(headers);a.headers=headers;const id=headers['x-pan548-tab-id'],proof=headers['x-pan548-tab'];if(typeof id!=='string'||!/^tab:[a-f0-9]{32}$/.test(id)||typeof proof!=='string'||!/^[a-f0-9]{64}$/.test(proof))throw new Error('CONTEXT_TAB_DENIED');const tab=tabs.get(id);if(!tab||tab.sessionId!==a.sessionId||tab.subjectId!==a.principal.subjectId||tab.role!==a.principal.role||!equalSecret(tab.proofDigest,hash(proof)))throw new Error('CONTEXT_TAB_DENIED');if(clock()>=tab.expiresAtMs)throw new Error('CONTEXT_LEASE_EXPIRED');return {a,tab};}
 function issueReadback(a,tab,s){const at=clock();if(at>=tab.expiresAtMs)throw new Error('CONTEXT_LEASE_EXPIRED');return validateWorkspaceContextReadbackV1({schemaVersion:'pansphaira.workspace-context/readback/v1',contextHandle:'context:'+randomBytes(32).toString('hex'),binding:{origin:sessions.origin,tenantId:a.principal.tenantId,subjectId:a.principal.subjectId,sessionId:a.sessionId,instanceId:a.principal.instanceId,generation:a.principal.generation,tabId:tab.id,epoch:tab.epoch},moduleId:tab.moduleId,viewId:tab.viewId,primaryObject:s.primaryObject,revisions:s.revisions,selection:tab.selection,lease:{issuedAtMs:at,expiresAtMs:Math.min(at+60000,tab.expiresAtMs)},capabilityIds:['ui.context.read','ui.selection.read'],sourceMap:null,executionAuthorityGranted:false,effectsProduced:false});}
 function snapshot(a,tab){let s=state(a,tab);if(tab.selection!==null&&!s.selections.some(e=>e.elementId===tab.selection.elementId&&e.rowId===tab.selection.rowId)){tab.selection=null;tab.selectionRevision=next(tab.selectionRevision);s=state(a,tab);}
  const current=tab.context;
  if(!current||current.lease.expiresAtMs<=clock()||!same(current.revisions,s.revisions)||current.binding.epoch!==tab.epoch||!same(current.selection,tab.selection))tab.context=issueReadback(a,tab,s);
  return validateWorkspaceContextSnapshotV1({schemaVersion:'pansphaira.workspace-context/snapshot/v1',context:tab.context,selections:s.selections});
 }
 const owner=Object.freeze({
  bootstrap(headers,body){exact(body,[],'CONTEXT_CLAIM_DENIED');const a=authorize(headers);a.headers=headers;const at=clock();for(const[id,row]of tabs)if(row.expiresAtMs<=at)tabs.delete(id);if(tabs.size>=128||[...tabs.values()].filter(t=>t.sessionId===a.sessionId).length>=8)throw new Error('CONTEXT_TAB_CAPACITY_DENIED');
   const proof=randomBytes(32).toString('hex'),id='tab:'+randomBytes(16).toString('hex'),tab={id,proofDigest:hash(proof),sessionId:a.sessionId,subjectId:a.principal.subjectId,role:a.principal.role,expiresAtMs:at+300000,moduleId:'pan.setup',viewId:'pan.setup.view',primaryObjectId:null,epoch:1,selectionRevision:1,selection:null,catalogRevision:1,catalogDigest:null,context:null};const snap=snapshot(a,tab);tabs.set(id,tab);return {schemaVersion:'pansphaira.workspace-context/tab-bootstrap/v1',tabProof:proof,snapshot:snap};
  },
  snapshot(headers){const{a,tab}=tabFor(headers);return snapshot(a,tab);},
  claim(headers,value){const{a,tab}=tabFor(headers),claim=validateWorkspaceContextClaimV1(value);if(claim.tabId!==tab.id)throw new Error('CONTEXT_TAB_DENIED');const s=state(a,tab,claim);const expected={...s.revisions,epoch:tab.epoch};if(!same(expected,claim.expected))throw new Error('CONTEXT_REVISION_STALE');if(claim.selection!==null&&!s.selections.some(e=>e.elementId===claim.selection.elementId&&e.rowId===claim.selection.rowId))throw new Error('CONTEXT_NATIVE_SELECTION_DENIED');
   const navigation=tab.moduleId!==claim.moduleId||tab.viewId!==claim.viewId||tab.primaryObjectId!==claim.primaryObjectId,selectionChange=navigation||!same(tab.selection,claim.selection);
   if(navigation)tab.epoch=next(tab.epoch);if(selectionChange)tab.selectionRevision=next(tab.selectionRevision);Object.assign(tab,{moduleId:claim.moduleId,viewId:claim.viewId,primaryObjectId:claim.primaryObjectId,selection:claim.selection});tab.context=null;return snapshot(a,tab);
  },
  verify(headers,value){const{a,tab}=tabFor(headers),v=validateWorkspaceContextVerifyV1(value);if(v.tabId!==tab.id)throw new Error('CONTEXT_TAB_DENIED');const current=tab.context;if(!current||!equalSecret(current.contextHandle,v.contextHandle))throw new Error('CONTEXT_REVISION_STALE');if(clock()>=current.lease.expiresAtMs)throw new Error('CONTEXT_LEASE_EXPIRED');const s=state(a,tab);if(clock()>=current.lease.expiresAtMs||clock()>=tab.expiresAtMs)throw new Error('CONTEXT_LEASE_EXPIRED');if(tab.context!==current||!same(current.revisions,s.revisions)||current.binding.epoch!==tab.epoch||!same(current.selection,tab.selection)||(current.selection!==null&&!s.selections.some(e=>e.elementId===current.selection.elementId&&e.rowId===current.selection.rowId)))throw new Error('CONTEXT_REVISION_STALE');return current;
  },
  retire(headers,value){const{tab}=tabFor(headers),v=validateWorkspaceContextVerifyV1(value);if(v.tabId!==tab.id)throw new Error('CONTEXT_TAB_DENIED');if(!tab.context||!equalSecret(v.contextHandle,tab.context.contextHandle))throw new Error('CONTEXT_REVISION_STALE');tab.epoch=next(tab.epoch);tab.selectionRevision=next(tab.selectionRevision);tab.context=null;tab.selection=null;return {outcome:'CONTEXT_RETIRED',executionAuthorityGranted:false,effectsProduced:false};},
  close(){if(closed)return;closed=true;tabs.clear();},
 });owned.set(owner,sessions.binding);return owner;
}
export const isNativeWorkspaceContextSelectionV1=(owner,binding)=>owned.has(owner)&&same(owned.get(owner),binding);
