import { parentPort, workerData } from "node:worker_threads";
import { createResourceBudgetStoreV1 } from "../../demo/runtime/atomic-resource-budget.mjs";

const { index, options } = workerData;
const store = createResourceBudgetStoreV1(options);
parentPort.once("message", (message) => {
  if (message !== "reserve") throw new TypeError("PAN529_WORKER_BARRIER_REQUIRED");
  let result;
  try {
    result = { allowed: true, ...store.reserve({ operationId: `operation:concurrent-${String(index).padStart(3, "0")}`, requestDigest: "c".repeat(64), modelUnits: 2, runtimeUnits: 1 }) };
  } catch (error) { result = { allowed: false, code: error.message }; }
  store.close();
  parentPort.postMessage({ type: "result", index, result });
});
parentPort.postMessage({ type: "ready", index });
