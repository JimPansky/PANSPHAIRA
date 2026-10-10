# Native shared task panel v1 — bounded PUI-07 / DUI-06 increment

This is an additive default-off consumer of the existing protected workspace,
authentic context/selection owner, native ERV/Human catalogue and personal view
owner. It is not a second shell, task database, general agent controller, HMI
activation or provider platform. Early DUI-02 and the delivered bounded #546
native view/connected Human increment are retained. Whole #548 and later #546
remain open. This document describes source behaviour; source preparation is not
final CI, a release or real-model acceptance.

## Enablement and closed transport

Only the existing server assembly `enableWorkspaceBrowserV1` may explicitly set
`agentRuns: true`, and only with `contextSelection: true` plus the existing native
`moduleViews` owner. The native capability is process-owned and bound to the
actual protected origin, tenant, instance/generation and context owner. It cannot
be fabricated by an HTTP caller or a descriptor label. Without owner opt-in no
agent routes or browser panel are mounted. The optional browser module is served
from the same protected origin and has the unchanged 131072-byte per-asset bound.
The locked existing esbuild compiler/minification and CSP remain in force; no
free script URL, redirect, provider key or model selection is accepted.

The bounded authenticated routes are:

- POST `/t/<tenant>/workspace/agent-run/plan`: exact v1 command and authenticated
  native context; nonempty bounded text, no credential-like input; selected native
  personal view instance must exist. Return opaque plan handle, plan digest, run
  ID, exact binding, source digest/revisions and expiry. Phase
  `PLANNED_NOT_DISPATCHED` is not execution.
- POST `/t/<tenant>/workspace/agent-run/start`: exactly that opaque plan and digest;
  revalidate session, current effective native read rights, origin, tenant,
  subject, instance/generation, session/tab/epoch, selection, lease, source and
  personal view revision/digest. Never accept caller role, model, provider, shell
  command, settle signer or fabricated grant.
- GET `/t/<tenant>/workspace/agent-run/read`: current authenticated context and
  opaque run ID in `x-pan548-run`; independent native ledger projection. No
  dispatch, resume or zero-usage settlement. The header is a selector, not an
  authority. Wrong method/body/content type/encoding and unknown route fail.

Plan handles remain process-local and expire with the native context. Completed
run identity/result/budget custody is persisted in the existing
`createResourceBudgetStoreV1` SQLite ledger, partitioned by native tenant,
subject, instance/generation and bound policy. The browser's sessionStorage keeps
only an opaque last-run hint, never status, provider credentials or authorization.
Fresh authenticated GET after reload/reopened native owner reads the leading
ledger; no reconstructed in-memory success is claimed. A new session/tab may
read its same-owner historical run but still needs fresh native selection/source
and a separate new #546 preview to offer any delta. Other subjects/generations
cannot read that partition.

## Model and resource boundary

The explicit legacy assembly without modelConnections remains
`SYNTHETIC_PROBE_ONLY`. Supplying modelConnections binds the same existing565
native owner through an opaque process-owned `OWNER_BOUND_PROVIDER` capability;
an empty list or missing selection/purpose denies, never silently falls back.
Every plan/run DTO still declares `realModelAcceptance: false`. This owner mode
is not proof of a configured product model or actual language-model inference.
The deterministic legacy peer and the controlled LOCAL HTTP peer used for native
owner qualification are neither intent interpreters nor language models.

The legacy `ModelAccessBrokerV1` entry retains its two synthetic request/response phases:
one untrusted `ui.view.propose` MOVE/RESIZE candidate for exactly the selected
instance, then a bounded final description after native preview validation. It
never saves a view or performs a business action. Existing #546 validator/reducer
and native preview/cancel are used; their opaque preview candidate is consumed,
not exposed as a save grant. The final result only carries an untrusted delta,
before/after views/digests and expected personal view revision. Browser v1 DTOs
validate exact envelopes, identity, proposal/reducer compatibility and false
business/persistence/authority flags before presentation.

The existing native integer budget owner reserves before dispatch. SQLite wait is
followed by fresh native revalidation before its atomic UNKNOWN_USAGE fence and
callback. At most the one native dispatch wins; concurrent same-plan starts join
it, subsequent same-key reads do not call the callback again. A provider error,
late/stale/revoked context or invalid result after an attempt leaves full reserved
usage held and returns `OUTCOME_UNCONFIRMED`; it is not manufactured zero cost or
success. Only owner-completion evidence settles known synthetic usage. The existing ledger
also executes an owner-local exact-true guard inside the acquired settlement
transaction, after any SQLite writer wait and before result persistence or release
of unused units. Lease/source/session/rights drift at that boundary rolls back to
full UNKNOWN_USAGE custody. This guard is not serialized or supplied by a model,
HTTP caller or browser; completion authentication/result binding remain mandatory.
There is no browser settle method and no arbitrary tool action. Cancel and resume are
explicitly disabled with `NO_NATIVE_MODEL_TASK_CANCEL_CONTRACT` and
`NO_NATIVE_MODEL_TASK_RESUME_CONTRACT`; hiding the panel is not task cancellation.

An unbranded/copied `OWNER_BOUND_PROVIDER` label remains refused with
`AGENT_REAL_ROUTE_NOT_BOUND_DENIED`. Native owner admission is now implemented:
dynamic existing reference selection, three fresh separate565 prerequisites,
task-specific purpose/payload/session/ownerGrant/route/identity/price-currency/
eight-limit/expiry offer and exact explicit once-only confirmation. Probe-only
owner grants and fixed public probe consent cannot authorize personal UI task or
tool data. The native browser shows this offer before a default-unchecked
data/budget checkbox; intent edits and context retirement invalidate it. Planning
never dispatches. The existing565 COST/runtime ledger reserves the full admitted
run before HTTP; current authority/secret/context is rechecked before each step.
The shared575 completion is privately branded, not supplied by provider prose.

The actual two native tools are ui.view.read then ui.view.propose, with fresh
correlated tool-message information through the existing shared broker. Controlled
HTTP qualification exercises this path, separate546 preview/confirm/CAS/GET/Undo
and UNKNOWN/read/reload/no-replay, but genuine DUI-09 remains NOT_RUN. No suitable
authorized real product route/model deployment/configuration identity, secret
reference or fixed price/currency was found in the allowed product metadata.
An existing worker subscription or GitHub authentication does not supply them.
There is no credential search, new account, paid inference, global harness/provider
change or silent fallback. Only a concrete suitable product option and its
necessary bounded approval can enable a genuine-model qualification, not a whole
dependency's CLOSED status. Direct transport and actual harness proof stay separate.

## Same shell, proposal and confirmation

The panel is nonmodal and abort-bound to the existing shell lifecycle. Chip,
docked and focus presentations keep the same context owner and native run ID;
no task restart or parallel chat engine. It shows current native object/selection,
plan/run/source/revision and held/consumed native budget facts. Native keyboard
selection resolves `pan.erv.module-card` membership for the existing VALUE, TABLE
and HUMAN_REVIEW components, not CSS, DOM names or model-supplied roles. German
labels and explanatory states are plain text, not executable markup/raw JSON as
the main interface.

The native view editor's additive `subscribeFrame` is presentation-only: changes
to current ready frame refresh proposal-control availability. It does not mint
scope or bypass server validation. A remembered run after reload is not a new
save candidate. Current source digest and personal before digest/revision, plus
fresh selected native instance, must still match before separate preview.

The button for inspecting a proposal calls the same existing
`previewDelta(..., 'AGENT')` as the manual reducer path. Only #546's separate
German before/after/consequence display and explicit confirmation may call its
once-consumed native CAS. Success requires an independent authoritative GET;
Undo is another preview/confirmation/new CAS, not resetting a task. A lost start
reply consumes the browser's attempted plan and offers only independent run
readback, never blind redispatch. A lost save reply retains #546's attempted
candidate guard and independent target reconciliation. Task settlement does not
save views. There are no booking/payment/shared-publish or setup-activation
rights, and #567 remains nonexecuting from this panel.

Native source/context retirement clears stale current presentation and pending
plan. Late replies cannot revive it. Optional agent script/network/preview failure
cannot replace the existing manual native view, navigation, personal profile or
own logout. Desktop and 390px/CSS200% layouts use bounded wrapping; concept
Notebook/Prism references guide hierarchy/spacing, not fictional data or pixel
baseline claims.

## Original criteria and verification boundary

PUI-07-AC01: exact native plan/scope/prerequisites/run/source/revision projection
in the existing shell. PUI-07-AC02: existing broker/resource/view primitives;
unsupported cancel/resume remain disabled with native reason. PUI-07-AC03: native
SAFE_GUIDED/current rights and exact binding, closed tools/routes, false grant and
effect; no HMI widening. PUI-07-AC04: actual Chromium-operated synthetic plan/start,
persisted native status and fresh reload GET; duplicate/unknown/retirement safe.

DUI-06-AC01 uses the three existing native components and registered keyboard
selection with the same canonical manual/agent operation family. DUI-06-AC02
keeps German preview/diff/cancel/separate confirmation/save/readback. DUI-06-AC03
keeps nonmodal desktop390/keyboard/focus, independent profile/navigation/logout
under agent failure. Earlier delivered DUI-02 is not a new whole-issue gate;
DUI-07 audio, real DUI-09, later search/expanded view/rollout stay open.

UIDOD-01 requires actual browser requests and native persisted readback, not only
API tests. UIDOD-02 requires versioned runtime-validated DTOs and separate
proposal/decision/authority/effect. UIDOD-03 requires current session/tenant/object/
rights/revisions and no false stale/expired/unknown success or mutation retry.
UIDOD-04 requires actual affected desktop390/long/loading/error/denied pixels
visually inspected. UIDOD-05 requires positive DOM/control/page bounds and
keyboard/focus/zoom/nonmodal checks. UIDOD-06 preserves shell/plugin/context/
lifecycle and independent modules. UIDOD-07 is a representative connected
positive plus directly affected negatives/consumers, not a combination flood.
UIDOD-08 keeps exact source/build/state/revisions, focused independent review and
targeted corrections, mandatory registration/CI/WholeCanonical/protected merge/
new functional SOURCE_EVIDENCE_ONLY release and exact anonymous archive/docs/
release-event readback. Local green development is not delivery or whole #548.

The fixed `npm run pan548:test` entry additively retains all earlier context tests
and executes the new native-eight, transport/DTO and actual-browser panel cases;
trusted Node/npm parent and closed argument/startup-option admission stay intact.
Shared broker's no-structured-output canonical request omits absent `text`, rather
than serializing `undefined`; its direct regression preserves real callback
count, request digest and no-authority candidate semantics. Synthetic, browser,
real-model, CI and release evidence are separate. Existing required gates and
131072-byte ingress remain unchanged. Optional module splitting is not a retained
KS single-bundle/consumer PASS; that compatibility stays separately open.
