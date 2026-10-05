import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {nativeTradeFixture,nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
import * as trade from '../../src/pan515/trade-state.mjs';
import {readPan516Procurement} from '../../src/procurement-434/bestellung-lifecycle.mjs';
import {readPan519Finance,capturePan519HandoffPlan} from '../../src/pan519/finance-handoff.mjs';
import {authorizePan473TargetWrite,writePan473Target} from '../../src/pan473/writer-scope-cutover.mjs';
import {acquireLocalJournalOwner} from '../../demo/runtime/local-journal-owner.mjs';
import {join} from 'node:path';
import {readPan521ConnectedTradeJourney} from '../../src/pan521/connected-trade.mjs';
import common from '../../contracts/trade/common-trade-01-v1.json' with {type:'json'};
const path=new URL('../../src/pan521/local-journey.mjs',import.meta.url);
const journey=existsSync(path)?await import(path):await import('../../src/pan521/connected-trade.mjs');
const owner='LOCAL_SYNTHETIC_OWNER',asOf='2026-07-31T23:59:59Z';
async function fresh(){const f=await nativeTradeFixture({common:true});try{trade.initializePan515TradeState({root:f.root,owner,caseId:common.id});return f;}catch(error){f.close();throw error;}}
test('P07 one actual entry orchestrates COMMON native approval, target purchase, fulfilment and unqualified finance handoff without swapping individual fixtures',async()=>{
 const f=await fresh();
 try{
  const initial=trade.readPan515TradeState({root:f.root,asOf});assert.equal(initial.binding.caseId,common.id);assert.equal(initial.revision,0);assert.equal(initial.quantities.available,0);
  assert.equal(typeof journey.executePan521LocalJourney,'function','same native COMMON root is ready but no actual connected action entry runs its code-owned journey');
  const result=journey.executePan521LocalJourney({root:f.root,owner,attemptId:'attempt-one',asOf});
  assert.equal(result.outcome,'LOCAL_CONNECTED_ACTIONS_COMPLETED_UNQUALIFIED');assert.equal(result.original521Accepted,false);
  const t=trade.readPan515TradeState({root:f.root,asOf}),p=readPan516Procurement({root:f.root}),finance=readPan519Finance({root:f.root,asOf});
  assert.deepEqual(t.quantities,{physical:1,reserved:0,blocked:1,available:0,shipped:10,returned:1});
  assert.deepEqual(t.fulfilment.deliveryNotes.map(n=>[n.shipmentId,n.quantity,n.orderId,n.lineId]),[['SH-01',8,'SO-01','1'],['SH-02',2,'SO-01','1']]);
  assert.equal(t.deliveryMilestones.dispatch.onTimeQuantity,common.expected.shipment_on_time_quantity);assert.equal(t.deliveryMilestones.dispatch.positionOtif,false);assert.equal(t.deliveryMilestones.customerReceipt.onTimeQuantity,null);
  assert.equal(p.acceptedQuantity,common.purchase_order.quantity);assert.equal(p.remainingQuantity,0);assert.equal(p.confirmations.at(-1).revision,1);assert.equal(p.binding.draft.bestellungId,'bestellung:pan516-common');assert.equal(result.result.originalPurchaseInvoice.source.mapping.canonicalOrderId,'PO-01');assert.equal(result.receipts.find(r=>r.targetObservation).targetObservation.outcome,'EXACT_TARGET_ALREADY_APPLIED');
  assert.equal(nativeRows(f.root,'SELECT record FROM pan516_target_orders').length,1);
  assert.deepEqual(finance.documents.map(d=>[d.documentId,d.amountMinor]),[['AR-01',80000]]);assert.equal(finance.documents[0].openMinor,null);assert.equal(finance.qualification.realTargetSandboxQualified,false);
  const readback=readPan521ConnectedTradeJourney({root:f.root,asOf});assert.deepEqual(result.result,readback);assert.equal(readback.projections.O2C.facts.onTimeDispatchedQuantity.value,8);
  for(const view of Object.values(readback.projections))assert.equal(view.snapshot.nativeRevision,t.revision);
  assert.equal(readback.originalPurchaseInvoice.varianceMinor,common.expected.supplier_price_variance_minor);assert.equal(readback.completion.businessCaseClosed,false);assert.equal(readback.completion.paymentDispatchAuthorized,false);
 }finally{f.close();}
});
test('P07 purchase-target checkpoint returns a real durable partial result and later continuation preserves its effect',async()=>{
 const f=await fresh();
 try{
  const partial=journey.executePan521LocalJourney({root:f.root,owner,attemptId:'attempt-partial',asOf,through:'PURCHASE_TARGET'});
  assert.equal(partial.outcome,'LOCAL_PURCHASE_TARGET_COMMITTED_UNQUALIFIED');assert.equal(partial.partial,true);assert.equal(partial.original521Accepted,false);assert.equal(partial.paymentDispatchAuthorized,false);
  assert.deepEqual(trade.readPan515TradeState({root:f.root,asOf}).events.map(e=>e.effectId),['PR-01']);
  assert.deepEqual(readPan516Procurement({root:f.root}).events.map(e=>e.kind),['APPROVE','TRANSMIT']);
  const before=nativeRows(f.root,'SELECT order_key,record FROM pan516_target_orders');assert.equal(before.length,1);assert.equal(partial.targetObservation.outcome,'EXACT_TARGET_ALREADY_APPLIED');
  assert.equal(nativeRows(f.root,"SELECT name FROM sqlite_master WHERE name='pan519_events'").length,0);
  const continued=journey.executePan521LocalJourney({root:f.root,owner,attemptId:'attempt-continuation',asOf});assert.equal(continued.outcome,'LOCAL_CONNECTED_ACTIONS_COMPLETED_UNQUALIFIED');
  assert.deepEqual(nativeRows(f.root,'SELECT order_key,record FROM pan516_target_orders'),before);assert.equal(continued.result.completion.businessCaseClosed,false);
 }finally{f.close();}
});
test('P07 native late price revision and documented return correction preserve the immutable finance invoice basis and original movements',async()=>{
 const f=await fresh();
 try{
  const original=journey.executePan521LocalJourney({root:f.root,owner,attemptId:'attempt-original',asOf}),rows=nativeRows(f.root,'SELECT * FROM pan519_events'),tradeRows=nativeRows(f.root,'SELECT * FROM pan515_events ORDER BY revision'),basis=original.result.finance.documents[0];
  const current=nativeRows(f.root,"SELECT id,kind,revision,deleted,body FROM objects WHERE id='synthetic:line-1'")[0],epoch=trade.readPan515TradeState({root:f.root}).binding.targetEpoch;
  const grant=authorizePan473TargetWrite({root:f.root,epoch,owner});writePan473Target({root:f.root,epoch,grant,changes:[{id:current.id,kind:current.kind,revision:current.revision+1,deleted:false,body:{...JSON.parse(current.body),priceMinor:12000}}]});
  assert.equal(JSON.parse(nativeRows(f.root,"SELECT body FROM objects WHERE id='synthetic:line-1'")[0].body).priceMinor,12000);
  const native=trade.readPan515TradeState({root:f.root,asOf}),command={schemaVersion:'pansphaira.pan517/fulfilment-command/v1',effectId:'RD-01',transportId:'synthetic:p07-return-inspection',expectedRevision:native.latestRevision,orderId:'SO-01',lineId:'1',articleId:'ARTICLE-A',warehouseId:'WH-01',unit:'STK',kind:'RETURN_DECISION',quantity:1,referenceId:'RET-01',effectiveAt:'2026-07-06T12:00:00Z',reason:'Documented local return inspection releases only quarantine',decision:{disposition:'RELEASE',inspectionEvidenceId:'IN-01',rationale:'Inspected returned unit is usable; original movement and billing remain'}};
  trade.executePan515TradeCommand({root:f.root,command,grant:trade.authorizePan515TradeCommand({root:f.root,owner,command})});
  const corrected=readPan521ConnectedTradeJourney({root:f.root,asOf});assert.equal(corrected.native.physical,1);assert.equal(corrected.native.quarantined,0);assert.equal(corrected.projections.STOCK.facts.free.value,1);
  assert.deepEqual(nativeRows(f.root,'SELECT * FROM pan519_events'),rows);assert.deepEqual(corrected.finance.documents[0],basis);
  assert.deepEqual(nativeRows(f.root,'SELECT * FROM pan515_events WHERE revision<=? ORDER BY revision',native.latestRevision),tradeRows);
  const retry=journey.executePan521LocalJourney({root:f.root,owner,attemptId:'attempt-after-correction',asOf});assert.deepEqual(retry.result,corrected);assert.equal(retry.result.completion.businessCaseClosed,false);assert.equal(retry.result.finance.documents[0].openMinor,null);
 }finally{f.close();}
});
test('P07 model qualification, wrong owner, malformed time and executable accessor inputs cannot select effects or close unknown payments',async()=>{
 const f=await fresh();
 try{
  const input={root:f.root,owner,attemptId:'attempt-negative',asOf},before=trade.readPan515TradeState({root:f.root,asOf});
  for(const patch of [{owner:'ADMIN'},{through:'FULL_PRODUCT_QUALIFIED'},{realTargetSandboxQualified:true},{paymentDispatchAuthorized:true},{businessCaseClosed:true},{provider:'invented-fibu'},{steps:[]},{asOf:'2026-02-30T00:00:00Z'}])assert.throws(()=>journey.executePan521LocalJourney({...input,...patch}),/PAN521_.*DENIED/);
  let calls=0;const accessor={...input};Object.defineProperty(accessor,'owner',{enumerable:true,get(){calls++;return owner;}});assert.throws(()=>journey.executePan521LocalJourney(accessor),/PAN521_LOCAL_ACTION_INPUT_DENIED/);assert.equal(calls,0);
  assert.deepEqual(trade.readPan515TradeState({root:f.root,asOf}),before);assert.equal(nativeRows(f.root,"SELECT name FROM sqlite_master WHERE name IN ('pan516_events','pan519_events')").length,0);
  const actual=journey.executePan521LocalJourney(input);assert.equal(actual.result.finance.documents[0].openMinor,null);assert.equal(actual.result.completion.businessCaseClosed,false);assert.equal(actual.result.completion.realTargetSandboxQualified,false);assert.equal(actual.result.completion.paymentDispatchAuthorized,false);
  const financeRows=nativeRows(f.root,'SELECT * FROM pan519_events');assert.throws(()=>capturePan519HandoffPlan({root:f.root,owner,documentId:'AP-01',handedOffAt:'2026-07-06T10:00:00Z'}),/PAN519_UNRESOLVED_LIABILITY_NOT_ADMITTED_DENIED/);assert.deepEqual(nativeRows(f.root,'SELECT * FROM pan519_events'),financeRows);
 }finally{f.close();}
});
test('P07 an existing native owner excludes new workflow effects without weakening its nonreentrant guard',async()=>{
 const f=await fresh();
 try{
  const before=trade.readPan515TradeState({root:f.root,asOf}),lease=acquireLocalJournalOwner(join(f.root,'pan453-owned-v2'));
  try{assert.throws(()=>journey.executePan521LocalJourney({root:f.root,owner,attemptId:'attempt-held-owner',asOf}),/BTH_JOURNAL_FENCED_DENIED/);}finally{lease.release();}
  assert.deepEqual(trade.readPan515TradeState({root:f.root,asOf}),before);assert.equal(nativeRows(f.root,"SELECT name FROM sqlite_master WHERE name IN ('pan516_events','pan519_events')").length,0);
 }finally{f.close();}
});
test('P07 actual operator CLI performs its checkpoint and fresh-process continuation but rejects authority selectors',async()=>{
 const f=await fresh();
 try{
  const cli='scripts/run-pan521-connected-trade.mjs',run=(attempt,through,extra=[])=>spawnSync(process.execPath,[cli,'run-local','--root',f.root,'--as-of',asOf,'--attempt',attempt,'--through',through,...extra],{encoding:'utf8',timeout:15000});
  const first=run('attempt-cli-first','PURCHASE_TARGET');assert.equal(first.status,0,first.stdout+' '+first.stderr);assert.equal(JSON.parse(first.stdout).outcome,'LOCAL_PURCHASE_TARGET_COMMITTED_UNQUALIFIED');
  const target=nativeRows(f.root,'SELECT order_key,record FROM pan516_target_orders');const full=run('attempt-cli-continued','FULL_NATIVE');assert.equal(full.status,0,full.stdout+' '+full.stderr);const output=JSON.parse(full.stdout);assert.equal(output.outcome,'LOCAL_CONNECTED_ACTIONS_COMPLETED_UNQUALIFIED');assert.deepEqual(output.result,readPan521ConnectedTradeJourney({root:f.root,asOf}));assert.deepEqual(nativeRows(f.root,'SELECT order_key,record FROM pan516_target_orders'),target);
  const before=readPan521ConnectedTradeJourney({root:f.root,asOf});for(const extra of [['--owner','ADMIN'],['--qualify-target','true'],['--provider','invented-fibu']]){const rejected=run('attempt-cli-denied','FULL_NATIVE',extra);assert.equal(rejected.status,2);assert.equal(JSON.parse(rejected.stdout).outcome,'DENIED');assert.deepEqual(readPan521ConnectedTradeJourney({root:f.root,asOf}),before);}
 }finally{f.close();}
});
export {fresh,owner,asOf,journey};
