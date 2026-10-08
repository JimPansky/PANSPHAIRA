// No sleep, prewarming, native result or timing guess: the test releases this
// inherited real pipe only after observing the actual parent OS exit event.
process.stdin.once('data', chunk => {
  if (chunk.toString() !== 'release\n') throw new Error('PAN563_DRAIN_RELEASE_DENIED');
  process.stdout.write('"OBSERVATION_ONLY_TAIL_AFTER_PARENT_EXIT"}\n', () => process.exit(0));
});
