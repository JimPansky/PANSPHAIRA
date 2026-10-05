import {spawnSync} from 'node:child_process';
// Closed material suite, no caller filter, execution or capacity qualification.
const files=["tests/pan522/material-plan.test.mjs", "tests/pan522/material-plan-negatives.test.mjs", "tests/pan522/material-plan-cli.test.mjs", "tests/pan522/material-plan-native-no-effects.test.mjs", "tests/pan522/registration.test.mjs", "tests/pan522/test-runner.test.mjs"];
try{
 const args=process.argv.slice(2);
 if(args.length===1&&args[0]==='--list')process.stdout.write(JSON.stringify(files)+'\n');
 else{
  if(args.length)throw new Error('PAN522_TEST_ARGUMENT_DENIED');
  const result=spawnSync(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap',...files],{stdio:'inherit'});
  if(result.error||result.signal||result.status===null)throw new Error('PAN522_TEST_PROCESS_INTERRUPTED');
  process.exitCode=result.status;
 }
}catch(error){process.stderr.write((error instanceof Error?error.message:'PAN522_TEST_TOOLING_UNAVAILABLE')+'\n');process.exitCode=1;}
