// Test-only observation helper; JSON is consumed only at the stdio completion
// boundary. An OS child exit is not a guarantee that inherited pipes are closed.
export function observeProcessJsonV1(child) {
  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code !== 0 || signal !== null) { reject(new Error(`PAN563_CHILD_FAILED ${code}/${signal}: ${stderr}`)); return; }
      try { resolve(JSON.parse(stdout)); } catch (error) { reject(error); }
    });
  });
  done.catch(() => {}); // Retain rejection while the parent awaits all readiness barriers.
  return done;
}
