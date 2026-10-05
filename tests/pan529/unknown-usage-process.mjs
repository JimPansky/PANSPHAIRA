import { createResourceBudgetStoreV1 } from "../../demo/runtime/atomic-resource-budget.mjs";

const { options, phase } = JSON.parse(process.argv[2]);
const command = { operationId: "operation:interrupted-001", requestDigest: "f".repeat(64), modelUnits: 8, runtimeUnits: 6 };
const store = createResourceBudgetStoreV1(options);
if (phase === "interrupt") {
  store.reserve(command);
  const dispatch = store.markUnknownUsage(command.operationId);
  if (!dispatch.dispatchGranted) throw new Error("PAN529_FIRST_NATIVE_DISPATCH_REQUIRED");
  process.send({ phase, pid: process.pid, snapshot: store.snapshot(), state: store.read(command.operationId).state });
  // Real interrupted native owner process: parent SIGKILLs after durable fence.
  process.on("message", () => {});
} else if (phase === "reopen") {
  const retained = store.snapshot();
  const replay = store.reserve(command);
  const fence = store.markUnknownUsage(command.operationId);
  const before = store.read(command.operationId);
  let modelAnswerDenied = false;
  try { store.settle({ operationId: command.operationId, requestDigest: command.requestDigest, modelUnits: 0, runtimeUnits: 0, evidenceDigest: "e".repeat(64), authenticator: "0".repeat(64) }); }
  catch (error) { modelAnswerDenied = error.message === "RESOURCE_BUDGET_UNTRUSTED_COMPLETION_DENIED"; }
  const unchangedAfterModelAnswer = JSON.stringify(store.read(command.operationId)) === JSON.stringify(before);
  process.send({ phase, pid: process.pid, state: before.state, retained, replayed: replay.replayed, redispatchGranted: fence.dispatchGranted, modelAnswerDenied, unchangedAfterModelAnswer });
  store.close();
  process.disconnect();
} else throw new TypeError("PAN529_RESTART_PHASE_DENIED");
