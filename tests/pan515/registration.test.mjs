import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {buildVerificationImpactPlanV2} from '../../dist/packages/contracts/src/index.js';
const load=p=>JSON.parse(readFileSync(p,'utf8'));
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const expected=[
 'contracts/trade/common-trade-01-v1.json','src/pan515/trade-state.mjs','scripts/run-pan515-trade-state.mjs',
 'tests/fixtures/pan515/native-trade-fixture.mjs','tests/fixtures/pan515/native-trade-client.mjs',
 'tests/pan515/native-trade-state.test.mjs','tests/pan515/common-trade-binding.test.mjs','tests/pan515/common-native-events.test.mjs',
 'tests/pan515/native-trade-negative.test.mjs','tests/pan515/native-process-compatibility.test.mjs','tests/pan515/native-cli.test.mjs',
 'tests/pan515/registration.test.mjs','docs/architecture/pan515-native-trade-state-v1.md','verification/pan515-native-trade-evidence-v1.json',
];
test('one bounded PAN515 owner binds every additive source/test byte and unchanged hard gates without claiming runnable-product or productive authority',()=>{
 const graph=load('verification/verification-dag-v2.json');assert.equal(graph.graphVersion,83);
 const nodes=graph.nodes.filter(n=>n.id==='pan515-native-trade-state-v1');assert.equal(nodes.length,1);const node=nodes[0];
 assert.deepEqual(node.dependsOn,['pan473-writer-scope-cutover-v1','pan435-436-sales-stock-journey-v1']);assert.deepEqual(node.ownedTests,['npm run pan515:test']);assert.equal(node.globalInvalidation,false);
 assert.deepEqual(node.inputs.map(r=>r.path),expected);assert.equal(node.inputs.length,new Set(node.inputs.map(r=>r.path)).size);
 const manifest=new Set(readFileSync('release/public-files.manifest','utf8').split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.split('\t')[0]));
 const observedInputDigests=Object.fromEntries(graph.nodes.flatMap(n=>n.inputs.map(i=>[i.path,i.sha256])));
 const builder=readFileSync('scripts/build-public-release.sh','utf8');
 for(const row of node.inputs){
  assert.equal(row.sha256,sha(row.path));assert.equal(manifest.has(row.path),false,'source evidence only: '+row.path);assert(builder.includes(JSON.stringify(row.path)));
  assert.deepEqual(graph.nodes.filter(n=>n.inputs.some(i=>i.path===row.path)).map(n=>n.id),[node.id]);
  const impact=buildVerificationImpactPlanV2({graph,graphPath:'verification/verification-dag-v2.json',baseSha:'1'.repeat(40),headSha:'2'.repeat(40),changedPaths:[row.path],observedInputDigests});
  assert.deepEqual(impact.selectedNodes,[node.id,'pan516-native-procurement-v1','pan517-native-fulfilment-v1','pan520-native-projections-v1']);assert.deepEqual(impact.selectedTests,['npm run pan515:test','npm run pan516:test','npm run pan517:test','npm run pan520:test']);assert.deepEqual(impact.hardGates,[...graph.hardGates].sort((a,b)=>a.localeCompare(b,'en')));
 }
 const pkg=load('package.json');assert.equal(pkg.scripts['pan515:test'],'TMPDIR="${TMPDIR:-${RUNNER_TEMP:?PAN515_OWNED_SCRATCH_REQUIRED}}" node --test tests/pan515/*.test.mjs');assert.equal(pkg.scripts.posttest.split('npm run pan515:test').length,2);
 assert(pkg.scripts.posttest.endsWith('&& npm run pan360:test && npm run pan378:test && npm run erv-workflow:test'));
});
test('curated actual native COMMON facts retain six historical regression separately and cannot self-certify delivery or external freshness',()=>{
 const r=load('verification/pan515-native-trade-evidence-v1.json'),c=load('contracts/trade/common-trade-01-v1.json');
 assert.equal(r.caseId,c.id);assert.equal(r.orderQuantity,10);assert.equal(r.sourceBytesStableAcrossExecution,true);
 assert.equal(r.nativeIdentityMapping.canonicalItemId,'ARTICLE-A');assert.equal(r.nativeIdentityMapping.canonicalWarehouseId,'WH-01');assert.equal(r.nativeDateMapping.nativeDateIsBusinessAcceptance,false);
 assert.equal(r.finalAcceptance,false);assert.equal(r.closureEligible,false);assert.equal(r.productivePostingAuthorized,false);assert.equal(r.separateDatabaseIntroduced,false);assert.equal(r.externalFreshnessAuthorityGranted,false);
 assert.equal(r.distributionClass,'SOURCE_EVIDENCE_ONLY_NOT_RUNNABLE_PRODUCT_PACKAGE');
 for(const [date,key] of [['2026-06-30T23:59:59+02:00','stock_2026_06_30'],['2026-07-31T23:59:59+02:00','stock_2026_07_31']]){
  const actual=r.cutoffs[date];assert.deepEqual({physical:actual.quantities.physical,reserved:actual.quantities.reserved,quarantined:actual.quantities.blocked,free:actual.quantities.available},c.expected[key]);
  for(const lot of actual.lots)assert.ok(lot.reserved+lot.blocked<=lot.physical);
 }
 assert.deepEqual(r.actualNativeEvents.map(e=>e.effectId),['GR-01','GR-02','RS-01','SH-01','SH-02','RET-01']);assert.deepEqual(r.actualNativeEvents.filter(e=>e.reservationChange).map(e=>e.reservationChange.id),['RC-01','RC-02']);
 for(const [path,hash] of Object.entries(r.sourceBytePins))assert.equal(sha(path),hash,path+' actual execution source pin');
 assert.equal(r.actualCommandReadbacks.length,4);for(const cmd of r.actualCommandReadbacks)assert.equal(cmd.exitCode,0);
});
test('PAN515 canonical test entry binds owned CI RUNNER_TEMP without TMPDIR and preserves explicit scratch preference and fail-closed absence',()=>{
 const owned=process.env.TMPDIR||process.env.RUNNER_TEMP;assert.ok(owned,'regression harness itself needs an owned scratch root');
 const root=mkdtempSync(join(owned,'pan515-ci-entry-'));
 const leaf='node --test tests/pan515/*.test.mjs';const command=load('package.json').scripts['pan515:test'];assert.equal(command.split(leaf).length,2);
 const program="import assert from 'node:assert/strict';import {dirname} from 'node:path';import {nativeTradeFixture} from './tests/fixtures/pan515/native-trade-fixture.mjs';const f=await nativeTradeFixture({common:true});try{assert.equal(dirname(f.parent),process.env.TMPDIR);console.log('PAN515_NATIVE_OWNED_SCOPE_EXECUTED');}finally{f.close();}";
 const launch=command.replace(leaf,'node --input-type=module -e '+JSON.stringify(program));
 const run=env=>spawnSync('bash',['-c',launch],{encoding:'utf8',timeout:20000,env:{PATH:process.env.PATH,...env}});
 try{
  const runnerOnly=run({RUNNER_TEMP:root});assert.equal(runnerOnly.status,0,runnerOnly.stderr);assert.match(runnerOnly.stdout,/PAN515_NATIVE_OWNED_SCOPE_EXECUTED/);assert.deepEqual(readdirSync(root),[]);
  const explicit=run({TMPDIR:root,RUNNER_TEMP:join(root,'not-admitted-and-not-created')});assert.equal(explicit.status,0,explicit.stderr);assert.match(explicit.stdout,/PAN515_NATIVE_OWNED_SCOPE_EXECUTED/);assert.deepEqual(readdirSync(root),[]);
  const missing=run({});assert.notEqual(missing.status,0);assert.match(missing.stderr,/PAN515_OWNED_SCRATCH_REQUIRED/);assert.doesNotMatch(missing.stdout,/PAN515_NATIVE_OWNED_SCOPE_EXECUTED/);assert.deepEqual(readdirSync(root),[]);
 }finally{rmSync(root,{recursive:true,force:true});}
});
