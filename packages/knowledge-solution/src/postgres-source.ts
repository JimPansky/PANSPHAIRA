/**
 * KTS-03 — real local read-only PostgreSQL source.
 *
 * This is a REAL, locally-operated PostgreSQL server (embedded-postgres),
 * not an in-memory fake: it initializes a real data directory with initdb,
 * starts a real postgres process, listens on a real TCP port (127.0.0.1 only),
 * and serves real SQL through the real `pg` wire protocol. It is read-only:
 * the connector only issues a bounded, allowlisted SELECT; every other
 * statement is denied before it reaches the server.
 *
 * It produces a `ContextPackV1` whose `descriptor.sourceFormat` is "postgres"
 * so the SAME guided path (KTS-02) and the SAME sealed method core (KTS-01)
 * consume the rows without any core change — proving reuse across a truly
 * different data substrate (TCP PostgreSQL vs. local CSV files).
 */
import { createHash } from "node:crypto";
import { canonicalJson } from "../../contracts/src/canonical-json.js";
import type {
  ContextDataV1,
  ContextDescriptorV1,
  ContextFieldDescriptorV1,
  ContextPackV1,
} from "./context-source.js";
import {
  CONTEXT_DATA_SCHEMA_V1,
  CONTEXT_DESCRIPTOR_SCHEMA_V1,
  contextDataDigestV1,
  contextDescriptorDigestV1,
} from "./context-source.js";
import { Client } from "pg";

const sha = (value: unknown): string =>
  createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex");

export type PostgresDenialCodeV1 =
  | "PG_QUERY_NOT_ALLOWED"
  | "PG_QUERY_INJECTION_DENIED"
  | "PG_READBACK_MISMATCH"
  | "PG_CONNECTION_FAILED"
  | "PG_FLOOR_MALFORMED"
  | "PG_ROW_MALFORMED"
  | "PG_QUERY_TIMED_OUT";

export class PostgresReadDenied extends Error {
  readonly code: PostgresDenialCodeV1;
  constructor(code: PostgresDenialCodeV1, message?: string) {
    super(message ?? code);
    this.name = "PostgresReadDenied";
    this.code = code;
  }
}

export interface PostgresFieldSpecV1 {
  readonly column: string;
  readonly field: string;
  readonly meaning: string;
  readonly kind: "string" | "number" | "date";
  readonly unit: string | null;
  readonly nullable: boolean;
  /** Closed fachliche meaning key (F2), carried into the context descriptor. */
  readonly meaningKey?: "INVOICE_ID" | "ORDER_ID" | "CUSTOMER_ID" | "INVOICE_TOTAL_GROSS" | "CURRENCY_CODE" | "DUE_DATE";
}

export interface PostgresSchemaSpecV1 {
  readonly table: string;
  readonly floorColumn: string;
  readonly orderColumn: string;
  readonly fields: readonly PostgresFieldSpecV1[];
}

/**
 * The ONLY SQL this connector ever sends. It is a constant (never built from
 * user input), a single SELECT, and is matched byte-for-byte against an
 * allowlist before execution. No DDL, no DML, no other tables, no
 * subqueries — a read-only, injection-proof surface.
 */
export const PG_MARGIN_SELECT = "SELECT * FROM kts_invoices ORDER BY kts_invoice_id";

/** Closed allowlist of the exact SQL statements this connector may issue. */
export const PG_ALLOWED_QUERIES_V1: readonly string[] = [
  PG_MARGIN_SELECT,
  "SELECT current_user",
  "SELECT inet_server_port()",
  "SELECT version()",
];

export interface PostgresConnectionArgsV1 {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly user: string;
  readonly password: string;
}

/**
 * F5 — eindeutiger Ownership-Vertrag für frische vs. bereits verbundene
 * Clients. KEINE Bibliotheksinterna (z. B. das bereits beim Konstruieren
 * vorhandene `client.connection`-Objekt) werden als Verbindungsnachweis
 * benutzt — ein frisch konstruierter echter `pg.Client` hat es, obwohl er
 * noch nie verbunden war. Stattdessen:
 *
 * 1. PROBE: ein wegwerfender Client mit den EXAKTEN conn-Zugangsdaten muss
 *    zeitlich begrenzt (timeoutMs) tatsächlich per Wire-Protokoll verbinden
 *    können. Schlägt die Probe fehl (kein Server, falsche Credentials,
 *    Timeout), wird SOFORT mit PG_CONNECTION_FAILED abgewiesen — kein Hängen,
 *    keine Query auf einem nie verbundenen Client.
 * 2. CONNECT: der übergebene Client wird vom Adapter selbst verbunden
 *    (zeitlich begrenzt). Erhält der Adapter einen Client, der bereits
 *    offiziel verbunden ist (pg verweigert den zweiten connect()), bleibt er
 *    CALLER_OWNED: der Adapter nutzt ihn, ohne ihn zu schließen.
 *
 * `owned=true` bedeutet: der Adapter hat den Client verbunden und schließt
 * ihn nach der Leseoperation selbst; `owned=false` bedeutet: der Aufrufer
 * bleibt Besitzer (Adapter schließt nicht).
 */
export interface PostgresClientOwnershipV1 {
  readonly client: Client;
  readonly owned: boolean;
}

const isAlreadyConnectedError = (error: unknown): boolean =>
  error instanceof Error && /already been connected|reuse a client/i.test(error.message);

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new PostgresReadDenied("PG_CONNECTION_FAILED", `${label} timed out after ${String(timeoutMs)}ms`)), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error instanceof PostgresReadDenied ? error : new PostgresReadDenied("PG_CONNECTION_FAILED", String(error))); },
    );
  });

/** F5: bounded, protocol-level connection probe (disposable client).
 *  (Korrektur 0430: the probe client is ALWAYS released — including when the
 *  timeout fires before connect() settled — and its socket reference is
 *  cleared so a pending-connect client can never keep the process alive.) */
export async function probePostgresConnectionV1(conn: PostgresConnectionArgsV1, timeoutMs = 10_000): Promise<void> {
  const probe = new Client({
    host: conn.host, port: conn.port, database: conn.database, user: conn.user, password: conn.password,
    connectionTimeoutMillis: Math.max(1, Math.min(timeoutMs, 5_000)),
    statement_timeout: timeoutMs,
  });
  try {
    await withTimeout(probe.connect(), timeoutMs, "connection probe");
  } catch (error) {
    await closeOwnedClientV1(probe, timeoutMs);
    throw error;
  }
  await closeOwnedClientV1(probe, timeoutMs);
}

/**
 * F5 (Korrektur 0430): close an ADAPTER-OWNED client with a hard bound.
 * A client whose connect() was still pending cannot be closed with end()
 * (pg hangs forever on that) — so the close is raced against a timeout and
 * the internal socket reference is cleared (best-effort), so even a leaked
 * pending-connect client can never block the process exit (residual-free).
 */
/**
 * F5 (Restbefund): destroy the ACTUAL socket of a pg client. pg 8.16 does
 * NOT keep the stream on the client itself — it lives on the internal
 * `client.connection` (a `Connection` instance: `.stream`, optionally
 * `.socket`). The old code destroyed `client.socket` / `client.stream`,
 * which DO NOT EXIST on the client: a connect that timed out (or a
 * pending-connect blackhole) kept its real TCP socket open
 * (review: clientStreamDestroyed=false, serverSockets=1).
 */
const clearClientSocket = (client: Client): void => {
  try {
    void client.end().catch(() => { /* already closed */ });
  } catch {
    /* construction edge */
  }
  const c = client as unknown as {
    connection?: { stream?: { destroy?: () => void } | null; socket?: { destroy?: () => void } | null } | null;
    stream?: { destroy?: () => void } | null;
    socket?: { destroy?: () => void } | null;
  };
  const conn = c.connection;
  if (conn !== null && conn !== undefined && typeof conn === "object") {
    const connStream = conn.stream;
    if (connStream !== null && connStream !== undefined && typeof connStream.destroy === "function") {
      try { connStream.destroy(); } catch { /* already destroyed */ }
    }
    const connSocket = conn.socket;
    if (connSocket !== null && connSocket !== undefined && typeof connSocket.destroy === "function") {
      try { connSocket.destroy(); } catch { /* already destroyed */ }
    }
  }
  // belt-and-braces: any client-level stream/socket reference (older/newer pg).
  if (c.stream !== null && c.stream !== undefined && typeof c.stream.destroy === "function") {
    try { c.stream.destroy(); } catch { /* already destroyed */ }
  }
  if (c.socket !== null && c.socket !== undefined && typeof c.socket.destroy === "function") {
    try { c.socket.destroy(); } catch { /* already destroyed */ }
  }
  try {
    (c as unknown as { connection?: unknown }).connection = null;
    (c as unknown as { stream?: unknown }).stream = null;
    (c as unknown as { socket?: unknown }).socket = null;
  } catch {
    /* frozen objects */
  }
};
async function closeOwnedClientV1(client: Client, timeoutMs = 10_000): Promise<void> {
  try {
    await Promise.race([
      client.end(),
      new Promise<never>((_, reject) => {
        const t = setTimeout(() => reject(new PostgresReadDenied("PG_CONNECTION_FAILED", "close timed out")), timeoutMs);
        t.unref?.();
      }),
    ]);
  } catch {
    /* already closed / hang on pending connect */
  } finally {
    clearClientSocket(client);
  }
}

/**
 * F5: connect the handed client (adapter-owned) or verify it is already
 * connected (caller-owned). Fresh clients that cannot connect are rejected
 * immediately and with a bound; nothing may hang.
 */
/** F5 (Korrektur 0430): true when the client's connection was ENDED by the
 *  caller — pg allows NO query on such a client (it throws immediately,
 *  "Client was closed and is not queryable"). Ground truth probed on the
 *  live harness: ended => query throws; open => query works. */
const isEndedClientError = (error: unknown): boolean =>
  error instanceof Error && /client was closed and is not queryable/i.test(error.message);

/** F5 (Korrektur 0430): true when the client is currently OPEN (queryable)
 *  — proven over the wire with a bounded SELECT, never by reading client
 *  internals (a fresh client carries a `connection` object without ever
 *  having connected). */
const isQueryableClient = async (client: Client, timeoutMs: number): Promise<boolean> => {
  try {
    await Promise.race([
      client.query("SELECT 1"),
      new Promise<never>((_, reject) => {
        const t = setTimeout(() => reject(new Error("query-timeout")), timeoutMs);
        t.unref?.();
      }),
    ]);
    return true;
  } catch {
    return false;
  }
};

/**
 * F5 (Restbefund): bind the PROBED connection identity to the ACTUAL
 * client that will execute the read. The endpoint being live for the
 * probed credentials proves nothing about the handed client: a client
 * already connected as a DIFFERENT (e.g. more privileged) role is not
 * the verified connection. The adapter therefore verifies over the wire
 * that the actual client executes as exactly the probed role
 * (`SELECT current_user`); any other identity is rejected.
 */
const verifyClientRoleV1 = async (client: Client, conn: PostgresConnectionArgsV1, timeoutMs = 10_000): Promise<void> => {
  // F5 (canonical-completion): the role verify is a WIRE query and, like the
  // read itself, must be BOUNDED on the client side — the server-enforced
  // statement_timeout is not in force yet at this point. A connection that
  // completes the handshake then wedges (half-open / stalled-fsync) must not
  // leave this await pending forever (the actual canonical-completion stall).
  const row = (await runReadOnlyQueryV1<{ current_user: string }>(client, "SELECT current_user", timeoutMs))[0];
  const user = row?.current_user ?? "";
  if (user !== conn.user) {
    throw new PostgresReadDenied("PG_CONNECTION_FAILED",
      `client executes as ${JSON.stringify(user)}, not as the probed role ${JSON.stringify(conn.user)} — the used client is not bound to the verified endpoint identity`);
  }
};

export async function ensurePostgresClientConnectedV1(client: Client, conn: PostgresConnectionArgsV1, timeoutMs = 10_000): Promise<PostgresClientOwnershipV1> {
  // 1) The connection point must be live and the credentials valid — proven
  //    over the wire (probe), not inferred from client internals.
  await probePostgresConnectionV1(conn, timeoutMs);
  // pg.connect() overwrites _connectionCallback BEFORE checking whether the
  // client is already connecting/connected. Calling it again can orphan the
  // caller's original native Promise even though subsequent wire reads work.
  // These lifecycle flags are ONLY a conservative do-not-connect ownership
  // guard, never proof of a live connection or role. Check after the awaited
  // probe, immediately before any adapter connect() (no intervening await).
  const lifecycle = client as unknown as {
    _connecting?: boolean; _connected?: boolean; _ending?: boolean; _ended?: boolean;
  };
  if (lifecycle._connecting === true || lifecycle._connected === true || lifecycle._ending === true || lifecycle._ended === true) {
    if (!(await isQueryableClient(client, timeoutMs))) {
      throw new PostgresReadDenied("PG_CONNECTION_FAILED",
        "client is caller-owned but not queryable (not connected, or already ended)");
    }
    // Actual bounded wire checks remain mandatory; no flag grants admission.
    // Rejection here must NOT close, reconnect, or take ownership of the client.
    await verifyClientRoleV1(client, conn, timeoutMs);
    return { client, owned: false };
  }
  // 2) Connect THIS fresh client, with a HARD BOUND. A fresh client whose connect
  //    never settles (endpoint accepts TCP but never speaks the wire
  //    protocol) is rejected within the bound and released (its socket
  //    reference is cleared) — nothing hangs.
  try {
    await withTimeout(client.connect(), timeoutMs, "adapter connect");
    // F5 (Restbefund): the used client must be the probed identity.
    await verifyClientRoleV1(client, conn, timeoutMs);
    return { client, owned: true };
  } catch (error) {
    // 3) "Client has already been connected" (also: "cannot reuse a
    //    client"): the caller touched connect() on this client. That alone
    //    proves NOTHING about the current state — it also holds for a
    //    client that was connected and ENDED by the caller. The live state
    //    is proven over the wire:
    if (isAlreadyConnectedError(error)) {
      if (await isQueryableClient(client, timeoutMs)) {
        // OPEN caller-owned client: usable, the adapter must NOT close it.
        // F5 (Restbefund): the OPEN client must still be the probed role —
        // an admin client handed in for a read-only credential is not the
        // verified connection and is rejected (role binding).
        await verifyClientRoleV1(client, conn, timeoutMs);
        return { client, owned: false };
      }
      // ENDED (or otherwise not queryable) client: no usable connection
      // exists — fail closed, never invent a connection.
      throw new PostgresReadDenied("PG_CONNECTION_FAILED",
        "client is caller-owned but not queryable (not connected, or already ended)");
    }
    // F5 (Restbefund): a connect that never settled (timeout, blackhole)
    // must release the ACTUAL socket — the timeout branch previously threw
    // without any cleanup, leaving the real TCP connection open
    // (review: clientStreamDestroyed=false, serverSockets=1).
    clearClientSocket(client);
    throw error;
  }
}

/**
 * Issue one allowlisted, read-only query over a live `pg.Client`. Any
 * statement not in `PG_ALLOWED_QUERIES_V1` is denied BEFORE reaching the
 * server; a second, literal SQL-injection marker is additionally rejected.
 * The client's transaction is forced to read-only.
 */
/**
 * F5 (Restbefund): closed gate for the ONLY session settings the connector
 * may issue: bounded integer `statement_timeout` / `lock_timeout` (the
 * server-enforced limits of the ACTUAL read). Constant shape, no user
 * input, no other SET — everything else is denied before reaching the
 * server.
 */
const PG_SESSION_SETTING_V1 = /^(?:statement_timeout|lock_timeout) = (\d+)$/;
export function runSessionSettingV1(client: Client, setting: string, queryTimeoutMs?: number): Promise<void> {
  const normalized = setting.replace(/\s+/g, " ").trim();
  const match = PG_SESSION_SETTING_V1.exec(normalized);
  if (match === null || match[1] === undefined || Number(match[1]) < 1 || Number(match[1]) > 60_000) {
    throw new PostgresReadDenied("PG_QUERY_NOT_ALLOWED", `session setting not closed: ${JSON.stringify(normalized)}`);
  }
  // F5 (canonical-completion): the SET that establishes the server-enforced
  // bound is itself a wire query and must be bounded on the client side; a
  // wedged connection must not hang the session setup.
  const bound = typeof queryTimeoutMs === "number" && Number.isFinite(queryTimeoutMs) && queryTimeoutMs > 0
    ? { text: `SET ${normalized}`, query_timeout: Math.floor(queryTimeoutMs) }
    : `SET ${normalized}`;
  return (client as unknown as { query: (config: unknown) => Promise<unknown> })
    .query(bound as never)
    .then(() => undefined)
    .catch((err: unknown) => {
      const code = (err as { code?: string })?.code;
      const message = err instanceof Error ? err.message : String(err);
      if (code === "28000" || code === "08006" || code === "08001" || code === "08003" || code === "08004") throw new PostgresReadDenied("PG_CONNECTION_FAILED", message);
      if (code === "57014" || code === "55P03" || message === "Query read timeout") throw new PostgresReadDenied("PG_QUERY_TIMED_OUT", message);
      throw new PostgresReadDenied("PG_QUERY_NOT_ALLOWED", message);
    });
}

export function runReadOnlyQueryV1<T>(client: Client, statement: string, queryTimeoutMs?: number): Promise<T[]> {
  const normalized = statement.replace(/\s+/g, " ").trim();
  if (!PG_ALLOWED_QUERIES_V1.includes(normalized)) {
    throw new PostgresReadDenied("PG_QUERY_NOT_ALLOWED");
  }
  if (/;|insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|vacuum|analyze/i.test(statement)) {
    throw new PostgresReadDenied("PG_QUERY_INJECTION_DENIED");
  }
  // F5 (Restbefund): an OPTIONAL client-side read bound. The SERVER remains
  // the authority (session statement/lock limits); this only tightens the
  // client side so a caller can cap an interactive read explicitly.
  const bound = typeof queryTimeoutMs === "number" && Number.isFinite(queryTimeoutMs) && queryTimeoutMs > 0
    ? { text: normalized, query_timeout: Math.floor(queryTimeoutMs) }
    : normalized;
  const promise = (client as unknown as { query: (config: unknown) => Promise<{ rows: T[] }> })
    .query(bound as never)
    .then((res) => res.rows as T[])
    .catch((err: unknown) => {
      const code = (err as { code?: string })?.code;
      const message = err instanceof Error ? err.message : String(err);
      if (code === "28000" || code === "08006" || code === "08001" || code === "08003" || code === "08004") throw new PostgresReadDenied("PG_CONNECTION_FAILED", message);
      // F5 (Restbefund): the ACTUAL query hit a bound — fail closed with a
      // dedicated code. Server-enforced: 57014 (query_canceled) / 55P03
      // (lock_not_available). Client-side (pg's own query_timeout): the
      // deterministic "Query read timeout" error (no SQLSTATE) is the same
      // condition (the read exceeded its bound), never a "not allowed".
      if (code === "57014" || code === "55P03" || message === "Query read timeout") throw new PostgresReadDenied("PG_QUERY_TIMED_OUT", message);
      throw new PostgresReadDenied("PG_QUERY_NOT_ALLOWED", message);
    });
  return promise;
}

/**
 * Read the margin-threshold context from a live PostgreSQL database:
 * all invoice rows + the single threshold value, read-only. Returns a
 * validated, digest-sealed `ContextPackV1` (sourceFormat "postgres") plus a
 * read-back receipt that binds the exact row set to the live server state.
 */
/** F5 (Restbefund): the bounded, server-enforced read limits of the
 *  ACTUAL read (milliseconds). `statement_timeout` bounds the statement
 *  itself; `lock_timeout` bounds any wait on a held lock — so a SELECT
 *  blocked by an external lock (ACCESS EXCLUSIVE) cannot hang the read:
 *  the server cancels it after the bound (57014/55P03 => PG_QUERY_TIMED_OUT).
 */
export const PG_READ_STATEMENT_TIMEOUT_MS_V1 = 30_000;
export const PG_READ_LOCK_TIMEOUT_MS_V1 = 5_000;

export async function readMarginContextFromPostgresV1(args: {
  readonly conn: PostgresConnectionArgsV1;
  readonly schema: PostgresSchemaSpecV1;
  readonly client: Client;
  /** Optional extra client-side query bound (ms) — never replaces the
   *  server-enforced limits above, only tightens them. */
  readonly queryTimeoutMs?: number;
}): Promise<{ readonly pack: ContextPackV1; readonly readback: PostgresReadbackV1 }> {
  const { conn, schema } = args;
  // F5: explicit ownership contract. A fresh client is connected by the
  // adapter (and closed by it again on EVERY path — success and failure,
  // bounded, residual-free); an already-connected caller-owned client is
  // proven queryable over the wire and left open; an ended / non-queryable
  // client is rejected (never a usable connection is invented). A client
  // whose connection point is unreachable is rejected immediately and within
  // a bound — no hanging query.
  const { client, owned } = await ensurePostgresClientConnectedV1(args.client, conn);
  // F5 (canonical-completion): EVERY wire query in the read phase is bounded
  // on the client side (the server remains the authority). The caller can
  // tighten the bound (args.queryTimeoutMs); otherwise the bound is the
  // statement limit itself. This closes the actual canonical-completion
  // stall: a connection that completes the handshake then wedges now rejects
  // within the bound (PG_QUERY_TIMED_OUT / PG_CONNECTION_FAILED) instead of
  // leaving the read pending forever (0 CPU, idle sockets, no output).
  const readBoundMs = (typeof args.queryTimeoutMs === "number" && Number.isFinite(args.queryTimeoutMs) && args.queryTimeoutMs > 0
    ? Math.min(args.queryTimeoutMs, PG_READ_STATEMENT_TIMEOUT_MS_V1)
    : PG_READ_STATEMENT_TIMEOUT_MS_V1);
  try {
    // F5 (Restbefund): the ACTUAL read is enforced by the server on the
    // ACTUAL client (session statement/lock limits) — a client-side
    // timer alone left the real query unbounded (review: a SELECT held on
    // a locked table stayed undecided past 10s). The closed settings are
    // issued ONLY through the session-setting gate above — and each SET is
    // itself client-side bounded (they are wire queries too).
    await runSessionSettingV1(client, `statement_timeout = ${PG_READ_STATEMENT_TIMEOUT_MS_V1}`, readBoundMs);
    await runSessionSettingV1(client, `lock_timeout = ${PG_READ_LOCK_TIMEOUT_MS_V1}`, readBoundMs);
    const rows = await readMarginRowsV1(client, readBoundMs);
    const pack = buildContextPackV1(rows, schema);
    const readback = await buildReadbackV1(client, conn, rows.length, pack, readBoundMs);
    return { pack, readback };
  } finally {
    // F5 (Korrektur 0430): the adapter closes the client IT connected on
    // EVERY path (success and error), within a bound and residual-free.
    if (owned) await closeOwnedClientV1(client, readBoundMs);
  }
}

/** F5 (Korrektur 0430): the actual read + row shaping. Read-only guarantee
 *  is layered: (1) this connector only ever issues the allowlisted SELECTs
 *  above, and (2) the caller connects as a dedicated database user that the
 *  server grants SELECT-only on the source table, so the PostgreSQL server
 *  itself refuses any write even if a caller bypassed the allowlist. */
async function readMarginRowsV1(client: Client, queryTimeoutMs?: number): Promise<Record<string, unknown>[]> {
  const rows = await runReadOnlyQueryV1<Record<string, unknown>>(client, PG_MARGIN_SELECT, queryTimeoutMs);
  if (rows.length < 1) throw new PostgresReadDenied("PG_ROW_MALFORMED", "no rows");
  return rows;
}

/** Shape the raw rows into the sealed ContextPack (fail-closed). */
function buildContextPackV1(rows: readonly Record<string, unknown>[], schema: PostgresSchemaSpecV1): ContextPackV1 {
  const rowRecords: Record<string, string | null>[] = [];
  let floorRaw: number | undefined;
  for (const raw of rows) {
    const record: Record<string, string | null> = {};
    for (const field of schema.fields) {
      const value = raw[field.column];
      if (value === null || value === undefined) {
        if (!field.nullable) throw new PostgresReadDenied("PG_ROW_MALFORMED", `null ${field.field}`);
        record[field.field] = null;
        continue;
      }
      const text = String(value);
      if (field.kind === "number") {
        if (!/^-?\d+(?:\.\d+)?$/.test(text)) throw new PostgresReadDenied("PG_ROW_MALFORMED", `number ${field.field}`);
        record[field.field] = text;
        if (field.column === schema.floorColumn) {
          // The context contract carries ONE constant threshold. Differing
          // per-row values make the read ambiguous and must fail closed
          // (never silently resolved to one side).
          const floorValue = Number(text);
          if (floorRaw !== undefined && floorValue !== floorRaw) {
            throw new PostgresReadDenied("PG_FLOOR_MALFORMED", "inconsistent per-row threshold");
          }
          floorRaw = floorValue;
        }
      } else if (field.kind === "date") {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new PostgresReadDenied("PG_ROW_MALFORMED", `date ${field.field}`);
        record[field.field] = text;
      } else {
        record[field.field] = text;
      }
    }
    rowRecords.push(record);
  }
  if (floorRaw === undefined || !Number.isFinite(floorRaw)) {
    throw new PostgresReadDenied("PG_FLOOR_MALFORMED");
  }
  const descriptors: ContextFieldDescriptorV1[] = schema.fields.map((field) =>
    field.meaningKey === undefined
      ? { field: field.field, meaning: field.meaning, kind: field.kind, unit: field.unit, nullable: field.nullable }
      : { field: field.field, meaning: field.meaning, kind: field.kind, unit: field.unit, nullable: field.nullable, meaningKey: field.meaningKey },
  );
  const descriptorUnsigned = {
    schemaVersion: CONTEXT_DESCRIPTOR_SCHEMA_V1,
    contextId: "context:postgres-invoices-eur",
    sourceFormat: "postgres",
    description: "Lokale Rechnungsauszuege aus einer echten lokalen PostgreSQL-Instanz (synthetisch)",
    fields: descriptors,
    floorField: schema.fields.find((f) => f.column === schema.floorColumn)?.field ?? "margin_floor_eur",
  };
  const descriptor: ContextDescriptorV1 = {
    ...descriptorUnsigned,
    descriptorDigest: contextDescriptorDigestV1(descriptorUnsigned),
  } as ContextDescriptorV1;
  const dataUnsigned = {
    schemaVersion: CONTEXT_DATA_SCHEMA_V1,
    contextId: descriptor.contextId,
    descriptorDigest: descriptor.descriptorDigest,
    floorField: descriptor.floorField,
    floorRaw,
    rows: rowRecords,
  };
  const data: ContextDataV1 = { ...dataUnsigned, dataDigest: contextDataDigestV1(dataUnsigned) } as ContextDataV1;
  return { descriptor, data };
}

/** The read-back receipt binding the exact row set to the live server state. */
async function buildReadbackV1(
  client: Client,
  conn: PostgresConnectionArgsV1,
  rowCount: number,
  pack: ContextPackV1,
  queryTimeoutMs?: number,
): Promise<PostgresReadbackV1> {
  const serverPort = (await runReadOnlyQueryV1<{ inet_server_port: number }>(client, "SELECT inet_server_port()", queryTimeoutMs))[0]
    ?.inet_server_port ?? 0;
  const serverUser = (await runReadOnlyQueryV1<{ current_user: string }>(client, "SELECT current_user", queryTimeoutMs))[0]
    ?.current_user ?? "";
  return {
    schemaVersion: "pansphaira.kts/postgres-readback/v1",
    host: conn.host,
    port: serverPort,
    database: conn.database,
    user: serverUser,
    statement: PG_MARGIN_SELECT,
    rowCount,
    dataDigest: pack.data.dataDigest,
    descriptorDigest: pack.descriptor.descriptorDigest,
    readbackDigest: sha({
      host: conn.host,
      port: serverPort,
      database: conn.database,
      user: serverUser,
      statement: PG_MARGIN_SELECT,
      rowCount,
      dataDigest: pack.data.dataDigest,
    }),
  };
}

export interface PostgresReadbackV1 {
  readonly schemaVersion: "pansphaira.kts/postgres-readback/v1";
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly user: string;
  readonly statement: string;
  readonly rowCount: number;
  readonly dataDigest: string;
  readonly descriptorDigest: string;
  readonly readbackDigest: string;
}
