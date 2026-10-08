# Native personal workspace notifications v1

This bounded, opt-in source capability adds a central personal feed to the existing protected workspace. It consumes the existing native ERV human decision and durable task binding; it is not a new workflow engine, productive approval channel, external identity service or email/push integration.

## Assembly and authority

The code owner assembles `createNativeNotificationsV1` with the existing protected session owner, native product root and closed current plugin catalog, then supplies its actual live instance to `enableWorkspaceBrowserV1({ notifications })`. A copied facade, missing binding or closed owner is denied. HTTP requests cannot register publishers, load plugins or choose arbitrary event programs.

`publishNativeEvent` consumes an authorized native REVIEW result and its PAN453 durable task binding. The only event kind is `ERV_LOCAL_EVIDENCE_APPROVAL_REQUIRED`; the only target is the registered `pan.erv` / `pan.erv.route` at version `1.0.0`, with typed invoice identity and native revision. Caller HTML, URLs, callbacks, role claims and caller notification bodies are not publication authority. The leading human history remains owned by PAN542.

The protected tenant and subject determine preferences and read state. A same-origin proof derived from the current authenticated session permits only personal preference/read writes, never native business approval, publication or governance. Existing origin, session, effective native role, realm, generation and closed-payload checks remain required. Notification and layout metadata grant no backend rights.

## Persistence and read-only navigation

The native SQLite owner retains immutable event identity and target history in `pan544_events` and binding metadata in `pan544_binding`. Personal state is bounded and persisted separately in `pan544_preferences` and `pan544_read`. Canonical event identity and revision deduplicate repeated delivery; a divergent reuse is denied. The projection is bounded to 128 events and 64 catalog entries.

An authenticated feed can deliver a published hint before the first ERV plugin visit. Only permitted subscription kinds and `ALL` / `UNREAD` filters affect personal visibility. Hiding a hint never removes a leading task or decision.

Opening a hint checks the current plugin, typed selector, leading human/task state and current native invoice read. It resolves that exact authorized invoice without approval or a personal read mutation. Obsolete revisions and unavailable targets are not rematched into a newer actionable task.

The browser presents a separate before/after proposal before an explicit personal read or preference confirmation. Read confirmation changes only the subject/event/revision read record. It does not complete a task, approve evidence, book an invoice, execute an agent or initiate payment. Personal preferences are revision-bound; the server supplies tenant and subject rather than accepting them from the payload.

## Lifecycle and ambiguity

`OPEN`, `DONE`, `REMOVED`, `OBSOLETE`, `PLUGIN_REMOVED`, `PLUGIN_DISABLED` and `EXPIRED` are projections of the leading native state, current catalog and expiry. Retired hints have no actionable target or read control. The fixed expiry is measured from the original durable task binding, not extended by delivery.

A real interrupted personal write can leave the browser in `OUTCOME_UNKNOWN`. It must not offer a blind second write. The separate protected reconcile endpoint reads authoritative personal state and adds no task effect. A real child-process committed write and fresh-process login cover persistence independently of browser memory. Preference transport ambiguity likewise requires a fresh authoritative read before another confirmed change.

Logout revokes the protected session and aborts the feed lifetime. Late responses cannot restore retired context. A denied current session or stale native target retires previously displayed invoice facts and old context listeners. An old-session deep link remains denied even when a new authorized personal feed is available; its shell feedback is terminal, not permanent loading.

Late completion of another shell read must not steal focus from a current notification proposal. Escape cancels the personal read proposal and returns focus without sending a mutation. Narrow actual layout-width container rules preserve proposal/control space under controlled CSS zoom without changing font size, hiding overflow or broadening permissions. CSS layout zoom is not browser-chrome zoom or physical-device qualification.

## Executable original scope

Run the complete fixed entry with an owned scratch directory and the declared locked dependencies:

    npm run pan544:test

The entry compiles the runtime contracts, builds the existing workspace assets and runs all five fixed native/contract/HTTPS/browser/registration files. Missing Linux x86-64 support, browser tooling, certutil or owned scratch fails rather than skips. File selection and skip/filter arguments are denied by the canonical entry. Browser temporary sockets use only an invocation-owned directory through a live verified descriptor; no host/global temporary-directory configuration is changed.

The actual browser tests use a scoped TLS CA, Secure/HttpOnly/SameSite cookies and the existing same-ingress backend. Cross-origin requests are blocked. Screenshot sidecars bind actual source/compiled asset hashes, viewport, native invoice revision and UI state, with session proof values redacted. Loading/error/lost-response cases forward the genuine backend request and alter only delivery; expected native output is not fabricated.

Original acceptance mapping:

- AC01: native event/task source, persisted publication before first plugin visit, actual authenticated browser login feed.
- AC02: closed runtime types and targets, live owner binding, native subject/tenant persistence, confirmed browser filters/preferences, effective-role/realm/origin/generation denials.
- AC03: exact native invoice resolution, active route/plugin, stale target denial, observed browser open/read requests and unchanged business history.
- AC04: canonical dedupe, explicit personal read, interrupted real child commit, authoritative browser reconciliation without repeat, fresh-process/fresh-login persistence and retained leading task.
- AC05: actual native approval/query/confirmation changes, unavailable plugins, controlled expiry, role/session replacement, revoked logout with held real response, and actual feed/read delivery failures.

The representative journey and directly affected negative tests cover click-as-approval denial, read-not-completion, duplicates, foreign authority, obsolete object version, removed target plugin, interrupted markRead and logout with late delivery. Shared shell/contract tests retain lifecycle and other-module behavior after a code-owned diagnostic renderer failure. Desktop and 390-pixel images cover ready, loading, empty, error, denied and expired states; controlled zoom/focus evidence remains separately classified.

## Delivery and nonclaims

A successful development invocation is not frozen acceptance, required CI, protected merge, release publication or anonymous artifact qualification. The original remains unfinished until its exact candidate, focused source review/self-check, unchanged canonical proof, all required source/main CI, protected SHA-bound merge, new correctly classified release, exact anonymous archive/product readback and release event are qualified.

This source capability grants no production, external fiscal/archive/FiBu, model/provider, external push/email, marketplace, hostile-tenancy or human-usability-study qualification. Local synthetic evidence approval remains separate from productive financial authority. Controlled-clock expiry proves the implemented branch, not an observed 24-hour wait. Existing runnable release boundaries and legacy public payload membership remain unchanged.
