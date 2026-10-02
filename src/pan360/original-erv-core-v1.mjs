// Versioned admission/composition for the ORIGINAL PAN360 requirements.
// This entrypoint, not a caller-minted registry or the historical locked compiler,
// admits a fixed public synthetic profile. Historical v1/v2 sources stay intact.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { evaluateErvMatchingCaseV1 } from '../../dist/packages/contracts/src/incoming-invoice-erv.js';

export const ORIGINAL_ERV_PROFILE_PATH_V1 = 'tests/fixtures/pan360/original-erv-profile-v1.json';
export const ORIGINAL_ERV_PROFILE_SHA256_V1 = '708ce4f0232377a878e60703d37c92d25f1601278bc98fd96e62018d1bf08ae2';
const PROFILE_CANONICAL_SHA = '2a16c19e95f5633613ea935c5f07355ef7c16fb9501e501617730e3d891103e6';
const ROOT = new URL('../../', import.meta.url);
const SOURCE_BINDINGS = [
  ['packages/contracts/src/incoming-invoice-erv.ts', '6ba5250783df35f60602a11437c843272ab014bf24e69135cfbf52dfb41750cf'],
  ['dist/packages/contracts/src/incoming-invoice-erv.js', 'bf76442618c43e7fee64bb28ee6ad12acd6655fe1b361599e802735fe89c3ff0'],
  ['packages/contracts/src/incoming-invoice-intake.ts', '38490af300dce7965deebf56755ac59be117db711bd7bc478e19538947a412fc'],
  ['dist/packages/contracts/src/incoming-invoice-intake.js', '0ece706da233dbf7b1c7744958eed1a619a71cbb8a69ee284b1f494144ac96c9'],
  ['packages/contracts/src/incoming-invoice-blueprint.ts', 'aad1b877c096d4605b80b141100897fab41f62622f5434be59059989b8514550'],
  ['dist/packages/contracts/src/incoming-invoice-blueprint.js', 'c0579dafd713abef8810cb5bc94b80fa3f0c116497ec1b9c30971d9ef2481325'],
];
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}
export const digest = value => sha256(canonical(value));
export function freeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype && canonical(Object.keys(value).sort()) === canonical([...keys].sort());
const selection = value => exact(value, ['variantId', 'version']) && typeof value.variantId === 'string' && typeof value.version === 'string';
const AUTHORITY = freeze({ productivePostingAuthorized: false, bookingAuthorityGranted: false, riskDCapability: 'SEPARATELY_AUTHORIZED' });

export function originalCoreIdentityV1() {
  const bindings = SOURCE_BINDINGS.map(([path, expected]) => {
    const actual = sha256(readFileSync(new URL(path, ROOT)));
    if (actual !== expected) throw new Error('PAN360_REUSED_CORE_SOURCE_IDENTITY_DENIED:' + path);
    return { path, sha256: actual };
  });
  bindings.push({ path: 'src/pan360/original-erv-core-v1.mjs', sha256: sha256(readFileSync(new URL('./original-erv-core-v1.mjs', import.meta.url))) });
  return freeze({ schemaVersion: 'pansphaira.pan360/erv-original-core-identity/v1', coreVersion: '1.0.0', profileSha256: ORIGINAL_ERV_PROFILE_SHA256_V1, bindings, coreDigest: digest(bindings), qualification: 'DEVELOPMENT_LOCAL_UNTIL_INDEPENDENT_RELEASE_QUALIFICATION' });
}
export function loadOriginalErvProfileV1() {
  originalCoreIdentityV1();
  const bytes = readFileSync(new URL(ORIGINAL_ERV_PROFILE_PATH_V1, ROOT));
  if (sha256(bytes) !== ORIGINAL_ERV_PROFILE_SHA256_V1) throw new Error('PAN360_PROFILE_SOURCE_IDENTITY_DENIED');
  const profile = JSON.parse(bytes);
  if (digest(profile) !== PROFILE_CANONICAL_SHA) throw new Error('PAN360_PROFILE_CANONICAL_IDENTITY_DENIED');
  return freeze(profile);
}
function exception(candidate, code, references = [], detail = code) {
  const citations = references.map(ref => ({ referenceKind: ref.body.referenceKind, referenceId: ref.body.referenceId, evidenceSha256: ref.evidence.contentSha256 }));
  return freeze({ caseId: candidate?.caseId ?? 'UNKNOWN', outcome: 'EXCEPTION', exceptionCode: code, detail,
    evidenceDimensions: { integrityVerified: false, originVerified: false, semanticsVerified: false, runtimeObserved: true },
    advisor: { questions: [{ questionId: 'PAN360:' + code, questionText: detail, citations }], advisorAuthority: 'EVIDENCE_CITING_ONLY', bookingAuthorityGranted: false }, authority: AUTHORITY });
}
export function evaluateOriginalErvCaseV1(candidate, suppliedProfile = loadOriginalErvProfileV1()) {
  const profile = loadOriginalErvProfileV1();
  if (digest(suppliedProfile) !== PROFILE_CANONICAL_SHA) return exception(candidate, 'PROFILE_IDENTITY_DENIED');
  if (!exact(candidate, ['caseId', 'matchingMode', 'tolerancePolicy', 'requestedEffects', 'references'])
    || typeof candidate.caseId !== 'string' || !selection(candidate.matchingMode) || !selection(candidate.tolerancePolicy)
    || !Array.isArray(candidate.references) || !Array.isArray(candidate.requestedEffects) || candidate.requestedEffects.length === 0
    || !candidate.requestedEffects.every(x => ['READ_SYNTHETIC', 'WRITE_LOCAL_PROOF', 'POST_PRODUCTIVE', 'ALLOCATE_PRODUCTIVE'].includes(x))) return exception(candidate, 'INPUT_SHAPE_DENIED');
  const mode = profile.variants.matchingModes.find(x => canonical({ variantId: x.variantId, version: x.version }) === canonical(candidate.matchingMode));
  const policy = profile.variants.tolerancePolicies.find(x => canonical({ variantId: x.variantId, version: x.version }) === canonical(candidate.tolerancePolicy));
  if (!mode || !policy) return exception(candidate, 'UNKNOWN_VARIANT', [], 'Requested executable variant is not in the owned versioned profile; no invented capability or rate substitution.');
  const pool = profile.cases.flatMap(c => c.references);
  for (const ref of candidate.references) {
    if (!exact(ref, ['body', 'evidence']) || !exact(ref.body, ['referenceKind', 'referenceId', 'supplierId', 'matchAmountMinor', 'quantity', 'unit', 'currency'])
      || !exact(ref.evidence, ['sourceKind', 'locator', 'generator', 'contentSha256'])) return exception(candidate, 'INPUT_SHAPE_DENIED');
    if (digest(ref.body) !== ref.evidence.contentSha256) return exception(candidate, 'UNVERIFIED_REFERENCE_EVIDENCE', candidate.references);
    if (!pool.some(pinned => canonical(pinned) === canonical(ref))) return exception(candidate, 'ORIGIN_NOT_VERIFIED', candidate.references, 'Body and locator/generator must match the independently admitted fixed public synthetic profile, not merely a caller-rehashed body or prefix.');
  }
  const refs = candidate.references;
  const dimensions = { integrityVerified: true, originVerified: true, semanticsVerified: false, runtimeObserved: true };
  // Preserve the existing authority-free amount engine; its mathematical behavior
  // is not changed to make the new configuration pass. The owned entrypoint adds
  // closed variant/source admission and the existing relational dimensions.
  if (candidate.requestedEffects.some(x => ['POST_PRODUCTIVE', 'ALLOCATE_PRODUCTIVE'].includes(x))) {
    return freeze({ ...evaluateErvMatchingCaseV1(candidate, profile), evidenceDimensions: dimensions });
  }
  const kinds = refs.map(ref => ref.body.referenceKind);
  if (new Set(kinds).size !== kinds.length) return exception(candidate, 'DUPLICATE_REFERENCE_KIND', refs);
  const missing = mode.requiredKinds.filter(kind => !kinds.includes(kind));
  if (missing.length) return exception(candidate, 'MISSING_CONTEXT', refs, 'Required reference kind(s) ' + missing.sort().join(', ') + ' remain UNKNOWN; independent evidence is required.');
  for (const [dimension, field] of [['SUPPLIER', 'supplierId'], ['QUANTITY', 'quantity'], ['UNIT', 'unit'], ['CURRENCY', 'currency']]) {
    const compared = dimension === 'QUANTITY' ? refs.filter(r => mode.amountKinds.includes(r.body.referenceKind)) : refs;
    if (new Set(compared.map(r => r.body[field])).size > 1) {
      const e = exception(candidate, dimension + '_RELATION', refs, dimension + ' relation conflicts between separately admitted reference bodies.');
      return freeze({ ...e, outcome: 'CONFLICT', conflict: { conflictKind: dimension + '_RELATION' }, evidenceDimensions: dimensions });
    }
  }
  const raw = evaluateErvMatchingCaseV1(candidate, profile);
  const matchingScope = mode.variantId === 'LEAN_INVOICE_ONLY_V1' ? 'INVOICE_ONLY_VALIDATION_NO_PO_OR_RECEIPT_MATCH' : 'FULL_DECLARED_THREE_WAY_RELATIONAL_MATCH';
  return freeze({ ...raw, matchingScope, appliedRateBasisPoints: policy.rateBasisPoints, evidenceDimensions: { ...dimensions, semanticsVerified: raw.outcome === 'MATCHED' },
    process: { purchaseOrderRequired: mode.requiredKinds.includes('PURCHASE_ORDER'), receiptRequired: mode.requiredKinds.includes('RECEIPT') },
    nonclaims: ['PUBLIC_SYNTHETIC_NON_CUSTOMER', 'NO_PRODUCTIVE_BOOKING', 'NO_EXTERNAL_SYSTEM_OF_RECORD_READBACK', ...(mode.variantId === 'LEAN_INVOICE_ONLY_V1' ? ['NO_PO_OR_RECEIPT_MATCH_PERFORMED'] : [])] });
}
export function deriveOriginalApprovalV1(decision, configuration) {
  if (!exact(configuration, ['scenario', 'separateApprovalThresholdMinor']) || !['LEAN', 'SEGREGATED_ENTERPRISE'].includes(configuration.scenario)
    || ![null, 1000000].includes(configuration.separateApprovalThresholdMinor)
    || (configuration.scenario === 'LEAN') !== (configuration.separateApprovalThresholdMinor === null)) throw new Error('PAN360_APPROVAL_CONFIGURATION_DENIED');
  const amount = decision.matchedAmountMinor;
  const state = decision.outcome !== 'MATCHED' ? 'BLOCKED_DECISION' : configuration.separateApprovalThresholdMinor !== null && amount > configuration.separateApprovalThresholdMinor ? 'REQUIRES_SEPARATE_APPROVAL' : 'NOT_REQUIRED';
  return freeze({ schemaVersion: 'pansphaira.pan360/erv-original-approval/v1', comparison: 'STRICTLY_GREATER_THAN', thresholdMinor: configuration.separateApprovalThresholdMinor,
    observedInvoiceAmountMinor: amount ?? null, state, independentActorRequired: state === 'REQUIRES_SEPARATE_APPROVAL', decisionDigest: digest(decision), productivePostingAuthorized: false, bookingAuthorityGranted: false });
}
