import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildVerificationImpactPlanV2} from '../../dist/packages/contracts/src/index.js';
const load=p=>JSON.parse(readFileSync(p,'utf8'));
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const expected=['scripts/verify-pan524-exact-bi-pair-v1.mjs','tests/fixtures/pan524/published-j02-provider-v0181.json','tests/fixtures/pan524/published-plan-extraction-response-v1.json','tests/fixtures/pan524/published-preview-response-v1.json','tests/pan524/exact-bi-pair-profile.test.mjs','tests/pan524/delivery-surface.test.mjs','tests/pan524/registration.test.mjs','verification/pan524-exact-bi-pair-evidence-v1.json'];

test('J01 exact current pair is additive canonically owned source evidence with unchanged original hard gates',()=>{
  const graph=load('verification/verification-dag-v2.json');assert.equal(graph.graphVersion,93);
  const nodes=graph.nodes.filter(n=>n.id==='pan524-exact-bi-pair-v1');assert.equal(nodes.length,1);const node=nodes[0];
  assert.deepEqual(node.dependsOn,['external-bi-service-v2']);assert.deepEqual(node.ownedTests,['npm run pan524:test']);assert.equal(node.riskClass,'HIGH');assert.equal(node.globalInvalidation,false);assert.deepEqual(node.inputs.map(i=>i.path),expected);
  const inputDigests=Object.fromEntries(graph.nodes.flatMap(n=>n.inputs.map(i=>[i.path,i.sha256])));
  const manifest=new Set(readFileSync('release/public-files.manifest','utf8').split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.split('\t')[0]));
  const builder=readFileSync('scripts/build-public-release.sh','utf8');
  for(const row of node.inputs){
    assert.equal(row.sha256,sha(row.path));assert.deepEqual(graph.nodes.filter(n=>n.inputs.some(i=>i.path===row.path)).map(n=>n.id),[node.id]);assert.equal(manifest.has(row.path),false);assert(builder.includes(JSON.stringify(row.path)));
    const plan=buildVerificationImpactPlanV2({graph,graphPath:'verification/verification-dag-v2.json',baseSha:'1'.repeat(40),headSha:'2'.repeat(40),changedPaths:[row.path],observedInputDigests:inputDigests});
    assert.deepEqual(plan.selectedNodes,[node.id,'pan525-exact-qualified-pair-v1']);assert.deepEqual(plan.selectedTests,['npm run pan524:test','npm run pan525:test']);assert.deepEqual(plan.hardGates,[...graph.hardGates].sort((a,b)=>a.localeCompare(b,'en')));
  }
  for(const path of ['packages/contracts/src/external-bi-service.ts','docs/EXTERNAL-BI-SERVICE.md'])assert.deepEqual(graph.nodes.filter(n=>n.inputs.some(i=>i.path===path)).map(n=>n.id),['external-bi-service-v2']);
  const pkg=load('package.json');assert.equal(pkg.scripts['pan524:test'],'node --test tests/pan524/*.test.mjs');assert.equal(pkg.scripts.pretest.split('npm run pan524:test').length,2);assert.equal(graph.nodes.find(n=>n.id==='repository-integrity').ownedTests.filter(c=>c==='npm run pan524:test').length,1);
});

test('J01 curated focused proof is byte bound development, not substitute provider or original frozen release acceptance',()=>{
  const report=load('verification/pan524-exact-bi-pair-evidence-v1.json');assert.equal(report.issue,524);assert.equal(report.profile,'KS_J02_0181_C2_V1');assert.equal(report.providerCommit,'92f47ef2d5dc74bd44fa3a71c7a296da23c9b928');
  for(const [p,h] of Object.entries(report.sourceBytePins))assert.equal(sha(p),h,p);
  assert.deepEqual(report.actualFocusedExecution.counts,{tests:40,passes:40,fails:0,skips:0});assert.equal(report.actualFocusedExecution.exitCode,0);assert.equal(report.sourceBytesStableAcrossExecution,true);assert.equal(report.originalCriteria.length,4);assert.equal(report.originalNegatives.length,4);
  assert.equal(report.legacyDefaultPreserved,true);assert.equal(report.directOrderReceiverUnchanged,true);assert.equal(report.providerStubIntroduced,false);assert.equal(report.currentFrozenPairAcceptanceClaimed,false);assert.equal(report.registryPromotionAuthorized,false);assert.equal(report.finalAcceptance,false);assert.equal(report.closureEligible,false);assert.equal(report.distributionClass,'SOURCE_EVIDENCE_ONLY_NOT_RUNNABLE_PRODUCT_PACKAGE');
});
