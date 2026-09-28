// PAN452 successor: a distinct, LOCAL_SYNTHETIC read-only task, never an Order operation.
// This fixed origin qualifies only the released KS246/247 synthetic fixture domain.
import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { canonicalJson } from "../../demo/runtime/enforcement-gate.mjs";

export const METRIC_READ_SCHEMA = "pansphaira.contract/synthetic-metric-read-task/v1";
const sha = (value) => createHash("sha256").update(value).digest("hex");
const fail = (code) => { const error = new Error(`MRT_${code}_DENIED`); error.code = error.message; throw error; };
const same = (a, b) => typeof a === "string" && typeof b === "string"
  && Buffer.byteLength(a) === Buffer.byteLength(b)
  && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const frozen = (value) => {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
};
// Authored producer-origin scope: these are independently frozen, public synthetic
// fixture/contract identities, NOT an input accepted from the request or a self-digest.
const DOMAIN = frozen({
  schemaVersion: METRIC_READ_SCHEMA,
  origin: "LOCAL_SYNTHETIC_KS246_KS247_V1",
  principal: { tenant: "local-synthetic-ks", user: "reader:synthetic-metric" },
  taskRef: "ks247-net-revenue-read-v1",
  intent: "READ_METRIC_NO_EFFECT",
  sourceRevision: "synthetic-unfamiliar-source-v1",
  sourceSha256: "56724bfa95e66d8b61a837e82098aeee67ad430434794da944d033d61dd9737e",
  contractSha256: "455f735e55f03155c657dc963656ed01363e546345824dfea66b883c287d9d70",
  question: "bi-ks-01-net-revenue",
  period: {
    current: { start: "2026-07-01", end: "2026-07-31" },
    comparison: { start: "2026-06-01", end: "2026-06-30" },
  },
  layout: "unfamiliar-pay-feed-layout-v1",
  units: "EUR_MINOR_UNITS",
  authority: { readOnly: true, mutationAuthority: false, effectJournal: false },
});
const DOMAIN_V2 = frozen({
  ...DOMAIN,
  origin: "LOCAL_SYNTHETIC_KS246_KS247_V2",
  taskRef: "ks247-net-revenue-read-v2",
  sourceRevision: "synthetic-unfamiliar-source-v2",
  sourceSha256: "cacd2a08d5fa5cb8603513a769362a2f7bdb700c44d700728a1fe2f1244be52e",
});
const DOMAINS = Object.freeze({[DOMAIN.taskRef]:DOMAIN,[DOMAIN_V2.taskRef]:DOMAIN_V2});
const keys = (value, allowed) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join("|") === [...allowed].sort().join("|");
const requestKeys = ["tenant", "user", "taskRef", "intent", "sourceRevision", "sourceSha256", "contractSha256", "question", "period", "layout", "units", "authority"];
export function syntheticMetricReadOrigin(variant = "v1") { if (variant === "v1") return DOMAIN; if (variant === "v2") return DOMAIN_V2; fail("SCOPE"); }
export class SyntheticMetricReadIssuer {
  #secret;
  #now;
  #issued = new Map();
  constructor({ secret, now = Date.now }) {
    if (typeof secret !== "string" || secret.length < 16 || typeof now !== "function") fail("ORIGIN");
    this.#secret = secret;
    this.#now = now;
  }
  issue({ taskRef, ttlMs = 30000 }) {
    const task = Object.hasOwn(DOMAINS,taskRef) ? DOMAINS[taskRef] : null;
    if (task === null || !Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > 30000) fail("SCOPE");
    const issuedAt = this.#now();
    if (!Number.isSafeInteger(issuedAt)) fail("EXPIRY");
    const expiresAt = issuedAt + ttlMs;
    if (!Number.isSafeInteger(expiresAt)) fail("EXPIRY");
    const nonce = createHash("sha256").update(`${issuedAt}:${Math.random()}:${this.#issued.size}`).digest("hex");
    const id = sha(JSON.stringify([task, expiresAt, nonce]));
    const mac = createHmac("sha256", this.#secret).update(id).digest("hex");
    const handle = Buffer.from(JSON.stringify({ v: 1, id, mac })).toString("base64url");
    this.#issued.set(id, { expiresAt, used: false, task });
    return { handle, task };
  }
  resolve({ handle, request }) {
    if (!keys(request, requestKeys) || !keys(request.period, ["current", "comparison"])
      || !keys(request.period.current, ["start", "end"])
      || !keys(request.period.comparison, ["start", "end"])
      || !keys(request.authority, ["readOnly", "mutationAuthority", "effectJournal"])) fail("SHAPE");
    let token;
    try { token = JSON.parse(Buffer.from(handle, "base64url").toString()); } catch { fail("HANDLE"); }
    if (!keys(token, ["v", "id", "mac"]) || token.v !== 1 || !/^[a-f0-9]{64}$/.test(token.id)
      || !same(token.mac, createHmac("sha256", this.#secret).update(token.id).digest("hex"))) fail("HANDLE");
    const issued = this.#issued.get(token.id);
    if (!issued) fail("ORIGIN");
    if (issued.used) fail("REPLAY");
    const resolvedAt = this.#now();
    if (!Number.isSafeInteger(resolvedAt)) fail("EXPIRY");
    if (resolvedAt >= issued.expiresAt) fail("EXPIRY");
    for (const [name, value] of Object.entries(request)) {
      const expected = name === "tenant" || name === "user" ? issued.task.principal[name] : issued.task[name];
      if (canonicalJson(value) !== canonicalJson(expected)) fail(name === "authority" ? "EFFECT" : "SCOPE");
    }
    return { task: issued.task, commit: () => { issued.used = true; } };
  }
}
// Read callback is injected by the public KS entry point, not delegated to model output.
// The JS module cannot sandbox a hostile host callback: it admits only the explicit
// no-effect task; the KS SQL boundary independently enforces its read-only surface.
export async function executeSyntheticMetricRead({ issuer, handle, request, operation }) {
  const { task, commit } = issuer.resolve({ handle, request });
  if (!operation || typeof operation.read !== "function" || Object.keys(operation).sort().join("|") !== "read") fail("OPERATION");
  // Single-use reservation is synchronous and precedes any awaited callback.
  // An ambiguous or failed read consumes the handle; a fresh task must be issued.
  commit();
  const result = await operation.read(task);
  if (result?.executed !== true || result?.authority?.mutationAuthority !== "NONE"
    || result?.binding?.sourceRevision !== task.sourceRevision
    || result?.binding?.sourceSha256 !== task.sourceSha256
    || result?.binding?.profileId !== task.layout
    || result?.binding?.releasedContractSha256 !== task.contractSha256
    || result?.authority?.publicWrites !== false
    || result?.authority?.arbitrarySql !== false
    || result?.acceptance?.reconcilesToIndependentExpectedResult !== true
    || result?.acceptance?.executionState !== "COMPLETE") fail("RESULT");
  return Object.freeze({ schemaVersion: METRIC_READ_SCHEMA, task, result, effectStatus: "NO_EFFECT_AUTHORIZED", status: "READ_COMPLETE" });
}
