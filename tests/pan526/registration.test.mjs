import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buildVerificationImpactPlanV2 } from '../../dist/packages/contracts/src/index.js';
const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const expected = [
  'contracts/runtime-portability/candidates/runtime-identity-development-v1.schema.json',
  'contracts/runtime-portability/candidates/runtime-identity-development-v2.schema.json',
  'contracts/runtime-portability/candidates/portable-runtime-development-v1.schema.json',
  'contracts/runtime-portability/portable-runtime-v1.schema.json',
  'src/pan526/runtime-contract.mjs',
  'src/pan526/local-runtime-adapter.mjs',
  'scripts/read-pan526-portable-local-runtime-v1.mjs',
  'tests/pan526/ks-node-agent-candidate.test.mjs',
  'tests/pan526/runtime-contract.test.mjs',
  'tests/pan526/local-runtime-adapter.test.mjs',
  'tests/pan526/local-runtime-cli.test.mjs',
  'tests/pan526/local-runtime-native.test.mjs',
  'tests/pan526/registration.test.mjs',
  'docs/architecture/pan526-runtime-identity-development-v1.md',
  'docs/architecture/pan526-runtime-identity-development-v2.md',
  'docs/architecture/pan526-portable-runtime-development-v1.md',
  'docs/architecture/pan526-portable-local-runtime-v1.md',
  'verification/pan526-portable-runtime-evidence-v1.json',
  'verification/pan526-cold-start-resource-raw-v1.json',
];

test('portable runtime owns its actual opt-in product bytes without replacing legacy owners or hard gates', () => {
  const graph = load('verification/verification-dag-v2.json');
  const nodes = graph.nodes.filter((n) => n.id === 'pan526-portable-runtime-v1');
  assert.equal(nodes.length, 1, 'portable runtime needs one additive source owner');
  assert.equal(graph.graphVersion, 98);
  const node = nodes[0];
  assert.deepEqual(node.dependsOn, ['toolchain-central']);
  assert.deepEqual(node.inputs.map((i) => i.path), expected);
  assert.deepEqual(node.ownedTests, ['npm run pan526:test']);
  assert.equal(node.riskClass, 'HIGH'); assert.equal(node.globalInvalidation, false);
  assert.deepEqual(graph.hardGates, ['npm run lint', 'npm run release-governance:verify', 'npm run supply-chain:verify', 'sha256sum -c SHA256SUMS', './scripts/build-public-release.sh --output <isolated-absolute-path>']);
  const observedInputDigests = Object.fromEntries(graph.nodes.flatMap((n) => n.inputs.map((i) => [i.path, i.sha256])));
  const manifest = new Set(readFileSync('release/public-files.manifest', 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t')[0]));
  const builder = readFileSync('scripts/build-public-release.sh', 'utf8');
  for (const row of node.inputs) {
    assert.equal(row.sha256, sha(row.path), row.path);
    assert.deepEqual(graph.nodes.filter((n) => n.inputs.some((i) => i.path === row.path)).map((n) => n.id), [node.id]);
    assert.equal(manifest.has(row.path), false, 'unchanged legacy runnable payload is not replaced by optional source evidence');
    assert(builder.includes(JSON.stringify(row.path)), row.path);
    const plan = buildVerificationImpactPlanV2({ graph, graphPath: 'verification/verification-dag-v2.json', baseSha: '1'.repeat(40), headSha: '2'.repeat(40), changedPaths: [row.path], observedInputDigests });
    assert.deepEqual(plan.selectedNodes, [node.id, "pan527-origin-session-v1", "pan528-guided-native-browser-v1", "pan529-runtime-budget-v1", "pan541-shared-browser-shell-v1", "pan542-native-erv-human-v1", "pan544-native-notifications-v1", "pan548-authentic-context-selection-v1", "pan549-native-analysis-result-v1", "pan563-configuration-draft-v1"]);
    assert.deepEqual(plan.selectedTests, ['npm run pan526:test', 'npm run pan527:test', 'npm run pan528:test', 'npm run pan529:test', "npm run pan541:test", "npm run pan542:test", "npm run pan543:test", "npm run pan544:test", "npm run pan548:test", "npm run pan549:test", "npm run pan563:test"]);
    assert.deepEqual(plan.hardGates, [...graph.hardGates].sort((a,b) => a.localeCompare(b,'en')));
  }
  const pkg = load('package.json');
  assert.equal(pkg.scripts['pan526:test'], 'node --test tests/pan526/runtime-contract.test.mjs tests/pan526/ks-node-agent-candidate.test.mjs tests/pan526/local-runtime-adapter.test.mjs tests/pan526/local-runtime-cli.test.mjs tests/pan526/registration.test.mjs');
  assert.equal(pkg.scripts['pan526:native:test'], 'node --test tests/pan526/local-runtime-native.test.mjs');
  assert.equal(pkg.scripts.pretest.split('npm run pan526:test').length, 2);
  assert.equal(graph.nodes.find((n) => n.id === 'repository-integrity').ownedTests.filter((t) => t === 'npm run pan526:test').length, 1);
});
