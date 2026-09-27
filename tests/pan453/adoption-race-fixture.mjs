// Synthetic deterministic interleaving at legacy gate persist's pre-write seam.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';
import { DemoMutationGate } from '../../demo/runtime/enforcement-gate.mjs';
import { acquireLocalJournalOwner } from '../../demo/runtime/local-journal-owner.mjs';
const [root,mode]=process.argv.slice(2);
if(!root||!['install','race','legacy-interleave'].includes(mode))throw Error('BOUND_ARGS_REQUIRED');
if(mode==='legacy-interleave'){
 fs.mkdirSync(root,{recursive:true});
 const gate=new DemoMutationGate({apiToken:'a'.repeat(48),controlToken:'b'.repeat(48),expectedOrigin:'http://127.0.0.1:7781',receiptPath:join(root,'effects.json'),provider:{}});
 let injected=false,adoptionDenied=false;
 const original=fs.mkdirSync;
 fs.mkdirSync=(path,opts)=>{
  if(!injected && path===root){
   injected=true;
   const attempt=spawnSync(process.execPath,[fileURLToPath(import.meta.url),root,'install'],{encoding:'utf8',timeout:4000});
   adoptionDenied=attempt.status!==0 && attempt.stderr.includes('JOURNAL_OWNED_NAMESPACE_REQUIRED_DENIED');
  }
  return original(path,opts);
 };
 syncBuiltinESMExports();
 try{gate.persist();}finally{fs.mkdirSync=original;syncBuiltinESMExports();}
 console.log(JSON.stringify({injected,adoptionDenied,modeInstalled:fs.existsSync(join(root,'journal-owner.mode')),legacyJournalWritten:fs.existsSync(join(root,'effects.json'))}));
}else if(mode==='install'){
 const owner=acquireLocalJournalOwner(root);owner.release();
 console.log(JSON.stringify({installed:fs.existsSync(join(root,'journal-owner.mode'))}));
}else{
 fs.mkdirSync(root,{recursive:true});
 let preOpenDenied=false;
 try{new DemoMutationGate({apiToken:'a'.repeat(48),controlToken:'b'.repeat(48),expectedOrigin:'http://127.0.0.1:7781',receiptPath:join(root,'effects.json'),provider:{}});}
 catch(error){if(error.message!=='JOURNAL_OWNER_REQUIRED_DENIED')throw error;preOpenDenied=true;}
 const install=spawnSync(process.execPath,[fileURLToPath(import.meta.url),root,'install'],{encoding:'utf8'});
 if(install.status!==0)throw Error('SYNTHETIC_INSTALL_FAILED: '+install.stdout+install.stderr);
 console.log(JSON.stringify({preOpenDenied,modeInstalled:fs.existsSync(join(root,'journal-owner.mode')),unownedJournalWritten:fs.existsSync(join(root,'effects.json')),effects:0}));
}
