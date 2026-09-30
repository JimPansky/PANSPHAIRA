// PAN463: one native local PostgreSQL DDL adapter, not a new journal/gateway.
// The controller injects the independently retained plan and current grant
// reader. An execution request cannot mint either. Same-UID hostile code, host
// administration and remote databases are outside this isolated synthetic API.
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, unlinkSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import Ajv2020 from 'ajv/dist/2020.js';
import { canonicalJson as canonical, sha256, DemoMutationGate } from '../../demo/runtime/enforcement-gate.mjs';
import { acquireLocalJournalOwner } from '../../demo/runtime/local-journal-owner.mjs';
import { updateDoctorContractDigest } from '../../dist/packages/contracts/src/update-doctor.js';

const schema = JSON.parse(readFileSync(new URL('../../schemas/contracts/pan463-native-update-v1.schema.json', import.meta.url), 'utf8'));
const oldSchema = JSON.parse(readFileSync(new URL('../../schemas/contracts/update-operation-contract-v1.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ strict: true });
ajv.addSchema(oldSchema);
const validatePlan = ajv.compile(schema);
const validateCheck = ajv.compile({ $ref: `${oldSchema.$id}#/$defs/plan` });
const fail = (code) => { throw Error(`PAN463_${code}`); };
const digest = (value) => sha256(canonical(value));
const integer = (value) => Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
function data(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { if (!integer(value)) fail('DATA_DENIED'); return; }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || Object.keys(value).length !== value.length) fail('DATA_DENIED');
    for (const entry of value) data(entry);
    return;
  }
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) fail('DATA_DENIED');
  for (const key of Reflect.ownKeys(value)) {
    const desc = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || ['__proto__','constructor','prototype'].includes(key) || !desc.enumerable || !('value' in desc)) fail('DATA_DENIED');
    data(desc.value);
  }
}
function exact(value, keys) {
  data(value);
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) fail('SHAPE_DENIED');
}
export function nativeUpdatePlanDigestV1(plan) {
  data(plan);
  const { planDigest: _ignored, ...core } = plan;
  return digest(core);
}
function admitted(value) {
  data(value);
  if (value?.checkPlan && !validateCheck(value.checkPlan)) fail('CHECK_PLAN_DENIED');
  if (!validatePlan(value)) fail('NATIVE_PLAN_REQUIRED');
  if (!validateCheck(value.checkPlan)
    || updateDoctorContractDigest(value.checkPlan, 'planDigest') !== value.checkPlan.planDigest) fail('CHECK_PLAN_DENIED');
  if (value.toGeneration !== value.fromGeneration + 1
    || value.checkPlan.fromLockDigest === value.checkPlan.targetLockDigest
    || value.planDigest !== nativeUpdatePlanDigestV1(value)) fail('PLAN_BINDING_DENIED');
  return structuredClone(value);
}
function owned(root, ownedRoot) {
  if (![root, ownedRoot].every((p) => typeof p === 'string' && isAbsolute(p) && resolve(p) === p)
    || basename(root) !== 'pan463-native-v1' || basename(dirname(root)) !== 'pan453-owned-v2') fail('OWNED_ROOT_REQUIRED');
  const rel = relative(ownedRoot, root);
  if (!rel || rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) fail('OWNED_ROOT_REQUIRED');
  let cursor = root;
  while (true) {
    if (!lstatSync(cursor).isDirectory() || lstatSync(cursor).isSymbolicLink()) fail('SYMLINK_DENIED');
    if (cursor === ownedRoot) break;
    cursor = dirname(cursor);
  }
  if (realpathSync(root) !== root || realpathSync(ownedRoot) !== ownedRoot) fail('SYMLINK_DENIED');
  for (const entry of readdirSync(root)) {
    if (!lstatSync(join(root, entry)).isFile() || lstatSync(join(root, entry)).isSymbolicLink()) fail('JOURNAL_PATH_DENIED');
  }
}
// Called only with the database's exclusive session lock already held. Never
// remove a live/unknown owner, never adopt a legacy PAN453 root. PID reuse fails
// closed. The native namespace is new; legacy crash fences remain untouched.
function nativeOwner(root) {
  const marker = join(root, 'operation.lock');
  if (existsSync(marker)) {
    const stat = lstatSync(marker);
    const value = JSON.parse(readFileSync(marker, 'utf8'));
    exact(value, ['pid', 'scope']);
    if (!integer(value.pid) || value.pid < 2 || value.scope !== 'LOCAL_SYNTHETIC_ORDER') fail('OWNER_UNKNOWN_HELD');
    try { process.kill(value.pid, 0); fail('COMPETING_EXECUTOR_DENIED'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
    if (lstatSync(marker).ino !== stat.ino) fail('OWNER_CHANGED_HELD');
    unlinkSync(marker);
  }
  return acquireLocalJournalOwner(root);
}
async function observe(client, plan) {
  const { rows } = await client.query('SELECT * FROM pan463_native_state WHERE installation_id=$1', [plan.installationId]);
  const column = await client.query("SELECT data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='kts_invoices' AND column_name='native_revision_note'");
  if (rows.length !== 1) return { outcome: 'UNKNOWN', reason: 'STATE_UNAVAILABLE' };
  const row = rows[0];
  const pre = row.generation === plan.fromGeneration && row.lock_digest === plan.checkPlan.fromLockDigest
    && row.migration_count === 0 && row.last_operation === null && row.last_plan_digest === null && column.rows.length === 0;
  const post = row.generation === plan.toGeneration && row.lock_digest === plan.checkPlan.targetLockDigest
    && row.migration_count === 1 && row.last_operation === plan.checkPlan.operationId && row.last_plan_digest === plan.planDigest
    && column.rows.length === 1 && column.rows[0].data_type === 'text' && column.rows[0].is_nullable === 'NO'
    && column.rows[0].column_default === "''::text";
  return { outcome: post ? 'APPLIED' : pre ? 'NOT_APPLIED' : 'UNKNOWN', generation: row.generation,
    lockDigest: row.lock_digest, migrationCount: row.migration_count, fence: row.fence,
    lastOperation: row.last_operation, lastPlanDigest: row.last_plan_digest, column: column.rows };
}

export function createNativeUpdateExecutorV1({ root, ownedRoot, database, admittedPlan, readGrant, now = Date.now, observePhase = async () => {} }) {
  const plan = admitted(admittedPlan);
  if (typeof readGrant !== 'function' || typeof now !== 'function' || typeof observePhase !== 'function') fail('CONTROLLER_REQUIRED');
  // No connection string or alternate host/socket/options can broaden this path.
  exact(database, ['host','port','database','user','password']);
  if (database.host !== '127.0.0.1' || !integer(database.port) || database.port < 1024 || database.port > 65535
    || !['database','user','password'].every((k) => typeof database[k] === 'string' && database[k].length > 0)) fail('LOCAL_DATABASE_REQUIRED');
  const connection = structuredClone(database);
  const checkOwned = () => {
    try { owned(root, ownedRoot); }
    catch (error) { if (error.message.startsWith('PAN463_')) throw error; fail('JOURNAL_UNAVAILABLE_HELD'); }
  };
  checkOwned();
  return Object.freeze({ async execute(request) {
    exact(request, ['plan','executorId','fence']);
    admitted(request.plan);
    if (canonical(request.plan) !== canonical(plan)) fail('PAYLOAD_CONFLICT_DENIED');
    if (typeof request.executorId !== 'string' || !/^[a-z][a-z0-9-]{2,63}$/.test(request.executorId)
      || !integer(request.fence) || request.fence < 1) fail('EXECUTOR_BINDING_DENIED');
    let grantBinding, previousTime = -1;
    const checkAuthority = async () => {
      let grant;
      try { grant = await readGrant(); } catch { fail('GRANT_UNAVAILABLE_HELD'); }
      exact(grant, ['grantId','planDigest','executorId','fence','notBeforeMs','expiresAtMs','revoked']);
      if (typeof grant.grantId !== 'string' || !/^[a-z][a-z0-9-]{2,63}$/.test(grant.grantId)
        || grant.planDigest !== plan.planDigest || grant.executorId !== request.executorId) fail('GRANT_BINDING_DENIED');
      if (!integer(grant.fence) || grant.fence !== request.fence) fail('STALE_FENCE_DENIED');
      const time = now();
      if (!integer(time) || time < previousTime || !integer(grant.notBeforeMs) || !integer(grant.expiresAtMs)
        || grant.expiresAtMs <= grant.notBeforeMs) fail('CLOCK_DENIED');
      previousTime = time;
      if (grant.revoked !== false) fail('GRANT_REVOKED_DENIED');
      if (time < grant.notBeforeMs || time >= grant.expiresAtMs) fail('GRANT_EXPIRED_DENIED');
      const current = digest(grant);
      if (grantBinding !== undefined && current !== grantBinding) fail('GRANT_CHANGED_DENIED');
      grantBinding = current;
      return time;
    };
    const admittedAt = await checkAuthority();
    checkOwned();
    const client = new Client({ ...connection, connectionTimeoutMillis: 3000, query_timeout: 5000 });
    client.on('error', () => {});
    let owner, journal, transaction = false, reserved = false;
    const key = plan.checkPlan.operationId;
    const action = { actor:'installer:local-native-update', scope:{ tenant:'local-synthetic',provider:'native-postgres',entity:'InvoiceSchema' }, payload:{body:{ref_client:plan.installationId}} };
    try {
      await client.connect();
      // One bounded installation per database. A second journal path cannot
      // bypass this target-side lock; process death releases it in PostgreSQL.
      const lock = await client.query('SELECT pg_try_advisory_lock(463, 1) AS acquired');
      if (lock.rows[0].acquired !== true) fail('COMPETING_EXECUTOR_DENIED');
      owner = nativeOwner(root);
      const unusedLocalGateSecret = randomBytes(32).toString('hex');
      journal = new DemoMutationGate({ apiToken:unusedLocalGateSecret,controlToken:unusedLocalGateSecret,
        expectedOrigin:'http://127.0.0.1',receiptPath:join(root,'effects.json'),journalOwner:owner.token,provider:{},now });
      await checkAuthority();
      journal.assertEffectControl({action,operationKey:key,reconcileEligible:journal.state.reservations[key]?.status === 'AMBIGUOUS'});
      const prior = journal.state.reservations[key];
      journal.reserveOperation({operationKey:key,action,computedDigest:plan.planDigest,
        authorityBinding:grantBinding,authorityKind:'INSTALLER_APPROVAL_V1',reservedAtMs:admittedAt});
      reserved = true;
      if (prior !== undefined) {
        // A held reservation NEVER dispatches again. Actual target state,
        // rather than a replay callback/receipt, resolves the previous attempt.
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); transaction = true;
        const readback = await observe(client, plan);
        await client.query('COMMIT'); transaction = false;
        await checkAuthority();
        if (readback.fence !== undefined && readback.fence !== request.fence) fail('STALE_FENCE_DENIED');
        if (readback.outcome !== 'APPLIED') return Object.freeze({status:'HELD',outcome:readback.outcome,readback,dispatched:false});
        return complete(readback, true);
      }
      await observePhase('BEFORE_DISPATCH');
      await checkAuthority();
      journal.assertEffectControl({action,operationKey:key,reconcileEligible:false});
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE'); transaction = true;
      await client.query('SET LOCAL lock_timeout = \'1000ms\'');
      await client.query('SET LOCAL synchronous_commit = on');
      await client.query('SELECT installation_id FROM pan463_native_state WHERE installation_id=$1 FOR UPDATE NOWAIT', [plan.installationId]);
      const before = await observe(client, plan);
      if (before.outcome !== 'NOT_APPLIED') fail('GENERATION_OR_TARGET_UNKNOWN_HELD');
      if (before.fence !== request.fence) fail('STALE_FENCE_DENIED');
      // Closed typed step. Neither identifiers nor SQL come from the request.
      await client.query("ALTER TABLE public.kts_invoices ADD COLUMN native_revision_note text NOT NULL DEFAULT ''");
      const changed = await client.query('UPDATE pan463_native_state SET generation=$1,lock_digest=$2,migration_count=migration_count+1,last_operation=$3,last_plan_digest=$4 WHERE installation_id=$5 AND generation=$6 AND fence=$7',
        [plan.toGeneration,plan.checkPlan.targetLockDigest,key,plan.planDigest,plan.installationId,plan.fromGeneration,request.fence]);
      if (changed.rowCount !== 1) fail('GENERATION_OR_FENCE_DENIED');
      await observePhase('DURING_TRANSACTION');
      await checkAuthority();
      journal.assertEffectControl({action,operationKey:key,reconcileEligible:false});
      await client.query('COMMIT'); transaction = false;
      await observePhase('AFTER_COMMIT_BEFORE_RECEIPT');
      await checkAuthority();
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); transaction = true;
      const readback = await observe(client, plan);
      await client.query('COMMIT'); transaction = false;
      await checkAuthority();
      if (readback.outcome !== 'APPLIED' || readback.fence !== request.fence) fail('POSTCONDITION_UNKNOWN_HELD');
      return complete(readback, false);
    } catch (error) {
      if (transaction) { await client.query('ROLLBACK').catch(() => {}); transaction = false; }
      if (reserved) journal.markAmbiguous(key);
      // Do not leak connection strings, credentials or local filesystem paths.
      if (/^(PAN463_|BTH_JOURNAL_|JOURNAL_|REPLAY_|EFFECT_)/.test(error.message)) throw error;
      fail('IO_OR_TARGET_UNAVAILABLE_HELD');
    } finally {
      try { if (owner) owner.release(); }
      catch { fail('OWNER_RELEASE_UNKNOWN_HELD'); }
      finally { await client.end().catch(() => {}); }
    }
    function complete(readback, recovered) {
      journal.assertEffectControl({action,operationKey:key,reconcileEligible:true});
      const core = { schemaVersion:'pansphaira.pan463/native-update-receipt/v1', replayKey:key, actionDigest:plan.planDigest,
        outcome:'LOCAL_NATIVE_UPDATE_READBACK_VERIFIED',readbackDigest:digest(readback),recovered,executionCount:1 };
      const receipt = {...core,receiptDigest:digest(core)};
      journal.state.effects[key] = {actionDigest:plan.planDigest,providerResult:{generation:readback.generation},readback,receipt};
      const reservation = journal.state.reservations[key];
      reservation.status = 'APPLIED'; reservation.recovery = 'NONE';
      try { journal.persist(); }
      catch (error) {
        delete journal.state.effects[key]; reservation.status='AMBIGUOUS'; reservation.recovery='RECONCILE'; throw error;
      }
      return Object.freeze({status:'PASS',outcome:'APPLIED',readback,receipt,dispatched:!recovered});
    }
  }});
}
