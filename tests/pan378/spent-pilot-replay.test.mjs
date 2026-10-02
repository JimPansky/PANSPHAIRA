import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import test from 'node:test';
const scratch=process.env.TMPDIR??process.env.RUNNER_TEMP;
assert.ok(scratch&&resolve(scratch)===scratch,'PAN378_OWNED_SCRATCH_REQUIRED');
test('DOC-AI-AC01 current capability and closure label are synthetic extraction scoring harness, not OCR quality',()=>{
 for(const path of ['docs/INCOMING-INVOICE-PROVING-GROUND.md','docs/evidence/PS360-SOURCE-CLOSURE-v1.md']){
  const bytes=readFileSync(path,'utf8');assert.match(bytes,/AP-03 — Synthetic extraction scoring harness/);assert.doesNotMatch(bytes,/AP-03 — Document-AI benchmark/);
 }
});
test('DOC-AI-AC02..07 complete frozen oracle CLI runs through actual new current-product entry with exact negative report and cleanup',()=>{
 const owned=mkdtempSync(join(scratch,'pan378-test-'));
 try{
  const run=spawnSync(process.execPath,['scripts/run-pan378-spent-pilot.mjs','--check'],{cwd:resolve('.'),env:{PATH:'/usr/bin:/bin',TMPDIR:owned,PAN378_FORBIDDEN_TEST_VALUE:'must-not-reach-oracle',GIT_CONFIG_GLOBAL:'/nonexistent-poison',NODE_OPTIONS:'--no-warnings'},encoding:'utf8',timeout:60000});
  assert.equal(run.status,0,run.stderr);const out=JSON.parse(run.stdout);assert.equal(out.outcome,'REPRODUCED_SPENT_EVALUATION');assert.equal(out.verdict,'FALSIFIED_WITH_EVIDENCE');assert.equal(out.reportFileSha256,'93543d7a2e7282431812fc680d9db8b8605095df6b519fdb6ae94201e946448e');assert.equal(out.completeOracleExecuted,true);assert.equal(out.adversarialProbes,9);assert.equal(out.newBlindTrial,false);assert.equal(out.scratchRemoved,true);assert.deepEqual(readdirSync(owned),[]);
  }finally{rmSync(owned,{recursive:true,force:true});}
});
test('DOC-AI actual oracle Git cannot inherit poisoned PATH, global Git configuration, HOME or credential environment',()=>{
 const owned=mkdtempSync(join(scratch,'pan378-poison-'));
 try{
  const tmp=join(owned,'scratch');mkdirSync(tmp);const bin=join(owned,'bin');mkdirSync(bin);const marker=join(owned,'forbidden-git-executed');
  writeFileSync(join(bin,'git'),'#!/bin/sh\nprintf forbidden > "'+marker+'"\nexit 99\n',{mode:0o700});const config=join(owned,'poison.gitconfig');writeFileSync(config,'THIS IS NOT A VALID GIT CONFIG\n');
  const run=spawnSync(process.execPath,['scripts/run-pan378-spent-pilot.mjs','--check'],{cwd:resolve('.'),env:{PATH:bin,HOME:owned,TMPDIR:tmp,GIT_CONFIG_GLOBAL:config,GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'alias.rev-parse',GIT_CONFIG_VALUE_0:'!exit 99',GITHUB_TOKEN:'synthetic-deny-canary-not-a-credential',NODE_OPTIONS:'--no-warnings'},encoding:'utf8',timeout:60000});
  assert.equal(run.status,0,run.stderr);assert.equal(existsSync(marker),false);assert.deepEqual(readdirSync(tmp),[]);assert.equal(JSON.parse(run.stdout).subprocessEnvironment,'CLEARED_NO_CREDENTIALS_NO_GLOBAL_GIT_CONFIG_NO_HOOKS');
 }finally{rmSync(owned,{recursive:true,force:true});}
});
