#!/usr/bin/env node
// Bounded local synthetic operator on the already-owned native SQLite target.
// No prepare, network, source grants, fiscal qualifier or productive mode.
import {openSync,fstatSync,readFileSync,closeSync,constants} from 'node:fs';
import * as trade from '../src/pan515/trade-state.mjs';
function input(path){let fd;try{fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);const stat=fstatSync(fd);if(!stat.isFile()||stat.size<2||stat.size>32768)throw Error();return JSON.parse(readFileSync(fd,'utf8'));}catch{throw Error('PAN523_CLI_BOUNDED_INPUT_REQUIRED_DENIED');}finally{if(fd!==undefined)closeSync(fd);}}
try{
 const [action,...rest]=process.argv.slice(2),args=new Map(),allowed={initialize:['--root','--owner','--input'],confirm:['--root','--owner','--input'],read:['--root'],stop:['--root','--owner','--reason']}[action];
 for(let i=0;i<rest.length;i+=2){if(!rest[i]?.startsWith('--')||!rest[i+1]||rest[i+1].startsWith('--')||args.has(rest[i]))throw Error('PAN523_CLI_ARGUMENTS_DENIED');args.set(rest[i],rest[i+1]);}
 if(!allowed||!args.get('--root')||[...args.keys()].some(k=>!allowed.includes(k)))throw Error('PAN523_CLI_ARGUMENTS_DENIED');
 const root=args.get('--root'),owner=args.get('--owner');if(action!=='read'&&owner!=='LOCAL_SYNTHETIC_OWNER')throw Error('PAN523_LOCAL_SYNTHETIC_OWNER_REQUIRED_DENIED');
 let result;
 if(action==='read')result=trade.readPan523ProductionState({root});
 else if(action==='stop')result=trade.deactivatePan523ProductionReports({root,owner,reason:args.get('--reason')});
 else if(action==='initialize')result=trade.initializePan523ProductionState({root,owner,configuration:input(args.get('--input'))});
 else {const command=input(args.get('--input'));if(!['pansphaira.pan523/production-report/v1','pansphaira.pan523/operative-invoice-reference/v1'].includes(command?.schemaVersion))throw Error('PAN523_CLI_COMMAND_SCHEMA_DENIED');result=trade.executePan515TradeCommand({root,command,grant:trade.authorizePan515TradeCommand({root,command,owner})});}
 process.stdout.write(JSON.stringify(result)+'\n');
}catch(error){const code=typeof error.message==='string'&&/^PAN[0-9]+_[A-Z0-9_]+(?::[A-Z0-9_]+)?$/.test(error.message)?error.message:'PAN523_OPERATOR_DENIED';process.stdout.write(JSON.stringify({outcome:'DENIED',code,scope:'LOCAL_SYNTHETIC_DISPOSABLE'})+'\n');process.exitCode=2;}
