# PAN-EVO-03: task-journey mediation evidence

Status: executable local synthetic evidence consumer; delivery gates remain separate.
Acceptance class: EVIDENCE_ONLY. A negative decision is not an implemented isolation capability.

## Named journey and adapter

The normal entry is the existing `useBoundTaskHandle` business Order journey
from `src/pan442/bound-task-handle.mjs`, including the later owned PAN453 journal,
current static Policy, ApprovalWorkbench, signed single-use owner lease,
DemoMutationGate, authoritative synthetic snapshot and independently persisted
synthetic target readback. None of these foundations is replaced or retuned.

The fixture reuses the Docker Reference Adapter's existing NETWORK_NONE,
readonly root, UID1000, dropped-capability and no-new-privileges invocation
controls from `packages/contracts/src/extension-dynamic-synthetic.ts`. Its
UID-owned ephemeral scratch uses the existing one-MiB tmpfs profile from
`demo/openclaw-agent/compose.yaml`. This is a journey-specific invocation and
consumer, not a new sandbox implementation or a live OpenClaw qualification.
The immutable image reference is:

    node@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03

The tested platform is Linux/amd64. The consumer binds the OCI reference,
actual daemon-local image identity, guest Node/ABI/kernel/UID, observed container
configuration, capability and no-new-privileges kernel fields, cgroup observations,
source hashes and execution window. A daemon-local image ID can differ between
classic and containerd image stores; it is not substituted for the pinned OCI
reference. No floating-tag fallback is permitted.

Only a readonly staged public import closure is mounted. No repository root,
private source, host credential, writable host directory, device or Docker socket
is mounted into the workload. The parent Docker daemon remains trusted host
authority, not a sandboxed API. The fixed guest program performs no live model,
provider, customer or business-system call.

The existing BTH source is deliberately repository-only source evidence,
not part of the runnable product-increment allowlist. This new consumer and its
regressions retain that SOURCE_EVIDENCE_ONLY classification. They run from the
complete public Git source archive/checkout, not from the separately limited
product payload. No existing release or file is relabelled.

## Finite crossing inventory, before execution

Tool/effect: opaque task handle through the unchanged current owned Order entry,
Policy/Approval/gate and synthetic provider. A permitted task must record one
synthetic effect and independent target readback, with the approved receipt
correlation. The current journey reads its approval snapshot at registration,
owner decision and use time.

Read: authoritative synthetic approval snapshot and persisted synthetic target.
There is no real customer read or external provider response in this fixture.

Network: the runtime has the existing NETWORK_NONE profile. The actual probe
attempts an off-box RFC5737 documentation-address route and requires ENETUNREACH,
not a timeout or arbitrary exception. A permitted guest-loopback canary is also
executed. NETWORK_NONE does not imply all loopback traffic is mediated.

Process: the fixed Node program deliberately spawns one finite same-UID canary
child. Execution and its reads are observed; an intra-container process boundary
is not presumed from the external container boundary.

Filesystem/state: writes to readonly public source require EROFS. Ephemeral
scratch writes have a permitted counterpart, and a bounded over-capacity canary
requires ENOSPC against the observed one-MiB tmpfs ceiling. The canary file is
removed. This is not a durable managed-Mind or tenant-store quota capability.

Credential/tenant: only synthetic trusted issuer/gate state and non-authority
canary values exist. A caller-injected opaque credential reference is rejected
by the current closed task-input boundary. A same-UID child deliberately attempts
to read a non-authority credential canary, foreign-tenant state canary and current
owned synthetic journal. This tests a proposed broader separation claim; it does
not suggest these objects are safe real custodians or stores.

Model requests/responses, real provider credential use/custodian endpoints,
skill activation, devices, host/control sockets, remote Mind and live gateway
mesh have no trigger in this journey. They remain absent and unqualified, not
universally not-applicable. Resource maxima are read back; CPU/memory/PID
exhaustion and availability under pressure are not proven by their configuration.

## Executable expected results and bounded decision

The current task boundary must reject wrong tenant, wrong principal, extra
credential reference, caller authority and undeclared tool operation at their
exact BTH stages, without protected snapshot, effect or readback calls. The same
unconsumed handle then executes its permitted counterpart. A direct call to the
owned gate after the composed journal owner releases must reject at
JOURNAL_OWNER_REQUIRED_DENIED without another protected call.

The same-UID credential/state/journal reads, child execution and loopback route
are deliberately expected to succeed inside this shared trust domain. They
falsify complete intra-container mediation/credential/tenant separation. They
do not falsify the narrower current typed task refusals or the measured outer
network/readonly-file/storage controls. No claim is made that an existing normal
remote agent already has a privileged JavaScript object or a real credential.

The decision is:

    BOUNDED_FALSIFICATION_OF_COMPLETE_INTRA_CONTAINER_MEDIATION
    retained scope: LOCAL_SYNTHETIC_NETWORK_FREE
    implemented isolation capability: false

The existing delivery owner retains corrections: do not co-locate real
custodians, foreign-tenant stores or privileged brokers in agent-readable scratch;
retain the finite synthetic scope and explicit nonclaims. Reusing the existing
UID-owned guest tmpfs prevents a different CI host UID from prompting broader
host-directory permissions. A stronger separated production trust domain is not
implemented or authorized by this result.

## Reproduce

Prepare the exact public image outside the network-free execution window:

    docker pull --platform linux/amd64 node@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03

Use an owned scratch directory outside the checkout. TMPDIR is required locally;
the registered npm wrapper accepts an existing RUNNER_TEMP on hosted CI.

    npm run pan454:test
    npm run pan454:entry

The entry accepts no caller options, model content, credential, substitute source,
image or grant. It prints sanitized counts, named denial causes, boolean canary
observations, public-source digests, runtime/environment identity and receipt
correlations only. It does not publish keys, grants, retained state or raw journal.
Every owned container is removed and absence read back before a successful report;
the private staged public-source copy is also removed. Cleanup never targets a
foreign container or another task's retained state.

Image acquisition/registry inspection and repository dependency operations are
not part of the network-free guest window. Do not call the entire session or
preparation pipeline network-free.

## Original acceptance criteria and delivery separation

- PAN-EVO-03-AC01: actual crossing inventory and explicit absent/unqualified triggers.
- PAN-EVO-03-AC02: real normal-entry permitted tasks and targeted synthetic attempts.
- PAN-EVO-03-AC03: exact source/runtime/adapter/environment bindings and actual OS observations.
- PAN-EVO-03-AC04: bounded negative decision, owned corrections and retained network-free synthetic scope.
- PAN-EVO-03-AC05: one independent focused review, registered tests/canonical CI,
  current-Main integration, protected exact-head merge, correctly classified
  functional evidence-tooling source release and required public readback remain
  separate completion obligations. Local execution or a negative decision alone
  does not close the issue.

The applicable starting Canon map is CM-CAN-09/18/19/20/22/23/24/27/28. The report
records the exact observed/falsified/unqualified property per law; it is not a
blanket Canon, production, privacy or maturity approval. No live model/provider,
unknown side-channel, compromised kernel/daemon/host, managed Mind, universal
multi-tenancy or automatic activation claim follows.
