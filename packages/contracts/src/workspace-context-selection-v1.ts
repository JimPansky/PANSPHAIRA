// Additive DUI-02 wire schema. Shape and a copied handle are NOT authentication,
// current rights, native view/selection membership or permission to execute.
// The protected owner must resolve each claim against its registered native view
// and freshly revalidate the issued handle. Existing BrowserContextV1 stays v1.
export interface WorkspaceContextRevisionsV1 {
  readonly hostRevision: number;
  readonly domainRevision: number | null;
  readonly viewRevision: number;
  readonly catalogRevision: number;
  readonly selectionRevision: number;
}
export interface WorkspaceSemanticSelectionV1 {
  readonly elementId: string;
  readonly rowId: string | null;
}
export interface WorkspaceContextBindingV1 {
  readonly origin: string;
  readonly tenantId: string;
  readonly subjectId: string;
  readonly sessionId: string;
  readonly instanceId: string;
  readonly generation: number;
  readonly tabId: string;
  readonly epoch: number;
}
export interface WorkspaceContextClaimV1 {
  readonly schemaVersion: "pansphaira.workspace-context/claim/v1";
  readonly tabId: string;
  readonly moduleId: string;
  readonly viewId: string;
  readonly primaryObjectId: string | null;
  readonly expected: WorkspaceContextRevisionsV1 & { readonly epoch: number };
  readonly selection: WorkspaceSemanticSelectionV1 | null;
}
export interface WorkspaceContextReadbackV1 {
  readonly schemaVersion: "pansphaira.workspace-context/readback/v1";
  readonly contextHandle: string;
  readonly binding: WorkspaceContextBindingV1;
  readonly moduleId: string;
  readonly viewId: string;
  readonly primaryObject: { readonly objectId: string; readonly revision: number } | null;
  readonly revisions: WorkspaceContextRevisionsV1;
  readonly selection: WorkspaceSemanticSelectionV1 | null;
  readonly lease: { readonly issuedAtMs: number; readonly expiresAtMs: number };
  // Descriptive read catalog only. Neither ID creates a grant by deserialization.
  readonly capabilityIds: readonly ("ui.context.read" | "ui.selection.read")[];
  // Source maps are unavailable in this closed initial profile. A later explicit
  // owner-admitted developer projection needs its own versioned capability.
  readonly sourceMap: null;
  readonly executionAuthorityGranted: false;
  readonly effectsProduced: false;
}
const revisionKeys = ["hostRevision", "domainRevision", "viewRevision", "catalogRevision", "selectionRevision"] as const;
const bindingKeys = ["origin", "tenantId", "subjectId", "sessionId", "instanceId", "generation", "tabId", "epoch"] as const;
function fail(reason: string): never { throw new Error(reason); }
function record(value: unknown, keys: readonly string[], reason: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return fail(reason);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== keys.length || Reflect.ownKeys(descriptors).some(key => typeof key !== "string" || !keys.includes(key))
    || Object.values(descriptors).some(d => !d.enumerable || !("value" in d))) return fail(reason);
  return Object.fromEntries(keys.map(key => [key, descriptors[key]!.value as unknown]));
}
function id(value: unknown, reason: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/.test(value)) return fail(reason);
  return value;
}
function positive(value: unknown, reason: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) return fail(reason);
  return value as number;
}
function tab(value: unknown, reason: string): string {
  if (typeof value !== "string" || !/^tab:[a-f0-9]{32}$/.test(value)) return fail(reason);
  return value;
}
function selection(value: unknown, reason: string): WorkspaceSemanticSelectionV1 | null {
  if (value === null) return null;
  const v = record(value, ["elementId", "rowId"], reason);
  return Object.freeze({ elementId: id(v.elementId, reason), rowId: v.rowId === null ? null : id(v.rowId, reason) });
}
function revisions(value: unknown, reason: string, epoch: boolean) {
  const v = record(value, epoch ? [...revisionKeys, "epoch"] : revisionKeys, reason);
  const axes = { hostRevision: positive(v.hostRevision, reason), domainRevision: v.domainRevision === null ? null : positive(v.domainRevision, reason),
    viewRevision: positive(v.viewRevision, reason), catalogRevision: positive(v.catalogRevision, reason), selectionRevision: positive(v.selectionRevision, reason) };
  return Object.freeze(epoch ? { ...axes, epoch: positive(v.epoch, reason) } : axes);
}
function binding(value: unknown, reason: string): WorkspaceContextBindingV1 {
  const v = record(value, bindingKeys, reason);
  if (typeof v.origin !== "string" || !/^https:\/\/[a-z0-9.-]+(?::[1-9][0-9]{0,4})?$/.test(v.origin)) return fail(reason);
  try { const u = new URL(v.origin); if (u.origin !== v.origin || u.username || u.password) return fail(reason); } catch { return fail(reason); }
  if (typeof v.sessionId !== "string" || !/^session:[a-f0-9]{64}$/.test(v.sessionId)) return fail(reason);
  return Object.freeze({ origin: v.origin, tenantId: id(v.tenantId, reason), subjectId: id(v.subjectId, reason), sessionId: v.sessionId,
    instanceId: id(v.instanceId, reason), generation: positive(v.generation, reason), tabId: tab(v.tabId, reason), epoch: positive(v.epoch, reason) });
}
export function validateWorkspaceContextClaimV1(value: unknown): WorkspaceContextClaimV1 {
  const reason = "CONTEXT_CLAIM_DENIED", v = record(value, ["schemaVersion", "tabId", "moduleId", "viewId", "primaryObjectId", "expected", "selection"], reason);
  if (v.schemaVersion !== "pansphaira.workspace-context/claim/v1") return fail(reason);
  const expected = revisions(v.expected, reason, true) as WorkspaceContextClaimV1["expected"];
  return Object.freeze({ schemaVersion: "pansphaira.workspace-context/claim/v1", tabId: tab(v.tabId, reason), moduleId: id(v.moduleId, reason),
    viewId: id(v.viewId, reason), primaryObjectId: v.primaryObjectId === null ? null : id(v.primaryObjectId, reason), expected, selection: selection(v.selection, reason) });
}
export function validateWorkspaceContextReadbackV1(value: unknown): WorkspaceContextReadbackV1 {
  const reason = "CONTEXT_READBACK_DENIED", v = record(value, ["schemaVersion", "contextHandle", "binding", "moduleId", "viewId", "primaryObject", "revisions", "selection", "lease", "capabilityIds", "sourceMap", "executionAuthorityGranted", "effectsProduced"], reason);
  if (v.schemaVersion !== "pansphaira.workspace-context/readback/v1" || typeof v.contextHandle !== "string" || !/^context:[a-f0-9]{64}$/.test(v.contextHandle)
    || v.sourceMap !== null || v.executionAuthorityGranted !== false || v.effectsProduced !== false) return fail(reason);
  const checkedBinding = binding(v.binding, reason), axes = revisions(v.revisions, reason, false);
  let object = null;
  if (v.primaryObject === null && axes.domainRevision !== null) return fail(reason);
  if (v.primaryObject !== null) {
    const p = record(v.primaryObject, ["objectId", "revision"], reason);
    object = Object.freeze({ objectId: id(p.objectId, reason), revision: positive(p.revision, reason) });
    if (object.revision !== axes.domainRevision) return fail(reason);
  }
  const lease = record(v.lease, ["issuedAtMs", "expiresAtMs"], reason), issuedAtMs = positive(lease.issuedAtMs, reason), expiresAtMs = positive(lease.expiresAtMs, reason);
  if (expiresAtMs <= issuedAtMs || expiresAtMs - issuedAtMs > 120000) return fail(reason);
  if (!Array.isArray(v.capabilityIds) || Object.getPrototypeOf(v.capabilityIds) !== Array.prototype || v.capabilityIds.length < 1 || v.capabilityIds.length > 2) return fail(reason);
  const arrayDescriptors = Object.getOwnPropertyDescriptors(v.capabilityIds);
  if (Reflect.ownKeys(arrayDescriptors).length !== v.capabilityIds.length + 1
    || Reflect.ownKeys(arrayDescriptors).some(key => typeof key !== "string" || !(key === "length" || /^(?:0|1)$/.test(key)))
    || Object.entries(arrayDescriptors).some(([key, d]) => key !== "length" && (!d.enumerable || !("value" in d)))) return fail(reason);
  const capabilityIds: ("ui.context.read" | "ui.selection.read")[] = [];
  for (let i = 0; i < v.capabilityIds.length; i++) {
    const x: unknown = arrayDescriptors[String(i)]?.value;
    if (!(x === "ui.context.read" || x === "ui.selection.read") || capabilityIds.includes(x)) return fail(reason);
    capabilityIds.push(x);
  }
  if (!capabilityIds.includes("ui.context.read")) return fail(reason);
  return Object.freeze({ schemaVersion: "pansphaira.workspace-context/readback/v1", contextHandle: v.contextHandle, binding: checkedBinding,
    moduleId: id(v.moduleId, reason), viewId: id(v.viewId, reason), primaryObject: object, revisions: axes,
    selection: selection(v.selection, reason), lease: Object.freeze({ issuedAtMs, expiresAtMs }), capabilityIds: Object.freeze(capabilityIds),
    sourceMap: null, executionAuthorityGranted: false, effectsProduced: false });
}
// Exact binding verification is still NOT authentication or handle lookup. The
// expected binding must come from the code-owned current protected-session owner.
export function verifyWorkspaceContextBindingV1(value: unknown, expected: WorkspaceContextBindingV1): WorkspaceContextReadbackV1 {
  const checked = validateWorkspaceContextReadbackV1(value), required = binding(expected, "CONTEXT_BINDING_STALE");
  if (bindingKeys.some(key => checked.binding[key] !== required[key])) return fail("CONTEXT_BINDING_STALE");
  return checked;
}

export interface WorkspaceContextSelectionEntryV1 extends WorkspaceSemanticSelectionV1 { readonly label: string }
export interface WorkspaceContextSnapshotV1 {
  readonly schemaVersion: "pansphaira.workspace-context/snapshot/v1";
  readonly context: WorkspaceContextReadbackV1;
  readonly selections: readonly WorkspaceContextSelectionEntryV1[];
}
export interface WorkspaceContextTabBootstrapV1 {
  readonly schemaVersion: "pansphaira.workspace-context/tab-bootstrap/v1";
  // Opaque per-tab proof stays in the trusted shell's memory, not widget data,
  // URL, DOM attributes, local storage or public evidence. It is not a grant.
  readonly tabProof: string;
  readonly snapshot: WorkspaceContextSnapshotV1;
}
export function validateWorkspaceContextSnapshotV1(value: unknown): WorkspaceContextSnapshotV1 {
  const reason = "CONTEXT_SNAPSHOT_DENIED", v = record(value, ["schemaVersion", "context", "selections"], reason);
  if (v.schemaVersion !== "pansphaira.workspace-context/snapshot/v1") return fail(reason);
  const context = validateWorkspaceContextReadbackV1(v.context);
  if (!Array.isArray(v.selections) || Object.getPrototypeOf(v.selections) !== Array.prototype || v.selections.length > 32) return fail(reason);
  const ds = Object.getOwnPropertyDescriptors(v.selections);
  if (Reflect.ownKeys(ds).length !== v.selections.length + 1
    || Object.entries(ds).some(([key, d]) => key !== "length" && (!d.enumerable || !("value" in d)))) return fail(reason);
  const seen = new Set<string>(), entries: WorkspaceContextSelectionEntryV1[] = [];
  for (let i = 0; i < v.selections.length; i++) {
    const e = record(ds[String(i)]?.value, ["elementId", "rowId", "label"], reason);
    if (typeof e.label !== "string" || !e.label.trim() || e.label.length > 240 || /[\u0000-\u001f]/.test(e.label)) return fail(reason);
    const s = selection({ elementId: e.elementId, rowId: e.rowId }, reason)!;
    const key = JSON.stringify(s); if (seen.has(key)) return fail(reason); seen.add(key);
    entries.push(Object.freeze({ ...s, label: e.label }));
  }
  if (context.selection !== null && !seen.has(JSON.stringify(context.selection))) return fail(reason);
  return Object.freeze({ schemaVersion: "pansphaira.workspace-context/snapshot/v1", context, selections: Object.freeze(entries) });
}
export function validateWorkspaceContextTabBootstrapV1(value: unknown): WorkspaceContextTabBootstrapV1 {
  const reason = "CONTEXT_TAB_BOOTSTRAP_DENIED", v = record(value, ["schemaVersion", "tabProof", "snapshot"], reason);
  if (v.schemaVersion !== "pansphaira.workspace-context/tab-bootstrap/v1" || typeof v.tabProof !== "string" || !/^[a-f0-9]{64}$/.test(v.tabProof)) return fail(reason);
  return Object.freeze({ schemaVersion: "pansphaira.workspace-context/tab-bootstrap/v1", tabProof: v.tabProof, snapshot: validateWorkspaceContextSnapshotV1(v.snapshot) });
}
export function validateWorkspaceContextVerifyV1(value: unknown) {
  const reason = "CONTEXT_VERIFY_DENIED", v = record(value, ["schemaVersion", "tabId", "contextHandle"], reason);
  if (v.schemaVersion !== "pansphaira.workspace-context/verify/v1" || typeof v.contextHandle !== "string" || !/^context:[a-f0-9]{64}$/.test(v.contextHandle)) return fail(reason);
  return Object.freeze({ schemaVersion: "pansphaira.workspace-context/verify/v1" as const, tabId: tab(v.tabId, reason), contextHandle: v.contextHandle });
}
