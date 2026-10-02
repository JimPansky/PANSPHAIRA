import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync,existsSync,symlinkSync} from 'node:fs';
import {join,dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {runOriginalErvPairV1,runOriginalErvVariantV1,runOriginalSetupV1,originalSetupInputV1,originalExecutionIdentityV1} from '../../src/pan360/original-erv-execution-v1.mjs';
import {originalInvoiceRequestV1,intakeOriginalInvoiceV1,readOriginalInvoiceV1,createOriginalInvoiceStoreV1} from '../../src/pan360/original-invoice-input-v1.mjs';
import {canonical,digest,loadOriginalErvProfileV1} from '../../src/pan360/original-erv-core-v1.mjs';
import {verifyTrustedErvUiSourceV1,genericReferenceConsumerRender} from '../../erv-ui-reference/reference.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const args=(caseId='three-way-discriminating200',documentId='high')=>{
 const setupInput=originalSetupInputV1();return {label:'MODIFIED',caseId,setupInput,configurationDelta:runOriginalSetupV1(setupInput).configurationDelta,expectedIdentity:originalExecutionIdentityV1(),request:originalInvoiceRequestV1(documentId)};
};
const fields=e=>e.uiConsumer.screens[0].sections[0].components.map(c=>c.field);
const field=(e,id)=>fields(e).find(f=>f.fieldId===id);

test('PAN360 real pair: observed high invoice intake/extraction, actual same core, advisor, UI, approval journal and readback',async()=>{
 const pair=await runOriginalErvPairV1();assert.equal(pair.outcome,'EXECUTED_PAIR');
 const b=pair.baseline.execution,m=pair.modified.execution;
 assert.deepEqual(b.sourceIdentity,m.sourceIdentity);assert.deepEqual(b.document,m.document);
 assert.equal(b.extraction.fields.grossAmountMinor.value,1200000);assert.equal(b.intakeReadback.outcome,'FOUND');
 assert.equal(b.extraction.fields.purchaseOrderNumber.state,'UNKNOWN');assert.equal(b.extraction.fields.receiptReference.state,'UNKNOWN');
 assert.equal(b.decision.outcome,'MATCHED');assert.equal(b.decision.matchingScope,'INVOICE_ONLY_VALIDATION_NO_PO_OR_RECEIPT_MATCH');
 assert.equal(m.decision.outcome,'MATCHED');assert.equal(m.decision.appliedRateBasisPoints,200);
 assert.equal(m.decision.matchingScope,'FULL_DECLARED_THREE_WAY_RELATIONAL_MATCH');
 assert.equal(b.approval.state,'NOT_REQUIRED');assert.equal(m.approval.state,'REQUIRES_SEPARATE_APPROVAL');
 assert.equal(m.approvalRecord.state,'APPROVED_LOCAL_EVIDENCE_ONLY');assert.notEqual(m.approvalRecord.requester,m.approvalRecord.approver);
 assert.equal(field(b,'purchase-order').state,'UNKNOWN');assert.equal(field(m,'purchase-order').state,'VALUE');
 assert.equal(field(b,'receipt').state,'UNKNOWN');assert.equal(field(m,'receipt').state,'VALUE');
 assert.notEqual(b.uiConsumer.snapshotDigest,m.uiConsumer.snapshotDigest);
 assert.notDeepEqual(b.decision.advisor.questions,m.decision.advisor.questions);
 for(const e of [b,m]){
  assert.equal(e.ownedFilesystemCleanup,'OWNED_DIRECTORY_REMOVED');assert.equal(e.uiConsumer.outcome,'RENDERED');
  assert.equal(verifyTrustedErvUiSourceV1(e.ui,e.uiSourceTrustedDigest).valid,true);
  assert.equal(e.ui.authority.mode,'NONE');assert.equal(e.decision.authority.productivePostingAuthorized,false);
  const {executionDigest,...body}=e;assert.equal(digest(body),executionDigest);
 }
 assert.equal(pair.reuseReceipt.coreModuleDigestsIdentical,true);
 assert.equal(pair.reuseReceipt.originalBehavior.changedSeparateApprovalActuallyJournaled,true);
 const {reuseReceiptDigest,...r}=pair.reuseReceipt;assert.equal(digest(r),reuseReceiptDigest);
});
test('PAN360 actual threshold journey: below/equal/above from three pinned document bytes, not substituted extraction',async()=>{
 for(const [id,doc,amount,state] of [['threshold-below','below',999999,'NOT_REQUIRED'],['threshold-equal','equal',1000000,'NOT_REQUIRED'],['threshold-above','above',1000001,'REQUIRES_SEPARATE_APPROVAL']]){
  const r=await runOriginalErvVariantV1(args(id,doc));assert.equal(r.outcome,'EXECUTED');
  assert.equal(r.execution.extraction.fields.grossAmountMinor.value,amount);assert.equal(r.execution.approval.state,state);
  assert.equal(r.execution.approval.comparison,'STRICTLY_GREATER_THAN');
 }
});
test('PAN360 composed missing-evidence/mismatch: advisor cites observed decision and UI keeps missing references UNKNOWN',async()=>{
 for(const [id,expected] of [['three-way-missing-po','EXCEPTION'],['three-way-missing-receipt','EXCEPTION'],['three-way-outside200','CONFLICT'],['three-way-wrong-supplierId','CONFLICT'],['three-way-wrong-quantity','CONFLICT'],['three-way-wrong-unit','CONFLICT'],['three-way-wrong-currency','CONFLICT'],['three-way-duplicate-po','EXCEPTION']]){
  const r=await runOriginalErvVariantV1(args(id));assert.equal(r.outcome,'EXECUTED',id);assert.equal(r.execution.decision.outcome,expected,id);
  assert.equal(r.execution.approval.state,'BLOCKED_DECISION');assert.equal(r.execution.decision.advisor.advisorAuthority,'EVIDENCE_CITING_ONLY');
  assert.ok(r.execution.decision.advisor.questions[0].citations.length>0);
  if(id==='three-way-missing-po')assert.equal(field(r.execution,'purchase-order').state,'UNKNOWN');
  if(id==='three-way-missing-receipt')assert.equal(field(r.execution,'receipt').state,'UNKNOWN');
 }
});
test('PAN360 dialogue: missing delta, declined/missing answers, invented/100bps re-digested config and hidden authority deny',async()=>{
 let a=args();delete a.configurationDelta;assert.equal((await runOriginalErvVariantV1(a)).reasonCode,'DIALOGUE_DELTA_MISSING');
 for(const mutate of [x=>x.answers.pop(),x=>{x.answers[0].answer='DECLINE';},x=>{x.answers[0].answer='SUBSTITUTED';}]){
  a=args();mutate(a.setupInput);assert.equal((await runOriginalErvVariantV1(a)).reasonCode,'DIALOGUE_NOT_RESOLVED');
 }
 for(const mutate of [x=>{x.modified.rateBasisPoints=100;},x=>{x.modified.matchingMode.variantId='INVENTED';},x=>{x.authorityGranted=true;}]){
  a=args();a.configurationDelta=structuredClone(a.configurationDelta);mutate(a.configurationDelta);
  const {configurationDeltaDigest,...body}=a.configurationDelta;void configurationDeltaDigest;a.configurationDelta.configurationDeltaDigest=digest(body);
  assert.equal((await runOriginalErvVariantV1(a)).reasonCode,'DIALOGUE_DELTA_IDENTITY_DENIED');
 }
 a=args('three-way-legacy100-conflict');assert.equal((await runOriginalErvVariantV1(a)).reasonCode,'EXECUTABLE_CONFIGURATION_IDENTITY_DENIED');
 a=args();a.setupInput=structuredClone(a.setupInput);a.setupInput.changed.tolerancePolicy.rateBasisPoints=100;assert.equal((await runOriginalErvVariantV1(a)).reasonCode,'DIALOGUE_NOT_RESOLVED');
});
test('PAN360 deterministic dialogue/pair replay and observed-document substitution denial',async()=>{
 const input=originalSetupInputV1(),reordered=structuredClone(input);reordered.answers.reverse();
 assert.deepEqual(runOriginalSetupV1(input),runOriginalSetupV1(reordered));
 assert.deepEqual(await runOriginalErvPairV1(),await runOriginalErvPairV1());
 const a=args();a.request=originalInvoiceRequestV1('above');assert.equal((await runOriginalErvVariantV1(a)).reasonCode,'OBSERVED_DOCUMENT_REFERENCE_MISMATCH');
});
test('PAN360 intake negatives: duplicate, tamper/re-digest, cancellation, hidden authority and missing readback',async()=>{
 const store=createOriginalInvoiceStoreV1();const accepted=await intakeOriginalInvoiceV1(originalInvoiceRequestV1(),store);assert.equal(accepted.outcome,'ACCEPTED');
 assert.equal((await intakeOriginalInvoiceV1(originalInvoiceRequestV1(),store)).reasonCode,'DUPLICATE_CONTENT_DENIED');
 const r=originalInvoiceRequestV1();r.bytes[0]^=1;assert.equal((await intakeOriginalInvoiceV1(r,createOriginalInvoiceStoreV1())).reasonCode,'TAMPERED_CONTENT_DENIED');
 const cancelled=originalInvoiceRequestV1();cancelled.cancelled=true;const empty=createOriginalInvoiceStoreV1();assert.equal((await intakeOriginalInvoiceV1(cancelled,empty)).outcome,'CANCELLED');assert.equal(empty.size,0);
 const effect=originalInvoiceRequestV1();effect.requestedEffects.push('POST_PRODUCTIVE');assert.equal((await intakeOriginalInvoiceV1(effect,empty)).reasonCode,'EFFECT_DENIED');
 const hidden=originalInvoiceRequestV1();hidden.authorityGranted=true;assert.equal((await intakeOriginalInvoiceV1(hidden,empty)).reasonCode,'INPUT_SHAPE_DENIED');
 assert.equal((await readOriginalInvoiceV1(accepted.record.version.versionId,empty)).outcome,'NOT_FOUND');
 const bodyForged=structuredClone(accepted.record);bodyForged.extraction.fields.grossAmountMinor.value+=1;const {recordDigest,...body}=bodyForged;void recordDigest;bodyForged.recordDigest=digest(body);
 assert.equal((await readOriginalInvoiceV1(accepted.record.version.versionId,{getByVersionId:async()=>bodyForged})).reasonCode,'INTEGRITY_READBACK_DENIED');
});
test('PAN360 readback re-digested hidden authority is rejected, not blessed by a self-consistent record hash',async()=>{
 const accepted=await intakeOriginalInvoiceV1(originalInvoiceRequestV1(),createOriginalInvoiceStoreV1());
 for(const mutate of [r=>{r.authority.productiveBookingAuthorized=true;},r=>{r.original.path='foreign';},r=>{r.version.ordinal=2;},r=>{r.extraAuthority=true;}]){
  const r=structuredClone(accepted.record);mutate(r);const {recordDigest,...body}=r;void recordDigest;r.recordDigest=digest(body);
  assert.equal((await readOriginalInvoiceV1(r.version.versionId,{getByVersionId:async()=>r})).reasonCode,'INTEGRITY_READBACK_DENIED');
 }
});
test('PAN360 separate approval actor denial has permitted independent-actor counterpart, never productive authority',async()=>{
 const a=args();a.approvalActors={requester:'synthetic-originator',approver:'synthetic-originator'};
 assert.equal((await runOriginalErvVariantV1(a)).reasonCode,'SEPARATE_APPROVAL_ACTOR_DENIED');
 a.approvalActors={requester:'synthetic-originator',approver:'synthetic-independent-approver'};
 const permitted=await runOriginalErvVariantV1(a);assert.equal(permitted.outcome,'EXECUTED');assert.equal(permitted.execution.approvalRecord.productivePostingAuthorized,false);
});
test('PAN360 UI re-digested forgery remains renderable only as neutral data, not trusted producer evidence',async()=>{
 const pair=await runOriginalErvPairV1();const e=pair.modified.execution;const forged=structuredClone(e.ui);forged.screens[0].sections[0].components[1].field.value='FORGED';
 const {readback,...body}=forged;void readback;forged.readback.packageSha256=digest(body);
 assert.equal(genericReferenceConsumerRender(forged).outcome,'RENDERED');
 assert.equal(verifyTrustedErvUiSourceV1(forged,e.uiSourceTrustedDigest).reasonCode,'SOURCE_FORGERY_DENIED');
});
test('PAN360 actual core mutation in owned isolated public closure fails closed; original worktree bytes unchanged',()=>{
 const scratch=process.env.TMPDIR??process.env.RUNNER_TEMP;assert.ok(scratch);const owned=mkdtempSync(join(scratch,'pan360-mutation-probe-'));
 const seen=new Set();const copy=path=>{
  assert.ok(!path.startsWith('..')&&!path.startsWith('/'));if(seen.has(path))return;seen.add(path);
  const bytes=readFileSync(join(ROOT,path));const dest=join(owned,path);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,bytes);
  if(/\.(mjs|js)$/.test(path))for(const [,target] of bytes.toString().matchAll(/(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g)){
   if(target.startsWith('node:'))continue;
   if(target==='ajv/dist/2020.js')continue;
   assert.ok(target.startsWith('.'));copy(relative(ROOT,resolve(ROOT,dirname(path),target)));
  }
 };
 const before=originalExecutionIdentityV1();
 try{
  for(const row of [...before.core.bindings,...before.input.bindings,...before.bindings])copy(row.path);
  for(const p of loadOriginalErvProfileV1().documents.map(d=>d.path))copy(p);
  copy('tests/fixtures/pan360/original-erv-profile-v1.json');copy('tests/fixtures/incoming-invoice/ap-05-frozen-setup-v1.json');
  writeFileSync(join(owned,'package.json'),JSON.stringify({type:'module'}));
  symlinkSync(join(ROOT,'node_modules'),join(owned,'node_modules'),'dir');
  const target=join(owned,'dist/packages/contracts/src/incoming-invoice-erv.js');writeFileSync(target,readFileSync(target,'utf8')+'\n// owned mutation probe\n');
  const child=spawnSync(process.execPath,['--input-type=module','-e','import {runOriginalErvPairV1} from "./src/pan360/original-erv-execution-v1.mjs"; try { await runOriginalErvPairV1(); process.exitCode=2; } catch(e) { console.log(e.message); if(!e.message.startsWith("PAN360_REUSED_CORE_SOURCE_IDENTITY_DENIED:"))process.exitCode=3; }'],{cwd:owned,env:{PATH:process.env.PATH,TMPDIR:scratch},encoding:'utf8',timeout:20000});
  assert.equal(child.status,0,child.stderr);assert.match(child.stdout,/PAN360_REUSED_CORE_SOURCE_IDENTITY_DENIED:dist\/packages\/contracts\/src\/incoming-invoice-erv.js/);
 }finally{rmSync(owned,{recursive:true,force:true});}
 assert.equal(existsSync(owned),false);assert.deepEqual(originalExecutionIdentityV1(),before);
});
