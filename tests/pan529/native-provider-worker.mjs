import { request as httpRequest } from "node:http";
import { createNativeBudgetControllerV1 } from "../../src/pan529/native-budget-controller.mjs";
import { deliveredIdentity, modelCommand } from "./native-fixture.mjs";

// Isolated test worker: owner-provided loopback port is never agent-selected URL policy.
process.once("message", (config) => {
  if (!Number.isSafeInteger(config.providerPort) || config.providerPort < 1 || config.providerPort > 65_535) throw new Error("Invalid owned synthetic provider port");
  const adapter = createNativeBudgetControllerV1({ optIn: true, stateRoot: config.stateRoot, identity: deliveredIdentity(), limits: config.limits, syntheticProvider: (bound, signal) => new Promise((resolve, reject) => {
    const payload = JSON.stringify(bound);
    const call = httpRequest({ hostname: "127.0.0.1", port: config.providerPort, path: "/synthetic", method: "POST", agent: false, signal, headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload), "x-operation-id": config.operationId } }, (response) => {
      let data = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { data += chunk; });
      response.on("end", () => { try { resolve(JSON.parse(data)); } catch (error) { reject(error); } });
    });
    call.on("error", reject); call.end(payload);
  }) });
  process.send({ phase: "READY", pid: process.pid });
  process.once("message", async (go) => {
    if (go !== "GO") throw new Error("Explicit parent barrier release required");
    try {
      const command = modelCommand(adapter, config.operationId);
      command.budget.timeoutMs = 20_000;
      const result = await adapter.client.invoke(command);
      adapter.owner.close();
      process.send({ phase: "DONE", pid: process.pid, allowed: result.outcome === "ALLOW", result }, () => process.disconnect());
    } catch (error) {
      adapter.owner.close();
      process.send({ phase: "DONE", pid: process.pid, allowed: false, denied: String(error.message) }, () => process.disconnect());
    }
  });
});
