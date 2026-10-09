import { createExtendedBrowserContextOwnerV1 } from "../../browser-shell/src/extended-context-owner-v1.js";
import type { BrowserContextV1 } from "../../browser-shell/src/context-owner-v1.js";
import { validateWorkspaceContextTabBootstrapV1, validateWorkspaceContextSnapshotV1, validateWorkspaceContextReadbackV1, verifyWorkspaceContextBindingV1,
  type WorkspaceContextSnapshotV1, type WorkspaceContextReadbackV1, type WorkspaceContextSelectionEntryV1 } from "../../contracts/src/workspace-context-selection-v1.js";
import { text } from "./api-v1.js";

// Trusted shell adapter only. No CSS/widget/source-map-derived authority, second
// panel or execution engine. Native registered view and row IDs come from the
// current authenticated server snapshot, not DOM selectors or model proposals.
export function createWorkspaceContextSelectionV1(options: {
  readonly root: HTMLElement; readonly base: string; readonly context: () => BrowserContextV1; readonly signal: AbortSignal;
}) {
  const { root, base } = options;
  if (!/^\/t\/[a-z0-9][a-z0-9-]{0,63}$/.test(base)) throw new Error("CONTEXT_BROWSER_SCOPE_DENIED");
  const initial = options.context();
  let closed = false, epoch = 0, proof: string | null = null, tabId: string | null = null;
  let bootstrap: Promise<void> | null = null, queue: Promise<unknown> = Promise.resolve();
  let current: WorkspaceContextSnapshotV1 | null = null;
  let bindingRequest: AbortController | null = null;
  let lifetime: object = Object.freeze({});
  let owner: ReturnType<typeof createExtendedBrowserContextOwnerV1> | null = null;
  let controls = new Map<string, HTMLButtonElement>(), fieldset: HTMLFieldSetElement | null = null;
  const heading = text("h2", "Aktueller nativer Seitenkontext"), scope = text("p", ""), status = text("p", "");
  heading.id = "shell.context-selection.heading"; status.setAttribute("role", "status");
  function open() { if (closed || options.signal.aborted) throw new Error("CONTEXT_OWNER_CLOSED"); }
  function localLive(c: WorkspaceContextReadbackV1, capturedEpoch: number) {
    const session = options.context();
    return !closed && !options.signal.aborted && epoch === capturedEpoch && current?.context.contextHandle === c.contextHandle
      && session.tenantId === initial.tenantId && session.sessionId === initial.sessionId && location.origin === c.binding.origin;
  }
  function pending(message: string, clear: boolean) {
    root.hidden = false; root.dataset.state = "UPDATING_CONTEXT";
    if (clear) { current = null; controls = new Map(); fieldset = null; root.replaceChildren(heading, scope, status); scope.textContent = ""; root.dataset.module = ""; root.dataset.selection = ""; }
    // Native disabled buttons lose keyboard focus in Chromium. Keep focus and
    // announce temporary unavailability; select() rejects repeated activation
    // while this context operation is pending, without dispatching again.
    status.textContent = message; for (const b of controls.values()) b.setAttribute("aria-disabled", "true");
  }
  function invalidate() {
    lifetime = Object.freeze({});
    const request = bindingRequest, previous = owner; bindingRequest = null; owner = null;
    request?.abort(); previous?.close();
  }
  function failure() {
    invalidate(); pending("Aktueller Kontext nicht bestätigt. Alte Auswahl wurde verworfen; keine automatische Wiederholung. Fachliche Navigation und Abmelden bleiben verfügbar.", true);
    root.dataset.state = "CONTEXT_UNAVAILABLE";
  }
  async function request(suffix: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
    open();
    const headers: Record<string, string> = { "x-pan548-session": initial.sessionId };
    if (proof !== null && tabId !== null) { headers["x-pan548-tab"] = proof; headers["x-pan548-tab-id"] = tabId; }
    if (body !== undefined) headers["content-type"] = "application/json";
    const requestSignal = AbortSignal.any([options.signal, ...(signal ? [signal] : []), AbortSignal.timeout(5000)]);
    const response = await fetch(base + "/workspace/context-selection" + suffix, { credentials: "same-origin", cache: "no-store", headers,
      ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }), signal: requestSignal });
    if (response.status !== 200) throw new Error("CONTEXT_SERVER_RESPONSE_DENIED");
    return response.json() as Promise<unknown>;
  }
  function check(c: WorkspaceContextReadbackV1) {
    if (c.binding.tenantId !== initial.tenantId || c.binding.sessionId !== initial.sessionId || c.binding.origin !== location.origin
      || (tabId !== null && c.binding.tabId !== tabId)) throw new Error("CONTEXT_BROWSER_BINDING_DENIED");
  }
  async function boot(signal: AbortSignal) {
    if (!bootstrap) bootstrap = (async () => {
      const b = validateWorkspaceContextTabBootstrapV1(await request("/tab", {}, signal)); open(); check(b.snapshot.context);
      proof = b.tabProof; tabId = b.snapshot.context.binding.tabId;
    })();
    await bootstrap;
  }
  function serialized<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation); queue = result.catch(() => {}); return result;
  }
  async function verify(c: WorkspaceContextReadbackV1, signal?: AbortSignal) {
    const value = validateWorkspaceContextReadbackV1(await request("/verify", { schemaVersion: "pansphaira.workspace-context/verify/v1", tabId: c.binding.tabId, contextHandle: c.contextHandle }, signal));
    check(value); verifyWorkspaceContextBindingV1(value, c.binding);
    if (JSON.stringify(value) !== JSON.stringify(c)) throw new Error("CONTEXT_VERIFICATION_DRIFT");
  }
  function show(snapshot: WorkspaceContextSnapshotV1, capturedEpoch: number) {
    check(snapshot.context); if (epoch !== capturedEpoch || closed) return;
    current = snapshot;
    const previous = owner;
    owner = createExtendedBrowserContextOwnerV1({ initialContext: snapshot.context, isContextLive: c => localLive(c, capturedEpoch) }); previous?.close();
    const c = snapshot.context;
    root.hidden = false; root.dataset.state = "CURRENT_CONTEXT"; root.dataset.module = c.moduleId; root.dataset.selection = c.selection?.elementId ?? "";
    scope.textContent = "Serverbestätigt: " + c.binding.tenantId + " · " + c.binding.subjectId + " · " + (c.moduleId === "pan.setup" ? "Einrichtung" : "Eingangsrechnungsprüfung")
      + " · " + (c.primaryObject ? "Vorgang " + c.primaryObject.objectId + ", Fachversion " + c.primaryObject.revision : "kein primäres Fachobjekt") + ". Nur lesen; keine neue Ausführungsfreigabe.";
    status.textContent = c.selection ? "Serverbestätigte semantische Auswahl: " + snapshot.selections.find(s => s.elementId === c.selection!.elementId && s.rowId === c.selection!.rowId)!.label + "."
      : "Keine semantische Auswahl. Tastatur oder Schaltfläche wählt ausschließlich eine aktuell registrierte native Referenz.";
    const keys = snapshot.selections.map(s => JSON.stringify({ elementId: s.elementId, rowId: s.rowId }));
    if (!fieldset || JSON.stringify([...controls.keys()]) !== JSON.stringify(keys)) {
      controls = new Map(); fieldset?.remove(); fieldset = document.createElement("fieldset"); fieldset.append(text("legend", "Semantische Auswahl — nur native Referenzen"));
      for (const entry of snapshot.selections) {
        const b = text("button", "Kontextauswahl: " + entry.label) as HTMLButtonElement; b.type = "button";
        b.addEventListener("click", () => { void select(entry, capturedEpoch); }, { signal: options.signal });
        controls.set(JSON.stringify({ elementId: entry.elementId, rowId: entry.rowId }), b); fieldset.append(b);
      }
      root.replaceChildren(heading, scope, status, fieldset);
    }
    for (const [key, b] of controls) { b.disabled = false; b.removeAttribute("aria-disabled"); b.setAttribute("aria-pressed", String(c.selection !== null && key === JSON.stringify(c.selection))); }
  }
  async function select(entry: WorkspaceContextSelectionEntryV1, capturedEpoch: number) {
    const issued = owner, snapshot = current; if (!issued || !snapshot || capturedEpoch !== epoch || closed || root.dataset.state !== "CURRENT_CONTEXT") return;
    // Local lifecycle membership only; the native server still resolves authority.
    if (!snapshot.selections.some(s => s.elementId === entry.elementId && s.rowId === entry.rowId)) return;
    const capturedLifetime = lifetime;
    const live = () => !closed && epoch === capturedEpoch && lifetime === capturedLifetime && owner === issued && current === snapshot;
    pending("Semantische Auswahl wird vom aktuellen nativen Kontextowner geprüft …", false);
    try {
      await serialized(async () => {
        if (!live()) return;
        const result = await issued.run("read", async (c, signal) => {
          await verify(c, signal);
          if (!live()) throw new Error("CONTEXT_SELECTION_RETIRED");
          const updated = validateWorkspaceContextSnapshotV1(await request("", { schemaVersion: "pansphaira.workspace-context/claim/v1", tabId: c.binding.tabId,
            moduleId: c.moduleId, viewId: c.viewId, primaryObjectId: c.primaryObject?.objectId ?? null, expected: { ...c.revisions, epoch: c.binding.epoch },
            selection: { elementId: entry.elementId, rowId: entry.rowId } }, signal));
          await verify(updated.context, signal); return updated;
        });
        if (!live()) return;
        if (result.outcome === "CURRENT_CONTEXT_RESPONSE") show(result.value, capturedEpoch); else failure();
      });
    } catch { if (live()) failure(); }
  }
  function retire() {
    if (closed) return epoch;
    epoch++; const old = current?.context; invalidate();
    pending("Kontextwechsel: Alte Auswahl und ausstehende Antworten werden verworfen …", true);
    if (old) void serialized(async () => { try { await request("/retire", { schemaVersion: "pansphaira.workspace-context/verify/v1", tabId: old.binding.tabId, contextHandle: old.contextHandle }); } catch { /* No false retirement success or blind replay; subsequent binding revalidates. */ } });
    return epoch;
  }
  const api = Object.freeze({
    epoch() { return epoch; }, retire,
    unavailable(localEpoch: number) { if (!closed && localEpoch === epoch) failure(); },
    async bind(value: { readonly moduleId: string; readonly viewId: string; readonly primaryObjectId: string | null; readonly domainRevision: number | null; readonly localEpoch: number }) {
      const capturedEpoch = value.localEpoch;
      if (closed || capturedEpoch !== epoch) return;
      if (!["pan.setup", "pan.erv"].includes(value.moduleId)) { failure(); return; }
      // Replacement within the same navigation epoch owns a distinct lifetime.
      // Retained controls and queued outcomes cannot clear its successor.
      invalidate(); pending("Aktueller nativer Seitenkontext wird serverseitig geprüft …", true);
      const capturedLifetime = lifetime, controller = new AbortController(); bindingRequest = controller;
      const live = () => !closed && capturedEpoch === epoch && lifetime === capturedLifetime && !controller.signal.aborted;
      try {
        await serialized(async () => {
          try {
            if (!live()) return;
            await boot(controller.signal); if (!live()) return;
            const fresh = validateWorkspaceContextSnapshotV1(await request("", undefined, controller.signal)); check(fresh.context);
            if (!live()) return;
            const updated = validateWorkspaceContextSnapshotV1(await request("", { schemaVersion: "pansphaira.workspace-context/claim/v1", tabId: fresh.context.binding.tabId,
              moduleId: value.moduleId, viewId: value.viewId, primaryObjectId: value.primaryObjectId,
              expected: { ...fresh.context.revisions, domainRevision: value.domainRevision, epoch: fresh.context.binding.epoch }, selection: null }, controller.signal));
            check(updated.context);
            if (!live()) return;
            if (updated.context.moduleId !== value.moduleId || updated.context.viewId !== value.viewId || updated.context.primaryObject?.objectId !== (value.primaryObjectId ?? undefined)
              || updated.context.revisions.domainRevision !== value.domainRevision) throw new Error("CONTEXT_BROWSER_NATIVE_VIEW_DENIED");
            await verify(updated.context, controller.signal); if (live()) show(updated, capturedEpoch);
          } finally { if (bindingRequest === controller) bindingRequest = null; }
        });
      } catch { if (live()) failure(); }
    },
    close() { if (closed) return; closed = true; epoch++; invalidate(); current = null; proof = null; tabId = null; controls.clear(); root.replaceChildren(); root.hidden = true; root.dataset.state = "CONTEXT_OWNER_CLOSED"; root.dataset.module = ""; root.dataset.selection = ""; },
  });
  options.signal.addEventListener("abort", api.close, { once: true });
  return api;
}
