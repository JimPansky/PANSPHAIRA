import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { draftWorkspaceFixture } from './helpers.mjs';
import { assertPhysicalCaptureCoverageV1, pngDimensionsV1 } from './capture-coverage.mjs';
import { captureFullNativeViewV1 } from './native-view-capture.mjs';
import { nativeRows } from '../fixtures/pan515/native-trade-fixture.mjs';
const goal='Ziel und Zweck der begrenzten Mitarbeiterassistenz';
const readback=page=>page.evaluate(async()=>{const r=await fetch(location.pathname+'/configuration',{cache:'no-store'});return {status:r.status,value:await r.json()};});
const ready=page=>page.locator('[data-backend="configuration"][data-outcome="READBACK_RECEIVED"], [data-backend="configuration"][data-outcome="EMPTY"]').waitFor();

test('A2 browser action -> actual protected backend -> persisted identical readback; two tabs, login/restart, desktop/390/zoom/focus and failure states',async()=>{
  assert.ok(process.env.PAN563_BROWSER_EVIDENCE && process.env.PAN527_CERTUTIL,'owned browser screenshot directory and certutil are mandatory, never skipped');
  const evidence=process.env.PAN563_BROWSER_EVIDENCE;mkdirSync(evidence,{recursive:true});
  const f=await draftWorkspaceFixture();let browser,context;const shots=[];const requests=[];const errors=[];
  try{
    const before=JSON.stringify(nativeRows(f.native.root,'SELECT revision,effect_key,command,event FROM pan516_events ORDER BY revision'));
    const home=join(f.root,'browser-home');const nss=join(home,'.pki/nssdb');mkdirSync(nss,{recursive:true,mode:0o700});
    execFileSync(process.env.PAN527_CERTUTIL,['-N','--empty-password','-d','sql:'+nss]);
    execFileSync(process.env.PAN527_CERTUTIL,['-A','-d','sql:'+nss,'-n','PAN563 isolated test CA','-t','CT,C,C','-i',f.options.tls?.certPath ?? join(f.root,'tls.crt')]);
    const extension=fileURLToPath(new URL('./zoom-extension/',import.meta.url));
    context=await chromium.launchPersistentContext(join(f.root,'chromium-profile'),{channel:'chromium',headless:true,env:{...process.env,HOME:home},
      args:['--no-proxy-server','--disable-background-networking','--disable-extensions-except='+extension,'--load-extension='+extension],ignoreHTTPSErrors:false,viewport:{width:1280,height:900}});
    browser=context.browser();
    const zoomWorker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
    await context.route('**/*',route=>new URL(route.request().url()).origin === f.origin ? route.continue() : route.abort());
    const issue=(expiresAtMs=Date.now()+300000)=>f.gateway.sessionAdapter('tenant-a').issueOwnerSession({subjectId:'synthetic-draft-browser',role:'reader',expiresAtMs});
    async function login(expiresAtMs){const issued=issue(expiresAtMs);await context.addCookies([{name:'__Host-pan527-session',value:issued.cookieHeader.split('=')[1],url:f.origin,secure:true,httpOnly:true,sameSite:'Strict'}]);}
    await login();
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({method:r.method(),path:new URL(r.url()).pathname,body:r.postData()}));
    const url=f.origin+'/t/tenant-a/workspace#/workspace/configuration';
    let browserZoom=1;
    async function setNativeZoom(factor){
      browserZoom=await zoomWorker.evaluate(async({url,factor})=>{const tabs=await chrome.tabs.query({});const tab=tabs.find(t=>t.url===url);if(!tab)throw new Error('PAN563_LOCAL_ZOOM_TAB_MISSING');await chrome.tabs.setZoom(tab.id,factor);return chrome.tabs.getZoom(tab.id);},{url,factor});
      assert.equal(browserZoom,factor);
      await page.waitForFunction(factor=>Math.abs(devicePixelRatio-factor)<0.01,factor);
    }
    async function shot(name,p=page,read=true){
      await p.mouse.move(0,0);
      const priorScroll=await p.evaluate(()=>({x:scrollX,y:scrollY}));await p.evaluate(()=>scrollTo(0,0));
      const state=await p.evaluate(async()=>{const r=await fetch(location.pathname+'/context');const c=r.status === 200?await r.json():null;return {viewport:{width:innerWidth,height:innerHeight},document:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},visualViewport:{width:visualViewport.width,height:visualViewport.height,scale:visualViewport.scale},scroll:{x:scrollX,y:scrollY},dpr:devicePixelRatio,cssZoom:document.documentElement.style.zoom||'1',hash:location.hash,contextRevision:c?.revision??null,sessionBinding:c?'[REDACTED]':null,outcome:document.querySelector('[data-backend="configuration"]')?.getAttribute('data-outcome'),focus:document.activeElement?.outerHTML.slice(0,250)};});
      const nativeZoom=await zoomWorker.evaluate(async url=>{const tab=(await chrome.tabs.query({})).find(t=>t.url===url);if(!tab)throw new Error('PAN563_LOCAL_ZOOM_TAB_MISSING');return chrome.tabs.getZoom(tab.id);},p.url());
      const session=await context.newCDPSession(p);let metrics;
      try{metrics=await session.send('Page.getLayoutMetrics');}finally{await session.detach();}
      const r=read?await readback(p):null;const file=join(evidence,name+'.png');
      const captured=await captureFullNativeViewV1(p,context,{...state,nativeZoom},metrics,evidence,name);writeFileSync(file,captured.bytes);
      const bytes=captured.bytes;const pin={file,name,...state,browserZoom,nativeZoom,nativeZoomMethod:'chrome.tabs.getZoom in isolated test-only extension',capture:captured.method,tiles:captured.tiles,coveredRows:captured.coveredRows,priorScroll,cdpMetrics:metrics,png:pngDimensionsV1(bytes),readbackStatus:r?.status??null,draftRevision:r?.value.revision??null,configurationDigest:r?.value.configurationDigest??null,sha256:createHash('sha256').update(bytes).digest('hex')};
      writeFileSync(join(evidence,name+'.capture.json'),JSON.stringify(pin,null,2)+'\n');
      const coverage=assertPhysicalCaptureCoverageV1(bytes,{...state,nativeZoom},metrics);
      if(nativeZoom !== 1){
        async function compareViewport(referenceFile){
          const view=await p.evaluate(()=>({scroll:{x:scrollX,y:scrollY},dpr:devicePixelRatio}));
          const physicalY=Math.round(view.scroll.y*view.dpr);
          const viewportSession=await context.newCDPSession(p);let reference;
          try{const raw=await viewportSession.send('Page.captureScreenshot',{format:'png',fromSurface:false,captureBeyondViewport:false});reference=Buffer.from(raw.data,'base64');writeFileSync(referenceFile,reference);}finally{await viewportSession.detach();}
          const viewportPng=pngDimensionsV1(reference);assert.equal(viewportPng.width,pin.png.width);assert.ok(physicalY+viewportPng.height<=pin.png.height+1);
          const raster=await p.evaluate(async({full,reference,width,height,physicalY})=>{
            const decode=async value=>createImageBitmap(new Blob([Uint8Array.from(atob(value),c=>c.charCodeAt(0))],{type:'image/png'}));
            const a=await decode(full),b=await decode(reference);const ca=new OffscreenCanvas(width,height),cb=new OffscreenCanvas(width,height);
            const aa=ca.getContext('2d'),bb=cb.getContext('2d');aa.drawImage(a,0,-physicalY);bb.drawImage(b,0,0);
            const av=aa.getImageData(0,0,width,height).data,bv=bb.getImageData(0,0,width,height).data;let differentChannels=0;
            for(let i=0;i<av.length;i++)if(av[i]!==bv[i])differentChannels++;
            a.close();b.close();return {width,height,physicalY,comparedChannels:av.length,differentChannels};
          },{full:bytes.toString('base64'),reference:reference.toString('base64'),physicalY,...viewportPng});
          assert.equal(raster.differentChannels,0,'PAN563_NATIVE_VIEWPORT_RASTER_MISMATCH '+JSON.stringify(raster));
          return {file:referenceFile,png:viewportPng,scroll:view.scroll,sha256:createHash('sha256').update(reference).digest('hex'),raster};
        }
        pin.viewportReference=await compareViewport(join(evidence,name+'.viewport-reference.png'));
        const editorTop=await p.evaluate(()=>{const e=document.querySelector('.configuration-editor');if(!e)throw new Error('PAN563_EDITOR_CAPTURE_TARGET_REQUIRED');return e.getBoundingClientRect().top+scrollY;});
        await p.evaluate(y=>scrollTo(0,y),editorTop);
        pin.configurationViewportReference=await compareViewport(join(evidence,name+'.configuration-viewport-reference.png'));
        await p.evaluate(()=>scrollTo(0,0));
        const after=await p.evaluate(()=>({viewport:{width:innerWidth,height:innerHeight},dpr:devicePixelRatio,cssZoom:document.documentElement.style.zoom||'1',scroll:{x:scrollX,y:scrollY}}));
        assert.deepEqual(after,{viewport:state.viewport,dpr:state.dpr,cssZoom:state.cssZoom,scroll:state.scroll});
        pin.geometryUnchangedAfterCapture=after;
      }
      shots.push({...pin,coverage});writeFileSync(join(evidence,name+'.capture.json'),JSON.stringify({...pin,coverage},null,2)+'\n');
      await p.evaluate(({x,y})=>scrollTo(x,y),priorScroll);

    }
    // Pause a real request, not a synthetic response, to inspect the loading UI.
    let release;const gate=new Promise(r=>{release=r;});
    await page.route('**/workspace/configuration',async route=>{if(route.request().method()==='GET'){await gate;await route.continue();}else await route.continue();});
    await page.goto(url);await page.locator('[data-backend="configuration"][data-outcome="LOADING"]').waitFor();
    await page.locator('[data-profile-state="READY"]').waitFor();await shot('desktop-loading',page,false);
    release();await ready(page);await page.unroute('**/workspace/configuration');
    await page.locator('[data-profile-state="READY"]').waitFor(); // Existing Main profile bootstrap must finish, not arbitrary delay or prewarming.
    assert.equal(await page.evaluate(()=>window.isSecureContext),true);assert.equal(await page.evaluate(()=>document.cookie),'');
    assert.match(await page.locator('.configuration-draft').getByRole('status').innerText(),/Noch kein gespeicherter Entwurf/);
    await shot('desktop-empty');
    await page.setViewportSize({width:390,height:844});await shot('390-empty-editor');await layout();
    await page.setViewportSize({width:1280,height:900});await page.evaluate(()=>{document.documentElement.style.zoom='2';});await shot('desktop-css-200-empty-editor');await layout();await page.evaluate(()=>{document.documentElement.style.zoom='1';});
    await setNativeZoom(2);await shot('desktop-browser-200-empty-editor');const nativeEmpty=await layout();assert.ok(nativeEmpty.viewport<=641);await setNativeZoom(1);
    assert.equal(await page.locator('.configuration-editor select').count(),1);
    await page.getByRole('combobox',{name:goal,exact:true}).selectOption(JSON.stringify('employee.business.help'));
    // Modify only the outgoing browser request; the actual backend performs the denial.
    await page.route('**/workspace/configuration',route=>route.request().method()==='POST'?route.continue({postData:JSON.stringify({...JSON.parse(route.request().postData()),source:'POLICY'})}):route.continue());
    await page.getByRole('button',{name:'Bestätigen und Entwurf speichern',exact:true}).click();await page.locator('[data-outcome="ERROR"]').waitFor();
    assert.match(await page.locator('.configuration-draft').getByRole('status').innerText(),/CONFIGURATION_SCHEMA_DENIED/);assert.equal((await readback(page)).value.revision,0);
    await shot('desktop-source-spoof-denied');await page.unroute('**/workspace/configuration');
    await page.getByRole('button',{name:'Bestätigen und Entwurf speichern',exact:true}).focus();
    await page.keyboard.press('Enter');await page.locator('[data-backend="configuration"][data-outcome="PERSISTED"]').waitFor();
    assert.equal(await page.locator('.configuration-editor fieldset').count(),1);
    const focusPin=await page.evaluate(()=>({active:{tag:document.activeElement?.tagName,id:document.activeElement?.id,type:document.activeElement?.getAttribute('type')},checkboxes:[...document.querySelectorAll('.configuration-editor input')].map(e=>({type:e.type,disabled:e.disabled,visible:!!e.getClientRects().length,ancestors:(()=>{const a=[];for(let n=e;n;n=n.parentElement){const s=getComputedStyle(n);a.push({tag:n.tagName,id:n.id,class:n.className,hidden:n.hidden,display:s.display,visibility:s.visibility,contentVisibility:s.contentVisibility,rect:n.getBoundingClientRect().toJSON(),connected:n.isConnected});}return a;})()})),mainHidden:document.getElementById('shell.main').hidden,profileState:document.querySelector('[data-profile-state]')?.getAttribute('data-profile-state')}));
    writeFileSync(join(evidence,'configuration-save-focus-pin.json'),JSON.stringify(focusPin,null,2)+'\n');
    assert.equal(focusPin.active.type,'checkbox');
    // Programmatic DOM focus event -> unchanged Main authority GET/context
    // revalidation -> actual presentation projection. No fake backend receipt.
    const projected=await page.evaluate(()=>new Promise(resolve=>{
      const canvas=document.getElementById('profile.canvas');const observer=new MutationObserver(()=>{
        observer.disconnect();resolve({focusType:document.activeElement?.getAttribute('type'),focusInConfiguration:!!document.activeElement?.closest('.configuration-draft')});
      });observer.observe(canvas,{childList:true});window.dispatchEvent(new Event('focus'));
    }));
    writeFileSync(join(evidence,'profile-projection-focus-observation.json'),JSON.stringify({path:'DOM focus event -> real Main profile/context GET -> presentation projection',...projected},null,2)+'\n');
    assert.deepEqual(projected,{focusType:'checkbox',focusInConfiguration:true},'Main presentation authority read must not discard focus in the live configuration answer');
    await page.getByRole('button',{name:'Bestätigen und Entwurf speichern',exact:true}).click();
    await page.getByRole('heading',{name:'Keine fehlenden Pflichtfragen'}).waitFor();
    const saved=await readback(page);assert.equal(saved.status,200);assert.equal(saved.value.revision,2);assert.equal(saved.value.persisted,true);assert.equal(saved.value.outcome,'RESOLVED');
    assert.ok(requests.some(r=>r.method==='POST'&&r.path.endsWith('/workspace/configuration')));
    await shot('desktop-resolved');
    await page.reload();await ready(page);assert.deepEqual((await readback(page)).value,saved.value);
    await f.restartDraftBackend();await page.getByRole('button',{name:'Aktuellen Entwurf neu laden',exact:true}).click();await ready(page);assert.deepEqual((await readback(page)).value,saved.value);
    const tab=await context.newPage();await tab.goto(url);await ready(tab);
    await page.getByRole('button',{name:'Bearbeiten: Sprache der Arbeitsoberfläche',exact:true}).click();
    await page.getByRole('combobox',{name:'Sprache der Arbeitsoberfläche',exact:true}).selectOption(JSON.stringify('en-GB'));
    await page.getByRole('button',{name:'Bestätigen und Entwurf speichern',exact:true}).click();await page.locator('[data-outcome="PERSISTED"]').waitFor();
    let newest=(await readback(page)).value;assert.equal(newest.revision,3);
    await tab.getByRole('button',{name:'Bearbeiten: '+goal,exact:true}).click();await tab.getByRole('combobox',{name:goal,exact:true}).selectOption(JSON.stringify('employee.directory.summary'));
    await tab.getByRole('button',{name:'Bestätigen und Entwurf speichern',exact:true}).click();await tab.locator('[data-outcome="CONFLICT"]').waitFor();
    assert.deepEqual((await readback(page)).value,newest);assert.equal(await tab.getByRole('combobox',{name:goal,exact:true}).inputValue(),JSON.stringify('employee.directory.summary'));
    await shot('desktop-conflict',tab);await tab.close();
    await page.getByRole('button',{name:'Ohne KI fortfahren',exact:true}).click();await page.locator('[data-outcome="PERSISTED"]').waitFor();
    newest=(await readback(page)).value;assert.equal(newest.revision,4);assert.equal(newest.outcome,'RESOLVED');assert.equal(newest.configuration.parameters['model.reference'],'NONE');
    assert.equal(newest.configuration.parameters['model.maxTokens'],null);assert.equal(newest.configuration.parameters['budget.modelUnits'],null);assert.equal(newest.authorityContext.executionAuthorityGranted,false);
    assert.equal(await page.getByRole('button',{name:'Ohne KI fortfahren',exact:true}).isDisabled(),true);await shot('desktop-model-less');
    // Let the original HTTPS handler commit the real browser POST, then drop
    // only its successful response socket. No route/API/TLS bypass or fake receipt.
    await page.getByRole('button',{name:'Bearbeiten: Zeitzone des geplanten Arbeitsplatzes',exact:true}).click();
    await page.getByRole('combobox',{name:'Zeitzone des geplanten Arbeitsplatzes',exact:true}).selectOption(JSON.stringify('Europe/Berlin'));
    const postCount=requests.filter(r=>r.method==='POST'&&r.path.endsWith('/workspace/configuration')).length;
    let interruptedResponses=0;
    const loseResponse=(request,response)=>{if(request.method==='POST'&&request.url==='/t/tenant-a/workspace/configuration'){
      const end=response.end.bind(response);response.end=function(...args){if(this.statusCode===200){interruptedResponses++;this.flushHeaders();this.write(args[0].slice(0,32),()=>request.socket.destroy());return this;}return end(...args);};
    }};
    f.gateway.server.on('request',loseResponse);
    await page.getByRole('button',{name:'Bestätigen und Entwurf speichern',exact:true}).click();await page.locator('[data-outcome="OUTCOME_UNKNOWN"]').waitFor({timeout:10000}).catch(async error=>{console.log('RESPONSE_LOSS_DIAGNOSTIC '+JSON.stringify({interruptedResponses,outcome:await page.locator('[data-backend="configuration"]').getAttribute('data-outcome'),readback:(await readback(page)).value.revision}));throw error;});
    assert.equal(interruptedResponses,1);
    assert.equal(requests.filter(r=>r.method==='POST'&&r.path.endsWith('/workspace/configuration')).length,postCount+1);
    assert.equal(await page.getByRole('button',{name:'Bestätigen und Entwurf speichern',exact:true}).isDisabled(),true);
    assert.equal(await page.getByRole('button',{name:'Aktuellen Entwurf neu laden',exact:true}).isDisabled(),false);
    newest=(await readback(page)).value;assert.equal(newest.revision,5);assert.equal(newest.draft.fields['context.timezone'].value,'Europe/Berlin');
    await shot('desktop-response-loss-unknown');f.gateway.server.removeListener('request',loseResponse);
    await page.getByRole('button',{name:'Aktuellen Entwurf neu laden',exact:true}).click();await ready(page);assert.deepEqual((await readback(page)).value,newest);
    await page.setViewportSize({width:390,height:844});await shot('390-resolved');
    async function layout(){const d=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,controls:[...document.querySelectorAll('.configuration-draft button,.configuration-draft select,.configuration-draft input')].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return {x:r.x,right:r.right,width:r.width,height:r.height,label:e.textContent};})}));assert.ok(d.width<=d.viewport,JSON.stringify(d));assert.ok(d.controls.every(c=>c.x>=0&&c.right<=d.viewport+1&&c.width>0&&c.height>0),JSON.stringify(d));return d;}
    const mobile=await layout();
    const skip=page.getByRole('link',{name:'Zum Arbeitsbereich',exact:true});await skip.focus();await skip.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement?.id),'shell.main');
    await page.setViewportSize({width:1280,height:900});await page.evaluate(()=>{document.documentElement.style.zoom='2';});await shot('desktop-css-200-percent');const zoom=await layout();
    await page.evaluate(()=>{document.documentElement.style.zoom='1';});
    await setNativeZoom(2);await shot('desktop-browser-200-percent');const nativeZoom=await layout();assert.ok(nativeZoom.viewport<=641);await setNativeZoom(1);
    await page.route('**/workspace/configuration',route=>route.abort('failed'));
    await page.getByRole('button',{name:'Aktuellen Entwurf neu laden',exact:true}).click();await page.locator('[data-outcome="ERROR"]').waitFor();
    await shot('desktop-network-error',page,false);await page.unroute('**/workspace/configuration');
    await page.getByRole('button',{name:'Aktuellen Entwurf neu laden',exact:true}).click();await ready(page);
    await page.getByRole('button',{name:'Abmelden',exact:true}).click();await page.getByRole('heading',{name:'Abgemeldet',exact:true}).waitFor();
    await login();await page.reload();await ready(page);assert.deepEqual((await readback(page)).value,newest);
    // Actual server revocation followed by an actual reload action exercises denial.
    await page.evaluate(async()=>{await fetch(location.pathname+'/logout',{method:'POST'});});
    await page.getByRole('button',{name:'Aktuellen Entwurf neu laden',exact:true}).click();await page.locator('[data-outcome="DENIED"]').waitFor();
    await shot('desktop-denied');assert.equal(await page.locator('.configuration-parameters').count(),0);assert.equal(await page.locator('.configuration-editor form').count(),0);
    const expiresAtMs=Date.now()+3000;await login(expiresAtMs);await page.reload();await ready(page);
    await new Promise(resolve=>setTimeout(resolve,Math.max(0,expiresAtMs-Date.now()+25)));
    await page.getByRole('button',{name:'Aktuellen Entwurf neu laden',exact:true}).click();await page.locator('[data-outcome="DENIED"]').waitFor();
    await shot('desktop-expired-session');assert.equal((await readback(page)).status,401);assert.equal(await page.locator('.configuration-parameters').count(),0);
    assert.equal(JSON.stringify(nativeRows(f.native.root,'SELECT revision,effect_key,command,event FROM pan516_events ORDER BY revision')),before);assert.deepEqual(errors,[]);
    const binding={head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),buildSha256:createHash('sha256').update(readFileSync(new URL('../../dist/browser-workspace/app.js',import.meta.url))).digest('hex'),browser:browser.version(),tenant:'tenant-a',subject:'synthetic-draft-browser',nativeHistoryUnchanged:true,shots,requests,layout:{mobile,css200:zoom,native200:nativeZoom,native200Editor:nativeEmpty},browserZoomMethod:'native chrome.tabs.setZoom/getZoom in test-only isolated extension; no emulated viewport/CSS claim',visualReview:'NOT_RUN_NO_IMAGE_VIEWER_TOOL; screenshots and DOM geometry are not visual acceptance'};
    writeFileSync(join(evidence,'browser-evidence.json'),JSON.stringify(binding,null,2)+'\n');console.log(JSON.stringify(binding));
  }finally{await context?.close();await browser?.close();await f.close();}
});
