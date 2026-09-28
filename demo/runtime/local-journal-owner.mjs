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
export const LOCAL_JOURNAL_ATTEMPT_SCHEMA = 'pansphaira.local/journal-recovery-attempts/v1';
export const LOCAL_JOURNAL_ATTEMPT_LIMIT = 16;

const CONTROL_FILE = 'journal-control.json';
const ATTEMPT_FILE = 'journal-recovery-attempts.json';
const CONTROL_KEYS = Object.freeze([
  'issuedAtMs','kind','operationKey','reason','sourceIdentity','stopEpoch','targetIdentity',
]);

function emptyControl() {
  return { schemaVersion: LOCAL_JOURNAL_CONTROL_SCHEMA, records: [] };
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

// Bounded retention: the ledger retains at most `limit` records, dropping the
// oldest by (stopEpoch, issuedAtMs) first. Dropping a record ends its control
// window; a later record with an older epoch for that key may then be admitted,
// which is the documented trade-off of a bounded retention window.
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
  const records = value.records.map((record) => {
    validateControlRecord(record);
    return { ...record };
  });
  return { schemaVersion: LOCAL_JOURNAL_CONTROL_SCHEMA, records };
}

export function recordLocalJournalControl(root, record) {
  validateControlRecord(record);
  const actual = assertOwnedRoot(root);
  const current = readLocalJournalControl(actual);
  const key = controlKey(record);
  for (const existing of current.records) {
    if (existing.kind === record.kind && controlKey(existing) === key && existing.stopEpoch >= record.stopEpoch) {
      throw Error('JOURNAL_CONTROL_EPOCH_REGRESSION_DENIED');
    }
  }
  const next = {
    schemaVersion: LOCAL_JOURNAL_CONTROL_SCHEMA,
    records: pruneControlRecords([...current.records, { ...record }], LOCAL_JOURNAL_CONTROL_LIMIT),
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
      || Object.keys(record).sort().join('|') !== 'attempts|firstAttemptMs|lastAttemptMs'
      || !Number.isSafeInteger(record.attempts)
      || record.attempts < 1
      || !Number.isSafeInteger(record.firstAttemptMs)
      || !Number.isSafeInteger(record.lastAttemptMs)
    ) throw Error('JOURNAL_ATTEMPT_INVALID_DENIED');
    attempts[operationKey] = { ...record };
  }
  return { schemaVersion: LOCAL_JOURNAL_ATTEMPT_SCHEMA, attempts };
}

export function recordLocalJournalRecoveryAttempt(root, { operationKey, attemptedAtMs }) {
  if (!isBoundIdentity(operationKey)) throw Error('JOURNAL_ATTEMPT_INVALID_DENIED');
  if (!Number.isSafeInteger(attemptedAtMs) || attemptedAtMs < 0) throw Error('JOURNAL_ATTEMPT_INVALID_DENIED');
  const actual = assertOwnedRoot(root);
  const current = readLocalJournalRecoveryAttempts(actual);
  const prior = current.attempts[operationKey];
  const record = {
    attempts: (prior?.attempts ?? 0) + 1,
    firstAttemptMs: prior?.firstAttemptMs ?? attemptedAtMs,
    lastAttemptMs: attemptedAtMs,
  };
  const entries = Object.entries({ ...current.attempts, [operationKey]: record })
    .sort((left, right) => (left[1].lastAttemptMs - right[1].lastAttemptMs)
      || left[0].localeCompare(right[0], 'en'));
  const retained = entries.length > LOCAL_JOURNAL_ATTEMPT_LIMIT
    ? entries.slice(entries.length - LOCAL_JOURNAL_ATTEMPT_LIMIT)
    : entries;
  const next = {
    schemaVersion: LOCAL_JOURNAL_ATTEMPT_SCHEMA,
    attempts: Object.fromEntries(retained),
  };
  writeOwnedJson(actual, ATTEMPT_FILE, next);
  return record.attempts;
}
