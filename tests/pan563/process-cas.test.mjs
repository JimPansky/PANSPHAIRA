import test from 'node:test';
import assert from 'node:assert/strict';
import { fork, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { observeProcessJsonV1 } from './process-observation.mjs';
test('A2 child observation waits for real inherited stdout tail released after parent exit, not a timing assumption or native-result fixture',async()=>{
  const child=fork(new URL('./process-drain-parent.mjs',import.meta.url),[],{stdio:['ignore','pipe','pipe','ipc','pipe']});
  const closed=once(child,'close');const done=observeProcessJsonV1(child);const events=[];
  child.once('exit',()=>{events.push('exit');child.stdio[4].end('release\n');});child.once('close',()=>events.push('close'));
  try{
    await once(child,'message');
    assert.deepEqual(await done,{observation:'OBSERVATION_ONLY_TAIL_AFTER_PARENT_EXIT'});
    await closed;assert.deepEqual(events,['exit','close']);
  }finally{if(!child.stdio[4].writableEnded)child.stdio[4].end('release\n');await closed;}
});
test('A2-AC04 simultaneous independent processes cannot lose updates and a fresh backend process reads identical durable bytes',async()=>{
  const root=mkdtempSync(join(tmpdir(),'pan563-process-'));const jobs=[];
  try{
    for(let i=0;i<8;i++){
      const child=fork(new URL('./process-writer.mjs',import.meta.url),[root,'write'],{silent:true,env:{...process.env}});let stderr='',hasReady=false;
      child.stderr.on('data',x=>stderr+=x);
      const ready=new Promise((resolve,reject)=>{child.once('message',message=>{hasReady=true;resolve(message);});child.once('error',reject);child.once('close',code=>{if(!hasReady)reject(new Error(`PAN563_CHILD_NOT_READY ${code}: ${stderr}`));});});
      const done=observeProcessJsonV1(child);
      jobs.push({child,ready,done});await ready; // schema initialized before opening the next handle, writes remain simultaneous
    }
    jobs.forEach(j=>j.child.send('go'));const results=await Promise.all(jobs.map(j=>j.done));
    assert.equal(results.filter(r=>r.outcome==='SAVED').length,1);assert.equal(results.filter(r=>r.outcome==='CONFIGURATION_REVISION_CONFLICT').length,7);
    const persisted=JSON.parse(execFileSync(process.execPath,[new URL('./process-writer.mjs',import.meta.url).pathname,root,'read'],{encoding:'utf8',env:{...process.env}}));
    assert.deepEqual(persisted,results.find(r=>r.outcome==='SAVED').readback);assert.equal(persisted.revision,1);
  }finally{for(const j of jobs)if(j.child.exitCode === null)j.child.kill();await Promise.allSettled(jobs.map(j=>j.done));rmSync(root,{recursive:true,force:true});}
});
