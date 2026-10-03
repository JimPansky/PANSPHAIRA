# PAN396 — bounded socket-free S3/SQS invoice lab

This is the first proof owned by #396 under parent #394. It is an optional external test boundary, not PanSphaira runtime, an orchestrator or an Authority source. The original prerequisite gates and eight acceptance criteria are unchanged. Repository integration is a candidate, not issue closure or a release receipt.

## Exact inputs and operations

Floci 2.1.0 source: `560b3e4aae61cea3ac7d4d51843bdffd0e3085fd`.
OCI index: `sha256:f5aa8c18302cedb4f2385f5c4e455b3efc77fee6bf7b6e5d1712b2817ba102db`.
Linux/amd64 artifact: `floci/floci@sha256:2e2343974a15137a6bda6de5a9e0b16207f97a786cc57ee9c2bf25d14a67b84c`.
The runtime checks the actual local artifact, platform, source label and version before creating or starting the guest; a tag alone is insufficient. Registry acquisition is outside the internal-network execution window.

The pinned inventory explicitly disables 120 other services, including UI. Setting `SERVICES=s3,sqs` would not accomplish this in the inspected upstream source. Positive S3 operations are CreateBucket, PutBucketNotificationConfiguration, PutObject, GetObject, HeadObject, ListObjectsV2, DeleteObject, DeleteBucket and ListBuckets. Positive SQS operations are CreateQueue, GetQueueAttributes, GetQueueUrl, ReceiveMessage, DeleteMessage, PurgeQueue, DeleteQueue and ListQueues. The closed transport checks operations, methods, parameter shapes and exact namespace/bucket/queue/key before HTTP. EC2, DynamoDB, Lambda, STS and the two UI aliases are negative disablement probes only, not service-family activation.

The guest has no Docker socket or host-directory mount, real AWS/customer credentials or public port. The existing host Docker daemon remains trusted parent authority. One labeled internal network, one labeled data volume, read-only root filesystem, dropped capabilities and no-new-privileges are inspected. The declared `/app/data` volume is owned and removed even though storage mode is memory. This is not a complete hostile-host OS sandbox or a whole-session network-free claim.

## Actual data path and authority limits

The fixed public synthetic `high` invoice is put to the controlled object key. An independent GetObject supplies the exact bytes, rather than queue metadata being treated as invoice content. Ordinary ReceiveMessage returns the actual notification; it changes visibility and receipt state and is not passive inspection. The compiled `floci-invoice-lab-v1.ts` contract validates the closed event/envelope, scope, operation, identities, time, object size and digests. The issue-local broker reserves event/key synchronously before any provider await and consumes that one in-memory lease even on uncertainty.

The unchanged PAN360 intake persists and independently reads the versioned invoice. The unchanged authority-free ERV core evaluates its existing pinned case only after invoice/reference amount, supplier and currency binding. A local file contains resulting bounded evidence, which is separately read and compared. This does not grant productive booking/posting, human-form, human-identity, customer, cloud or generic-provider authority. Deduplication is one in-memory lease, not durable or global. Floci account routing and the public dummy SigV4 syntax are not authentication, signatures or AWS security.

## Original criteria and observations

The exact original eight texts and public-safe owner observations are retained in `verification/pan396-original-s3-sqs-evidence-v1.json`.

1. Actual image/platform/source identity is checked before guest creation/start.
2. Effective socket-free mounts, credentials, guest configuration and internal network are inspected.
3. All 17 declared positive operations execute; closed undeclared-operation/method/scope/header denials are also tested. Representative disabled AWS service requests return ServiceNotAvailableException. UI must be evaluated through lifecycle routing without an invented AWS `ui` credential scope.
4. Real Floci Put/event/object readback reaches the compiled adapter, original intake and original ERV core. The native provider is not substituted.
5. Producer observations precede derivation; ordinary queue response, object bytes and independently persisted result remain exactly bound. Raw synthetic receipts/state are retained locally, not published wholesale.
6. Ten native-context denials cover wrong bucket, wrong queue, foreign scope, stale event, substituted event metadata, duplicate event, key conflict, timeout, stale stored bytes and missing object readback. Controlled altered event copies are labeled as such, not native API outputs. Unit tests additionally cover concurrency, missing intake/result readback and late persistence/readback. No false second core application is inferred from a denial.
7. Object/message/bucket/queue purge is independently checked before exact labeled container/volume/network removal. Shared immutable input image and retained evidence are intentionally kept. Unrelated resources are never purged.
8. The named simplest fake uses an atomic Map/list boundary and the same typed broker, original core and negative matrix. Floci returned successful Put and independently readable object after its configured queue was absent; the named fake refused before object storage. This is a reproduced object-store/notification non-atomic partial-effect class, not proof that every fake misses it or that AWS behaves identically. The landed object is retained as evidence and cleaned, not silently rolled back or blindly rewritten.

The first development run measured 672 ms for native proof plus cleanup and 38 ms for the named fake, with a warm local image cache. Registry acquisition took 3.020083 seconds separately and was not a cold-hosted-CI benchmark. Implementation/maintenance surface is measured by paths, bytes and physical lines, not invented engineer-hours or money. The native-specific transport, inventory, lifecycle, UI routing, pull and cleanup require more maintenance than the named fake; the meaningful partial-effect differential is the observed benefit. The retained measurements identify their exact source snapshots rather than relabeling them as later candidate performance.

The initial UI delta preserved a NOT_PASS: adding a dummy unknown `ui` credential scope returned UnknownOperationException, which did not establish effective UI disablement. Correct lifecycle routing then returned HTTP 200 interstitial/status with `ready=false`, `url=null` and the exact disabled-console reason for both aliases. HTTP 200 is not activation; socket failure or an arbitrary 404 is not accepted as equivalent to disabled configuration. Original failed startup/deadline/UI-probe records remain retained.

## Reproduction, CI and maintenance

After compiling locked dependencies, run `npm run pan396:test` for local unit/registration checks. This is mandatory in the canonical npm test lifecycle and does not pretend to be native acceptance. For the separately admitted native probe, anonymously pull the exact platform artifact above, then run `node scripts/pan396-original-s3-sqs-proof-v1.mjs /absolute/fresh/owned/output`. A real Docker daemon with existing authorized rights is required; no daemon socket enters the guest. The output directory must be fresh and is local retained synthetic state, not a public attachment.

`.github/workflows/pan396-native-proof.yml` checks out the exact candidate, compiles locked source, pulls the platform digest anonymously, executes within the admission's 180-second native bound and uses a 10-minute whole-job bound. It retains only `public-summary.json`, never the raw output directory. The exact-invocation cleanup helper also runs on CI interruption. Acquire/compile/proof/cleanup and fake durations are separate surfaces; actual hosted workflow/job/step durations and artifacts must be consumed before concluding acceptable CI cost. A timeout budget is not itself measured acceptability.

The bounded verification owner depends on the existing PAN360 owner; core changes invalidate this proof without duplicating or retuning original core ownership. Source files are classified explicitly as source evidence, not added to the runnable-product payload. README and existing release classification are unchanged. Release packaging must preserve all existing hard gates and privacy checks.

## Promotion and delivery

No EventBridge, DynamoDB, sales-order, customer-case, STS or other follow-on is activated by this code or these observations. Reproducibility, independently accepted original criteria and meaningful differential at observed acceptable CI cost are necessary, not a generic service expansion grant. Independent original-eight review, exact-head CI, protected merge, a new correctly classified release and anonymous released-artifact consumer/readback remain separate mandatory gates. #396 remains open until those gates; #394 additionally needs its original own/child reconciliation. No AWS compatibility/security, production cloud, Lambda/RDS/container-service or general provider-adaptability claim follows.
