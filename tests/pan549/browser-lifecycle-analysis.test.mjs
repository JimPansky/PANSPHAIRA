import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {browserFixture549,launch549,start549,enter549,forward549,responsive549,screenshot549} from './browser-fixture.mjs';
import {request527} from '../pan527/helpers.mjs';
// Observe rejection immediately without replacing the promise awaited by the case.
function deferred(timeout=0){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});const clock=timeout?setTimeout(()=>reject(new Error('PAN549_HELD_NATIVE_READ_OBSERVER_DEADLINE')),timeout):null;void promise.then(()=>{if(clock)clearTimeout(clock);},()=>{if(clock)clearTimeout(clock);});return {promise,resolve,reject};}
async function noFacts(page){assert.equal(await page.locator('[data-analysis-key]').count(),0);assert.equal(await page.locator('[data-analysis-cohort]').count(),0);assert.equal(await page.locator('body').getAttribute('data-analysis-result-revision'),null);assert.doesNotMatch(await page.locator('main').innerText(),/READBACK_RECEIVED|Adoption:\s*0|Bestand:\s*0/);}
const cases=[
 {name:'stale-source',expected:'STALE',status:409,change:s=>{s.expectedNativeRevision=999;}},
 {name:'stale-result',expected:'STALE',status:409,change:s=>{s.expectedResultRevision='0'.repeat(64);}},
 {name:'denied-context',expected:'DENIED',status:401,change:(_s,h)=>{delete h['x-pan549-context'];}},
 {name:'unavailable-closed-selector',expected:'UNAVAILABLE',status:400,change:s=>{s.sql='SELECT * FROM objects';}},
 {name:'unknown-delivery-loss',expected:'UNKNOWN',status:200,drop:true},
 {name:'unknown-tampered-result',expected:'UNKNOWN',status:200,tamper:true},
];
for(const c of cases)test('PUI-08/UIDOD real protected browser '+c.name+' displays no facts or false success and leaves independent setup usable',async()=>{
 const f=await browserFixture549();let live;
 try{
  live=await launch549(f);const page=await live.context.newPage(),errors=[],observed=[];let nativeStatus;
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>observed.push({method:r.method(),path:new URL(r.url()).pathname}));
  await start549(page,f);
  await page.route('**/workspace/analysis',async route=>{const actual=await forward549(f,route,c.change);nativeStatus=actual.status;assert.equal(actual.status,c.status);assert.equal(actual.tlsAuthorized,true);if(c.drop){await route.abort('failed');return;}let body=actual.body;if(c.tamper){const result=JSON.parse(body);result.rows[0].value++;body=JSON.stringify(result);}await route.fulfill({status:actual.status,contentType:'application/json',body});});
  await enter549(page);await page.locator('[data-backend="analysis"][data-outcome="'+c.expected+'"]').waitFor();await noFacts(page);assert.match(await page.locator('[data-backend="analysis"] [role="status"]').innerText(),new RegExp('\\b'+c.expected+'\\b'),'PAN549_KNOWN_TERMINAL_STATE_MUST_BE_VISIBLY_DISTINCT_NOT_ONLY_A_DATASET');
  assert.equal(nativeStatus,c.status);assert.equal(observed.filter(r=>r.path.endsWith('/workspace/analysis')).length,1);
  await responsive549(page,c.name,f,live.browser,{actualNativeStatus:nativeStatus,observerFault:c.tamper?'Tampered only delivered actual native result bytes, not a source/vendor failure':c.drop?'Interrupted only delivery after actual native read, not a source/vendor failure':'Changed only observed selector/context proof before forwarding to the unchanged actual protected gateway'});
  await page.locator('[id="shell.navigation"] button').first().click();await page.locator('[data-backend="setup"][data-outcome="READBACK_RECEIVED"]').waitFor();assert.equal(await page.locator('[data-analysis-key]').count(),0);f.unchanged();assert.deepEqual(errors,[]);
 }finally{await live?.context.close();await f.close();}
});

test('UIDOD actual loading response becomes retired on module context switch and late native bytes never repopulate old facts',async()=>{
 const f=await browserFixture549();let live;const read=deferred(),release=deferred(),done=deferred();
 try{
  live=await launch549(f);const page=await live.context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await start549(page,f);
  await page.route('**/workspace/analysis',async route=>{try{const actual=await forward549(f,route);assert.equal(actual.status,200);read.resolve();await release.promise;await route.fulfill({status:actual.status,contentType:'application/json',body:actual.body});}catch(error){read.reject(error);throw error;}finally{done.resolve();}});
  await enter549(page);await read.promise;await page.locator('[data-backend="analysis"][data-outcome="LOADING"]').waitFor();await noFacts(page);await responsive549(page,'actual-native-read-held-loading',f,live.browser,{actualNativeStatus:200,observerFault:'Actual source read already returned; only browser delivery held by owned observer'});
  await page.locator('[id="shell.navigation"] button').first().click();await page.locator('[data-backend="setup"][data-outcome="READBACK_RECEIVED"]').waitFor();release.resolve();await done.promise;await noFacts(page);assert.match(await page.locator('main').innerText(),/Einrichtung und Betriebszustand/);await responsive549(page,'late-read-retired-context',f,live.browser);f.unchanged();assert.deepEqual(errors,[]);
 }finally{release.resolve();await live?.context.close();await f.close();}
});

for(const transition of ['native-logout','fresh-session','foreign-tenant-session'])test('UIDOD actual read held while '+transition+' becomes DENIED before renderer; no old facts or restored cookie',async()=>{
 const f=await browserFixture549();let live;const read=deferred(),release=deferred(),done=deferred();
 try{
  live=await launch549(f);const page=await live.context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await start549(page,f);
  await page.route('**/workspace/analysis',async route=>{try{const actual=await forward549(f,route);assert.equal(actual.status,200);assert.equal(actual.headers['set-cookie'],undefined);read.resolve();await release.promise;await route.fulfill({status:actual.status,contentType:'application/json',body:actual.body});}catch(error){read.reject(error);throw error;}finally{done.resolve();}});
  await enter549(page);await read.promise;
  if(transition==='native-logout')assert.equal((await request527(f.tls,'/t/tenant-a/workspace/logout',{cookie:live.who.cookieHeader,origin:f.tls.origin},'POST')).status,200);
  else if(transition==='fresh-session')await live.login(f.issue('reviewer'));
  else await live.login(f.tls.gateway.sessionAdapter('tenant-b').issueOwnerSession({subjectId:'synthetic:foreign-analysis-session',role:'reader',expiresAtMs:Date.now()+60000}));
  release.resolve();await done.promise;await page.locator('[data-backend="analysis"][data-outcome="DENIED"]').waitFor();await noFacts(page);await responsive549(page,'held-read-'+transition+'-denied',f,live.browser);f.unchanged();assert.deepEqual(errors,[]);
 }finally{release.resolve();await live?.context.close();await f.close();}
});

test('UIDOD held-read observer can reject an actually expired native request instead of leaving an unresolved read promise', {timeout:15000}, async()=>{
 const f=await browserFixture549();
 try{
  const expiresAtMs=Date.now()+1000,short=f.sessions.issueOwnerSession({subjectId:'synthetic:analysis-observer-expiry',role:'reader',expiresAtMs});
  await new Promise(resolve=>setTimeout(resolve,expiresAtMs-Date.now()+10));assert.ok(Date.now()>=expiresAtMs);assert.throws(()=>f.sessions.authenticate({cookie:short.cookieHeader}),/HOSTED_SESSION_DENIED/);
  const actual=await request527(f.tls,'/t/tenant-a/workspace/analysis',{cookie:short.cookieHeader,origin:f.tls.origin},'POST',{schemaVersion:'pansphaira.workspace-analysis/read/v1',objectId:'analysis:common-trade-01:stock',expectedNativeRevision:null,expectedResultRevision:null,asOf:'2026-06-30T23:59:59+02:00'});assert.equal(actual.status,401);
  const read=deferred();assert.equal(typeof read.reject,'function','PAN549_HELD_READ_OBSERVER_MUST_PROPAGATE_NATIVE_FAILURE');
  const rejected=assert.rejects(read.promise,{code:'ERR_ASSERTION'});try{assert.equal(actual.status,200);}catch(error){read.reject(error);}await rejected;f.unchanged();
 }finally{await f.close();}
});

test('UIDOD actual native-session expiry after a held successful source read denies late rendering without renewal or facts',{timeout:30000},async()=>{
 const f=await browserFixture549();let live;const read=deferred(10000),release=deferred(),done=deferred();
 try{
  live=await launch549(f);const expiresAtMs=Date.now()+5000,short=f.sessions.issueOwnerSession({subjectId:'synthetic:analysis-short-expiry',role:'reader',expiresAtMs});await live.login(short);const page=await live.context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await start549(page,f);
  await page.route('**/workspace/analysis',async route=>{try{const actual=await forward549(f,route);assert.equal(actual.status,200);assert.equal(actual.headers['set-cookie'],undefined);read.resolve();await release.promise;await route.fulfill({status:actual.status,contentType:'application/json',body:actual.body});}catch(error){read.reject(error);throw error;}finally{done.resolve();}});
  await enter549(page);await read.promise;assert.equal(f.sessions.authenticate({cookie:short.cookieHeader}).role,'reader');assert.ok(Date.now()<expiresAtMs,'PAN549_EXPIRY_PROBE_MUST_FIRST_OBSERVE_ACTUALLY_LIVE_NATIVE_SESSION');
  // Cookie-renewal401 in the final subsecond is not native expiry. Await the actual issued binding expiry, without changing the clock or backend.
  const remaining=expiresAtMs-Date.now()+10;assert.ok(remaining>0&&remaining<=5010);await new Promise(resolve=>setTimeout(resolve,remaining));assert.ok(Date.now()>=expiresAtMs);assert.throws(()=>f.sessions.authenticate({cookie:short.cookieHeader}),/HOSTED_SESSION_DENIED/);
  const expiredContext=await request527(f.tls,'/t/tenant-a/workspace/context',{cookie:short.cookieHeader});assert.equal(expiredContext.status,401);release.resolve();await done.promise;await page.locator('[data-backend="analysis"][data-outcome="DENIED"]').waitFor();await noFacts(page);await responsive549(page,'held-read-actual-native-expired-denied',f,live.browser,{actualNativeReadStatusBeforeExpiry:200,actualAfterExpiryContextStatus:401,nativeAuthenticationAfterActualExpiryDenied:true,observerFault:'Actual source read completed before actual native expiry; only delivery held, no clock/session/backend alteration'});f.unchanged();assert.deepEqual(errors,[]);
 }finally{release.resolve();await live?.context.close();await f.close();}
});

test('PUI-08 actual default-off EMPTY cohort, positive stock, keyboard focus and local table scroll stay distinct at desktop390 CSS zoom and wider font metrics',async()=>{
 const f=await browserFixture549({cohort:'EMPTY'});let live;
 try{
  live=await launch549(f);const page=await live.context.newPage();await start549(page,f);await enter549(page);await page.locator('[data-backend="analysis"][data-outcome="READBACK_RECEIVED"]').waitFor();
  assert.equal(await page.locator('[data-analysis-cohort="EMPTY"]').count(),1);assert.equal(await page.locator('tr[data-analysis-key="physical"] td[data-analysis-value]').innerText(),'2');assert.match(await page.locator('[data-analysis-cohort]').innerText(),/UNKNOWN/);assert.equal(f.usage.consentStatus().state,'DISABLED');
  await screenshot549(page,'desktop-unit-and-header-readability',f,live.browser);const wrapping=await page.evaluate(()=>[...document.querySelectorAll('.analysis-table-scroll tbody td:nth-child(4),.analysis-table-scroll thead th:nth-child(2)')].map(e=>{const r=document.createRange();r.selectNodeContents(e);return {text:e.textContent,lines:r.getClientRects().length};}));assert.ok(wrapping.length===7&&wrapping.every(x=>x.lines===1),'PAN549_DESKTOP_UNIT_AND_STATE_IDENTIFIERS_MUST_NOT_FRAGMENT_MID_TOKEN');
  await page.waitForFunction(()=>document.activeElement?.id==='shell.main');const observations=await responsive549(page,'actual-default-off-empty-cohort-positive',f,live.browser);
  const table=page.getByRole('region',{name:'Bestandswerte — Tabelle lokal horizontal scrollbar',exact:true});await table.focus();assert.equal(await table.evaluate(e=>e===document.activeElement),true);assert.equal(observations[1].table[0].overflow,'auto');assert.ok(observations[1].table[0].scrollWidth>observations[1].table[0].clientWidth);await table.press('ArrowRight');await page.waitForFunction(()=>document.querySelector('.analysis-table-scroll').scrollLeft>0);assert.ok(await table.evaluate(e=>e.scrollLeft>0));
  await page.locator('.skip-link').focus();await page.locator('.skip-link').press('Enter');await page.waitForFunction(()=>document.activeElement?.id==='shell.main');assert.match(await page.locator('main').innerText(),/Gebundene Bestandsanalyse/);assert.match(await page.evaluate(()=>location.hash),/^#\/workspace\/analysis/);
  await page.evaluate(()=>{document.documentElement.style.zoom='2';});let d=await screenshot549(page,'390-empty-css-layout-zoom-2',f,live.browser,{stressNotBrowserChromePhysicalDeviceOrLocalizationAcceptance:true});assert.ok(d.document.width<=d.viewport.width);assert.ok(d.controls.every(c=>c.width>0&&c.height>0&&c.x>=0&&c.right<=d.viewport.width));
  await page.evaluate(()=>{document.documentElement.style.zoom='1';document.querySelector('main').style.fontFamily='monospace';document.querySelector('main').style.fontSize='22px';});d=await screenshot549(page,'390-empty-wide-font-content-stress',f,live.browser,{stressNotHostedFontReplayOrLocalizationAcceptance:true});assert.ok(d.document.width<=d.viewport.width);assert.ok(d.controls.every(c=>c.width>0&&c.height>0&&c.x>=0&&c.right<=d.viewport.width));f.unchanged();
 }finally{await live?.context.close();await f.close();}
});

test('PUI-08 browser refuses correctly hashed genuine native bytes for a different requested cutoff',async()=>{
 const f=await browserFixture549();let live;
 try{
  live=await launch549(f);const page=await live.context.newPage();await start549(page,f);
  await page.route('**/workspace/analysis',async route=>{const actual=await forward549(f,route,selector=>{selector.asOf='2026-07-01T00:00:00Z';});assert.equal(actual.status,200);await route.fulfill({status:200,contentType:'application/json',body:actual.body});});
  await enter549(page);await page.waitForFunction(()=>{const state=document.querySelector('[data-backend="analysis"]')?.getAttribute('data-outcome');return state&&state!=='LOADING';});
  assert.equal(await page.locator('[data-backend="analysis"]').getAttribute('data-outcome'),'UNKNOWN');await noFacts(page);
  await responsive549(page,'genuine-native-wrong-cutoff-denied',f,live.browser,{observerFault:'Changed only forwarded read cutoff; delivered unchanged correctly hashed genuine native result bytes to the original requesting renderer'});f.unchanged();
 }finally{await live?.context.close();await f.close();}
});

test('PUI-08 exported direct renderer clears prior facts on bad integrity and an older rejection cannot erase a newer valid render',async()=>{
 const f=await browserFixture549();let live;
 try{
  live=await launch549(f);const page=await live.context.newPage();await start549(page,f);
  const bundle=join(f.tls.root,'owned-direct-analysis.mjs');
  execFileSync(process.execPath,['--input-type=module','-e','import{buildSync}from "esbuild";buildSync({entryPoints:["packages/browser-workspace/src/plugin-analysis-v1.ts"],bundle:true,format:"esm",platform:"browser",outfile:process.argv[1]});',bundle],{stdio:'pipe'});
  const source=readFileSync(bundle,'utf8');await page.route('**/owned-direct-analysis.js',route=>route.fulfill({contentType:'application/javascript',body:source}));
  const selector={schemaVersion:'pansphaira.workspace-analysis/read/v1',objectId:'analysis:common-trade-01:stock',expectedNativeRevision:null,expectedResultRevision:null,asOf:'2026-06-30T23:59:59+02:00'};
  const actual=f.reader.read({cookie:live.who.cookieHeader,origin:f.tls.origin},selector);
  const observed=await page.evaluate(async ({value,selector})=>{
   const {renderWorkspaceAnalysisResultV1:render}=await import('/owned-direct-analysis.js');
   const target=document.createElement('section');target.id='owned-direct-renderer';document.querySelector('main').append(target);
   await render(target,value,value.binding,undefined,selector);const first=target.querySelectorAll('[data-analysis-value]').length;
   const bad=structuredClone(value);bad.rows[0].value++;let rejected=false;
   try{await render(target,bad,value.binding,undefined,selector);}catch{rejected=true;}
   const afterBad={cells:target.querySelectorAll('[data-analysis-value]').length,state:target.getAttribute('data-outcome')};
   const digest=crypto.subtle.digest.bind(crypto.subtle);let entered,release,firstDigest=true;
   const began=new Promise(resolve=>{entered=resolve;}),held=new Promise(resolve=>{release=resolve;});
   crypto.subtle.digest=async(...args)=>{const bytes=await digest(...args);if(firstDigest){firstDigest=false;entered();await held;}return bytes;};
   try{
    const older=render(target,bad,value.binding,undefined,selector).then(()=>false,()=>true);await began;
    await render(target,value,value.binding,undefined,selector);release();const oldRejected=await older;
    return {first,rejected,afterBad,oldRejected,finalCells:target.querySelectorAll('[data-analysis-value]').length,finalState:target.getAttribute('data-outcome')};
   }finally{release();crypto.subtle.digest=digest;}
  },{value:actual,selector});
  assert.equal(observed.first,6);assert.equal(observed.rejected,true);assert.equal(observed.afterBad.cells,0);assert.equal(observed.afterBad.state,'UNKNOWN');assert.equal(observed.oldRejected,true);assert.equal(observed.finalCells,6);assert.equal(observed.finalState,'READBACK_RECEIVED');
  await screenshot549(page,'direct-renderer-newer-success-survives-older-rejection',f,live.browser,{observerFault:'Real exported production renderer compiled in an owned test bundle; only delivery of the actual browser cryptographic digest was held, no fabricated native values or digest bytes'});f.unchanged();
 }finally{await live?.context.close();await f.close();}
});

test('UIDOD analysis source attachment withdrawn denies its real route and other protected modules remain readable',async()=>{
 const f=await browserFixture549({analysis:false});let live;
 try{
  live=await launch549(f);const page=await live.context.newPage(),errors=[],responses=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>responses.push({path:new URL(r.url()).pathname,status:r.status()}));await start549(page,f);assert.equal(await page.getByRole('button',{name:'Gebundene Bestandsanalyse — nur lesen',exact:true}).count(),0);
  await page.evaluate(()=>{location.hash='#/workspace/analysis';});await page.getByRole('heading',{name:'Deep Link verweigert',exact:true}).waitFor();await noFacts(page);
  await page.locator('[id="shell.navigation"] button').first().click();try{await page.locator('[data-backend="setup"][data-outcome="READBACK_RECEIVED"]').waitFor();}catch(error){console.log('PAN549_ACTUAL_ABSENT_OWNER_SETUP_FAILURE='+JSON.stringify({hash:await page.evaluate(()=>location.hash),body:await page.locator('body').innerText(),errors,responses}));await screenshot549(page,'actual-source-absent-setup-failure',f,live.browser);throw error;}await responsive549(page,'analysis-owner-absent-safe-setup',f,live.browser);f.unchanged();
 }finally{await live?.context.close();await f.close();}
});

const directSelector549={schemaVersion:'pansphaira.workspace-analysis/read/v1',objectId:'analysis:common-trade-01:stock',expectedNativeRevision:null,expectedResultRevision:null,asOf:'2026-06-30T23:59:59+02:00'};
async function directModule549(f,page){
 const bundle=join(f.tls.root,'owned-reviewed-direct-analysis.mjs');
 execFileSync(process.execPath,['--input-type=module','-e','import{buildSync}from "esbuild";buildSync({entryPoints:["packages/browser-workspace/src/plugin-analysis-v1.ts"],bundle:true,format:"esm",platform:"browser",outfile:process.argv[1]});',bundle],{stdio:'pipe'});
 const source=readFileSync(bundle,'utf8');await page.route('**/owned-reviewed-direct-analysis.js',route=>route.fulfill({contentType:'application/javascript',body:source}));
}

test('PUI-08 exported read-backed renderer requires a complete matching selector including explicit null cutoff',async()=>{
 const f=await browserFixture549();let live;
 try{
  live=await launch549(f);const page=await live.context.newPage();await start549(page,f);await directModule549(f,page);
  const value=f.reader.read({cookie:live.who.cookieHeader,origin:f.tls.origin},directSelector549),current=f.reader.read({cookie:live.who.cookieHeader,origin:f.tls.origin},{...directSelector549,asOf:null});
  const observed=await page.evaluate(async ({value,current,selector})=>{
   const {renderWorkspaceAnalysisResultV1:render}=await import('/owned-reviewed-direct-analysis.js');const target=document.createElement('section');document.querySelector('main').append(target);const negatives=[];
   for(const admitted of [undefined,{}, {...selector,asOf:null},{...selector,asOf:'2026-07-01T00:00:00Z'},{...selector,expectedNativeRevision:999},{...selector,expectedResultRevision:'0'.repeat(64)}]){
    await render(target,value,value.binding,undefined,selector);let denied=false;try{await render(target,value,value.binding,undefined,admitted);}catch{denied=true;}
    negatives.push({denied,cells:target.querySelectorAll('[data-analysis-value]').length,state:target.getAttribute('data-outcome')});
   }
   await render(target,current,current.binding,undefined,{...selector,asOf:null});return {negatives,positive:target.getAttribute('data-outcome'),cells:target.querySelectorAll('[data-analysis-value]').length};
  },{value,current,selector:directSelector549});
  assert.equal(observed.negatives.length,6);assert.ok(observed.negatives.every(x=>x.denied&&x.cells===0&&x.state==='UNKNOWN'));assert.equal(observed.positive,'READBACK_RECEIVED');assert.equal(observed.cells,6);f.unchanged();
 }finally{await live?.context.close();await f.close();}
});

test('PUI-08 direct and view entry points share one owner across older success and older terminal failure',async()=>{
 const f=await browserFixture549();let live;const read=deferred(10000),release=deferred(),done=deferred();
 try{
  live=await launch549(f);const page=await live.context.newPage();await start549(page,f);await directModule549(f,page);
  const value=f.reader.read({cookie:live.who.cookieHeader,origin:f.tls.origin},directSelector549);
  const denied=await page.evaluate(async ({value,selector})=>{
   const {renderWorkspaceAnalysisResultV1:render,createAnalysisViewV1:create}=await import('/owned-reviewed-direct-analysis.js');const c=await (await fetch('/t/tenant-a/workspace/context')).json(),captured={...c,objectId:selector.objectId};const target=document.createElement('section');document.querySelector('main').append(target);
   const digest=crypto.subtle.digest.bind(crypto.subtle);let entered,release,first=true;const began=new Promise(r=>{entered=r;}),held=new Promise(r=>{release=r;});crypto.subtle.digest=async(...args)=>{const bytes=await digest(...args);if(first){first=false;entered();await held;}return bytes;};
   try{
    const old=render(target,value,value.binding,undefined,selector).then(()=>false,()=>true);await began;const logout=await fetch('/t/tenant-a/workspace/logout',{method:'POST'});if(logout.status!==200)throw new Error('ACTUAL_NATIVE_LOGOUT_NOT_CONFIRMED');
    await create({base:'/t/tenant-a',context:()=>captured,selected:()=>null}).render({target,signal:new AbortController().signal});release();const rejected=await old;
    return {rejected,state:target.getAttribute('data-outcome'),cells:target.querySelectorAll('[data-analysis-value]').length};
   }finally{release();crypto.subtle.digest=digest;}
  },{value,selector:directSelector549});assert.deepEqual(denied,{rejected:true,state:'DENIED',cells:0});
  const who=await live.login(f.issue());const fresh=f.reader.read({cookie:who.cookieHeader,origin:f.tls.origin},directSelector549);
  await page.route('**/workspace/analysis',async route=>{try{const actual=await forward549(f,route,s=>{s.sql='SELECT * FROM objects';});assert.equal(actual.status,400);read.resolve();await release.promise;await route.fulfill({status:actual.status,contentType:'application/json',body:actual.body});}catch(e){read.reject(e);throw e;}finally{done.resolve();}});
  await page.evaluate(async selector=>{const {createAnalysisViewV1:create}=await import('/owned-reviewed-direct-analysis.js');const c=await (await fetch('/t/tenant-a/workspace/context')).json();window.reviewedTarget=document.createElement('section');document.querySelector('main').append(window.reviewedTarget);window.reviewedView=create({base:'/t/tenant-a',context:()=>({...c,objectId:selector.objectId}),selected:()=>null}).render({target:window.reviewedTarget,signal:new AbortController().signal});},directSelector549);
  await read.promise;await page.evaluate(async ({value,selector})=>{const {renderWorkspaceAnalysisResultV1:render}=await import('/owned-reviewed-direct-analysis.js');await render(window.reviewedTarget,value,value.binding,undefined,selector);},{value:fresh,selector:directSelector549});release.resolve();await done.promise;
  const final=await page.evaluate(async()=>{await window.reviewedView;return {state:window.reviewedTarget.getAttribute('data-outcome'),cells:window.reviewedTarget.querySelectorAll('[data-analysis-value]').length};});assert.deepEqual(final,{state:'READBACK_RECEIVED',cells:6});f.unchanged();
 }finally{release.resolve();await live?.context.close();await f.close();}
});

test('UIDOD direct hash admission cannot revive a detached and reattached target or ancestor',async()=>{
 const f=await browserFixture549();let live;
 try{
  live=await launch549(f);const page=await live.context.newPage();await start549(page,f);await directModule549(f,page);const value=f.reader.read({cookie:live.who.cookieHeader,origin:f.tls.origin},directSelector549);
  const observed=await page.evaluate(async ({value,selector})=>{
   const {renderWorkspaceAnalysisResultV1:render}=await import('/owned-reviewed-direct-analysis.js');const results=[];
   for(const ancestor of [false,true]){
    const parent=document.createElement('div'),target=document.createElement('section');parent.append(target);document.querySelector('main').append(parent);
    const digest=crypto.subtle.digest.bind(crypto.subtle);let entered,release,first=true;const began=new Promise(r=>{entered=r;}),held=new Promise(r=>{release=r;});crypto.subtle.digest=async(...args)=>{const bytes=await digest(...args);if(first){first=false;entered();await held;}return bytes;};
    try{const old=render(target,value,value.binding,undefined,selector).then(()=>false,()=>true);await began;const removed=ancestor?parent:target;removed.remove();document.querySelector('main').append(removed);release();const rejected=await old;results.push({rejected,cells:target.querySelectorAll('[data-analysis-value]').length});await render(target,value,value.binding,undefined,selector);results.at(-1).newCells=target.querySelectorAll('[data-analysis-value]').length;}finally{release();crypto.subtle.digest=digest;parent.remove();target.remove();}
   }return results;
  },{value,selector:directSelector549});assert.deepEqual(observed,[{rejected:true,cells:0,newCells:6},{rejected:true,cells:0,newCells:6}]);f.unchanged();
 }finally{await live?.context.close();await f.close();}
});

test('UIDOD detached view target receives no late facts or revision marker from actual protected result bytes',async()=>{
 const f=await browserFixture549();let live;const read=deferred(10000),release=deferred(),done=deferred();
 try{
  live=await launch549(f);const page=await live.context.newPage();await start549(page,f);await directModule549(f,page);
  await page.route('**/workspace/analysis',async route=>{try{const actual=await forward549(f,route);assert.equal(actual.status,200);read.resolve();await release.promise;await route.fulfill({status:200,contentType:'application/json',body:actual.body});}catch(e){read.reject(e);throw e;}finally{done.resolve();}});
  await page.evaluate(async selector=>{const {createAnalysisViewV1:create}=await import('/owned-reviewed-direct-analysis.js');const c=await (await fetch('/t/tenant-a/workspace/context')).json();window.reviewedTarget=document.createElement('section');document.querySelector('main').append(window.reviewedTarget);window.reviewedView=create({base:'/t/tenant-a',context:()=>({...c,objectId:selector.objectId}),selected:()=>null}).render({target:window.reviewedTarget,signal:new AbortController().signal});},directSelector549);
  await read.promise;await page.evaluate(()=>window.reviewedTarget.remove());release.resolve();await done.promise;const final=await page.evaluate(async()=>{await window.reviewedView;return {cells:window.reviewedTarget.querySelectorAll('[data-analysis-value]').length,cohorts:window.reviewedTarget.querySelectorAll('[data-analysis-cohort]').length,revision:document.body.dataset.analysisResultRevision??null};});assert.deepEqual(final,{cells:0,cohorts:0,revision:null});f.unchanged();
 }finally{release.resolve();await live?.context.close();await f.close();}
});

test('UIDOD native revocation during actual browser digest delivery is rechecked after verification before synchronous fact commit',async()=>{
 const f=await browserFixture549();let live;
 try{
  live=await launch549(f);const page=await live.context.newPage();await start549(page,f);
  await page.evaluate(()=>{const digest=crypto.subtle.digest.bind(crypto.subtle);let first=true;window.actualDigestEntered=false;const held=new Promise(resolve=>{window.releaseActualDigest=resolve;});crypto.subtle.digest=async(...args)=>{const bytes=await digest(...args);if(first){first=false;window.actualDigestEntered=true;await held;}return bytes;};window.restoreActualDigest=()=>{crypto.subtle.digest=digest;};});
  await enter549(page);await page.waitForFunction(()=>window.actualDigestEntered);const cached=await page.locator('body').getAttribute('data-context-revision');assert.equal((await request527(f.tls,'/t/tenant-a/workspace/logout',{cookie:live.who.cookieHeader,origin:f.tls.origin},'POST')).status,200);assert.equal((await request527(f.tls,'/t/tenant-a/workspace/context',{cookie:live.who.cookieHeader})).status,401);
  await page.evaluate(()=>window.releaseActualDigest());await page.waitForFunction(()=>document.querySelector('[data-backend="analysis"]')?.getAttribute('data-outcome')!=='LOADING');assert.equal(await page.locator('[data-backend="analysis"]').getAttribute('data-outcome'),'DENIED');await noFacts(page);assert.equal(await page.locator('body').getAttribute('data-context-revision'),cached);await responsive549(page,'native-revoke-after-real-digest-denied',f,live.browser,{observerFault:'Held actual WebCrypto output only; real server logout revoked the native session while cached browser context stayed unchanged'});await page.evaluate(()=>window.restoreActualDigest());f.unchanged();
 }finally{await live?.context.close();await f.close();}
});

test('UIDOD focused skip link remains readable without obstructing the workspace heading at desktop and390',async()=>{
 const f=await browserFixture549();let live;
 try{
  live=await launch549(f);const page=await live.context.newPage();await start549(page,f);
  for(const width of [1280,390]){await page.setViewportSize({width,height:900});await page.locator('.skip-link').focus();const measured=await page.evaluate(()=>{const link=document.querySelector('.skip-link').getBoundingClientRect(),heading=document.querySelector('header strong').getBoundingClientRect();return {overlap:link.left<heading.right&&link.right>heading.left&&link.top<heading.bottom&&link.bottom>heading.top,visible:link.width>0&&link.height>0&&link.left>=0&&link.right<=innerWidth};});assert.equal(measured.overlap,false,'PAN549_OBSERVED_FOCUSED_SKIP_LINK_MUST_NOT_HIDE_HEADING');assert.equal(measured.visible,true);await screenshot549(page,width+'-focus-skip-link-without-header-overlap',f,live.browser);await page.locator('.skip-link').press('Enter');await page.waitForFunction(()=>document.activeElement?.id==='shell.main');}f.unchanged();
 }finally{await live?.context.close();await f.close();}
});
