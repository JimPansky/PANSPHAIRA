// PAN453 AC01 durable task operation identity: the permitted counterpart and
// the retained same-handle read-only recovery path. Synthetic provider, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BoundTaskHandleIssuer, createSyntheticTrustedTaskSource,
  createOwnedSyntheticBusinessOperation, useBoundTaskHandle,
} from '../../src/pan442/bound-task-handle.mjs';
import { createAuthoritativeApprovalSnapshot } from '../../demo/runtime/authoritative-approval-snapshot.mjs';
import {
  readLocalJournalTaskIdentity, recordLocalJournalTaskIdentity,
} from '../../demo/runtime/local-journal-owner.mjs';

const TASK_1 = { taskRef: 'pan442-order-task-0001', runId: 'run:pan442:order:0001', tenant: 'panskys-zoo-demo', user: 'ops:local-demo', object: { provider: 'dolibarr', entity: 'Order', operation: 'CREATE_IF_ABSENT', refClient: 'CM-ADMIN-AI-ESCALATION-001', customerId: 7, orderDateEpoch: 1767225600 }, objectVersion: 1, purpose: 'CREATE_SYNTHETIC_SALES_ORDER', amountLimitMinor: 0, currency: 'EUR', ttlMs: 120000 };
// A genuinely DIFFERENT original task identity, same supported synthetic Order scope.
const TASK_2 = { ...TASK_1, taskRef: 'pan442-order-task-0002', runId: 'run:pan442:order:0002' };
const SECRET = 'synthetic-composed-recovery-123456';

// The reviewer's stale/lagged-snapshot provider model: the authoritative read
// never observes the committed synthetic target.
function laggingProvider({ loseFirst = true } = {}) {
  const state = { mutations: 0, target: [], targetReads: 0, lost: loseFirst };
  const provider = {
    async readAuthoritativeSnapshot(action) { return createAuthoritativeApprovalSnapshot(action, []); },
    async mutate(action) {
      state.mutations += 1;
      state.target.push({ id: 42, date: action.payload.body.date, ref_client: action.payload.body.ref_client, socid: action.payload.body.socid });
      if (state.lost) { state.lost = false; throw Error('SYNTHETIC_RESPONSE_LOSS_AFTER_COMMIT'); }
      return { id: 42 };
    },
    async readback(action, result) { return state.target.find((x) => x.id === result.id) ?? null; },
    async reconcile(action) { state.targetReads += 1; return state.target.find((x) => x.ref_client === action.payload.body.ref_client) ?? null; },
  };
  return { provider, state };
}

function root() {
  const dir = join(mkdtempSync(join(tmpdir(), 'pan453-ac01-fence-')), 'pan453-owned-v2');
  mkdirSync(dir);
  return dir;
}

function inputFor(task) {
  return { tenant: task.tenant, user: task.user, runId: task.runId, objectVersion: 1, declaredAmountMinor: 0, currency: 'EUR', object: task.object };
}

test('AC01 durable fence: the durable journal binds one handle per immutable task identity before effect', async () => {
  const dir = root();
  let now = 1000000;
  const { provider, state } = laggingProvider();
  const source = createSyntheticTrustedTaskSource({ principal: { user: TASK_1.user, tenant: TASK_1.tenant }, tasks: [TASK_1] });
  const issuer = new BoundTaskHandleIssuer({ taskSource: source, secret: SECRET, now: () => now });
  const run = (handle) => useBoundTaskHandle({ issuer, handle, operationInput: inputFor(TASK_1), operation: createOwnedSyntheticBusinessOperation({ provider, now: () => now, root: dir }) });
  try {
    const first = issuer.createHandle({ taskRef: TASK_1.taskRef });
    await assert.rejects(run(first.handle), /BTH_COMPOSE_FAILED/);
    const recovered = await run(first.handle);
    assert.equal(recovered.result.replayState, 'RECONCILE_NO_DUPLICATE');
    assert.equal(state.mutations, 1);
    assert.equal(state.targetReads, 1);
    // The durable owned journal now binds the immutable task identity to exactly
    // this handle's operation key, written before the effect.
    const ledger = readLocalJournalTaskIdentity(dir);
    const entries = Object.values(ledger.identities);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].handleDigest, first.handleDigest);
    assert.equal(entries[0].operationKey, `admin-ai:poc:order:pan442:${first.handleDigest.slice(0, 40)}`);
    // A reissued valid handle for the SAME immutable task is refused before any
    // further snapshot, approval, lease or provider effect.
    now += 1;
    const second = issuer.createHandle({ taskRef: TASK_1.taskRef });
    assert.notEqual(second.handleDigest, first.handleDigest);
    await assert.rejects(run(second.handle), /BTH_TASK_IDENTITY_REISSUE_DENIED/);
    assert.equal(state.mutations, 1, 'the durable task identity fence prevents a second provider mutation');
    assert.equal(readLocalJournalTaskIdentity(dir).identities[entries[0].taskIdentityDigest].handleDigest, first.handleDigest);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('AC01 permitted counterpart: a genuinely different original task identity may execute when authorized', async () => {
  const dir = root();
  let now = 1000000;
  const { provider, state } = laggingProvider();
  const source = createSyntheticTrustedTaskSource({ principal: { user: TASK_1.user, tenant: TASK_1.tenant }, tasks: [TASK_1, TASK_2] });
  const issuer = new BoundTaskHandleIssuer({ taskSource: source, secret: SECRET, now: () => now });
  const run = (task, handle) => useBoundTaskHandle({ issuer, handle, operationInput: inputFor(task), operation: createOwnedSyntheticBusinessOperation({ provider, now: () => now, root: dir }) });
  try {
    const first = issuer.createHandle({ taskRef: TASK_1.taskRef });
    await assert.rejects(run(TASK_1, first.handle), /BTH_COMPOSE_FAILED/);
    await run(TASK_1, first.handle);
    assert.equal(state.mutations, 1);
    // A different task identity is a distinct durable fence key: it is admitted
    // (its own provider mutation) while the same journal is retained.
    const other = issuer.createHandle({ taskRef: TASK_2.taskRef });
    const result = await run(TASK_2, other.handle);
    assert.equal(result.status, 'PASS');
    assert.equal(state.mutations, 2);
    assert.equal(Object.keys(readLocalJournalTaskIdentity(dir).identities).length, 2);
    // Reissuing the FIRST task's identity is still refused.
    now += 1;
    const reissue = issuer.createHandle({ taskRef: TASK_1.taskRef });
    await assert.rejects(run(TASK_1, reissue.handle), /BTH_TASK_IDENTITY_REISSUE_DENIED/);
    assert.equal(state.mutations, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('AC01 retained counterpart: the same handle keeps the bounded read-only reconciliation path', async () => {
  const dir = root();
  let now = 1000000;
  const { provider, state } = laggingProvider();
  const source = createSyntheticTrustedTaskSource({ principal: { user: TASK_1.user, tenant: TASK_1.tenant }, tasks: [TASK_1] });
  const issuer = new BoundTaskHandleIssuer({ taskSource: source, secret: SECRET, now: () => now });
  const run = (handle) => useBoundTaskHandle({ issuer, handle, operationInput: inputFor(TASK_1), operation: createOwnedSyntheticBusinessOperation({ provider, now: () => now, root: dir }) });
  try {
    const first = issuer.createHandle({ taskRef: TASK_1.taskRef });
    await assert.rejects(run(first.handle), /BTH_COMPOSE_FAILED/);
    // Same handle retried: idempotent re-record, then the existing AMBIGUOUS
    // read-only reconcile path, still exactly one provider mutation.
    const result = await run(first.handle);
    assert.equal(result.result.replayState, 'RECONCILE_NO_DUPLICATE');
    assert.equal(state.mutations, 1);
    assert.equal(readLocalJournalTaskIdentity(dir).identities[Object.keys(readLocalJournalTaskIdentity(dir).identities)[0]].handleDigest, first.handleDigest);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('AC01 fence survives a fresh process-local operation instance (durable, not in-memory)', async () => {
  const dir = root();
  let now = 1000000;
  const { provider, state } = laggingProvider({ loseFirst: false });
  const source = createSyntheticTrustedTaskSource({ principal: { user: TASK_1.user, tenant: TASK_1.tenant }, tasks: [TASK_1] });
  const issuer = new BoundTaskHandleIssuer({ taskSource: source, secret: SECRET, now: () => now });
  const run = (handle) => useBoundTaskHandle({ issuer, handle, operationInput: inputFor(TASK_1), operation: createOwnedSyntheticBusinessOperation({ provider, now: () => now, root: dir }) });
  try {
    const first = issuer.createHandle({ taskRef: TASK_1.taskRef });
    const result = await run(first.handle);
    assert.equal(result.status, 'PASS');
    assert.equal(state.mutations, 1);
    now += 1;
    const second = issuer.createHandle({ taskRef: TASK_1.taskRef });
    // The fence is read from the owned journal, not from the issuer or provider.
    await assert.rejects(run(second.handle), /BTH_TASK_IDENTITY_REISSUE_DENIED/);
    assert.equal(state.mutations, 1);
    const raw = JSON.parse(readFileSync(join(dir, 'journal-task-identity.json'), 'utf8'));
    assert.equal(Object.values(raw.identities)[0].handleDigest, first.handleDigest);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('AC01 durable task-identity ledger refuses a conflicting handle and fails closed before writing', async () => {
  const dir = root();
  const digest = 'a'.repeat(64);
  try {
    const record = recordLocalJournalTaskIdentity(dir, { taskIdentityDigest: digest, operationKey: `admin-ai:poc:order:pan442:${'b'.repeat(40)}`, handleDigest: 'b'.repeat(64), boundAtMs: 1000000 });
    assert.deepEqual(record, { boundAtMs: 1000000, handleDigest: 'b'.repeat(64), operationKey: `admin-ai:poc:order:pan442:${'b'.repeat(40)}`, taskIdentityDigest: digest });
    // Same handle re-records idempotently.
    assert.deepEqual(recordLocalJournalTaskIdentity(dir, { taskIdentityDigest: digest, operationKey: `admin-ai:poc:order:pan442:${'b'.repeat(40)}`, handleDigest: 'b'.repeat(64), boundAtMs: 1000001 }), record);
    // A conflicting (different) handle for the same immutable task is denied and
    // the retained binding is not overwritten.
    assert.throws(() => recordLocalJournalTaskIdentity(dir, { taskIdentityDigest: digest, operationKey: `admin-ai:poc:order:pan442:${'c'.repeat(40)}`, handleDigest: 'c'.repeat(64), boundAtMs: 1000002 }), /JOURNAL_TASK_IDENTITY_CONFLICT_DENIED/);
    assert.equal(readLocalJournalTaskIdentity(dir).identities[digest].handleDigest, 'b'.repeat(64));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
