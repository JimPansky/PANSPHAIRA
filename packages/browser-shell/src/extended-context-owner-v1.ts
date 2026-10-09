import { validateWorkspaceContextReadbackV1, type WorkspaceContextReadbackV1 } from "../../contracts/src/workspace-context-selection-v1.js";

export type WorkspaceContextPhaseV1 = "read" | "stt" | "model" | "render" | "preview";
export type WorkspaceContextResponseV1<T> =
  | { readonly outcome: "CURRENT_CONTEXT_RESPONSE"; readonly phase: WorkspaceContextPhaseV1; readonly context: WorkspaceContextReadbackV1; readonly value: T }
  | { readonly outcome: "STALE_CONTEXT" | "OPERATION_FAILED"; readonly phase: WorkspaceContextPhaseV1; readonly value: null };
const phases: readonly WorkspaceContextPhaseV1[] = ["read", "stt", "model", "render", "preview"];
const fixedBindingKeys = ["origin", "tenantId", "subjectId", "sessionId", "instanceId", "generation", "tabId"] as const;

// Additive lifetime primitive, not a second shell, server registry or grant. The
// trusted composition owner supplies the actual current protected-session/native
// handle check. A shape-valid/copied response or async promise is not liveness.
// This shared guard does not implement STT/inference/preview/effects itself.
export function createExtendedBrowserContextOwnerV1(options: {
  readonly initialContext: WorkspaceContextReadbackV1;
  readonly isContextLive: (context: WorkspaceContextReadbackV1) => boolean;
}) {
  if (!options || typeof options.isContextLive !== "function") throw new Error("CONTEXT_LIVE_OWNER_REQUIRED");
  let current = validateWorkspaceContextReadbackV1(options.initialContext);
  const initialBinding = current.binding;
  let sequence = 0, closed = false;
  const pending = new Set<AbortController>(), disposals = new Map<() => void, object>();
  function open() { if (closed) throw new Error("CONTEXT_OWNER_CLOSED"); }
  function retire() {
    const controllers = [...pending]; pending.clear();
    const owned = [...disposals.keys()]; disposals.clear();
    // Clear ownership before untrusted callbacks. Reentrant new registrations
    // cannot accidentally become old-lifetime work or be wiped after callback.
    for (const controller of controllers) controller.abort();
    let failures = 0;
    for (const dispose of owned) { try { dispose(); } catch { failures++; } }
    return Object.freeze({ disposedListeners: owned.length, disposalFailures: failures });
  }
  function admitted(context: WorkspaceContextReadbackV1, issuedSequence: number) {
    if (closed || context !== current || issuedSequence !== sequence) return false;
    const now = Date.now();
    if (!Number.isSafeInteger(now) || now < context.lease.issuedAtMs || now >= context.lease.expiresAtMs) return false;
    try {
      if (options.isContextLive(context) !== true) return false;
      // The live predicate itself may replace, retire or close the owner, or
      // expire its lease while checking the actual protected/native binding.
      const after = Date.now();
      return !closed && context === current && issuedSequence === sequence
        && Number.isSafeInteger(after) && after >= context.lease.issuedAtMs && after < context.lease.expiresAtMs;
    } catch { return false; }
  }
  return Object.freeze({
    context() { open(); return current; },
    onDispose(dispose: () => void) {
      open(); if (typeof dispose !== "function" || disposals.size >= 64) throw new Error("CONTEXT_DISPOSAL_DENIED");
      const registration = disposals.get(dispose) ?? Object.freeze({});
      disposals.set(dispose, registration);
      // A stale lifetime unregister cannot remove a newer same-callback owner.
      return () => { if (disposals.get(dispose) === registration) disposals.delete(dispose); };
    },
    replace(value: unknown) {
      open(); const next = validateWorkspaceContextReadbackV1(value);
      if (fixedBindingKeys.some(key => next.binding[key] !== initialBinding[key])) throw new Error("CONTEXT_OWNER_BINDING_DENIED");
      // All independently versioned source/view/catalog/selection axes, module,
      // nullable primary object, tab epoch, handle and lease are part of identity.
      if (JSON.stringify(next) === JSON.stringify(current)) return Object.freeze({ disposedListeners: 0, disposalFailures: 0 });
      if (sequence >= Number.MAX_SAFE_INTEGER) throw new Error("CONTEXT_SEQUENCE_LIMIT");
      sequence++; current = next; return retire();
    },
    run<T>(phase: WorkspaceContextPhaseV1, operation: (context: WorkspaceContextReadbackV1, signal: AbortSignal) => T | Promise<T>): Promise<WorkspaceContextResponseV1<T>> {
      open(); if (!phases.includes(phase) || typeof operation !== "function") throw new Error("CONTEXT_PHASE_DENIED");
      if (pending.size >= 8) throw new Error("CONTEXT_PENDING_LIMIT");
      const captured = current, issuedSequence = sequence, controller = new AbortController(); pending.add(controller);
      const stale = (): WorkspaceContextResponseV1<T> => Object.freeze({ outcome: "STALE_CONTEXT", phase, value: null });
      return (async () => {
        try {
          if (!admitted(captured, issuedSequence) || controller.signal.aborted) return stale();
          const value = await operation(captured, controller.signal);
          if (!admitted(captured, issuedSequence) || controller.signal.aborted) return stale();
          return Object.freeze({ outcome: "CURRENT_CONTEXT_RESPONSE", phase, context: captured, value });
        } catch {
          return !admitted(captured, issuedSequence) || controller.signal.aborted ? stale()
            : Object.freeze({ outcome: "OPERATION_FAILED", phase, value: null });
        } finally { pending.delete(controller); }
      })();
    },
    close() { if (closed) return; closed = true; sequence++; return retire(); },
  });
}
