// Bounded local synthetic journal owner. Persistent opt-in mode prevents exported
// gate/workbench constructors from silently opening the same composed journal.
// NOT an OS sandbox, cross-host lock, or automatic dead-worker recovery.
import { closeSync, existsSync, fsyncSync, fstatSync, mkdirSync, openSync, readFileSync,
  realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
const leases = new WeakMap();
const MODE = 'pansphaira.local/journal-owner/v2\n';
const RESERVED = 'pan453-owned-v2';

// v2 is a separate, named synthetic journal namespace, never adopted from a
// legacy root. A direct entry point refuses even before mode is installed.
export function isOwnedSyntheticPath(path) {
  return path.split(/[\\/]+/).includes(RESERVED);
}


export function acquireLocalJournalOwner(root) {
  if (!isOwnedSyntheticPath(root)) throw Error('JOURNAL_OWNED_NAMESPACE_REQUIRED_DENIED');
  mkdirSync(root,{recursive:true});
  const actual = realpathSync(root);
  if (!isOwnedSyntheticPath(actual)) throw Error('JOURNAL_OWNED_NAMESPACE_REQUIRED_DENIED');
  const mode = join(actual,'journal-owner.mode');
  if(!existsSync(mode) && (existsSync(join(actual,'effects.json')) || existsSync(join(actual,'approvals.json'))))
    throw Error('JOURNAL_UNOWNED_ADOPTION_DENIED');
  try {
    writeFileSync(mode, MODE, {flag:'wx',mode:0o600,flush:true});
    const dirFd=openSync(actual,'r');try{fsyncSync(dirFd);}finally{closeSync(dirFd);}
  } catch(error) {
    if(error?.code!=='EEXIST')throw error;
    if(readFileSync(mode,'utf8')!==MODE)throw Error('JOURNAL_MODE_INVALID_DENIED');
  }
  const marker = join(actual,'operation.lock');
  let fd;
  try { fd=openSync(marker,'wx',0o600); }
  catch(error){ if(error?.code==='EEXIST')throw Error('BTH_JOURNAL_FENCED_DENIED');throw error; }
  const inode=fstatSync(fd).ino;
  const token=Object.freeze({});
  leases.set(token,{root:actual,marker,fd,inode,live:true});
  try { writeFileSync(fd,JSON.stringify({pid:process.pid,scope:'LOCAL_SYNTHETIC_ORDER'}));fsyncSync(fd);
    const dirFd=openSync(actual,'r');try{fsyncSync(dirFd);}finally{closeSync(dirFd);}
  }
  catch(error){ closeSync(fd);unlinkSync(marker);leases.get(token).live=false;throw error; }
  return Object.freeze({token,release() {
    const lease=leases.get(token);
    if(!lease?.live)throw Error('JOURNAL_OWNER_RELEASE_INVALID_DENIED');
    lease.live=false;
    closeSync(fd);
    if(statSync(marker).ino!==inode)throw Error('JOURNAL_OWNER_REPLACED_DENIED');
    unlinkSync(marker);
    const dirFd=openSync(actual,'r');try{fsyncSync(dirFd);}finally{closeSync(dirFd);}
  }});
}

export function assertLocalJournalOwner(receiptPath, token) {
  if (isOwnedSyntheticPath(receiptPath) && token == null)
    throw Error('JOURNAL_OWNER_REQUIRED_DENIED');
  if(!existsSync(dirname(receiptPath)))return;
  const root=realpathSync(dirname(receiptPath));
  const mode=join(root,'journal-owner.mode');
  if (isOwnedSyntheticPath(root) && !existsSync(mode))
    throw Error('JOURNAL_OWNER_REQUIRED_DENIED');
  if(!existsSync(mode))return;
  if(readFileSync(mode,'utf8')!==MODE)throw Error('JOURNAL_MODE_INVALID_DENIED');
  const lease=leases.get(token);
  if(!lease?.live || lease.root!==root || fstatSync(lease.fd).ino!==lease.inode
    || statSync(lease.marker).ino!==lease.inode)throw Error('JOURNAL_OWNER_REQUIRED_DENIED');
}


// ---------------------------------------------------------------------------
// PAN453 AC04 bounded local synthetic stop/revoke control and bounded recovery
// attempt retention, scoped to the owned v2 journal namespace only. This is a
// bounded local synthetic control surface: it binds a source identity, a target
// identity, a monotonically growing stop epoch and the issuing observation. It
// is NOT an OS/host authority, an operator identity provider or a cross-host
// lock. Legacy roots are untouched.
// ---------------------------------------------------------------------------
export const LOCAL_JOURNAL_CONTROL_SCHEMA = 'pansphaira.local/journal-control/v1';
export const LOCAL_JOURNAL_CONTROL_LIMIT = 8;
// Detailed control records are bounded (LOCAL_JOURNAL_CONTROL_LIMIT); every
// admitted control is ALSO retained as a compact per-key denial fence so a
// bounded ledger can never silently drop an active stop/revoke. The fence map
// is itself bounded; admitting a brand-new key once the fence map is saturated
// fails closed (JOURNAL_CONTROL_RETENTION_SATURATED_DENIED) rather than
// evicting a retained active control.
export const LOCAL_JOURNAL_CONTROL_FENCE_LIMIT = 64;
export const LOCAL_JOURNAL_ATTEMPT_SCHEMA = 'pansphaira.local/journal-recovery-attempts/v1';
export const LOCAL_JOURNAL_ATTEMPT_LIMIT = 16;
// A recovery budget is retained durably from the moment it exhausts its allowed
// reads (attempts >= bound), i.e. before the next attempted read can be refused,
// so unrelated operation churn can never renew it. Exhausted/denied entries have
// retention priority inside LOCAL_JOURNAL_ATTEMPT_LIMIT. When that bounded
// ledger can no longer durably retain the counter it was asked to record, or
// would have to evict an already-exhausted counter to admit churn, it fails
// closed (JOURNAL_ATTEMPT_RETENTION_SATURATED_DENIED) instead of silently
// resetting the per-operation budget.

const CONTROL_FILE = 'journal-control.json';
const ATTEMPT_FILE = 'journal-recovery-attempts.json';
const CONTROL_KEYS = Object.freeze([
  'issuedAtMs','kind','operationKey','reason','sourceIdentity','stopEpoch','targetIdentity',
]);

function emptyControl() {
  return { schemaVersion: LOCAL_JOURNAL_CONTROL_SCHEMA, records: [], fences: {} };
}

function emptyAttempts() {
  return { schemaVersion: LOCAL_JOURNAL_ATTEMPT_SCHEMA, attempts: {} };
}

function isBoundIdentity(value) {
  return typeof value === 'string' && value.length >= 1 && value.length <= 256;
}

function controlKey(record) {
  return record.kind === 'REVOKE'
    ? `REVOKE|${record.operationKey}`
    : `STOP|${record.sourceIdentity}|${record.targetIdentity}`;
}

function validateControlRecord(record) {
  if (
    record === null
    || typeof record !== 'object'
    || Array.isArray(record)
    || !['STOP', 'REVOKE'].includes(record.kind)
    || Object.keys(record).sort().join('|') !== [...CONTROL_KEYS].sort().join('|')
    || !isBoundIdentity(record.sourceIdentity)
    || !isBoundIdentity(record.targetIdentity)
    || (record.kind === 'REVOKE'
      ? (typeof record.operationKey !== 'string' || record.operationKey.length < 8)
      : record.operationKey !== null)
    || !Number.isSafeInteger(record.stopEpoch)
    || record.stopEpoch < 1
    || !Number.isSafeInteger(record.issuedAtMs)
    || record.issuedAtMs < 0
    || typeof record.reason !== 'string'
    || record.reason.length < 1
    || record.reason.length > 120
  ) throw Error('JOURNAL_CONTROL_INVALID_DENIED');
}

// Bounded retention: the ledger retains at most `limit` detailed records,
// dropping the oldest by (stopEpoch, issuedAtMs) first. Dropping a *detail*
// record is safe only because the durable per-key fence (see
// LOCAL_JOURNAL_CONTROL_FENCE_LIMIT) keeps the control binding: the control
// window never ends under unrelated churn, and the monotonic stop epoch for a
// key survives even after its detail record is pruned.
function pruneControlRecords(records, limit) {
  if (records.length <= limit) return records;
  return [...records]
    .sort((left, right) => (left.stopEpoch - right.stopEpoch) || (left.issuedAtMs - right.issuedAtMs))
    .slice(records.length - limit);
}

function readOwnedJson(root, file, empty, invalid) {
  if (!existsSync(root)) return empty();
  const actual = realpathSync(root);
  const path = join(actual, file);
  if (!existsSync(path)) return empty();
  const value = JSON.parse(readFileSync(path, 'utf8'));
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw Error(invalid);
  return value;
}

function writeOwnedJson(root, file, value) {
  const path = join(root, file);
  const temp = `${path}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flush: true });
  renameSync(temp, path);
  const dirFd = openSync(root, 'r');
  try { fsyncSync(dirFd); } finally { closeSync(dirFd); }
}

function assertOwnedRoot(root) {
  if (!isOwnedSyntheticPath(root)) throw Error('JOURNAL_OWNED_NAMESPACE_REQUIRED_DENIED');
  mkdirSync(root, { recursive: true });
  const actual = realpathSync(root);
  if (!isOwnedSyntheticPath(actual)) throw Error('JOURNAL_OWNED_NAMESPACE_REQUIRED_DENIED');
  return actual;
}

export function readLocalJournalControl(root) {
  if (!isOwnedSyntheticPath(root)) throw Error('JOURNAL_OWNED_NAMESPACE_REQUIRED_DENIED');
  const value = readOwnedJson(root, CONTROL_FILE, emptyControl, 'JOURNAL_CONTROL_INVALID_DENIED');
  if (value.schemaVersion !== LOCAL_JOURNAL_CONTROL_SCHEMA || !Array.isArray(value.records)) {
    throw Error('JOURNAL_CONTROL_INVALID_DENIED');
  }
  const rawFences = value.fences ?? {};
  if (rawFences === null || typeof rawFences !== 'object' || Array.isArray(rawFences)) {
    throw Error('JOURNAL_CONTROL_INVALID_DENIED');
  }
  const records = value.records.map((record) => {
    validateControlRecord(record);
    return { ...record };
  });
  const fences = {};
  for (const [key, fence] of Object.entries(rawFences)) {
    validateControlRecord(fence);
    if (controlKey(fence) !== key) throw Error('JOURNAL_CONTROL_INVALID_DENIED');
    fences[key] = { ...fence };
  }
  return {
    schemaVersion: LOCAL_JOURNAL_CONTROL_SCHEMA,
    records,
    fences,
    saturated: Object.keys(fences).length >= LOCAL_JOURNAL_CONTROL_FENCE_LIMIT,
  };
}

export function recordLocalJournalControl(root, record) {
  validateControlRecord(record);
  const actual = assertOwnedRoot(root);
  const current = readLocalJournalControl(actual);
  const key = controlKey(record);
  const fence = current.fences[key];
  const recordMax = current.records
    .filter((existing) => controlKey(existing) === key)
    .reduce((max, existing) => Math.max(max, existing.stopEpoch), 0);
  const retainedMax = Math.max(fence?.stopEpoch ?? 0, recordMax);
  if (retainedMax >= record.stopEpoch) throw Error('JOURNAL_CONTROL_EPOCH_REGRESSION_DENIED');
  if (fence === undefined && Object.keys(current.fences).length >= LOCAL_JOURNAL_CONTROL_FENCE_LIMIT) {
    throw Error('JOURNAL_CONTROL_RETENTION_SATURATED_DENIED');
  }
  const next = {
    schemaVersion: LOCAL_JOURNAL_CONTROL_SCHEMA,
    records: pruneControlRecords([...current.records, { ...record }], LOCAL_JOURNAL_CONTROL_LIMIT),
    fences: { ...current.fences, [key]: { ...record } },
  };
  writeOwnedJson(actual, CONTROL_FILE, next);
  return next;
}

export function readLocalJournalRecoveryAttempts(root) {
  if (!isOwnedSyntheticPath(root)) throw Error('JOURNAL_OWNED_NAMESPACE_REQUIRED_DENIED');
  const value = readOwnedJson(root, ATTEMPT_FILE, emptyAttempts, 'JOURNAL_ATTEMPT_INVALID_DENIED');
  if (
    value.schemaVersion !== LOCAL_JOURNAL_ATTEMPT_SCHEMA
    || value.attempts === null
    || typeof value.attempts !== 'object'
    || Array.isArray(value.attempts)
  ) throw Error('JOURNAL_ATTEMPT_INVALID_DENIED');
  const attempts = {};
  for (const [operationKey, record] of Object.entries(value.attempts)) {
    if (
      record === null
      || typeof record !== 'object'
      || Array.isArray(record)
      || !['attempts', 'firstAttemptMs', 'lastAttemptMs'].every((key) => Object.hasOwn(record, key))
      || Object.keys(record).some((key) => !['attempts', 'firstAttemptMs', 'lastAttemptMs', 'denied', 'exhausted'].includes(key))
      || (record.denied !== undefined && typeof record.denied !== 'boolean')
      || (record.exhausted !== undefined && typeof record.exhausted !== 'boolean')
      || !Number.isSafeInteger(record.attempts)
      || record.attempts < 1
      || !Number.isSafeInteger(record.firstAttemptMs)
      || !Number.isSafeInteger(record.lastAttemptMs)
    ) throw Error('JOURNAL_ATTEMPT_INVALID_DENIED');
    attempts[operationKey] = { ...record };
  }
  return { schemaVersion: LOCAL_JOURNAL_ATTEMPT_SCHEMA, attempts };
}

export function recordLocalJournalRecoveryAttempt(root, { operationKey, attemptedAtMs, maxAttempts }) {
  if (!isBoundIdentity(operationKey)) throw Error('JOURNAL_ATTEMPT_INVALID_DENIED');
  if (!Number.isSafeInteger(attemptedAtMs) || attemptedAtMs < 0) throw Error('JOURNAL_ATTEMPT_INVALID_DENIED');
  if (maxAttempts !== undefined && (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1)) {
    throw Error('JOURNAL_ATTEMPT_INVALID_DENIED');
  }
  const actual = assertOwnedRoot(root);
  const current = readLocalJournalRecoveryAttempts(actual);
  const prior = current.attempts[operationKey];
  const attempts = (prior?.attempts ?? 0) + 1;
  // A counter has exhausted its allowed reads the moment it reaches the bound:
  // the very next call is refused. That boundary must be retained durably BEFORE
  // the next attempted read, because until the refusal is materialized the
  // counter still looks like ordinary churn to bounded retention -- and would be
  // evicted by unrelated keys, restarting the budget for a later fourth read.
  // `exhausted` marks the budget boundary durably; `denied` marks an actually
  // refused call. Both are retention-protected and neither is renewable.
  const exhausted = prior?.exhausted === true
    || (Number.isSafeInteger(maxAttempts) && attempts >= maxAttempts);
  const denied = prior?.denied === true
    || (Number.isSafeInteger(maxAttempts) && attempts > maxAttempts);
  const record = {
    attempts,
    firstAttemptMs: prior?.firstAttemptMs ?? attemptedAtMs,
    lastAttemptMs: attemptedAtMs,
    denied,
    exhausted,
  };
  // Exhausted/denied counters sort last so bounded retention drops only
  // non-exhausted churn; a per-operation counter that has already used its
  // allowed reads is never displaced by unrelated keys.
  const isProtected = (entry) => entry.exhausted === true || entry.denied === true;
  const entries = Object.entries({ ...current.attempts, [operationKey]: record })
    .sort((left, right) => ((isProtected(left[1]) ? 1 : 0) - (isProtected(right[1]) ? 1 : 0))
      || (left[1].lastAttemptMs - right[1].lastAttemptMs)
      || left[0].localeCompare(right[0], 'en'));
  const retained = entries.length > LOCAL_JOURNAL_ATTEMPT_LIMIT
    ? entries.slice(entries.length - LOCAL_JOURNAL_ATTEMPT_LIMIT)
    : entries;
  const retainedKeys = new Set(retained.map(([key]) => key));
  // Bounded storage must never silently drop the counter it was asked to make
  // durable, and it must never evict an already-exhausted/denied counter to
  // admit churn. If the bounded ledger cannot retain both, fail closed rather
  // than reset a budget on a later attempt.
  if (!retainedKeys.has(operationKey)) {
    throw Error('JOURNAL_ATTEMPT_RETENTION_SATURATED_DENIED');
  }
  for (const [key, existing] of Object.entries(current.attempts)) {
    if (key !== operationKey && isProtected(existing) && !retainedKeys.has(key)) {
      throw Error('JOURNAL_ATTEMPT_RETENTION_SATURATED_DENIED');
    }
  }
  const next = {
    schemaVersion: LOCAL_JOURNAL_ATTEMPT_SCHEMA,
    attempts: Object.fromEntries(retained),
  };
  writeOwnedJson(actual, ATTEMPT_FILE, next);
  return attempts;
}


// ---------------------------------------------------------------------------
// PAN453 AC01 durable task operation identity fence (owned v2 namespace only).
// Binds the immutable task operation identity (task identity digest) to the
// durable local journal BEFORE any effect, so a reissued valid handle for the
// SAME immutable task cannot dispatch a second provider mutation even when the
// approval snapshot lags the actual target. It is a bounded, fail-closed local
// synthetic binding: NOT an OS/host authority, an operator identity provider or
// a cross-host lock. Legacy (non-owned) roots are untouched.
// ---------------------------------------------------------------------------
export const LOCAL_JOURNAL_TASK_IDENTITY_SCHEMA = 'pansphaira.local/journal-task-identity/v1';
// The task identity directory is bounded; admitting a brand-new task identity
// once the directory is saturated fails closed
// (JOURNAL_TASK_IDENTITY_RETENTION_SATURATED_DENIED) rather than evicting a
// retained binding or silently forgetting an already-fenced task identity.
export const LOCAL_JOURNAL_TASK_IDENTITY_LIMIT = 256;

const TASK_IDENTITY_FILE = 'journal-task-identity.json';
const TASK_IDENTITY_KEYS = Object.freeze([
  'boundAtMs','handleDigest','operationKey','taskIdentityDigest',
]);

function emptyTaskIdentities() {
  return { schemaVersion: LOCAL_JOURNAL_TASK_IDENTITY_SCHEMA, identities: {} };
}

function isHexDigest(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function validateTaskIdentityRecord(digest, record) {
  if (
    record === null
    || typeof record !== 'object'
    || Array.isArray(record)
    || Object.keys(record).sort().join('|') !== [...TASK_IDENTITY_KEYS].sort().join('|')
    || !isHexDigest(record.taskIdentityDigest)
    || record.taskIdentityDigest !== digest
    || !isHexDigest(record.handleDigest)
    || typeof record.operationKey !== 'string'
    || !/^admin-ai:poc:[a-zA-Z0-9:._-]{8,140}$/.test(record.operationKey)
    || !Number.isSafeInteger(record.boundAtMs)
    || record.boundAtMs < 0
  ) throw Error('JOURNAL_TASK_IDENTITY_INVALID_DENIED');
}

export function readLocalJournalTaskIdentity(root) {
  if (!isOwnedSyntheticPath(root)) throw Error('JOURNAL_OWNED_NAMESPACE_REQUIRED_DENIED');
  const value = readOwnedJson(root, TASK_IDENTITY_FILE, emptyTaskIdentities, 'JOURNAL_TASK_IDENTITY_INVALID_DENIED');
  if (
    value.schemaVersion !== LOCAL_JOURNAL_TASK_IDENTITY_SCHEMA
    || value.identities === null
    || typeof value.identities !== 'object'
    || Array.isArray(value.identities)
  ) throw Error('JOURNAL_TASK_IDENTITY_INVALID_DENIED');
  const identities = {};
  for (const [digest, record] of Object.entries(value.identities)) {
    validateTaskIdentityRecord(digest, record);
    identities[digest] = { ...record };
  }
  return { schemaVersion: LOCAL_JOURNAL_TASK_IDENTITY_SCHEMA, identities };
}

// Bind an immutable task identity to the durable journal BEFORE effect. The
// FIRST valid handle for a task identity binds it; a later valid handle for the
// SAME identity is refused (JOURNAL_TASK_IDENTITY_CONFLICT_DENIED) without
// writing anything, so the caller fails closed before any snapshot, approval,
// lease or provider effect. Re-recording the SAME handle is idempotent, so the
// existing same-handle bounded read-only reconciliation path is preserved, and
// a genuinely different task identity is admitted while the directory has room.
export function recordLocalJournalTaskIdentity(root, {
  taskIdentityDigest,
  operationKey,
  handleDigest,
  boundAtMs,
}) {
  const record = { boundAtMs, handleDigest, operationKey, taskIdentityDigest };
  validateTaskIdentityRecord(taskIdentityDigest, record);
  const actual = assertOwnedRoot(root);
  const current = readLocalJournalTaskIdentity(actual);
  const prior = current.identities[taskIdentityDigest];
  if (prior !== undefined) {
    if (prior.handleDigest !== record.handleDigest) {
      throw Error('JOURNAL_TASK_IDENTITY_CONFLICT_DENIED');
    }
    return prior;
  }
  if (Object.keys(current.identities).length >= LOCAL_JOURNAL_TASK_IDENTITY_LIMIT) {
    throw Error('JOURNAL_TASK_IDENTITY_RETENTION_SATURATED_DENIED');
  }
  const next = {
    schemaVersion: LOCAL_JOURNAL_TASK_IDENTITY_SCHEMA,
    identities: { ...current.identities, [taskIdentityDigest]: record },
  };
  writeOwnedJson(actual, TASK_IDENTITY_FILE, next);
  return record;
}
