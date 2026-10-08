import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync,lstatSync,realpathSync,openSync,fstatSync,closeSync,constants} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {browserFixture544,invoiceId544,decision544} from './browser-fixture.mjs';
import {request527} from '../pan527/helpers.mjs';
import * as procurement from '../../src/procurement-434/bestellung-lifecycle.mjs';
import {enableWorkspaceBrowserV1} from '../../src/pan541/workspace-browser.mjs';
import {nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
import {readLocalJournalTaskIdentity} from '../../demo/runtime/local-journal-owner.mjs';
const evidence=process.env.PAN544_BROWSER_EVIDENCE;
export async function launch544(f){
  assert.ok(process.env.PAN527_BROWSER_MODULE&&process.env.PAN527_CERTUTIL&&evidence,'PAN544_REAL_OWNED_BROWSER_REQUIRED_NO_SKIP');
  const {chromium}=await import(process.env.PAN527_BROWSER_MODULE);
  const home=join(f.tls.root,'browser-home'),nss=join(home,'.pki/nssdb');mkdirSync(nss,{recursive:true,mode:0o700});
  execFileSync(process.env.PAN527_CERTUTIL,['-N','--empty-password','-d','sql:'+nss],{stdio:'ignore'});
  execFileSync(process.env.PAN527_CERTUTIL,['-A','-d','sql:'+nss,'-n','PAN544 isolated native test CA','-t','CT,C,C','-i',f.tls.options.tls.certPath],{stdio:'ignore'});
  const owned=join(f.tls.root,'chromium-temp');mkdirSync(owned,{mode:0o700});const st=lstatSync(owned);
  assert.ok(st.isDirectory()&&!st.isSymbolicLink()&&st.uid===process.getuid()&&(st.mode&0o777)===0o700&&realpathSync(owned)===owned,'PAN544_BROWSER_TEMP_CUSTODY_DENIED');
  const fd=openSync(owned,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW),alias='/proc/'+process.pid+'/fd/'+fd;let fdClosed=false,context;
  const release=()=>{if(!fdClosed){closeSync(fd);fdClosed=true;}};
  try{const d=fstatSync(fd);assert.ok(d.isDirectory()&&d.dev===st.dev&&d.ino===st.ino&&realpathSync(alias)===owned,'PAN544_BROWSER_TEMP_DESCRIPTOR_DENIED');context=await chromium.launchPersistentContext(join(f.tls.root,'chromium-profile'),{channel:'chromium',headless:true,env:{...process.env,HOME:home,TMPDIR:alias},args:['--no-proxy-server','--disable-background-networking'],ignoreHTTPSErrors:false,viewport:{width:1280,height:900}});}catch(error){release();throw error;}
  const actualClose=context.close.bind(context);context.close=async(...args)=>{try{return await actualClose(...args);}finally{release();}};
  await context.route('**/*',route=>new URL(route.request().url()).origin===f.tls.origin?route.continue():route.abort());
  async function login(who=f.approver){await context.addCookies([{name:'__Host-pan527-session',value:who.cookie.split('=')[1],url:f.tls.origin,secure:true,httpOnly:true,sameSite:'Strict'}]);}
  try{await login();return {context,browser:context.browser(),login};}catch(error){await context.close();throw error;}
}
async function screenshot544(page,name,f,browser,requests){
  mkdirSync(evidence,{recursive:true,mode:0o700});const file=join(evidence,name+'.png');await page.screenshot({path:file,fullPage:true});
  const dimensions=await page.evaluate(()=>({viewport:{width:innerWidth,height:innerHeight},document:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},dpr:devicePixelRatio,cssZoom:document.documentElement.style.zoom||'1',hash:location.hash.replace(/([?&]sessionId=)[^&]*/g,'$1[REDACTED]'),outcome:document.querySelector('[data-backend="notifications"]')?.getAttribute('data-outcome'),controls:[...document.querySelectorAll('button:not(:disabled),a,input,select')].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return {label:e.textContent||e.getAttribute('aria-label'),x:r.x,right:r.right,width:r.width,height:r.height};})}));
  const pins=Object.fromEntries(['src/pan544/native-notifications.mjs','src/pan542/native-human-backend.mjs','src/pan527/origin-session-adapter.mjs','src/pan541/workspace-browser.mjs','packages/contracts/src/workspace-notifications-v1.ts','packages/browser-workspace/src/app.ts','packages/browser-workspace/src/notifications-v1.ts','packages/browser-workspace/src/workspace.css','packages/browser-workspace/src/workspace.html','tests/pan544/browser-fixture.mjs','tests/pan544/browser-notifications.test.mjs','dist/browser-workspace/app.js'].map(path=>[path,createHash('sha256').update(readFileSync(new URL('../../'+path,import.meta.url))).digest('hex')]));
  writeFileSync(file+'.json',JSON.stringify({name,file,sha256:createHash('sha256').update(readFileSync(file)).digest('hex'),browser:browser.version(),pins,...dimensions,protectedSession:'[REDACTED]',nativeInvoiceRevision:f.nativeReader.read({tenantId:"tenant-a",objectId:invoiceId544,expectedRevision:null}).revision,requests},null,2)+'\n');return dimensions;
}
test('PUI-03 representative real browser login -> native hint -> exact invoice -> explicit personal read -> fresh login keeps task open',async()=>{
  const f=await browserFixture544();let workspace,live;
  try{
    workspace=enableWorkspaceBrowserV1({optIn:true,gateway:f.tls.gateway,tenantId:'tenant-a',origin:f.tls.origin,nativeReader:f.nativeReader,notifications:f.service});live=await launch544(f);
    const {context,browser}=live;const page=await context.newPage();const errors=[],requests=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({method:r.method(),path:new URL(r.url()).pathname,body:r.postData()}));
    const eventsBefore=JSON.stringify(nativeRows(f.native.root,'SELECT * FROM pan542_events ORDER BY ordinal')),tasks=readLocalJournalTaskIdentity(join(f.native.root,'pan453-owned-v2'));
    await page.goto(f.tls.origin+'/t/tenant-a/workspace');await page.getByRole('heading',{name:'Einrichtung und Betriebszustand'}).waitFor();
    if(await page.locator('body').getAttribute('data-owner-notifications')!=='true'){await screenshot544(page,'actual-desktop-missing-notification-binding-red',f,browser,requests);assert.fail('PAN544_REAL_SHARED_SHELL_NOTIFICATION_BINDING_NOT_IMPLEMENTED');}
    const ready=page.locator('[data-backend="notifications"][data-outcome="FEED_READY"]');await ready.waitFor();
    assert.equal(requests.some(r=>r.path.endsWith('/workspace/erv')),false,'Notification must precede the first ERV plugin visit');
    assert.equal(await page.evaluate(()=>document.cookie),'');assert.equal(await page.evaluate(()=>isSecureContext),true);
    await screenshot544(page,'desktop-first-login-native-hint',f,browser,requests);
    const open=page.getByRole('button',{name:'Rechnung '+invoiceId544+' öffnen — nur lesen',exact:true});await open.focus();await open.press('Enter');
    await page.locator('[data-backend="erv"][data-outcome="READBACK_RECEIVED"]').waitFor();assert.match(await page.locator('main').innerText(),new RegExp(invoiceId544));await ready.waitFor();
    assert.ok(requests.some(r=>r.path.endsWith('/notifications/open')&&r.method==='POST'));assert.equal(nativeRows(f.native.root,'SELECT COUNT(*) AS count FROM pan544_read')[0].count,0);
    await page.getByRole('button',{name:'Lesestatus ändern — Auftrag bleibt offen',exact:true}).click();await page.locator('[data-notification="read-diff"]').waitFor();
    assert.equal(requests.filter(r=>r.path.endsWith('/notifications/read')).length,0);assert.match(await page.locator('[data-notification="read-diff"]').innerText(),/ungelesen.*gelesen/s);assert.match(await page.locator('[data-notification="read-diff"]').innerText(),/Auftrag bleibt offen/);
    await page.getByRole('button',{name:'Persönlichen Lesestatus bestätigen',exact:true}).click();await page.locator('[data-notification-read="true"]').waitFor();
    assert.equal(requests.filter(r=>r.path.endsWith('/notifications/read')).length,1);assert.equal(nativeRows(f.native.root,'SELECT COUNT(*) AS count FROM pan544_read')[0].count,1);
    await live.login(f.issue('synthetic:erv-approver'));await page.reload();
    await page.waitForFunction(()=>document.querySelector('[data-backend="notifications"]')?.getAttribute('data-outcome')==='FEED_READY'||(document.querySelector('main h1')?.textContent==='Deep Link verweigert'&&document.querySelector('[data-backend="notifications"]')?.getAttribute('data-outcome')!=='LOADING'));
    if(await page.locator('[id="shell.notifications"]').getAttribute('data-outcome')!=='FEED_READY')await screenshot544(page,'actual-fresh-login-old-deep-link-independent-feed-red',f,browser,requests);
    assert.equal(await page.locator('[id="shell.notifications"]').getAttribute('data-outcome'),'FEED_READY','PAN544_FRESH_LOGIN_PERSONAL_FEED_MUST_NOT_DEPEND_ON_ACCEPTING_OLD_SESSION_DEEP_LINK');
    await page.locator('[data-notification-read="true"]').waitFor();
    assert.equal(await page.locator('main h1').innerText(),'Deep Link verweigert','Old session deep links must remain denied even while the new own feed is available');
    assert.doesNotMatch(await page.locator('[id="shell.widgets"]').innerText(),/wird geladen/,'PAN544_DENIED_OLD_DEEP_LINK_IS_TERMINAL_NOT_PERMANENT_LOADING');
    assert.match(await page.locator('[id="shell.notifications"]').innerText(),/Gelesen — Auftrag weiterhin offen/);
    await screenshot544(page,'desktop-fresh-login-read-task-open',f,browser,requests);
    await page.setViewportSize({width:390,height:844});const dimensions=await screenshot544(page,'390-fresh-login-read-task-open',f,browser,requests);
    assert.ok(dimensions.document.width<=dimensions.viewport.width);assert.ok(dimensions.controls.every(c=>c.width>0&&c.height>0&&c.x>=0&&c.right<=dimensions.viewport.width));
    assert.equal(JSON.stringify(nativeRows(f.native.root,'SELECT * FROM pan542_events ORDER BY ordinal')),eventsBefore);assert.deepEqual(readLocalJournalTaskIdentity(join(f.native.root,'pan453-owned-v2')),tasks);assert.deepEqual(errors,[]);
    console.log(JSON.stringify({browser:browser.version(),actualNativeHumanEventCount:1,actualPersonalReadRows:1,requests,dimensions,businessHistoryAndTaskLedgerUnchanged:true}));
  }finally{await live?.context.close();workspace?.close();await f.close();}
});

test('PUI-03 actual native personal read commits but delivery is interrupted; reconcile without another write',async()=>{
  const f=await browserFixture544();let workspace,live;
  try{
    workspace=enableWorkspaceBrowserV1({optIn:true,gateway:f.tls.gateway,tenantId:'tenant-a',origin:f.tls.origin,nativeReader:f.nativeReader,notifications:f.service});live=await launch544(f);
    const page=await live.context.newPage(),requests=[],errors=[];let retainedActualReceipt;
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({method:r.method(),path:new URL(r.url()).pathname,body:r.postData()}));
    const history=JSON.stringify(nativeRows(f.native.root,'SELECT * FROM pan542_events ORDER BY ordinal')),tasks=readLocalJournalTaskIdentity(join(f.native.root,'pan453-owned-v2'));
    await page.route('**/workspace/notifications/read',async route=>{
      const r=route.request();retainedActualReceipt=await request527(f.tls,new URL(r.url()).pathname,await r.allHeaders(),r.method(),r.postDataJSON());
      assert.equal(retainedActualReceipt.status,200);assert.equal(JSON.parse(retainedActualReceipt.body).outcome,'READ_CONFIRMED');await route.abort('failed');
    });
    await page.goto(f.tls.origin+'/t/tenant-a/workspace');await page.locator('[data-backend="notifications"][data-outcome="FEED_READY"]').waitFor();
    await page.getByRole('button',{name:'Lesestatus ändern — Auftrag bleibt offen',exact:true}).click();await page.getByRole('button',{name:'Persönlichen Lesestatus bestätigen',exact:true}).click();
    await page.locator('[data-backend="notifications"][data-outcome="OUTCOME_UNKNOWN"]').waitFor();
    assert.equal(nativeRows(f.native.root,'SELECT COUNT(*) AS count FROM pan544_read')[0].count,1);assert.equal(requests.filter(r=>r.path.endsWith('/notifications/read')).length,1);
    assert.equal(await page.getByRole('button',{name:'Lesestatus ändern — Auftrag bleibt offen',exact:true}).count(),0);assert.equal(await page.locator('[data-notification-read="true"]').count(),0);
    await screenshot544(page,'desktop-actual-committed-read-response-lost-unknown',f,live.browser,requests);
    assert.equal(await page.getByRole('button',{name:'Lesestatus autoritativ abgleichen',exact:true}).count(),1,'PAN544_READ_RESPONSE_LOSS_REQUIRES_AUTHORITY_ONLY_RECONCILIATION');
    await page.getByRole('button',{name:'Lesestatus autoritativ abgleichen',exact:true}).click();await page.locator('[data-notification-read="true"]').waitFor();
    assert.equal(requests.filter(r=>r.path.endsWith('/notifications/read')).length,1);assert.equal(requests.filter(r=>r.path.endsWith('/notifications/reconcile')).length,1);
    assert.equal(nativeRows(f.native.root,'SELECT COUNT(*) AS count FROM pan544_read')[0].count,1);assert.equal(JSON.stringify(nativeRows(f.native.root,'SELECT * FROM pan542_events ORDER BY ordinal')),history);assert.deepEqual(readLocalJournalTaskIdentity(join(f.native.root,'pan453-owned-v2')),tasks);assert.deepEqual(errors,[]);
    console.log(JSON.stringify({transportOnlyDeliveryInterruptedNotVendorFailure:true,actualBackendReadOutcome:JSON.parse(retainedActualReceipt.body).outcome,readWrites:requests.filter(r=>r.path.endsWith('/notifications/read')).length,reconciliationRequests:requests.filter(r=>r.path.endsWith('/notifications/reconcile')).length,nativePersonalReadCount:1,businessStateUnchanged:true}));
  }finally{await live?.context.close();workspace?.close();await f.close();}
});

test('PUI-03 personal notification filter and subscription are explicitly confirmed, persist after login, and keep native task',async()=>{
  const f=await browserFixture544();let workspace,live;
  try{
    workspace=enableWorkspaceBrowserV1({optIn:true,gateway:f.tls.gateway,tenantId:'tenant-a',origin:f.tls.origin,nativeReader:f.nativeReader,notifications:f.service});live=await launch544(f);const page=await live.context.newPage(),requests=[];
    page.on('request',r=>requests.push({method:r.method(),path:new URL(r.url()).pathname,body:r.postData()}));const tasks=readLocalJournalTaskIdentity(join(f.native.root,'pan453-owned-v2')),history=JSON.stringify(nativeRows(f.native.root,'SELECT * FROM pan542_events ORDER BY ordinal'));
    await page.goto(f.tls.origin+'/t/tenant-a/workspace');await page.locator('[data-outcome="FEED_READY"][data-backend="notifications"]').waitFor();
    assert.equal(await page.getByRole('button',{name:'Hinweispräferenzen ändern',exact:true}).count(),1,'PAN544_REAL_BROWSER_PERSISTENT_PREFERENCE_EDITOR_NOT_IMPLEMENTED');
    await page.getByRole('button',{name:'Hinweispräferenzen ändern',exact:true}).click();
    console.log(JSON.stringify({preferenceLabelObservation:await page.locator('[data-notification="preferences-editor"] select').evaluate(e=>({visible:e.getBoundingClientRect().width>0,labels:[...e.labels].map(l=>l.textContent),ariaLabel:e.getAttribute('aria-label')}))}));
    assert.equal(await page.getByLabel('Hinweisfilter',{exact:true}).count(),1,'PAN544_FILTER_ACCESSIBLE_NAME_MUST_BE_EXACT_CLOSED_LABEL');
    await page.getByLabel('Hinweisfilter',{exact:true}).selectOption('UNREAD');await page.getByLabel('In-App-Hinweise anzeigen',{exact:true}).uncheck();await page.getByLabel('Synthetische ERV-Freigabehinweise abonnieren',{exact:true}).uncheck();
    await page.getByRole('button',{name:'Präferenzänderung prüfen',exact:true}).click();assert.equal(requests.filter(r=>r.path.endsWith('/notifications/preferences')).length,0);
    assert.match(await page.locator('[data-notification="preferences-diff"]').innerText(),/ALL.*UNREAD/s);assert.match(await page.locator('[data-notification="preferences-diff"]').innerText(),/Auftrag bleibt bestehen/);
    await page.getByRole('button',{name:'Persönliche Hinweispräferenzen bestätigen',exact:true}).click();await page.locator('[data-backend="notifications"][data-outcome="EMPTY"]').waitFor();
    const packets=requests.filter(r=>r.path.endsWith('/notifications/preferences'));assert.equal(packets.length,1);assert.deepEqual(JSON.parse(packets[0].body),{schemaVersion:'pansphaira.workspace-notifications/preferences-write/v1',expectedRevision:0,preferences:{inAppEnabled:false,filter:'UNREAD',subscriptions:[]}});
    assert.equal(nativeRows(f.native.root,'SELECT revision FROM pan544_preferences')[0].revision,1);assert.equal(nativeRows(f.native.root,'SELECT COUNT(*) AS count FROM pan544_read')[0].count,0);
    await live.login(f.issue('synthetic:erv-approver'));await page.reload();await page.locator('[data-backend="notifications"][data-outcome="EMPTY"]').waitFor();await page.getByRole('button',{name:'Hinweispräferenzen ändern',exact:true}).click();
    assert.equal(await page.getByLabel('Hinweisfilter',{exact:true}).inputValue(),'UNREAD');assert.equal(await page.getByLabel('In-App-Hinweise anzeigen',{exact:true}).isChecked(),false);assert.equal(await page.getByLabel('Synthetische ERV-Freigabehinweise abonnieren',{exact:true}).isChecked(),false);
    await page.setViewportSize({width:390,height:844});const dimensions=await screenshot544(page,'390-fresh-login-persistent-personal-preferences',f,live.browser,requests);assert.ok(dimensions.document.width<=dimensions.viewport.width);assert.ok(dimensions.controls.every(c=>c.width>0&&c.height>0&&c.x>=0&&c.right<=dimensions.viewport.width));
    assert.equal(JSON.stringify(nativeRows(f.native.root,'SELECT * FROM pan542_events ORDER BY ordinal')),history);assert.deepEqual(readLocalJournalTaskIdentity(join(f.native.root,'pan453-owned-v2')),tasks);
  }finally{await live?.context.close();workspace?.close();await f.close();}
});

test('PUI-03 duplicate native delivery remains one hint; removed/disabled plugin and withdrawn task have no clickable target',async()=>{
  const f=await browserFixture544();let workspace,live;
  try{
    workspace=enableWorkspaceBrowserV1({optIn:true,gateway:f.tls.gateway,tenantId:'tenant-a',origin:f.tls.origin,nativeReader:f.nativeReader,notifications:f.service});live=await launch544(f);const page=await live.context.newPage(),requests=[];page.on('request',r=>requests.push({method:r.method(),path:new URL(r.url()).pathname,body:r.postData()}));
    await page.goto(f.tls.origin+'/t/tenant-a/workspace');await page.locator('[data-backend="notifications"][data-outcome="FEED_READY"]').waitFor();
    const history=JSON.stringify(nativeRows(f.native.root,'SELECT * FROM pan542_events ORDER BY ordinal')),tasks=readLocalJournalTaskIdentity(join(f.native.root,'pan453-owned-v2'));
    assert.equal(f.service.publishNativeEvent(f.reviewer,{invoiceId:invoiceId544}).outcome,'DUPLICATE_NO_NEW_EFFECT');await page.getByRole('button',{name:'Hinweise neu lesen',exact:true}).click();await page.locator('[data-notification-status="OPEN"]').waitFor();assert.equal(await page.locator('.notification-row').count(),1);assert.equal(nativeRows(f.native.root,'SELECT COUNT(*) AS count FROM pan544_events')[0].count,1);
    for(const [catalog,status] of [['ABSENT','PLUGIN_REMOVED'],['DISABLED','PLUGIN_DISABLED']]){
      f.setPlugin(catalog);await page.getByRole('button',{name:'Hinweise neu lesen',exact:true}).click();await page.locator('[data-notification-status="'+status+'"]').waitFor();
      assert.equal(await page.getByRole('button',{name:'Rechnung '+invoiceId544+' öffnen — nur lesen',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Lesestatus ändern — Auftrag bleibt offen',exact:true}).count(),0);
      await screenshot544(page,'desktop-native-'+status.toLowerCase(),f,live.browser,requests);
    }
    assert.equal(JSON.stringify(nativeRows(f.native.root,'SELECT * FROM pan542_events ORDER BY ordinal')),history);assert.deepEqual(readLocalJournalTaskIdentity(join(f.native.root,'pan453-owned-v2')),tasks);
    f.setPlugin('AVAILABLE');f.human.decide(f.reviewer,decision544(f.human.read(f.reviewer,{invoiceId:invoiceId544}),'QUERY','withdraw-ui-001'));
    const afterQuery=JSON.stringify(nativeRows(f.native.root,'SELECT * FROM pan542_events ORDER BY ordinal'));await page.getByRole('button',{name:'Hinweise neu lesen',exact:true}).click();await page.locator('[data-notification-status="REMOVED"]').waitFor();
    assert.equal(await page.locator('[data-notification-read="true"]').count(),0);assert.equal(await page.getByRole('button',{name:'Rechnung '+invoiceId544+' öffnen — nur lesen',exact:true}).count(),0);assert.equal(requests.filter(r=>r.path.endsWith('/notifications/read')||r.path.endsWith('/notifications/open')||r.path.endsWith('/workspace/erv')).length,0);
    assert.equal(nativeRows(f.native.root,'SELECT COUNT(*) AS count FROM pan544_read')[0].count,0);assert.equal(JSON.stringify(nativeRows(f.native.root,'SELECT * FROM pan542_events ORDER BY ordinal')),afterQuery);
    await page.setViewportSize({width:390,height:844});await screenshot544(page,'390-native-withdrawn-task-not-read-not-approved',f,live.browser,requests);
  }finally{await live?.context.close();workspace?.close();await f.close();}
});

test('PUI-03 replaced protected role/session cannot retain former invoice facts when notification refresh is denied',async()=>{
  const f=await browserFixture544();let workspace,live;
  try{
    workspace=enableWorkspaceBrowserV1({optIn:true,gateway:f.tls.gateway,tenantId:'tenant-a',origin:f.tls.origin,nativeReader:f.nativeReader,notifications:f.service});live=await launch544(f);const page=await live.context.newPage();
    await page.goto(f.tls.origin+'/t/tenant-a/workspace');await page.locator('[data-outcome="FEED_READY"][data-backend="notifications"]').waitFor();
    await page.getByRole('button',{name:'Rechnung '+invoiceId544+' öffnen — nur lesen',exact:true}).click();await page.locator('[data-backend="erv"][data-outcome="READBACK_RECEIVED"]').waitFor();await page.locator('[data-outcome="FEED_READY"][data-backend="notifications"]').waitFor();assert.match(await page.locator('main').innerText(),new RegExp(invoiceId544));
    const history=JSON.stringify(nativeRows(f.native.root,'SELECT * FROM pan542_events ORDER BY ordinal')),tasks=readLocalJournalTaskIdentity(join(f.native.root,'pan453-owned-v2'));
    await live.login(f.issue('synthetic:erv-reader','reader'));await page.getByRole('button',{name:'Hinweise neu lesen',exact:true}).click();await page.locator('[data-outcome="DENIED"][data-backend="notifications"]').waitFor();
    assert.doesNotMatch(await page.locator('main').innerText(),new RegExp(invoiceId544),'PAN544_DENIED_NEW_SESSION_MUST_RETIRE_OLD_SHARED_SHELL_INVOICE_FACTS');
    assert.equal(await page.locator('[id="shell.notifications"] .notification-row').count(),0);assert.equal(nativeRows(f.native.root,'SELECT COUNT(*) AS count FROM pan544_read')[0].count,0);assert.equal(JSON.stringify(nativeRows(f.native.root,'SELECT * FROM pan542_events ORDER BY ordinal')),history);assert.deepEqual(readLocalJournalTaskIdentity(join(f.native.root,'pan453-owned-v2')),tasks);
    await screenshot544(page,'desktop-denied-replaced-role-no-old-invoice-facts',f,live.browser,[]);
    await page.setViewportSize({width:390,height:844});const deniedDimensions=await screenshot544(page,'390-denied-replaced-role-no-old-invoice-facts',f,live.browser,[]);assert.ok(deniedDimensions.document.width<=390);assert.ok(deniedDimensions.controls.every(c=>c.width>0&&c.height>0&&c.x>=0&&c.right<=390));
  }finally{await live?.context.close();workspace?.close();await f.close();}
});

test('PUI-03 logout revokes the actual session and late real notification delivery cannot restore private facts',async()=>{
  const f=await browserFixture544();let workspace,live,release;let deliveryFinished;
  try{
    workspace=enableWorkspaceBrowserV1({optIn:true,gateway:f.tls.gateway,tenantId:'tenant-a',origin:f.tls.origin,nativeReader:f.nativeReader,notifications:f.service});live=await launch544(f);const page=await live.context.newPage(),requests=[],errors=[];let actual,heldResolve,finishedResolve,deliveryAttempted=false;
    const held=new Promise(resolve=>{heldResolve=resolve;}),barrier=new Promise(resolve=>{release=resolve;});deliveryFinished=new Promise(resolve=>{finishedResolve=resolve;});
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({method:r.method(),path:new URL(r.url()).pathname,body:r.postData()}));
    await page.route('**/workspace/notifications',async route=>{
      const r=route.request();actual=await request527(f.tls,new URL(r.url()).pathname,await r.allHeaders(),r.method());heldResolve();await barrier;deliveryAttempted=true;
      try{await route.fulfill({status:actual.status,headers:actual.headers,body:actual.body});}catch(error){if(!/Target.*closed|cancelled|aborted|already handled/i.test(error.message))errors.push(error.message);}finally{finishedResolve();}
    });
    const history=JSON.stringify(nativeRows(f.native.root,'SELECT * FROM pan542_events ORDER BY ordinal')),tasks=readLocalJournalTaskIdentity(join(f.native.root,'pan453-owned-v2'));
    await page.goto(f.tls.origin+'/t/tenant-a/workspace');await held;assert.equal(actual.status,200);assert.equal(JSON.parse(actual.body).events.length,1);await page.locator('[data-outcome="LOADING"][data-backend="notifications"]').waitFor();await screenshot544(page,'desktop-native-notification-feed-held-loading',f,live.browser,requests);
    await page.getByRole('button',{name:'Abmelden',exact:true}).click();await page.getByRole('heading',{name:'Abgemeldet',exact:true}).waitFor();assert.equal((await f.request('')).status,401);
    release();await deliveryFinished;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(deliveryAttempted,true);assert.equal(await page.locator('[id="shell.notifications"]').isVisible(),false);assert.equal(await page.locator('[id="shell.notifications"]').innerText(),'');assert.doesNotMatch(await page.locator('body').innerText(),new RegExp(invoiceId544));assert.deepEqual(errors,[]);
    assert.equal(requests.filter(r=>r.path.endsWith('/notifications/read')).length,0);assert.equal(nativeRows(f.native.root,'SELECT COUNT(*) AS count FROM pan544_read')[0].count,0);assert.equal(JSON.stringify(nativeRows(f.native.root,'SELECT * FROM pan542_events ORDER BY ordinal')),history);assert.deepEqual(readLocalJournalTaskIdentity(join(f.native.root,'pan453-owned-v2')),tasks);
    await page.setViewportSize({width:390,height:844});await screenshot544(page,'390-actual-logout-after-late-native-event',f,live.browser,requests);console.log(JSON.stringify({actualPrelogoutFeedStatus:actual.status,actualPostlogoutFeedStatus:401,lateDeliveryAttempted:true,oldNotificationFactsAbsent:true,observedReadWrites:0}));
  }finally{release?.();await live?.context.close();workspace?.close();await f.close();}
});

test('PUI-03 current native confirmation change or evidence approval disables prior actionable browser hint, never marks it read',async()=>{
  for(const status of ['OBSOLETE','DONE']){
    const f=await browserFixture544();let workspace,live;
    try{
      workspace=enableWorkspaceBrowserV1({optIn:true,gateway:f.tls.gateway,tenantId:'tenant-a',origin:f.tls.origin,nativeReader:f.nativeReader,notifications:f.service});live=await launch544(f);const page=await live.context.newPage(),requests=[];page.on('request',r=>requests.push({method:r.method(),path:new URL(r.url()).pathname,body:r.postData()}));
      await page.goto(f.tls.origin+'/t/tenant-a/workspace');await page.locator('[data-backend="notifications"][data-outcome="FEED_READY"]').waitFor();
      if(status==='OBSOLETE'){
        const native=procurement.readPan516Procurement({root:f.native.root}),last=native.confirmations.at(-1);
        const command={schemaVersion:'pansphaira.pan516/procurement-command/v1',effectId:'synthetic:notification-ui-confirmation-change',transportId:'synthetic:notification-ui-confirmation-wire',expectedRevision:native.revision,orderId:native.binding.draft.bestellungId,positionId:native.binding.draft.positionen[0].positionId,supplierId:native.binding.draft.lieferantId,kind:'CONFIRM',receipt:null,sourceReference:'synthetic:notification-ui-confirmation-source',confirmation:{revision:last.revision+1,previousConfirmationDigest:last.confirmationDigest,terms:{...last.terms,unitPriceMinor:last.terms.unitPriceMinor+1},confirmedAt:'2026-06-22T08:00:00Z'}};
        procurement.executePan516ProcurementCommand({root:f.native.root,command,grant:procurement.authorizePan516ProcurementCommand({root:f.native.root,owner:'LOCAL_SYNTHETIC_OWNER',command})});
      }else f.human.decide(f.approver,decision544(f.human.read(f.approver,{invoiceId:invoiceId544}),'APPROVE_LOCAL_EVIDENCE_ONLY','done-ui-001'));
      const afterNative=JSON.stringify(nativeRows(f.native.root,'SELECT * FROM pan542_events ORDER BY ordinal')),tasks=readLocalJournalTaskIdentity(join(f.native.root,'pan453-owned-v2'));
      // Intentionally click the old still-visible hint before any refreshed feed.
      const rejected=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/notifications/open'));await page.getByRole('button',{name:'Rechnung '+invoiceId544+' öffnen — nur lesen',exact:true}).click();assert.equal((await rejected).status(),409);await page.locator('[data-backend="notifications"][data-outcome="ERROR"]').waitFor();assert.doesNotMatch(await page.locator('main').innerText(),new RegExp(invoiceId544));
      assert.equal(requests.filter(r=>r.path.endsWith('/notifications/open')).length,1);assert.equal(requests.filter(r=>r.path.endsWith('/workspace/erv')||r.path.endsWith('/notifications/read')).length,0);
      await page.reload();await page.locator('[data-notification-status="'+status+'"]').waitFor();assert.equal(await page.getByRole('button',{name:'Rechnung '+invoiceId544+' öffnen — nur lesen',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Lesestatus ändern — Auftrag bleibt offen',exact:true}).count(),0);assert.equal(await page.locator('[data-notification-read="true"]').count(),0);
      assert.equal(nativeRows(f.native.root,'SELECT COUNT(*) AS count FROM pan544_read')[0].count,0);assert.equal(JSON.stringify(nativeRows(f.native.root,'SELECT * FROM pan542_events ORDER BY ordinal')),afterNative);assert.deepEqual(readLocalJournalTaskIdentity(join(f.native.root,'pan453-owned-v2')),tasks);
      await screenshot544(page,'desktop-real-native-'+status.toLowerCase()+'-not-personal-read',f,live.browser,requests);
    }finally{await live?.context.close();workspace?.close();await f.close();}
  }
});

test('PUI-03 obsolete native target denial clears already displayed prior invoice context',async()=>{
  const f=await browserFixture544();let workspace,live;
  try{
    workspace=enableWorkspaceBrowserV1({optIn:true,gateway:f.tls.gateway,tenantId:'tenant-a',origin:f.tls.origin,nativeReader:f.nativeReader,notifications:f.service});live=await launch544(f);const page=await live.context.newPage();
    await page.goto(f.tls.origin+'/t/tenant-a/workspace');await page.locator('[data-outcome="FEED_READY"][data-backend="notifications"]').waitFor();await page.getByRole('button',{name:'Rechnung '+invoiceId544+' öffnen — nur lesen',exact:true}).click();await page.locator('[data-backend="erv"][data-outcome="READBACK_RECEIVED"]').waitFor();await page.locator('[data-outcome="FEED_READY"][data-backend="notifications"]').waitFor();
    const native=procurement.readPan516Procurement({root:f.native.root}),last=native.confirmations.at(-1),command={schemaVersion:'pansphaira.pan516/procurement-command/v1',effectId:'synthetic:notification-ui-prior-view-change',transportId:'synthetic:notification-ui-prior-view-wire',expectedRevision:native.revision,orderId:native.binding.draft.bestellungId,positionId:native.binding.draft.positionen[0].positionId,supplierId:native.binding.draft.lieferantId,kind:'CONFIRM',receipt:null,sourceReference:'synthetic:notification-ui-prior-view-source',confirmation:{revision:last.revision+1,previousConfirmationDigest:last.confirmationDigest,terms:{...last.terms,unitPriceMinor:last.terms.unitPriceMinor+1},confirmedAt:'2026-06-22T08:00:00Z'}};
    procurement.executePan516ProcurementCommand({root:f.native.root,command,grant:procurement.authorizePan516ProcurementCommand({root:f.native.root,owner:'LOCAL_SYNTHETIC_OWNER',command})});
    await page.getByRole('button',{name:'Rechnung '+invoiceId544+' öffnen — nur lesen',exact:true}).click();await page.locator('[data-outcome="ERROR"][data-backend="notifications"]').waitFor();assert.doesNotMatch(await page.locator('main').innerText(),new RegExp(invoiceId544),'PAN544_NATIVE409_MUST_RETIRE_PRIOR_SHARED_OBJECT_FACTS');
    assert.equal(nativeRows(f.native.root,'SELECT COUNT(*) AS count FROM pan544_read')[0].count,0);await screenshot544(page,'desktop-stale-native-target-prior-facts-retired',f,live.browser,[]);
  }finally{await live?.context.close();workspace?.close();await f.close();}
});

test('PUI-03 keyboard read proposal cancels without effect and stays readable at 390 pixels plus controlled 200 percent CSS layout zoom',async()=>{
  const f=await browserFixture544();let workspace,live;
  try{
    workspace=enableWorkspaceBrowserV1({optIn:true,gateway:f.tls.gateway,tenantId:'tenant-a',origin:f.tls.origin,nativeReader:f.nativeReader,notifications:f.service});live=await launch544(f);const page=await live.context.newPage(),requests=[];page.on('request',r=>requests.push({method:r.method(),path:new URL(r.url()).pathname,body:r.postData()}));
    await page.goto(f.tls.origin+'/t/tenant-a/workspace');await page.locator('[data-outcome="FEED_READY"][data-backend="notifications"]').waitFor();const read=page.getByRole('button',{name:'Lesestatus ändern — Auftrag bleibt offen',exact:true});
    await read.focus();await read.press('Enter');await page.locator('[data-notification="read-diff"]').waitFor();assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-notification')),'read-diff');await page.keyboard.press('Escape');assert.equal(await page.locator('[data-notification="read-diff"]').count(),0);assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-notification-action')),'read');
    await read.press('Enter');await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{document.documentElement.style.zoom='2';});
    const dimensions=await screenshot544(page,'390-css-layout-zoom200-explicit-read-before-after-diff',f,live.browser,requests);assert.equal(dimensions.cssZoom,'2');
    const wordFit=await page.locator('[data-notification-action="read"]').evaluate(e=>{const style=getComputedStyle(e),canvas=document.createElement('canvas'),context=canvas.getContext('2d');context.font=style.font;return {word:'Lesestatus',wordWidth:context.measureText('Lesestatus').width,availableInline:e.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),font:style.font};});
    const headingFragments=await page.locator('.notification-row h3').evaluate(e=>{const word='Freigabehinweis',node=e.firstChild,start=node.textContent.indexOf(word),lines=new Map();if(start<0)throw new Error('PAN544_ACTUAL_HEADING_WORD_MISSING');for(let i=0;i<word.length;i++){const range=document.createRange();range.setStart(node,start+i);range.setEnd(node,start+i+1);const y=Math.round(range.getBoundingClientRect().top);lines.set(y,(lines.get(y)||'')+word[i]);}return {hyphens:getComputedStyle(e).hyphens,lines:[...lines.values()]};});
    console.log(JSON.stringify({actualGermanHeadingFragments:headingFragments}));assert.ok(headingFragments.lines.every(fragment=>fragment.length>=3),'PAN544_390_ZOOM_LONG_GERMAN_HEADING_MUST_NOT_LEAVE_TWO_LETTER_FRAGMENT');
    assert.ok(wordFit.wordWidth<=wordFit.availableInline,'PAN544_390_ZOOM_CRITICAL_LESESTATUS_WORD_MUST_NOT_FRAGMENT_INTO_CHARACTER_COLUMN');assert.ok(dimensions.document.width<=dimensions.viewport.width,'PAN544_390_CSS_ZOOM_DOCUMENT_OVERFLOW');assert.ok(dimensions.controls.every(c=>c.width>0&&c.height>0&&c.x>=0&&c.right<=dimensions.viewport.width),'PAN544_390_CSS_ZOOM_CONTROL_OVERFLOW');
    assert.equal(requests.filter(r=>r.path.endsWith('/notifications/read')).length,0);assert.equal(nativeRows(f.native.root,'SELECT COUNT(*) AS count FROM pan544_read')[0].count,0);console.log(JSON.stringify({cssLayoutZoomOnlyNotBrowserChromeOrPhysicalDevice:true,dimensions}));
  }finally{await live?.context.close();workspace?.close();await f.close();}
});

test('PUI-03 late actual setup read cannot steal focus from the current personal read proposal',async()=>{
  const f=await browserFixture544();let workspace,live,release;
  try{
    workspace=enableWorkspaceBrowserV1({optIn:true,gateway:f.tls.gateway,tenantId:'tenant-a',origin:f.tls.origin,nativeReader:f.nativeReader,notifications:f.service});live=await launch544(f);const page=await live.context.newPage(),requests=[],focusTrace=[];const gate=new Promise(resolve=>{release=resolve;});let retainedStatus;
    await page.exposeFunction('traceNotificationFocus544',x=>focusTrace.push(x));await page.addInitScript(()=>{document.addEventListener('focusin',e=>{const n=e.target;window.traceNotificationFocus544({id:n.id||null,notification:n.getAttribute('data-notification'),tag:n.tagName});});});
    page.on('request',r=>requests.push({method:r.method(),path:new URL(r.url()).pathname,body:r.postData()}));
    await page.route('**/t/tenant-a/api/status',async route=>{retainedStatus=await request527(f.tls,new URL(route.request().url()).pathname,await route.request().allHeaders());await gate;await route.fulfill({status:retainedStatus.status,contentType:'application/json',body:retainedStatus.body});});
    await page.goto(f.tls.origin+'/t/tenant-a/workspace');await page.locator('[data-outcome="FEED_READY"][data-backend="notifications"]').waitFor();await page.locator('[data-backend="setup"][data-outcome="LOADING"]').waitFor();
    const read=page.getByRole('button',{name:'Lesestatus ändern — Auftrag bleibt offen',exact:true});await read.focus();await read.press('Enter');await page.locator('[data-notification="read-diff"]').waitFor();assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-notification')),'read-diff');
    release();await page.locator('[data-backend="setup"][data-outcome="READBACK_RECEIVED"]').waitFor();
    // Wait for the actual post-render shell boundary, not a timer or heading alone.
    await page.waitForFunction(()=>document.querySelector('[id="shell.main"] [data-backend="setup"][data-outcome="READBACK_RECEIVED"]')&&document.querySelector('[id="shell.main"]')?.classList.contains('profile-regular'));
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    console.log(JSON.stringify({actualHeldSetupStatus:retainedStatus?.status,focusTrace,currentFocus:await page.evaluate(()=>({id:document.activeElement?.id,notification:document.activeElement?.getAttribute('data-notification')}))}));
    assert.equal(retainedStatus.status,200);assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-notification')),'read-diff','PAN544_LATE_REAL_SETUP_READ_MUST_NOT_STEAL_PERSONAL_PROPOSAL_FOCUS');
    assert.equal(requests.filter(r=>r.path.endsWith('/notifications/read')).length,0);assert.equal(nativeRows(f.native.root,'SELECT COUNT(*) AS count FROM pan544_read')[0].count,0);await screenshot544(page,'desktop-late-actual-setup-read-current-proposal-focus',f,live.browser,requests);
  }finally{release?.();await live?.context.close();workspace?.close();await f.close();}
});

test('PUI-03 genuine held empty feed shows loading then empty on desktop and 390 without implying completed tasks',async()=>{
  const f=await browserFixture544({publish:false});let workspace,live,release;
  try{
    workspace=enableWorkspaceBrowserV1({optIn:true,gateway:f.tls.gateway,tenantId:'tenant-a',origin:f.tls.origin,nativeReader:f.nativeReader,notifications:f.service});live=await launch544(f);const page=await live.context.newPage(),requests=[];let receipt;const gate=new Promise(resolve=>{release=resolve;});page.on('request',r=>requests.push({method:r.method(),path:new URL(r.url()).pathname,body:r.postData()}));
    await page.route('**/t/tenant-a/workspace/notifications',async route=>{receipt=await request527(f.tls,new URL(route.request().url()).pathname,await route.request().allHeaders());await gate;await route.fulfill({status:receipt.status,contentType:'application/json',body:receipt.body});});
    await page.goto(f.tls.origin+'/t/tenant-a/workspace');await page.locator('[data-backend="notifications"][data-outcome="LOADING"]').waitFor();await screenshot544(page,'desktop-real-held-notification-loading',f,live.browser,requests);await page.setViewportSize({width:390,height:844});await screenshot544(page,'390-real-held-notification-loading',f,live.browser,requests);
    release();await page.locator('[data-backend="notifications"][data-outcome="EMPTY"]').waitFor();assert.equal(receipt.status,200);assert.deepEqual(JSON.parse(receipt.body).events,[]);assert.match(await page.locator('[id="shell.notifications"]').innerText(),/kein Nachweis abgeschlossener Aufträge/);await screenshot544(page,'390-real-native-empty-notification-feed',f,live.browser,requests);await page.setViewportSize({width:1280,height:900});await screenshot544(page,'desktop-real-native-empty-notification-feed',f,live.browser,requests);
    assert.equal(nativeRows(f.native.root,'SELECT COUNT(*) AS count FROM pan544_events')[0].count,0);assert.equal(nativeRows(f.native.root,'SELECT COUNT(*) AS count FROM pan544_read')[0].count,0);assert.equal(requests.filter(r=>r.method==='POST').length,0);
  }finally{release?.();await live?.context.close();workspace?.close();await f.close();}
});

test('PUI-03 real feed transport failure shows no success and another module survives actual diagnostic renderer failure',async()=>{
  const f=await browserFixture544();let workspace,live;
  try{
    workspace=enableWorkspaceBrowserV1({optIn:true,gateway:f.tls.gateway,tenantId:'tenant-a',origin:f.tls.origin,nativeReader:f.nativeReader,notifications:f.service,diagnosticPlugins:true});live=await launch544(f);const page=await live.context.newPage(),requests=[],errors=[];let receipt;page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({method:r.method(),path:new URL(r.url()).pathname,body:r.postData()}));
    const history=JSON.stringify(nativeRows(f.native.root,'SELECT * FROM pan542_events ORDER BY ordinal')),tasks=readLocalJournalTaskIdentity(join(f.native.root,'pan453-owned-v2'));
    await page.route('**/t/tenant-a/workspace/notifications',async route=>{receipt=await request527(f.tls,new URL(route.request().url()).pathname,await route.request().allHeaders());assert.equal(receipt.status,200);await route.abort('failed');});
    await page.goto(f.tls.origin+'/t/tenant-a/workspace');await page.locator('[data-backend="notifications"][data-outcome="ERROR"]').waitFor();assert.equal(JSON.parse(receipt.body).events.length,1);assert.equal(await page.locator('[data-notification-status]').count(),0);await screenshot544(page,'desktop-real-feed-delivery-error-no-success',f,live.browser,requests);await page.setViewportSize({width:390,height:844});await screenshot544(page,'390-real-feed-delivery-error-no-success',f,live.browser,requests);
    await page.getByRole('button',{name:'Technischer Rendererfehlernachweis',exact:true}).click();await page.getByText('Pluginansicht konnte nicht gerendert werden.',{exact:true}).waitFor();assert.match(await page.locator('[id="shell.widgets"]').innerText(),/Andere Module und Abmelden bleiben bedienbar/);await page.getByRole('button',{name:'Einrichtung und Betriebszustand',exact:true}).click();await page.locator('[data-backend="setup"][data-outcome="READBACK_RECEIVED"]').waitFor();assert.equal(await page.getByRole('button',{name:'Abmelden',exact:true}).isEnabled(),true);await screenshot544(page,'390-notification-error-and-other-module-after-real-renderer-fault',f,live.browser,requests);
    assert.equal(nativeRows(f.native.root,'SELECT COUNT(*) AS count FROM pan544_read')[0].count,0);assert.equal(JSON.stringify(nativeRows(f.native.root,'SELECT * FROM pan542_events ORDER BY ordinal')),history);assert.deepEqual(readLocalJournalTaskIdentity(join(f.native.root,'pan453-owned-v2')),tasks);assert.equal(requests.filter(r=>r.method==='POST').length,0);assert.deepEqual(errors,[]);
  }finally{await live?.context.close();workspace?.close();await f.close();}
});

test('PUI-03 controlled-clock expired native hint renders nonactionable in a genuinely fresh protected browser session',async t=>{
  const f=await browserFixture544();let workspace,live;
  try{
    const hint=f.service.feed(f.approver).events[0],future=hint.expiresAtMs+1,history=JSON.stringify(nativeRows(f.native.root,'SELECT * FROM pan542_events ORDER BY ordinal')),tasks=readLocalJournalTaskIdentity(join(f.native.root,'pan453-owned-v2'));
    t.mock.method(Date,'now',()=>future);const fresh=f.issue('synthetic:erv-approver');
    workspace=enableWorkspaceBrowserV1({optIn:true,gateway:f.tls.gateway,tenantId:'tenant-a',origin:f.tls.origin,nativeReader:f.nativeReader,notifications:f.service});live=await launch544(f);await live.login(fresh);const page=await live.context.newPage(),requests=[];page.on('request',r=>requests.push({method:r.method(),path:new URL(r.url()).pathname,body:r.postData()}));
    await page.goto(f.tls.origin+'/t/tenant-a/workspace');await page.locator('[data-notification-status="EXPIRED"]').waitFor();assert.match(await page.locator('[id="shell.notifications"]').innerText(),/Hinweis abgelaufen/);assert.equal(await page.getByRole('button',{name:'Rechnung '+invoiceId544+' öffnen — nur lesen',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Lesestatus ändern — Auftrag bleibt offen',exact:true}).count(),0);await screenshot544(page,'desktop-controlled-clock-native-expired-hint',f,live.browser,requests);await page.setViewportSize({width:390,height:844});await screenshot544(page,'390-controlled-clock-native-expired-hint',f,live.browser,requests);
    assert.equal(nativeRows(f.native.root,'SELECT COUNT(*) AS count FROM pan544_read')[0].count,0);assert.equal(JSON.stringify(nativeRows(f.native.root,'SELECT * FROM pan542_events ORDER BY ordinal')),history);assert.deepEqual(readLocalJournalTaskIdentity(join(f.native.root,'pan453-owned-v2')),tasks);assert.equal(requests.filter(r=>r.method==='POST').length,0);console.log(JSON.stringify({clockSimulationNotObserved24HourWait:true,actualExpiryStatus:'EXPIRED',newProtectedSession:true,businessAndPersonalStateUnchanged:true}));
  }finally{t.mock.restoreAll();await live?.context.close();workspace?.close();await f.close();}
});
