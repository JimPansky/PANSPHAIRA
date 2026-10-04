import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildVerificationImpactPlanV2} from '../../dist/packages/contracts/src/index.js';
const load=p=>JSON.parse(readFileSync(p,'utf8'));
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const expected=['contracts/trade/pan516-invoice-cases-v1.json','src/procurement-434/bestellung-lifecycle.mjs','src/procurement-434/bestellung-liability.mjs','src/procurement-434/bestellung-cli.mjs','src/procurement-434/rechnungsabgleich-path-cli.mjs','tests/procurement-434/procurement-lifecycle.test.mjs','tests/procurement-434/procurement-registration.test.mjs','docs/architecture/pan516-native-procurement-v1.md','verification/pan516-native-procurement-evidence-v1.json'];
test('one bounded PAN516 node owns actual local purchase bytes and selects its exact test without changing hard gates or previous owners',()=>{
 const graph=load('verification/verification-dag-v2.json'),nodes=graph.nodes.filter(n=>n.id==='pan516-native-procurement-v1');assert.equal(nodes.length,1);assert.equal(graph.graphVersion,81);
 const node=nodes[0];assert.deepEqual(node.dependsOn,['pan515-native-trade-state-v1','ap-04-incoming-invoice-erv-relational-v2']);assert.deepEqual(node.ownedTests,['npm run pan516:test']);assert.equal(node.globalInvalidation,false);assert.equal(node.riskClass,'HIGH');assert.deepEqual(node.inputs.map(i=>i.path),expected);
 const observedInputDigests=Object.fromEntries(graph.nodes.flatMap(n=>n.inputs.map(i=>[i.path,i.sha256])));
 const manifest=new Set(readFileSync('release/public-files.manifest','utf8').split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.split('\t')[0])),builder=readFileSync('scripts/build-public-release.sh','utf8');
 for(const row of node.inputs){assert.equal(row.sha256,sha(row.path));assert.deepEqual(graph.nodes.filter(n=>n.inputs.some(i=>i.path===row.path)).map(n=>n.id),[node.id]);
  if(row.path!=='src/procurement-434/rechnungsabgleich-path-cli.mjs'){assert.equal(manifest.has(row.path),false,'new bounded source evidence only');assert(builder.includes(JSON.stringify(row.path)));}
  const impact=buildVerificationImpactPlanV2({graph,graphPath:'verification/verification-dag-v2.json',baseSha:'1'.repeat(40),headSha:'2'.repeat(40),changedPaths:[row.path],observedInputDigests});assert.deepEqual(impact.selectedNodes,[node.id,'pan520-native-projections-v1']);assert.deepEqual(impact.selectedTests,['npm run pan516:test','npm run pan520:test']);assert.deepEqual(impact.hardGates,[...graph.hardGates].sort((a,b)=>a.localeCompare(b,'en')));
 }
 const pkg=load('package.json');assert.equal(pkg.scripts['pan516:test'],'TMPDIR="${TMPDIR:-${RUNNER_TEMP:?PAN516_OWNED_SCRATCH_REQUIRED}}" node --test tests/procurement-434/*.test.mjs');assert.equal(pkg.scripts.pretest.split('npm run pan516:test').length,2);assert(pkg.scripts.posttest.includes('npm run pan515:test'));
 assert.deepEqual(graph.nodes.filter(n=>n.inputs.some(i=>i.path==='contracts/trade/common-trade-01-v1.json')).map(n=>n.id),['pan515-native-trade-state-v1']);
});
test('curated native CLI facts bind exact source and separate original COMMON conflict partial invoice and released synthetic full invoice without delivery or authority claims',()=>{
 const proof=load('verification/pan516-native-procurement-evidence-v1.json');assert.equal(proof.caseId,'COMMON-TRADE-01');assert.equal(proof.sourceBytesStableAcrossExecution,true);
 for(const [p,h] of Object.entries(proof.sourceBytePins))assert.equal(sha(p),h,p);
 assert.equal(proof.leadingStore,'PAN472_TARGET_SQLITE');assert.equal(proof.acceptedQuantity,10);assert.equal(proof.remainingQuantity,0);assert.deepEqual(proof.remainingQuantityHistory.map(v=>v.remainingQuantity),[10,2,0]);assert.equal(proof.transmissionCount,1);assert.equal(proof.actualRetryObservation.newOrderEffect,false);assert.equal(proof.actualRetryObservation.readBeforeAnyNewOrderEffect,true);
 assert.deepEqual(proof.liabilities.map(v=>[v.invoiceId,v.invoiceAmountMinor,v.expectedAmountMinor,v.varianceMinor,v.invoiceGrainCount,v.receiptEventCount]),[['AP-01',62000,60000,2000,1,2],['AP-PAN516-PARTIAL-01',30000,30000,0,1,2],['AP-PAN516-MATCHED-01',60000,60000,0,1,2]]);
 assert.deepEqual(proof.liabilities.map(v=>v.status),['UNRESOLVED_AMOUNT_DEVIATION','UNRESOLVED_PARTIAL_INVOICE','RELEASED_LOCAL_SYNTHETIC']);assert.equal(proof.actualCommandReadbacks.length,12);for(const r of proof.actualCommandReadbacks)assert.equal(r.exitCode,0);
 assert.equal(proof.finalAcceptance,false);assert.equal(proof.closureEligible,false);assert.equal(proof.productiveDispatchAuthorized,false);assert.equal(proof.paymentOrderAuthorized,false);assert.equal(proof.externalChannelSelected,false);assert.equal(proof.separateDatabaseIntroduced,false);assert.equal(proof.distributionClass,'SOURCE_EVIDENCE_ONLY_NOT_RUNNABLE_PRODUCT_PACKAGE');
});
