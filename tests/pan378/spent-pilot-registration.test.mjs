import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {buildVerificationImpactPlanV2} from '../../dist/packages/contracts/src/index.js';
const load=p=>JSON.parse(readFileSync(p,'utf8'));
test('DOC-AI exact canonical owner, mandatory complete replay tests, preserved hard gates and source-only distribution',()=>{
 const graph=load('verification/verification-dag-v2.json');assert.equal(graph.graphVersion,90);
 const nodes=graph.nodes.filter(n=>n.id==='pan378-spent-pilot-reproduction-v3');assert.equal(nodes.length,1);const node=nodes[0];
 assert.equal(node.globalInvalidation,false);assert.deepEqual(node.ownedTests,['npm run pan378:test']);assert.deepEqual(node.dependsOn,[]);
 const pkg=load('package.json');assert.ok(pkg.scripts.posttest.endsWith('&& npm run pan360:test && npm run pan378:test && npm run erv-workflow:test'));assert.equal(pkg.scripts.posttest.split('npm run pan378:test').length,2);assert.match(pkg.scripts['pan378:test'],/node --test tests\/pan378\/\*\.test\.mjs && node scripts\/run-pan378-spent-pilot\.mjs --check$/);
 const manifest=new Set(readFileSync('release/public-files.manifest','utf8').split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.split('\t')[0]));
 assert.equal(node.inputs.length,11);
 for(const {path} of node.inputs){assert.equal(manifest.has(path),false);assert.deepEqual(graph.nodes.filter(n=>n.inputs.some(i=>i.path===path)).map(n=>n.id),[node.id]);
  const impact=buildVerificationImpactPlanV2({graph,graphPath:'verification/verification-dag-v2.json',baseSha:'1'.repeat(40),headSha:'2'.repeat(40),changedPaths:[path],observedInputDigests:Object.fromEntries(graph.nodes.flatMap(n=>n.inputs.map(i=>[i.path,i.sha256])))});
  assert.deepEqual(impact.selectedNodes,[node.id]);assert.deepEqual(impact.selectedTests,['npm run pan378:test']);assert.deepEqual(impact.hardGates,[...graph.hardGates].sort((a,b)=>a.localeCompare(b,'en')));
 }
 assert.equal(node.inputs.filter(x=>x.path.endsWith('.bundle')).length,1);
});
