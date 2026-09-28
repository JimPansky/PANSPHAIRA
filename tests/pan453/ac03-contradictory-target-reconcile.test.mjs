// AC03 actual composed entry: contradictory independent target vs reconcile callback.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BoundTaskHandleIssuer, createSyntheticTrustedTaskSource, createOwnedSyntheticBusinessOperation, useBoundTaskHandle} from '../../src/pan442/bound-task-handle.mjs';
import {createAuthoritativeApprovalSnapshot} from '../../demo/runtime/authoritative-approval-snapshot.mjs';
const TASK={taskRef:'pan442-order-task-0001',runId:'run:pan442:order:0001',tenant:'panskys-zoo-demo',user:'ops:local-demo',object:{provider:'dolibarr',entity:'Order',operation:'CREATE_IF_ABSENT',refClient:'CM-ADMIN-AI-ESCALATION-001',customerId:7,orderDateEpoch:1767225600},objectVersion:1,purpose:'CREATE_SYNTHETIC_SALES_ORDER',amountLimitMinor:0,currency:'EUR',ttlMs:120000};
test('AC03: a forged matching reconcile result cannot confirm a target absent from independent authoritative snapshot', async()=>{
  const parent=mkdtempSync(join(tmpdir(),'pan453-ac03-red-'));
  const root=join(parent,'pan453-owned-v2');mkdirSync(root);
  let effects=0, snapshotReads=0, reconcileReads=0;
  const actualTarget=[];
  const provider={
    async readAuthoritativeSnapshot(action){snapshotReads++;return createAuthoritativeApprovalSnapshot(action,actualTarget);},
    async mutate(action){effects++;throw Error('SYNTHETIC_RESPONSE_LOSS_BEFORE_COMMIT');},
    async readback(){return null;},
    async reconcile(action){reconcileReads++;return {id:42,date:action.payload.body.date,ref_client:action.payload.body.ref_client,socid:action.payload.body.socid};},
  };
  const source=createSyntheticTrustedTaskSource({principal:{user:TASK.user,tenant:TASK.tenant},tasks:[TASK]});
  const issuer=new BoundTaskHandleIssuer({taskSource:source,secret:'synthetic-composed-recovery-123456',now:()=>1000000});
  const {handle}=issuer.createHandle({taskRef:TASK.taskRef});
  const input={tenant:TASK.tenant,user:TASK.user,runId:TASK.runId,objectVersion:1,declaredAmountMinor:0,currency:'EUR',object:TASK.object};
  const execute=()=>useBoundTaskHandle({issuer,handle,operationInput:input,operation:createOwnedSyntheticBusinessOperation({provider,now:()=>1000000,root})});
  try {
    await assert.rejects(execute(),/BTH_COMPOSE_FAILED/);
    assert.equal(actualTarget.length,0);
    let confirmed=false, secondError;
    try {const result=await execute();confirmed=(result.status==='PASS' && result.result.replayState==='RECONCILE_NO_DUPLICATE');}
    catch(error){secondError=error.message;}
    console.log('PAN453_AC03_CONTRADICTORY_TARGET '+JSON.stringify({effects,snapshotReads,reconcileReads,targetRows:actualTarget.length,confirmed,secondError}));
    assert.equal(reconcileReads,1,'test must reach the real read-only reconcile entry');
    assert.equal(effects,1,'retry cannot dispatch again');
    assert.equal(confirmed,false,'absent authoritative target must not become confirmed via a matching uncorroborated callback');
    assert.equal(actualTarget.length,0);
  }finally{rmSync(parent,{recursive:true,force:true});}
});
