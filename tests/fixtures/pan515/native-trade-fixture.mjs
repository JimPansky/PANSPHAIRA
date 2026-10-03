// One existing native draft target; no replacement database or provider stub.
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import * as draft from '../../../src/pan472/persistent-draft-transfer.mjs';
import * as scope from '../../../src/pan473/writer-scope-cutover.mjs';
import commonReference from '../../../contracts/trade/common-trade-01-v1.json' with {type:'json'};
export async function nativeTradeFixture({common=false}={}){
  if(!process.env.TMPDIR)throw new Error('OWNED_SCRATCH_REQUIRED');
  const parent=mkdtempSync(join(process.env.TMPDIR,'pan515-owned-'));
  const root=join(parent,'pan472-owned-v1');
  try{
    draft.initializePan472SyntheticDraftStores({root});
    draft.writePan472SyntheticSource({root,changes:[
      {id:'synthetic:customer-7',kind:'customer',revision:1,deleted:false,body:{nativeId:7,name:'Synthetic Customer'}},
      {id:'synthetic:order-42',kind:'order',revision:1,deleted:false,body:{customerId:'synthetic:customer-7',date:1767225600,refClient:'CM-ADMIN-AI-ESCALATION-001',status:'DRAFT',currency:'EUR',amountMinor:common?commonReference.sales_order.quantity*commonReference.sales_order.unit_net_minor:7500}},
      {id:'synthetic:line-1',kind:'line',revision:1,deleted:false,body:{orderId:'synthetic:order-42',quantityMicros:common?commonReference.sales_order.quantity*1000000:6000000,unit:'piece',priceMinor:common?commonReference.sales_order.unit_net_minor:1250}},
    ]});
    scope.initializePan473WriterScope({root,sourceCapability:'NATIVE_SQLITE_EPOCH_FENCE'});
    const {plan}=scope.capturePan473CutoverPlan({root});
    await scope.executePan473Cutover({root,plan,grant:scope.authorizePan473Scope({root,plan,owner:'LOCAL_SYNTHETIC_OWNER'})});
    return {root,parent,close(){rmSync(parent,{recursive:true,force:true});}};
  }catch(error){rmSync(parent,{recursive:true,force:true});throw error;}
}
export function nativeRows(root,sql,...args){
  const db=new DatabaseSync(join(root,'target.sqlite'),{readOnly:true});
  try{return db.prepare(sql).all(...args);}finally{db.close();}
}
