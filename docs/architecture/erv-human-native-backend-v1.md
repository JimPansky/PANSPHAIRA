# PanSphaira: bounded native ERV human decision v1

This backend-only increment fills the missing persistent human-decision attachment identified by PUI-04 / issue #542. The existing ERV contracts and evidence projections did not provide a native human-review state. Existing task and durable boundaries are not relabelled as a previously implemented human workflow. No browser implementation, productive posting, general workflow engine or human-observed approval is claimed.

## Exact supported scenario and configuration

Scenario `PAN542_COMMON_TRADE_NATIVE_ERV_V1` attaches to the already qualified `COMMON-TRADE-01` native PAN472 target SQLite / PAN473 owner and PAN515/PAN516 procurement state. The positive invoice is `AP-PAN516-MATCHED-01`; `AP-PAN516-PARTIAL-01` supplies the bounded unresolved counterpart. Existing procurement liability and compiled ERV evaluation are reused in one protected read transaction; no replacement matcher, external ERP, fabricated invoice ledger or additional package is introduced.

The owner-only initializer persists `pansphaira.erv-human/native-configuration/v1` in `pan542_binding`. Its canonical binding digest includes scenario, exact invoice set, protected session origin/audience/tenant/instance/generation/identity digest, role mapping version 1, the code-owned synthetic subject mapping, native trade binding digest and actual source-file identities. The latter are computed from the executed source and compiled ERV contract, not inferred from a baseline Git head or a test image identity. An existing table/configuration is never silently adopted. Source/configuration drift denies instead of pretending the old state was qualified for new bytes.

This closed local synthetic role mapping is persisted server-side:

- `synthetic:erv-reviewer` maps to `REVIEWER`.
- `synthetic:erv-approver` maps to `APPROVER`.
- `synthetic:erv-reader` maps to `READER`.

This is not a live identity-provider qualification or an arbitrary role-management service. The backend accepts only the actual protected PAN527 adapter owned by its module, then authenticates through that adapter. A copied facade, browser header, role claim, caller-supplied subject or mapping version cannot establish that ownership or change the native mapping. Protected mutation authorization, Origin and CSRF remain separate from the native role.

## Backend entry and persistence

`src/pan542/native-human-backend.mjs` exports the privileged `initializeNativeErvHumanBackendV1` constructor and `createNativeErvHumanBackendV1`. Initialization takes an existing owned native root and an explicit local synthetic owner; it is not an HTTP route. The created backend has three closed request entries:

- `read(headers, {invoiceId})`: authenticated native projection.
- `decide(headers, command)`: protected mutation plus the current native role, exact native revision and proposal revision/digest.
- `reconcile(headers, {invoiceId, effectId})`: read-only native receipt reconciliation; never a new decision effect.

A decision command has exactly `schemaVersion`, `invoiceId`, `effectId`, `transportId`, `expectedNativeRevision`, `expectedProposalRevision`, `proposalDigest` and `action`. Its schema is `pansphaira.erv-human/decision/v1`. Effect identity is distinct from the transport identity. An already-recorded effect refuses a new decision and requires reconciliation even under a different transport identifier.

The only actions are `REVIEW`, `QUERY` and `APPROVE_LOCAL_EVIDENCE_ONLY`. Review and query require the native reviewer. Evidence approval requires a separate native approver, an existing review at the actual current native basis, and the existing matched/released local synthetic liability result. Unsupported actions deny. The resulting states are `REVIEWED_LOCAL_EVIDENCE_ONLY`, `QUERY_PENDING_LOCAL_EVIDENCE_ONLY` and `APPROVED_LOCAL_EVIDENCE_ONLY`; before a decision the state is `REVIEW_REQUIRED`. A changed native revision/basis projects `STALE_NATIVE_BASIS_REVIEW_REQUIRED` rather than reuse an old approval.

The bounded `pan542_events` history lives in the same leading native SQLite target. Existing owner leasing, native transaction/full synchronization and immutable history guards are reused. Each decision binds a task through the existing PAN453 `recordLocalJournalTaskIdentity` boundary before its native decision effect. Its identity derives from the server-bound configuration, authenticated principal, exact invoice/proposal and action; transport IDs do not create a new task. The receipt is checked against that actual retained task record. A retained task without a matching native receipt remains fenced/unknown; it is not permission for blind replay. This is a local durable attachment, not a distributed Exactly-once claim or a new productive bound Order handle.

Existing native STOP/REVOKE controls from the owner and controller namespaces deny new decision effects without changing the retained native tasks or decisions. Safe authenticated reads remain possible. Detailed local state, authentication secrets and synthetic scratch are private; public reproduction uses only source and fresh invocation-owned fixtures.

## Evidence and unknown outcomes

Booking, payment, productive dispatch and execution authority remain false at every read/receipt boundary. No approval token, runtime lease, provider dispatch or ERP posting is issued. `APPROVED_LOCAL_EVIDENCE_ONLY` records only this bounded local human-decision evidence.

Reconciliation reads the actual immutable event plus native liability basis/revision and retained durable task binding. A matching current receipt returns `RECONCILED_LOCAL_DECISION_NO_NEW_EFFECT`. An absent effect or changed native basis returns `OUTCOME_UNKNOWN` with no confirmed receipt and no execution authority. Target presence, a client taskstore, a guessed response or a transport timeout is not successful reconciliation.

## Reproduction and acceptance boundary

Use the repository's pinned Node/npm versions and a regular locked dependency installation. The registered fixed `npm run pan542:test` entry compiles the required contracts, uses only explicit owned `TMPDIR` or `RUNNER_TEMP`, and runs the complete declared suite without skip/filter/file-selection switches.

The native product cases execute the existing real synthetic trade/procurement fixture first. They exercise review/query/evidence approval, distinct allowed/denied roles, missing/spoofed roles, foreign invoice, independently rehashed false revisions, duplicate decision under new transport, client taskstore rejection, native confirmation drift, and preserved STOP/REVOKE/task boundaries. The fresh-process consumer opens the same persisted native database and protected session store. The response-loss case actually commits in an owned child process, terminates that child without delivering its response, and reconciles the native result without issuing a second effect. This is controlled response loss, not a fabricated vendor failure.

Development execution, registered metadata tests, frozen source qualification, self-check/retained review scopes, whole canonical proof, required hosted CI, protected merge and exact new release/archive/event readbacks are separate evidence. No local development PASS alone completes issue #542. Integrated browser/request/UI/image qualification belongs to the dependent browser journey; this backend issue adds no fake screenshot or browser acceptance.
