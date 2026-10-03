import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildVerificationImpactPlanV2} from '../../dist/packages/contracts/src/index.js';
const load=p=>JSON.parse(readFileSync(p,'utf8'));
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const expected=['src/pan517/fulfilment-state.mjs','src/pan517/delivery-milestones.mjs','tests/pan517/native-fulfilment.test.mjs','tests/pan517/calendar-integrity.test.mjs','tests/pan517/registration.test.mjs','docs/architecture/pan517-native-fulfilment-v1.md','verification/pan517-native-fulfilment-evidence-v1.json'];
test('P03 canonical registration owns only additive fulfilment bytes, retains the existing native entry and propagates the unchanged mandatory gates',()=>{
 const graph=load('verification/verification-dag-v2.json'),nodes=graph.nodes.filter(n=>n.id==='pan517-native-fulfilment-v1');assert.equal(nodes.length,1);assert.equal(graph.graphVersion,80);
 const node=nodes[0];assert.deepEqual(node.dependsOn,['pan515-native-trade-state-v1']);assert.deepEqual(node.ownedTests,['npm run pan517:test']);assert.equal(node.globalInvalidation,false);assert.equal(node.riskClass,'HIGH');assert.deepEqual(node.inputs.map(i=>i.path),expected);
 const observedInputDigests=Object.fromEntries(graph.nodes.flatMap(n=>n.inputs.map(i=>[i.path,i.sha256]))),builder=readFileSync('scripts/build-public-release.sh','utf8');
 const manifest=new Set(readFileSync('release/public-files.manifest','utf8').split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.split('\t')[0]));
 for(const row of node.inputs){assert.equal(row.sha256,sha(row.path));assert.deepEqual(graph.nodes.filter(n=>n.inputs.some(i=>i.path===row.path)).map(n=>n.id),[node.id]);assert.equal(manifest.has(row.path),false,'bounded source evidence is not a turnkey product package');assert(builder.includes(JSON.stringify(row.path)));
  const impact=buildVerificationImpactPlanV2({graph,graphPath:'verification/verification-dag-v2.json',baseSha:'1'.repeat(40),headSha:'2'.repeat(40),changedPaths:[row.path],observedInputDigests});assert.deepEqual(impact.selectedNodes,[node.id]);assert.deepEqual(impact.selectedTests,['npm run pan517:test']);assert.deepEqual(impact.hardGates,[...graph.hardGates].sort((a,b)=>a.localeCompare(b,'en')));
 }
 for(const p of ['contracts/trade/common-trade-01-v1.json','src/pan515/trade-state.mjs','scripts/run-pan515-trade-state.mjs'])assert.deepEqual(graph.nodes.filter(n=>n.inputs.some(i=>i.path===p)).map(n=>n.id),['pan515-native-trade-state-v1']);
 const pkg=load('package.json');assert.equal(pkg.scripts['pan517:test'],'TMPDIR="${TMPDIR:-${RUNNER_TEMP:?PAN517_OWNED_SCRATCH_REQUIRED}}" node --test tests/pan517/*.test.mjs');assert.equal(pkg.scripts.pretest.split('npm run pan517:test').length,2);assert.equal(pkg.scripts['pan517:entry'],undefined,'no additional CLI acceptance gate');assert.equal(graph.nodes.find(n=>n.id==='repository-integrity').ownedTests.filter(c=>c==='npm run pan517:test').length,1);
});
test('curated actual native P03 development evidence retains source identities and does not certify independent acceptance or delivery',()=>{
 const report=load('verification/pan517-native-fulfilment-evidence-v1.json');assert.equal(report.caseId,'COMMON-TRADE-01');assert.equal(report.leadingStore,'PAN472_TARGET_SQLITE');assert.equal(report.scope,'LOCAL_SYNTHETIC_DISPOSABLE');assert.equal(report.interfaceOwner,'src/pan515/trade-state.mjs');
 for(const [p,h] of Object.entries(report.sourceBytePins))assert.equal(sha(p),h,p);
 assert.equal(report.sourceBytesStableAcrossExecution,true);assert.deepEqual(report.actualExecution.command,['node','--test','tests/pan517/native-fulfilment.test.mjs','tests/pan517/calendar-integrity.test.mjs']);assert.equal(report.actualExecution.exitCode,0);assert.deepEqual(report.actualExecution.counts,{tests:15,passes:15,fails:0,skips:0});
 assert.equal(report.originalCriteria.length,5);assert.equal(report.originalNegativeCriteria.length,6);assert.equal(report.actualExecution.testNames.length,15);
 assert.equal(report.separateDatabaseIntroduced,false);assert.equal(report.productiveMovementAuthorized,false);assert.equal(report.externalCustomerIdentityProven,false);assert.equal(report.productivePostingAuthorized,false);assert.equal(report.finalAcceptance,false);assert.equal(report.closureEligible,false);assert.equal(report.distributionClass,'SOURCE_EVIDENCE_ONLY_NOT_RUNNABLE_PRODUCT_PACKAGE');
});
