import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import * as trade from '../../src/pan515/trade-state.mjs';
import {nativeTradeFixture} from '../fixtures/pan515/native-trade-fixture.mjs';
import {productionConfiguration,productionReport} from '../fixtures/pan523/native-production-fixture.mjs';
const cli='scripts/run-pan523-production.mjs',owner='LOCAL_SYNTHETIC_OWNER';
test('P09 real fresh-process bounded operator initializes, confirms, rereads and disables the existing native production path',async()=>{
 const f=await nativeTradeFixture();try{
  trade.initializePan515TradeState({root:f.root,owner});const b=trade.readPan515TradeState({root:f.root}).binding;
  assert.equal(existsSync(cli),true,'actual owned native order exists but P09 has no bounded operator entry');
  const configuration=join(f.parent,'production-configuration.json'),command=join(f.parent,'production-command.json');writeFileSync(configuration,JSON.stringify(productionConfiguration()));writeFileSync(command,JSON.stringify(productionReport(b)));
  const run=(action,extra=[])=>spawnSync(process.execPath,[cli,action,'--root',f.root,...extra],{encoding:'utf8',timeout:15000});
  const initialized=run('initialize',['--owner',owner,'--input',configuration]);assert.equal(initialized.status,0,initialized.stderr);assert.equal(JSON.parse(initialized.stdout).outcome,'INITIALIZED');
  const confirmed=run('confirm',['--owner',owner,'--input',command]);assert.equal(confirmed.status,0,confirmed.stderr);assert.equal(JSON.parse(confirmed.stdout).outcome,'COMMITTED');
  const expected=trade.readPan523ProductionState({root:f.root}),actual=run('read');assert.equal(actual.status,0,actual.stderr);assert.deepEqual(JSON.parse(actual.stdout),expected);
  const before=trade.readPan515TradeState({root:f.root});const denied=run('read',['--fiscal-qualified','true']);assert.equal(denied.status,2);assert.equal(JSON.parse(denied.stdout).outcome,'DENIED');assert.deepEqual(trade.readPan515TradeState({root:f.root}),before);
  const stopped=run('stop',['--owner',owner,'--reason','Stop only new synthetic production reports']);assert.equal(stopped.status,0,stopped.stderr);assert.equal(JSON.parse(stopped.stdout).outcome,'PRODUCTION_REPORTS_DISABLED_RETAINED');assert.equal(trade.readPan523ProductionState({root:f.root}).writeMode,'DISABLED_RETAINED');
 }finally{f.close();}
});
