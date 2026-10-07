# Versioned bounded agent configuration drafts — PAN563 v1

## Product scope and reuse

This is a draft attachment to the existing profile/template contracts, not another profile registry, policy engine, authorization system or runtime controller.

- REUSE #441: `verifyPan441ProfileV1`, the released read-only employee-assistant profile and its explicitly pinned narrower replacement. Allowed fields and capability IDs come from that verified profile. The synthetic profile's source tenant is not an authenticated gateway tenant or a caller identity. The attachment carries its source digest; it does not reinterpret that profile as live tenant authorization.
- REUSE #529: `bindRuntimeTemplateV1` over the owner's existing runtime identity. The store rebinds and compares the complete template, including identity, policy, network and resource-class digests. No template planning activates anything.
- MAP #365: confirmed-input semantics, explicit `NEEDS_CLARIFICATION`, contradiction retention and deterministic normalized evidence. The existing ERV matching/tolerance dialogue is not imported into an employee-profile draft, and no new executable ERV variant is invented. Profile-specific ERV dialogue/delta behavior remains in its existing owner.
- EXTEND #541/#527: a code-owned optional plugin, the existing shell slots/context lifecycle and the same protected HTTPS ingress/session store. No shared layout/CSS rewrite, external plugin loading or new login/provider harness.
- NEW: typed draft/answer/readback contracts, pure server question/invalidation logic and a SQLite draft attachment keyed by authenticated tenant/subject, native instance and verified profile ID.

Only synthetic local evidence is qualified here. Live provider capabilities, enterprise authentication, deployment, payment, booking, customer data and release qualification are not claimed.

## One canonical parameter definition

`packages/contracts/src/agent-configuration-draft-v1.ts` is the canonical definition and runtime validation implementation; it is exported from the existing contracts index. The browser imports its types only and receives its actual server-owned field definitions in every readback. It does not compute required questions or a competing normalized configuration.

Wire versions:

- `pansphaira.agent-configuration/answers/v1`
- `pansphaira.agent-configuration/draft/v1`
- `pansphaira.agent-configuration/readback/v1`
- `pansphaira.agent-configuration/normalized/v1`
- `pansphaira.agent-configuration/field/v1`, field version `1.0.0`
- `pansphaira.agent-configuration/authority-context/v1`
- adapter `pan441-pan529/v1`
- portable identity `1.0.0`, component `pansphaira-local-demo`, Node `>=24.14.1 <25`
- model `synthetic-bounded/v1` or explicit `NONE`; synthetic-only provider mode

The supported versions are returned explicitly. Unsupported schemas/adapters are rejected. A changed policy/profile/template digest is rejected with `CONFIGURATION_POLICY_CHANGED_REJECT_REQUIRES_RECONFIRMATION`; persisted bytes are retained. There is no v0 reader, untested migration or silent conversion. A reviewed future migration needs a new explicit version and tests.

Every field definition contains its own schema/version, group, type, allowed values (integer inclusive bounds), condition/requiredness, validator, sensitivity, exact dependencies, German label and German/English help. Every draft field carries value, server-owned source, confirmation and a validation status/digest. Groups are context, goal, runtime, model, access, data, tools, work, budget, persistence and optional modules. Model secrecy uses a secret-reference slot, never raw credentials; this adapter needs no credential, so its only supported slot value is null. Any actual reference or raw secret is visibly rejected until an approved adapter supports it. No secret is resolved or provider called.

The original #560 concept and #545 UI-DoD were recovered by anonymous read-only GitHub API requests after the initial frozen candidate. Their additional bounded groups are now explicit: timezone, fixed profile name/use case, owner-derived adapter/runtime/location/capabilities, model connection/requirements/input-output-token ceilings, no-credential authentication and NOT_RUN check status, registered own-source/read/purpose scope, no-effect confirmation, timeout/request ceilings, one-step/one-request parallelism, owner deletion/retention/redaction scope and explicit NONE for unsupported optional modules. No universal runtime, sampling, reasoning, connection, module or autonomous-agent capability is invented. Supported ceilings come from the exact rebound PAN529 resource class and can only be restricted; even redigested enlarged templates are rejected.

Identity is deliberately not an editable field. Readback `authorityContext` comes exclusively from the protected backend principal and verified runtime binding: authenticated tenant, subject, instance, generation and role. It grants personal draft saving only; `executionAuthorityGranted` remains false. Caller-supplied context, subject, rights or source fields fail closed. The role and profile labels are not runtime/business authorization. The source profile's synthetic tenant is still not a live authenticated tenant.

Explicit reviewed profile/adapter/template prefills cover locale, runtime/model selection, one own-scope read capability, read-only work, bounded integer budgets and draft-only persistence. An allowed profile is not the user's confirmed objective: the goal remains UNKNOWN until explicitly answered, and selecting permitted data fields requires current confirmation against that objective. This is not a defaulted authorization grant. The two objective labels both remain bounded by the unchanged released own-read capability; neither changes its source authority purpose.

## Questions, changes and normalization

The server returns the deterministic frontier of unresolved necessary questions. A dependent question is not asked until its upstream answers are current. Current confirmed values are not re-asked. An unchanged confirmation is a no-op and retains source/check evidence.

UNKNOWN uses explicit null and remains unresolved. Conflicting duplicate answers in one batch become CONTRADICTED and return `NEEDS_CLARIFICATION`, not a winner or default. Intentional later edits replace the selected field and invalidate exactly its transitive dependency closure, excluding fields explicitly answered against the complete same batch. Unrelated answers/checks remain byte-identical.

A goal edit invalidates only data-field confirmation. A model edit invalidates exactly its model connection/requirements/limits, access, secret-reference and model-budget checks. `NONE` makes conditional model/access/budget values inapplicable and explicitly projects null rather than pretending stale checks are current. The draft still retains their stale original values/checks. The optional no-credential slot is not an activation prerequisite. Re-enabling a synthetic model requires renewed applicable checks.

Dense closed data, exact object keys, known field names, typed values and supported bounds are validated before persistence. Getters, inherited objects, exotic arrays, arbitrary commands/URLs/SQL, source/role/identity fields and unknown enums cannot enter an answer command. Caller source text is never authority. Set values normalize by sorting; equivalent currently confirmed values produce the same normalized configuration/digest independently of batch order. Confirmation histories/provenance and storage revisions are not part of that semantic configuration digest.

## Persistence and transport contract for consumers

`createAgentConfigurationDraftStoreV1({root, profile, template})` is code-owner assembly. The root must be an absolute, non-symlink, owner-private 0700 directory. Its SQLite file is owner-private 0600. WAL with FULL synchronous durability and a BEGIN IMMEDIATE transaction protect insert/update CAS across processes. Bound SQL keys use the existing authenticated principal, not caller fields. An initial read is an unpersisted revision-zero view; GET does not create a draft row. A save must supply exact `expectedRevision`; a stale tab receives 409 and cannot overwrite another save. Unchanged confirmed writes do not increment an already persisted revision.

Draft scope: authenticated session `tenantId` / `subjectId`, server runtime `instanceId` / generation binding, verified `profileId`. A user/tenant/instance cannot select another owner's target through the request. Source profile or template changes require explicit reconciliation rather than resurrecting old rights. Draft files are configuration data only; no business ledger, runtime desired-state, broker reservation, execution command or authorization store is modified.

The additive owner hook is `mountProtectedWorkspaceConfigurationV1` with exact keys `{optIn, tenantId, identityDigest, origin, adapterVersion, read, save}` and adapter version `pan441-pan529/v1`. This is process-owner code, never an HTTP installer or descriptor-supplied callback. `enableWorkspaceBrowserV1` takes the optional `configurationDrafts` owned store and checks its native tenant/instance/generation binding before mounting that hook. Omitting it leaves the previous browser and routes unchanged.

Protected endpoint:

    GET  /t/<tenant>/workspace/configuration
    POST /t/<tenant>/workspace/configuration

The POST JSON has exactly `{schemaVersion, expectedRevision, answers}`. Each answer has exactly `{field, value, confirmation}`. No user/tenant/profile ID, role, provenance or authority can be supplied. Reader and reviewer sessions may save their own presentation-free configuration draft; neither gets the existing governed execution writer.

POST requires the existing valid HttpOnly Secure SameSite=Strict cookie, exact same Origin and `x-pan563-context` equal to the current logical session binding returned by `/workspace/context`. The context value is not a credential or grant. Authentication/context proof is rechecked after bounded body reading and before the synchronous save. Bodies are bounded to 8192 bytes. Reads do not reissue session cookies; retired reads cannot overwrite replacement cookies. Caller identity/role headers remain denied. Schema/value denial returns 400, ownership/context denial 403/401, CAS or changed-policy rejection 409. Other unavailable storage errors cannot become success.

Code-owner integration uses the existing `protectedGuidedOwnerContextV1` to obtain the actual identity/product root, a private draft subdirectory, the verified profile and a rebound PAN529 template. It then passes the store to the existing workspace assembly alongside the existing native ERV reader. Do not add an account issuer or accept a template/profile from HTTP. Dispose the workspace attachment before closing its store.

The browser uses the versioned `AgentConfigurationReadbackV1`, renders the server questions/definitions, saves one explicit answer with CAS, then issues a separate GET and compares actual persisted draft bytes/revision before displaying success. The next necessary question comes first; grouped readable parameters follow, with JSON behind optional Technical Details. The explicit "Ohne KI fortfahren" action saves NONE through the same protected backend and readback contract, not an unpersisted UI toggle. A conflicting tab retains its unsaved form and requires explicit reload. Lost or unverified save responses become OUTCOME_UNKNOWN and disable further mutation until explicit authoritative reload/reconciliation; the browser never blindly retries. The browser test forwards the actual native POST and drops only delivery of its successful response, then observes the saved revision through a separate real GET. Session revocation and actual expiry clear displayed parameters/edit controls. Context disposal aborts retired reads/listeners. All module styling is `.configuration-draft`-scoped; existing Setup/ERV views remain separate factories.

## Local test commands and evidence boundaries

After lockfile installation on supported Node/npm:

    TMPDIR=<owned-directory> npm run build
    TMPDIR=<owned-directory> npm run lint
    TMPDIR=<owned-directory> npm run pan563:test

`pan563:test` is registered in the canonical npm pretest chain. Its fixed suite is listed by `node scripts/run-pan563-configuration-draft-tests.mjs --list`; caller-selected files or skip flags are rejected. It recompiles TypeScript (including negative compile-time fixtures), builds the existing browser bundle and runs all contract, compatibility, durability, independent-process CAS, protected-backend, browser and registration tests. Missing browser tooling is a failure, never PASS/SKIP.

Browser prerequisites: repository-locked Playwright Chromium, an explicit `PAN527_CERTUTIL`, owned `PLAYWRIGHT_BROWSERS_PATH`, and optional owned `PAN563_BROWSER_EVIDENCE`. Chromium validates an isolated local CA; no certificate/authentication bypass or mocked positive backend is used. Test requests are restricted to the local protected origin. Loading uses a paused real request; the network-error state uses a deliberate abort. The spoofed source negative changes only the outgoing real request, not a fabricated server response.

Screenshots/manifest bind the exact Git head, clean/dirty state, built JavaScript SHA256, browser version, real session/context revision, draft revision, viewport, CSS zoom, native browser zoom and image SHA256. Desktop, 390px, long German labels, keyboard/focus, empty/loading/ready/conflict/error/denied and model-less paths are exercised. CSS zoom 2 remains a separate rendered-content/reflow check. Actual 200% Chromium tab zoom uses `chrome.tabs.setZoom/getZoom` in a test-only local extension, with doubled device-pixel ratio and reduced CSS viewport asserted for both editor and resolved states. Its persistent browser profile is isolated in owned scratch, verifies the local CA and permits fixture-origin requests only; the extension is not a product plugin or install artifact. No OS zoom or physical phone is claimed. DOM geometry and screenshots are not a visual review. Actual image inspection and independent UI acceptance must be recorded separately; no image-viewing tool is available in this worker.

## Integration and delivery handoff

### Main297 same-owner source successor and corrected capture observation

Serial intake v5 uses exactly protected Main `297e49258dd81cce9b77874491819c7f5b481997`, tree `12cf4ded1e6d5b75339f50edefd9c9b258d8bc43`, after release2026_10_07_v5. The consumed `c2eada65257f854672f2963efa233a5fe57a9869` development history and full outbox remain versioned history, not successor ancestry. Existing #543 profile/catalog/context/ERV behavior and #572/#574/#576 sources are preserved. The Main297 `profilesV1` attachment remains separate from the optional #563 configuration attachment; a real protected coexistence regression checks both independent CAS histories, wrong proof-header rejection, existing native reads and restart persistence. All previous package script values/order remain unchanged except appending the complete `pan563:test` to pretest and adding its standalone entry.

The old native200 images are rejected evidence, not visual PASS. A real browser RED on the successor observed CSS viewport640/DPR2/native chrome.tabs zoom2 and CSS content640x3951, while original Playwright fullPage returned640x3952. CDP simultaneously reported its non-CSS content extent1280x7903. Bounds alone did not establish image coverage. Direct full-DIP surface capture corrected the initial extents, but both expanded-surface methods interfered with subsequently inserted form layout after a real schema denial. Fresh no-capture and view-only diagnostic flows passed; the expanded-capture flow failed. Those actual failures/pixels remain evidence, not product acceptance. An experimental post-paint focus-order change did not remedy that observation effect and was reverted.

The final remedy changes test capture/observation only: Page.captureScreenshot captures the actual native compositor VIEW with fromSurface:false and no coordinate clip, at explicitly recorded real scroll positions. Full physical-extent PNGs are honest stitches of those raw viewport tiles, not single-shot fullPage images. Tiles are neither resized nor synthesized; raw tile PNGs, scroll/DPR/viewport pins, image digests and a no-gap/full-height coverage guard accompany each assembled image. Actual native chrome.tabs zoom remains unchanged throughout. No CSS zoom, emulated viewport, DPR change or browser reload is used to substitute for native tab zoom or repair the page. Original product CSS is unchanged.

The pixel coverage guard compares actual PNG IHDR extents with CDP CSS content multiplied by observed DPR, allowing only one rounding pixel. Its width component rejects the retained old640px native captures using their recorded layout-width/DPR pins; it does not invent missing old content-height pins. Native assembled captures are additionally compared, channel-for-channel, with separate unclipped compositor viewport captures at scroll0 and at the actual configuration-editor/resolved-state position. The scrolled Playwright viewport observation itself produced an actual raster mismatch; a native view capture without a CSS-coordinate clip fixes observation, not product layout. No mismatch is suppressed. Sidecar pins include PNG size/digest, native zoom readback, CSS zoom, CSS/legacy CDP metrics, viewport/DPR, captured/prior/tile scroll positions, readback status/revision/configuration digest, reference pixels and unchanged post-capture geometry. Session/context proof values are redacted. Automated coverage/raster checks are not human visual or physical-device acceptance.

The complete-suite Main reconciliation also scopes status assertions to the configuration component rather than whichever global status happens to be last after profile projection. A biting live browser RED observes an unchanged Main profile/context authority GET followed by presentation projection dropping keyboard focus from the actual configuration checkbox. The only additional product-source remedy captures/restores connected configuration focus around the existing Main projection, only when the configuration attachment is enabled and the main card remains visible. Every original presentation/order/visibility statement is retained; no CSS or other module focus behavior is changed. Configuration-context disposal still prevents restoration to retired nodes.

The process test consumes child JSON on close, after stdout/stderr drain, using UTF-8 stream decoding. A real OS parent/descendant pipe fixture releases the JSON tail only after parent exit; the exit-boundary observation fails with incomplete JSON and the close-boundary observation passes. This is plumbing observation, not a dummy native store/provider outcome. The original eight independent store processes, simultaneous write barrier, one-save/seven-conflict assertion and fresh-process exact durable readback remain unchanged. Main #574's synchronous completed-output capture and Main #529's explicit close-boundary worker observation were inspected; no other owner's source/tests were edited.

This optional source attachment must be reconciled by the existing serial owner with other shell/runtime lanes. Shared touched paths are the existing contracts index, workspace assembly/app and origin-session adapter; their additive versioned boundaries above are the consumer handoff. No runtime sandbox or UI layout/profile subsystem is replaced.

The existing Verification-DAG/integrity generator, inventories/checksums and source-only release packaging need final serial-owner registration/reconciliation for these added sources and changed shared inputs. Do not suppress their stale-digest failures or alter existing hard gates. Worker registration into npm is not a complete repository-integrity or release qualification.

The original #560 concept is no longer a missing-input blocker: it was anonymously retrieved and reconciled against the bounded #563 groups; immutable copies and hashes accompany the outbox handoff. Other children own bootstrap, conversation, secure live connections and activation/first-result integration. Human image inspection and independent visual acceptance are still not performed by this worker. Complete canonical CI, shared integrity/packaging registration, supported full-install/native qualification, serial integration/revalidation against any subsequent protected tail, merge, release and anonymous exact-identity readback remain with the delivery owner. This Main297-based local source successor is not DELIVERED and grants no publication rights.
