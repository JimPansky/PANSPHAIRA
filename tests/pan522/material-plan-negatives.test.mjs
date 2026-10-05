import test from 'node:test';
import assert from 'node:assert/strict';
import reference from '../fixtures/pan522/pan-material-reference-v1.json' with {type:'json'};
import {planMaterialRequirements} from '../../src/pan522/material-plan.mjs';

test('P08 projected safety-plus-lot stock remains inside the declared quantity bound',()=>{
  const input=structuredClone(reference);input.items[0].supply='BUY';input.boms=[];
  input.items[0].safetyStock=1_000_000_000;input.items[0].lotMinimum=1_000_000_000;
  input.stock[0].physical=1_000_000_000;input.demands[0].quantity=1;
  assert.throws(()=>planMaterialRequirements(input),/^Error: PAN522_QUANTITY_RANGE_DENIED$/);
});

test('P08 all derived quantities retain the same billion-unit bound as explicit input snapshots',()=>{
  const input=structuredClone(reference);input.demands[0].quantity=1_000_000_000;
  assert.throws(()=>planMaterialRequirements(input),/^Error: PAN522_QUANTITY_RANGE_DENIED$/);
});

test('P08 bounded input graphs cannot create unbounded pegging paths',()=>{
  const input=structuredClone(reference),ids=Array.from({length:16},(_,i)=>'NODE-'+String(i).padStart(2,'0'));
  input.items=ids.map((id,i)=>({...input.items[0],id,stockArticleId:'SYN-ART-'+id,supply:i===15?'BUY':'MAKE'}));
  input.stock=ids.map(id=>({...input.stock[0],itemId:id}));
  input.demands=[{...input.demands[0],itemId:ids[0],quantity:1}];
  input.boms=ids.slice(0,-1).map((parentId,i)=>({parentId,version:parentId+'-V1',validFrom:'2026-10-01',validUntil:'2026-11-01',components:ids.slice(i+1).map(itemId=>({itemId,unit:'STK',quantityPer:1}))}));
  assert.throws(()=>planMaterialRequirements(input),/^Error: PAN522_REQUIREMENT_LIMIT_DENIED$/);
});

test('P08 data-only input denial does not invoke proxy traps',()=>{
  const input=structuredClone(reference);let invoked=0;
  input.items[0]=new Proxy(input.items[0],{getPrototypeOf(target){invoked++;return Object.getPrototypeOf(target);}});
  assert.throws(()=>planMaterialRequirements(input),/^Error: PAN522_INPUT_DATA_ONLY_DENIED$/);
  assert.equal(invoked,0);
});

test('P08 distinct item IDs cannot alias the same native stock position',()=>{
  const input=structuredClone(reference);input.items[2].stockArticleId=input.items[1].stockArticleId;
  assert.throws(()=>planMaterialRequirements(input),/^Error: PAN522_EXISTING_STOCK_CONTRACT_DENIED:DUPLICATE_POSITION$/);
});

test('P08 a calendar cannot silently schedule a release outside its explicit validity window',()=>{
  const input=structuredClone(reference);input.calendars[0].validFrom='2026-10-08';
  assert.throws(()=>planMaterialRequirements(input),/^Error: PAN522_CALENDAR_COVERAGE_DENIED$/);
});

test('P08 derived quantities cannot overflow the safe integer planning contract',()=>{
  const input=structuredClone(reference);input.demands[0].quantity=1_000_000_000;input.boms[0].components[0].quantityPer=1_000_000_000;
  assert.throws(()=>planMaterialRequirements(input),/^Error: PAN522_QUANTITY_RANGE_DENIED$/);
});

test('P08 closed snapshot grammar rejects extra authority fields, invalid dates and empty calendars without invoking accessors',()=>{
  const role=structuredClone(reference);role.actor='LOCAL_SYNTHETIC_OWNER';role.execute=true;
  assert.throws(()=>planMaterialRequirements(role),/^Error: PAN522_INPUT_SHAPE_DENIED$/);
  const badDate=structuredClone(reference);badDate.stock[0].physical=10;badDate.demands[0].dueDate='2026-02-30';
  assert.throws(()=>planMaterialRequirements(badDate),/^Error: PAN522_DATE_DENIED$/);
  const noWorkdays=structuredClone(reference);noWorkdays.stock[0].physical=10;noWorkdays.calendars[0].weekdays=[];
  assert.throws(()=>planMaterialRequirements(noWorkdays),/^Error: PAN522_CALENDAR_CONTRACT_DENIED$/);
  const accessor=structuredClone(reference);let called=0;
  Object.defineProperty(accessor.items[0],'safetyStock',{enumerable:true,get(){called++;return 0;}});
  assert.throws(()=>planMaterialRequirements(accessor),/^Error: PAN522_INPUT_DATA_ONLY_DENIED$/);
  assert.equal(called,0);
});

test('P08 component netting follows component need date, not root order, and never assigns a late receipt to earlier need',()=>{
  const input=structuredClone(reference);
  input.items.push({id:'KIT2',stockArticleId:'SYN-ART-KIT-TWO',warehouseId:'LAGER-PAN',unit:'STK',supply:'MAKE',safetyStock:0,lotMinimum:1,lotMultiple:1,leadWorkdays:8,calendarId:'CAL-PAN-WEEKDAYS'});
  input.stock.push({itemId:'KIT2',unit:'STK',physical:0,reserved:0,blocked:0,sourceRevision:'pan-stock-1',observedOn:'2026-10-05'});
  input.boms.push({parentId:'KIT2',version:'KIT2-V1',validFrom:'2026-10-01',validUntil:'2026-11-01',components:[{itemId:'A',unit:'STK',quantityPer:4}]});
  input.demands.push({id:'DEMAND-PAN-02',itemId:'KIT2',unit:'STK',quantity:1,dueDate:'2026-10-19'});
  input.receipts=[{id:'RECEIPT-A-01',itemId:'A',unit:'STK',quantity:20,dueDate:'2026-10-09',status:'CONFIRMED'}];
  const result=planMaterialRequirements(input);
  assert.equal(result.proposals.find(p=>p.itemId==='KIT2').releaseDate,'2026-10-07');
  // Stock5 covers the earlier Oct7 A4; stock1 plus on-time Oct9 receipt19 cover Oct12 A20.
  assert.deepEqual(result.proposals.filter(p=>p.itemId==='A'),[]);
});

test('P08 missing explicit item calendar is denied before finished stock can hide time assumptions',()=>{
  const input=structuredClone(reference);input.stock[0].physical=10;input.calendars=[];
  assert.throws(()=>planMaterialRequirements(input),/^Error: PAN522_CALENDAR_REQUIRED_DENIED$/);
});

test('P08 overlapping BOM versions are rejected even when finished goods hide all explosion',()=>{
  const input=structuredClone(reference);input.stock[0].physical=10;
  input.boms.push({...structuredClone(input.boms[0]),version:'KIT-V2',validFrom:'2026-10-05',validUntil:'2026-11-15'});
  assert.throws(()=>planMaterialRequirements(input),/^Error: PAN522_BOM_VERSION_OVERLAP_DENIED$/);
});

test('P08 demand or BOM edge unit cannot be silently converted to the stock unit',()=>{
  for(const which of ['demand','component']){
    const input=structuredClone(reference);
    if(which==='demand')input.demands[0].unit='kg';else input.boms[0].components[0].unit='kg';
    assert.throws(()=>planMaterialRequirements(input),/^Error: PAN522_UNIT_DENIED$/);
  }
});

test('P08 duplicate demand identity is rejected instead of creating two covered or duplicate proposals',()=>{
  const input=structuredClone(reference);input.demands.push(structuredClone(input.demands[0]));
  assert.throws(()=>planMaterialRequirements(input),/^Error: PAN522_DUPLICATE_DEMAND_ID_DENIED$/);
});

test('P08 BOM cycle is rejected before finished stock or absence of need can hide it',()=>{
  const input=structuredClone(reference);input.stock[0].physical=10;input.items[1].supply='MAKE';
  input.boms.push({parentId:'A',version:'A-V1',validFrom:'2026-10-01',validUntil:'2026-11-01',components:[{itemId:'KIT',unit:'STK',quantityPer:1}]});
  const before=JSON.stringify(input);
  assert.throws(()=>planMaterialRequirements(input),/^Error: PAN522_BOM_CYCLE_DENIED$/);
  assert.equal(JSON.stringify(input),before);
});
