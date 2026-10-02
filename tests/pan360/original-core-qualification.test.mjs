import assert from 'node:assert/strict';
import test from 'node:test';
import { loadOriginalErvProfileV1, evaluateOriginalErvCaseV1, deriveOriginalApprovalV1, originalCoreIdentityV1, digest } from '../../src/pan360/original-erv-core-v1.mjs';
const p = loadOriginalErvProfileV1();
const get = id => structuredClone(p.cases.find(c => c.caseId === id));
const run = id => evaluateOriginalErvCaseV1(get(id), p);
const approval = d => deriveOriginalApprovalV1(d, { scenario: 'SEGREGATED_ENTERPRISE', separateApprovalThresholdMinor: 1000000 });

test('PAN360 original core: all17 declared case denominators executed with exact allowed outcomes and NONE authority', () => {
  const expected = {
    'lean-no-po-no-receipt':'MATCHED', 'three-way-discriminating200':'MATCHED', 'three-way-boundary200':'MATCHED',
    'three-way-outside200':'CONFLICT', 'three-way-legacy100-conflict':'CONFLICT',
    'three-way-missing-po':'EXCEPTION', 'three-way-missing-receipt':'EXCEPTION',
    'three-way-wrong-supplierId':'CONFLICT', 'three-way-wrong-quantity':'CONFLICT',
    'three-way-wrong-unit':'CONFLICT', 'three-way-wrong-currency':'CONFLICT',
    'three-way-duplicate-po':'EXCEPTION', 'three-way-unknown-policy':'EXCEPTION', 'lean-productive-denied':'DENIED',
    'threshold-below':'MATCHED', 'threshold-equal':'MATCHED', 'threshold-above':'MATCHED',
  };
  assert.equal(p.cases.length, Object.keys(expected).length);
  const identity = originalCoreIdentityV1();
  for (const c of p.cases) {
    const d = evaluateOriginalErvCaseV1(c, p);
    assert.equal(d.outcome, expected[c.caseId], c.caseId);
    assert.equal(d.authority.productivePostingAuthorized, false, c.caseId);
    assert.equal(d.authority.bookingAuthorityGranted, false, c.caseId);
    assert.equal(originalCoreIdentityV1().coreDigest, identity.coreDigest, c.caseId);
    assert.deepEqual(evaluateOriginalErvCaseV1(c,p), d, c.caseId + ' actual deterministic replay');
  }
});
test('PAN360 original numerical200bps: discriminates100, includes exact boundary, excludes boundary+1minor', () => {
  assert.equal(run('three-way-discriminating200').appliedRateBasisPoints,200);
  assert.equal(run('three-way-discriminating200').outcome,'MATCHED');
  assert.equal(run('three-way-legacy100-conflict').outcome,'CONFLICT');
  assert.equal(run('three-way-legacy100-conflict').conflict.toleranceMinor,12000);
  assert.equal(run('three-way-boundary200').outcome,'MATCHED');
  assert.equal(run('three-way-outside200').conflict.toleranceMinor,24000);
  assert.equal(run('three-way-outside200').conflict.deltaMinor,24001);
});
test('PAN360 original LEAN: invoice-only validation is not a PO/receipt match or full relational three-way claim', () => {
  const d=run('lean-no-po-no-receipt');
  assert.equal(d.matchingScope,'INVOICE_ONLY_VALIDATION_NO_PO_OR_RECEIPT_MATCH');
  assert.deepEqual(d.process,{purchaseOrderRequired:false,receiptRequired:false});
  assert.ok(d.nonclaims.includes('NO_PO_OR_RECEIPT_MATCH_PERFORMED'));
  assert.equal(deriveOriginalApprovalV1(d,{scenario:'LEAN',separateApprovalThresholdMinor:null}).state,'NOT_REQUIRED');
});
test('PAN360 separate approval: original ABOVE10000EUR is strict >, never an inclusive inferred requirement', () => {
  assert.equal(approval(run('threshold-below')).state,'NOT_REQUIRED');
  assert.equal(approval(run('threshold-equal')).state,'NOT_REQUIRED');
  assert.equal(approval(run('threshold-above')).state,'REQUIRES_SEPARATE_APPROVAL');
  assert.equal(approval(run('three-way-outside200')).state,'BLOCKED_DECISION');
  assert.throws(()=>deriveOriginalApprovalV1(run('threshold-above'),{scenario:'SEGREGATED_ENTERPRISE',separateApprovalThresholdMinor:999999}),/CONFIGURATION_DENIED/);
});
test('PAN360 closed profile admission: rehashed caller registry/configuration cannot replace trusted source', () => {
  const forged=structuredClone(p);forged.variants.tolerancePolicies[2].rateBasisPoints=100;
  assert.equal(evaluateOriginalErvCaseV1(get('three-way-discriminating200'),forged).exceptionCode,'PROFILE_IDENTITY_DENIED');
  const invented=get('three-way-discriminating200');invented.matchingMode.variantId='INVENTED_EXECUTABLE';
  assert.equal(evaluateOriginalErvCaseV1(invented,p).exceptionCode,'UNKNOWN_VARIANT');
  assert.equal(run('three-way-unknown-policy').exceptionCode,'UNKNOWN_VARIANT');
});
test('PAN360 reference admission: stale body, self-rehashed body, forged origin and hidden authority fail closed', () => {
  const stale=get('three-way-discriminating200');stale.references[1].body.matchAmountMinor+=1;
  assert.equal(evaluateOriginalErvCaseV1(stale,p).exceptionCode,'UNVERIFIED_REFERENCE_EVIDENCE');
  stale.references[1].evidence.contentSha256=digest(stale.references[1].body);
  assert.equal(evaluateOriginalErvCaseV1(stale,p).exceptionCode,'ORIGIN_NOT_VERIFIED');
  const origin=get('three-way-discriminating200');origin.references[1].evidence.locator='tests/fixtures/incoming-invoice/ap-04-erv-relational-cases-v2.json#forged';
  assert.equal(evaluateOriginalErvCaseV1(origin,p).exceptionCode,'ORIGIN_NOT_VERIFIED');
  const hidden=get('three-way-discriminating200');hidden.authorityGranted=true;
  assert.equal(evaluateOriginalErvCaseV1(hidden,p).exceptionCode,'INPUT_SHAPE_DENIED');
});
test('PAN360 missing evidence and multiplicity: cited advisor, no filled UNKNOWN and no last-write-wins', () => {
  for(const id of ['three-way-missing-po','three-way-missing-receipt']) {
    const d=run(id);assert.equal(d.exceptionCode,'MISSING_CONTEXT');assert.equal(d.advisor.questions[0].citations.length,3);assert.equal(approval(d).state,'BLOCKED_DECISION');
  }
  const dup=get('three-way-duplicate-po');assert.equal(evaluateOriginalErvCaseV1(dup,p).exceptionCode,'DUPLICATE_REFERENCE_KIND');
  dup.references.reverse();assert.equal(evaluateOriginalErvCaseV1(dup,p).exceptionCode,'DUPLICATE_REFERENCE_KIND');
  for(const [id,kind] of [['three-way-wrong-supplierId','SUPPLIER'],['three-way-wrong-quantity','QUANTITY'],['three-way-wrong-unit','UNIT'],['three-way-wrong-currency','CURRENCY']])assert.equal(run(id).conflict.conflictKind,kind+'_RELATION');
});
