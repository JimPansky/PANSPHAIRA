import {spawnSync} from 'node:child_process';
// Closed local synthetic stage, not fiscal/FiBu qualification or caller selection.
const files=['tests/pan521/connected-native-entry.test.mjs','tests/pan521/local-journey.test.mjs','tests/pan519/native-finance.test.mjs','tests/pan519/contract-transport.test.mjs','tests/pan519/finance-negatives.test.mjs','tests/pan521/registration.test.mjs','tests/pan521/test-runner.test.mjs'];
try{
 const args=process.argv.slice(2);
 if(args.length===1&&args[0]==='--list')process.stdout.write(JSON.stringify(files)+'\n');
 else{
  if(args.length)throw new Error('PAN521_TEST_ARGUMENT_DENIED');
  const result=spawnSync(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap',...files],{stdio:'inherit'});
  if(result.error||result.signal||result.status===null)throw new Error('PAN521_TEST_PROCESS_INTERRUPTED');
  process.exitCode=result.status;
 }
}catch(error){process.stderr.write((error instanceof Error?error.message:'PAN521_TEST_TOOLING_UNAVAILABLE')+'\n');process.exitCode=1;}
