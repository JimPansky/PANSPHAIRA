// The native subcommand extends the retained procurement CLI, not a new platform.
// JSON is a local executable result; it is not a human approval or external receipt.
import process from 'node:process';
import {parseArgs} from 'node:util';
import {readFileSync,openSync,fstatSync,closeSync,constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {initializePan516Procurement,authorizePan516ProcurementCommand,executePan516ProcurementCommand,readPan516Procurement} from './bestellung-lifecycle.mjs';
import {evaluatePan516ProcurementLiability} from './bestellung-liability.mjs';
function readCommand(path){
  let fd;
  try{fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);const stat=fstatSync(fd);if(!stat.isFile()||stat.size>65536)throw new Error('PAN516_CLI_BOUNDED_REGULAR_COMMAND_REQUIRED');const raw=readFileSync(fd);if(raw.length>65536)throw new Error('PAN516_CLI_BOUNDED_REGULAR_COMMAND_REQUIRED');return JSON.parse(raw);}
  catch(error){if(error.code==='ELOOP')throw new Error('PAN516_CLI_BOUNDED_REGULAR_COMMAND_REQUIRED');throw error;}finally{if(fd!==undefined)closeSync(fd);}
}
const OWNER='LOCAL_SYNTHETIC_OWNER';
const COMMON_SHA='2b76e8537646f727b75b157a3b5529a44b94e2e8ee551b5fcef9f5d3bd3c8160';
function initial(root){
  const raw=readFileSync(new URL('../../contracts/trade/common-trade-01-v1.json',import.meta.url));
  if(createHash('sha256').update(raw).digest('hex')!==COMMON_SHA)throw new Error('PAN516_COMMON_SOURCE_BYTES_NOT_ADMITTED_DENIED');
  const common=JSON.parse(raw);
  const purchase={bestellungId:'bestellung:pan516-common',lieferantId:'lieferant:synthetic-01',bestellungZeitstempel:'2026-06-20T08:00:00Z',positionen:[{positionId:'position:common-01',artikelId:'EINK-ART-A01',einheit:common.scope.quantity_unit,waehrung:common.scope.currency,bestellteMenge:common.purchase_order.quantity,berechneteMengeMinor:null}]};
  const terms={unitPriceMinor:common.purchase_order.unit_net_minor,currency:common.scope.currency,unit:common.scope.quantity_unit,promisedAt:common.purchase_order.promised_acceptance_at};
  return initializePan516Procurement({root,owner:OWNER,purchase,terms});
}
export function runPan516NativeCli(args){
  try{
    const {values,positionals}=parseArgs({args,allowPositionals:true,strict:true,options:{root:{type:'string'},command:{type:'string'},invoice:{type:'string'},'confirmation-revision':{type:'string'}}});
    if(positionals.length!==1||!['init','read','apply','liability'].includes(positionals[0])||!values.root)throw new Error('PAN516_CLI_USAGE: native init|read|apply|liability --root <existing-qualified-local-root>');
    const action=positionals[0],allowed=action==='apply'?['root','command']:action==='liability'?['root','invoice','confirmation-revision']:['root'];
    if(Object.keys(values).some(key=>!allowed.includes(key)))throw new Error('PAN516_CLI_ACTION_OPTION_DENIED');
    let result;
    if(action==='init')result=initial(values.root);
    else if(action==='read')result=readPan516Procurement({root:values.root});
    else if(action==='apply'){
      if(!values.command)throw new Error('PAN516_CLI_COMMAND_FILE_REQUIRED');const command=readCommand(values.command);
      const grant=authorizePan516ProcurementCommand({root:values.root,owner:OWNER,command});result=executePan516ProcurementCommand({root:values.root,command,grant});
    }else{
      if(!values.invoice)throw new Error('PAN516_CLI_INVOICE_REQUIRED');const rev=values['confirmation-revision'];
      if(typeof rev!=='string'||!/^([1-9][0-9]*)$/.test(rev)||!Number.isSafeInteger(Number(rev))||Number(rev)>128)throw new Error('PAN516_CLI_CONFIRMATION_REVISION_REQUIRED');
      result=evaluatePan516ProcurementLiability({root:values.root,invoiceId:values.invoice,expectedConfirmationRevision:Number(rev)});
    }
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }catch(error){process.stderr.write('pan516-native error: '+(error instanceof Error?error.message:String(error))+'\n');process.exitCode=2;}
}
