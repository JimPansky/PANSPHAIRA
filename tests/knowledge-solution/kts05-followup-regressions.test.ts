/**
 * KTS-05 — Review-Follow-up-Regressionen F1–F5 (RED→GREEN).
 *
 * Converts the INDEPENDENT REVIEW's concrete counterexamples
 * (KTS-REVIEW-FOLLOWUP.md, baseline 35e9fd8) into executable regressions:
 *
 * F1 — the production CLI path executes only on EXPLICIT user decisions:
 *      EOF / missing answer / decline never yields a receipt (asserted via
 *      the child-process CLI in KTS-04 smoke + here at the path level).
 * F2 — wrong or ambiguous field meanings are ACTUALLY clarified, never
 *      "first field wins": contradicting declared meaning => blocking
 *      Rückfrage (explicit confirm-with-declaration or decline); multiple
 *      alias candidates => explicit user choice sealed into the proposal.
 * F3 — suitability is INTENTION-based, not output-shape-based: an overdue-
 *      instead-of-amount goal (and a contradicting constraint) must yield
 *      NO_MATCH/UNKNOWN, never SELECTED; the matching closed intention
 *      selects.
 * F4 — the REAL clock drives the path: a freshly loaded library must become
 *      UNKNOWN (and the path DENIED) once the observation is older than the
 *      knowledge window — even for the cached library object.
 * F5 — PostgreSQL connection OWNERSHIP: a fresh client is connected (and
 *      closed) by the adapter and must read; a fresh client against a dead
 *      endpoint is rejected immediately and within a bound (no hang); an
 *      already-connected client stays caller-owned.
 *
 * Compiled test: dist/tests/knowledge-solution/kts05-followup-regressions.test.js
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createConnection, createServer, type Socket } from "node:net";
import path from "node:path";
import test, { after } from "node:test";
import { Client } from "pg";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  validateMethodGoalV1,
  validateMethodSpecV1,
  type MethodGoalV1,
  type MethodSpecV1,
} from "../../packages/knowledge-solution/src/method-core.js";
import {
  buildLibraryViewV1,
  loadMethodLibraryV1,
  METHOD_GOAL_OBJECTIVE_CHOICES_V1,
} from "../../packages/knowledge-solution/src/method-library.js";
import { canonicalJson } from "../../packages/contracts/src/canonical-json.js";

import {
  contextDataDigestV1,
  contextDescriptorDigestV1,
  loadContextPackV1,
  type ContextPackV1,
} from "../../packages/knowledge-solution/src/context-source.js";
import {
  GuidedPathBuilder,
  GuidedPathDenied,
  adaptContextToMarginInputsV1,
} from "../../packages/knowledge-solution/src/guided-path.js";
import { runUserPathV1 } from "../../packages/knowledge-solution/src/user-path.js";
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
import {
  PostgresReadDenied,
  readMarginContextFromPostgresV1,
} from "../../packages/knowledge-solution/src/postgres-source.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..", "..");
const PKG = path.join(ROOT, "packages", "knowledge-solution");
const NOW_MS = 1758532800000; // 2026-09-22T09:20:00Z (inside the re-observed edition window)
const EXPIRED_MS = NOW_MS + 800 * 24 * 60 * 60 * 1000; // beyond the 365d knowledge window
const DATA_DIR = pgDataDirFor(ROOT);

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

const marginGoal: MethodGoalV1 = {
  schemaVersion: "pansphaira.kts/method-goal/v1",
  goalId: "goal:kts05-margin",
  actor: "principal:finance-reviewer",
  objective: "Rechnungen unterhalb eines Mindestgrenzwerts pruefen und markieren",
  requestedOutcome: "FLAG_RECORDS",
  constraints: ["nur lokale, synthetische Daten", "keine Modellausfuehrung"],
};

/* ------------------------------------------------------------------ */
/* F3 — intention-based suitability (not output-shape-based)           */
/* ------------------------------------------------------------------ */

test("F3 counterexample: overdue-instead-of-amount goal never SELECTED (UNKNOWN/NO_MATCH)", () => {
  const pack = loadContextPackV1(path.join(PKG, "contexts", "invoices-eur-cent"));
  const spec = loadSpec();
  const overdueGoal: MethodGoalV1 = {
    schemaVersion: "pansphaira.kts/method-goal/v1",
    goalId: "goal:kts05-overdue",
    actor: "principal:finance-reviewer",
    objective: "Markiere nur ueberfaellige Rechnungen anhand des Faelligkeitsdatums, unabhaengig vom Rechnungsbetrag",
    requestedOutcome: "FLAG_RECORDS",
    constraints: ["Keine Betragsgrenzwertpruefung"],
  };
  const library = loadLibrary();
  const view = buildLibraryViewV1({ library, goal: overdueGoal, nowMs: NOW_MS });
  // The method checks amounts only — an overdue goal is NOT its intention.
  assert.notEqual(view.selection.outcome, "SELECTED");
  assert.equal(view.selection.selected, null);
  assert.equal(view.selection.outcome, "UNKNOWN");
  const marginRejection = view.selection.rejected.find((r) => r.methodId === "method:margin-threshold-v1");
  assert.ok(marginRejection !== undefined, "margin-threshold must be rejected with closed reasons");
  assert.ok(marginRejection?.reasons.includes("INTENTION_UNRESOLVED"));
  // The guided path must fail closed (no proposal, no execution).
  const builder = GuidedPathBuilder.fromContext({ pack, spec, goal: overdueGoal });
  builder.recordGoal();
  assert.throws(() => builder.attachSelection(view), (error: unknown) =>
    error instanceof GuidedPathDenied && /SELECTION_/.test((error as GuidedPathDenied).code));
});

test("F3 counterexample: contradicting constraint (no amount threshold) => NO_MATCH", () => {
  const pack = loadContextPackV1(path.join(PKG, "contexts", "invoices-eur-cent"));
  const spec = loadSpec();
  const constrainedGoal: MethodGoalV1 = {
    ...marginGoal,
    goalId: "goal:kts05-constraint-conflict",
    constraints: ["Keine Betragsgrenzwertpruefung"],
  };
  const view = buildLibraryViewV1({ library: loadLibrary(), goal: constrainedGoal, nowMs: NOW_MS });
  assert.notEqual(view.selection.outcome, "SELECTED");
  assert.equal(view.selection.outcome, "NO_MATCH");
  assert.ok(view.selection.rejected.some((r) =>
    r.methodId === "method:margin-threshold-v1" && r.reasons.includes("CONSTRAINT_CONFLICT")));
});

test("F3 positive: the matching closed intention ('below minimum amount') SELECTS margin-threshold", () => {
  const view = buildLibraryViewV1({ library: loadLibrary(), goal: marginGoal, nowMs: NOW_MS });
  assert.equal(view.selection.outcome, "SELECTED");
  assert.equal(view.selection.selected?.methodId, "method:margin-threshold-v1");
  assert.ok(view.selection.selected?.reasons.includes("INTENTION_MATCHED"));
});

/* ------------------------------------------------------------------ */
/* F2 — meaning check + real clarification of contradictory aliases    */
/* ------------------------------------------------------------------ */

/** Re-sealed temp context (valid descriptor/data digests, unchanged spec). */
const tempPack = (mutate: (descriptor: Record<string, unknown>, rows: Record<string, string | null>[]) => void): ContextPackV1 => {
  const base = loadContextPackV1(path.join(PKG, "contexts", "invoices-eur-cent"));
  const descriptor: Record<string, unknown> = { ...base.descriptor, fields: base.descriptor.fields.map((f) => ({ ...f })) };
  const rows = base.data.rows.map((row) => ({ ...row }));
  mutate(descriptor, rows);
  const descriptorDigest = contextDescriptorDigestV1(descriptor as never);
  const unsignedData = {
    schemaVersion: base.data.schemaVersion,
    contextId: base.data.contextId,
    descriptorDigest,
    floorField: base.data.floorField,
    floorRaw: base.data.floorRaw,
    rows,
  };
  return {
    descriptor: { ...(descriptor as { contextId: string }), descriptorDigest } as ContextPackV1["descriptor"],
    data: { ...unsignedData, dataDigest: contextDataDigestV1(unsignedData) } as ContextPackV1["data"],
  };
};

test("F2 counterexample 1: contradicting meaning (Steuerbetrag, NICHT Gesamtwert) blocks and requires explicit clarification", () => {
  const pack = tempPack((descriptor) => {
    const field = (descriptor.fields as { field: string; meaning: string }[]).find((f) => f.field === "rechnungsbetrag_cent");
    assert.ok(field !== undefined);
    field!.meaning = "Bereits gezahlter Steuerbetrag, NICHT Gesamtwert der Rechnung";
  });
  const spec = loadSpec();
  const library = loadLibrary();
  const builder = GuidedPathBuilder.fromContext({ pack, spec, goal: marginGoal });
  builder.recordGoal();
  const view = buildLibraryViewV1({ library, goal: marginGoal, nowMs: NOW_MS });
  const proposal = builder.attachSelection(view);
  builder.recordProposal();
  const blocking = proposal.openQuestions.filter((q) => q.options.length > 0);
  // RED baseline was: 0 Rückfragen + EXECUTED. Now: the contradiction is
  // visible and BLOCKING (explicit answer required).
  const meaningQuestion = blocking.find((q) => q.field === "rechnungsbetrag_cent");
  assert.ok(meaningQuestion !== undefined, "the contradicting meaning must raise a blocking Rückfrage");
  assert.ok(meaningQuestion!.question.includes("Bedeutungswiderspruch"));
  // Declining (explicit user answer) => REJECTED_BY_USER, no receipt.
  const declined = runUserPathV1({
    pack,
    spec,
    library: loadLibrary(),
    nowMs: NOW_MS,
    principal: "principal:finance-reviewer",
    decisionPrefix: "kts05-f2-decline",
    goal: marginGoal,
    answerPolicy: (question) => (question.field === "rechnungsbetrag_cent" ? "ablehnen" : "ablehnen"),
  });
  assert.equal(declined.outcome, "REJECTED_BY_USER");
  assert.equal(declined.receipt, null);
  // Confirming with the explicit declaration => EXECUTED (meaning declared
  // by the user, decision digest-bound — the clarification is REAL).
  const confirmed = runUserPathV1({
    pack,
    spec,
    library: loadLibrary(),
    nowMs: NOW_MS,
    principal: "principal:finance-reviewer",
    decisionPrefix: "kts05-f2-confirm",
    goal: marginGoal,
    answerPolicy: (question) => "feld_bedeutung_bestaetigen",
  });
  assert.equal(confirmed.outcome, "EXECUTED");
  assert.equal(confirmed.receipt?.result?.count, 1);
});

test("F2 counterexample 2: extra contradictory alias field (betrag_eur=999.00) requires an explicit user choice", () => {
  const pack = tempPack((descriptor, rows) => {
    (descriptor.fields as unknown[]).push({
      field: "betrag_eur",
      meaning: "Rechnungsbetrag in Euro (Hauptwahrung)",
      kind: "number",
      unit: "eur",
      nullable: false,
    });
    for (const row of rows) row["betrag_eur"] = "999.00";
  });
  const spec = loadSpec();
  const library = loadLibrary();
  const builder = GuidedPathBuilder.fromContext({ pack, spec, goal: marginGoal });
  builder.recordGoal();
  const view = buildLibraryViewV1({ library, goal: marginGoal, nowMs: NOW_MS });
  const proposal = builder.attachSelection(view);
  builder.recordProposal();
  const blocking = proposal.openQuestions.filter((q) => q.options.length > 0);
  // RED baseline was: first field wins silently, EXECUTED with the old value.
  // Now: Mehrdeutigkeit is named and the user must choose.
  // The ambiguity question is bound to the FIRST alias-table candidate of
  // totalMinor (betrag_eur appears earlier in the spec table); the original
  // cent field is offered as the alternative. The CONTRADICTORY values
  // (999.00 EUR vs 2999/3000/12000 Cent) must be named.
  const aliasQuestion = blocking.find((q) => q.field === "betrag_eur");
  assert.ok(aliasQuestion !== undefined, "ambiguous totalMinor sources must raise a blocking Rückfrage");
  assert.ok(aliasQuestion!.question.includes("Mehrdeutige Zuordnung"));
  assert.ok(aliasQuestion!.question.includes("sich widersprechen"), "contradictory values must be named");
  assert.ok(aliasQuestion!.options.includes("alternativen_feld_verwenden:rechnungsbetrag_cent"),
    "the original cent field must be offered as a closed option");
  // Explicit user choice of the ORIGINAL cent field after seeing the 999.00
  // contradiction: sealed into the proposal and actually used — the old
  // baseline silently let the earlier alias position win.
  const updatedBefore = proposal.proposalDigest;
  builder.answer(aliasQuestion!.questionId, "alternativen_feld_verwenden:rechnungsbetrag_cent", NOW_MS + 1000);
  const updated = builder.proposal();
  assert.notEqual(updated.proposalDigest, updatedBefore, "the choice must change the sealed proposal");
  assert.equal(updated.openQuestions.filter((q) => q.options.length > 0).length, 0);
  const mapping = updated;
  assert.equal(mapping.fieldMappings.find((m) => m.specField === "totalMinor")?.sourceField, "rechnungsbetrag_cent");
  const inputs = adaptContextToMarginInputsV1({ context: builder.build().context, mapping, pack });
  assert.deepEqual(inputs.invoices.map((i) => i.totalMinor), [2999, 3000, 12000],
    "the USER-chosen field (original cent values) is actually used, not the silent first-field win");
});

/* ------------------------------------------------------------------ */
/* F4 — real runtime clock: re-check before selection/execution        */
/* ------------------------------------------------------------------ */

test("F4: freshly loaded library SELECTED in-window becomes UNKNOWN (stale) once the clock passes the window", () => {
  const library = loadLibrary(); // fresh load at NOW_MS (inside window)
  const inWindow = buildLibraryViewV1({ library, goal: marginGoal, nowMs: NOW_MS });
  assert.equal(inWindow.selection.outcome, "SELECTED");
  // Same cached library object, ACTUAL clock beyond the 365d window:
  // knowledge re-check must refuse suitability — no stale SELECTED.
  const expired = buildLibraryViewV1({ library, goal: marginGoal, nowMs: EXPIRED_MS });
  assert.equal(expired.selection.outcome, "UNKNOWN");
  assert.equal(expired.selection.selected, null);
  assert.ok(expired.selection.rejected.some((r) =>
    r.methodId === "method:margin-threshold-v1" && r.reasons.includes("STALE_KNOWLEDGE")));
});

test("F4: expired knowledge at execution time => path DENIED, never a receipt", () => {
  const pack = loadContextPackV1(path.join(PKG, "contexts", "invoices-eur-cent"));
  const spec = loadSpec();
  const result = runUserPathV1({
    pack,
    spec,
    library: loadLibrary(),
    nowMs: EXPIRED_MS, // the ACTUAL runtime clock is beyond the window
    principal: "principal:finance-reviewer",
    decisionPrefix: "kts05-f4-expired",
    goal: marginGoal,
  });
  assert.equal(result.outcome, "DENIED");
  assert.equal(result.receipt, null);
});

/* ------------------------------------------------------------------ */
/* F5 — PostgreSQL connection ownership (no internal-based detection)  */
/* ------------------------------------------------------------------ */

test("F5: fresh pg.Client is connected AND closed by the adapter and actually reads (no .connection introspection)", async () => {
  const harness: PgHarness = await startRealPostgres(DATA_DIR);
  try {
    const fresh = new Client({ host: "127.0.0.1", port: PG_PORT, database: PG_DATABASE, user: PG_RO_USER, password: PG_RO_PASSWORD });
    // The BUG being guarded against: a fresh client ALREADY has a
    // `connection` object — the old code would have skipped connect().
    assert.ok((fresh as unknown as { connection: unknown }).connection !== null,
      "precondition: fresh pg.Client has a connection object (the old detection trap)");
    const { pack, readback } = await readMarginContextFromPostgresV1({
      conn: { host: "127.0.0.1", port: PG_PORT, database: PG_DATABASE, user: PG_RO_USER, password: PG_RO_PASSWORD },
      schema: PG_SCHEMA,
      client: fresh,
    });
    assert.equal(readback.rowCount, 3, "the fresh client must ACTUALLY read over the wire");
    assert.equal(pack.data.rows.length, 3);
    // Adapter-owned lifecycle: the adapter closed the client it connected.
    let reuseError: unknown;
    try {
      await fresh.query("SELECT 1");
    } catch (error) {
      reuseError = error;
    }
    assert.ok(reuseError instanceof Error, "adapter-owned fresh client must be closed after the read");
  } finally {
    await harness.stop();
  }
});

test("F5: fresh client against a dead endpoint is rejected immediately and within a bound (no hang)", async () => {
  const fresh = new Client({ host: "127.0.0.1", port: 54999, database: PG_DATABASE, user: PG_RO_USER, password: PG_RO_PASSWORD });
  const started = Date.now();
  await assert.rejects(
    readMarginContextFromPostgresV1({
      conn: { host: "127.0.0.1", port: 54999, database: PG_DATABASE, user: PG_RO_USER, password: PG_RO_PASSWORD },
      schema: PG_SCHEMA,
      client: fresh,
    }),
    (error: unknown) =>
      error instanceof PostgresReadDenied && (error as PostgresReadDenied).code === "PG_CONNECTION_FAILED",
  );
  assert.ok(Date.now() - started < 8000, "the rejection must be bounded (no hanging query)");
});

test("F5: already-connected client stays caller-owned (adapter reads without closing it)", async () => {
  const harness: PgHarness = await startRealPostgres(DATA_DIR);
  try {
    const { readback } = await readMarginContextFromPostgresV1({
      conn: { host: "127.0.0.1", port: PG_PORT, database: PG_DATABASE, user: PG_RO_USER, password: PG_RO_PASSWORD },
      schema: PG_SCHEMA,
      client: harness.ro, // connected by the CALLER (harness)
    });
    assert.equal(readback.rowCount, 3);
    // Still usable afterwards: the adapter must NOT close caller-owned clients.
    const versionRow = await harness.ro.query("SELECT version()");
    assert.match(String(versionRow.rows[0]?.version ?? ""), /^PostgreSQL/);
  } finally {
    await harness.stop();
  }
});

/* ================================================================== */
/* Korrektur 0430 — RED-GREEN-Regressionen (unabhängige Reproduktion)  */
/* ==================================================================
 * Baseline 8403238 (unabhängige Ausführung, KTS-CORRECTION-REVIEW-0430.md):
 * - F1: `{"confirmMapping":true,"confirmExecution":true}` ohne jegliche
 *   Bindung -> Exit 0, EXECUTED, Receipt; principal:finance-reviewer
 *   festgesetzt; EOF nach Zielaufnahme als REJECTED_BY_USER protokolliert.
 * - F2: meaning="Kein Rechnungsbetrag, sondern bereits gezahlte
 *   Umsatzsteuer" -> EXECUTED (includes-Akzeptanz trotz Negation).
 * - F4: frische Auswahl -> Mappingbestätigung -> Ablauf -> builder.execute
 *   -> EXECUTED (keine aktuelle Wissensprüfung unmittelbar vor Ausführung).
 * - F5: ended/noch-verbindender Client, hängender Endpoint: keine
 *   Ownership-Garantie (Probe-Ground-Truth: end() auf pending-connect
 *   hängt; "already connected" sagt nichts über den Live-Zustand).
 */

const CLI_PATH = path.join(ROOT, "dist", "packages", "knowledge-solution", "src", "cli.js");
// The CLI batch files live OUTSIDE the repository (the census scan covers
// the repo tree; no stray dirs may pollute the admitted Main).
const TMP_DIR = mkdtempSync(path.join(os.tmpdir(), "kts05-"));

const runCli = (args: string[], stdin: string): { status: number; stdout: string; stderr: string } => {
  const r = spawnSync(process.execPath, [CLI_PATH, ...args], {
    input: stdin,
    encoding: "utf8",
    timeout: 90_000,
    cwd: ROOT,
  });
  return { status: r.status === null ? -1 : r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};

const sha256Canon = (value: unknown): string =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");

const MARGIN_CHOICE = METHOD_GOAL_OBJECTIVE_CHOICES_V1[0];
if (MARGIN_CHOICE === undefined) throw new Error("GOAL_CHOICES_MISSING");

/** The EXACT goal object the CLI builds for `run csv:<name> --goal margin`.
 *  goalIdPrefix (optional) models a goal captured for a DIFFERENT target —
 *  same closed objective, different sealed identity (a genuinely other goal). */
const cliGoalFor = (target: string, principal: string, goalIdPrefix?: string): MethodGoalV1 => {
  const idSource = goalIdPrefix ?? target.replace(/^csv:/, "");
  const goal: MethodGoalV1 = {
    schemaVersion: "pansphaira.kts/method-goal/v1",
    goalId: `goal:${idSource.replace(/[^a-z0-9-]/g, "-")}-user`,
    actor: principal,
    objective: MARGIN_CHOICE.objective,
    requestedOutcome: MARGIN_CHOICE.requestedOutcome,
    constraints: [],
  };
  if (!validateMethodGoalV1(goal)) throw new Error("CLI_GOAL_INVALID");
  return goal;
};

/** In-process reproduction of the displayed proposal/inputs (deterministic). */
const cliDigestsFor = (target: string, principal: string, goalIdPrefix?: string) => {
  const goal = cliGoalFor(target, principal, goalIdPrefix);
  const pack = loadContextPackV1(path.join(PKG, "contexts", "invoices-eur-cent"));
  const spec = loadSpec();
  const library = loadLibrary();
  const view = buildLibraryViewV1({ library, goal: goal as MethodGoalV1, nowMs: NOW_MS });
  const builder = GuidedPathBuilder.fromContext({ pack, spec, goal: goal as MethodGoalV1 });
  builder.recordGoal();
  builder.bindLibrary(library);
  builder.attachSelection(view);
  const mapping = builder.proposal();
  builder.recordProposal();
  const inputs = adaptContextToMarginInputsV1({ context: builder.build().context, mapping, pack });
  return { goalDigest: sha256Canon(goal), proposalDigest: mapping.proposalDigest, inputDigest: sha256Canon(inputs) };
};

const writeBatchFile = (name: string, content: unknown): string => {
  const file = path.join(TMP_DIR, name);
  writeFileSync(file, JSON.stringify(content, null, 2));
  return file;
};

/* ------------------------- F1 — CLI batch/interactive ------------------------- */

test("F1-0430: UNBOUND batch file (two booleans only) is rejected — exit 4, no receipt", () => {
  const file = writeBatchFile("unbound.json", { confirmMapping: true, confirmExecution: true });
  const r = runCli(["run", "csv:invoices-eur-cent", "--goal", "margin", "--answers", file], "");
  // RED baseline: exit 0, EXECUTED, Receipt.
  assert.equal(r.status, 4, `expected exit 4, got ${r.status}\n${r.stdout}`);
  assert.ok(!/receiptDigest:/.test(r.stdout), "no receipt may be produced");
  assert.ok(/ABGELEHNT|ABGEBROCHEN/.test(r.stdout), "honest denial/break label");
});

test("F1-0430: batch file without an explicit user principal is rejected — exit 4", () => {
  const d = cliDigestsFor("csv:invoices-eur-cent", "user:kts05-a");
  const file = writeBatchFile("no-principal.json", {
    goalDigest: d.goalDigest, proposalDigest: d.proposalDigest, inputDigest: d.inputDigest,
    confirmMapping: true, confirmExecution: true,
  });
  const r = runCli(["run", "csv:invoices-eur-cent", "--goal", "margin", "--answers", file], "");
  // RED baseline: the CLI invented `principal:finance-reviewer`.
  assert.equal(r.status, 4, `expected exit 4, got ${r.status}\n${r.stdout}`);
  assert.ok(!/receiptDigest:/.test(r.stdout), "no receipt may be produced");
  assert.ok(!/principal:finance-reviewer/.test(r.stdout), "no invented principal in the run");
});

test("F1-0430: batch file bound to a DIFFERENT goal (different sealed goalId, same objective) is rejected — exit 4", () => {
  // The file's goalDigest seals a goal captured for a DIFFERENT target
  // (different goalId) — the same closed objective, but NOT the goal the CLI
  // captured for csv:invoices-eur-cent. The generic goalDigest must not
  // authorize the displayed goal.
  const d = cliDigestsFor("csv:invoices-eur-cent", "user:kts05-a", "another-context");
  const file = writeBatchFile("foreign-goal.json", {
    principal: "user:kts05-a",
    goalDigest: d.goalDigest, proposalDigest: d.proposalDigest, inputDigest: d.inputDigest,
    confirmMapping: true, confirmExecution: true,
  });
  const r = runCli(["run", "csv:invoices-eur-cent", "--goal", "margin", "--answers", file], "");
  assert.equal(r.status, 4, `expected exit 4, got ${r.status}\n${r.stdout}`);
  assert.ok(!/receiptDigest:/.test(r.stdout), "no receipt may be produced");
});

test("F1-0430: FULLY BOUND batch file (principal + goal/proposal/input digests + booleans) EXECUTES — exit 0, receipt", () => {
  const d = cliDigestsFor("csv:invoices-eur-cent", "user:kts05-a");
  const file = writeBatchFile("bound.json", {
    principal: "user:kts05-a",
    goalDigest: d.goalDigest, proposalDigest: d.proposalDigest, inputDigest: d.inputDigest,
    answers: {}, confirmMapping: true, confirmExecution: true,
  });
  const r = runCli(["run", "csv:invoices-eur-cent", "--goal", "margin", "--answers", file], "");
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stdout}`);
  assert.ok(/outcome:       EXECUTED/.test(r.stdout), "EXECUTED");
  assert.ok(/receiptDigest:/.test(r.stdout), "receipt present");
  assert.ok(r.stdout.includes("user:kts05-a"), "the USER's principal is used");
});

test("F1-0430: interactive EOF at the principal capture is an ABORT (exit 4), NOT a rejection", () => {
  const r = runCli(["run", "csv:invoices-eur-cent"], "");
  assert.equal(r.status, 4, `expected exit 4, got ${r.status}\n${r.stdout}`);
  assert.ok(/ABGEBROCHEN/.test(r.stdout), "honest abort label (nobody declined)");
  assert.ok(!/outcome:\s+REJECTED_BY_USER/.test(r.stdout), "EOF must not be logged as REJECTED_BY_USER");
  assert.ok(!/receiptDigest:/.test(r.stdout), "no receipt");
});

test("F1-0430: interactive EOF at the mapping confirmation is a BLOCK (exit 4), NOT a rejection", () => {
  const r = runCli(["run", "csv:invoices-eur-cent"], "user:kts05-eof\n1\n");
  assert.equal(r.status, 4, `expected exit 4, got ${r.status}\n${r.stdout}`);
  assert.ok(/BLOCKED_BY_EOF/.test(r.stdout), "honest blocked label");
  assert.ok(!/outcome:\s+REJECTED_BY_USER/.test(r.stdout), "EOF must not be a user rejection");
  assert.ok(!/receiptDigest:/.test(r.stdout), "no receipt");
});

test("F1-0430: interactive explicit 'nein' at the mapping confirmation is a genuine rejection (exit 3)", () => {
  const r = runCli(["run", "csv:invoices-eur-cent"], "user:kts05-no\n1\nnein\n");
  assert.equal(r.status, 3, `expected exit 3, got ${r.status}\n${r.stdout}`);
  assert.ok(/outcome:\s+REJECTED_BY_USER/.test(r.stdout), "genuine user rejection");
  assert.ok(!/receiptDigest:/.test(r.stdout), "no receipt");
});

test("F1-0430: interactive positive (principal + closed goal + ja + ja) EXECUTES — exit 0, receipt", () => {
  const r = runCli(["run", "csv:invoices-eur-cent"], "user:kts05-yes\n1\nja\nja\n");
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stdout}`);
  assert.ok(/outcome:       EXECUTED/.test(r.stdout), "EXECUTED");
  assert.ok(/receiptDigest:/.test(r.stdout), "receipt present");
  assert.ok(r.stdout.includes("user:kts05-yes"), "the USER's principal is used");
});

/* ------------------------- F2 — closed meaning semantics ------------------------- */

test("F2-0430: review counterexample 'Kein Rechnungsbetrag, sondern bereits gezahlte Umsatzsteuer' does NOT execute", () => {
  const pack = tempPack((descriptor) => {
    const field = (descriptor.fields as { field: string; meaning: string }[]).find((f) => f.field === "rechnungsbetrag_cent");
    assert.ok(field !== undefined);
    field!.meaning = "Kein Rechnungsbetrag, sondern bereits gezahlte Umsatzsteuer";
  });
  const spec = loadSpec();
  const result = runUserPathV1({
    pack, spec, library: loadLibrary(), nowMs: NOW_MS,
    principal: "principal:finance-reviewer", decisionPrefix: "kts05-f2-neg",
    goal: marginGoal, answerPolicy: () => undefined,
  });
  // RED baseline: EXECUTED with receipt, pending=[].
  assert.notEqual(result.outcome, "EXECUTED");
  assert.equal(result.receipt, null);
  assert.ok(result.pendingQuestions.length > 0, "the negated meaning stays a VISIBLE open question");
  assert.ok(result.pendingQuestions.some((q) => q.field === "rechnungsbetrag_cent"), "the question is about the negated field");
});

test("F2-0430: negated accept-token ('kein Rechnungsbetrag') is a WIDERSPRUCH, not an acceptance", () => {
  const pack = tempPack((descriptor) => {
    const field = (descriptor.fields as { field: string; meaning: string }[]).find((f) => f.field === "rechnungsbetrag_cent");
    assert.ok(field !== undefined);
    field!.meaning = "kein Rechnungsbetrag";
  });
  const spec = loadSpec();
  const builder = GuidedPathBuilder.fromContext({ pack, spec, goal: marginGoal });
  builder.recordGoal();
  const view = buildLibraryViewV1({ library: loadLibrary(), goal: marginGoal, nowMs: NOW_MS });
  const proposal = builder.attachSelection(view);
  const blocking = proposal.openQuestions.filter((q) => q.options.length > 0);
  const q = blocking.find((x) => x.field === "rechnungsbetrag_cent");
  assert.ok(q !== undefined, "a blocking question must exist");
  assert.ok(q!.question.includes("Bedeutungswiderspruch"), "it must be named as a contradiction");
  assert.ok(q!.options.includes("feld_bedeutung_bestaetigen") && q!.options.includes("ablehnen"), "closed options only");
});

test("F2-0430: 'Gesamtwertverdacht' (contains the token, is NOT the token, no closed key) is NOT accepted", () => {
  const pack = tempPack((descriptor) => {
    const field = (descriptor.fields as { field: string; meaning: string; meaningKey?: string }[]).find((f) => f.field === "rechnungsbetrag_cent");
    assert.ok(field !== undefined);
    field!.meaning = "Gesamtwertverdacht";
    delete field!.meaningKey; // pure closed-token channel: no closed key
  });
  const spec = loadSpec();
  const result = runUserPathV1({
    pack, spec, library: loadLibrary(), nowMs: NOW_MS,
    principal: "principal:finance-reviewer", decisionPrefix: "kts05-f2-verdacht",
    goal: marginGoal, answerPolicy: () => undefined,
  });
  // A substring/prefix matcher would have accepted this. Closed semantics: not accepted.
  assert.notEqual(result.outcome, "EXECUTED");
  assert.equal(result.receipt, null);
});

test("F2-0430: closed meaning key (INVOICE_TOTAL_GROSS) ACCEPTS non-tabular declared text", () => {
  const pack = tempPack((descriptor) => {
    const field = (descriptor.fields as { field: string; meaning: string; meaningKey?: string }[]).find((f) => f.field === "rechnungsbetrag_cent");
    assert.ok(field !== undefined);
    field!.meaning = "Betrag laut Rechnungssystem (freie Beschreibung)";
    field!.meaningKey = "INVOICE_TOTAL_GROSS";
  });
  const spec = loadSpec();
  const result = runUserPathV1({
    pack, spec, library: loadLibrary(), nowMs: NOW_MS,
    principal: "principal:finance-reviewer", decisionPrefix: "kts05-f2-key",
    goal: marginGoal,
  });
  // The closed key (spec field key === context field key) is the evidence —
  // no free-text similarity is needed or used.
  assert.equal(result.outcome, "EXECUTED");
  assert.ok(result.receipt !== null && result.receipt.result !== null);
  assert.equal(result.receipt!.result!.count, 1);
});

test("F2-0430: a CONTRADICTING text with a matching closed key still requires an explicit decision", () => {
  const pack = tempPack((descriptor) => {
    const field = (descriptor.fields as { field: string; meaning: string; meaningKey?: string }[]).find((f) => f.field === "rechnungsbetrag_cent");
    assert.ok(field !== undefined);
    field!.meaning = "Steuerbetrag";
    field!.meaningKey = "INVOICE_TOTAL_GROSS";
  });
  const spec = loadSpec();
  const builder = GuidedPathBuilder.fromContext({ pack, spec, goal: marginGoal });
  builder.recordGoal();
  const view = buildLibraryViewV1({ library: loadLibrary(), goal: marginGoal, nowMs: NOW_MS });
  const proposal = builder.attachSelection(view);
  const q = proposal.openQuestions.filter((x) => x.options.length > 0).find((x) => x.field === "rechnungsbetrag_cent");
  assert.ok(q !== undefined, "the contradiction must be visible despite the matching key");
  assert.ok(q!.question.includes("Bedeutungswiderspruch"));
});

/* ------------------------- F4 — validity re-check immediately before execution ------------------------- */

test("F4-0430: review counterexample — selected builder, expiry between selection and execution => DENIED, never executed", () => {
  const pack = loadContextPackV1(path.join(PKG, "contexts", "invoices-eur-cent"));
  const spec = loadSpec();
  const library = loadLibrary(); // fresh, in-window at NOW_MS
  const freshView = buildLibraryViewV1({ library, goal: marginGoal, nowMs: NOW_MS });
  assert.equal(freshView.selection.outcome, "SELECTED", "precondition: fresh selection is SELECTED");

  const builder = GuidedPathBuilder.fromContext({ pack, spec, goal: marginGoal });
  builder.recordGoal();
  builder.bindLibrary(library);
  builder.attachSelection(freshView);
  builder.recordProposal();
  // The user confirms while the knowledge is still valid:
  const mappingDecision = builder.confirmMapping("decision:kts05-f4-builder-mapping", "principal:finance-reviewer", NOW_MS + 1000);
  const inputs = adaptContextToMarginInputsV1({ context: builder.build().context, mapping: builder.proposal(), pack });
  const executionDecision = builder.confirmExecution("decision:kts05-f4-builder-exec", "principal:finance-reviewer", inputs, NOW_MS + 2000);
  // The knowledge EXPIRES between the decisions and the execution: the
  // builder's pre-execution re-check re-resolves the bound library at the
  // ACTUAL (expired) clock. The view handed in is the confirmed (fresh)
  // selection view — the re-check itself, not the view, must fail.
  // RED baseline: builder.execute(executionDecision, inputs) => EXECUTED.
  assert.throws(
    () => builder.executeView(freshView, EXPIRED_MS),
    (error: unknown) => error instanceof GuidedPathDenied && (error as GuidedPathDenied).code === "KNOWLEDGE_RECHECK_FAILED",
  );
  assert.equal(builder.build().terminal, "DENIED");
  assert.equal(builder.build().receipt, null);
  // And a double execution is impossible:
  assert.throws(() => builder.execute(executionDecision, inputs), (error: unknown) => error instanceof GuidedPathDenied && (error as GuidedPathDenied).code === "PATH_TERMINAL");
});

test("F4-0430: a still-valid re-check view EXECUTES and is sealed into the path (KNOWLEDGE_RECHECKED)", () => {
  const pack = loadContextPackV1(path.join(PKG, "contexts", "invoices-eur-cent"));
  const spec = loadSpec();
  const library = loadLibrary();
  const freshView = buildLibraryViewV1({ library, goal: marginGoal, nowMs: NOW_MS });
  const builder = GuidedPathBuilder.fromContext({ pack, spec, goal: marginGoal });
  builder.recordGoal();
  builder.bindLibrary(library);
  builder.attachSelection(freshView);
  builder.recordProposal();
  builder.confirmMapping("decision:kts05-f4-builder-mapping2", "principal:finance-reviewer", NOW_MS + 1000);
  const inputs = adaptContextToMarginInputsV1({ context: builder.build().context, mapping: builder.proposal(), pack });
  const executionDecision = builder.confirmExecution("decision:kts05-f4-builder-exec2", "principal:finance-reviewer", inputs, NOW_MS + 2000);
  const recheck = buildLibraryViewV1({ library, goal: marginGoal, nowMs: NOW_MS + 5000 }); // still inside the window
  builder.executeView(recheck, NOW_MS + 5000);
  const receipt = builder.execute(executionDecision, inputs);
  assert.equal(receipt.outcome, "EXECUTED");
  assert.ok(builder.build().steps.some((s) => s.kind === "KNOWLEDGE_RECHECKED"), "the re-check is sealed into the path");
});

/* ------------------------- F5 — ownership gates (review: explicitly untested) ------------------------- */

test("F5-0430: an ENDED caller-owned client is rejected (not treated as open) — bounded, no invented connection", async () => {
  const harness: PgHarness = await startRealPostgres(DATA_DIR);
  try {
    const ended = new Client({ host: "127.0.0.1", port: PG_PORT, database: PG_DATABASE, user: PG_RO_USER, password: PG_RO_PASSWORD });
    await ended.connect();
    await ended.end(); // caller ended the client
    // RED baseline: the old adapter's "already connected" branch treated this
    // client as OPEN (caller-owned) and read from it.
    const started = Date.now();
    await assert.rejects(
      readMarginContextFromPostgresV1({
        conn: { host: "127.0.0.1", port: PG_PORT, database: PG_DATABASE, user: PG_RO_USER, password: PG_RO_PASSWORD },
        schema: PG_SCHEMA,
        client: ended,
      }),
      (error: unknown) => error instanceof PostgresReadDenied && (error as PostgresReadDenied).code === "PG_CONNECTION_FAILED",
    );
    assert.ok(Date.now() - started < 15_000, "bounded rejection (no hang)");
    // The harness (the other caller-owned client) is untouched:
    const v = await harness.ro.query("SELECT 1 AS ok");
    assert.equal(v.rows[0]?.ok, 1);
  } finally {
    await harness.stop();
  }
});

// Real PostgreSQL byte-forwarding only: delay the caller's first TCP
// handshake; forward the adapter's later independent identity-probe normally.
// No PG messages or responses are fabricated. Fixture initialization belongs
// to our own existing isolated PgHarness, never the retained V2 server.
for (const delayMs of [0, 250]) {
  test(`F5-0430: caller connect Promise survives real TCP handshake delay ${delayMs}ms`, { timeout: 20_000 }, async (t) => {
    const harness: PgHarness = await startRealPostgres(DATA_DIR);
    const sockets = new Set<Socket>();
    const timers = new Set<NodeJS.Timeout>();
    let accepted = 0;
    let delayedConnections = 0;
    const bridge = createServer((downstream) => {
      const thisDelay = ++accepted === 1 ? delayMs : 0;
      if (thisDelay > 0) delayedConnections++;
      downstream.pause();
      const upstream = createConnection({ host: "127.0.0.1", port: PG_PORT });
      upstream.pause();
      for (const socket of [downstream, upstream]) {
        sockets.add(socket);
        socket.on("close", () => sockets.delete(socket));
      }
      downstream.on("error", () => upstream.destroy());
      upstream.on("error", () => downstream.destroy());
      downstream.on("close", () => upstream.destroy());
      upstream.on("close", () => downstream.destroy());
      upstream.once("connect", () => {
        const forward = () => {
          if (downstream.destroyed || upstream.destroyed) return;
          downstream.pipe(upstream);
          upstream.pipe(downstream);
          downstream.resume();
          upstream.resume();
        };
        if (thisDelay === 0) forward();
        else {
          const timer = setTimeout(() => { timers.delete(timer); forward(); }, thisDelay);
          timers.add(timer);
        }
      });
    });
    let caller: Client | undefined;
    let callerSettlement = "PENDING";
    let rows: number | undefined;
    try {
      await new Promise<void>((resolve) => bridge.listen(0, "127.0.0.1", resolve));
      const address = bridge.address();
      assert.ok(address !== null && typeof address === "object");
      const conn = { host: "127.0.0.1", port: address.port, database: PG_DATABASE, user: PG_RO_USER, password: PG_RO_PASSWORD };
      caller = new Client({ ...conn, connectionTimeoutMillis: 10_000 });
      const callerConnect = caller.connect(); // native Promise, owned by the caller
      void callerConnect.then(
        () => { callerSettlement = "RESOLVED"; },
        () => { callerSettlement = "REJECTED"; },
      );
      const { readback } = await readMarginContextFromPostgresV1({ conn, schema: PG_SCHEMA, client: caller });
      rows = readback.rowCount;
      assert.equal(rows, 3, "actual read-only fixture rows, not fabricated responses");
      // A bounded observation, never an unbounded await of the lost callback.
      await new Promise<void>((resolve) => {
        const deadline = setTimeout(resolve, 500);
        void callerConnect.then(
          () => { clearTimeout(deadline); resolve(); },
          () => { clearTimeout(deadline); resolve(); },
        );
      });
      assert.equal(callerSettlement, "RESOLVED", "native caller.connect Promise must not be overwritten by a second adapter connect()");
      await callerConnect;
      assert.equal((await caller.query("SELECT 1 AS ok")).rows[0]?.ok, 1, "caller still owns a usable OPEN client");
      assert.equal(delayedConnections, delayMs > 0 ? 1 : 0);
      assert.equal(accepted, 2, "only caller plus independent actual identity probe");
    } finally {
      // Do not depend on a possibly lost original connect Promise for cleanup.
      if (caller) {
        const end = caller.end().catch(() => {});
        let deadline: NodeJS.Timeout | undefined;
        await Promise.race([end, new Promise<void>((resolve) => {
          deadline = setTimeout(resolve, 1_000);
        })]);
        if (deadline) clearTimeout(deadline);
      }
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => bridge.close(() => resolve()));
      await new Promise<void>((resolve) => setImmediate(resolve));
      await harness.stop();
      t.diagnostic(JSON.stringify({ delayMs, rows, callerSettlement, accepted, delayedConnections, residualProxySockets: sockets.size }));
      assert.equal(sockets.size, 0, "our actual TCP proxy sockets must be closed even on RED");
    }
  });
}

test("F5-0430: adapter-owned probe of a blackhole endpoint (accepts TCP, silent) is rejected within a bound — end() must NOT hang", async () => {
  // Ground truth (probed): pg hangs forever on end()/query() of a client whose
  // connect is still pending. The adapter's probe client is exactly such a
  // client here — the adapter must reject within its bound AND clean the
  // probe's socket (residual-free), or the process would never exit.
  const sockets = new Set<import("node:net").Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.pause();
  }); // accepts, never answers
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address !== null && typeof address === "object");
  const port = (address as { port: number }).port;
  try {
    const fresh = new Client({ host: "127.0.0.1", port, database: PG_DATABASE, user: PG_RO_USER, password: PG_RO_PASSWORD });
    const started = Date.now();
    await assert.rejects(
      readMarginContextFromPostgresV1({
        conn: { host: "127.0.0.1", port, database: PG_DATABASE, user: PG_RO_USER, password: PG_RO_PASSWORD },
        schema: PG_SCHEMA,
        client: fresh,
      }),
      (error: unknown) => error instanceof PostgresReadDenied && (error as PostgresReadDenied).code === "PG_CONNECTION_FAILED",
    );
    assert.ok(Date.now() - started < 12_000, "the rejection must be bounded (no hanging probe end())");
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("F5-0430: a HANGING endpoint (accepts TCP, never speaks the wire) is rejected within a bound — no hang", async () => {
  const sockets = new Set<import("node:net").Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.pause();
  }); // accepts, never answers
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address !== null && typeof address === "object");
  const port = (address as { port: number }).port;
  try {
    const fresh = new Client({ host: "127.0.0.1", port, database: PG_DATABASE, user: PG_RO_USER, password: PG_RO_PASSWORD });
    const started = Date.now();
    await assert.rejects(
      readMarginContextFromPostgresV1({
        conn: { host: "127.0.0.1", port, database: PG_DATABASE, user: PG_RO_USER, password: PG_RO_PASSWORD },
        schema: PG_SCHEMA,
        client: fresh,
      }),
      (error: unknown) => error instanceof PostgresReadDenied && (error as PostgresReadDenied).code === "PG_CONNECTION_FAILED",
    );
    assert.ok(Date.now() - started < 12_000, "the rejection must be bounded (no hanging query)");
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

/* ================================================================== */
/* Canonical-completion stall regression (RED -> GREEN)               */
/* ==================================================================
 * Synthetic regression motivated by a canonical stall (parent symptom: PG initialised
 * on 54431, "kts + two kts_ro connections idle; no CPU; no output >10 min")
 * models a connection that COMPLETES the startup handshake and then WEDGES
 * (half-open / stalled-fsync — the slow-fsync condition the harness itself
 * documents): the probe connect resolves, the handed client connects, and the
 * FIRST read-phase wire query (the role verify `SELECT current_user`) is
 * issued with NO client-side bound before the server-enforced
 * statement_timeout is in force -> the await never settles -> the canonical
 * leg hangs indefinitely (node --test has no per-test timeout).
 *
 * The existing F5 tests cover (a) a dead endpoint (connect refused) and
 * (b) a blackhole (accepts TCP, never speaks the wire => the PROBE connect
 * times out). They do NOT cover (c) handshake COMPLETES then the next query
 * wedges — the read phase. This regression pins that exact case:
 *   - a minimal fake PG resolves the startup handshake (AuthOk +
 *     ParameterStatus + BackendKeyData + ReadyForQuery) for BOTH the adapter
 *     probe client AND the handed client, then goes SILENT on the next
 *     query — wedged-after-handshake;
 *   - readMarginContextFromPostgresV1 (fresh client, NO queryTimeoutMs —
 *     exactly how the F5 fresh-client test calls it) must REJECT within a
 *     bound with the closed code PG_QUERY_TIMED_OUT (the read exceeded its
 *     bound), never a receipt;
 *   - residual-free: the adapter destroys BOTH wedged client sockets (the
 *     server-side sockets close) so the process can exit.
 *
 * RED on the unchanged baseline: this call is PENDING at the role verify
 * forever (0 CPU, idle socket, no output) — the actual stall (retained as
 * an independent timeout observation, not proof of the original stall cause). GREEN on
 * the corrected adapter: bounded PG_QUERY_TIMED_OUT rejection + cleaned
 * sockets.
 */
const pgI32 = (n: number): Buffer => { const b = Buffer.allocUnsafe(4); b.writeUInt32BE(n >>> 0, 0); return b; };
const pgMsg = (code: number, payload: Buffer): Buffer =>
  Buffer.concat([Buffer.from([code]), pgI32(4 + payload.length), payload]);
const pgCstring = (value: string): Buffer => Buffer.concat([Buffer.from(value, "utf8"), Buffer.from([0])]);
/** Minimal fake PG handshake: AuthOk + ParameterStatus + BackendKeyData +
 *  ReadyForQuery("I") — just enough to RESOLVE `client.connect()`. */
const pgHandshake = (): Buffer =>
  Buffer.concat([
    pgMsg(0x52, pgI32(0)), // R AuthenticationOk
    pgMsg(0x53, Buffer.concat([pgCstring("server_version"), pgCstring("18.4")])),
    pgMsg(0x53, Buffer.concat([pgCstring("client_encoding"), pgCstring("UTF8")])),
    pgMsg(0x4b, Buffer.concat([pgI32(0x00001234), pgI32(0x0000abcd)])), // K BackendKeyData
    pgMsg(0x5a, Buffer.from([0x49])), // Z ReadyForQuery "I"
  ]);

test("F5-canonical: a wedged-after-handshake endpoint is rejected within a bound (PG_QUERY_TIMED_OUT) — no stall, residual-free", async () => {
  const sockets = new Set<import("node:net").Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => { sockets.delete(socket); });
    socket.on("error", () => { /* half-open: the client destroys mid-handshake */ });
    let handshaken = false;
    socket.on("data", (buf) => {
      // The startup message arrives first: resolve the handshake (both the
      // adapter probe client and the handed client complete connect()).
      if (!handshaken) { handshaken = true; socket.write(pgHandshake()); return; }
      // Any further message (a query Q, a SET, a Terminal 'X') is left
      // unanswered on purpose — the connection is now wedged.
      void buf;
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address !== null && typeof address === "object");
  const port = (address as { port: number }).port;
  try {
    const fresh = new Client({ host: "127.0.0.1", port, database: PG_DATABASE, user: PG_RO_USER, password: PG_RO_PASSWORD });
    const started = Date.now();
    await assert.rejects(
      readMarginContextFromPostgresV1({
        conn: { host: "127.0.0.1", port, database: PG_DATABASE, user: PG_RO_USER, password: PG_RO_PASSWORD },
        schema: PG_SCHEMA,
        client: fresh,
        // NO queryTimeoutMs — exactly how the F5 fresh-client test drives
        // the adapter (the canonical stall case).
      }),
      (error: unknown) =>
        error instanceof PostgresReadDenied && (error as PostgresReadDenied).code === "PG_QUERY_TIMED_OUT",
    );
    const elapsed = Date.now() - started;
    // Bounded: the rejection must settle within the connect/verify bound
    // (10 s) plus margin — NEVER pending (the actual canonical stall hung
    // indefinitely at the role verify).
    assert.ok(elapsed < 15_000, `the rejection must be bounded (elapsed=${elapsed}ms; the baseline stall was unbounded)`);
    // Residual-free: the adapter must have destroyed BOTH adapter-owned
    // wedged sockets (probe + main client), so the server-side sockets close
    // and the process can exit. Bounded grace — never a hang.
    await new Promise<void>((resolve) => {
      const t = setInterval(() => { if (sockets.size === 0) { clearInterval(t); resolve(); } }, 50);
      const hard = setTimeout(() => { clearInterval(t); resolve(); }, 5_000);
      t.unref?.(); hard.unref?.();
    });
    assert.equal(sockets.size, 0, "both wedged client sockets must be destroyed (residual-free, no lingering handle)");
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

after(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});
