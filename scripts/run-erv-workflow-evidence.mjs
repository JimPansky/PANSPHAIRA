#!/usr/bin/env node
// Bounded PSAi ERV evidence producer. The public research packet and old receipts never mutate.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { generateErvWorkflowEvidenceV1, verifyErvWorkflowEvidenceV1 } from '../src/erv-workflow-evidence/native-evidence-v1.mjs';
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && !['--check', '--write'].includes(args[0]))) throw new Error('ERV_EVIDENCE_CLI_ARGUMENTS_DENIED');
const target = new URL('../verification/erv-workflow-native-evidence-v1.json', import.meta.url);
const report = await generateErvWorkflowEvidenceV1();
const verified = verifyErvWorkflowEvidenceV1(report, report.reportDigest);
if (!verified.valid) throw new Error(verified.reasonCode);
const bytes = JSON.stringify(report, null, 2) + '\n';
if (args[0] === '--write') {
  writeFileSync(target, bytes);
  console.log(JSON.stringify({ outcome: 'REAL_NATIVE_ERV_EVIDENCE_PERSISTED', reportDigest: report.reportDigest, counts: report.counts, authorityGranted: false }));
} else if (args[0] === '--check') {
  if (!existsSync(target) || readFileSync(target, 'utf8') !== bytes) throw new Error('ERV_PERSISTED_EVIDENCE_ACTUAL_REPLAY_DENIED');
  const stored = JSON.parse(readFileSync(target, 'utf8'));
  if (!verifyErvWorkflowEvidenceV1(stored, report.reportDigest).valid) throw new Error('ERV_STORED_REPORT_IDENTITY_DENIED');
  console.log(JSON.stringify({ outcome: 'EXACT_PERSISTED_ERV_ACTUAL_NATIVE_REPLAY_PASS', reportDigest: report.reportDigest, kernelSetDigest: report.sourceIdentity.kernelSetDigest, counts: report.counts, all23HistoricalResultsByteIdentical: report.nativeResults.every(r => r.evidenceSha256 === r.unchangedHistoricalResultSha256), all25SeparateSemanticsConfirmed: report.semanticChecks.length === 25, ownedScratchCleanup: report.ownedScratchCleanup, authorityGranted: false }));
} else process.stdout.write(bytes);
