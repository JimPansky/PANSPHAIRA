import { defaultBrowserProfileV1, validateBrowserProfileReadV1, resolveBrowserProfileV1, type BrowserProfileReadV1, type BrowserProfileV1 } from "../../contracts/src/browser-profile-v1.js";
import { text } from "./api-v1.js";
const sizes = ["compact", "regular", "large"] as const;
const labels: Record<string, string> = { "shell.main": "Hauptfläche", "shell.widgets": "Betriebsstatus", "pan.workspace.boundary": "Darstellungsgrenze", "pan.erv.information": "Informationspanel" };
const copy = (profile: BrowserProfileV1): BrowserProfileV1 => ({ schemaVersion: profile.schemaVersion, items: profile.items.map(i => ({ ...i })) });
export async function createWorkspaceProfileEditorV1(options: { root: HTMLElement; base: string; sessionId: string; signal: AbortSignal; apply: (value: BrowserProfileReadV1) => void; denied: () => void }) {
  const { root, base, sessionId, signal } = options;
  let readback: BrowserProfileReadV1 | null = null; let draft = defaultBrowserProfileV1(); let busy = false; let blocked = false; let legacyOnly = false; let serial = 0; let proposal: BrowserProfileV1 | null = null; let dragging: string | null = null;
  const toggle = text("button", "Darstellung anpassen") as HTMLButtonElement; toggle.type = "button"; toggle.setAttribute("aria-expanded", "false"); toggle.setAttribute("aria-controls", "profile.editor");
  const editor = text("section", ""); editor.id = "profile.editor"; editor.hidden = true; editor.setAttribute("aria-label", "Darstellungsprofil bearbeiten");
  const status = text("p", "Darstellungsprofil wird geladen …"); status.setAttribute("role", "status"); status.dataset.profileState = "LOADING";
  const rows = text("div", ""); rows.className = "profile-rows";
  const diff = text("section", ""); diff.dataset.profile = "diff"; diff.hidden = true;
  const tools = text("div", ""); tools.className = "profile-tools";
  let rowsLifetime = new AbortController(); let diffLifetime = new AbortController();
  const button = (label: string, handler: () => void, listenerSignal = signal) => { const b = text("button", label) as HTMLButtonElement; b.type = "button"; b.addEventListener("click", handler, { signal: listenerSignal }); return b; };
  const save = button("Profil speichern", review);
  const reload = button("Gespeichertes Profil neu laden — lokale Änderungen verwerfen", () => { void load(); });
  const reset = button("Standarddarstellung wiederherstellen", () => { if (!readback || busy || blocked) return; draft = defaultBrowserProfileV1(); draft.items = draft.items.filter(i => readback!.catalog.some(c => c.id === i.id && c.version === i.version && c.state === "AVAILABLE")); changed(); renderRows(); });
  editor.append(text("h2", "Persönliche Dashboard- und Paneldarstellung"), text("p", "Nur Darstellung: Reihenfolge, Sichtbarkeit und Größe. Ziehen oder die Nach-oben-/Nach-unten-Tasten verwenden; Größenregler mit Pfeiltasten, Pos1 oder Ende. Änderungen sind zunächst lokale Vorschau. Kein fachlicher Wert und keine Berechtigung wird gespeichert."), rows, tools, diff);
  tools.append(save, reset, reload); root.append(toggle, status, editor);
  toggle.addEventListener("click", () => { editor.hidden = !editor.hidden; toggle.setAttribute("aria-expanded", String(!editor.hidden)); }, { signal });
  function state(code: string, message: string) { status.dataset.profileState = code; status.dataset.profileRevision = readback ? String(readback.revision) : "unknown"; status.textContent = message; save.disabled = !readback || busy || blocked; reset.disabled = save.disabled; reload.disabled = busy; }
  function resolved(): BrowserProfileReadV1 {
    if (!readback) throw new Error("PROFILE_READBACK_MISSING");
    return { ...readback, profile: copy(draft), ...resolveBrowserProfileV1(draft, readback.catalog) };
  }
  function apply() { if (readback && !signal.aborted) options.apply(resolved()); }
  function changed() { proposal = null; diffLifetime.abort(); diff.hidden = true; apply(); state("DRAFT", "Lokale Darstellungsvorschau — noch nicht gespeichert. Mobil wird nur die Anordnung umgebrochen; das Desktopprofil bleibt unverändert."); }
  function move(id: string, offset: number) {
    if (blocked || busy) return; const index = draft.items.findIndex(i => i.id === id); const destination = index + offset;
    if (index < 0 || destination < 0 || destination >= draft.items.length) return;
    const [item] = draft.items.splice(index, 1); draft.items.splice(destination, 0, item!); changed(); renderRows();
    rows.querySelector<HTMLButtonElement>('[data-move="' + id + '"]')?.focus();
  }
  function renderRows() {
    rowsLifetime.abort(); rowsLifetime = new AbortController(); const rowSignal = AbortSignal.any([signal, rowsLifetime.signal]);
    rows.replaceChildren();
    for (const item of draft.items) {
      const name = labels[item.id] ?? item.id; const orphan = readback ? resolved().orphaned.find(i => i.id === item.id) : undefined;
      const row = text("section", ""); row.dataset.profileItem = item.id; row.className = "profile-row"; row.draggable = !orphan && !busy && !blocked;
      row.append(text("h3", name));
      if (orphan) row.append(text("p", "Nicht wiederhergestellt (orphaned): " + orphan.reason + ". Kein ähnlicher ID-Ersatz und keine Freigabe durch Darstellung."));
      const checkLabel = text("label", ""); const check = document.createElement("input"); check.type = "checkbox"; check.checked = item.visible; check.setAttribute("aria-label", name + " anzeigen"); check.disabled = !!orphan || busy || blocked;
      check.addEventListener("change", () => { item.visible = check.checked; changed(); }, { signal: rowSignal }); checkLabel.append(check, text("span", "Anzeigen"));
      const sizeLabel = text("label", "Größe: "); sizeLabel.className = "profile-size"; const range = document.createElement("input"); range.type = "range"; range.min = "0"; range.max = "2"; range.step = "1"; range.value = String(sizes.indexOf(item.size)); range.setAttribute("aria-label", name + " Größe"); range.setAttribute("aria-valuetext", item.size); range.disabled = check.disabled;
      const output = text("span", item.size); range.addEventListener("input", () => { item.size = sizes[Number(range.value)]!; range.setAttribute("aria-valuetext", item.size); output.textContent = item.size; changed(); }, { signal: rowSignal }); sizeLabel.append(range, output);
      const up = button(name + " nach oben", () => move(item.id, -1), rowSignal); up.dataset.move = item.id; up.disabled = busy || blocked || draft.items[0]?.id === item.id;
      const down = button(name + " nach unten", () => move(item.id, 1), rowSignal); down.disabled = busy || blocked || draft.items.at(-1)?.id === item.id;
      row.append(checkLabel, sizeLabel, up, down);
      row.addEventListener("dragstart", event => { if (blocked || busy || orphan) { event.preventDefault(); return; } dragging = item.id; event.dataTransfer?.setData("text/plain", item.id); }, { signal: rowSignal });
      row.addEventListener("dragover", event => { if (dragging) event.preventDefault(); }, { signal: rowSignal });
      row.addEventListener("drop", event => { event.preventDefault(); if (!dragging) return; const from = draft.items.findIndex(i => i.id === dragging); const to = draft.items.findIndex(i => i.id === item.id); if (from >= 0 && to >= 0) move(dragging, to - from); dragging = null; }, { signal: rowSignal });
      row.addEventListener("dragend", () => { dragging = null; }, { signal: rowSignal }); rows.append(row);
    }
  }
  function review() {
    if (!readback || busy || blocked) return;
    diffLifetime.abort(); diffLifetime = new AbortController(); const diffSignal = AbortSignal.any([signal, diffLifetime.signal]);
    proposal = copy(draft); diff.replaceChildren(text("h3", "Darstellungsänderungen prüfen"));
    const changes = text("ul", ""); const prior = readback.profile.items;
    for (const [index, item] of proposal.items.entries()) {
      const old = prior.find(i => i.id === item.id); const name = labels[item.id] ?? item.id;
      changes.append(text("li", name + ": Position " + (old ? prior.indexOf(old) + 1 : "neu") + " → " + (index + 1) + "; " + (old?.visible ? "angezeigt" : "ausgeblendet") + " → " + (item.visible ? "angezeigt" : "ausgeblendet") + "; Größe " + (old?.size ?? "neu") + " → " + item.size));
    }
    for (const old of prior.filter(i => !proposal!.items.some(n => n.id === i.id))) changes.append(text("li", (labels[old.id] ?? old.id) + ": aus dem Darstellungsprofil entfernt."));
    diff.append(changes, text("p", "Folge: ersetzt ausschließlich Ihre gespeicherte Darstellung bei Revision " + readback.revision + ". Keine Fachwerte, Secrets oder Rechte; kein automatischer Konfliktmerge. Ein konkurrierendes Browserprofil wird nicht überschrieben."), button("Speichern bestätigen", () => { void commit(); }, diffSignal), button("Bestätigung abbrechen", () => { proposal = null; diffLifetime.abort(); diff.hidden = true; save.focus(); }, diffSignal));
    diff.hidden = false; diff.querySelector<HTMLButtonElement>("button")?.focus();
  }
  async function request(method: "GET" | "POST", value?: unknown) {
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(10000)]);
    const response = await fetch(base + "/workspace/profile", { method, credentials: "same-origin", cache: "no-store", signal: requestSignal, headers: { "x-pan543-session": sessionId, ...(method === "POST" ? { "content-type": "application/json" } : {}) }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
    if (response.status !== 200) return { status: response.status, value: null };
    const target = validateBrowserProfileReadV1(await response.json());
    const context = await fetch(base + "/workspace/context", { credentials: "same-origin", cache: "no-store", signal: requestSignal });
    if (context.status !== 200 || (await context.json() as { sessionId?: string }).sessionId !== sessionId) return { status: 401, value: null };
    return { status: 200, value: target };
  }
  function denied() { blocked = true; readback = null; rows.replaceChildren(); diff.hidden = true; options.denied(); }
  async function load() {
    if (busy || signal.aborted) return;
    busy = true; const invocation = ++serial; state("LOADING", "Gespeicherte Darstellung wird aus dem Backend geladen …");
    try {
      const response = await request("GET"); if (signal.aborted || invocation !== serial) return;
      if (response.status !== 200 || !response.value) {
        if (response.status === 404) {
          // Backward-compatible document mount without the optional profile
          // adapter: local code-owned defaults, NOT a backend readback/PASS.
          legacyOnly = true; blocked = true; draft = defaultBrowserProfileV1();
          const catalog = draft.items.map(i => ({ id: i.id, version: i.version, state: "AVAILABLE" as const }));
          readback = { schemaVersion: "pansphaira.browser-profile-read/v1", revision: 0, profile: copy(draft), catalog, migration: "NONE", ...resolveBrowserProfileV1(draft, catalog) };
          apply(); state("UNAVAILABLE", "Profiladapter nicht montiert: lokale Standarddarstellung, Speichern nicht verfügbar. Kein persistierter Readback.");
        }
        else if ([401, 403].includes(response.status)) { denied(); state("DENIED", "Zugriff verweigert oder Session gewechselt. Keine Wiederherstellung und kein Schreibretry."); }
        else { blocked = true; state("UNAVAILABLE", "Profilbackend nicht verfügbar. Keine Speicherung bestätigt. Neu laden liest autoritativ; kein automatischer Schreibretry."); }
        return;
      }
      readback = response.value; draft = copy(readback.profile); blocked = false; legacyOnly = false; proposal = null; diff.hidden = true;
      apply(); state("READY", (readback.revision === 0 ? "Noch kein persönliches Profil gespeichert. Sichere Standarddarstellung." : "Gespeichertes Profil gelesen, Revision " + readback.revision + ".") + (readback.migration !== "NONE" ? " Migration: " + readback.migration + "; erst ausdrückliche Bestätigung speichert v1." : "") + (readback.orphaned.length ? " Nicht wiederhergestellte Beiträge: " + readback.orphaned.map(i => i.id + " (" + i.reason + ")").join(", ") + "." : ""));
    } catch { if (!signal.aborted) { blocked = true; state("UNAVAILABLE", "Profilreadback nicht verfügbar oder ungültig. Kein Erfolg bestätigt."); } }
    finally { if (!signal.aborted && invocation === serial) { busy = false; save.disabled = !readback || blocked; reset.disabled = save.disabled; reload.disabled = false; renderRows(); } }
  }
  async function commit() {
    if (!readback || !proposal || busy || blocked) return;
    const proposed = copy(proposal); const expected = readback.revision; busy = true; blocked = true; diff.hidden = true; renderRows(); state("SAVING", "Darstellung wird mit erwarteter Revision gespeichert …");
    try {
      const response = await request("POST", { expectedRevision: expected, profile: proposed }); if (signal.aborted) return;
      if (response.status === 409) { state("CONFLICT", "Konflikt: Ein anderer Browser hat eine neuere Revision gespeichert. Ihre lokale Vorschau bleibt erhalten. Gespeichertes Profil neu laden verwirft sie ausdrücklich; kein stilles Überschreiben."); return; }
      if ([401, 403].includes(response.status)) { denied(); state("DENIED", "Session abgelaufen, gewechselt oder Zugriff verweigert. Kein erfolgreicher Schreibabschluss."); return; }
      if (response.status === 400) { state("REJECTED", "Darstellung oder Beitragsversion serverseitig verweigert. Kein Erfolg bestätigt; zuerst aktuelle Darstellung neu laden."); return; }
      if (response.status !== 200 || !response.value) { state("OUTCOME_UNKNOWN", "Speicherergebnis nicht bestätigt. Zuerst gespeichertes Profil neu laden; niemals blind erneut schreiben."); return; }
      // Required readback is a second real backend read, not the POST reply.
      const target = await request("GET"); if (signal.aborted) return;
      if ([401, 403].includes(target.status)) { denied(); state("DENIED", "Session gewechselt oder abgelaufen; Speicherung nicht mehr lesbar. Kein bestätigter Abschluss in diesem Browser."); return; }
      if (target.status !== 200 || !target.value || target.value.revision !== expected + 1 || JSON.stringify(target.value.profile) !== JSON.stringify(proposed)) { state("OUTCOME_UNKNOWN", "Zielreadback abweichend oder nicht verfügbar. Keine Erfolgsmeldung; zuerst gespeichertes Profil neu laden."); return; }
      readback = target.value; draft = copy(target.value.profile); blocked = false; proposal = null; apply(); state("SAVED", "Darstellung gespeichert und aus dem Backend wieder gelesen, Revision " + readback.revision + ".");
    } catch { if (!signal.aborted) state("OUTCOME_UNKNOWN", "Speicherergebnis unbekannt. Keine Erfolgsmeldung und kein Retry. Zuerst gespeichertes Profil neu laden."); }
    finally { if (!signal.aborted) { busy = false; save.disabled = blocked; reset.disabled = blocked; reload.disabled = false; renderRows(); } }
  }
  signal.addEventListener("abort", () => { serial++; rowsLifetime.abort(); diffLifetime.abort(); blocked = true; readback = null; proposal = null; root.replaceChildren(); }, { once: true });
  // On focus reread only for authority/revision projection; never discard a dirty
  // draft or automatically merge concurrent edits. Session replacement clears it.
  async function checkBinding() {
    if (signal.aborted || busy) return;
    try { const result = await request("GET"); if (signal.aborted) return;
      if ([401, 403].includes(result.status)) { denied(); state("DENIED", "Session gewechselt oder Zugriff verweigert. Darstellung darf keine Rechte wiederbeleben."); }
      else if (result.value && readback) { readback = { ...readback, catalog: result.value.catalog, effectiveItems: result.value.effectiveItems, orphaned: result.value.orphaned }; apply(); renderRows(); }
    } catch { /* a failed read never grants a new contribution */ }
  }
  window.addEventListener("focus", () => { void checkBinding(); }, { signal });
  await load();
  return { refreshAuthority: checkBinding, visible(id: string) { return !!readback && resolved().effectiveItems.some(i => i.id === id && i.visible); }, setVisible(id: string) { if (!readback || (blocked && !legacyOnly) || busy || !readback.catalog.some(i => i.id === id && i.state === "AVAILABLE")) return false; const item = draft.items.find(i => i.id === id); if (!item) return false; item.visible = true; if (legacyOnly) apply(); else changed(); renderRows(); return true; } };
}
