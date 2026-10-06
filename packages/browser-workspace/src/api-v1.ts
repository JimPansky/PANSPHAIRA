import type { BrowserContextV1, BrowserContextReadV1 } from "../../browser-shell/src/context-owner-v1.js";
import type { BrowserErvReadV1 } from "../../contracts/src/browser-erv-read-v1.js";
export interface WorkspaceViewApiV1 {
  readonly context: () => BrowserContextV1;
  readonly read: () => Promise<BrowserContextReadV1>;
  readonly rememberInvoice: (value: BrowserErvReadV1) => void;
  readonly invoice: () => BrowserErvReadV1 | null;
  readonly openInvoicePanel: () => void;
}
export function text(tag: string, value: string): HTMLElement {
  const node = document.createElement(tag); node.textContent = value; return node;
}
export function facts(target: HTMLElement, pairs: readonly (readonly [string, string])[]) {
  const list = document.createElement("dl"); list.className = "facts";
  for (const [label, value] of pairs) { list.append(text("dt", label), text("dd", value)); }
  target.append(list);
}
export function readState(target: HTMLElement, backend: string, outcome: string, message: string) {
  target.dataset.backend = backend; target.dataset.outcome = outcome;
  const status = text("p", message); status.className = "read-state"; status.setAttribute("role", "status"); target.append(status);
}
export function deniedMessage(outcome: string): string {
  return outcome === "DENIED" ? "Zugriff verweigert: aktuelle Session, Tenant oder Objektbindung prüfen."
    : outcome === "STALE_CONTEXT" ? "Kontext gewechselt: alte Antwort verworfen."
    : "Backend nicht verfügbar oder Vorgang veraltet. Kein erfolgreicher fachlicher Readback.";
}
