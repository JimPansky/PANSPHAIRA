import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';

const entry = new URL('../../src/pan471/composition-execution.mjs', import.meta.url);
test('the finite composition workload has measured kernel file process and network denials with permitted data scratch output counterparts', async () => {
  assert.ok(existsSync(entry), 'PAN576 needs an actual separated native execution boundary; earlier intra-container falsification and Node permission are not this capability.');
  const {probePan471CompositionIsolation} = await import(entry.href);
  const report = await probePan471CompositionIsolation();
  console.log('PAN576_ACTUAL_KERNEL_REPORT ' + JSON.stringify(report));
  assert.equal(report.outcome, 'BOUNDED_KERNEL_CROSSINGS_OBSERVED');
  assert.equal(report.observed.uid, 1000);
  assert.equal(report.observed.permittedContextRead, true);
  assert.equal(report.observed.permittedScratchWrite, true);
  assert.equal(report.observed.permittedOutputWrite, true);
  assert.equal(report.observed.protectedRead, 'EACCES');
  assert.equal(report.observed.asyncProtectedRead, 'EACCES');
  assert.equal(report.observed.symlinkEscape, 'EACCES');
  assert.equal(report.observed.childProcess, 'EPERM');
  assert.equal(report.observed.networkSocket, 'EPERM');
  assert.equal(report.observed.rootWrite, 'EROFS');
  assert.equal(report.actualContainer.network, 'none');
  assert.equal(report.actualContainer.readOnlyRoot, true);
  assert.equal(report.actualContainer.noNewPrivileges, true);
  assert.equal(report.actualContainer.privileged, false);
  assert.deepEqual(report.actualContainer.capabilitiesDropped, ['ALL']);
  assert.equal(report.ownContainerRemovedAndAbsent, true);
  assert.equal(report.ownStagingRemoved, true);
  assert.equal(report.earlier454FalsificationUnchanged, true);
  assert.equal(report.nodePermissionIsSecurityBoundary, false);
  assert.equal(report.modelRun, 'NOT_RUN');
});

function materialInput() {
  return {schema:'pansphaira.pan522/material-plan-input/v1',asOf:'2026-10-07',horizonEnd:'2026-10-31',
    calendars:[{id:'CAL576',timezone:'UTC',weekdays:[1,2,3,4,5],holidays:[],validFrom:'2026-01-01',validUntil:'2027-01-01'}],
    items:[{id:'ITEM576',stockArticleId:'SYN-ART-576',warehouseId:'LAGER-576',unit:'STK',supply:'BUY',safetyStock:0,lotMinimum:0,lotMultiple:1,leadWorkdays:2,calendarId:'CAL576'}],
    boms:[],demands:[{id:'DEMAND576',itemId:'ITEM576',unit:'STK',quantity:17,dueDate:'2026-10-14'}],
    stock:[{itemId:'ITEM576',unit:'STK',physical:4,reserved:0,blocked:0,sourceRevision:'snapshot-576',observedOn:'2026-10-07'}],receipts:[]};
}
const PREPARED_TEST_ARTIFACT = `export async function run(ctx,input) {
  const plan=await ctx.invoke('pan522.material.plan',input.material);
  const quantity=plan.nativeResult.proposals[0].plannedQuantity;
  const cell=await ctx.invoke('erp.order.create',{requestId:input.requestId,sku:input.sku,quantity});
  return {quantity,receiptDigest:cell.nativeResult.receiptDigest};
}`;

test('a trusted owner freezes exact untrusted artifact and native build bindings then an external verifier reads actual two-tool effects and fresh-input reexecution', async () => {
  const api=await import(entry.href);
  assert.equal(typeof api.createPan471CompositionExecutor,'function','PAN576 must execute a submitted run(ctx,input) artifact through external native tools, not only kernel canaries.');
  const executor=api.createPan471CompositionExecutor();
  const handle=executor.controller.freeze({schemaVersion:'pansphaira.pan471/composition-submission/v1',version:'1.0.0',entrypoint:'run(ctx,input)',code:PREPARED_TEST_ARTIFACT});
  try {
    const firstInput={material:materialInput(),requestId:'request:erp-cell-pan576-first',sku:'SYN-PAN576'};
    const first=await executor.tools.run(handle,firstInput);
    console.log('PAN576_ACTUAL_NATIVE_ARTIFACT_REPORT '+JSON.stringify(first));
    assert.equal(first.outcome,'NATIVE_COMPOSITION_ARTIFACT_READ_BACK');
    assert.equal(first.exitCode,0); assert.equal(first.allowedToolCalls,2);
    assert.equal(first.nativeEvidence.materialInvocations,1);
    assert.equal(first.nativeEvidence.cell.executions,1);
    assert.equal(first.nativeEvidence.cell.providerOrderCount,0);
    assert.equal(first.oracle.plannedQuantity,13);
    assert.equal(first.nativeCellReceipt.effectCount,1);
    assert.equal(first.nativeCellReceipt.rollbackCount,1);
    assert.equal(first.nativeCellReceipt.beforeDigest,first.nativeCellReceipt.finalDigest);
    assert.equal(executor.controller.verify(first).outcome,'VERIFIED_NATIVE_TARGET');
    const secondInput=structuredClone(firstInput);secondInput.material.demands[0].quantity=29;secondInput.material.stock[0].physical=8;
    secondInput.requestId='request:erp-cell-pan576-second';
    const second=await executor.tools.run(handle,secondInput);
    assert.equal(second.outcome,'NATIVE_COMPOSITION_ARTIFACT_READ_BACK');
    assert.equal(second.artifactDigest,first.artifactDigest);
    assert.notEqual(second.inputDigest,first.inputDigest);
    assert.equal(second.oracle.plannedQuantity,21);
    assert.equal(second.nativeEvidence.cell.executions,1);
    assert.equal(second.nativeEvidence.cell.providerOrderCount,0);
    assert.equal(executor.controller.verify(second).outcome,'VERIFIED_NATIVE_TARGET');
    assert.equal(first.modelRun,'NOT_RUN');assert.equal(first.newCompositionClaimed,false);
    assert.equal(first.crashDurableExactlyOnceClaimed,false);
    assert.equal(first.ownContainerRemovedAndAbsent,true);assert.equal(second.ownContainerRemovedAndAbsent,true);
  } finally {executor.controller.close();}
});

test('a valid owner signature over a false business quantity never passes the separated native target verifier', async () => {
  const api=await import(entry.href);const executor=api.createPan471CompositionExecutor();
  try {
    assert.equal(typeof executor.controller.sealStatement,'function','PAN576 needs a separated owner signer and native-target verifier; a log digest is not this test.');
    const handle=executor.controller.freeze({schemaVersion:'pansphaira.pan471/composition-submission/v1',version:'1.0.0',entrypoint:'run(ctx,input)',code:PREPARED_TEST_ARTIFACT});
    const report=await executor.tools.run(handle,{material:materialInput(),requestId:'request:erp-cell-pan576-signature',sku:'SYN-PAN576'});
    const genuine=executor.controller.sealStatement(report,{quantity:13});
    assert.equal(executor.controller.verifyStatement(genuine).outcome,'VERIFIED_NATIVE_TARGET');
    const falseButValidlySigned=executor.controller.sealStatement(report,{quantity:99});
    const result=executor.controller.verifyStatement(falseButValidlySigned);
    console.log('PAN576_VALID_SIGNATURE_FALSE_BUSINESS_CLAIM '+JSON.stringify(result));
    assert.equal(result.outcome,'DENIED');
    assert.equal(result.code,'NATIVE_TARGET_NOT_VERIFIED');
    assert.equal(result.signatureValid,true);
    assert.equal(executor.controller.verifyStatement({...genuine,signature:'forged'}).code,'SIGNATURE_DENIED');
    assert.equal(executor.controller.verify({...report,outcome:'NATIVE_COMPOSITION_ARTIFACT_READ_BACK'}).code,'TARGET_RECORD_UNKNOWN');
    assert.equal(report.nativeEvidence.cell.executions,1);assert.equal(report.nativeEvidence.cell.providerOrderCount,0);
    assert.equal(report.ownContainerRemovedAndAbsent,true);
  } finally {executor.controller.close();}
});

test('an artifact crash after real native effect is unknown until explicit native reconciliation and cannot blindly rerun', async () => {
  const api=await import(entry.href);const executor=api.createPan471CompositionExecutor();
  const crashedCode=PREPARED_TEST_ARTIFACT.replace('return {quantity,receiptDigest:cell.nativeResult.receiptDigest};','process.exit(78);');
  try {
    const handle=executor.controller.freeze({schemaVersion:'pansphaira.pan471/composition-submission/v1',version:'1.0.0',entrypoint:'run(ctx,input)',code:crashedCode});
    const input={material:materialInput(),requestId:'request:erp-cell-pan576-crash',sku:'SYN-PAN576'};
    const report=await executor.tools.run(handle,input);
    assert.equal(report.exitCode,78);assert.equal(report.nativeEvidence.cell.executions,1);
    assert.equal(report.workflowState,'OUTCOME_UNKNOWN','A process exit after native dispatch needs explicit ambiguity/readback semantics, not merely a failed final output.');
    assert.equal(report.effectState,'REQUIRES_NATIVE_RECONCILIATION');
    assert.equal(report.nativeCellReceipt.rollbackCount,1);
    assert.equal(report.nativeEvidence.cell.providerOrderCount,0);
    assert.equal(report.ownContainerRemovedAndAbsent,true);assert.equal(report.ownStagingRemoved,true);
    assert.equal(report.automaticRetries,0);assert.equal(report.crashDurableExactlyOnceClaimed,false);
    assert.equal((await executor.tools.run(handle,input)).code,'UNRECONCILED_NATIVE_EFFECT');
    assert.throws(()=>executor.controller.close(),/PAN576_NATIVE_RECONCILIATION_REQUIRED/,
      'Normal owner shutdown must not erase an unresolved native-effect fence or its target readback.');
    const reconciled=executor.controller.reconcile(report);
    console.log('PAN576_REAL_NATIVE_EFFECT_ARTIFACT_CRASH_RECONCILIATION '+JSON.stringify({report,reconciled}));
    assert.equal(reconciled.outcome,'RECONCILED_NATIVE_TARGET');
    assert.equal(reconciled.effectState,'OBSERVED_COMPENSATED');
    assert.equal(reconciled.nativeExecutions,1);assert.equal(reconciled.providerOrderCount,0);
    assert.equal(reconciled.automaticRetryPermitted,false);
    assert.equal(executor.controller.verify(report).outcome,'DENIED');
  } finally {executor.controller.close();}
});

test('the actual bounded workload timeout after a native effect cleans its invocation and requires reconciliation without retry', async () => {
  const api=await import(entry.href);const executor=api.createPan471CompositionExecutor();
  const timeoutCode=PREPARED_TEST_ARTIFACT.replace('return {quantity,receiptDigest:cell.nativeResult.receiptDigest};','await new Promise(()=>{});');
  try {
    const handle=executor.controller.freeze({schemaVersion:'pansphaira.pan471/composition-submission/v1',version:'1.0.0',entrypoint:'run(ctx,input)',code:timeoutCode});
    const input={material:materialInput(),requestId:'request:erp-cell-pan576-timeout',sku:'SYN-PAN576'};
    const report=await executor.tools.run(handle,input);
    console.log('PAN576_ACTUAL_NATIVE_EFFECT_TIMEOUT '+JSON.stringify(report));
    assert.equal(report.timedOut,true);assert.equal(report.workflowState,'OUTCOME_UNKNOWN');
    assert.equal(report.nativeEvidence.cell.executions,1);assert.equal(report.nativeEvidence.cell.providerOrderCount,0);
    assert.equal(report.ownContainerRemovedAndAbsent,true);assert.equal(report.ownStagingRemoved,true);
    assert.equal(report.automaticRetries,0);assert.equal(report.crashDurableExactlyOnceClaimed,false);
    assert.equal((await executor.tools.run(handle,input)).code,'UNRECONCILED_NATIVE_EFFECT');
    assert.equal(executor.controller.reconcile(report).effectState,'OBSERVED_COMPENSATED');
    assert.equal(executor.controller.verify(report).outcome,'DENIED');
  } finally {executor.controller.close();}
});

test('a forged source selector and altered submission metadata have no server-issued artifact authority', async () => {
  const api=await import(entry.href);const executor=api.createPan471CompositionExecutor();
  try {
    const submission={schemaVersion:'pansphaira.pan471/composition-submission/v1',version:'1.0.0',entrypoint:'run(ctx,input)',code:PREPARED_TEST_ARTIFACT};
    assert.throws(()=>executor.controller.freeze({...submission,callerHash:'self-declared'}),/PAN576_SUBMISSION_CONTRACT_DENIED/);
    const handle=executor.controller.freeze(submission);
    const input={material:materialInput(),requestId:'request:erp-cell-pan576-authority',sku:'SYN-PAN576'};
    assert.equal((await executor.tools.run({...handle},input)).code,'AUTHORITY_DENIED');
    const foreign=api.createPan471CompositionExecutor();
    try {assert.equal((await foreign.tools.run(handle,input)).code,'AUTHORITY_DENIED');}
    finally {foreign.controller.close();}
    let getterCalls=0;const getterSubmission={...submission};
    Object.defineProperty(getterSubmission,'code',{enumerable:true,get(){getterCalls++;return PREPARED_TEST_ARTIFACT;}});
    assert.throws(()=>executor.controller.freeze(getterSubmission),/DATA_ONLY_DENIED/);
    assert.equal(getterCalls,0);
  } finally {executor.controller.close();}
});

test('invented successful output and an unknown direct-effect capability cannot produce a native target PASS', async () => {
  const api=await import(entry.href);const executor=api.createPan471CompositionExecutor();
  const submission=code=>({schemaVersion:'pansphaira.pan471/composition-submission/v1',version:'1.0.0',entrypoint:'run(ctx,input)',code});
  try {
    const input={material:materialInput(),requestId:'request:erp-cell-pan576-fake',sku:'SYN-PAN576'};
    const fake=executor.controller.freeze(submission(`export async function run(){return {quantity:13,receiptDigest:'invented-success'}}`));
    const falseReport=await executor.tools.run(fake,input);
    assert.equal(falseReport.outcome,'NATIVE_TARGET_NOT_VERIFIED');
    assert.equal(falseReport.nativeEvidence.materialInvocations,0);assert.equal(falseReport.nativeEvidence.cell.executions,0);
    assert.equal(executor.controller.verify(falseReport).outcome,'DENIED');
    const signed=executor.controller.sealStatement(falseReport,{quantity:13});
    const signedResult=executor.controller.verifyStatement(signed);
    assert.equal(signedResult.signatureValid,true);assert.equal(signedResult.outcome,'DENIED');
    const unknown=executor.controller.freeze(submission(`export async function run(ctx){
      const result=await ctx.invoke('filesystem.host.write',{path:'/outside',value:'forbidden'});
      if(result.code!=='CAPABILITY_UNKNOWN')throw new Error('unknown capability was allowed');
      return {quantity:13,receiptDigest:'invented-success'};
    }`));
    const report=await executor.tools.run(unknown,input);
    console.log('PAN576_FAKE_SUCCESS_AND_UNKNOWN_NATIVE_CAPABILITY '+JSON.stringify({falseReport,report,signedResult}));
    assert.equal(report.outcome,'NATIVE_TARGET_NOT_VERIFIED');assert.equal(report.exitCode,0);
    assert.equal(report.allowedToolCalls,0);assert.equal(report.nativeEvidence.cell.executions,0);
    assert.equal(report.nativeEvidence.cell.providerOrderCount,0);assert.equal(report.effectState,'NO_NATIVE_EFFECT_RECORDED');
    assert.equal(report.ownContainerRemovedAndAbsent,true);assert.equal(falseReport.ownContainerRemovedAndAbsent,true);
  } finally {executor.controller.close();}
});

test('actual needed source/build disappearance is a closed pre-dispatch denial and restored bytes retain the permitted counterpart', async () => {
  const {cpSync,mkdtempSync,readFileSync,unlinkSync,writeFileSync,rmSync}=await import('node:fs');
  const {fileURLToPath,pathToFileURL}=await import('node:url');const {join}=await import('node:path');
  const source=fileURLToPath(new URL('../../',import.meta.url));
  const parent=process.env.TMPDIR??process.env.RUNNER_TEMP;assert.ok(parent,'owned scratch required');
  const copy=mkdtempSync(join(parent,'pan576-owned-drift-copy-'));
  let executor;
  try {
    for(const path of ['src','scripts','dist','packages','package.json','package-lock.json','tsconfig.json'])cpSync(join(source,path),join(copy,path),{recursive:true});
    const api=await import(pathToFileURL(join(copy,'src/pan471/composition-execution.mjs')).href);
    executor=api.createPan471CompositionExecutor();
    const handle=executor.controller.freeze({schemaVersion:'pansphaira.pan471/composition-submission/v1',version:'1.0.0',entrypoint:'run(ctx,input)',code:PREPARED_TEST_ARTIFACT});
    const input={material:materialInput(),requestId:'request:erp-cell-pan576-drift',sku:'SYN-PAN576'};
    const guard=join(copy,'scripts/pan576-kernel-guard.c'),bytes=readFileSync(guard);
    writeFileSync(guard,Buffer.concat([bytes,Buffer.from('\n// deliberate owned-copy source drift\n')]));
    assert.equal((await executor.tools.run(handle,input)).code,'BUILD_DRIFT_DENIED');
    unlinkSync(guard);
    const denied=await executor.tools.run(handle,input);
    assert.equal(denied.outcome,'DENIED');assert.equal(denied.code,'BUILD_DRIFT_DENIED');
    writeFileSync(guard,bytes);
    const restored=await executor.tools.run(handle,input);
    assert.equal(restored.outcome,'NATIVE_COMPOSITION_ARTIFACT_READ_BACK');
    assert.equal(restored.nativeEvidence.cell.executions,1);assert.equal(restored.ownContainerRemovedAndAbsent,true);
  } finally {if(executor)executor.controller.close();rmSync(copy,{recursive:true,force:true});}
});

test('submitted untrusted code measures key oracle checker symlink process network denials and then performs its permitted native counterpart', async () => {
  const api=await import(entry.href);const executor=api.createPan471CompositionExecutor();
  const checks=`
    const denied=(fn,code)=>{let actual;try{fn()}catch(e){actual=e.code}if(actual!==code)throw new Error('Crossing was not denied as measured');};
    const context=JSON.parse(readFileSync('/artifact/input.json','utf8'));
    if(context.sku!==input.sku)throw new Error('Permitted context missing');
    writeFileSync('/scratch/permitted','scratch');writeFileSync('/output/permitted','output');
    denied(()=>readFileSync('/guarded/protected.txt'),'EACCES');
    denied(()=>readFileSync('/proc/1/mem'),'EACCES');
    denied(()=>writeFileSync('/stage/worker.mjs','tampered'),'EROFS');
    denied(()=>writeFileSync('/guarded/protected.txt','tampered'),'EROFS');
    symlinkSync('/guarded/protected.txt','/scratch/escape');
    denied(()=>readFileSync('/scratch/escape'),'EACCES');
    const child=spawnSync('/usr/local/bin/node',['-e','0']);if(child.error?.code!=='EPERM')throw new Error('Child process not denied');
    const socket=new Socket();const network=await new Promise(resolve=>{socket.once('error',e=>resolve(e.code));socket.connect(9,'127.0.0.1')});socket.destroy();
    if(network!=='EPERM')throw new Error('Network not denied');
  `;
  const imports=`import {readFileSync,writeFileSync,symlinkSync} from 'node:fs';import {spawnSync} from 'node:child_process';import {Socket} from 'node:net';\n`;
  const code=imports+PREPARED_TEST_ARTIFACT.replace('export async function run(ctx,input) {','export async function run(ctx,input) {'+checks);
  try {
    const handle=executor.controller.freeze({schemaVersion:'pansphaira.pan471/composition-submission/v1',version:'1.0.0',entrypoint:'run(ctx,input)',code});
    const report=await executor.tools.run(handle,{material:materialInput(),requestId:'request:erp-cell-pan576-untrusted-canary',sku:'SYN-PAN576'});
    console.log('PAN576_ACTUAL_SUBMITTED_CODE_CANARIES_AND_PERMITTED_NATIVE_COUNTERPART '+JSON.stringify(report));
    assert.equal(report.outcome,'NATIVE_COMPOSITION_ARTIFACT_READ_BACK');assert.equal(report.exitCode,0);
    assert.equal(report.allowedToolCalls,2);assert.equal(report.nativeEvidence.cell.executions,1);
    assert.equal(report.nativeEvidence.cell.providerOrderCount,0);
    assert.equal(executor.controller.verify(report).outcome,'VERIFIED_NATIVE_TARGET');
    assert.equal(report.ownContainerRemovedAndAbsent,true);assert.equal(report.ownStagingRemoved,true);
    assert.deepEqual(report.actualContainer.mounts.map(row=>row.writable),[false,false,false]);
  } finally {executor.controller.close();}
});

test('explicit owner abort after observed real native effect only stops its workload and requires target reconciliation', async () => {
  const api=await import(entry.href);const executor=api.createPan471CompositionExecutor();
  try {
    assert.equal(typeof executor.controller.abort,'function','An explicit owner abort must stop the bounded workload; timeout alone is not this path.');
    const code=PREPARED_TEST_ARTIFACT.replace('return {quantity,receiptDigest:cell.nativeResult.receiptDigest};','await new Promise(()=>{});');
    const handle=executor.controller.freeze({schemaVersion:'pansphaira.pan471/composition-submission/v1',version:'1.0.0',entrypoint:'run(ctx,input)',code});
    const running=executor.tools.run(handle,{material:materialInput(),requestId:'request:erp-cell-pan576-abort',sku:'SYN-PAN576'});
    const deadline=Date.now()+5000;
    while(executor.controller.activeEvidence().nativeEvidence?.cell.executions!==1&&Date.now()<deadline)
      await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(executor.controller.activeEvidence().nativeEvidence.cell.executions,1);
    assert.equal(executor.controller.abort().outcome,'OWN_WORKLOAD_ABORT_REQUESTED');
    const report=await running;
    console.log('PAN576_OWNER_ABORT_AFTER_OBSERVED_NATIVE_EFFECT '+JSON.stringify(report));
    assert.equal(report.aborted,true);assert.equal(report.timedOut,false);
    assert.equal(report.workflowState,'OUTCOME_UNKNOWN');assert.equal(report.nativeEvidence.cell.executions,1);
    assert.equal(report.nativeEvidence.cell.providerOrderCount,0);
    assert.equal(report.ownContainerRemovedAndAbsent,true);assert.equal(report.ownStagingRemoved,true);
    assert.equal(executor.controller.reconcile(report).effectState,'OBSERVED_COMPENSATED');
    assert.equal(report.automaticRetries,0);assert.equal(executor.controller.verify(report).outcome,'DENIED');
  } finally {executor.controller.close();}
});

test('owned workload cleanup preserves an independently identified other-invocation container', async () => {
  const {spawnSync}=await import('node:child_process');const {randomUUID}=await import('node:crypto');
  const api=await import(entry.href);const executor=api.createPan471CompositionExecutor();
  const invocation='pan576-foreign-'+randomUUID().replaceAll('-','').slice(0,12);
  const docker=args=>{const result=spawnSync('docker',args,{encoding:'utf8',timeout:10000});assert.equal(result.status,0);return result.stdout.trim();};
  const id=docker(['create','--pull','never','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',
    '--user','1000:1000','--label','io.pansphaira.pan576.invocation='+invocation,
    'node@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03','node','--version']);
  const before=JSON.parse(docker(['inspect',id,'--format','{{json .}}']));
  try {
    const handle=executor.controller.freeze({schemaVersion:'pansphaira.pan471/composition-submission/v1',version:'1.0.0',entrypoint:'run(ctx,input)',code:PREPARED_TEST_ARTIFACT});
    const report=await executor.tools.run(handle,{material:materialInput(),requestId:'request:erp-cell-pan576-foreign',sku:'SYN-PAN576'});
    assert.equal(report.outcome,'NATIVE_COMPOSITION_ARTIFACT_READ_BACK');assert.equal(report.ownContainerRemovedAndAbsent,true);
    const after=JSON.parse(docker(['inspect',id,'--format','{{json .}}']));
    assert.equal(after.Id,before.Id);assert.equal(after.Config.Labels['io.pansphaira.pan576.invocation'],invocation);
    assert.deepEqual(after.State,before.State);assert.equal(after.Image,before.Image);
    console.log('PAN576_OTHER_INVOCATION_CONTAINER_RETAINED '+JSON.stringify({id,invocation,state:after.State.Status,ownedWorkloadRemoved:report.ownContainerRemovedAndAbsent}));
  } finally {
    executor.controller.close();
    const beforeOwnFixtureCleanup=JSON.parse(docker(['inspect',id,'--format','{{json .}}']));
    assert.equal(beforeOwnFixtureCleanup.Id,id);assert.equal(beforeOwnFixtureCleanup.Config.Labels['io.pansphaira.pan576.invocation'],invocation);
    docker(['container','rm',id]);
  }
});

test('effective native workload runtime identity binds non-root owner mapping private namespaces and closed image-only environment', async () => {
  const api=await import(entry.href);const executor=api.createPan471CompositionExecutor();
  try {
    const handle=executor.controller.freeze({schemaVersion:'pansphaira.pan471/composition-submission/v1',version:'1.0.0',entrypoint:'run(ctx,input)',code:PREPARED_TEST_ARTIFACT});
    const report=await executor.tools.run(handle,{material:materialInput(),requestId:'request:erp-cell-pan576-runtime-identity',sku:'SYN-PAN576'});
    assert.equal(report.outcome,'NATIVE_COMPOSITION_ARTIFACT_READ_BACK');
    assert.deepEqual(report.actualContainer.environmentNames,['NODE_VERSION','PATH','YARN_VERSION'],
      'Effective container environment must be read and validated before untrusted import, not inferred from a base image.');
    assert.equal(report.actualContainer.user,process.getuid()+':'+process.getgid());
    assert.equal(report.guestSeal.uid,process.getuid());
    assert.equal(report.actualContainer.pidMode,'');assert.equal(report.actualContainer.ipcMode,'private');
    assert.equal(report.actualContainer.pidsLimit,32);assert.equal(report.actualContainer.memory,268435456);
    assert.equal(report.ownContainerRemovedAndAbsent,true);
  } finally {executor.controller.close();}
});

test('an actual extra container environment entry is denied before dispatch and the clean native counterpart still runs', async () => {
  const {mkdtempSync,writeFileSync,readFileSync,rmSync}=await import('node:fs');
  const {join,delimiter}=await import('node:path');const {spawnSync}=await import('node:child_process');
  const parent=process.env.TMPDIR??process.env.RUNNER_TEMP;assert.ok(parent,'owned scratch required');
  const own=mkdtempSync(join(parent,'pan576-owned-envelope-'));
  const dockerPath=spawnSync('which',['docker'],{encoding:'utf8',timeout:10000}).stdout.trim();assert.ok(dockerPath.startsWith('/'));
  const trace=join(own,'owned-created-id');const originalPATH=process.env.PATH;
  const wrapper=`#!${process.execPath}\nimport {spawnSync} from 'node:child_process';import {writeFileSync} from 'node:fs';
const args=process.argv.slice(2);if(args[0]==='create')args.splice(1,0,'--env','PAN576_CANARY_UNREGISTERED=synthetic');
const result=spawnSync(${JSON.stringify(dockerPath)},args,{encoding:'utf8',timeout:10000});
if(args[0]==='create'&&result.status===0)writeFileSync(${JSON.stringify(trace)},result.stdout.trim());
process.stdout.write(result.stdout??'');process.stderr.write(result.stderr??'');process.exit(result.status??1);\n`;
  writeFileSync(join(own,'docker'),wrapper,{mode:0o700});
  const api=await import(entry.href);const executor=api.createPan471CompositionExecutor();
  try {
    const handle=executor.controller.freeze({schemaVersion:'pansphaira.pan471/composition-submission/v1',version:'1.0.0',entrypoint:'run(ctx,input)',code:PREPARED_TEST_ARTIFACT});
    const input={material:materialInput(),requestId:'request:erp-cell-pan576-env-denial',sku:'SYN-PAN576'};
    process.env.PATH=own+delimiter+originalPATH;
    await assert.rejects(executor.tools.run(handle,input),/PAN576_EFFECTIVE_RUNTIME_ENVELOPE_DENIED/);
    process.env.PATH=originalPATH;
    const id=readFileSync(trace,'utf8');assert.match(id,/^[a-f0-9]{64}$/);
    const absent=spawnSync(dockerPath,['container','inspect',id],{encoding:'utf8',timeout:10000});
    assert.notEqual(absent.status,0);assert.match(absent.stderr,/No such (object|container)/);
    assert.deepEqual(executor.controller.activeEvidence(),{running:false,nativeEvidence:null});
    const clean=await executor.tools.run(handle,input);
    assert.equal(clean.outcome,'NATIVE_COMPOSITION_ARTIFACT_READ_BACK');assert.equal(clean.nativeEvidence.cell.executions,1);
    assert.equal(clean.ownContainerRemovedAndAbsent,true);
    console.log('PAN576_EFFECTIVE_ENVIRONMENT_REAL_CONTAINER_DENIAL '+JSON.stringify({createdOwnedContainerRemoved:true,cleanCounterpart:clean.outcome,
      actualInjectedEntry:'PAN576_CANARY_UNREGISTERED',secretValueUsed:false,faultScope:'OWNED_PROCESS_DOCKER_ARG_WRAPPER_NOT_FAKED_DOCKER_RESPONSE'}));
  } finally {process.env.PATH=originalPATH;executor.controller.close();rmSync(own,{recursive:true,force:true});}
});

test('an actual unregistered bind mount is denied before untrusted import while exact owned mounts permit native execution', async () => {
  const {mkdtempSync,writeFileSync,readFileSync,rmSync}=await import('node:fs');
  const {join,delimiter}=await import('node:path');const {spawnSync}=await import('node:child_process');
  const parent=process.env.TMPDIR??process.env.RUNNER_TEMP;assert.ok(parent,'owned scratch required');
  const own=mkdtempSync(join(parent,'pan576-owned-mount-envelope-'));
  const dockerPath=spawnSync('which',['docker'],{encoding:'utf8',timeout:10000}).stdout.trim();assert.ok(dockerPath.startsWith('/'));
  const trace=join(own,'owned-created-id'),canary=join(own,'unadmitted-canary'),originalPATH=process.env.PATH;
  writeFileSync(canary,'NON_AUTHORITY_SYNTHETIC_EXTRA_MOUNT',{mode:0o600});
  writeFileSync(join(own,'docker'),`#!/usr/bin/env python3\nimport os,sys,subprocess,pathlib
args=sys.argv[1:]
if args[0]=='create': args[1:1]=['--mount',${JSON.stringify('type=bind,src='+canary+',dst=/unadmitted,readonly')}]
if args[0]=='start': os.execv(${JSON.stringify(dockerPath)},[${JSON.stringify(dockerPath)}]+args)
result=subprocess.run([${JSON.stringify(dockerPath)}]+args,capture_output=True,timeout=10)
if args[0]=='create' and result.returncode==0: pathlib.Path(${JSON.stringify(trace)}).write_bytes(result.stdout.strip())
sys.stdout.buffer.write(result.stdout);sys.stderr.buffer.write(result.stderr);sys.exit(result.returncode)\n`,{mode:0o700});
  const api=await import(entry.href);const executor=api.createPan471CompositionExecutor();
  try {
    const handle=executor.controller.freeze({schemaVersion:'pansphaira.pan471/composition-submission/v1',version:'1.0.0',entrypoint:'run(ctx,input)',code:PREPARED_TEST_ARTIFACT});
    const input={material:materialInput(),requestId:'request:erp-cell-pan576-mount-denial',sku:'SYN-PAN576'};
    process.env.PATH=own+delimiter+originalPATH;
    await assert.rejects(executor.tools.run(handle,input),/PAN576_EFFECTIVE_RUNTIME_ENVELOPE_DENIED/,
      'The authoritative runtime must reject an actual extra bind mount, not merely describe its destinations.');
    process.env.PATH=originalPATH;
    const id=readFileSync(trace,'utf8');assert.match(id,/^[a-f0-9]{64}$/);
    const absent=spawnSync(dockerPath,['container','inspect',id],{encoding:'utf8',timeout:10000});
    assert.notEqual(absent.status,0);assert.match(absent.stderr,/No such (object|container)/);
    const clean=await executor.tools.run(handle,input);assert.equal(clean.outcome,'NATIVE_COMPOSITION_ARTIFACT_READ_BACK');
    assert.deepEqual(clean.actualContainer.mounts.map(row=>row.destination).sort(),['/artifact','/guarded','/stage']);
    assert.equal(clean.ownContainerRemovedAndAbsent,true);
    console.log('PAN576_EFFECTIVE_MOUNTS_REAL_CONTAINER_DENIAL '+JSON.stringify({extraMountDeniedBeforeImport:true,
      createdOwnedContainerRemoved:true,cleanCounterpart:clean.outcome,faultScope:'OWNED_PROCESS_DOCKER_ARGUMENTS_REAL_CONTAINER_RESPONSE'}));
  } finally {process.env.PATH=originalPATH;executor.controller.close();rmSync(own,{recursive:true,force:true});}
});

test('public execution contract documents exact owner authority isolated native scope and explicit ambiguity limits', async () => {
  const {readFileSync}=await import('node:fs');
  const path=new URL('../../docs/architecture/pan576-isolated-composition-execution-v1.md',import.meta.url);
  assert.ok(existsSync(path),'The isolated native execution contract and exact unsupported/unknown-effect semantics need a public handoff.');
  const text=readFileSync(path,'utf8');
  for(const required of ['createPan471CompositionExecutor','pansphaira.pan471/composition-submission/v1','run(ctx,input)',
    'Landlock ABI8','SECCOMP_FILTER_FLAG_TSYNC','LANDLOCK_RESTRICT_SELF_TSYNC','v24.19.0','owner UID/GID',
    'NODE_VERSION','WeakMap','BUILD_DRIFT_DENIED','OWN_RESOURCE_OR_EFFECT_RECONCILIATION_REQUIRED','recoverPending',
    'OUTCOME_UNKNOWN','UNRECONCILED_NATIVE_EFFECT','signatureValid','SOURCE_EVIDENCE_ONLY','NOT_RUN',
    'no model novelty','not crash-durable Exactly-once','not secret holdouts','#574','#454','#453'])assert.ok(text.includes(required),required);
});

test('native untrusted execution has exact standalone canonical integrity and checksum registration without changing retained task owners', async () => {
  const {readFileSync}=await import('node:fs');
  const pkg=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url),'utf8'));
  assert.equal(pkg.scripts['pan576:test'],'TMPDIR="${TMPDIR:-${RUNNER_TEMP:?PAN576_OWNED_SCRATCH_REQUIRED}}" node --test tests/pan471/composition-execution.test.mjs',
    'Native owner-local direct runs do not register the real canonical execution gate.');
  assert.equal(pkg.scripts['prepan576:test'],'npm run build --silent');
  assert.equal(pkg.scripts.test.split(/\s+/).filter(row=>row==='tests/pan471/composition-execution.test.mjs').length,1);
  const dag=JSON.parse(readFileSync(new URL('../../verification/verification-dag-v2.json',import.meta.url),'utf8'));
  const owner=dag.nodes.find(row=>row.id==='repository-integrity');
  assert.equal(owner.ownedTests.filter(row=>row==='npm run pan576:test').length,1);
  const members=[['scripts/pan576-kernel-guard.c','SECURITY'],['scripts/pan576-isolated-worker.mjs','SECURITY'],
    ['src/pan471/composition-execution.mjs','SECURITY'],['tests/pan471/composition-execution.test.mjs','VALIDATOR'],
    ['docs/architecture/pan576-isolated-composition-execution-v1.md','DERIVED_EVIDENCE']];
  const sums=readFileSync(new URL('../../SHA256SUMS',import.meta.url),'utf8');
  for(const [path,role] of members){assert.equal(owner.inputs.filter(row=>row.path===path&&row.role===role).length,1,path);
    assert.equal(sums.split('\n').filter(row=>row.endsWith('  ./'+path)).length,1,path);}
  assert.deepEqual(dag.nodes.find(row=>row.id==='pan471-capability-inventory-v1').ownedTests,['npm run pan471:test']);
  assert.ok(dag.nodes.find(row=>row.id==='repository-integrity').ownedTests.includes('npm run pan574:test'));
});

test('lost cleanup control after an observed native effect retains an explicit owner fence until exact owned recovery and target readback', async () => {
  const {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync}=await import('node:fs');
  const {join,delimiter}=await import('node:path');const {spawnSync}=await import('node:child_process');
  const parent=process.env.TMPDIR??process.env.RUNNER_TEMP;assert.ok(parent,'owned scratch required');
  const own=mkdtempSync(join(parent,'pan576-owned-control-loss-'));
  const dockerPath=spawnSync('which',['docker'],{encoding:'utf8',timeout:10000}).stdout.trim();
  const trace=join(own,'owned-created-id'),fault=join(own,'one-cleanup-control-fault'),originalPATH=process.env.PATH;
  writeFileSync(join(own,'docker'),`#!/usr/bin/env python3\nimport os,sys,subprocess,pathlib
args=sys.argv[1:]
fault=pathlib.Path(${JSON.stringify(fault)})
if args[:2]==['container','inspect'] and fault.exists(): fault.unlink();sys.exit(79)
if args[0]=='start': os.execv(${JSON.stringify(dockerPath)},[${JSON.stringify(dockerPath)}]+args)
result=subprocess.run([${JSON.stringify(dockerPath)}]+args,capture_output=True,timeout=10)
if args[0]=='create' and result.returncode==0: pathlib.Path(${JSON.stringify(trace)}).write_bytes(result.stdout.strip())
sys.stdout.buffer.write(result.stdout);sys.stderr.buffer.write(result.stderr);sys.exit(result.returncode)\n`,{mode:0o700});
  const api=await import(entry.href);const executor=api.createPan471CompositionExecutor();let running,id;
  try {
    const code=PREPARED_TEST_ARTIFACT.replace('return {quantity,receiptDigest:cell.nativeResult.receiptDigest};','await new Promise(()=>{});');
    const handle=executor.controller.freeze({schemaVersion:'pansphaira.pan471/composition-submission/v1',version:'1.0.0',entrypoint:'run(ctx,input)',code});
    const input={material:materialInput(),requestId:'request:erp-cell-pan576-control-loss',sku:'SYN-PAN576'};
    process.env.PATH=own+delimiter+originalPATH;
    running=executor.tools.run(handle,input);const observedOutcome=running.then(value=>({value}),error=>({error}));
    const deadline=Date.now()+5000;
    while(executor.controller.activeEvidence().nativeEvidence?.cell.executions!==1&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(executor.controller.activeEvidence().nativeEvidence.cell.executions,1);
    id=readFileSync(trace,'utf8');assert.match(id,/^[a-f0-9]{64}$/);
    writeFileSync(fault,'OWNED_ONE_SHOT_POST_EFFECT_CONTROL_FAULT');executor.controller.abort();
    assert.match((await observedOutcome).error?.message??'',/PAN576_DOCKER_CONTROL_DENIED/);
    assert.equal((await executor.tools.run(handle,input)).code,'OWN_RESOURCE_OR_EFFECT_RECONCILIATION_REQUIRED',
      'A cleanup exception must not silently clear native effect authority and allow another mutation.');
    assert.equal(executor.controller.pendingOutcome().workflowState,'OUTCOME_UNKNOWN');
    const recovered=executor.controller.recoverPending();
    assert.equal(recovered.outcome,'RECOVERED_OWNED_RESOURCES_AND_NATIVE_TARGET');
    assert.equal(recovered.nativeExecutions,1);assert.equal(recovered.providerOrderCount,0);
    assert.equal(recovered.ownContainerRemovedAndAbsent,true);assert.equal(recovered.effectState,'OBSERVED_COMPENSATED');
    assert.equal(recovered.automaticRetryPermitted,false);
    console.log('PAN576_POST_EFFECT_CLEANUP_CONTROL_LOSS_EXACT_RECOVERY '+JSON.stringify(recovered));
  } finally {
    process.env.PATH=originalPATH;
    if(running)await running.catch(()=>{});
    if(!id&&existsSync(trace))id=readFileSync(trace,'utf8');
    if(id){const actual=spawnSync(dockerPath,['container','inspect',id,'--format','{{json .}}'],{encoding:'utf8',timeout:10000});
      if(actual.status===0){const found=JSON.parse(actual.stdout);assert.equal(found.Id,id);assert.match(found.Config.Labels['io.pansphaira.pan576.invocation'],/^pan576-[a-f0-9]{20}$/);
        assert.equal(spawnSync(dockerPath,['container','rm','--force',id],{encoding:'utf8',timeout:10000}).status,0);}}
    executor.controller.close();rmSync(own,{recursive:true,force:true});
  }
});
