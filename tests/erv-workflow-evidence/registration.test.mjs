import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildVerificationImpactPlanV2 } from '../../dist/packages/contracts/src/index.js';
const load = p => JSON.parse(readFileSync(p, 'utf8'));
test('one bounded ERV evidence owner and mandatory actual replay preserve original owners, source-only classification and every hard gate', () => {
  const graph = load('verification/verification-dag-v2.json');
  assert.equal(graph.graphVersion, 87);
  const nodes = graph.nodes.filter(n => n.id === 'erv-workflow-native-evidence-v1');
  assert.equal(nodes.length, 1); const node = nodes[0];
  assert.equal(node.globalInvalidation, false);
  assert.deepEqual(node.dependsOn, ['pan360-original-erv-execution-v1']);
  assert.deepEqual(node.ownedTests, ['npm run erv-workflow:test']);
  const pkg = load('package.json');
  assert(pkg.scripts.posttest.endsWith('&& npm run pan378:test && npm run erv-workflow:test'));
  assert.equal(pkg.scripts.posttest.split('npm run erv-workflow:test').length, 2);
  assert(pkg.scripts['erv-workflow:test'].includes('node scripts/run-erv-workflow-evidence.mjs --check'));
  const manifest = new Set(readFileSync('release/public-files.manifest', 'utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split('\t')[0]));
  assert.equal(node.inputs.length, 44);
  for (const { path } of node.inputs) {
    assert.equal(manifest.has(path), false, 'source evidence, not runnable-product payload: ' + path);
    assert.deepEqual(graph.nodes.filter(n => n.inputs.some(i => i.path === path)).map(n => n.id), [node.id]);
    const impact = buildVerificationImpactPlanV2({ graph, graphPath: 'verification/verification-dag-v2.json', baseSha: '1'.repeat(40), headSha: '2'.repeat(40), changedPaths: [path], observedInputDigests: Object.fromEntries(graph.nodes.flatMap(n => n.inputs.map(i => [i.path, i.sha256]))) });
    assert.deepEqual(impact.selectedNodes, [node.id]);
    assert.deepEqual(impact.selectedTests, ['npm run erv-workflow:test']);
    assert.deepEqual(impact.hardGates, [...graph.hardGates].sort((a, b) => a.localeCompare(b, 'en')));
  }
  assert(!node.inputs.some(x => x.path.startsWith('src/pan360/')));
  const coreImpact = buildVerificationImpactPlanV2({ graph, graphPath: 'verification/verification-dag-v2.json', baseSha: '1'.repeat(40), headSha: '2'.repeat(40), changedPaths: ['src/pan360/original-erv-core-v1.mjs'], observedInputDigests: Object.fromEntries(graph.nodes.flatMap(n => n.inputs.map(i => [i.path, i.sha256]))) });
  assert(coreImpact.selectedTests.includes('npm run pan360:test'));
  assert(coreImpact.selectedTests.includes('npm run erv-workflow:test'));
});
