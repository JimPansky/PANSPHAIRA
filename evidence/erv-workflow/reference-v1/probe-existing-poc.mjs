// Research harness around actual released PSAi entrypoints. No mock adapters.
// It records primitive coverage and refusals, NOT twelve working human workflows.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const [sourceArg, outArg, catalogArg] = process.argv.slice(2);
assert(sourceArg && outArg && catalogArg, 'Usage: node probe-existing-poc.mjs SOURCE OUTPUT CATALOG');
const source = resolve(sourceArg), out = resolve(outArg);
assert(out !== source && !out.startsWith(source + '/'), 'Evidence stays outside the source snapshot');
await mkdir(out, { recursive: true });
const bytes = await readFile(catalogArg);
const catalog = JSON.parse(bytes);
const hash = value => createHash('sha256').update(value).digest('hex');
const load = relative => import(pathToFileURL(join(source, relative)).href);
const core = await load('src/pan360/original-erv-core-v1.mjs');
const input = await load('src/pan360/original-invoice-input-v1.mjs');
const execution = await load('src/pan360/original-erv-execution-v1.mjs');
const identity = execution.originalExecutionIdentityV1();
const setupInput = execution.originalSetupInputV1();
const setup = execution.runOriginalSetupV1(setupInput);
assert.equal(setup.outcome, 'RESOLVED');
const profile = core.loadOriginalErvProfileV1();
const observations = [];
async function capture(id, surface, invoke) {
  let result, threw = false;
  try { result = await invoke(); }
  catch (error) { threw = true; result = { errorName: error.name, message: error.message }; }
  const row = { id, surface, actualFunctionInvoked: true, threw, result };
  const filename = id + '.json';
  const text = JSON.stringify(row, null, 2) + '\n';
  await writeFile(join(out, filename), text, { flag: 'wx' });
  assert.equal(hash(await readFile(join(out, filename))), hash(text));
  observations.push({ ...row, evidenceFile: filename, evidenceSha256: hash(text) });
  return row;
}
async function variant(id, caseId, documentId = 'high', overrides = {}) {
  return capture(id, 'runOriginalErvVariantV1', () => execution.runOriginalErvVariantV1({
    label: caseId === 'lean-no-po-no-receipt' ? 'BASELINE' : 'MODIFIED',
    caseId, setupInput, configurationDelta: setup.configurationDelta,
    expectedIdentity: identity, request: input.originalInvoiceRequestV1(documentId),
    approvalActors: null, ...overrides,
  }));
}
const lean = await variant('native-lean', 'lean-no-po-no-receipt');
await variant('native-modified-pending', 'three-way-discriminating200');
await variant('native-below', 'threshold-below', 'below');
await variant('native-equal', 'threshold-equal', 'equal');
await variant('native-above', 'threshold-above', 'above');
await variant('native-missing-receipt', 'three-way-missing-receipt');
await variant('native-quantity-conflict', 'three-way-wrong-quantity');
await variant('native-currency-conflict', 'three-way-wrong-currency');
await variant('native-boundary200', 'three-way-boundary200');
await variant('native-outside200', 'three-way-outside200');
await variant('native-synthetic-approval', 'three-way-discriminating200', 'high', {
  approvalActors: { requester: 'synthetic-originator', approver: 'synthetic-independent-approver' },
});
await variant('native-cost-center-actor', 'three-way-discriminating200', 'high', {
  approvalActors: { requester: 'synthetic-originator', approver: 'SYNTH-CC-A-OWNER' },
});
await variant('native-self-actor', 'three-way-discriminating200', 'high', {
  approvalActors: { requester: 'synthetic-originator', approver: 'synthetic-originator' },
});
const base = profile.cases.find(row => row.caseId === 'lean-no-po-no-receipt');
for (const [id, fields] of [
  ['core-cost-center-extra', { costCenter: 'SYNTH-CC-A' }],
  ['core-project-extra', { projectNumber: 'SYNTH-PROJECT-001' }],
  ['core-allocations-extra', { allocations: catalog.scenarios.find(s => s.id === 'ERV-S06').syntheticAllocation.lines }],
  ['core-entity-extra', { legalEntity: 'SYNTH-ENTITY-B' }],
]) {
  await capture(id, 'evaluateOriginalErvCaseV1; added desired business fields', () =>
    core.evaluateOriginalErvCaseV1({ ...structuredClone(base), ...fields }, profile));
}
assert.equal(lean.result.outcome, 'EXECUTED');
await capture('lean-mandatory-approval', 'deriveOriginalApprovalV1; requested always-required approval', () =>
  core.deriveOriginalApprovalV1(lean.result.execution.decision, { scenario: 'LEAN', separateApprovalThresholdMinor: 0 }));
await capture('native-duplicate-intake', 'intakeOriginalInvoiceV1 twice, same actual store; readOriginalInvoiceV1', async () => {
  const store = input.createOriginalInvoiceStoreV1();
  const first = await input.intakeOriginalInvoiceV1(input.originalInvoiceRequestV1('high'), store);
  const second = await input.intakeOriginalInvoiceV1(input.originalInvoiceRequestV1('high'), store);
  const readback = first.outcome === 'ACCEPTED' ? await input.readOriginalInvoiceV1(first.record.version.versionId, store) : null;
  return { first, second, readback, storageLifetime: 'IN_MEMORY_WITHIN_THIS_PROCESS_NOT_DURABLE_OPERATIONAL_STORAGE' };
});
await capture('native-tampered-document', 'intakeOriginalInvoiceV1; altered bytes and recomputed caller claim', async () => {
  const request = input.originalInvoiceRequestV1('high');
  request.bytes = Uint8Array.from(Buffer.concat([Buffer.from(request.bytes), Buffer.from('\nchanged_amount=1\n')]));
  request.claimedSha256 = hash(request.bytes);
  return input.intakeOriginalInvoiceV1(request, input.createOriginalInvoiceStoreV1());
});
for (const [id, fields] of [
  ['intake-cost-center-extra', { costCenter: 'SYNTH-CC-CHANGED' }],
  ['intake-action-extra', { action: 'REQUEST_CLARIFICATION', decisionReason: 'Synthetic missing service confirmation' }],
]) {
  await capture(id, 'intakeOriginalInvoiceV1; desired field/action outside the admitted request contract', () =>
    input.intakeOriginalInvoiceV1({ ...input.originalInvoiceRequestV1('high'), ...fields }, input.createOriginalInvoiceStoreV1()));
}
await capture('native-productive-effect', 'intakeOriginalInvoiceV1; request effect explicitly denied before mutation', () =>
  input.intakeOriginalInvoiceV1({ ...input.originalInvoiceRequestV1('high'), requestedEffects: ['POST_PRODUCTIVE'] }, input.createOriginalInvoiceStoreV1()));
assert.deepEqual(execution.originalExecutionIdentityV1(), identity);
const expectedIds = [...new Set(catalog.scenarios.flatMap(s => s.probeIds))].sort();
assert.deepEqual(observations.map(o => o.id).sort(), expectedIds);
assert.equal(new Set(observations.map(o => o.id)).size, observations.length);
const summary = observations.map(o => ({
  id: o.id, surface: o.surface, threw: o.threw, evidenceFile: o.evidenceFile, evidenceSha256: o.evidenceSha256,
  outcome: o.result.outcome ?? null, reason: o.result.reasonCode ?? o.result.message ?? null,
  decision: o.result.execution?.decision?.outcome ?? null,
  exception: o.result.execution?.decision?.exceptionCode ?? o.result.execution?.decision?.conflict?.conflictKind ?? null,
  approval: o.result.execution?.approval?.state ?? null,
  approvalRecordSource: o.result.execution?.approvalRecord?.actorSource ?? null,
  uiOutputKind: o.result.execution?.uiConsumer ? 'FRAMEWORK_NEUTRAL_DATA_NOT_BROWSER_FORM' : null,
  uiFields: o.result.execution?.ui?.screens?.flatMap(s => s.sections.flatMap(sec => sec.components.filter(c => c.field).map(c => c.field.fieldId))) ?? [],
  duplicate: o.result.second?.reasonCode ?? null,
  storageReadback: o.result.readback?.outcome ?? null,
}));
const report = {
  schemaVersion: 'pansphaira.erv-workflow-scenarios/native-observations/v1',
  sourceCommit: catalog.baseCommit, sourceRelease: catalog.baseRelease,
  catalogSha256: hash(bytes), actualNativeProbeCount: observations.length,
  businessScenarioCount: catalog.scenarios.length, completeHumanBusinessWorkflowsProven: 0,
  noSourceMutation: true, noCustomerInputs: true, noProductionBookingOrPayment: true,
  allProbeIdsCovered: true, sourceIdentity: identity, nativeObservations: summary,
  scenarios: catalog.scenarios.map(s => ({
    id: s.id, companyId: s.companyId, title: s.title,
    disposition: 'PARTIAL_PRIMITIVE_EVIDENCE_NOT_END_TO_END_WORKFLOW',
    nativeProbeIds: s.probeIds, expectedMissingCapabilities: s.expectedMissingCapabilities,
    humanWorkflowVerified: false,
  })),
  interpretation: 'Native outputs above are actually executed. Scenario roles, coding and tasks are proposed requirements, not functions supplied by this harness. Refusals of new fields show the boundary of this specific versioned entrypoint, not a universal absence proof across the entire repository.',
};
await writeFile(join(out, 'native-observations.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ actualNativeProbeCount: observations.length, businessScenarioCount: catalog.scenarios.length, completeHumanBusinessWorkflowsProven: 0, nativeObservations: summary }, null, 2));
