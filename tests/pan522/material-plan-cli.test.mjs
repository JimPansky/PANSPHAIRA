import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import reference from '../fixtures/pan522/pan-material-reference-v1.json' with {type:'json'};

test('P08 operator exposes MRP-only disabled view without input reads or execution authority',()=>{
  const p=spawnSync(process.execPath,['scripts/run-pan522-material-plan.mjs','disabled'],{encoding:'utf8'});
  assert.equal(p.status,0,p.stderr);const result=JSON.parse(p.stdout);
  assert.equal(result.outcome,'MATERIAL_PROPOSALS_DISABLED');assert.deepEqual(result.proposals,[]);
  assert.equal(result.executionAuthorized,false);assert.equal(result.capacityQualified,false);
});

test('P08 operator rejects execution or role selectors instead of dispatching a proposal',()=>{
  for(const args of [['execute'],['plan','--input','tests/fixtures/pan522/pan-material-reference-v1.json','--actor','LOCAL_SYNTHETIC_OWNER'],['plan','--input','tests/fixtures/pan522/pan-material-reference-v1.json','--execute'],['--skip']]){
    const p=spawnSync(process.execPath,['scripts/run-pan522-material-plan.mjs',...args],{encoding:'utf8'});
    assert.equal(p.status,1);assert.equal(p.stdout,'');assert.equal(p.stderr,'PAN522_CLI_ARGUMENT_DENIED\n');
  }
});

test('P08 operator CLI runs the real read-only planner and independently returns the reference quantities and dates',()=>{
  const p=spawnSync(process.execPath,['scripts/run-pan522-material-plan.mjs','plan','--input','tests/fixtures/pan522/pan-material-reference-v1.json'],{encoding:'utf8'});
  assert.equal(p.status,0,p.stderr);
  const output=JSON.parse(p.stdout),a=output.proposals.find(p=>p.itemId==='A'),b=output.proposals.find(p=>p.itemId==='B');
  assert.deepEqual([a.grossQuantity,a.plannedQuantity,a.releaseDate,b.grossQuantity,b.plannedQuantity,b.releaseDate],[20,15,'2026-10-07',30,30,'2026-10-08']);
  assert.equal(output.executionAuthorized,false);assert.equal(output.capacityQualified,false);
  assert.equal(output.sourceInputUnchanged,true);
});
