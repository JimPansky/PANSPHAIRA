import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {buildVerificationImpactPlanV2} from '../../dist/packages/contracts/src/index.js';
const load=p=>JSON.parse(readFileSync(p,'utf8'));
test('PAN360 one bounded canonical owner preserves historical modules, mandatory hard gates and SOURCE_EVIDENCE_ONLY classification',()=>{
 const graph=load('verification/verification-dag-v2.json');assert.equal(graph.graphVersion,82);
 const nodes=graph.nodes.filter(n=>n.id==='pan360-original-erv-execution-v1');assert.equal(nodes.length,1);const node=nodes[0];
 assert.equal(node.globalInvalidation,false);assert.deepEqual(node.ownedTests,['npm run pan360:test']);
 assert.deepEqual(node.dependsOn,['ap-02-incoming-invoice-intake-v1','ap-04-incoming-invoice-erv-relational-v2','ap-05-incoming-invoice-receipt-manifest-v1']);
 const pkg=load('package.json');assert.ok(pkg.scripts.posttest.endsWith('&& npm run pan360:test && npm run pan378:test && npm run erv-workflow:test'));assert.equal(pkg.scripts['pan360:check'].includes('--check'),true);
 const manifest=new Set(readFileSync('release/public-files.manifest','utf8').split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.split('\t')[0]));
 const inputs=node.inputs.map(i=>i.path);assert.equal(inputs.length,new Set(inputs).size);
 for(const path of inputs){
  assert.equal(manifest.has(path),false,path+' source-only classification');
  assert.deepEqual(graph.nodes.filter(n=>n.inputs.some(i=>i.path===path)).map(n=>n.id),[node.id]);
  const impact=buildVerificationImpactPlanV2({graph,graphPath:'verification/verification-dag-v2.json',baseSha:'1'.repeat(40),headSha:'2'.repeat(40),changedPaths:[path],observedInputDigests:Object.fromEntries(graph.nodes.flatMap(n=>n.inputs.map(i=>[i.path,i.sha256])))});
  assert.deepEqual(impact.selectedNodes,['erv-workflow-native-evidence-v1',node.id,'pan396-original-s3-sqs-lab-v1']);assert.deepEqual(impact.selectedTests,['npm run erv-workflow:test','npm run pan360:test','npm run pan396:test']);
  assert.deepEqual(impact.hardGates,[...graph.hardGates].sort((a,b)=>a.localeCompare(b,'en')));
 }
 assert.ok(inputs.includes('src/pan360/original-erv-core-v1.mjs'));assert.ok(inputs.includes('verification/pan360-original-erv-execution-v1.json'));
});
