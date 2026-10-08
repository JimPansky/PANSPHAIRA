import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import { spawnSync } from 'node:child_process';
test('A2 complete focused suite is registered in canonical npm pretest, without caller-controlled skip or partial-file selection',()=>{
  const pkg=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url)));
  assert.equal(pkg.scripts['pan563:test'],'TMPDIR="${TMPDIR:-${RUNNER_TEMP:?PAN563_OWNED_SCRATCH_REQUIRED}}" node scripts/run-pan563-configuration-draft-tests.mjs');
  assert.ok(pkg.scripts.pretest.includes('npm run pan563:test'));
  const list=spawnSync(process.execPath,['scripts/run-pan563-configuration-draft-tests.mjs','--list'],{encoding:'utf8'});assert.equal(list.status,0,list.stderr);
  assert.deepEqual(JSON.parse(list.stdout),['tests/pan563/configuration-contract.test.mjs','tests/pan563/compatibility.test.mjs','tests/pan563/durable-draft.test.mjs','tests/pan563/process-cas.test.mjs','tests/pan563/protected-draft.test.mjs','tests/pan563/browser-draft.test.mjs','tests/pan563/registration.test.mjs']);
});
test('A2 suite rejects partial selection and skip/filter environment',()=>{
  for(const args of [['--skip-browser'],['tests/pan563/configuration-contract.test.mjs']]){
    const run=spawnSync(process.execPath,['scripts/run-pan563-configuration-draft-tests.mjs',...args],{encoding:'utf8'});assert.notEqual(run.status,0);assert.match(run.stderr,/PAN563_TEST_ARGUMENT_DENIED/);
  }
  const run=spawnSync(process.execPath,['scripts/run-pan563-configuration-draft-tests.mjs'],{encoding:'utf8',env:{...process.env,NODE_OPTIONS:'--test-name-pattern=never'}});assert.notEqual(run.status,0);
});
test('A2 source distribution has one bounded existing-contract DAG owner with complete exact inputs and unchanged hard gates',()=>{
  const graph=JSON.parse(readFileSync('verification/verification-dag-v2.json','utf8'));
  const owners=graph.nodes.filter(n=>n.id==='pan563-configuration-draft-v1');
  assert.equal(owners.length,1,'PAN563_DERIVED_DAG_OWNER_MISSING');
  const owner=owners[0];
  assert.equal(graph.graphVersion,95);assert.equal(graph.nodes.length,100);
  assert.deepEqual(owner.dependsOn,['pan441-employee-profile-v1','pan529-runtime-budget-v1','pan541-shared-browser-shell-v1']);
  assert.deepEqual(owner.ownedTests,['npm run pan563:test']);assert.equal(owner.riskClass,'HIGH');assert.equal(owner.globalInvalidation,false);
  const expectedInputs=[["docs/architecture/agent-configuration-draft-v1.md", "DERIVED_EVIDENCE"], ["packages/browser-workspace/src/configuration-draft-v1.css", "SOURCE"], ["packages/browser-workspace/src/plugin-configuration-draft-v1.ts", "SOURCE"], ["packages/contracts/src/agent-configuration-draft-v1.ts", "CONTRACT"], ["scripts/run-pan563-configuration-draft-tests.mjs", "VALIDATOR"], ["src/pan563/draft-store.mjs", "SECURITY"], ["tests/pan563/browser-draft.test.mjs", "VALIDATOR"], ["tests/pan563/capture-coverage.mjs", "VALIDATOR"], ["tests/pan563/compatibility.test.mjs", "VALIDATOR"], ["tests/pan563/configuration-contract.test.mjs", "VALIDATOR"], ["tests/pan563/contract-types.ts", "VALIDATOR"], ["tests/pan563/durable-draft.test.mjs", "VALIDATOR"], ["tests/pan563/helpers.mjs", "VALIDATOR"], ["tests/pan563/native-view-capture.mjs", "VALIDATOR"], ["tests/pan563/process-cas.test.mjs", "VALIDATOR"], ["tests/pan563/process-drain-parent.mjs", "VALIDATOR"], ["tests/pan563/process-drain-tail.mjs", "VALIDATOR"], ["tests/pan563/process-observation.mjs", "VALIDATOR"], ["tests/pan563/process-writer.mjs", "VALIDATOR"], ["tests/pan563/protected-draft.test.mjs", "VALIDATOR"], ["tests/pan563/registration.test.mjs", "VALIDATOR"], ["tests/pan563/zoom-extension/manifest.json", "VALIDATOR"], ["tests/pan563/zoom-extension/worker.js", "VALIDATOR"]];
  assert.deepEqual(owner.inputs.map(({path,role})=>[path,role]),expectedInputs);
  for(const [path] of expectedInputs)assert.deepEqual(graph.nodes.filter(n=>n.inputs.some(i=>i.path===path)).map(n=>n.id),[owner.id],path);
  assert.deepEqual(graph.hardGates,['npm run lint','npm run release-governance:verify','npm run supply-chain:verify','sha256sum -c SHA256SUMS','./scripts/build-public-release.sh --output <isolated-absolute-path>']);
  assert.equal(graph.nodes.find(n=>n.id==='repository-integrity').ownedTests.filter(t=>t==='npm run pan563:test').length,1);
});
test('A2 source distribution checksum ledger covers every closed draft input with its actual bytes',()=>{
  const graph=JSON.parse(readFileSync('verification/verification-dag-v2.json','utf8'));
  const owner=graph.nodes.find(n=>n.id==='pan563-configuration-draft-v1');assert.ok(owner);
  const sums=new Map(readFileSync('SHA256SUMS','utf8').trimEnd().split('\n').map(line=>{
    const match=/^([a-f0-9]{64})  \.\/(.+)$/.exec(line);assert.ok(match);return [match[2],match[1]];
  }));
  for(const input of owner.inputs){
    assert.ok(sums.has(input.path),'PAN563_SOURCE_CHECKSUM_MEMBER_MISSING:'+input.path);
    assert.equal(sums.get(input.path),createHash('sha256').update(readFileSync(input.path)).digest('hex'),input.path);
  }
});


