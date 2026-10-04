import { readFileSync, openSync, fstatSync, closeSync, constants } from 'node:fs';
import { createHash } from 'node:crypto';

const knownPair = JSON.parse(readFileSync(new URL('../../contracts/pan525/exact-pair-qualification-v1.json', import.meta.url), 'utf8'));
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

// Read-only qualification observation, not a runtime/source grant or promotion.
export function inspectExactPairQualificationV1(request) {
  const expected = {
    profileId: knownPair.profileId,
    consumerCommit: knownPair.pair.consumer.commit,
    providerCommit: knownPair.pair.provider.commit,
  };
  const keys = Object.keys(expected);
  if (!request || typeof request !== 'object' || Object.getPrototypeOf(request) !== Object.prototype) {
    throw new Error('PAN525_EXACT_SELECTION_DENIED');
  }
  const supplied = Reflect.ownKeys(request);
  if (supplied.length !== keys.length || supplied.some(key => typeof key !== 'string' || !keys.includes(key))) {
    throw new Error('PAN525_EXACT_SELECTION_DENIED');
  }
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(request, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true || descriptor.value !== expected[key]) {
      throw new Error('PAN525_EXACT_SELECTION_DENIED');
    }
  }
  return freeze(structuredClone(knownPair));
}

const evidencePins = Object.freeze({
  'exact-pair-qualification-v1.json': 'ec0bb349f07b9a8ed212d216fae29a4005aedf10afa799c3f57ef7234af50934',
  'native-persistence-observation-v1.json': '24d451f947a3b725b62ff752ed03716e901b26abae82400829b903d5539c5fba',
  'native-runtime-version-readback-v1.json': 'e79aba27f2d6e585934f36ea99f902159c37118c1762a5194e0b435ed4722800',
});
function pinnedEvidence(name) {
  let descriptor;
  try {
    descriptor = openSync(new URL(`../../contracts/pan525/${name}`, import.meta.url), constants.O_RDONLY | constants.O_NOFOLLOW);
    if (!fstatSync(descriptor).isFile()) throw new Error();
    const bytes = readFileSync(descriptor);
    if (createHash('sha256').update(bytes).digest('hex') !== evidencePins[name]) throw new Error();
    return JSON.parse(bytes);
  } catch {
    throw new Error('PAN525_CODE_OWNED_EVIDENCE_HELD');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

// Membership in this one PAN-owned synthetic registry is not an effect grant,
// KS250 publication right, native validation of fixture API output, or a new
// head's admission merely because its compiled handler happens to be equal.
export function readExactQualifiedPairRegistryV1(request) {
  inspectExactPairQualificationV1(request);
  const observed = pinnedEvidence('exact-pair-qualification-v1.json');
  const native = pinnedEvidence('native-persistence-observation-v1.json');
  const versions = pinnedEvidence('native-runtime-version-readback-v1.json');
  if (native.tuple.consumer !== observed.pair.consumer.commit
    || native.tuple.provider !== observed.pair.provider.commit
    || native.tuple.contractVersion !== observed.pair.contractVersion
    || native.tuple.nativeImage !== versions.nativeImage
    || native.sameActualJ01SixIntentPairReceiptSha256 !== observed.provenance.samePairReceiptSha256) {
    throw new Error('PAN525_CODE_OWNED_EVIDENCE_HELD');
  }
  const result = {
    schemaVersion: 'pansphaira.pan525/qualified-local-pair-registry/v1',
    profileId: observed.profileId,
    registryState: 'QUALIFIED_LOCAL_SYNTHETIC_EXACT_PAIR',
    pair: observed.pair,
    sourceScope: observed.sourceScope,
    observedOperations: observed.observedOperations,
    operationResultDigests: observed.operationResultDigests,
    runtimeVersions: { externalProvider: observed.pair.provider.productVersion, native: versions.actualVersions },
    nativeUpgradeAndPersistence: {
      state: 'VERIFIED_LOCAL_NATIVE_PERSISTENCE',
      actualDbUpgradeInvocation: native.actualDbUpgradeInvocation,
      schemaRevisionChangeClaimed: native.schemaRevisionChangeClaimed,
      nativeInstallExecutions: native.nativeInstallExecutions,
      nativeImage: native.tuple.nativeImage,
      businessOracleOutcomes: native.businessOracleOutcomes,
      existingDatasetAndDashboardRetained: native.existingDatasetAndDashboardRetained,
      actualNewWritesRetained: native.actualProducerAndMetadataNewWritesRetained,
    },
    proofDigests: {
      j01SixIntents: observed.provenance.samePairReceiptSha256,
      nativePersistence: evidencePins['native-persistence-observation-v1.json'],
      nativeVersions: evidencePins['native-runtime-version-readback-v1.json'],
      exactObservedPair: evidencePins['exact-pair-qualification-v1.json'],
    },
    ks250IndependentSecondContext: observed.ks250IndependentSecondContext,
    publicSyntheticExternalRunStillUnvalidatedNative: true,
    registryChangeScope: 'ONLY_RETAINED_EXACT_RELEASED_J01_J02_SYNTHETIC_PAIR',
    providerRegistryMutated: false,
    sourceRightsGranted: false,
    executionAuthorityGranted: false,
    readOnly: true,
  };
  return freeze({ ...result, qualificationDigest: createHash('sha256').update(JSON.stringify(result)).digest('hex') });
}
