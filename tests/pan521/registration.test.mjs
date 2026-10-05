import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {buildVerificationImpactPlanV2} from '../../dist/packages/contracts/src/index.js';
const load=path=>JSON.parse(readFileSync(path,'utf8'));
const digest=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const required=['src/pan519/finance-handoff.mjs','src/pan519/contract-transport.mjs','src/pan521/connected-trade.mjs','src/pan521/local-journey.mjs','scripts/run-pan521-connected-trade.mjs','scripts/run-pan521-connected-native-tests.mjs','tests/pan519/native-fixture.mjs','tests/pan519/native-finance.test.mjs','tests/pan519/contract-transport.test.mjs','tests/pan519/finance-negatives.test.mjs','tests/pan521/connected-native-entry.test.mjs','tests/pan521/local-journey.test.mjs','tests/pan521/registration.test.mjs','tests/pan521/test-runner.test.mjs','docs/architecture/pan521-connected-native-stage-v1.md','verification/pan521-local-connected-native-stage-v1.json'];
test('P07 local connected native stage has one additive canonical owner without implying complete fiscal/FiBu qualification',()=>{
 const graph=load('verification/verification-dag-v2.json'),owners=graph.nodes.filter(node=>node.id==='pan521-local-connected-native-v1');
 assert.equal(owners.length,1,'Actual connected native source and operator path have no canonical lifecycle owner');
 assert.equal(graph.graphVersion,89);assert.equal(graph.nodes.length,95);
 const owner=owners[0];assert.deepEqual(owner.dependsOn,['pan515-native-trade-state-v1','pan516-native-procurement-v1','pan517-native-fulfilment-v1','pan520-native-projections-v1']);assert.deepEqual(owner.ownedTests,['npm run pan521:test']);assert.equal(owner.riskClass,'HIGH');assert.equal(owner.globalInvalidation,false);assert.deepEqual(owner.inputs.map(row=>row.path),required);
 assert.deepEqual(graph.hardGates,['npm run lint','npm run release-governance:verify','npm run supply-chain:verify','sha256sum -c SHA256SUMS','./scripts/build-public-release.sh --output <isolated-absolute-path>']);
 const observedInputDigests=Object.fromEntries(graph.nodes.flatMap(node=>node.inputs.map(row=>[row.path,row.sha256]))),legacy=new Set(readFileSync('release/public-files.manifest','utf8').split('\n').filter(line=>line&&!line.startsWith('#')).map(line=>line.split('\t')[0])),builder=readFileSync('scripts/build-public-release.sh','utf8');
 for(const row of owner.inputs){assert.equal(row.sha256,digest(row.path),row.path);assert.deepEqual(graph.nodes.filter(node=>node.inputs.some(input=>input.path===row.path)).map(node=>node.id),[owner.id]);assert.equal(legacy.has(row.path),false,'Connected local scope is source-only, not a silently activated legacy runtime');assert.ok(builder.includes(JSON.stringify(row.path)),row.path);
  const plan=buildVerificationImpactPlanV2({graph,graphPath:'verification/verification-dag-v2.json',baseSha:'1'.repeat(40),headSha:'2'.repeat(40),changedPaths:[row.path],observedInputDigests});assert.deepEqual(plan.selectedNodes,[owner.id]);assert.deepEqual(plan.selectedTests,['npm run pan521:test']);assert.deepEqual(plan.hardGates,[...graph.hardGates].sort((a,b)=>a.localeCompare(b,'en')));
 }
 const pkg=load('package.json');assert.equal(pkg.scripts['pan521:test'],'TMPDIR="${TMPDIR:-${RUNNER_TEMP:?PAN521_OWNED_SCRATCH_REQUIRED}}" node scripts/run-pan521-connected-native-tests.mjs');assert.equal(pkg.scripts.pretest.split('npm run pan521:test').length,2);assert.equal(graph.nodes.find(node=>node.id==='repository-integrity').ownedTests.filter(command=>command==='npm run pan521:test').length,1);
 const boundary=load('verification/pan521-local-connected-native-stage-v1.json');assert.equal(boundary.sourceClass,'SOURCE_EVIDENCE_ONLY');assert.equal(boundary.original521Accepted,false);assert.equal(boundary.original519Accepted,false);assert.equal(boundary.realTargetSandboxQualified,false);assert.equal(boundary.fiscalArchiveQualified,false);assert.equal(boundary.externalPostingAuthorized,false);assert.equal(boundary.paymentDispatchAuthorized,false);assert.equal(boundary.qualifiedReader.producerCommit,'cf199bbd35706bdeadb04679af7354c94caf482a');assert.equal(boundary.qualifiedReader.current521HeadClaimedHistoricalReader,false);
 for(const [path,pin] of Object.entries(boundary.unchangedStandaloneInputs))assert.equal(digest(path),pin,path);
 assert.equal(digest('contracts/trade/common-trade-01-v1.json'),'2b76e8537646f727b75b157a3b5529a44b94e2e8ee551b5fcef9f5d3bd3c8160');
});
