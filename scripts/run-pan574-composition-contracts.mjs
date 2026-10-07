#!/usr/bin/env node
// Closed, netless source operator for two independent native examples.
const args = process.argv.slice(2);
const help = 'Usage: node scripts/run-pan574-composition-contracts.mjs list | examples | handoff D0 | handoff S\n';
if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
  process.stdout.write(help);
} else if (!((args.length === 1 && ['list', 'examples'].includes(args[0]))
  || (args.length === 2 && args[0] === 'handoff' && ['D0', 'S'].includes(args[1])))) {
  process.stderr.write(help); process.exitCode = 2;
} else {
  try {
    const api = await import('../src/pan471/composition-bindings.mjs');
    let observed;
    if (args[0] === 'list') observed = api.discoverPan471CompositionBindings();
    else if (args[0] === 'handoff') observed = api.createPan471CompositionHandoff(args[1]);
    else {
      const {readFileSync} = await import('node:fs');
      const examples = JSON.parse(readFileSync(new URL('../contracts/pan574/public-examples-v1.json', import.meta.url), 'utf8'));
      const session = api.createPan471CompositionSession();
      const found = session.tools.discover().bindings;
      const readbacks = [];
      for (const example of examples.examples) {
        const binding = found.find(row => row.capabilityId === example.capabilityId);
        if (!binding) throw new Error('PUBLIC_EXAMPLE_CAPABILITY_DENIED');
        const grant = session.controller.issue(binding.capabilityId);
        const request = {schemaVersion: 'pansphaira.pan471/composition-call/v1', capabilityId: binding.capabilityId,
          contractDigest: binding.contractDigest, operation: example.operation, unit: example.unit, input: example.input};
        const result = session.tools.invoke(grant, request);
        if (result.outcome !== 'NATIVE_READBACK') throw new Error('PUBLIC_EXAMPLE_NATIVE_DENIED');
        readbacks.push(result);
      }
      observed = {schemaVersion: 'pansphaira.pan574/public-native-example-readback/v1', outcome: 'TWO_NATIVE_EXAMPLES_READ_BACK',
        sourceClass: 'SOURCE_EVIDENCE_ONLY', modelRun: 'NOT_RUN', newCompositionClaimed: false,
        readbacks, nativeEvidence: session.controller.evidence()};
    }
    process.stdout.write(JSON.stringify(observed, null, 2) + '\n');
  } catch {
    process.stderr.write('PAN574_NATIVE_OPERATOR_DENIED\n'); process.exitCode = 1;
  }
}
