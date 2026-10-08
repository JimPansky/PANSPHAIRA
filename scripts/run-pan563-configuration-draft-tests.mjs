import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
const files=['tests/pan563/configuration-contract.test.mjs','tests/pan563/compatibility.test.mjs','tests/pan563/durable-draft.test.mjs','tests/pan563/process-cas.test.mjs','tests/pan563/protected-draft.test.mjs','tests/pan563/browser-draft.test.mjs','tests/pan563/registration.test.mjs'];
try {
  const args=process.argv.slice(2);
  if(args.length===1 && args[0]==='--list')process.stdout.write(JSON.stringify(files)+'\n');
  else {
    if(args.length || /--test-(?:name-pattern|skip-pattern|only)/.test(process.env.NODE_OPTIONS??''))throw new Error('PAN563_TEST_ARGUMENT_DENIED');
    const env={...process.env,TMPDIR:process.env.TMPDIR||process.env.RUNNER_TEMP};if(!env.TMPDIR)throw new Error('PAN563_OWNED_SCRATCH_REQUIRED');
    env.PAN563_BROWSER_EVIDENCE=env.PAN563_BROWSER_EVIDENCE||mkdtempSync(join(env.TMPDIR,'pan563-browser-evidence-'));
    env.PAN527_CERTUTIL=env.PAN527_CERTUTIL||'certutil';
    process.stdout.write('PAN563_BROWSER_EVIDENCE_DIR='+env.PAN563_BROWSER_EVIDENCE+'\n');
    for(const argv of [['node_modules/typescript/bin/tsc','-p','tsconfig.json'],['scripts/build-pan541-browser.mjs'],['--test','--test-concurrency=1','--test-reporter=tap',...files]]) {
      const run=spawnSync(process.execPath,argv,{env,stdio:'inherit'});
      if(run.error||run.signal||run.status===null)throw new Error('PAN563_TEST_PROCESS_INTERRUPTED');
      if(run.status!==0){process.exitCode=run.status;break;}
    }
  }
}catch(e){process.stderr.write((e instanceof Error?e.message:'PAN563_TEST_TOOLING_UNAVAILABLE')+'\n');process.exitCode=1;}
