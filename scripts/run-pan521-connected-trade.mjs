#!/usr/bin/env node
// Code-owned local native modes. No actor/role/URL/provider/qualification selectors.
import {readPan521ConnectedTradeJourney} from '../src/pan521/connected-trade.mjs';
try{
 const [action,...values]=process.argv.slice(2),args=new Map(),flags=action==='read'?['--root','--as-of']:action==='run-local'?['--root','--as-of','--attempt','--through']:null;
 if(flags===null||values.length!==flags.length*2)throw Error('PAN521_CLI_ARGUMENTS_DENIED');
 for(let i=0;i<values.length;i+=2){if(!flags.includes(values[i])||!values[i+1]||args.has(values[i]))throw Error('PAN521_CLI_ARGUMENTS_DENIED');args.set(values[i],values[i+1]);}
 if(flags.some(flag=>!args.has(flag)))throw Error('PAN521_CLI_ARGUMENTS_DENIED');
 if(action==='read'){
  const result=readPan521ConnectedTradeJourney({root:args.get('--root'),asOf:args.get('--as-of')});console.log(JSON.stringify({outcome:'LOCAL_CONNECTED_READBACK_UNQUALIFIED',result}));
 }else{
  // Load the additive action mode only after the closed CLI preflight.
  const {executePan521LocalJourney}=await import('../src/pan521/local-journey.mjs');
  console.log(JSON.stringify(executePan521LocalJourney({root:args.get('--root'),owner:'LOCAL_SYNTHETIC_OWNER',asOf:args.get('--as-of'),attemptId:args.get('--attempt'),through:args.get('--through')})));
 }
}catch(error){
 const code=typeof error.message==='string'&&/^PAN[0-9]+_[A-Z0-9_]+$/.test(error.message)?error.message:'PAN521_CURRENT_NATIVE_UNAVAILABLE_DENIED';
 console.log(JSON.stringify({outcome:'DENIED',code,original521Accepted:false,paymentDispatchAuthorized:false}));process.exitCode=2;
}
