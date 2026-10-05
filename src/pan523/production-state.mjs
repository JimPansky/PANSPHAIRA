// P09 bounded local native production ledger. It reuses the stock contract;
// no caller role, model, selected valuation or document metadata creates authority.
import {types} from 'node:util';
import common from '../../contracts/trade/common-trade-01-v1.json' with {type:'json'};
import {isRealTradeInstant} from '../pan517/fulfilment-state.mjs';
import {canonicalJson,digest,fail,exact,guardsMatch} from '../pan473/scope-profile.mjs';
import {bestandslageBerechnenV1,bestandAenderungAnwendenV1} from '../../dist/packages/contracts/src/bestand-nachschub-v1.js';

export const PAN523_CONFIGURATION_V1='pansphaira.pan523/production-configuration/v1';
const TABLES=['pan523_binding','pan523_events','pan523_control','pan523_invoice_refs'];
const GUARDS=TABLES.flatMap(table=>['UPDATE','DELETE'].map(action=>({name:`${table}_${action.toLowerCase()}_immutable`,sql:`CREATE TRIGGER ${table}_${action.toLowerCase()}_immutable BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT,'PAN523_HISTORY_IMMUTABLE_DENIED'); END`})));
const token=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9:-]{0,63}$/.test(v);
const number=(v,max=1_000_000_000)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
function dataOnly(v,seen=new Set(),depth=0,budget={n:0}){
  if(++budget.n>4096||depth>12)fail('PAN523_DATA_ONLY_DENIED');
  if(v===null||typeof v==='boolean'||typeof v==='string'||typeof v==='number'&&Number.isSafeInteger(v))return;
  if(typeof v!=='object'||v===null||types.isProxy(v)||seen.has(v))fail('PAN523_DATA_ONLY_DENIED');
  const array=Array.isArray(v),prototype=Object.getPrototypeOf(v);
  if(array?prototype!==Array.prototype:prototype!==Object.prototype)fail('PAN523_DATA_ONLY_DENIED');
  const descriptors=Object.getOwnPropertyDescriptors(v),keys=Reflect.ownKeys(descriptors);
  for(const k of keys){const d=descriptors[k];if(typeof k!=='string'||!Object.hasOwn(d,'value')||d.get||d.set||!d.enumerable&&!(array&&k==='length'))fail('PAN523_DATA_ONLY_DENIED');}
  if(array&&(descriptors.length.value>64||keys.length!==descriptors.length.value+1||keys.some(k=>k!=='length'&&!/^(0|[1-9][0-9]*)$/.test(k))))fail('PAN523_DATA_ONLY_DENIED');
  seen.add(v);for(const k of keys)if(!array||k!=='length')dataOnly(descriptors[k].value,seen,depth+1,budget);seen.delete(v);
}
function closed(v,keys){if(!exact(v,keys))fail('PAN523_CONFIGURATION_SHAPE_DENIED');}
function configuration(value,native){
  dataOnly(value);closed(value,['schemaVersion','productionOrderId','orderQuantity','bom','openingStock','valuation']);
  if(value.schemaVersion!==PAN523_CONFIGURATION_V1||!token(value.productionOrderId)||!number(value.orderQuantity)||!value.orderQuantity||value.orderQuantity!==native.orderQuantity||!['PAN515-LEGACY-DRAFT-06','COMMON-TRADE-01'].includes(native.caseId))fail('PAN523_NATIVE_PRODUCTION_PROFILE_DENIED');
  closed(value.bom,['version','components']);if(!token(value.bom.version)||!Array.isArray(value.bom.components)||!value.bom.components.length)fail('PAN523_BOM_REQUIRED_DENIED');
  const ids=new Set(),stockIds=new Set();
  for(const c of value.bom.components){closed(c,['itemId','stockArticleId','quantityPerUnit']);if(!token(c.itemId)||!/^SYN-ART-[A-Z0-9-]{3,28}$/.test(c.stockArticleId)||c.stockArticleId===native.nativeIdentityMapping.stockArticleId||!number(c.quantityPerUnit)||!c.quantityPerUnit||ids.has(c.itemId)||stockIds.has(c.stockArticleId))fail('PAN523_BOM_COMPONENT_DENIED');ids.add(c.itemId);stockIds.add(c.stockArticleId);}
  if(!Array.isArray(value.openingStock)||value.openingStock.length!==stockIds.size||value.openingStock.some(p=>!stockIds.has(p.artikelId)||p.lagerortId!==native.nativeIdentityMapping.stockWarehouseId||p.herkunft===null)||new Set(value.openingStock.map(p=>p.artikelId)).size!==stockIds.size)fail('PAN523_EXPLICIT_COMPONENT_STOCK_REQUIRED_DENIED');
  const stock=bestandslageBerechnenV1(value.openingStock);if(stock.outcome!=='LAGE')fail('PAN523_EXISTING_STOCK_CONTRACT_DENIED:'+stock.code);
  closed(value.valuation,['version','currency','materialRates','resources']);const v=value.valuation;
  if(!token(v.version)||v.currency!=='EUR'||!Array.isArray(v.materialRates)||v.materialRates.length!==ids.size||!Array.isArray(v.resources)||!v.resources.length)fail('PAN523_EXPLICIT_VALUATION_REQUIRED_DENIED');
  const rates=new Set();for(const r of v.materialRates){closed(r,['itemId','unitCostMinor']);if(!ids.has(r.itemId)||!number(r.unitCostMinor,1_000_000)||rates.has(r.itemId))fail('PAN523_MATERIAL_RATE_REQUIRED_DENIED');rates.add(r.itemId);}
  const resources=new Set();for(const r of v.resources){closed(r,['resourceId','rateMinorPerMinute','plannedMinutesPerUnit']);if(!token(r.resourceId)||!number(r.rateMinorPerMinute,1_000_000)||!number(r.plannedMinutesPerUnit,1_000_000)||resources.has(r.resourceId))fail('PAN523_RESOURCE_RATE_REQUIRED_DENIED');resources.add(r.resourceId);}
  return {value:JSON.parse(canonicalJson(value)),stock:stock.lage};
}
function nativeCore(native,source){return {nativeBindingDigest:digest(native),nativeQuantityRevision:native.nativeQuantityRevision,nativeOrderLineDigest:digest({order:source.order,line:source.line})};}
export function initializeProductionLedger({db,native,source,configuration:input}){
  const found=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('pan523_binding','pan523_events','pan523_control')").all();if(found.length)fail('PAN523_EXISTING_LEDGER_ADOPTION_DENIED');
  const checked=configuration(input,native),binding={schemaVersion:'pansphaira.pan523/production-binding/v1',scope:'LOCAL_SYNTHETIC_DISPOSABLE',productionOrderId:checked.value.productionOrderId,...nativeCore(native,source),configurationDigest:digest(checked.value),configuration:checked.value};
  // Admit the complete initial state, including aggregate integer costs, before creating any ledger.
  initialProductionState(binding);
  db.exec('CREATE TABLE pan523_binding(id INTEGER PRIMARY KEY CHECK(id=1),binding TEXT NOT NULL); CREATE TABLE pan523_events(revision INTEGER PRIMARY KEY,effect_key TEXT UNIQUE NOT NULL,command TEXT NOT NULL,event TEXT NOT NULL); CREATE TABLE pan523_control(id INTEGER PRIMARY KEY CHECK(id=1),record TEXT NOT NULL); CREATE TABLE pan523_invoice_refs(revision INTEGER PRIMARY KEY,effect_key TEXT UNIQUE NOT NULL,command TEXT NOT NULL,event TEXT NOT NULL);');
  db.prepare('INSERT INTO pan523_binding VALUES(1,?)').run(canonicalJson(binding));for(const g of GUARDS)db.exec(g.sql);
  return {outcome:'INITIALIZED',binding};
}
export function readProductionBinding({db,native,source}){
  if(!guardsMatch(db,GUARDS))fail('PAN523_STORE_GUARDS_REQUIRED_DENIED');const row=db.prepare('SELECT binding FROM pan523_binding WHERE id=1').get();if(!row)fail('PAN523_BINDING_REQUIRED_DENIED');const binding=JSON.parse(row.binding),checked=configuration(binding.configuration,native);
  if(!exact(binding,['schemaVersion','scope','productionOrderId','nativeBindingDigest','nativeQuantityRevision','nativeOrderLineDigest','configurationDigest','configuration'])||binding.schemaVersion!=='pansphaira.pan523/production-binding/v1'||binding.scope!=='LOCAL_SYNTHETIC_DISPOSABLE'||binding.productionOrderId!==checked.value.productionOrderId||binding.configurationDigest!==digest(checked.value)||Object.entries(nativeCore(native,source)).some(([k,v])=>binding[k]!==v))fail('PAN523_STABLE_NATIVE_BINDING_DRIFT_DENIED');
  return binding;
}


// Technical billing references are persisted facts tied to an actual produced
// dispatch. They are never emitted as fiscal invoices or financial profit.
export const PAN523_INVOICE_V1='pansphaira.pan523/operative-invoice-reference/v1';
const INVOICE_KEYS=['schemaVersion','effectId','transportId','expectedRevision','orderId','lineId','articleId','warehouseId','unit','kind','quantity','referenceId','effectiveAt','reason','expectedProductionRevision','invoice'];
export function validateProductionInvoice(c,native){
  dataOnly(c);
  if(!exact(c,INVOICE_KEYS)||c.schemaVersion!==PAN523_INVOICE_V1||c.kind!=='OPERATIVE_INVOICE_REFERENCE'||native.caseId!==common.id||!eventToken(c.effectId)||!eventToken(c.transportId)||!number(c.expectedRevision)||!number(c.expectedProductionRevision)||!number(c.quantity)||!c.quantity||!eventToken(c.referenceId)||!isRealTradeInstant(c.effectiveAt)||typeof c.reason!=='string'||!c.reason.length||c.reason.length>120||/[\x00-\x1f]/.test(c.reason))fail('PAN523_OPERATIVE_INVOICE_SHAPE_DENIED');
  if(['orderId','lineId','articleId','warehouseId','unit'].some(k=>c[k]!==native[k]))fail('PAN515_COMPOSITE_NATIVE_IDENTITY_DENIED');
  const v=c.invoice,doc=common.sales_documents.find(d=>d.type==='INVOICE'&&d.id===v?.documentId);
  if(!exact(v,['documentId','documentLineId','invoiceDate','netMinor','currency'])||!doc||v.documentLineId!==doc.line_id||v.invoiceDate!==doc.invoice_date||v.netMinor!==doc.net_absolute_minor||v.currency!==common.scope.currency||c.quantity!==doc.quantity_absolute||c.referenceId!==doc.shipment_id||c.effectiveAt.slice(0,10)!==doc.invoice_date)fail('PAN523_EXPLICIT_OPERATIVE_DOCUMENT_BINDING_DENIED');
}
export function advanceProductionInvoice(before,c,binding,native,leading){
  validateProductionInvoice(c,native);
  if(c.expectedProductionRevision!==before.revision)fail('PAN523_STALE_PRODUCTION_REVISION_DENIED');
  if(before.invoices.some(e=>e.invoice.documentId===c.invoice.documentId))fail('PAN523_OPERATIVE_INVOICE_ALREADY_REFERENCED_DENIED');
  const shipment=leading.shipments.find(s=>s.id===c.referenceId),note=leading.fulfilment?.deliveryNotes.find(n=>n.shipmentId===c.referenceId),dispatch=leading.events.find(e=>e.effectId===c.referenceId&&e.kind==='ISSUE');
  if(!shipment||!note||!dispatch||shipment.quantity!==c.quantity||note.quantity!==c.quantity||shipment.allocations.some(a=>!before.events.some(e=>e.effectId===a.lotId)))fail('PAN523_ACTUAL_PRODUCED_DISPATCH_REQUIRED_DENIED');
  const next=JSON.parse(canonicalJson(before)),core={schemaVersion:'pansphaira.pan523/operative-invoice-event/v1',revision:before.invoices.length+1,effectId:c.effectId,productionBindingDigest:digest(binding),productionRevision:before.revision,shipmentId:shipment.id,dispatchEventDigest:dispatch.eventDigest,quantity:c.quantity,invoice:c.invoice,effectiveAt:c.effectiveAt,previousReferenceDigest:before.invoices.at(-1)?.referenceDigest??null,fiscalInvoiceQualified:false,financialProfit:false};
  next.invoices.push({...core,referenceDigest:digest(core)});return next;
}
export function productionInvoiceEvidence(production){const last=production.invoices.at(-1);return {referenceDigest:last.referenceDigest,productionBindingDigest:last.productionBindingDigest,shipmentId:last.shipmentId,dispatchEventDigest:last.dispatchEventDigest,documentId:last.invoice.documentId,fiscalInvoiceQualified:false,financialProfit:false};}
export function appendProductionInvoice({db,command,production,tradeEventDigest}){const event={...production.invoices.at(-1),tradeEventDigest};db.prepare('INSERT INTO pan523_invoice_refs VALUES(?,?,?,?)').run(event.revision,command.effectId,canonicalJson(command),canonicalJson(event));}


export function productionMode({db,binding}){
  const row=db.prepare('SELECT record FROM pan523_control WHERE id=1').get();if(!row)return {mode:'ENABLED'};
  const r=JSON.parse(row.record);if(!exact(r,['mode','bindingDigest','atMs','reason'])||r.mode!=='DISABLED_RETAINED'||r.bindingDigest!==digest(binding)||!Number.isSafeInteger(r.atMs)||r.atMs<0||typeof r.reason!=='string'||!r.reason.length||r.reason.length>120||/[\x00-\x1f]/.test(r.reason))fail('PAN523_REPORT_CONTROL_BINDING_DENIED');return r;
}
export function assertProductionReportWritable({db,binding}){if(productionMode({db,binding}).mode!=='ENABLED')fail('PAN523_NEW_REPORTS_DISABLED_RETAINED_DENIED');}
export function disableProductionReports({db,binding,reason}){
  const old=productionMode({db,binding});if(old.mode==='DISABLED_RETAINED')return {outcome:'PRODUCTION_REPORTS_DISABLED_RETAINED',receipt:old};
  const record={mode:'DISABLED_RETAINED',bindingDigest:digest(binding),atMs:Date.now(),reason};db.prepare('INSERT INTO pan523_control VALUES(1,?)').run(canonicalJson(record));if(canonicalJson(productionMode({db,binding}))!==canonicalJson(record))fail('PAN523_REPORT_CONTROL_READBACK_DENIED');return {outcome:'PRODUCTION_REPORTS_DISABLED_RETAINED',receipt:record};
}

export const PAN523_REPORT_V1='pansphaira.pan523/production-report/v1';
const REPORT_KEYS=['schemaVersion','effectId','transportId','expectedRevision','orderId','lineId','articleId','warehouseId','unit','kind','quantity','referenceId','effectiveAt','reason','expectedProductionRevision','bomVersion','valuationVersion','goodQuantity','scrapQuantity','materials','resources','final'];
const eventToken=v=>typeof v==='string'&&/^(?:synthetic:[a-z0-9-]{3,64}|[A-Z]{2,8}-[0-9]{2})$/.test(v);
function safeCost(n){if(n<0n||n>BigInt(Number.MAX_SAFE_INTEGER))fail('PAN523_COST_RANGE_DENIED');return Number(n);}
function standardCost(configuration,quantity){
  let total=0n;for(const c of configuration.bom.components){const rate=configuration.valuation.materialRates.find(r=>r.itemId===c.itemId);total+=BigInt(c.quantityPerUnit)*BigInt(quantity)*BigInt(rate.unitCostMinor);}
  for(const r of configuration.valuation.resources)total+=BigInt(r.plannedMinutesPerUnit)*BigInt(quantity)*BigInt(r.rateMinorPerMinute);return safeCost(total);
}
export function validateProductionCommand(c,native){
  dataOnly(c);if(!exact(c,REPORT_KEYS)||c.schemaVersion!==PAN523_REPORT_V1||c.kind!=='PRODUCTION_REPORT'||!eventToken(c.effectId)||!eventToken(c.transportId)||!number(c.expectedRevision)||!number(c.expectedProductionRevision)||!token(c.referenceId)||!token(c.bomVersion)||!token(c.valuationVersion)||typeof c.final!=='boolean'||typeof c.reason!=='string'||!c.reason.length||c.reason.length>120||/[\x00-\x1f]/.test(c.reason))fail('PAN523_REPORT_SHAPE_DENIED');
  if(['orderId','lineId','articleId','warehouseId','unit'].some(k=>c[k]!==native[k]))fail('PAN515_COMPOSITE_NATIVE_IDENTITY_DENIED');
  if(!number(c.goodQuantity)||!number(c.scrapQuantity)||!number(c.quantity)||c.quantity!==c.goodQuantity||!number(c.goodQuantity+c.scrapQuantity)||c.goodQuantity+c.scrapQuantity<1)fail('PAN523_GOOD_SCRAP_QUANTITY_DENIED');
  if(typeof c.effectiveAt!=='string'||!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(c.effectiveAt)||!Number.isFinite(Date.parse(c.effectiveAt))||new Date(c.effectiveAt).toISOString()!==c.effectiveAt.replace('Z','.000Z'))fail('PAN523_EFFECTIVE_DATE_DENIED');
  if(!Array.isArray(c.materials)||!c.materials.length||!Array.isArray(c.resources)||!c.resources.length)fail('PAN523_EXPLICIT_REPORT_FACTS_REQUIRED_DENIED');
  for(const m of c.materials)if(!exact(m,['itemId','quantity'])||!token(m.itemId)||!number(m.quantity)||!m.quantity)fail('PAN523_MATERIAL_QUANTITY_DENIED');
  for(const r of c.resources)if(!exact(r,['resourceId','minutes'])||!token(r.resourceId)||!number(r.minutes,1_000_000))fail('PAN523_RESOURCE_FACT_REQUIRED_DENIED');
}
export function initialProductionState(binding){
  const c=binding.configuration,stock=bestandslageBerechnenV1(c.openingStock);if(stock.outcome!=='LAGE')fail('PAN523_EXISTING_STOCK_CONTRACT_DENIED:'+stock.code);
  return {binding,revision:0,processedQuantity:0,goodQuantity:0,scrapQuantity:0,stock:stock.lage,appliedStockIds:[],events:[],invoices:[],valuation:c.valuation,standardPlannedCostMinor:standardCost(c,c.orderQuantity),costStatus:'OPERATIVE_ONLY',scope:'LOCAL_SYNTHETIC_DISPOSABLE',financialValuationQualified:false,capacityQualified:false};
}
export function advanceProductionReport(before,c,binding,native){
  validateProductionCommand(c,native);const configuration=binding.configuration;
  if(c.referenceId!==binding.productionOrderId||c.bomVersion!==configuration.bom.version||c.valuationVersion!==configuration.valuation.version)fail('PAN523_FROZEN_BOM_OR_VALUATION_REVISION_DENIED');
  if(c.expectedProductionRevision!==before.revision)fail('PAN523_STALE_PRODUCTION_REVISION_DENIED');
  if(before.events.at(-1)?.final)fail('PAN523_ALREADY_FINAL_DENIED');
  const processed=c.goodQuantity+c.scrapQuantity;if(processed>configuration.orderQuantity-before.processedQuantity)fail('PAN523_ORDER_REPORT_QUANTITY_BOUND_DENIED');
  if(c.final&&before.processedQuantity+processed!==configuration.orderQuantity)fail('PAN523_PREMATURE_FINAL_DENIED');
  if(c.materials.length!==configuration.bom.components.length||new Set(c.materials.map(m=>m.itemId)).size!==c.materials.length||c.materials.some(m=>!configuration.bom.components.some(b=>b.itemId===m.itemId)))fail('PAN523_EXACT_COMPONENT_REPORT_REQUIRED_DENIED');
  if(c.resources.length!==configuration.valuation.resources.length||new Set(c.resources.map(r=>r.resourceId)).size!==c.resources.length||c.resources.some(r=>!configuration.valuation.resources.some(v=>v.resourceId===r.resourceId)))fail('PAN523_UNKNOWN_RESOURCE_RATE_DENIED');
  const next=JSON.parse(canonicalJson(before));let materialMinor=0n,resourceMinor=0n;const movements=[],materialFacts=[],resourceFacts=[];
  for(const component of configuration.bom.components){
    const m=c.materials.find(m=>m.itemId===component.itemId);
    if(BigInt(m.quantity)!==BigInt(component.quantityPerUnit)*BigInt(processed))fail('PAN523_BOM_MATERIAL_COUPLING_DENIED');
    const rate=configuration.valuation.materialRates.find(r=>r.itemId===m.itemId),change={schemaVersion:'cm.fachprofil/bestand-aenderung/v1',aenderungsId:'aenderung:bestand-pan523-'+digest(c.effectId).slice(0,32)+'-'+movements.length,artikelId:component.stockArticleId,lagerortId:native.nativeIdentityMapping.stockWarehouseId,einheit:'STK',art:'VERAUSGABE',menge:m.quantity,zeitstempel:c.effectiveAt,beleg:{belegId:'pan523:'+digest({binding:digest(binding),effectId:c.effectId}).slice(0,40),belegArt:'KUNDENAUFTRAG',quelle:'pan523-native',zeitstempel:c.effectiveAt}};
    const moved=bestandAenderungAnwendenV1(next.stock,change,next.appliedStockIds);if(moved.outcome!=='GEAENDERT')fail('PAN523_RELEASED_STOCK_CONTRACT_DENIED:'+moved.code);next.stock=moved.lage.lage;next.appliedStockIds=moved.lage.appliedAenderungsIds;movements.push(change);materialMinor+=BigInt(m.quantity)*BigInt(rate.unitCostMinor);materialFacts.push({...m,unitCostMinor:rate.unitCostMinor,stockArticleId:component.stockArticleId});
  }
  for(const r of c.resources){const rate=configuration.valuation.resources.find(v=>v.resourceId===r.resourceId);resourceMinor+=BigInt(r.minutes)*BigInt(rate.rateMinorPerMinute);resourceFacts.push({...r,rateMinorPerMinute:rate.rateMinorPerMinute});}
  next.revision++;next.processedQuantity+=processed;next.goodQuantity+=c.goodQuantity;next.scrapQuantity+=c.scrapQuantity;
  const core={schemaVersion:'pansphaira.pan523/production-event/v1',productionBindingDigest:digest(binding),effectId:c.effectId,revision:next.revision,expectedTradeRevision:c.expectedRevision,bomVersion:c.bomVersion,valuationVersion:c.valuationVersion,goodQuantity:c.goodQuantity,scrapQuantity:c.scrapQuantity,processedQuantity:processed,final:c.final,materialFacts,resourceFacts,movements,componentStockBeforeDigest:before.stock.lageDigest,componentStockAfterDigest:next.stock.lageDigest,actualCost:{currency:configuration.valuation.currency,materialMinor:safeCost(materialMinor),resourceMinor:safeCost(resourceMinor),totalMinor:safeCost(materialMinor+resourceMinor)},standardProcessedCostMinor:standardCost(configuration,processed),previousReportDigest:before.events.at(-1)?.reportDigest??null,effectiveAt:c.effectiveAt};
  next.events.push({...core,reportDigest:digest(core)});return next;
}
export function productionEventEvidence(production){const last=production.events.at(-1);return {productionBindingDigest:digest(production.binding),reportDigest:last.reportDigest,productionRevision:last.revision,goodQuantity:last.goodQuantity,scrapQuantity:last.scrapQuantity,componentStockAfterDigest:last.componentStockAfterDigest,actualCost:last.actualCost};}
export function appendProductionEvent({db,command,production,tradeEventDigest}){const event={...production.events.at(-1),tradeEventDigest};db.prepare('INSERT INTO pan523_events VALUES(?,?,?,?)').run(event.revision,command.effectId,canonicalJson(command),canonicalJson(event));return event;}
export function readProductionLedger({db,native,source,production=null}){
  const binding=readProductionBinding({db,native,source}),expected=production??initialProductionState(binding);if(digest(expected.binding)!==digest(binding))fail('PAN523_STABLE_NATIVE_BINDING_DRIFT_DENIED');
  const rows=db.prepare('SELECT revision,effect_key,command,event FROM pan523_events ORDER BY revision LIMIT 129').all();if(rows.length>128||rows.length!==expected.events.length)fail('PAN523_COUPLED_EVENT_HISTORY_REQUIRED_DENIED');
  for(let i=0;i<rows.length;i++){const row=rows[i],event=expected.events[i];if(row.revision!==event.revision||row.effect_key!==event.effectId||canonicalJson(JSON.parse(row.event))!==canonicalJson(event))fail('PAN523_NATIVE_EVENT_READBACK_DENIED');const trade=db.prepare('SELECT command,event FROM pan515_events WHERE effect_key=?').get(row.effect_key);if(!trade||trade.command!==row.command||JSON.parse(trade.event).eventDigest!==event.tradeEventDigest)fail('PAN523_COUPLED_EVENT_HISTORY_REQUIRED_DENIED');}
  const invoiceRows=db.prepare('SELECT revision,effect_key,command,event FROM pan523_invoice_refs ORDER BY revision LIMIT 129').all();if(invoiceRows.length>128||invoiceRows.length!==expected.invoices.length)fail('PAN523_INVOICE_HISTORY_REQUIRED_DENIED');
  for(let i=0;i<invoiceRows.length;i++){const row=invoiceRows[i],event=expected.invoices[i],trade=db.prepare('SELECT command,event FROM pan515_events WHERE effect_key=?').get(row.effect_key);if(row.revision!==event.revision||row.effect_key!==event.effectId||canonicalJson(JSON.parse(row.event))!==canonicalJson(event)||!trade||trade.command!==row.command||JSON.parse(trade.event).eventDigest!==event.tradeEventDigest)fail('PAN523_INVOICE_HISTORY_READBACK_DENIED');}
  const actual=expected.events.reduce((sum,e)=>sum+BigInt(e.actualCost.totalMinor),0n),standard=BigInt(standardCost(binding.configuration,expected.processedQuantity)),variance=actual-standard;
  if(variance<BigInt(Number.MIN_SAFE_INTEGER)||variance>BigInt(Number.MAX_SAFE_INTEGER))fail('PAN523_COST_RANGE_DENIED');
  const costComparison={status:expected.events.at(-1)?.final?'FINAL_OPERATIVE':expected.events.length?'PARTIAL_OPERATIVE':'NO_CONFIRMED_REPORTS',currency:binding.configuration.valuation.currency,valuationVersion:binding.configuration.valuation.version,plannedMinor:expected.standardPlannedCostMinor,standardProcessedMinor:Number(standard),actualMinor:safeCost(actual),varianceMinor:Number(variance),processedQuantity:expected.processedQuantity,goodQuantity:expected.goodQuantity,scrapQuantity:expected.scrapQuantity,financialProfit:false};
  const invoicedQuantity=expected.invoices.reduce((sum,e)=>sum+e.quantity,0),revenue=expected.invoices.length?safeCost(expected.invoices.reduce((sum,e)=>sum+BigInt(e.invoice.netMinor),0n)):null;
  const complete=invoicedQuantity===expected.goodQuantity&&revenue!==null,contribution=complete?BigInt(revenue)-actual:null;if(contribution!==null&&(contribution<BigInt(Number.MIN_SAFE_INTEGER)||contribution>BigInt(Number.MAX_SAFE_INTEGER)))fail('PAN523_COST_RANGE_DENIED');
  const operativeContribution={status:complete?(expected.events.at(-1)?.final?'FINAL_OPERATIVE_CONTRIBUTION':'PARTIAL_OPERATIVE_CONTRIBUTION'):revenue===null?'UNAVAILABLE_NO_NATIVE_INVOICE_REFERENCE':'UNAVAILABLE_PARTIAL_BILLING',currency:binding.configuration.valuation.currency,revenueMinor:revenue,costMinor:safeCost(actual),contributionMinor:contribution===null?null:Number(contribution),invoicedQuantity,goodQuantity:expected.goodQuantity,basis:'NATIVE_PRODUCED_DISPATCH_AND_EXPLICIT_OPERATIVE_INVOICE_REFERENCES',fiscalInvoiceQualified:false,financialProfit:false};
  return {...expected,costComparison,operativeContribution,writeMode:productionMode({db,binding}).mode,readOnly:true};
}

