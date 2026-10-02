// Bounded evidence entrypoint: real unchanged PSAi primitives, never a human workflow.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync, readdirSync } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const REFERENCE = 'evidence/erv-workflow/reference-v1/';
export const ERV_RESEARCH_MANIFEST_SHA256_V1 = 'e85842c0e556a269a83310d7902ca4a92868901c52f871a73e19ae5955ba978c';
export const ERV_KERNEL_DESCRIPTOR_SHA256_V1 = '69fa560f18ef1b752b6bc0de5e949221cfe604fa5267638630ba282b3c7c8189';
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export function canonical(value) {
  if (typeof value === 'number') assert(Number.isSafeInteger(value) && !Object.is(value, -0), 'ERV_UNSAFE_CANONICAL_NUMBER_DENIED');
  assert(value !== undefined && !['bigint', 'function', 'symbol'].includes(typeof value), 'ERV_NON_JSON_VALUE_DENIED');
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}
const digest = value => sha256(canonical(value));
const load = path => JSON.parse(readFileSync(path, 'utf8'));
function admittedFile(root, path) {
  assert(typeof path === 'string' && path !== '' && !path.includes('\\') && !path.split('/').some(p => p === '..' || p === '.' || p === '') && !isAbsolute(path), 'ERV_PATH_DENIED');
  const base = realpathSync(root), target = resolve(base, path);
  assert(target.startsWith(base + sep), 'ERV_PATH_DENIED');
  const parts = relative(base, target).split(sep);
  let current = base;
  for (const part of parts) { current = join(current, part); assert(!lstatSync(current).isSymbolicLink(), 'ERV_SYMLINK_DENIED'); }
  assert(lstatSync(target).isFile() && realpathSync(target) === target, 'ERV_FILE_KIND_DENIED');
  return target;
}
export function qualifyErvWorkflowSourcesV1(root = ROOT) {
  const manifestPath = admittedFile(root, REFERENCE + 'packet-manifest.json');
  assert.equal(sha256(readFileSync(manifestPath)), ERV_RESEARCH_MANIFEST_SHA256_V1, 'ERV_MANIFEST_IDENTITY_DENIED');
  const manifest = load(manifestPath);
  assert.equal(manifest.fileCount, 35);
  assert.equal(manifest.files.length, 35);
  assert.equal(new Set(manifest.files.map(x => x.path)).size, 35);
  assert.equal(digest(manifest.files), manifest.fileInventorySha256, 'ERV_INVENTORY_IDENTITY_DENIED');
  for (const row of manifest.files) {
    const bytes = readFileSync(admittedFile(root, REFERENCE + row.path));
    assert.equal(bytes.length, row.bytes, 'ERV_PACKET_SIZE_DENIED:' + row.path);
    assert.equal(sha256(bytes), row.sha256, 'ERV_PACKET_FILE_IDENTITY_DENIED:' + row.path);
  }
  const kernelPath = admittedFile(root, 'evidence/erv-workflow/released-kernel-bindings-v1.json');
  assert.equal(sha256(readFileSync(kernelPath)), ERV_KERNEL_DESCRIPTOR_SHA256_V1, 'ERV_KERNEL_DESCRIPTOR_DENIED');
  const kernel = load(kernelPath);
  assert.equal(kernel.bindings.length, 22);
  assert.equal(new Set(kernel.bindings.map(x => x.path)).size, 22);
  for (const row of kernel.bindings) assert.equal(sha256(readFileSync(admittedFile(root, row.path))), row.sha256, 'ERV_KERNEL_FILE_IDENTITY_DENIED:' + row.path);
  const catalog = load(join(root, REFERENCE, 'scenario-catalog.json'));
  assert.equal(catalog.companySizeIsExecutionInput, false);
  assert.equal(catalog.scenarios.length, 12);
  assert.equal(catalog.companyProfiles.length, 4);
  assert(catalog.scenarios.every(x => x.nativeFullWorkflowSuccessMustNotBeInferred));
  assert.equal(manifest.completeHumanBusinessWorkflowsProven, 0);
  return { manifest, kernel, catalog, kernelSetDigest: digest(kernel.bindings) };
}
export function verifyErvArithmeticV1(expectations) {
  const invoice = BigInt(expectations.invoiceAmountMinor);
  const bps = BigInt(expectations.toleranceBasisPoints);
  const tolerance = invoice * bps / 10000n;
  assert.equal(invoice * bps % 10000n, 0n);
  assert.equal(tolerance, BigInt(expectations.toleranceMinor));
  const on = invoice - BigInt(expectations.onBoundaryReceiptMinor);
  const outside = invoice - BigInt(expectations.outsideBoundaryReceiptMinor);
  assert.equal(on, tolerance);
  assert.equal(outside, tolerance + 1n);
  assert.equal(on, BigInt(expectations.onBoundaryDifferenceMinor));
  assert.equal(outside, BigInt(expectations.outsideDifferenceMinor));
  for (const row of expectations.strictGreaterCases) assert.equal(BigInt(row.amountMinor) > BigInt(expectations.additionalApprovalThresholdMinor), row.extraApprovalRequired);
  const allocation = expectations.grossApprovalAllocation;
  assert.equal(allocation.basis, 'GROSS_APPROVAL_VOLUME_ONLY_NOT_ACCOUNTING_COST');
  let percent = 0n, amount = 0n;
  for (const row of allocation.lines) {
    const rate = BigInt(row.percent), part = BigInt(row.amountMinor);
    assert.equal(BigInt(allocation.amountMinor) * rate, part * 100n);
    percent += rate; amount += part;
  }
  assert.equal(percent, 100n);
  assert.equal(amount, BigInt(allocation.amountMinor));
  return { toleranceMinor: Number(tolerance), onBoundaryDifferenceMinor: Number(on), outsideDifferenceMinor: Number(outside), strictGreaterThresholdVerified: true, allocationSumVerified: true, allocationIsOperationalCoding: false };
}
function semanticActual(id, records, arithmetic) {
  if (id === 'INDEPENDENT_TOLERANCE_AND_ONE_CENT') return [arithmetic.outsideDifferenceMinor, arithmetic.onBoundaryDifferenceMinor];
  if (id === 'SYNTHETIC_NOT_HUMAN_APPROVAL') {
    const record = records.get('native-synthetic-approval').result.execution.approvalRecord;
    return [record.state, record.actorSource, record.bookingAuthorityGranted];
  }
  const row = records.get(id);
  assert(row, 'ERV_UNKNOWN_SEMANTIC_PROBE');
  const r = row.result;
  if (id.startsWith('core-')) return [r.outcome, r.exceptionCode];
  if (id === 'lean-mandatory-approval') return [row.threw, r.message];
  if (id === 'native-duplicate-intake') return [r.first.outcome, r.second.reasonCode, r.readback.outcome];
  if (r.execution) return [r.outcome, r.execution.decision.outcome, r.execution.approval.state];
  return [r.outcome, r.reasonCode];
}
export async function generateErvWorkflowEvidenceV1() {
  // All packet/kernel bytes are checked BEFORE importing/running the native entrypoints.
  const before = qualifyErvWorkflowSourcesV1();
  const scratch = process.env.TMPDIR ?? process.env.RUNNER_TEMP;
  assert(scratch && isAbsolute(scratch) && existsSync(scratch), 'ERV_OWNED_SCRATCH_REQUIRED');
  const owned = await mkdtemp(join(resolve(scratch), 'erv-native-evidence-'));
  const out = join(owned, 'native');
  let report;
  try {
    // A new content-qualified execution, not a relabelled historical Git/release run.
    const executionCatalog = { ...before.catalog, baseCommit: null, baseRelease: null,
      executionSourceKind: 'AUTHENTICATED_CONTENT_FILESET_NOT_GIT_COMMIT_OR_RELEASE_LABEL',
      executionKernelSetDigest: before.kernelSetDigest };
    const catalogPath = join(owned, 'current-run-catalog.json');
    const catalogBytes = JSON.stringify(executionCatalog, null, 2) + '\n';
    await writeFile(catalogPath, catalogBytes, { flag: 'wx', mode: 0o600 });
    const runner = REFERENCE + 'probe-existing-poc.mjs';
    const child = spawnSync(process.execPath, [runner, '.', out, catalogPath], {
      cwd: ROOT, timeout: 240000, maxBuffer: 8 * 1024 * 1024,
      env: { PATH: process.env.PATH ?? '', TMPDIR: owned, LANG: 'C.UTF-8', TZ: 'UTC' },
      encoding: 'utf8',
    });
    assert(!child.error && child.status === 0 && child.signal === null,
      'ERV_REAL_NATIVE_PROBE_EXECUTION_FAILED:' + (child.stderr ?? '') + (child.error?.message ?? ''));
    const native = load(join(out, 'native-observations.json'));
    assert.equal(native.sourceCommit, null);
    assert.equal(native.sourceRelease, null);
    assert.equal(native.actualNativeProbeCount, 23);
    assert.equal(native.completeHumanBusinessWorkflowsProven, 0);
    assert.equal(digest(native.sourceIdentity), digest(load(join(ROOT, REFERENCE, 'native-evidence-v5/native-observations.json')).sourceIdentity));
    const files = readdirSync(out).sort();
    assert.deepEqual(files, [...native.nativeObservations.map(x => x.evidenceFile), 'native-observations.json'].sort());
    const rows = [], recordMap = new Map();
    for (const observation of native.nativeObservations) {
      const bytes = readFileSync(admittedFile(out, observation.evidenceFile));
      assert.equal(sha256(bytes), observation.evidenceSha256);
      const row = JSON.parse(bytes);
      assert.equal(row.id, observation.id);
      assert.equal(row.actualFunctionInvoked, true);
      assert(!recordMap.has(row.id));
      recordMap.set(row.id, row);
      // The admitted immutable historical outputs are compared, not substituted.
      const historicalBytes = readFileSync(join(ROOT, REFERENCE, 'native-evidence-v5', observation.evidenceFile));
      assert.equal(sha256(bytes), sha256(historicalBytes), 'ERV_NATIVE_BEHAVIOR_CHANGED:' + row.id);
      rows.push({ ...row, evidenceSha256: sha256(bytes), unchangedHistoricalResultSha256: sha256(historicalBytes) });
    }
    assert.equal(recordMap.size, 23);
    const expectations = load(join(ROOT, REFERENCE, 'independent-expectations.json'));
    const arithmetic = verifyErvArithmeticV1(expectations);
    const historicalChecks = load(join(ROOT, REFERENCE, 'native-adjudication-v5.json')).checks;
    assert.equal(historicalChecks.length, 25);
    const checks = historicalChecks.map(c => {
      const actual = semanticActual(c.check, recordMap, arithmetic);
      assert.deepEqual(actual, c.expected, 'ERV_SEMANTIC_EXPECTATION_FAILED:' + c.check);
      return { check: c.check, expected: c.expected, actual, state: 'CONFIRMED_BY_NEW_NATIVE_EXECUTION_OR_EXACT_INTEGER_ARITHMETIC' };
    });
    const after = qualifyErvWorkflowSourcesV1();
    assert.equal(after.kernelSetDigest, before.kernelSetDigest);
    const fieldMatrix = load(join(ROOT, REFERENCE, 'workflow-field-role-matrix.json'));
    fieldMatrix.quotes_location = fieldMatrix.quotes_location.replace('sources.json:', 'research-sources.json:');
    assert(fieldMatrix.quotes_location.startsWith('research-sources.json:'));
    const sourceIdentity = {
      kind: 'AUTHENTICATED_CONTENT_FILESET_NOT_GIT_COMMIT_OR_RELEASE_LABEL',
      kernelSetDigest: before.kernelSetDigest, kernelDescriptorSha256: ERV_KERNEL_DESCRIPTOR_SHA256_V1,
      kernelBindings: before.kernel.bindings, researchManifestSha256: ERV_RESEARCH_MANIFEST_SHA256_V1,
      executionCatalogSha256: sha256(catalogBytes), probeRunnerSha256: sha256(readFileSync(join(ROOT, runner))),
      productConsumerSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
      releasedKernelBaseline: { commit: before.kernel.releasedBaselineCommit, release: before.kernel.releasedBaselineTag, qualification: before.kernel.qualification },
      historicalEvidenceRetainedAsHistorical: { commit: before.kernel.historicalNativeCommit, release: before.kernel.historicalNativeTag },
      currentWholeRepositoryCommitAuthenticated: false,
      currentPublishedReleaseAuthenticatedByThisLocalRun: false,
    };
    const unsigned = {
      schemaVersion: 'pansphaira.erv-workflow-evidence/native-product-evidence/v1',
      outcome: 'EXECUTED_SOURCE_BOUND_PRIMITIVE_EVIDENCE_NOT_COMPLETE_HUMAN_WORKFLOWS',
      sourceIdentity, sourceIdentityDigest: digest(sourceIdentity),
      reproductionCommands: ['npm run build', 'npm run erv-workflow:check'],
      exactProbeProgram: { path: runner, sha256: sourceIdentity.probeRunnerSha256, arguments: ['<qualified-source-root>', '<new-owned-evidence-directory>', '<executionCatalog-persisted-below>'], argumentsAreReproductionRecipeNotRetainedTemporaryHostPaths: true },
      executionCatalog, nativeResults: rows, nativeObservations: native,
      semanticChecks: checks, independentArithmetic: arithmetic,
      integratedFieldRoleMatrix: fieldMatrix,
      counts: { researchSources: 18, workflowStages: 12, fieldGroups: 20, roles: 7, businessScenarios: 12, companyContexts: 4, nativeFunctionProbes: rows.length, separateSemanticChecks: checks.length, completeHumanBusinessWorkflowsProven: 0, unexecutedResearchDesignExamples: 8 },
      scenarios: native.scenarios,
      preservedGapsInMeasuredPath: [...new Set(before.catalog.scenarios.flatMap(x => x.expectedMissingCapabilities))].sort(),
      limitations: ['NOT_A_HUMAN_FORM_OR_AUTHENTICATED_HUMAN_APPROVAL', 'FILE_EVIDENCE_NOT_OPERATIONAL_INVOICE_TASK_DATABASE', 'NO_PRODUCTIVE_BOOKING_OR_PAYMENT', 'NO_NEW_COST_CENTER_PROJECT_SPLIT_ROUTING_DEPUTY_OR_REAPPROVAL_FEATURES', 'COMPANY_SIZE_CONTEXT_NOT_AUTOMATIC_POLICY_SELECTOR', 'NATIVE_10000_EUR_GROSS_RULE_SEPARATE_FROM_UNEXECUTED_5000_EUR_NET_RESEARCH_EXAMPLES', 'DENIALS_AND_EXCEPTIONS_ARE_BOUNDARY_EVIDENCE_NOT_SUPPORTED_BUSINESS_FEATURES', 'QUALIFICATION_IS_REUSED_FILESET_CONTENT_NOT_WHOLE_REPOSITORY_OR_HOST_SANDBOX', 'SOURCE_EVIDENCE_ONLY_NOT_RUNNABLE_PRODUCT_DISTRIBUTION'],
      authority: { customerDataAuthorized: false, humanIdentityVerified: false, bookingAuthorized: false, paymentAuthorized: false, newCoreOrFixtureChangesAuthorized: false },
      retainedNativeDenialsAndExceptions: true, unqualifiedAndUnsupportedBusinessCapabilitiesNotPromoted: true,
      ownedScratchCleanup: 'REQUIRED_BEFORE_RETURN',
    };
    report = unsigned;
  } finally { await rm(owned, { recursive: true, force: true }); }
  assert(!existsSync(owned), 'ERV_OWNED_SCRATCH_RESIDUE');
  report.ownedScratchCleanup = 'OWNED_DIRECTORY_REMOVED';
  return { ...report, reportDigest: digest(report) };
}
export function verifyErvWorkflowEvidenceV1(report, trustedDigest) {
  try {
    assert(typeof trustedDigest === 'string' && /^[a-f0-9]{64}$/.test(trustedDigest));
    const { reportDigest, ...unsigned } = report;
    assert.equal(reportDigest, trustedDigest);
    assert.equal(digest(unsigned), trustedDigest);
    assert.equal(report.schemaVersion, 'pansphaira.erv-workflow-evidence/native-product-evidence/v1');
    assert.equal(report.outcome, 'EXECUTED_SOURCE_BOUND_PRIMITIVE_EVIDENCE_NOT_COMPLETE_HUMAN_WORKFLOWS');
    assert.deepEqual(report.counts, { researchSources: 18, workflowStages: 12, fieldGroups: 20, roles: 7, businessScenarios: 12, companyContexts: 4, nativeFunctionProbes: 23, separateSemanticChecks: 25, completeHumanBusinessWorkflowsProven: 0, unexecutedResearchDesignExamples: 8 });
    assert.equal(report.counts.nativeFunctionProbes, 23);
    assert.equal(report.nativeResults.length, 23);
    assert.equal(new Set(report.nativeResults.map(x => x.id)).size, 23);
    assert.equal(report.counts.separateSemanticChecks, 25);
    assert.equal(report.semanticChecks.length, 25);
    assert.equal(report.counts.completeHumanBusinessWorkflowsProven, 0);
    assert.equal(report.nativeObservations.completeHumanBusinessWorkflowsProven, 0);
    assert(report.scenarios.length === 12 && report.scenarios.every(x => x.humanWorkflowVerified === false && x.disposition === 'PARTIAL_PRIMITIVE_EVIDENCE_NOT_END_TO_END_WORKFLOW'));
    assert(Object.values(report.authority).every(x => x === false));
    assert.equal(report.ownedScratchCleanup, 'OWNED_DIRECTORY_REMOVED');
    assert.equal(report.sourceIdentity.researchManifestSha256, ERV_RESEARCH_MANIFEST_SHA256_V1);
    assert.equal(report.sourceIdentity.kernelDescriptorSha256, ERV_KERNEL_DESCRIPTOR_SHA256_V1);
    assert.equal(digest(report.sourceIdentity), report.sourceIdentityDigest);
    assert.equal(report.sourceIdentity.currentWholeRepositoryCommitAuthenticated, false);
    assert.equal(report.sourceIdentity.currentPublishedReleaseAuthenticatedByThisLocalRun, false);
    assert.equal(report.executionCatalog.baseCommit, null);
    assert.equal(report.executionCatalog.baseRelease, null);
    const admitted = qualifyErvWorkflowSourcesV1();
    assert.deepEqual(report.sourceIdentity.kernelBindings, admitted.kernel.bindings);
    assert.equal(report.sourceIdentity.kernelSetDigest, admitted.kernelSetDigest);
    assert.equal(report.sourceIdentity.productConsumerSha256, sha256(readFileSync(fileURLToPath(import.meta.url))));
    const historical = load(join(ROOT, REFERENCE, 'native-evidence-v5/native-observations.json'));
    assert.deepEqual(report.nativeObservations.sourceIdentity, historical.sourceIdentity);
    const expected = load(join(ROOT, REFERENCE, 'native-adjudication-v5.json')).checks;
    const records = new Map(report.nativeResults.map(row => [row.id, row]));
    const arithmetic = verifyErvArithmeticV1(load(join(ROOT, REFERENCE, 'independent-expectations.json')));
    assert.deepEqual(report.independentArithmetic, arithmetic);
    for (const row of report.nativeResults) {
      const { evidenceSha256, unchangedHistoricalResultSha256, ...result } = row;
      const bytes = JSON.stringify(result, null, 2) + '\n';
      assert.equal(row.actualFunctionInvoked, true);
      assert.equal(sha256(bytes), evidenceSha256);
      assert.equal(evidenceSha256, unchangedHistoricalResultSha256);
      assert.equal(evidenceSha256, historical.nativeObservations.find(x => x.id === row.id)?.evidenceSha256);
    }
    for (const [index, c] of expected.entries()) {
      const actual = semanticActual(c.check, records, arithmetic);
      assert.deepEqual(report.semanticChecks[index], { check: c.check, expected: c.expected, actual, state: 'CONFIRMED_BY_NEW_NATIVE_EXECUTION_OR_EXACT_INTEGER_ARITHMETIC' });
      assert.deepEqual(actual, c.expected);
    }
    return { valid: true, reportDigest, sourceQualification: 'CONTENT_BOUND_EXECUTED_PRIMITIVES_ONLY', humanWorkflows: 0, authorityGranted: false };
  } catch { return { valid: false, reasonCode: 'ERV_PRODUCT_EVIDENCE_IDENTITY_OR_NONCLAIM_DENIED', authorityGranted: false }; }
}
