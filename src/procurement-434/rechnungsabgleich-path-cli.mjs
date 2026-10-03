#!/usr/bin/env node
// Thin executable CLI for PROC434-POSITIVE (thin over rechnungsabgleich-path.mjs).
// Demonstrates the usable local purchase normal path (PO -> goods receipt ->
// decisive three-way invoice match) end to end; non-productive (READ_ONLY /
// WRITE_LOCAL_PROOF only). Exit code: 0 for a completed path (MATCHED or a
// recorded negative/UNRESOLVED result), non-zero on transport/usage errors.
// It never fabricates a match.
import process from "node:process";
import { parseArgs } from "node:util";
import { runProc434NormalPathV1, verifyProc434LocalProofV1, writeProc434StateV1 } from "./rechnungsabgleich-path.mjs";

function usage(code) {
  const out = code === 0 ? process.stdout : process.stderr;
  out.write(
    [
      "usage: node src/procurement-434/rechnungsabgleich-path-cli.mjs [command] [options]",
      "",
      "commands:",
      "  demo      run the local sealed purchase normal path (default)",
      "  native    init|read|apply|liability --root <qualified local synthetic root>",
      "            apply --command <JSON file>; liability --invoice <id> --confirmation-revision <n>",
      "  help      show this help",
      "",
      "options:",
      "  --root <path>        repository root (default: process.cwd())",
      "  --fixture-root <p>   extra fixture prefix (default: none)",
      "  --now <iso8601>      closed reader read timestamp (default: the closed synthetic value)",
      "  --state <path>       also write the closed local result/proof record to <path> (re-readable)",
      "  --json               print the machine result (default: human summary)",
      "",
    ].join("\n"),
  );
  process.exit(code);
}

async function main() {
  if (process.argv[2] === "native") {
    try { const {runPan516NativeCli} = await import("./bestellung-cli.mjs"); return runPan516NativeCli(process.argv.slice(3)); }
    catch (error) { process.stderr.write(`pan516-native error: ${error.message}\n`); process.exitCode = 2; return; }
  }
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      root: { type: "string" },
      "fixture-root": { type: "string" },
      now: { type: "string" },
      state: { type: "string" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  const command = positionals[0] ?? "demo";
  if (values.help || command === "help" || command === "--help") usage(0);
  if (command !== "demo") usage(2);
  try {
    const r = runProc434NormalPathV1({
      rootDir: values.root ?? process.cwd(),
      fixtureRoot: values["fixture-root"],
      ...(values.now !== undefined ? { now: values.now } : {}),
    });
    // A recorded negative/UNRESOLVED outcome is a valid completed result.
    if (r.outcome === "DENIED" || r.outcome === "UNRESOLVED") {
      let statePath = null;
      if (values.state) statePath = writeProc434StateV1(r, values.state);
      if (values.json) {
        const doc = { ...r };
        if (statePath) doc.statePath = statePath;
        process.stdout.write(JSON.stringify(doc, null, 2) + "\n");
        return;
      }
      const lines = [
        `PROC434-POSITIVE · local normal path (non-productive)`,
        `  outcome: ${r.outcome} · ${r.code}`,
        `  detail: ${r.detail}`,
      ];
      if (statePath) lines.push(`  state: ${statePath} (re-readable local result/proof record)`);
      process.stdout.write(lines.join("\n") + "\n");
      return;
    }
    let statePath = null;
    if (values.state) {
      statePath = writeProc434StateV1(r, values.state);
    }
    const res = r.result;
    if (values.json) {
      const doc = { ...r };
      if (statePath) doc.statePath = statePath;
      process.stdout.write(JSON.stringify(doc, null, 2) + "\n");
      return;
    }
    const d = res.decision;
    const variant = d.variant;
    const lines = [
      "PROC434-POSITIVE · local normal path (non-productive)",
      `  case: ${r.caseId}`,
      `  match: ${res.outcome} · decision ${d.outcome}` +
        (d.outcome === "MATCHED" ? ` · matchedAmountMinor=${d.matchedAmountMinor}` : ""),
      `  mode: ${res.mode} v${variant.matchingModeVersion} · ${variant.tolerancePolicyId} v${variant.tolerancePolicyVersion}`,
      `  quantities: bestellte=${res.quantities.bestellteMenge} empfangen=${res.quantities.mengenReceived} fakturiert=${res.quantities.invoicedMenge} ${res.quantities.einheit} ${res.quantities.waehrung}`,
      `  reconciliation: ${res.reconciliation.policy} · rest=${res.reconciliation.remainingMenge} ${res.quantities.einheit}`,
      `  matchDigest: ${res.matchDigest.slice(0, 16)}…`,
      `  resultDigestVerified: ${r.resultDigestVerified} · proofDigestClosed: ${verifyProc434LocalProofV1(r) ? "yes" : "no"}`,
      `  authority: productivePosting=${r.authority.productivePostingAuthorized} booking=${r.authority.bookingAuthorityGranted} riskD=${r.authority.riskDCapability}`,
    ];
    if (statePath) lines.push(`  state: ${statePath} (re-readable local result/proof record)`);
    for (const c of d.evidenceCitations) {
      lines.push(
        `  evidence ${c.referenceKind} ${c.referenceId} [verified=${c.verified}] seal=${c.contentSha256.slice(0, 16)}…`,
      );
    }
    lines.push(
      `  outcome: ${d.outcome}` +
        (d.outcome === "MATCHED"
          ? ` · amountMinor=${d.matchedAmountMinor} · all ${d.evidenceCitations.length} sealed references agree within ${variant.tolerancePolicyId} v${variant.tolerancePolicyVersion}`
          : ` · ${d.outcome}`),
    );
    process.stdout.write(lines.join("\n") + "\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`rechnungsabgleich-path error: ${message}\n`);
    process.exit(2);
  }
}

main();
