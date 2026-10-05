import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import reference from '../fixtures/pan522/pan-material-reference-v1.json' with {type:'json'};

test('P08 actual product entry explains PAN ten KIT gross/net/lots and exact working-day releases without effect', async()=>{
  const entry=new URL('../../src/pan522/material-plan.mjs',import.meta.url);
  assert.ok(existsSync(entry),'PAN522_NATIVE_MRP_ENTRY_NOT_IMPLEMENTED');
  const {planMaterialRequirements}=await import(entry.href);
  const before=JSON.stringify(reference),result=planMaterialRequirements(reference);
  assert.equal(result.outcome,'MATERIAL_PROPOSALS_ONLY');
  assert.equal(result.executionAuthorized,false);
  assert.equal(result.capacityQualified,false);
  assert.equal(result.sourceInputUnchanged,true);
  assert.equal(JSON.stringify(reference),before);
  const a=result.proposals.find(p=>p.itemId==='A'),b=result.proposals.find(p=>p.itemId==='B');
  assert.deepEqual([a.grossQuantity,b.grossQuantity],[20,30]);
  assert.deepEqual([a.plannedQuantity,b.plannedQuantity],[15,30]);
  assert.deepEqual([a.needDate,b.needDate],['2026-10-12','2026-10-12']);
  assert.deepEqual([a.releaseDate,b.releaseDate],['2026-10-07','2026-10-08']);
  assert.deepEqual(a.rootDemandIds,['DEMAND-PAN-01']);
  assert.equal(a.explanation.bomVersion,'KIT-V1');
  assert.equal(a.explanation.stockConsumed,5);
  assert.equal(a.explanation.confirmedReceiptsConsumed,0);
  assert.equal(a.explanation.unit,'STK');
});


test('P08 distinct same-date root demands aggregate once with unambiguous proposal identity and all quantitative provenance',async()=>{
  const {planMaterialRequirements}=await import('../../src/pan522/material-plan.mjs');
  const input=structuredClone(reference);input.demands.push({...input.demands[0],id:'DEMAND-PAN-02'});
  const result=planMaterialRequirements(input);
  assert.equal(new Set(result.proposals.map(p=>p.id)).size,result.proposals.length);
  assert.equal(result.proposals.length,3);
  const kit=result.proposals.find(p=>p.itemId==='KIT'),a=result.proposals.find(p=>p.itemId==='A'),b=result.proposals.find(p=>p.itemId==='B');
  assert.deepEqual([kit.grossQuantity,kit.plannedQuantity,a.grossQuantity,a.plannedQuantity,b.grossQuantity,b.plannedQuantity],[20,20,40,35,60,60]);
  assert.deepEqual(kit.rootDemandIds,['DEMAND-PAN-01','DEMAND-PAN-02']);
  assert.deepEqual(kit.requirementAllocations.map(r=>[r.rootDemandId,r.quantity]),[['DEMAND-PAN-01',10],['DEMAND-PAN-02',10]]);
  assert.deepEqual(a.requirementAllocations.map(r=>[r.rootDemandId,r.quantity]),[['DEMAND-PAN-01',20],['DEMAND-PAN-02',20]]);
  assert.deepEqual(b.requirementAllocations.map(r=>[r.rootDemandId,r.quantity]),[['DEMAND-PAN-01',30],['DEMAND-PAN-02',30]]);
  assert.deepEqual(planMaterialRequirements({...input,demands:[...input.demands].reverse()}).proposals,result.proposals);
});

test('P08 versioned multilevel lot explosion retains safety floor and explains every dependency', async()=>{
  const {planMaterialRequirements}=await import('../../src/pan522/material-plan.mjs');
  const input=structuredClone(reference),aItem=input.items.find(i=>i.id==='A');
  aItem.supply='MAKE';aItem.safetyStock=3;
  input.items.push({id:'C',stockArticleId:'SYN-ART-COM-C',warehouseId:'LAGER-PAN',unit:'STK',supply:'BUY',safetyStock:2,lotMinimum:5,lotMultiple:5,leadWorkdays:1,calendarId:'CAL-PAN-WEEKDAYS'});
  input.stock.push({itemId:'C',unit:'STK',physical:5,reserved:0,blocked:0,sourceRevision:'pan-stock-1',observedOn:'2026-10-05'});
  input.boms.push({parentId:'A',version:'A-V1',validFrom:'2026-10-01',validUntil:'2026-11-01',components:[{itemId:'C',unit:'STK',quantityPer:2}]});
  const result=planMaterialRequirements(input),a=result.proposals.find(p=>p.itemId==='A'),c=result.proposals.find(p=>p.itemId==='C');
  assert.deepEqual([a.grossQuantity,a.netQuantity,a.plannedQuantity],[20,18,20]);
  assert.deepEqual([a.explanation.stockConsumed,a.explanation.safetyStock,a.explanation.projectedAvailable],[2,3,5]);
  assert.equal(a.explanation.bomVersion,'KIT-V1');
  assert.equal(a.explanation.selectedBomVersion,'A-V1');
  assert.deepEqual([c.grossQuantity,c.netQuantity,c.plannedQuantity],[40,37,40]);
  assert.equal(c.explanation.bomVersion,'A-V1');
  assert.deepEqual([c.needDate,c.releaseDate],['2026-10-07','2026-10-06']);
  assert.deepEqual(c.rootDemandIds,['DEMAND-PAN-01']);
});

test('P08 finished-goods stock reduces root net quantity before any BOM explosion', async()=>{
  const {planMaterialRequirements}=await import('../../src/pan522/material-plan.mjs');
  const input=structuredClone(reference);input.stock[0].physical=2;
  const result=planMaterialRequirements(input);
  assert.equal(result.proposals.find(p=>p.itemId==='KIT').plannedQuantity,8);
  assert.deepEqual(result.proposals.filter(p=>p.itemId!=='KIT').map(p=>[p.itemId,p.grossQuantity]),[['A',16],['B',24]]);
});

test('P08 only a confirmed receipt available by need covers shortage; late and unknown access stays explicit', async()=>{
  const {planMaterialRequirements}=await import('../../src/pan522/material-plan.mjs');
  const input=structuredClone(reference);
  input.receipts=[{id:'RECEIPT-A-01',itemId:'A',unit:'STK',quantity:5,dueDate:'2026-10-09',status:'CONFIRMED'},
    {id:'RECEIPT-A-LATE',itemId:'A',unit:'STK',quantity:100,dueDate:'2026-10-13',status:'CONFIRMED'},
    {id:'RECEIPT-A-UNKNOWN',itemId:'A',unit:'STK',quantity:100,dueDate:'2026-10-08',status:'UNKNOWN'}];
  const before=JSON.stringify(input),result=planMaterialRequirements(input),a=result.proposals.find(p=>p.itemId==='A');
  assert.equal(a.plannedQuantity,10);
  assert.equal(a.explanation.stockConsumed,5);
  assert.equal(a.explanation.confirmedReceiptsConsumed,5);
  assert.deepEqual(a.explanation.receiptAllocations,[{receiptId:'RECEIPT-A-01',quantity:5}]);
  assert.deepEqual(a.explanation.excludedReceipts,[{receiptId:'RECEIPT-A-LATE',reason:'AFTER_NEED_DATE'},{receiptId:'RECEIPT-A-UNKNOWN',reason:'NOT_CONFIRMED'}]);
  assert.equal(JSON.stringify(input),before);
  const lateOnly=structuredClone(reference);lateOnly.receipts=[input.receipts[1]];
  assert.equal(planMaterialRequirements(lateOnly).proposals.find(p=>p.itemId==='A').plannedQuantity,15);
});
