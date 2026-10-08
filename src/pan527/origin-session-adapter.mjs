import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { createServer as createHttpsServer } from "node:https";
import Ajv2020 from "ajv/dist/2020.js";
import { buildPocGuidedDemoSetupPlanV1, expectedPocGuidedDemoTemplatesV1 } from "../../dist/packages/contracts/src/index.js";
import { PocEarlyAdminCoordinatorV1, createPocEarlyAdminDashboardServerV1 } from "../../dist/packages/setup-coordinator/src/index.js";
import { canonicalJson } from "../../dist/packages/contracts/src/canonical-json.js";
import { validateBrowserProfileReadV1, validateBrowserProfileWriteV1 } from "../../dist/packages/contracts/src/browser-profile-v1.js";
import { runtimeIdentityDigestV1, validateRuntimeIdentityV1 } from "../pan526/runtime-contract.mjs";

// Optional ingress only; the existing local installer/HTTP profile is unchanged.
export function validateHostedOriginV1(value) {
  if (typeof value !== "string" || !/^https:\/\/[a-z0-9.-]+(?::[1-9][0-9]{0,4})?$/.test(value)) {
    throw new Error("HOSTED_ORIGIN_DENIED");
  }
  let url;
  try { url = new URL(value); } catch { throw new Error("HOSTED_ORIGIN_DENIED"); }
  if (url.origin !== value || url.protocol !== "https:" || url.username || url.password
    || url.hostname.endsWith(".") || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(url.hostname)
    || (url.port && (Number(url.port) < 1 || Number(url.port) > 65535))) {
    throw new Error("HOSTED_ORIGIN_DENIED");
  }
  return value;
}

const audience = "pansphaira-hosted-origin-v1";
const cookieName = "__Host-pan527-session";
const hash = (value) => createHash("sha256").update(value).digest("hex");
let routeBindingValidator;
const ownedProductIngresses = new WeakMap();
const ownedSessionRevocations = new WeakMap();
// Code-owner composition marker; a serialized role/binding or copied facade
// is not a protected session owner. Read-only counterpart adapters stay read-only.
export function isProtectedSessionAdapterV1(adapter, tenantId) {
  return typeof tenantId === "string" && ownedSessionRevocations.has(adapter)
    && adapter.binding.tenantId === tenantId && typeof adapter.authorizeMutation === "function";
}
export function validateProtectedRouteBindingV1(value) {
  exactData(value, ["schemaVersion", "componentId", "entrypointPath", "sourceCommit", "sourceTree", "entrypointSha256", "runtime", "instanceId", "tenantId", "generation"], "HOSTED_ROUTE_BINDING_DENIED");
  exactData(value.runtime, ["name", "version"], "HOSTED_ROUTE_BINDING_DENIED");
  if (!routeBindingValidator) {
    const ajv = new Ajv2020({ strict: true, coerceTypes: false, removeAdditional: false, useDefaults: false });
    ajv.addSchema(JSON.parse(readFileSync(new URL("../../contracts/runtime-portability/portable-runtime-v1.schema.json", import.meta.url), "utf8")));
    routeBindingValidator = ajv.compile(JSON.parse(readFileSync(new URL("../../contracts/hosted-origin-session/protected-route-binding-v1.schema.json", import.meta.url), "utf8")));
  }
  if (!routeBindingValidator(value)) throw new Error("HOSTED_ROUTE_BINDING_DENIED");
  const copy = JSON.parse(canonicalJson(value)); Object.freeze(copy.runtime); return Object.freeze(copy);
}
function exactData(value, keys, code) {
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(code);
  const ds = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(ds).some((key) => typeof key !== "string")
    || JSON.stringify(Object.keys(ds).sort()) !== JSON.stringify([...keys].sort())
    || Object.values(ds).some((d) => d.get || d.set || !d.enumerable)) throw new Error(code);
}
function privateBytes(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || stat.nlink !== 1
      || stat.uid !== process.getuid() || stat.size > 262144) throw new Error("HOSTED_AUTH_UNAVAILABLE");
    return readFileSync(fd);
  } finally { closeSync(fd); }
}
function privateRoot(path) {
  if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path || realpathSync(path) !== path) throw new Error("HOSTED_STATE_ROOT_DENIED");
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700 || stat.uid !== process.getuid()) throw new Error("HOSTED_STATE_ROOT_DENIED");
  return path;
}
function atomicPrivate(path, value) {
  const tmp = path + "." + randomBytes(12).toString("hex");
  try {
    writeFileSync(tmp, canonicalJson(value) + "\n", { flag: "wx", mode: 0o600 });
    renameSync(tmp, path);
  } finally { try { unlinkSync(tmp); } catch (error) { if (error.code !== "ENOENT") throw error; } }
}
function denyHeaderAuthority(headers) {
  if (!headers || typeof headers !== "object" || Object.getPrototypeOf(headers) !== Object.prototype) throw new Error("HOSTED_HEADER_AUTHORITY_DENIED");
  const ds = Object.getOwnPropertyDescriptors(headers);
  for (const key of Reflect.ownKeys(ds)) {
    if (typeof key !== "string" || ds[key].get || ds[key].set || !ds[key].enumerable
      || /^(?:authorization|proxy-authorization|forwarded|x-forwarded-.+|x-(?:tenant.*|role.*|user.*|authenticated.*|authority.*|identity.*|instance.*|generation.*|api-key|token))$/i.test(key)) {
      throw new Error("HOSTED_HEADER_AUTHORITY_DENIED");
    }
  }
}

// Owner-local constructor and issuance only. No HTTP route can mint a session.
// A runtime identity/role/receipt itself is not execution authorization.
export function createProtectedSessionAdapterV1(options) {
  if (!options || Object.getOwnPropertyDescriptor(options, "optIn")?.value !== true) throw new Error("HOSTED_OPT_IN_REQUIRED");
  exactData(options, ["optIn", "origin", "identity", "stateRoot"], "HOSTED_SESSION_OPTIONS_DENIED");
  const origin = validateHostedOriginV1(options.origin);
  const identity = validateRuntimeIdentityV1(options.identity);
  if (identity.componentId !== "pansphaira-local-demo") throw new Error("HOSTED_RUNTIME_BINDING_DENIED");
  const binding = Object.freeze({ audience, origin, instanceId: identity.instanceId, tenantId: identity.tenantId, generation: identity.generation, identityDigest: runtimeIdentityDigestV1(identity) });
  return createOwnerSessionStoreV1(origin, identity, privateRoot(options.stateRoot), binding, cookieName, false);
}

// Explicit protected-route process binding, NOT an added portable-runtime enum
// or an agent alias. The KS owner binds its native product handler separately.
// This profile exposes only authenticated CSRF-protected read-operation checks;
// it cannot authorize a product mutation, arbitrary route or external source.
export function createProtectedRouteSessionAdapterV1(options) {
  if (!options || Object.getOwnPropertyDescriptor(options, "optIn")?.value !== true) throw new Error("HOSTED_OPT_IN_REQUIRED");
  exactData(options, ["optIn", "origin", "routeBinding", "stateRoot"], "HOSTED_SESSION_OPTIONS_DENIED");
  const origin = validateHostedOriginV1(options.origin);
  const identity = validateProtectedRouteBindingV1(options.routeBinding);
  const binding = Object.freeze({ audience: "kaleidosphere-protected-control-origin-v1", origin, componentId: identity.componentId, instanceId: identity.instanceId, tenantId: identity.tenantId, generation: identity.generation, protectedRouteDigest: hash(canonicalJson(identity)) });
  return createOwnerSessionStoreV1(origin, identity, privateRoot(options.stateRoot), binding, "__Host-ks293-session", true);
}

function createOwnerSessionStoreV1(origin, identity, root, binding, cookieName, readOnlyRoute) {
  const keyPath = join(root, "session-auth.key"); const storePath = join(root, "sessions.json");
  try { const fd = openSync(keyPath, "wx", 0o600); try { writeFileSync(fd, randomBytes(32).toString("hex") + "\n"); } finally { closeSync(fd); } }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  function key() {
    privateRoot(root); const value = privateBytes(keyPath).toString("utf8").trim();
    if (!/^[a-f0-9]{64}$/.test(value)) throw new Error("HOSTED_AUTH_UNAVAILABLE");
    return Buffer.from(value, "hex");
  }
  function envelope(payload) { return { payload, mac: createHmac("sha256", key()).update(canonicalJson(payload)).digest("hex") }; }
  try {
    const fd = openSync(storePath, "wx", 0o600);
    try { writeFileSync(fd, canonicalJson(envelope({ schemaVersion: "pansphaira.hosted-session/store/v1", sessions: {} })) + "\n"); }
    finally { closeSync(fd); }
  } catch (error) { if (error.code !== "EEXIST") throw error; }
  function load() {
    try {
      const item = JSON.parse(privateBytes(storePath).toString("utf8"));
      exactData(item, ["payload", "mac"], "HOSTED_AUTH_UNAVAILABLE");
      exactData(item.payload, ["schemaVersion", "sessions"], "HOSTED_AUTH_UNAVAILABLE");
      if (item.payload.schemaVersion !== "pansphaira.hosted-session/store/v1" || !/^[a-f0-9]{64}$/.test(item.mac)) throw new Error("HOSTED_AUTH_UNAVAILABLE");
      const actual = createHmac("sha256", key()).update(canonicalJson(item.payload)).digest();
      if (!timingSafeEqual(actual, Buffer.from(item.mac, "hex")) || !item.payload.sessions
        || Object.getPrototypeOf(item.payload.sessions) !== Object.prototype || Object.keys(item.payload.sessions).length > 256) throw new Error("HOSTED_AUTH_UNAVAILABLE");
      return item.payload;
    } catch { throw new Error("HOSTED_AUTH_UNAVAILABLE"); }
  }
  load();
  function issueOwnerSession(principal) {
    exactData(principal, ["subjectId", "role", "expiresAtMs"], "HOSTED_PRINCIPAL_DENIED");
    const now = Date.now();
    if (typeof principal.subjectId !== "string" || !/^[a-z0-9][a-z0-9:_-]{0,79}$/.test(principal.subjectId)
      || !["reader", "reviewer"].includes(principal.role) || !Number.isSafeInteger(principal.expiresAtMs)
      || principal.expiresAtMs <= now || principal.expiresAtMs > now + 1800000) throw new Error("HOSTED_PRINCIPAL_DENIED");
    privateRoot(root); const lockPath = join(root, "session-write.lock"); const fd = openSync(lockPath, "wx", 0o600);
    try {
      const payload = load(); for (const [digest, row] of Object.entries(payload.sessions)) if (row.expiresAtMs <= now) delete payload.sessions[digest];
      if (Object.keys(payload.sessions).length >= 256) throw new Error("HOSTED_SESSION_CAPACITY_DENIED");
      const token = randomBytes(32).toString("hex"); const csrf = randomBytes(32).toString("hex");
      payload.sessions[hash(token)] = { binding, ...principal, issuedAtMs: now, csrfDigest: hash(csrf) };
      atomicPrivate(storePath, envelope(payload));
      const cookieHeader = cookieName + "=" + token;
      return Object.freeze({ cookieHeader, csrf, setCookie: cookieHeader + "; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=" + Math.max(1, Math.floor((principal.expiresAtMs - now) / 1000)) });
    } finally { closeSync(fd); unlinkSync(lockPath); }
  }
  function authenticate(headers) {
    denyHeaderAuthority(headers);
    const cookie = headers.cookie;
    if (typeof cookie !== "string" || cookie.length > 4096) throw new Error("HOSTED_SESSION_DENIED");
    const pairs = cookie.split(";").map((v) => v.trim()).filter((v) => v.startsWith(cookieName + "="));
    if (pairs.length !== 1 || !new RegExp("^" + cookieName + "=[a-f0-9]{64}$").test(pairs[0])) throw new Error("HOSTED_SESSION_DENIED");
    const token = pairs[0].slice(cookieName.length + 1); const payload = load(); const row = payload.sessions[hash(token)];
    if (!row) throw new Error("HOSTED_SESSION_DENIED");
    exactData(row, ["binding", "subjectId", "role", "expiresAtMs", "issuedAtMs", "csrfDigest"], "HOSTED_SESSION_DENIED");
    if (canonicalJson(row.binding) !== canonicalJson(binding) || !["reader", "reviewer"].includes(row.role)
      || !Number.isSafeInteger(row.expiresAtMs) || !Number.isSafeInteger(row.issuedAtMs)
      || row.issuedAtMs > Date.now() || row.expiresAtMs <= Date.now() || row.expiresAtMs > row.issuedAtMs + 1800000
      || !/^[a-f0-9]{64}$/.test(row.csrfDigest)) throw new Error("HOSTED_SESSION_DENIED");
    return Object.freeze({ tenantId: identity.tenantId, subjectId: row.subjectId, role: row.role, instanceId: identity.instanceId, generation: identity.generation, ...(readOnlyRoute ? { componentId: identity.componentId } : {}) });
  }
  function responseCookie(headers) {
    authenticate(headers);
    const pair = headers.cookie.split(";").map((value) => value.trim()).find((value) => value.startsWith(cookieName + "="));
    const row = load().sessions[hash(pair.slice(cookieName.length + 1))];
    const remaining = Math.floor((row.expiresAtMs - Date.now()) / 1000);
    if (remaining < 1) throw new Error("HOSTED_SESSION_DENIED");
    return pair + "; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=" + remaining;
  }
  function authorizeCsrf(headers) {
    const principal = authenticate(headers);
    if (!readOnlyRoute && principal.role !== "reviewer") throw new Error("HOSTED_ROLE_DENIED");
    if (headers.origin !== origin) throw new Error("HOSTED_CSRF_DENIED");
    const csrf = headers["x-pan527-csrf"];
    if (typeof csrf !== "string" || !/^[a-f0-9]{64}$/.test(csrf)) throw new Error("HOSTED_CSRF_DENIED");
    const pair = headers.cookie.split(";").map((value) => value.trim()).find((value) => value.startsWith(cookieName + "="));
    const row = load().sessions[hash(pair.slice(cookieName.length + 1))];
    if (!row || !timingSafeEqual(Buffer.from(row.csrfDigest, "hex"), Buffer.from(hash(csrf), "hex"))) throw new Error("HOSTED_CSRF_DENIED");
    return principal;
  }
  function logoutAuthenticatedSession(headers) {
    authenticate(headers);
    if (headers.origin !== origin) throw new Error("HOSTED_CSRF_DENIED");
    const pair = headers.cookie.split(";").map(v => v.trim()).find(v => v.startsWith(cookieName + "="));
    privateRoot(root); const lockPath = join(root, "session-write.lock"); const fd = openSync(lockPath, "wx", 0o600);
    try {
      authenticate(headers);
      const payload = load(); delete payload.sessions[hash(pair.slice(cookieName.length + 1))];
      atomicPrivate(storePath, envelope(payload));
    } finally { closeSync(fd); unlinkSync(lockPath); }
  }
  const adapter = Object.freeze({ origin, binding, issueOwnerSession, authenticate, responseCookie, ...(readOnlyRoute ? { authorizeReadOperation: authorizeCsrf } : { authorizeMutation: authorizeCsrf }) });
  ownedSessionRevocations.set(adapter, logoutAuthenticatedSession); return adapter;
}

function reply(response, status, code) {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify({ error: code }));
}

// Code-owner mounting only: same actual ingress, tenant store and mandatory
// transport guards. No HTTP installer, caller role or second product ledger.
export function mountProtectedGuidedDocumentV1(gateway, options) {
  exactData(options, ["optIn", "tenantId", "identityDigest", "origin", "html", "script", "style", "journey"], "HOSTED_GUIDED_OWNER_DENIED");
  const product = ownedProductIngresses.get(gateway)?.get(options.tenantId);
  if (options.optIn !== true || !product || product.guidedDocument
    || options.identityDigest !== product.sessions.binding.identityDigest || options.origin !== product.sessions.origin
    || [options.html, options.script, options.style].some(value => typeof value !== "string" || Buffer.byteLength(value) > 32768)
    || typeof options.journey?.command !== "function" || typeof options.journey?.readback !== "function"
    || canonicalJson(options.journey.readback().binding) !== canonicalJson({ tenantId: product.sessions.binding.tenantId, instanceId: product.sessions.binding.instanceId, generation: product.sessions.binding.generation })) throw new Error("HOSTED_GUIDED_OWNER_DENIED");
  const document = Object.freeze({ html: options.html, script: options.script, style: options.style, journey: options.journey });
  product.guidedDocument = document;
  return Object.freeze({ close() { if (product.guidedDocument === document) delete product.guidedDocument; } });
}

export function protectedGuidedOwnerContextV1(gateway, options) {
  exactData(options, ["optIn", "tenantId", "identityDigest", "origin"], "HOSTED_GUIDED_OWNER_DENIED");
  const product = ownedProductIngresses.get(gateway)?.get(options.tenantId);
  if (options.optIn !== true || !product || product.sessions.origin !== options.origin || product.sessions.binding.identityDigest !== options.identityDigest) throw new Error("HOSTED_GUIDED_OWNER_DENIED");
  return Object.freeze({ identity: product.identity, productRoot: product.productRoot });
}

// Optional shared browser document on the same protected ingress. These assets
// and the bounded reader are process-owner code, never HTTP plugin installation.
export function mountProtectedWorkspaceDocumentV1(gateway, options) {
  const keys = ["optIn", "tenantId", "identityDigest", "origin", "html", "script", "style", "readErv"];
  const profile = Object.getOwnPropertyDescriptor(options ?? {}, "profilesV1")?.value;
  exactData(options, profile === undefined ? keys : [...keys, "profilesV1"], "HOSTED_WORKSPACE_OWNER_DENIED");
  if (profile !== undefined) {
    exactData(profile, ["schemaVersion", "read", "write"], "HOSTED_WORKSPACE_OWNER_DENIED");
    if (profile.schemaVersion !== "pansphaira.workspace-profile-adapter/v1" || typeof profile.read !== "function" || typeof profile.write !== "function") throw new Error("HOSTED_WORKSPACE_OWNER_DENIED");
  }
  const product = ownedProductIngresses.get(gateway)?.get(options.tenantId);
  if (options.optIn !== true || !product || product.workspaceDocument
    || options.identityDigest !== product.sessions.binding.identityDigest || options.origin !== product.sessions.origin
    || [options.html, options.script, options.style].some(x => typeof x !== "string" || Buffer.byteLength(x) > 131072)
    || typeof options.readErv !== "function") throw new Error("HOSTED_WORKSPACE_OWNER_DENIED");
  const document = Object.freeze({ html: options.html, script: options.script, style: options.style, readErv: options.readErv, profilesV1: profile });
  product.workspaceDocument = document;
  return Object.freeze({ close() { if (product.workspaceDocument === document) delete product.workspaceDocument; } });
}

// Versioned additive owner contract. Personal drafts use the authenticated
// session plus same-origin/context proof, never the governed execution writer.
export function mountProtectedWorkspaceConfigurationV1(gateway, options) {
  exactData(options, ["optIn", "tenantId", "identityDigest", "origin", "adapterVersion", "read", "save"], "HOSTED_CONFIGURATION_OWNER_DENIED");
  const product = ownedProductIngresses.get(gateway)?.get(options.tenantId);
  if (options.optIn !== true || !product || product.workspaceConfiguration
    || options.identityDigest !== product.sessions.binding.identityDigest || options.origin !== product.sessions.origin
    || options.adapterVersion !== "pan441-pan529/v1" || typeof options.read !== "function" || typeof options.save !== "function") throw new Error("HOSTED_CONFIGURATION_OWNER_DENIED");
  const attachment = Object.freeze({ read: options.read, save: options.save });
  product.workspaceConfiguration = attachment;
  return Object.freeze({ close() { if (product.workspaceConfiguration === attachment) delete product.workspaceConfiguration; } });
}

// Closed existing native product handlers, not a general-purpose reverse proxy.
// This optional local test ingress neither implements OIDC nor creates a portal.
export function createOptionalHttpsProductIngressV1(options) {
  if (!options || Object.getOwnPropertyDescriptor(options, "optIn")?.value !== true) throw new Error("HOSTED_OPT_IN_REQUIRED");
  exactData(options, ["optIn", "origin", "tls", "tenants"], "HOSTED_INGRESS_OPTIONS_DENIED");
  const origin = validateHostedOriginV1(options.origin); const url = new URL(origin);
  exactData(options.tls, ["keyPath", "certPath"], "HOSTED_TLS_OPTIONS_DENIED");
  const key = privateBytes(options.tls.keyPath); const cert = privateBytes(options.tls.certPath);
  if (!Array.isArray(options.tenants) || Object.getPrototypeOf(options.tenants) !== Array.prototype
    || options.tenants.length < 1 || options.tenants.length > 8) throw new Error("HOSTED_TENANTS_DENIED");
  const tenantSpecs = options.tenants.map((spec) => {
    exactData(spec, ["identity", "stateRoot", "productRoot"], "HOSTED_TENANTS_DENIED");
    const identity = validateRuntimeIdentityV1(spec.identity);
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(identity.tenantId)) throw new Error("HOSTED_TENANTS_DENIED");
    return { identity, stateRoot: privateRoot(spec.stateRoot), productRoot: privateRoot(spec.productRoot) };
  });
  const roots = tenantSpecs.flatMap((spec) => [spec.stateRoot, spec.productRoot]);
  if (new Set(tenantSpecs.map((spec) => spec.identity.tenantId)).size !== tenantSpecs.length
    || roots.some((root, i) => roots.some((other, j) => i !== j && (root === other || root.startsWith(other + "/"))))) throw new Error("HOSTED_TENANTS_DENIED");
  const products = new Map();
  const server = createHttpsServer({ key, cert, minVersion: "TLSv1.3", maxHeaderSize: 8192 }, async (request, response) => {
    response.setHeader("cache-control", "no-store"); response.setHeader("x-content-type-options", "nosniff");
    response.setHeader("referrer-policy", "no-referrer"); response.setHeader("strict-transport-security", "max-age=86400");
    response.setHeader("content-security-policy", "default-src 'none'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
    try {
      const addr = server.address();
      if (!request.socket.encrypted || !addr || addr.address !== "127.0.0.1" || request.socket.remoteAddress !== "127.0.0.1"
        || request.socket.localPort !== Number(url.port || 443)) return reply(response, 403, "HOSTED_LOOPBACK_BOUNDARY_DENIED");
      if (request.headers.host !== url.host) return reply(response, 421, "HOSTED_HOST_DENIED");
      denyHeaderAuthority(request.headers);
      for (const name of ["host", "origin", "cookie", "content-length", "content-type"]) {
        if (request.rawHeaders.filter((_, i) => i % 2 === 0 && request.rawHeaders[i].toLowerCase() === name).length > 1) return reply(response, 403, "HOSTED_DUPLICATE_HEADER_DENIED");
      }
      if ((request.headers.origin !== undefined && request.headers.origin !== origin)
        || (request.headers["sec-fetch-site"] !== undefined && !["same-origin", "none"].includes(request.headers["sec-fetch-site"]))) return reply(response, 403, "HOSTED_ORIGIN_DENIED");
      const rawPath = (request.url ?? "").split("?")[0];
      if ((request.url ?? "").includes("?") && !/\/workspace\/erv$/.test(rawPath)) return reply(response, 404, "HOSTED_ROUTE_DENIED");
      const match = /^\/t\/([a-z0-9][a-z0-9-]{0,63})(\/api\/(?:status|effective-rights|ask)|\/guided(?:\/app\.js|\/style\.css|\/status|\/command)?|\/workspace(?:\/app\.js|\/style\.css|\/context|\/erv|\/logout|\/profile|\/configuration)?)?$/.exec(rawPath);
      if (!match || !["GET", "POST"].includes(request.method)
        || (!["/workspace/profile", "/workspace/configuration"].includes(match[2]) && (request.method === "POST") !== ["/api/ask", "/guided/command", "/workspace/logout"].includes(match[2]))) return reply(response, 404, "HOSTED_ROUTE_DENIED");
      const product = products.get(match[1]); if (!product) return reply(response, 401, "HOSTED_SESSION_DENIED");
      product.sessions.authenticate(request.headers);
      if (match[2]?.startsWith("/workspace")) {
        if (!product.workspaceDocument) return reply(response, 404, "HOSTED_ROUTE_DENIED");
        if (match[2] === "/workspace/configuration") {
          if (!product.workspaceConfiguration) return reply(response, 404, "HOSTED_ROUTE_DENIED");
          const authenticateDraftWrite = () => {
            const principal = product.sessions.authenticate(request.headers);
            const pair = request.headers.cookie.split(";").map(v => v.trim()).find(v => v.startsWith(cookieName + "="));
            if (request.headers.origin !== origin || request.headers["x-pan563-context"] !== "session:" + hash(pair)) throw new Error("HOSTED_CSRF_DENIED");
            return principal;
          };
          let result;
          if (request.method === "POST") {
            authenticateDraftWrite();
            if (request.headers["content-type"] !== "application/json" || request.headers["content-encoding"] !== undefined) return reply(response, 400, "HOSTED_BODY_DENIED");
            const chunks = []; let bytes = 0;
            for await (const chunk of request) { bytes += chunk.length; if (bytes > 8192) return reply(response, 413, "HOSTED_BODY_DENIED"); chunks.push(chunk); }
            let body; try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return reply(response, 400, "HOSTED_BODY_DENIED"); }
            result = product.workspaceConfiguration.save(body, authenticateDraftWrite());
          } else {
            if ((request.headers["content-length"] !== undefined && request.headers["content-length"] !== "0") || request.headers["transfer-encoding"] !== undefined) return reply(response, 400, "HOSTED_BODY_DENIED");
            result = product.workspaceConfiguration.read(product.sessions.authenticate(request.headers));
          }
          product.sessions.authenticate(request.headers);
          if (result?.schemaVersion !== "pansphaira.agent-configuration/readback/v1" || result.activationAuthorized !== false) return reply(response, 503, "HOSTED_CONFIGURATION_READBACK_DENIED");
          response.writeHead(200, { "content-type": "application/json; charset=utf-8" }); response.end(JSON.stringify(result) + "\n"); return;
        }
        if (match[2] === "/workspace/profile") {
          const adapter = product.workspaceDocument.profilesV1;
          if (!adapter) return reply(response, 404, "HOSTED_ROUTE_DENIED");
          let result;
          const sessionPair = request.headers.cookie.split(";").map(v => v.trim()).find(v => v.startsWith(cookieName + "="));
          const expectedSession = request.headers["x-pan543-session"];
          if ((request.method === "POST" || expectedSession !== undefined) && expectedSession !== "session:" + hash(sessionPair)) return reply(response, 401, "HOSTED_SESSION_DENIED");
          if (request.method === "POST") {
            // Personal presentation is not reviewer-only business mutation.
            // Strict origin + JSON/no encoding is the existing own-session guard.
            if (request.headers.origin !== origin) return reply(response, 403, "HOSTED_CSRF_DENIED");
            if (request.headers["content-type"] !== "application/json" || request.headers["content-encoding"] !== undefined) return reply(response, 400, "HOSTED_BODY_DENIED");
            const chunks = []; let bytes = 0;
            for await (const chunk of request) { bytes += chunk.length; if (bytes > 8192) return reply(response, 413, "HOSTED_BODY_DENIED"); chunks.push(chunk); }
            let command;
            try { command = validateBrowserProfileWriteV1(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { return reply(response, 400, "PROFILE_SCHEMA_DENIED"); }
            const principal = product.sessions.authenticate(request.headers);
            result = adapter.write(command, principal);
          } else {
            if ((request.headers["content-length"] !== undefined && request.headers["content-length"] !== "0") || request.headers["transfer-encoding"] !== undefined) return reply(response, 400, "HOSTED_BODY_DENIED");
            result = adapter.read(product.sessions.authenticate(request.headers));
          }
          // Contract is synchronous: identity is checked immediately before CAS.
          product.sessions.authenticate(request.headers);
          const target = validateBrowserProfileReadV1(result);
          response.writeHead(200, { "content-type": "application/json; charset=utf-8" }); response.end(JSON.stringify(target) + "\n"); return;
        }
        if ((request.headers["content-length"] !== undefined && request.headers["content-length"] !== "0") || request.headers["transfer-encoding"] !== undefined) return reply(response, 400, "HOSTED_BODY_DENIED");
        if (match[2] === "/workspace/logout") {
          ownedSessionRevocations.get(product.sessions)(request.headers);
          response.setHeader("set-cookie", cookieName + "=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0");
          response.writeHead(200, { "content-type": "application/json; charset=utf-8" }); response.end(JSON.stringify({ outcome: "LOGGED_OUT" }) + "\n"); return;
        }
        // JSON reads do not re-emit a session cookie: a delayed retired read
        // must not overwrite a replacement session's HttpOnly cookie.
        if (match[2] === "/workspace/context") {
          const pair = request.headers.cookie.split(";").map(v => v.trim()).find(v => v.startsWith(cookieName + "="));
          const context = { schemaVersion: "pansphaira.browser-context/v1", tenantId: product.sessions.binding.tenantId, sessionId: "session:" + hash(pair), objectId: null, revision: 1 };
          response.writeHead(200, { "content-type": "application/json; charset=utf-8" }); response.end(JSON.stringify(context) + "\n"); return;
        }
        if (match[2] === "/workspace/erv") {
          const params = new URL(request.url, origin).searchParams;
          if ([...params.keys()].some(k => !["objectId", "revision"].includes(k)) || params.getAll("objectId").length > 1 || params.getAll("revision").length > 1) return reply(response, 400, "HOSTED_WORKSPACE_QUERY_DENIED");
          const revision = params.get("revision");
          if (revision !== null && !/^[1-9][0-9]{0,8}$/.test(revision)) return reply(response, 400, "HOSTED_WORKSPACE_QUERY_DENIED");
          const principal = product.sessions.authenticate(request.headers);
          const result = await product.workspaceDocument.readErv({ objectId: params.get("objectId") ?? "AP-PAN516-MATCHED-01", expectedRevision: revision === null ? null : Number(revision) }, principal);
          product.sessions.authenticate(request.headers);
          if (!result || result.schemaVersion !== "pansphaira.browser-erv-read/v1" || result.tenantId !== principal.tenantId || result.readOnly !== true || result.bookingAuthorityGranted !== false || result.paymentOrderAuthorized !== false) return reply(response, 503, "HOSTED_WORKSPACE_READBACK_DENIED");
          response.writeHead(200, { "content-type": "application/json; charset=utf-8" }); response.end(JSON.stringify(result) + "\n"); return;
        }
        response.setHeader("set-cookie", product.sessions.responseCookie(request.headers));
        response.setHeader("content-security-policy", "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'");
        const key = match[2] === "/workspace/app.js" ? "script" : match[2] === "/workspace/style.css" ? "style" : "html";
        const type = key === "script" ? "text/javascript" : key === "style" ? "text/css" : "text/html";
        response.writeHead(200, { "content-type": type + "; charset=utf-8" }); response.end(product.workspaceDocument[key]); return;
      }
      if (match[2]?.startsWith("/guided")) {
        if (!product.guidedDocument) return reply(response, 404, "HOSTED_ROUTE_DENIED");
        response.setHeader("set-cookie", product.sessions.responseCookie(request.headers));
        if (match[2] === "/guided/status" || match[2] === "/guided/command") {
          let result;
          if (request.method === "POST") {
            product.sessions.authorizeMutation(request.headers);
            if (request.headers["content-type"] !== "application/json" || request.headers["content-encoding"] !== undefined) return reply(response, 400, "HOSTED_BODY_DENIED");
            const chunks = []; let bytes = 0;
            for await (const chunk of request) { bytes += chunk.length; if (bytes > 4096) return reply(response, 413, "HOSTED_BODY_DENIED"); chunks.push(chunk); }
            let body; try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return reply(response, 400, "HOSTED_BODY_DENIED"); }
            const principal = product.sessions.authorizeMutation(request.headers);
            result = await product.guidedDocument.journey.command(body, principal);
          } else result = product.guidedDocument.journey.readback();
          response.writeHead(200, { "content-type": "application/json; charset=utf-8" }); response.end(JSON.stringify(result) + "\n"); return;
        }
        response.setHeader("content-security-policy", "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'");
        const key = match[2] === "/guided/app.js" ? "script" : match[2] === "/guided/style.css" ? "style" : "html";
        const type = key === "script" ? "text/javascript" : key === "style" ? "text/css" : "text/html";
        response.writeHead(200, { "content-type": type + "; charset=utf-8" }); response.end(product.guidedDocument[key]); return;
      }
      if (!match[2]) {
        response.setHeader("set-cookie", product.sessions.responseCookie(request.headers));
        response.writeHead(303, { location: "/t/" + match[1] + "/api/status" }); response.end();
        return;
      }
      if (request.method === "POST") {
        product.sessions.authorizeMutation(request.headers);
        if (request.headers["content-type"] !== "application/json" || request.headers["content-encoding"] !== undefined) return reply(response, 400, "HOSTED_BODY_DENIED");
        const chunks = []; let bytes = 0;
        for await (const chunk of request) { bytes += chunk.length; if (bytes > 4096) return reply(response, 413, "HOSTED_BODY_DENIED"); chunks.push(chunk); }
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); exactData(body, ["question"], "HOSTED_BODY_DENIED"); }
        catch { return reply(response, 400, "HOSTED_BODY_DENIED"); }
        if (typeof body.question !== "string" || body.question.length < 1 || Buffer.byteLength(body.question) > 2048) return reply(response, 400, "HOSTED_BODY_DENIED");
        product.sessions.authorizeMutation(request.headers);
        response.setHeader("set-cookie", product.sessions.responseCookie(request.headers));
        const answer = product.coordinator.ask(body.question);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }); response.end(JSON.stringify(answer) + "\n");
        return;
      }
      response.setHeader("set-cookie", product.sessions.responseCookie(request.headers));
      request.url = match[2];
      await product.handler(request, response);
    } catch (error) {
      if (response.headersSent) { response.destroy(); return; }
      const code = error instanceof Error ? error.message : "HOSTED_AUTH_UNAVAILABLE";
      if (["HOSTED_HEADER_AUTHORITY_DENIED", "HOSTED_ROLE_DENIED", "HOSTED_CSRF_DENIED", "GUIDED_BOUND_PRINCIPAL_DENIED"].includes(code)) reply(response, 403, code);
      else if (code === "CONFIGURATION_REVISION_CONFLICT") reply(response, 409, code);
      else if (code === "CONFIGURATION_OWNERSHIP_DENIED") reply(response, 403, code);
      else if (code.startsWith("CONFIGURATION_") && !["CONFIGURATION_STORE_CLOSED", "CONFIGURATION_POLICY_CHANGED_REJECT_REQUIRES_RECONFIRMATION"].includes(code)) reply(response, 400, code);
      else if (code === "CONFIGURATION_POLICY_CHANGED_REJECT_REQUIRES_RECONFIRMATION") reply(response, 409, code);
      else if (code === "GUIDED_COMMAND_DENIED") reply(response, 400, code);
      else if (["GUIDED_RETRY_CONFLICT_DENIED", "GUIDED_STARTER_NOT_IDLE_DENIED", "GUIDED_OUTCOME_UNKNOWN_RETAINED", "GUIDED_OWNER_CLOSED"].includes(code)) reply(response, 409, code);
      else if (code === "HOSTED_SESSION_DENIED") reply(response, 401, code);
      else if (["PROFILE_SCHEMA_DENIED", "PROFILE_CONTRIBUTION_DENIED"].includes(code)) reply(response, 400, code);
      else if (code === "PROFILE_REVISION_CONFLICT") reply(response, 409, code);
      else if (code === "ERV_OBJECT_REVISION_STALE") reply(response, 409, code);
      else if (["ERV_TENANT_BINDING_DENIED", "ERV_OBJECT_BINDING_DENIED"].includes(code)) reply(response, 403, code);
      else reply(response, 503, "HOSTED_AUTH_UNAVAILABLE");
    }
  });
  const showcase = JSON.parse(readFileSync(new URL("../../examples/poc-release/showcase-v1.json", import.meta.url), "utf8"));
  const plan = buildPocGuidedDemoSetupPlanV1(showcase, expectedPocGuidedDemoTemplatesV1(), { templateId: "quick-tour" });
  for (const spec of tenantSpecs) {
    const sessions = createProtectedSessionAdapterV1({ optIn: true, origin, identity: spec.identity, stateRoot: spec.stateRoot });
    const coordinator = new PocEarlyAdminCoordinatorV1(plan, spec.productRoot, { resume: true });
    const nativeServer = createPocEarlyAdminDashboardServerV1(coordinator);
    products.set(spec.identity.tenantId, { sessions, coordinator, identity: spec.identity, productRoot: spec.productRoot, handler: nativeServer.listeners("request")[0] });
  }
  server.maxHeadersCount = 32; server.requestTimeout = 5000; server.headersTimeout = 5000; server.keepAliveTimeout = 1000;
  server.on("upgrade", (_request, socket) => socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n"));
  for (const event of ["checkContinue", "checkExpectation"]) server.on(event, (_request, response) => reply(response, 417, "HOSTED_EXPECTATION_DENIED"));
  const gateway = Object.freeze({ server, sessionAdapter(tenantId) { const product = products.get(tenantId); if (!product) throw new Error("HOSTED_TENANT_DENIED"); return product.sessions; } });
  ownedProductIngresses.set(gateway, products); return gateway;
}
