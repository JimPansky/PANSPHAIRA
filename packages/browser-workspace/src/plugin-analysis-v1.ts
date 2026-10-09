import type {BrowserShellPluginV1} from '../../contracts/src/browser-shell-plugin-v1.js';
import type {BrowserShellFactoryV1} from '../../browser-shell/src/registry-v1.js';
import type {BrowserContextV1} from '../../browser-shell/src/context-owner-v1.js';
import type {BrowserDeepLinkV1} from '../../browser-shell/src/deep-link-v1.js';
import {validateWorkspaceAnalysisReadV1,verifyWorkspaceAnalysisReadResultV1,type WorkspaceAnalysisBindingV1,type WorkspaceAnalysisReadV1} from '../../contracts/src/workspace-analysis-v1.js';
import {text,facts,readState} from './api-v1.js';

type AnalysisTransactionV1={current:()=>boolean;retire:()=>void};
const targetOwners=new WeakMap<HTMLElement,AnalysisTransactionV1>();
// Both public entries acquire the same owner before asynchronous work. Removal
// retires the captured attachment permanently, including detach/reattach within
// one task. takeRecords closes the gap before observer callback delivery.
function beginAnalysisTransactionV1(target:HTMLElement,externalCurrent:()=>boolean,signal?:AbortSignal):AnalysisTransactionV1{
 if(typeof externalCurrent!=='function'||!target.isConnected||signal?.aborted)throw new Error('ANALYSIS_RESULT_CONTEXT_RETIRED');
 const previous=targetOwners.get(target),doc=target.ownerDocument,root=target.getRootNode(),ancestors=new Set<Node>();
 for(let node:Node|null=target;node;node=node.parentNode??(node.nodeType===Node.DOCUMENT_FRAGMENT_NODE&&'host' in node?(node as ShadowRoot).host:null))ancestors.add(node);
 const roots=new Set<Node>([doc,...Array.from(ancestors,node=>node.getRootNode())]);
 let retired=false;
 const removed=(records:MutationRecord[])=>{if(records.some(record=>Array.from(record.removedNodes).some(node=>ancestors.has(node))))owner.retire();};
 const observer=new MutationObserver(removed);
 const owner:AnalysisTransactionV1={
  current(){
   if(retired||targetOwners.get(target)!==owner)return false;
   // The supplied synchronous predicate may itself deliver a context/DOM
   // transition. Drain records and recheck ownership only after it returns.
   const live=externalCurrent()===true;removed(observer.takeRecords());return live&&!retired&&targetOwners.get(target)===owner&&target.isConnected&&target.ownerDocument===doc&&target.getRootNode()===root&&!signal?.aborted;
  },
  retire(){retired=true;observer.disconnect();signal?.removeEventListener('abort',owner.retire);if(targetOwners.get(target)===owner)targetOwners.delete(target);}
 };
 // Provisional observation precedes the first caller callback as well. Failed
 // admission cleans only this observer, never a newer reentrant target owner.
 try{
  for(const capturedRoot of roots)observer.observe(capturedRoot,{childList:true,subtree:true});
  const live=externalCurrent()===true;removed(observer.takeRecords());
  if(!live||retired||!target.isConnected||target.ownerDocument!==doc||target.getRootNode()!==root||targetOwners.get(target)!==previous||signal?.aborted)throw new Error('ANALYSIS_RESULT_CONTEXT_RETIRED');
 }catch(error){owner.retire();throw error;}
 previous?.retire();targetOwners.set(target,owner);signal?.addEventListener('abort',owner.retire,{once:true});return owner;
}
function pendingAnalysisV1(target:HTMLElement,message:string){
 delete document.body.dataset.analysisResultRevision;target.classList.add('workspace-analysis');target.replaceChildren(text('h1','Gebundene Bestandsanalyse'));readState(target,'analysis','LOADING',message);
}
function terminalAnalysisV1(target:HTMLElement,owner:AnalysisTransactionV1,state:string,message:string){
 if(!owner.current())return;delete document.body.dataset.analysisResultRevision;target.replaceChildren(text('h1','Gebundene Bestandsanalyse'));readState(target,'analysis',state,state+' — '+message);
}

export const analysisPluginV1:BrowserShellPluginV1={schemaVersion:'pansphaira.browser-plugin/v1',id:'pan.analysis',version:'1.0.0',shellVersion:'1.0.0',enabled:true,trustBoundary:'TRUSTED_IN_PROCESS_CODE_OWNED_FACTORIES',needs:{data:['analysis.read'],context:['tenantId','sessionId','objectId','revision'],rights:['analysis.read'],dependencies:[]},contributions:[
 {id:'pan.analysis.route',kind:'ROUTE',slot:'shell.routes',factoryId:null,routeId:'pan.analysis.route',path:'/workspace/analysis',label:'Gebundene Bestandsanalyse — nur lesen'},
 {id:'pan.analysis.navigation',kind:'NAVIGATION',slot:'shell.navigation',factoryId:'pan.analysis.navigation',routeId:'pan.analysis.route',path:null,label:'Gebundene Bestandsanalyse — nur lesen'},
 {id:'pan.analysis.view',kind:'VIEW',slot:'shell.main',factoryId:'pan.analysis.view',routeId:'pan.analysis.route',path:null,label:'Gebundene Bestandsanalyse'},
]};

// Synchronous text-only commit of already frozen, request-matched result bytes.
// No SQL, percentages, URL/iframe/HTML, consent/transport or applied proposal.
function commitAnalysisResultV1(target:HTMLElement,result:Awaited<ReturnType<typeof verifyWorkspaceAnalysisReadResultV1>>){
 target.replaceChildren(text('h1','Gebundene Bestandsanalyse'));
 readState(target,'analysis','READBACK_RECEIVED','Echter nativer Readback empfangen — ausschließlich lesen, keine angewendete Änderung.');
 facts(target,[['Verfügbarkeit',result.availability],['Quelladapter',result.source.entrypoint],['Quellvertrag',result.source.schemaVersion],['Ergebnisrevision',result.resultRevision],['Native Quellrevision',String(result.source.snapshot.nativeRevision)],['Cutoff',result.source.snapshot.asOf??'Aktueller nativer Stand — kein historischer Cutoff'],['Quellscope / Grain',Object.entries(result.source.grain).map(([k,v])=>k+'='+v).join(' · ')],['Quellabdeckung',result.source.coverage]]);
 const scroll=text('div','');scroll.className='analysis-table-scroll';scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.setAttribute('aria-label','Bestandswerte — Tabelle lokal horizontal scrollbar');
 const table=document.createElement('table');table.append(text('caption','Bestandswerte aus demselben nativen Ergebnis'));
 const head=document.createElement('thead'),titles=document.createElement('tr');for(const label of ['Fachwert','Verfügbarkeitszustand','Wert','Einheit','Basis oder fehlende Quelle']){const cell=text('th',label);cell.setAttribute('scope','col');titles.append(cell);}head.append(titles);table.append(head);
 const body=document.createElement('tbody');for(const row of result.rows){
  const tr=document.createElement('tr');tr.dataset.analysisKey=row.key;const label=text('th',row.label);label.setAttribute('scope','row');tr.append(label,text('td',row.state));
  const cell=text('td',row.state==='KNOWN'?String(row.value):'Nicht verfügbar');cell.setAttribute('data-analysis-value','');tr.append(cell,text('td',row.unit),text('td',row.basis??row.reason));body.append(tr);
 }table.append(body);scroll.append(table);target.append(scroll);
 target.append(text('p','PARTIAL bedeutet hier: Bestandsreichweite und qualifizierter Wert fehlen in der vorhandenen Quelle. Fehlende Werte sind keine Null. Keine vollständige Unternehmens- oder Adoptionsstatistik; kein Vorschlag und kein fachlicher Effekt. Consent und Transport bleiben unverändert.'));
 if(result.cohort){
  const cohort=text('section','');cohort.dataset.analysisCohort=result.cohort.report.publicationState;cohort.append(text('h2','Separater lokaler Usage-Insights-Snapshot'));
  cohort.append(text('p',result.cohort.report.publicationState==='SUPPRESSED'?'Kleine Kohorte unterdrückt — keine Statistik und keine Installationstotalen.':'EMPTY — keine freigegebenen Kohortenmetriken. Leer ist keine Aussage zur gesamten Population.'));
  cohort.append(text('p','Nenner unbekannt (UNKNOWN) — keine Adoptionsrate. Die Bestandswerte oben sind keine Kohortenstatistik.'));
  facts(cohort,[['Quelle',result.cohort.entrypoint],['Quellrevision',result.cohort.report.reportDigest],['Eigener Berichtscutoff (Millisekunden)',String(result.cohort.report.generatedAtMs)],['Kohorte',result.cohort.report.cohortLabel],['Abdeckung',result.cohort.report.coverageLabel],['Unterdrückung',result.cohort.report.suppressionReason??'Keine Metriken verfügbar'],['Nichtbehauptungen',result.cohort.report.coverageNonclaims.join(' · ')]]);target.append(cohort);
 }else target.append(text('p','Kein Usage-Insights-Snapshot angebunden — keine Kohortenstatistik aus Bestandsdaten ableiten.'));
}

// A read-backed direct consumer must supply its admitted selector. Integrity
// alone is never enough to label unrelated native bytes as this read response.
export async function renderWorkspaceAnalysisResultV1(target:HTMLElement,value:unknown,expected:WorkspaceAnalysisBindingV1,isCurrent:()=>boolean,selector:WorkspaceAnalysisReadV1){
 const owner=beginAnalysisTransactionV1(target,isCurrent);pendingAnalysisV1(target,'Ergebnisintegrität und aktuelle Bindung werden geprüft …');
 try{
  const result=await verifyWorkspaceAnalysisReadResultV1(value,expected,selector);if(!owner.current())throw new Error('ANALYSIS_RESULT_CONTEXT_RETIRED');commitAnalysisResultV1(target,result);return result;
 }catch(error){terminalAnalysisV1(target,owner,'UNKNOWN','Ergebnis oder Bindung nicht bestätigt. Keine früheren Fachwerte; unbekannt ist keine Null.');throw error;}
 finally{owner.retire();}
}

export function createAnalysisViewV1(api:{readonly base:string;readonly context:()=>BrowserContextV1;readonly selected:()=>BrowserDeepLinkV1|null}):BrowserShellFactoryV1<HTMLElement>{
 return {kind:'VIEW',async render({target,signal}){
  if(signal.aborted||!target.isConnected)return;
  const captured=api.context(),selected=api.selected();
  const sameContext=()=>api.context().sessionId===captured.sessionId&&api.context().tenantId===captured.tenantId&&api.context().objectId===captured.objectId&&api.context().revision===captured.revision;
  const owner=beginAnalysisTransactionV1(target,sameContext,signal);pendingAnalysisV1(target,'Aktuelle Session und native Ergebnisquelle werden geprüft …');
  const confirmed=async()=>{const r=await fetch(api.base+'/workspace/context',{credentials:'same-origin',cache:'no-store',signal});if(r.status!==200)return false;const c=await r.json() as BrowserContextV1;return c.sessionId===captured.sessionId&&c.tenantId===captured.tenantId;};
  try{
   if(!await confirmed()){terminalAnalysisV1(target,owner,'DENIED','Aktuelle Session nicht bestätigt. Keine früheren Fachwerte.');return;}if(!owner.current())return;
   const selector=validateWorkspaceAnalysisReadV1({schemaVersion:'pansphaira.workspace-analysis/read/v1',objectId:captured.objectId,expectedNativeRevision:selected?.revision??null,expectedResultRevision:null,asOf:'2026-06-30T23:59:59+02:00'});
   const response=await fetch(api.base+'/workspace/analysis',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','x-pan549-context':captured.sessionId},body:JSON.stringify(selector),signal});
   if(!owner.current())return;
   if(response.status!==200){terminalAnalysisV1(target,owner,response.status===409?'STALE':response.status===401||response.status===403?'DENIED':'UNAVAILABLE','Kein bestätigtes aktuelles Ergebnis. Stale, verweigerte oder nicht verfügbare Daten werden nicht als Null oder Erfolg angezeigt.');return;}
   const value=await response.json() as {binding:WorkspaceAnalysisBindingV1};if(!owner.current())return;
   // Identity fields are supplied by the authenticated owned backend, not proof
   // minted by the plugin. Unkeyed digests check bytes, never source authority.
   const expected={...value.binding,origin:location.origin,tenantId:captured.tenantId};
   const result=await verifyWorkspaceAnalysisReadResultV1(value,expected,selector);if(!owner.current())return;
   // All asynchronous digest work finishes before this final live protected
   // confirmation. No await remains between current checks and the DOM commit.
   if(!await confirmed()){terminalAnalysisV1(target,owner,'DENIED','Session während des Readbacks gewechselt oder entzogen. Keine Fachwerte übernommen.');return;}if(!owner.current())return;
   commitAnalysisResultV1(target,result);document.body.dataset.analysisResultRevision=result.resultRevision;
  }catch{terminalAnalysisV1(target,owner,'UNKNOWN','Readback oder Bindung nicht bestätigt. Unbekannt ist keine Null; kein angewendeter Effekt und kein automatischer Wiederholungswrite.');}
  finally{owner.retire();}
 }};
}
