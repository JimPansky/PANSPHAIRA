// Independent AC01 actual-entry falsifier on public Main; synthetic provider, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BoundTaskHandleIssuer, createSyntheticTrustedTaskSource, createOwnedSyntheticBusinessOperation, useBoundTaskHandle} from '../../src/pan442/bound-task-handle.mjs';
import {createAuthoritativeApprovalSnapshot} from '../../demo/runtime/authoritative-approval-snapshot.mjs';
const TASK={taskRef:'pan442-order-task-0001',runId:'run:pan442:order:0001',tenant:'panskys-zoo-demo',user:'ops:local-demo',object:{provider:'dolibarr',entity:'Order',operation:'CREATE_IF_ABSENT',refClient:'CM-ADMIN-AI-ESCALATION-001',customerId:7,orderDateEpoch:1767225600},objectVersion:1,purpose:'CREATE_SYNTHETIC_SALES_ORDER',amountLimitMinor:0,currency:'EUR',ttlMs:120000};
test('AC01: reissued handle for the SAME immutable task cannot dispatch a duplicate effect when the approval snapshot lags the target', async()=>{
  const parent=mkdtempSync(join(tmpdir(),'pan453-ac01-red-'));
  const root=join(parent,'pan453-owned-v2');mkdirSync(root);
  let now=1000000, mutations=0, lost=true, snapshotReads=0, targetReads=0;
  const target=[];
  const provider={
    async readAuthoritativeSnapshot(action){snapshotReads++;return createAuthoritativeApprovalSnapshot(action,[]);},
    async mutate(action){mutations++;target.push({id:42,date:action.payload.body.date,ref_client:action.payload.body.ref_client,socid:action.payload.body.socid});if(lost){lost=false;throw Error('SYNTHETIC_RESPONSE_LOSS_AFTER_COMMIT');}return {id:42};},
    async readback(action,result){return target.find(x=>x.id===result.id)??null;},
    async reconcile(action){targetReads++;return target.find(x=>x.ref_client===action.payload.body.ref_client)??null;}
  };
  const source=createSyntheticTrustedTaskSource({principal:{user:TASK.user,tenant:TASK.tenant},tasks:[TASK]});
  const issuer=new BoundTaskHandleIssuer({taskSource:source,secret:'synthetic-composed-recovery-123456',now:()=>now});
  const input={tenant:TASK.tenant,user:TASK.user,runId:TASK.runId,objectVersion:1,declaredAmountMinor:0,currency:'EUR',object:TASK.object};
  const execute=(handle)=>useBoundTaskHandle({issuer,handle,operationInput:input,operation:createOwnedSyntheticBusinessOperation({provider,now:()=>now,root})});
  try{
    const first=issuer.createHandle({taskRef:TASK.taskRef});
    await assert.rejects(execute(first.handle),/BTH_COMPOSE_FAILED/);
    const result=await execute(first.handle);
    assert.equal(result.result.replayState,'RECONCILE_NO_DUPLICATE');
    assert.equal(mutations,1);assert.equal(targetReads,1);
    now+=1;
    const second=issuer.createHandle({taskRef:TASK.taskRef});
    assert.notEqual(first.handleDigest,second.handleDigest,'distinct issue times produce distinct valid handles');
    try{await execute(second.handle);}catch(error){assert.match(error.message,/DENIED|FAILED|CONFLICT|UNRESOLVED/);}
    console.log('PAN453_AC01_STALE_SNAPSHOT_REISSUE '+JSON.stringify({mutations,snapshotReads,targetReads,firstDigest:first.handleDigest,secondDigest:second.handleDigest}));
    assert.equal(mutations,1,'same immutable task must not dispatch a second provider mutation on reissue, even if approval snapshot lags');
  }finally{rmSync(parent,{recursive:true,force:true});}
});
