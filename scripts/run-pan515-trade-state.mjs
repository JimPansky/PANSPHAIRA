#!/usr/bin/env node
// One real existing native SQLite scope. No provider stub, network or productive authority.
import {readFileSync,lstatSync} from 'node:fs';
import * as draft from '../src/pan472/persistent-draft-transfer.mjs';
import * as scope from '../src/pan473/writer-scope-cutover.mjs';
import * as trade from '../src/pan515/trade-state.mjs';
import common from '../contracts/trade/common-trade-01-v1.json' with {type:'json'};
const [action,...rest]=process.argv.slice(2),args=new Map();
try{
  for(let i=0;i<rest.length;i+=2){if(!rest[i]?.startsWith('--')||!rest[i+1]||args.has(rest[i]))throw Error('PAN515_CLI_ARGUMENTS_DENIED');args.set(rest[i],rest[i+1]);}
  const allowed={prepare:['--root','--owner','--case'],initialize:['--root','--owner','--case'],read:['--root','--as-of'],write:['--root','--owner','--input'],stop:['--root','--owner','--reason'],'apply-common':['--root','--owner']}[action];
  if(!allowed||[...args.keys()].some(k=>!allowed.includes(k))||!args.has('--root'))throw Error('PAN515_CLI_ARGUMENTS_DENIED');
  const root=args.get('--root'),owner=args.get('--owner'),caseId=args.get('--case')??'PAN515-LEGACY-DRAFT-06';
  if(action!=='read'&&owner!=='LOCAL_SYNTHETIC_OWNER')throw Error('PAN515_LOCAL_SYNTHETIC_OWNER_REQUIRED_DENIED');
  if(!['PAN515-LEGACY-DRAFT-06','COMMON-TRADE-01'].includes(caseId))throw Error('PAN515_CASE_PROFILE_DENIED');
  const execute=command=>trade.executePan515TradeCommand({root,command,grant:trade.authorizePan515TradeCommand({root,command,owner})});
  let result;
  if(action==='prepare'){
    const isCommon=caseId===common.id;
    draft.initializePan472SyntheticDraftStores({root});
    draft.writePan472SyntheticSource({root,changes:[
      {id:'synthetic:customer-7',kind:'customer',revision:1,deleted:false,body:{nativeId:7,name:'Synthetic Customer'}},
      {id:'synthetic:order-42',kind:'order',revision:1,deleted:false,body:{customerId:'synthetic:customer-7',date:1767225600,refClient:'CM-ADMIN-AI-ESCALATION-001',status:'DRAFT',currency:'EUR',amountMinor:isCommon?common.sales_order.quantity*common.sales_order.unit_net_minor:7500}},
      {id:'synthetic:line-1',kind:'line',revision:1,deleted:false,body:{orderId:'synthetic:order-42',quantityMicros:isCommon?common.sales_order.quantity*1000000:6000000,unit:'piece',priceMinor:isCommon?common.sales_order.unit_net_minor:1250}},
    ]});
    scope.initializePan473WriterScope({root,sourceCapability:'NATIVE_SQLITE_EPOCH_FENCE'});
    const {plan}=scope.capturePan473CutoverPlan({root});
    await scope.executePan473Cutover({root,plan,grant:scope.authorizePan473Scope({root,plan,owner})});
    result=trade.initializePan515TradeState({root,owner,caseId});
  }else if(action==='initialize')result=trade.initializePan515TradeState({root,owner,caseId});
  else if(action==='stop')result=trade.deactivatePan515TradeTransitions({root,owner,reason:args.get('--reason')});
  else if(action==='read')result=trade.readPan515TradeState({root,asOf:args.get('--as-of')??null});
  else if(action==='write'){
    const path=args.get('--input');if(!path)throw Error('PAN515_CLI_BOUNDED_INPUT_REQUIRED_DENIED');const stat=lstatSync(path);
    if(stat.isSymbolicLink()||!stat.isFile()||stat.size>32768)throw Error('PAN515_CLI_BOUNDED_INPUT_REQUIRED_DENIED');
    result=execute(JSON.parse(readFileSync(path,'utf8')));
  }else{
    if(trade.readPan515TradeState({root}).binding.caseId!==common.id)throw Error('PAN515_COMMON_SOURCE_BINDING_REQUIRED_DENIED');
    let revision=0;const receipts=[];
    const run=(source,kind,quantity,effectiveAt,extra={})=>receipts.push(execute({schemaVersion:'pansphaira.pan515/trade-command/v1',effectId:source.id,transportId:'synthetic:common-'+source.id.toLowerCase(),expectedRevision:revision++,orderId:common.sales_order.id,lineId:common.sales_order.line_id,articleId:common.scope.item_id,warehouseId:common.scope.warehouse_id,unit:common.scope.quantity_unit,kind,quantity,referenceId:null,effectiveAt,reason:'COMMON-TRADE-01 native '+kind,...extra}));
    for(const r of common.receipts)run(r,'RECEIPT',r.accepted_quantity,r.accepted_at,{referenceId:r.po_id,sourceLineId:r.po_line_id});
    const reservation=common.reservation_events[0];run(reservation,'RESERVE',reservation.delta,reservation.at,{reason:reservation.cause});
    for(const s of common.shipments){
      const rc=common.reservation_events.find(r=>r.cause_shipment===s.id);
      if(!rc||rc.delta!==-s.quantity||rc.at!==s.dispatched_at||rc.order_id!==s.order_id||rc.line_id!==s.line_id)throw Error('PAN515_COMMON_RESERVATION_SOURCE_PARITY_DENIED');
      run(s,'SHIP',s.quantity,s.dispatched_at,{referenceId:reservation.id,reservationEventId:rc.id});
    }
    for(const r of common.returns)run(r,'RETURN',r.quantity,r.at,{referenceId:r.original_shipment_id,disposition:r.disposition,creditRef:r.credit_ref});
    result={outcome:'COMMON_NATIVE_EVENTS_EXECUTED',caseId:common.id,revision:trade.readPan515TradeState({root}).revision,receipts};
  }
  console.log(JSON.stringify(result));
}catch(error){console.log(JSON.stringify({outcome:'DENIED',code:error.message,scope:'LOCAL_SYNTHETIC_DISPOSABLE'}));process.exitCode=2;}
