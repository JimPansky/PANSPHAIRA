import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
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
 const probeEnv={...process.env};delete probeEnv.NODE_TEST_CONTEXT;
 for(const args of [['--skip-native'],[files[0]],['--list','--skip-browser']]){const r=spawnSync(process.execPath,[entry,...args],{encoding:'utf8',env:probeEnv});assert.notEqual(r.status,0);assert.match(r.stderr,/PAN549_TEST_ARGUMENT_DENIED/);}
 for(const options of ['--test-name-pattern=never','--test_name_pattern=never','--test_skip_pattern=.*','--test_only','--test-shard=1/6','--test_shard=1/6','"--test_name_pattern=never"','--test-"name-pattern"=(?!)','--test-"skip-pattern"=.*','--test-"shard"=1/6','--test-na"me"_pattern=(?!)','--test-"na\\me-pattern"=(?!)','--test-"only"','--test-rerun-failures=pan549-not-admitted-history','--test-global-setup=./pan549-not-admitted-hook.mjs','--test-isolation=none','--test-reporter=spec']){
  const filtered=spawnSync(process.execPath,[entry],{encoding:'utf8',timeout:45000,env:{...probeEnv,NODE_OPTIONS:options}});assert.equal(filtered.error,undefined);assert.notEqual(filtered.status,0,options);assert.match(filtered.stderr,/PAN549_TEST_ARGUMENT_DENIED/,options);assert.doesNotMatch(filtered.stdout,/PAN549_BROWSER_EVIDENCE_DIR=|TAP version|Subtest:/,options);
 }
 for(const options of ['--experimental-test-isolation=none','--experimental_test_isolation=none','--experi"mental-test-isolation"=none','--no-test-only']){
  const filtered=spawnSync(process.execPath,[entry],{encoding:'utf8',timeout:45000,env:{...probeEnv,NODE_OPTIONS:options}});assert.equal(filtered.error,undefined);assert.notEqual(filtered.status,0,options);assert.match(filtered.stderr,/PAN549_TEST_ARGUMENT_DENIED/,options);assert.doesNotMatch(filtered.stdout,/PAN549_BROWSER_EVIDENCE_DIR=|TAP version|Subtest:/,options);
 }
 for(const marker of ['child-v8','child','','unexpected-marker']){
  const markerEnv={...probeEnv,NODE_TEST_CONTEXT:marker};delete markerEnv.NODE_OPTIONS;delete markerEnv.PAN549_BROWSER_EVIDENCE;
  const denied=spawnSync(process.execPath,[entry],{encoding:'utf8',timeout:45000,env:markerEnv});assert.equal(denied.error,undefined);assert.notEqual(denied.status,0,JSON.stringify(marker));assert.match(denied.stderr,/PAN549_TEST_ARGUMENT_DENIED/,JSON.stringify(marker));assert.equal(denied.stdout,'',JSON.stringify(marker));
  const list=spawnSync(process.execPath,[entry,'--list'],{encoding:'utf8',timeout:45000,env:markerEnv});assert.equal(list.error,undefined);assert.equal(list.status,0,list.stderr);assert.deepEqual(JSON.parse(list.stdout),files);assert.equal(list.stderr,'');
 }
 const scratch=probeEnv.TMPDIR||probeEnv.RUNNER_TEMP;assert.ok(scratch,'PAN549_OWNED_SCRATCH_REQUIRED');const hooks=mkdtempSync(scratch+'/pan549-admission-hooks-');
 try{
  const esm=hooks+'/exit-test-worker.mjs',cjs=hooks+'/exit-test-worker.cjs';const code="if(process.argv.slice(1).some(path=>path.endsWith('.test.mjs')))process.exit(0);\n";writeFileSync(esm,code);writeFileSync(cjs,code);
  for(const options of ['--import='+esm,'--im"port"='+esm,'--require='+cjs,'--re"quire"='+cjs,'-r '+cjs,'--loader='+esm,'--experimental-loader='+esm,'--experimental_loader='+esm,'--trace-require-module=all']){
   const denied=spawnSync(process.execPath,[entry],{encoding:'utf8',timeout:45000,env:{...probeEnv,NODE_OPTIONS:options}});assert.equal(denied.error,undefined,options);assert.notEqual(denied.status,0,options);assert.match(denied.stderr,/PAN549_TEST_ARGUMENT_DENIED/,options);assert.equal(denied.stdout,'',options);
  }
  // This attached short spelling is rejected by Node24 itself, before JS entry.
  const unsupported=spawnSync(process.execPath,[entry],{encoding:'utf8',timeout:45000,env:{...probeEnv,NODE_OPTIONS:'-r'+cjs}});assert.equal(unsupported.error,undefined);assert.notEqual(unsupported.status,0);assert.ok(unsupported.stderr.includes('-r'+cjs));assert.match(unsupported.stderr,/is not allowed in NODE_OPTIONS/);assert.equal(unsupported.stdout,'');
 }finally{rmSync(hooks,{recursive:true});}
 const env={...probeEnv};delete env.TMPDIR;delete env.RUNNER_TEMP;const r=spawnSync(process.execPath,[entry],{encoding:'utf8',env});assert.notEqual(r.status,0);assert.match(r.stderr,/PAN549_OWNED_SCRATCH_REQUIRED/);
 for(const options of ['--conditions=--test-not-a-control','--conditions ordinary-runtime-condition','--conditions=--test-not-a-control --max_old_space_size=256 --trace-warnings']){
  const ordinary=spawnSync(process.execPath,[entry],{encoding:'utf8',env:{...env,NODE_OPTIONS:options}});assert.notEqual(ordinary.status,0);assert.match(ordinary.stderr,/PAN549_OWNED_SCRATCH_REQUIRED/,options);assert.doesNotMatch(ordinary.stderr,/PAN549_TEST_ARGUMENT_DENIED/,options);assert.equal(ordinary.stdout,'');
 }
 const missingValue=spawnSync(process.execPath,[entry],{encoding:'utf8',env:{...env,NODE_OPTIONS:'--conditions --test-not-a-control'}});assert.notEqual(missingValue.status,0);assert.match(missingValue.stderr,/--conditions requires an argument/);assert.equal(missingValue.stdout,'');
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
