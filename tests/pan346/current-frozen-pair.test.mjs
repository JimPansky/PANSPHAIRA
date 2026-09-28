// PAR-XR-01 — frozen current release pair (PAN 4330cd26 x KS 72d9a4af, release
// 2026_09_28_v1). Additive to the retained historical current pair
// (current-pair.test.mjs, 994ac801). The frozen pair's producer is re-derived
// from a real head-bound KS service capture at 72d9a4af; its consumer is the
// independently regenerated KS support manifest built from the 72d9a4af
// checkout. Both are source-only content qualifications, not a CI/release or
// execution receipt. Failing-before / passing-after: before the frozen profile
// existed, these exact-head candidates could not be qualified at all.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { generateFrozenCurrentProducerAnalyticsManifestV1 } from "../../dist/src/analytics/producer-analytics-manifest.js";
import { validateFrozenCurrentAnalyticsPairV1 } from "../../dist/src/analytics/paired-analytics-parity.js";
import { adjudicateNativeFrozenCurrentCandidateV1, adjudicateNativeCandidateV1,
  createNativeAdjudicationContextV1, nativeTransportBytesV1, RECONCILED_RELEASED_HEADS_V1,
  CURRENT_KS_PROFILES_V1 } from "../../dist/src/cks-12/kaleidosphere-candidate-quarantine.js";
const root = resolve(import.meta.dirname, "../..");
const read = p => JSON.parse(readFileSync(resolve(root, p)));
const rawArtifactBytes = readFileSync(resolve(root, "tests/fixtures/cks-analytics/projection-v1.json"));
const response = read("tests/fixtures/pan346/ks-native-response-72d9a4af.json");
const consumer = read("tests/fixtures/pan346/consumer-support-72d9a4af.json");
const candidate = response.capture.candidate;
const generate = value => generateFrozenCurrentProducerAnalyticsManifestV1({ rawArtifactBytes, candidate: value }).manifest;
const producer = generate(candidate);
const pair = (change = {}) => validateFrozenCurrentAnalyticsPairV1({ rawArtifactBytes, candidate, producerManifest: producer, consumerManifest: consumer, ...change });

test("frozen current pair profile is pinned to the exact 72d9a4af head and 2026_09_28_v1 release pair", () => {
  assert.deepEqual(CURRENT_KS_PROFILES_V1["current-frozen-72d9a4af"], {
    commitOid: "72d9a4af87fbbc5b23cb52835cd2f85415b8ddc7",
    treeOid: "3ef9faab703c8a44b39b2d32f11d6abd641ee35f",
    environmentSha256: "dbdf8bef805d77bc3158409184042b44e6dcd0abe6645efab8f7b82d7630d002",
  });
  assert.ok(Object.keys(CURRENT_KS_PROFILES_V1).includes("current-994ac801"), "historical current pair is retained");
});

test("source-only frozen KS capture and separately built consumer content qualify, not runtime/CI/release (AC01)", () => {
  assert.equal(response.httpStatus, 200);
  assert.deepEqual(response.heads.kaleidosphereHead, candidate.bindings.kaleidosphereHead);
  assert.deepEqual(consumer.bindings.kaleidosphereHead, candidate.bindings.kaleidosphereHead);
  assert.equal(candidate.bindings.kaleidosphereHead.commitOid, "72d9a4af87fbbc5b23cb52835cd2f85415b8ddc7");
  assert.equal(producer.adjudication.outcome, "ACCEPTED_BOUNDED");
  assert.equal(producer.adjudication.qualifiedHeads.kaleidoSphere, "72d9a4af87fbbc5b23cb52835cd2f85415b8ddc7");
  assert.deepEqual(pair(), { outcome: "PASS", reasonCodes: [], runtimeExecutionAttested: false, publicCiAttested: false, releaseAttested: false });
});

test("frozen candidate is not admitted by the historical admissibility path (AC03, no retroactive acceptance)", () => {
  const result = adjudicateNativeCandidateV1({ rawArtifactBytes, canonicalTransportBytes: nativeTransportBytesV1(rawArtifactBytes), candidate,
    context: createNativeAdjudicationContextV1({ contextId: "pansphaira:par-ps-01-producer-manifest-context-001" }), releasedHeads: RECONCILED_RELEASED_HEADS_V1 });
  assert.equal(result.outcome, "DENIED");
  assert.ok(result.reasonCodes.includes("NATIVE_STALE_HEAD_DENIED"));
});

test("stale, substituted and incomplete frozen producer content fail closed (AC03)", () => {
  // A candidate bound to the historical 994ac801 head submitted to the frozen profile is stale.
  const stale = structuredClone(candidate);
  stale.bindings.kaleidosphereHead = { commitOid: "994ac80113af284ffe9fde93bb11f2341aaace91", treeOid: "b3b033b02a3e35d1d30646856409011ce625def6" };
  assert.throws(() => generate(stale), /ADJUDICATION_DENIED/);
  assert.equal(pair({ candidate: stale }).outcome, "DENIED");
  // An unknown head.
  const unknown = structuredClone(candidate);
  unknown.bindings.kaleidosphereHead.commitOid = "545a3b44ea88c96eded060c11c7c3a2afe0edff6";
  assert.throws(() => generate(unknown), /ADJUDICATION_DENIED/);
  // A substituted producer manifest (recomputed caller digest cannot substitute).
  const substitute = structuredClone(producer);
  substitute.serviceHead.commitOid = "a".repeat(40);
  assert.ok(pair({ producerManifest: substitute }).reasonCodes.includes("FROZEN_PRODUCER_SUBSTITUTION_DENIED"));
  // Incomplete raw artifact.
  assert.equal(pair({ rawArtifactBytes: Buffer.from("{}") }).outcome, "DENIED");
});

test("rehashed consumer change, dropped promise, changed channel and unknown head deny (AC02 + AC03)", () => {
  const clone = structuredClone(consumer);
  clone.support.supported.shift();
  assert.ok(pair({ consumerManifest: clone }).reasonCodes.includes("FROZEN_PROMISED_SCOPE_DENIED"));
  const channel = structuredClone(consumer);
  channel.channels.analysis.version = "unsupported-v1";
  assert.ok(pair({ consumerManifest: channel }).reasonCodes.includes("FROZEN_PROMISED_CHANNEL_DENIED"));
  const head = structuredClone(consumer);
  head.bindings.kaleidosphereHead.commitOid = "c".repeat(40);
  assert.ok(pair({ consumerManifest: head }).reasonCodes.includes("FROZEN_PAIR_HEAD_MISMATCH_DENIED"));
  // Rehashing the submitted consumer content does not replace the independent whole-content pin.
  const body = structuredClone(clone);
  delete body.integrity;
  const canonical = v => Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : v && typeof v === "object"
    ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}` : JSON.stringify(v);
  clone.integrity.digest = "sha256:" + createHash("sha256").update(canonical(body)).digest("hex");
  assert.ok(pair({ consumerManifest: clone }).reasonCodes.includes("FROZEN_CONSUMER_SUBSTITUTION_DENIED"));
});

test("a fabricated optional gap in the frozen producer manifest is denied, not a fake pass (AC02)", () => {
  const claimed = structuredClone(producer);
  claimed.gaps = [{ id: "OPTIONAL_NEW", state: "HELD" }];
  assert.ok(pair({ producerManifest: claimed }).reasonCodes.includes("FROZEN_PRODUCER_SUBSTITUTION_DENIED"));
});

test("the frozen fixed computation preserves the verified edge receipt count (AC01)", () => {
  const broken = structuredClone(candidate);
  broken.claims.computed.frozenReceiptsEstablishingEdge = 1;
  assert.equal(pair({ candidate: broken }).outcome, "DENIED");
  assert.throws(() => generate(broken), /ADJUDICATION_DENIED/);
});
