#!/usr/bin/env node
// Existing Node runtime, disposable LOCAL_SYNTHETIC profile only. No network.
import { readFileSync } from 'node:fs';
import {
  initializePan472SyntheticDraftStores, writePan472SyntheticSource,
  capturePan472TransferPlan, authorizePan472Transfer, executePan472DraftTransfer,
} from '../src/pan472/persistent-draft-transfer.mjs';
import { reconcilePan472DraftTransfer } from '../src/pan472/independent-draft-reconciliation.mjs';
const [command,root,...extra]=process.argv.slice(2);
try {
  if(extra.length || !root || !['init-synthetic','snapshot','delta','reconcile'].includes(command))
    throw Error('PAN472_COMMAND_SHAPE_DENIED');
  let result;
  if(command==='init-synthetic') {
    const identity=initializePan472SyntheticDraftStores({root});
    const changes=JSON.parse(readFileSync(new URL('../tests/fixtures/pan472/initial-draft-v1.json',import.meta.url),'utf8'));
    const written=writePan472SyntheticSource({root,changes});
    result={outcome:'INITIALIZED_SYNTHETIC_ONLY',identity,written,outsideEffects:'DISABLED'};
  } else if(command==='reconcile') result=reconcilePan472DraftTransfer({root});
  else {
    const captured=capturePan472TransferPlan({root,kind:command==='snapshot'?'SNAPSHOT':'DELTA'});
    if(captured.outcome!=='PLANNED')result=captured;
    else {
      const grant=authorizePan472Transfer({root,plan:captured.plan,owner:'LOCAL_SYNTHETIC_OWNER'});
      result=executePan472DraftTransfer({root,plan:captured.plan,grant});
    }
  }
  console.log(JSON.stringify(result));
  if(['UNKNOWN','QUARANTINED','DENIED'].includes(result.outcome))process.exitCode=1;
} catch(error) {
  console.log(JSON.stringify({outcome:'DENIED',code:error.message}));process.exitCode=1;
}
