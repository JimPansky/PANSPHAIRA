import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { generateErvWorkflowEvidenceV1, verifyErvWorkflowEvidenceV1, verifyErvArithmeticV1, canonical, sha256 } from '../../src/erv-workflow-evidence/native-evidence-v1.mjs';
const load = p => JSON.parse(readFileSync(p, 'utf8'));
const rehash = r => { const { reportDigest, ...unsigned } = r; return { ...unsigned, reportDigest: sha256(canonical(unsigned)) }; };
const stored = () => load('verification/erv-workflow-native-evidence-v1.json');

test('actual normal producer invokes all23 unchanged native probes and all25 independent semantics, exactly reproducing persisted evidence', async () => {
  const generated = await generateErvWorkflowEvidenceV1();
  assert.deepEqual(generated, stored());
  assert.equal(verifyErvWorkflowEvidenceV1(generated, generated.reportDigest).valid, true);
  assert.equal(generated.counts.completeHumanBusinessWorkflowsProven, 0);
  assert.equal(generated.counts.businessScenarios, 12);
  assert.equal(generated.counts.companyContexts, 4);
  assert.equal(generated.ownedScratchCleanup, 'OWNED_DIRECTORY_REMOVED');
  assert(generated.nativeResults.every(r => r.actualFunctionInvoked && r.evidenceSha256 === r.unchangedHistoricalResultSha256));
  assert(generated.scenarios.every(s => !s.humanWorkflowVerified));
  assert.equal(generated.sourceIdentity.kernelBindings.length, 22);
  assert.equal(generated.executionCatalog.baseCommit, null);
  assert.equal(generated.executionCatalog.baseRelease, null);
  assert.equal(generated.sourceIdentity.historicalEvidenceRetainedAsHistorical.release, '2026_10_02_v5');
  assert.equal(generated.sourceIdentity.releasedKernelBaseline.release, '2026_10_02_v6');
  assert(generated.preservedGapsInMeasuredPath.includes('CC_OWNER_ROUTING'));
  assert(generated.preservedGapsInMeasuredPath.includes('REAPPROVAL_LOOP'));
});

test('synthetic approvals, deliberate denials, unqualified business fields and UNKNOWN are not promoted into human product features', () => {
  const r = stored(), byId = new Map(r.nativeResults.map(x => [x.id, x]));
  assert.equal(byId.get('native-lean').result.execution.approval.state, 'NOT_REQUIRED');
  assert.equal(byId.get('native-synthetic-approval').result.execution.approvalRecord.actorSource, 'DECLARED_LOCAL_SYNTHETIC_TEST_ACTORS_ONLY');
  assert.equal(byId.get('native-cost-center-actor').result.reasonCode, 'SEPARATE_APPROVAL_ACTOR_DENIED');
  assert.equal(byId.get('native-self-actor').result.reasonCode, 'SEPARATE_APPROVAL_ACTOR_DENIED');
  for (const id of ['core-cost-center-extra', 'core-project-extra', 'core-allocations-extra', 'core-entity-extra']) assert.equal(byId.get(id).result.exceptionCode, 'INPUT_SHAPE_DENIED');
  assert.equal(byId.get('native-missing-receipt').result.execution.decision.exceptionCode, 'MISSING_CONTEXT');
  assert.equal(byId.get('native-productive-effect').result.reasonCode, 'EFFECT_DENIED');
  assert.equal(byId.get('native-duplicate-intake').result.storageLifetime, 'IN_MEMORY_WITHIN_THIS_PROCESS_NOT_DURABLE_OPERATIONAL_STORAGE');
  assert(r.nativeObservations.nativeObservations.some(x => x.uiOutputKind === 'FRAMEWORK_NEUTRAL_DATA_NOT_BROWSER_FORM'));
  assert(r.nativeResults.some(x => JSON.stringify(x.result).includes('UNKNOWN')));
});

test('integer-only arithmetic checks tolerance boundary/one cent, strict greater threshold and gross allocation without accounting claim', () => {
  const e = load('evidence/erv-workflow/reference-v1/independent-expectations.json');
  const a = verifyErvArithmeticV1(e);
  assert.equal(a.toleranceMinor, 24000);
  assert.equal(a.outsideDifferenceMinor, 24001);
  assert.equal(a.allocationIsOperationalCoding, false);
  for (const mutate of [x => x.toleranceMinor++, x => x.strictGreaterCases[1].extraApprovalRequired = true, x => x.grossApprovalAllocation.lines[0].amountMinor--]) {
    const bad = structuredClone(e); mutate(bad); assert.throws(() => verifyErvArithmeticV1(bad));
  }
});

test('research source reference editorial fix is an integration overlay; immutable Main packet and historical identity stay intact', () => {
  const original = load('evidence/erv-workflow/reference-v1/workflow-field-role-matrix.json');
  assert(original.quotes_location.startsWith('sources.json:'));
  assert(stored().integratedFieldRoleMatrix.quotes_location.startsWith('research-sources.json:'));
  assert.equal(stored().counts.unexecutedResearchDesignExamples, 8);
  assert.equal(stored().executionCatalog.companySizeIsExecutionInput, false);
});

test('wrong trusted identity and rehashed human/production/source/result/semantic/count forgeries fail closed', () => {
  const r = stored();
  assert.equal(verifyErvWorkflowEvidenceV1(r, '0'.repeat(64)).valid, false);
  for (const mutate of [
    x => x.counts.completeHumanBusinessWorkflowsProven = 1,
    x => x.authority.humanIdentityVerified = true,
    x => x.authority.bookingAuthorized = true,
    x => x.sourceIdentity.currentWholeRepositoryCommitAuthenticated = true,
    x => x.executionCatalog.baseRelease = '2026_10_02_v5',
    x => x.nativeResults[0].result.outcome = 'MOCK_SUCCESS',
    x => x.semanticChecks[0].actual[0] = 'MOCK_SUCCESS',
    x => x.counts.unexecutedResearchDesignExamples = 0,
    x => x.scenarios[0].humanWorkflowVerified = true,
    x => x.ownedScratchCleanup = 'SKIPPED',
  ]) {
    const bad = structuredClone(r); mutate(bad); const forged = rehash(bad);
    assert.equal(verifyErvWorkflowEvidenceV1(forged, forged.reportDigest).valid, false);
  }
});

test('versioned canonical evidence accepts only safe integer JSON numbers and never coerces NaN/infinity/negative zero', () => {
  for (const v of [NaN, Infinity, -Infinity, -0, Number.MAX_SAFE_INTEGER + 1, 0.1, undefined, 1n]) assert.throws(() => canonical({ value: v }));
  assert.equal(canonical({ z: 0, a: [1, null, true] }), '{"a":[1,null,true],"z":0}');
});
