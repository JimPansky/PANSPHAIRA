// PAN574: additive, two-binding export beside the existing PAN471 inventory.
// Discovery is data only; it never activates a catalogue entry or dispatches.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {types} from 'node:util';
import {planMaterialRequirements} from '../pan522/material-plan.mjs';
import {canonicalJson} from '../../dist/packages/contracts/src/canonical-json.js';
import {syntheticErpOrderProfilesV1, ErpOrderCapabilityCellV1} from '../../dist/packages/contracts/src/erp-order-capability-cell.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = value => sha(canonicalJson(value));
const pin = path => ({path, sha256: sha(readFileSync(new URL('../../' + path, import.meta.url)))});
function descriptor(material) { return {...material, contractDigest: digest(material)}; }

export function discoverPan471CompositionBindings() {
  const common = {
    contractVersion: '1.0.0', contractRevision: 'D1_NOT_RETROACTIVE_D0',
    activationAuthority: false, externalCalls: false,
    errorContract: {keys: ['outcome', 'code'], outcome: 'DENIED', partialResult: false,
      codes: ['AUTHORITY_DENIED','DATA_ONLY_DENIED','CALL_CONTRACT_DENIED','CAPABILITY_UNKNOWN','CONTRACT_DRIFT_DENIED',
        'OPERATION_DENIED','UNIT_DENIED','NATIVE_INPUT_DENIED','NATIVE_READBACK_DENIED','ERP_ORDER_REPLAY_DENIED']},
  };
  const plan = descriptor({...common,
    capabilityId: 'pan522.material.plan', operation: 'PLAN',
    inputContract: {schema: 'pansphaira.pan522/material-plan-input/v1', additionalProperties: false,
      required: ['schema', 'asOf', 'horizonEnd', 'calendars', 'items', 'boms', 'demands', 'stock', 'receipts'],
      validator: 'validatePlanInput', dateWindow: 'UTC_2000_2099_AT_MOST_366_DAYS',
      itemsMaximum: 64, inputFamilyMaximum: 128, peggingRequirementMaximum: 4096,
      nativeDataNodesMaximum: 4096, nativeDataDepthMaximum: 12, nativeDataArrayMaximum: 256,
      tokenPattern: '^[A-Za-z0-9][A-Za-z0-9:-]{0,63}$',
      quantityRules: 'SAFE_INTEGER_0_TO_1000000000_POSITIVE_DEMAND_RECEIPT_COMPONENT_AND_LOT_MULTIPLE',
      calendarRules: 'UNIQUE_UTC_CALENDAR_ID_AND_WEEKDAYS_1_TO_7_EXCLUSIVE_VALID_UNTIL_UNIQUE_VALID_HOLIDAYS',
      identityRules: 'UNIQUE_ITEMS_AND_COMPLETE_SAME_ASOF_STOCK_ROWS_EXPLICIT_SAME_ITEM_REFERENCES_NO_INFERRED_MAP',
      recordKeys: {calendar: ['id','timezone','weekdays','holidays','validFrom','validUntil'],
        item: ['id','stockArticleId','warehouseId','unit','supply','safetyStock','lotMinimum','lotMultiple','leadWorkdays','calendarId'],
        bom: ['parentId','version','validFrom','validUntil','components'], component: ['itemId','unit','quantityPer'],
        demand: ['id','itemId','unit','quantity','dueDate'], stock: ['itemId','unit','physical','reserved','blocked','sourceRevision','observedOn'],
        receipt: ['id','itemId','unit','quantity','dueDate','status']}},
    outputContract: {schema: 'pansphaira.pan522/material-plan-result/v1', additionalProperties: false,
      required: ['schema', 'outcome', 'inputDigest', 'stockContractDigest', 'executionAuthorized', 'capacityQualified', 'sourceInputUnchanged', 'proposals', 'nonclaims'],
      outcome: 'MATERIAL_PROPOSALS_ONLY', executionAuthorized: false, capacityQualified: false,
      recordKeys: {proposal: ['id','itemId','grossQuantity','netQuantity','plannedQuantity','needDate','releaseDate','rootDemandIds',
        'requirementAllocations','plannedAllocations','executionAuthorized','capacityQualified','explanation'],
        explanation: ['bomVersion','bomVersions','selectedBomVersion','stockConsumed','confirmedReceiptsConsumed','safetyStock',
          'safetyShortfall','projectedAvailable','receiptAllocations','excludedReceipts','unit','lotMinimum','lotMultiple','leadWorkdays','calendarId'],
        requirementAllocation: ['requirementId','rootDemandId','rootDemandIds','parentProposalId','bomVersion','allocationKind','quantity'],
        plannedAllocation: ['requirementId','rootDemandId','rootDemandIds','parentProposalId','bomVersion','allocationKind','quantity','coveredQuantity'],
        receiptAllocation: ['receiptId','quantity'], excludedReceipt: ['receiptId','reason']}},
    quantity: {meaning: 'DECLARED_DISCRETE_PIECES', unit: 'STK', minimum: 0, maximum: 1000000000, integer: true},
    identity: {item: 'EXPLICIT_ITEM_ID', stockArticle: 'EXPLICIT_NATIVE_SYN-ART_ID', warehouse: 'EXPLICIT_NATIVE_LAGER_ID',
      allocation: 'ALL_ROOT_AND_PARENT_REQUIREMENT_IDS', inferredMapping: false,
      stockArticlePattern: '^SYN-ART-[A-Z0-9-]{3,28}$', warehousePattern: '^LAGER-[A-Z0-9-]{2,28}$',
      stockSourceRevisionPattern: '^[a-z0-9][a-z0-9-]{2,63}$'},
    effect: 'READ_ONLY_MATERIAL_PROPOSALS', readback: 'ACTUAL_NATIVE_RESULT_AND_UNCHANGED_INPUT',
    idempotence: 'DETERMINISTIC_INPUT_REEVALUATION_NO_DISPATCH', compensation: 'DISABLE_ONLY_NEW_PROPOSAL_VIEW_NO_LEADING_STATE_CHANGE',
    missingSemantics: ['FINITE_CAPACITY', 'PROCUREMENT_AUTHORITY', 'EXTERNAL_RECEIPT_QUALIFICATION', 'AUTOMATIC_STK_TO_EACH_OR_ITEM_TO_SKU_MAPPING'],
    runtimeBinding: {kernelEntry: 'src/pan522/material-plan.mjs', exportName: 'planMaterialRequirements',
      wrapperSourcePath: 'src/pan471/composition-bindings.mjs', wrapperSourceSha256: pin('src/pan471/composition-bindings.mjs').sha256,
      members: ['src/pan522/material-plan.mjs', 'src/pan522/plan-input.mjs', 'packages/contracts/src/bestand-nachschub-v1.ts', 'packages/contracts/src/beschaffung-wareneingang-v1.ts', 'packages/contracts/src/canonical-json.ts', 'dist/packages/contracts/src/bestand-nachschub-v1.js', 'dist/packages/contracts/src/beschaffung-wareneingang-v1.js', 'dist/packages/contracts/src/canonical-json.js'].map(pin)},
  });
  const cell = descriptor({...common,
    capabilityId: 'erp.order.create', operation: 'CREATE_READBACK_COMPENSATING_DELETE',
    inputContract: {additionalProperties: false, required: ['requestId', 'sku', 'quantity'],
      requestIdPattern: '^request:erp-cell-[a-z0-9-]{3,64}$', skuPattern: '^SYN-[A-Z0-9-]{3,28}$'},
    outputContract: {schema: 'cm.capability-cell/erp-order-receipt/v1', additionalProperties: false,
      required: ['schemaVersion', 'outcome', 'actionId', 'actionVersion', 'profileId', 'profileDigest', 'bindingId', 'requestIdDigest', 'requestDigest', 'providerRequestDigest', 'orderId', 'readbackDigest', 'beforeDigest', 'mutationDigest', 'finalDigest', 'effectCount', 'rollbackCount', 'receiptDigest'],
      outcome: 'SYNTHETIC_ORDER_READBACK_AND_ROLLBACK_VERIFIED'},
    quantity: {meaning: 'DECLARED_DISCRETE_UNITS', unit: 'EACH', minimum: 1, maximum: 100, integer: true},
    identity: {request: 'EXACT_NATIVE_REQUEST_ID', sku: 'EXPLICIT_SYNTHETIC_SKU', order: 'NATIVE_PROVIDER_RESPONSE', inferredMapping: false},
    effect: 'SYNTHETIC_MEMORY_CREATE_READBACK_DELETE', readback: 'AUTHORITATIVE_LOCAL_PROVIDER_STATE',
    idempotence: 'REQUEST_ID_REPLAY_DENIED_WITHIN_SAME_CELL', compensation: 'IMMEDIATE_DELETE_FINAL_PROVIDER_STATE_EQUALS_BEFORE',
    missingSemantics: ['PROCUREMENT_ORDER_EQUIVALENCE', 'PERSISTENCE_ACROSS_PROCESS_RESTART', 'CRASH_OR_CONCURRENCY_DURABILITY', 'LIVE_ERP', 'AUTOMATIC_STK_TO_EACH_OR_ITEM_TO_SKU_MAPPING'],
    runtimeBinding: {kernelEntry: 'packages/contracts/src/erp-order-capability-cell.ts', exportName: 'ErpOrderCapabilityCellV1.execute',
      wrapperSourcePath: 'src/pan471/composition-bindings.mjs', wrapperSourceSha256: pin('src/pan471/composition-bindings.mjs').sha256,
      defaultProfileDigest: syntheticErpOrderProfilesV1()[0].profileDigest,
      profileDigests: syntheticErpOrderProfilesV1().map(profile => profile.profileDigest),
      members: ['packages/contracts/src/erp-order-capability-cell.ts', 'packages/contracts/src/capability-catalogue.ts', 'packages/contracts/src/canonical-json.ts', 'dist/packages/contracts/src/erp-order-capability-cell.js', 'dist/packages/contracts/src/capability-catalogue.js', 'dist/packages/contracts/src/canonical-json.js'].map(pin)},
  });
  return {schemaVersion: 'pansphaira.pan471/composition-discovery/v1', outcome: 'DISCOVERED',
    authorityGranted: false, effectAuthorized: false, bindings: [plan, cell]};
}

const denied = code => ({outcome: 'DENIED', code});
function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort());
}
function dataSnapshot(value) {
  const active = new Set(); let count = 0;
  function visit(node, depth = 0) {
    if (++count > 8192 || depth > 16) throw new Error('DATA_ONLY_DENIED');
    if (node === null || typeof node === 'string' || typeof node === 'boolean') return;
    if (typeof node === 'number' && Number.isFinite(node)) return;
    if (typeof node !== 'object' || types.isProxy(node) || active.has(node)) throw new Error('DATA_ONLY_DENIED');
    const array = Array.isArray(node);
    if (Object.getPrototypeOf(node) !== (array ? Array.prototype : Object.prototype)) throw new Error('DATA_ONLY_DENIED');
    const ds = Object.getOwnPropertyDescriptors(node), keys = Reflect.ownKeys(ds);
    for (const key of keys) {
      const row = ds[key];
      if (typeof key !== 'string' || !Object.hasOwn(row, 'value') || row.get || row.set) throw new Error('DATA_ONLY_DENIED');
      if (array && key === 'length') continue;
      if (!row.enumerable) throw new Error('DATA_ONLY_DENIED');
    }
    if (array && (keys.length !== ds.length.value + 1 || ds.length.value > 4096
      || keys.some(key => key !== 'length' && !/^(0|[1-9][0-9]*)$/.test(key)))) throw new Error('DATA_ONLY_DENIED');
    active.add(node);
    for (const key of keys) if (!array || key !== 'length') visit(ds[key].value, depth + 1);
    active.delete(node);
  }
  visit(value); const bytes = canonicalJson(value);
  if (Buffer.byteLength(bytes) > 262144) throw new Error('DATA_ONLY_DENIED');
  return JSON.parse(bytes);
}

// Trusted host constructor, NOT a model tool or remotely registered operation.
// Its controller and opaque grants stay outside model/context/public packets.
// This is netless synthetic native scope, not authentication of a human or a
// sandbox against an untrusted caller already executing in this JS process.
export function createPan471CompositionSession() {
  const baseline = discoverPan471CompositionBindings().bindings;
  const grants = new WeakMap(); let materialInvocations = 0;
  const profiles = syntheticErpOrderProfilesV1();
  const cell = new ErpOrderCapabilityCellV1({profiles, activeProfileDigest: profiles[0].profileDigest});
  function issue(capabilityId) {
    const selected = baseline.find(row => row.capabilityId === capabilityId);
    if (!selected) return denied('CAPABILITY_UNKNOWN');
    const grant = Object.freeze({capabilityId, contractDigest: selected.contractDigest});
    grants.set(grant, selected); return grant;
  }
  function invoke(grant, untrusted) {
    if (!grant || typeof grant !== 'object' || !grants.has(grant)) return denied('AUTHORITY_DENIED');
    let request;
    try { request = dataSnapshot(untrusted); } catch { return denied('DATA_ONLY_DENIED'); }
    if (!exactKeys(request, ['schemaVersion', 'capabilityId', 'contractDigest', 'operation', 'unit', 'input'])
      || request.schemaVersion !== 'pansphaira.pan471/composition-call/v1') return denied('CALL_CONTRACT_DENIED');
    const selected = baseline.find(row => row.capabilityId === request.capabilityId);
    if (!selected) return denied('CAPABILITY_UNKNOWN');
    const held = grants.get(grant);
    if (held.capabilityId !== selected.capabilityId) return denied('AUTHORITY_DENIED');
    let current;
    try { current = discoverPan471CompositionBindings().bindings.find(row => row.capabilityId === selected.capabilityId); }
    catch { return denied('CONTRACT_DRIFT_DENIED'); }
    if (!current || request.contractDigest !== selected.contractDigest || current.contractDigest !== selected.contractDigest) return denied('CONTRACT_DRIFT_DENIED');
    if (request.operation !== selected.operation) return denied('OPERATION_DENIED');
    if (request.unit !== selected.quantity.unit) return denied('UNIT_DENIED');
    let nativeResult;
    if (selected.capabilityId === 'pan522.material.plan') {
      try { nativeResult = planMaterialRequirements(request.input); } catch { return denied('NATIVE_INPUT_DENIED'); }
      if (!exactKeys(nativeResult, selected.outputContract.required)
        || nativeResult.outcome !== selected.outputContract.outcome
        || nativeResult.inputDigest !== digest(request.input)
        || nativeResult.sourceInputUnchanged !== true || nativeResult.executionAuthorized !== false
        || nativeResult.capacityQualified !== false) return denied('NATIVE_READBACK_DENIED');
      materialInvocations++;
    } else {
      const before = cell.evidence();
      try { nativeResult = cell.execute(request.input); } catch (error) {
        return denied(error.message === 'ERP_ORDER_REPLAY_DENIED' ? 'ERP_ORDER_REPLAY_DENIED' : 'NATIVE_INPUT_DENIED');
      }
      const {receiptDigest, ...receiptCore} = nativeResult, after = cell.evidence();
      if (!exactKeys(nativeResult, selected.outputContract.required)
        || nativeResult.outcome !== selected.outputContract.outcome
        || nativeResult.receiptDigest !== digest(receiptCore)
        || nativeResult.requestDigest !== digest(request.input)
        || nativeResult.effectCount !== 1 || nativeResult.rollbackCount !== 1
        || nativeResult.beforeDigest !== nativeResult.finalDigest
        || nativeResult.beforeDigest === nativeResult.mutationDigest
        || after.executions !== before.executions + 1 || after.providerOrderCount !== 0
        || !after.receiptDigests.includes(receiptDigest)) return denied('NATIVE_READBACK_DENIED');
    }
    const result = {schemaVersion: 'pansphaira.pan471/composition-readback/v1', outcome: 'NATIVE_READBACK',
      capabilityId: selected.capabilityId, contractDigest: selected.contractDigest,
      callDigest: digest(request), nativeResult};
    return {...result, resultDigest: digest(result)};
  }
  return {controller: Object.freeze({issue, evidence: () => ({materialInvocations, cell: cell.evidence()})}),
    tools: Object.freeze({discover: discoverPan471CompositionBindings, invoke})};
}

const ORIGINAL_D0_RAW_SHA256 = '0816e0f2601149d88bb386522680653ad4f74ec65a9c17456b36add6723d48e3';
const ORIGINAL_S_RAW_SHA256 = 'b9ea14b9526e7737a705e5cdb1259912e298398756edb1ac6e19c974a1fbd219';
const originalRoot = 'contracts/pan574/original-context-v1/';
function exactOriginalManifest(arm, expectedSha256) {
  const raw = readFileSync(new URL('../../' + originalRoot + arm + '/manifest.json', import.meta.url), 'utf8');
  if (sha(raw) !== expectedSha256) throw new Error('ORIGINAL_CONTEXT_DRIFT_DENIED');
  return {manifest: JSON.parse(raw), manifestBytes: raw, manifestSha256: expectedSha256};
}

// Original selected declarations, frozen before any PAN574 implementation.
// S adds only the eight relevant ORIGINAL sources, not this adapter, public
// examples, tests, solutions, expected-value or independent verifier artifacts.
// D1 dispatch metadata is separate and must never be relabelled original D0.
export function createPan471CompositionHandoff(arm) {
  if (arm !== 'D0' && arm !== 'S') throw new Error('CONTEXT_ARM_DENIED');
  const d0 = exactOriginalManifest('D0', ORIGINAL_D0_RAW_SHA256);
  const members = d0.manifest.members.map(row => {
    const bytes = readFileSync(new URL('../../' + originalRoot + 'D0/' + row.name, import.meta.url), 'utf8');
    if (sha(bytes) !== row.sha256 || Buffer.byteLength(bytes) !== row.bytes) throw new Error('ORIGINAL_CONTEXT_DRIFT_DENIED');
    return {name: row.name, sha256: row.sha256, bytes};
  });
  let originalS = null;
  if (arm === 'S') {
    const s = exactOriginalManifest('S', ORIGINAL_S_RAW_SHA256);
    const sources = s.manifest.relevantSources.map(row => {
      const bytes = readFileSync(new URL('../../' + row.sourcePath, import.meta.url), 'utf8');
      if (sha(bytes) !== row.sha256 || Buffer.byteLength(bytes) !== row.bytes) throw new Error('ORIGINAL_CONTEXT_DRIFT_DENIED');
      return {sourcePath: row.sourcePath, sha256: row.sha256, bytes};
    });
    originalS = {manifestBytes: s.manifestBytes, manifestSha256: s.manifestSha256, sources};
  }
  const packet = {schemaVersion: 'pansphaira.pan471/composition-handoff/v1', contextArm: arm,
    originalD0: {manifestBytes: d0.manifestBytes, manifestSha256: d0.manifestSha256, members}, originalS,
    dispatchContractRevision: 'D1_NOT_RETROACTIVE_D0',
    dispatchBindings: discoverPan471CompositionBindings().bindings.map(row => ({capabilityId: row.capabilityId,
      contractVersion: row.contractVersion, contractDigest: row.contractDigest, operation: row.operation,
      unit: row.quantity.unit, runtimeBinding: row.runtimeBinding})),
    authorityGranted: false, containsReferenceSolution: false, containsExpectedResults: false,
    privateBoundary: 'HOST_CONTROLLER_AND_OPAQUE_GRANTS_MODEL_CREDENTIALS_BUDGETS_AND_ORACLES_ARE_NOT_CONTEXT_OR_PUBLIC_HANDOFF',
    productScope: 'TWO_NATIVE_NETLESS_SYNTHETIC_KERNELS_NO_MODEL_RUN_NO_CONNECTION_NOVELTY_OR_PERSISTENCE_CLAIM'};
  return {...packet, packetDigest: digest(packet)};
}

// Receiver independently selects the arm and rederives all bytes and native
// bindings. Caller self-hashes, descriptions, profile names or extra oracle
// fields never establish source identity or execution authority.
export function verifyPan471CompositionHandoff(untrusted, expectedArm) {
  if (expectedArm !== 'D0' && expectedArm !== 'S') return denied('CONTEXT_ARM_DENIED');
  let packet;
  try { packet = dataSnapshot(untrusted); } catch { return denied('CONTEXT_PACKET_DENIED'); }
  if (packet.contextArm !== expectedArm) return denied('CONTEXT_ARM_DENIED');
  let expected;
  try { expected = createPan471CompositionHandoff(expectedArm); } catch { return denied('ORIGINAL_CONTEXT_DRIFT_DENIED'); }
  if (expectedArm === 'D0' && (packet.originalS !== null
    || canonicalJson(packet.originalD0 ?? null) !== canonicalJson(expected.originalD0))) return denied('D0_SOURCE_LEAK_OR_CONTENT_DRIFT_DENIED');
  if (canonicalJson(packet) !== canonicalJson(expected)) return denied('CONTEXT_PACKET_DENIED');
  return {outcome: 'VERIFIED', packetDigest: expected.packetDigest};
}
