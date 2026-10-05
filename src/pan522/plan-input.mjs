// Closed data-only P08 snapshot grammar. Input metadata is never execution authority.
import {types} from 'node:util';
const fail=code=>{throw new Error(code);};
const shape=()=>fail('PAN522_INPUT_SHAPE_DENIED');
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const token=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9:-]{0,63}$/.test(value);
const quantity=value=>Number.isSafeInteger(value)&&value>=0&&value<=1_000_000_000;
export function isPlanDate(value){
  if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(value))return false;
  const parsed=new Date(value+'T00:00:00Z');
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
}
function dataOnly(value,ancestors=new Set(),depth=0,budget={count:0}){
  if(++budget.count>4096||depth>12)fail('PAN522_INPUT_DATA_ONLY_DENIED');
  if(value===null||typeof value==='boolean'||typeof value==='string')return;
  if(typeof value==='number'&&Number.isFinite(value))return;
  if(typeof value!=='object'||value===null||types.isProxy(value)||ancestors.has(value))fail('PAN522_INPUT_DATA_ONLY_DENIED');
  const array=Array.isArray(value);
  if(array?Object.getPrototypeOf(value)!==Array.prototype:!isRecord(value))fail('PAN522_INPUT_DATA_ONLY_DENIED');
  const descriptors=Object.getOwnPropertyDescriptors(value);
  const keys=Reflect.ownKeys(descriptors);
  for(const key of keys){
    const d=descriptors[key];
    if(typeof key!=='string'||!Object.hasOwn(d,'value')||d.get||d.set)fail('PAN522_INPUT_DATA_ONLY_DENIED');
    if(array&&key==='length')continue;
    if(!d.enumerable)fail('PAN522_INPUT_DATA_ONLY_DENIED');
  }
  if(array){
    const length=descriptors.length.value;
    if(!Number.isSafeInteger(length)||length>256||keys.length!==length+1||keys.some(k=>k!=='length'&&!/^(0|[1-9][0-9]*)$/.test(k)))fail('PAN522_INPUT_DATA_ONLY_DENIED');
  }
  ancestors.add(value);
  for(const key of keys)if(!array||key!=='length')dataOnly(descriptors[key].value,ancestors,depth+1,budget);
  ancestors.delete(value);
}
function closed(value,keys){
  if(!isRecord(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))shape();
}
function rows(value,max=128){if(!Array.isArray(value)||value.length>max)shape();}
function realDate(value){if(!isPlanDate(value))fail('PAN522_DATE_DENIED');}
function window(row){realDate(row.validFrom);realDate(row.validUntil);if(row.validFrom>=row.validUntil)fail('PAN522_DATE_DENIED');}
function ids(rows,key,code){if(new Set(rows.map(row=>row[key])).size!==rows.length)fail(code);}
export function validatePlanInput(input){
  dataOnly(input);
  closed(input,['schema','asOf','horizonEnd','calendars','items','boms','demands','stock','receipts']);
  if(input.schema!=='pansphaira.pan522/material-plan-input/v1')fail('PAN522_INPUT_SCHEMA_DENIED');
  realDate(input.asOf);realDate(input.horizonEnd);
  if(input.horizonEnd<input.asOf||new Date(input.horizonEnd)-new Date(input.asOf)>366*86_400_000)fail('PAN522_DATE_DENIED');
  for(const key of ['calendars','items','boms','demands','stock','receipts'])rows(input[key]);
  if(!input.items.length||input.items.length>64)shape();
  for(const calendar of input.calendars){
    closed(calendar,['id','timezone','weekdays','holidays','validFrom','validUntil']);window(calendar);
    rows(calendar.weekdays,7);rows(calendar.holidays);
    if(!token(calendar.id)||calendar.timezone!=='UTC'||!calendar.weekdays.length||calendar.weekdays.some(d=>!Number.isInteger(d)||d<1||d>7)||new Set(calendar.weekdays).size!==calendar.weekdays.length)fail('PAN522_CALENDAR_CONTRACT_DENIED');
    for(const holiday of calendar.holidays){realDate(holiday);if(holiday<calendar.validFrom||holiday>=calendar.validUntil)fail('PAN522_CALENDAR_CONTRACT_DENIED');}
    if(new Set(calendar.holidays).size!==calendar.holidays.length)fail('PAN522_CALENDAR_CONTRACT_DENIED');
  }
  ids(input.calendars,'id','PAN522_CALENDAR_CONTRACT_DENIED');
  for(const item of input.items){
    closed(item,['id','stockArticleId','warehouseId','unit','supply','safetyStock','lotMinimum','lotMultiple','leadWorkdays','calendarId']);
    if(![item.id,item.stockArticleId,item.warehouseId,item.calendarId].every(token)||typeof item.unit!=='string'||!['MAKE','BUY'].includes(item.supply)||![item.safetyStock,item.lotMinimum,item.lotMultiple].every(quantity)||!item.lotMultiple||!Number.isInteger(item.leadWorkdays)||item.leadWorkdays<0||item.leadWorkdays>366)shape();
  }
  ids(input.items,'id','PAN522_DUPLICATE_ITEM_ID_DENIED');
  const itemIds=new Set(input.items.map(i=>i.id));
  for(const bom of input.boms){
    closed(bom,['parentId','version','validFrom','validUntil','components']);window(bom);rows(bom.components,64);
    if(!itemIds.has(bom.parentId)||!token(bom.version)||!bom.components.length)shape();
    if(input.items.find(i=>i.id===bom.parentId).supply!=='MAKE')shape();
    for(const component of bom.components){closed(component,['itemId','unit','quantityPer']);if(!itemIds.has(component.itemId)||typeof component.unit!=='string'||!quantity(component.quantityPer)||!component.quantityPer)shape();}
    ids(bom.components,'itemId','PAN522_DUPLICATE_BOM_COMPONENT_DENIED');
  }
  for(const demand of input.demands){
    closed(demand,['id','itemId','unit','quantity','dueDate']);realDate(demand.dueDate);
    if(!token(demand.id)||!itemIds.has(demand.itemId)||typeof demand.unit!=='string'||!quantity(demand.quantity)||!demand.quantity)shape();
    if(demand.dueDate<input.asOf||demand.dueDate>input.horizonEnd)fail('PAN522_DATE_DENIED');
  }
  for(const row of input.stock){
    closed(row,['itemId','unit','physical','reserved','blocked','sourceRevision','observedOn']);realDate(row.observedOn);
    if(!itemIds.has(row.itemId)||typeof row.unit!=='string'||![row.physical,row.reserved,row.blocked].every(quantity)||!token(row.sourceRevision))shape();
    if(row.observedOn!==input.asOf)fail('PAN522_STOCK_SNAPSHOT_DATE_DENIED');
  }
  ids(input.stock,'itemId','PAN522_DUPLICATE_STOCK_ROW_DENIED');
  if(input.stock.length!==input.items.length)fail('PAN522_EXPLICIT_STOCK_SNAPSHOT_REQUIRED_DENIED');
  for(const receipt of input.receipts){
    closed(receipt,['id','itemId','unit','quantity','dueDate','status']);realDate(receipt.dueDate);
    if(!token(receipt.id)||!itemIds.has(receipt.itemId)||typeof receipt.unit!=='string'||!quantity(receipt.quantity)||!receipt.quantity||!['CONFIRMED','UNKNOWN'].includes(receipt.status))shape();
    if(receipt.dueDate<input.asOf)fail('PAN522_RECEIPT_SNAPSHOT_DATE_DENIED');
  }
  ids(input.receipts,'id','PAN522_DUPLICATE_RECEIPT_ID_DENIED');
}
