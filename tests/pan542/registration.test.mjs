import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const entry='scripts/run-pan542-native-human-tests.mjs';
const files=['tests/pan542/native-human-backend.test.mjs','tests/pan542/registration.test.mjs'];
test('PUI-04 registration: exact fixed native suite is connected to canonical pretest',()=>{
  const pkg=JSON.parse(readFileSync('package.json','utf8'));
  assert.equal(pkg.scripts['pan542:test'],'TMPDIR="${TMPDIR:-${RUNNER_TEMP:?PAN542_OWNED_SCRATCH_REQUIRED}}" node '+entry);
  assert.equal(pkg.scripts.pretest.split('npm run pan542:test').length,2);
  const list=spawnSync(process.execPath,[entry,'--list'],{encoding:'utf8'});
  assert.equal(list.status,0,list.stderr);assert.deepEqual(JSON.parse(list.stdout),files);
});
test('PUI-04 registration: partial selection and skips deny before any product work',()=>{
  for(const args of [['--skip-native'],[files[0]],['--list','--skip-native']]){
    const run=spawnSync(process.execPath,[entry,...args],{encoding:'utf8'});
    assert.notEqual(run.status,0);assert.match(run.stderr,/PAN542_TEST_ARGUMENT_DENIED/);
  }
  const filter=spawnSync(process.execPath,[entry],{encoding:'utf8',env:{...process.env,NODE_OPTIONS:'--test-name-pattern=never'}});
  assert.notEqual(filter.status,0);assert.match(filter.stderr,/PAN542_TEST_ARGUMENT_DENIED/);
  const env={...process.env};delete env.TMPDIR;delete env.RUNNER_TEMP;
  const unowned=spawnSync(process.execPath,[entry],{encoding:'utf8',env});
  assert.notEqual(unowned.status,0);assert.match(unowned.stderr,/PAN542_OWNED_SCRATCH_REQUIRED/);
});
test('PUI-04 registration: one additive existing-boundary owner preserves every hard gate',()=>{
  const graph=JSON.parse(readFileSync('verification/verification-dag-v2.json','utf8'));
  const owners=graph.nodes.filter(n=>n.id==='pan542-native-erv-human-v1');
  assert.equal(owners.length,1,'PAN542_DERIVED_DAG_OWNER_MISSING');const owner=owners[0];
  assert.deepEqual(owner.ownedTests,['npm run pan542:test']);assert.equal(owner.riskClass,'HIGH');assert.equal(owner.globalInvalidation,false);
  const expected=[['docs/architecture/erv-human-native-backend-v1.md','DERIVED_EVIDENCE'],[entry,'VALIDATOR'],['src/pan542/native-human-backend.mjs','SECURITY'],[files[0],'VALIDATOR'],[files[1],'VALIDATOR'],['tests/pan542/restart-reader.mjs','VALIDATOR']];
  assert.deepEqual(owner.inputs.map(({path,role})=>[path,role]),expected);
  for(const [path] of expected)assert.deepEqual(graph.nodes.filter(n=>n.inputs.some(i=>i.path===path)).map(n=>n.id),[owner.id]);
  assert.deepEqual(graph.hardGates,['npm run lint','npm run release-governance:verify','npm run supply-chain:verify','sha256sum -c SHA256SUMS','./scripts/build-public-release.sh --output <isolated-absolute-path>']);
  assert.equal(graph.nodes.find(n=>n.id==='repository-integrity').ownedTests.filter(t=>t==='npm run pan542:test').length,1);
});
test('PUI-04 registration: every declared new input has exact checksum membership',()=>{
  const graph=JSON.parse(readFileSync('verification/verification-dag-v2.json','utf8'));
  const owner=graph.nodes.find(n=>n.id==='pan542-native-erv-human-v1');assert.ok(owner,'PAN542_DERIVED_DAG_OWNER_MISSING');
  const sums=new Map(readFileSync('SHA256SUMS','utf8').trimEnd().split('\n').map(line=>{
    const m=/^([a-f0-9]{64})  \.\/(.+)$/.exec(line);assert.ok(m);return [m[2],m[1]];
  }));
  for(const input of owner.inputs){
    const hash=createHash('sha256').update(readFileSync(input.path)).digest('hex');
    assert.ok(sums.has(input.path),'PAN542_SOURCE_CHECKSUM_MEMBER_MISSING:'+input.path);
    assert.equal(sums.get(input.path),hash,input.path);assert.equal(input.sha256,hash,input.path);
  }
});
