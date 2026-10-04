import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildVerificationImpactPlanV2} from '../../dist/packages/contracts/src/index.js';
const load=p=>JSON.parse(readFileSync(p,'utf8'));
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const expected=[
 'docs/architecture/pan396-original-s3-sqs-lab-v1.md','packages/contracts/src/floci-invoice-lab-v1.ts',
 'src/pan396/floci-http-v1.mjs','src/pan396/invoice-broker-v1.mjs','src/pan396/simplest-fake-v1.mjs','src/pan396/disabled-ui-proof-v1.mjs',
 'scripts/pan396-original-s3-sqs-proof-v1.mjs','scripts/pan396-owned-floci-runtime-v1.mjs','scripts/pan396-owned-cleanup-v1.mjs',
 '.github/workflows/pan396-native-proof.yml','tests/pan396/invoice-broker.test.mjs','tests/pan396/disabled-ui.test.mjs','tests/pan396/registration.test.mjs',
 'tests/fixtures/pan396/floci-pin-v1.json','verification/pan396-original-s3-sqs-evidence-v1.json',
];
test('one bounded PAN396 owner, unchanged original owners/hard gates and exact source-evidence classification',()=>{
 const graph=load('verification/verification-dag-v2.json');assert.equal(graph.graphVersion,82);
 const nodes=graph.nodes.filter(n=>n.id==='pan396-original-s3-sqs-lab-v1');assert.equal(nodes.length,1);const node=nodes[0];
 assert.deepEqual(node.dependsOn,['pan360-original-erv-execution-v1']);assert.deepEqual(node.ownedTests,['npm run pan396:test']);assert.equal(node.globalInvalidation,false);
 assert.deepEqual(node.inputs.map(r=>r.path),expected);assert.equal(node.inputs.length,new Set(node.inputs.map(r=>r.path)).size);
 const manifest=new Set(readFileSync('release/public-files.manifest','utf8').split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.split('\t')[0]));
 const observedInputDigests=Object.fromEntries(graph.nodes.flatMap(n=>n.inputs.map(i=>[i.path,i.sha256])));
 for(const row of node.inputs){
  assert.equal(row.sha256,sha(row.path));assert.equal(manifest.has(row.path),false,'source evidence only: '+row.path);
  assert.deepEqual(graph.nodes.filter(n=>n.inputs.some(i=>i.path===row.path)).map(n=>n.id),[node.id]);
  const impact=buildVerificationImpactPlanV2({graph,graphPath:'verification/verification-dag-v2.json',baseSha:'1'.repeat(40),headSha:'2'.repeat(40),changedPaths:[row.path],observedInputDigests});
  assert.deepEqual(impact.selectedNodes,[node.id]);assert.deepEqual(impact.selectedTests,['npm run pan396:test']);assert.deepEqual(impact.hardGates,[...graph.hardGates].sort((a,b)=>a.localeCompare(b,'en')));
 }
 const pkg=load('package.json');assert.equal(pkg.scripts['pan396:test'],'node --test tests/pan396/*.test.mjs');assert.equal(pkg.scripts.posttest.split('npm run pan396:test').length,2);
 assert(pkg.scripts.posttest.endsWith('&& npm run pan360:test && npm run pan378:test && npm run erv-workflow:test'));
 assert(!node.inputs.some(x=>x.path.startsWith('src/pan360/')));
});
test('original8, measured differential and explicit hosted cost/promotion/delivery limits stay separate',()=>{
 const report=load('verification/pan396-original-s3-sqs-evidence-v1.json');assert.equal(report.criteria.length,8);assert.equal(report.nativeDenials.length,10);
 assert.equal(report.finalAcceptance,false);assert.equal(report.closureEligible,false);assert.equal(report.promotion,false);assert.equal(report.followOnServiceAdmission,false);assert.equal(report.nativeProviderSubstituted,false);
 assert.equal(report.nativePositive.statistics.coreInvocations,1);assert.equal(report.nativePositive.productivePostingAuthorized,false);assert.equal(report.nativePositive.bookingAuthorityGranted,false);
 assert.equal(report.runtimeAndMaintenanceSnapshot.nativeIsWarmLocalInputCacheNotColdHostedCi,true);assert.equal(report.runtimeAndMaintenanceSnapshot.hostedCiRuntimeOrProviderMaintenanceUnknown,true);
 assert(report.observedDifferential.nativeMissingQueuePutReturned200AndObjectLanded&&report.observedDifferential.namedAtomicFakeRefusedBeforeObjectWrite);
 assert(report.cleanup.exactNativeContainerVolumeNetworkZero&&report.cleanup.exactUiDeltaContainerVolumeNetworkZero);
 const workflow=readFileSync('.github/workflows/pan396-native-proof.yml','utf8');assert(workflow.includes('timeout-minutes: 10'));assert(workflow.includes('timeout --kill-after=30s 180s'));assert(workflow.includes('persist-credentials: false'));assert(workflow.includes('/public-summary.json'));assert(!workflow.includes('path: ${{ runner.temp }}/pan396-native-owned\n'));
 const builder=readFileSync('scripts/build-public-release.sh','utf8');for(const path of expected.filter(p=>!p.startsWith('.github/')))assert(builder.includes(JSON.stringify(path)));
});
