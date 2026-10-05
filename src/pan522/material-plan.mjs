// Bounded P08 pure material proposal entry; never authorizes stock/procurement writes.
import {createHash} from 'node:crypto';
import {validatePlanInput} from './plan-input.mjs';
import {canonicalJson} from '../../dist/packages/contracts/src/canonical-json.js';
import {bestandslageBerechnenV1} from '../../dist/packages/contracts/src/bestand-nachschub-v1.js';

const digest=value=>createHash('sha256').update(canonicalJson(value)).digest('hex');
const denied=code=>{throw new Error(code);};
const safeQuantity=value=>{if(!Number.isSafeInteger(value)||value<0||value>1_000_000_000)denied('PAN522_QUANTITY_RANGE_DENIED');return value;};
const date=value=>new Date(value+'T00:00:00Z');
const day=value=>value.toISOString().slice(0,10);
function releaseDate(needDate,lead,calendar){
  const cursor=date(needDate);let remaining=lead;
  if(needDate<calendar.validFrom||needDate>=calendar.validUntil)denied('PAN522_CALENDAR_COVERAGE_DENIED');
  while(remaining){cursor.setUTCDate(cursor.getUTCDate()-1);const weekday=cursor.getUTCDay()||7;
    if(day(cursor)<calendar.validFrom)denied('PAN522_CALENDAR_COVERAGE_DENIED');
    if(calendar.weekdays.includes(weekday)&&!calendar.holidays.includes(day(cursor)))remaining--;
  }
  return day(cursor);
}

// Rollback changes only the new proposal view, never existing order transitions.
export function materialProposalView(input,mode='ENABLED'){
  if(mode==='ENABLED')return planMaterialRequirements(input);
  if(mode!=='DISABLED')denied('PAN522_PROPOSAL_MODE_DENIED');
  return {schema:'pansphaira.pan522/material-plan-result/v1',outcome:'MATERIAL_PROPOSALS_DISABLED',
    executionAuthorized:false,capacityQualified:false,proposals:[],
    nonclaims:['No procurement authority','No stock mutation','No finite capacity or delivery promise']};
}

export function planMaterialRequirements(input){
  validatePlanInput(input);
  if(input.schema!=='pansphaira.pan522/material-plan-input/v1')denied('PAN522_INPUT_SCHEMA_DENIED');
  if(new Set(input.demands.map(d=>d.id)).size!==input.demands.length)denied('PAN522_DUPLICATE_DEMAND_ID_DENIED');
  if(input.items.some(i=>!input.calendars.some(c=>c.id===i.calendarId)))denied('PAN522_CALENDAR_REQUIRED_DENIED');
  const units=new Map(input.items.map(i=>[i.id,i.unit]));
  if(input.items.some(i=>i.unit!=='STK')||[...input.demands,...input.stock,...input.receipts].some(row=>row.unit!==units.get(row.itemId))||input.boms.some(b=>b.components.some(c=>c.unit!==units.get(c.itemId))))denied('PAN522_UNIT_DENIED');
  for(const parentId of new Set(input.boms.map(b=>b.parentId))){
    const versions=input.boms.filter(b=>b.parentId===parentId).sort((a,b)=>a.validFrom.localeCompare(b.validFrom));
    for(let i=1;i<versions.length;i++)if(versions[i].validFrom<versions[i-1].validUntil)denied('PAN522_BOM_VERSION_OVERLAP_DENIED');
  }
  const adjacency=new Map(input.items.map(item=>[item.id,[]]));
  for(const bom of input.boms)adjacency.set(bom.parentId,[...(adjacency.get(bom.parentId)??[]),...bom.components.map(c=>c.itemId)]);
  const visiting=new Set(),visited=new Set();
  function checkCycle(itemId){
    if(visiting.has(itemId))denied('PAN522_BOM_CYCLE_DENIED');
    if(visited.has(itemId))return;
    visiting.add(itemId);for(const child of adjacency.get(itemId)??[])checkCycle(child);
    visiting.delete(itemId);visited.add(itemId);
  }
  for(const itemId of adjacency.keys())checkCycle(itemId);
  const before=canonicalJson(input),items=new Map(input.items.map(item=>[item.id,item]));
  const stock=bestandslageBerechnenV1(input.stock.map(row=>{
    const item=items.get(row.itemId);
    return {artikelId:item.stockArticleId,lagerortId:item.warehouseId,einheit:row.unit,
      physisch:row.physical,reserviert:row.reserved+row.blocked,
      herkunft:{quelle:'pan522-input-snapshot',beobachtetAm:row.observedOn+'T00:00:00Z',quelleRevision:row.sourceRevision}};
  }));
  if(stock.outcome!=='LAGE')denied('PAN522_EXISTING_STOCK_CONTRACT_DENIED:'+stock.code);
  const available=new Map(input.stock.map(row=>[row.itemId,row.physical-row.reserved-row.blocked]));
  const receiptRemaining=new Map(input.receipts.map(row=>[row.id,row.quantity]));
  const proposals=[],needs=new Map(input.items.map(i=>[i.id,[]]));
  let requirementCount=input.demands.length;
  for(const demand of input.demands)needs.get(demand.itemId).push({id:'demand:'+demand.id,itemId:demand.itemId,quantity:demand.quantity,dueDate:demand.dueDate,rootDemandId:demand.id,rootDemandIds:[demand.id],parentProposalId:null,bomVersion:null,allocationKind:'ROOT_DEMAND'});
  function net(itemId,needDate,requirements){
    const quantity=requirements.reduce((sum,row)=>safeQuantity(sum+row.quantity),0);
    const rootDemandIds=[...new Set(requirements.flatMap(row=>row.rootDemandIds))].sort();
    const bomVersions=[...new Set(requirements.map(row=>row.bomVersion).filter(v=>v!==null))].sort();
    const bomVersion=bomVersions.length===1?bomVersions[0]:null;
    const requirementAllocations=requirements.map(row=>({requirementId:row.id,rootDemandId:row.rootDemandId,rootDemandIds:[...row.rootDemandIds],parentProposalId:row.parentProposalId,bomVersion:row.bomVersion,allocationKind:row.allocationKind,quantity:row.quantity}));
    const item=items.get(itemId),free=available.get(itemId)??0,used=Math.min(Math.max(0,free-item.safetyStock),quantity);
    const safetyShortfall=Math.max(0,item.safetyStock-free);
    let shortage=quantity-used+safetyShortfall;
    available.set(itemId,free-used);
    const receiptAllocations=[],excludedReceipts=[];
    for(const receipt of [...input.receipts].filter(row=>row.itemId===itemId).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||a.id.localeCompare(b.id))){
      if(receipt.status!=='CONFIRMED'){excludedReceipts.push({receiptId:receipt.id,reason:'NOT_CONFIRMED'});continue;}
      if(receipt.dueDate>needDate){excludedReceipts.push({receiptId:receipt.id,reason:'AFTER_NEED_DATE'});continue;}
      const take=Math.min(shortage,receiptRemaining.get(receipt.id));
      if(take){receiptAllocations.push({receiptId:receipt.id,quantity:take});receiptRemaining.set(receipt.id,receiptRemaining.get(receipt.id)-take);shortage-=take;}
    }
    excludedReceipts.sort((a,b)=>a.receiptId.localeCompare(b.receiptId));
    const confirmedReceiptsConsumed=receiptAllocations.reduce((sum,row)=>sum+row.quantity,0);
    if(!shortage){available.set(itemId,free+confirmedReceiptsConsumed-quantity);return;}
    const planned=safeQuantity(Math.ceil(Math.max(shortage,item.lotMinimum)/item.lotMultiple)*item.lotMultiple);
    const calendar=input.calendars.find(c=>c.id===item.calendarId);
    const release=releaseDate(needDate,item.leadWorkdays,calendar);
    const projectedAvailable=safeQuantity(free+confirmedReceiptsConsumed+planned-quantity);
    available.set(itemId,projectedAvailable);
    // Existing stock/confirmed receipt coverage is FIFO by stable requirement ID.
    // Lot/safety surplus is explicit, never invented as another root demand.
    let covered=Math.min(quantity,used+confirmedReceiptsConsumed);
    const plannedAllocations=requirementAllocations.map(row=>{
      const take=Math.min(covered,row.quantity);covered-=take;
      return {...row,quantity:row.quantity-take,coveredQuantity:take};
    });
    const attributed=plannedAllocations.reduce((sum,row)=>sum+row.quantity,0);
    if(planned>attributed)plannedAllocations.push({requirementId:'surplus:proposal:'+itemId+':'+needDate,rootDemandId:null,rootDemandIds:[...rootDemandIds],parentProposalId:null,bomVersion:null,allocationKind:'SAFETY_OR_LOT_SURPLUS',quantity:planned-attributed,coveredQuantity:0});
    const proposal={id:'proposal:'+itemId+':'+needDate,itemId,grossQuantity:quantity,
      netQuantity:shortage,plannedQuantity:planned,needDate,releaseDate:release,
      rootDemandIds,requirementAllocations,plannedAllocations,executionAuthorized:false,capacityQualified:false,
      explanation:{bomVersion,bomVersions,selectedBomVersion:null,stockConsumed:used,confirmedReceiptsConsumed,
        safetyStock:item.safetyStock,safetyShortfall,projectedAvailable,
        receiptAllocations,excludedReceipts,unit:item.unit,lotMinimum:item.lotMinimum,lotMultiple:item.lotMultiple,
        leadWorkdays:item.leadWorkdays,calendarId:calendar.id}};
    proposals.push(proposal);
    if(item.supply==='MAKE'){
      const bom=input.boms.find(b=>b.parentId===itemId&&b.validFrom<=release&&release<b.validUntil);
      if(!bom)denied('PAN522_ACTIVE_BOM_REQUIRED_DENIED');
      proposal.explanation.selectedBomVersion=bom.version;
      for(const component of bom.components)for(const allocation of plannedAllocations){
        if(++requirementCount>4096)denied('PAN522_REQUIREMENT_LIMIT_DENIED');
        needs.get(component.itemId).push({
        id:'requirement:'+digest({parentProposalId:proposal.id,component:component.itemId,sourceRequirementId:allocation.requirementId}),
        itemId:component.itemId,quantity:safeQuantity(allocation.quantity*component.quantityPer),dueDate:release,
        rootDemandId:allocation.rootDemandId,rootDemandIds:[...allocation.rootDemandIds],
        parentProposalId:proposal.id,bomVersion:bom.version,allocationKind:allocation.allocationKind});
      }
    }
  }
  // Every parent contributes first; each component then sees its entire chronological need stream.
  const children=new Map([...adjacency].map(([id,rows])=>[id,[...new Set(rows)]]));
  const indegree=new Map(input.items.map(i=>[i.id,0]));
  for(const rows of children.values())for(const child of rows)indegree.set(child,indegree.get(child)+1);
  const ready=[...indegree].filter(([,degree])=>degree===0).map(([id])=>id).sort();
  while(ready.length){
    const itemId=ready.shift();
    const byDate=new Map();
    for(const need of needs.get(itemId)){
      if(!byDate.has(need.dueDate))byDate.set(need.dueDate,[]);
      byDate.get(need.dueDate).push(need);
    }
    for(const needDate of [...byDate.keys()].sort()){
      const requirements=byDate.get(needDate).sort((a,b)=>(a.rootDemandId??'').localeCompare(b.rootDemandId??'')||a.id.localeCompare(b.id));
      net(itemId,needDate,requirements);
    }
    for(const child of children.get(itemId)){indegree.set(child,indegree.get(child)-1);if(indegree.get(child)===0){ready.push(child);ready.sort();}}
  }
  proposals.sort((a,b)=>a.needDate.localeCompare(b.needDate)||a.itemId.localeCompare(b.itemId));
  return {schema:'pansphaira.pan522/material-plan-result/v1',outcome:'MATERIAL_PROPOSALS_ONLY',
    inputDigest:digest(input),stockContractDigest:stock.lage.lageDigest,
    executionAuthorized:false,capacityQualified:false,sourceInputUnchanged:canonicalJson(input)===before,
    proposals,nonclaims:['No procurement authority','No stock mutation','No finite capacity or delivery promise']};
}
