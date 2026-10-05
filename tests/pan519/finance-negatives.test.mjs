import assert from 'node:assert/strict';
import test from 'node:test';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import * as finance from '../../src/pan519/finance-handoff.mjs';
import {executePan519ContractTransport} from '../../src/pan519/contract-transport.mjs';
import {financeFixture,handoff} from './native-fixture.mjs';
import {nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
const owner='LOCAL_SYNTHETIC_OWNER';
const reply=d=>({schemaVersion:'pansphaira.pan519/contract-readback/v1',proofClass:'LOCAL_SYNTHETIC_CONTRACT_ONLY',observationId:'synthetic:bound-readback-001',tenantId:d.tenantId,entityId:d.entityId,currency:d.currency,businessKey:d.businessKey,documentSourceDigest:d.sourceDigest,booking:{state:'POSTED',reference:'synthetic:book-test-001',bookedAt:'2026-07-03T12:01:00Z'},payments:{complete:true,coverageThrough:'2026-07-31T23:59:59Z',allocations:[{id:'synthetic:payment-known-001',documentId:d.documentId,amountMinor:80000,confirmedAt:'2026-07-04T12:00:00Z'}],differences:[]},observedAt:'2026-08-01T00:00:00Z'});
test('P05 wrong tenant export-as-booking incomplete zero expanded qualification and noninteger readback deny native evidence mutation',async()=>{
 const f=await financeFixture();
 try{
  finance.initializePan519Finance({root:f.root,owner});handoff(f.root,'AR-01');const d=finance.readPan519Finance({root:f.root,asOf:'2026-07-31T23:59:59Z'}).documents[0],valid=reply(d),prior=nativeRows(f.root,'SELECT * FROM pan519_events');
  const mutations=[v=>v.tenantId='SYN-TENANT-OTHER',v=>v.entityId='SYN-ENTITY-OTHER',v=>v.currency='USD',v=>v.documentSourceDigest='0'.repeat(64),v=>v.booking.state='EXPORTED',v=>v.booking.reference=null,v=>v.realTargetSandboxQualified=true,v=>v.payments.allocations[0].amountMinor=0.5,v=>v.payments.allocations[0].amountMinor=-0,v=>v.payments.allocations.push({...v.payments.allocations[0]}),v=>v.payments.allocations[0].documentId='FOREIGN-INVOICE',v=>{v.payments.complete=false;v.payments.allocations=[];v.payments.differences=[];},v=>v.booking.bookedAt='2026-07-02T12:00:00Z',v=>v.payments.coverageThrough='2026-08-02T12:00:00Z'];
  for(const mutate of mutations){const bad=structuredClone(valid);mutate(bad);assert.throws(()=>finance.recordPan519ContractReadback({root:f.root,owner,readback:bad}),/PAN519_.*DENIED/);assert.equal(nativeRows(f.root,'SELECT * FROM pan519_observations').length,0);assert.deepEqual(nativeRows(f.root,'SELECT * FROM pan519_events'),prior);}
  assert.throws(()=>finance.capturePan519HandoffPlan({root:f.root,owner,documentId:'AP-01',handedOffAt:'2026-07-03T12:00:00Z'}),/PAN519_UNRESOLVED_LIABILITY_NOT_ADMITTED_DENIED/);
  const {plan}=finance.capturePan519HandoffPlan({root:f.root,owner,documentId:'AR-01',handedOffAt:'2026-07-03T12:00:00Z'});
  assert.throws(()=>finance.executePan519Handoff({root:f.root,plan,grant:{owner},transportId:'synthetic:forged-owner-001'}),/PAN519_CONTENT_BOUND_AUTHORITY_REQUIRED_DENIED/);
  finance.recordPan519ContractReadback({root:f.root,owner,readback:valid});const paid=finance.readPan519Finance({root:f.root,asOf:'2026-07-31T23:59:59Z'}).documents[0];assert.equal(paid.paymentState,'PAID');assert.equal(paid.openMinor,0);
  const conflicting=structuredClone(valid);conflicting.payments.allocations[0].amountMinor=1;assert.throws(()=>finance.recordPan519ContractReadback({root:f.root,owner,readback:conflicting}),/PAN519_READBACK_REPLAY_CONFLICT_DENIED/);assert.equal(nativeRows(f.root,'SELECT * FROM pan519_observations').length,1);
  const unallocated=structuredClone(valid);unallocated.observationId='synthetic:unallocated-001';unallocated.payments.allocations[0].documentId=null;finance.recordPan519ContractReadback({root:f.root,owner,readback:unallocated});const unmatched=finance.readPan519Finance({root:f.root,asOf:'2026-07-31T23:59:59Z'}).documents[0];assert.equal(unmatched.paymentState,'UNALLOCATED_PAYMENT_REQUIRES_REVIEW');assert.equal(unmatched.allocatedMinor,0);assert.equal(unmatched.openMinor,80000);assert.equal(unmatched.unallocatedPaymentMinor,80000);
  // Row triggers need a real row: capture only the durable intent, no HTTP effect.
  finance.capturePan519ContractDispatch({root:f.root,owner,endpoint:'http://127.0.0.1:1234/pan519-contract-v1',businessKey:d.businessKey});
  const db=new DatabaseSync(join(f.root,'target.sqlite'));try{for(const table of ['pan519_binding','pan519_events','pan519_observations','pan519_dispatches'])for(const op of ['UPDATE','DELETE'])assert.throws(()=>db.exec(op==='UPDATE'?'UPDATE '+table+' SET record=record':'DELETE FROM '+table),/PAN519_HISTORY_IMMUTABLE_DENIED/);}finally{db.close();}
 }finally{f.close();}
});
test('P05 nested caller accessors never execute while the readback guard rejects nondata input',async()=>{
 const f=await financeFixture();
 try{
  finance.initializePan519Finance({root:f.root,owner});handoff(f.root,'AR-01');const d=finance.readPan519Finance({root:f.root,asOf:'2026-07-31T23:59:59Z'}).documents[0],value=reply(d);let calls=0;
  Object.defineProperty(value.booking,'reference',{enumerable:true,get(){calls++;return 'synthetic:book-test-001';}});
  assert.throws(()=>finance.recordPan519ContractReadback({root:f.root,owner,readback:value}),/PAN519_.*DENIED/,'a getter is caller code, not observed target JSON');assert.equal(calls,0);assert.equal(nativeRows(f.root,'SELECT * FROM pan519_observations').length,0);
 }finally{f.close();}
});
test('P05 free URLs redirect-like selectors endpoint drift and caller owner labels grant no dispatch',async()=>{
 const f=await financeFixture();
 try{
  finance.initializePan519Finance({root:f.root,owner});const e=handoff(f.root,'AR-01');
  for(const endpoint of ['https://example.invalid/pan519-contract-v1','http://localhost:1234/pan519-contract-v1','http://127.0.0.1:1234/pan519-contract-v1?redirect=x','http://127.0.0.1:65536/pan519-contract-v1'])await assert.rejects(executePan519ContractTransport({root:f.root,owner,endpoint,businessKey:e.receipt.businessKey}),/PAN519_LOCAL_CONTRACT_ENDPOINT_BINDING_DENIED/);
  assert.equal(nativeRows(f.root,'SELECT * FROM pan519_dispatches').length,0);
  await assert.rejects(executePan519ContractTransport({root:f.root,owner:'ADMIN',endpoint:'http://127.0.0.1:1234/pan519-contract-v1',businessKey:e.receipt.businessKey}),/PAN519_LOCAL_SYNTHETIC_OWNER_REQUIRED_DENIED/);
  assert.equal(nativeRows(f.root,'SELECT * FROM pan519_dispatches').length,0);
 }finally{f.close();}
});
