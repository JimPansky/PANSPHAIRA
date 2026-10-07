import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, mkdtempSync, copyFileSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {canonicalJson} from '../../dist/packages/contracts/src/canonical-json.js';
import {syntheticErpOrderProfilesV1} from '../../dist/packages/contracts/src/erp-order-capability-cell.js';

function materialExample() {
  return {schema: 'pansphaira.pan522/material-plan-input/v1', asOf: '2026-10-07', horizonEnd: '2026-10-31',
    calendars: [{id: 'CAL574', timezone: 'UTC', weekdays: [1,2,3,4,5], holidays: [], validFrom: '2026-01-01', validUntil: '2027-01-01'}],
    items: [{id: 'ITEM574', stockArticleId: 'SYN-ART-574', warehouseId: 'LAGER-574', unit: 'STK', supply: 'BUY', safetyStock: 0, lotMinimum: 0, lotMultiple: 1, leadWorkdays: 2, calendarId: 'CAL574'}],
    boms: [], demands: [{id: 'DEMAND574', itemId: 'ITEM574', unit: 'STK', quantity: 17, dueDate: '2026-10-14'}],
    stock: [{itemId: 'ITEM574', unit: 'STK', physical: 4, reserved: 0, blocked: 0, sourceRevision: 'snapshot-574', observedOn: '2026-10-07'}], receipts: []};
}
const envelope = (binding, input) => ({schemaVersion: 'pansphaira.pan471/composition-call/v1',
  capabilityId: binding.capabilityId, contractDigest: binding.contractDigest,
  operation: binding.operation, unit: binding.quantity.unit, input});

const entry = new URL('../../src/pan471/composition-bindings.mjs', import.meta.url);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function bindings() {
  assert.ok(existsSync(entry), 'Existing narrow PAN471 discovery must expose the two actual native bindings, not just inventory-only unavailable create facts.');
  return import(entry.href);
}

test('native discovery names exactly the two bounded kernels with actual source, compiled and profile bindings but no execution grant', async () => {
  const {discoverPan471CompositionBindings} = await bindings();
  const discovery = discoverPan471CompositionBindings();
  assert.equal(discovery.outcome, 'DISCOVERED');
  assert.equal(discovery.authorityGranted, false);
  assert.equal(discovery.effectAuthorized, false);
  assert.deepEqual(discovery.bindings.map(row => row.capabilityId), ['pan522.material.plan', 'erp.order.create']);
  for (const row of discovery.bindings) {
    assert.equal(row.contractVersion, '1.0.0');
    assert.equal(row.contractRevision, 'D1_NOT_RETROACTIVE_D0');
    const {contractDigest, ...material} = row;
    assert.equal(contractDigest, sha(canonicalJson(material)));
    for (const pin of row.runtimeBinding.members) {
      assert.equal(pin.sha256, sha(readFileSync(new URL('../../' + pin.path, import.meta.url))));
    }
  }
  const [plan, cell] = discovery.bindings;
  assert.equal(plan.quantity.unit, 'STK');
  assert.equal(plan.effect, 'READ_ONLY_MATERIAL_PROPOSALS');
  assert.equal(plan.quantity.maximum, 1000000000);
  assert.equal(cell.quantity.unit, 'EACH');
  assert.equal(cell.quantity.maximum, 100);
  assert.deepEqual(cell.runtimeBinding.profileDigests, syntheticErpOrderProfilesV1().map(p => p.profileDigest));
  assert.ok(cell.missingSemantics.includes('PERSISTENCE_ACROSS_PROCESS_RESTART'));
  assert.ok(cell.missingSemantics.includes('PROCUREMENT_ORDER_EQUIVALENCE'));
});

test('an owner-held native session executes the public material example without mutating input or granting procurement authority', async () => {
  const api = await bindings();
  assert.equal(typeof api.createPan471CompositionSession, 'function', 'The published material binding needs an actual bounded native invocation, not metadata alone.');
  const session = api.createPan471CompositionSession();
  const [plan] = api.discoverPan471CompositionBindings().bindings;
  const input = materialExample(), before = canonicalJson(input);
  const grant = session.controller.issue(plan.capabilityId);
  const result = session.tools.invoke(grant, envelope(plan, input));
  assert.equal(result.outcome, 'NATIVE_READBACK');
  assert.equal(result.capabilityId, plan.capabilityId);
  assert.equal(result.nativeResult.outcome, 'MATERIAL_PROPOSALS_ONLY');
  assert.equal(result.nativeResult.proposals.length, 1);
  assert.equal(result.nativeResult.proposals[0].plannedQuantity, 13);
  assert.equal(result.nativeResult.proposals[0].releaseDate, '2026-10-12');
  assert.equal(result.nativeResult.executionAuthorized, false);
  assert.equal(result.nativeResult.capacityQualified, false);
  assert.equal(result.nativeResult.inputDigest, sha(before));
  assert.equal(canonicalJson(input), before);
  const {resultDigest, ...content} = result;
  assert.equal(resultDigest, sha(canonicalJson(content)));
  assert.equal(session.controller.evidence().materialInvocations, 1);
});

test('the public EACH example executes the real native ERP cell with authoritative readback and compensated empty provider state', async () => {
  const api = await bindings(), session = api.createPan471CompositionSession();
  const cell = api.discoverPan471CompositionBindings().bindings[1];
  const input = {requestId: 'request:erp-cell-pan574-native', sku: 'SYN-PAN574', quantity: 13};
  const grant = session.controller.issue(cell.capabilityId);
  const before = canonicalJson(input);
  const result = session.tools.invoke(grant, envelope(cell, input));
  assert.equal(result.outcome, 'NATIVE_READBACK', 'The callable cell export must execute the existing native cell, not deny its declared capability or manufacture a planning-only result.');
  const receipt = result.nativeResult;
  assert.equal(receipt.outcome, 'SYNTHETIC_ORDER_READBACK_AND_ROLLBACK_VERIFIED');
  assert.equal(receipt.profileDigest, cell.runtimeBinding.profileDigests[0]);
  assert.equal(receipt.requestDigest, sha(before));
  assert.equal(receipt.effectCount, 1); assert.equal(receipt.rollbackCount, 1);
  assert.notEqual(receipt.mutationDigest, receipt.beforeDigest);
  assert.equal(receipt.finalDigest, receipt.beforeDigest);
  assert.equal(canonicalJson(input), before);
  const {receiptDigest, ...receiptCore} = receipt;
  assert.equal(receiptDigest, sha(canonicalJson(receiptCore)));
  const observed = session.controller.evidence().cell;
  assert.equal(observed.executions, 1); assert.equal(observed.providerOrderCount, 0);
  assert.deepEqual(observed.receiptDigests, [receipt.receiptDigest]);
});

for (const [name, mutate, code] of [
  ['phantom export', request => {request.capabilityId = 'erp.phantom.export';}, 'CAPABILITY_UNKNOWN'],
  ['stale contract digest', request => {request.contractDigest = '0'.repeat(64);}, 'CONTRACT_DRIFT_DENIED'],
  ['unsupported unit', request => {request.unit = 'KG';}, 'UNIT_DENIED'],
  ['undeclared dispatch operation', request => {request.operation = 'CREATE_PURCHASE_ORDER';}, 'OPERATION_DENIED'],
  ['invalid synthetic request identity', request => {request.input.requestId = 'production-order';}, 'NATIVE_INPUT_DENIED'],
]) test('native export refuses ' + name + ' before any cell effect or partial result', async () => {
  const api = await bindings(), session = api.createPan471CompositionSession();
  const cell = session.tools.discover().bindings[1], grant = session.controller.issue(cell.capabilityId);
  const request = envelope(cell, {requestId: 'request:erp-cell-pan574-denial', sku: 'SYN-PAN574', quantity: 9});
  mutate(request);
  assert.deepEqual(session.tools.invoke(grant, request), {outcome: 'DENIED', code});
  assert.equal(session.controller.evidence().cell.executions, 0);
  assert.equal(session.controller.evidence().cell.providerOrderCount, 0);
  assert.deepEqual(session.controller.evidence().cell.receiptDigests, []);
});

test('catalogue names, model-output grants, copied opaque grants, cross-session grants and absent selectors are not execution authority', async () => {
  const api = await bindings(), session = api.createPan471CompositionSession(), foreign = api.createPan471CompositionSession();
  const cell = session.tools.discover().bindings[1];
  const actual = session.controller.issue(cell.capabilityId);
  const request = envelope(cell, {requestId: 'request:erp-cell-pan574-authority', sku: 'SYN-PAN574', quantity: 9});
  for (const forged of [cell, cell.capabilityId, {profileId: 'SAFE_GUIDED', authorityGranted: true}, {...actual}, JSON.parse(JSON.stringify(actual)), foreign.controller.issue(cell.capabilityId), {}, undefined]) {
    assert.deepEqual(session.tools.invoke(forged, request), {outcome: 'DENIED', code: 'AUTHORITY_DENIED'});
  }
  assert.equal(session.controller.evidence().cell.executions, 0);
  assert.equal(session.tools.invoke(actual, request).outcome, 'NATIVE_READBACK');
  assert.equal(session.controller.evidence().cell.executions, 1);
});

test('native cell request replay remains denied after actual compensated readback in the same owned session', async () => {
  const api = await bindings(), session = api.createPan471CompositionSession();
  const cell = session.tools.discover().bindings[1], grant = session.controller.issue(cell.capabilityId);
  const request = envelope(cell, {requestId: 'request:erp-cell-pan574-replay', sku: 'SYN-PAN574', quantity: 9});
  assert.equal(session.tools.invoke(grant, request).outcome, 'NATIVE_READBACK');
  assert.deepEqual(session.tools.invoke(grant, request), {outcome: 'DENIED', code: 'ERP_ORDER_REPLAY_DENIED'});
  assert.equal(session.controller.evidence().cell.executions, 1);
  assert.equal(session.controller.evidence().cell.replayDenials, 1);
  assert.equal(session.controller.evidence().cell.providerOrderCount, 0);
});

test('unknown input fields, fractional and out-of-range quantities are denied by the real native cell without invented parameters', async () => {
  const api = await bindings(), session = api.createPan471CompositionSession();
  const cell = session.tools.discover().bindings[1], grant = session.controller.issue(cell.capabilityId);
  for (const input of [
    {requestId: 'request:erp-cell-pan574-quantity', sku: 'SYN-PAN574', quantity: 101},
    {requestId: 'request:erp-cell-pan574-quantity', sku: 'SYN-PAN574', quantity: 0},
    {requestId: 'request:erp-cell-pan574-quantity', sku: 'SYN-PAN574', quantity: 1.5},
    {requestId: 'request:erp-cell-pan574-quantity', sku: 'SYN-PAN574', quantity: 9, guessedCustomer: 'UNKNOWN'},
  ]) assert.deepEqual(session.tools.invoke(grant, envelope(cell, input)), {outcome: 'DENIED', code: 'NATIVE_INPUT_DENIED'});
  assert.equal(session.controller.evidence().cell.executions, 0);
});

test('getters, proxies, inherited records and cyclic request data are denied without evaluating caller code or granting effects', async () => {
  const api = await bindings(), session = api.createPan471CompositionSession();
  const cell = session.tools.discover().bindings[1], grant = session.controller.issue(cell.capabilityId);
  const request = envelope(cell, {requestId: 'request:erp-cell-pan574-json', sku: 'SYN-PAN574', quantity: 9});
  let touched = 0;
  const getter = {...request}; Object.defineProperty(getter, 'input', {enumerable: true, get() {touched++; return request.input;}});
  const proxy = new Proxy(request, {ownKeys() {touched++; return Reflect.ownKeys(request);}});
  const inherited = Object.assign(Object.create({authorityGranted: true}), request);
  const cycle = {...request}; cycle.input = cycle;
  for (const bad of [getter, proxy, inherited, cycle]) assert.deepEqual(session.tools.invoke(grant, bad), {outcome: 'DENIED', code: 'DATA_ONLY_DENIED'});
  assert.equal(touched, 0); assert.equal(session.controller.evidence().cell.executions, 0);
});

test('minimal D0 and S handoffs bind the exact preimplementation original manifest bytes and keep native source out of D0', async () => {
  const api = await bindings();
  assert.equal(typeof api.createPan471CompositionHandoff, 'function', 'Loop and external verifier need an exact context-separated handoff, not a reconstructed D0 after implementation.');
  const d0 = api.createPan471CompositionHandoff('D0'), s = api.createPan471CompositionHandoff('S');
  assert.equal(d0.originalD0.manifestSha256, '0816e0f2601149d88bb386522680653ad4f74ec65a9c17456b36add6723d48e3');
  assert.equal(sha(d0.originalD0.manifestBytes), d0.originalD0.manifestSha256);
  assert.equal(s.originalS.manifestSha256, 'b9ea14b9526e7737a705e5cdb1259912e298398756edb1ac6e19c974a1fbd219');
  assert.equal(sha(s.originalS.manifestBytes), s.originalS.manifestSha256);
  assert.deepEqual(s.originalD0, d0.originalD0);
  assert.equal(d0.originalS, null);
  assert.equal(d0.originalD0.members.length, 4);
  assert.equal(s.originalS.sources.length, 8);
  for (const row of d0.originalD0.members) {
    assert.equal(sha(row.bytes), row.sha256);
    assert.doesNotMatch(row.bytes, /export function|function planMaterialRequirements|SYNTHETIC_ORDER_READBACK_AND_ROLLBACK_VERIFIED|ten KIT yields/);
  }
  for (const row of s.originalS.sources) assert.equal(sha(row.bytes), row.sha256);
  assert.equal(d0.authorityGranted, false);
  assert.equal(d0.dispatchContractRevision, 'D1_NOT_RETROACTIVE_D0');
  assert.equal(d0.containsReferenceSolution, false); assert.equal(d0.containsExpectedResults, false);
  for (const packet of [d0,s]) {
    const {packetDigest, ...content} = packet;
    assert.equal(packetDigest, sha(canonicalJson(content)));
  }
});

test('the independently selected context arm refuses source leakage, reference oracles, renamed S and rehashed substituted original descriptions', async () => {
  const api = await bindings();
  assert.equal(typeof api.verifyPan471CompositionHandoff, 'function', 'A self-rehashed public packet must be checked against the original native context, not accepted as its own authority.');
  const d0 = api.createPan471CompositionHandoff('D0'), s = api.createPan471CompositionHandoff('S');
  assert.deepEqual(api.verifyPan471CompositionHandoff(d0, 'D0'), {outcome: 'VERIFIED', packetDigest: d0.packetDigest});
  assert.deepEqual(api.verifyPan471CompositionHandoff(s, 'S'), {outcome: 'VERIFIED', packetDigest: s.packetDigest});
  const sourceLeak = structuredClone(d0); sourceLeak.originalS = structuredClone(s.originalS);
  const descriptionLeak = structuredClone(d0); descriptionLeak.originalD0.members[0].bytes = s.originalS.sources[0].bytes;
  descriptionLeak.originalD0.members[0].sha256 = sha(descriptionLeak.originalD0.members[0].bytes);
  const oracleLeak = {...d0, expectedResult: {plannedQuantity: 13}};
  const renamedS = structuredClone(s); renamedS.contextArm = 'D0';
  const substituted = structuredClone(d0); substituted.originalD0.members[0].bytes += '\nImproved D1 instructions are not original D0.\n';
  substituted.originalD0.members[0].sha256 = sha(substituted.originalD0.members[0].bytes);
  for (const bad of [sourceLeak, descriptionLeak, oracleLeak, renamedS, substituted]) {
    const {packetDigest, ...content} = bad; bad.packetDigest = sha(canonicalJson(content));
    assert.equal(api.verifyPan471CompositionHandoff(bad, 'D0').outcome, 'DENIED');
  }
  assert.equal(api.verifyPan471CompositionHandoff(d0, 'S').outcome, 'DENIED');
  assert.throws(() => api.createPan471CompositionHandoff('D1'), /CONTEXT_ARM_DENIED/);
});

test('the documented source operator executes both committed public examples in a fresh native process and emits actual readbacks', async () => {
  const operator = new URL('../../scripts/run-pan574-composition-contracts.mjs', import.meta.url);
  assert.ok(existsSync(operator), 'Public examples must have an actually executable native source operator, not documentation or a private receipt-only probe.');
  const result = spawnSync(process.execPath, [operator.pathname, 'examples'], {encoding: 'utf8', timeout: 30000});
  assert.equal(result.status, 0, result.stderr); assert.equal(result.signal, null);
  const observed = JSON.parse(result.stdout);
  assert.equal(observed.outcome, 'TWO_NATIVE_EXAMPLES_READ_BACK');
  assert.equal(observed.modelRun, 'NOT_RUN'); assert.equal(observed.newCompositionClaimed, false);
  assert.equal(observed.readbacks.length, 2);
  assert.equal(observed.readbacks[0].nativeResult.proposals[0].plannedQuantity, 13);
  assert.equal(observed.readbacks[1].nativeResult.effectCount, 1);
  assert.equal(observed.readbacks[1].nativeResult.rollbackCount, 1);
  assert.equal(observed.readbacks[1].nativeResult.beforeDigest, observed.readbacks[1].nativeResult.finalDigest);
  assert.equal(observed.nativeEvidence.cell.executions, 1);
  assert.equal(observed.nativeEvidence.cell.providerOrderCount, 0);
  assert.doesNotMatch(result.stdout, /authorityToken|credentialHandle|controller|privateGrant/);
});

test('D1 declarations close every native input record and explicit stock identity/revision constraints without rewriting original D0', async () => {
  const api = await bindings(), [plan, cell] = api.discoverPan471CompositionBindings().bindings;
  assert.ok(plan.inputContract.recordKeys, 'A concrete composition contract must declare nested native fields and the underlying P01 stock revision constraint; top-level names alone are insufficient.');
  assert.deepEqual(plan.inputContract.recordKeys.stock, ['itemId','unit','physical','reserved','blocked','sourceRevision','observedOn']);
  assert.equal(plan.identity.stockSourceRevisionPattern, '^[a-z0-9][a-z0-9-]{2,63}$');
  assert.equal(plan.identity.stockArticlePattern, '^SYN-ART-[A-Z0-9-]{3,28}$');
  assert.equal(plan.identity.warehousePattern, '^LAGER-[A-Z0-9-]{2,28}$');
  assert.ok(plan.outputContract.recordKeys.proposal.includes('plannedAllocations'));
  assert.ok(plan.outputContract.recordKeys.explanation.includes('excludedReceipts'));
  for (const binding of [plan,cell]) {
    assert.deepEqual(binding.errorContract.keys, ['outcome','code']);
    assert.ok(binding.errorContract.codes.includes('CONTRACT_DRIFT_DENIED'));
    assert.ok(binding.errorContract.codes.includes('AUTHORITY_DENIED'));
    assert.ok(binding.errorContract.codes.includes('NATIVE_INPUT_DENIED'));
    assert.equal(binding.errorContract.partialResult, false);
    assert.equal(binding.runtimeBinding.wrapperSourcePath, 'src/pan471/composition-bindings.mjs');
    assert.equal(binding.runtimeBinding.wrapperSourceSha256, sha(readFileSync(entry)));
  }
  assert.equal(cell.runtimeBinding.defaultProfileDigest, syntheticErpOrderProfilesV1()[0].profileDigest);
  assert.ok(plan.runtimeBinding.members.some(row => row.path === 'dist/packages/contracts/src/beschaffung-wareneingang-v1.js'), 'Declared native closure must include the actual transitive stock quantity evaluator; direct imports alone are not an executable binding.');
  assert.ok(plan.runtimeBinding.members.some(row => row.path === 'packages/contracts/src/beschaffung-wareneingang-v1.ts'));
  assert.equal(api.createPan471CompositionHandoff('D0').originalD0.manifestSha256, '0816e0f2601149d88bb386522680653ad4f74ec65a9c17456b36add6723d48e3');
});

test('lost or changed native source identity returns closed drift denial before execution in an invocation-owned source copy', async () => {
  const api = await bindings();
  const scratch = process.env.TMPDIR ?? process.env.RUNNER_TEMP;
  assert.ok(scratch, 'PAN574 test requires explicitly owned TMPDIR or RUNNER_TEMP; no system scratch fallback.');
  const root = mkdtempSync(join(scratch, 'pan574-native-drift-'));
  try {
    const paths = new Set(['package.json','src/pan471/composition-bindings.mjs',
      ...api.discoverPan471CompositionBindings().bindings.flatMap(row => row.runtimeBinding.members.map(member => member.path))]);
    for (const path of paths) {const dest = join(root,path); mkdirSync(dirname(dest),{recursive:true}); copyFileSync(new URL('../../'+path,import.meta.url),dest);}
    const copied = await import(pathToFileURL(join(root,'src/pan471/composition-bindings.mjs')).href);
    const session = copied.createPan471CompositionSession(), binding = session.tools.discover().bindings[0];
    const grant = session.controller.issue(binding.capabilityId), request = envelope(binding,materialExample());
    const wrapper = join(root,'src/pan471/composition-bindings.mjs'), bytes = readFileSync(wrapper);
    writeFileSync(wrapper,Buffer.concat([bytes,Buffer.from('\n// new copy-only source revision\n')]));
    assert.deepEqual(session.tools.invoke(grant,request), {outcome:'DENIED',code:'CONTRACT_DRIFT_DENIED'});
    rmSync(wrapper);
    assert.deepEqual(session.tools.invoke(grant,request), {outcome:'DENIED',code:'CONTRACT_DRIFT_DENIED'}, 'Missing source pins must produce the declared closed error rather than an uncaught filesystem exception.');
    assert.equal(session.controller.evidence().materialInvocations,0);
    assert.equal(session.controller.evidence().cell.executions,0);
  } finally {rmSync(root,{recursive:true,force:true});}
  assert.equal(existsSync(root),false);
});

test('public handoff documentation keeps original context, two examples, trust and effect scope separate', async () => {
  const path = new URL('../../docs/architecture/pan574-composition-bindings-v1.md',import.meta.url);
  assert.ok(existsSync(path), 'The loop and verifier need a public exact interface and private-boundary handoff, not an unpublished implementation note.');
  const text = readFileSync(path,'utf8');
  for (const required of ['D1_NOT_RETROACTIVE_D0','0816e0f2601149d88bb386522680653ad4f74ec65a9c17456b36add6723d48e3',
    'b9ea14b9526e7737a705e5cdb1259912e298398756edb1ac6e19c974a1fbd219','verifyPan471CompositionHandoff',
    'createPan471CompositionSession','controller.issue','SOURCE_EVIDENCE_ONLY','PROCUREMENT_ORDER_EQUIVALENCE',
    'node scripts/run-pan574-composition-contracts.mjs examples','originalS','WeakMap','NOT_RUN','#471','#432','#433']) assert.ok(text.includes(required), required);
  const operator = new URL('../../scripts/run-pan574-composition-contracts.mjs',import.meta.url);
  for (const args of [[],['examples','--input','unknown.json'],['handoff','D1'],['fake-export']]) {
    const result = spawnSync(process.execPath,[operator.pathname,...args],{encoding:'utf8',timeout:30000});
    assert.equal(result.status,2); assert.equal(result.stdout,''); assert.match(result.stderr,/^Usage:/);
  }
  const help = spawnSync(process.execPath,[operator.pathname,'--help'],{encoding:'utf8',timeout:30000});
  assert.equal(help.status,0); assert.match(help.stdout,/^Usage:/);
});

test('native composition regression has an explicit standalone, canonical and unchanged-owner DAG entry', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json',import.meta.url),'utf8'));
  assert.equal(pkg.scripts['pan574:test'], 'TMPDIR="${TMPDIR:-${RUNNER_TEMP:?PAN574_OWNED_SCRATCH_REQUIRED}}" node --test tests/pan471/composition-bindings.test.mjs', 'The original native contract suite must be explicitly registered; local direct Node execution is not canonical coverage.');
  assert.equal(pkg.scripts.test.split(/\s+/).filter(v => v === 'tests/pan471/composition-bindings.test.mjs').length,1);
  const dag = JSON.parse(readFileSync(new URL('../../verification/verification-dag-v2.json',import.meta.url),'utf8'));
  const owner = dag.nodes.find(row => row.id === 'repository-integrity');
  assert.equal(owner.ownedTests.filter(cmd => cmd === 'npm run pan574:test').length,1);
  assert.equal(owner.inputs.filter(row => row.path === 'tests/pan471/composition-bindings.test.mjs' && row.role === 'VALIDATOR').length,1);
  const original = dag.nodes.find(row => row.id === 'pan471-capability-inventory-v1');
  assert.deepEqual(original.ownedTests,['npm run pan471:test']);
  assert.equal(original.inputs.some(row => row.path.includes('composition-bindings')),false);
});
