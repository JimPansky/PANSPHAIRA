import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { generateCurrentProducerAnalyticsManifestV1 } from "../../dist/src/analytics/producer-analytics-manifest.js";
import { validateCurrentAnalyticsPairV1 } from "../../dist/src/analytics/paired-analytics-parity.js";
import { adjudicateNativeCurrentCandidateV1, adjudicateNativeCandidateV1,
  createNativeAdjudicationContextV1, nativeTransportBytesV1, RECONCILED_RELEASED_HEADS_V1 } from "../../dist/src/cks-12/kaleidosphere-candidate-quarantine.js";
const root = resolve(import.meta.dirname, "../..");
const read = p => JSON.parse(readFileSync(resolve(root, p)));
const rawArtifactBytes = readFileSync(resolve(root,"tests/fixtures/cks-analytics/projection-v1.json"));
const response = read("tests/fixtures/pan346/ks-native-response-994ac80.json");
const consumer = read("tests/fixtures/pan346/consumer-support-994ac80.json");
const candidate = response.capture.candidate;
const generate = value => generateCurrentProducerAnalyticsManifestV1({rawArtifactBytes,candidate:value}).manifest;
const producer = generate(candidate);
const pair = (change = {}) => validateCurrentAnalyticsPairV1({rawArtifactBytes,candidate,producerManifest:producer,consumerManifest:consumer,...change});
test("source-only current KS HTTP capture and separately built consumer content qualify, not runtime/CI/release", () => {
  assert.equal(response.httpStatus,200);
  assert.deepEqual(response.heads.kaleidosphereHead,candidate.bindings.kaleidosphereHead);
  assert.deepEqual(consumer.bindings.kaleidosphereHead,candidate.bindings.kaleidosphereHead);
  assert.equal(producer.adjudication.outcome,"ACCEPTED_BOUNDED");
  assert.equal(producer.adjudication.qualifiedHeads.kaleidoSphere,"994ac80113af284ffe9fde93bb11f2341aaace91");
  assert.deepEqual(pair(),{outcome:"PASS",reasonCodes:[],runtimeExecutionAttested:false,publicCiAttested:false,releaseAttested:false});
});
test("current candidate denied by historical admissibility, not retroactively accepted", () => {
  const result=adjudicateNativeCandidateV1({rawArtifactBytes,canonicalTransportBytes:nativeTransportBytesV1(rawArtifactBytes),candidate,
    context:createNativeAdjudicationContextV1({contextId:"pansphaira:par-ps-01-producer-manifest-context-001"}),releasedHeads:RECONCILED_RELEASED_HEADS_V1});
  assert.equal(result.outcome,"DENIED");assert.ok(result.reasonCodes.includes("NATIVE_STALE_HEAD_DENIED"));
});
test("stale, substituted, incomplete current producer content fails", () => {
  const stale=structuredClone(candidate);stale.bindings.kaleidosphereHead.commitOid="545a3b44ea88c96eded060c11c7c3a2afe0edff6";
  assert.throws(()=>generate(stale),/ADJUDICATION_DENIED/);
  assert.equal(pair({candidate:stale}).outcome,"DENIED");
  const substitute=structuredClone(producer);substitute.serviceHead.commitOid="a".repeat(40);
  assert.ok(pair({producerManifest:substitute}).reasonCodes.includes("CURRENT_PRODUCER_SUBSTITUTION_DENIED"));
  assert.equal(pair({rawArtifactBytes:Buffer.from("{}")}).outcome,"DENIED");
});
test("rehashed consumer change, dropped promise, changed channel and unknown head deny", () => {
  const clone=structuredClone(consumer);
  clone.support.supported.shift();
  assert.ok(pair({consumerManifest:clone}).reasonCodes.includes("CURRENT_PROMISED_SCOPE_DENIED"));
  clone.channels.analysis.version="unsupported-v1";
  assert.ok(pair({consumerManifest:clone}).reasonCodes.includes("CURRENT_PROMISED_CHANNEL_DENIED"));
  clone.bindings.kaleidosphereHead.commitOid="c".repeat(40);
  assert.ok(pair({consumerManifest:clone}).reasonCodes.includes("CURRENT_PAIR_HEAD_MISMATCH_DENIED"));
  // Rehashing submitted content does not replace the independent whole-content pin.
  const body=structuredClone(clone);delete body.integrity;
  const canonical = v => Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : v && typeof v === "object"
    ? `{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}` : JSON.stringify(v);
  clone.integrity.digest="sha256:"+createHash("sha256").update(canonical(body)).digest("hex");
  assert.ok(pair({consumerManifest:clone}).reasonCodes.includes("CURRENT_CONSUMER_SUBSTITUTION_DENIED"));
});
test("current optional gap cannot be fabricated from submitted producer manifest", () => {
  const claimed=structuredClone(producer);claimed.gaps=[{id:"OPTIONAL_NEW",state:"HELD"}];
  assert.ok(pair({producerManifest:claimed}).reasonCodes.includes("CURRENT_PRODUCER_SUBSTITUTION_DENIED"));
});

test("current fixed computation preserves verified edge receipt count",()=>{
  const broken=structuredClone(candidate);broken.claims.computed.frozenReceiptsEstablishingEdge=1;
  assert.equal(pair({candidate:broken}).outcome,"DENIED");
  assert.throws(()=>generate(broken),/ADJUDICATION_DENIED/);
});
