import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {nativeViewBrowserFixture546} from '../pan546/browser-fixture.mjs';
import {connectionOptions565,syntheticCredential565} from '../pan565/native-fixture.mjs';
import {syntheticWorkspaceViewChatFeedbackModelV1} from '../../src/pan548/native-agent-run.mjs';
const root='[id="shell.agent-panel"]',view='[id="shell.module-view"]';
const hash=b=>createHash('sha256').update(b).digest('hex');
function evidence(){assert.ok(process.env.PAN548_BROWSER_EVIDENCE,'PAN548 requires actual evidence, never skip');mkdirSync(process.env.PAN548_BROWSER_EVIDENCE,{recursive:true,mode:0o700});return process.env.PAN548_BROWSER_EVIDENCE;}
const count=(f,suffix)=>f.requests.filter(r=>r.path.endsWith('/agent-run/'+suffix)).length;
async function state(f,s){try{await f.page.locator(root+'[data-state="'+s+'"]').waitFor();}catch(error){await f.flushResponses();writeFileSync(join(evidence(),'actual-agent-state-failure-'+s+'-'+Date.now()+'.json'),JSON.stringify({expected:s,body:await f.page.locator('body').innerText(),errors:f.errors,requests:f.requests,responses:f.responses},null,2)+'\n');throw error;}}
async function open(f){await f.page.goto(f.tls.origin+'/t/tenant-a/workspace');await f.page.locator('[id="shell.context-selection"][data-module="pan.setup"][data-state="CURRENT_CONTEXT"]').waitFor();await f.page.locator(root).waitFor();await f.page.getByRole('button',{name:'Eingangsrechnungsprüfung — nur lesen',exact:true}).click();await f.page.locator(view+'[data-state="CURRENT_NATIVE_VIEW"]').waitFor();}
async function select(f){const b=f.page.locator(view).getByRole('button',{name:'Rechnungswert',exact:true});await b.focus();await b.press('Enter');const registered=f.page.getByRole('button',{name:'Kontextauswahl: Persönliches Viewelement: invoice-value',exact:true});await f.page.waitForFunction(()=>document.querySelector('[id="shell.context-selection"] button[aria-pressed="true"]')?.textContent==='Kontextauswahl: Persönliches Viewelement: invoice-value');assert.equal(await registered.getAttribute('aria-pressed'),'true');await f.page.locator(view+'[data-state="CURRENT_NATIVE_VIEW"]').waitFor();await f.flushResponses();const native=f.responses.filter(r=>r.path.endsWith('/context-selection')&&r.method==='POST'&&r.status===200&&r.value?.context?.selection?.rowId==='invoice-value').at(-1);assert.equal(native.value.context.selection.elementId,'pan.erv.module-card');await f.page.locator(root).getByRole('button',{name:'Begrenzten Testauftrag planen',exact:true}).waitFor();}
async function plan(f){await f.page.locator(root).getByRole('button',{name:'Begrenzten Testauftrag planen',exact:true}).click();await state(f,'PLANNED_NOT_DISPATCHED');await f.flushResponses();return f.responses.filter(r=>r.path.endsWith('/agent-run/plan')&&r.status===200).at(-1).value;}
async function run(f){await f.page.locator(root).getByRole('button',{name:'Genau diesen synthetischen Lauf starten',exact:true}).click();await state(f,'RESULT_READY');await f.flushResponses();return f.responses.filter(r=>r.path.endsWith('/agent-run/start')&&r.status===200).at(-1).value;}
async function capture(f,name){const image=join(evidence(),name+'.png');await f.page.screenshot({path:image,fullPage:true});const dimensions=await f.page.evaluate(()=>({viewport:innerWidth,pageWidth:document.documentElement.scrollWidth,zoom:getComputedStyle(document.body).zoom,controls:[...document.querySelectorAll('button,select,textarea,input,a')].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return{label:e.getAttribute('aria-label')??e.textContent,left:r.left,right:r.right,width:r.width,height:r.height};}),panel:(()=>{const r=document.getElementById('shell.agent-panel')?.getBoundingClientRect();return r?{left:r.left,right:r.right,width:r.width,height:r.height}:null;})()}));assert.ok(dimensions.pageWidth<=dimensions.viewport,'PAN548_PANEL_PAGE_HORIZONTAL_OVERFLOW');assert.ok(dimensions.controls.every(x=>x.width>0&&x.height>0&&x.left>=0&&x.right<=dimensions.viewport),'PAN548_PANEL_VISIBLE_CONTROL_CLIPPING');if(dimensions.panel)assert.ok(dimensions.panel.width>0&&dimensions.panel.height>0&&dimensions.panel.left>=0&&dimensions.panel.right<=dimensions.viewport);const pins={};for(const n of ['dist/browser-workspace/app.js','dist/browser-workspace/workspace-agent-panel.js','dist/browser-workspace/erv-human.js','packages/browser-workspace/src/workspace-agent-panel-v1.ts','packages/browser-workspace/src/workspace-agent-panel-v1.css','packages/contracts/src/workspace-agent-run-v1.ts','src/pan548/native-agent-run.mjs','src/pan527/origin-session-adapter.mjs','src/pan541/workspace-browser.mjs'])pins[n]=hash(readFileSync(n));const receipt={name,imageSHA256:hash(readFileSync(image)),dimensions,pins,persistedViewRevision:f.readPersisted().revision,agentState:await f.page.locator(root).count()?await f.page.locator(root).getAttribute('data-state'):null,taskId:await f.page.locator(root).count()?await f.page.locator(root).getAttribute('data-run'):null,modelMode:'SYNTHETIC_PROBE_ONLY',realModelAcceptance:false};writeFileSync(image+'.json',JSON.stringify(receipt,null,2)+'\n');return receipt;}
async function preview(f){const b=f.page.locator(root).getByRole('button',{name:'Diesen Vorschlag separat im Vieweditor prüfen',exact:true});await b.click();await f.page.locator(view+'[data-state="PREVIEW_ONLY"]').waitFor();assert.equal(await f.page.locator(view).getAttribute('data-proposal-source'),'AGENT');}
async function confirm(f){await f.page.locator(view).getByRole('button',{name:'Genau diese persönliche View bestätigen und speichern',exact:true}).click();await f.page.locator(view+'[data-state="SAVED_AND_NATIVE_READBACK_CONFIRMED"]').waitFor();await f.flushResponses();}

// The existing native browser assembly is exercised against a LOCAL framing
// peer. Neither HTTP200, OWNER_BOUND_PROVIDER nor this peer is LLM evidence.
async function connectedFixture({taskPurpose=true,empty=false,unknown=false}={}){
 const privateRoot=mkdtempSync(join(tmpdir(),'pan548-browser-native-owner-'));
 const credentialFile=join(privateRoot,'existing-local-test-secret');
 writeFileSync(credentialFile,syntheticCredential565,{mode:0o600});
 const peer=syntheticWorkspaceViewChatFeedbackModelV1('tenant-a'),observations=[];let posts=0,f;
 const server=createServer(async(req,res)=>{
  try{
   let bytes='';for await(const chunk of req)bytes+=chunk;
   const body=bytes?JSON.parse(bytes):null;
   observations.push({method:req.method,credentialPresent:typeof req.headers.authorization==='string',body});
   res.writeHead(200,{'content-type':'application/json'});
   if(req.method==='GET'){res.end(JSON.stringify({data:[{id:'model:synthetic-v1'}]}));return;}
   posts++;const result=await peer.providerCall({request:body},new AbortController().signal);
   if(unknown&&!result.toolCalls.length){const final=JSON.parse(result.text);final.answers[0].sum=0;result.text=JSON.stringify(final);}
   res.end(JSON.stringify({model:'model:synthetic-v1',choices:[{message:{content:result.toolCalls.length?null:result.text,tool_calls:result.toolCalls.map(c=>({id:c.id,type:'function',function:{name:c.name,arguments:JSON.stringify(c.arguments)}}))}}],usage:{prompt_tokens:2,completion_tokens:3}}));
  }catch{res.destroy();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const options=connectionOptions565({origin:'http://127.0.0.1:'+server.address().port},credentialFile);
 options.productGrant.limits={...options.productGrant.limits,maxTimeMs:15000,maxInputBytes:32768};
 if(taskPurpose)options.productGrant.allowedPurposes=['purpose:ui-connection-probe','purpose:ui-view-proposal'];
 try{f=await nativeViewBrowserFixture546({agentRuns:true,modelConnections:empty?[]:[options]});}
 catch(error){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));rmSync(privateRoot,{recursive:true,force:true});throw error;}
 const nativeNetwork=[];
 f.tls.gateway.server.prependListener('request',(request,response)=>{if(!request.url.includes('/workspace/agent-run/'))return;const entry={path:request.url,method:request.method,receivedAt:Date.now()};nativeNetwork.push(entry);response.once('finish',()=>{entry.finishedAt=Date.now();entry.status=response.statusCode;});response.once('close',()=>{entry.closedAt=Date.now();});});
 f.page.on('requestfailed',request=>{if(request.url().includes('/workspace/agent-run/'))nativeNetwork.push({path:new URL(request.url()).pathname,browserFailure:request.failure()?.errorText,at:Date.now()});});
 return {...f,observations,nativeNetwork,connectionId:options.summary.connectionId,posts:()=>posts,async close(){try{await f.close();}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));rmSync(privateRoot,{recursive:true,force:true});}}};
}
async function selectConnectedView(f){
 await f.page.locator(view).getByRole('button',{name:'Rechnungswert',exact:true}).focus();
 await f.page.keyboard.press('Enter');
 await f.page.waitForFunction(()=>document.querySelector('[id="shell.context-selection"] button[aria-pressed="true"]')?.textContent==='Kontextauswahl: Persönliches Viewelement: invoice-value');
 await f.page.locator(view+'[data-state="CURRENT_NATIVE_VIEW"]').waitFor();
 await f.page.locator(root).getByRole('button',{name:'Gebundenen Auftrag und Angebot planen',exact:true}).waitFor();
}
async function connect(f){
 const connection='[id="shell.model-connection"]';
 await f.page.locator(connection).getByRole('button',{name:'Sichere Modellverbindung öffnen',exact:true}).click();
 await f.page.locator(connection+'[data-state="CURRENT_CONNECTION"]').waitFor();
 await f.page.locator('#pan565-connection-choice').selectOption(f.connectionId);
 await f.page.locator('#pan565-select').click();
 await f.page.locator(connection+'[data-state="CURRENT_CONNECTION"]').waitFor();
 for(const label of ['Erreichbarkeit','Authentifizierung','Modellverfügbarkeit']){
  await f.page.locator(connection).getByRole('button',{name:label+' separat prüfen',exact:true}).click();
  await f.page.locator(connection+'[data-state="CURRENT_CONNECTION"]').waitFor();
 }
 await f.flushResponses();assert.equal(f.posts(),0);
}
async function boundPlan(f){
 await f.page.locator(root).getByRole('button',{name:'Gebundenen Auftrag und Angebot planen',exact:true}).click();
 await state(f,'PLANNED_NOT_DISPATCHED');await f.flushResponses();
 const p=f.responses.filter(r=>r.path.endsWith('/agent-run/plan')&&r.status===200).at(-1).value;
 assert.equal(p.modelMode,'OWNER_BOUND_PROVIDER');assert.equal(p.realModelAcceptance,false);
 assert.equal(p.inferenceConsentOffer.evidenceClass,'SYNTHETIC_ONLY');
 assert.equal(p.inferenceConsentOffer.purpose,'purpose:ui-view-proposal');return p;
}
async function connectedCapture(f,name){
 assert.ok(!(await f.page.locator('body').innerText()).includes(syntheticCredential565),'NATIVE_OWNER_SECRET_VISIBLE');
 const n=await capture(f,name),sidecar=join(evidence(),name+'.png.json');
 const r=JSON.parse(readFileSync(sidecar,'utf8'));r.modelMode=await f.page.locator(root).getAttribute('data-model-mode');
 r.controlledLocalHTTPNotLLM=true;r.actualModelPosts=f.posts();
 r.actualConsentChecked=await f.page.locator('#pan548-agent-inference-consent').isChecked();
 for(const path of ['src/pan565/native-model-connection.mjs','src/pan565/connection-transport.mjs','src/pan543/profile-store.mjs','src/pan575/broker-tool-feedback.mjs','packages/contracts/src/workspace-model-connection-v1.ts'])r.pins[path]=hash(readFileSync(path));
 writeFileSync(sidecar,JSON.stringify(r,null,2)+'\n');return n;
}
test('DUI09 internal connected browser native565 dynamic selection -> exact unchecked purpose/payload offer -> once-only actual HTTP/two native tools -> separate546 preview/CAS/read/Undo/reload; NOT LLM',async()=>{
 const f=await connectedFixture();try{
  const before=f.business();await open(f);await selectConnectedView(f);await connect(f);
  const p=await boundPlan(f),start=f.page.locator(root).getByRole('button',{name:'Genau diesen gebundenen Lauf einmalig starten',exact:true}),consent=f.page.locator('#pan548-agent-inference-consent');
  assert.equal(await consent.isChecked(),false);assert.equal(await start.isDisabled(),true);assert.equal(count(f,'start'),0);
  for(const value of [p.inferenceConsentOffer.routeId,p.inferenceConsentOffer.model,p.inferenceConsentOffer.payloadDigest,p.inferenceConsentOffer.offerDigest])assert.ok((await f.page.locator(root).innerText()).includes(value));
  await connectedCapture(f,'desktop-native-task-offer-unchecked-no-dispatch');
  await consent.check();await f.page.locator('#pan548-agent-intent').fill('Nur dieses ausgewählte Element größer, erst Vorschlag.');
  assert.equal(await consent.isChecked(),false);assert.equal(count(f,'start'),0);assert.equal(f.posts(),0);
  const fresh=await boundPlan(f);assert.notEqual(fresh.inferenceConsentOffer.payloadDigest,p.inferenceConsentOffer.payloadDigest);
  await f.page.setViewportSize({width:390,height:844});await connectedCapture(f,'390-native-task-bound-offer-all-caps');
  await f.page.evaluate(()=>{document.body.style.zoom='2';});await connectedCapture(f,'390-zoom200-native-task-bound-offer');await f.page.evaluate(()=>{document.body.style.zoom='1';});
  await consent.check();await start.focus();await f.page.keyboard.press('Enter');
  try{await state(f,'RESULT_READY');}catch{assert.equal(await f.page.locator(root).getAttribute('data-state'),'OUTCOME_UNCONFIRMED');await f.page.locator(root).getByRole('button',{name:'Laufstatus unabhängig nativ lesen',exact:true}).click();await state(f,'RESULT_READY');await f.flushResponses();writeFileSync(join(evidence(),'actual-connected-start-failure-independent-read.json'),JSON.stringify({nativeNetwork:f.nativeNetwork,posts:f.posts(),peerMethods:f.observations.map(v=>v.method),nativeResponses:f.responses.filter(v=>v.path.endsWith('/agent-run/read')||v.path.endsWith('/agent-run/start'))},null,2)+'\n');}
  await f.flushResponses();
  const command=f.requests.filter(r=>r.path.endsWith('/agent-run/start')).at(-1).body;
  assert.deepEqual(command.inferenceConsent,{offerDigest:fresh.inferenceConsentOffer.offerDigest,confirm:true});
  assert.equal(f.posts(),2);assert.equal(count(f,'start'),1);assert.equal(f.readPersisted().revision,0);assert.equal(f.business(),before);
  assert.deepEqual(f.observations.filter(r=>r.method==='POST')[1].body.messages.map(m=>m.role),['user','assistant','tool','tool']);
  assert.equal((f.responses.filter(r=>(r.path.endsWith('/agent-run/start')||r.path.endsWith('/agent-run/read'))&&r.status===200).at(-1).value).modelMode,'OWNER_BOUND_PROVIDER');
  await f.page.setViewportSize({width:1280,height:900});await connectedCapture(f,'desktop-native-owner-result-preview-only');
  await preview(f);assert.equal(f.readPersisted().revision,0);await connectedCapture(f,'desktop-native-owner-separate546-before-after');
  await confirm(f);assert.equal(f.readPersisted().revision,1);assert.equal(f.business(),before);
  await f.page.locator(view).getByRole('button',{name:'Letzten gespeicherten Viewstand zurückholen',exact:true}).click();await f.page.locator(view+'[data-state="PREVIEW_ONLY"]').waitFor();await confirm(f);
  await f.page.locator(view+'[data-state="SAVED_AND_NATIVE_READBACK_CONFIRMED"]').waitFor();assert.equal(f.readPersisted().revision,2);
  await f.page.reload();await f.page.locator('[id="shell.context-selection"][data-module="pan.erv"][data-state="CURRENT_CONTEXT"]').waitFor();await state(f,'RESULT_READY');
  assert.equal(await f.page.locator(root).getAttribute('data-run'),fresh.runId);assert.equal(f.posts(),2);assert.equal(count(f,'start'),1);assert.equal(f.business(),before);assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
});
test('DUI09 internal native configured empty/probe-only owner denies task planning; no silent synthetic fallback, no data transfer or model POST',async()=>{
 for(const empty of [true,false]){const f=await connectedFixture({empty,taskPurpose:false});try{
  await open(f);await selectConnectedView(f);if(!empty)await connect(f);
  await f.page.locator(root).getByRole('button',{name:'Gebundenen Auftrag und Angebot planen',exact:true}).click();await state(f,'PLAN_DENIED');
  assert.equal(f.posts(),0);assert.equal(count(f,'start'),0);assert.equal(f.readPersisted().revision,0);
  assert.equal(await f.page.locator(root).getAttribute('data-model-mode'),'OWNER_BOUND_PROVIDER');
  assert.ok((await f.page.locator(root).innerText()).includes('kein synthetischer Fallback'));
  if(empty)await connectedCapture(f,'desktop-native-no-product-route-no-fallback');
  assert.deepEqual(f.errors,[]);
 }finally{await f.close();}}
});
test('DUI09 internal connected malformed fresh tool feedback stays native UNKNOWN with retained reservation and no proposal/blind retry after read/reload; NOT LLM',async()=>{
 const f=await connectedFixture({unknown:true});try{
  await open(f);await selectConnectedView(f);await connect(f);const p=await boundPlan(f);
  await f.page.locator('#pan548-agent-inference-consent').check();await f.page.locator(root).getByRole('button',{name:'Genau diesen gebundenen Lauf einmalig starten',exact:true}).click();
  await state(f,'OUTCOME_UNCONFIRMED');await f.flushResponses();assert.equal(f.posts(),2);assert.equal(count(f,'start'),1);assert.equal(f.readPersisted().revision,0);
  await f.page.locator(root).getByRole('button',{name:'Laufstatus unabhängig nativ lesen',exact:true}).click();await state(f,'OUTCOME_UNCONFIRMED');await f.flushResponses();
  const r=f.responses.filter(r=>r.path.endsWith('/agent-run/read')&&r.status===200).at(-1).value;assert.equal(r.proposal,null);assert.ok(r.budget.model.committedUnits>0);
  await f.page.setViewportSize({width:390,height:844});await connectedCapture(f,'390-native-owner-unknown-retained-no-retry');
  await f.page.locator(root).getByRole('button',{name:'Laufstatus unabhängig nativ lesen',exact:true}).click();await state(f,'OUTCOME_UNCONFIRMED');
  await f.page.reload();await f.page.locator('[id="shell.context-selection"][data-module="pan.erv"][data-state="CURRENT_CONTEXT"]').waitFor();await state(f,'OUTCOME_UNCONFIRMED');
  assert.equal(await f.page.locator(root).getAttribute('data-run'),p.runId);assert.equal(f.posts(),2);assert.equal(count(f,'start'),1);assert.equal(await f.page.locator(root).getByRole('button',{name:'Diesen Vorschlag separat im Vieweditor prüfen',exact:true}).isDisabled(),true);assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
});

test('PUI07/DUI06 real mounted browser keyboard native selection -> plan once -> native synthetic run -> reload fresh persistent status -> separate546 preview/cancel/confirm/CAS/GET/Undo, chip dock focus same task; desktop390 zoom',async()=>{
 const f=await nativeViewBrowserFixture546({agentRuns:true});try{const before=f.business(),images=[];await open(f);images.push(await capture(f,'desktop-agent-native-empty-selection'));await select(f);const p=await plan(f);assert.equal(p.realModelAcceptance,false);assert.equal(count(f,'start'),0);assert.equal(f.readPersisted().revision,0);const id=await f.page.locator(root).getAttribute('data-run');assert.equal(id,p.runId);await f.page.locator(root).getByRole('button',{name:'Auftragspanel ausblenden',exact:true}).click();assert.equal(await f.page.locator('#pan548-agent-body').isVisible(),false);assert.equal(await f.page.locator(root).getAttribute('data-run'),id);assert.equal(await f.page.locator(root).getByRole('button',{name:'Auftragspanel öffnen',exact:true}).evaluate(e=>e===document.activeElement),true);await f.page.locator(root).getByRole('button',{name:'Auftragspanel öffnen',exact:true}).click();await f.page.locator(root).getByRole('button',{name:'Darstellung Dock / Fokus wechseln',exact:true}).click();assert.equal(await f.page.locator(root).getAttribute('data-presentation'),'FOCUS');assert.equal(await f.page.locator(root).getAttribute('data-run'),id);images.push(await capture(f,'desktop-agent-planned-focus-no-dispatch'));const result=await run(f);assert.equal(result.runId,id);assert.equal(result.modelMode,'SYNTHETIC_PROBE_ONLY');assert.equal(result.realModelAcceptance,false);assert.equal(result.phase,'RESULT_READY');assert.equal(result.budget.runtime.consumedUnits,2);assert.equal(result.operations.cancel.available,false);assert.equal(result.operations.resume.available,false);assert.equal(f.readPersisted().revision,0);assert.equal(f.business(),before);assert.equal(count(f,'start'),1);assert.equal(await f.page.locator(root).getByRole('button',{name:'Echten Modellvorschlag senden — nicht verfügbar',exact:true}).isDisabled(),true);await f.page.locator(root).getByRole('button',{name:'Genau diesen synthetischen Lauf starten',exact:true}).evaluate(e=>e.dispatchEvent(new MouseEvent('click',{bubbles:true})));assert.equal(count(f,'start'),1);images.push(await capture(f,'desktop-agent-native-result-budget-proposal-only'));
 await f.page.reload();await f.page.locator('[id="shell.context-selection"][data-module="pan.erv"][data-state="CURRENT_CONTEXT"]').waitFor();await state(f,'RESULT_READY');await f.page.locator(view+'[data-state="CURRENT_NATIVE_VIEW"]').waitFor();await f.flushResponses();assert.equal(await f.page.locator(root).getAttribute('data-run'),id);assert.equal(count(f,'start'),1);const nativeRead=f.responses.filter(r=>r.method==='GET'&&r.path.endsWith('/agent-run/read')&&r.status===200).at(-1).value;assert.equal(nativeRead.runId,result.runId);assert.equal(nativeRead.requestDigest,result.requestDigest);assert.deepEqual(nativeRead.budget,result.budget);assert.equal(f.readPersisted().revision,0);assert.equal(await f.page.locator(root).getByRole('button',{name:'Diesen Vorschlag separat im Vieweditor prüfen',exact:true}).isDisabled(),true,'RELOADED_PROPOSAL_NEEDS_FRESH_NATIVE_SELECTION');await select(f);await state(f,'RESULT_READY');await preview(f);assert.equal(f.readPersisted().revision,0);assert.equal(f.business(),before);images.push(await capture(f,'desktop-agent-separate-native546-before-after'));await f.page.locator(view).getByRole('button',{name:'Vorschau abbrechen — nichts speichern',exact:true}).click();await f.page.locator(view+'[data-state="LOCAL_DRAFT_DISCARDED"]').waitFor();assert.equal(f.readPersisted().revision,0);await preview(f);await confirm(f);assert.equal(f.readPersisted().revision,1);assert.equal(f.readPersisted().view.instances.find(i=>i.instanceId==='invoice-value').size,'large');assert.equal(await f.page.locator(root).getByRole('button',{name:'Diesen Vorschlag separat im Vieweditor prüfen',exact:true}).isDisabled(),true,'OLD_PROPOSAL_NOT_REAPPLIED_AFTER_CAS');await f.page.setViewportSize({width:390,height:844});images.push(await capture(f,'390-agent-native-result-stale-proposal-after-confirmation'));await f.page.evaluate(()=>{document.body.style.zoom='2';});images.push(await capture(f,'390-agent-zoom200-bounded-controls-long-reasons'));await f.page.evaluate(()=>{document.body.style.zoom='1';});await f.page.locator(view).getByRole('button',{name:'Letzten gespeicherten Viewstand zurückholen',exact:true}).click();await f.page.locator(view+'[data-state="PREVIEW_ONLY"]').waitFor();await confirm(f);assert.equal(f.readPersisted().revision,2);assert.equal(f.readPersisted().view.instances.find(i=>i.instanceId==='invoice-value').size,'regular');assert.equal(count(f,'start'),1);assert.equal(f.business(),before);assert.deepEqual(f.errors,[]);writeFileSync(join(evidence(),'actual-agent-panel-positive.json'),JSON.stringify({images,requests:f.requests,responses:f.responses,taskId:id,viewRevisions:[0,1,2],noBusinessEffects:true,realModelAcceptance:false},null,2)+'\n');}finally{await f.close();}
});

test('PUI07 browser genuine lost start reply after native persisted task: UNKNOWN disabled replay, only fresh independent native read and reload reconcile same run, no invented resume/cancel',async()=>{
 const f=await nativeViewBrowserFixture546({agentRuns:true});let cdp;try{const before=f.business();await open(f);await select(f);const p=await plan(f);cdp=await f.context.newCDPSession(f.page);let resolve,held=false;const persisted=new Promise(r=>{resolve=r;});await cdp.send('Fetch.enable',{patterns:[{urlPattern:f.tls.origin+'*/workspace/agent-run/start',requestStage:'Response'}]});cdp.on('Fetch.requestPaused',async event=>{if(held){await cdp.send('Fetch.continueResponse',{requestId:event.requestId});return;}held=true;assert.equal(event.responseStatusCode,200);const b=await cdp.send('Fetch.getResponseBody',{requestId:event.requestId}),r=JSON.parse(Buffer.from(b.body,b.base64Encoded?'base64':'utf8').toString());resolve(r);await cdp.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'Failed'});});await f.page.locator(root).getByRole('button',{name:'Genau diesen synthetischen Lauf starten',exact:true}).click();const native=await persisted;assert.equal(native.phase,'RESULT_READY');assert.equal(native.runId,p.runId);await state(f,'OUTCOME_UNCONFIRMED');assert.equal(await f.page.locator(root).getByRole('button',{name:'Genau diesen synthetischen Lauf starten',exact:true}).isDisabled(),true,'UNKNOWN_RUN_MUST_NOT_OFFER_BLIND_START_REPLAY');await f.page.locator(root).getByRole('button',{name:'Genau diesen synthetischen Lauf starten',exact:true}).evaluate(e=>e.dispatchEvent(new MouseEvent('click',{bubbles:true})));assert.equal(count(f,'start'),1);await f.page.setViewportSize({width:390,height:844});await capture(f,'390-agent-genuine-lost-start-reply-unknown-no-retry');await cdp.send('Fetch.disable');await f.page.locator(root).getByRole('button',{name:'Laufstatus unabhängig nativ lesen',exact:true}).click();await state(f,'RESULT_READY');await f.flushResponses();assert.equal(count(f,'start'),1);const read=f.responses.filter(r=>r.method==='GET'&&r.path.endsWith('/agent-run/read')&&r.status===200).at(-1).value;assert.equal(read.requestDigest,native.requestDigest);assert.deepEqual(read.budget,native.budget);assert.equal(f.readPersisted().revision,0);assert.equal(f.business(),before);await capture(f,'390-agent-lost-reply-only-native-read-reconciled');assert.deepEqual(f.errors,[]);}finally{await cdp?.send('Fetch.disable').catch(()=>{});await f.close();}
});

test('PUI07 late genuine plan response after native context navigation cannot publish old plan or start; unbound HTTP context bootstrap denied',async()=>{
 const f=await nativeViewBrowserFixture546({agentRuns:true});let cdp;try{await open(f);await select(f);cdp=await f.context.newCDPSession(f.page);let resolve,held;const paused=new Promise(r=>{resolve=r;});await cdp.send('Fetch.enable',{patterns:[{urlPattern:f.tls.origin+'*/workspace/agent-run/plan',requestStage:'Response'}]});cdp.on('Fetch.requestPaused',e=>{assert.equal(e.responseStatusCode,200);held=e;resolve();});await f.page.locator(root).getByRole('button',{name:'Begrenzten Testauftrag planen',exact:true}).click();await paused;await capture(f,'desktop-agent-real-native-plan-loading-held-response');await f.page.getByRole('button',{name:'Einrichtung und Betriebszustand',exact:true}).click();await cdp.send('Fetch.continueResponse',{requestId:held.requestId});await cdp.send('Fetch.disable');await f.page.locator('[id="shell.context-selection"][data-module="pan.setup"][data-state="CURRENT_CONTEXT"]').waitFor();await state(f,'CURRENT_SCOPE');assert.equal(await f.page.locator(root).getByRole('button',{name:'Genau diesen synthetischen Lauf starten',exact:true}).isDisabled(),true);assert.equal(count(f,'start'),0);assert.equal(f.readPersisted().revision,0);await capture(f,'desktop-agent-late-native-plan-retired-scope-denied');await f.page.getByRole('button',{name:'Eingangsrechnungsprüfung — nur lesen',exact:true}).click();await f.page.locator(view+'[data-state="CURRENT_NATIVE_VIEW"]').waitFor();await select(f);const p=await plan(f);await f.flushResponses();const command=f.requests.filter(r=>r.path.endsWith('/agent-run/plan')).at(-1).body;const denial=await f.page.evaluate(async({command,runId})=>{const response=await fetch('/t/tenant-a/workspace/context-selection/tab',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});return {status:response.status,runId,commandSchema:command.schemaVersion};},{command,runId:p.runId});assert.notEqual(denial.status,200,'UNBOUND_HTTP_CONTEXT_TAB_MUST_DENY');assert.equal(count(f,'start'),0);assert.deepEqual(f.errors,[]);}finally{await cdp?.send('Fetch.disable').catch(()=>{});await f.close();}
});

test('PUI07 optional agent script load error preserves native manual view, profile and logout; no fake task result or credentials, desktop390 error visible',async()=>{
 const f=await nativeViewBrowserFixture546({agentRuns:true});try{await f.page.route('**/workspace/agent-run/app.js',route=>route.abort('failed'));await f.page.goto(f.tls.origin+'/t/tenant-a/workspace');await f.page.getByText('Auftragspanel nicht verfügbar. Kein Lauf bestätigt; Fachnavigation, Profile und Abmelden bleiben unabhängig.',{exact:true}).waitFor();assert.equal(await f.page.locator(root).count(),0);await f.page.getByRole('button',{name:'Eingangsrechnungsprüfung — nur lesen',exact:true}).click();await f.page.locator(view+'[data-state="CURRENT_NATIVE_VIEW"]').waitFor();assert.equal(f.readPersisted().revision,0);assert.equal(count(f,'start'),0);await f.page.getByRole('button',{name:'Darstellung anpassen',exact:true}).click();await f.page.getByRole('slider',{name:'Hauptfläche Größe',exact:true}).press('ArrowRight');await f.page.getByRole('button',{name:'Profil speichern',exact:true}).click();await f.page.getByRole('button',{name:'Speichern bestätigen',exact:true}).click();await f.page.locator('[data-profile-state="SAVED"]').waitFor();await f.flushResponses();const profile=f.responses.filter(r=>r.path.endsWith('/workspace/profile')&&r.method==='GET'&&r.status===200).at(-1).value;assert.equal(profile.revision,1);assert.equal(await f.page.locator(view).isVisible(),true);await f.page.getByRole('button',{name:'Darstellung anpassen',exact:true}).click();await capture(f,'desktop-agent-module-load-error-independent-native-view');await f.page.setViewportSize({width:390,height:844});await capture(f,'390-agent-module-load-error-independent-navigation');await f.page.getByRole('button',{name:'Abmelden',exact:true}).click();await f.page.getByRole('heading',{name:'Abgemeldet',exact:true}).waitFor();assert.deepEqual(f.errors,[]);}finally{await f.close();}
});
