import {spawnSync} from 'node:child_process';
const files=['tests/pan542/native-human-backend.test.mjs','tests/pan542/registration.test.mjs'];
try {
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--list')process.stdout.write(JSON.stringify(files)+'\n');
  else {
    if(args.length||/--test-(?:name-pattern|skip-pattern|only)/.test(process.env.NODE_OPTIONS??''))throw new Error('PAN542_TEST_ARGUMENT_DENIED');
    const env={...process.env,TMPDIR:process.env.TMPDIR||process.env.RUNNER_TEMP};
    if(!env.TMPDIR)throw new Error('PAN542_OWNED_SCRATCH_REQUIRED');
    for(const argv of [['node_modules/typescript/bin/tsc','-p','tsconfig.json'],['--test','--test-concurrency=1','--test-reporter=tap',...files]]){
      const run=spawnSync(process.execPath,argv,{env,stdio:'inherit'});
      if(run.error||run.signal||run.status===null)throw new Error('PAN542_TEST_PROCESS_INTERRUPTED');
      if(run.status!==0){process.exitCode=run.status;break;}
    }
  }
}catch(e){process.stderr.write((e instanceof Error?e.message:'PAN542_TEST_TOOLING_UNAVAILABLE')+'\n');process.exitCode=1;}
