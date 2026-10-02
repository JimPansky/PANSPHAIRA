import assert from 'node:assert/strict';
import test from 'node:test';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { qualifyErvWorkflowSourcesV1 } from '../../src/erv-workflow-evidence/native-evidence-v1.mjs';
const ROOT = resolve('.');
function withCopy(fn) {
  const scratch = process.env.TMPDIR ?? process.env.RUNNER_TEMP;
  assert(scratch && scratch.startsWith('/'));
  const root = mkdtempSync(join(scratch, 'erv-admission-test-'));
  try {
    cpSync(join(ROOT, 'evidence/erv-workflow'), join(root, 'evidence/erv-workflow'), { recursive: true });
    const descriptor = JSON.parse(readFileSync(join(root, 'evidence/erv-workflow/released-kernel-bindings-v1.json')));
    for (const row of descriptor.bindings) { mkdirSync(dirname(join(root, row.path)), { recursive: true }); cpSync(join(ROOT, row.path), join(root, row.path)); }
    fn(root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}
test('source admission qualifies actual22 kernel/build/profile/document files before any probe call', () => {
  const admitted = qualifyErvWorkflowSourcesV1();
  assert.equal(admitted.kernel.bindings.length, 22);
  assert.equal(admitted.manifest.fileCount, 35);
  assert.equal(admitted.catalog.companySizeIsExecutionInput, false);
});
test('caller catalog release labels and rehashed descriptor cannot authorize another source', () => withCopy(root => {
  const p = join(root, 'evidence/erv-workflow/released-kernel-bindings-v1.json');
  const d = JSON.parse(readFileSync(p)); d.releasedBaselineTag = 'caller-minted-release'; writeFileSync(p, JSON.stringify(d));
  assert.throws(() => qualifyErvWorkflowSourcesV1(root), /ERV_KERNEL_DESCRIPTOR_DENIED/);
}));
test('changed product kernel is denied independently of historical catalog labels', () => withCopy(root => {
  const p = join(root, 'src/pan360/original-erv-execution-v1.mjs'); writeFileSync(p, readFileSync(p, 'utf8') + '\n// changed\n');
  assert.throws(() => qualifyErvWorkflowSourcesV1(root), /ERV_KERNEL_FILE_IDENTITY_DENIED/);
}));
test('changed evidence packet fails its original descriptor rather than being silently accepted or retuned', () => withCopy(root => {
  const p = join(root, 'evidence/erv-workflow/reference-v1/scenario-catalog.json'); writeFileSync(p, readFileSync(p, 'utf8') + '\n');
  assert.throws(() => qualifyErvWorkflowSourcesV1(root), /ERV_PACKET_SIZE_DENIED|ERV_PACKET_FILE_IDENTITY_DENIED/);
}));
test('symlink substitution does not authorize a path outside admitted source even if target bytes match', () => withCopy(root => {
  const relative = 'src/pan360/original-erv-core-v1.mjs', p = join(root, relative); rmSync(p); symlinkSync(join(ROOT, relative), p);
  assert.throws(() => qualifyErvWorkflowSourcesV1(root), /ERV_SYMLINK_DENIED/);
}));
