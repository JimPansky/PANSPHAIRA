// PAN453 AC04 bounded local synthetic stop/revoke, bounded attempts and bounded
// retention with read-only reconciliation retained. No provider network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BoundTaskHandleIssuer, createSyntheticTrustedTaskSource,
  createOwnedSyntheticBusinessOperation, useBoundTaskHandle,
} from '../../src/pan442/bound-task-handle.mjs';
import { createAuthoritativeApprovalSnapshot } from '../../demo/runtime/authoritative-approval-snapshot.mjs';
import {
  LOCAL_JOURNAL_CONTROL_LIMIT,
  recordLocalJournalControl,
  readLocalJournalControl,
  readLocalJournalRecoveryAttempts,
} from '../../demo/runtime/local-journal-owner.mjs';

const TASK = { taskRef: 'pan442-order-task-0001', runId: 'run:pan442:order:0001', tenant: 'panskys-zoo-demo', user: 'ops:local-demo', object: { provider: 'dolibarr', entity: 'Order', operation: 'CREATE_IF_ABSENT', refClient: 'CM-ADMIN-AI-ESCALATION-001', customerId: 7, orderDateEpoch: 1767225600 }, objectVersion: 1, purpose: 'CREATE_SYNTHETIC_SALES_ORDER', amountLimitMinor: 0, currency: 'EUR', ttlMs: 120000 };
// The exact source/target identity the durable control binds for this composed
// Order mutation (see mutationSourceIdentity / mutationTargetIdentity).
const SOURCE_IDENTITY = `${TASK.tenant}|agent:admin-ai-poc`;
const TARGET_IDENTITY = `${TASK.object.provider}|${TASK.object.entity}|${TASK.object.refClient}`;

function context() {
  const dir = join(mkdtempSync(join(tmpdir(), 'pan453-ac04-')), 'pan453-owned-v2');
  mkdirSync(dir);
  const target = [];
  let mutations = 0;
  let reconcileReads = 0;
  let lose = true;
  const time = 1000000;
  const provider = {
    async readAuthoritativeSnapshot(action) { return createAuthoritativeApprovalSnapshot(action, target); },
    async mutate(action) {
      mutations += 1;
      target.push({ id: 42, date: action.payload.body.date, ref_client: action.payload.body.ref_client, socid: action.payload.body.socid });
      if (lose) { lose = false; throw Error('SYNTHETIC_RESPONSE_LOSS_AFTER_COMMIT'); }
      return { id: 42 };
    },
    async readback(action, result) { return target.find((x) => x.id === result.id) ?? null; },
    async reconcile(action) { reconcileReads += 1; return target.find((x) => x.ref_client === action.payload.body.ref_client) ?? null; },
  };
  const source = createSyntheticTrustedTaskSource({ principal: { user: TASK.user, tenant: TASK.tenant }, tasks: [TASK] });
  const issuer = new BoundTaskHandleIssuer({ taskSource: source, secret: 'synthetic-composed-recovery-123456', now: () => time });
  const { handle } = issuer.createHandle({ taskRef: TASK.taskRef });
  const operationKey = `admin-ai:poc:order:pan442:${JSON.parse(Buffer.from(handle, 'base64url').toString('utf8')).d.slice(0, 40)}`;
  const input = { tenant: TASK.tenant, user: TASK.user, runId: TASK.runId, objectVersion: 1, declaredAmountMinor: 0, currency: 'EUR', object: TASK.object };
  const run = (root = dir) => useBoundTaskHandle({
    issuer, handle, operationInput: input,
    operation: createOwnedSyntheticBusinessOperation({ provider, now: () => time, root }),
  });
  return {
    run, dir, provider, target, issuer, handle, input, operationKey,
    mutations: () => mutations, reconcileReads: () => reconcileReads,
    // A pending (null) reconciliation read that still counts as a provider read.
    pendingReconcile: () => { provider.reconcile = async () => { reconcileReads += 1; return null; }; },
    stop: (overrides = {}) => recordLocalJournalControl(dir, {
      kind: 'STOP', sourceIdentity: SOURCE_IDENTITY, targetIdentity: TARGET_IDENTITY,
      operationKey: null, stopEpoch: 5, issuedAtMs: 1000001, reason: 'LOCAL_SYNTHETIC_STOP', ...overrides,
    }),
    revoke: (overrides = {}) => recordLocalJournalControl(dir, {
      kind: 'REVOKE', sourceIdentity: SOURCE_IDENTITY, targetIdentity: TARGET_IDENTITY,
      operationKey, stopEpoch: 6, issuedAtMs: 1000002, reason: 'LOCAL_SYNTHETIC_REVOKE', ...overrides,
    }),
    close: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test('AC04 permitted counterpart: an unstopped composed operation reconciles read-only with one mutation', async () => {
  const x = context();
  try {
    await assert.rejects(x.run(), /BTH_COMPOSE_FAILED/);
    const result = await x.run();
    assert.equal(result.result.replayState, 'RECONCILE_NO_DUPLICATE');
    assert.equal(x.mutations(), 1);
    assert.equal(x.target.length, 1);
    assert.equal(x.reconcileReads(), 1);
  } finally { x.close(); }
});

test('AC04 stop during unresolved recovery retains safe read-only reconciliation without a new effect', async () => {
  const x = context();
  try {
    await assert.rejects(x.run(), /BTH_COMPOSE_FAILED/);
    x.stop();
    const result = await x.run();
    assert.equal(result.result.replayState, 'RECONCILE_NO_DUPLICATE');
    assert.equal(x.mutations(), 1);
    assert.equal(x.target.length, 1);
    assert.equal(x.reconcileReads(), 1);
  } finally { x.close(); }
});

test('AC04 stop recorded before dispatch refuses the new effect with zero mutations', async () => {
  const x = context();
  try {
    x.stop();
    await assert.rejects(x.run(), /BTH_COMPOSE_FAILED/);
    await assert.rejects(x.run(), /BTH_COMPOSE_FAILED/);
    assert.equal(x.mutations(), 0);
    assert.equal(x.target.length, 0);
    assert.equal(x.reconcileReads(), 0);
  } finally { x.close(); }
});

test('AC04 revoke during unresolved recovery denies even read-only reconciliation', async () => {
  const x = context();
  try {
    await assert.rejects(x.run(), /BTH_COMPOSE_FAILED/);
    x.revoke();
    await assert.rejects(x.run(), /BTH_COMPOSE_FAILED/);
    assert.equal(x.mutations(), 1);
    assert.equal(x.target.length, 1);
    assert.equal(x.reconcileReads(), 0);
  } finally { x.close(); }
});

test('AC04 revoke bound to a different operation key does not block the retained recovery path', async () => {
  const x = context();
  try {
    await assert.rejects(x.run(), /BTH_COMPOSE_FAILED/);
    // A revoke for an unrelated key/identity must not silently stop this one.
    recordLocalJournalControl(x.dir, {
      kind: 'REVOKE', sourceIdentity: 'other-tenant|other-actor', targetIdentity: 'espocrm|Contact|other-ref',
      operationKey: 'admin-ai:poc:order:pan442:unrelated-revoke-0001', stopEpoch: 4, issuedAtMs: 1000000,
      reason: 'LOCAL_SYNTHETIC_REVOKE',
    });
    const result = await x.run();
    assert.equal(result.result.replayState, 'RECONCILE_NO_DUPLICATE');
    assert.equal(x.mutations(), 1);
    assert.equal(x.reconcileReads(), 1);
  } finally { x.close(); }
});

test('AC04 bounded reconcile attempts fail closed after the durable bound without another provider read', async () => {
  const x = context();
  try {
    await assert.rejects(x.run(), /BTH_COMPOSE_FAILED/);
    x.pendingReconcile();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await assert.rejects(x.run(), /BTH_COMPOSE_FAILED/);
    }
    assert.equal(x.reconcileReads(), 3);
    await assert.rejects(x.run(), /BTH_COMPOSE_FAILED/);
    assert.equal(x.reconcileReads(), 3);
    assert.equal(x.mutations(), 1);
    const ledger = readLocalJournalRecoveryAttempts(x.dir);
    assert.equal(ledger.attempts[x.operationKey].attempts, 4);
    const reservation = JSON.parse((await import('node:fs')).readFileSync(join(x.dir, 'effects.json'), 'utf8'));
    assert.deepEqual(Object.values(reservation.reservations).map((r) => r.status), ['AMBIGUOUS']);
  } finally { x.close(); }
});

test('AC04 bounded retention keeps the control ledger bounded and the newest epoch', async () => {
  const x = context();
  try {
    for (let epoch = 1; epoch <= LOCAL_JOURNAL_CONTROL_LIMIT + 6; epoch += 1) {
      recordLocalJournalControl(x.dir, {
        kind: 'STOP', sourceIdentity: `tenant|actor-${epoch}`, targetIdentity: `dolibarr|Order|ref-${epoch}`,
        operationKey: null, stopEpoch: epoch, issuedAtMs: 1000 + epoch, reason: 'LOCAL_SYNTHETIC_STOP',
      });
    }
    const ledger = readLocalJournalControl(x.dir);
    assert.equal(ledger.records.length, LOCAL_JOURNAL_CONTROL_LIMIT);
    assert.equal(Math.max(...ledger.records.map((r) => r.stopEpoch)), LOCAL_JOURNAL_CONTROL_LIMIT + 6);
    assert.equal(ledger.records.filter((r) => r.stopEpoch === LOCAL_JOURNAL_CONTROL_LIMIT + 6).length, 1);
  } finally { x.close(); }
});

test('AC04 an older stop epoch cannot lower a retained control (epoch regression denied)', async () => {
  const x = context();
  try {
    x.stop({ stopEpoch: 9 });
    assert.throws(() => x.stop({ stopEpoch: 3 }), /JOURNAL_CONTROL_EPOCH_REGRESSION_DENIED/);
    assert.equal(readLocalJournalControl(x.dir).records[0].stopEpoch, 9);
  } finally { x.close(); }
});

test('AC04 backup/restore retains the stop control and attempt ledger; restore reconciles read-only', async () => {
  const x = context();
  const restored = join(mkdtempSync(join(tmpdir(), 'pan453-ac04-restore-')), 'pan453-owned-v2');
  try {
    await assert.rejects(x.run(), /BTH_COMPOSE_FAILED/);
    x.stop({ stopEpoch: 9 });
    mkdirSync(restored, { recursive: true });
    for (const file of ['journal-owner.mode', 'approvals.json', 'effects.json', 'journal-control.json']) {
      copyFileSync(join(x.dir, file), join(restored, file));
    }
    // The retained stop travels with the restored journals.
    assert.equal(readLocalJournalControl(restored).records.length, 1);
    assert.equal(readLocalJournalControl(restored).records[0].sourceIdentity, SOURCE_IDENTITY);
    // The restored copy still reconciles read-only against the retained synthetic target.
    const result = await x.run(restored);
    assert.equal(result.result.replayState, 'RECONCILE_NO_DUPLICATE');
    assert.equal(x.mutations(), 1);
    assert.equal(x.target.length, 1);
    assert.equal(x.reconcileReads(), 1);
    // The bounded attempt counter is retained durably in the restored copy.
    assert.equal(readLocalJournalRecoveryAttempts(restored).attempts[x.operationKey].attempts, 1);
  } finally { x.close(); rmSync(restored, { recursive: true, force: true }); }
});
