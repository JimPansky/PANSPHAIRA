import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildVerificationImpactPlanV2} from '../../dist/packages/contracts/src/index.js';
const load=p=>JSON.parse(readFileSync(p,'utf8'));
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const expected=['contracts/trade/pan520-projection-contract-v1.json','src/pan520/native-projection.mjs','tests/pan520/native-projection.test.mjs','tests/pan520/native-procurement-projection.test.mjs','tests/pan520/registration.test.mjs','docs/architecture/pan520-native-projections-v1.md','verification/pan520-native-projection-evidence-v1.json'];
test('P06 one bounded canonical source-projection owner selects real native tests and preserves existing shared-source owners and hard gates',()=>{
 const graph=load('verification/verification-dag-v2.json'),nodes=graph.nodes.filter(n=>n.id==='pan520-native-projections-v1');assert.equal(nodes.length,1);assert.equal(graph.graphVersion,87);
 const node=nodes[0];assert.deepEqual(node.dependsOn,['pan516-native-procurement-v1','pan517-native-fulfilment-v1']);assert.deepEqual(node.inputs.map(i=>i.path),expected);assert.deepEqual(node.ownedTests,['npm run pan520:test']);assert.equal(node.riskClass,'HIGH');assert.equal(node.globalInvalidation,false);
 const observedInputDigests=Object.fromEntries(graph.nodes.flatMap(n=>n.inputs.map(i=>[i.path,i.sha256]))),builder=readFileSync('scripts/build-public-release.sh','utf8'),manifest=new Set(readFileSync('release/public-files.manifest','utf8').split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.split('\t')[0]));
 for(const row of node.inputs){assert.equal(row.sha256,sha(row.path));assert.deepEqual(graph.nodes.filter(n=>n.inputs.some(i=>i.path===row.path)).map(n=>n.id),[node.id]);assert.equal(manifest.has(row.path),false);assert(builder.includes(JSON.stringify(row.path)));
  const impact=buildVerificationImpactPlanV2({graph,graphPath:'verification/verification-dag-v2.json',baseSha:'1'.repeat(40),headSha:'2'.repeat(40),changedPaths:[row.path],observedInputDigests});assert.deepEqual(impact.selectedNodes,[node.id,'pan521-local-connected-native-v1']);assert.deepEqual(impact.selectedTests,['npm run pan520:test','npm run pan521:test']);assert.deepEqual(impact.hardGates,[...graph.hardGates].sort((a,b)=>a.localeCompare(b,'en')));
 }
 for(const p of ['contracts/trade/common-trade-01-v1.json','src/pan515/trade-state.mjs','scripts/run-pan515-trade-state.mjs'])assert.deepEqual(graph.nodes.filter(n=>n.inputs.some(i=>i.path===p)).map(n=>n.id),['pan515-native-trade-state-v1']);
 for(const p of ['src/procurement-434/bestellung-lifecycle.mjs','src/procurement-434/bestellung-liability.mjs'])assert.deepEqual(graph.nodes.filter(n=>n.inputs.some(i=>i.path===p)).map(n=>n.id),['pan516-native-procurement-v1']);
 const pkg=load('package.json');assert.equal(pkg.scripts['pan520:test'],'TMPDIR="${TMPDIR:-${RUNNER_TEMP:?PAN520_OWNED_SCRATCH_REQUIRED}}" node --test tests/pan520/*.test.mjs');assert.equal(pkg.scripts.pretest.split('npm run pan520:test').length,2);assert.equal(pkg.scripts['pan520:entry'],undefined);assert.equal(graph.nodes.find(n=>n.id==='repository-integrity').ownedTests.filter(x=>x==='npm run pan520:test').length,1);
});
test('P06 curated native source execution is byte-bound and explicitly separate from real KS pair and final delivery',()=>{
 const r=load('verification/pan520-native-projection-evidence-v1.json');assert.equal(r.caseId,'COMMON-TRADE-01');assert.equal(r.leadingStore,'PAN472_TARGET_SQLITE');assert.equal(r.scope,'LOCAL_SYNTHETIC_DISPOSABLE');assert.equal(r.interfaceOwner,'src/pan515/trade-state.mjs');assert.equal(r.sourceBytesStableAcrossExecution,true);
 for(const [p,h] of Object.entries(r.sourceBytePins))assert.equal(sha(p),h,p);
 assert.deepEqual(r.implementedProfiles,['O2C','P2P','STOCK']);assert.equal(r.originalCriteria.length,5);assert.equal(r.originalNegativeCriteria.length,5);assert.equal(r.actualNativeExecution.exitCode,0);assert.equal(r.actualNativeExecution.counts.fails,0);assert.equal(r.actualNativeExecution.counts.skips,0);assert.equal(r.actualNativeExecution.counts.tests,r.actualNativeExecution.counts.passes);assert.equal(r.actualNativeExecution.testNames.length,r.actualNativeExecution.counts.tests);
 assert.equal(r.sameExistingTargetReadTransaction,true);assert.equal(r.existingLiabilityAndFrozenErvCoreReused,true);assert.equal(r.actualKsPairedExecutionQualified,false);assert.equal(r.finalAcceptance,false);assert.equal(r.closureEligible,false);assert.equal(r.productiveAuthorityGranted,false);assert.equal(r.separateDatabaseIntroduced,false);assert.equal(r.freeSqlOrCredentialsPassed,false);assert.equal(r.distributionClass,'SOURCE_EVIDENCE_ONLY_NOT_RUNNABLE_PRODUCT_PACKAGE');
});
