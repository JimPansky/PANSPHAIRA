import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import * as trade from '../../src/pan515/trade-state.mjs';
import {evaluatePan516ProcurementLiability} from '../../src/procurement-434/bestellung-liability.mjs';
import * as finance from '../../src/pan519/finance-handoff.mjs';
import {financeFixture,handoff} from '../pan519/native-fixture.mjs';
import common from '../../contracts/trade/common-trade-01-v1.json' with {type:'json'};
const entry=new URL('../../src/pan521/connected-trade.mjs',import.meta.url);
const journey=existsSync(entry)?await import(entry):trade;
const owner='LOCAL_SYNTHETIC_OWNER',asOf='2026-07-31T23:59:59Z';
test('P07 actual same native scope connects COMMON trade purchase finance handoffs and P06 revisions without promoting missing target qualification',async()=>{
 const f=await financeFixture();
 try{
  finance.initializePan519Finance({root:f.root,owner});handoff(f.root,'AR-01');handoff(f.root,'AP-PAN516-MATCHED-01');
  const native=trade.readPan515TradeState({root:f.root,asOf});assert.equal(native.binding.caseId,common.id);assert.equal(native.quantities.physical,1);assert.equal(native.quantities.blocked,1);assert.equal(native.quantities.reserved,0);
  const originalAP=evaluatePan516ProcurementLiability({root:f.root,invoiceId:'AP-01',expectedConfirmationRevision:1});assert.equal(originalAP.varianceMinor,2000);assert.equal(originalAP.status,'UNRESOLVED_AMOUNT_DEVIATION');
  assert.equal(typeof journey.readPan521ConnectedTradeJourney,'function','real released native trade/purchase and preserved519 contract execute, but no connected original521 entry binds their identities and P06 revisions');
  const result=journey.readPan521ConnectedTradeJourney({root:f.root,asOf});assert.equal(result.schemaVersion,'pansphaira.pan521/connected-native-readback/v1');assert.equal(result.identity.caseId,common.id);assert.equal(result.identity.tenantId,common.scope.tenant_id);assert.equal(result.identity.entityId,common.scope.entity_id);
  assert.equal(result.native.tradeRevision,native.revision);assert.equal(result.projections.STOCK.snapshot.nativeRevision,native.revision);assert.equal(result.projections.O2C.snapshot.nativeRevision,native.revision);assert.equal(result.projections.P2P.snapshot.nativeRevision,native.revision);
  assert.equal(result.projections.STOCK.facts.physical.value,1);assert.equal(result.projections.P2P.facts.acceptedQuantity.value,10);assert.equal(result.projections.P2P.facts.remainingQuantity.value,0);
  assert.equal(result.finance.documents.length,2);assert.equal(result.finance.documents[0].openMinor,null);assert.equal(result.originalPurchaseInvoice.status,'UNRESOLVED_AMOUNT_DEVIATION');assert.equal(result.originalPurchaseInvoice.varianceMinor,2000);
  assert.equal(result.referenceOnlyBilling.totalNetMinor,90000);assert.equal(result.referenceOnlyBilling.nativeFiscalInvoiceOrArchiveQualified,false);assert.equal(result.projections.O2C.facts.billedNetMinor.state,'UNAVAILABLE');
  assert.equal(result.completion.businessCaseClosed,false);assert.equal(result.completion.original521Accepted,false);assert.equal(result.completion.realTargetSandboxQualified,false);assert.equal(result.completion.paymentDispatchAuthorized,false);assert.equal(result.readOnly,true);
  assert.ok(result.completion.openExceptions.some(e=>e.code==='P05_TARGET_QUALIFICATION_MISSING'));assert.ok(result.completion.openExceptions.some(e=>e.code==='P04_FISCAL_ARCHIVE_QUALIFICATION_MISSING'));assert.ok(result.completion.openExceptions.some(e=>e.code==='ORIGINAL_AP_AMOUNT_DEVIATION'));
  assert.deepEqual(journey.readPan521ConnectedTradeJourney({root:f.root,asOf}),result);
 }finally{f.close();}
});
test('P07 actual CLI reads the same native journey after process restart and rejects invented qualification flags',async()=>{
 const f=await financeFixture();
 try{
  finance.initializePan519Finance({root:f.root,owner});handoff(f.root,'AR-01');const expected=journey.readPan521ConnectedTradeJourney({root:f.root,asOf});
  const cli='scripts/run-pan521-connected-trade.mjs';assert.equal(existsSync(cli),true,'connected native data exists but has no bounded actual operator CLI entry');
  const run=extra=>spawnSync(process.execPath,[cli,'read','--root',f.root,'--as-of',asOf,...extra],{encoding:'utf8',timeout:15000});
  const fresh=run([]);assert.equal(fresh.status,0,fresh.stderr);const output=JSON.parse(fresh.stdout);assert.equal(output.outcome,'LOCAL_CONNECTED_READBACK_UNQUALIFIED');assert.deepEqual(output.result,expected);
  const unknown=run(['--qualify-target','true']);assert.equal(unknown.status,2);assert.equal(JSON.parse(unknown.stdout).outcome,'DENIED');assert.deepEqual(journey.readPan521ConnectedTradeJourney({root:f.root,asOf}),expected);
 }finally{f.close();}
});
