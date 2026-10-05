import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
const runner='scripts/run-pan522-material-tests.mjs';
const expected=["tests/pan522/material-plan.test.mjs", "tests/pan522/material-plan-negatives.test.mjs", "tests/pan522/material-plan-cli.test.mjs", "tests/pan522/material-plan-native-no-effects.test.mjs", "tests/pan522/registration.test.mjs", "tests/pan522/test-runner.test.mjs"];
test('P08 canonical material launcher includes its actual material and native no-effects suites and denies caller filtering or qualification flags',()=>{
 assert.ok(existsSync(runner),'Canonical P08 native launcher is not implemented');
 const scratchCommand='TMPDIR="${TMPDIR:-${RUNNER_TEMP:?PAN522_OWNED_SCRATCH_REQUIRED}}" node '+runner;
 assert.ok(readFileSync('package.json','utf8').includes('"pan522:test": "'+scratchCommand.replaceAll('"','\\"')+'"'),'P08 canonical entry must retain the existing TMPDIR or explicitly supplied CI-owned RUNNER_TEMP, not a system-temp fallback');
 const ciEnv={...process.env,RUNNER_TEMP:process.env.TMPDIR||process.env.RUNNER_TEMP};delete ciEnv.TMPDIR;
 assert.ok(ciEnv.RUNNER_TEMP,'This test requires an existing owned scratch input');
 const ciList=spawnSync('npm',['run','--silent','pan522:test','--','--list'],{encoding:'utf8',env:ciEnv});assert.equal(ciList.status,0,ciList.stderr);assert.equal(ciList.stdout,'['+expected.map(file=>'"'+file+'"').join(',')+']\n');
 delete ciEnv.RUNNER_TEMP;
 const noScratch=spawnSync('npm',['run','--silent','pan522:test','--','--list'],{encoding:'utf8',env:ciEnv});assert.notEqual(noScratch.status,0);assert.match(noScratch.stderr,/PAN522_OWNED_SCRATCH_REQUIRED/);assert.equal(noScratch.stdout,'');
 const list=spawnSync(process.execPath,[runner,'--list'],{encoding:'utf8'});assert.equal(list.status,0,list.stderr);assert.deepEqual(JSON.parse(list.stdout),expected);
 for(const args of [['--skip'],['--test-name-pattern','nothing'],['--qualify-target'],['tests/pan522/material-plan.test.mjs'],['--list','--skip']]){const denied=spawnSync(process.execPath,[runner,...args],{encoding:'utf8'});assert.equal(denied.status,1);assert.match(denied.stderr,/PAN522_TEST_ARGUMENT_DENIED/);assert.equal(denied.stdout,'');}
});
