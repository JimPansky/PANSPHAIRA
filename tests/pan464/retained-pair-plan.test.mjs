import test from 'node:test';
import assert from 'node:assert/strict';
import {retainedPairPlanV1,SOURCE_PAN_V1,CONSUMER_KS_V1} from '../../src/pan464/retained-pair-plan.mjs';
const input=()=>({sourcePan:SOURCE_PAN_V1,targetPan:'2db1dc8954721d6f29fa6dfac9861d02e17764b7',consumerKs:CONSUMER_KS_V1,imageId:'sha256:'+'a'.repeat(64),issuedAtMs:1});
test('bounded plan binds both exact tuples and the actual qualification image',()=>{
  const x=retainedPairPlanV1(input());assert.notEqual(x.nativePlan.checkPlan.fromLockDigest,x.nativePlan.checkPlan.targetLockDigest);
  assert.equal(x.nativePlan.checkPlan.mode,'CHECK_ONLY');
  assert.notEqual(x.edgeDigest,retainedPairPlanV1({...input(),imageId:'sha256:'+'b'.repeat(64)}).edgeDigest);
});
test('unsupported source, consumer, malformed target and same-pair pseudo-upgrade refuse',()=>{
  for(const override of [{sourcePan:'f'.repeat(40)},{consumerKs:'f'.repeat(40)},{targetPan:'main'},{targetPan:SOURCE_PAN_V1},{imageId:'latest'},{issuedAtMs:NaN}]){
    assert.throws(()=>retainedPairPlanV1({...input(),...override}),/PAN464_EXACT_EDGE_DENIED/);
  }
});
