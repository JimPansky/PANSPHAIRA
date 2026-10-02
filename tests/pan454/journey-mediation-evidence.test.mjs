import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runJourneyEvidence} from '../../scripts/run-pan454-journey-evidence.mjs';
import {JOURNEY_SCHEMA,IMAGE_ID,CROSSINGS,BASE_FILES,QUALIFIER_FILES,conformanceDecision} from '../../src/pan454/journey-profile.mjs';
import {canonicalJson,sha256} from '../../demo/runtime/enforcement-gate.mjs';
let evidence;
function proof(){
 if(evidence)return evidence;
 const before=process.env.PAN454_HOST_CREDENTIAL_CANARY;process.env.PAN454_HOST_CREDENTIAL_CANARY='NON_AUTHORITY_HOST_CANARY';
 try{evidence=runJourneyEvidence();assert.equal(process.env.PAN454_HOST_CREDENTIAL_CANARY,'NON_AUTHORITY_HOST_CANARY');return evidence;}
 finally{if(before===undefined)delete process.env.PAN454_HOST_CREDENTIAL_CANARY;else process.env.PAN454_HOST_CREDENTIAL_CANARY=before;}
}
test('AC01 finite actual crossing inventory keeps absent model/skill/device/Mind triggers unqualified',()=>{
 assert.deepEqual(CROSSINGS.map(x=>x.surface),['tool/effect','read','network','process','filesystem','credential','model/skill/device/managed Mind']);
 assert.equal(CROSSINGS.at(-1).trigger,'ABSENT');assert.match(CROSSINGS.at(-1).ceiling,/UNQUALIFIED/);assert.match(CROSSINGS.find(x=>x.surface==='credential').ceiling,/REAL_CUSTODIAN.*ABSENT/);
});
test('AC02 actual normal owned Order entry uses current Policy/Approval/lease/readback with an independently persisted target',()=>{
 const r=proof(),p=r.observations.positive;assert.equal(r.schemaVersion,JOURNEY_SCHEMA);assert.equal(p.status,'PASS');assert.equal(p.policyOutcome,'OWNER_ESCALATION');assert.equal(p.leaseKind,'OWNER_ESCALATION_LEASE_HMAC_V1');assert.deepEqual(p.counts,{snapshots:3,mutations:1,readbacks:1});
 assert.equal(p.targetDigest,sha256(canonicalJson({id:'synthetic-order-454',date:1767225600,ref_client:'CM-ADMIN-AI-ESCALATION-001',socid:7})));assert.equal(p.receiptDigest,p.observedReceiptDigest);
});
test('AC02 targeted alternate route/tenant/credential reference/caller authority deny exact intended boundaries with permitted counterparts',()=>{
 const n=proof().observations.negatives;assert.deepEqual(n.map(x=>[x.id,x.observedCode]),[
  ['cross-tenant','BTH_TENANT_MISMATCH_DENIED'],['wrong-principal','BTH_PRINCIPAL_MISMATCH_DENIED'],['credential-handle-substitution','BTH_OPERATION_INVALID_DENIED'],['caller-authority','BTH_OPERATION_INVALID_DENIED'],['alternate-tool-route','BTH_OBJECT_MISMATCH_DENIED'],['direct-owned-gate-alternate-route','JOURNAL_OWNER_REQUIRED_DENIED'],
 ]);
 for(const x of n.slice(0,-1)){assert.equal(x.noProtectedCallsBeforeDenial,true);assert.equal(x.observedStage,x.expectedStage);assert.equal(x.permittedCounterpart.status,'PASS');assert.deepEqual(x.permittedCounterpart.counts,{snapshots:3,mutations:1,readbacks:1});}assert.equal(n.at(-1).noAdditionalProtectedCalls,true);
});
test('AC03 actual OS route, readonly source and finite guest-storage refusals are not configuration promises or arbitrary exceptions',()=>{
 const r=proof();assert.equal(r.observations.offBox.code,'ENETUNREACH');assert.equal(r.observations.readOnlySource.code,'EROFS');assert.equal(r.observations.scratchQuota.code,'ENOSPC');assert.equal(r.observations.scratchQuota.filesystemBytes,1024*1024);
 assert.equal(r.actualContainerControls.networkMode,'none');assert.deepEqual(r.actualContainerControls.binds,[{type:'bind',destination:'/subject',rw:false}]);assert.equal(r.guestEnvironment.noNewPrivileges,'1');assert.equal(r.guestEnvironment.effectiveCapabilities,'0000000000000000');assert.equal(r.guestEnvironment.uid,1000);
 assert.equal(r.execution.exit.cli,0);assert.equal(r.execution.exit.container,0);assert.equal(r.execution.exit.oomKilled,false);
});
test('AC03 exact OCI/runtime/profile/source binding preserves repository-only BTH classification and never changes existing foundations',()=>{
 const r=proof();assert.equal(r.image.reference,'node@'+IMAGE_ID);assert.equal(r.image.ociIndexDigest,IMAGE_ID);assert.equal(r.image.os,'linux');assert.equal(r.image.arch,'amd64');assert.match(r.guestEnvironment.node,/^v24\./);assert.equal(r.guestEnvironment.platform,'linux');assert.equal(r.sourceClosureClassification,'SOURCE_EVIDENCE_ONLY_NOT_RUNNABLE_PRODUCT_PACKAGE');
 assert.deepEqual(r.sourceBindings,[...BASE_FILES,...QUALIFIER_FILES].map(path=>({path,sha256:sha256(readFileSync(new URL('../../'+path,import.meta.url)))})));
 assert.equal(r.retainedProfileSha256,sha256(readFileSync(new URL('../../packages/contracts/src/extension-dynamic-synthetic.ts',import.meta.url))));assert.equal(r.retainedScratchProfileSha256,sha256(readFileSync(new URL('../../demo/openclaw-agent/compose.yaml',import.meta.url))));assert.match(r.dockerServerVersion,/^\d+\.\d+\.\d+/);assert.deepEqual(Object.keys(r.canon),['CM-CAN-09','CM-CAN-18','CM-CAN-19','CM-CAN-20','CM-CAN-22','CM-CAN-23','CM-CAN-24','CM-CAN-27','CM-CAN-28']);
});
test('AC04 same-UID process/credential/foreign-state/journal and loopback canaries falsify complete mediation, retaining synthetic network-free scope',()=>{
 const r=proof();assert.equal(r.observations.loopbackCanary,true);assert.deepEqual(r.observations.sameUid,{processExecuted:true,credentialCanaryReadable:true,foreignTenantCanaryReadable:true,ownedJournalReadable:true});
 assert.equal(r.decision.decision,'BOUNDED_FALSIFICATION_OF_COMPLETE_INTRA_CONTAINER_MEDIATION');assert.equal(r.decision.classification,'EVIDENCE_ONLY');assert.equal(r.decision.implementedIsolationCapability,false);assert.equal(r.decision.retainedScope,'LOCAL_SYNTHETIC_NETWORK_FREE');assert(r.decision.ownedCorrections.every(x=>x.owner==='existing PANSPHAIRA delivery owner'));assert(r.nonclaims.includes('NO_HOST_OR_DOCKER_DAEMON_CONFINEMENT'));
});
test('AC03–04 host credential canary is not inherited and exact owned container/staging cleanup is read back before report',()=>{
 const r=proof();assert.equal(r.guestEnvironment.hostCredentialCanaryPresent,false);assert.deepEqual(r.actualContainerControls.environmentVariableNames,['HOME','NODE_VERSION','PATH','TMPDIR','YARN_VERSION']);assert.deepEqual(r.cleanup,{containerRemoved:true,stageRemoved:true,residueCount:0});
 const {reportDigest,...body}=r;assert.equal(reportDigest,sha256(canonicalJson(body)));assert.match(r.deliveryGates,/separate/);
});
test('AC04 neither absent/wrong denial observations nor caller-written authority can turn the bounded negative decision into capability acceptance',()=>{
 const actual=proof().observations;
 for(const delta of [{syntheticOnly:false},{offBox:{code:'ECONNREFUSED'}},{readOnlySource:{code:'EACCES'}},{loopbackCanary:false},{sameUid:{...actual.sameUid,credentialCanaryReadable:false}},{scratchQuota:{code:'EIO'}}])assert.throws(()=>conformanceDecision({...actual,...delta}),/PAN454_INDEPENDENT_EXPECTED_BOUNDARIES_NOT_OBSERVED/);
 assert.equal(conformanceDecision({...actual,callerAuthority:{approved:true},outcome:'PASS'}).implementedIsolationCapability,false);
});
test('AC02–04 actual CLI denies additional caller arguments before any runtime activation',()=>{
 const r=spawnSync(process.execPath,[fileURLToPath(new URL('../../scripts/run-pan454-journey-evidence.mjs',import.meta.url)),'--grant'],{encoding:'utf8',env:{PATH:process.env.PATH,TMPDIR:process.env.TMPDIR}});assert.equal(r.status,1);assert.match(r.stderr,/PAN454_CLI_ARGUMENTS_DENIED/);
});
