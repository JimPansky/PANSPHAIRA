# PAN549 bounded result contract — early development candidate

This is an early implementation candidate for PAN549 and the existing KS303
consumer. It is not a release, full PAN549 acceptance, actual KS pairing,
production authority, new data access, or a general dashboard/query engine.
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
  It returns a Promise; await it, supply the expected protected binding and a
  live context predicate. It verifies the complete bytes before displaying
  plain text in code-owned DOM elements. No arbitrary URL, iframe, HTML or SQL.
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
`validateWorkspaceAnalysisResultV1` and
`verifyWorkspaceAnalysisResultIntegrityV1`.
The synchronous validator checks closed shape/policy and returns a deeply
frozen defensive copy. The asynchronous integrity consumer additionally
checks result and optional report SHA-256. Digests are unkeyed consistency
checks, never authentication, provenance or a rights grant.

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

Reproduce with the repository's locked dependencies, supported Linux x86-64
Node 24.14.1 / npm 11.16.0, an invocation-owned TMPDIR, the existing Playwright
browser and certutil. Compile first (`npm run build` and
`node scripts/build-pan541-browser.mjs`). The browser test requires
PAN527_BROWSER_MODULE, PAN527_CERTUTIL, PLAYWRIGHT_BROWSERS_PATH and
PAN549_BROWSER_EVIDENCE. There is no optional browser skip or fake TLS backend.

## Explicit remaining delivery gates

Full original browser state/lifecycle/keyboard/layout coverage, actual image
sighting, immutable focused qualification, public runner/source registration,
unchanged WholeCanonical and all required source/Main CI/raw artifacts,
protected merge, correctly classified new functional release, exact anonymous
archives/product readback, release workflow and explicit original closure
remain pending. An actual KS consumer integration is NOT_RUN here and is owned
by KS303, not made a prerequisite for standalone PAN delivery. Voice, widget,
whole foreign epics and Main preapproval are not waiting gates.
