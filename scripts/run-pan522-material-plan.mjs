// Read-only P08 source operator. No dispatch, target, role or productive mode.
import {openSync,fstatSync,readFileSync,closeSync,constants} from 'node:fs';

try{
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='disabled'){
    const {materialProposalView}=await import('../src/pan522/material-plan.mjs');
    process.stdout.write(JSON.stringify(materialProposalView(null,'DISABLED'))+'\n');
  }else{
  if(args.length!==3||args[0]!=='plan'||args[1]!=='--input'||!args[2]||args[2].startsWith('-'))throw new Error('PAN522_CLI_ARGUMENT_DENIED');
  let fd,input;
  try{
    fd=openSync(args[2],constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    const stat=fstatSync(fd);
    if(!stat.isFile()||stat.size<2||stat.size>262144)throw new Error('PAN522_INPUT_FILE_DENIED');
    input=JSON.parse(readFileSync(fd,'utf8'));
  }catch{throw new Error('PAN522_INPUT_FILE_DENIED');}finally{if(fd!==undefined)closeSync(fd);}
  const {planMaterialRequirements}=await import('../src/pan522/material-plan.mjs');
  process.stdout.write(JSON.stringify(planMaterialRequirements(input))+'\n');
  }
}catch(error){
  process.stderr.write(typeof error.message==='string'&&/^PAN522_[A-Z_]+(?:\:[A-Z_]+)?$/.test(error.message)?error.message+'\n':'PAN522_OPERATOR_DENIED\n');
  process.exitCode=1;
}
