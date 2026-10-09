import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {canonicalJson} from '../../dist/packages/contracts/src/canonical-json.js';
import {existsSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {nativeTradeFixture,nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
import * as trade from '../../src/pan515/trade-state.mjs';
import common from '../../contracts/trade/common-trade-01-v1.json' with {type:'json'};
import {createProtectedSessionAdapterV1} from '../../src/pan527/origin-session-adapter.mjs';
const entry=new URL('../../src/pan549/native-analysis-read.mjs',import.meta.url);
const analysis=existsSync(entry)?await import(entry):null;
// Explicit permitted local synthetic binding; repeated hex image/config values
// are fixtures, never installer/image/provider/production qualification.
const identity={schemaVersion:'pansphaira.portable-runtime/identity/v1',componentId:'pansphaira-local-demo',sourceCommit:'23d2af453b7e9350796f45fc7f5850a708797d76',sourceTree:'d9b2a4636755109db9db12c093d04ff690cfa15a',imageDigest:'sha256:'+'a'.repeat(64),architecture:'x86_64',productVersion:'0.2.0-poc.20260810.5',runtime:{name:'node',version:'24.14.1'},contractVersion:'1.0.0',instanceId:'pan549-native-analysis-local',tenantId:'tenant-a',generation:1,configurationDigest:'b'.repeat(64),templateDigest:'c'.repeat(64),policyDigest:'d'.repeat(64),networkDigest:'e'.repeat(64),authorityProfile:'SAFE_GUIDED',effectiveRights:['demo.status.read','demo.provider.bound.read','demo.governed.effect']};
const objectId='analysis:common-trade-01:stock';
const cutoff='2026-06-30T23:59:59+02:00';
const projectionRequest={schemaVersion:'pansphaira.pan520/projection-request/v1',profile:'STOCK',scope:{sourceId:'SYN-COMMON',tenantId:'SYN-TENANT-01',entityId:'SYN-ENTITY-01',orderId:'SO-01',lineId:'1',articleId:'ARTICLE-A',warehouseId:'WH-01',currency:'EUR',unit:'STK'},questions:['STOCK_POSITION','STOCK_RUNWAY','STOCK_VALUE']};
function issued(sessions,subjectId='synthetic:analysis-reader',role='reader'){
 const s=sessions.issueOwnerSession({subjectId,role,expiresAtMs:Date.now()+300000});
 return {cookie:s.cookieHeader,origin:sessions.origin};
}
const command=(kind,revision,id,quantity,referenceId=null,extra={})=>({schemaVersion:'pansphaira.pan517/fulfilment-command/v1',effectId:id,transportId:'synthetic:analysis-'+id.toLowerCase(),expectedRevision:revision,orderId:'SO-01',lineId:'1',articleId:'ARTICLE-A',warehouseId:'WH-01',unit:'STK',kind,quantity,referenceId,effectiveAt:'2026-06-29T10:00:00Z',reason:'Local synthetic native analysis source only',...extra});
const apply=(root,command)=>trade.executePan515TradeCommand({root,command,grant:trade.authorizePan515TradeCommand({root,command,owner:'LOCAL_SYNTHETIC_OWNER'})});
export async function analysisFixture(){
 const f=await nativeTradeFixture({common:true});
 try{
  trade.initializePan515TradeState({root:f.root,owner:'LOCAL_SYNTHETIC_OWNER',caseId:common.id});
  apply(f.root,command('PROMISE',0,'PR-01',10,null,{effectiveAt:common.sales_order.accepted_at,promise:{revision:1,kind:'DISPATCH',dueAt:common.sales_order.promised_dispatch_at,previousPromiseDigest:null,sourceReference:'COMMON-TRADE-01.sales_order'}}));
  for(const [i,r] of common.receipts.entries())apply(f.root,{...command('RECEIPT',i+1,r.id,r.accepted_quantity,common.purchase_order.id,{effectiveAt:r.accepted_at,sourceLineId:'1'}),schemaVersion:'pansphaira.pan515/trade-command/v1'});
  apply(f.root,{...command('RESERVE',3,'RS-01',10,null,{effectiveAt:common.reservation_events[0].at}),schemaVersion:'pansphaira.pan515/trade-command/v1'});
  apply(f.root,command('PICK',4,'PK-01',8,'RS-01'));apply(f.root,command('PACK',5,'PA-01',8,'PK-01'));
  apply(f.root,command('ISSUE',6,'SH-01',8,'PA-01',{reservationId:'RS-01',reservationEventId:'RC-01',dispatchNoteId:'DN-01',physicalEvidenceId:'EV-01',promiseRevision:1,effectiveAt:common.shipments[0].dispatched_at}));
  const stateRoot=join(f.parent,'analysis-session');mkdirSync(stateRoot,{mode:0o700});
  const sessions=createProtectedSessionAdapterV1({optIn:true,origin:'https://pan549.test:4443',identity,stateRoot});
  return {...f,sessions,headers:issued(sessions),selector:{schemaVersion:'pansphaira.workspace-analysis/read/v1',objectId,expectedNativeRevision:null,expectedResultRevision:null,asOf:cutoff}};
 }catch(error){f.close();throw error;}
}

test('PUI-08-AC01/04 bounded native analysis reads real leading stock and independently agrees with persisted receipt-minus-issue, preserving missing facts',async(t)=>{
 const f=await analysisFixture();
 try{
  const before=nativeRows(f.root,'SELECT revision,command,event FROM pan515_events ORDER BY revision');
  const commands=before.map(row=>JSON.parse(row.command));
  const independentPhysical=commands.filter(c=>c.kind==='RECEIPT').reduce((s,c)=>s+c.quantity,0)-commands.filter(c=>c.kind==='ISSUE').reduce((s,c)=>s+c.quantity,0);
  assert.equal(independentPhysical,2);
  const source=trade.readPan515TradeState({root:f.root,asOf:cutoff,projection:projectionRequest});
  assert.equal(typeof analysis?.createNativeAnalysisReadAdapterV1,'function','PAN549_ACTUAL_PROTECTED_NATIVE_RESULT_ADAPTER_NOT_IMPLEMENTED');
  const reader=analysis.createNativeAnalysisReadAdapterV1({optIn:true,root:f.root,sessions:f.sessions});
  const result=reader.read(f.headers,f.selector);
  assert.equal(result.schemaVersion,'pansphaira.workspace-analysis/result/v1');
  assert.equal(result.objectId,objectId);assert.equal(result.binding.tenantId,'tenant-a');assert.equal(result.binding.origin,f.sessions.origin);
  assert.equal(result.source.entrypoint,'src/pan515/trade-state.mjs#readPan515TradeState');
  assert.equal(result.source.schemaVersion,source.schemaVersion);assert.equal(result.source.projectionDigest,source.projectionDigest);
  assert.deepEqual(result.source.snapshot,source.snapshot);assert.deepEqual(result.source.grain,source.grain);
  const unsigned=Object.fromEntries(Object.entries(result).filter(([k])=>k!=='resultRevision'));
  assert.equal(result.resultRevision,createHash('sha256').update(canonicalJson(unsigned)).digest('hex'));assert.equal(result.source.snapshot.asOf,cutoff);
  const rows=Object.fromEntries(result.rows.map(row=>[row.key,row]));
  assert.equal(rows.physical.value,independentPhysical);assert.equal(rows.physical.unit,'STK');assert.equal(rows.reserved.value,2);assert.equal(rows.quarantined.value,0);assert.equal(rows.free.value,0);
  assert.equal(rows.stockRunwayDays.state,'UNAVAILABLE');assert.equal(rows.stockRunwayDays.value,null);assert.equal(rows.stockRunwayDays.reason,source.facts.stockRunwayDays.reason);
  assert.equal(rows.stockValueMinor.state,'UNAVAILABLE');assert.equal(rows.stockValueMinor.value,null);
  assert.equal(result.availability,'PARTIAL');assert.equal(result.proposalOnly,false);assert.equal(result.effectsProduced,false);assert.equal(result.executionAuthorityGranted,false);
  assert.equal(result.consentChanged,false);assert.equal(result.transportEnabled,false);
  assert.throws(()=>reader.read({origin:f.sessions.origin},f.selector),/HOSTED_SESSION_DENIED/);
  assert.throws(()=>reader.read({...f.headers,origin:'https://outside.invalid'},f.selector),/ANALYSIS_ORIGIN_OR_ROLE_DENIED/);
  for(const selector of [{...f.selector,schemaVersion:'unsupported'},{...f.selector,objectId:'foreign-object'}])assert.throws(()=>reader.read(f.headers,selector),/ANALYSIS_OBJECT_BINDING_DENIED/);
  assert.throws(()=>reader.read(f.headers,{...f.selector,expectedNativeRevision:result.source.snapshot.nativeRevision+1}),/ANALYSIS_NATIVE_REVISION_STALE/);
  assert.throws(()=>reader.read(f.headers,{...f.selector,expectedResultRevision:'0'.repeat(64)}),/ANALYSIS_RESULT_REVISION_STALE/);
  const foreignRoot=join(f.parent,'analysis-foreign-session');mkdirSync(foreignRoot,{mode:0o700});
  const foreign=createProtectedSessionAdapterV1({optIn:true,origin:f.sessions.origin,identity:{...identity,tenantId:'tenant-b'},stateRoot:foreignRoot});
  assert.throws(()=>reader.read({...f.headers,cookie:issued(foreign).cookie},f.selector),/HOSTED_SESSION_DENIED/,'genuinely issued foreign-tenant session is not a structural authority stub');
  // Test-process-only clock control around a real branded/HMAC-backed session
  // and the real synchronous SQLite projection; no source or adapter substitute.
  const now=Date.now(),expiresAtMs=now+60000,clock=t.mock.method(Date,'now',()=>now);
  try{
   const expiring=f.sessions.issueOwnerSession({subjectId:'synthetic:analysis-post-read-expiry',role:'reader',expiresAtMs});
   const headers={cookie:expiring.cookieHeader,origin:f.sessions.origin};let checks=0;
   clock.mock.mockImplementation(()=>++checks<=2?now:expiresAtMs+1);
   assert.throws(()=>reader.read(headers,f.selector),/HOSTED_SESSION_DENIED/,'actual session expires between its live pre-read and post-source authentication');
   assert.equal(checks,4,'two genuine checks before native source consumption and two rejecting post-source checks');
   clock.mock.mockImplementation(()=>expiresAtMs+1);
   assert.throws(()=>reader.read(headers,f.selector),/HOSTED_SESSION_DENIED/,'same genuinely expired cookie stays denied on a later read');
  }finally{clock.mock.restore();}
  assert.deepEqual(nativeRows(f.root,'SELECT revision,command,event FROM pan515_events ORDER BY revision'),before,'analysis read is not a second stock or event writer');
 }finally{f.close();}
});

test('PUI-08-AC02/03 actual stock result has a closed versioned runtime contract, defensive frozen bytes and no UNKNOWN-to-zero or effect/consent escalation',async()=>{
 const f=await analysisFixture();
 try{
  const reader=analysis.createNativeAnalysisReadAdapterV1({optIn:true,root:f.root,sessions:f.sessions});
  const result=reader.read(f.headers,f.selector);
  const path=new URL('../../dist/packages/contracts/src/workspace-analysis-v1.js',import.meta.url);
  const contract=existsSync(path)?await import(path):null;
  assert.equal(typeof contract?.validateWorkspaceAnalysisResultV1,'function','PAN549_CLOSED_VERSIONED_RESULT_RUNTIME_TYPES_NOT_IMPLEMENTED');
  const bound=contract.validateWorkspaceAnalysisResultV1(result,result.binding);
  assert.deepEqual(bound,result);assert.notEqual(bound,result);assert.equal(Object.isFrozen(bound),true);assert.equal(Object.isFrozen(bound.rows),true);
  for(const asOf of [null,'2028-02-29T00:00:00Z','2000-02-29T23:59:59+02:00','2026-06-30T23:59:59+02:00']){
   assert.deepEqual(contract.validateWorkspaceAnalysisReadV1({...f.selector,asOf}),{...f.selector,asOf});
   const control=structuredClone(result);control.source.snapshot.asOf=asOf;assert.equal(contract.validateWorkspaceAnalysisResultV1(control,result.binding).source.snapshot.asOf,asOf);
  }
  for(const asOf of ['2026-02-30T00:00:00Z','2025-02-29T00:00:00Z','1900-02-29T00:00:00Z','2026-04-31T00:00:00Z','2026-06-30T24:00:00Z','2026-06-30T23:60:00Z','2026-06-30T23:59:60Z','2026-06-30T23:59:59+24:00','2026-06-30T23:59:59+02:60']){
   assert.throws(()=>contract.validateWorkspaceAnalysisReadV1({...f.selector,asOf}),/ANALYSIS_RESULT_CONTRACT_DENIED/);
   const hostile=structuredClone(result);hostile.source.snapshot.asOf=asOf;assert.throws(()=>contract.validateWorkspaceAnalysisResultV1(hostile,result.binding),/ANALYSIS_RESULT_CONTRACT_DENIED/);
  }
  for(const mutate of [v=>{v.rows[4].state='UNKNOWN';v.rows[4].value=0;},v=>{v.rows[4].value=0;},v=>{v.effectsProduced=true;},v=>{v.executionAuthorityGranted=true;},v=>{v.consentChanged=true;},v=>{v.transportEnabled=true;},v=>{v.resultRevision='0'.repeat(64);},v=>{v.source.grain.tenantId='SYN-TENANT-99';},v=>{v.binding.tenantId='tenant-b';},v=>{v.sql='SELECT * FROM objects';}]){
   const hostile=structuredClone(result);mutate(hostile);await assert.rejects(contract.verifyWorkspaceAnalysisResultIntegrityV1(hostile,result.binding),/ANALYSIS_RESULT_CONTRACT_DENIED/);
  }
  let calls=0;const getter=structuredClone(result);Object.defineProperty(getter.rows[0],'value',{enumerable:true,get(){calls++;return 2;}});
  assert.throws(()=>contract.validateWorkspaceAnalysisResultV1(getter,result.binding),/ANALYSIS_RESULT_CONTRACT_DENIED/);assert.equal(calls,0);
 }finally{f.close();}
});

test('PUI-08 direct selector admission rejects malformed cutoffs before any native SQLite query and preserves explicit null',async(t)=>{
 const f=await analysisFixture();
 try{
  const reader=analysis.createNativeAnalysisReadAdapterV1({optIn:true,root:f.root,sessions:f.sessions});
  const prepare=DatabaseSync.prototype.prepare;let reads=0;
  const observer=t.mock.method(DatabaseSync.prototype,'prepare',function(...args){reads++;return prepare.apply(this,args);});
  try{
   for(const asOf of [undefined,1,{},'2026-06-30','2026-02-30T00:00:00Z']){
    assert.throws(()=>reader.read(f.headers,{...f.selector,asOf}),/ANALYSIS_READ_REQUEST_DENIED/);
    assert.equal(reads,0,'invalid selector must not reach the unchanged actual SQLite provider');
   }
   for(const asOf of [null,cutoff])assert.equal(reader.read(f.headers,{...f.selector,asOf}).source.snapshot.asOf,asOf);
   assert.ok(reads>0,'valid selectors still consume the genuine native SQLite provider');
  }finally{observer.mock.restore();}
 }finally{f.close();}
});

test('PUI-08-AC04 direct native-result consumer verifies complete result bytes rather than shape or a copied digest, including separate cohort revision',async()=>{
 const f=await analysisFixture();
 try{
  const reader=analysis.createNativeAnalysisReadAdapterV1({optIn:true,root:f.root,sessions:f.sessions});const result=reader.read(f.headers,f.selector);
  const contract=await import('../../dist/packages/contracts/src/workspace-analysis-v1.js');
  assert.equal(typeof contract.verifyWorkspaceAnalysisResultIntegrityV1,'function','PAN549_FULL_RESULT_INTEGRITY_CONSUMER_NOT_IMPLEMENTED');
  assert.deepEqual(await contract.verifyWorkspaceAnalysisResultIntegrityV1(result,result.binding),result);
  for(const change of [v=>{v.rows[0].value++;},v=>{v.source.snapshot.nativeRevision++;},v=>{v.source.projectionDigest='0'.repeat(64);}]){
   const hostile=structuredClone(result);change(hostile);await assert.rejects(contract.verifyWorkspaceAnalysisResultIntegrityV1(hostile,result.binding),/ANALYSIS_RESULT_CONTRACT_DENIED/);
  }
 }finally{f.close();}
});
