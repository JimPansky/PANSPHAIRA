#!/usr/bin/env node
// Ordinary local component/signature/slot tests. This is deliberately NOT
// native-profile, final-distribution, public-readback or release acceptance.
// Missing Python/OpenSSL and failed children fail; no optional test skipping.
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const cases = [
  'offline-artifact.test.py',
  'offline-updater.test.py',
  'offline-migration.test.py',
  'retained-rescue.test.py',
  'dependency-boundaries.test.py',
];
const environment = Object.fromEntries(['PATH', 'LANG', 'LC_ALL', 'TMPDIR']
  .filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]));
environment.PYTHONDONTWRITEBYTECODE = '1';
for (const file of cases) {
  const result = spawnSync('python3', ['-I', '-B', resolve(root, 'tests/pan465', file)], {
    cwd: root, env: environment, stdio: 'inherit', timeout: 180000,
  });
  if (result.error || result.status !== 0 || result.signal !== null) {
    console.error(`PAN465_COMPONENT_TEST_FAILED:${file}`);
    process.exit(1);
  }
}
console.log('PAN465_COMPONENT_TESTS_PASS: native distribution qualification and release acceptance remain separate gates');
