import { createHash } from "node:crypto";
import { canonicalJson } from "./canonical-json.js";
import {types} from 'node:util';

// Additive data-only chat transcript lives in this already shipped broker so
// the unchanged legacy1792 payload keeps a closed compiled import graph.
export const MODEL_TOOL_TRANSCRIPT_SCHEMA_V1='chimpmaera.model/tool-transcript/v1' as const;
export interface ChatToolCallV1 {readonly id:string;readonly type:'function';readonly function:{readonly name:string;readonly arguments:string};}
export type ModelChatMessageV1 = {readonly role:'user';readonly content:string}
  | {readonly role:'assistant';readonly content:string|null;readonly tool_calls:readonly ChatToolCallV1[]}
  | {readonly role:'tool';readonly tool_call_id:string;readonly content:string};
export interface ModelToolTranscriptV1 {readonly schemaVersion:typeof MODEL_TOOL_TRANSCRIPT_SCHEMA_V1;readonly messages:readonly ModelChatMessageV1[];}
export const isModelChatCallIdV1=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(v);
const deny=()=>{throw Error('MODEL_TOOL_TRANSCRIPT_DENIED');};
const secret=/(?:sk-[A-Za-z0-9_-]{12,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:password|api[_-]?key|access[_-]?token)\s*[:=]\s*\S{8,})/i;
export function snapshotModelToolDataV1(value:unknown):unknown {
 const active=new Set<object>();let count=0;
 function visit(v:unknown,depth=0):unknown {
  if(++count>8192||depth>16)deny();
  if(v===null||typeof v==='string'||typeof v==='boolean')return v;
  if(typeof v==='number'&&Number.isFinite(v)&&!Object.is(v,-0))return v;
  if(typeof v!=='object'||v===null||types.isProxy(v)||active.has(v))return deny();
  const array=Array.isArray(v);if(Object.getPrototypeOf(v)!==(array?Array.prototype:Object.prototype))deny();
  const ds=Object.getOwnPropertyDescriptors(v),keys=Reflect.ownKeys(ds);
  for(const k of keys){const d=ds[k as string]!;if(typeof k!=='string'||!('value'in d)||d.get||d.set||(!d.enumerable&&!(array&&k==='length')))deny();}
  active.add(v);let result:unknown;
  if(array){const n=ds.length!.value as number;if(n>256||keys.length!==n+1)deny();result=Array.from({length:n},(_,i)=>{if(!Object.hasOwn(ds,String(i)))deny();return visit(ds[String(i)]!.value,depth+1);});}
  else result=Object.fromEntries(keys.map(k=>[k,visit(ds[k as string]!.value,depth+1)]));
  active.delete(v);return result;
 }
 const copy=visit(value);if(Buffer.byteLength(canonicalJson(copy))>262144)deny();return copy;
}
const exact=(v:unknown,keys:readonly string[]):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&canonicalJson(Object.keys(v).sort())===canonicalJson([...keys].sort());
// History is data, not proof of tool authority. Native owners retain grants
// and revalidate each invocation; raw ID bijection/order is checked here.
export function validateModelToolTranscriptV1(value:unknown,request:CanonicalModelRequestV1):ModelToolTranscriptV1 {
 const t=snapshotModelToolDataV1(value);
 if(request.protocol!=='OPENAI_CHAT_COMPLETIONS'||!exact(t,['schemaVersion','messages'])||t.schemaVersion!==MODEL_TOOL_TRANSCRIPT_SCHEMA_V1||!Array.isArray(t.messages)||t.messages.length<1||t.messages.length>65)deny();
 const transcript=t as unknown as ModelToolTranscriptV1;
 if(Buffer.byteLength(canonicalJson(transcript.messages))>request.budget.maxInputBytes||secret.test(canonicalJson(transcript)))deny();
 const seen=new Set<string>(),pending=new Set<string>();let expectAssistant=true;
 for(let i=0;i<transcript.messages.length;i++){
  const m=transcript.messages[i]!;
  if(i===0){if(!exact(m,['role','content'])||m.role!=='user'||m.content!==request.text)deny();continue;}
  if(m.role==='assistant'){
   if(!expectAssistant||pending.size||!exact(m,['role','content','tool_calls'])||(m.content!==null&&typeof m.content!=='string')||!Array.isArray(m.tool_calls)||m.tool_calls.length<1||m.tool_calls.length>32)deny();
   for(const c of m.tool_calls){
    if(!exact(c,['id','type','function'])||!isModelChatCallIdV1(c.id)||seen.has(c.id)||c.type!=='function'||!exact(c.function,['name','arguments'])||typeof c.function.name!=='string'||!request.tools.some(x=>x.name===c.function.name)||typeof c.function.arguments!=='string')deny();
    let args:unknown;try{args=snapshotModelToolDataV1(JSON.parse(c.function.arguments));}catch{return deny();}
    if(args===null||typeof args!=='object'||Array.isArray(args)||['authority','approval','credentialHandle','execute','tenant','userIdentity'].some(k=>Object.hasOwn(args as object,k)))deny();
    seen.add(c.id);pending.add(c.id);
   }
   expectAssistant=false;
  }else if(m.role==='tool'){
   if(expectAssistant||!exact(m,['role','tool_call_id','content'])||!isModelChatCallIdV1(m.tool_call_id)||!pending.has(m.tool_call_id)||typeof m.content!=='string')deny();
   pending.delete(m.tool_call_id);if(pending.size===0)expectAssistant=true;
  }else deny();
 }
 if(pending.size||!expectAssistant)deny();return transcript;
}

export const MODEL_REQUEST_SCHEMA_V1 = "chimpmaera.model/model-request/v1" as const;
export const MODEL_RESPONSE_SCHEMA_V1 = "chimpmaera.model/model-response/v1" as const;
export const MODEL_STREAM_SCHEMA_V1 = "chimpmaera.model/model-stream-event/v1" as const;

export type ModelProtocolV1 =
  | "OPENAI_CHAT_COMPLETIONS"
  | "OPENAI_RESPONSES"
  | "ANTHROPIC_MESSAGES";
export type ModelGuardOutcomeV1 =
  | "ALLOW"
  | "DENY"
  | "OWNER_ESCALATION"
  | "THROTTLE"
  | "QUARANTINE";

export interface ModelAttachmentV1 {
  readonly mediaType: "image/png" | "image/jpeg" | "application/pdf";
  readonly digest: string;
  readonly bytes: number;
  readonly reference: string;
}

export interface ModelToolV1 {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

export interface ModelBudgetV1 {
  readonly maxInputBytes: number;
  readonly maxOutputBytes: number;
  readonly maxTokens: number;
  readonly maxCostMicros: number;
  readonly maxRequests: number;
  readonly timeoutMs: number;
}

export interface CanonicalModelRequestV1 {
  readonly schemaVersion: typeof MODEL_REQUEST_SCHEMA_V1;
  readonly workloadIdentity: string;
  readonly userIdentity: string;
  readonly tenant: string;
  readonly purpose: string;
  readonly delegationDigest: string;
  readonly operationId: string;
  readonly correlationId: string;
  readonly routeId: string;
  readonly provider: string;
  readonly model: string;
  readonly protocol: ModelProtocolV1;
  readonly dataClassification: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "SECRET";
  readonly trustClass: "TRUSTED_OWNER_INPUT" | "UNTRUSTED_AGENT_INPUT";
  readonly text: string;
  readonly attachments: readonly ModelAttachmentV1[];
  readonly tools: readonly ModelToolV1[];
  readonly structuredOutput: Readonly<Record<string, unknown>> | null;
  readonly optionalFields: Readonly<Record<string, unknown>>;
  readonly budget: ModelBudgetV1;
}

export interface ToolCallCandidateV1 {
  readonly id: string;
  readonly name: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly trust: "UNTRUSTED_MODEL_OUTPUT";
  readonly authority: "NONE";
}

export interface CanonicalModelResponseV1 {
  readonly schemaVersion: typeof MODEL_RESPONSE_SCHEMA_V1;
  readonly operationId: string;
  readonly correlationId: string;
  readonly provider: string;
  readonly model: string;
  readonly protocol: ModelProtocolV1;
  readonly trust: "UNTRUSTED_MODEL_OUTPUT";
  readonly contentType: "text/plain" | "application/json";
  readonly text: string;
  readonly structuredOutput: Readonly<Record<string, unknown>> | null;
  readonly toolCallCandidates: readonly ToolCallCandidateV1[];
  readonly provenance: {
    readonly routeId: string;
    readonly providerRequestDigest: string;
    readonly providerResponseDigest: string;
  };
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly costMicros: number;
  };
}

export interface CanonicalModelStreamEventV1 {
  readonly schemaVersion: typeof MODEL_STREAM_SCHEMA_V1;
  readonly operationId: string;
  readonly sequence: number;
  readonly event: "TEXT_DELTA" | "TOOL_CANDIDATE" | "USAGE" | "DONE";
  readonly trust: "UNTRUSTED_MODEL_OUTPUT";
  readonly data: Readonly<Record<string, unknown>>;
}

export interface ModelRouteV1 {
  readonly routeId: string;
  readonly provider: string;
  readonly model: string;
  readonly protocol: ModelProtocolV1;
  readonly credentialHandle: string;
  readonly allowedTenants: readonly string[];
  readonly allowedPurposes: readonly string[];
  readonly optionalFields: readonly string[];
  readonly attachmentMediaTypes: readonly ModelAttachmentV1["mediaType"][];
}

export interface ModelAccessPolicyV1 {
  readonly schemaVersion: "chimpmaera.model/model-access-policy/v1";
  readonly routes: readonly ModelRouteV1[];
  readonly workloadIdentities: readonly string[];
  readonly userIdentities: readonly string[];
  readonly maxBudget: ModelBudgetV1;
}

export interface ProviderRequestV1 {
  readonly route: ModelRouteV1;
  readonly credentialHandle: string;
  readonly request: Readonly<Record<string, unknown>>;
  readonly requestDigest: string;
}

export interface ProviderResponseV1 {
  readonly contentType: string;
  readonly text: string;
  readonly structuredOutput?: Readonly<Record<string, unknown>> | null;
  readonly toolCalls?: readonly {
    readonly id: string;
    readonly name: string;
    readonly arguments: unknown;
  }[];
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly costMicros: number;
  };
}

export interface BrokerAuditRecordV1 {
  readonly schemaVersion: "chimpmaera.model/model-audit/v1";
  readonly operationId: string;
  readonly correlationId: string;
  readonly tenantDigest: string;
  readonly purposeDigest: string;
  readonly requestDigest: string;
  readonly responseDigest: string | null;
  readonly outcome: ModelGuardOutcomeV1;
  readonly usage: ProviderResponseV1["usage"] | null;
  readonly issues: readonly string[];
}

export interface ModelBrokerResultV1 {
  readonly outcome: ModelGuardOutcomeV1;
  readonly response: CanonicalModelResponseV1 | null;
  readonly issues: readonly string[];
  readonly replay: "FIRST" | "SAME_RECEIPT" | "NONE";
  readonly audit: BrokerAuditRecordV1;
}

const requestKeys = [
  "attachments", "budget", "correlationId", "dataClassification",
  "delegationDigest", "model", "operationId", "optionalFields", "protocol",
  "provider", "purpose", "routeId", "schemaVersion", "structuredOutput",
  "tenant", "text", "tools", "trustClass", "userIdentity",
  "workloadIdentity",
].sort();
const budgetKeys = [
  "maxCostMicros", "maxInputBytes", "maxOutputBytes", "maxRequests",
  "maxTokens", "timeoutMs",
].sort();
const secretPattern = /(?:sk-[A-Za-z0-9_-]{12,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:password|api[_-]?key|access[_-]?token)\s*[:=]\s*\S{8,})/gi;
const injectionPattern = /(?:ignore (?:all )?(?:previous|system) instructions|system prompt|developer message|mint authority|execute tool now)/gi;

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && canonicalJson(Object.keys(value).sort()) === canonicalJson(keys);
}

function boundedInteger(value: unknown, min: number, max: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
}

function boundId(value: unknown, prefix: string): value is string {
  return typeof value === "string"
    && new RegExp(`^${prefix}:[a-z0-9][a-z0-9._-]{2,63}$`).test(value);
}

function issueResult(
  request: unknown,
  outcome: ModelGuardOutcomeV1,
  issues: readonly string[],
): ModelBrokerResultV1 {
  const candidate = request as Partial<CanonicalModelRequestV1>;
  const operationId = typeof candidate.operationId === "string" ? candidate.operationId : "operation:invalid";
  const correlationId = typeof candidate.correlationId === "string" ? candidate.correlationId : "correlation:invalid";
  return {
    outcome,
    response: null,
    issues,
    replay: "NONE",
    audit: {
      schemaVersion: "chimpmaera.model/model-audit/v1",
      operationId,
      correlationId,
      tenantDigest: digest(candidate.tenant ?? null),
      purposeDigest: digest(candidate.purpose ?? null),
      requestDigest: digest(request),
      responseDigest: null,
      outcome,
      usage: null,
      issues,
    },
  };
}

function validateBudget(value: unknown, ceiling: ModelBudgetV1): value is ModelBudgetV1 {
  if (!exactObject(value, budgetKeys)) return false;
  const checks: readonly [keyof ModelBudgetV1, number][] = [
    ["maxInputBytes", ceiling.maxInputBytes],
    ["maxOutputBytes", ceiling.maxOutputBytes],
    ["maxTokens", ceiling.maxTokens],
    ["maxCostMicros", ceiling.maxCostMicros],
    ["maxRequests", ceiling.maxRequests],
    ["timeoutMs", ceiling.timeoutMs],
  ];
  return checks.every(([key, max]) => boundedInteger(value[key], 1, max));
}

function validateAttachments(
  value: unknown,
  route: ModelRouteV1,
  inputLimit: number,
): value is readonly ModelAttachmentV1[] {
  return Array.isArray(value)
    && value.length <= 8
    && value.every((item) => exactObject(item, ["bytes", "digest", "mediaType", "reference"])
      && route.attachmentMediaTypes.includes(item.mediaType as ModelAttachmentV1["mediaType"])
      && boundedInteger(item.bytes, 1, inputLimit)
      && typeof item.digest === "string" && /^[a-f0-9]{64}$/.test(item.digest)
      && typeof item.reference === "string" && /^attachment:[a-z0-9._-]{3,80}$/.test(item.reference));
}

function validateTools(value: unknown): value is readonly ModelToolV1[] {
  return Array.isArray(value)
    && value.length <= 32
    && value.every((tool) => exactObject(tool, ["description", "inputSchema", "name"])
      && typeof tool.name === "string" && /^[a-z][a-z0-9_.-]{2,63}$/.test(tool.name)
      && typeof tool.description === "string" && tool.description.length <= 512
      && tool.inputSchema !== null && typeof tool.inputSchema === "object" && !Array.isArray(tool.inputSchema));
}

function findRoute(policy: ModelAccessPolicyV1, candidate: Partial<CanonicalModelRequestV1>): ModelRouteV1 | undefined {
  return policy.routes.find((route) => route.routeId === candidate.routeId
    && route.provider === candidate.provider
    && route.model === candidate.model
    && route.protocol === candidate.protocol);
}

export function guardModelRequestV1(
  value: unknown,
  policy: ModelAccessPolicyV1,
): { readonly outcome: "ALLOW"; readonly request: CanonicalModelRequestV1; readonly route: ModelRouteV1; readonly redactions: number }
  | { readonly outcome: Exclude<ModelGuardOutcomeV1, "ALLOW" | "QUARANTINE">; readonly issues: readonly string[] } {
  if (!exactObject(value, requestKeys)) return { outcome: "DENY", issues: ["MODEL_REQUEST_SCHEMA_DENIED"] };
  if (value.schemaVersion !== MODEL_REQUEST_SCHEMA_V1) return { outcome: "DENY", issues: ["MODEL_REQUEST_VERSION_DENIED"] };
  const candidate = value as unknown as CanonicalModelRequestV1;
  const route = findRoute(policy, candidate);
  if (route === undefined) return { outcome: "DENY", issues: ["MODEL_ROUTE_CLOSED_DENIED"] };
  if (!policy.workloadIdentities.includes(candidate.workloadIdentity)
      || !policy.userIdentities.includes(candidate.userIdentity)
      || !route.allowedTenants.includes(candidate.tenant)
      || !route.allowedPurposes.includes(candidate.purpose)) {
    return { outcome: "DENY", issues: ["MODEL_AUTHORITY_BINDING_DENIED"] };
  }
  if (!boundId(candidate.workloadIdentity, "workload")
      || !boundId(candidate.userIdentity, "user")
      || !boundId(candidate.tenant, "tenant")
      || !boundId(candidate.purpose, "purpose")
      || !boundId(candidate.operationId, "operation")
      || !boundId(candidate.correlationId, "correlation")
      || !/^[a-f0-9]{64}$/.test(candidate.delegationDigest)) {
    return { outcome: "DENY", issues: ["MODEL_IDENTITY_FORMAT_DENIED"] };
  }
  if (!validateBudget(candidate.budget, policy.maxBudget)) {
    return { outcome: "DENY", issues: ["MODEL_BUDGET_SCHEMA_OR_CEILING_DENIED"] };
  }
  if (typeof candidate.text !== "string"
      || Buffer.byteLength(candidate.text) > candidate.budget.maxInputBytes
      || !validateAttachments(candidate.attachments, route, candidate.budget.maxInputBytes)
      || !validateTools(candidate.tools)) {
    return { outcome: "DENY", issues: ["MODEL_INPUT_LIMIT_OR_FEATURE_DENIED"] };
  }
  if (candidate.structuredOutput !== null
      && (typeof candidate.structuredOutput !== "object" || Array.isArray(candidate.structuredOutput))) {
    return { outcome: "DENY", issues: ["MODEL_STRUCTURED_OUTPUT_SCHEMA_DENIED"] };
  }
  if (candidate.optionalFields === null || typeof candidate.optionalFields !== "object" || Array.isArray(candidate.optionalFields)) {
    return { outcome: "DENY", issues: ["MODEL_OPTIONAL_FIELDS_SCHEMA_DENIED"] };
  }
  const unknownOptional = Object.keys(candidate.optionalFields).filter((key) => !route.optionalFields.includes(key));
  if (unknownOptional.length > 0) {
    return { outcome: "DENY", issues: unknownOptional.map((key) => `MODEL_OPTIONAL_FIELD_UNSUPPORTED:${key}`) };
  }
  if (candidate.dataClassification === "SECRET") {
    return { outcome: "OWNER_ESCALATION", issues: ["MODEL_SECRET_CLASSIFICATION_OWNER_ESCALATION"] };
  }
  if (!["PUBLIC", "INTERNAL", "CONFIDENTIAL"].includes(candidate.dataClassification)
      || !["TRUSTED_OWNER_INPUT", "UNTRUSTED_AGENT_INPUT"].includes(candidate.trustClass)) {
    return { outcome: "DENY", issues: ["MODEL_CLASSIFICATION_OR_TRUST_DENIED"] };
  }
  let redactions = 0;
  const text = candidate.text.replace(secretPattern, () => {
    redactions += 1;
    return "[REDACTED_BEFORE_PROVIDER]";
  });
  return { outcome: "ALLOW", request: { ...candidate, text }, route, redactions };
}

export function adaptCanonicalRequestV1(
  request: CanonicalModelRequestV1,
  route: ModelRouteV1,
): Readonly<Record<string, unknown>> {
  const common = {
    model: request.model,
    max_tokens: request.budget.maxTokens,
    ...request.optionalFields,
  };
  const tools = request.tools.map((tool) => ({
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
  }));
  if (route.protocol === "OPENAI_CHAT_COMPLETIONS") {
    return {
      ...common,
      messages: [{ role: "user", content: request.text }],
      tools,
      ...(request.structuredOutput === null ? {} : { response_format: { type: "json_schema", json_schema: request.structuredOutput } }),
      attachments: request.attachments,
    };
  }
  if (route.protocol === "OPENAI_RESPONSES") {
    return {
      model: request.model,
      input: [{ role: "user", content: [{ type: "input_text", text: request.text }] }],
      max_output_tokens: request.budget.maxTokens,
      tools: tools.map(({ function: fn }) => ({ type: "function", ...fn })),
      ...(request.structuredOutput === null ? {} : { text: { format: { type: "json_schema", ...request.structuredOutput } } }),
      attachments: request.attachments,
      ...request.optionalFields,
    };
  }
  return {
    model: request.model,
    max_tokens: request.budget.maxTokens,
    messages: [{ role: "user", content: request.text }],
    tools: request.tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.inputSchema })),
    output_config: request.structuredOutput,
    attachments: request.attachments,
    ...request.optionalFields,
  };
}

export function guardModelResponseV1(
  request: CanonicalModelRequestV1,
  route: ModelRouteV1,
  providerRequestDigest: string,
  value: ProviderResponseV1,
  toolStep = false,
): { readonly outcome: "ALLOW"; readonly response: CanonicalModelResponseV1; readonly redactions: number }
  | { readonly outcome: "QUARANTINE"; readonly issues: readonly string[] } {
  if (!["text/plain", "application/json"].includes(value.contentType)) {
    return { outcome: "QUARANTINE", issues: ["MODEL_RESPONSE_MIME_QUARANTINED"] };
  }
  if (typeof value.text !== "string" || Buffer.byteLength(value.text) > request.budget.maxOutputBytes) {
    return { outcome: "QUARANTINE", issues: ["MODEL_RESPONSE_SIZE_QUARANTINED"] };
  }
  if (!boundedInteger(value.usage?.inputTokens, 0, request.budget.maxTokens)
      || !boundedInteger(value.usage?.outputTokens, 0, request.budget.maxTokens)
      || !boundedInteger(value.usage?.costMicros, 0, request.budget.maxCostMicros)) {
    return { outcome: "QUARANTINE", issues: ["MODEL_RESPONSE_BUDGET_QUARANTINED"] };
  }
  const toolCallCandidates: ToolCallCandidateV1[] = [];
  const ids = new Set<string>();
  for (const tool of value.toolCalls ?? []) {
    if (!request.tools.some((allowed) => allowed.name === tool.name)
        || typeof tool.id !== "string" || (toolStep ? !isModelChatCallIdV1(tool.id) || ids.has(tool.id) : !/^tool:[a-z0-9._-]{3,80}$/.test(tool.id))
        || tool.arguments === null || typeof tool.arguments !== "object" || Array.isArray(tool.arguments)) {
      return { outcome: "QUARANTINE", issues: ["MODEL_TOOL_CANDIDATE_QUARANTINED"] };
    }
    const args = tool.arguments as Record<string, unknown>;
    if (["authority", "approval", "credentialHandle", "execute", "tenant", "userIdentity"].some((key) => Object.hasOwn(args, key))) {
      return { outcome: "QUARANTINE", issues: ["MODEL_TOOL_AUTHORITY_SMUGGLING_QUARANTINED"] };
    }
    toolCallCandidates.push({ id: tool.id, name: tool.name, arguments: args, trust: "UNTRUSTED_MODEL_OUTPUT", authority: "NONE" });
    ids.add(tool.id);
  }
  let redactions = 0;
  const text = value.text
    .replace(secretPattern, () => { redactions += 1; return "[REDACTED_MODEL_OUTPUT]"; })
    .replace(injectionPattern, (match) => { redactions += 1; return `[UNTRUSTED_INSTRUCTION:${digest(match).slice(0, 12)}]`; });
  const providerResponseDigest = digest(value);
  return {
    outcome: "ALLOW",
    redactions,
    response: {
      schemaVersion: MODEL_RESPONSE_SCHEMA_V1,
      operationId: request.operationId,
      correlationId: request.correlationId,
      provider: request.provider,
      model: request.model,
      protocol: request.protocol,
      trust: "UNTRUSTED_MODEL_OUTPUT",
      contentType: value.contentType as CanonicalModelResponseV1["contentType"],
      text,
      structuredOutput: value.structuredOutput ?? null,
      toolCallCandidates,
      provenance: { routeId: route.routeId, providerRequestDigest, providerResponseDigest },
      usage: value.usage,
    },
  };
}

export function parseGuardedSseV1(
  request: CanonicalModelRequestV1,
  lines: readonly string[],
): { readonly outcome: "ALLOW"; readonly events: readonly CanonicalModelStreamEventV1[] }
  | { readonly outcome: "QUARANTINE"; readonly issues: readonly string[] } {
  const events: CanonicalModelStreamEventV1[] = [];
  const toolDigests = new Map<string, string>();
  let done = false;
  let totalBytes = 0;
  for (const line of lines) {
    totalBytes += Buffer.byteLength(line);
    if (totalBytes > request.budget.maxOutputBytes) return { outcome: "QUARANTINE", issues: ["MODEL_STREAM_SIZE_QUARANTINED"] };
    if (!line.startsWith("data: ")) return { outcome: "QUARANTINE", issues: ["MODEL_STREAM_SSE_FRAMING_QUARANTINED"] };
    if (line === "data: [DONE]") { done = true; continue; }
    let parsed: unknown;
    try { parsed = JSON.parse(line.slice(6)); } catch { return { outcome: "QUARANTINE", issues: ["MODEL_STREAM_SSE_JSON_QUARANTINED"] }; }
    if (!exactObject(parsed, ["data", "event", "sequence"])) return { outcome: "QUARANTINE", issues: ["MODEL_STREAM_EVENT_SCHEMA_QUARANTINED"] };
    if (!boundedInteger(parsed.sequence, 0, 1_000_000) || parsed.sequence !== events.length) return { outcome: "QUARANTINE", issues: ["MODEL_STREAM_SEQUENCE_QUARANTINED"] };
    if (!["TEXT_DELTA", "TOOL_CANDIDATE", "USAGE", "DONE"].includes(String(parsed.event))
        || parsed.data === null || typeof parsed.data !== "object" || Array.isArray(parsed.data)) {
      return { outcome: "QUARANTINE", issues: ["MODEL_STREAM_EVENT_SCHEMA_QUARANTINED"] };
    }
    if (parsed.event === "TOOL_CANDIDATE") {
      const data = parsed.data as Record<string, unknown>;
      if (typeof data.id !== "string" || typeof data.name !== "string" || data.complete !== true || data.arguments === null || typeof data.arguments !== "object") {
        return { outcome: "QUARANTINE", issues: ["MODEL_STREAM_TOOL_INCOMPLETE_QUARANTINED"] };
      }
      const nextDigest = digest(data);
      const prior = toolDigests.get(data.id);
      if (prior !== undefined && prior !== nextDigest) return { outcome: "QUARANTINE", issues: ["MODEL_STREAM_TOOL_CHANGED_QUARANTINED"] };
      toolDigests.set(data.id, nextDigest);
    }
    events.push({
      schemaVersion: MODEL_STREAM_SCHEMA_V1,
      operationId: request.operationId,
      sequence: parsed.sequence,
      event: parsed.event as CanonicalModelStreamEventV1["event"],
      trust: "UNTRUSTED_MODEL_OUTPUT",
      data: parsed.data as Readonly<Record<string, unknown>>,
    });
  }
  if (!done || events.at(-1)?.event !== "DONE") return { outcome: "QUARANTINE", issues: ["MODEL_STREAM_PARTIAL_QUARANTINED"] };
  return { outcome: "ALLOW", events };
}

export class ModelAccessBrokerV1 {
  readonly #policy: ModelAccessPolicyV1;
  readonly #receipts = new Map<string, { requestDigest: string; result: ModelBrokerResultV1 }>();
  readonly #reserved = new Map<string, number>();
  readonly #inFlight = new Map<string, { requestDigest: string; result: Promise<ModelBrokerResultV1> }>();

  constructor(policy: ModelAccessPolicyV1) {
    this.#policy = structuredClone(policy);
  }

  async invoke(
    value: unknown,
    providerCall: (request: ProviderRequestV1, signal: AbortSignal) => Promise<ProviderResponseV1>,
  ): Promise<ModelBrokerResultV1> {
    return this.#invokeBound(value, providerCall, null);
  }

  // Additive host-only transcript seam. Same policy/replay/request-budget/
  // provider/response guards, not a second harness or caller tool authority.
  async invokeToolStep(
    value: unknown,
    history: unknown,
    providerCall: (request: ProviderRequestV1, signal: AbortSignal) => Promise<ProviderResponseV1>,
  ): Promise<ModelBrokerResultV1> {
    let safe: unknown;
    try { safe = snapshotModelToolDataV1(value); }
    catch { return issueResult({}, "DENY", ["MODEL_TOOL_TRANSCRIPT_DENIED"]); }
    const guarded = guardModelRequestV1(safe, this.#policy);
    if (guarded.outcome !== "ALLOW") return issueResult(safe, guarded.outcome, guarded.issues);
    let transcript: ModelToolTranscriptV1;
    try { transcript = validateModelToolTranscriptV1(history, guarded.request); }
    catch { return issueResult(safe, "DENY", ["MODEL_TOOL_TRANSCRIPT_DENIED"]); }
    return this.#invokeBound(guarded.request, providerCall, transcript);
  }

  async #invokeBound(
    value: unknown,
    providerCall: (request: ProviderRequestV1, signal: AbortSignal) => Promise<ProviderResponseV1>,
    transcript: ModelToolTranscriptV1 | null,
  ): Promise<ModelBrokerResultV1> {
    const guarded = guardModelRequestV1(value, this.#policy);
    if (guarded.outcome !== "ALLOW") return issueResult(value, guarded.outcome, guarded.issues);
    const requestDigest = digest(transcript === null ? guarded.request : {request:guarded.request, transcript});
    const operationId = guarded.request.operationId;
    const pending = this.#inFlight.get(operationId);
    if (pending !== undefined) {
      if (pending.requestDigest !== requestDigest) return issueResult(value, "DENY", ["MODEL_REPLAY_CONFLICT_DENIED"]);
      return { ...await pending.result, replay: "SAME_RECEIPT" };
    }
    // Register before provider dispatch, including synchronous re-entrance.
    // This fence is process-local; persistent unknown-usage custody remains
    // the responsibility of the native budget adapter, not this pure broker.
    const bound = structuredClone(value);
    const result = Promise.resolve().then(() => this.#invokeFirst(bound, providerCall, transcript));
    this.#inFlight.set(operationId, { requestDigest, result });
    try { return await result; }
    finally { this.#inFlight.delete(operationId); }
  }

  async #invokeFirst(
    value: unknown,
    providerCall: (request: ProviderRequestV1, signal: AbortSignal) => Promise<ProviderResponseV1>,
    transcript: ModelToolTranscriptV1 | null,
  ): Promise<ModelBrokerResultV1> {
    const guarded = guardModelRequestV1(value, this.#policy);
    if (guarded.outcome !== "ALLOW") return issueResult(value, guarded.outcome, guarded.issues);
    const requestDigest = digest(transcript === null ? guarded.request : {request:guarded.request, transcript});
    const prior = this.#receipts.get(guarded.request.operationId);
    if (prior !== undefined) {
      if (prior.requestDigest !== requestDigest) return issueResult(value, "DENY", ["MODEL_REPLAY_CONFLICT_DENIED"]);
      return { ...prior.result, replay: "SAME_RECEIPT" };
    }
    const budgetKey = `${guarded.request.tenant}\n${guarded.request.purpose}\n${guarded.route.routeId}`;
    const used = this.#reserved.get(budgetKey) ?? 0;
    if (used >= guarded.request.budget.maxRequests) return issueResult(value, "THROTTLE", ["MODEL_REQUEST_BUDGET_THROTTLED"]);
    this.#reserved.set(budgetKey, used + 1);
    const plain = adaptCanonicalRequestV1(guarded.request, guarded.route);
    if (transcript !== null && guarded.request.attachments.length !== 0) {
      return issueResult(value, "DENY", ["MODEL_TOOL_TRANSCRIPT_ATTACHMENTS_DENIED"]);
    }
    const {attachments: _chatAttachments, ...chatPlain} = plain;
    const adapted = transcript === null ? plain : {...chatPlain, messages: transcript.messages};
    if (transcript !== null && Buffer.byteLength(canonicalJson(adapted)) > guarded.request.budget.maxInputBytes) {
      return issueResult(value, "DENY", ["MODEL_TOOL_TRANSCRIPT_INPUT_LIMIT_DENIED"]);
    }
    const providerRequest: ProviderRequestV1 = {
      route: guarded.route,
      credentialHandle: guarded.route.credentialHandle,
      request: adapted,
      requestDigest: digest(adapted),
    };
    let providerResponse: ProviderResponseV1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), guarded.request.budget.timeoutMs);
    try {
      providerResponse = await providerCall(providerRequest, controller.signal);
      if (controller.signal.aborted) throw new Error("timeout");
    } catch {
      clearTimeout(timer);
      return issueResult(value, "QUARANTINE", ["MODEL_PROVIDER_UNAVAILABLE_QUARANTINED"]);
    }
    clearTimeout(timer);
    if (transcript !== null) {
      try { providerResponse = snapshotModelToolDataV1(providerResponse) as ProviderResponseV1; }
      catch { return issueResult(value, "QUARANTINE", ["MODEL_TOOL_RESPONSE_DATA_ONLY_QUARANTINED"]); }
    }
    const responseGuard = guardModelResponseV1(guarded.request, guarded.route, providerRequest.requestDigest, providerResponse, transcript !== null);
    if (responseGuard.outcome !== "ALLOW") return issueResult(value, "QUARANTINE", responseGuard.issues);
    const result: ModelBrokerResultV1 = {
      outcome: "ALLOW",
      response: responseGuard.response,
      issues: guarded.redactions + responseGuard.redactions > 0 ? ["MODEL_CONTENT_REDACTED"] : [],
      replay: "FIRST",
      audit: {
        schemaVersion: "chimpmaera.model/model-audit/v1",
        operationId: guarded.request.operationId,
        correlationId: guarded.request.correlationId,
        tenantDigest: digest(guarded.request.tenant),
        purposeDigest: digest(guarded.request.purpose),
        requestDigest,
        responseDigest: digest(responseGuard.response),
        outcome: "ALLOW",
        usage: providerResponse.usage,
        issues: guarded.redactions + responseGuard.redactions > 0 ? ["MODEL_CONTENT_REDACTED"] : [],
      },
    };
    this.#receipts.set(guarded.request.operationId, { requestDigest, result });
    return result;
  }
}

export function syntheticModelAccessPolicyV1(protocol: ModelProtocolV1 = "OPENAI_CHAT_COMPLETIONS"): ModelAccessPolicyV1 {
  return {
    schemaVersion: "chimpmaera.model/model-access-policy/v1",
    routes: [{
      routeId: `route:synthetic-${protocol.toLowerCase().replaceAll("_", "-")}`,
      provider: "provider:synthetic-model",
      model: "model:synthetic-v1",
      protocol,
      credentialHandle: "credential-handle:synthetic-model-v1",
      allowedTenants: ["tenant:synthetic-zoo"],
      allowedPurposes: ["purpose:agent-assistance"],
      optionalFields: protocol === "ANTHROPIC_MESSAGES" ? ["temperature", "top_p"] : ["seed", "temperature", "top_p"],
      attachmentMediaTypes: ["image/png", "image/jpeg", "application/pdf"],
    }],
    workloadIdentities: ["workload:isolated-openclaw"],
    userIdentities: ["user:synthetic-owner"],
    maxBudget: {
      maxInputBytes: 65_536,
      maxOutputBytes: 65_536,
      maxTokens: 4_096,
      maxCostMicros: 100_000,
      maxRequests: 32,
      timeoutMs: 30_000,
    },
  };
}

export function syntheticCanonicalModelRequestV1(protocol: ModelProtocolV1 = "OPENAI_CHAT_COMPLETIONS"): CanonicalModelRequestV1 {
  const policy = syntheticModelAccessPolicyV1(protocol);
  const route = policy.routes[0]!;
  return {
    schemaVersion: MODEL_REQUEST_SCHEMA_V1,
    workloadIdentity: "workload:isolated-openclaw",
    userIdentity: "user:synthetic-owner",
    tenant: "tenant:synthetic-zoo",
    purpose: "purpose:agent-assistance",
    delegationDigest: "a".repeat(64),
    operationId: "operation:model-0001",
    correlationId: "correlation:model-0001",
    routeId: route.routeId,
    provider: route.provider,
    model: route.model,
    protocol,
    dataClassification: "INTERNAL",
    trustClass: "UNTRUSTED_AGENT_INPUT",
    text: "Return one typed candidate without executing it.",
    attachments: [{ mediaType: "image/png", digest: "b".repeat(64), bytes: 128, reference: "attachment:synthetic-image" }],
    tools: [{ name: "crm.contact.create", description: "Propose a synthetic contact candidate.", inputSchema: { type: "object", properties: { name: { type: "string" } } } }],
    structuredOutput: { name: "candidate", schema: { type: "object" }, strict: true },
    optionalFields: { temperature: 0 },
    budget: { maxInputBytes: 8_192, maxOutputBytes: 8_192, maxTokens: 512, maxCostMicros: 1_000, maxRequests: 1, timeoutMs: 2_000 },
  };
}
