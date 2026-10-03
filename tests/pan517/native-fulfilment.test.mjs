import assert from 'node:assert/strict';
import test from 'node:test';
import {nativeTradeFixture,nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
import * as trade from '../../src/pan515/trade-state.mjs';
import common from '../../contracts/trade/common-trade-01-v1.json' with {type:'json'};

const owner='LOCAL_SYNTHETIC_OWNER';
const command=(kind,revision,id,quantity,referenceId=null,extra={})=>({schemaVersion:'pansphaira.pan517/fulfilment-command/v1',effectId:id,transportId:'synthetic:transport-'+id.toLowerCase(),expectedRevision:revision,orderId:'SO-01',lineId:'1',articleId:'ARTICLE-A',warehouseId:'WH-01',unit:'STK',kind,quantity,referenceId,effectiveAt:'2026-06-29T10:00:00Z',reason:'Explicit local synthetic fulfilment evidence',...extra});
const apply=(root,c)=>trade.executePan515TradeCommand({root,command:c,grant:trade.authorizePan515TradeCommand({root,command:c,owner})});
async function prepared(){
  const f=await nativeTradeFixture({common:true});
  try{
    trade.initializePan515TradeState({root:f.root,owner,caseId:common.id});
    apply(f.root,command('PROMISE',0,'PR-01',10,null,{effectiveAt:common.sales_order.accepted_at,promise:{revision:1,kind:'DISPATCH',dueAt:common.sales_order.promised_dispatch_at,previousPromiseDigest:null,sourceReference:'COMMON-TRADE-01.sales_order'}}));
    for(const [i,r] of common.receipts.entries()){
      apply(f.root,{...command('RECEIPT',i+1,r.id,r.accepted_quantity,common.purchase_order.id,{effectiveAt:r.accepted_at,sourceLineId:'1'}),schemaVersion:'pansphaira.pan515/trade-command/v1'});
    }
    apply(f.root,{...command('RESERVE',3,'RS-01',10,null,{effectiveAt:common.reservation_events[0].at}),schemaVersion:'pansphaira.pan515/trade-command/v1'});
    return f;
  }catch(error){f.close();throw error;}
}
const pick=()=>command('PICK',4,'PK-01',8,'RS-01');
const pack=()=>command('PACK',5,'PA-01',8,'PK-01');
const issue=()=>command('ISSUE',6,'SH-01',8,'PA-01',{reservationId:'RS-01',reservationEventId:'RC-01',dispatchNoteId:'DN-01',physicalEvidenceId:'EV-01',promiseRevision:1,effectiveAt:common.shipments[0].dispatched_at});

test('P03 AC1 native pick and pack do not consume stock; actual partial issue binds reservation remainder and delivery note',async()=>{
  const f=await prepared();
  try{
    const before=trade.readPan515TradeState({root:f.root});
    assert.deepEqual(before.quantities,{physical:10,reserved:10,blocked:0,available:0,shipped:0,returned:0});
    apply(f.root,pick());apply(f.root,pack());
    assert.deepEqual(trade.readPan515TradeState({root:f.root}).quantities,before.quantities,'pick/pack are not physical issue');
    const result=apply(f.root,issue());assert.equal(result.outcome,'COMMITTED');
    const after=trade.readPan515TradeState({root:f.root});
    assert.deepEqual(after.quantities,{physical:2,reserved:2,blocked:0,available:0,shipped:8,returned:0});
    assert.equal(after.reservations[0].remaining,2);
    assert.equal(after.fulfilment.deliveryNotes.length,1);
    assert.deepEqual(after.fulfilment.deliveryNotes[0],{id:'DN-01',shipmentId:'SH-01',reservationId:'RS-01',orderId:'SO-01',lineId:'1',quantity:8,reservationRemainder:2,orderBackorder:2,physicalEvidenceId:'EV-01',eventType:'DISPATCH',effectiveAt:common.shipments[0].dispatched_at,promiseKind:'DISPATCH',promiseRevision:1});
    const actual=nativeRows(f.root,'SELECT event FROM pan515_events WHERE effect_key=?','SH-01');assert.equal(actual.length,1);
    const event=JSON.parse(actual[0].event);assert.equal(event.kind,'ISSUE');assert.equal(event.movementDelta,-8);
    assert.deepEqual(event.reservationChange,{id:'RC-01',delta:-8,causeShipment:'SH-01',orderId:'SO-01',lineId:'1'});
    assert.equal(after.stock.positions[0].physisch,2);assert.equal(after.stock.positions[0].reserviert,2);
  }finally{f.close();}
});

test('P03 AC2 actual return receipt without credit remains quarantined until a documented inspection release; transport replay never duplicates it',async()=>{
  const f=await prepared();
  try{
    apply(f.root,pick());apply(f.root,pack());apply(f.root,issue());
    const c=command('RETURN_RECEIPT',7,'RT-01',1,'SH-01',{effectiveAt:'2026-07-05T12:00:00Z',physicalEvidenceId:'EV-02'});
    const r=apply(f.root,c);assert.equal(r.outcome,'COMMITTED');
    const quarantined=trade.readPan515TradeState({root:f.root});
    assert.deepEqual(quarantined.quantities,{physical:3,reserved:2,blocked:1,available:0,shipped:8,returned:1});
    assert.equal(quarantined.stock.positions[0].reserviert,3,'existing stock core blocks the returned unit in its protected quantity');
    assert.equal(quarantined.fulfilment.returns[0].remainingQuarantined,1);
    assert.equal(quarantined.fulfilment.returns[0].creditId,null,'no credit is invented to represent a physical return');
    assert.equal(apply(f.root,{...c,transportId:'synthetic:changed-return-transport'}).outcome,'RECONCILED_NO_DUPLICATE');
    assert.deepEqual(trade.readPan515TradeState({root:f.root}),quarantined);
    const rowBefore=nativeRows(f.root,'SELECT event FROM pan515_events WHERE effect_key=?','RT-01');
    apply(f.root,command('RETURN_DECISION',8,'RD-01',1,'RT-01',{effectiveAt:'2026-07-05T13:00:00Z',decision:{disposition:'RELEASE',inspectionEvidenceId:'IN-01',rationale:'Inspected one synthetic returned unit; usable'}}));
    const released=trade.readPan515TradeState({root:f.root});
    assert.deepEqual(released.quantities,{physical:3,reserved:2,blocked:0,available:1,shipped:8,returned:1});
    assert.equal(released.stock.positions[0].reserviert,2);
    assert.equal(released.fulfilment.returns[0].remainingQuarantined,0);
    assert.equal(released.fulfilment.decisions[0].inspectionEvidenceId,'IN-01');
    assert.equal(released.events.at(-1).movementDelta,0,'inspection release is not another physical receipt');
    assert.deepEqual(nativeRows(f.root,'SELECT event FROM pan515_events WHERE effect_key=?','RT-01'),rowBefore);
  }finally{f.close();}
});

test('P03 AC3 complaint decision and technical credit without goods return do not invent stock; later goods return does not invent another credit',async()=>{
  const f=await prepared();
  try{
    apply(f.root,pick());apply(f.root,pack());apply(f.root,issue());
    const physical=trade.readPan515TradeState({root:f.root}).quantities;
    apply(f.root,command('COMPLAINT',7,'CL-01',1,'SH-01',{effectiveAt:'2026-07-05T09:00:00Z'}));
    apply(f.root,command('COMPLAINT_DECISION',8,'CD-01',1,'CL-01',{effectiveAt:'2026-07-05T10:00:00Z',decision:{disposition:'CREDIT_ALLOWED',rationale:'Synthetic damage claim permits a separate technical credit'}}));
    assert.deepEqual(trade.readPan515TradeState({root:f.root}).quantities,physical);
    apply(f.root,command('CREDIT',9,'CR-01',1,'SH-01',{effectiveAt:'2026-07-05T11:00:00Z',credit:{documentId:'CN-01',invoiceId:'AR-01',invoiceLineId:'1',amountMinor:10000,currency:'EUR'}}));
    const credited=trade.readPan515TradeState({root:f.root});
    assert.deepEqual(credited.quantities,physical);
    assert.equal(credited.fulfilment.credits.length,1);assert.equal(credited.fulfilment.returns.length,0);
    assert.equal(credited.fulfilment.credits[0].physicalReturnRequired,false);
    assert.equal(credited.fulfilment.credits[0].productivePostingAuthorized,false);
    const retained=nativeRows(f.root,'SELECT event FROM pan515_events WHERE effect_key=?','CR-01');
    apply(f.root,command('RETURN_RECEIPT',10,'RT-01',1,'SH-01',{effectiveAt:'2026-07-05T12:00:00Z',physicalEvidenceId:'EV-02'}));
    const returned=trade.readPan515TradeState({root:f.root});
    assert.equal(returned.fulfilment.returns.length,1);assert.equal(returned.fulfilment.returns[0].creditId,null);
    assert.equal(returned.fulfilment.credits.length,1);assert.deepEqual(returned.fulfilment.credits,credited.fulfilment.credits);
    assert.equal(returned.quantities.physical,physical.physical+1);
    assert.deepEqual(nativeRows(f.root,'SELECT event FROM pan515_events WHERE effect_key=?','CR-01'),retained);
    assert.equal(returned.events.find(e=>e.effectId==='CD-01').movementDelta,0);
  }finally{f.close();}
});

test('P03 AC4 original published dispatch promise is source-bound and immutable across a forward customer-receipt promise revision',async()=>{
  const f=await prepared();
  try{
    apply(f.root,pick());apply(f.root,pack());apply(f.root,issue());
    const before=trade.readPan515TradeState({root:f.root}),original=before.fulfilment.promises[0];
    assert.equal(original.kind,'DISPATCH');assert.equal(original.dueAt,common.sales_order.promised_dispatch_at);
    const oldRows=nativeRows(f.root,'SELECT event FROM pan515_events ORDER BY revision');
    apply(f.root,command('PROMISE',7,'PR-02',10,null,{effectiveAt:'2026-06-29T14:00:00Z',promise:{revision:2,kind:'CUSTOMER_RECEIPT',dueAt:'2026-07-01T23:59:59+02:00',previousPromiseDigest:original.promiseDigest,sourceReference:'SYN-CUSTOMER-PROMISE-02'}}));
    const after=trade.readPan515TradeState({root:f.root});assert.deepEqual(after.fulfilment.promises[0],original);
    assert.equal(after.fulfilment.promises[1].kind,'CUSTOMER_RECEIPT');assert.equal(after.fulfilment.promises[1].revision,2);
    assert.deepEqual(nativeRows(f.root,'SELECT event FROM pan515_events WHERE revision<=7 ORDER BY revision'),oldRows);
    const dispatch=after.events.find(e=>e.effectId==='SH-01');assert.equal(dispatch.effectiveAt,common.shipments[0].dispatched_at);
    assert.equal(dispatch.fulfilmentEvidence.eventType,'DISPATCH');assert.equal(dispatch.fulfilmentEvidence.promiseKind,'DISPATCH');assert.equal(dispatch.fulfilmentEvidence.promiseRevision,1);
  }finally{f.close();}
  const raw=await nativeTradeFixture({common:true});
  try{
    trade.initializePan515TradeState({root:raw.root,owner,caseId:common.id});
    const original=command('PROMISE',0,'PR-01',10,null,{effectiveAt:common.sales_order.accepted_at,promise:{revision:1,kind:'DISPATCH',dueAt:'2026-07-31T23:59:59+02:00',previousPromiseDigest:null,sourceReference:'COMMON-TRADE-01.sales_order'}});
    assert.throws(()=>apply(raw.root,original),/PAN517_ORIGINAL_COMMON_PROMISE_BINDING_DENIED/);
    assert.equal(nativeRows(raw.root,'SELECT event FROM pan515_events').length,0);
  }finally{raw.close();}
});

test('P03 AC5 dispatch alone never proves customer-receipt punctuality; actual late customer receipt uses its own explicit promise kind and revision',async()=>{
  const f=await prepared();
  try{
    apply(f.root,pick());apply(f.root,pack());apply(f.root,issue());
    const dispatched=trade.readPan515TradeState({root:f.root});
    assert.equal(dispatched.deliveryMilestones.dispatch.promiseKind,'DISPATCH');assert.equal(dispatched.deliveryMilestones.dispatch.onTimeQuantity,8);
    assert.equal(dispatched.deliveryMilestones.customerReceipt.status,'UNKNOWN_NO_CUSTOMER_RECEIPT_EVIDENCE');
    assert.equal(dispatched.deliveryMilestones.customerReceipt.onTimeQuantity,null);assert.equal(dispatched.deliveryMilestones.customerReceipt.positionOtif,null);
    const original=dispatched.fulfilment.promises[0];
    apply(f.root,command('PROMISE',7,'PR-02',10,null,{effectiveAt:'2026-06-29T14:00:00Z',promise:{revision:2,kind:'CUSTOMER_RECEIPT',dueAt:'2026-07-01T23:59:59+02:00',previousPromiseDigest:original.promiseDigest,sourceReference:'SYN-CUSTOMER-PROMISE-02'}}));
    const before=trade.readPan515TradeState({root:f.root});
    apply(f.root,command('CUSTOMER_RECEIPT',8,'CU-01',8,'SH-01',{effectiveAt:'2026-07-03T10:00:00Z',customerEvidenceId:'CE-01',promiseRevision:2}));
    const after=trade.readPan515TradeState({root:f.root});
    assert.deepEqual(after.quantities,before.quantities,'confirmed customer receipt is a milestone, not a second warehouse issue');
    assert.equal(after.deliveryMilestones.dispatch.originalPromiseRevision,1);assert.equal(after.deliveryMilestones.dispatch.onTimeQuantity,8);assert.equal(after.deliveryMilestones.dispatch.positionOtif,false);
    assert.equal(after.deliveryMilestones.customerReceipt.promiseKind,'CUSTOMER_RECEIPT');assert.equal(after.deliveryMilestones.customerReceipt.originalPromiseRevision,2);
    assert.equal(after.deliveryMilestones.customerReceipt.observedQuantity,8);assert.equal(after.deliveryMilestones.customerReceipt.onTimeQuantity,0);assert.equal(after.deliveryMilestones.customerReceipt.status,'LATE');assert.equal(after.deliveryMilestones.customerReceipt.positionOtif,false);
    const e=after.events.at(-1);assert.equal(e.fulfilmentEvidence.eventType,'CUSTOMER_RECEIPT');assert.equal(e.fulfilmentEvidence.promiseKind,'CUSTOMER_RECEIPT');assert.equal(e.fulfilmentEvidence.promiseRevision,2);assert.equal(e.effectiveAt,'2026-07-03T10:00:00Z');
    assert.equal(after.fulfilment.customerReceipts.length,1);assert.equal(after.fulfilment.customerReceipts[0].customerEvidenceId,'CE-01');
  }finally{f.close();}
});

test('P03 closed workflow cannot bypass pick/pack/issue with a legacy SHIP after fulfilment began',async()=>{
  const f=await prepared();
  try{
    const before=nativeRows(f.root,'SELECT command,event FROM pan515_events ORDER BY revision');
    const bypass={...command('SHIP',4,'SH-99',1,'RS-01',{reservationEventId:'RC-99'}),schemaVersion:'pansphaira.pan515/trade-command/v1'};
    assert.throws(()=>apply(f.root,bypass),/PAN517_LEGACY_SHIP_RETURN_BYPASS_DENIED/);
    assert.deepEqual(nativeRows(f.root,'SELECT command,event FROM pan515_events ORDER BY revision'),before);
  }finally{f.close();}
});

const originalNegatives=[
  ['duplicate physical dispatch with a new effect and transport identity',async f=>{
    apply(f.root,command('PICK',7,'PK-02',2,'RS-01',{effectiveAt:'2026-07-02T10:00:00Z'}));
    apply(f.root,command('PACK',8,'PA-02',2,'PK-02',{effectiveAt:'2026-07-02T11:00:00Z'}));
    return [command('ISSUE',9,'SH-02',2,'PA-02',{reservationId:'RS-01',reservationEventId:'RC-02',dispatchNoteId:'DN-02',physicalEvidenceId:'EV-01',promiseRevision:1,effectiveAt:'2026-07-02T13:00:00Z'}),/PAN517_DUPLICATE_PHYSICAL_DISPATCH_DENIED/];
  }],
  ['return above actually delivered quantity',async()=>[command('RETURN_RECEIPT',7,'RT-99',9,'SH-01',{effectiveAt:'2026-07-05T12:00:00Z',physicalEvidenceId:'EV-99'}),/PAN517_RETURN_EXCEEDS_ACTUAL_ISSUE_DENIED/]],
  ['missing reservation',async()=>[command('PICK',7,'PK-99',1,'RS-99',{effectiveAt:'2026-06-29T14:00:00Z'}),/PAN517_PICK_RESERVATION_REQUIRED_DENIED/]],
  ['quarantined returned stock cannot be reserved as available',async f=>{
    apply(f.root,command('RETURN_RECEIPT',7,'RT-01',1,'SH-01',{effectiveAt:'2026-07-05T12:00:00Z',physicalEvidenceId:'EV-02'}));
    return [{...command('RESERVE',8,'RS-99',1,null,{effectiveAt:'2026-07-05T12:00:00Z'}),schemaVersion:'pansphaira.pan515/trade-command/v1'},/PAN515_RESERVATION_EXCEEDS_USABLE_STOCK_DENIED/];
  }],
  ['complaint decision cannot stand in for physical return receipt',async f=>{
    apply(f.root,command('COMPLAINT',7,'CL-01',1,'SH-01',{effectiveAt:'2026-07-05T10:00:00Z'}));
    apply(f.root,command('COMPLAINT_DECISION',8,'CD-01',1,'CL-01',{effectiveAt:'2026-07-05T11:00:00Z',decision:{disposition:'RETURN_REQUESTED',rationale:'Requested return has not physically arrived'}}));
    return [command('RETURN_DECISION',9,'RD-99',1,'CL-01',{effectiveAt:'2026-07-05T12:00:00Z',decision:{disposition:'RELEASE',inspectionEvidenceId:'IN-99',rationale:'Forbidden complaint-as-return reinterpretation'}}),/PAN517_QUARANTINED_RETURN_REQUIRED_DENIED/];
  }],
];
for(const [name,make] of originalNegatives)test('P03 original negative: '+name,async()=>{
  const f=await prepared();
  try{
    apply(f.root,pick());apply(f.root,pack());apply(f.root,issue());
    const [c,pattern]=await make(f),before=trade.readPan515TradeState({root:f.root}),rows=nativeRows(f.root,'SELECT command,event FROM pan515_events ORDER BY revision');
    assert.throws(()=>apply(f.root,c),pattern);
    assert.deepEqual(trade.readPan515TradeState({root:f.root}),before);
    assert.deepEqual(nativeRows(f.root,'SELECT command,event FROM pan515_events ORDER BY revision'),rows);
  }finally{f.close();}
});
test('P03 original negative: punctual dispatch without customer receipt is not punctual delivery',async()=>{
  const f=await prepared();
  try{
    apply(f.root,pick());apply(f.root,pack());apply(f.root,issue());
    const before=nativeRows(f.root,'SELECT command,event FROM pan515_events ORDER BY revision'),s=trade.readPan515TradeState({root:f.root});
    assert.equal(s.deliveryMilestones.dispatch.onTimeQuantity,8);
    assert.equal(s.deliveryMilestones.customerReceipt.status,'UNKNOWN_NO_CUSTOMER_RECEIPT_EVIDENCE');
    assert.equal(s.deliveryMilestones.customerReceipt.onTimeQuantity,null);assert.notEqual(s.deliveryMilestones.customerReceipt.positionOtif,true);
    assert.deepEqual(nativeRows(f.root,'SELECT command,event FROM pan515_events ORDER BY revision'),before);
  }finally{f.close();}
});

test('P03 rollback disables only new fulfilment transitions and retains immutable performed movements for business correction',async()=>{
  const f=await prepared();
  try{
    apply(f.root,pick());apply(f.root,pack());apply(f.root,issue());
    const before=trade.readPan515TradeState({root:f.root}),rows=nativeRows(f.root,'SELECT command,event FROM pan515_events ORDER BY revision');
    apply(f.root,command('DISABLE',7,'DS-01',1,null,{effectiveAt:'2026-07-05T14:00:00Z',reason:'Retain movements and disable only the new P03 namespace'}));
    const disabled=trade.readPan515TradeState({root:f.root});
    assert.equal(disabled.fulfilment.writeMode,'DISABLED_RETAINED');assert.equal(disabled.writeMode,'ENABLED','existing qualified stock correction namespace is not disabled');
    assert.deepEqual(disabled.quantities,before.quantities);
    assert.deepEqual(nativeRows(f.root,'SELECT command,event FROM pan515_events WHERE revision<=7 ORDER BY revision'),rows);
    const failed=command('PICK',8,'PK-02',1,'RS-01',{effectiveAt:'2026-07-05T15:00:00Z'});
    assert.throws(()=>apply(f.root,failed),/PAN517_TRANSITIONS_DISABLED_RETAINED_DENIED/);
    assert.deepEqual(trade.readPan515TradeState({root:f.root}),disabled);
    assert.equal(disabled.events.at(-1).movementDelta,0);
  }finally{f.close();}
});
