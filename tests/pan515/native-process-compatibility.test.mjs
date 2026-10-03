import assert from 'node:assert/strict';
import test from 'node:test';
import {fork} from 'node:child_process';
import {nativeTradeFixture,nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
import * as trade from '../../src/pan515/trade-state.mjs';
import * as scope from '../../src/pan473/writer-scope-cutover.mjs';
import {diagnosePan473WriterScope} from '../../src/pan473/independent-scope-diagnosis.mjs';
import {nachschubEntscheidenFrischeV1} from '../../dist/packages/contracts/src/bestand-nachschub-v1.js';
const c=(patch={})=>({schemaVersion:'pansphaira.pan515/trade-command/v1',effectId:'synthetic:receipt-process',transportId:'synthetic:receipt-process-request',expectedRevision:0,orderId:'synthetic:order-42',lineId:'synthetic:line-1',articleId:'SYN-ART-001',warehouseId:'LAGER-01',unit:'STK',kind:'RECEIPT',quantity:6,referenceId:null,effectiveAt:'2026-10-03T10:00:00Z',reason:'Native process receipt',...patch});
const exec=(root,command)=>trade.executePan515TradeCommand({root,command,grant:trade.authorizePan515TradeCommand({root,command,owner:'LOCAL_SYNTHETIC_OWNER'})});
function pending(child,type){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>finish(new Error('PAN515_PROCESS_DEADLINE')),15000),onMessage=m=>{if(m.type===type)finish(null,m);},onExit=code=>finish(new Error('PAN515_PROCESS_EARLY_EXIT:'+code));function finish(err,value){clearTimeout(timer);child.off('message',onMessage);child.off('exit',onExit);err?reject(err):resolve(value);}child.on('message',onMessage);child.on('exit',onExit);});}
test('P01 AC2 two real native writer processes cannot commit competing reservations at the same revision',async()=>{
  const f=await nativeTradeFixture();const children=[];
  try{
    trade.initializePan515TradeState({root:f.root,owner:'LOCAL_SYNTHETIC_OWNER'});exec(f.root,c());
    const ready=[];
    for(const id of ['first','second']){
      const command=c({effectId:'synthetic:reserve-'+id,transportId:'synthetic:reserve-request-'+id,expectedRevision:1,kind:'RESERVE',quantity:6,reason:'Concurrent '+id+' reservation'});
      const child=fork(new URL('../fixtures/pan515/native-trade-client.mjs',import.meta.url),[f.root,JSON.stringify(command)],{silent:true});children.push(child);ready.push(pending(child,'READY'));
    }
    await Promise.all(ready);const replies=children.map(child=>pending(child,'RESULT'));for(const child of children)child.send('COMMIT');
    const results=await Promise.all(replies);
    assert.equal(results.filter(r=>r.outcome==='COMMITTED').length,1,JSON.stringify(results));
    const denied=results.find(r=>r.outcome==='DENIED');assert.ok(denied);assert.match(denied.code,/^(?:PAN515_STALE_REVISION_DENIED|BTH_JOURNAL_FENCED_DENIED)$/);
    const s=trade.readPan515TradeState({root:f.root});assert.equal(s.revision,2);assert.deepEqual(s.quantities,{physical:6,reserved:6,blocked:0,available:0,shipped:0,returned:0});
    assert.equal(nativeRows(f.root,'SELECT COUNT(*) AS n FROM pan515_events')[0].n,2);
  }finally{for(const child of children)child.kill();f.close();}
});
test('P01 feature-specific fallback disables new trade transitions while retaining readable history and existing native writer compatibility',async()=>{
  const f=await nativeTradeFixture();try{
    trade.initializePan515TradeState({root:f.root,owner:'LOCAL_SYNTHETIC_OWNER'});exec(f.root,c());
    const history=nativeRows(f.root,'SELECT * FROM pan515_events ORDER BY revision');
    assert.equal(typeof trade.deactivatePan515TradeTransitions,'function','missing specific forward-disable fallback');
    const stopped=trade.deactivatePan515TradeTransitions({root:f.root,owner:'LOCAL_SYNTHETIC_OWNER',reason:'Operator retained the last qualified generation'});
    assert.equal(stopped.outcome,'TRANSITIONS_DISABLED_RETAINED');
    assert.equal(trade.readPan515TradeState({root:f.root}).writeMode,'DISABLED_RETAINED');
    const next=c({effectId:'synthetic:receipt-after-stop',expectedRevision:1});
    assert.throws(()=>exec(f.root,next),/PAN515_TRANSITIONS_DISABLED_RETAINED_DENIED/);
    const row=nativeRows(f.root,"SELECT kind,revision,body FROM objects WHERE id='synthetic:line-1'")[0],body=JSON.parse(row.body),grant=scope.authorizePan473TargetWrite({root:f.root,epoch:1,owner:'LOCAL_SYNTHETIC_OWNER'});
    scope.writePan473Target({root:f.root,epoch:1,grant,changes:[{id:'synthetic:line-1',kind:row.kind,revision:row.revision+1,deleted:false,body:{...body,priceMinor:1750}}]});
    assert.equal(trade.readPan515TradeState({root:f.root}).quantities.physical,6);
    assert.deepEqual(nativeRows(f.root,'SELECT * FROM pan515_events ORDER BY revision'),history);
  }finally{f.close();}
});
test('P01 AC4 existing native draft writer/diagnosis and released stock consumer remain compatible without rewriting their contracts',async()=>{
  const f=await nativeTradeFixture();try{
    trade.initializePan515TradeState({root:f.root,owner:'LOCAL_SYNTHETIC_OWNER'});
    const retained=nativeRows(f.root,'SELECT * FROM receipts ORDER BY operation_key');exec(f.root,c());
    const line=nativeRows(f.root,"SELECT kind,revision,body FROM objects WHERE id='synthetic:line-1'")[0],body=JSON.parse(line.body);
    const grant=scope.authorizePan473TargetWrite({root:f.root,epoch:1,owner:'LOCAL_SYNTHETIC_OWNER'});
    assert.equal(scope.writePan473Target({root:f.root,epoch:1,grant,changes:[{id:'synthetic:line-1',kind:line.kind,revision:line.revision+1,deleted:false,body:{...body,priceMinor:1750}}]}).outcome,'TARGET_WRITTEN');
    const s=trade.readPan515TradeState({root:f.root});assert.equal(s.binding.nativeQuantityRevision,1);assert.equal(s.quantities.physical,6);
    assert.equal(diagnosePan473WriterScope({root:f.root}).outcome,'ACTIVE');
    assert.deepEqual(nativeRows(f.root,'SELECT * FROM receipts ORDER BY operation_key'),retained);
    assert.equal(nachschubEntscheidenFrischeV1(s.stock,{anforderungsId:'nachschub:syn-art-001-pan515',artikelId:'SYN-ART-001',lagerortId:'LAGER-01',einheit:'STK',schwellenwert:7,nachschubmenge:2,grund:'Actual legacy consumer compatibility'},{politikId:'frische:m3-politik-001',version:'v1',maximalerAlterSekunden:86400,entscheidungsZeitpunkt:'2026-10-03T10:00:00Z'}).outcome,'BESTANDSFRISCHHEIT_UNBEWEIST','native owned quantities are not fabricated external freshness provenance');
  }finally{f.close();}
});
