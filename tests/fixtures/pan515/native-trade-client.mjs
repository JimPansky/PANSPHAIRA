// Two independent actual native clients synchronize before commit, not provider stubs.
import * as trade from '../../../src/pan515/trade-state.mjs';
const [root,raw]=process.argv.slice(2),command=JSON.parse(raw);
try{
  const grant=trade.authorizePan515TradeCommand({root,command,owner:'LOCAL_SYNTHETIC_OWNER'});
  process.on('message',m=>{if(m!=='COMMIT')return;let result;try{result=trade.executePan515TradeCommand({root,command,grant});}catch(error){result={outcome:'DENIED',code:error.message};}process.send({type:'RESULT',...result},()=>process.disconnect());});
  process.send({type:'READY'});
}catch(error){process.send({type:'RESULT',outcome:'DENIED',code:error.message},()=>{process.disconnect();process.exitCode=2;});}
