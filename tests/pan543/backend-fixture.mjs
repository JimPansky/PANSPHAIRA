// Test-only owned real backend process. No provider, host daemon or remote write.
import { createOptionalHttpsProductIngressV1 } from "../../src/pan527/origin-session-adapter.mjs";
import { createNativeErvReadAdapterV1 } from "../../src/pan541/native-erv-read-adapter.mjs";
import { enableWorkspaceBrowserV1 } from "../../src/pan541/workspace-browser.mjs";
if (!process.send || process.argv.length !== 4) throw new Error("PAN543_BACKEND_FIXTURE_OWNER_REQUIRED");
const options = JSON.parse(process.argv[2]); const nativeRoot = process.argv[3];
const gateway = createOptionalHttpsProductIngressV1(options);
const workspace = enableWorkspaceBrowserV1({ optIn: true, gateway, tenantId: "tenant-a", origin: options.origin, nativeReader: createNativeErvReadAdapterV1({ tenantId: "tenant-a", root: nativeRoot }) });
const port = Number(new URL(options.origin).port);
await new Promise((resolve, reject) => { gateway.server.once("error", reject); gateway.server.listen(port, "127.0.0.1", resolve); });
process.send({ state: "READY", pid: process.pid });
let closing = false;
async function close() {
  if (closing) return; closing = true;
  gateway.server.closeAllConnections(); await new Promise(resolve => gateway.server.close(resolve)); workspace.close(); process.disconnect();
}
process.on("message", message => { if (message === "STOP") void close(); });
process.on("SIGTERM", () => { void close(); });
