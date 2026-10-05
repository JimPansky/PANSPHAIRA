# PAN529 bounded native template and resource budget

This opt-in source adapter uses the existing shared RuntimeIdentity validator,
CCP integer counters and ModelAccessBrokerV1. It does not change the legacy
installer, existing identity enums or effective rights. An owner's delivered
local-demo identity is a binding input, not a new runtime or image qualification.
Only the existing PanSphaira local-demo component is admitted by this controller.

The runtime image packages the native store at
`/opt/chimpmaera/demo/runtime/atomic-resource-budget.mjs`, preserving its
`../../dist/packages/contracts/src` imports. The existing runtime TypeScript
configuration compiles the shared contracts and the image copies that `dist`
closure. The public payload explicitly includes the store source so its image
can also build from the isolated release bundle. Packaging alone does not
activate a controller, expose the owner signer or grant new runtime rights.
Controller/template entry points remain opt-in source-evidence paths.

## Owner and client boundary

`createNativeBudgetControllerV1` accepts a closed owner configuration: explicit
opt-in, an absolute private state root, the existing identity, integer limits and
an owner-bound synthetic provider function. The constructor is not an agent API.
Its separate client contains a frozen manifest, plan, invoke and readback only.
The owner alone receives activation and close. The native store and completion
signer never appear in the client API or model output routes.

Planning selects the exact server template, reports the unchanged rights and
source template, policy and network digests, and explains the bounded resource
class. It changes no persistent selection, budget reservation or provider state.
Pending plans are bounded by that class. Owner selection requires a plan produced
by this controller and its exact digest; the selection has no new execution
rights. Unknown fields, components, rights, commands, URLs, SQL, policy changes,
stale bindings and accessor objects are denied before reservation or effects.

## Native persistence and actual dispatch

The owner-private SQLite database uses immediate transactions, a stable binding,
closed safe integer inputs and the existing CCP budget receipts. Concurrent cold
first-open initialization retries only SQLite BUSY/LOCKED startup contention,
under one code-owned monotonic 15-second deadline with short native waits. Schema
creation and owner binding are idempotent; no reservation or provider effect is
retried by this initializer. Other failures are propagated and the connection is
closed. Actual100 cold connections are not replaced by a preinitialized fixture. Reservation,
replay conflict checks and the durable UNKNOWN_USAGE fence precede dispatch.
Only the owner-bound synthetic route may provide observations to the existing
broker. A guarded completion atomically persists the exact observed result and
consumption, authenticated against its canonical digest. Client text and model
answers do not authorize settlement. A known broker predispatch throttle proves
zero model use only when the owner wrapper witnessed no provider callback.

The native class reserves up to 64 model units and one runtime unit per model
call; guarded input and output tokens each have a ceiling of 32. Runtime selection
uses one separate runtime unit. The shared request guard requires a positive
symbolic cost ceiling; this adapter requires actual synthetic cost zero. No paid
provider, credential lookup, business pricing or free provider URL is implemented.

A completed exact-key retry returns the persisted exact result without new
reservation or dispatch, including after reopen. An interrupted or quarantined
call retains its full hold. Process restart alone cannot release it; a model
answer or forged completion cannot do so either. No external-provider recovery
or productive authority is inferred from the privileged native store API.

## Original technical acceptance

The authoritative closed entry is `npm run build --silent && npm run pan529:test`
on the supported Linux x86_64 native profile. The launcher rejects filtering and
skip arguments and includes the compiled shared contract tests.

Actual development execution includes:

- Side-effect-free readable plan, owner-only selection, guarded broker completion
  and exact persisted replay; changed retry and policy inputs preserve SQL rows.
- 100 separate native SQLite reservation connections released at a ready barrier:
  20 accepted and 80 denied, with persisted model 40 and runtime 20 units.
- 100 equal-key shared broker attempts with one actual synthetic provider call.
- 100 separate native controllers at a barrier: 10 accepted, 90 denied and 10
  actual loopback HTTP synthetic dispatches. SQL holds 640 model units before
  completion, then records 20 model and 10 call-runtime units, plus one selection.
- An actual HTTP child killed by SIGKILL; reopening retains 64 unknown model units
  with no additional dispatch, and denies a forged model-answer completion.
- Exact result/settlement persistence, swapped result denial, and nested input or
  provider accessors rejected without execution.

These are distinct executions and denominators, not overlapping totals summed
into one claim. Test fixtures reuse the delivered identity only as an explicit
owner binding. Hosted CI, protected merge, release and anonymous archive execution
remain separate delivery evidence.

## Immutable shared development candidate

`contracts/runtime-budget/candidates/runtime-budget-development-v1.json` remains
byte-for-byte unchanged. It describes its exact historical development commit,
source tree and native-store-only limits, not this later integrated source.
The existing KS295 owner retains its own integration and ledger identity. Neither
H05 issue becoming CLOSED is a capability prerequisite for the other product.
