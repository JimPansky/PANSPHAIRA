/**
 * KTS-03/04 — shared real-PostgreSQL harness.
 *
 * One place owns how a REAL local PostgreSQL server is started, seeded with
 * fictitious rows, given a dedicated read-only user, and torn down
 * residual-free. The KTS-03 adapter test and the KTS-04 user path/CLI both
 * use this — no duplicated server logic.
 */
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import { createServer } from "node:net";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** True when something is already LISTENING on 127.0.0.1:port. */
function portIsBusy(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const s = createServer();
    s.once("error", () => resolve(true));
    s.listen(port, "127.0.0.1", () => {
      s.close(() => resolve(false));
    });
  });
}

/**
 * Kill the postgres postmaster owning a data dir (last resort, environment-
 * robust teardown). On slow-fsync sandboxes the graceful shutdown checkpoint
 * can take ~100 s; the test lifecycle must stay bounded, so a stuck server
 * is signaled and, if still holding the port, killed. Residual-free: the
 * data dir is removed by the caller afterwards.
 */
/**
 * Find the pid of the postmaster owning `dataDir`. Authoritative source is
 * the `postmaster.pid` file; if that is already gone but the dir is still
 * held (a force-killed run's postmaster is mid-checkpoint), fall back to a
 * /proc cmdline scan for a postgres process naming the data dir.
 */
function findPostmasterPidFor(dataDir: string): number | null {
  try {
    const firstLine = readFileSync(path.join(dataDir, "postmaster.pid"), "utf8").split("\n")[0];
    const pid = firstLine === undefined ? Number.NaN : Number(firstLine.trim());
    if (Number.isInteger(pid) && pid > 1) return pid;
  } catch {
    /* no pid file — try the /proc fallback */
  }
  try {
    for (const entry of readdirSync("/proc")) {
      if (!/^\d+$/.test(entry)) continue;
      try {
        const cmd = readFileSync(path.join("/proc", entry, "cmdline"), "utf8").split("\0").filter(Boolean).join(" ");
        if (/postgres/.test(cmd) && cmd.includes(dataDir)) return Number(entry);
      } catch {
        /* proc entry gone or unreadable — skip */
      }
    }
  } catch {
    /* no /proc — nothing to find */
  }
  return null;
}

/**
 * Kill the postgres postmaster owning a data dir (last resort, environment-
 * robust teardown). On slow-fsync sandboxes the graceful shutdown checkpoint
 * can take ~100 s; the test lifecycle must stay bounded, so a stuck server
 * is signaled and, if still holding the port, killed. Residual-free: the
 * data dir is removed by the caller afterwards.
 */
async function killPostmasterFor(dataDir: string, timeoutMs = 15_000): Promise<void> {
  const pid = findPostmasterPidFor(dataDir);
  if (pid === null) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return; // already gone
  }
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (!(await portIsBusy(PG_PORT))) return;
    if (Date.now() >= deadline) {
      try { process.kill(pid, "SIGKILL"); } catch { /* gone */ }
      await sleep(500);
      return;
    }
    await sleep(200);
  }
}

/**
 * Residual-free: after a best-effort `rmSync`, verify the data dir is truly
 * gone. A force-killed previous run can leave an ORPHANED postmaster (its
 * parent node process died) that is still mid-shutdown-checkpoint — the
 * port may already be free, so the port-busy check alone would miss it, and
 * the half-hold blocks `rmSync` so `initdb` would PANIC on a non-empty dir.
 * Kill the holder (bounded) and purge before initialising.
 */
async function purgeDataDir(dataDir: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!existsSync(dataDir)) return;
    await killPostmasterFor(dataDir, 10_000);
    await sleep(400);
    rmSync(dataDir, { recursive: true, force: true });
  }
}

/**
 * Wait until the port is free (a previous embedded instance may still be
 * shutting down — cross-file serial runs must not race on the socket).
 * Throws after the bound instead of hanging.
 */
async function waitForPortFree(port: number, timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (!(await portIsBusy(port))) return;
    if (Date.now() >= deadline) {
      throw new Error(`PG_PORT_${port}_STILL_BUSY`);
    }
    await sleep(200);
  }
}

/** Wait until the server actually ACCEPTS connections on the port. */
async function waitForServerAccepting(port: number, timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const probe = new Client({ host: "127.0.0.1", port, database: "postgres", user: PG_ADMIN_USER, password: PG_ADMIN_PASSWORD, connectionTimeoutMillis: 1500 });
      await probe.connect();
      await probe.end();
      return;
    } catch {
      if (Date.now() >= deadline) throw new Error(`PG_PORT_${port}_NOT_ACCEPTING`);
      await sleep(200);
    }
  }
}
import { PG_MARGIN_SELECT, type PostgresSchemaSpecV1 } from "./postgres-source.js";

export const PG_PORT = 54431;
export const PG_DATABASE = "kts_pg";
export const PG_ADMIN_USER = "kts";
export const PG_ADMIN_PASSWORD = "kts-local-test-only";
export const PG_RO_USER = "kts_ro";
export const PG_RO_PASSWORD = "kts-ro-local-test-only";

/** Fictitious rows: same shape as KTS-02 context B (EUR main unit, German
 * field names, third customer null) — served from a real PG table. */
export const SEED_ROWS: readonly (string | null)[][] = [
  ["rechnung:101", "bestellung:101", "kunde:101", "29.99", "EUR", "2026-08-01", "30.00"],
  ["rechnung:102", "bestellung:102", "kunde:102", "30.00", "EUR", "2026-08-15", "30.00"],
  ["rechnung:103", "bestellung:103", null, "25.00", "EUR", "2026-09-01", "30.00"],
];

export const PG_SCHEMA: PostgresSchemaSpecV1 = {
  table: "kts_invoices",
  floorColumn: "grenzwert_eur",
  orderColumn: "kts_invoice_id",
  fields: [
    { column: "kts_invoice_id", field: "rechnung_nr", meaning: "Rechnungsnummer", kind: "string", unit: null, nullable: false },
    { column: "kts_order_id", field: "bestellung_nr", meaning: "Bestellnummer", kind: "string", unit: null, nullable: false },
    { column: "kts_customer_id", field: "kunden_nr", meaning: "Kundennummer", kind: "string", unit: null, nullable: true },
    // Closed key channel: the meaningKey is the spec field's closed
    // professional identifier (INVOICE_TOTAL_GROSS) — the key, not a text
    // guess, is the evidence of the meaning.
    { column: "betrag_eur", field: "betrag_eur", meaning: "Rechnungsbetrag in Euro (Hauptwaehrung)", kind: "number", unit: "eur", nullable: false, meaningKey: "INVOICE_TOTAL_GROSS" },
    { column: "waehrung", field: "waehrung", meaning: "Waehrungscode", kind: "string", unit: null, nullable: false },
    { column: "faellig", field: "faellig", meaning: "Faelligkeitsdatum", kind: "date", unit: null, nullable: false },
    { column: "grenzwert_eur", field: "grenzwert_eur", meaning: "Mindestgrenzwert pro Rechnung in Euro", kind: "number", unit: "eur", nullable: false },
  ],
};

export interface PgHarness {
  readonly instance: EmbeddedPostgres;
  readonly admin: Client;
  readonly ro: Client;
  readonly dataDir: string;
  readonly statement: string;
  stop: () => Promise<void>;
}

/**
 * Start a real local PostgreSQL server, seed the fictitious invoice table and
 * create a dedicated read-only user (the server grants SELECT only). Returns
 * live admin + read-only clients. `stop()` tears the server down and removes
 * the data directory (residual-free).
 */
export async function startRealPostgres(dataDir: string): Promise<PgHarness> {
  // A force-killed previous run (or a slow-fsync shutdown in progress) may
  // still hold the port: clear the residual postmaster before initialising.
  if (await portIsBusy(PG_PORT)) {
    await killPostmasterFor(dataDir, 15_000);
  }
  await waitForPortFree(PG_PORT, 30_000);
  rmSync(dataDir, { recursive: true, force: true });
  // Residual-free: a force-killed run can leave an orphaned postmaster still
  // holding the dir (port already free). Purge before initdb — initdb on a
  // non-empty / half-held dir PANICs.
  await purgeDataDir(dataDir);
  const instance = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: PG_ADMIN_USER,
    password: PG_ADMIN_PASSWORD,
    port: PG_PORT,
    persistent: true,
    // All harness/CLI clients use loopback TCP. Disable the unused Unix
    // listener instead of relocating it: checkout-derived paths can exceed
    // the AF_UNIX pathname limit, while host /tmp can exhaust its lock space.
    // Empty unix_socket_directories creates no socket or socket-lock file;
    // it does not weaken TCP authentication, SQL grants, or owned teardown.
    postgresFlags: ["-c", "unix_socket_directories="],
  });
  await instance.initialise();
  await instance.start();
  await waitForServerAccepting(PG_PORT);
  await instance.createDatabase(PG_DATABASE);
  // Environment-robust lifecycle: on slow-fsync sandboxes (this box syncs
  // ~50 KB/s) a shutdown checkpoint can take ~100 s, which would blow every
  // test bound. A throwaway test instance commits with synchronous_commit=off
  // — the shutdown checkpoint then completes quickly and stop() is bounded.
  {
    const cfg = new Client({ host: "127.0.0.1", port: PG_PORT, database: PG_DATABASE, user: PG_ADMIN_USER, password: PG_ADMIN_PASSWORD });
    await cfg.connect();
    await cfg.query("ALTER SYSTEM SET synchronous_commit = off");
    await cfg.end();
    const re = new Client({ host: "127.0.0.1", port: PG_PORT, database: PG_DATABASE, user: PG_ADMIN_USER, password: PG_ADMIN_PASSWORD });
    await re.connect();
    await re.query("SELECT pg_reload_conf()");
    await re.end();
  }
  const admin: Client = new Client({
    host: "127.0.0.1",
    port: PG_PORT,
    database: PG_DATABASE,
    user: PG_ADMIN_USER,
    password: PG_ADMIN_PASSWORD,
  });
  await admin.connect();
  await admin.query(`CREATE TABLE kts_invoices (
    kts_invoice_id text NOT NULL PRIMARY KEY,
    kts_order_id text NOT NULL,
    kts_customer_id text,
    betrag_eur numeric(10,2) NOT NULL,
    waehrung text NOT NULL,
    faellig text NOT NULL,
    grenzwert_eur numeric(10,2) NOT NULL
  )`);
  for (const row of SEED_ROWS) {
    await admin.query("INSERT INTO kts_invoices VALUES ($1,$2,$3,$4,$5,$6,$7)", row as unknown as (string | number)[]);
  }
  await admin.query(`CREATE ROLE ${PG_RO_USER} WITH LOGIN PASSWORD '${PG_RO_PASSWORD}'`);
  await admin.query(`GRANT CONNECT ON DATABASE ${PG_DATABASE} TO ${PG_RO_USER}`);
  await admin.query(`GRANT USAGE ON SCHEMA public TO ${PG_RO_USER}`);
  await admin.query(`GRANT SELECT ON kts_invoices TO ${PG_RO_USER}`);
  const ro: Client = new Client({
    host: "127.0.0.1",
    port: PG_PORT,
    database: PG_DATABASE,
    user: PG_RO_USER,
    password: PG_RO_PASSWORD,
  });
  await ro.connect();
  return {
    instance,
    admin,
    ro,
    dataDir,
    statement: PG_MARGIN_SELECT,
    stop: async () => {
      try {
        await ro.end();
      } catch {
        /* already closed */
      }
      try {
        await admin.end();
      } catch {
        /* already closed */
      }
      await Promise.race([
        instance.stop(),
        new Promise<void>((_, reject) => {
          const t = setTimeout(() => reject(new Error("pg-stop-timeout")), 60_000);
          t.unref?.();
        }),
      ]).catch(() => {
        /* bounded: a stuck shutdown must never hang the process */
      });
      // Environment-robust: on slow-fsync sandboxes the shutdown checkpoint
      // can take ~100 s. If the port is still held after the bound, kill the
      // postmaster so the next test (and the process exit) can proceed.
      if (await portIsBusy(PG_PORT)) {
        await killPostmasterFor(dataDir, 15_000);
        await waitForPortFree(PG_PORT, 15_000).catch(() => {
          /* residual-free: the data dir is removed below regardless */
        });
      }
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

export function pgDataDirFor(repoRoot: string): string {
  return path.join(repoRoot, ".kts-pg-data");
}
