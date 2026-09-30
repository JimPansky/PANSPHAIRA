// Separate-process crash driver, invoked only by the native qualification test.
import {readFileSync} from 'node:fs';
import {createRetainedPairControllerV1} from '../../src/pan464/retained-pair-controller.mjs';
const config=JSON.parse(readFileSync(process.argv[2],'utf8'));
process.on('message',()=>{}); // Keep the IPC boundary alive until the parent kills it.
const c=createRetainedPairControllerV1({...config.options,readPermission:()=>JSON.parse(readFileSync(config.permissionFile,'utf8')),
  observePhase:async phase=>{
    process.send?.({kind:'phase',phase});
    if(phase===config.pauseAt)await new Promise(()=>{});
  }});
try{
  await c.qualifyPairs();await c.initialize();
  const result=await c.upgrade({operation:'UPGRADE',planDigest:c.edge.nativePlan.planDigest});
  if(result.outcome==='ACTIVE')await c.writeAfterActivation();
  process.send?.({kind:'complete',outcome:result.outcome});
}catch(error){process.send?.({kind:'held',code:error.message});process.exitCode=1;}
finally{process.disconnect?.();}
