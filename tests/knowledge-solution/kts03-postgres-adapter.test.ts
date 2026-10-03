/**
 * KTS-03 — echte lokale lesende Systemanbindung (PostgreSQL).
 *
 * Proves: a REAL locally-operated PostgreSQL server (embedded-postgres, real
 * initdb + real postgres process + real TCP port + real `pg` wire protocol)
 * serves the margin-threshold context; the connector is read-only (bounded
 * allowlisted SELECT; injection denied; a dedicated read-only database user
 * makes the SERVER itself refuse writes); and the SAME sealed spec digest and
 * the SAME guided path / method core (no core rewrite) adapt and execute the
 * PostgreSQL context with the deterministic result expected for the data.
 * Compiled test: dist/tests/knowledge-solution/kts03-postgres-adapter.test.js
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { Client } from "pg";
import { validateMethodSpecV1, type MethodSpecV1 } from "../../packages/knowledge-solution/src/method-core.js";
import {
  loadMethodLibraryV1,
  buildLibraryViewV1,
} from "../../packages/knowledge-solution/src/method-library.js";
import type { ContextPackV1 } from "../../packages/knowledge-solution/src/context-source.js";
import {
  GuidedPathBuilder,
  GuidedPathDenied,
  adaptContextToMarginInputsV1,
} from "../../packages/knowledge-solution/src/guided-path.js";
import {
  PG_ALLOWED_QUERIES_V1,
  PG_MARGIN_SELECT,
  PostgresReadDenied,
  readMarginContextFromPostgresV1,
  runReadOnlyQueryV1,
} from "../../packages/knowledge-solution/src/postgres-source.js";
import {
  PG_DATABASE,
  PG_PORT,
  PG_RO_PASSWORD,
  PG_RO_USER,
  PG_SCHEMA,
  pgDataDirFor,
  startRealPostgres,
  type PgHarness,
} from "../../packages/knowledge-solution/src/pg-harness.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..", "..");
const PKG = path.join(ROOT, "packages", "knowledge-solution");
const NOW_MS = 1758532800000;
const DATA_DIR = pgDataDirFor(ROOT);

// Fullproof V2 failed before TCP admission because the checkout-derived
// Unix socket pathname exceeded PostgreSQL's 107-byte limit. Exercise the
// real shared harness with a deliberately longer path, not a mocked server.
test("KTS-03 TCP-only harness boots from a long checkout path and leaves zero owned residue", async () => {
  const longDataDir = path.join(DATA_DIR, "long-checkout-" + "x".repeat(112));
  assert.ok(Buffer.byteLength(path.join(longDataDir, `.s.PGSQL.${PG_PORT}`)) > 107);
  const harness = await startRealPostgres(longDataDir);
  try {
    const sockets = await harness.admin.query<{ unix_socket_directories: string }>("SHOW unix_socket_directories");
    assert.equal(sockets.rows[0]?.unix_socket_directories, "");
    const readback = await readMarginContextFromPostgresV1({
      conn: { host: "127.0.0.1", port: PG_PORT, database: PG_DATABASE, user: PG_RO_USER, password: PG_RO_PASSWORD },
      schema: PG_SCHEMA,
      client: harness.ro,
    });
    assert.equal(readback.readback.rowCount, 3);
    assert.equal(existsSync(path.join(longDataDir, `.s.PGSQL.${PG_PORT}`)), false);
  } finally {
    await harness.stop();
  }
  assert.equal(existsSync(longDataDir), false);
});

const loadSpec = (): MethodSpecV1 => {
  const spec = JSON.parse(readFileSync(path.join(PKG, "specs", "margin-threshold.spec.json"), "utf8")) as unknown;
  if (!validateMethodSpecV1(spec)) throw new Error("SPEC_DENIED");
  return spec;
};

const loadLibrary = () =>
  loadMethodLibraryV1({
    corpusRoot: path.join(PKG, "corpus"),
    packageRoot: PKG,
    profile: JSON.parse(readFileSync(path.join(PKG, "profiles", "corpus-profile.json"), "utf8")),
    nowMs: NOW_MS,
  });



test("KTS-03 real local PostgreSQL serves the context and the SAME sealed method core executes it", async () => {
  const harness = await startRealPostgres(DATA_DIR);
  try {
    // 1) A real, real server: version + port come from the live process.
    const versionRow = await runReadOnlyQueryV1<{ version: string }>(harness.admin, "SELECT version()");
    assert.match(versionRow[0]?.version ?? "", /^PostgreSQL 1\d\./);

    // 2) The connector reads the context read-only through the wire protocol.
    const { pack, readback } = await readMarginContextFromPostgresV1({
      conn: { host: "127.0.0.1", port: PG_PORT, database: PG_DATABASE, user: PG_RO_USER, password: PG_RO_PASSWORD },
      schema: PG_SCHEMA,
      client: harness.ro,
    });
    assert.equal(pack.descriptor.sourceFormat, "postgres");
    assert.equal(readback.rowCount, 3);
    assert.equal(readback.port, PG_PORT);
    assert.equal(readback.user, PG_RO_USER);
    assert.equal(readback.statement, PG_MARGIN_SELECT);
    assert.equal(pack.data.floorRaw, 30);
    assert.equal(pack.data.rows.length, 3);

    // 3) The SAME sealed spec (no core rewrite): the library view resolves the
    // goal and the spec digest equals the registry-pinned sealed digest.
    const spec = loadSpec();
    const registry = JSON.parse(readFileSync(path.join(PKG, "registry", "method-registry.json"), "utf8")) as {
      specs: { methodId: string; specDigest: string }[];
    };
    const pinned = registry.specs.find((s) => s.methodId === spec.methodId);
    assert.ok(pinned !== undefined, "sealed spec must be pinned in the registry");
    assert.equal(spec.specDigest, pinned?.specDigest, "the executed spec is the sealed one (no rewrite)");

    const builder = GuidedPathBuilder.fromContext({ pack, spec });
    builder.recordGoal();
    const goalStep = builder.build().steps.find((s) => s.kind === "GOAL_RECORDED");
    const view = buildLibraryViewV1({ library: loadLibrary(), goal: goalStep?.payload.goal as never, nowMs: NOW_MS });
    const proposal = builder.attachSelection(view);
    builder.recordProposal();
    const blocking = proposal.openQuestions.filter((q) => q.options.length > 0);
    assert.equal(blocking.length, 1, "the nullable kunden_nr requires exactly one Rückfrage");
    assert.equal(blocking[0]?.field, "kunden_nr");
    builder.answer(blocking[0]?.questionId ?? "", "behandele_unbekannt_flaggen", NOW_MS + 1000);
    const updated = builder.proposal();
    assert.equal(updated.openQuestions.filter((q) => q.options.length > 0).length, 0);
    builder.confirmMapping("decision:mapping-pg", "principal:finance-reviewer", NOW_MS + 2000);
    const inputs = adaptContextToMarginInputsV1({ context: builder.build().context, mapping: updated, pack });
    assert.deepEqual(inputs.invoices.map((i) => i.totalMinor), [2999, 3000, 2500], "EUR main unit -> minor conversion");
    assert.equal(inputs.marginFloorEur, 30);
    const executionDecision = builder.confirmExecution("decision:execution-pg", "principal:finance-reviewer", inputs, NOW_MS + 3000);
    const receipt = builder.execute(executionDecision, inputs);
    assert.equal(receipt.outcome, "EXECUTED");
    assert.equal(receipt.ruleProvenance, "DETERMINISTIC_RULES");
    assert.deepEqual(receipt.result?.flagged, [
      { recordId: "rechnung:101", valueMinor: 2999, reason: "BELOW_THRESHOLD" },
      { recordId: "rechnung:103", valueMinor: 2500, reason: "BELOW_THRESHOLD_CUSTOMER_UNKNOWN" },
    ]);
    assert.equal(receipt.result?.count, 2);
    assert.equal(receipt.result?.totalInputMinor, 8499);
    assert.equal(builder.build().terminal, "EXECUTED");
    assert.equal(receipt.specDigest, pinned.specDigest);
  } finally {
    await harness.stop();
  }
});

test("KTS-03 the connector is read-only: non-allowlisted SQL is denied before it reaches the server", () => {
  const admin = new Client();
  // connect() is never called — the denial must happen BEFORE any connection.
  for (const statement of [
    "SELECT * FROM kts_invoices WHERE kts_invoice_id = 'rechnung:101' -- comment",
    "SELECT * FROM kts_invoices; DROP TABLE kts_invoices;",
    "INSERT INTO kts_invoices VALUES ('rechnung:999','bestellung:999','kunde:999','1.00','EUR','2026-01-01','30.00')",
    "UPDATE kts_invoices SET waehrung = 'USD'",
    "DELETE FROM kts_invoices",
    "ALTER TABLE kts_invoices DROP COLUMN waehrung",
  ]) {
    assert.throws(() => {
      try {
        runReadOnlyQueryV1(admin, statement);
      } catch (error) {
        throw error;
      }
    }, (error: unknown) => error instanceof PostgresReadDenied);
  }
  assert.ok(PG_ALLOWED_QUERIES_V1.includes(PG_MARGIN_SELECT));
});

test("KTS-03 the PostgreSQL server itself refuses writes for the read-only user", async () => {
  const harness = await startRealPostgres(DATA_DIR);
  try {
    // The connector allowlist never issues writes, but even a direct
    // (bypassing) write by the dedicated user is refused BY THE SERVER.
    let serverError: unknown;
    try {
      await harness.ro.query("UPDATE kts_invoices SET waehrung = 'USD' WHERE kts_invoice_id = 'rechnung:101'");
    } catch (error) {
      serverError = error;
    }
    assert.ok(serverError instanceof Error, "the server must refuse the write");
    assert.equal((serverError as { code?: string }).code, "42501", "server-side insufficient_privilege");
    // The data is untouched.
    const after = await harness.admin.query("SELECT count(*)::int AS n FROM kts_invoices WHERE waehrung = 'USD'");
    assert.equal(after.rows[0]?.n, 0);
    // CREATE ROLE / DDL by the read-only user is also refused by the server.
    let ddlError: unknown;
    try {
      await harness.ro.query("CREATE TABLE kts_evil (id text)");
    } catch (error) {
      ddlError = error;
    }
    assert.ok(ddlError instanceof Error, "the server must refuse DDL");
    assert.equal((ddlError as { code?: string }).code, "42501");
  } finally {
    await harness.stop();
  }
});

test("KTS-03 residual-free removal: data directory is gone and nothing lingers", async () => {
  const harness = await startRealPostgres(DATA_DIR);
  await harness.stop();
  assert.equal(existsSync(DATA_DIR), false, "the PG data dir must be removed on stop");
});
