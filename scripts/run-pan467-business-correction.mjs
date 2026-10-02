#!/usr/bin/env node
// Bounded native LIFE-07 entry; no daemon, network, production or host capability.
import {readFileSync,lstatSync} from 'node:fs';
import {describePan467OriginalEffect,authorizePan467BusinessCorrection,executePan467BusinessCorrection} from '../src/pan467/business-correction.mjs';
import {diagnosePan467BusinessCorrection} from '../src/pan467/independent-business-diagnosis.mjs';
const [command,...rest]=process.argv.slice(2),args=new Map();
try{
 for(let i=0;i<rest.length;i+=2){if(!rest[i]?.startsWith('--')||!rest[i+1]||args.has(rest[i]))throw Error('PAN467_CLI_ARGUMENTS_DENIED');args.set(rest[i],rest[i+1]);}
 const allowed={describe:['--root','--id','--original-revision'],apply:['--root','--input','--owner','--actor','--pause-after'],diagnose:['--root']}[command];
 if(!allowed||[...args.keys()].some(k=>!allowed.includes(k))||!args.has('--root'))throw Error('PAN467_CLI_ARGUMENTS_DENIED');
 const root=args.get('--root');let result;
 if(command==='diagnose')result=diagnosePan467BusinessCorrection({root});
 else if(command==='describe'){
  const revision=args.get('--original-revision');if(!/^[1-9][0-9]*$/.test(revision??'')||!Number.isSafeInteger(Number(revision)))throw Error('PAN467_CLI_REVISION_DENIED');
  result=describePan467OriginalEffect({root,id:args.get('--id'),originalRevision:Number(revision)});
 }else{
  const input=args.get('--input');if(!input||lstatSync(input).isSymbolicLink()||!lstatSync(input).isFile()||lstatSync(input).size>8192)throw Error('PAN467_CLI_BOUNDED_INPUT_DENIED');
  const request=JSON.parse(readFileSync(input,'utf8')),grant=authorizePan467BusinessCorrection({root,request,owner:args.get('--owner'),actor:args.get('--actor')});
  result=await executePan467BusinessCorrection({root,request,grant,pauseAfter:args.get('--pause-after')??null});
 }
 console.log(JSON.stringify(result));if(result.outcome==='UNKNOWN')process.exitCode=2;
}catch(error){console.log(JSON.stringify({outcome:'DENIED',code:error.message,scope:'LOCAL_SYNTHETIC_DISPOSABLE'}));process.exitCode=2;}
