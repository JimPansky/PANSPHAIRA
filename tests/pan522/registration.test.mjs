import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {buildVerificationImpactPlanV2} from '../../dist/packages/contracts/src/index.js';
const load=path=>JSON.parse(readFileSync(path,'utf8'));
const digest=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const required=["src/pan522/material-plan.mjs", "src/pan522/plan-input.mjs", "scripts/run-pan522-material-plan.mjs", "scripts/run-pan522-material-tests.mjs", "tests/fixtures/pan522/pan-material-reference-v1.json", "tests/pan522/material-plan.test.mjs", "tests/pan522/material-plan-negatives.test.mjs", "tests/pan522/material-plan-cli.test.mjs", "tests/pan522/material-plan-native-no-effects.test.mjs", "tests/pan522/registration.test.mjs", "tests/pan522/test-runner.test.mjs", "docs/architecture/pan522-material-plan-v1.md", "verification/pan522-material-plan-v1.json"];
test('P08 pure material planning has one additive canonical owner and preserves every hard gate and native authority boundary',()=>{
 const graph=load('verification/verification-dag-v2.json'),owners=graph.nodes.filter(node=>node.id==='pan522-material-plan-v1');
 assert.equal(owners.length,1,'PAN522_MATERIAL_CANONICAL_OWNER_NOT_IMPLEMENTED');
 assert.equal(graph.graphVersion,95);assert.equal(graph.nodes.length,100);
 const owner=owners[0];assert.deepEqual(owner.dependsOn,['pan515-native-trade-state-v1']);assert.deepEqual(owner.ownedTests,['npm run pan522:test']);assert.equal(owner.riskClass,'HIGH');assert.equal(owner.globalInvalidation,false);assert.deepEqual(owner.inputs.map(row=>row.path),required);
 assert.deepEqual(graph.hardGates,['npm run lint','npm run release-governance:verify','npm run supply-chain:verify','sha256sum -c SHA256SUMS','./scripts/build-public-release.sh --output <isolated-absolute-path>']);
 const observedInputDigests=Object.fromEntries(graph.nodes.flatMap(node=>node.inputs.map(row=>[row.path,row.sha256]))),legacy=new Set(readFileSync('release/public-files.manifest','utf8').split('\n').filter(line=>line&&!line.startsWith('#')).map(line=>line.split('\t')[0])),builder=readFileSync('scripts/build-public-release.sh','utf8');
 for(const row of owner.inputs){assert.equal(row.sha256,digest(row.path),row.path);assert.deepEqual(graph.nodes.filter(node=>node.inputs.some(input=>input.path===row.path)).map(node=>node.id),[owner.id]);assert.equal(legacy.has(row.path),false,'P08 is source-only, not new legacy runtime activation');assert.ok(builder.includes(JSON.stringify(row.path)),row.path);
  const plan=buildVerificationImpactPlanV2({graph,graphPath:'verification/verification-dag-v2.json',baseSha:'1'.repeat(40),headSha:'2'.repeat(40),changedPaths:[row.path],observedInputDigests});assert.deepEqual(plan.selectedNodes,[owner.id, "pan523-native-production-v1"]);assert.deepEqual(plan.selectedTests,['npm run pan522:test', "npm run pan523:test"]);assert.deepEqual(plan.hardGates,[...graph.hardGates].sort((a,b)=>a.localeCompare(b,'en')));
 }
 const pkg=load('package.json');assert.equal(pkg.scripts['pan522:test'],'TMPDIR="${TMPDIR:-${RUNNER_TEMP:?PAN522_OWNED_SCRATCH_REQUIRED}}" node scripts/run-pan522-material-tests.mjs');assert.equal(pkg.scripts.pretest.split('npm run pan522:test').length,2);assert.equal(graph.nodes.find(node=>node.id==='repository-integrity').ownedTests.filter(command=>command==='npm run pan522:test').length,1);
 const boundary=load('verification/pan522-material-plan-v1.json');assert.equal(boundary.sourceClass,'SOURCE_EVIDENCE_ONLY');assert.equal(boundary.executionAuthorized,false);assert.equal(boundary.capacityQualified,false);assert.equal(boundary.nativeOrdersUnmodified,true);assert.equal(boundary.externalTargetQualified,false);assert.equal(boundary.sameItemDateIdentity,'AGGREGATE_WITH_ALL_QUANTITATIVE_ALLOCATIONS');
});
