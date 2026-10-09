import type {BrowserContextV1} from '../../browser-shell/src/context-owner-v1.js';
import {validateWorkspaceNotificationsFeedV1,validateWorkspaceNotificationOpenV1,validateWorkspaceNotificationReadV1,validateWorkspaceNotificationSelectorV1,validateWorkspaceNotificationPreferencesWriteV1,validateWorkspaceNotificationPreferencesV1,WORKSPACE_NOTIFICATION_KIND_V1,type WorkspaceNotificationPreferencesWriteV1,type WorkspaceNotificationEventV1,type WorkspaceNotificationsFeedV1,type WorkspaceNotificationOpenV1} from '../../contracts/src/workspace-notifications-v1.js';
import {text} from './api-v1.js';
interface Options {root:HTMLElement;base:string;context:()=>BrowserContextV1;signal:AbortSignal;openTarget:(value:WorkspaceNotificationOpenV1)=>void;onSessionDenied:()=>void;}
// Shell-owned personal feed, not a business approval/action contribution.
export function createWorkspaceNotificationsV1({root,base,context,signal,openTarget,onSessionDenied}:Options){
  root.hidden=false;root.dataset.backend='notifications';let epoch=0,closed=false,feed:WorkspaceNotificationsFeedV1|null=null;
  let pendingRead:{event:WorkspaceNotificationEventV1;sessionId:string;tenantId:string}|null=null;
  let requestAbort=new AbortController();
  const same=(c:BrowserContextV1)=>!closed&&!signal.aborted&&context().tenantId===c.tenantId&&context().sessionId===c.sessionId&&context().revision===c.revision;
  const button=(label:string,work:()=>void)=>{const b=text('button',label) as HTMLButtonElement;b.type='button';b.addEventListener('click',work,{signal});return b;};
  function state(outcome:string,message:string){root.dataset.outcome=outcome;root.replaceChildren(text('h2','Hinweise und Benachrichtigungen'),text('p',message));}
  function busy(outcome:string,message:string){root.dataset.outcome=outcome;root.querySelector('[data-notification="feedback"]')?.replaceChildren(text('span',message));root.querySelectorAll<HTMLButtonElement>('button').forEach(b=>{b.disabled=true;});}
  async function sessionStillCurrent(c:BrowserContextV1){
    if(!same(c))throw new Error('NOTIFICATION_CONTEXT_RETIRED');
    const r=await fetch(base+'/workspace/context',{credentials:'same-origin',cache:'no-store',signal:requestAbort.signal});
    const v=r.status===200?await r.json() as BrowserContextV1:null;
    if(!same(c)||v?.tenantId!==c.tenantId||v.sessionId!==c.sessionId)throw new Error('NOTIFICATION_SESSION_DENIED');
  }
  async function request(path:string,c:BrowserContextV1,body?:unknown){
    await sessionStillCurrent(c);
    const r=await fetch(base+'/workspace/notifications'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:{'x-pan544-context':c.sessionId,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:requestAbort.signal});
    const raw=await r.text();if(raw.length>131072)throw new Error('NOTIFICATION_RESPONSE_DENIED');
    await sessionStillCurrent(c);
    if(r.status===403){let denial:unknown;try{denial=JSON.parse(raw);}catch{/* Unknown denial retains the session-wide fail-closed path. */}if(denial&&typeof denial==='object'&&Object.hasOwn(denial,'error')&&(denial as {error:unknown}).error==='NOTIFICATION_NATIVE_ROLE_DENIED')throw new Error('NOTIFICATION_PERMISSION_DENIED');}
    if(r.status!==200)throw new Error(r.status===401||r.status===403?'NOTIFICATION_SESSION_DENIED':path==='/open'&&(r.status===409||r.status===410)?'NOTIFICATION_TARGET_RETIRED':'NOTIFICATION_RESPONSE_UNCONFIRMED');
    return JSON.parse(raw) as unknown;
  }
  const selector=(e:WorkspaceNotificationEventV1,operation:'open'|'mark-read'|'reconcile-read')=>validateWorkspaceNotificationSelectorV1({schemaVersion:'pansphaira.workspace-notifications/'+operation+'/v1',eventId:e.eventId,eventRevision:e.eventRevision},operation);
  function failRead(error:unknown,c:BrowserContextV1){
    if(!same(c))return;
    const denied=error instanceof Error&&error.message==='NOTIFICATION_SESSION_DENIED',permission=error instanceof Error&&error.message==='NOTIFICATION_PERMISSION_DENIED';feed=null;if(denied||(error instanceof Error&&error.message==='NOTIFICATION_TARGET_RETIRED'))onSessionDenied();state(denied?'DENIED':permission?'PERMISSION_DENIED':'ERROR',permission?'Diese native Rolle hat keinen Zugriff auf den Hinweisfeed. Keine Hinweise oder Fachaktion bestätigt; andere aktuell berechtigte Module bleiben unabhängig.':'Hinweise nicht verfügbar oder Zugriff verweigert. Keine fachlichen Daten oder erfolgreiche Aktion bestätigt.');
    if(root.dataset.outcome!=='DENIED')root.append(button('Hinweise neu lesen',()=>{void refresh();}));
  }
  async function open(e:WorkspaceNotificationEventV1){
    const c=context();busy('OPENING','Aktuellen berechtigten Vorgang prüfen …');
    try{const v=validateWorkspaceNotificationOpenV1(await request('/open',c,selector(e,'open')),e,c.tenantId);if(same(c))openTarget(v);}
    catch(error){failRead(error,c);}
  }
  function unknown(){
    state('OUTCOME_UNKNOWN','Persönlicher Lesestatus ungeklärt. Nicht erneut senden; zuerst autoritativen Lesestatus abgleichen. Auftrag/Freigabe/Ausführung wurden nicht bestätigt.');
    root.append(button('Lesestatus autoritativ abgleichen',()=>{void reconcileRead();}));
  }
  async function reconcileRead(){
    const captured=pendingRead;if(!captured)return;const c=context();
    if(c.tenantId!==captured.tenantId||c.sessionId!==captured.sessionId){pendingRead=null;failRead(new Error('NOTIFICATION_SESSION_DENIED'),c);return;}
    busy('RECONCILING','Persönlichen Lesestatus autoritativ lesen — keine Wiederholung der Mutation …');
    try{
      const response=await request('/reconcile',c,selector(captured.event,'reconcile-read'));
      const result=validateWorkspaceNotificationReadV1(response,captured.event,true);if(!same(c))return;
      pendingRead=null;await refresh();
      if(same(c))root.append(text('p',result.read?'Lesestatus autoritativ bestätigt. Der Auftrag bleibt offen.':'Lesestatus nicht aufgezeichnet. Keine Erfolgsmeldung; eine neue bewusste Bestätigung ist erforderlich.'));
    }catch(error){if(!same(c))return;if(error instanceof Error&&error.message==='NOTIFICATION_SESSION_DENIED')failRead(error,c);else unknown();}
  }
  async function mark(e:WorkspaceNotificationEventV1,c:BrowserContextV1){
    if(!same(c)||pendingRead)return;pendingRead={event:e,sessionId:c.sessionId,tenantId:c.tenantId};busy('READ_PENDING','Nur persönlichen Lesestatus speichern … Auftrag bleibt offen.');
    try{validateWorkspaceNotificationReadV1(await request('/read',c,selector(e,'mark-read')),e,false);if(!same(c))return;pendingRead=null;await refresh();}
    catch(error){if(!same(c))return;if(error instanceof Error&&error.message==='NOTIFICATION_SESSION_DENIED')failRead(error,c);else unknown();}
  }
  function proposeRead(e:WorkspaceNotificationEventV1){
    const c=context();if(pendingRead||!feed||e.status!=='OPEN'||e.read)return;
    root.querySelector('[data-notification="read-diff"]')?.remove();const diff=document.createElement('section');diff.dataset.notification='read-diff';diff.tabIndex=-1;
    diff.append(text('h3','Vorschlag: persönlichen Lesestatus ändern'),text('p','Rechnung '+e.target.params.objectId+' · Objektversion '+e.target.params.revision+' · Hinweisrevision '+e.eventRevision),text('p','Vorher: ungelesen → nachher: gelesen. Auftrag bleibt offen. Keine Freigabe, Buchung, Ausführung oder neuen Rechte.'));
    const cancel=()=>{diff.remove();root.querySelector<HTMLButtonElement>('[data-notification-action="read"]')?.focus();};
    diff.append(button('Persönlichen Lesestatus bestätigen',()=>{void mark(e,c);}),button('Lesestatusvorschlag verwerfen',cancel));
    diff.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();cancel();}},{signal});root.append(diff);diff.focus();
  }
  function preferencesEditor(){
    if(!feed||pendingRead)return;const before=feed.preferences,c=context();
    root.querySelector('[data-notification="preferences-editor"]')?.remove();const editor=document.createElement('section');editor.dataset.notification='preferences-editor';editor.className='notification-preferences';
    editor.append(text('h3','Persönliche Hinweispräferenzen'));
    const enabled=document.createElement('input');enabled.type='checkbox';enabled.checked=before.inAppEnabled;
    const subscribed=document.createElement('input');subscribed.type='checkbox';subscribed.checked=before.subscriptions.includes(WORKSPACE_NOTIFICATION_KIND_V1);
    const filter=document.createElement('select');for(const [value,label] of [['ALL','Alle erlaubten Hinweise'],['UNREAD','Nur ungelesene Hinweise']] as const){const o=text('option',label) as HTMLOptionElement;o.value=value;filter.append(o);}filter.value=before.filter;
    for(const [title,input] of [['In-App-Hinweise anzeigen',enabled],['Synthetische ERV-Freigabehinweise abonnieren',subscribed],['Hinweisfilter',filter]] as const){const label=document.createElement('label');input.setAttribute('aria-label',title);label.append(text('span',title),input);editor.append(label);}
    const invalidate=()=>editor.querySelector('[data-notification="preferences-diff"]')?.remove();for(const input of [enabled,subscribed,filter])input.addEventListener('change',invalidate,{signal});
    editor.append(button('Präferenzänderung prüfen',()=>{
      invalidate();if(!same(c))return;
      const proposal=validateWorkspaceNotificationPreferencesWriteV1({schemaVersion:'pansphaira.workspace-notifications/preferences-write/v1',expectedRevision:before.revision,preferences:{inAppEnabled:enabled.checked,filter:filter.value,subscriptions:subscribed.checked?[WORKSPACE_NOTIFICATION_KIND_V1]:[]}});
      const diff=document.createElement('section');diff.dataset.notification='preferences-diff';diff.tabIndex=-1;
      diff.append(text('h3','Vorschlag: nur persönliche Hinweispräferenzen'),text('p','Filter: '+before.filter+' → '+proposal.preferences.filter+'; In-App: '+before.inAppEnabled+' → '+proposal.preferences.inAppEnabled+'; Abonnement: '+before.subscriptions.length+' → '+proposal.preferences.subscriptions.length+'. Präferenzrevision '+before.revision+'.'),text('p','Hinweise werden persönlich ausgeblendet/gefiltert. Auftrag bleibt bestehen. Keine Freigabe, Ausführung, Löschung fachlicher Ereignisse oder neuen Rechte.'));
      diff.append(button('Persönliche Hinweispräferenzen bestätigen',()=>{void savePreferences(proposal,c);}),button('Präferenzvorschlag verwerfen',()=>{diff.remove();}));editor.append(diff);diff.focus();
    }),button('Hinweispräferenzen schließen',()=>{editor.remove();}));root.append(editor);filter.focus();
  }
  async function savePreferences(proposal:WorkspaceNotificationPreferencesWriteV1,c:BrowserContextV1){
    if(!same(c)||pendingRead)return;busy('PREFERENCES_PENDING','Nur persönliche Hinweispräferenzen speichern — Auftrag bleibt bestehen …');
    try{
      const result=validateWorkspaceNotificationPreferencesV1(await request('/preferences',c,proposal));
      if(result.revision!==proposal.expectedRevision+1||result.inAppEnabled!==proposal.preferences.inAppEnabled||result.filter!==proposal.preferences.filter||JSON.stringify(result.subscriptions)!==JSON.stringify(proposal.preferences.subscriptions))throw new Error('NOTIFICATION_PREFERENCES_UNCONFIRMED');
      if(same(c))await refresh();
    }catch(error){
      if(!same(c))return;if(error instanceof Error&&error.message==='NOTIFICATION_SESSION_DENIED'){failRead(error,c);return;}
      feed=null;state('PREFERENCE_OUTCOME_UNKNOWN','Präferenzänderung ungeklärt. Keine Erfolgsmeldung und kein blindes erneutes Senden. Erst aktuellen autoritativen Zustand lesen.');root.append(button('Persönliche Präferenzen autoritativ lesen',()=>{void refresh();}));
    }
  }
  const statusText=(e:WorkspaceNotificationEventV1)=>e.status==='OPEN'?(e.read?'Gelesen — Auftrag weiterhin offen':'Ungelesen — Auftrag weiterhin offen'):{DONE:'Fachlicher Auftrag erledigt; persönlicher Lesestatus ist davon getrennt.',REMOVED:'Hinweis entfallen — keine Lesebestätigung oder Freigabe erfunden.',OBSOLETE:'Objektversion geändert — alten Vorgang nicht öffnen.',PLUGIN_REMOVED:'Zielplugin entfernt — Vorgang nicht öffnen.',PLUGIN_DISABLED:'Zielplugin deaktiviert oder nicht zugelassen — Vorgang nicht öffnen.',EXPIRED:'Hinweis abgelaufen — Vorgang nicht öffnen.'}[e.status];
  function render(value:WorkspaceNotificationsFeedV1){
    state(value.events.length?'FEED_READY':'EMPTY',value.events.length?'Gebundene native Hinweise gelesen. Öffnen ist nur Lesen; gelesen ist nicht erledigt.':'Keine Hinweise im erlaubten persönlichen Filter. Dies ist kein Nachweis abgeschlossener Aufträge.');
    const feedback=text('p','');feedback.dataset.notification='feedback';feedback.setAttribute('role','status');root.append(feedback);
    for(const e of value.events){const article=document.createElement('article');article.className='notification-row';article.dataset.notificationRead=String(e.read);article.dataset.notificationStatus=e.status;
      article.append(text('h3','Synthetischer Freigabehinweis zur Eingangsrechnung '+e.target.params.objectId),text('p',statusText(e)),text('p','Keine produktive Freigabe und keine Ausführung aus einem Hinweis.'));
      if(e.status==='OPEN'){const controls=document.createElement('div');controls.className='notification-controls';controls.append(button('Rechnung '+e.target.params.objectId+' öffnen — nur lesen',()=>{void open(e);}));if(!e.read){const b=button('Lesestatus ändern — Auftrag bleibt offen',()=>proposeRead(e));b.dataset.notificationAction='read';controls.append(b);}article.append(controls);}root.append(article);
    }
    root.append(button('Hinweise neu lesen',()=>{void refresh();}),button('Hinweispräferenzen ändern',preferencesEditor));
  }
  async function refresh(){
    if(closed||signal.aborted)return;const c=context();const current=++epoch;requestAbort.abort();requestAbort=new AbortController();feed=null;
    if(pendingRead&&(pendingRead.sessionId!==c.sessionId||pendingRead.tenantId!==c.tenantId))pendingRead=null;
    if(pendingRead){unknown();return;}
    state('LOADING','Geschützte persönliche Hinweise werden gelesen …');
    try{const v=validateWorkspaceNotificationsFeedV1(await request('',c),c.tenantId);if(current!==epoch||!same(c))return;feed=v;render(v);}
    catch(error){if(current===epoch)failRead(error,c);}
  }
  function close(){closed=true;epoch++;requestAbort.abort();pendingRead=null;feed=null;root.replaceChildren();root.hidden=true;}
  signal.addEventListener('abort',close,{once:true});return Object.freeze({refresh,close});
}
