import {spawnSync} from 'node:child_process';
// Closed P09 native suite; no caller filters, fiscal qualifiers or productive mode.
const files=["tests/pan523/native-production-boundaries.test.mjs", "tests/pan523/native-production-cli.test.mjs", "tests/pan523/native-production-cost.test.mjs", "tests/pan523/native-production-fulfilment.test.mjs", "tests/pan523/native-production-history.test.mjs", "tests/pan523/native-production-invoice.test.mjs", "tests/pan523/native-production-negatives.test.mjs", "tests/pan523/native-production-revision.test.mjs", "tests/pan523/native-production-rollback.test.mjs", "tests/pan523/native-production.test.mjs", "tests/pan523/historical-native-pins.test.mjs", "tests/pan523/registration.test.mjs", "tests/pan523/test-runner.test.mjs"];
try{
 const args=process.argv.slice(2);
 if(args.length===1&&args[0]==='--list')process.stdout.write(JSON.stringify(files)+'\n');
 else{if(args.length)throw Error('PAN523_TEST_ARGUMENT_DENIED');const result=spawnSync(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap',...files],{stdio:'inherit'});if(result.error||result.signal||result.status===null)throw Error('PAN523_TEST_PROCESS_INTERRUPTED');process.exitCode=result.status;}
}catch(error){process.stderr.write((error instanceof Error?error.message:'PAN523_TEST_TOOLING_UNAVAILABLE')+'\n');process.exitCode=1;}
