// Trusted finite workload entry. Untrusted module is imported ONLY after the
// required kernel seal. Native tools, verifier and signing keys are not mounted.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
const require=createRequire(import.meta.url);
await readFile('/artifact/input.json'); // deliberately preinitialize libuv pool
const landlockABI=require('/stage/guard.node').seal();
const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
const lines=createInterface({input:process.stdin,crlfDelay:Infinity});
let beginResolve;
const begin=new Promise(resolve=>{beginResolve=resolve});
const pending=new Map();let sequence=0;
lines.on('line',line=>{
  const message=JSON.parse(line);
  if(message.kind==='begin'){beginResolve(message.input);return;}
  if(message.kind==='reply'&&pending.has(message.callId)){
    const waiter=pending.get(message.callId);pending.delete(message.callId);waiter(message.result);
  }
});
send({kind:'sealed',node:process.version,uid:process.getuid(),landlockABI});
const input=await begin;
const ctx=Object.freeze({invoke:(capabilityId,callInput)=>{
  const callId='call-'+(++sequence);
  const result=new Promise(resolve=>pending.set(callId,resolve));
  send({kind:'invoke',callId,capabilityId,input:callInput});return result;
}});
try {
  const artifact=await import('/artifact/submission.mjs');
  if(typeof artifact.run!=='function')throw new Error('ENTRYPOINT_DENIED');
  const result=await artifact.run(ctx,input);
  send({kind:'finish',result});
} catch {
  send({kind:'artifactError'});process.exitCode=1;
} finally {lines.close();process.stdin.pause();}
