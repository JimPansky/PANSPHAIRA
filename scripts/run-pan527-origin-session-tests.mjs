import { spawnSync } from 'node:child_process';

// A closed list, not a caller-selected glob or a skip-capable launcher.
const files = ['tests/pan527/origin-session.test.mjs', 'tests/pan527/native-https-ingress.test.mjs', 'tests/pan527/csrf-native-mutation.test.mjs', 'tests/pan527/browser-native-network.test.mjs', 'tests/pan527/redirect-native.test.mjs', 'tests/pan527/control-route-binding.test.mjs', 'tests/pan527/bound-session-native.test.mjs', 'tests/pan527/delayed-body-native.test.mjs', 'tests/pan527/websocket-native.test.mjs', 'tests/pan527/local-compatibility.test.mjs', 'tests/pan527/registration.test.mjs', 'tests/pan527/test-runner.test.mjs'];
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--list') process.stdout.write(JSON.stringify(files) + '\n');
  else {
    if (args.length) throw new Error('PAN527_TEST_ARGUMENT_DENIED');
    if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('PAN527_TEST_REQUIRES_SUPPORTED_LINUX_X86_64');
    // Existing explicit private tooling remains usable. Otherwise use the exact
    // repository-locked dev dependency and an explicit NSS executable in PATH.
    // The test creates CA trust only in its private browser-child HOME.
    const env = { ...process.env,
      PAN527_BROWSER_MODULE: process.env.PAN527_BROWSER_MODULE || import.meta.resolve('playwright'),
      PAN527_CERTUTIL: process.env.PAN527_CERTUTIL || 'certutil',
    };
    const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], { env, stdio: 'inherit' });
    if (result.error || result.signal || result.status === null) throw new Error('PAN527_TEST_PROCESS_INTERRUPTED');
    process.exitCode = result.status;
  }
} catch (error) { process.stderr.write((error instanceof Error ? error.message : 'PAN527_TEST_TOOLING_UNAVAILABLE') + '\n'); process.exitCode = 1; }
