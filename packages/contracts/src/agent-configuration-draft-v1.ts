import { createHash } from "node:crypto";
import { canonicalJson } from "./canonical-json.js";
import { verifyPan441ProfileV1 } from "./pan441-employee-profile.js";
import { readCcpClosedObjectV1, readCcpDenseArrayV1 } from "./ccp-event-envelope.js";

export const AGENT_CONFIGURATION_DRAFT_SCHEMA_V1 = "pansphaira.agent-configuration/draft/v1" as const;
export const AGENT_CONFIGURATION_ANSWERS_SCHEMA_V1 = "pansphaira.agent-configuration/answers/v1" as const;
export const AGENT_CONFIGURATION_ADAPTER_V1 = "pan441-pan529/v1" as const;
export interface AgentConfigurationValuesV1 {
  "context.locale": "de-DE" | "en-GB";
  "context.timezone": "UTC" | "Europe/Berlin";
  "goal.purpose": "employee.business.help" | "employee.directory.summary";
  "goal.agentName": "Mitarbeiterassistenz";
  "goal.useCase": "employee-own-directory/v1";
  "runtime.templateId": string;
  "runtime.adapterId": typeof AGENT_CONFIGURATION_ADAPTER_V1;
  "runtime.version": string;
  "runtime.location": "OWNER_BOUND_LOCAL";
  "runtime.capabilities": readonly string[];
  "model.reference": "synthetic-bounded/v1" | "NONE";
  "model.connection": "SYNTHETIC_LOCAL_NO_PROVIDER";
  "model.requirements": "BOUNDED_SYNTHETIC_READ";
  "model.maxInputBytes": number;
  "model.maxOutputBytes": number;
  "model.maxTokens": number;
  "model.secretReference": null; // This adapter needs no credential. Other refs require a new reviewed adapter.
  "access.authMode": "NO_CREDENTIAL";
  "access.checkStatus": "NOT_RUN";
  "data.fields": readonly string[];
  "data.source": "employee.directory.own";
  "data.scope": "OWN_REQUESTING_USER";
  "data.operation": "READ";
  "data.purpose": "employee.business.help";
  "tools.capabilities": readonly string[];
  "work.mode": "READ_ONLY";
  "work.confirmation": "NO_EFFECT_AUTHORIZATION";
  "work.timeoutMs": number;
  "work.maxSteps": number;
  "work.parallelism": number;
  "work.maxRequests": number;
  "budget.modelUnits": number;
  "budget.runtimeUnits": number;
  "persistence.mode": "DRAFT_ONLY";
  "persistence.retention": "UNTIL_OWNER_DELETION";
  "persistence.redaction": "NO_SECRETS_NO_BUSINESS_PAYLOADS";
  "persistence.deletionScope": "OWN_SCOPED_DRAFT_ONLY";
  "persistence.scope": "AUTHENTICATED_USER_TENANT_INSTANCE";
  "modules.selection": "NONE";
}
export type AgentConfigurationFieldV1 = keyof AgentConfigurationValuesV1;
export type AgentConfigurationValueV1 = AgentConfigurationValuesV1[AgentConfigurationFieldV1];
export type AgentConfigurationAnswerV1 = { [K in AgentConfigurationFieldV1]: Readonly<{
  field: K; value: AgentConfigurationValuesV1[K]; confirmation: "CONFIRM";
}> | Readonly<{ field: K; value: null; confirmation: "UNKNOWN" }> }[AgentConfigurationFieldV1];
export interface AgentConfigurationAnswersV1 {
  readonly schemaVersion: typeof AGENT_CONFIGURATION_ANSWERS_SCHEMA_V1;
  readonly expectedRevision: number;
  readonly answers: readonly AgentConfigurationAnswerV1[];
}
export interface AgentConfigurationFieldDefinitionV1 {
  readonly schemaVersion: "pansphaira.agent-configuration/field/v1";
  readonly version: "1.0.0";
  readonly group: "context" | "goal" | "runtime" | "model" | "access" | "data" | "tools" | "work" | "budget" | "persistence" | "modules";
  readonly type: "ENUM" | "SET" | "INTEGER" | "SECRET_REFERENCE";
  readonly allowedValues: readonly AgentConfigurationValueV1[];
  readonly requiredWhen: "ALWAYS" | "SYNTHETIC_MODEL" | "OPTIONAL";
  readonly validator: "MEMBER" | "NONEMPTY_SUBSET" | "BOUNDED_INTEGER" | "NO_CREDENTIAL_REQUIRED";
  readonly sensitivity: "PUBLIC_CONFIGURATION" | "SCOPED_CONFIGURATION" | "SECRET_REFERENCE_ONLY";
  readonly dependencies: readonly AgentConfigurationFieldV1[];
  readonly label: string;
  readonly help: Readonly<Record<"de-DE" | "en-GB", string>>;
}
export interface AgentConfigurationFieldStateV1 {
  readonly value: AgentConfigurationValueV1 | null;
  readonly source: "PROFILE_TEMPLATE" | "SESSION_USER" | "UNRESOLVED";
  readonly confirmation: "CONFIRMED" | "UNKNOWN" | "STALE" | "CONTRADICTED";
  readonly validation: Readonly<{ status: "CURRENT" | "UNKNOWN" | "STALE"; digest: string | null }>;
}
export interface AgentConfigurationDraftV1 {
  readonly schemaVersion: typeof AGENT_CONFIGURATION_DRAFT_SCHEMA_V1;
  readonly adapterVersion: typeof AGENT_CONFIGURATION_ADAPTER_V1;
  readonly policyDigest: string;
  readonly fields: Readonly<Record<AgentConfigurationFieldV1, AgentConfigurationFieldStateV1>>;
}
export interface AgentConfigurationNormalizedV1 {
  readonly schemaVersion: "pansphaira.agent-configuration/normalized/v1";
  readonly adapterVersion: typeof AGENT_CONFIGURATION_ADAPTER_V1;
  readonly profileId: string;
  readonly profileDigest: string;
  readonly runtimeTemplateDigest: string;
  readonly policyDigest: string;
  readonly parameters: Readonly<{ [K in AgentConfigurationFieldV1]: AgentConfigurationValuesV1[K] | null }>;
  readonly authorityGranted: false;
  readonly activationAuthorized: false;
}
export interface AgentConfigurationPolicyV1 {
  readonly schemaVersion: "pansphaira.agent-configuration/policy-binding/v1";
  readonly adapterVersion: typeof AGENT_CONFIGURATION_ADAPTER_V1;
  readonly profileId: string;
  readonly profileDigest: string;
  readonly runtimeTemplateDigest: string;
  readonly identityDigest: string;
  readonly supportedVersions: Readonly<{ draft: readonly [typeof AGENT_CONFIGURATION_DRAFT_SCHEMA_V1]; answers: readonly [typeof AGENT_CONFIGURATION_ANSWERS_SCHEMA_V1]; adapter: readonly [typeof AGENT_CONFIGURATION_ADAPTER_V1]; runtime: "node >=24.14.1 <25; portable identity 1.0.0"; model: readonly ["synthetic-bounded/v1", "NONE"]; migration: "REJECT_UNSUPPORTED_RETAIN_ORIGINAL" }>;
  readonly fields: Readonly<Record<AgentConfigurationFieldV1, AgentConfigurationFieldDefinitionV1>>;
  readonly policyDigest: string;
}
// Only code-owner bindings create policies. They are not another registry or policy engine.
const ownedPolicies = new WeakSet<object>();
const hash = (v: unknown): string => createHash("sha256").update(canonicalJson(v)).digest("hex");
function freeze<T>(v: T): T {
  if (v !== null && typeof v === "object") { for (const c of Object.values(v)) freeze(c); Object.freeze(v); } return v;
}
export function configurationClosedObjectV1(value: unknown, keys: readonly string[]): Readonly<Record<string, unknown>> {
  return readCcpClosedObjectV1(value, keys, new WeakSet(), "CONFIGURATION_SCHEMA_DENIED");
}
const denied = (code: string): never => { throw new Error("CONFIGURATION_" + code); };
function dataOnly(value: unknown, depth = 0): void {
  if (depth > 8) return denied("SCHEMA_DENIED");
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string" && value.length <= 4096) return;
  if (typeof value === "number" && Number.isSafeInteger(value) && !Object.is(value, -0)) return;
  if (Array.isArray(value)) { const array = readCcpDenseArrayV1(value, new WeakSet(), "CONFIGURATION_SCHEMA_DENIED"); if (array.length > 64) return denied("SCHEMA_DENIED"); for (const child of array) dataOnly(child, depth + 1); return; }
  if (value && typeof value === "object") { const record = configurationClosedObjectV1(value, Object.keys(value)); if (Object.keys(record).length > 32) return denied("SCHEMA_DENIED"); for (const child of Object.values(record)) dataOnly(child, depth + 1); return; }
  return denied("SCHEMA_DENIED");
}
function policyOwned(p: AgentConfigurationPolicyV1) { if (!ownedPolicies.has(p)) denied("POLICY_BINDING_DENIED"); }
/** Supplied template is verified by the PAN529 owner adapter before this pure binding. */
export function bindAgentConfigurationPolicyV1(profileValue: unknown, templateValue: unknown): AgentConfigurationPolicyV1 {
  const profile = verifyPan441ProfileV1(profileValue);
  const t = configurationClosedObjectV1(templateValue, ["schemaVersion","templateId","identity","identityDigest","providerMode","resourceClass","activationAuthorized","runtimeTemplateDigest"]);
  dataOnly(templateValue);
  const identity = configurationClosedObjectV1(t.identity, ["schemaVersion","componentId","sourceCommit","sourceTree","imageDigest","architecture","productVersion","runtime","contractVersion","instanceId","tenantId","generation","configurationDigest","templateDigest","policyDigest","networkDigest","authorityProfile","effectiveRights"]);
  const runtime = configurationClosedObjectV1(identity.runtime, ["name","version"]);
  const version = typeof runtime.version === "string" ? /^24\.([0-9]+)\.([0-9]+)$/.exec(runtime.version) : null;
  if (runtime.name !== "node" || !version || Number(version[1]) < 14 || (Number(version[1]) === 14 && Number(version[2]) < 1)
    || identity.schemaVersion !== "pansphaira.portable-runtime/identity/v1" || identity.contractVersion !== "1.0.0" || identity.componentId !== "pansphaira-local-demo") return denied("RUNTIME_VERSION_UNSUPPORTED");
  if (t.schemaVersion !== "pansphaira.portable-runtime/template/v1" || t.providerMode !== "SYNTHETIC_ONLY" || t.activationAuthorized !== false
      || typeof t.templateId !== "string" || !/^bounded-[a-z0-9-]+-v1$/.test(t.templateId)
      || typeof t.identityDigest !== "string" || !/^[a-f0-9]{64}$/.test(t.identityDigest)) return denied("TEMPLATE_UNSUPPORTED");
  const { runtimeTemplateDigest, ...core } = t;
  if (runtimeTemplateDigest !== hash(core)) return denied("TEMPLATE_UNSUPPORTED");
  const resource = configurationClosedObjectV1(t.resourceClass,["name","modelReservationUnits","runtimeReservationUnits","maxInputBytes","maxOutputBytes","maxTokens","maxRequests","timeoutMs"]);
  // v1 deliberately supports exactly the bounded resource class, not arbitrary provider capabilities.
  if (resource.name !== "bounded-native-read-v1" || resource.modelReservationUnits !== 64 || resource.runtimeReservationUnits !== 1
    || resource.maxInputBytes !== 4096 || resource.maxOutputBytes !== 8192 || resource.maxTokens !== 32
    || resource.maxRequests !== 32 || resource.timeoutMs !== 20000 || t.identityDigest !== hash(t.identity)) return denied("TEMPLATE_UNSUPPORTED");
  const d = (group: AgentConfigurationFieldDefinitionV1["group"], type: AgentConfigurationFieldDefinitionV1["type"], allowedValues: readonly AgentConfigurationValueV1[], label: string,
    dependencies: readonly AgentConfigurationFieldV1[] = [], requiredWhen: AgentConfigurationFieldDefinitionV1["requiredWhen"] = "ALWAYS"): AgentConfigurationFieldDefinitionV1 => ({
      schemaVersion:"pansphaira.agent-configuration/field/v1",version:"1.0.0",group, type, allowedValues, label, dependencies, requiredWhen,
      help:{"de-DE":"Dieser Entwurfswert stammt aus dem geprüften Profil-/Runtimeadapter. Änderungen dürfen dessen Grenzen nur einschränken; sie vergeben keine Rechte und führen keine Aktion aus.",
        "en-GB":"This draft value comes from the verified profile/runtime adapter. Changes may only restrict its ceilings; they grant no rights and execute no action."},
      validator: type === "SET" ? "NONEMPTY_SUBSET" : type === "INTEGER" ? "BOUNDED_INTEGER" : type === "SECRET_REFERENCE" ? "NO_CREDENTIAL_REQUIRED" : "MEMBER",
      sensitivity: type === "SECRET_REFERENCE" ? "SECRET_REFERENCE_ONLY" : ["data","tools"].includes(group) ? "SCOPED_CONFIGURATION" : "PUBLIC_CONFIGURATION",
    });
  const fields: AgentConfigurationPolicyV1["fields"] = {
    "context.locale": d("context","ENUM",["de-DE","en-GB"],"Sprache der Arbeitsoberfläche"),
    "context.timezone": d("context","ENUM",["UTC","Europe/Berlin"],"Zeitzone des geplanten Arbeitsplatzes"),
    "goal.purpose": d("goal","ENUM",["employee.business.help","employee.directory.summary"],"Ziel und Zweck der begrenzten Mitarbeiterassistenz"),
    "goal.agentName": d("goal","ENUM",["Mitarbeiterassistenz"],"Agentenname des begrenzten Profils"),
    "goal.useCase": d("goal","ENUM",["employee-own-directory/v1"],"Initialer Anwendungsfall — eigenes Mitarbeiterverzeichnis"),
    "runtime.templateId": d("runtime","ENUM",[t.templateId],"Geprüfte Runtimevorlage"),
    "runtime.adapterId": d("runtime","ENUM",[AGENT_CONFIGURATION_ADAPTER_V1],"Zugelassener Profil-/Runtimeadapter",["runtime.templateId"]),
    "runtime.version": d("runtime","ENUM",[runtime.version as string],"Geprüfte Node-Runtimeversion",["runtime.templateId"]),
    "runtime.location": d("runtime","ENUM",["OWNER_BOUND_LOCAL"],"Betriebsort — an eigenen geschützten Dienst gebunden",["runtime.templateId"]),
    "runtime.capabilities": d("runtime","SET",[profile.capability.capabilityId],"Verfügbare qualifizierte Runtimefähigkeit",["runtime.templateId"]),
    "model.reference": d("model","ENUM",["synthetic-bounded/v1","NONE"],"Modellreferenz — ausschließlich synthetisch oder kein Modell",["runtime.templateId"]),
    "model.connection": d("model","ENUM",["SYNTHETIC_LOCAL_NO_PROVIDER"],"Modellverbindung — nur lokale synthetische Referenz",["model.reference"],"SYNTHETIC_MODEL"),
    "model.requirements": d("model","ENUM",["BOUNDED_SYNTHETIC_READ"],"Modellanforderung — begrenzte synthetische Leseprobe",["model.reference"],"SYNTHETIC_MODEL"),
    "model.maxInputBytes": d("model","INTEGER",[1,resource.maxInputBytes as number],"Maximale Modelleingabe in Bytes",["model.reference"],"SYNTHETIC_MODEL"),
    "model.maxOutputBytes": d("model","INTEGER",[1,resource.maxOutputBytes as number],"Maximale Modellausgabe in Bytes",["model.reference"],"SYNTHETIC_MODEL"),
    "model.maxTokens": d("model","INTEGER",[1,resource.maxTokens as number],"Maximale Ausgabetokens der synthetischen Probe",["model.reference"],"SYNTHETIC_MODEL"),
    "model.secretReference": d("access","SECRET_REFERENCE",[null],"Secretreferenz — dieser Adapter benötigt keine Zugangsdaten",["model.reference"],"OPTIONAL"),
    "access.authMode": d("access","ENUM",["NO_CREDENTIAL"],"Zugangsmodus — kein Zugangsmittel erforderlich",["model.reference"],"SYNTHETIC_MODEL"),
    "access.checkStatus": d("access","ENUM",["NOT_RUN"],"Verbindungsprüfung — nicht ausgeführt",["model.reference"],"SYNTHETIC_MODEL"),
    "data.fields": d("data","SET",profile.allowedFields,"Erlaubte Felder des eigenen Mitarbeiterdatensatzes bestätigen",["goal.purpose"]),
    "data.source": d("data","ENUM",[profile.capability.resource],"Registrierte Datenquelle — eigenes Mitarbeiterverzeichnis"),
    "data.scope": d("data","ENUM",[profile.capability.scope],"Datenbereich — ausschließlich anfragender Nutzer"),
    "data.operation": d("data","ENUM",[profile.capability.effect],"Erlaubte Datenoperation — nur lesen"),
    "data.purpose": d("data","ENUM",[profile.capability.purpose],"Zugriffszweck aus dem verifizierten Profil"),
    "tools.capabilities": d("tools","SET",[profile.capability.capabilityId],"Ausgewählte lesende Fähigkeit"),
    "work.mode": d("work","ENUM",["READ_ONLY"],"Arbeitsregel — nur lesen",["tools.capabilities"]),
    "work.confirmation": d("work","ENUM",["NO_EFFECT_AUTHORIZATION"],"Bestätigungsregel — Entwurf autorisiert keine Wirkung",["work.mode"]),
    "work.timeoutMs": d("work","INTEGER",[1,resource.timeoutMs as number],"Zeitlimit einer begrenzten Anfrage in Millisekunden",["work.mode"]),
    "work.maxSteps": d("work","INTEGER",[1,1],"Maximale Schritte — kein autonomer Agentenloop",["work.mode"]),
    "work.parallelism": d("work","INTEGER",[1,1],"Maximale Parallelität — eine begrenzte Anfrage",["work.mode"]),
    "work.maxRequests": d("work","INTEGER",[1,resource.maxRequests as number],"Maximale begrenzte Anfragen aus der Runtimevorlage",["work.mode"]),
    "budget.modelUnits": d("budget","INTEGER",[0,64],"Modellbudget in ganzzahligen Einheiten",["model.reference"],"SYNTHETIC_MODEL"),
    "budget.runtimeUnits": d("budget","INTEGER",[1,1],"Runtimebudget in ganzzahligen Einheiten",["work.mode"]),
    "persistence.mode": d("persistence","ENUM",["DRAFT_ONLY"],"Erlaubte Persistenz — nur Konfigurationsentwurf"),
    "persistence.retention": d("persistence","ENUM",["UNTIL_OWNER_DELETION"],"Aufbewahrung — bis zur ausdrücklichen Löschung durch den Owner"),
    "persistence.redaction": d("persistence","ENUM",["NO_SECRETS_NO_BUSINESS_PAYLOADS"],"Nachweisregel — keine Secrets oder fachlichen Nutzdaten"),
    "persistence.deletionScope": d("persistence","ENUM",["OWN_SCOPED_DRAFT_ONLY"],"Löschgrenze — ausschließlich eigener Konfigurationsentwurf"),
    "persistence.scope": d("persistence","ENUM",["AUTHENTICATED_USER_TENANT_INSTANCE"],"Persistenzbindung — Nutzer, Mandant und Instanz getrennt"),
    "modules.selection": d("modules","ENUM",["NONE"],"Optionale Fachmodule — in diesem Adapter nicht qualifiziert"),
  };
  const body = { schemaVersion: "pansphaira.agent-configuration/policy-binding/v1" as const, adapterVersion: AGENT_CONFIGURATION_ADAPTER_V1,
    profileId: profile.profileId, profileDigest: profile.profileDigest, runtimeTemplateDigest: runtimeTemplateDigest as string, identityDigest: t.identityDigest,
    supportedVersions: { draft: [AGENT_CONFIGURATION_DRAFT_SCHEMA_V1] as const, answers: [AGENT_CONFIGURATION_ANSWERS_SCHEMA_V1] as const, adapter: [AGENT_CONFIGURATION_ADAPTER_V1] as const,
      runtime: "node >=24.14.1 <25; portable identity 1.0.0" as const, model: ["synthetic-bounded/v1", "NONE"] as const, migration: "REJECT_UNSUPPORTED_RETAIN_ORIGINAL" as const }, fields };
  const policy = freeze({ ...body, policyDigest: hash(body) }); ownedPolicies.add(policy); return policy;
}
function keys(p: AgentConfigurationPolicyV1): AgentConfigurationFieldV1[] { return Object.keys(p.fields) as AgentConfigurationFieldV1[]; }
function valueChecked(field: AgentConfigurationFieldV1, value: unknown, p: AgentConfigurationPolicyV1): AgentConfigurationValueV1 | null {
  const d = p.fields[field];
  if (d.type === "SET") {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < 1 || value.length > d.allowedValues.length) return denied("VALUE_UNSUPPORTED:" + field);
    const ds = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(ds).length !== value.length + 1 || Array.from({length:value.length},(_,i) => ds[String(i)]).some(x => !x || !x.enumerable || !("value" in x))) return denied("SCHEMA_DENIED");
    if (value.some(v => typeof v !== "string" || !d.allowedValues.includes(v)) || new Set(value).size !== value.length) return denied("VALUE_UNSUPPORTED:" + field);
    return [...value].sort();
  }
  if (d.type === "INTEGER") {
    if (!Number.isSafeInteger(value) || Object.is(value,-0) || (value as number) < (d.allowedValues[0] as number) || (value as number) > (d.allowedValues[1] as number)) return denied("VALUE_UNSUPPORTED:" + field);
    return value as number;
  }
  if (!d.allowedValues.includes(value as AgentConfigurationValueV1)) return denied(d.type === "SECRET_REFERENCE" ? "RAW_SECRET_OR_REFERENCE_DENIED" : "VALUE_UNSUPPORTED:" + field);
  return value as AgentConfigurationValueV1 | null;
}
function checkDigest(field: AgentConfigurationFieldV1, value: unknown, fields: AgentConfigurationDraftV1["fields"], p: AgentConfigurationPolicyV1): string {
  return hash({field,value,policyDigest:p.policyDigest,dependencies:p.fields[field].dependencies.map(k => ({field:k,value:fields[k].value}))});
}
export function createAgentConfigurationDraftV1(p: AgentConfigurationPolicyV1): AgentConfigurationDraftV1 {
  policyOwned(p);
  const seeds: Record<AgentConfigurationFieldV1, AgentConfigurationValueV1 | null> = {
    "context.locale":"de-DE", "context.timezone":"UTC", "goal.purpose":null, "goal.agentName":"Mitarbeiterassistenz", "goal.useCase":"employee-own-directory/v1",
    "runtime.templateId":p.fields["runtime.templateId"].allowedValues[0]!,"runtime.adapterId":AGENT_CONFIGURATION_ADAPTER_V1,
    "runtime.version":p.fields["runtime.version"].allowedValues[0]!,"runtime.location":"OWNER_BOUND_LOCAL","runtime.capabilities":[...p.fields["runtime.capabilities"].allowedValues as readonly string[]],
    "model.reference":"synthetic-bounded/v1","model.connection":"SYNTHETIC_LOCAL_NO_PROVIDER","model.requirements":"BOUNDED_SYNTHETIC_READ",
    "model.maxInputBytes":4096,"model.maxOutputBytes":8192,"model.maxTokens":32,"model.secretReference":null,"access.authMode":"NO_CREDENTIAL","access.checkStatus":"NOT_RUN",
    "data.fields":[...p.fields["data.fields"].allowedValues as readonly string[]].sort(),"data.source":"employee.directory.own","data.scope":"OWN_REQUESTING_USER","data.operation":"READ","data.purpose":"employee.business.help",
    "tools.capabilities":[...p.fields["tools.capabilities"].allowedValues as readonly string[]],"work.mode":"READ_ONLY","work.confirmation":"NO_EFFECT_AUTHORIZATION",
    "work.timeoutMs":20000,"work.maxSteps":1,"work.parallelism":1,"work.maxRequests":32,"budget.modelUnits":64,"budget.runtimeUnits":1,
    "persistence.mode":"DRAFT_ONLY","persistence.retention":"UNTIL_OWNER_DELETION","persistence.redaction":"NO_SECRETS_NO_BUSINESS_PAYLOADS",
    "persistence.deletionScope":"OWN_SCOPED_DRAFT_ONLY","persistence.scope":"AUTHENTICATED_USER_TENANT_INSTANCE","modules.selection":"NONE",
  };
  const fields = {} as Record<AgentConfigurationFieldV1, AgentConfigurationFieldStateV1>;
  for (const k of keys(p)) fields[k] = { value:seeds[k],source:k === "goal.purpose" ? "UNRESOLVED" : "PROFILE_TEMPLATE",
    confirmation:k === "goal.purpose" ? "UNKNOWN" : k === "data.fields" ? "STALE" : "CONFIRMED", validation:{status:k === "goal.purpose" ? "UNKNOWN" : k === "data.fields" ? "STALE" : "CURRENT",digest:null} };
  for (const k of keys(p)) if (fields[k].confirmation === "CONFIRMED") fields[k] = {...fields[k],validation:{status:"CURRENT",digest:checkDigest(k,fields[k].value,fields,p)}};
  return freeze({schemaVersion:AGENT_CONFIGURATION_DRAFT_SCHEMA_V1,adapterVersion:AGENT_CONFIGURATION_ADAPTER_V1,policyDigest:p.policyDigest,fields});
}
export function validateAgentConfigurationDraftV1(value: unknown, p: AgentConfigurationPolicyV1): AgentConfigurationDraftV1 {
  policyOwned(p); const v=configurationClosedObjectV1(value,["schemaVersion","adapterVersion","policyDigest","fields"]);
  if (v.schemaVersion !== AGENT_CONFIGURATION_DRAFT_SCHEMA_V1 || v.adapterVersion !== AGENT_CONFIGURATION_ADAPTER_V1) return denied("SCHEMA_UNSUPPORTED");
  if (v.policyDigest !== p.policyDigest) return denied("POLICY_CHANGED_REJECT_REQUIRES_RECONFIRMATION");
  const fs=configurationClosedObjectV1(v.fields,keys(p));
  for (const k of keys(p)) {
    const f=configurationClosedObjectV1(fs[k],["value","source","confirmation","validation"]);
    const check=configurationClosedObjectV1(f.validation,["status","digest"]);
    if (!["PROFILE_TEMPLATE","SESSION_USER","UNRESOLVED"].includes(f.source as string) || !["CONFIRMED","UNKNOWN","STALE","CONTRADICTED"].includes(f.confirmation as string)
      || !["CURRENT","UNKNOWN","STALE"].includes(check.status as string)) return denied("STATE_DENIED");
    if (f.confirmation !== "UNKNOWN" && f.confirmation !== "CONTRADICTED") valueChecked(k,f.value,p);
    else if (f.value !== null || check.digest !== null || check.status !== "UNKNOWN") return denied("STATE_DENIED");
    if (f.confirmation === "STALE" && (check.status !== "STALE" || check.digest !== null)) return denied("STATE_DENIED");
    if (f.confirmation === "CONFIRMED") {
      if (check.status !== "CURRENT" || check.digest !== checkDigest(k,f.value,fs as unknown as AgentConfigurationDraftV1["fields"],p)
        || p.fields[k].dependencies.some(dep => (fs[dep] as AgentConfigurationFieldStateV1).confirmation !== "CONFIRMED")) return denied("STATE_DENIED");
    }
  }
  return freeze(JSON.parse(canonicalJson(value)) as AgentConfigurationDraftV1);
}
export function validateAgentConfigurationAnswersV1(value: unknown, p: AgentConfigurationPolicyV1): AgentConfigurationAnswersV1 {
  policyOwned(p); const v=configurationClosedObjectV1(value,["schemaVersion","expectedRevision","answers"]);
  if (v.schemaVersion !== AGENT_CONFIGURATION_ANSWERS_SCHEMA_V1) return denied("SCHEMA_UNSUPPORTED");
  if (!Number.isSafeInteger(v.expectedRevision) || (v.expectedRevision as number) < 0 || Object.is(v.expectedRevision,-0)) return denied("REVISION_DENIED");
  if (!Array.isArray(v.answers) || Object.getPrototypeOf(v.answers) !== Array.prototype || v.answers.length < 1 || v.answers.length > 32) return denied("SCHEMA_DENIED");
  const ds=Object.getOwnPropertyDescriptors(v.answers);
  if (Reflect.ownKeys(ds).length !== v.answers.length+1 || Array.from({length:v.answers.length},(_,i)=>ds[String(i)]).some(d=>!d || !d.enumerable || !("value" in d))) return denied("SCHEMA_DENIED");
  const answers=v.answers.map(item=>{
    const a=configurationClosedObjectV1(item,["field","value","confirmation"]);
    if (typeof a.field !== "string" || !Object.hasOwn(p.fields,a.field) || !["CONFIRM","UNKNOWN"].includes(a.confirmation as string)) return denied("FIELD_OR_CONFIRMATION_DENIED");
    const field=a.field as AgentConfigurationFieldV1;
    if (a.confirmation === "UNKNOWN" && a.value !== null) return denied("UNKNOWN_MUST_BE_EXPLICIT");
    return {field,value:a.confirmation === "UNKNOWN" ? null : valueChecked(field,a.value,p),confirmation:a.confirmation};
  });
  return freeze({schemaVersion:AGENT_CONFIGURATION_ANSWERS_SCHEMA_V1,expectedRevision:v.expectedRevision as number,answers:answers as AgentConfigurationAnswerV1[]});
}
export function applyAgentConfigurationAnswersV1(draft: unknown, command: unknown, p: AgentConfigurationPolicyV1): AgentConfigurationDraftV1 {
  const old=validateAgentConfigurationDraftV1(draft,p); const input=validateAgentConfigurationAnswersV1(command,p);
  const fields=structuredClone(old.fields) as Record<AgentConfigurationFieldV1,AgentConfigurationFieldStateV1>;
  const changed=new Set<AgentConfigurationFieldV1>(); const answered=new Set<AgentConfigurationFieldV1>();
  for (const k of keys(p)) {
    const answers=input.answers.filter(a=>a.field === k); if (!answers.length) continue; answered.add(k);
    const distinct=new Set(answers.map(a=>canonicalJson({value:a.value,confirmation:a.confirmation})));
    const a=answers[0]!; const confirmation=distinct.size > 1 ? "CONTRADICTED" : a.confirmation === "UNKNOWN" ? "UNKNOWN" : "CONFIRMED";
    const value=confirmation === "CONFIRMED" ? a.value : null;
    if (canonicalJson(value) !== canonicalJson(fields[k].value) || confirmation !== fields[k].confirmation) changed.add(k);
    if (!changed.has(k)) continue; // Reconfirming current values neither changes provenance nor invalidates checks.
    fields[k]={value,source:"SESSION_USER",confirmation,validation:{status:confirmation === "CONFIRMED" ? "CURRENT" : "UNKNOWN",digest:null}};
  }
  const affected=new Set(changed);
  let more=true; while(more) {more=false; for(const k of keys(p)) if (!affected.has(k) && p.fields[k].dependencies.some(dep=>affected.has(dep))) {affected.add(k);more=true;}}
  for (const k of affected) if (!answered.has(k) && !changed.has(k) && fields[k].confirmation === "CONFIRMED") fields[k]={...fields[k],confirmation:"STALE",validation:{status:"STALE",digest:null}};
  // Evaluate in declared topological order against the entire answer batch, not conversation order.
  for(const k of keys(p)) if (fields[k].confirmation === "CONFIRMED") {
    if (p.fields[k].dependencies.some(dep=>fields[dep].confirmation !== "CONFIRMED")) fields[k]={...fields[k],confirmation:"STALE",validation:{status:"STALE",digest:null}};
    else fields[k]={...fields[k],validation:{status:"CURRENT",digest:checkDigest(k,fields[k].value,fields,p)}};
  }
  return validateAgentConfigurationDraftV1({...old,fields},p);
}
export function evaluateAgentConfigurationDraftV1(value: unknown, p: AgentConfigurationPolicyV1) {
  const draft=validateAgentConfigurationDraftV1(value,p);
  const required=(k:AgentConfigurationFieldV1)=>p.fields[k].requiredWhen === "ALWAYS" || (p.fields[k].requiredWhen === "SYNTHETIC_MODEL" && draft.fields["model.reference"].value === "synthetic-bounded/v1");
  const unresolved=keys(p).filter(k=>required(k) && draft.fields[k].confirmation !== "CONFIRMED");
  const questions=unresolved.filter(k=>p.fields[k].dependencies.every(dep=>draft.fields[dep].confirmation === "CONFIRMED")).map(field=>({
    field,label:p.fields[field].label,definition:p.fields[field],reason:draft.fields[field].confirmation === "CONTRADICTED" ? "CONTRADICTION" : draft.fields[field].confirmation === "STALE" ? "DEPENDENCY_CHANGED" : "UNKNOWN",
  }));
  const configuration:AgentConfigurationNormalizedV1|null=unresolved.length ? null : {
    schemaVersion:"pansphaira.agent-configuration/normalized/v1" as const,adapterVersion:AGENT_CONFIGURATION_ADAPTER_V1,
    profileId:p.profileId,profileDigest:p.profileDigest,runtimeTemplateDigest:p.runtimeTemplateDigest,policyDigest:p.policyDigest,
    parameters:Object.fromEntries(keys(p).map(k=>[k, p.fields[k].requiredWhen === "SYNTHETIC_MODEL" && !required(k) ? null : draft.fields[k].value])) as AgentConfigurationNormalizedV1["parameters"],
    authorityGranted:false as const,activationAuthorized:false as const,
  };
  return freeze({outcome:configuration ? "RESOLVED" as const : "NEEDS_CLARIFICATION" as const,questions,unresolvedFields:unresolved,configuration,configurationDigest:configuration ? hash(configuration) : null});
}
export type AgentConfigurationReadbackV1 = Readonly<{
  schemaVersion: "pansphaira.agent-configuration/readback/v1";
  authorityContext: Readonly<{schemaVersion:"pansphaira.agent-configuration/authority-context/v1";source:"PROTECTED_BACKEND";
    tenantId:string;subjectId:string;instanceId:string;generation:number;authenticatedRole:"reader"|"reviewer";draftSaveAllowed:true;executionAuthorityGranted:false}>;
  revision: number;
  persisted: boolean;
  profileId: string;
  adapterVersion: typeof AGENT_CONFIGURATION_ADAPTER_V1;
  policyDigest: string;
  supportedVersions: AgentConfigurationPolicyV1["supportedVersions"];
  definitions: AgentConfigurationPolicyV1["fields"];
  draft: AgentConfigurationDraftV1;
  activationAuthorized: false;
}> & ReturnType<typeof evaluateAgentConfigurationDraftV1>;
