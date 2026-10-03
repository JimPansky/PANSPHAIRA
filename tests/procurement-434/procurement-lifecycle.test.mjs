import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {writeFileSync,symlinkSync,mkdtempSync,rmSync,cpSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import process from 'node:process';
import {test} from 'node:test';
import * as lifecycle from '../../src/procurement-434/bestellung-lifecycle.mjs';
import {evaluatePan516ProcurementLiability} from '../../src/procurement-434/bestellung-liability.mjs';
const procurement={...lifecycle,evaluatePan516ProcurementLiability};
import {nativeTradeFixture,nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
import {initializePan515TradeState} from '../../src/pan515/trade-state.mjs';
import {bestellungsentwurfBildenV1,wareneingangLedgerBildenV1,wareneingangErfassenV1} from '../../dist/packages/contracts/src/beschaffung-wareneingang-v1.js';
import common from '../../contracts/trade/common-trade-01-v1.json' with {type:'json'};

const purchase={bestellungId:'bestellung:pan516-common',lieferantId:'lieferant:synthetic-01',bestellungZeitstempel:'2026-06-20T08:00:00Z',positionen:[{positionId:'position:common-01',artikelId:'EINK-ART-A01',einheit:'STK',waehrung:'EUR',bestellteMenge:common.purchase_order.quantity,berechneteMengeMinor:null}]};
const terms={unitPriceMinor:common.purchase_order.unit_net_minor,currency:common.scope.currency,unit:common.scope.quantity_unit,promisedAt:common.purchase_order.promised_acceptance_at};
const command=(kind,revision,suffix,receipt=null)=>({schemaVersion:'pansphaira.pan516/procurement-command/v1',effectId:'synthetic:pan516-'+suffix,transportId:'synthetic:transport-'+suffix,expectedRevision:revision,orderId:purchase.bestellungId,positionId:purchase.positionen[0].positionId,supplierId:purchase.lieferantId,kind,receipt,sourceReference:'synthetic:source-'+suffix});
function apply(root,c){const grant=procurement.authorizePan516ProcurementCommand({root,command:c,owner:'LOCAL_SYNTHETIC_OWNER'});return procurement.executePan516ProcurementCommand({root,command:c,grant});}

const initializedFixture=async()=>{const fixture=await nativeTradeFixture({common:true});initializePan515TradeState({root:fixture.root,owner:'LOCAL_SYNTHETIC_OWNER',caseId:'COMMON-TRADE-01'});procurement.initializePan516Procurement({root:fixture.root,owner:'LOCAL_SYNTHETIC_OWNER',purchase,terms});return fixture;};

test('P02 retained procurement demo remains standalone without the new source-evidence-only native modules',()=>{
  const root=mkdtempSync(join(process.env.TMPDIR,'pan516-legacy-cli-'));
  try{
    mkdirSync(join(root,'src/procurement-434'),{recursive:true});
    for(const name of ['rechnungsabgleich-path.mjs','rechnungsabgleich-path-cli.mjs'])cpSync('src/procurement-434/'+name,join(root,'src/procurement-434',name));
    cpSync('dist',join(root,'dist'),{recursive:true});cpSync('packages/contracts/src/canonical-json.js',join(root,'packages/contracts/src/canonical-json.js'),{recursive:true});
    const r=spawnSync(process.execPath,[join(root,'src/procurement-434/rechnungsabgleich-path-cli.mjs'),'demo','--root',process.cwd(),'--json'],{encoding:'utf8'});
    assert.equal(r.status,0,r.stderr);const result=JSON.parse(r.stdout);assert.equal(result.result.decision.outcome,'MATCHED');
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('P02 grants native immutability and stale confirmation chains deny effects while business-order retry survives a new transport and effect identity',async()=>{
  const fixture=await initializedFixture();
  try{
    const snapshot=()=>nativeRows(fixture.root,'SELECT revision,command,event FROM pan516_events ORDER BY revision');
    assert.throws(()=>apply(fixture.root,command('TRANSMIT',0,'unapproved-transmit')),/PAN516_APPROVED_ORDER_REQUIRED_DENIED/);
    assert.throws(()=>procurement.executePan516ProcurementCommand({root:fixture.root,command:command('APPROVE',0,'forged'),grant:{owner:'LOCAL_SYNTHETIC_OWNER'}}),/PAN516_CONTENT_BOUND_AUTHORITY_REQUIRED_DENIED/);assert.equal(snapshot().length,0);
    apply(fixture.root,command('APPROVE',0,'boundaries-approve'));
    const transmit=command('TRANSMIT',1,'boundaries-transmit');apply(fixture.root,transmit);const prior=snapshot();
    const retry=apply(fixture.root,{...transmit,effectId:'synthetic:business-retry-id',transportId:'synthetic:new-transport-id'});assert.equal(retry.outcome,'RECONCILED_EXISTING_BUSINESS_ORDER_NO_DUPLICATE');assert.equal(retry.targetObservation.newOrderEffect,false);assert.deepEqual(snapshot(),prior);
    assert.throws(()=>apply(fixture.root,{...transmit,sourceReference:'synthetic:different-bound-source'}),/PAN516_EFFECT_CONTENT_CONFLICT_DENIED/);assert.deepEqual(snapshot(),prior);
    assert.throws(()=>apply(fixture.root,{...command('CONFIRM',2,'bad-chain'),confirmation:{revision:2,previousConfirmationDigest:null,terms,confirmedAt:'2026-06-21T08:00:00Z'}}),/PAN516_CONFIRMATION_REVISION_CHAIN_DENIED/);assert.deepEqual(snapshot(),prior);
    const db=new DatabaseSync(join(fixture.root,'target.sqlite'));
    try{for(const table of ['pan516_events','pan516_binding','pan516_target_orders'])for(const sql of ['UPDATE '+table+' SET '+(table==='pan516_events'?'event=event':'record=record'),'DELETE FROM '+table])assert.throws(()=>db.exec(sql),/PAN516_HISTORY_IMMUTABLE_DENIED/);}finally{db.close();}
    assert.deepEqual(snapshot(),prior);assert.equal(nativeRows(fixture.root,'SELECT record FROM pan516_target_orders').length,1);
  }finally{fixture.close();}
});

test('P02 existing procurement CLI writes real local transitions and reads one-grain liability without external dispatch or payment',async()=>{
  const fixture=await nativeTradeFixture({common:true});
  try{
    initializePan515TradeState({root:fixture.root,owner:'LOCAL_SYNTHETIC_OWNER',caseId:'COMMON-TRADE-01'});
    const cli=(action,args=[])=>{const r=spawnSync(process.execPath,['src/procurement-434/rechnungsabgleich-path-cli.mjs','native',action,'--root',fixture.root,...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
    assert.equal(cli('init').outcome,'PROCUREMENT_INITIALIZED');
    const actions=[command('APPROVE',0,'cli-approve'),command('TRANSMIT',1,'cli-transmit'),{...command('CONFIRM',2,'cli-confirm'),confirmation:{revision:1,previousConfirmationDigest:null,terms,confirmedAt:'2026-06-21T08:00:00Z'}},...common.receipts.map((r,i)=>command('ACCEPT_RECEIPT',i+3,'cli-receipt-'+i,{id:'wareneingang:cli-gr-'+i,quantity:r.accepted_quantity,unit:'STK',acceptedAt:new Date(r.accepted_at).toISOString().replace('.000Z','Z')}))];
    for(const [i,c] of actions.entries()){const file=join(fixture.parent,'cli-command-'+i+'.json');writeFileSync(file,JSON.stringify(c));assert.equal(cli('apply',['--command',file]).outcome,'COMMITTED');}
    const state=cli('read');assert.equal(state.revision,5);assert.deepEqual(state.remainingQuantityHistory.map(r=>r.remainingQuantity),[10,2,0]);
    assert.equal(state.transmissions.length,1);assert.equal(state.confirmations.length,1);assert.equal(state.approval.effectId,actions[0].effectId);
    const liability=cli('liability',['--invoice','AP-01','--confirmation-revision','1']);assert.equal(liability.varianceMinor,2000);assert.equal(liability.status,'UNRESOLVED_AMOUNT_DEVIATION');assert.equal(liability.paymentOrder,null);
    const matched=cli('liability',['--invoice','AP-PAN516-MATCHED-01','--confirmation-revision','1']);assert.equal(matched.status,'RELEASED_LOCAL_SYNTHETIC');assert.equal(matched.decision.outcome,'MATCHED');assert.equal(matched.expectedAmountMinor,60000);assert.equal(matched.paymentOrder,null);
    const before=nativeRows(fixture.root,'SELECT revision,command,event FROM pan516_events ORDER BY revision');
    const linked=join(fixture.parent,'symlink-command.json');symlinkSync(join(fixture.parent,'cli-command-0.json'),linked);
    const unsafe=spawnSync(process.execPath,['src/procurement-434/rechnungsabgleich-path-cli.mjs','native','apply','--root',fixture.root,'--command',linked],{encoding:'utf8'});assert.equal(unsafe.status,2);assert.match(unsafe.stderr,/PAN516_CLI_BOUNDED_REGULAR_COMMAND_REQUIRED/);
    const bad=spawnSync(process.execPath,['src/procurement-434/rechnungsabgleich-path-cli.mjs','native','liability','--root',fixture.root,'--invoice','AP-01','--confirmation-revision','1x'],{encoding:'utf8'});assert.equal(bad.status,2);assert.match(bad.stderr,/PAN516_CLI_CONFIRMATION_REVISION_REQUIRED/);
    assert.deepEqual(nativeRows(fixture.root,'SELECT revision,command,event FROM pan516_events ORDER BY revision'),before);
  }finally{fixture.close();}
});

test('P02 original foreign order wrong supplier duplicate receipt and unapproved overdelivery are denied without native mutation',async()=>{
  const fixture=await initializedFixture();
  try{
    apply(fixture.root,command('APPROVE',0,'negatives-approve'));
    const r={id:'wareneingang:negative-gr-01',quantity:8,unit:'STK',acceptedAt:'2026-06-24T08:00:00Z'};
    const initial=procurement.readPan516Procurement({root:fixture.root});
    for(const [changes,pattern] of [[{orderId:'bestellung:another-order'},/PAN516_COMPOSITE_ORDER_POSITION_DENIED/],[{supplierId:'lieferant:another-supplier'},/PAN516_SUPPLIER_BINDING_DENIED/]]){
      assert.throws(()=>apply(fixture.root,{...command('ACCEPT_RECEIPT',1,'foreign',r),...changes}),pattern);
      assert.deepEqual(procurement.readPan516Procurement({root:fixture.root}),initial);
    }
    apply(fixture.root,command('ACCEPT_RECEIPT',1,'first-real-receipt',r));
    const afterFirst=procurement.readPan516Procurement({root:fixture.root});
    assert.throws(()=>apply(fixture.root,command('ACCEPT_RECEIPT',2,'duplicate-other-effect',r)),/WARENEINGANG_REPLAY_DENIED/);
    assert.deepEqual(procurement.readPan516Procurement({root:fixture.root}),afterFirst);
    assert.throws(()=>apply(fixture.root,command('ACCEPT_RECEIPT',2,'overdelivery',{...r,id:'wareneingang:negative-gr-02',quantity:3})),/WARENEINGANG_OVER_RECEIPT_DENIED/);
    assert.deepEqual(procurement.readPan516Procurement({root:fixture.root}),afterFirst);
    assert.equal(nativeRows(fixture.root,'SELECT revision FROM pan516_events').length,2);
  }finally{fixture.close();}
});

test('P02 partial invoice remains one grain across two actual receipts and does not double quantity or amount',async()=>{
  const fixture=await initializedFixture();
  try{
    apply(fixture.root,command('APPROVE',0,'partial-approve'));
    apply(fixture.root,{...command('CONFIRM',1,'partial-confirm'),confirmation:{revision:1,previousConfirmationDigest:null,terms,confirmedAt:'2026-06-21T08:00:00Z'}});
    for(const [i,source] of common.receipts.entries())apply(fixture.root,command('ACCEPT_RECEIPT',i+2,'partial-gr-'+i,{id:'wareneingang:partial-gr-'+i,quantity:source.accepted_quantity,unit:'STK',acceptedAt:new Date(source.accepted_at).toISOString().replace('.000Z','Z')}));
    const result=procurement.evaluatePan516ProcurementLiability({root:fixture.root,invoiceId:'AP-PAN516-PARTIAL-01',expectedConfirmationRevision:1});
    assert.equal(result.invoicedQuantity,5);assert.equal(result.acceptedQuantity,10);assert.equal(result.source.receiptEventDigests.length,2);
    assert.equal(result.invoiceGrainCount,1);assert.equal(result.source.invoiceAmountMinor,30000);assert.equal(result.expectedAmountMinor,30000);
    assert.equal(result.remainingInvoiceQuantity,5);assert.equal(result.status,'UNRESOLVED_PARTIAL_INVOICE');
    assert.equal(result.decision.outcome,'MATCHED');assert.equal(result.paymentOrder,null);
    assert.throws(()=>procurement.evaluatePan516ProcurementLiability({root:fixture.root,invoiceId:'AP-01',expectedConfirmationRevision:0}),/PAN516_CONFIRMED_TERMS_REVISION_REQUIRED_DENIED/);
  }finally{fixture.close();}
});

test('P02 actual SIGKILL after local native target commit is reconciled by exact target read before any retry order effect',async()=>{
  const fixture=await initializedFixture();
  try{
    apply(fixture.root,command('APPROVE',0,'transmit-approve'));
    const c=command('TRANSMIT',1,'transmit-uncertain');
    const script="import * as p from './src/procurement-434/bestellung-lifecycle.mjs';const root=process.argv[1],command=JSON.parse(process.argv[2]);const grant=p.authorizePan516ProcurementCommand({root,command,owner:'LOCAL_SYNTHETIC_OWNER'});p.executePan516ProcurementCommand({root,command,grant});process.kill(process.pid,'SIGKILL');";
    const killed=spawnSync(process.execPath,['--input-type=module','-e',script,fixture.root,JSON.stringify(c)],{encoding:'utf8'});
    assert.equal(killed.signal,'SIGKILL',killed.stderr);assert.equal(killed.stdout,'');
    const originalEvents=nativeRows(fixture.root,'SELECT revision,command,event FROM pan516_events ORDER BY revision');
    const targetBefore=nativeRows(fixture.root,'SELECT order_key,record FROM pan516_target_orders');assert.equal(targetBefore.length,1);
    const retried=apply(fixture.root,{...c,transportId:'synthetic:retry-transport-001'});
    assert.equal(retried.outcome,'RECONCILED_NO_DUPLICATE');assert.equal(retried.targetObservation.outcome,'EXACT_TARGET_ALREADY_APPLIED');
    assert.equal(retried.targetObservation.readBeforeAnyNewOrderEffect,true);assert.equal(retried.targetObservation.newOrderEffect,false);
    assert.deepEqual(nativeRows(fixture.root,'SELECT order_key,record FROM pan516_target_orders'),targetBefore);
    assert.deepEqual(nativeRows(fixture.root,'SELECT revision,command,event FROM pan516_events ORDER BY revision'),originalEvents);
    const state=procurement.readPan516Procurement({root:fixture.root});assert.equal(state.transmissions.length,1);assert.equal(state.transmissionState,'LOCAL_TARGET_PERSISTED_EXTERNAL_UNPROVEN');
    assert.equal(state.authority.productiveDispatchAuthorized,false);
  }finally{fixture.close();}
});

test('P02 invoice price deviation runs the unchanged ERV core against one native PO-receipt grain and never creates payment authority',async()=>{
  const fixture=await initializedFixture();
  try{
    apply(fixture.root,command('APPROVE',0,'liability-approve'));
    apply(fixture.root,{...command('CONFIRM',1,'liability-confirm'),confirmation:{revision:1,previousConfirmationDigest:null,terms,confirmedAt:'2026-06-21T08:00:00Z'}});
    for(const [i,source] of common.receipts.entries())apply(fixture.root,command('ACCEPT_RECEIPT',i+2,'liability-receipt-'+i,{id:'wareneingang:liability-gr-'+i,quantity:source.accepted_quantity,unit:'STK',acceptedAt:new Date(source.accepted_at).toISOString().replace('.000Z','Z')}));
    assert.equal(typeof procurement.evaluatePan516ProcurementLiability,'function','missing native purchase-to-retained-ERV liability entry, not a new amount matcher');
    const result=procurement.evaluatePan516ProcurementLiability({root:fixture.root,invoiceId:'AP-01',expectedConfirmationRevision:1});
    assert.equal(result.outcome,'LIABILITY_BASIS');assert.equal(result.status,'UNRESOLVED_AMOUNT_DEVIATION');
    assert.equal(result.orderedQuantity,10);assert.equal(result.acceptedQuantity,10);assert.equal(result.invoicedQuantity,10);
    assert.equal(result.source.invoiceAmountMinor,62000);assert.equal(result.expectedAmountMinor,60000);assert.equal(result.varianceMinor,2000);
    assert.equal(result.decision.outcome,'CONFLICT');assert.equal(result.decision.conflict.deltaMinor,2000);assert.equal(result.decision.conflict.toleranceMinor,0);
    assert.equal(result.decision.variant.matchingModeId,'THREE_WAY_INVOICE_PO_RECEIPT_V1');
    assert.equal(result.source.receiptEventDigests.length,2);assert.equal(result.invoiceGrainCount,1);
    assert.equal(result.source.invoiceId,'AP-01');assert.ok(result.source.confirmationDigest);
    assert.equal(result.paymentOrder,null);assert.equal(result.authority.paymentOrderAuthorized,false);assert.equal(result.decision.authority.productivePostingAuthorized,false);
    assert.equal(nativeRows(fixture.root,'SELECT revision FROM pan516_events').length,4);
  }finally{fixture.close();}
});

test('P02 confirmed price currency unit and promise revisions preserve the original approval and prior native confirmation bytes',async()=>{
  const fixture=await initializedFixture();
  try{
    apply(fixture.root,command('APPROVE',0,'revision-approve'));
    const first={revision:1,previousConfirmationDigest:null,terms,confirmedAt:'2026-06-21T08:00:00Z'};
    assert.equal(apply(fixture.root,{...command('CONFIRM',1,'confirm-first'),confirmation:first}).outcome,'COMMITTED');
    const old=nativeRows(fixture.root,'SELECT event FROM pan516_events WHERE revision=2')[0].event;
    const before=procurement.readPan516Procurement({root:fixture.root});
    const revised={unitPriceMinor:6200,currency:'USD',unit:'PAAR',promisedAt:'2026-06-27T23:59:59+02:00'};
    const second={revision:2,previousConfirmationDigest:before.confirmations[0].confirmationDigest,terms:revised,confirmedAt:'2026-06-22T08:00:00Z'};
    assert.equal(apply(fixture.root,{...command('CONFIRM',2,'confirm-second'),confirmation:second}).outcome,'COMMITTED');
    const after=procurement.readPan516Procurement({root:fixture.root});
    assert.deepEqual(after.confirmations.map(c=>c.terms),[terms,revised]);assert.deepEqual(after.confirmations.map(c=>c.revision),[1,2]);
    assert.deepEqual(after.approval.terms,terms);assert.equal(after.transmissionState,'NOT_RECORDED');
    assert.equal(nativeRows(fixture.root,'SELECT event FROM pan516_events WHERE revision=2')[0].event,old);
    assert.deepEqual(after.confirmations[0],before.confirmations[0]);
    assert.equal(after.confirmations[1].previousConfirmationDigest,after.confirmations[0].confirmationDigest);
  }finally{fixture.close();}
});

test('P02 native approved ten-unit order and two accepted partial receipts retain exact remaining-quantity history',async()=>{
  // Premise: exercise the actual retained goods-receipt contract, not a schema or mock.
  const draft=bestellungsentwurfBildenV1(purchase);assert.equal(draft.outcome,'ENTWURF');
  let ledger=wareneingangLedgerBildenV1(draft.entwurf,purchase.positionen[0].positionId).ledger;
  for(const [i,source] of common.receipts.entries()){
    const result=wareneingangErfassenV1(draft.entwurf,ledger,{eingangsId:'wareneingang:pan516-gr-0'+(i+1),bestellungId:purchase.bestellungId,positionId:purchase.positionen[0].positionId,einheit:'STK',menge:source.accepted_quantity,zeitstempel:new Date(source.accepted_at).toISOString().replace('.000Z','Z'),korrekturVon:null});
    assert.equal(result.outcome,'WARENEINGANG_ERFASST');ledger=result.ledger;
  }
  assert.equal(ledger.eintraege.reduce((n,r)=>n+r.menge,0),common.purchase_order.quantity);
  // The missing feature is the real leading-store approval + persisted remainder history.
  assert.equal(typeof procurement.initializePan516Procurement,'function','released procurement path lacks the approved native lifecycle, not goods-receipt arithmetic');
  const fixture=await nativeTradeFixture({common:true});
  try{
    initializePan515TradeState({root:fixture.root,owner:'LOCAL_SYNTHETIC_OWNER',caseId:'COMMON-TRADE-01'});
    const initialized=procurement.initializePan516Procurement({root:fixture.root,owner:'LOCAL_SYNTHETIC_OWNER',purchase,terms});
    assert.equal(initialized.outcome,'PROCUREMENT_INITIALIZED');
    const initial=procurement.readPan516Procurement({root:fixture.root});assert.equal(initial.phase,'DRAFT');assert.equal(initial.acceptedQuantity,0);assert.equal(initial.remainingQuantity,10);
    assert.equal(apply(fixture.root,command('APPROVE',0,'approve')).outcome,'COMMITTED');
    for(const [i,source] of common.receipts.entries()){
      const c=command('ACCEPT_RECEIPT',i+1,'receipt-0'+(i+1),{id:'wareneingang:pan516-gr-0'+(i+1),quantity:source.accepted_quantity,unit:'STK',acceptedAt:new Date(source.accepted_at).toISOString().replace('.000Z','Z')});
      assert.equal(apply(fixture.root,c).outcome,'COMMITTED');
    }
    const state=procurement.readPan516Procurement({root:fixture.root});
    assert.equal(state.leadingStore,'PAN472_TARGET_SQLITE');assert.equal(state.acceptedQuantity,10);assert.equal(state.remainingQuantity,0);
    assert.deepEqual(state.remainingQuantityHistory.map(r=>r.remainingQuantity),[10,2,0]);
    assert.deepEqual(state.receiptLedger.eintraege.map(r=>r.menge),[8,2]);
    const native=nativeRows(fixture.root,'SELECT revision,command,event FROM pan516_events ORDER BY revision');assert.equal(native.length,3);
    assert.deepEqual(native.map(r=>JSON.parse(r.event).kind),['APPROVE','ACCEPT_RECEIPT','ACCEPT_RECEIPT']);
    assert.equal(state.authority.productiveDispatchAuthorized,false);assert.equal(state.authority.paymentOrderAuthorized,false);
  }finally{fixture.close();}
});
