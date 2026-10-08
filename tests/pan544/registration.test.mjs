import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const entry='scripts/run-pan544-native-notification-tests.mjs';
const files=['tests/pan544/native-notifications.test.mjs','tests/pan544/contracts.test.mjs','tests/pan544/gateway.test.mjs','tests/pan544/browser-notifications.test.mjs','tests/pan544/registration.test.mjs'];
const expected=[['docs/architecture/native-workspace-notifications-v1.md','DERIVED_EVIDENCE'],['packages/browser-workspace/src/notifications-v1.ts','SOURCE'],['packages/contracts/src/workspace-notifications-v1.ts','CONTRACT'],[entry,'VALIDATOR'],['src/pan544/native-notifications.mjs','SECURITY'],['tests/pan544/browser-fixture.mjs','VALIDATOR'],['tests/pan544/browser-notifications.test.mjs','VALIDATOR'],['tests/pan544/contracts.test.mjs','VALIDATOR'],['tests/pan544/gateway.test.mjs','VALIDATOR'],['tests/pan544/native-notifications.test.mjs','VALIDATOR'],['tests/pan544/registration.test.mjs','VALIDATOR'],['tests/pan544/restart-reader.mjs','VALIDATOR']];
test('PUI-03 registration: complete fixed native and actual browser suite has one canonical entry',()=>{
  const pkg=JSON.parse(readFileSync('package.json','utf8'));
  assert.equal(pkg.scripts['pan544:test'],'TMPDIR="${TMPDIR:-${RUNNER_TEMP:?PAN544_OWNED_SCRATCH_REQUIRED}}" node '+entry,'PAN544_FIXED_CANONICAL_ENTRY_MISSING');
  assert.equal(pkg.scripts.pretest.split('npm run pan544:test').length,2);
  const list=spawnSync(process.execPath,[entry,'--list'],{encoding:'utf8'});assert.equal(list.status,0,list.stderr);assert.deepEqual(JSON.parse(list.stdout),files);
});
test('PUI-03 registration: selection, skip and missing owned scratch deny before product work',()=>{
  for(const args of [['--skip-native'],[files[0]],['--list','--skip-browser']]){const r=spawnSync(process.execPath,[entry,...args],{encoding:'utf8'});assert.notEqual(r.status,0);assert.match(r.stderr,/PAN544_TEST_ARGUMENT_DENIED/);}
  const filtered=spawnSync(process.execPath,[entry],{encoding:'utf8',env:{...process.env,NODE_OPTIONS:'--test-name-pattern=never'}});assert.notEqual(filtered.status,0);assert.match(filtered.stderr,/PAN544_TEST_ARGUMENT_DENIED/);
  const env={...process.env};delete env.TMPDIR;delete env.RUNNER_TEMP;const r=spawnSync(process.execPath,[entry],{encoding:'utf8',env});assert.notEqual(r.status,0);assert.match(r.stderr,/PAN544_OWNED_SCRATCH_REQUIRED/);
});
test('PUI-03 registration: additive owner reuses leading human and shared shell owners without gate removal',()=>{
  const graph=JSON.parse(readFileSync('verification/verification-dag-v2.json','utf8')),owners=graph.nodes.filter(n=>n.id==='pan544-native-notifications-v1');assert.equal(owners.length,1,'PAN544_DERIVED_DAG_OWNER_MISSING');const owner=owners[0];
  assert.deepEqual(owner.dependsOn,['pan541-shared-browser-shell-v1','pan542-native-erv-human-v1']);assert.deepEqual(owner.ownedTests,['npm run pan544:test']);assert.equal(owner.riskClass,'HIGH');assert.equal(owner.globalInvalidation,false);assert.deepEqual(owner.inputs.map(({path,role})=>[path,role]),expected);
  for(const [path] of expected)assert.deepEqual(graph.nodes.filter(n=>n.inputs.some(i=>i.path===path)).map(n=>n.id),[owner.id]);
  assert.deepEqual(graph.hardGates,['npm run lint','npm run release-governance:verify','npm run supply-chain:verify','sha256sum -c SHA256SUMS','./scripts/build-public-release.sh --output <isolated-absolute-path>']);assert.equal(graph.nodes.find(n=>n.id==='repository-integrity').ownedTests.filter(t=>t==='npm run pan544:test').length,1);
});
test('PUI-03 registration: all new source inputs are exact checksum members',()=>{
  const graph=JSON.parse(readFileSync('verification/verification-dag-v2.json','utf8')),owner=graph.nodes.find(n=>n.id==='pan544-native-notifications-v1');assert.ok(owner,'PAN544_DERIVED_DAG_OWNER_MISSING');
  const sums=new Map(readFileSync('SHA256SUMS','utf8').trimEnd().split('\n').map(line=>{const m=/^([a-f0-9]{64})  \.\/(.+)$/.exec(line);assert.ok(m);return [m[2],m[1]];}));
  for(const input of owner.inputs){const hash=createHash('sha256').update(readFileSync(input.path)).digest('hex');assert.ok(sums.has(input.path),'PAN544_SOURCE_CHECKSUM_MEMBER_MISSING:'+input.path);assert.equal(sums.get(input.path),hash,input.path);assert.equal(input.sha256,hash,input.path);}
});
