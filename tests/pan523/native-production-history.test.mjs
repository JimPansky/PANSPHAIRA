import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import * as native from '../../src/pan515/trade-state.mjs';
import {nativeTradeFixture,nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
import {productionConfiguration,productionReport} from '../fixtures/pan523/native-production-fixture.mjs';
test('P09 leading native stock reader rejects an extra uncoupled component report rather than feeding inconsistent material history downstream',async()=>{
 const f=await nativeTradeFixture();try{
  const owner='LOCAL_SYNTHETIC_OWNER';native.initializePan515TradeState({root:f.root,owner});native.initializePan523ProductionState({root:f.root,owner,configuration:productionConfiguration()});const c=productionReport(native.readPan515TradeState({root:f.root}).binding);native.executePan515TradeCommand({root:f.root,command:c,grant:native.authorizePan515TradeCommand({root:f.root,owner,command:c})});
  const row=nativeRows(f.root,'SELECT command,event FROM pan523_events')[0],db=new DatabaseSync(join(f.root,'target.sqlite'));try{db.prepare('INSERT INTO pan523_events VALUES(?,?,?,?)').run(2,'synthetic:uncoupled-extra',row.command,row.event);}finally{db.close();}
  assert.throws(()=>native.readPan515TradeState({root:f.root}),/PAN523_COUPLED_EVENT_HISTORY_REQUIRED_DENIED/);
  assert.throws(()=>native.readPan523ProductionState({root:f.root}),/PAN523_COUPLED_EVENT_HISTORY_REQUIRED_DENIED/);
 }finally{f.close();}
});
