// Read-only PAN-owned exact qualification index. No remote registry writes,
// native provisioning, source/publication rights, roles or execution grants.
try {
  if (process.argv.length !== 5) throw new Error('PAN525_EXACT_SELECTION_DENIED');
  const { readExactQualifiedPairRegistryV1 } = await import('../src/pan525/exact-pair-qualification.mjs');
  const [profileId, consumerCommit, providerCommit] = process.argv.slice(2);
  const result = readExactQualifiedPairRegistryV1({ profileId, consumerCommit, providerCommit });
  process.stdout.write(JSON.stringify(result) + '\n');
} catch (error) {
  const code = ['PAN525_EXACT_SELECTION_DENIED', 'PAN525_CODE_OWNED_EVIDENCE_HELD'].includes(error?.message)
    ? error.message : 'PAN525_CODE_OWNED_EVIDENCE_HELD';
  process.stderr.write(JSON.stringify({ registryState: 'HELD', code, sourceRightsGranted: false, executionAuthorityGranted: false }) + '\n');
  process.exitCode = 2;
}
