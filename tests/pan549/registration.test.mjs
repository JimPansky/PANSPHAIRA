import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const entry='scripts/run-pan549-native-analysis-tests.mjs';
const files=['tests/pan549/native-analysis-read.test.mjs','tests/pan549/cohort-analysis.test.mjs','tests/pan549/protected-analysis.test.mjs','tests/pan549/browser-analysis.test.mjs','tests/pan549/browser-lifecycle-analysis.test.mjs','tests/pan549/registration.test.mjs'];
const expected=[['contracts/workspace-analysis/pan549-early-candidate-v1.json','CONTRACT'],['docs/architecture/pan549-workspace-analysis-v1.md','DERIVED_EVIDENCE'],['packages/browser-workspace/src/analysis-v1.css','SOURCE'],['packages/browser-workspace/src/plugin-analysis-v1.ts','SOURCE'],['packages/contracts/src/workspace-analysis-v1.ts','CONTRACT'],[entry,'VALIDATOR'],['src/pan549/native-analysis-read.mjs','SECURITY'],['tests/pan549/browser-analysis.test.mjs','VALIDATOR'],['tests/pan549/browser-fixture.mjs','VALIDATOR'],['tests/pan549/browser-lifecycle-analysis.test.mjs','VALIDATOR'],['tests/pan549/cohort-analysis.test.mjs','VALIDATOR'],['tests/pan549/native-analysis-read.test.mjs','VALIDATOR'],['tests/pan549/protected-analysis.test.mjs','VALIDATOR'],['tests/pan549/registration.test.mjs','VALIDATOR']];
test('PUI-08 registration: complete fixed native, real cohort, protected ingress and actual browser suite has one canonical entry',()=>{
 const pkg=JSON.parse(readFileSync('package.json','utf8'));assert.equal(pkg.scripts['pan549:test'],'TMPDIR="${TMPDIR:-${RUNNER_TEMP:?PAN549_OWNED_SCRATCH_REQUIRED}}" node '+entry,'PAN549_FIXED_CANONICAL_ENTRY_MISSING');assert.equal(pkg.scripts.pretest.split('npm run pan549:test').length,2);
 const list=spawnSync(process.execPath,[entry,'--list'],{encoding:'utf8'});assert.equal(list.status,0,list.stderr);assert.deepEqual(JSON.parse(list.stdout),files);
});
test('PUI-08 registration: selection, skip and missing owned scratch deny before product work',()=>{
 for(const args of [['--skip-native'],[files[0]],['--list','--skip-browser']]){const r=spawnSync(process.execPath,[entry,...args],{encoding:'utf8'});assert.notEqual(r.status,0);assert.match(r.stderr,/PAN549_TEST_ARGUMENT_DENIED/);}
 for(const options of ['--test-name-pattern=never','--test_name_pattern=never','--test_skip_pattern=.*','--test_only','--test-shard=1/6','--test_shard=1/6','"--test_name_pattern=never"','--test-"name-pattern"=(?!)','--test-"skip-pattern"=.*','--test-"shard"=1/6','--test-na"me"_pattern=(?!)','--test-"na\\me-pattern"=(?!)','--test-"only"','--test-rerun-failures=pan549-not-admitted-history','--test-global-setup=./pan549-not-admitted-hook.mjs','--test-isolation=none','--test-reporter=spec']){
  const filtered=spawnSync(process.execPath,[entry],{encoding:'utf8',timeout:45000,env:{...process.env,NODE_OPTIONS:options}});assert.equal(filtered.error,undefined);assert.notEqual(filtered.status,0,options);assert.match(filtered.stderr,/PAN549_TEST_ARGUMENT_DENIED/,options);assert.doesNotMatch(filtered.stdout,/PAN549_BROWSER_EVIDENCE_DIR=|TAP version|Subtest:/,options);
 }
 const env={...process.env};delete env.TMPDIR;delete env.RUNNER_TEMP;const r=spawnSync(process.execPath,[entry],{encoding:'utf8',env});assert.notEqual(r.status,0);assert.match(r.stderr,/PAN549_OWNED_SCRATCH_REQUIRED/);
});
test('PUI-08 registration: additive owner reuses actual native projection, existing cohort and shared shell without old owner or gate removal',()=>{
 const graph=JSON.parse(readFileSync('verification/verification-dag-v2.json','utf8')),owners=graph.nodes.filter(n=>n.id==='pan549-native-analysis-result-v1');assert.equal(owners.length,1,'PAN549_DERIVED_DAG_OWNER_MISSING');const owner=owners[0];
 assert.deepEqual(owner.dependsOn,['awi-insights-1-usage-insights-v1','pan520-native-projections-v1','pan541-shared-browser-shell-v1']);assert.deepEqual(owner.ownedTests,['npm run pan549:test']);assert.equal(owner.riskClass,'HIGH');assert.equal(owner.globalInvalidation,false);assert.deepEqual(owner.inputs.map(({path,role})=>[path,role]),expected);
 for(const [path] of expected)assert.deepEqual(graph.nodes.filter(n=>n.inputs.some(i=>i.path===path)).map(n=>n.id),[owner.id]);
 assert.deepEqual(graph.hardGates,['npm run lint','npm run release-governance:verify','npm run supply-chain:verify','sha256sum -c SHA256SUMS','./scripts/build-public-release.sh --output <isolated-absolute-path>']);assert.equal(graph.nodes.find(n=>n.id==='repository-integrity').ownedTests.filter(t=>t==='npm run pan549:test').length,1);
});
test('PUI-08 registration: every new source input is an exact checksum member; early counterpart descriptor bytes remain historical',()=>{
 const graph=JSON.parse(readFileSync('verification/verification-dag-v2.json','utf8')),owner=graph.nodes.find(n=>n.id==='pan549-native-analysis-result-v1');assert.ok(owner,'PAN549_DERIVED_DAG_OWNER_MISSING');
 const sums=new Map(readFileSync('SHA256SUMS','utf8').trimEnd().split('\n').map(line=>{const m=/^([a-f0-9]{64})  \.\/(.+)$/.exec(line);assert.ok(m);return [m[2],m[1]];}));
 for(const input of owner.inputs){const hash=createHash('sha256').update(readFileSync(input.path)).digest('hex');assert.ok(sums.has(input.path),'PAN549_SOURCE_CHECKSUM_MEMBER_MISSING:'+input.path);assert.equal(sums.get(input.path),hash,input.path);assert.equal(input.sha256,hash,input.path);}
 assert.equal(createHash('sha256').update(readFileSync('contracts/workspace-analysis/pan549-early-candidate-v1.json')).digest('hex'),'bdc57ee9dcebd007e70b1f24b06cf8d794a4fbccfa2e145e1b541cd75c8c0a5e','PAN549_EARLY_COUNTERPART_DESCRIPTOR_IMMUTABLE_BYTES_CHANGED');
});
test('PUI-08 registration: closed builder classifies every new source-only member without changing the legacy runnable payload',()=>{
 const builder=readFileSync('scripts/build-public-release.sh','utf8');
 const publicPaths=new Set(readFileSync('release/public-files.manifest','utf8').split('\n').filter(line=>line&&!line.startsWith('#')).map(line=>line.split('\t')[0]));
 assert.equal(publicPaths.size,1792);
 for(const [path] of expected){assert.equal(publicPaths.has(path),false,path);assert.ok(builder.includes(JSON.stringify(path)),'PAN549_CLOSED_BUILDER_SOURCE_MEMBER_MISSING:'+path);}
});
