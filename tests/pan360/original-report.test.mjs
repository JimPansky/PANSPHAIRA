import assert from 'node:assert/strict';
import test from 'node:test';
import {generateOriginalErvReportV1,verifyOriginalErvReportV1} from '../../src/pan360/original-erv-report-v1.mjs';
import {digest} from '../../src/pan360/original-erv-core-v1.mjs';
test('PAN360 report: six prebuilt analytics projections preserve historical1/2 and execute changed3/4/5/6 with complete pair denominator',async()=>{
 const r=await generateOriginalErvReportV1();assert.equal(verifyOriginalErvReportV1(r,r.reportDigest).valid,true);
 assert.deepEqual(r.analytics.projections.map(p=>p.analysis),[1,2,3,4,5,6]);
 for(const p of r.analytics.projections.slice(0,2)){
  assert.equal(p.scope,'RETAINED_HISTORICAL_SYNTHETIC_EXTRACTION_NOT_NEW_OCR_OR_PAIR_EXTRACTION_METRICS');
  assert.equal(p.metricVersion,'1.0.0');assert.ok(p.source.sha256);
 }
 for(const p of r.analytics.projections.slice(2)){assert.equal(p.denominator.total,2);assert.equal(p.rows.length,2);}
 const workload=r.analytics.projections[4].rows;assert.equal(workload[0].approvalRequirement,'NOT_REQUIRED');assert.equal(workload[1].approvalRequirement,'REQUIRES_SEPARATE_APPROVAL');assert.equal(workload[1].localApprovalRecorded,true);
 assert.notEqual(r.differences.ui.baselineSnapshotDigest,r.differences.ui.modifiedSnapshotDigest);
 assert.notDeepEqual(r.differences.advisor.baseline,r.differences.advisor.modified);
 assert.equal(r.terminalVerdict,'PENDING_INDEPENDENT_ORIGINAL9_ACCEPTANCE');
 assert.deepEqual(await generateOriginalErvReportV1(),r);
});
test('PAN360 report: missing trust, stale/substituted and fully re-digested report/receipt/UI/analytics fail against actual producer digest',async()=>{
 const r=await generateOriginalErvReportV1();assert.equal(verifyOriginalErvReportV1(r).reasonCode,'TRUSTED_PRODUCER_DIGEST_REQUIRED');
 for(const mutate of [x=>{x.pair.reuseReceipt.coreModuleDigestsIdentical=false;},x=>{x.pair.modified.execution.decision.appliedRateBasisPoints=100;},x=>{x.analytics.projections[4].rows[1].approvalRequirement='NOT_REQUIRED';},x=>{x.pair.modified.execution.ui.screens[0].sections[0].components[0].field.value=0;}]){
  const f=structuredClone(r);mutate(f);assert.equal(verifyOriginalErvReportV1(f,r.reportDigest).reasonCode,'REPORT_INTEGRITY_DENIED');
  const {reportDigest,...body}=f;void reportDigest;f.reportDigest=digest(body);
  assert.equal(verifyOriginalErvReportV1(f,r.reportDigest).reasonCode,'REPORT_SOURCE_FORGERY_DENIED');
 }
 assert.equal(verifyOriginalErvReportV1(r,r.reportDigest).valid,true);
});
