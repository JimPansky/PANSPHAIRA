import { createHash } from "node:crypto";
import { types as nodeTypes } from "node:util";

import { canonicalJson } from "./canonical-json.js";

export const EXTERNAL_BI_SERVICE_CONFIG_SCHEMA_V2 =
  "chimpmaera.external-bi-service/config/v2" as const;
export const EXTERNAL_BI_SERVICE_READBACK_SCHEMA_V2 =
  "chimpmaera.external-bi-service/readback/v2" as const;
export const EXTERNAL_BI_SERVICE_PRODUCT_VERSION_V2 = "v0.8.0" as const;
// J01 exact opt-in selection; legacy default is retained, not rewritten.
export const PAN524_J02_PRODUCT_VERSION_V1 = "v0.18.1" as const;
export const PAN524_J02_PAIR_PROFILE_ID_V1 = "KS_J02_0181_C2_V1" as const;
export const EXTERNAL_BI_SERVICE_CONTRACT_ID_V2 =
  "superset-bi-agent.external" as const;
export const EXTERNAL_BI_SERVICE_CONTRACT_VERSION_V2 = "2.0.0" as const;
export const EXTERNAL_BI_SERVICE_ATTESTATION_SCHEMA_V2 =
  "superset-bi-agent.external/capability-attestation/v2" as const;
export const EXTERNAL_BI_SERVICE_REQUEST_SCHEMA_V2 =
  "superset-bi-agent.external/intent-request/v2" as const;
export const EXTERNAL_BI_SERVICE_RESULT_SCHEMA_V2 =
  "superset-bi-agent.external/intent-result/v2" as const;

export const EXTERNAL_BI_SERVICE_CAPABILITIES_V2 = Object.freeze([
  "bi.status.read",
  "bi.discovery.run",
  "bi.analysis.run",
  "bi.graph.adaptive-v1.plan",
  "bi.preview.create",
  "bi.readback.read",
] as const);

export const EXTERNAL_BI_SERVICE_ACTIONS_V2 = Object.freeze([
  "status",
  "discovery",
  "analyze",
  "plan",
  "preview",
  "readback",
] as const);

const OWNER_CAPABILITY_DESCRIPTORS_V2 = deepFreeze({
  "bi.status.read": { action: "status", authority: "read-only" },
  "bi.discovery.run": { action: "discovery", authority: "local-evidence-write" },
  "bi.analysis.run": { action: "analyze", authority: "source-read-only" },
  "bi.graph.adaptive-v1.plan": { action: "plan", authority: "proposal-only" },
  "bi.preview.create": { action: "preview", authority: "proposal-only" },
  "bi.readback.read": { action: "readback", authority: "read-only" },
} as const);

/**
 * The expected compatibility profile is owned by PanSphaira. Transport
 * configuration may select an endpoint and timeout, but it cannot select or
 * attest a different product/contract/capability tuple.
 */
const OWNER_COMPATIBILITY_PROFILE_V2 = deepFreeze({
  schemaVersion: "pansphaira.external-bi-service/compatibility-profile/v2",
  product: {
    id: "superset-bi-agent",
    version: EXTERNAL_BI_SERVICE_PRODUCT_VERSION_V2,
    component: "bi-agent-runtime",
  },
  contract: {
    id: EXTERNAL_BI_SERVICE_CONTRACT_ID_V2,
    version: EXTERNAL_BI_SERVICE_CONTRACT_VERSION_V2,
  },
  capabilities: EXTERNAL_BI_SERVICE_CAPABILITIES_V2.map((id) => ({
    id,
    ...OWNER_CAPABILITY_DESCRIPTORS_V2[id],
  })),
} as const);

type OwnerCompatibilityProfileV2 = Readonly<{
  schemaVersion: string;
  product: Readonly<{ id: string; version: string; component: string }>;
  contract: Readonly<{ id: string; version: string }>;
  capabilities: readonly Readonly<{ id: string; action: string; authority: string; externalIntent?: false }>[];
}>;
const OWNER_J02_COMPATIBILITY_PROFILE_V1 = deepFreeze({
  ...OWNER_COMPATIBILITY_PROFILE_V2,
  product: { ...OWNER_COMPATIBILITY_PROFILE_V2.product, version: PAN524_J02_PRODUCT_VERSION_V1 },
  capabilities: [
    ...OWNER_COMPATIBILITY_PROFILE_V2.capabilities,
    { id: "superset.trusted-apply", action: "trusted-apply", authority: "trusted-approval-only", externalIntent: false },
    { id: "superset.trusted-readback", action: "trusted-readback", authority: "trusted-approval-only", externalIntent: false },
    { id: "superset.trusted-rollback", action: "trusted-rollback", authority: "trusted-approval-only", externalIntent: false },
  ],
} as const);
function ownerProfileForProductVersion(version: unknown): OwnerCompatibilityProfileV2 | null {
  if (version === EXTERNAL_BI_SERVICE_PRODUCT_VERSION_V2) return OWNER_COMPATIBILITY_PROFILE_V2;
  if (version === PAN524_J02_PRODUCT_VERSION_V1) return OWNER_J02_COMPATIBILITY_PROFILE_V1;
  return null;
}

const OWNER_GRAPH_PROFILE_V2 = deepFreeze({
  acceptedIncumbent: "adaptive-v1",
  candidatePromotion: "none",
} as const);

const OWNER_BOUNDARY_PROFILE_V2 = deepFreeze({
  sourceDatabaseCredentialsAccepted: false,
  freeSqlAccepted: false,
  rawSourceRowsReturned: false,
  modelMutationAuthority: false,
  directSupersetMutationIntentAccepted: false,
  persistentSupersetWorkflow: "trusted-preview-approval-apply-readback-rollback-only",
} as const);

const ENV_KEYS = Object.freeze([
  "BI_AGENT_BASE_URL",
  "BI_AGENT_PAIR_PROFILE",
  "BI_AGENT_EXPECTED_PRODUCT_VERSION",
  "BI_AGENT_EXPECTED_CONTRACT_VERSION",
  "BI_AGENT_TIMEOUT_MS",
  "SUPERSET_BASE_URL",
] as const);

export type ExternalBiServiceReasonCodeV2 =
  | "EXTERNAL_BI_SERVICE_DISABLED"
  | "EXTERNAL_BI_SERVICE_NOT_CONFIGURED"
  | "EXTERNAL_BI_SERVICE_CONFIG_VERIFIED"
  | "EXTERNAL_BI_SERVICE_DIRECT_SUPERSET_CONFIG_DENIED"
  | "EXTERNAL_BI_SERVICE_URL_DENIED"
  | "EXTERNAL_BI_SERVICE_TIMEOUT_DENIED"
  | "EXTERNAL_BI_SERVICE_PRODUCT_VERSION_DENIED"
  | "EXTERNAL_BI_SERVICE_COMPATIBILITY_PROFILE_DENIED"
  | "EXTERNAL_BI_SERVICE_CONTRACT_VERSION_DENIED"
  | "EXTERNAL_BI_SERVICE_ATTESTATION_MALFORMED"
  | "EXTERNAL_BI_SERVICE_DIGEST_DENIED"
  | "EXTERNAL_BI_SERVICE_CAPABILITY_MISSING"
  | "EXTERNAL_BI_SERVICE_REQUEST_DENIED"
  | "EXTERNAL_BI_SERVICE_ACTION_DENIED"
  | "EXTERNAL_BI_SERVICE_UNSAFE_REQUEST_DENIED"
  | "EXTERNAL_BI_SERVICE_RESPONSE_MALFORMED"
  | "EXTERNAL_BI_SERVICE_STATUS_MALFORMED"
  | "EXTERNAL_BI_SERVICE_UNAVAILABLE";

export interface ExternalBiServiceConfigV2 {
  readonly schemaVersion: typeof EXTERNAL_BI_SERVICE_CONFIG_SCHEMA_V2;
  readonly enabled: boolean;
  readonly biAgentBaseUrl: string | null;
  readonly expectedProductVersion: typeof EXTERNAL_BI_SERVICE_PRODUCT_VERSION_V2 | typeof PAN524_J02_PRODUCT_VERSION_V1;
  readonly expectedContractVersion: typeof EXTERNAL_BI_SERVICE_CONTRACT_VERSION_V2;
  readonly timeoutMs: number;
  readonly requiredCapabilities: readonly typeof EXTERNAL_BI_SERVICE_CAPABILITIES_V2[number][];
}

export type ExternalBiServiceConfigDecisionV2 =
  | { readonly outcome: "VERIFIED"; readonly reasonCodes: readonly ["EXTERNAL_BI_SERVICE_CONFIG_VERIFIED"]; readonly config: ExternalBiServiceConfigV2 }
  | { readonly outcome: "DISABLED"; readonly reasonCodes: readonly ("EXTERNAL_BI_SERVICE_DISABLED" | "EXTERNAL_BI_SERVICE_NOT_CONFIGURED")[]; readonly config: ExternalBiServiceConfigV2 }
  | { readonly outcome: "DENIED"; readonly reasonCodes: readonly ExternalBiServiceReasonCodeV2[] };

export interface ExternalBiServiceReadbackV2 {
  readonly schemaVersion: typeof EXTERNAL_BI_SERVICE_READBACK_SCHEMA_V2;
  readonly outcome: "READY";
  readonly productVersion: typeof EXTERNAL_BI_SERVICE_PRODUCT_VERSION_V2 | typeof PAN524_J02_PRODUCT_VERSION_V1;
  readonly contractVersion: typeof EXTERNAL_BI_SERVICE_CONTRACT_VERSION_V2;
  readonly capabilities: readonly typeof EXTERNAL_BI_SERVICE_CAPABILITIES_V2[number][];
  readonly acceptedGraphIncumbent: "adaptive-v1";
  readonly attestationDigest: string;
  readonly statusResponseDigest: string;
  readonly directSupersetAccessByCm: false;
}

export type ExternalBiServiceProbeResultV2 =
  | { readonly outcome: "VERIFIED"; readonly reasonCodes: readonly ["EXTERNAL_BI_SERVICE_CONFIG_VERIFIED"]; readonly readback: ExternalBiServiceReadbackV2 }
  | { readonly outcome: "DISABLED"; readonly reasonCodes: readonly ("EXTERNAL_BI_SERVICE_DISABLED" | "EXTERNAL_BI_SERVICE_NOT_CONFIGURED")[] }
  | { readonly outcome: "DENIED" | "UNAVAILABLE"; readonly reasonCodes: readonly ExternalBiServiceReasonCodeV2[] };

export type ExternalBiServiceActionV2 = typeof EXTERNAL_BI_SERVICE_ACTIONS_V2[number];

export interface ExternalBiServiceIntentRequestV2 {
  readonly requestId: string;
  readonly action: ExternalBiServiceActionV2;
  readonly input?: Readonly<Record<string, unknown>>;
}

export interface ExternalBiServiceIntentReadbackV2 {
  readonly action: ExternalBiServiceActionV2;
  readonly requestId: string;
  readonly attestationDigest: string;
  readonly responseDigest: string;
  readonly result: Readonly<Record<string, unknown>>;
}

export type ExternalBiServiceIntentResultV2 =
  | { readonly outcome: "VERIFIED"; readonly reasonCodes: readonly ["EXTERNAL_BI_SERVICE_CONFIG_VERIFIED"]; readonly readback: ExternalBiServiceIntentReadbackV2 }
  | { readonly outcome: "DISABLED"; readonly reasonCodes: readonly ("EXTERNAL_BI_SERVICE_DISABLED" | "EXTERNAL_BI_SERVICE_NOT_CONFIGURED")[] }
  | { readonly outcome: "DENIED" | "UNAVAILABLE"; readonly reasonCodes: readonly ExternalBiServiceReasonCodeV2[] };

const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/;
const OWNER_VERIFIED_DECISIONS_V2 = new WeakSet<object>();

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) || nodeTypes.isProxy(value)) return false;
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype) return false;
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || DANGEROUS_KEYS.has(key)) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor) || descriptor.enumerable !== true) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function isDenseArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || nodeTypes.isProxy(value)) return false;
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) return false;
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) return false;
    const expectedKeys = [
      ...Array.from({ length: value.length }, (_, index) => String(index)),
      "length",
    ];
    if (keys.length !== expectedKeys.length || expectedKeys.some((key) => !keys.includes(key))) return false;
    return expectedKeys.slice(0, -1).every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor !== undefined && "value" in descriptor && descriptor.enumerable === true;
    });
  } catch {
    return false;
  }
}

function safeJsonClone<T>(value: T, ancestors = new Set<object>()): T {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)
      || (Number.isInteger(value) && !Number.isSafeInteger(value))) {
      throw new TypeError("UNSAFE_JSON_NUMBER");
    }
    return value;
  }
  if (isDenseArray(value)) {
    if (ancestors.has(value)) throw new TypeError("CYCLIC_JSON_ARRAY");
    const next = new Set(ancestors).add(value);
    return Array.from({ length: value.length }, (_, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor === undefined || !("value" in descriptor)) throw new TypeError("UNSAFE_JSON_ARRAY");
      return safeJsonClone(descriptor.value, next);
    }) as T;
  }
  if (!isRecord(value) || ancestors.has(value as object)) throw new TypeError("UNSAFE_JSON_OBJECT");
  const next = new Set(ancestors).add(value as object);
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) throw new TypeError("UNSAFE_JSON_OBJECT");
    Object.defineProperty(output, key, {
      value: safeJsonClone(descriptor.value, next),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return output as T;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) {
      if (key !== "length") deepFreeze((value as Record<PropertyKey, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function immutable<T>(value: T): T {
  return deepFreeze(safeJsonClone(value));
}

function exactKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function sameCanonicalValue(actual: unknown, expected: unknown): boolean {
  try {
    return canonicalJson(actual) === canonicalJson(expected);
  } catch {
    return false;
  }
}

function snapshotEnvironment(
  value: unknown,
): Partial<Record<typeof ENV_KEYS[number], string | undefined>> | null {
  if (!isRecord(value)) return null;
  const snapshot: Partial<Record<typeof ENV_KEYS[number], string | undefined>> = {};
  for (const key of ENV_KEYS) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined) continue;
    if (!("value" in descriptor)
      || (descriptor.value !== undefined && typeof descriptor.value !== "string")) return null;
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function configDenied(reasonCode: ExternalBiServiceReasonCodeV2): ExternalBiServiceConfigDecisionV2 {
  return immutable({ outcome: "DENIED" as const, reasonCodes: [reasonCode] });
}

function disabled(reasonCodes: readonly ("EXTERNAL_BI_SERVICE_DISABLED" | "EXTERNAL_BI_SERVICE_NOT_CONFIGURED")[]): ExternalBiServiceConfigDecisionV2 {
  return immutable({
    outcome: "DISABLED",
    reasonCodes: [...reasonCodes],
    config: {
      schemaVersion: EXTERNAL_BI_SERVICE_CONFIG_SCHEMA_V2,
      enabled: false,
      biAgentBaseUrl: null,
      expectedProductVersion: OWNER_COMPATIBILITY_PROFILE_V2.product.version,
      expectedContractVersion: OWNER_COMPATIBILITY_PROFILE_V2.contract.version,
      timeoutMs: 5000,
      requiredCapabilities: [...EXTERNAL_BI_SERVICE_CAPABILITIES_V2],
    },
  });
}

function sanitizeBaseUrl(input: string): string | null {
  if (input.length > 2048 || /[\u0000-\u001f\s]/.test(input) || /%40/i.test(input)) return null;
  let parsed: URL;
  try { parsed = new URL(input); } catch { return null; }
  if (!["http:", "https:"].includes(parsed.protocol)) return null;
  if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
  if (parsed.pathname !== "/" && parsed.pathname !== "") return null;
  const host = parsed.hostname.toLowerCase();
  if (!host || ["0.0.0.0", "169.254.169.254", "[::]", "::"].includes(host)) return null;
  parsed.pathname = "/";
  return parsed.toString().replace(/\/$/, "");
}

function parseTimeout(value: string | undefined): number | null {
  if (value === undefined || value === "") return 5000;
  if (!/^[0-9]{2,6}$/.test(value)) return null;
  const parsed = Number(value);
  return parsed >= 100 && parsed <= 30000 ? parsed : null;
}

export function configureExternalBiServiceV2(
  env: Partial<Record<typeof ENV_KEYS[number], string | undefined>>,
): ExternalBiServiceConfigDecisionV2 {
  const envSnapshot = snapshotEnvironment(env);
  if (envSnapshot === null) return configDenied("EXTERNAL_BI_SERVICE_URL_DENIED");
  const hasAny = ENV_KEYS.some((key) => envSnapshot[key] !== undefined && envSnapshot[key] !== "");
  if (!hasAny) return disabled(["EXTERNAL_BI_SERVICE_NOT_CONFIGURED"]);
  if (envSnapshot.SUPERSET_BASE_URL) {
    return configDenied("EXTERNAL_BI_SERVICE_DIRECT_SUPERSET_CONFIG_DENIED");
  }
  if (envSnapshot.BI_AGENT_EXPECTED_PRODUCT_VERSION) {
    return configDenied("EXTERNAL_BI_SERVICE_PRODUCT_VERSION_DENIED");
  }
  if (envSnapshot.BI_AGENT_EXPECTED_CONTRACT_VERSION) {
    return configDenied("EXTERNAL_BI_SERVICE_CONTRACT_VERSION_DENIED");
  }
  const biAgentBaseUrl = envSnapshot.BI_AGENT_BASE_URL
    ? sanitizeBaseUrl(envSnapshot.BI_AGENT_BASE_URL)
    : null;
  if (!biAgentBaseUrl) return configDenied("EXTERNAL_BI_SERVICE_URL_DENIED");
  const timeoutMs = parseTimeout(envSnapshot.BI_AGENT_TIMEOUT_MS);
  if (timeoutMs === null) return configDenied("EXTERNAL_BI_SERVICE_TIMEOUT_DENIED");
  const selection = envSnapshot.BI_AGENT_PAIR_PROFILE;
  if (selection !== undefined && selection !== "" && selection !== PAN524_J02_PAIR_PROFILE_ID_V1) {
    return configDenied("EXTERNAL_BI_SERVICE_COMPATIBILITY_PROFILE_DENIED");
  }
  const selectedProductVersion = selection === PAN524_J02_PAIR_PROFILE_ID_V1
    ? PAN524_J02_PRODUCT_VERSION_V1 : OWNER_COMPATIBILITY_PROFILE_V2.product.version;
  const decision = immutable({
    outcome: "VERIFIED" as const,
    reasonCodes: ["EXTERNAL_BI_SERVICE_CONFIG_VERIFIED"] as const,
    config: {
      schemaVersion: EXTERNAL_BI_SERVICE_CONFIG_SCHEMA_V2,
      enabled: true,
      biAgentBaseUrl,
      expectedProductVersion: selectedProductVersion,
      expectedContractVersion: OWNER_COMPATIBILITY_PROFILE_V2.contract.version,
      timeoutMs,
      requiredCapabilities: [...EXTERNAL_BI_SERVICE_CAPABILITIES_V2],
    },
  });
  OWNER_VERIFIED_DECISIONS_V2.add(decision);
  return decision;
}

function endpoint(baseUrl: string, pathname: string): string {
  const parsed = new URL(baseUrl);
  parsed.pathname = pathname;
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

async function responseJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return null; }
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function bodyWithout(value: Record<string, unknown>, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([entry]) => entry !== key));
}

function ownerConfigError(value: unknown): ExternalBiServiceReasonCodeV2 | null {
  if (!exactKeys(value, [
    "schemaVersion", "enabled", "biAgentBaseUrl", "expectedProductVersion",
    "expectedContractVersion", "timeoutMs", "requiredCapabilities",
  ]) || value.schemaVersion !== EXTERNAL_BI_SERVICE_CONFIG_SCHEMA_V2 || value.enabled !== true) {
    return "EXTERNAL_BI_SERVICE_REQUEST_DENIED";
  }
  if (ownerProfileForProductVersion(value.expectedProductVersion) === null) {
    return "EXTERNAL_BI_SERVICE_PRODUCT_VERSION_DENIED";
  }
  if (value.expectedContractVersion !== OWNER_COMPATIBILITY_PROFILE_V2.contract.version) {
    return "EXTERNAL_BI_SERVICE_CONTRACT_VERSION_DENIED";
  }
  if (!sameCanonicalValue(value.requiredCapabilities, EXTERNAL_BI_SERVICE_CAPABILITIES_V2)) {
    return "EXTERNAL_BI_SERVICE_CAPABILITY_MISSING";
  }
  if (typeof value.biAgentBaseUrl !== "string"
    || sanitizeBaseUrl(value.biAgentBaseUrl) !== value.biAgentBaseUrl) {
    return "EXTERNAL_BI_SERVICE_URL_DENIED";
  }
  if (!Number.isSafeInteger(value.timeoutMs)
    || (value.timeoutMs as number) < 100 || (value.timeoutMs as number) > 30000) {
    return "EXTERNAL_BI_SERVICE_TIMEOUT_DENIED";
  }
  return null;
}

function matchesOwnerProduct(value: unknown, profile: OwnerCompatibilityProfileV2): boolean {
  return exactKeys(value, ["id", "version", "component"])
    && sameCanonicalValue(value, profile.product);
}

function matchesOwnerContract(value: unknown, profile: OwnerCompatibilityProfileV2): boolean {
  return exactKeys(value, ["id", "version"])
    && sameCanonicalValue(value, profile.contract);
}

function matchesOwnerCapabilities(value: unknown, profile: OwnerCompatibilityProfileV2): boolean {
  return Array.isArray(value)
    && value.length === profile.capabilities.length
    && value.every((item, index) => {
      const expected = profile.capabilities[index]!;
      const keys = expected.externalIntent === false ? ["id", "action", "authority", "externalIntent"] : ["id", "action", "authority"];
      return exactKeys(item, keys) && sameCanonicalValue(item, expected);
    });
}

const PAN524_J02_PROVIDER_PROFILE_DIGEST_V1 = "sha256:9d50be8fad2ba9f3432e1461a2a9d9b08a567097d5f9a88ec86b7405230f9b04";
const PAN524_J02_AGENT_ARTIFACT_V1 = deepFreeze({
  packageName: "@chimpmaera-bi/agent", packageVersion: "0.18.1",
  packageSha256: "826bcc27fa1a59514001b550a8d07c2fd129bf68089ddc98bdf626b2eb346145", component: "bi-agent-runtime",
} as const);
function validateSelectedProviderProfile(value: unknown, profile: OwnerCompatibilityProfileV2, attestation: unknown): ExternalBiServiceReasonCodeV2 | null {
  if (!exactKeys(value, ["schemaVersion", "product", "artifact", "contract", "attestations", "consumerProfile", "allowedOperations", "registry", "execution", "integrity"])
    || value.schemaVersion !== "superset-bi-agent.external/provider-profile/v1") return "EXTERNAL_BI_SERVICE_ATTESTATION_MALFORMED";
  if (!matchesOwnerProduct(value.product, profile)) return "EXTERNAL_BI_SERVICE_PRODUCT_VERSION_DENIED";
  if (!matchesOwnerContract(value.contract, profile)) return "EXTERNAL_BI_SERVICE_CONTRACT_VERSION_DENIED";
  if (!exactKeys(value.artifact, ["packageName", "packageVersion", "packageSha256", "component"])
    || !sameCanonicalValue(value.artifact, PAN524_J02_AGENT_ARTIFACT_V1)) return "EXTERNAL_BI_SERVICE_DIGEST_DENIED";
  if (!Array.isArray(value.attestations) || value.attestations.length !== 1
    || !sameCanonicalValue(value.attestations[0], attestation)) return "EXTERNAL_BI_SERVICE_ATTESTATION_MALFORMED";
  const proof = value.integrity;
  if (!exactKeys(proof, ["algorithm", "digest"]) || proof.algorithm !== "sha256-canonical-json") return "EXTERNAL_BI_SERVICE_ATTESTATION_MALFORMED";
  try {
    if (proof.digest !== PAN524_J02_PROVIDER_PROFILE_DIGEST_V1 || proof.digest !== digest(bodyWithout(value, "integrity"))) return "EXTERNAL_BI_SERVICE_DIGEST_DENIED";
  } catch { return "EXTERNAL_BI_SERVICE_ATTESTATION_MALFORMED"; }
  return null;
}

function validateAttestation(value: unknown, profile: OwnerCompatibilityProfileV2): ExternalBiServiceReasonCodeV2 | null {
  if (!exactKeys(value, [
    "schemaVersion", "product", "contract", "capabilities", "graph", "boundaries", "attestation",
  ]) || value.schemaVersion !== EXTERNAL_BI_SERVICE_ATTESTATION_SCHEMA_V2) {
    return "EXTERNAL_BI_SERVICE_ATTESTATION_MALFORMED";
  }
  const proof = value.attestation;
  if (!exactKeys(proof, ["algorithm", "digest"])
    || proof.algorithm !== "sha256-canonical-json"
    || typeof proof.digest !== "string" || !SHA256_DIGEST.test(proof.digest)) {
    return "EXTERNAL_BI_SERVICE_ATTESTATION_MALFORMED";
  }
  try {
    if (proof.digest !== digest(bodyWithout(value, "attestation"))) return "EXTERNAL_BI_SERVICE_DIGEST_DENIED";
  } catch { return "EXTERNAL_BI_SERVICE_ATTESTATION_MALFORMED"; }
  if (!matchesOwnerProduct(value.product, profile)) return "EXTERNAL_BI_SERVICE_PRODUCT_VERSION_DENIED";
  if (!matchesOwnerContract(value.contract, profile)) return "EXTERNAL_BI_SERVICE_CONTRACT_VERSION_DENIED";
  if (!matchesOwnerCapabilities(value.capabilities, profile)) return "EXTERNAL_BI_SERVICE_CAPABILITY_MISSING";
  if (!exactKeys(value.graph, ["acceptedIncumbent", "candidatePromotion"])
    || !sameCanonicalValue(value.graph, OWNER_GRAPH_PROFILE_V2)) return "EXTERNAL_BI_SERVICE_CAPABILITY_MISSING";
  if (!exactKeys(value.boundaries, [
    "sourceDatabaseCredentialsAccepted", "freeSqlAccepted", "rawSourceRowsReturned",
    "modelMutationAuthority", "directSupersetMutationIntentAccepted", "persistentSupersetWorkflow",
  ]) || !sameCanonicalValue(value.boundaries, OWNER_BOUNDARY_PROFILE_V2)) {
    return "EXTERNAL_BI_SERVICE_ATTESTATION_MALFORMED";
  }
  return null;
}

const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const FORBIDDEN_REQUEST_KEY = /^(?:sql|query|password|passwd|secret|token|credential|credentials|authorization|cookie|raw|rawrows|rows|url|uri|host|port)$/i;
const FORBIDDEN_REQUEST_TEXT = /(?:\b(?:select|insert|update|delete|merge|drop|alter|create|truncate|grant|revoke|exec(?:ute)?|dbcc|backup|restore)\b|\braw\s+sql\b|\bsql\s*lab\b|password|credential|secret|api[_ -]?key|bearer\s+\S+|system\s+prompt|ignore\s+(?:all\s+)?previous)/i;

function unsafeRequestValue(value: unknown): boolean {
  if (typeof value === "string") return FORBIDDEN_REQUEST_TEXT.test(value);
  if (value === null || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return false;
  if (Array.isArray(value)) return value.some(unsafeRequestValue);
  if (!isRecord(value)) return true;
  return Object.entries(value).some(([key, item]) => FORBIDDEN_REQUEST_KEY.test(key.replace(/[^A-Za-z0-9]/g, "")) || unsafeRequestValue(item));
}

// A planning-policy enum is not free SQL or an executable request. Admit only
// this exact published extraction tuple, at its typed result path, for J02.
// Every other response field and every caller input retain the original filter.
function unsafeIntentResult(value: unknown, request: ExternalBiServiceIntentRequestV2, profile: OwnerCompatibilityProfileV2): boolean {
  if (profile.product.version === PAN524_J02_PRODUCT_VERSION_V1 && request.action === "plan"
    && exactKeys(value, ["schemaVersion", "planId", "objective", "evidenceBinding", "graph", "planning", "authority", "trustedWorkflow"])
    && value.schemaVersion === "superset-bi-agent.external/plan/v2"
    && sameCanonicalValue(value.authority, { proposalOnly: true, persistentActionAllowed: false, modelMutationAuthority: false })
    && sameCanonicalValue(value.graph, OWNER_GRAPH_PROFILE_V2)
    && sameCanonicalValue(value.planning, {
      policyVersion: "chimpmaera.bi/planning-policy/v1", taskClass: "extraction", pattern: "direct-execute-check",
      validationDepth: "exact", toolBudget: 4, stepBudget: 6,
      fallback: "retain-incumbent-and-return-evidence-bound-partial",
    })) {
    const planning = value.planning as Record<string, unknown>;
    return unsafeRequestValue({ ...value, planning: { ...planning, pattern: "owner-bound-planning-enum" } });
  }
  if (profile.product.version === PAN524_J02_PRODUCT_VERSION_V1 && request.action === "preview"
    && exactKeys(value, ["schemaVersion", "previewId", "planId", "evidenceBinding", "graph", "hypotheses", "kpiCandidates", "visualizationProposal", "confidence", "blindSpots", "userCorrection", "authority"])
    && value.schemaVersion === "superset-bi-agent.external/preview/v2"
    && sameCanonicalValue(value.graph, OWNER_GRAPH_PROFILE_V2)
    && sameCanonicalValue(value.authority, {
      proposalOnly: true, applyPerformed: false, sourceRowsReturned: false,
      modelMutationAuthority: false, approvalRequiredBeforePersistence: true,
    })
    && sameCanonicalValue(value.userCorrection, {
      requiredBeforePersistence: true,
      questions: ["Confirm KPI grain and units", "Confirm anomaly business thresholds", "Select executive or operational emphasis"],
    })) {
    return unsafeRequestValue({ ...value, userCorrection: {
      requiredBeforePersistence: true,
      questions: ["Confirm KPI grain and units", "Confirm anomaly business thresholds", "owner-bound-correction-question"],
    } });
  }
  return unsafeRequestValue(value);
}

function validateIntentRequest(request: unknown): ExternalBiServiceReasonCodeV2 | null {
  if (!isRecord(request) || typeof request.requestId !== "string"
    || !REQUEST_ID.test(request.requestId)) return "EXTERNAL_BI_SERVICE_REQUEST_DENIED";
  if (!EXTERNAL_BI_SERVICE_ACTIONS_V2.includes(request.action as ExternalBiServiceActionV2)) return "EXTERNAL_BI_SERVICE_ACTION_DENIED";
  const expectedKeys = Object.hasOwn(request, "input")
    ? ["requestId", "action", "input"]
    : ["requestId", "action"];
  if (!exactKeys(request, expectedKeys)) return "EXTERNAL_BI_SERVICE_REQUEST_DENIED";
  if (Object.hasOwn(request, "input")
    && (!isRecord(request.input) || unsafeRequestValue(request.input))) {
    return "EXTERNAL_BI_SERVICE_UNSAFE_REQUEST_DENIED";
  }
  try { canonicalJson(request); } catch { return "EXTERNAL_BI_SERVICE_REQUEST_DENIED"; }
  return null;
}

function validateIntentEnvelope(
  value: unknown,
  request: ExternalBiServiceIntentRequestV2,
  attestationDigest: string,
  profile: OwnerCompatibilityProfileV2,
): ExternalBiServiceReasonCodeV2 | null {
  if (!exactKeys(value, [
    "schemaVersion", "requestId", "action", "runtime", "capabilityAttestationDigest", "result", "integrity",
  ]) || value.schemaVersion !== EXTERNAL_BI_SERVICE_RESULT_SCHEMA_V2
    || value.action !== request.action || value.requestId !== request.requestId) {
    return "EXTERNAL_BI_SERVICE_RESPONSE_MALFORMED";
  }
  const runtime = value.runtime;
  const integrity = value.integrity;
  const result = value.result;
  if (!exactKeys(runtime, ["product", "contract"])
    || !exactKeys(integrity, ["algorithm", "digest"])
    || integrity.algorithm !== "sha256-canonical-json"
    || typeof integrity.digest !== "string" || !SHA256_DIGEST.test(integrity.digest)
    || !isRecord(result) || typeof value.capabilityAttestationDigest !== "string") {
    return "EXTERNAL_BI_SERVICE_RESPONSE_MALFORMED";
  }
  try {
    if (integrity.digest !== digest(bodyWithout(value, "integrity"))) return "EXTERNAL_BI_SERVICE_DIGEST_DENIED";
  } catch { return "EXTERNAL_BI_SERVICE_RESPONSE_MALFORMED"; }
  if (!matchesOwnerProduct(runtime.product, profile)) return "EXTERNAL_BI_SERVICE_PRODUCT_VERSION_DENIED";
  if (!matchesOwnerContract(runtime.contract, profile)) return "EXTERNAL_BI_SERVICE_CONTRACT_VERSION_DENIED";
  if (value.capabilityAttestationDigest !== attestationDigest) return "EXTERNAL_BI_SERVICE_DIGEST_DENIED";
  if (unsafeIntentResult(result, request, profile)) return "EXTERNAL_BI_SERVICE_UNSAFE_REQUEST_DENIED";
  if (request.action === "status" && result.status !== "READY") return "EXTERNAL_BI_SERVICE_STATUS_MALFORMED";
  return null;
}

const REASON_CODES_V2 = new Set<ExternalBiServiceReasonCodeV2>([
  "EXTERNAL_BI_SERVICE_DISABLED",
  "EXTERNAL_BI_SERVICE_NOT_CONFIGURED",
  "EXTERNAL_BI_SERVICE_CONFIG_VERIFIED",
  "EXTERNAL_BI_SERVICE_DIRECT_SUPERSET_CONFIG_DENIED",
  "EXTERNAL_BI_SERVICE_URL_DENIED",
  "EXTERNAL_BI_SERVICE_TIMEOUT_DENIED",
  "EXTERNAL_BI_SERVICE_PRODUCT_VERSION_DENIED",
  "EXTERNAL_BI_SERVICE_COMPATIBILITY_PROFILE_DENIED",
  "EXTERNAL_BI_SERVICE_CONTRACT_VERSION_DENIED",
  "EXTERNAL_BI_SERVICE_ATTESTATION_MALFORMED",
  "EXTERNAL_BI_SERVICE_DIGEST_DENIED",
  "EXTERNAL_BI_SERVICE_CAPABILITY_MISSING",
  "EXTERNAL_BI_SERVICE_REQUEST_DENIED",
  "EXTERNAL_BI_SERVICE_ACTION_DENIED",
  "EXTERNAL_BI_SERVICE_UNSAFE_REQUEST_DENIED",
  "EXTERNAL_BI_SERVICE_RESPONSE_MALFORMED",
  "EXTERNAL_BI_SERVICE_STATUS_MALFORMED",
  "EXTERNAL_BI_SERVICE_UNAVAILABLE",
]);

function isReasonCodeArray(value: unknown): value is ExternalBiServiceReasonCodeV2[] {
  return Array.isArray(value) && value.length > 0
    && value.every((item) => typeof item === "string"
      && REASON_CODES_V2.has(item as ExternalBiServiceReasonCodeV2));
}

function intentFailure(
  outcome: "DENIED" | "UNAVAILABLE",
  reasonCode: ExternalBiServiceReasonCodeV2,
): ExternalBiServiceIntentResultV2 {
  return immutable({ outcome, reasonCodes: [reasonCode] });
}

export async function invokeExternalBiServiceV2(
  decision: ExternalBiServiceConfigDecisionV2,
  request: ExternalBiServiceIntentRequestV2,
  fetchImpl: typeof fetch = fetch,
): Promise<ExternalBiServiceIntentResultV2> {
  const ownerDerived = OWNER_VERIFIED_DECISIONS_V2.has(decision);
  let decisionSnapshot: unknown;
  try {
    decisionSnapshot = safeJsonClone(decision);
  } catch {
    return intentFailure("DENIED", "EXTERNAL_BI_SERVICE_REQUEST_DENIED");
  }
  if (!isRecord(decisionSnapshot) || typeof decisionSnapshot.outcome !== "string") {
    return intentFailure("DENIED", "EXTERNAL_BI_SERVICE_REQUEST_DENIED");
  }
  if (decisionSnapshot.outcome === "DISABLED") {
    const disabledCodes = new Set(["EXTERNAL_BI_SERVICE_DISABLED", "EXTERNAL_BI_SERVICE_NOT_CONFIGURED"]);
    if (!exactKeys(decisionSnapshot, ["outcome", "reasonCodes", "config"])
      || !isReasonCodeArray(decisionSnapshot.reasonCodes)
      || !decisionSnapshot.reasonCodes.every((code) => disabledCodes.has(code))) {
      return intentFailure("DENIED", "EXTERNAL_BI_SERVICE_REQUEST_DENIED");
    }
    return immutable({
      outcome: "DISABLED" as const,
      reasonCodes: [...decisionSnapshot.reasonCodes] as (
        "EXTERNAL_BI_SERVICE_DISABLED" | "EXTERNAL_BI_SERVICE_NOT_CONFIGURED"
      )[],
    });
  }
  if (decisionSnapshot.outcome === "DENIED") {
    if (!exactKeys(decisionSnapshot, ["outcome", "reasonCodes"])
      || !isReasonCodeArray(decisionSnapshot.reasonCodes)) {
      return intentFailure("DENIED", "EXTERNAL_BI_SERVICE_REQUEST_DENIED");
    }
    return immutable({ outcome: "DENIED" as const, reasonCodes: [...decisionSnapshot.reasonCodes] });
  }
  if (decisionSnapshot.outcome !== "VERIFIED"
    || !exactKeys(decisionSnapshot, ["outcome", "reasonCodes", "config"])
    || !sameCanonicalValue(decisionSnapshot.reasonCodes, ["EXTERNAL_BI_SERVICE_CONFIG_VERIFIED"])) {
    return intentFailure("DENIED", "EXTERNAL_BI_SERVICE_REQUEST_DENIED");
  }
  const configError = ownerConfigError(decisionSnapshot.config);
  if (configError) return intentFailure("DENIED", configError);
  if (!ownerDerived) return intentFailure("DENIED", "EXTERNAL_BI_SERVICE_REQUEST_DENIED");
  const config = decisionSnapshot.config as unknown as ExternalBiServiceConfigV2;
  const expectedProfile = ownerProfileForProductVersion(config.expectedProductVersion);
  if (expectedProfile === null) return intentFailure("DENIED", "EXTERNAL_BI_SERVICE_COMPATIBILITY_PROFILE_DENIED");
  const baseUrl = config.biAgentBaseUrl;
  if (baseUrl === null) return intentFailure("DENIED", "EXTERNAL_BI_SERVICE_URL_DENIED");

  let requestSnapshot: unknown;
  try {
    requestSnapshot = safeJsonClone(request);
  } catch {
    return intentFailure("DENIED", "EXTERNAL_BI_SERVICE_REQUEST_DENIED");
  }
  const requestError = validateIntentRequest(requestSnapshot);
  if (requestError) return intentFailure("DENIED", requestError);
  const safeRequest = requestSnapshot as ExternalBiServiceIntentRequestV2;

  try {
    const attestationResponse = await fetchImpl(endpoint(baseUrl, "/v2/capabilities"), {
      method: "GET", signal: AbortSignal.timeout(config.timeoutMs),
    });
    if (!attestationResponse.ok) return intentFailure("UNAVAILABLE", "EXTERNAL_BI_SERVICE_UNAVAILABLE");
    let attestation: unknown;
    try {
      attestation = safeJsonClone(await responseJson(attestationResponse));
    } catch {
      return intentFailure("DENIED", "EXTERNAL_BI_SERVICE_ATTESTATION_MALFORMED");
    }
    const attestationError = validateAttestation(attestation, expectedProfile);
    if (attestationError) return intentFailure("DENIED", attestationError);
    const proof = (attestation as Record<string, unknown>).attestation as Record<string, unknown>;
    const attestationDigest = proof.digest as string;
    if (config.expectedProductVersion === PAN524_J02_PRODUCT_VERSION_V1) {
      const profileResponse = await fetchImpl(endpoint(baseUrl, "/v2/provider-profile"), {
        method: "GET", signal: AbortSignal.timeout(config.timeoutMs),
      });
      if (!profileResponse.ok) return intentFailure("UNAVAILABLE", "EXTERNAL_BI_SERVICE_UNAVAILABLE");
      let providerProfile: unknown;
      try { providerProfile = safeJsonClone(await responseJson(profileResponse)); }
      catch { return intentFailure("DENIED", "EXTERNAL_BI_SERVICE_ATTESTATION_MALFORMED"); }
      const profileError = validateSelectedProviderProfile(providerProfile, expectedProfile, attestation);
      if (profileError) return intentFailure("DENIED", profileError);
    }
    const payload = {
      schemaVersion: EXTERNAL_BI_SERVICE_REQUEST_SCHEMA_V2,
      requestId: safeRequest.requestId,
      action: safeRequest.action,
      ...(safeRequest.input === undefined ? {} : { input: safeRequest.input }),
    };
    const response = await fetchImpl(endpoint(baseUrl, "/v2/intents"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    if (!response.ok) return intentFailure("UNAVAILABLE", "EXTERNAL_BI_SERVICE_UNAVAILABLE");
    let value: unknown;
    try {
      value = safeJsonClone(await responseJson(response));
    } catch {
      return intentFailure("DENIED", "EXTERNAL_BI_SERVICE_RESPONSE_MALFORMED");
    }
    const responseError = validateIntentEnvelope(value, safeRequest, attestationDigest, expectedProfile);
    if (responseError) return intentFailure("DENIED", responseError);
    const record = value as Record<string, unknown>;
    const integrity = record.integrity as Record<string, unknown>;
    return immutable({
      outcome: "VERIFIED" as const,
      reasonCodes: ["EXTERNAL_BI_SERVICE_CONFIG_VERIFIED"] as const,
      readback: {
        action: safeRequest.action,
        requestId: safeRequest.requestId,
        attestationDigest,
        responseDigest: integrity.digest as string,
        result: record.result as Readonly<Record<string, unknown>>,
      },
    });
  } catch {
    return intentFailure("UNAVAILABLE", "EXTERNAL_BI_SERVICE_UNAVAILABLE");
  }
}

export async function probeExternalBiServiceV2(
  decision: ExternalBiServiceConfigDecisionV2,
  fetchImpl: typeof fetch = fetch,
): Promise<ExternalBiServiceProbeResultV2> {
  const status = await invokeExternalBiServiceV2(decision, { requestId: "cm-external-bi-probe", action: "status" }, fetchImpl);
  if (status.outcome !== "VERIFIED") return status;
  try {
    return immutable({
      outcome: "VERIFIED" as const,
      reasonCodes: ["EXTERNAL_BI_SERVICE_CONFIG_VERIFIED"] as const,
      readback: {
        schemaVersion: EXTERNAL_BI_SERVICE_READBACK_SCHEMA_V2,
        outcome: "READY",
        productVersion: decision.outcome === "VERIFIED" ? decision.config.expectedProductVersion : EXTERNAL_BI_SERVICE_PRODUCT_VERSION_V2,
        contractVersion: OWNER_COMPATIBILITY_PROFILE_V2.contract.version,
        capabilities: [...EXTERNAL_BI_SERVICE_CAPABILITIES_V2],
        acceptedGraphIncumbent: "adaptive-v1",
        attestationDigest: status.readback.attestationDigest,
        statusResponseDigest: status.readback.responseDigest,
        directSupersetAccessByCm: false,
      },
    });
  } catch {
    return immutable({
      outcome: "UNAVAILABLE" as const,
      reasonCodes: ["EXTERNAL_BI_SERVICE_UNAVAILABLE"] as const,
    });
  }
}
