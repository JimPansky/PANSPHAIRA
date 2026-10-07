import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import test from 'node:test';
import { buildPocGuidedDemoSetupPlanV1, expectedPocGuidedDemoTemplatesV1 } from '../../dist/packages/contracts/src/index.js';
import { PocEarlyAdminCoordinatorV1, createPocEarlyAdminDashboardServerV1 } from '../../dist/packages/setup-coordinator/src/index.js';
import { createOptionalHttpsProductIngressV1, validateHostedOriginV1 } from '../../src/pan527/origin-session-adapter.mjs';

// Pins from delivered fd157e60b4da3ca9f6c4c5ec185c73a28f3650bb, not a new Docker run.
// Actual install/acceptance/readback/purge is separately consumed from hosted CI.
const legacyPins = {
  'demo/install.sh': '747a975556b3755404e98c7e60705906071a0a6c17dc42b6be2a90e407428984',
  'demo/compose.yaml': '0777d35cbed997987ab2bd642c8fd71e7ab17be8437d6a894d653a693382a753',
  'demo/readback.sh': '236dc0f85921126e7fdb400743a6fd8ecd9e8fb44d77dbd9d7ac57ec4f302371',
  'demo/uninstall.sh': 'e72bf4f86af24b0017497dcaca63927c64aab9fa558b83970d1d2d8240b972bb',
  'demo/runtime/server.mjs': '1f2434c8260ddec816138648a4a5115f8e5adf716130e89f6ca4b00b2e41489a',
  'release/public-files.manifest': '8e97726e8ab3798c88458c6d6c3cbe9ad0d014dcf91ace2bcf0191d6e3541142',
};

// The historical manifest pin stays unchanged. PAN529 packages exactly one new
// opt-in runtime library; this reviewed successor does not alter legacy behavior.
const manifestSuccessor = Object.freeze({
  path: 'release/public-files.manifest',
  sha256: '6a05a364fc9e67d015e53e9ee1d5630bb8fc965c9981fbcff9307472a542b986',
  additiveRow: 'demo/runtime/atomic-resource-budget.mjs\tdemo/runtime/atomic-resource-budget.mjs\t0644\n',
});
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
// PAN572 repairs destructive argument dispatch and validates ownership before
// teardown. Keep the historical pin, all other legacy bytes and actual HTTP
// assertions unchanged; this exact self-checked safety delta has separate new
// owned native stop/purge/control evidence, not a replay of the old installer.
const uninstallSafetySuccessor = Object.freeze({
  path: 'demo/uninstall.sh',
  sha256: '4a17a4a0539d8dbc4f550ccf80e1029eaedab0642401cff09e8550bd41d7f0a6',
});
function assertReviewedUninstallSafetySuccessor(bytes) {
  assert.equal(digest(bytes), uninstallSafetySuccessor.sha256, 'Only the exact checked uninstall safety successor is admitted');
}
function assertReviewedManifestSuccessor(bytes) {
  // PAN582 adds only the source-bound README raster, not runtime behavior.
  // Removing that exact row must restore the independently pinned predecessor.
  assert.equal(digest(bytes), 'c664a7f6024dea5350faad5a75558bce3b259536967126177838fb46de4dcf91', 'Only the reviewed manifest successor is admitted');
  const imageRow = 'docs/diagrams/concept-loop.png\tdocs/diagrams/concept-loop.png\t0644\n';
  assert.equal(bytes.toString('utf8').split(imageRow).length, 2);
  bytes = Buffer.from(bytes.toString('utf8').replace(imageRow, ''));
  assert.equal(digest(bytes), manifestSuccessor.sha256, 'Only the reviewed manifest successor is admitted');
  const text = bytes.toString('utf8');
  assert.equal(text.split(manifestSuccessor.additiveRow).length, 2, 'Exactly one explicit runtime library row');
  assert.equal(digest(text.replace(manifestSuccessor.additiveRow, '')), legacyPins[manifestSuccessor.path], 'Removing only that row reproduces the actual historical bytes');
}

test('AC4 legacy loopback selfhosting remains real HTTP without opting into hosted identity', async () => {
  for (const [p, expected] of Object.entries(legacyPins)) {
    const bytes = readFileSync(p);
    if (p === manifestSuccessor.path) assertReviewedManifestSuccessor(bytes);
    else if (p === uninstallSafetySuccessor.path) assertReviewedUninstallSafetySuccessor(bytes);
    else assert.equal(digest(bytes), expected, p);
  }
  const uninstallBytes = readFileSync(uninstallSafetySuccessor.path);
  for (const mutation of [
    Buffer.concat([uninstallBytes, Buffer.from('\n')]),
    Buffer.from(uninstallBytes.toString('utf8').replace('down_args+=(--volumes)', 'down_args=(down --remove-orphans --volumes)')),
    Buffer.from(uninstallBytes.toString('utf8').replace('com.docker.compose.project', 'com.docker.compose.neighbor')),
  ]) assert.throws(() => assertReviewedUninstallSafetySuccessor(mutation), /Only the exact checked uninstall safety successor is admitted/);
  const manifest = readFileSync(manifestSuccessor.path, 'utf8');
  for (const mutation of [
    manifest.replace(manifestSuccessor.additiveRow, ''),
    manifest + manifestSuccessor.additiveRow,
    manifest.replace(manifestSuccessor.additiveRow, manifestSuccessor.additiveRow.replace('atomic-resource-budget', 'neighbor-runtime-library')),
    manifest + 'unexpected.mjs\tunexpected.mjs\t0644\n',
    manifest.replace('demo/runtime/server.mjs', 'demo/runtime/tampered-server.mjs'),
  ]) assert.throws(() => assertReviewedManifestSuccessor(Buffer.from(mutation)), /Only the reviewed manifest successor is admitted/);
  const root = mkdtempSync(join(tmpdir(), 'pan527-legacy-owned-'));
  const showcase = JSON.parse(readFileSync('examples/poc-release/showcase-v1.json', 'utf8'));
  const plan = buildPocGuidedDemoSetupPlanV1(showcase, expectedPocGuidedDemoTemplatesV1(), { templateId: 'quick-tour' });
  const coordinator = new PocEarlyAdminCoordinatorV1(plan, root, { resume: true });
  const server = createPocEarlyAdminDashboardServerV1(coordinator);
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const base = 'http://127.0.0.1:' + server.address().port;
    const initial = await fetch(base + '/api/status');
    assert.equal(initial.status, 200); assert.equal(initial.headers.get('set-cookie'), null);
    assert.equal((await initial.json()).authority.stage, 'STAGE_A_BOOTSTRAP_SUPERVISOR');
    const page = await fetch(base); assert.equal(page.status, 200); assert.match(await page.text(), /PanSphaira local setup/);
    const rights = await (await fetch(base + '/api/effective-rights')).json();
    assert.equal(rights.claim, 'INFORMATIONAL_ONLY_NO_EXECUTABLE_AUTHORITY');
    assert.equal(rights.informationalOnly, true);
    assert.throws(() => validateHostedOriginV1(base), /HOSTED_ORIGIN_DENIED/);
    assert.throws(() => createOptionalHttpsProductIngressV1({ optIn: false }), /HOSTED_OPT_IN/);
    const events = join(root, 'artifacts/poc-guided-demo/playgrounds/quick-tour/dashboard-events.jsonl');
    const before = readFileSync(events, 'utf8');
    const reply = await fetch(base + '/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: 'What is happening?' }) });
    assert.equal(reply.status, 200); await reply.json();
    const after = readFileSync(events, 'utf8'); assert.notEqual(after, before); assert.match(after.slice(before.length), /QUESTION_ANSWERED/);
    // Node's fetch overrides a caller Host header; use the actual raw HTTP seam.
    const foreignStatus = await new Promise((resolve, reject) => {
      const request = httpRequest(base + '/api/status', { headers: { host: 'pan527-not-owned.invalid' } }, response => {
        response.resume(); response.on('end', () => resolve(response.statusCode));
      }); request.on('error', reject); request.end();
    });
    assert.equal(foreignStatus, 403); assert.equal(readFileSync(events, 'utf8'), after);
    const restored = await fetch(base + '/api/status'); assert.equal(restored.status, 200); assert.equal(restored.headers.get('set-cookie'), null);
  } finally { if (server.listening) await new Promise(resolve => server.close(resolve)); rmSync(root, { recursive: true, force: true }); }
});
