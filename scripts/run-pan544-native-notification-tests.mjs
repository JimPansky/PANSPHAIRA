import {spawnSync} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {join} from 'node:path';
const files=['tests/pan544/native-notifications.test.mjs','tests/pan544/contracts.test.mjs','tests/pan544/gateway.test.mjs','tests/pan544/browser-notifications.test.mjs','tests/pan544/registration.test.mjs'];
try{
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--list')process.stdout.write(JSON.stringify(files)+'\n');
  else{
    if(args.length||/--test-(?:name-pattern|skip-pattern|only)/.test(process.env.NODE_OPTIONS??''))throw new Error('PAN544_TEST_ARGUMENT_DENIED');
    if(process.platform!=='linux'||process.arch!=='x64')throw new Error('PAN544_TEST_REQUIRES_SUPPORTED_LINUX_X86_64');
    const env={...process.env,TMPDIR:process.env.TMPDIR||process.env.RUNNER_TEMP};
    if(!env.TMPDIR)throw new Error('PAN544_OWNED_SCRATCH_REQUIRED');
    if(!env.PAN544_BROWSER_EVIDENCE){env.PAN544_BROWSER_EVIDENCE=mkdtempSync(join(env.TMPDIR,'pan544-browser-evidence-'));process.stdout.write('PAN544_BROWSER_EVIDENCE_DIR='+env.PAN544_BROWSER_EVIDENCE+'\n');}
    env.PAN527_BROWSER_MODULE=env.PAN527_BROWSER_MODULE||import.meta.resolve('playwright');env.PAN527_CERTUTIL=env.PAN527_CERTUTIL||'certutil';
    for(const argv of [['node_modules/typescript/bin/tsc','-p','tsconfig.json'],['scripts/build-pan541-browser.mjs'],['--test','--test-concurrency=1','--test-reporter=tap',...files]]){
      const run=spawnSync(process.execPath,argv,{env,stdio:'inherit'});if(run.error||run.signal||run.status===null)throw new Error('PAN544_TEST_PROCESS_INTERRUPTED');if(run.status!==0){process.exitCode=run.status;break;}
    }
  }
}catch(e){process.stderr.write((e instanceof Error?e.message:'PAN544_TEST_TOOLING_UNAVAILABLE')+'\n');process.exitCode=1;}
