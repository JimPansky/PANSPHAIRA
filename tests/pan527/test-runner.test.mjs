import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
const runner = 'scripts/run-pan527-origin-session-tests.mjs';
test('scoped runner enumerates a closed complete file set including real browser, legacy compatibility and registration', () => {
  const result = spawnSync(process.execPath, [runner, '--list'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const files = JSON.parse(result.stdout);
  assert.equal(new Set(files).size, files.length);
  assert.deepEqual(files, ['tests/pan527/origin-session.test.mjs', 'tests/pan527/native-https-ingress.test.mjs', 'tests/pan527/csrf-native-mutation.test.mjs', 'tests/pan527/browser-native-network.test.mjs', 'tests/pan527/redirect-native.test.mjs', 'tests/pan527/control-route-binding.test.mjs', 'tests/pan527/bound-session-native.test.mjs', 'tests/pan527/delayed-body-native.test.mjs', 'tests/pan527/websocket-native.test.mjs', 'tests/pan527/local-compatibility.test.mjs', 'tests/pan527/registration.test.mjs', 'tests/pan527/test-runner.test.mjs']);
});
test('scoped runner rejects caller-selected files, skips and unsupported arguments before executing tests', () => {
  const result = spawnSync(process.execPath, [runner, '--skip-browser'], { encoding: 'utf8' });
  assert.equal(result.status, 1); assert.match(result.stderr, /PAN527_TEST_ARGUMENT_DENIED/); assert.equal(result.stdout, '');
});
