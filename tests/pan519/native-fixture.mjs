import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import * as trade from '../../src/pan515/trade-state.mjs';
import * as procurement from '../../src/procurement-434/bestellung-lifecycle.mjs';
import {evaluatePan516ProcurementLiability} from '../../src/procurement-434/bestellung-liability.mjs';
import {nativeTradeFixture,nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
import common from '../../contracts/trade/common-trade-01-v1.json' with {type:'json'};
const candidate=new URL('../../src/pan519/finance-handoff.mjs',import.meta.url);
// Execute the existing native path before asserting the missing finance seam.
const finance=existsSync(candidate)?await import(candidate):trade;
const owner='LOCAL_SYNTHETIC_OWNER';
export async function financeFixture(){
  const f=await nativeTradeFixture({common:true});
  try{
    trade.initializePan515TradeState({root:f.root,owner,caseId:common.id});
    const r=spawnSync(process.execPath,['scripts/run-pan515-trade-state.mjs','apply-common','--root',f.root,'--owner',owner],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
    const purchase={bestellungId:'bestellung:pan516-common',lieferantId:'lieferant:synthetic-01',bestellungZeitstempel:'2026-06-20T08:00:00Z',positionen:[{positionId:'position:common-01',artikelId:'EINK-ART-A01',einheit:'STK',waehrung:'EUR',bestellteMenge:10,berechneteMengeMinor:null}]};
    const terms={unitPriceMinor:6000,currency:'EUR',unit:'STK',promisedAt:common.purchase_order.promised_acceptance_at};
    procurement.initializePan516Procurement({root:f.root,owner,purchase,terms});
    const apply=c=>procurement.executePan516ProcurementCommand({root:f.root,command:c,grant:procurement.authorizePan516ProcurementCommand({root:f.root,owner,command:c})});
    const command=(kind,expectedRevision,id,receipt=null)=>({schemaVersion:'pansphaira.pan516/procurement-command/v1',effectId:'synthetic:finance-'+id,transportId:'synthetic:finance-wire-'+id,expectedRevision,orderId:purchase.bestellungId,positionId:purchase.positionen[0].positionId,supplierId:purchase.lieferantId,kind,receipt,sourceReference:'synthetic:finance-source-'+id});
    apply(command('APPROVE',0,'approve'));
    apply({...command('CONFIRM',1,'confirm'),confirmation:{revision:1,previousConfirmationDigest:null,terms,confirmedAt:'2026-06-21T08:00:00Z'}});
    for(const [i,r] of common.receipts.entries())apply(command('ACCEPT_RECEIPT',i+2,'receipt-'+i,{id:'wareneingang:finance-gr-'+i,quantity:r.accepted_quantity,unit:'STK',acceptedAt:new Date(r.accepted_at).toISOString().replace('.000Z','Z')}));
    return f;
  }catch(e){f.close();throw e;}
}
export function handoff(root,documentId,transportId='synthetic:finance-transport-001'){
  const {plan}=finance.capturePan519HandoffPlan({root,owner,documentId,handedOffAt:'2026-07-03T12:00:00Z'});
  const grant=finance.authorizePan519HandoffPlan({root,owner,plan});
  return finance.executePan519Handoff({root,plan,grant,transportId});
}
