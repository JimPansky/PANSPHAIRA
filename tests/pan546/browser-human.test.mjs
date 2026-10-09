import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeViewBrowserFixture546} from './browser-fixture.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
const human='[id="shell.erv-human"]';
test('PUI-05 actual combined native Human browser binding is not replaced by layouteditor or an API PASS',async()=>{
 const f=await nativeViewBrowserFixture546({subjectId:'synthetic:erv-reviewer',humanDecisions:true});try{
  await f.page.goto(f.tls.origin+'/t/tenant-a/workspace');await f.page.locator('[id="shell.context-selection"][data-module="pan.setup"][data-state="CURRENT_CONTEXT"]').waitFor();await f.page.getByRole('button',{name:'Eingangsrechnungsprüfung — nur lesen',exact:true}).click();await f.page.locator('[id="shell.module-view"][data-state="CURRENT_NATIVE_VIEW"]').waitFor();
  mkdirSync(process.env.PAN546_BROWSER_EVIDENCE,{recursive:true,mode:0o700});
  if(await f.page.locator(human).count()!==1){await f.page.screenshot({path:join(process.env.PAN546_BROWSER_EVIDENCE,'actual-native-reviewer-has-no-Human-browser-controls-RED.png'),fullPage:true});assert.fail('PAN546_COMBINED_NATIVE_HUMAN_BROWSER_BINDING_NOT_IMPLEMENTED');}
  await f.page.locator(human+'[data-state="CURRENT_HUMAN_READ"]').waitFor();const before=nativeRows(f.native.root,'SELECT * FROM pan542_events ORDER BY ordinal'),nativeBefore=nativeRows(f.native.root,'SELECT revision,effect_key,command,event FROM pan516_events ORDER BY revision');

  await f.page.getByLabel('Fachliche Evidenzaktion',{exact:true}).selectOption('REVIEW');await f.page.getByRole('button',{name:'Fachentscheidung vorschauen',exact:true}).click();await f.page.locator(human+'[data-state="HUMAN_PREVIEW_ONLY"]').waitFor();assert.deepEqual(nativeRows(f.native.root,'SELECT * FROM pan542_events ORDER BY ordinal'),before);
  await f.page.getByRole('button',{name:'Genau diese fachliche Evidenzentscheidung bestätigen',exact:true}).click();await f.page.locator(human+'[data-state="HUMAN_DECISION_NATIVE_READBACK_CONFIRMED"]').waitFor();assert.equal(nativeRows(f.native.root,'SELECT COUNT(*) AS count FROM pan542_events')[0].count,before.length+1);assert.deepEqual(nativeRows(f.native.root,'SELECT revision,effect_key,command,event FROM pan516_events ORDER BY revision'),nativeBefore);const event=JSON.parse(nativeRows(f.native.root,'SELECT event FROM pan542_events ORDER BY ordinal')[0].event);assert.equal(event.state,'REVIEWED_LOCAL_EVIDENCE_ONLY');assert.equal(event.bookingAuthorityGranted,false);assert.equal(event.executionAuthorityGranted,false);assert.deepEqual(f.errors,[]);
  writeFileSync(join(process.env.PAN546_BROWSER_EVIDENCE,'actual-human-browser-not-api-substitute.json'),JSON.stringify({persistedHumanEventCount:before.length+1,noBookingOrPaymentOrExecution:true},null,2)+'\n');
 }finally{await f.close();}
});
