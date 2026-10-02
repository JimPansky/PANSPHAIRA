#!/usr/bin/env node
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {replaySpentPilotV3} from '../src/pan378/spent-pilot-replay-v3.mjs';
const target=new URL('../verification/pan378-spent-pilot-reproduction-v3.json',import.meta.url);
try{
 const args=process.argv.slice(2);
 if(args.length>1||args.length===1&&!['--check','--write'].includes(args[0]))throw new Error('PAN378_ARGUMENT_DENIED');
 const result=replaySpentPilotV3();const bytes=Buffer.from(JSON.stringify(result,null,2)+'\n');
 if(args[0]==='--check'&&!readFileSync(target).equals(bytes))throw new Error('PAN378_REPRODUCTION_RECEIPT_BYTE_MISMATCH');
 if(args[0]==='--write')writeFileSync(fileURLToPath(target),bytes,{flag:'wx',mode:0o644});
 process.stdout.write(bytes);
}catch(error){process.stderr.write((error instanceof Error?error.message:'PAN378_REPLAY_DENIED')+'\n');process.exitCode=1;}
