import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync,lstatSync,realpathSync,openSync,fstatSync,closeSync,constants} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {nativeFixture527,request527} from '../pan527/helpers.mjs';
import {financeFixture} from '../pan519/native-fixture.mjs';
import {nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
import {createNativeAnalysisReadAdapterV1} from '../../src/pan549/native-analysis-read.mjs';
import {createNativeErvReadAdapterV1} from '../../src/pan541/native-erv-read-adapter.mjs';
import {enableWorkspaceBrowserV1} from '../../src/pan541/workspace-browser.mjs';
import {UsageInsightsLocalServiceV1} from '../../dist/packages/usage-insights/src/index.js';
export const cutoff549='2026-06-30T23:59:59+02:00';
export async function browserFixture549({cohort='SUPPRESSED',analysis=true,diagnostic=false}={}){
 const tls=await nativeFixture527();let native,workspace;
 try{
  native=await financeFixture();const history=JSON.stringify(nativeRows(native.root,'SELECT revision,command,event FROM pan515_events ORDER BY revision'));
  const store=join(native.parent,'owned-browser-usage.json'),usage=UsageInsightsLocalServiceV1.open(store);
  if(cohort==='SUPPRESSED'){usage.grant('basic');assert.equal(usage.record({capabilityId:'capability.gateway',lifecycleOutcome:'INSTALL_STARTED'}).outcome,'ACCEPTED');}
  else assert.ok(cohort==='EMPTY'||cohort===null);
  const sessions=tls.gateway.sessionAdapter('tenant-a');const reader=createNativeAnalysisReadAdapterV1({optIn:true,root:native.root,sessions,...(cohort===null?{}:{usageInsightsStore:store})});
  const mount=()=>enableWorkspaceBrowserV1({optIn:true,gateway:tls.gateway,tenantId:'tenant-a',origin:tls.origin,nativeReader:createNativeErvReadAdapterV1({tenantId:'tenant-a',root:native.root}),diagnosticPlugins:diagnostic,...(analysis?{analysisReader:reader}:{})});workspace=mount();
  function issue(role='reader',duration=300000){return sessions.issueOwnerSession({subjectId:'synthetic:analysis-browser-'+role,role,expiresAtMs:Date.now()+duration});}
  return {tls,native,sessions,reader,usage,history,issue,unmount(){workspace.close();},mount(){workspace=mount();},unchanged(){assert.equal(JSON.stringify(nativeRows(native.root,'SELECT revision,command,event FROM pan515_events ORDER BY revision')),history);assert.equal(usage.consentStatus().networkMode,'OFF');},async close(){workspace?.close();native?.close();await tls.close();}};
 }catch(e){workspace?.close();native?.close();await tls.close();throw e;}
}
export async function launch549(f){
 assert.ok(process.env.PAN527_BROWSER_MODULE&&process.env.PAN527_CERTUTIL&&process.env.PAN549_BROWSER_EVIDENCE,'PAN549_REAL_OWNED_BROWSER_REQUIRED_NO_SKIP');
 const {chromium}=await import(process.env.PAN527_BROWSER_MODULE);
 const home=join(f.tls.root,'browser-home'),nss=join(home,'.pki/nssdb');mkdirSync(nss,{recursive:true,mode:0o700});
 execFileSync(process.env.PAN527_CERTUTIL,['-N','--empty-password','-d','sql:'+nss],{stdio:'ignore'});
 execFileSync(process.env.PAN527_CERTUTIL,['-A','-d','sql:'+nss,'-n','PAN549 isolated synthetic native CA','-t','CT,C,C','-i',f.tls.options.tls.certPath],{stdio:'ignore'});
 const owned=join(f.tls.root,'chromium-temp');mkdirSync(owned,{mode:0o700});const st=lstatSync(owned);
 assert.ok(st.isDirectory()&&!st.isSymbolicLink()&&st.uid===process.getuid()&&(st.mode&0o777)===0o700&&realpathSync(owned)===owned,'PAN549_BROWSER_TEMP_CUSTODY_DENIED');
 const fd=openSync(owned,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW),alias='/proc/'+process.pid+'/fd/'+fd;let context,closed=false;
 const release=()=>{if(!closed){closeSync(fd);closed=true;}};
 try{const d=fstatSync(fd);assert.ok(d.isDirectory()&&d.dev===st.dev&&d.ino===st.ino&&realpathSync(alias)===owned,'PAN549_BROWSER_TEMP_DESCRIPTOR_DENIED');context=await chromium.launchPersistentContext(join(f.tls.root,'chromium-profile'),{channel:'chromium',headless:true,env:{...process.env,HOME:home,TMPDIR:alias},args:['--no-proxy-server','--disable-background-networking'],ignoreHTTPSErrors:false,viewport:{width:1280,height:900}});}catch(e){release();throw e;}
 const actualClose=context.close.bind(context);context.close=async(...args)=>{try{return await actualClose(...args);}finally{release();}};
 await context.route('**/*',route=>new URL(route.request().url()).origin===f.tls.origin?route.continue():route.abort());
 async function login(who=f.issue()){await context.addCookies([{name:'__Host-pan527-session',value:who.cookieHeader.split('=')[1],url:f.tls.origin,secure:true,httpOnly:true,sameSite:'Strict'}]);return who;}
 try{const who=await login();return {context,browser:context.browser(),who,login};}catch(e){await context.close();throw e;}
}
export async function forward549(f,route,change=()=>{}){
 const r=route.request(),headers=await r.allHeaders(),selector=r.postDataJSON();delete headers['content-length'];change(selector,headers);
 return request527(f.tls,new URL(r.url()).pathname,headers,r.method(),selector);
}
export async function start549(page,f){
 await page.goto(f.tls.origin+'/t/tenant-a/workspace');await page.locator('[data-backend="setup"][data-outcome="READBACK_RECEIVED"]').waitFor();
}
export async function enter549(page){const button=page.getByRole('button',{name:'Gebundene Bestandsanalyse — nur lesen',exact:true});await button.focus();await button.press('Enter');}
export async function screenshot549(page,name,f,browser,extra={}){
 const evidence=process.env.PAN549_BROWSER_EVIDENCE;assert.ok(evidence);mkdirSync(evidence,{recursive:true,mode:0o700});const file=join(evidence,name+'.png');await page.screenshot({path:file,fullPage:true});
 const dimensions=await page.evaluate(()=>({viewport:{width:innerWidth,height:innerHeight},document:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},cssZoom:document.documentElement.style.zoom||'1',dpr:devicePixelRatio,state:document.querySelector('[data-backend="analysis"]')?.getAttribute('data-outcome')??null,hash:location.hash.replace(/([?&]sessionId=)[^&]*/g,'$1[REDACTED]'),mainFocused:document.activeElement?.id==='shell.main',table:[...document.querySelectorAll('.analysis-table-scroll')].map(e=>({rect:e.getBoundingClientRect().toJSON(),scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,scrollLeft:e.scrollLeft,overflow:getComputedStyle(e).overflowX})),controls:[...document.querySelectorAll('button:not(:disabled),a,input,select,[tabindex="0"]')].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return {label:e.getAttribute('aria-label')??e.textContent,x:r.x,right:r.right,width:r.width,height:r.height};})}));
 const paths=['src/pan549/native-analysis-read.mjs','src/pan527/origin-session-adapter.mjs','src/pan541/workspace-browser.mjs','packages/contracts/src/workspace-analysis-v1.ts','packages/browser-workspace/src/plugin-analysis-v1.ts','packages/browser-workspace/src/analysis-v1.css','packages/browser-workspace/src/app.ts','packages/browser-workspace/src/workspace.css','dist/browser-workspace/app.js','tests/pan549/browser-fixture.mjs','tests/pan549/browser-lifecycle-analysis.test.mjs'];
 const pins=Object.fromEntries(paths.map(path=>[path,createHash('sha256').update(readFileSync(new URL('../../'+path,import.meta.url))).digest('hex')]));
 const receipt={name,file,sha256:createHash('sha256').update(readFileSync(file)).digest('hex'),browser:browser.version(),actualGitHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),actualWorkingTreeDirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),pins,sourceCutoff:cutoff549,nativeRevision:nativeRows(f.native.root,'SELECT MAX(revision) AS revision FROM pan515_events')[0].revision,protectedSession:'[REDACTED]',visualSighted:false,...dimensions,...extra};
 writeFileSync(file+'.json',JSON.stringify(receipt,null,2)+'\n');return dimensions;
}
export async function responsive549(page,name,f,browser,extra={}){
 const observations=[];for(const viewport of [{width:1280,height:900},{width:390,height:844}]){await page.setViewportSize(viewport);const d=await screenshot549(page,viewport.width+'-'+name,f,browser,extra);assert.ok(d.document.width<=d.viewport.width,'PAN549_NATIVE_STATE_GLOBAL_OVERFLOW_'+name);assert.ok(d.controls.length>0&&d.controls.every(c=>c.width>0&&c.height>0&&c.x>=0&&c.right<=d.viewport.width),'PAN549_NATIVE_STATE_CONTROL_CLIPPING_'+name);observations.push(d);}return observations;
}
