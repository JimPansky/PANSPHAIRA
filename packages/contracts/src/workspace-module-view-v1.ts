// Additive data-free personal module view. A valid shape/catalog is NOT native
// authentication, a context handle, consent, a write receipt or a business grant.
export type WorkspaceViewUnitV1 = "CURRENCY_MINOR" | "ISO4217" | "LIABILITY_STATE" | "REVIEW_STATE" | "COUNT" | "QUANTITY" | "PER_FIELD";
export interface WorkspaceViewFieldV1 { readonly fieldId: string; readonly source: "ERV_NATIVE" | "HUMAN_NATIVE"; readonly type: "NUMBER" | "STRING"; readonly unit: Exclude<WorkspaceViewUnitV1, "PER_FIELD"> }
export interface WorkspaceViewBindingV1 { readonly fieldIds: readonly string[]; readonly unit: WorkspaceViewUnitV1 }
export interface WorkspaceViewInstanceV1 { readonly instanceId: string; readonly componentId: "VALUE" | "TABLE" | "HUMAN_REVIEW"; readonly size: "compact" | "regular" | "large"; readonly visible: boolean; readonly binding: WorkspaceViewBindingV1 }
export interface WorkspaceModuleViewV1 { readonly schemaVersion: "pansphaira.workspace-module-view/v1"; readonly moduleId: "pan.erv"; readonly viewId: "pan.erv.view"; readonly catalogVersion: "pansphaira.workspace-data-catalog/v1"; readonly instances: readonly WorkspaceViewInstanceV1[] }
export type WorkspaceViewOperationV1 = { readonly kind: "MOVE"; readonly instanceId: string; readonly position: number } | { readonly kind: "RESIZE"; readonly instanceId: string; readonly size: WorkspaceViewInstanceV1["size"] } | { readonly kind: "SHOW"; readonly instanceId: string; readonly visible: boolean } | { readonly kind: "BIND"; readonly instanceId: string; readonly binding: WorkspaceViewBindingV1 };
export interface WorkspaceViewDeltaV1 { readonly schemaVersion: "pansphaira.workspace-module-view/delta/v1"; readonly operations: readonly WorkspaceViewOperationV1[] }
const units: readonly string[] = ["CURRENCY_MINOR", "ISO4217", "LIABILITY_STATE", "REVIEW_STATE", "COUNT", "QUANTITY", "PER_FIELD"];
const sizes: readonly string[] = ["compact", "regular", "large"];
const components: readonly string[] = ["VALUE", "TABLE", "HUMAN_REVIEW"];
function fail(reason: string): never { throw new Error(reason); }
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return fail("VIEW_SCHEMA_DENIED");
  const ds = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(ds).length !== keys.length || keys.some(key => !Object.hasOwn(ds, key)) || Reflect.ownKeys(ds).some(key => typeof key !== "string" || !keys.includes(key)) || Object.values(ds).some(d => !d.enumerable || !("value" in d))) return fail("VIEW_SCHEMA_DENIED");
  return Object.fromEntries(keys.map(key => [key, ds[key]!.value as unknown]));
}
function list(value: unknown, max: number, min = 1): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < min || value.length > max) return fail("VIEW_SCHEMA_DENIED");
  const ds = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(ds).length !== value.length + 1 || Reflect.ownKeys(ds).some(key => typeof key !== "string" || !(key === "length" || /^(?:0|[1-9][0-9]*)$/.test(key))) || Object.entries(ds).some(([key,d]) => !("value" in d) || (key !== "length" && !d.enumerable))) return fail("VIEW_SCHEMA_DENIED");
  return value;
}
function identifier(value: unknown): string { if (typeof value !== "string" || !/^[a-z][A-Za-z0-9.-]{0,95}$/.test(value)) return fail("VIEW_SCHEMA_DENIED"); return value; }
function size(value: unknown): WorkspaceViewInstanceV1["size"] { if (typeof value !== "string" || !sizes.includes(value)) return fail("VIEW_SCHEMA_DENIED"); return value as WorkspaceViewInstanceV1["size"]; }
function boolean(value: unknown): boolean { if (typeof value !== "boolean") return fail("VIEW_SCHEMA_DENIED"); return value; }
function catalogMap(value: readonly WorkspaceViewFieldV1[]): Map<string, WorkspaceViewFieldV1> {
  const map = new Map<string, WorkspaceViewFieldV1>();
  for (const item of list(value, 32)) {
    const v = exact(item, ["fieldId", "source", "type", "unit"]); const fieldId = identifier(v.fieldId);
    if (map.has(fieldId) || !["ERV_NATIVE", "HUMAN_NATIVE"].includes(v.source as string) || !["NUMBER", "STRING"].includes(v.type as string) || !units.includes(v.unit as string) || v.unit === "PER_FIELD") return fail("VIEW_CATALOG_DENIED");
    map.set(fieldId, { fieldId, source: v.source as WorkspaceViewFieldV1["source"], type: v.type as WorkspaceViewFieldV1["type"], unit: v.unit as WorkspaceViewFieldV1["unit"] });
  }
  return map;
}
function binding(value: unknown, component: WorkspaceViewInstanceV1["componentId"], catalog: Map<string, WorkspaceViewFieldV1>): WorkspaceViewBindingV1 {
  const v = exact(value, ["fieldIds", "unit"]); const fieldIds = list(v.fieldIds, 8).map(identifier);
  if (new Set(fieldIds).size !== fieldIds.length || fieldIds.some(id => !catalog.has(id))) return fail("VIEW_BINDING_DENIED");
  if (typeof v.unit !== "string" || !units.includes(v.unit)) return fail("VIEW_UNIT_DENIED");
  if (component === "TABLE") { if (v.unit !== "PER_FIELD" || fieldIds.some(id => catalog.get(id)!.source !== "ERV_NATIVE")) return fail("VIEW_BINDING_DENIED"); }
  else {
    if (fieldIds.length !== 1) return fail("VIEW_BINDING_DENIED"); const f = catalog.get(fieldIds[0]!)!;
    if (component === "HUMAN_REVIEW" && (f.source !== "HUMAN_NATIVE" || f.unit !== "REVIEW_STATE") || component === "VALUE" && (f.source !== "ERV_NATIVE" || f.type !== "NUMBER")) return fail("VIEW_BINDING_DENIED");
    if (f.unit !== v.unit) return fail("VIEW_UNIT_DENIED");
  }
  return Object.freeze({ fieldIds: Object.freeze(fieldIds), unit: v.unit as WorkspaceViewUnitV1 });
}
export function validateWorkspaceModuleViewV1(value: unknown, fields: readonly WorkspaceViewFieldV1[]): WorkspaceModuleViewV1 {
  const v = exact(value, ["schemaVersion", "moduleId", "viewId", "catalogVersion", "instances"]);
  if (v.schemaVersion !== "pansphaira.workspace-module-view/v1" || v.moduleId !== "pan.erv" || v.viewId !== "pan.erv.view" || v.catalogVersion !== "pansphaira.workspace-data-catalog/v1") return fail("VIEW_SCHEMA_DENIED");
  const catalog = catalogMap(fields); const seen = new Set<string>();
  const instances = list(v.instances, 16).map(item => {
    const i = exact(item, ["instanceId", "componentId", "size", "visible", "binding"]); const instanceId = identifier(i.instanceId);
    if (seen.has(instanceId) || !components.includes(i.componentId as string)) return fail("VIEW_SCHEMA_DENIED"); seen.add(instanceId);
    const componentId = i.componentId as WorkspaceViewInstanceV1["componentId"]; const b = binding(i.binding, componentId, catalog); const visible = boolean(i.visible);
    if (instanceId === "invoice-value" && (componentId !== "VALUE" || !visible || b.fieldIds[0] !== "erv.invoice.amountMinor") || instanceId === "native-review" && (componentId !== "HUMAN_REVIEW" || !visible || b.fieldIds[0] !== "erv.human.reviewState")) return fail("VIEW_MANDATORY_DENIED");
    return Object.freeze({ instanceId, componentId, size: size(i.size), visible, binding: b });
  });
  if (!seen.has("invoice-value") || !seen.has("native-review")) return fail("VIEW_MANDATORY_DENIED");
  return Object.freeze({ schemaVersion: "pansphaira.workspace-module-view/v1", moduleId: "pan.erv", viewId: "pan.erv.view", catalogVersion: "pansphaira.workspace-data-catalog/v1", instances: Object.freeze(instances) });
}
export function defaultWorkspaceModuleViewV1(): WorkspaceModuleViewV1 {
  const items: WorkspaceViewInstanceV1[] = [
    { instanceId: "invoice-value", componentId: "VALUE", size: "regular", visible: true, binding: { fieldIds: ["erv.invoice.amountMinor"], unit: "CURRENCY_MINOR" } },
    { instanceId: "invoice-table", componentId: "TABLE", size: "regular", visible: true, binding: { fieldIds: ["erv.invoice.currency", "erv.invoice.liabilityStatus"], unit: "PER_FIELD" } },
    { instanceId: "native-review", componentId: "HUMAN_REVIEW", size: "regular", visible: true, binding: { fieldIds: ["erv.human.reviewState"], unit: "REVIEW_STATE" } },
  ];
  return { schemaVersion: "pansphaira.workspace-module-view/v1", moduleId: "pan.erv", viewId: "pan.erv.view", catalogVersion: "pansphaira.workspace-data-catalog/v1", instances: items };
}
export function reduceWorkspaceModuleViewV1(value: unknown, delta: unknown, fields: readonly WorkspaceViewFieldV1[]): WorkspaceModuleViewV1 {
  const initial = validateWorkspaceModuleViewV1(value, fields); const d = exact(delta, ["schemaVersion", "operations"]);
  if (d.schemaVersion !== "pansphaira.workspace-module-view/delta/v1") return fail("VIEW_SCHEMA_DENIED");
  const instances = [...initial.instances];
  for (const raw of list(d.operations, 16)) {
    const kind = exactOperationKind(raw); const key = kind === "MOVE" ? "position" : kind === "RESIZE" ? "size" : kind === "SHOW" ? "visible" : "binding";
    const op = exact(raw, ["kind", "instanceId", key]); const id = identifier(op.instanceId); const at = instances.findIndex(i => i.instanceId === id);
    if (at < 0) return fail("VIEW_INSTANCE_DENIED"); const item = instances[at]!;
    if (kind === "MOVE") { if (!Number.isSafeInteger(op.position) || (op.position as number) < 0 || (op.position as number) >= instances.length) return fail("VIEW_POSITION_DENIED"); instances.splice(at, 1); instances.splice(op.position as number, 0, item); }
    else if (kind === "RESIZE") instances[at] = { ...item, size: size(op.size) };
    else if (kind === "SHOW") instances[at] = { ...item, visible: boolean(op.visible) };
    else instances[at] = { ...item, binding: binding(op.binding, item.componentId, catalogMap(fields)) };
    // Validate each intermediate stage: a later SHOW cannot launder a forbidden
    // HIDE, and a rejected operation never mutates the supplied original object.
    validateWorkspaceModuleViewV1({ ...initial, instances }, fields);
  }
  return validateWorkspaceModuleViewV1({ ...initial, instances }, fields);
}
function exactOperationKind(value: unknown): "MOVE" | "RESIZE" | "SHOW" | "BIND" {
  if (value === null || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return fail("VIEW_SCHEMA_DENIED");
  const d = Object.getOwnPropertyDescriptor(value, "kind");
  if (!d || !("value" in d) || !d.enumerable || !["MOVE", "RESIZE", "SHOW", "BIND"].includes(d.value as string)) return fail("VIEW_SCHEMA_DENIED");
  return d.value as "MOVE" | "RESIZE" | "SHOW" | "BIND";
}
