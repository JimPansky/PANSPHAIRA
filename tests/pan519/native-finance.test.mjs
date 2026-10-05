import assert from 'node:assert/strict';
import test from 'node:test';
import * as finance from '../../src/pan519/finance-handoff.mjs';
import {evaluatePan516ProcurementLiability} from '../../src/procurement-434/bestellung-liability.mjs';
import {nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
import {financeFixture,handoff} from './native-fixture.mjs';
const owner='LOCAL_SYNTHETIC_OWNER';
test('P05 native AR and matched AP share a durable handoff contract; export never becomes booking or a known zero balance',async()=>{
  const f=await financeFixture();
  try{
    const liability=evaluatePan516ProcurementLiability({root:f.root,invoiceId:'AP-PAN516-MATCHED-01',expectedConfirmationRevision:1});assert.equal(liability.expectedAmountMinor,60000);assert.equal(liability.status,'RELEASED_LOCAL_SYNTHETIC');
    assert.equal(typeof finance.initializePan519Finance,'function','existing released native store has no finance handoff/readback seam; not an import or fixture error');
    finance.initializePan519Finance({root:f.root,owner});
    for(const [id,kind,amount] of [['AR-01','AR',80000],['AP-PAN516-MATCHED-01','AP',60000]]){
      const captured=finance.capturePan519HandoffPlan({root:f.root,owner,documentId:id,handedOffAt:'2026-07-03T12:00:00Z'});assert.equal(captured.plan.document.kind,kind);assert.equal(captured.plan.document.amountMinor,amount);assert.equal(captured.diff.before,'NOT_HANDED_OFF');assert.equal(captured.diff.after,'HANDOFF_PENDING_READBACK');
      const before=nativeRows(f.root,'SELECT * FROM pan519_events');assert.deepEqual(finance.capturePan519HandoffPlan({root:f.root,owner,documentId:id,handedOffAt:'2026-07-03T12:00:00Z'}),captured);assert.deepEqual(nativeRows(f.root,'SELECT * FROM pan519_events'),before);
      const grant=finance.authorizePan519HandoffPlan({root:f.root,owner,plan:captured.plan});const first=finance.executePan519Handoff({root:f.root,plan:captured.plan,grant,transportId:'synthetic:first-finance-wire'});assert.equal(first.outcome,'HANDOFF_PERSISTED');
      const again=handoff(f.root,id,'synthetic:changed-finance-wire');assert.equal(again.outcome,'RECONCILED_NO_DUPLICATE');assert.equal(again.receipt.receiptDigest,first.receipt.receiptDigest);
    }
    const read=finance.readPan519Finance({root:f.root,asOf:'2026-07-03T23:59:59Z'});assert.equal(read.leadingStore,'PAN472_TARGET_SQLITE');assert.equal(read.documents.length,2);
    for(const row of read.documents){assert.equal(row.bookingState,'UNKNOWN');assert.equal(row.bookingReference,null);assert.equal(row.openMinor,null);assert.equal(row.allocatedMinor,null);assert.equal(row.paymentOrder,null);}
    assert.equal(read.qualification.realTargetSandboxQualified,false);assert.equal(read.authority.paymentDispatchAuthorized,false);assert.equal(nativeRows(f.root,'SELECT * FROM pan519_events').length,2);
  }finally{f.close();}
});

test('P05 contract readback separates partial overpayment difference and unknown allocation and excludes later confirmed payments at the cutoff',async()=>{
  const f=await financeFixture();
  try{
    finance.initializePan519Finance({root:f.root,owner});handoff(f.root,'AR-01');handoff(f.root,'AP-PAN516-MATCHED-01');
    assert.equal(typeof finance.recordPan519ContractReadback,'function','native handoff exists but has no bound readback/payment-cutoff reconstruction');
    const initial=finance.readPan519Finance({root:f.root,asOf:'2026-07-03T23:59:59Z'}),ar=initial.documents.find(d=>d.kind==='AR'),ap=initial.documents.find(d=>d.kind==='AP');
    const snapshot=(d,id,payments)=>({schemaVersion:'pansphaira.pan519/contract-readback/v1',proofClass:'LOCAL_SYNTHETIC_CONTRACT_ONLY',observationId:'synthetic:read-'+id,tenantId:d.tenantId,entityId:d.entityId,currency:d.currency,businessKey:d.businessKey,documentSourceDigest:d.sourceDigest,booking:{state:'POSTED',reference:'synthetic:book-'+id,bookedAt:'2026-07-03T12:01:00Z'},payments:{complete:true,coverageThrough:'2026-07-31T23:59:59Z',allocations:[],differences:[],...payments},observedAt:'2026-08-01T00:00:00Z'});
    const arReply=snapshot(ar,'ar',{allocations:[{id:'synthetic:payment-july',documentId:ar.documentId,amountMinor:30000,confirmedAt:'2026-07-03T15:00:00Z'},{id:'synthetic:payment-august',documentId:ar.documentId,amountMinor:60000,confirmedAt:'2026-08-01T00:00:00Z'}]});
    finance.recordPan519ContractReadback({root:f.root,owner,readback:arReply});
    finance.recordPan519ContractReadback({root:f.root,owner,readback:snapshot(ap,'ap',{allocations:[{id:'synthetic:payment-ap',documentId:ap.documentId,amountMinor:10000,confirmedAt:'2026-07-03T15:00:00Z'}],differences:[{id:'synthetic:difference-ap',amountMinor:1000,confirmedAt:'2026-07-03T16:00:00Z'}]})});
    const cutoff=finance.readPan519Finance({root:f.root,asOf:'2026-07-31T23:59:59Z'}),arJuly=cutoff.documents.find(d=>d.kind==='AR'),apJuly=cutoff.documents.find(d=>d.kind==='AP');
    assert.equal(arJuly.bookingState,'POSTED_LOCAL_CONTRACT');assert.equal(arJuly.allocatedMinor,30000);assert.equal(arJuly.openMinor,50000);assert.equal(arJuly.paymentState,'PARTIALLY_PAID');assert.equal(arJuly.excludedFuturePaymentIds.length,1);
    assert.equal(apJuly.allocatedMinor,10000);assert.equal(apJuly.differenceMinor,1000);assert.equal(apJuly.openMinor,49000);assert.equal(apJuly.paymentState,'DIFFERENCE_REQUIRES_REVIEW');
    assert.deepEqual(cutoff.reconciliation.AR,{handedOffMinor:80000,postedMinor:80000,allocatedMinor:30000,differenceMinor:0,openMinor:50000,unknownDocumentMinor:0,unallocatedPaymentMinor:0,balanced:true});
    assert.deepEqual(cutoff.reconciliation.AP,{handedOffMinor:60000,postedMinor:60000,allocatedMinor:10000,differenceMinor:1000,openMinor:49000,unknownDocumentMinor:0,unallocatedPaymentMinor:0,balanced:true});
    const future=snapshot(ar,'ar-overpaid',{coverageThrough:'2026-08-01T00:00:00Z',allocations:arReply.payments.allocations});finance.recordPan519ContractReadback({root:f.root,owner,readback:future});
    const overpaid=finance.readPan519Finance({root:f.root,asOf:'2026-08-01T00:00:00Z'}).documents.find(d=>d.kind==='AR');assert.equal(overpaid.allocatedMinor,90000);assert.equal(overpaid.openMinor,-10000);assert.equal(overpaid.paymentState,'OVERPAID_REQUIRES_REVIEW');
    finance.recordPan519ContractReadback({root:f.root,owner,readback:snapshot(ap,'ap-missing',{complete:false,allocations:null,differences:null})});
    const missing=finance.readPan519Finance({root:f.root,asOf:'2026-07-31T23:59:59Z'}).documents.find(d=>d.kind==='AP');assert.equal(missing.openMinor,null);assert.equal(missing.allocatedMinor,null);assert.equal(missing.paymentState,'UNKNOWN_ALLOCATION');
    assert.equal(missing.paymentOrder,null);assert.equal(cutoff.qualification.realTargetSandboxQualified,false);
  }finally{f.close();}
});
