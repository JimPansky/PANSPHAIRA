// Actual fresh process consumer of the existing native database and protected
// session store. Credentials arrive only on stdin and are never emitted.
import {readFileSync} from 'node:fs';
import {createProtectedSessionAdapterV1} from '../../src/pan527/origin-session-adapter.mjs';
import {createNativeErvHumanBackendV1} from '../../src/pan542/native-human-backend.mjs';
const [root,stateRoot]=process.argv.slice(2);
const input=JSON.parse(readFileSync(0,'utf8'));
if(input.sessionOptions.stateRoot!==stateRoot)throw new Error('PAN542_RESTART_TEST_CUSTODY_DENIED');
const sessions=createProtectedSessionAdapterV1(input.sessionOptions);
const api=createNativeErvHumanBackendV1({root,sessions});
if(input.mode==='DECIDE_AND_DROP_RESPONSE'){
  // Actual commit completes; deliberately terminate this owned test process
  // without delivering its result. This is response loss, not a vendor failure.
  api.decide(input.headers,input.command);process.exit(73);
}
process.stdout.write(JSON.stringify(api.read(input.headers,{invoiceId:input.invoiceId})));
