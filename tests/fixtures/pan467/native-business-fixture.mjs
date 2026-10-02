// Owned LOCAL_SYNTHETIC fixture: one released draft aggregate, no mock storage.
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import * as draft from '../../../src/pan472/persistent-draft-transfer.mjs';
import * as scope from '../../../src/pan473/writer-scope-cutover.mjs';
export const LINE='synthetic:line-1';
export const rows=()=>[
 {id:'synthetic:customer-7',kind:'customer',revision:1,deleted:false,body:{nativeId:7,name:'Synthetic Customer'}},
 {id:'synthetic:order-42',kind:'order',revision:1,deleted:false,body:{customerId:'synthetic:customer-7',date:1767225600,refClient:'CM-ADMIN-AI-ESCALATION-001',status:'DRAFT',currency:'EUR',amountMinor:2500}},
 {id:LINE,kind:'line',revision:1,deleted:false,body:{orderId:'synthetic:order-42',quantityMicros:2000000,unit:'piece',priceMinor:1250}},
];
export function query(root,which,sql,...parameters){const db=new DatabaseSync(join(root,which+'.sqlite'),{readOnly:true});try{return db.prepare(sql).all(...parameters);}finally{db.close();}}
export async function fixture(){
 const parent=mkdtempSync(join(tmpdir(),'pan467-owned-')),root=join(parent,'pan472-owned-v1');
 draft.initializePan472SyntheticDraftStores({root});draft.writePan472SyntheticSource({root,changes:rows()});
 // Earlier wrong change at source revision2; complete original event is retained.
 draft.writePan472SyntheticSource({root,changes:[{...rows()[2],revision:2,body:{...rows()[2].body,priceMinor:1750}}]});
 scope.initializePan473WriterScope({root,sourceCapability:'NATIVE_SQLITE_EPOCH_FENCE'});
 const {plan}=scope.capturePan473CutoverPlan({root});const grant=scope.authorizePan473Scope({root,plan,owner:'LOCAL_SYNTHETIC_OWNER'});
 await scope.executePan473Cutover({root,plan,grant});
 const write=scope.authorizePan473TargetWrite({root,epoch:1,owner:'LOCAL_SYNTHETIC_OWNER'});
 // Later correct change affects another field and must survive correction.
 scope.writePan473Target({root,epoch:1,grant:write,changes:[{...rows()[2],revision:3,body:{...rows()[2].body,priceMinor:1750,quantityMicros:3000000}}]});
 return {root,parent,close(){rmSync(parent,{recursive:true,force:true});}};
}
