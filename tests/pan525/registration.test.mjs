import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildVerificationImpactPlanV2 } from '../../dist/packages/contracts/src/index.js';
const load = p => JSON.parse(readFileSync(p, 'utf8'));
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex');
const expected = ['contracts/pan525/exact-pair-qualification-v1.json', 'contracts/pan525/native-persistence-observation-v1.json', 'contracts/pan525/native-runtime-version-readback-v1.json', 'src/pan525/exact-pair-qualification.mjs', 'scripts/read-pan525-qualified-pair-v1.mjs', 'tests/pan525/exact-pair-qualification.test.mjs', 'tests/pan525/registration.test.mjs', 'docs/architecture/pan525-exact-qualified-pair-v1.md', 'verification/pan525-exact-qualified-pair-evidence-v1.json'];

test('J03 exact local qualification has one additive owner and retains every hard gate', () => {
  const graph = load('verification/verification-dag-v2.json');
  const nodes = graph.nodes.filter(n => n.id === 'pan525-exact-qualified-pair-v1');
  assert.equal(nodes.length, 1, 'J03 qualification must have its own registered owner');
  assert.equal(graph.graphVersion, 94);
  const node = nodes[0];
  assert.deepEqual(node.dependsOn, ['pan524-exact-bi-pair-v1']);
  assert.deepEqual(node.inputs.map(i => i.path), expected);
  assert.deepEqual(node.ownedTests, ['npm run pan525:test']);
  assert.equal(node.riskClass, 'HIGH');
  assert.equal(node.globalInvalidation, false);
  const observedInputDigests = Object.fromEntries(graph.nodes.flatMap(n => n.inputs.map(i => [i.path, i.sha256])));
  const manifest = new Set(readFileSync('release/public-files.manifest', 'utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split('\t')[0]));
  const builder = readFileSync('scripts/build-public-release.sh', 'utf8');
  for (const row of node.inputs) {
    assert.equal(row.sha256, sha(row.path), row.path);
    assert.deepEqual(graph.nodes.filter(n => n.inputs.some(i => i.path === row.path)).map(n => n.id), [node.id]);
    assert.equal(manifest.has(row.path), false);
    assert(builder.includes(JSON.stringify(row.path)), row.path);
    const impact = buildVerificationImpactPlanV2({ graph, graphPath: 'verification/verification-dag-v2.json', baseSha: '1'.repeat(40), headSha: '2'.repeat(40), changedPaths: [row.path], observedInputDigests });
    assert.deepEqual(impact.selectedNodes, [node.id]);
    assert.deepEqual(impact.selectedTests, ['npm run pan525:test']);
    assert.deepEqual(impact.hardGates, [...graph.hardGates].sort((a, b) => a.localeCompare(b, 'en')));
  }
  const pkg = load('package.json');
  assert.equal(pkg.scripts['pan525:test'], 'node --test tests/pan525/*.test.mjs');
  assert.equal(pkg.scripts.pretest.split('npm run pan525:test').length, 2);
  assert.equal(graph.nodes.find(n => n.id === 'repository-integrity').ownedTests.filter(x => x === 'npm run pan525:test').length, 1);
});

test('J03 public evidence keeps the six original criteria separate from rights and final delivery', () => {
  const evidence = load('verification/pan525-exact-qualified-pair-evidence-v1.json');
  assert.equal(evidence.issue, 525);
  assert.equal(evidence.originalCriteria.length, 6);
  assert.equal(evidence.originalNegatives.length, 4);
  for (const [path, digest] of Object.entries(evidence.sourceBytePins)) assert.equal(sha(path), digest, path);
  assert.deepEqual(evidence.focusedSourceExecution.counts, { tests: 5, pass: 5, fail: 0, skipped: 0 });
  assert.equal(evidence.focusedSourceExecution.exitCode, 0);
  assert.equal(evidence.nativePersistenceActuallyExecuted, true);
  assert.equal(evidence.nativeSchemaRevisionChangeClaimed, false);
  assert.equal(evidence.sameDeliveredJ01SixIntentRunReused, true);
  assert.equal(evidence.ks250IndependentSecondContext, 'HELD');
  assert.equal(evidence.sourceRightsGranted, false);
  assert.equal(evidence.providerRegistryMutated, false);
  assert.equal(evidence.executionAuthorityGranted, false);
  assert.equal(evidence.fullIntegrationAcceptanceClaimed, false);
  assert.equal(evidence.finalAcceptance, false);
  assert.equal(evidence.closureEligible, false);
  assert.equal(evidence.distributionClass, 'SOURCE_EVIDENCE_ONLY_NOT_RUNNABLE_PRODUCT_PACKAGE');
});
