// Pure oracle checks only; actual native-entry coverage is a separate gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyRetainedBusinessV1} from '../../src/pan464/protected-oracle.mjs';
const sample = () => ({producer:{rows:[{invoiceId:'rechnung:101',amountMinor:2999},{invoiceId:'rechnung:102',amountMinor:3000},{invoiceId:'rechnung:103',amountMinor:2500}]},consumer:{healthStatus:200,httpStatus:200,data:[{total_minor:8499,invoice_count:3}],datasetId:1,dashboardId:1,postActivationDashboards:0}});
test('protected original expected facts accept actual-observation shape, not an expected-values argument',()=>{
  assert.equal(verifyRetainedBusinessV1(sample()).outcome,'PASS');
});
test('healthy HTTP with deliberately wrong business result is denied',()=>{
  const x=sample();x.consumer.data[0].total_minor++;
  assert.deepEqual(verifyRetainedBusinessV1(x),{outcome:'DENIED',reasonCodes:['NATIVE_BUSINESS_MISMATCH']});
});
test('retained source IDs cannot be silently replaced by a fresh installation',()=>{
  assert(verifyRetainedBusinessV1(sample(),{datasetId:2,dashboardId:1}).reasonCodes.includes('RETAINED_IDENTITY_MISMATCH'));
});
test('same total with wrong invoice identity or threshold assignment fails',()=>{
  const x=sample();x.producer.rows[0].invoiceId='replacement:101';
  assert.equal(verifyRetainedBusinessV1(x).outcome,'DENIED');
  const y=sample();[y.producer.rows[0].amountMinor,y.producer.rows[1].amountMinor]=[y.producer.rows[1].amountMinor,y.producer.rows[0].amountMinor];
  assert(verifyRetainedBusinessV1(y).reasonCodes.includes('PRODUCER_THRESHOLD_MISMATCH'));
});
test('new valid producer and metadata writes require their independent post-activation facts',()=>{
  const x=sample();x.producer.rows.push({invoiceId:'rechnung:104',amountMinor:1234});
  x.consumer.data=[{total_minor:9733,invoice_count:4}];x.consumer.postActivationDashboards=1;
  assert.equal(verifyRetainedBusinessV1(x,null,{postActivation:true}).outcome,'PASS');
  assert.equal(verifyRetainedBusinessV1(x).outcome,'DENIED');
  x.producer.rows.pop();assert.equal(verifyRetainedBusinessV1(x,null,{postActivation:true}).outcome,'DENIED');
});
test('missing/malformed observations do not become health-only acceptance',()=>{
  for(const x of [{}, {producer:{rows:[]},consumer:{healthStatus:200}}, sample()]){
    if(x.consumer?.data)x.consumer.data=[];
    assert.equal(verifyRetainedBusinessV1(x).outcome,'DENIED');
  }
});
