import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const runner='scripts/run-pan523-production-tests.mjs';
const expected=["tests/pan523/native-production-boundaries.test.mjs", "tests/pan523/native-production-cli.test.mjs", "tests/pan523/native-production-cost.test.mjs", "tests/pan523/native-production-fulfilment.test.mjs", "tests/pan523/native-production-history.test.mjs", "tests/pan523/native-production-invoice.test.mjs", "tests/pan523/native-production-negatives.test.mjs", "tests/pan523/native-production-revision.test.mjs", "tests/pan523/native-production-rollback.test.mjs", "tests/pan523/native-production.test.mjs", "tests/pan523/historical-native-pins.test.mjs", "tests/pan523/registration.test.mjs", "tests/pan523/test-runner.test.mjs"];
test('P09 closed canonical native suite uses explicitly owned CI scratch and rejects filtering or invented fiscal/source qualifications',()=>{
 assert.ok(existsSync(runner),'Actual native P09 passes but the new complete suite has no registered closed launcher');
 const ciEnv={...process.env,RUNNER_TEMP:process.env.TMPDIR||process.env.RUNNER_TEMP};delete ciEnv.TMPDIR;assert.ok(ciEnv.RUNNER_TEMP);
 const ciList=spawnSync('npm',['run','--silent','pan523:test','--','--list'],{encoding:'utf8',env:ciEnv});assert.equal(ciList.status,0,ciList.stderr);assert.deepEqual(JSON.parse(ciList.stdout),expected);
 delete ciEnv.RUNNER_TEMP;const missing=spawnSync('npm',['run','--silent','pan523:test','--','--list'],{encoding:'utf8',env:ciEnv});assert.notEqual(missing.status,0);assert.match(missing.stderr,/PAN523_OWNED_SCRATCH_REQUIRED/);assert.equal(missing.stdout,'');
 for(const args of [['--skip'],['--test-name-pattern','nothing'],['--qualify-fiscal'],[expected[0]],['--list','--skip']]){const denied=spawnSync(process.execPath,[runner,...args],{encoding:'utf8'});assert.equal(denied.status,1);assert.match(denied.stderr,/PAN523_TEST_ARGUMENT_DENIED/);assert.equal(denied.stdout,'');}
});
