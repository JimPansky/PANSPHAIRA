import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, copyFileSync, symlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { inspectExactPairQualificationV1 } from '../../src/pan525/exact-pair-qualification.mjs';

const request = () => ({
  profileId: 'KS_J02_0181_C2_V1',
  consumerCommit: '0efa10b545cfa617e7b6e8c58fe5bc768e0158aa',
  providerCommit: '92f47ef2d5dc74bd44fa3a71c7a296da23c9b928',
});

test('J03 consumes the real delivered J01 identities but never promotes native or KS250 from a known fixture handshake', () => {
  const registryPath = 'contracts/pan525/exact-pair-qualification-v1.json';
  const before = createHash('sha256').update(readFileSync(registryPath)).digest('hex');
  const result = inspectExactPairQualificationV1(request());
  assert.equal(result.outcome, 'EXACT_KNOWN_PAIR_OBSERVED_NATIVE_QUALIFICATION_HELD');
  assert.equal(result.pair.consumer.commit, request().consumerCommit);
  assert.equal(result.pair.provider.commit, request().providerCommit);
  assert.equal(result.pair.provider.productVersion, 'v0.18.1');
  assert.equal(result.pair.contractVersion, '2.0.0');
  assert.deepEqual(result.observedOperations, ['status', 'analyze', 'discovery', 'plan', 'preview', 'readback']);
  assert.equal(result.observedSourceMode, 'fixture');
  assert.equal(result.observedRuntimeValidation, 'SYNTHETIC_UNVALIDATED');
  assert.equal(result.nativeUpgradeAndPersistence.state, 'HELD');
  assert.equal(result.ks250IndependentSecondContext.state, 'HELD');
  assert.equal(result.registryPromotionPerformed, false);
  assert.equal(result.sourceRightsGranted, false);
  assert.equal(result.executionAuthorityGranted, false);
  assert.equal(result.proposalOnly, true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.pair.provider), true);
  assert.equal(createHash('sha256').update(readFileSync(registryPath)).digest('hex'), before);
});

test('J03 exact selection rejects another tested build mutable aliases caller evidence roles and unknown inputs', () => {
  const cases = [
    { ...request(), consumerCommit: '01c1fe12e9a0d48190481c4c454c414dde716ec9' },
    { ...request(), providerCommit: 'dfc7f2ae2399109b90fe8a101f2d4eed465a7cef' },
    { ...request(), consumerCommit: 'main' },
    { ...request(), providerCommit: 'latest' },
    { ...request(), profileId: '*' },
    { ...request(), nativeQualified: true },
    { ...request(), approval: true },
    { ...request(), role: 'owner' },
    { ...request(), evidence: { outcome: 'PASS', sourceRights: true } },
    { ...request(), sourceId: 'CLAIMED_INDEPENDENT_SECOND_CONTEXT' },
    { ...request(), providerCommit: undefined },
    null,
  ];
  for (const input of cases) assert.throws(() => inspectExactPairQualificationV1(input), /PAN525_EXACT_SELECTION_DENIED/);
  assert.equal(inspectExactPairQualificationV1(request()).nativeUpgradeAndPersistence.state, 'HELD');
  let accessorReads = 0;
  const accessor = request();
  Object.defineProperty(accessor, 'consumerCommit', { enumerable: true, get() { accessorReads++; return request().consumerCommit; } });
  assert.throws(() => inspectExactPairQualificationV1(accessor), /PAN525_EXACT_SELECTION_DENIED/);
  assert.equal(accessorReads, 0, 'validation must never invoke caller accessors');
  const symbolField = { ...request(), [Symbol('approval')]: true };
  assert.throws(() => inspectExactPairQualificationV1(symbolField), /PAN525_EXACT_SELECTION_DENIED/);
});

test('J03 code-owned registry qualifies only the exact synthetic pair joined to actual native persistence evidence', async () => {
  const module = await import('../../src/pan525/exact-pair-qualification.mjs');
  assert.equal(typeof module.readExactQualifiedPairRegistryV1, 'function', 'actual native qualification must have a product registry entry');
  const result = module.readExactQualifiedPairRegistryV1(request());
  assert.equal(result.registryState, 'QUALIFIED_LOCAL_SYNTHETIC_EXACT_PAIR');
  assert.equal(result.pair.consumer.commit, request().consumerCommit);
  assert.equal(result.pair.provider.commit, request().providerCommit);
  assert.equal(result.nativeUpgradeAndPersistence.state, 'VERIFIED_LOCAL_NATIVE_PERSISTENCE');
  assert.equal(result.nativeUpgradeAndPersistence.actualDbUpgradeInvocation, true);
  assert.equal(result.nativeUpgradeAndPersistence.schemaRevisionChangeClaimed, false);
  assert.equal(result.nativeUpgradeAndPersistence.nativeInstallExecutions, 3);
  assert.deepEqual(result.runtimeVersions.native, { node: 'v24.19.0', python: '3.10.20', superset: '6.1.0' });
  assert.equal(result.proofDigests.j01SixIntents, '38d63f7e176afbb5998f4c96ba922e377e01ca874042b4053f45bc4d6ca94ecb');
  assert.equal(result.proofDigests.nativePersistence, '24d451f947a3b725b62ff752ed03716e901b26abae82400829b903d5539c5fba');
  assert.match(result.qualificationDigest, /^[a-f0-9]{64}$/);
  assert.equal(result.ks250IndependentSecondContext.state, 'HELD');
  assert.equal(result.publicSyntheticExternalRunStillUnvalidatedNative, true);
  assert.equal(result.sourceRightsGranted, false);
  assert.equal(result.executionAuthorityGranted, false);
  assert.equal(result.providerRegistryMutated, false);
  assert.equal(result.readOnly, true);
  assert.equal(Object.isFrozen(result.proofDigests), true);
  assert.throws(() => module.readExactQualifiedPairRegistryV1({ ...request(), nativeQualified: true }), /PAN525_EXACT_SELECTION_DENIED/);
});

test('J03 registry refuses a redirected native proof even when the target has the exact evidence digest', async t => {
  const root = mkdtempSync(join(tmpdir(), 'pan525-proof-link-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'src/pan525');
  const contracts = join(root, 'contracts/pan525');
  mkdirSync(source, { recursive: true });
  mkdirSync(contracts, { recursive: true });
  const entry = join(source, 'exact-pair-qualification.mjs');
  copyFileSync('src/pan525/exact-pair-qualification.mjs', entry);
  for (const file of ['exact-pair-qualification-v1.json', 'native-runtime-version-readback-v1.json']) {
    copyFileSync(join('contracts/pan525', file), join(contracts, file));
  }
  const actualBytes = join(root, 'redirected-native-proof.json');
  copyFileSync('contracts/pan525/native-persistence-observation-v1.json', actualBytes);
  symlinkSync(actualBytes, join(contracts, 'native-persistence-observation-v1.json'));
  const module = await import(pathToFileURL(entry).href);
  assert.throws(() => module.readExactQualifiedPairRegistryV1(request()), /PAN525_CODE_OWNED_EVIDENCE_HELD/);
});

test('J03 shipped CLI exposes only exact registry readback and denies new-head aliases extra roles and missing selectors', () => {
  const entry = 'scripts/read-pan525-qualified-pair-v1.mjs';
  const x = request();
  const args = [entry, x.profileId, x.consumerCommit, x.providerCommit];
  const run = input => spawnSync(process.execPath, input, { encoding: 'utf8', timeout: 10000 });
  const positive = run(args);
  assert.equal(positive.status, 0, positive.stderr);
  const result = JSON.parse(positive.stdout);
  assert.equal(result.registryState, 'QUALIFIED_LOCAL_SYNTHETIC_EXACT_PAIR');
  assert.equal(result.sourceRightsGranted, false);
  assert.equal(result.ks250IndependentSecondContext.state, 'HELD');
  for (const input of [
    [entry],
    [entry, x.profileId, 'main', x.providerCommit],
    [entry, x.profileId, x.consumerCommit, 'latest'],
    [entry, x.profileId, '01c1fe12e9a0d48190481c4c454c414dde716ec9', x.providerCommit],
    [...args, '--role=owner'],
  ]) {
    const denied = run(input);
    assert.equal(denied.status, 2);
    assert.equal(denied.stdout, '');
    assert.equal(JSON.parse(denied.stderr).registryState, 'HELD');
  }
});
