import assert from 'node:assert/strict';
import {mkdirSync,realpathSync,lstatSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {nativeFixture527} from '../pan527/helpers.mjs';
import {financeFixture} from '../pan519/native-fixture.mjs';
import {nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
import {createNativeErvReadAdapterV1} from '../../src/pan541/native-erv-read-adapter.mjs';
import {enableWorkspaceBrowserV1} from '../../src/pan541/workspace-browser.mjs';
import {initializeNativeErvHumanBackendV1,createNativeErvHumanBackendV1} from '../../src/pan542/native-human-backend.mjs';
import {createNativeNotificationsV1} from '../../src/pan544/native-notifications.mjs';
import {createWorkspaceModuleViewStoreV1} from '../../src/pan543/profile-store.mjs';
import {nativeWorkspaceViewFieldsV1} from '../../src/pan546/native-data-catalog.mjs';
import {pan441EmployeeProfileV1} from '../../dist/packages/contracts/src/pan441-employee-profile.js';
import {bindRuntimeTemplateV1} from '../../src/pan529/runtime-template-contract.mjs';
import {protectedGuidedOwnerContextV1} from '../../src/pan527/origin-session-adapter.mjs';
import {createAgentConfigurationDraftStoreV1} from '../../src/pan563/draft-store.mjs';
export async function nativeViewBrowserFixture546({subjectId='synthetic:erv-reader',humanDecisions=false,notifications=false,agentRuns=false,invoiceNavigation=false,configurationDrafts=false,modelConnections=undefined}={}){
 assert.ok(process.env.PAN527_BROWSER_MODULE&&process.env.PAN527_CERTUTIL&&process.env.PAN546_BROWSER_EVIDENCE,'PAN546 requires owned actual Chromium, CA and evidence; never skip');
 const tls=await nativeFixture527();let native,workspace,browser,store,notificationService,configuration;
 try{
  native=await financeFixture();const sessions=tls.gateway.sessionAdapter('tenant-a'),root=tls.tenants[0].productRoot;
  initializeNativeErvHumanBackendV1({root:native.root,owner:'LOCAL_SYNTHETIC_OWNER',sessionBinding:sessions.binding});
  const human=createNativeErvHumanBackendV1({root:native.root,sessions});
  if(notifications){notificationService=createNativeNotificationsV1({root:native.root,sessions,catalog:()=>[{id:'pan.erv',version:'1.0.0',state:'AVAILABLE'}]});const issued=sessions.issueOwnerSession({subjectId:'synthetic:erv-reviewer',role:'reviewer',expiresAtMs:Date.now()+180000}),headers={cookie:issued.cookieHeader,origin:tls.origin,'x-pan527-csrf':issued.csrf},p=human.read(headers,{invoiceId:'AP-PAN516-MATCHED-01'});human.decide(headers,{schemaVersion:'pansphaira.erv-human/decision/v1',invoiceId:p.invoiceId,effectId:'synthetic:pan546-native-hint-seed-review',transportId:'synthetic:pan546-native-hint-seed-wire',expectedNativeRevision:p.nativeRevision,expectedProposalRevision:p.proposalRevision,proposalDigest:p.proposalDigest,action:'REVIEW'});notificationService.publishNativeEvent(headers,{invoiceId:p.invoiceId});}
  const reader=createNativeErvReadAdapterV1({tenantId:'tenant-a',root:native.root});
  if(configurationDrafts){const owner=protectedGuidedOwnerContextV1(tls.gateway,{optIn:true,tenantId:'tenant-a',origin:tls.origin,identityDigest:sessions.binding.identityDigest}),path=join(owner.productRoot,'configuration-drafts');mkdirSync(path,{mode:0o700});configuration=createAgentConfigurationDraftStoreV1({root:path,profile:pan441EmployeeProfileV1(),template:bindRuntimeTemplateV1(owner.identity)});}
  workspace=enableWorkspaceBrowserV1({optIn:true,gateway:tls.gateway,tenantId:'tenant-a',origin:tls.origin,nativeReader:reader,contextSelection:true,moduleViews:{schemaVersion:'pansphaira.workspace-native-module-views/owner-v1',humanRoot:native.root},humanDecisions,agentRuns,invoiceNavigation,...(modelConnections===undefined?{}:{modelConnections}),...(configuration?{configurationDrafts:configuration}:{}),...(notificationService?{notifications:notificationService}:{})});
  store=createWorkspaceModuleViewStoreV1({root,fields:nativeWorkspaceViewFieldsV1});
  const home=join(tls.root,'browser-home'),nss=join(home,'.pki/nssdb');mkdirSync(nss,{recursive:true,mode:0o700});
  execFileSync(process.env.PAN527_CERTUTIL,['-N','--empty-password','-d','sql:'+nss],{stdio:'ignore'});
  execFileSync(process.env.PAN527_CERTUTIL,['-A','-d','sql:'+nss,'-n','PAN546 isolated native test CA','-t','CT,C,C','-i',tls.options.tls.certPath],{stdio:'ignore'});
  const env={...process.env,HOME:home};if(process.env.PAN546_LIVE_CHROMIUM_TEMP_FD){const owned=process.env.PAN546_OWNED_CHROMIUM_TEMP,alias=process.env.PAN546_LIVE_CHROMIUM_TEMP_FD,s=lstatSync(owned);assert.ok(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===process.getuid()&&(s.mode&0o777)===0o700&&realpathSync(alias)===owned&&/^\/proc\/[0-9]+\/fd\/[0-9]+$/.test(alias),'PAN546 actual owned Chromium temp custody');env.TMPDIR=alias;}
  const{chromium}=await import(process.env.PAN527_BROWSER_MODULE);browser=await chromium.launch({headless:true,env,args:['--no-proxy-server','--disable-background-networking']});
  const context=await browser.newContext({ignoreHTTPSErrors:false,viewport:{width:1280,height:900}});
  await context.route('**/*',route=>new URL(route.request().url()).origin===tls.origin?route.continue():route.abort());
  assert.ok(['synthetic:erv-reader','synthetic:erv-reviewer','synthetic:erv-approver'].includes(subjectId),'PAN546 existing native subject mapping only');let issuedSession;
  async function login(nextSubject=subjectId){assert.ok(['synthetic:erv-reader','synthetic:erv-reviewer','synthetic:erv-approver'].includes(nextSubject),'PAN546 no new native role mapping');const issued=sessions.issueOwnerSession({subjectId:nextSubject,role:nextSubject==='synthetic:erv-reader'?'reader':'reviewer',expiresAtMs:Date.now()+180000});issuedSession=issued;await context.addCookies([{name:'__Host-pan527-session',value:issued.cookieHeader.split('=')[1],url:tls.origin,secure:true,httpOnly:true,sameSite:'Strict'}]);return sessions.authenticate({cookie:issued.cookieHeader});}
  let principal=await login();const page=await context.newPage();page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(15000);
  const errors=[],requests=[],responses=[],network=[],responsePending=new Set();page.on('pageerror',e=>errors.push(e.message));
  tls.gateway.server.prependListener('request',(request,response)=>{if(!request.url.includes('/workspace/module-view'))return;const entry={path:request.url,method:request.method,receivedAt:Date.now(),contentType:request.headers['content-type'],contentLength:request.headers['content-length'],origin:request.headers.origin};network.push(entry);response.once('finish',()=>{entry.finishedAt=Date.now();entry.status=response.statusCode;});response.once('close',()=>{entry.closedAt=Date.now();});});
  page.on('requestfailed',r=>{if(r.url().includes('/workspace/module-view'))network.push({path:new URL(r.url()).pathname,browserFailure:r.failure()?.errorText,at:Date.now()});});
  page.on('request',r=>{if(new URL(r.url()).pathname.match(/\/workspace\/(?:module-view|model-connection|agent-run|invoice-navigation|configuration|context-selection|erv-human|notifications|profile)/))requests.push({method:r.method(),path:new URL(r.url()).pathname,body:r.method()==='POST'?r.postDataJSON():null});});
  page.on('response',r=>{if(new URL(r.url()).pathname.match(/\/workspace\/(?:module-view|model-connection|agent-run|invoice-navigation|configuration|context-selection|erv-human|notifications|profile)/)&&!r.url().endsWith('/app.js')){const entry={method:r.request().method(),path:new URL(r.url()).pathname,status:r.status(),value:null};responses.push(entry);const p=(async()=>{try{const value=await r.json();if(Object.hasOwn(value,'csrfProof'))value.csrfProof=value.csrfProof===null?null:'[REDACTED_SESSION_CSRF]';entry.value=value;}catch(error){entry.bodyReadFailure=error.message;/* Metadata is a real response, never an invented receipt or outcome. */}})();responsePending.add(p);void p.finally(()=>responsePending.delete(p));}});
  return {tls,native,root,sessions,reader,human,notificationService,context,page,errors,requests,responses,network,session:()=>issuedSession,readPersisted:()=>store.read(principal),readConfiguration:()=>configuration?.read(principal),async flushResponses(){await Promise.all([...responsePending]);},business(){return JSON.stringify({erv:nativeRows(native.root,'SELECT revision,effect_key,command,event FROM pan516_events ORDER BY revision'),human:nativeRows(native.root,'SELECT * FROM pan542_events ORDER BY rowid')});},async relogin(nextSubject){principal=await login(nextSubject);},async close(){await browser?.close();store?.close();workspace?.close();configuration?.close();notificationService?.close();native?.close();tls.gateway.server.closeAllConnections();await tls.close();}};
 }catch(error){await browser?.close();store?.close();workspace?.close();configuration?.close();notificationService?.close();native?.close();tls.gateway.server.closeAllConnections();await tls.close();throw error;}
}
