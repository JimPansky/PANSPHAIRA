import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createBrowserContextOwnerV1} from '../../dist/packages/browser-shell/src/context-owner-v1.js';
const contractURL=new URL('../../dist/packages/contracts/src/workspace-context-selection-v1.js',import.meta.url);
const ownerURL=new URL('../../dist/packages/browser-shell/src/extended-context-owner-v1.js',import.meta.url);
const contract=existsSync(contractURL)?await import(contractURL):null;
const lifecycle=existsSync(ownerURL)?await import(ownerURL):null;
// Structural fixtures are NOT server-issued authority, native/browser/model or
// released qualification. Genuine issuer/registry/browser cases follow separately.
const binding={origin:'https://pan548.test:4443',tenantId:'tenant-a',subjectId:'synthetic:context-reader',sessionId:'session:'+'a'.repeat(64),instanceId:'pan548-context-test',generation:1,tabId:'tab:'+'b'.repeat(32),epoch:1};
const revisions={hostRevision:1,domainRevision:4,viewRevision:2,catalogRevision:3,selectionRevision:1};
const claim={schemaVersion:'pansphaira.workspace-context/claim/v1',tabId:binding.tabId,moduleId:'pan.erv',viewId:'pan.erv.view',primaryObjectId:'AP-PAN516-MATCHED-01',expected:{...revisions,epoch:1},selection:{elementId:'pan.erv.amount',rowId:null}};
const readback=()=>({schemaVersion:'pansphaira.workspace-context/readback/v1',contextHandle:'context:'+'c'.repeat(64),binding:{...binding},moduleId:'pan.erv',viewId:'pan.erv.view',primaryObject:{objectId:'AP-PAN516-MATCHED-01',revision:4},revisions:{...revisions},selection:{elementId:'pan.erv.amount',rowId:null},lease:{issuedAtMs:Date.now(),expiresAtMs:Date.now()+60000},capabilityIds:['ui.context.read','ui.selection.read'],sourceMap:null,executionAuthorityGranted:false,effectsProduced:false});
function requireContract(){assert.equal(typeof contract?.validateWorkspaceContextClaimV1,'function','PAN548_ADDITIVE_CONTEXT_RUNTIME_CONTRACT_NOT_IMPLEMENTED');return contract;}
function requireOwner(){assert.equal(typeof lifecycle?.createExtendedBrowserContextOwnerV1,'function','PAN548_ALL_PHASE_EXTENDED_CONTEXT_OWNER_NOT_IMPLEMENTED');return lifecycle.createExtendedBrowserContextOwnerV1;}
function deferred(){let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};}

test('DUI-02 structural contract: closed semantic reference claims retain independent axes/null setup and do not carry source-map/CSS/identity authority',()=>{
 const c=requireContract();const valid=c.validateWorkspaceContextClaimV1(claim);assert.deepEqual(valid,claim);assert.notEqual(valid,claim);assert.ok(Object.isFrozen(valid.expected));
 const setup={...claim,moduleId:'pan.setup',viewId:'pan.setup.view',primaryObjectId:null,expected:{...claim.expected,domainRevision:null},selection:null};assert.deepEqual(c.validateWorkspaceContextClaimV1(setup),setup);
 for(const mutate of [x=>{x.tenantId='tenant-b';},x=>{x.subjectId='reviewer';},x=>{x.tabId='tab:wrong';},x=>{x.selection.elementId='#secret .row';},x=>{x.selection.rowId='https://outside.invalid';},x=>{x.sourceMap={file:'secret.ts'};},x=>{x.expected.viewRevision=-1;},x=>{x.expected.epoch=0;},x=>{x.primaryObjectId=undefined;}]){const bad=structuredClone(claim);mutate(bad);assert.throws(()=>c.validateWorkspaceContextClaimV1(bad),/CONTEXT_CLAIM_DENIED/);}
 let reads=0;const bad=structuredClone(claim);Object.defineProperty(bad.selection,'elementId',{enumerable:true,get(){reads++;return 'pan.erv.amount';}});assert.throws(()=>c.validateWorkspaceContextClaimV1(bad),/CONTEXT_CLAIM_DENIED/);assert.equal(reads,0);
});
test('DUI-02 structural readback: defensive frozen versioned projection preserves independent domain/view/catalog/selection and cannot grant effects/dev source map',()=>{
 const c=requireContract(),source=readback(),actual=c.validateWorkspaceContextReadbackV1(source);assert.deepEqual(actual,source);assert.ok(Object.isFrozen(actual)&&Object.isFrozen(actual.binding)&&Object.isFrozen(actual.capabilityIds));source.selection.elementId='changed';assert.equal(actual.selection.elementId,'pan.erv.amount');
 for(const mutate of [x=>{x.executionAuthorityGranted=true;},x=>{x.effectsProduced=true;},x=>{x.sourceMap={path:'private.ts'};},x=>{x.capabilityIds=['ui.personal.save'];},x=>{x.primaryObject.revision++;},x=>{x.contextHandle='context:caller';},x=>{x.lease.expiresAtMs=x.lease.issuedAtMs;},x=>{x.revisions.hostRevision=Infinity;}]){const bad=readback();mutate(bad);assert.throws(()=>c.validateWorkspaceContextReadbackV1(bad),/CONTEXT_READBACK_DENIED/);}
 const holes=readback();holes.capabilityIds=Array(2);assert.throws(()=>c.validateWorkspaceContextReadbackV1(holes),/CONTEXT_READBACK_DENIED/);
 assert.deepEqual(c.verifyWorkspaceContextBindingV1(readback(),binding).binding,binding);for(const changes of [{tenantId:'tenant-b'},{subjectId:'synthetic:other'},{tabId:'tab:'+'d'.repeat(32)},{generation:2},{epoch:2}])assert.throws(()=>c.verifyWorkspaceContextBindingV1(readback(),{...binding,...changes}),/CONTEXT_BINDING_STALE/);
});
test('DUI-02 lifecycle fixture: each pending read/STT/model/render/preview reply is discarded after registered-context revision/module replacement',async()=>{
 const create=requireOwner();for(const phase of ['read','stt','model','render','preview']){
  const original=readback(),owner=create({initialContext:original,isContextLive:()=>true}),gate=deferred();let signal;
  const pending=owner.run(phase,async(context,abort)=>{assert.equal(context.moduleId,'pan.erv');signal=abort;await gate.promise;return {old:'not current'};});
  const next=readback();next.contextHandle='context:'+'d'.repeat(64);next.binding.epoch++;next.moduleId='pan.setup';next.viewId='pan.setup.view';next.primaryObject=null;next.revisions.domainRevision=null;next.revisions.viewRevision++;next.revisions.selectionRevision++;next.selection=null;owner.replace(next);assert.equal(signal.aborted,true);gate.resolve();assert.deepEqual(await pending,{outcome:'STALE_CONTEXT',phase,value:null});owner.close();
 }
});
test('DUI-02 lifecycle fixture: every independently changed axis retires pending response; cross-subject/tenant/tab replacement is denied',async()=>{
 const create=requireOwner();for(const axis of Object.keys(revisions)){
  const owner=create({initialContext:readback(),isContextLive:()=>true}),gate=deferred(),pending=owner.run('preview',async()=>{await gate.promise;return 'old';});const next=structuredClone(owner.context());next.revisions[axis]++;if(axis==='domainRevision')next.primaryObject.revision++;owner.replace(next);gate.resolve();assert.equal((await pending).outcome,'STALE_CONTEXT');owner.close();
 }
 const owner=create({initialContext:readback(),isContextLive:()=>true});for(const changes of [{tenantId:'tenant-b'},{subjectId:'synthetic:other'},{tabId:'tab:'+'d'.repeat(32)}]){const next=readback();Object.assign(next.binding,changes);assert.throws(()=>owner.replace(next),/CONTEXT_OWNER_BINDING_DENIED/);}owner.close();
});
test('DUI-02 lifecycle fixture: actual lease expiry/live denial after operation yields no late values, synchronous exact-true liveness required',async(t)=>{
 const create=requireOwner();let live=true;const owner=create({initialContext:readback(),isContextLive:()=>live});const gate=deferred(),pending=owner.run('read',async()=>{await gate.promise;return 'secret old';});live=false;gate.resolve();assert.deepEqual(await pending,{outcome:'STALE_CONTEXT',phase:'read',value:null});owner.close();
 const now=Date.now(),clock=t.mock.method(Date,'now',()=>now);try{const initial=readback();initial.lease.expiresAtMs=now+1;const expiring=create({initialContext:initial,isContextLive:()=>true}),wait=deferred(),late=expiring.run('render',async()=>{await wait.promise;return 'late';});clock.mock.mockImplementation(()=>now+2);wait.resolve();assert.equal((await late).outcome,'STALE_CONTEXT');expiring.close();}finally{clock.mock.restore();}
 for(const predicate of [()=>Promise.resolve(true),()=>1,()=>{throw new Error('unavailable');}]){const denied=create({initialContext:readback(),isContextLive:predicate});let called=false;assert.deepEqual(await denied.run('model',()=>{called=true;return 'not admitted';}),{outcome:'STALE_CONTEXT',phase:'model',value:null});assert.equal(called,false);denied.close();}
});
test('DUI-02 lifecycle fixture: cleanup faults isolate other callbacks and closed owner; current response stays read-only',async()=>{
 const create=requireOwner(),owner=create({initialContext:readback(),isContextLive:()=>true});let count=0;owner.onDispose(()=>{throw new Error('owned listener failed');});owner.onDispose(()=>{count++;});assert.equal((await owner.run('read',()=>42)).outcome,'CURRENT_CONTEXT_RESPONSE');const next=readback();next.binding.epoch++;assert.deepEqual(owner.replace(next),{disposedListeners:2,disposalFailures:1});assert.equal(count,1);owner.close();assert.throws(()=>owner.context(),/CONTEXT_OWNER_CLOSED/);assert.throws(()=>owner.run('read',()=>1),/CONTEXT_OWNER_CLOSED/);
});
test('DUI-02 lifecycle fixture: expiry during the synchronous live predicate denies operation before invocation',async(t)=>{
 const create=requireOwner(),now=Date.now(),clock=t.mock.method(Date,'now',()=>now);try{
  const initial=readback();initial.lease.expiresAtMs=now+1;let invoked=false;
  const owner=create({initialContext:initial,isContextLive:()=>{clock.mock.mockImplementation(()=>now+2);return true;}});
  assert.deepEqual(await owner.run('read',()=>{invoked=true;return 'not admitted';}),{outcome:'STALE_CONTEXT',phase:'read',value:null});assert.equal(invoked,false,'expired in live predicate must not start a read/model/preview');owner.close();
 }finally{clock.mock.restore();}
});

// Trusted structural callback fixtures, not native/server-issued authority.
const callbackLegacyContext=revision=>({schemaVersion:'pansphaira.browser-context/v1',tenantId:'tenant-a',sessionId:'synthetic:callback-reader',objectId:null,revision});
const callbackExtendedContext=epoch=>({...readback(),binding:{...binding,epoch}});
test('DUI-02 legacy abort callback retains a new-context read and its new cleanup',async()=>{
 const a=deferred(),b=deferred();let owner,second,secondSignal,disposedB=0;
 owner=createBrowserContextOwnerV1({initialContext:callbackLegacyContext(1),readBackend:async(context,signal)=>{if(context.revision===1){signal.addEventListener('abort',()=>{second=owner.read();owner.onDispose(()=>{disposedB++;});},{once:true});return a.promise;}secondSignal=signal;return b.promise;}});
 const first=owner.read();owner.switchContext(callbackLegacyContext(2));const observations={secondAborted:secondSignal.aborted,disposedB};a.resolve({status:200,value:'old'});b.resolve({status:200,value:'current'});const old=await first,current=await second;owner.close();assert.deepEqual(observations,{secondAborted:false,disposedB:0});assert.equal(old.outcome,'STALE_CONTEXT');assert.equal(current.outcome,'READBACK_RECEIVED');assert.equal(disposedB,1);
});
for(const kind of ['legacy','extended'])test('DUI-02 '+kind+' old unregister cannot remove a same-callback newer registration',()=>{
 const owner=kind==='legacy'?createBrowserContextOwnerV1({initialContext:callbackLegacyContext(1),readBackend:async()=>({status:200,value:null})}):requireOwner()({initialContext:callbackExtendedContext(1),isContextLive:()=>true});let called=0,currentUnregister;
 const callback=()=>{called++;if(called===1)currentUnregister=owner.onDispose(callback);};const oldUnregister=owner.onDispose(callback);if(kind==='legacy')owner.switchContext(callbackLegacyContext(2));else owner.replace(callbackExtendedContext(2));oldUnregister();if(kind==='legacy')owner.switchContext(callbackLegacyContext(3));else owner.replace(callbackExtendedContext(3));const observed=called;owner.close();assert.equal(typeof currentUnregister,'function');assert.equal(observed,2);
});
for(const change of ['switch','close'])test('DUI-02 legacy trusted value accessor '+change+' returns stale, never an old readback',async()=>{
 let owner;const response={status:200,get value(){if(change==='switch')owner.switchContext(callbackLegacyContext(2));else owner.close();return 'old-lazy-payload';}};owner=createBrowserContextOwnerV1({initialContext:callbackLegacyContext(1),readBackend:async()=>response});const actual=await owner.read();owner.close();assert.deepEqual(actual,{outcome:'STALE_CONTEXT',value:null});
});
for(const change of ['switch','close'])test('DUI-02 legacy trusted status accessor '+change+' is sampled once and retires its read',async()=>{
 let owner,accesses=0;const response={get status(){accesses++;if(change==='switch')owner.switchContext(callbackLegacyContext(2));else owner.close();return 200;},value:'old-status-payload'};owner=createBrowserContextOwnerV1({initialContext:callbackLegacyContext(1),readBackend:async()=>response});const actual=await owner.read();owner.close();assert.deepEqual(actual,{outcome:'STALE_CONTEXT',value:null});assert.equal(accesses,1);
});
for(const kind of ['legacy','extended'])test('DUI-02 '+kind+' current unregister still removes its own deduplicated registration',()=>{
 const owner=kind==='legacy'?createBrowserContextOwnerV1({initialContext:callbackLegacyContext(1),readBackend:async()=>({status:200,value:null})}):requireOwner()({initialContext:callbackExtendedContext(1),isContextLive:()=>true});let calls=0;const callback=()=>{calls++;};const old=owner.onDispose(callback),current=owner.onDispose(callback);current();owner.onDispose(callback);old();owner.close();assert.equal(calls,1);
});
