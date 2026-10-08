import type {BrowserShellPluginV1} from '../../contracts/src/browser-shell-plugin-v1.js';
import type {BrowserShellFactoryV1} from '../../browser-shell/src/registry-v1.js';
import type {BrowserContextV1} from '../../browser-shell/src/context-owner-v1.js';
import type {BrowserDeepLinkV1} from '../../browser-shell/src/deep-link-v1.js';
import {validateWorkspaceAnalysisReadV1,verifyWorkspaceAnalysisResultIntegrityV1,type WorkspaceAnalysisBindingV1} from '../../contracts/src/workspace-analysis-v1.js';
import {text,facts,readState} from './api-v1.js';

export const analysisPluginV1:BrowserShellPluginV1={schemaVersion:'pansphaira.browser-plugin/v1',id:'pan.analysis',version:'1.0.0',shellVersion:'1.0.0',enabled:true,trustBoundary:'TRUSTED_IN_PROCESS_CODE_OWNED_FACTORIES',needs:{data:['analysis.read'],context:['tenantId','sessionId','objectId','revision'],rights:['analysis.read'],dependencies:[]},contributions:[
 {id:'pan.analysis.route',kind:'ROUTE',slot:'shell.routes',factoryId:null,routeId:'pan.analysis.route',path:'/workspace/analysis',label:'Gebundene Bestandsanalyse — nur lesen'},
 {id:'pan.analysis.navigation',kind:'NAVIGATION',slot:'shell.navigation',factoryId:'pan.analysis.navigation',routeId:'pan.analysis.route',path:null,label:'Gebundene Bestandsanalyse — nur lesen'},
 {id:'pan.analysis.view',kind:'VIEW',slot:'shell.main',factoryId:'pan.analysis.view',routeId:'pan.analysis.route',path:null,label:'Gebundene Bestandsanalyse'},
]};

// Thin display of the admitted source bytes; no SQL, percentages, new metrics,
// URL/iframe/HTML interpretation, consent/transport switch or applied proposal.
export async function renderWorkspaceAnalysisResultV1(target:HTMLElement,value:unknown,expected:WorkspaceAnalysisBindingV1,isCurrent:()=>boolean=()=>target.isConnected){
 const result=await verifyWorkspaceAnalysisResultIntegrityV1(value,expected);if(!isCurrent())throw new Error('ANALYSIS_RESULT_CONTEXT_RETIRED');target.replaceChildren();target.classList.add('workspace-analysis');
 target.append(text('h1','Gebundene Bestandsanalyse'));
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
 return result;
}

export function createAnalysisViewV1(api:{readonly base:string;readonly context:()=>BrowserContextV1;readonly selected:()=>BrowserDeepLinkV1|null}):BrowserShellFactoryV1<HTMLElement>{
 return {kind:'VIEW',async render({target,signal}){
  const captured=api.context(),selected=api.selected();delete document.body.dataset.analysisResultRevision;target.classList.add('workspace-analysis');target.append(text('h1','Gebundene Bestandsanalyse'));readState(target,'analysis','LOADING','Aktuelle Session und native Ergebnisquelle werden geprüft …');
  const current=()=>!signal.aborted&&api.context().sessionId===captured.sessionId&&api.context().tenantId===captured.tenantId&&api.context().objectId===captured.objectId&&api.context().revision===captured.revision;
  const confirmed=async()=>{const r=await fetch(api.base+'/workspace/context',{credentials:'same-origin',cache:'no-store',signal});if(r.status!==200)return false;const c=await r.json() as BrowserContextV1;return c.sessionId===captured.sessionId&&c.tenantId===captured.tenantId;};
  const terminal=(state:string,message:string)=>{delete document.body.dataset.analysisResultRevision;target.replaceChildren(text('h1','Gebundene Bestandsanalyse'));readState(target,'analysis',state,state+' — '+message);};
  try{
   if(!await confirmed()){if(current())terminal('DENIED','Aktuelle Session nicht bestätigt. Keine früheren Fachwerte.');return;}if(!current())return;
   const selector=validateWorkspaceAnalysisReadV1({schemaVersion:'pansphaira.workspace-analysis/read/v1',objectId:captured.objectId,expectedNativeRevision:selected?.revision??null,expectedResultRevision:null,asOf:'2026-06-30T23:59:59+02:00'});
   const response=await fetch(api.base+'/workspace/analysis',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','x-pan549-context':captured.sessionId},body:JSON.stringify(selector),signal});
   if(!current())return;
   if(response.status!==200){terminal(response.status===409?'STALE':response.status===401||response.status===403?'DENIED':'UNAVAILABLE','Kein bestätigtes aktuelles Ergebnis. Stale, verweigerte oder nicht verfügbare Daten werden nicht als Null oder Erfolg angezeigt.');return;}
   const value=await response.json() as {binding:WorkspaceAnalysisBindingV1};
   if(!await confirmed()){if(current())terminal('DENIED','Session während des Readbacks gewechselt oder entzogen. Keine Fachwerte übernommen.');return;}if(!current())return;
   // Remaining instance/identity fields are read from this authenticated owned
   // backend, not proof minted by the plugin. Origin/tenant are independently
   // constrained by the live protected workspace and checked before/after use.
   const expected={...value.binding,origin:location.origin,tenantId:captured.tenantId};
   const result=await renderWorkspaceAnalysisResultV1(target,value,expected,current);if(current())document.body.dataset.analysisResultRevision=result.resultRevision;
  }catch{if(current())terminal('UNKNOWN','Readback oder Bindung nicht bestätigt. Unbekannt ist keine Null; kein angewendeter Effekt und kein automatischer Wiederholungswrite.');}
 }};
}
