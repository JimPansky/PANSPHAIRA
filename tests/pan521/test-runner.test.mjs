import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
const runner='scripts/run-pan521-connected-native-tests.mjs';
const expected=['tests/pan521/connected-native-entry.test.mjs','tests/pan521/local-journey.test.mjs','tests/pan519/native-finance.test.mjs','tests/pan519/contract-transport.test.mjs','tests/pan519/finance-negatives.test.mjs','tests/pan521/registration.test.mjs','tests/pan521/test-runner.test.mjs'];
test('P07 canonical local-stage launcher includes its actual native and finance suites and denies caller filtering or qualification flags',()=>{
 assert.ok(existsSync(runner),'Canonical P07 native launcher is not implemented');
 const list=spawnSync(process.execPath,[runner,'--list'],{encoding:'utf8'});assert.equal(list.status,0,list.stderr);assert.deepEqual(JSON.parse(list.stdout),expected);
 for(const args of [['--skip'],['--test-name-pattern','nothing'],['--qualify-target'],['tests/pan521/local-journey.test.mjs'],['--list','--skip']]){const denied=spawnSync(process.execPath,[runner,...args],{encoding:'utf8'});assert.equal(denied.status,1);assert.match(denied.stderr,/PAN521_TEST_ARGUMENT_DENIED/);assert.equal(denied.stdout,'');}
});
