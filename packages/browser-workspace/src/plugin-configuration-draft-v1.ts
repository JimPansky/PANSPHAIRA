import type { BrowserShellPluginV1 } from "../../contracts/src/browser-shell-plugin-v1.js";
import type { BrowserShellFactoryV1 } from "../../browser-shell/src/registry-v1.js";
import type { AgentConfigurationReadbackV1, AgentConfigurationFieldV1, AgentConfigurationValueV1 } from "../../contracts/src/agent-configuration-draft-v1.js";
import type { BrowserContextV1 } from "../../browser-shell/src/context-owner-v1.js";
import { text } from "./api-v1.js";
import type {WorkspaceDirtyDraftV1} from './workspace-dirty-draft-v1.js';
export const configurationDraftPluginV1: BrowserShellPluginV1 = {
  schemaVersion:"pansphaira.browser-plugin/v1",id:"pan.configuration",version:"1.0.0",shellVersion:"1.0.0",enabled:true,
  trustBoundary:"TRUSTED_IN_PROCESS_CODE_OWNED_FACTORIES",
  needs:{data:["agent.configuration.draft"],context:["tenantId","sessionId"],rights:["demo.status.read"],dependencies:[]},
  contributions:[
    {id:"pan.configuration.route",kind:"ROUTE",slot:"shell.routes",factoryId:null,routeId:"pan.configuration.route",path:"/workspace/configuration",label:"Agentenkonfiguration — Entwurf"},
    {id:"pan.configuration.navigation",kind:"NAVIGATION",slot:"shell.navigation",factoryId:"pan.configuration.navigation",routeId:"pan.configuration.route",path:null,label:"Agentenkonfiguration — Entwurf"},
    {id:"pan.configuration.view",kind:"VIEW",slot:"shell.main",factoryId:"pan.configuration.view",routeId:"pan.configuration.route",path:null,label:"Agentenkonfiguration — Entwurf"},
  ],
};
type Readback = AgentConfigurationReadbackV1;
const groupLabels:Record<string,string>={context:"Kontext",goal:"Aufgabe und Profil",runtime:"Runtime",model:"Modell",access:"Zugang und Prüfstatus",data:"Daten",tools:"Werkzeuge",work:"Arbeitsregeln",budget:"Budgets",persistence:"Gedächtnis und Nachweise",modules:"Optionale Fachmodule"};
const valueLabels:Record<string,string>={"de-DE":"Deutsch","en-GB":"Englisch","employee.business.help":"Begrenzte Unterstützung bei der Arbeit","employee.directory.summary":"Eigenes Mitarbeiterverzeichnis zusammenfassen",
  "employee-own-directory/v1":"Eigenes Mitarbeiterverzeichnis","pan441-pan529/v1":"Geprüfter Profil-/Runtimeadapter v1","OWNER_BOUND_LOCAL":"Eigener geschützter lokaler Dienst",
  "capability:employee.directory.read.own":"Eigenes Mitarbeiterverzeichnis lesen","synthetic-bounded/v1":"Nur synthetische lokale Referenz — kein echter KI-Agent","NONE":"Nicht ausgewählt",
  "SYNTHETIC_LOCAL_NO_PROVIDER":"Lokale Synthetik, kein Modellanbieter","BOUNDED_SYNTHETIC_READ":"Begrenzte synthetische Leseprobe","NO_CREDENTIAL":"Kein Zugangsmittel erforderlich","NOT_RUN":"Nicht ausgeführt",
  "employee.directory.own":"Eigenes Mitarbeiterverzeichnis","OWN_REQUESTING_USER":"Nur anfragender Nutzer","READ":"Lesen","READ_ONLY":"Nur lesen","NO_EFFECT_AUTHORIZATION":"Keine Wirkung durch diesen Entwurf autorisiert",
  "DRAFT_ONLY":"Nur Konfigurationsentwurf","UNTIL_OWNER_DELETION":"Bis zur ausdrücklichen Owner-Löschung","NO_SECRETS_NO_BUSINESS_PAYLOADS":"Keine Secrets oder fachlichen Nutzdaten",
  "OWN_SCOPED_DRAFT_ONLY":"Nur eigener Konfigurationsentwurf","AUTHENTICATED_USER_TENANT_INSTANCE":"Getrennt nach Nutzer, Mandant und Instanz",
  displayName:"Anzeigename",department:"Abteilung",jobTitle:"Berufsbezeichnung",employeeAlias:"Mitarbeiteralias"};
function displayValue(value:AgentConfigurationValueV1|null):string {
  if(value===null)return "Noch nicht festgelegt / kein Zugangsmittel";
  if(Array.isArray(value))return value.map(v=>displayValue(v)).join(", ");
  return valueLabels[String(value)] ?? (String(value).startsWith("bounded-") ? "Geprüfte begrenzte Runtimevorlage" : String(value));
}
export function createConfigurationDraftViewV1(context:()=>BrowserContextV1,registerDraft?:(draft:WorkspaceDirtyDraftV1)=>()=>void): BrowserShellFactoryV1<HTMLElement> {
  return {kind:"VIEW",async render({target,signal}) {
    target.classList.add("configuration-draft"); target.dataset.backend="configuration";
    const captured=context(); const base="/t/"+captured.tenantId;
    let current:Readback|null=null; let busy=false;let saveInFlight=false;let needsReconciliation=false;let dirty=false;
    const unregister=registerDraft?.({id:'AGENT_CONFIGURATION',label:'Konfiguration',isDirty:()=>active()&&(dirty||saveInFlight||needsReconciliation),async discardForNavigation(){if(!active()||busy||needsReconciliation)return false;dirty=false;show();return true;}});
    signal.addEventListener('abort',()=>unregister?.(),{once:true});
    const heading=text("h1","Versionierter Agentenkonfigurationsentwurf");
    const note=text("p","Nur erlaubte Konfiguration wird dauerhaft gespeichert. Keine Aktivierung, keine Rechtevergabe, keine fachlichen Änderungen und kein kostenpflichtiger Modellaufruf.");
    const status=text("p","");status.className="read-state";status.setAttribute("role","status");status.setAttribute("aria-live","polite");
    const body=text("div","");const editor=text("div","");editor.className="configuration-editor";
    const reload=text("button","Aktuellen Entwurf neu laden") as HTMLButtonElement;reload.type="button";
    const noAi=text("button","Ohne KI fortfahren") as HTMLButtonElement;noAi.type="button";
    noAi.addEventListener("click",()=>{void save("model.reference","NONE","CONFIRM");},{signal});
    target.append(heading,note,status,reload,noAi,editor,body);
    function active(){return !signal.aborted && context().sessionId === captured.sessionId && context().tenantId === captured.tenantId;}
    function state(outcome:string,message:string){if(active()){target.dataset.outcome=outcome;status.textContent=message;}}
    function controls(disabled:boolean){for(const node of target.querySelectorAll<HTMLButtonElement|HTMLInputElement|HTMLSelectElement>("button,input,select"))node.disabled=disabled || (needsReconciliation && node !== reload);noAi.disabled=disabled || needsReconciliation || !current || current.draft.fields["model.reference"].value === "NONE";}
    async function request(method:"GET"|"POST",payload?:unknown) {
      const fresh=await fetch(base+"/workspace/context",{credentials:"same-origin",cache:"no-store",signal});
      const binding=fresh.status === 200 ? await fresh.json() as BrowserContextV1 : null;
      if(!active() || binding?.sessionId !== captured.sessionId || binding.tenantId !== captured.tenantId) return {status:401,value:null};
      const response=await fetch(base+"/workspace/configuration",{method,credentials:"same-origin",cache:"no-store",signal,
        ...(method === "POST" ? {headers:{"content-type":"application/json","x-pan563-context":captured.sessionId},body:JSON.stringify(payload)} : {})});
      const value=await response.json() as Readback & {error?:string};
      const after=await fetch(base+"/workspace/context",{credentials:"same-origin",cache:"no-store",signal});
      const afterBinding=after.status === 200 ? await after.json() as BrowserContextV1 : null;
      if(!active() || afterBinding?.sessionId !== captured.sessionId) return {status:401,value:null};
      return {status:response.status,value};
    }
    function accepted(value:Readback|null): value is Readback {
      return !!value && value.schemaVersion === "pansphaira.agent-configuration/readback/v1" && value.activationAuthorized === false
        && Number.isSafeInteger(value.revision) && value.revision >= 0 && value.draft?.schemaVersion === "pansphaira.agent-configuration/draft/v1"
        && value.draft.adapterVersion === "pan441-pan529/v1" && value.draft.policyDigest === value.policyDigest && Array.isArray(value.questions)
        && value.authorityContext?.source === "PROTECTED_BACKEND" && value.authorityContext.tenantId === captured.tenantId && value.authorityContext.executionAuthorityGranted === false
        && !!value.definitions && Object.values(value.definitions).every(d=>d.schemaVersion === "pansphaira.agent-configuration/field/v1" && d.version === "1.0.0");
    }
    function failure(code:number,error?:string) {
      if ([401,403].includes(code)) { current=null;body.replaceChildren();editor.replaceChildren(); }
      state(code === 409 ? "CONFLICT" : [401,403].includes(code) ? "DENIED" : "ERROR",
        code === 409 && error === "CONFIGURATION_POLICY_CHANGED_REJECT_REQUIRES_RECONFIRMATION" ? "Profil oder Runtimevorlage ist nicht mehr kompatibel. Der ursprüngliche Entwurf bleibt erhalten; eine geprüfte Migration oder erneute Bestätigung durch den zuständigen Owner ist erforderlich."
        : code === 409 ? "Revisionskonflikt: Ein anderer Tab hat den Entwurf geändert. Ihre Eingabe wurde nicht überschrieben. Aktuellen Entwurf ausdrücklich neu laden und prüfen."
        : [401,403].includes(code) ? "Zugriff verweigert: Die aktuelle Session oder Kontextbindung ist nicht mehr gültig. Es wurde kein erfolgreicher Speichervorgang bestätigt."
        : "Konfigurationsbackend nicht verfügbar oder Eingabe abgelehnt. Kein erfolgreicher Speichernachweis. "+(error??""));
    }
    async function save(field:AgentConfigurationFieldV1,value:AgentConfigurationValueV1|null,confirmation:"CONFIRM"|"UNKNOWN") {
      if(!current || busy || needsReconciliation || !active())return;busy=true;saveInFlight=true;controls(true);state("SAVING","Entwurf wird mit erwarteter Revision gespeichert und anschließend erneut gelesen …");
      try {
        const result=await request("POST",{schemaVersion:"pansphaira.agent-configuration/answers/v1",expectedRevision:current.revision,answers:[{field,value,confirmation}]});
        if(!active())return;
        if(result.status !== 200){failure(result.status,result.value?.error);return;}
        if(!accepted(result.value))throw new Error("Ungültiger Zielreadback");
        const readback=await request("GET");if(!active())return;
        if(readback.status !== 200 || !accepted(readback.value) || readback.value.revision !== result.value.revision || JSON.stringify(readback.value.draft) !== JSON.stringify(result.value.draft)) throw new Error("Persistierter Zielreadback stimmt nicht überein");
        current=readback.value;dirty=false;show();state("PERSISTED","Entwurf gespeichert und identisch vom zuständigen Backend erneut gelesen. Revision "+current.revision+".");
        editor.querySelector<HTMLElement>("select,input,button")?.focus();
      } catch(e){if(active()){needsReconciliation=true;state("OUTCOME_UNKNOWN","Speicherausgang unklar: Der Server kann den Entwurf bereits gespeichert haben. Keine automatische Wiederholung. Vor weiteren Änderungen den aktuellen Entwurf ausdrücklich neu laden und abgleichen. "+(e instanceof Error?e.message:"Unbekannter Backendfehler"));}}
      finally{busy=false;saveInFlight=false;if(active())controls(false);}
    }
    function edit(field:AgentConfigurationFieldV1,question=false) {
      if(!current)return;editor.replaceChildren();
      const definition=current.definitions[field];const existing=current.draft.fields[field];
      const title=text("h2",definition.label);title.id="configuration-question";
      const form=document.createElement("form");form.setAttribute("aria-labelledby",title.id);
      const detail=text("p",definition.help["de-DE"]+" "+(question ? "Nur diese notwendige Antwort ist aktuell ungelöst. Herkunft und Bestätigung setzt der Server, nicht der Browser." : "Eine Änderung macht nur abhängige Antworten und Prüfungen ungültig."));
      let readValue:()=>AgentConfigurationValueV1|null;
      if(definition.type === "SET") {
        const fieldset=document.createElement("fieldset");fieldset.append(text("legend",definition.label));
        const inputs:HTMLInputElement[]=[];
        for(const value of definition.allowedValues){const label=document.createElement("label");const input=document.createElement("input");input.type="checkbox";input.value=String(value);input.checked=Array.isArray(existing.value)&&existing.value.includes(String(value));inputs.push(input);label.append(input,document.createTextNode(displayValue(value)));fieldset.append(label);}
        form.append(fieldset);readValue=()=>inputs.filter(i=>i.checked).map(i=>i.value);
      } else if(definition.type === "INTEGER") {
        const label=document.createElement("label");label.textContent=definition.label;const input=document.createElement("input");input.type="number";input.min=String(definition.allowedValues[0]);input.max=String(definition.allowedValues[1]);input.step="1";input.required=true;input.value=typeof existing.value === "number" ? String(existing.value) : "";label.append(input);form.append(label);readValue=()=>Number(input.value);
      } else {
        const label=document.createElement("label");label.textContent=definition.label;const select=document.createElement("select");select.required=true;
        const empty=document.createElement("option");empty.value="";empty.textContent="Bitte ausdrücklich auswählen — kein stiller Default";select.append(empty);
        for(const value of definition.allowedValues){const option=document.createElement("option");option.value=JSON.stringify(value);option.textContent=value === null ? "Keine Secretreferenz erforderlich" : displayValue(value);select.append(option);}
        if(existing.confirmation !== "UNKNOWN" && existing.confirmation !== "CONTRADICTED") select.value=JSON.stringify(existing.value);
        select.id="configuration-value";label.htmlFor=select.id;form.append(label,select);readValue=()=>JSON.parse(select.value) as AgentConfigurationValueV1|null;
      }
      form.addEventListener('input',()=>{dirty=true;},{signal});form.addEventListener('change',()=>{dirty=true;},{signal});
      const submit=text("button","Bestätigen und Entwurf speichern") as HTMLButtonElement;submit.type="submit";
      const unknown=text("button","Als unbekannt speichern") as HTMLButtonElement;unknown.type="button";
      form.append(submit,unknown);form.addEventListener("submit",e=>{e.preventDefault();void save(field,readValue(),"CONFIRM");},{signal});
      unknown.addEventListener("click",()=>{void save(field,null,"UNKNOWN");},{signal});editor.append(title,detail,form);
    }
    function show() {
      if(!current)return;body.replaceChildren();editor.replaceChildren();
      body.append(text("h2","Aktuelle Parameter und Herkunft"),text("p","Profil: "+current.profileId+" · Schema v1 · Adapter pan441-pan529/v1 · Revision "+current.revision));
      body.append(text("p","Identität aus dem geschützten Backend: Mandant "+current.authorityContext.tenantId+", Instanz "+current.authorityContext.instanceId+", Nutzer "+current.authorityContext.subjectId+". Identität und Rechte sind keine bearbeitbaren Parameter."));
      const groups=new Map<string,HTMLUListElement>();
      for(const field of Object.keys(current.definitions) as AgentConfigurationFieldV1[]) {
        const f=current.draft.fields[field];const d=current.definitions[field];const li=document.createElement("li");
        let list=groups.get(d.group);
        if(!list){const section=document.createElement("details");section.className="configuration-group";section.open=["context","goal"].includes(d.group);section.append(text("summary",groupLabels[d.group]??d.group));list=document.createElement("ul");list.className="configuration-parameters";section.append(list);body.append(section);groups.set(d.group,list);}
        const source=f.source === "PROFILE_TEMPLATE" ? "Geprüftes Profil / Runtimevorlage" : f.source === "SESSION_USER" ? "Antwort des angemeldeten Nutzers" : "Noch ungeklärt";
        const confirmation={CONFIRMED:"Bestätigt",UNKNOWN:"Unbekannt",STALE:"Erneut bestätigen",CONTRADICTED:"Widersprüchlich"}[f.confirmation];
        const validation={CURRENT:"Aktuell",UNKNOWN:"Offen",STALE:"Erneut prüfen"}[f.validation.status];
        const applicable=d.requiredWhen !== "SYNTHETIC_MODEL" || current.draft.fields["model.reference"].value === "synthetic-bounded/v1";
        li.append(text("strong",d.label),text("p",applicable ? displayValue(f.value) : "Ohne Modell nicht anwendbar — ursprünglicher Wert bleibt im Entwurf erhalten"),text("p","Quelle: "+source+" · "+confirmation+" · Prüfung: "+validation));
        const technical=document.createElement("details");technical.append(text("summary","Technische Details"),text("pre",JSON.stringify({field,definition:d,state:f},null,2)));li.append(technical);
        const button=text("button","Bearbeiten: "+d.label) as HTMLButtonElement;button.type="button";button.addEventListener("click",()=>{edit(field);editor.querySelector<HTMLElement>("select,input,button")?.focus();},{signal});li.append(button);list.append(li);
      }
      noAi.disabled=current.draft.fields["model.reference"].value === "NONE";
      if(current.questions.length)edit(current.questions[0]!.field,true);
      else editor.append(text("h2","Keine fehlenden Pflichtfragen"),text("p","Die bestätigte normalisierte Konfiguration ist vollständig. Konfigurationsdigest: "+current.configurationDigest));
    }
    async function load() {
      if(busy)return;busy=true;controls(true);state("LOADING","Versionierter Entwurf wird vom zuständigen Backend gelesen …");
      try{const result=await request("GET");if(!active())return;if(result.status !== 200){failure(result.status,result.value?.error);return;}if(!accepted(result.value))throw new Error("Ungültiger Backendvertrag");
        current=result.value;needsReconciliation=false;dirty=false;show();state(current.persisted?"READBACK_RECEIVED":"EMPTY",current.persisted?"Gespeicherten Entwurf gelesen. Revision "+current.revision+".":"Noch kein gespeicherter Entwurf. Geprüftes begrenztes Profil ist vorbelegt; ungelöste Pflichtwerte bleiben ausdrücklich unbekannt.");
      }catch(e){if(active())failure(503,e instanceof Error?e.message:"Unbekannter Backendfehler");}finally{busy=false;if(active())controls(false);}
    }
    reload.addEventListener("click",()=>{void load();},{signal});await load();
  }};
}
