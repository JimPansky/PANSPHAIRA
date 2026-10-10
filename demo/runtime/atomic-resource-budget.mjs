import { lstatSync, mkdirSync } from "node:fs";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isAbsolute, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { canonicalJson } from "../../dist/packages/contracts/src/canonical-json.js";
import { makeCcpCostBudgetV1 } from "../../dist/packages/contracts/src/ccp-cost-budget.js";
import {
  assertCcpDigestV1, assertCcpSafePositiveIntegerV1, assertCcpSafeUnsignedIntegerV1,
  assertCcpStringV1, ccpStrictDenyV1, readCcpClosedObjectV1, TENANT_ID_PATTERN,
} from "../../dist/packages/contracts/src/ccp-event-envelope.js";

const denied = "RESOURCE_BUDGET_INPUT_DENIED";
const closed = (value, keys) => readCcpClosedObjectV1(value, keys, new WeakSet(), denied);
const unsigned = (value) => assertCcpSafeUnsignedIntegerV1(value, denied);
const operationPattern = /^operation:[a-z0-9][a-z0-9._-]{2,63}$/;

/** Owner-opened native persistence. Never expose the options or store to agents. */
export function createResourceBudgetStoreV1(value) {
  const options = closed(value, ["optIn", "stateRoot", "tenantId", "bindingDigest", "limits"]);
  if (options.optIn !== true) ccpStrictDenyV1("RESOURCE_BUDGET_OPT_IN_REQUIRED");
  const limits = closed(options.limits, ["modelUnits", "runtimeUnits"]);
  for (const units of Object.values(limits)) {
    assertCcpSafePositiveIntegerV1(units, denied);
    if (units > 1_000_000) ccpStrictDenyV1(denied);
  }
  assertCcpStringV1(options.tenantId, TENANT_ID_PATTERN, denied);
  assertCcpDigestV1(options.bindingDigest, denied);
  if (typeof options.stateRoot !== "string" || !isAbsolute(options.stateRoot)) ccpStrictDenyV1(denied);
  const binding = canonicalJson({ tenantId: options.tenantId, bindingDigest: options.bindingDigest, limits: { ...limits } });
  mkdirSync(options.stateRoot, { recursive: true, mode: 0o700 });
  const root = lstatSync(options.stateRoot);
  if (!root.isDirectory() || root.isSymbolicLink() || (root.mode & 0o077) !== 0 || root.uid !== process.getuid?.()) ccpStrictDenyV1("RESOURCE_BUDGET_OWNED_ROOT_REQUIRED");
  const file = join(options.stateRoot, "resource-budget.sqlite");
  try { const stat = lstatSync(file); if (!stat.isFile() || stat.isSymbolicLink()) ccpStrictDenyV1("RESOURCE_BUDGET_OWNED_FILE_REQUIRED"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const db = new DatabaseSync(file);
  const startupDeadline = performance.now() + 15_000;
  const startupWait = new Int32Array(new SharedArrayBuffer(4));
  const initialize = (body) => {
    for (;;) {
      try { return body(); }
      catch (error) {
        // SQLite may skip its busy handler during WAL first-open contention.
        // Retry only idempotent startup, never reservations or provider effects.
        const remaining = startupDeadline - performance.now();
        if (error.code !== "ERR_SQLITE_ERROR" || ![5, 6].includes(error.errcode & 0xff) || remaining <= 0) throw error;
        Atomics.wait(startupWait, 0, 0, Math.min(10, remaining));
      }
    }
  };
  let completionKey;
  const transaction = (body) => {
    db.exec("BEGIN IMMEDIATE");
    try { const result = body(); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  };
  try {
    initialize(() => {
      // A short native wait plus the one monotonic startup deadline bounds
      // cold opens without enlarging any model or runtime budget.
      db.exec("PRAGMA busy_timeout=50; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
      db.exec(`CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), binding TEXT NOT NULL, completion_key TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS reservations (
      operation_id TEXT PRIMARY KEY, request_digest TEXT NOT NULL,
      model_units INTEGER NOT NULL CHECK(typeof(model_units)='integer' AND model_units>=0),
      runtime_units INTEGER NOT NULL CHECK(typeof(runtime_units)='integer' AND runtime_units>=0),
      state TEXT NOT NULL DEFAULT 'RESERVED' CHECK(state IN ('RESERVED','UNKNOWN_USAGE','SETTLED')),
      model_consumed INTEGER NOT NULL DEFAULT 0 CHECK(typeof(model_consumed)='integer' AND model_consumed BETWEEN 0 AND model_units),
      runtime_consumed INTEGER NOT NULL DEFAULT 0 CHECK(typeof(runtime_consumed)='integer' AND runtime_consumed BETWEEN 0 AND runtime_units),
      completion TEXT, result_json TEXT
    ) STRICT;`);
      transaction(() => {
      db.prepare("INSERT OR IGNORE INTO settings(id,binding,completion_key) VALUES(1,?,?)").run(binding, randomBytes(32).toString("hex"));
      if (db.prepare("SELECT binding FROM settings WHERE id=1").get().binding !== binding) ccpStrictDenyV1("RESOURCE_BUDGET_BINDING_DRIFT_DENIED");
      // Owner-bound additive upgrade preserves every prior hold/settlement.
        if (!db.prepare("PRAGMA table_info(reservations)").all().some((column) => column.name === "result_json")) db.exec("ALTER TABLE reservations ADD COLUMN result_json TEXT");
      });
      completionKey = db.prepare("SELECT completion_key FROM settings WHERE id=1").get().completion_key;
    });
    db.exec("PRAGMA busy_timeout=15000");
  } catch (error) { db.close(); throw error; }
  const read = (operationId) => {
    assertCcpStringV1(operationId, operationPattern, denied);
    const row = db.prepare("SELECT * FROM reservations WHERE operation_id=?").get(operationId);
    return row === undefined ? null : Object.freeze({ ...row });
  };
  const snapshot = () => {
    const totals = db.prepare("SELECT count(*) AS reservations, coalesce(sum(CASE WHEN state='SETTLED' THEN model_consumed ELSE model_units END),0) AS model, coalesce(sum(CASE WHEN state='SETTLED' THEN runtime_consumed ELSE runtime_units END),0) AS runtime, coalesce(sum(model_consumed),0) AS modelConsumed, coalesce(sum(runtime_consumed),0) AS runtimeConsumed FROM reservations").get();
    const receipt = (kind) => makeCcpCostBudgetV1({
      budgetId: `budget:pan529-${kind}`, ledgerId: "ledger:pan529-native",
      tenantId: options.tenantId, repositoryId: "repository:pansphaira", contributionId: "contribution:pan529-runtime",
      logicalAtMs: 0, budgetUnits: limits[`${kind}Units`], committedUnits: totals[kind], consumedUnits: totals[`${kind}Consumed`],
    });
    return Object.freeze({ model: receipt("model"), runtime: receipt("runtime"), reservations: totals.reservations });
  };
  const reserve = (candidate) => {
    const command = closed(candidate, ["operationId", "requestDigest", "modelUnits", "runtimeUnits"]);
    assertCcpStringV1(command.operationId, operationPattern, denied);
    assertCcpDigestV1(command.requestDigest, denied);
    unsigned(command.modelUnits); unsigned(command.runtimeUnits);
    if (command.modelUnits + command.runtimeUnits === 0) ccpStrictDenyV1(denied);
    return transaction(() => {
      const prior = read(command.operationId);
      if (prior !== null) {
        if (prior.request_digest !== command.requestDigest || prior.model_units !== command.modelUnits || prior.runtime_units !== command.runtimeUnits) ccpStrictDenyV1("RESOURCE_BUDGET_RETRY_CONFLICT_DENIED");
        return Object.freeze({ reservation: prior, replayed: true });
      }
      const available = snapshot();
      if (command.modelUnits > available.model.remainingUnits || command.runtimeUnits > available.runtime.remainingUnits) ccpStrictDenyV1("RESOURCE_BUDGET_EXHAUSTED_DENIED");
      db.prepare("INSERT INTO reservations(operation_id,request_digest,model_units,runtime_units) VALUES(?,?,?,?)").run(command.operationId, command.requestDigest, command.modelUnits, command.runtimeUnits);
      return Object.freeze({ reservation: read(command.operationId), replayed: false });
    });
  };
  const markUnknownUsage = (operationId) => transaction(() => {
    const prior = read(operationId);
    if (prior === null) ccpStrictDenyV1("RESOURCE_BUDGET_RESERVATION_REQUIRED_DENIED");
    if (prior.state !== "RESERVED") return Object.freeze({ reservation: prior, dispatchGranted: false });
    db.prepare("UPDATE reservations SET state='UNKNOWN_USAGE' WHERE operation_id=? AND state='RESERVED'").run(operationId);
    return Object.freeze({ reservation: read(operationId), dispatchGranted: true });
  });
  const completionPayload = (candidate) => {
    const receipt = closed(candidate, ["operationId", "requestDigest", "modelUnits", "runtimeUnits", "evidenceDigest"]);
    assertCcpStringV1(receipt.operationId, operationPattern, denied);
    assertCcpDigestV1(receipt.requestDigest, denied); assertCcpDigestV1(receipt.evidenceDigest, denied);
    unsigned(receipt.modelUnits); unsigned(receipt.runtimeUnits);
    return { ...receipt };
  };
  const authenticate = (payload) => createHmac("sha256", completionKey).update("pan529.native-completion/v1\0" + binding + "\0" + canonicalJson(payload)).digest("hex");
  // Explicit privileged local capability; never route this method to agents,
  // model output or a client-supplied completion. The native adapter invokes it
  // only after guarded observed usage from its own bound dispatch.
  const ownerCompletionEvidence = (candidate) => {
    const payload = completionPayload(candidate);
    return Object.freeze({ ...payload, authenticator: authenticate(payload) });
  };
  const settle = (candidate, observedResult = null, verifyAtCommit = undefined) => {
    // Owner-local synchronous capability only, never a serialized caller/model
    // field. Existing completion authentication and retry/result binding stay
    // mandatory. This guard runs AFTER SQLite writer reservation, not before it.
    if (verifyAtCommit !== undefined && typeof verifyAtCommit !== 'function') ccpStrictDenyV1("RESOURCE_BUDGET_SETTLEMENT_COMMIT_GUARD_DENIED");
    const receipt = closed(candidate, ["operationId", "requestDigest", "modelUnits", "runtimeUnits", "evidenceDigest", "authenticator"]);
    const { authenticator, ...payload } = receipt;
    const validated = completionPayload(payload);
    assertCcpDigestV1(authenticator, denied);
    if (!timingSafeEqual(Buffer.from(authenticator, "hex"), Buffer.from(authenticate(validated), "hex"))) ccpStrictDenyV1("RESOURCE_BUDGET_UNTRUSTED_COMPLETION_DENIED");
    const completion = canonicalJson({ ...validated, authenticator });
    const resultJson = observedResult === null ? null : canonicalJson(observedResult);
    if (resultJson !== null && createHash("sha256").update(resultJson).digest("hex") !== validated.evidenceDigest) ccpStrictDenyV1("RESOURCE_BUDGET_OBSERVED_RESULT_BINDING_DENIED");
    return transaction(() => {
      const prior = read(validated.operationId);
      if (prior === null || prior.request_digest !== validated.requestDigest || validated.modelUnits > prior.model_units || validated.runtimeUnits > prior.runtime_units) ccpStrictDenyV1("RESOURCE_BUDGET_COMPLETION_BINDING_DENIED");
      if (prior.state === "SETTLED") {
        if (prior.completion !== completion) ccpStrictDenyV1("RESOURCE_BUDGET_COMPLETION_RETRY_CONFLICT_DENIED");
        return prior;
      }
      if (prior.state !== "UNKNOWN_USAGE") ccpStrictDenyV1("RESOURCE_BUDGET_DISPATCH_REQUIRED_DENIED");
      if (verifyAtCommit !== undefined && verifyAtCommit() !== true) ccpStrictDenyV1("RESOURCE_BUDGET_SETTLEMENT_COMMIT_GUARD_DENIED");
      db.prepare("UPDATE reservations SET state='SETTLED',model_consumed=?,runtime_consumed=?,completion=?,result_json=? WHERE operation_id=? AND state='UNKNOWN_USAGE'").run(validated.modelUnits, validated.runtimeUnits, completion, resultJson, validated.operationId);
      return read(validated.operationId);
    });
  };
  return Object.freeze({ reserve, read, snapshot, markUnknownUsage, ownerCompletionEvidence, settle, close: () => db.close() });
}
