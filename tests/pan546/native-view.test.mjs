import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
import {nativeViewFixture546} from './native-fixture.mjs';
const move=position=>[{kind:'MOVE',instanceId:'native-review',position}];
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function counts(f){const db=new DatabaseSync(join(f.root,'browser-profiles.sqlite'),{readOnly:true});try{return {views:db.prepare('SELECT COUNT(*) AS n FROM workspace_module_views').get().n,history:db.prepare('SELECT COUNT(*) AS n FROM workspace_module_view_history').get().n,legacy:db.prepare('SELECT COUNT(*) AS n FROM browser_profiles').get().n};}finally{db.close();}}
test('DUI-04 two actually allowed native invoices plus independent Human read supply real source revisions, units and no invented relations',async()=>{
 const f=await nativeViewFixture546();try{
  for(const id of ['AP-PAN516-MATCHED-01','AP-PAN516-PARTIAL-01']){
   const t=f.tab(f.issue(),id),q=f.query(t,['erv.invoice.amountMinor','erv.invoice.currency','erv.invoice.liabilityStatus','erv.human.reviewState']);
   const invoice=f.reader.read({tenantId:'tenant-a',objectId:id,expectedRevision:t.context.primaryObject.revision}),human=f.human.read(t.headers,{invoiceId:id});
   assert.equal(q.cells[0].value,invoice.invoiceAmountMinor);assert.equal(q.cells[0].unit,'CURRENCY_MINOR');assert.equal(q.cells[1].value,invoice.currency);assert.equal(q.cells[2].value,invoice.status);assert.equal(q.cells[3].value,human.state);assert.notEqual(q.cells[3].value,invoice.status);assert.equal(q.cells[3].source,'HUMAN_NATIVE');assert.equal(q.cells[3].sourceRevision,human.proposalRevision);assert.deepEqual(q.sourceRevisions,{erv:invoice.revision,human:human.proposalRevision});assert.equal(q.businessEffectProduced,false);
   assert.ok(q.unavailableRelations.every(x=>x.state==='UNAVAILABLE'&&!Object.hasOwn(x,'value')));assert.throws(()=>f.query(t,['erv.invoice.supplier']),/DATA_FIELD_DENIED/);assert.throws(()=>f.query(t,['erv.human.assignee']),/DATA_FIELD_DENIED/);assert.throws(()=>f.query(t,Array(9).fill('erv.invoice.currency')),/DATA_QUERY_BUDGET_DENIED/);assert.throws(()=>f.data.read(t.headers,{schemaVersion:'pansphaira.workspace-data-read/v1',context:f.verification(t),fieldIds:['erv.invoice.currency'],query:'SELECT *'}),/DATA_QUERY_DENIED/);assert.throws(()=>f.data.metadata({...t.headers,'x-tenant':'tenant-b'},f.verification(t)),/HOSTED_HEADER_AUTHORITY_DENIED/);
  }
  assert.equal(nativeRows(f.native.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,0);assert.deepEqual(counts(f),{views:0,history:0,legacy:0});
 }finally{await f.close();}
});
test('DUI-03 native manual/agent candidates have identical digest; preview and cancel have no persistence; confirmed target requires independent GET',async()=>{
 const f=await nativeViewFixture546();try{
  const t=f.tab(),principal=f.sessions.authenticate(t.headers),legacy=JSON.stringify(f.legacy.read(principal)),native=f.reader.read({tenantId:'tenant-a',objectId:t.context.primaryObject.objectId,expectedRevision:null});
  const manual=f.preview(t,move(0)),agent=f.preview(t,JSON.parse(JSON.stringify(move(0))));assert.equal(manual.candidateDigest,agent.candidateDigest);assert.equal(manual.afterDigest,agent.afterDigest);assert.equal(agent.previewOnly,true);assert.equal(agent.persistenceProduced,false);assert.deepEqual(counts(f),{views:0,history:0,legacy:0});
  const {confirmation,...cancel}=f.confirmation(t,agent);const cancelled=f.view.cancel(t.headers,{...cancel,schemaVersion:'pansphaira.workspace-module-view/cancel/v1'});assert.equal(cancelled.outcome,'VIEW_PREVIEW_CANCELLED');assert.deepEqual(counts(f),{views:0,history:0,legacy:0});assert.equal(JSON.stringify(f.legacy.read(principal)),legacy);assert.deepEqual(f.reader.read({tenantId:'tenant-a',objectId:t.context.primaryObject.objectId,expectedRevision:null}),native);assert.equal(nativeRows(f.native.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,0);
 }finally{await f.close();}
});
test('DUI-03 persisted personal view is separate from native facts/legacy bytes and exactly read back through another actual SQLite connection',async()=>{
 const f=await nativeViewFixture546();try{
  const t=f.tab(),principal=f.sessions.authenticate(t.headers),legacy=JSON.stringify(f.legacy.read(principal)),fact=f.reader.read({tenantId:'tenant-a',objectId:t.context.primaryObject.objectId,expectedRevision:null});
  const p=f.preview(t,[...move(0),{kind:'RESIZE',instanceId:'native-review',size:'large'},{kind:'SHOW',instanceId:'invoice-table',visible:false}]);const receipt=f.view.confirm(t.headers,f.confirmation(t,p));assert.equal(receipt.revision,1);assert.equal(receipt.independentReadbackRequired,true);assert.equal(receipt.confirmedCandidateDigest,p.candidateDigest);
  assert.throws(()=>f.context.verify(t.headers,f.verification(t)),/CONTEXT_REVISION_STALE/);f.fresh(t);
  const read=f.otherView.read(t.headers,f.verification(t));assert.equal(read.independentNativeRead,true);assert.equal(read.revision,1);assert.deepEqual(read.view,p.afterView);assert.equal(read.viewDigest,p.afterDigest);assert.equal(read.confirmedCandidateDigest,p.candidateDigest);assert.equal(read.persisted,true);assert.equal(JSON.stringify(f.legacy.read(principal)),legacy);assert.deepEqual(f.reader.read({tenantId:'tenant-a',objectId:t.context.primaryObject.objectId,expectedRevision:null}),fact);assert.equal(nativeRows(f.native.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,0);assert.deepEqual(counts(f),{views:1,history:2,legacy:0});
 }finally{await f.close();}
});
test('DUI-03 two authenticated tabs and two real connections cannot overwrite the same CAS revision or replay an uncertain already persisted write',async()=>{
 const f=await nativeViewFixture546();try{
  const headers=f.issue(),a=f.tab(headers),b=f.tab(headers),pa=f.preview(a,move(0)),pb=f.preview(b,move(1),f.otherView);assert.equal(pa.expectedRevision,pb.expectedRevision);
  const c=f.confirmation(a,pa),receipt=f.view.confirm(a.headers,c);assert.equal(receipt.revision,1);
  assert.throws(()=>f.otherView.confirm(b.headers,f.confirmation(b,pb)),/CONTEXT_REVISION_STALE|VIEW_REVISION_CONFLICT/);assert.throws(()=>f.view.confirm(a.headers,c),/CONTEXT_REVISION_STALE|VIEW_CANDIDATE_EXPIRED_OR_CONSUMED/);
  const principal=f.sessions.authenticate(b.headers);assert.throws(()=>f.otherStore.write(principal,{expectedRevision:0,view:pb.afterView,viewDigest:pb.afterDigest,candidateDigest:pb.candidateDigest}),/VIEW_REVISION_CONFLICT/);f.fresh(b);const read=f.otherView.read(b.headers,f.verification(b));assert.equal(read.revision,1);assert.equal(read.confirmedCandidateDigest,pa.candidateDigest);assert.equal(read.viewDigest,pa.afterDigest);assert.deepEqual(counts(f),{views:1,history:2,legacy:0});
 }finally{await f.close();}
});
test('DUI-03 changed consent digest, foreign tab/session and role spoof deny; personal reader save never grants Human mutation authority',async()=>{
 const f=await nativeViewFixture546();try{
  const headers=f.issue(),a=f.tab(headers),b=f.tab(headers),p=f.preview(a,move(0)),c=f.confirmation(a,p);
  assert.throws(()=>f.view.confirm(a.headers,{...c,candidateDigest:'f'.repeat(64)}),/VIEW_CANDIDATE_MODIFIED_DENIED/);assert.throws(()=>f.view.confirm(b.headers,{...c,context:f.verification(b)}),/VIEW_CANDIDATE_STALE/);
  const reader=f.tab(f.issue('synthetic:erv-reader','reader')),rp=f.preview(reader,move(0));assert.throws(()=>f.view.confirm({...a.headers,'x-role':'reviewer'},c),/HOSTED_HEADER_AUTHORITY_DENIED/);assert.throws(()=>f.view.confirm(a.headers,{...c,view:p.afterView}),/VIEW_CANDIDATE_COMMAND_DENIED/);assert.throws(()=>f.view.confirm(a.headers,{...c,confirmation:'YES'}),/VIEW_CONFIRMATION_DENIED/);assert.throws(()=>f.view.confirm({...a.headers,origin:'https://foreign.invalid'},c),/HOSTED_CSRF_DENIED/);
  const relogin=f.tab(f.issue());assert.throws(()=>f.view.confirm(relogin.headers,{...c,context:f.verification(relogin)}),/VIEW_CANDIDATE_STALE/);assert.deepEqual(counts(f),{views:0,history:0,legacy:0});assert.equal(nativeRows(f.native.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,0);
  const allowed=f.view.confirm(reader.headers,f.confirmation(reader,rp));assert.equal(allowed.businessEffectProduced,false);assert.equal(allowed.executionAuthorityGranted,false);f.fresh(reader);assert.equal(f.otherView.read(reader.headers,f.verification(reader)).viewDigest,rp.afterDigest);
  const proposal=f.human.read(reader.headers,{invoiceId:reader.context.primaryObject.objectId});assert.throws(()=>f.human.decide(reader.headers,{schemaVersion:'pansphaira.erv-human/decision/v1',invoiceId:proposal.invoiceId,effectId:'synthetic:pan546-reader-denied',transportId:'synthetic:pan546-reader-denied-wire',expectedNativeRevision:proposal.nativeRevision,expectedProposalRevision:proposal.proposalRevision,proposalDigest:proposal.proposalDigest,action:'REVIEW'}),/HOSTED_ROLE_DENIED/);assert.equal(nativeRows(f.native.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,0);assert.deepEqual(counts(f),{views:1,history:2,legacy:0});
 }finally{await f.close();}
});
test('DUI-03 saved Undo creates a new authorized CAS revision and cannot roll over a concurrent edit',async()=>{
 const f=await nativeViewFixture546();try{
  const headers=f.issue(),a=f.tab(headers),b=f.tab(headers);let p=f.preview(a,move(0));f.view.confirm(a.headers,f.confirmation(a,p));f.fresh(a);f.fresh(b);
  const undo=f.view.previewUndo(a.headers,{schemaVersion:'pansphaira.workspace-module-view/undo-preview/v1',context:f.verification(a),targetRevision:0});const concurrent=f.preview(b,[{kind:'RESIZE',instanceId:'native-review',size:'large'}],f.otherView);f.otherView.confirm(b.headers,f.confirmation(b,concurrent));
  assert.throws(()=>f.view.confirm(a.headers,f.confirmation(a,undo)),/CONTEXT_REVISION_STALE|VIEW_REVISION_CONFLICT/);f.fresh(a);
  const actualUndo=f.view.previewUndo(a.headers,{schemaVersion:'pansphaira.workspace-module-view/undo-preview/v1',context:f.verification(a),targetRevision:0});const receipt=f.view.confirm(a.headers,f.confirmation(a,actualUndo));assert.equal(receipt.revision,3);assert.equal(receipt.kind,'UNDO');f.fresh(a);const read=f.otherView.read(a.headers,f.verification(a));assert.equal(read.revision,3);assert.equal(read.viewDigest,actualUndo.afterDigest);assert.equal(read.view.instances[0].instanceId,'invoice-value');assert.equal(f.otherStore.historical(f.sessions.authenticate(a.headers),2).viewDigest,concurrent.afterDigest);assert.deepEqual(counts(f),{views:1,history:4,legacy:0});
 }finally{await f.close();}
});
test('DUI-03 actual fresh Node process and relogin read persisted view/digest/CAS; session cookie and invoice values are absent from view JSON',async()=>{
 const f=await nativeViewFixture546();try{
  const t=f.tab(),p=f.preview(t,move(0));f.view.confirm(t.headers,f.confirmation(t,p));const principal=f.sessions.authenticate(t.headers);
  const program="import {createWorkspaceModuleViewStoreV1} from './src/pan543/profile-store.mjs';import {nativeWorkspaceViewFieldsV1} from './src/pan546/native-data-catalog.mjs';const s=createWorkspaceModuleViewStoreV1({root:process.argv[1],fields:nativeWorkspaceViewFieldsV1});console.log(JSON.stringify(s.read(JSON.parse(process.argv[2]))));s.close();";
  const child=spawnSync(process.execPath,['--input-type=module','-e',program,f.root,JSON.stringify(principal)],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);const actual=JSON.parse(child.stdout);assert.equal(actual.revision,1);assert.equal(actual.viewDigest,p.afterDigest);assert.equal(actual.confirmedCandidateDigest,p.candidateDigest);assert.equal(hash(actual.view),p.afterDigest);
  const relogin=f.tab(f.issue());assert.equal(f.view.read(relogin.headers,f.verification(relogin)).viewDigest,p.afterDigest);
  const db=new DatabaseSync(join(f.root,'browser-profiles.sqlite'),{readOnly:true});try{const row=db.prepare('SELECT view_json FROM workspace_module_views').get();assert.ok(!row.view_json.includes(t.headers.cookie));assert.ok(!row.view_json.includes('invoiceAmountMinor'));assert.ok(!row.view_json.includes('subjectId'));assert.ok(!row.view_json.includes('tenantId'));}finally{db.close();}
 }finally{await f.close();}
});
test('DUI-04 native Human revision advances independently of liability and invalidates prior view consent without writing a personal view',async()=>{
 const f=await nativeViewFixture546();try{
  const t=f.tab(),p=f.preview(t,move(0)),before=f.query(t,['erv.invoice.liabilityStatus','erv.human.reviewState']),proposal=f.human.read(t.headers,{invoiceId:t.context.primaryObject.objectId});
  f.human.decide(t.headers,{schemaVersion:'pansphaira.erv-human/decision/v1',invoiceId:proposal.invoiceId,effectId:'synthetic:pan546-source-drift-001',transportId:'synthetic:pan546-source-drift-wire',expectedNativeRevision:proposal.nativeRevision,expectedProposalRevision:proposal.proposalRevision,proposalDigest:proposal.proposalDigest,action:'REVIEW'});
  const after=f.query(t,['erv.invoice.liabilityStatus','erv.human.reviewState']);assert.equal(after.sourceRevisions.erv,before.sourceRevisions.erv);assert.equal(after.sourceRevisions.human,before.sourceRevisions.human+1);assert.equal(after.cells[0].value,before.cells[0].value);assert.notEqual(after.cells[1].value,before.cells[1].value);assert.throws(()=>f.view.confirm(t.headers,f.confirmation(t,p)),/VIEW_CANDIDATE_STALE/);assert.deepEqual(counts(f),{views:0,history:0,legacy:0});assert.equal(nativeRows(f.native.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,1,'only the separately authorized actual Human decision occurred, not the view attempt');
 }finally{await f.close();}
});
