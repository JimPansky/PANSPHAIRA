// Trusted-controller oracle, outside the candidate's writable data boundary.
// Callers supply observations, never a replacement expected-value manifest.
// A matching receipt/HTTP health is not a substitute for these business facts.
import { readFileSync } from 'node:fs';
import { canonicalJson } from '../../demo/runtime/enforcement-gate.mjs';
const facts = JSON.parse(readFileSync(new URL('../../tests/fixtures/pan462/expected-facts-v1.json',import.meta.url),'utf8'));
const same = (a,b) => canonicalJson(a) === canonicalJson(b);
export function verifyRetainedBusinessV1({producer,consumer}, sourceIdentity, {postActivation=false}={}) {
  const reasons = [];
  try {
    if (!producer || !consumer || !Array.isArray(producer.rows)) throw Error();
    const expectedIds = postActivation ? [...facts.order,'rechnung:104'] : facts.order;
    const expectedTotal = facts.totalMinor + (postActivation ? 1234 : 0);
    if (!same(producer.rows.map(row=>row.invoiceId),expectedIds)
      || producer.rows.some(row=>!Number.isSafeInteger(row.amountMinor) || row.amountMinor<0)
      || producer.rows.reduce((sum,row)=>sum+row.amountMinor,0)!==expectedTotal) reasons.push('PRODUCER_BUSINESS_MISMATCH');
    const originalRows = producer.rows.filter(row=>facts.order.includes(row.invoiceId));
    if (!same(originalRows.filter(row=>row.amountMinor<facts.floorEur*100).map(row=>row.invoiceId),facts.belowThreshold)) reasons.push('PRODUCER_THRESHOLD_MISMATCH');
    if (consumer.healthStatus!==200 || consumer.httpStatus!==200) reasons.push('NATIVE_HTTP_UNHEALTHY');
    if (!same(consumer.data,[{total_minor:expectedTotal,invoice_count:expectedIds.length}])) reasons.push('NATIVE_BUSINESS_MISMATCH');
    if (!Number.isSafeInteger(consumer.datasetId) || consumer.datasetId<1
      || !Number.isSafeInteger(consumer.dashboardId) || consumer.dashboardId<1) reasons.push('NATIVE_IDENTITY_UNAVAILABLE');
    if (sourceIdentity && (consumer.datasetId!==sourceIdentity.datasetId || consumer.dashboardId!==sourceIdentity.dashboardId)) reasons.push('RETAINED_IDENTITY_MISMATCH');
    if (consumer.postActivationDashboards!==(postActivation?1:0)) reasons.push('POST_ACTIVATION_WRITE_MISMATCH');
  } catch { reasons.push('OBSERVATION_INVALID'); }
  return Object.freeze({outcome:reasons.length?'DENIED':'PASS',reasonCodes:[...new Set(reasons)]});
}
