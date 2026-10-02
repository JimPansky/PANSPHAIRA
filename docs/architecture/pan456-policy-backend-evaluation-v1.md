# PAN456 — one pinned policy backend: executable reject-adoption evaluation

Status: LOCAL_SYNTHETIC_TOOLING_IMPLEMENTED_NOT_YET_RELEASE_ACCEPTED.
Original owner: PAN-EVO-05 AC01–AC05, parent #451. This is an executable
comparison and rejection recommendation, not a production policy-engine
implementation, new runtime or automatic backend activation.

## Concrete maintenance observation and decision (AC01)

The existing closed policy vocabulary (`validateAdminAiPocPolicy` expected
request-kind/outcome/reason table), internal-static capability-to-rule map and
`AdminAiPoc.intentFor` capability/adapter mapping require coordinated maintenance.
The latter's independent adapter ceiling and gate-only authority issuance are
intentional security responsibilities, not removable duplicate enforcement.
All three remain necessary after the experiment. No currently useful removable
maintenance duplication is demonstrated. The original criterion explicitly
allows a no-need/no-adoption outcome.

Exactly one candidate is evaluated: json-logic-js 2.0.5. The tool's verdict is
REJECT_ADOPTION_RETAIN_INTERNAL_STATIC. The generic expression interpreter can
produce the three correct decisions, but leaves the original manifest, intent
mapping, trusted-context binding and independent ceilings in place while adding
an expression, dependency/byte pin and process protocol. Do not activate it.
The unchanged internal-static 1.0.0 provider remains the server default.

## Identity and interface (AC02)

The candidate is MIT, with zero declared runtime dependencies, installed as one
exact devDependency. Its registry integrity and installed package.json,
logic.js and LICENSE byte digests are pinned in
`src/pan456/policy-backend-profile.mjs`; package identity/license/dependency
shape and all three bytes must match before evaluating. License text and
copyright remain in the dependency. No third-party source is relabeled as ours.

The existing PolicyEvaluatorV1 input/context/decision contract is reused.
A fixed owner-program selects one of the three validated policy rows. Caller
expressions, operators, credentials, signing callbacks and effect handles are
not accepted. Trusted policy bytes/context stay independently bound; decision
input/context/content digests are validated using the released canonical
primitive. The candidate's AUTO_GRANT label is only a proposed decision.
Only the existing parent gate can issue authority, and its order/unknown
ceilings stay effective. No real authority or external effect is exercised.

The test adapter starts a separate Node process with only PATH inherited, no
NODE_OPTIONS or credential canary. It receives bounded JSON, uses the fixed
program, rechecks installed identity and validates its output. This is process
separation, NOT an OS sandbox or same-UID/hostile-code confinement claim. The
controller, repository, dependency installation and Node executable are trusted
local tooling. No arbitrary plugin, network backend or caller SQL/shell exists.

## Actual entry observations (AC03)

`npm run pan456:test` invokes the candidate in actual child processes and the
existing AdminAiPoc entry; no mock replaces JSON Logic. Independent expected
outcomes are AUTO_GRANT for the synthetic contact, OWNER_ESCALATION for the
synthetic order, and DENY for the undeclared request, with retained static-provider
contract parity. Only a parent-owned synthetic signature canary is called for
the permitted contact. Order, undeclared and caller-authority requests cannot
call it. Actual child rejection propagates without a fallback grant.

Named negatives exercise wrong tenant, extra authority/credentials, forged
trusted context, caller program including unsafe operators/prototype paths,
bounded iterations and malformed worker envelopes. Actual adapter entries in
owned installation copies additionally reject malformed backend decisions,
a synthetic declared-version change (2.0.6 in copied metadata, NOT execution
of a published upgrade), and same-version altered library bytes. The unchanged
copied-installation entry is a positive counterpart. Only public module bytes
and the three candidate identity artifacts are copied, never actual retained
state or credentials; the real installation stays unchanged. A caller-supplied
expected hash cannot repin installation identity.
Mutable caller policy does not mutate the candidate's retained snapshot.

The retained development baseline RED shows the existing actual evaluator
returns its correct decision, not the missing backend comparison/cost/disposition
record. It is not a retroactive predecessor-defect claim.

## Measured operation, correction and maintenance (AC04)

`npm run pan456:entry` prints an actual fresh comparison record. The CLI runs
under owner-supplied TMPDIR, or GitHub's RUNNER_TEMP through the registered
POSIX npm wrappers; absence of both denies setup. No system-temp fallback,
repository/private state copy or global environment configuration is introduced.
The backend/parent/CLI/test/fixture bytes remain those qualified by Main; this
wrapper only supplies the declared owned scratch root on hosted CI.

The CLI observes
three baseline/candidate cases, eight exact-code denials, and 300 contract
iterations per outcome. Both warm paths validate input/context, select a row and
bind input/context/decision digests per iteration. Candidate byte admission and
process startup are outside its warm compute but included in the separately
measured process round trip. Parent/child PID, Node/platform/architecture,
setup identity-check nanoseconds, named correction-probe nanoseconds, warm
contract totals and cold round trips are recorded. Timing is an observation,
not a universal speed or statistical benchmark claim.

The initial actual CLI run measured the installed candidate's three identity
artifacts as 16739 bytes. Warm contract and process-round-trip timings differed
by outcome; no uniform performance advantage is inferred. The record counts and
hashes actual added tooling code. It explicitly states that no existing
production files changed and zero runtime dependencies were added (one dev
candidate dependency was added). Human correction minutes and future operating
costs are not invented. Correction implications are the observed named pin,
context and program denials; maintenance implications are the extra identity,
expression and process surfaces while all original enforced responsibilities
remain.

Migration/fallback: do not migrate runtime now. Retain internal-static 1.0.0;
a failed candidate is a denial/error, never a fallback grant. Any future adoption
needs a separately admitted exact version/program/context migration, scoped
behavioral evidence and independent acceptance. Rejected evaluation is not
implemented production policy capability or deployment permission.

## Task-bound Canon applicability recorded for qualification

CM-CAN-01: library decision data is not authority; the existing parent-only
synthetic signer/adapter ceiling remains. CM-CAN-03 and 15: the dev installation,
local comparison and rejection do not activate runtime rights. CM-CAN-08 and
22: decision/authority/effect duties stay separate; no effect executor is
introduced or bypassed. CM-CAN-09: JSON data contains no real credentials;
the actual child drops inherited credential canary/Node options. CM-CAN-16:
claims bind this exact version/program/source/configuration and observed Node
environment, not a future installation. CM-CAN-17: pin drift is denied and any
future migration needs separate admission/fallback evidence. CM-CAN-26: bounded
child timeout and unavailable/malformed/pin-invalid backend fail closed, never
via a direct grant. No durable business operation is introduced, so no native
state/recovery mechanism is newly qualified.

Additional actual crossing is owner-controlled public source/dependency reads,
owned synthetic scratch writes and trusted Node process creation. These are
local maintainer test resources, not an agent/untrusted workload admitted under
CM-CAN-18/19/20/24/25. In particular process separation proves no OS/host
confinement. No brokered model request/response is added (CM-CAN-23 trigger
absent); raw scratch is not a public evidence surface (CM-CAN-27 remains a
data-minimisation boundary). The earlier registry/install discovery used
network access; this session is not described as network-free. Other Canon
laws are unassessed for this task, not silently not-applicable.

## Delivery boundary (AC05)

The new source/test/entry/guide family has one bounded DAG owner and a mandatory
canonical test command. Exact-source independent focused acceptance, full
canonical CI, protected integration, a meaningful classified functional tooling
source release and required anonymous/provider readbacks remain separate delivery
gates. Issue stays OPEN until those pass. Existing evidence, signature/admission,
Canon/privacy boundaries, README approvals, sealed custody and paused projects
are unchanged. No private keys/grants/raw state are published.
