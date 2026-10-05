import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
const runner='scripts/run-pan521-connected-native-tests.mjs';
const expected=['tests/pan521/connected-native-entry.test.mjs','tests/pan521/local-journey.test.mjs','tests/pan519/native-finance.test.mjs','tests/pan519/contract-transport.test.mjs','tests/pan519/finance-negatives.test.mjs','tests/pan521/registration.test.mjs','tests/pan521/test-runner.test.mjs'];
test('P07 canonical local-stage launcher includes its actual native and finance suites and denies caller filtering or qualification flags',()=>{
 assert.ok(existsSync(runner),'Canonical P07 native launcher is not implemented');
 const scratchCommand='TMPDIR="${TMPDIR:-${RUNNER_TEMP:?PAN521_OWNED_SCRATCH_REQUIRED}}" node '+runner;
 assert.ok(readFileSync('package.json','utf8').includes('"pan521:test": "'+scratchCommand.replaceAll('"','\\"')+'"'),'P07 canonical entry must retain the existing TMPDIR or explicitly supplied CI-owned RUNNER_TEMP, not a system-temp fallback');
 const ciEnv={...process.env,RUNNER_TEMP:process.env.TMPDIR||process.env.RUNNER_TEMP};delete ciEnv.TMPDIR;
 assert.ok(ciEnv.RUNNER_TEMP,'This test requires an existing owned scratch input');
 const ciList=spawnSync('npm',['run','--silent','pan521:test','--','--list'],{encoding:'utf8',env:ciEnv});assert.equal(ciList.status,0,ciList.stderr);assert.equal(ciList.stdout,'['+expected.map(file=>'"'+file+'"').join(',')+']\n');
 delete ciEnv.RUNNER_TEMP;
 const noScratch=spawnSync('npm',['run','--silent','pan521:test','--','--list'],{encoding:'utf8',env:ciEnv});assert.notEqual(noScratch.status,0);assert.match(noScratch.stderr,/PAN521_OWNED_SCRATCH_REQUIRED/);assert.equal(noScratch.stdout,'');
 const list=spawnSync(process.execPath,[runner,'--list'],{encoding:'utf8'});assert.equal(list.status,0,list.stderr);assert.deepEqual(JSON.parse(list.stdout),expected);
 for(const args of [['--skip'],['--test-name-pattern','nothing'],['--qualify-target'],['tests/pan521/local-journey.test.mjs'],['--list','--skip']]){const denied=spawnSync(process.execPath,[runner,...args],{encoding:'utf8'});assert.equal(denied.status,1);assert.match(denied.stderr,/PAN521_TEST_ARGUMENT_DENIED/);assert.equal(denied.stdout,'');}
});
