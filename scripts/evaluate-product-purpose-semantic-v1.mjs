#!/usr/bin/env node
// Actual versioned repository mapping/evaluation stdin/stdout entry. No network, sealed path or output-file authority.
import { evaluateProductPurposeSemanticV1, parseProductPurposeSemanticRequestV1 } from "../src/cscl-11/holdout-gate.mjs";
try {
  if (process.argv.length !== 2) throw new Error("ONE_STDIN_REQUEST_NO_ARGUMENTS");
  const chunks = []; let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > 131072) throw new Error("INPUT_TOO_LARGE");
    chunks.push(chunk);
  }
  const request = parseProductPurposeSemanticRequestV1(Buffer.concat(chunks));
  process.stdout.write(JSON.stringify(evaluateProductPurposeSemanticV1(request)) + "\n");
} catch (error) {
  process.stderr.write(`SEM_HOLDOUT487_ADMISSION_DENIED: ${error.message}\n`);
  process.exitCode = 2;
}
