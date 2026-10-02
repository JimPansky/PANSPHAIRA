// Narrow receipt/analytics projection of the actually executed Original360 pair.
// The first two historical synthetic extraction analyses are consumed unchanged;
// changed matching/approval/UI evidence is explicitly versioned, never relabelled.
import {readFileSync} from 'node:fs';
import {runOriginalErvPairV1,originalExecutionIdentityV1} from './original-erv-execution-v1.mjs';
import {canonical,digest,sha256,freeze} from './original-erv-core-v1.mjs';
import {computeErvUiPackageDeltaV1,verifyTrustedErvUiSourceV1} from '../../erv-ui-reference/reference.mjs';
const ROOT=new URL('../../',import.meta.url);
const HISTORICAL='verification/incoming-invoice-erv-analytics-v1.json';
const HISTORICAL_SHA='3d50dd9c157e72eab46807810f63d82d6b44bd15b1887b54fa529976fd9ee71d';
export function projectOriginalErvAnalyticsV1(pair) {
  const bytes=readFileSync(new URL(HISTORICAL,ROOT));
  if(sha256(bytes)!==HISTORICAL_SHA)throw new Error('PAN360_RETAINED_ANALYTICS_SOURCE_DENIED');
  const historical=JSON.parse(bytes);
  const executions=[pair.baseline.execution,pair.modified.execution];
  const rows=executions.map(e=>({label:e.label,executionDigest:e.executionDigest,configurationDigest:e.configurationDigest,observedAmountMinor:e.extraction.fields.grossAmountMinor.value,matchingMode:e.configuration.matchingMode.variantId,tolerancePolicyVersion:e.configuration.tolerancePolicy.version,appliedRateBasisPoints:e.decision.appliedRateBasisPoints,outcome:e.decision.outcome,approvalRequirement:e.approval.state,localApprovalRecorded:e.approvalRecord!==null,verifiedCitationCount:e.decision.evidenceCitations?.filter(c=>c.verified).length??0,intakeReadback:e.intakeReadback.outcome,uiRendered:e.uiConsumer.outcome}));
  const projections=[
    ...historical.metrics.slice(0,2).map(metric=>({analysis:historical.metricCatalog.find(c=>c.metricId===metric.metricId).analysis,metricId:metric.metricId,metricVersion:'1.0.0',scope:'RETAINED_HISTORICAL_SYNTHETIC_EXTRACTION_NOT_NEW_OCR_OR_PAIR_EXTRACTION_METRICS',source:{path:HISTORICAL,sha256:HISTORICAL_SHA},metric})),
    {analysis:3,metricId:'ERV_MATCH_OUTCOME_TOLERANCE_V1',metricVersion:'2.0.0',scope:'ORIGINAL_PAIR_EXECUTED',denominator:{basis:'actual_variant_execution_count',total:rows.length},rows:rows.map(r=>({label:r.label,matchingMode:r.matchingMode,outcome:r.outcome,appliedRateBasisPoints:r.appliedRateBasisPoints,tolerancePolicyVersion:r.tolerancePolicyVersion}))},
    {analysis:4,metricId:'ERV_EXCEPTION_REASON_DISTRIBUTION_V1',metricVersion:'2.0.0',scope:'ORIGINAL_PAIR_EXECUTED_NOT_QUALIFICATION_MATRIX',denominator:{basis:'actual_variant_execution_count',total:rows.length},rows:executions.map(e=>({label:e.label,state:e.decision.outcome,reasonCode:e.decision.exceptionCode??e.decision.reasonCode??null})),unknownHandling:'Null reason means MATCHED has no exception code, not absent/unknown documents.'},
    {analysis:5,metricId:'ERV_APPROVAL_WORKLOAD_AMOUNT_BANDS_V1',metricVersion:'2.0.0',scope:'ORIGINAL_PAIR_EXECUTED',denominator:{basis:'actual_variant_execution_count',total:rows.length},formula:'Separate approval uses original STRICTLY_GREATER_THAN 1000000 EUR minor; MATCHED does not mean auto-approved.',rows:rows.map(r=>({label:r.label,observedAmountMinor:r.observedAmountMinor,approvalRequirement:r.approvalRequirement,localApprovalRecorded:r.localApprovalRecorded}))},
    {analysis:6,metricId:'ERV_EVIDENCE_READBACK_VERDICT_V1',metricVersion:'2.0.0',scope:'ORIGINAL_PAIR_EXECUTED',denominator:{basis:'actual_variant_execution_count',total:rows.length},rows:rows.map(r=>({label:r.label,outcome:r.outcome,verifiedCitationCount:r.verifiedCitationCount,intakeReadback:r.intakeReadback,uiRendered:r.uiRendered}))},
  ];
  const body={schemaVersion:'pansphaira.pan360/executed-pair-analytics/v1',projections,sourceExecutionDigests:rows.map(r=>r.executionDigest),aggregateOnly:true,authorityGranted:false,nonclaims:['NO_NEW_OCR_OR_MODEL_QUALITY_CLAIM','NO_FINANCIAL_OPINION','NO_ARBITRARY_QUERY','NO_PRODUCTION_DASHBOARD','HISTORICAL_METRIC_DENOMINATORS_NOT_THE_NEW_PAIR_DENOMINATOR']};
  return freeze({...body,analyticsDigest:digest(body)});
}
export async function generateOriginalErvReportV1() {
  const pair=await runOriginalErvPairV1();
  if(pair.outcome!=='EXECUTED_PAIR')throw new Error('PAN360_ACTUAL_PAIR_REQUIRED');
  const analytics=projectOriginalErvAnalyticsV1(pair);
  const uiDelta=computeErvUiPackageDeltaV1(pair.baseline.execution.ui,pair.modified.execution.ui);
  const fieldStates=execution=>execution.ui.screens.flatMap(s=>s.sections.flatMap(t=>t.components.map(c=>({fieldId:c.field.fieldId,state:c.field.state,value:c.field.value??null,reasonCode:c.field.reasonCode??null}))));
  const differences={configuration:{baseline:pair.baseline.execution.configuration,modified:pair.modified.execution.configuration},process:{baseline:pair.baseline.execution.decision.process,modified:pair.modified.execution.decision.process},advisor:{baseline:pair.baseline.execution.decision.advisor,modified:pair.modified.execution.decision.advisor},ui:{inventoryDelta:uiDelta,baseline:fieldStates(pair.baseline.execution),modified:fieldStates(pair.modified.execution),baselineSnapshotDigest:pair.baseline.execution.uiConsumer.snapshotDigest,modifiedSnapshotDigest:pair.modified.execution.uiConsumer.snapshotDigest},approval:{baseline:pair.baseline.execution.approval,modified:pair.modified.execution.approval,modifiedIndependentLocalRecord:pair.modified.execution.approvalRecord},readback:{baseline:pair.baseline.execution.localJournalReadbackDigest,modified:pair.modified.execution.localJournalReadbackDigest}};
  const report={schemaVersion:'pansphaira.pan360/original-erv-execution-report/v1',scope:'PUBLIC_SYNTHETIC_NON_CUSTOMER_AUTHORITY_FREE',pair,analytics,differences,
    reportProducerBinding:{path:'src/pan360/original-erv-report-v1.mjs',sha256:sha256(readFileSync(new URL('./original-erv-report-v1.mjs',import.meta.url)))},
    terminalVerdict:'PENDING_INDEPENDENT_ORIGINAL9_ACCEPTANCE',deliveryState:'NOT_DELIVERED_UNTIL_EXACT_REVIEW_CI_MERGE_NEW_RELEASE_PUBLIC_READBACK_AND_CLOSURE',historicalArtifactsUnmodified:true};
  return freeze({...report,reportDigest:digest(report)});
}
export function verifyOriginalErvReportV1(report,trustedDigest) {
  const denied=reasonCode=>({valid:false,reasonCode});
  if(typeof trustedDigest!=='string'||!/^[a-f0-9]{64}$/.test(trustedDigest))return denied('TRUSTED_PRODUCER_DIGEST_REQUIRED');
  try{
    const {reportDigest,...body}=report;
    if(digest(body)!==reportDigest)return denied('REPORT_INTEGRITY_DENIED');
    if(reportDigest!==trustedDigest)return denied('REPORT_SOURCE_FORGERY_DENIED');
    if(canonical(report.pair.reuseReceipt.sourceIdentity)!==canonical(originalExecutionIdentityV1()))return denied('REPLAY_SOURCE_IDENTITY_DENIED');
    const {reuseReceiptDigest,...receipt}=report.pair.reuseReceipt;
    if(digest(receipt)!==reuseReceiptDigest)return denied('REUSE_RECEIPT_INTEGRITY_DENIED');
    for(const variant of ['baseline','modified']){
      const e=report.pair[variant].execution;const {executionDigest,...body}=e;
      if(digest(body)!==executionDigest || canonical(e.sourceIdentity)!==canonical(report.pair.reuseReceipt.sourceIdentity))return denied('VARIANT_INTEGRITY_OR_SOURCE_DENIED');
      if(!verifyTrustedErvUiSourceV1(e.ui,e.uiSourceTrustedDigest).valid)return denied('UI_SOURCE_FORGERY_DENIED');
    }
    if(canonical(report.analytics)!==canonical(projectOriginalErvAnalyticsV1(report.pair)))return denied('ANALYTICS_PROJECTION_DENIED');
    return {valid:true,reasonCode:'EXACT_TRUSTED_PRODUCER_REPORT_VERIFIED'};
  }catch{return denied('REPORT_STRUCTURE_OR_SOURCE_DENIED');}
}
