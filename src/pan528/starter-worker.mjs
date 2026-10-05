import { canonicalJson } from "../../dist/packages/contracts/src/canonical-json.js";
import * as draft from "../pan472/persistent-draft-transfer.mjs";
import * as scope from "../pan473/writer-scope-cutover.mjs";
import * as trade from "../pan515/trade-state.mjs";
import { observeGuidedNativeProcessV1 } from "./runtime-observation.mjs";

// Fixed native synthetic source, fixed profile and two fixed domain commands.
// No caller SQL, shell, URL, credential, grant or model answer enters this worker.
try {
  const chunks = []; let size = 0;
  for await (const chunk of process.stdin) { if ((size += chunk.length) > 16384) throw new Error("GUIDED_WORKER_INPUT_BOUND_DENIED"); chunks.push(chunk); }
  const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const observedRuntime = observeGuidedNativeProcessV1();
  if (input.schemaVersion !== "pansphaira.guided-native/worker-input/v1" || input.probeMode !== "NORMAL" || canonicalJson(input.runtimeObservation) !== canonicalJson(observedRuntime)) throw new Error("GUIDED_WORKER_SOURCE_BINDING_DENIED");
  const root = input.leadingRoot;
  draft.initializePan472SyntheticDraftStores({ root });
  draft.writePan472SyntheticSource({ root, changes: [
    { id: "synthetic:customer-7", kind: "customer", revision: 1, deleted: false, body: { nativeId: 7, name: "Synthetic Customer" } },
    { id: "synthetic:order-42", kind: "order", revision: 1, deleted: false, body: { customerId: "synthetic:customer-7", date: 1767225600, refClient: "CM-ADMIN-AI-ESCALATION-001", status: "DRAFT", currency: "EUR", amountMinor: 7500 } },
    { id: "synthetic:line-1", kind: "line", revision: 1, deleted: false, body: { orderId: "synthetic:order-42", quantityMicros: 6000000, unit: "piece", priceMinor: 1250 } },
  ] });
  scope.initializePan473WriterScope({ root, sourceCapability: "NATIVE_SQLITE_EPOCH_FENCE" });
  const { plan } = scope.capturePan473CutoverPlan({ root });
  await scope.executePan473Cutover({ root, plan, grant: scope.authorizePan473Scope({ root, plan, owner: "LOCAL_SYNTHETIC_OWNER" }) });
  trade.initializePan515TradeState({ root, owner: "LOCAL_SYNTHETIC_OWNER" });
  const base = { schemaVersion: "pansphaira.pan515/trade-command/v1", orderId: "synthetic:order-42", lineId: "synthetic:line-1", articleId: "SYN-ART-001", warehouseId: "LAGER-01", unit: "STK", referenceId: null, effectiveAt: "2026-10-03T10:00:00Z" };
  const commands = [
    { ...base, effectId: "synthetic:guided-receipt-01", transportId: "synthetic:guided-receipt-request", expectedRevision: 0, kind: "RECEIPT", quantity: 10, reason: "Owned SAFE_GUIDED synthetic goods receipt" },
    { ...base, effectId: "synthetic:guided-reserve-01", transportId: "synthetic:guided-reserve-request", expectedRevision: 1, kind: "RESERVE", quantity: 6, reason: "Owned SAFE_GUIDED native order reservation" },
  ];
  for (const command of commands) trade.executePan515TradeCommand({ root, command, grant: trade.authorizePan515TradeCommand({ root, command, owner: "LOCAL_SYNTHETIC_OWNER" }) });
  const state = trade.readPan515TradeState({ root });
  process.stdout.write(JSON.stringify({ schemaVersion: "pansphaira.guided-native/worker-result/v1", operationId: input.operationId, invocationNonce: input.invocationNonce, runtimeObservation: observedRuntime,
    observedBusinessValue: state.quantities, nativeEvidence: { leadingStore: state.binding.leadingStore, bindingDigest: state.events[0].bindingDigest, revision: state.revision, eventDigests: state.events.map(event => event.eventDigest) } }) + "\n");
} catch (error) { process.stderr.write((error instanceof Error ? error.message : "GUIDED_WORKER_FAILED") + "\n"); process.exitCode = 1; }
