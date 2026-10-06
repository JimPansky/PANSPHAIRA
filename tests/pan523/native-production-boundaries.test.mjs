import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import * as native from '../../src/pan515/trade-state.mjs';
import {nativeTradeFixture,nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
import {productionConfiguration,productionReport} from '../fixtures/pan523/native-production-fixture.mjs';
import {producedDispatchFixture,apply,invoiceReference} from '../fixtures/pan523/produced-dispatch-fixture.mjs';
const owner='LOCAL_SYNTHETIC_OWNER';
const snapshot=root=>({trade:native.readPan515TradeState({root}),production:native.readPan523ProductionState({root}),tradeRows:nativeRows(root,'SELECT * FROM pan515_events'),productionRows:nativeRows(root,'SELECT * FROM pan523_events'),invoices:nativeRows(root,'SELECT * FROM pan523_invoice_refs')});
for(const [name,mutate,denial] of [
 ['missing material rate',c=>{c.valuation.materialRates.pop();},/PAN523_EXPLICIT_VALUATION_REQUIRED_DENIED/],
 ['unknown resource rate field',c=>{delete c.valuation.resources[0].rateMinorPerMinute;},/PAN523_CONFIGURATION_SHAPE_DENIED/],
 ['missing opening stock provenance',c=>{c.openingStock[0].herkunft=null;},/PAN523_EXPLICIT_COMPONENT_STOCK_REQUIRED_DENIED/],
])test('P09 no silent default for '+name,async()=>{
 const f=await nativeTradeFixture();try{native.initializePan515TradeState({root:f.root,owner});const c=productionConfiguration();mutate(c);assert.throws(()=>native.initializePan523ProductionState({root:f.root,owner,configuration:c}),denial);assert.equal(nativeRows(f.root,"SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'pan523_%'").length,0);}finally{f.close();}
});
test('P09 aggregate planned-cost overflow is denied before creating a ledger and leaves valid initialization and scoped stop usable',async()=>{
 const f=await nativeTradeFixture();try{
  native.initializePan515TradeState({root:f.root,owner});const before=native.readPan515TradeState({root:f.root}),c=productionConfiguration();
  c.bom.components=Array.from({length:10},(_,i)=>({itemId:'C'+i,stockArticleId:'SYN-ART-C0'+i,quantityPerUnit:166666666}));
  c.openingStock=c.bom.components.map(component=>({...productionConfiguration().openingStock[0],artikelId:component.stockArticleId,physisch:999999996}));
  c.valuation.materialRates=c.bom.components.map(component=>({itemId:component.itemId,unitCostMinor:1000000}));
  const exactPlannedMinor=10n*166666666n*6n*1000000n+6n;assert.equal(exactPlannedMinor,9999999960000006n);assert.ok(exactPlannedMinor>BigInt(Number.MAX_SAFE_INTEGER));
  assert.throws(()=>native.initializePan523ProductionState({root:f.root,owner,configuration:c}),/PAN523_COST_RANGE_DENIED/);
  assert.equal(nativeRows(f.root,"SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'pan523_%'").length,0);assert.deepEqual(native.readPan515TradeState({root:f.root}),before);
  assert.equal(native.initializePan523ProductionState({root:f.root,owner,configuration:productionConfiguration()}).outcome,'INITIALIZED');assert.equal(native.readPan523ProductionState({root:f.root}).costComparison.plannedMinor,486);
  assert.equal(native.deactivatePan523ProductionReports({root:f.root,owner,reason:'Retain after denied overflow admission'}).outcome,'PRODUCTION_REPORTS_DISABLED_RETAINED');assert.equal(native.readPan523ProductionState({root:f.root}).writeMode,'DISABLED_RETAINED');
 }finally{f.close();}
});
test('P09 caller-supplied grant/role and foreign native order cannot manufacture authority or effects',async()=>{
 const f=await nativeTradeFixture();try{native.initializePan515TradeState({root:f.root,owner});native.initializePan523ProductionState({root:f.root,owner,configuration:productionConfiguration()});const c=productionReport(native.readPan515TradeState({root:f.root}).binding),before=snapshot(f.root);
 assert.throws(()=>native.executePan515TradeCommand({root:f.root,command:c,grant:{owner,authorized:true}}),/PAN515_CONTENT_BOUND_AUTHORITY_REQUIRED_DENIED/);
 assert.throws(()=>native.authorizePan515TradeCommand({root:f.root,owner:'caller-role',command:c}),/PAN515_LOCAL_SYNTHETIC_OWNER_REQUIRED_DENIED/);
 assert.throws(()=>native.authorizePan515TradeCommand({root:f.root,owner,command:{...c,orderId:'synthetic:foreign-order'}}),/PAN515_COMPOSITE_NATIVE_IDENTITY_DENIED/);assert.deepEqual(snapshot(f.root),before);
 }finally{f.close();}
});
for(const [name,mutate,denial] of [
 ['incorrect net amount',c=>({...c,invoice:{...c.invoice,netMinor:80001}}),/PAN523_EXPLICIT_OPERATIVE_DOCUMENT_BINDING_DENIED/],
 ['foreign document',c=>({...c,invoice:{...c.invoice,documentId:'FOREIGN-01'}}),/PAN523_EXPLICIT_OPERATIVE_DOCUMENT_BINDING_DENIED/],
 ['invented fiscal qualification',c=>({...c,invoice:{...c.invoice,fiscalInvoiceQualified:true}}),/PAN523_EXPLICIT_OPERATIVE_DOCUMENT_BINDING_DENIED/],
])test('P09 operative billing '+name+' does not create revenue or fiscal authority',async()=>{
 const f=await producedDispatchFixture();try{const before=snapshot(f.root);assert.throws(()=>apply(f.root,mutate(invoiceReference())),denial);assert.deepEqual(snapshot(f.root),before);}finally{f.close();}
});
test('P09 repeated invoice under new effect identity cannot duplicate the operative contribution',async()=>{
 const f=await producedDispatchFixture();try{apply(f.root,invoiceReference());const before=snapshot(f.root);assert.throws(()=>apply(f.root,invoiceReference({effectId:'synthetic:operative-invoice-duplicate',transportId:'synthetic:operative-invoice-duplicate-transport',expectedRevision:7})),/PAN523_OPERATIVE_INVOICE_ALREADY_REFERENCED_DENIED/);assert.deepEqual(snapshot(f.root),before);}finally{f.close();}
});
test('P09 actual billing ledger insertion failure rolls the leading reference receipt back without creating invoice or contribution facts',async()=>{
 const f=await producedDispatchFixture();try{const before=snapshot(f.root),db=new DatabaseSync(join(f.root,'target.sqlite'));try{db.exec("CREATE TRIGGER pan523_test_fail_invoice BEFORE INSERT ON pan523_invoice_refs BEGIN SELECT RAISE(ABORT,'PAN523_TEST_NATIVE_INVOICE_INSERT_FAIL'); END;");}finally{db.close();}assert.throws(()=>apply(f.root,invoiceReference()),/PAN523_TEST_NATIVE_INVOICE_INSERT_FAIL/);assert.deepEqual(snapshot(f.root),before);const cleanup=new DatabaseSync(join(f.root,'target.sqlite'));try{cleanup.exec('DROP TRIGGER pan523_test_fail_invoice');}finally{cleanup.close();}assert.equal(apply(f.root,invoiceReference()).outcome,'COMMITTED');}finally{f.close();}
});
