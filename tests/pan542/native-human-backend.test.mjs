import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync,mkdirSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {financeFixture} from '../pan519/native-fixture.mjs';
import {nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
import {digest,readMarker} from '../../src/pan473/scope-profile.mjs';
import * as procurement from '../../src/procurement-434/bestellung-lifecycle.mjs';
import {readLocalJournalTaskIdentity,recordLocalJournalControl} from '../../demo/runtime/local-journal-owner.mjs';
import * as protectedSessions from '../../src/pan527/origin-session-adapter.mjs';
const {createProtectedSessionAdapterV1}=protectedSessions;

const entry=new URL('../../src/pan542/native-human-backend.mjs',import.meta.url);
const backend=existsSync(entry)?await import(entry):null;
// Owner-selected synthetic session metadata only. This is NOT a new image,
// live identity provider, installer acceptance or observed human approval.
const identity={schemaVersion:'pansphaira.portable-runtime/identity/v1',componentId:'pansphaira-local-demo',
  sourceCommit:'27a9103e7a481cca954bfa73745fc3b5b54cbd15',sourceTree:'3216db95d1164b3ecab2e6ecf96ae8797aed57ab',
  imageDigest:'sha256:'+'a'.repeat(64),architecture:'x86_64',productVersion:'0.2.0-poc.20260810.5',
  runtime:{name:'node',version:'24.14.1'},contractVersion:'1.0.0',instanceId:'pan542-native-human-local',tenantId:'tenant-a',generation:1,
  configurationDigest:'b'.repeat(64),templateDigest:'c'.repeat(64),policyDigest:'d'.repeat(64),networkDigest:'e'.repeat(64),authorityProfile:'SAFE_GUIDED',
  effectiveRights:['demo.status.read','demo.provider.bound.read','demo.governed.effect']};
const invoiceId='AP-PAN516-MATCHED-01';
const sessionOptions=stateRoot=>({optIn:true,origin:'https://pan542.test:4443',identity,stateRoot});
function issue(sessions,subjectId,role='reviewer'){
  const s=sessions.issueOwnerSession({subjectId,role,expiresAtMs:Date.now()+60000});
  return {cookie:s.cookieHeader,origin:sessions.origin,'x-pan527-csrf':s.csrf};
}

async function humanFixture(){
  const f=await financeFixture();
  try{
    const authRoot=join(f.parent,'human-session-state');mkdirSync(authRoot,{mode:0o700});
    const sessions=createProtectedSessionAdapterV1(sessionOptions(authRoot));
    backend.initializeNativeErvHumanBackendV1({root:f.root,owner:'LOCAL_SYNTHETIC_OWNER',sessionBinding:sessions.binding});
    const api=backend.createNativeErvHumanBackendV1({root:f.root,sessions});
    return {...f,authRoot,sessions,api,reviewer:issue(sessions,'synthetic:erv-reviewer'),approver:issue(sessions,'synthetic:erv-approver'),reader:issue(sessions,'synthetic:erv-reader','reader')};
  }catch(e){f.close();throw e;}
}
function commandFor(proposal,action,id){return {schemaVersion:'pansphaira.erv-human/decision/v1',invoiceId:proposal.invoiceId,
  effectId:'synthetic:erv-'+id,transportId:'synthetic:erv-wire-'+id,expectedNativeRevision:proposal.nativeRevision,
  expectedProposalRevision:proposal.proposalRevision,proposalDigest:proposal.proposalDigest,action};}

test('PUI-04-AC01 native configuration records actual current source bytes for every direct existing native boundary',async()=>{
  const f=await humanFixture();
  try{
    const current=f.api.read(f.reviewer,{invoiceId});
    const required=['src/pan542/native-human-backend.mjs','src/pan527/origin-session-adapter.mjs','src/pan472/draft-profile.mjs',
      'src/pan473/scope-profile.mjs','src/pan515/trade-state.mjs','src/procurement-434/bestellung-lifecycle.mjs',
      'src/procurement-434/bestellung-liability.mjs','dist/packages/contracts/src/incoming-invoice-erv.js',
      'contracts/trade/pan516-invoice-cases-v1.json','demo/runtime/local-journal-owner.mjs'];
    assert.deepEqual(current.sourceIdentity.map(x=>x.path).sort(),required.sort(),'PAN542_DIRECT_NATIVE_SOURCE_IDENTITY_INCOMPLETE');
    for(const row of current.sourceIdentity)assert.equal(row.sha256,createHash('sha256').update(readFileSync(row.path)).digest('hex'),row.path);
    const nativeBinding=JSON.parse(nativeRows(f.root,'SELECT record FROM pan542_binding WHERE id=1')[0].record);
    assert.deepEqual(nativeBinding.sourceIdentity,current.sourceIdentity);
    assert.equal(nativeBinding.roleMappingVersion,1);assert.equal(nativeBinding.scope,'LOCAL_SYNTHETIC_BACKEND_ONLY');
  }finally{f.close();}
});

test('PUI-04-AC02 existing native stop and revoke deny a new decision while safe native reads remain available',async()=>{
  for(const kind of ['STOP','REVOKE']){
    const f=await humanFixture();
    try{
      const before=f.api.read(f.reviewer,{invoiceId}),c=commandFor(before,'REVIEW','control-001'),marker=readMarker(f.root);
      const retainedTasks=readLocalJournalTaskIdentity(join(f.root,'pan453-owned-v2'));
      const controlRoot=kind==='STOP'?join(f.root,'pan473-controller','pan453-owned-v2'):join(f.root,'pan453-owned-v2');
      recordLocalJournalControl(controlRoot,{kind,sourceIdentity:marker.sourceIdentity,targetIdentity:marker.targetIdentity,
        operationKey:kind==='REVOKE'?'admin-ai:poc:erv-human:pan542:'+c.effectId:null,stopEpoch:1,issuedAtMs:Date.now(),reason:'Synthetic human decision control'});
      assert.throws(()=>f.api.decide(f.reviewer,c),/ERV_HUMAN_STOP_OR_REVOKE_DENIED/,kind);
      assert.deepEqual(f.api.read(f.reviewer,{invoiceId}),before);
      assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,0);
      assert.deepEqual(readLocalJournalTaskIdentity(join(f.root,'pan453-owned-v2')),retainedTasks,'retain the pre-existing native cutover task; add no human task on denial');
    }finally{f.close();}
  }
});

test('PUI-04-AC02 a real decision attaches its immutable task to the existing PAN453 durable fence',async()=>{
  const f=await humanFixture();
  try{
    const before=f.api.read(f.reviewer,{invoiceId});const c=commandFor(before,'REVIEW','task-attachment-001');
    f.api.decide(f.reviewer,c);
    const event=JSON.parse(nativeRows(f.root,'SELECT event FROM pan542_events WHERE ordinal=1')[0].event);
    assert.equal(typeof event.taskBinding?.taskIdentityDigest,'string','PAN542_EXISTING_DURABLE_TASK_ATTACHMENT_NOT_IMPLEMENTED');
    const ledger=readLocalJournalTaskIdentity(join(f.root,'pan453-owned-v2'));
    assert.deepEqual(ledger.identities[event.taskBinding.taskIdentityDigest],event.taskBinding);
    assert.match(event.taskBinding.operationKey,/^admin-ai:poc:erv-human:pan542:/);
    const fresh=backend.createNativeErvHumanBackendV1({root:f.root,sessions:f.sessions});
    const reconciled=fresh.reconcile(f.reviewer,{invoiceId,effectId:c.effectId});
    assert.deepEqual(reconciled.receipt.taskBinding,event.taskBinding);
    assert.equal(reconciled.newDecisionEffect,false);
    assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,1);
  }finally{f.close();}
});

test('PUI-04-AC03 native role mapping binds the protected origin realm and generation, not only a matching tenant string',async()=>{
  const f=await humanFixture();
  try{
    for(const [id,override] of [['origin',{origin:'https://other-pan542.test:4443'}],['generation',{identity:{...identity,generation:2}}],['tenant',{identity:{...identity,tenantId:'tenant-b'}}]]){
      const authRoot=join(f.parent,'other-session-'+id);mkdirSync(authRoot,{mode:0o700});
      const foreign=createProtectedSessionAdapterV1({...sessionOptions(authRoot),...override});
      assert.throws(()=>backend.createNativeErvHumanBackendV1({root:f.root,sessions:foreign}),/ERV_HUMAN_SESSION_BINDING_DENIED/,id);
    }
    assert.equal(f.api.read(f.reviewer,{invoiceId}).nativeRole,'REVIEWER');
    assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,0);
  }finally{f.close();}
});

test('PUI-04 negative missing and spoofed native role never authorize a persisted decision',async()=>{
  const f=await humanFixture();
  try{
    const proposal=f.api.read(f.reviewer,{invoiceId}),command=commandFor(proposal,'REVIEW','role-probe-001');
    assert.throws(()=>f.api.read({}, {invoiceId}),/HOSTED_SESSION_DENIED/);
    assert.throws(()=>f.api.decide(f.reader,command),/HOSTED_ROLE_DENIED/);
    assert.throws(()=>f.api.decide({...f.reviewer,'x-role':'APPROVER'},command),/HOSTED_HEADER_AUTHORITY_DENIED/);
    const unassigned=issue(f.sessions,'synthetic:unassigned-human');
    assert.throws(()=>f.api.read(unassigned,{invoiceId}),/ERV_HUMAN_NATIVE_ROLE_REQUIRED_DENIED/);
    for(const extra of [{role:'APPROVER'},{subjectId:'synthetic:erv-approver'},{roleMappingVersion:999}])
      assert.throws(()=>f.api.decide(f.reviewer,{...command,...extra}),/ERV_HUMAN_COMMAND_SHAPE_DENIED/);
    assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,0);
    assert.equal(f.api.decide(f.reviewer,command).proposalRevision,1,'permitted server-mapped counterpart');
  }finally{f.close();}
});

test('PUI-04 negative foreign invoice cannot substitute the code-bound native object',async()=>{
  const f=await humanFixture();
  try{
    const before=f.api.read(f.reviewer,{invoiceId});
    assert.throws(()=>f.api.read(f.reviewer,{invoiceId:'FOREIGN-INVOICE-001'}),/ERV_HUMAN_INVOICE_BINDING_DENIED/);
    assert.throws(()=>f.api.decide(f.reviewer,{...commandFor(before,'REVIEW','foreign-invoice-001'),invoiceId:'FOREIGN-INVOICE-001'}),/ERV_HUMAN_INVOICE_BINDING_DENIED/);
    assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,0);
    assert.equal(f.api.decide(f.reviewer,commandFor(before,'REVIEW','correct-invoice-001')).invoiceId,invoiceId);
  }finally{f.close();}
});

test('PUI-04 negative rehashed stale native or proposal revision remains denied',async()=>{
  const f=await humanFixture();
  try{
    const before=f.api.read(f.reviewer,{invoiceId}),command=commandFor(before,'REVIEW','revision-probe-001');
    const {nativeRole,subjectId,proposalDigest,...unsigned}=before;
    const falseNative={...unsigned,nativeRevision:before.nativeRevision-1};
    const falseProposal={...unsigned,proposalRevision:before.proposalRevision+1};
    assert.throws(()=>f.api.decide(f.reviewer,{...command,expectedNativeRevision:falseNative.nativeRevision,proposalDigest:digest(falseNative)}),/ERV_HUMAN_PROPOSAL_REVISION_DENIED/);
    assert.throws(()=>f.api.decide(f.reviewer,{...command,expectedProposalRevision:falseProposal.proposalRevision,proposalDigest:digest(falseProposal)}),/ERV_HUMAN_PROPOSAL_REVISION_DENIED/);
    assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,0);
    assert.equal(f.api.decide(f.reviewer,command).proposalRevision,1);
  }finally{f.close();}
});

test('PUI-04 negative client taskstore is never authoritative native persistence',async()=>{
  const f=await humanFixture();
  try{
    const before=f.api.read(f.reviewer,{invoiceId}),command=commandFor(before,'REVIEW','client-store-001');
    const forged=JSON.parse(JSON.stringify(before));forged.state='APPROVED_LOCAL_EVIDENCE_ONLY';forged.proposalRevision=123;
    assert.throws(()=>f.api.read(f.reviewer,{invoiceId,taskstore:forged}),/ERV_HUMAN_READ_REQUEST_DENIED/);
    assert.throws(()=>f.api.decide(f.reviewer,{...command,taskstore:forged}),/ERV_HUMAN_COMMAND_SHAPE_DENIED/);
    assert.throws(()=>f.api.decide(f.reviewer,{...command,receipt:{state:'APPROVED_LOCAL_EVIDENCE_ONLY'}}),/ERV_HUMAN_COMMAND_SHAPE_DENIED/);
    assert.deepEqual(f.api.read(f.reviewer,{invoiceId}),before);
    assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,0);
    assert.equal(f.api.decide(f.reviewer,command).proposalRevision,1);
  }finally{f.close();}
});

test('PUI-04-AC05 actual native confirmation drift invalidates prior evidence approval and reconciliation',async()=>{
  const f=await humanFixture();
  try{
    const before=f.api.read(f.reviewer,{invoiceId});
    const reviewed=f.api.decide(f.reviewer,commandFor(before,'REVIEW','drift-review-001'));
    const approval=commandFor(reviewed,'APPROVE_LOCAL_EVIDENCE_ONLY','drift-approval-001');
    f.api.decide(f.approver,approval);
    const native=procurement.readPan516Procurement({root:f.root}),last=native.confirmations.at(-1);
    const update={schemaVersion:'pansphaira.pan516/procurement-command/v1',effectId:'synthetic:human-confirmation-change',transportId:'synthetic:human-confirmation-wire',
      expectedRevision:native.revision,orderId:native.binding.draft.bestellungId,positionId:native.binding.draft.positionen[0].positionId,supplierId:native.binding.draft.lieferantId,
      kind:'CONFIRM',receipt:null,sourceReference:'synthetic:human-confirmation-source',
      confirmation:{revision:last.revision+1,previousConfirmationDigest:last.confirmationDigest,terms:{...last.terms,unitPriceMinor:last.terms.unitPriceMinor+1},confirmedAt:'2026-06-22T08:00:00Z'}};
    procurement.executePan516ProcurementCommand({root:f.root,command:update,grant:procurement.authorizePan516ProcurementCommand({root:f.root,owner:'LOCAL_SYNTHETIC_OWNER',command:update})});
    const stale=f.api.read(f.approver,{invoiceId});assert.equal(stale.state,'STALE_NATIVE_BASIS_REVIEW_REQUIRED');
    assert.notEqual(stale.basisDigest,reviewed.basisDigest);assert.equal(stale.nativeRevision,before.nativeRevision+1);
    assert.equal(f.api.reconcile(f.approver,{invoiceId,effectId:approval.effectId}).outcome,'OUTCOME_UNKNOWN');
    const rereview=f.api.decide(f.reviewer,commandFor(stale,'REVIEW','drift-rereview-001'));
    assert.throws(()=>f.api.decide(f.approver,commandFor(rereview,'APPROVE_LOCAL_EVIDENCE_ONLY','drift-unresolved-001')),/ERV_HUMAN_NATIVE_UNRESOLVED_APPROVAL_DENIED/);
    assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,3);
    assert.equal(procurement.readPan516Procurement({root:f.root}).revision,before.nativeRevision+1);
  }finally{f.close();}
});

test('PUI-04-AC05 unknown response loss requires fresh native reconciliation without replaying a decision',async()=>{
  const f=await humanFixture();
  try{
    const before=f.api.read(f.reviewer,{invoiceId});const command=commandFor(before,'REVIEW','lost-response-001');
    const child=spawnSync(process.execPath,['tests/pan542/restart-reader.mjs',f.root,f.authRoot],{
      input:JSON.stringify({sessionOptions:sessionOptions(f.authRoot),headers:f.reviewer,invoiceId,mode:'DECIDE_AND_DROP_RESPONSE',command}),encoding:'utf8',timeout:15000});
    assert.equal(child.status,73,child.stderr);assert.equal(child.stdout,'');assert.equal(child.signal,null);
    assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,1);
    assert.equal(typeof f.api.reconcile,'function','PAN542_NATIVE_DECISION_RECONCILIATION_NOT_IMPLEMENTED');
    const confirmed=f.api.reconcile(f.reviewer,{invoiceId,effectId:command.effectId});
    assert.equal(confirmed.outcome,'RECONCILED_LOCAL_DECISION_NO_NEW_EFFECT');
    assert.equal(confirmed.receipt.invoiceId,invoiceId);assert.equal(confirmed.receipt.state,'REVIEWED_LOCAL_EVIDENCE_ONLY');
    assert.equal(confirmed.readback.proposalRevision,1);assert.equal(confirmed.executionAuthorityGranted,false);
    const unknown=f.api.reconcile(f.reviewer,{invoiceId,effectId:'synthetic:never-dispatched'});
    assert.equal(unknown.outcome,'OUTCOME_UNKNOWN');assert.equal(unknown.receipt,null);
    assert.equal(unknown.executionAuthorityGranted,false);
    assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,1);
    assert.throws(()=>f.api.decide(f.reviewer,{...command,transportId:'synthetic:blind-retry-wire'}),/ERV_HUMAN_ALREADY_DECIDED_RECONCILE_REQUIRED/);
  }finally{f.close();}
});

test('PUI-04 negative double decision must reconcile the recorded business effect rather than repeat it under a new transport',async()=>{
  const f=await humanFixture();
  try{
    const before=f.api.read(f.reviewer,{invoiceId});const command=commandFor(before,'REVIEW','duplicate-001');
    f.api.decide(f.reviewer,command);
    assert.throws(()=>f.api.decide(f.reviewer,{...command,transportId:'synthetic:duplicate-new-transport'}),/ERV_HUMAN_ALREADY_DECIDED_RECONCILE_REQUIRED/);
    assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,1);
  }finally{f.close();}
});

test('PUI-04-AC04/05 a separate native approver persists only evidence approval and receives no execution rights',async()=>{
  const f=await humanFixture();
  try{
    const initial=f.api.read(f.reviewer,{invoiceId});
    const reviewed=f.api.decide(f.reviewer,commandFor(initial,'REVIEW','approval-review-001'));
    const approved=f.api.decide(f.approver,commandFor(reviewed,'APPROVE_LOCAL_EVIDENCE_ONLY','approval-001'));
    assert.equal(approved.state,'APPROVED_LOCAL_EVIDENCE_ONLY');assert.equal(approved.nativeRole,'APPROVER');
    assert.equal(approved.proposalRevision,2);assert.equal(approved.executionAuthorityGranted,false);
    assert.equal(approved.bookingAuthorityGranted,false);assert.equal(approved.paymentOrderAuthorized,false);
    assert.equal(approved.productiveDispatchAuthorized,false);
    assert.throws(()=>f.api.decide(f.reviewer,commandFor(approved,'APPROVE_LOCAL_EVIDENCE_ONLY','approval-wrong-role-001')),/ERV_HUMAN_NATIVE_ROLE_DENIED/);
    assert.throws(()=>f.api.decide(f.approver,commandFor(approved,'EXECUTE','execution-001')),/ERV_HUMAN_UNSUPPORTED_ACTION_DENIED/);
    assert.deepEqual(backend.createNativeErvHumanBackendV1({root:f.root,sessions:f.sessions}).read(f.approver,{invoiceId}),approved);
    assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,2);
    assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan516_target_orders')[0].count,0);
  }finally{f.close();}
});

test('PUI-04-AC04 a native persisted query remains pending until an allowed review resolves it',async()=>{
  const f=await humanFixture();
  try{
    const initial=f.api.read(f.reviewer,{invoiceId});
    const pending=f.api.decide(f.reviewer,commandFor(initial,'QUERY','query-001'));
    assert.equal(pending.state,'QUERY_PENDING_LOCAL_EVIDENCE_ONLY');assert.equal(pending.proposalRevision,1);
    assert.deepEqual(backend.createNativeErvHumanBackendV1({root:f.root,sessions:f.sessions}).read(f.reviewer,{invoiceId}),pending);
    const reviewed=f.api.decide(f.reviewer,commandFor(pending,'REVIEW','query-review-001'));
    assert.equal(reviewed.state,'REVIEWED_LOCAL_EVIDENCE_ONLY');assert.equal(reviewed.proposalRevision,2);
    assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,2);
    assert.equal(reviewed.executionAuthorityGranted,false);
  }finally{f.close();}
});

test('PUI-04-AC03 the session owner marker cannot be forged by a caller facade or absent tenant',async()=>{
  const f=await financeFixture();
  try{
    assert.equal(typeof protectedSessions.isProtectedSessionAdapterV1,'function','PAN542_SESSION_OWNER_MARKER_NOT_IMPLEMENTED');
    const authRoot=join(f.parent,'session-owner-marker');mkdirSync(authRoot,{mode:0o700});
    const sessions=createProtectedSessionAdapterV1(sessionOptions(authRoot));
    assert.equal(protectedSessions.isProtectedSessionAdapterV1(sessions,'tenant-a'),true);
    assert.equal(protectedSessions.isProtectedSessionAdapterV1(sessions,'tenant-b'),false);
    assert.equal(protectedSessions.isProtectedSessionAdapterV1(sessions,undefined),false);
    for(const facade of [{},null,undefined,Object.freeze({...sessions})]){
      assert.equal(protectedSessions.isProtectedSessionAdapterV1(facade,'tenant-a'),false);
      assert.equal(protectedSessions.isProtectedSessionAdapterV1(facade,undefined),false);
    }
  }finally{f.close();}
});

test('PUI-04-AC01/02/03/04 a real native review uses the protected principal mapping and survives a fresh backend process',async()=>{
  const f=await financeFixture();
  try{
    const leadingBefore=nativeRows(f.root,'SELECT revision,effect_key,command,event FROM pan516_events ORDER BY revision');
    assert.ok(leadingBefore.length>0,'the existing native procurement path must execute before the missing connector assertion');
    assert.equal(typeof backend?.initializeNativeErvHumanBackendV1,'function','PAN542_NATIVE_PERSISTED_HUMAN_BACKEND_NOT_IMPLEMENTED');
    const authRoot=join(f.parent,'session-state');mkdirSync(authRoot,{mode:0o700});
    const sessions=createProtectedSessionAdapterV1(sessionOptions(authRoot));
    backend.initializeNativeErvHumanBackendV1({root:f.root,owner:'LOCAL_SYNTHETIC_OWNER',sessionBinding:sessions.binding});
    const api=backend.createNativeErvHumanBackendV1({root:f.root,sessions});
    const headers=issue(sessions,'synthetic:erv-reviewer');
    const proposal=api.read(headers,{invoiceId});
    assert.equal(proposal.state,'REVIEW_REQUIRED');assert.equal(proposal.proposalRevision,0);
    assert.equal(proposal.nativeRole,'REVIEWER');assert.equal(proposal.roleMappingVersion,1);
    assert.equal(proposal.invoiceId,invoiceId);assert.equal(proposal.nativeRevision,leadingBefore.length);
    const command={schemaVersion:'pansphaira.erv-human/decision/v1',invoiceId,effectId:'synthetic:erv-review-001',transportId:'synthetic:erv-wire-001',
      expectedNativeRevision:proposal.nativeRevision,expectedProposalRevision:proposal.proposalRevision,proposalDigest:proposal.proposalDigest,action:'REVIEW'};
    const reviewed=api.decide(headers,command);
    assert.equal(reviewed.state,'REVIEWED_LOCAL_EVIDENCE_ONLY');assert.equal(reviewed.proposalRevision,1);
    assert.equal(reviewed.bookingAuthorityGranted,false);assert.equal(reviewed.executionAuthorityGranted,false);
    const restart=spawnSync(process.execPath,['tests/pan542/restart-reader.mjs',f.root,authRoot],{
      input:JSON.stringify({sessionOptions:sessionOptions(authRoot),headers,invoiceId}),encoding:'utf8',timeout:15000});
    assert.equal(restart.status,0,restart.stderr);assert.equal(restart.signal,null);
    const fresh=JSON.parse(restart.stdout);assert.deepEqual(fresh,reviewed);
    assert.deepEqual(nativeRows(f.root,'SELECT revision,effect_key,command,event FROM pan516_events ORDER BY revision'),leadingBefore);
    assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,1);
  }finally{f.close();}
});
