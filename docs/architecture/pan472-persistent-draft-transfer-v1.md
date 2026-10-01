# PAN472 — persistent synthetic draft transfer, v1

This additive product entry implements the bounded MIG-02 draft transfer in the existing Node 24 runtime. Its adapter uses real native SQLite files, not an in-memory provider or a second runtime. Only an explicitly initialized disposable `pan472-owned-v1` directory is eligible; existing directories, unrelated stores and symlinked roots are not adopted.

## Composed entry

`src/pan472/persistent-draft-transfer.mjs` exposes initialization, the bounded synthetic source writer, read-only plan capture, content-bound local synthetic owner approval and actual transfer execution. `scripts/run-pan472-draft-transfer.mjs` drives the same entry with `init-synthetic`, `snapshot`, `delta` and `reconcile`, each followed by an absolute owned root. Initialization creates only the published synthetic draft fixture.

The entry reuses the released canonical JSON serializer and PAN453's reserved journal ownership, stop/revoke controls, durable operation identity and bounded recovery conventions. It does not retarget PAN442's fixed `CREATE_IF_ABSENT` action as a migration action, widen maintenance-preview permissions, or change their accepted source bytes. The new local approval is specific to a native source/target identity, generation, mapping and complete plan digest; serialized or caller-rehashed grants are not execution authority. This is a local synthetic code-owner seam, not proof of a human identity, organization publisher authority or host isolation.

The released PAN471 read-only ownership/inventory remains unchanged. Its missing quantity, unit, price or business rule remains UNAVAILABLE and DENIED/NOT_COVERED remains retained. Importing independently present native draft fields does not infer those missing inventory facts or activate ERP creation permission.

## Original criteria

MIG-02-AC01: the native source retains a generation-bound, contiguous sequence of events and exact object revisions, including tombstones. A snapshot carries the complete bounded aggregate and a delta carries the exact subsequent events. Mapping identity is code-owned and versioned. Integer quantity micros and monetary minor units are copied exactly; no scaling, price inference or implicit status conversion occurs. Limits are 16 retained objects, 64 events and 32768 canonical material bytes. Missing semantic fields retain UNKNOWN/quarantine rather than being inferred or treated as deletion.

MIG-02-AC02: target objects, cursor, local approval, deduplication and receipt commit in one SQLite transaction. A rollback before dedup leaves target/dedup/receipt absent. A lost acknowledgement after commit is resolved by independently reading actual source and target files, without a second target mutation. Conflicting content or stale revisions/cutoffs are denied; a tombstone cannot be silently resurrected. A caught acknowledgement loss releases the local journal owner normally; an abruptly killed owner remains fenced, never removed automatically.

An empty delta is read-only NO_CHANGES only after independent verification of the existing target. It has no executable plan, cannot receive a mutating approval, and creates no intent, approval, deduplication or receipt. An already quarantined target is not turned into a successful no-op. The original strict independent receipt rule (`fromSequence < throughSequence`) is unchanged.

MIG-02-AC03: `src/pan472/independent-draft-reconciliation.mjs` opens separate read-only native source and target connections, reconstructs the source cutoff directly from history and compares actual object/reference/revision/tombstone/quantity/price/status fields. It also independently derives receipt/plan identities and checks the approval/dedup/receipt sets. Writer/provider results and self-rehashed receipt claims are not readback evidence. Missing objects, broken references and scaling/status mutations remain quarantined; unknown source coverage stays UNKNOWN. Verification is explicitly at the retained cutoff and reports whether the source is ahead; there is no global cross-store transaction claim.

MIG-02-AC04: the same native entry can be restarted in a fresh process and reauthorized against the persisted source/plan/target identities. Actual receipts and deduplication remain in the target. The adapter has no booking, email, payment or network dispatch. Its outside-effect table must remain empty; any observed effect prevents verification. Synthetic rollback/ack-loss diagnostics are confined to this profile and are not production recovery permissions.

## Boundaries and delivery

Local, disposable synthetic stores only. No customer data, credentials, productive cutover, zero-downtime promise, multi-host lock, OS sandbox, power-loss acceptance or unknown external-effect replay. SQLite sequence evidence does not qualify another database's log semantics. Same-user filesystem/code adversaries are outside the code-owner contract. Abrupt crash fencing and unresolved state are retained, not forcibly bypassed. Real-environment and human-only holds remain separate.

Named entry tests and native CLI qualification are development evidence until bound to an immutable candidate. Completion additionally requires focused independent acceptance, exact CI, protected SHA-bound merge, a new accurately classified release and public artifact readback. The original issue remains open until those gates and all four original criteria are fulfilled.
