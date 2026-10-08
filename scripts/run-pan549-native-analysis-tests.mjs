import {spawnSync} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {join} from 'node:path';
const files=['tests/pan549/native-analysis-read.test.mjs','tests/pan549/cohort-analysis.test.mjs','tests/pan549/protected-analysis.test.mjs','tests/pan549/browser-analysis.test.mjs','tests/pan549/browser-lifecycle-analysis.test.mjs','tests/pan549/registration.test.mjs'];
try{
 const args=process.argv.slice(2);
 if(args.length===1&&args[0]==='--list')process.stdout.write(JSON.stringify(files)+'\n');
 else{
  if(args.length||/--test-(?:name-pattern|skip-pattern|only)/.test(process.env.NODE_OPTIONS??''))throw new Error('PAN549_TEST_ARGUMENT_DENIED');
  if(process.platform!=='linux'||process.arch!=='x64')throw new Error('PAN549_TEST_REQUIRES_SUPPORTED_LINUX_X86_64');
  const env={...process.env,TMPDIR:process.env.TMPDIR||process.env.RUNNER_TEMP};
  if(!env.TMPDIR)throw new Error('PAN549_OWNED_SCRATCH_REQUIRED');
  if(!env.PAN549_BROWSER_EVIDENCE){env.PAN549_BROWSER_EVIDENCE=mkdtempSync(join(env.TMPDIR,'pan549-browser-evidence-'));process.stdout.write('PAN549_BROWSER_EVIDENCE_DIR='+env.PAN549_BROWSER_EVIDENCE+'\n');}
  env.PAN527_BROWSER_MODULE=env.PAN527_BROWSER_MODULE||import.meta.resolve('playwright');env.PAN527_CERTUTIL=env.PAN527_CERTUTIL||'certutil';
  for(const argv of [['node_modules/typescript/bin/tsc','-p','tsconfig.json'],['scripts/build-pan541-browser.mjs'],['--test','--test-concurrency=1','--test-reporter=tap',...files]]){
   const run=spawnSync(process.execPath,argv,{env,stdio:'inherit'});if(run.error||run.signal||run.status===null)throw new Error('PAN549_TEST_PROCESS_INTERRUPTED');if(run.status!==0){process.exitCode=run.status;break;}
  }
 }
}catch(e){process.stderr.write((e instanceof Error?e.message:'PAN549_TEST_TOOLING_UNAVAILABLE')+'\n');process.exitCode=1;}
