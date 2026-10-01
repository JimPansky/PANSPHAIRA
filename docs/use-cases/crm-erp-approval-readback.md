---
title: CRM-to-ERP approval, execution, and readback
description: Follow PanSphaira's released local synthetic order path from a CRM proposal through bound approval to ERP readback and a receipt.
---

# CRM-to-ERP approval, execution, and readback

A request to create an ERP order from CRM context crosses both an authority
boundary and a system boundary. PanSphaira's released demo makes those
crossings visible with fictional EspoCRM and Dolibarr records on loopback.

## The released local flow

1. The Agent proposes a typed order effect; it does not call the ERP directly.
2. The Gateway and Policy decide whether the exact proposal is denied,
   permitted, or requires Owner approval.
3. The approval view binds the requester, purpose, readable business diff,
   Policy, impacts, rollback statement, and authoritative pre-effect snapshot.
4. Approval issues a short-lived, one-use lease for that exact effect. Reject,
   stale context, tampering, expiry, and replay issue no usable authority.
5. The Broker executes the admitted effect against the fictional ERP fixture.
6. Authoritative provider readback must match the intended result before a
   digest-bound receipt records verified success. Transport acceptance alone
   is not success.

The scoped claim and its negative evidence are `CM-SEC-007` in
[Security Assurance](../SECURITY-ASSURANCE.md#locally-validated-synthetic-evidence). The
[SAFE_GUIDED proof](../SECURE-DEFAULT-PROOF.md) checks the declared authority
path, while the [architecture](../ARCHITECTURE.md) identifies the trusted
boundaries.

## When this example fits

Use it to inspect a deterministic reference for proposed business effects,
human approval integrity, single-use execution authority, provider readback,
and evidence-bound receipts before designing a live integration.

It does not fit a read-only synchronization job, a fully predetermined
workflow with no Agent proposal, or an evaluation that needs real CRM/ERP
compatibility evidence. The [alternatives guide](../alternatives.md) separates
those problem classes.

## Evidence boundary

This is one pinned Linux/Docker fixture with fictional records and local
identities. It does not prove live EspoCRM or Dolibarr compatibility,
production IAM/MFA/quorum, provider transactions or ETags, provider Revoke,
production Rollback, hostile-host containment, or permission to use customer
data. Review the [known limitations](../KNOWN-LIMITATIONS.md) before running it.

## Reproduce it

Follow the [Quickstart](../QUICKSTART.md) for prerequisites, installation,
expected `READY_VERIFIED` result, and ownership-scoped cleanup. The
[examples gallery](../examples.md) also lists the smaller deterministic proof
commands.
