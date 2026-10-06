import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buildVerificationImpactPlanV2 } from '../../dist/packages/contracts/src/index.js';
const load = p => JSON.parse(readFileSync(p, 'utf8'));
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex');

test('optional origin/session surface has one additive source owner and real browser tests in authoritative lifecycle', () => {
  const graph = load('verification/verification-dag-v2.json');
  const owners = graph.nodes.filter(n => n.id === 'pan527-origin-session-v1');
  assert.equal(owners.length, 1, 'new optional executable surface must be registered, not merely published');
  assert.equal(graph.graphVersion, 90);
  const owner = owners[0];
  assert.deepEqual(owner.dependsOn, ['pan526-portable-runtime-v1']);
  assert.deepEqual(owner.ownedTests, ['npm run pan527:test']);
  assert.equal(owner.riskClass, 'HIGH'); assert.equal(owner.globalInvalidation, false);
  assert.deepEqual(graph.hardGates, ['npm run lint', 'npm run release-governance:verify', 'npm run supply-chain:verify', 'sha256sum -c SHA256SUMS', './scripts/build-public-release.sh --output <isolated-absolute-path>']);
  const paths = owner.inputs.map(i => i.path);
  for (const p of ['src/pan527/origin-session-adapter.mjs', 'contracts/hosted-origin-session/protected-route-binding-v1.schema.json', 'contracts/hosted-origin-session/candidates/origin-session-development-v3.json', 'tests/pan527/browser-native-network.test.mjs', 'tests/pan527/bound-session-native.test.mjs', 'tests/pan527/local-compatibility.test.mjs', 'tests/pan527/registration.test.mjs', 'scripts/run-pan527-origin-session-tests.mjs']) assert.ok(paths.includes(p), p);
  const observedInputDigests = Object.fromEntries(graph.nodes.flatMap(n => n.inputs.map(i => [i.path, i.sha256])));
  const manifest = new Set(readFileSync('release/public-files.manifest', 'utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split('\t')[0]));
  const builder = readFileSync('scripts/build-public-release.sh', 'utf8');
  for (const row of owner.inputs) {
    assert.equal(row.sha256, sha(row.path), row.path);
    assert.deepEqual(graph.nodes.filter(n => n.inputs.some(i => i.path === row.path)).map(n => n.id), [owner.id]);
    assert.equal(manifest.has(row.path), false, 'legacy runnable payload remains unchanged; new surface is source evidence');
    assert.ok(builder.includes(JSON.stringify(row.path)), row.path);
    const plan = buildVerificationImpactPlanV2({ graph, graphPath: 'verification/verification-dag-v2.json', baseSha: '1'.repeat(40), headSha: '2'.repeat(40), changedPaths: [row.path], observedInputDigests });
    assert.deepEqual(plan.selectedNodes, [owner.id, 'pan528-guided-native-browser-v1']);
    assert.deepEqual(plan.selectedTests, ['npm run pan527:test', 'npm run pan528:test']);
    assert.deepEqual(plan.hardGates, [...graph.hardGates].sort((a,b) => a.localeCompare(b,'en')));
  }
  const pkg = load('package.json');
  assert.equal(pkg.scripts['pan527:test'], 'node scripts/run-pan527-origin-session-tests.mjs');
  assert.equal(pkg.scripts.pretest.split('npm run pan527:test').length, 2);
  assert.equal(graph.nodes.find(n => n.id === 'repository-integrity').ownedTests.filter(t => t === 'npm run pan527:test').length, 1);
  assert.equal(sha('contracts/runtime-portability/portable-runtime-v1.schema.json'), '7c49eb32b45d4942f81828713babd45ef643a4d63b230e039445e6e9c2c6ebcb');
});
