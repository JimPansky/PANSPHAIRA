// Finite evidence tooling, not a new sandbox or a production isolation adapter.
export const JOURNEY_SCHEMA = 'pansphaira.pan454/journey-mediation-evidence/v1';
export const IMAGE_ID = 'sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03';
export const ADAPTER = Object.freeze({id:'docker-reference-network-none-synthetic',version:'pan454-invocation-v1',profileSource:'packages/contracts/src/extension-dynamic-synthetic.ts#buildExtensionDynamicDockerArgsV1',scratchProfileSource:'demo/openclaw-agent/compose.yaml#openclaw-agent.tmpfs',taskEntry:'src/pan442/bound-task-handle.mjs#useBoundTaskHandle',taskSchema:'pansphaira.contract/bound-task-handle/v1'});
export const BASE_FILES = Object.freeze([
 'src/pan442/bound-task-handle.mjs','src/pan442/synthetic-metric-read-task.mjs',
 'demo/runtime/admin-ai-poc.mjs','demo/runtime/admin-ai-policy.mjs','demo/runtime/policy-evaluator.mjs',
 'demo/runtime/approval-workbench.mjs','demo/runtime/authoritative-approval-snapshot.mjs',
 'demo/runtime/enforcement-gate.mjs','demo/runtime/local-journal-owner.mjs',
 'demo/manifests/authority/admin-ai-poc-policy-v1.json',
]);
export const QUALIFIER_FILES = Object.freeze(['src/pan454/journey-profile.mjs','src/pan454/journey-canary.mjs','scripts/run-pan454-journey-evidence.mjs']);
export const CROSSINGS = Object.freeze([
 {surface:'tool/effect',trigger:'PRESENT',path:'opaque task handle -> current owned Order entry -> Policy -> ApprovalWorkbench -> signed single-use lease -> DemoMutationGate -> synthetic provider',ceiling:'FIXED_SYNTHETIC_ORDER_ONLY'},
 {surface:'read',trigger:'PRESENT',path:'authoritative synthetic snapshot and independently persisted synthetic target readback',ceiling:'NO_CUSTOMER_OR_LIVE_PROVIDER_READ'},
 {surface:'network',trigger:'PRESENT_CANARY_ONLY',path:'NETWORK_NONE profile; off-box documentation address and guest-loopback canaries',ceiling:'NO_LIVE_MODEL_PROVIDER_DNS_OR_GATEWAY_MESH_TRIGGER'},
 {surface:'process',trigger:'PRESENT',path:'fixed Node program and one same-UID canary child',ceiling:'INTRA_CONTAINER_PROCESS_MEDIATION_NOT_PRESUMED'},
 {surface:'filesystem',trigger:'PRESENT',path:'readonly staged public source closure and 1MiB UID-owned guest tmpfs scratch/journal',ceiling:'NO_PRIVATE_OR_REPOSITORY_HOST_MOUNT; EPHEMERAL_TMPFS_NOT_MANAGED_DURABLE_STATE'},
 {surface:'credential',trigger:'PRESENT_SYNTHETIC_ONLY',path:'synthetic trusted issuer/gate state; fake opaque reference request and non-authority canary file',ceiling:'REAL_CUSTODIAN_AND_PROVIDER_CREDENTIAL_USE_TRIGGER_ABSENT'},
 {surface:'model/skill/device/managed Mind',trigger:'ABSENT',path:'no model invocation, skill activation, device/socket mount or remote durable Mind in this journey',ceiling:'UNQUALIFIED_NOT_UNIVERSALLY_NOT_APPLICABLE'},
]);
for(const crossing of CROSSINGS) Object.freeze(crossing);
export const CORRECTIONS = Object.freeze([
 {id:'SAME_UID_SCRATCH_AND_PROCESS',owner:'existing PanSphaira delivery owner',disposition:'Retain NETWORK_NONE synthetic evidence scope. Do not place a real custodian, foreign-tenant store or privileged broker in agent-readable scratch. Separate trust domains would require a separately authorized correction and new exact evidence; not implemented here.'},
 {id:'LOOPBACK_AND_MANAGED_STATE',owner:'existing PanSphaira delivery owner',disposition:'Do not claim complete network/process/state mediation. Reuse the existing UID-owned guest tmpfs profile rather than broaden host scratch permissions for another host UID; the finite storage ceiling is probed, not a production managed-state capability.'},
]);
for(const correction of CORRECTIONS) Object.freeze(correction);
export const NONCLAIMS = Object.freeze(['NO_NEW_SANDBOX_OR_GATEWAY','NO_IMPLEMENTED_PRODUCTION_ISOLATION_CAPABILITY','NO_LIVE_OPENCLAW_OR_MODEL_QUALIFICATION','NO_REAL_PROVIDER_CREDENTIAL_OR_CUSTOMER_DATA','NO_HOST_OR_DOCKER_DAEMON_CONFINEMENT','NO_KERNEL_OR_SIDECHANNEL_RESISTANCE','NO_CPU_MEMORY_PID_EXHAUSTION_OR_MANAGED_STATE_QUOTA_PROOF','NO_MANAGED_MIND_MULTI_TENANCY','NO_AUTOMATIC_RUNTIME_ACTIVATION','NO_PUBLICATION_OR_ISSUE_CLOSURE_AUTHORITY']);
export function conformanceDecision(observed) {
 if(observed?.syntheticOnly!==true||observed?.offBox?.code!=='ENETUNREACH'||observed?.readOnlySource?.code!=='EROFS'||observed?.sameUid?.processExecuted!==true||observed?.sameUid?.credentialCanaryReadable!==true||observed?.sameUid?.foreignTenantCanaryReadable!==true||observed?.loopbackCanary!==true||observed?.scratchQuota?.code!=='ENOSPC') throw Error('PAN454_INDEPENDENT_EXPECTED_BOUNDARIES_NOT_OBSERVED');
 return Object.freeze({classification:'EVIDENCE_ONLY',decision:'BOUNDED_FALSIFICATION_OF_COMPLETE_INTRA_CONTAINER_MEDIATION',retainedScope:'LOCAL_SYNTHETIC_NETWORK_FREE',implementedIsolationCapability:false,ownedCorrections:CORRECTIONS});
}
