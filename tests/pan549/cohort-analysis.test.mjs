import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {nativeFixture527} from '../pan527/helpers.mjs';
import {financeFixture} from '../pan519/native-fixture.mjs';
import {UsageInsightsLocalServiceV1,validateUsageInsightsReportV1} from '../../dist/packages/usage-insights/src/index.js';
import {createNativeAnalysisReadAdapterV1} from '../../src/pan549/native-analysis-read.mjs';
import {validateWorkspaceAnalysisResultV1} from '../../dist/packages/contracts/src/workspace-analysis-v1.js';
const selector={schemaVersion:'pansphaira.workspace-analysis/read/v1',objectId:'analysis:common-trade-01:stock',expectedNativeRevision:null,expectedResultRevision:null,asOf:'2026-06-30T23:59:59+02:00'};

for(const enabled of [false,true])test('PUI-08-AC02/03 actual existing local Usage Insights '+(enabled?'single-cohort suppression':'default-off empty report')+' remains distinct from stock; no denominator/adoption or implicit consent/transport',async()=>{
 const tls=await nativeFixture527();let native;
 try{
  native=await financeFixture();const store=join(native.parent,'analysis-usage-state.json');const usage=UsageInsightsLocalServiceV1.open(store);
  if(enabled){usage.grant('basic');assert.equal(usage.record({capabilityId:'capability.gateway',lifecycleOutcome:'INSTALL_STARTED'}).outcome,'ACCEPTED');}
  const before=existsSync(store)?readFileSync(store):null;
  const sessions=tls.gateway.sessionAdapter('tenant-a'),issued=sessions.issueOwnerSession({subjectId:'synthetic:analysis-cohort-reader',role:'reader',expiresAtMs:Date.now()+60000});
  const reader=createNativeAnalysisReadAdapterV1({optIn:true,root:native.root,sessions,usageInsightsStore:store});
  const result=reader.read({cookie:issued.cookieHeader,origin:tls.origin},selector);
  assert.ok(result.cohort,'PAN549_REAL_LOCAL_COHORT_REPORT_NOT_BOUND');
  assert.equal(result.cohort.entrypoint,'packages/usage-insights/src/index.ts#UsageInsightsLocalServiceV1.localReport');
  const report=validateUsageInsightsReportV1(result.cohort.report);
  assert.equal(report.publicationState,enabled?'SUPPRESSED':'EMPTY');assert.equal(report.metrics,null);
  assert.equal(report.installationsSeen,enabled?null:0);assert.equal(report.coverageLabel,'PARTIAL_NON_REPRESENTATIVE_COHORT');
  assert.equal(report.suppressionReason,enabled?'ONE_OR_MORE_COHORTS_BELOW_THRESHOLD':null);
  assert.equal(result.cohort.populationDenominator,null);assert.equal(result.cohort.denominatorState,'UNKNOWN');
  assert.equal(result.effectsProduced,false);assert.equal(result.consentChanged,false);assert.equal(result.transportEnabled,false);
  const actualConsent=usage.consentStatus();assert.equal(actualConsent.state,enabled?'GRANTED':'DISABLED');assert.equal(actualConsent.networkMode,'OFF');
  assert.equal(existsSync(store),enabled);if(enabled)assert.deepEqual(readFileSync(store),before);
  const checked=validateWorkspaceAnalysisResultV1(result,result.binding);assert.deepEqual(checked,result);assert.equal(Object.isFrozen(checked.cohort.report),true);
  for(const change of [v=>{v.cohort.populationDenominator=0;},v=>{v.cohort.report.metrics={adoption:0};},v=>{v.cohort.report.installationsSeen=enabled?1:null;},v=>{v.cohort.report.coverageLabel='ALL_INSTALLATIONS';},v=>{v.effectsProduced=true;}]){
   const hostile=structuredClone(result);change(hostile);assert.throws(()=>validateWorkspaceAnalysisResultV1(hostile,result.binding),/ANALYSIS_RESULT_CONTRACT_DENIED/);
  }
 }finally{native?.close();await tls.close();}
});
