# PAN549 bounded native result contract v1

The immutable early implementation candidate for PAN549 and the existing KS303
consumer remains historical at fd1fcf3b0392a7069169b7459c8ff8923466f38b.
Its descriptor bytes and recorded early runtime pins are not rewritten or
promoted to the current renderer. Source development alone is not a release,
full PAN549 acceptance, actual KS pairing, production authority, new data
access, or a general dashboard/query engine.
The consumer selects the exact containing Git commit and its primary tree;
branch names, matching shapes and similarly named fields are not selectors.

## Actual entrypoints and contracts

- Native read: `src/pan549/native-analysis-read.mjs#createNativeAnalysisReadAdapterV1`.
- Existing leading source: `src/pan515/trade-state.mjs#readPan515TradeState`,
  using the unchanged PAN520 STOCK projection. No copied stock writer or metric
  engine is introduced.
- Browser-safe types and runtime checks:
  `packages/contracts/src/workspace-analysis-v1.ts`.
- Renderer: `packages/browser-workspace/src/plugin-analysis-v1.ts#renderWorkspaceAnalysisResultV1`.
  It returns a Promise; await it, supply the expected protected binding, an
  explicit synchronous boolean live-context predicate as the fourth argument
  and the mandatory admitted selector as the fifth argument. There is no
  connectivity-only fallback; missing, Promise or other nonboolean predicates
  cannot confirm a read.
  Omitted or malformed selectors and mismatched revisions/literal nullable
  cutoffs are denied; integrity-only bytes are not a confirmed read response.
  It verifies the complete bytes before displaying plain text in code-owned DOM
  elements. No arbitrary URL, iframe, HTML or SQL. The direct consumer remains
  responsible for its own live protected source/context admission.
- Integrated view: `createAnalysisViewV1` and `analysisPluginV1`, route
  `/workspace/analysis`, code-owner opt-in only.
- Existing protected HTTPS attachment:
  `src/pan527/origin-session-adapter.mjs#mountProtectedWorkspaceAnalysisV1`.
  POST `/t/<bound-tenant>/workspace/analysis` is a read with a closed selector,
  not an effect or plugin-registration API.

Read schema: `pansphaira.workspace-analysis/read/v1`.
Result schema: `pansphaira.workspace-analysis/result/v1`.
Fixed object: `analysis:common-trade-01:stock`.

Exports are `WORKSPACE_ANALYSIS_READ_V1`, `WORKSPACE_ANALYSIS_RESULT_V1`,
`WORKSPACE_ANALYSIS_STOCK_OBJECT_V1`, `WorkspaceAnalysisBindingV1`,
`WorkspaceAnalysisReadV1`, `WorkspaceAnalysisStockKeyV1`,
`WorkspaceAnalysisStockRowV1`, `WorkspaceAnalysisStockResultV1`,
`WorkspaceAnalysisLocalCohortV1`, `validateWorkspaceAnalysisReadV1`,
`validateWorkspaceAnalysisResultV1`, `verifyWorkspaceAnalysisResultIntegrityV1`
and `verifyWorkspaceAnalysisReadResultV1`.
The synchronous validator checks closed shape/policy and returns a deeply
frozen defensive copy. The asynchronous integrity consumer additionally
checks result and optional report SHA-256. Digests are unkeyed consistency
checks, never authentication, provenance or a rights grant.

The direct renderer and integrated view share one target transaction owner.
Every loading, terminal, fact and revision-marker update belongs to that owner.
Captured target/ancestor removal permanently retires a pending transaction,
even when the same DOM node is reattached before observer callback delivery.
Every captured ancestor root is observed, including intermediate open/closed
shadow roots; a nested host detach/reattach cannot revive the old transaction.
The synchronous external liveness callback runs before the final observer drain
and ownership/attachment checks. Context transitions delivered by that callback
cannot revive an old attachment or let an outer call displace a newer owner.
The integrated view stages and verifies frozen result bytes first, then obtains
the final live protected session confirmation. No asynchronous work remains
between its last ownership/context checks and the synchronous fact commit.

## Identity, scope, revisions and missing facts

The result contains the exact protected origin, tenant, instance, generation
and identityDigest. Authenticate the existing session and recheck its live
scope before and after reading; never mint those rights from a result or
plugin descriptor. The integration checks the actual session-derived context
proof and origin, and never renews a cookie on result delivery.

`source.projectionDigest` identifies the actual unchanged PAN520 projection.
`source.snapshot.nativeRevision`, `bindingDigest`, `nativeEventSetDigest` and
`asOf` retain the native source identities and cutoff.
`resultRevision` is SHA-256 of canonical JSON of the complete result excluding
only `resultRevision`; it binds the protected binding, rows and optional local
report as well. It is deliberately not the projection digest.
`expectedNativeRevision` and `expectedResultRevision` are exact preconditions;
null means an explicitly requested current read, not an inferred matching
revision. Unsupported object, additional fields, free queries and wrong
preconditions fail closed.

The code-owned COMMON-TRADE-01 mapping is explicit:
`SYN-COMMON / SYN-TENANT-01 / SYN-ENTITY-01 / SO-01 / 1 / ARTICLE-A / WH-01 / EUR / STK`.
The protected fixture tenant is `tenant-a`; this is a deliberate owner-selected
synthetic mapping, not inferred equality with the native source tenant.

Ordered stock rows are `physical`, `reserved`, `quarantined`, `free`,
`stockRunwayDays`, `stockValueMinor`. Units are respectively STK for the first
four, DAYS, EUR_MINOR. KNOWN rows retain actual native values and basis.
The last two are UNAVAILABLE with null values and the original missing-history
or missing-qualified-valuation reason. The complete stock view is PARTIAL.
No unavailable value is converted to zero. UNKNOWN describes an unconfirmed
read/binding or the absent population denominator, not a successful stock fact.

An optional owner-selected local Usage Insights store contributes an actual
attachment-time `UsageInsightsLocalServiceV1.localReport()` snapshot. This is
not a collector, new cohort calculation or an always-current report. Its own
`generatedAtMs` cutoff and `reportDigest` remain separate from the stock cutoff.
This bounded profile admits only the existing EMPTY or SUPPRESSED local report
with null metrics, the original coverage/nonclaim/small-cell labels and exact
null suppression semantics. PUBLISHED cohort statistics are not admitted by
this local profile. The population denominator is UNKNOWN/null; no adoption
rate or representative-population claim is possible. A missing attachment is
null and is not synthesized from stock data.

`proposalOnly`, `effectsProduced`, `executionAuthorityGranted`,
`consentChanged` and `transportEnabled` are all false. This profile is only a
read; it produces neither a proposal nor an applied change. Consent/transport
are not enabled by construction, mounting, reading or rendering. An explicitly
consented local synthetic input remains a test input, not productive rights.

## Permitted real source/result pairing

`tests/pan549/native-analysis-read.test.mjs` executes native commands into the
actual leading SQLite fixture and independently checks receipt-minus-issue
stock. `tests/pan549/browser-analysis.test.mjs` separately uses the existing
finance/native consumer, computes receipt-minus-SHIP at the exact cutoff from
persisted source commands, navigates the real protected shared shell, observes
its request and compares native result bytes with the rendered value. Both
prove physical stock 2 STK in their actual permitted synthetic source paths;
command vocabularies are not assumed equal. Missing facts and native rows are
checked separately, and reads preserve the source events.

`tests/pan549/cohort-analysis.test.mjs` reads the actual existing local service:
fresh default-off EMPTY creates no store; one explicit local basic-consent
synthetic event yields SUPPRESSED with no totals or metrics. Reading preserves
the existing file and OFF network mode. Tests deny missing-denominator
smoothing, suppressed statistics, wrong scope/revisions, tampered full result
bytes, accessor reads and proposal/effect/consent/transport escalation.

Reproduce the complete fixed profile with the repository's locked dependencies,
supported Linux x86-64 Node 24.14.1 / npm 11.16.0, invocation-owned scratch and
the existing Playwright browser and certutil: `npm run pan549:test`.
The public entry compiles TypeScript, builds the actual browser bundle and runs
all six fixed test files; caller filters, browser/native skips and test controls
are denied, including sharding, rerun histories, setup hooks and output controls.
NODE_OPTIONS uses the declared Node quote/escape grammar before underscore-alias
normalization, so embedded split quotes or escapes cannot select a partial suite.
An inherited NODE_TEST_CONTEXT is denied in execution mode even when its value
is empty: Node24 checks its presence and otherwise suppresses all test files.
The explicit --list mode remains a side-effect-free fixed-file enumeration.
Execution admits only closed non-executable NODE_OPTIONS: conditions, positive
integer old-/semi-space limits and warning-display switches, including their
supported underscore spelling. Import/require/loader hooks and unknown options
are denied before evidence, preparation or child work. A trusted Node/npm parent
is required: this entry is not a hostile-host sandbox and cannot undo code that
an adversarial preload already ran before JavaScript admission.
The owned scratch is TMPDIR or an explicitly supplied RUNNER_TEMP, never an
implicit system-temp fallback. A direct development browser invocation must
also supply PAN527_BROWSER_MODULE, PAN527_CERTUTIL, PLAYWRIGHT_BROWSERS_PATH and
PAN549_BROWSER_EVIDENCE. There is no fake TLS backend.

## Original acceptance and UI boundaries

- PUI-08-AC01/04: actual persisted native commands are the independent numeric
  oracle. The native and real protected SharedShell consumer tests separately
  compare physical stock 2 STK; the browser observes its actual request and the
  exact source/result bytes before checking the rendered table. No chart is
  required for this bounded tabular stock profile. Source, cutoff, revision,
  grain, units and unavailable facts remain visible.
- PUI-08-AC02: native missing-history/valuation facts remain UNAVAILABLE/null,
  the overall view remains PARTIAL, and EMPTY/SUPPRESSED local reports retain
  UNKNOWN/null population denominator and no metrics. Shape-valid byte
  mutations are denied by the direct integrity consumer before display.
- PUI-08-AC03: this read-only profile produces neither a proposal nor a mutation.
  There is no approval control, applied-change badge or consent/transport write.
  Consequently a mutating before/after confirmation or persisted effect is
  inapplicable; tests instead prove retained source events and local report
  bytes, independently of the rendered result.
- UIDOD-01/02/03/07: actual protected browser navigation, observed native request,
  closed versioned selectors and complete result validation; real stale source
  and result, foreign context, unavailable selector, interrupted delivery,
  changed session, logout and genuinely expired session probes. Late successful
  native bytes are discarded after context retirement; denial never renews the
  cookie or offers a blind effect retry.
- UIDOD-04/05: real desktop and 390-px captures for positive, EMPTY, LOADING,
  STALE, UNAVAILABLE, DENIED and UNKNOWN states; measured positive page/control
  bounds, keyboard focus and actual local-table horizontal scrolling. The
  fixture also applies CSS layout zoom and wider-font/content stress. These are
  not physical-device, browser-chrome zoom or localization-study acceptance.
  Known terminal states are visible text, not only dataset tokens; desktop
  unit/state/header tokens remain whole. A focused skip link has stable reserved
  space instead of covering the heading or moving pointer targets on blur. Image
  inspection is a separate
  required observation, not inferred from DOM assertions or capture success.
- UIDOD-06: trusted code-owned optional attachment, current protected
  session/context/deep-link boundaries, lifecycle retirement and independent
  setup availability after analysis denial, lost delivery or source withdrawal.
  Layout and navigation never grant native rights.
- UIDOD-08: bind execution, compiled/runtime pins, screenshots and focused
  qualification to the actual immutable source. Retain unchanged component
  reviews only at matching bytes; remaining seams use the explicitly authorized
  owner self-check, not a claimed new independent person/worker review.

The required shared-shell capability is the existing delivered PAN541 path.
PAN545 supplies common quality rules, not a reciprocal whole-issue CLOSED gate:
this profile implements its own applicable browser/evidence/registration checks.
The later dialog, widget, voice and router consumers retain their own owners.
They do not add reverse prerequisites to this standalone result profile.

## Explicit delivery gates and historical provenance

The early descriptor remains bound only to its containing early commit and
recorded source/compiled pins. Current source, renderer and registration must
be qualified separately; matching schema names do not promote those historical
pins. The source-only classification does not expand the legacy runnable
public manifest or claim a turnkey installer.

Immutable focused qualification, actual image sighting, unchanged WholeCanonical
and all required source/Main CI/raw artifacts, protected merge, correctly
classified new functional release, exact anonymous archives/product readback,
release workflow and explicit original closure are required. An actual KS
consumer integration is NOT_RUN here and is owned by KS303, not made a
prerequisite for standalone PAN delivery. Voice, widget, whole foreign epics
and Main preapproval are not waiting gates.
