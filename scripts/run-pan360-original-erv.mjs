#!/usr/bin/env node
// New bounded deterministic producer. No historical receipt paths are rewritten.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {generateOriginalErvReportV1,verifyOriginalErvReportV1} from '../src/pan360/original-erv-report-v1.mjs';
const target=new URL('../verification/pan360-original-erv-execution-v1.json',import.meta.url);
const arg=process.argv.slice(2);
if(arg.length>1 || (arg.length===1&&!['--check','--write'].includes(arg[0])))throw new Error('PAN360_CLI_ARGUMENTS_DENIED');
const report=await generateOriginalErvReportV1();
const verified=verifyOriginalErvReportV1(report,report.reportDigest);
if(!verified.valid)throw new Error(verified.reasonCode);
const text=JSON.stringify(report,null,2)+'\n';
if(arg[0]==='--check'){
 if(!existsSync(target)||readFileSync(target,'utf8')!==text)throw new Error('PAN360_FROZEN_REPORT_REPLAY_DENIED');
 const stored=JSON.parse(readFileSync(target,'utf8'));
 const trusted=verifyOriginalErvReportV1(stored,report.reportDigest);
 if(!trusted.valid)throw new Error(trusted.reasonCode);
 console.log(JSON.stringify({outcome:'EXACT_SOURCE_ACTUAL_PAIR_REPLAY_PASS',reportDigest:report.reportDigest,baseline:report.pair.baseline.execution.decision.outcome,modified:report.pair.modified.execution.decision.outcome,changedRateBasisPoints:report.pair.modified.execution.decision.appliedRateBasisPoints,coreDigest:report.pair.reuseReceipt.sourceIdentity.core.coreDigest,independentVerdict:report.terminalVerdict}));
}else if(arg[0]==='--write'){
 // Deliberate only; --check/default never mutate the checked-in receipt.
 writeFileSync(target,text);console.log(JSON.stringify({outcome:'ACTUAL_PAIR_REPORT_WRITTEN',path:fileURLToPath(target),reportDigest:report.reportDigest}));
}else process.stdout.write(text);
