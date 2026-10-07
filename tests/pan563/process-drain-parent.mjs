// Real OS observation fixture, not a native store/provider result. Its child
// keeps stdout/stderr and an explicit release pipe open after this parent exits.
import { spawn } from 'node:child_process';
if (!process.send) throw new Error('PAN563_DRAIN_FIXTURE_IPC_REQUIRED');
const tail = spawn(process.execPath, [new URL('./process-drain-tail.mjs', import.meta.url).pathname], { stdio: [4, 1, 2] });
tail.once('error', error => { throw error; });
process.stdout.write('{"observation":', () => {
  process.send({ descendantPid: tail.pid }, () => { process.disconnect(); process.exit(0); });
});
