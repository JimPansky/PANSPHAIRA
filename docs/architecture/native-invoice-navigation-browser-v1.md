# Bounded native invoice search and browser navigation v1

Scope: original PAN546 DUI-05, composed with the existing native ERV reader,
PAN548 authentic context, protected PAN527 session ingress and PAN546 personal
view owner. Whole PAN546/PAN548, real-model DUI-09, expanded relation browsing
and portfolio acceptance remain NOT_DELIVERED. This source document is not a
CI, merge, release or public readback receipt. Functional source delivery retains
the existing SOURCE_EVIDENCE_ONLY release classification.

## Closed native and transport contracts

The owner-only `invoiceNavigation: true` attachment is default off. It requires
the existing authentic session/context/leading-reader composition and module
views. An authentic reader from a different leading root, even for the same
tenant and matching invoice IDs/revision numbers, is denied. The navigation
mount requires the exact already-mounted authentic context owner.

Only the two existing authorized synthetic invoice IDs are searched on the
leading reader. The query is an uppercase ID substring of 1–64 characters,
A–Z/0–9/hyphen, not SQL, a URL, supplier metadata or a general document service.
At most two native reads and two candidates are returned. NONE and AMBIGUOUS
are explicit outcomes; no first-hit guess. Labels contain only native object ID,
data revision and an opaque server-owned target. No invented supplier, assignee
or invoice-number relation is projected.

The versioned SEARCH/REQUEST/READ/ACK inputs and results have runtime validators
in `packages/contracts/src/workspace-invoice-navigation-v1.ts`. The existing
protected ingress exposes only `/workspace/invoice-navigation/search`,
`/request`, `/read`, `/ack` and code-owned `/app.js`. JSON extras, raw/free URLs,
caller identities/roles, executable nested render fields and wrong schema are
not authority. Authentication, tenant, origin, native tab proof, current source
context/revisions/selection, registered route and unchanged original 60-second
lease are checked natively before and after reads. Attachment retirement while
an actual request body is pending cannot return an old receipt.

Targets, requests and read receipts are bounded opaque in-memory capabilities,
not another database, task engine or financial ledger. A target is consumed
once. REQUEST is NAVIGATION_REQUESTED, never a browser-render success. Native
READ is NATIVE_TARGET_READBACK_RECEIVED, still not rendering. The shell performs
its real registered plugin read/render, binds the destination context once and
checks live visible native DOM plus exact object/view/tab/epoch/data revision
before ACK. The ACK is BROWSER_RENDER_ACK_REPORTED, explicitly client-reported;
`serverCertifiedBrowserRender` and `executionAuthorityGranted` are false. It
requires a primitive closed render snapshot, exact single-claim epoch and
selection transition, one read receipt and the original unrenewed lease after
final native verification. No invoice, business, personal profile or view write
is granted by search, request, read or ACK.

## Dirty drafts and lifecycle

The same shell owns the presentation-only guard for three distinct existing
objects: PERSONAL_MODULE_VIEW, PERSONAL_SHELL_PROFILE and AGENT_CONFIGURATION.
The guard presents explicit keep/Escape versus discard-and-navigate choices.
Keep preserves the actual local draft and cancels navigation. Proceed invokes
the corresponding existing owner's discard/CANCEL or independent profile GET,
never a save, confirmation, automatic merge or business effect. In-flight or
uncertain draft operations do not acquire new write/retry authority. Existing
candidate consumption, CAS, explicit confirmation, independent readback and
new-CAS Undo remain separate. Unknown write outcomes are not blindly repeated.

Manual hash navigation invalidates the pending search/navigation serial before
its own activation. Configuration save-in-flight is dirty even without local
input changes. A dispatched personal CAS has a source-bound unresolved record
separate from live context/render state; it cannot be cleared by CANCEL, local
discard or same-session stale selection/context-null. Its visible native card
values retire, while an explicit independent snapshot/GET can reconcile only
the same native object/view/tab/epoch and exact candidate digest/revision. No
CONFIRM replay is allowed. If the optional search bundle fails to load, minimal
shell admission restores the accepted hash and preserves any dirty owner; the
existing explicit discard/reload/reconciliation controls and logout remain
available, and clean modules are not blocked.

A real native 200 target-read response arriving later cannot
replace the manual view or post an old ACK. Context/plugin disposal uses existing
owners and owned abort lifetimes. Failed optional navigation-script loading does
not prevent setup/ERV/profile controls or logout. Navigation is not an agent
model grant. The permitted real-model route/identities/existing secret reference,
capped product consent and PAN575 loop for DUI-09 remain concretely unbound.

## Original criteria and registered direct probes

DUI-05-AC01 and no/multiple hits, external URL, metadata leak:
`native-invoice-navigation.test.mjs`, `navigation-transport.test.mjs` and
`browser-navigation.test.mjs` exercise the actual leading native projection,
closed validators and real NONE/AMBIGUOUS/ONE selection without implicit action.

DUI-05-AC02 and stale revision/foreign tab or receipt:
those native/HTTPS/browser tests plus `navigation-review517.test.mjs` distinguish
request/native read/render, exact live DOM and ACK, primitive snapshot, source
identity, one-shot consumption, real unchanged60s expiry and retirement. The
browser projection is compared freshly with the leading reader; ACK is not
server-certified visual evidence.

DUI-05-AC03 and plugin gone/unsaved draft:
`browser-navigation.test.mjs` covers all three real draft owners, explicit
keep/Escape/discard, actual manual supersession of a TLS-verified server200 read
paused only at Chromium's response stage, native plugin retirement and failed
optional navigation module with unrelated modules/logout still operable.

UIDOD-01/02/03: actual browser/frontend/network/native read and separate rendered
receipt, versioned closed DTOs, no effect authority, current protected server
session/tenant/tab/context/revision/lease/receipt checks; native five review
regressions and actual HTTPS pending-body retirement are part of the fixed suite.

UIDOD-04/05: actual desktop/390px/CSS200 whole-PNGs and their source/build/hash,
viewport/state/DOM/control geometry are captured by the browser suite. The zoom
probe is CSS zoom, not a claimed native browser-zoom measurement. Keyboard Tab
and Enter observe visible focus. Empty/ambiguous/loading/request-not-render,
real render, all three dirtyguards, denied/plugin/foreign-ACK/manual states are
captured. Actual full-image sighting against existing Notebook/Prism anchors is
required separately; screenshot capture alone is not visual acceptance.

UIDOD-06/07: the same shell/plugin/context/deep-link owners and owned lifetimes,
representative positive plus seven direct negative categories, no replacement
reader/model/database, no broad combination flood or new study. Direct native
PAN541/PAN548 consumers are checked when their shared bytes change.

UIDOD-08: fixed existing `npm run pan546:test` includes every original test plus
the four new native/review/transport/browser files; caller selection/shards and
startup-test aliases remain denied. Exact source/build/picture/review provenance,
current mandatory source and protected-main CI/raw/WholeCanonical `npm test`
without skips, protected merge, new release and exact anonymous archives/docs/
artifact readback remain the existing final delivery requirements. Prior SHA CI
and older images are reusable only for byte-identical affected scope, never as a
new source acceptance. Existing 131072-byte per-asset ingress bound, pinned build,
legacy runnable manifest, owner mapping, global settings and pause/rights limits
are unchanged. Retained KS composition requires its own exact byte compatibility,
not arithmetic or a PAN producer PASS.
