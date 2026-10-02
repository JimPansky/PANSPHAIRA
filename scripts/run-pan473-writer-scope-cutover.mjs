#!/usr/bin/env node
// Existing-runtime, local synthetic single-scope entry. No daemon or network.
import {readFileSync,lstatSync} from 'node:fs';
import * as api from '../src/pan473/writer-scope-cutover.mjs';
import {diagnosePan473WriterScope} from '../src/pan473/independent-scope-diagnosis.mjs';
const [command,...rest]=process.argv.slice(2);const args=new Map();
try{
 for(let i=0;i<rest.length;i+=2){if(!rest[i]?.startsWith('--')||!rest[i+1]||args.has(rest[i]))throw Error('PAN473_CLI_ARGUMENTS_DENIED');args.set(rest[i],rest[i+1]);}
 const allowed={prepare:['--root','--source-capability'],cutover:['--root','--owner','--pause-after'],recover:['--root','--owner'],diagnose:['--root'],write:['--root','--owner','--epoch','--input'],correct:['--root','--owner','--epoch','--input'],'request-old-state':['--root','--owner']}[command];
 if(!allowed||[...args.keys()].some(k=>!allowed.includes(k))||!args.has('--root'))throw Error('PAN473_CLI_ARGUMENTS_DENIED');
 const root=args.get('--root'),owner=args.get('--owner');
 const input=()=>{const p=args.get('--input');if(!p||lstatSync(p).isSymbolicLink()||!lstatSync(p).isFile()||lstatSync(p).size>32768)throw Error('PAN473_CLI_BOUNDED_INPUT_REQUIRED_DENIED');return JSON.parse(readFileSync(p,'utf8'));};
 const epoch=()=>{const s=args.get('--epoch');if(!/^[1-9][0-9]*$/.test(s??'')||!Number.isSafeInteger(Number(s)))throw Error('PAN473_CLI_EPOCH_DENIED');return Number(s);};
 let result;
 if(command==='prepare')result=api.initializePan473WriterScope({root,sourceCapability:args.get('--source-capability')});
 else if(command==='diagnose')result=diagnosePan473WriterScope({root});
 else if(command==='cutover'){
  const captured=api.capturePan473CutoverPlan({root});
  if(!captured.plan)result=captured;else{const grant=api.authorizePan473Scope({root,plan:captured.plan,owner});result=await api.executePan473Cutover({root,plan:captured.plan,grant,pauseAfter:args.get('--pause-after')??null});}
 }else if(command==='recover')result=await api.recoverPan473Cutover({root,owner});
 else if(command==='request-old-state')result=api.requestPan473OldStateRollback({root,owner});
 else{
  const e=epoch(),grant=api.authorizePan473TargetWrite({root,epoch:e,owner}),body=input();
  if(command==='write')result=api.writePan473Target({root,epoch:e,grant,changes:body});
  else{if(body===null||typeof body!=='object'||Array.isArray(body)||Object.keys(body).sort().join('|')!=='correctedValue|expectedOriginalValue|field|id|originalRevision')throw Error('PAN473_CLI_CORRECTION_SHAPE_DENIED');result=api.correctPan473HistoricalField({root,epoch:e,grant,...body});}
 }
 console.log(JSON.stringify(result));if(result.outcome==='UNKNOWN')process.exitCode=2;
}catch(error){console.log(JSON.stringify({outcome:'DENIED',code:error.message,scope:'LOCAL_SYNTHETIC_DISPOSABLE'}));process.exitCode=2;}
