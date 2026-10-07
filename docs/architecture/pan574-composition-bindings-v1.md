# PAN574: two bounded native composition bindings v1

This is an additive export beside the existing #471 capability inventory, not a universal registry or a new business kernel. It calls the unchanged #522 material planner and #63 `ErpOrderCapabilityCellV1`. Existing #471 discovery/authority separation and #432/#433 source-byte and closed-profile rederivation patterns are retained: a caller's catalogue label, digest, description or mapping is not source identity or authority. The invoice-specific #433 mapping is not applied to a material item or an ERP SKU; that would invent domain equivalence. The existing canonical JSON implementation binds all new structured digests. Existing inventory exports, their source/tenant checks and their unavailable facts remain unchanged.

Scope: `SOURCE_EVIDENCE_ONLY`. These native kernels have no network calls. A public example is not a generated connection, a live ERP order, onboarding completion or a model composition run. Model execution: `NOT_RUN`.

## Actual closed D1 contract

Import `src/pan471/composition-bindings.mjs` after the normal locked dependency installation and `npm run build`. `discoverPan471CompositionBindings()` returns exactly two bindings. Each has `contractVersion: 1.0.0`, `contractRevision: D1_NOT_RETROACTIVE_D0`, and a canonical `contractDigest` over every other descriptor field. Runtime binding pins cover the wrapper, original source, actual compiled contract closure and ERP profiles. The material binding includes the transitive procurement quantity evaluator used by the stock contract; direct imports alone are not the native closure.

The metadata closes root and nested material input/output records and the ERP request/receipt fields; native validators enforce data types, ranges, referential identity and calendar/BOM semantics. Calls are data-only plain JSON objects. Accessors, proxies, inherited records, cycles, undefined values, nonfinite numbers and unknown fields are refused. The outer snapshot is bounded to 8192 nodes, depth 16 and 262144 bytes; the material input retains its stricter native limits. No arbitrary file, module, shell, URL, profile switch or operation is selected by caller input.

`pan522.material.plan`: `PLAN`, explicit `STK` units, safe integer quantities bounded by the native contract, at most 64 items and 128 family rows, and at most 4096 generated requirements. Item, calendar, demand and receipt identities are explicit. Stock article and warehouse are the closed `SYN-ART-*` and `LAGER-*` native identities. The stock provenance revision uses the native lowercase-dash pattern, not the broader planner token pattern. Dates are valid UTC dates in 2000–2099, with at most a 366-day planning horizon. Readback is the actual native result with the exact input digest, unchanged input, false execution authority and false capacity qualification. All quantity-bearing root/parent allocations remain visible. Re-evaluation is deterministic and read-only; disabling a proposal view does not mutate leading stock or orders. Finite capacity, delivery promises, external receipt qualification and procurement authority remain absent.

`erp.order.create`: `CREATE_READBACK_COMPENSATING_DELETE`, explicit `EACH`, integer quantity 1–100, exact native request and synthetic SKU patterns. The selected default profile is explicitly pinned to the first existing synthetic ERP profile; the other published native profile digest does not authorize a switch. The actual native cell creates one in-memory synthetic order, reads its provider state and immediately deletes that order. The receipt, actual cell execution counter, retained native receipt digest, effect count, rollback count and equal before/final state digests are checked. Repeating the same request ID in that same cell is denied; a fresh process is a new cell, not persistent idempotence. Productive procurement, durable storage, crash recovery, concurrent external effects and `PROCUREMENT_ORDER_EQUIVALENCE` remain absent. Neither `STK`→`EACH` nor item→SKU is automatically mapped.

## Call and error surface

A call has exactly `schemaVersion`, `capabilityId`, `contractDigest`, `operation`, `unit`, `input`; the schema version is `pansphaira.pan471/composition-call/v1`. A successful result is `pansphaira.pan471/composition-readback/v1`, `NATIVE_READBACK`, the exact capability/contract/call digests, actual `nativeResult` and canonical `resultDigest`. A digest is integrity metadata, not proof that a caller-supplied result was observed natively.

A refusal has only `outcome: DENIED` and `code`, with no partial result. Closed call codes are `AUTHORITY_DENIED`, `DATA_ONLY_DENIED`, `CALL_CONTRACT_DENIED`, `CAPABILITY_UNKNOWN`, `CONTRACT_DRIFT_DENIED`, `OPERATION_DENIED`, `UNIT_DENIED`, `NATIVE_INPUT_DENIED`, `NATIVE_READBACK_DENIED` and `ERP_ORDER_REPLAY_DENIED`. Native input errors are deliberately bounded, not leaked as arbitrary exception text. Missing or changed source pins deny before dispatch, including filesystem read failure. The handoff receiver additionally uses `CONTEXT_ARM_DENIED`, `CONTEXT_PACKET_DENIED`, `ORIGINAL_CONTEXT_DRIFT_DENIED` and `D0_SOURCE_LEAK_OR_CONTENT_DRIFT_DENIED`.

## Public examples and source operator

`contracts/pan574/public-examples-v1.json` holds two independent D1 example inputs. It is not an original D0 member, a reference connection, an independent target oracle or an expected-results file. Execute the actual operator after the normal build:

    node scripts/run-pan574-composition-contracts.mjs list
    node scripts/run-pan574-composition-contracts.mjs examples
    node scripts/run-pan574-composition-contracts.mjs handoff D0
    node scripts/run-pan574-composition-contracts.mjs handoff S

The examples command executes both native bindings and emits their actual readbacks plus native cell evidence. It grants only the two fixed synthetic calls in its trusted operator; it does not consume model code or an arbitrary input file. Invalid/extra arguments are refused before importing or invoking the native bindings. Help performs no native dispatch. The focused regression entry requires the existing build and an invocation-owned `TMPDIR` or `RUNNER_TEMP`; no system scratch fallback.

## Original context and exact handoff

Before the first PAN574 source change, four selected original code-free declaration members and their origins were frozen from base `02bfb49e1854d6dbf7be7cc5ea2e7812355d3943`. The raw original D0 manifest SHA-256 is `0816e0f2601149d88bb386522680653ad4f74ec65a9c17456b36add6723d48e3`. The raw original S manifest SHA-256 is `b9ea14b9526e7737a705e5cdb1259912e298398756edb1ac6e19c974a1fbd219`. Public byte-identical copies are under `contracts/pan574/original-context-v1/`. Neither manifest is regenerated from this improved contract.

`createPan471CompositionHandoff('D0'|'S')` returns exact original manifest bytes, raw hashes, member bytes, an explicit arm and a canonical packet digest. D0 has the same four original declaration members and `originalS: null`. S has that identical D0 plus eight selected relevant original sources whose raw bytes are checked against the original manifest. Those selected S sources are not an assertion of complete compiler dependency closure: D1 separately binds the executable transitive native closure. New adapter code, D1 examples, tests, reference solutions, target oracles and expected results are not added to original S or original D0. Dispatch identities are separate `D1_NOT_RETROACTIVE_D0` metadata, never relabelled original D0.

`verifyPan471CompositionHandoff(packet, expectedArm)` is the receiving-side seam. The receiving loop or external verifier independently chooses the arm, snapshots untrusted data and rederives every original byte and current native dispatch pin. Self-rehashed source leaks, renamed S, substituted descriptions, extra expected-value fields and caller-selected source identities are denied. This verifies context origin/separation; it is not an independent target business oracle or evidence of a model run. Downstream #575/#576 must retain original versus D1 exposure explicitly in their own execution receipts.

## Private/public and authority boundary

`createPan471CompositionSession()` is a trusted host constructor, not a remotely registered model tool. Its `controller.issue(capabilityId)` issues an opaque grant kept in that session's `WeakMap`; the model-facing `tools` object has only discovery and invoke. A discovered row, catalogue/profile name, serialized or copied grant, forged object, missing selector and another session's grant are not execution authority. Host authorization and a pinned permitted export must precede a tool call. Nothing here grants account, provider, procurement, production or new data-source rights.

Public packet content is limited to the original selected public declarations/source arm, exact identity/digest metadata and the two explicitly bounded native contracts. Controller objects, opaque grants, model credentials, usage/budget approval, private cases, connection solutions, native target oracles and expected outputs stay outside model context and public handoffs. Do not serialize them into a prompt or public receipt. This module is not a sandbox against someone already able to execute arbitrary code in the host JavaScript process. Downstream execution isolation, real permitted model access/usage consent, connection verification, fresh data and durable reuse remain separate #575–#578 and #571 obligations.

## Original criterion mapping

CONTRACT-AC01: the two native dispatches, descriptor/compiled/profile pins, closed input/output/error surfaces, exact units/identities, native readback and explicitly missing semantics.

CONTRACT-AC02: preimplementation original four-member D0 and eight-source S raw manifests, identical D0 in both arms, and D1-only improvements. No original byte is replaced to obtain success.

CONTRACT-AC03: the committed public source operator plus native positive examples and phantom export, stale/missing source digest, unsupported unit, invalid identity, unknown fields and unpermitted operation refusals. No fabricated parameter repair.

CONTRACT-AC04: session-owned grants rather than discovery authority; exact byte-rederived receiving handoff with explicit private/public boundaries and source/oracle leak denials.

Local regression or documentation is not exact-head canonical, required hosted CI, protected merge, release/readback or issue closure. Those delivery gates remain required before any terminal claim.
