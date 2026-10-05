import { createGuidedNativeOwnerV1 } from "../../src/pan528/native-journey-controller.mjs";
import { readPan515TradeState } from "../../src/pan515/trade-state.mjs";

// Test-owner subprocess only. No browser route, production command or resource
// authority is added. Every printed result comes from the actual native owner.
let native;
try {
  const chunks = []; let size = 0;
  for await (const chunk of process.stdin) { if ((size += chunk.length) > 32768) throw new Error("RESTART_TEST_INPUT_BOUND"); chunks.push(chunk); }
  const { options, principal, command, mode } = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  native = createGuidedNativeOwnerV1(options);
  const before = native.client.readback(); let ack; let resetError = null; let cleanupError = null;
  if (["COMPLETE", "ABORT"].includes(mode)) {
    await native.client.command(command, principal);
    if (mode === "ABORT") ack = await native.client.command({ ...command, action: "ABORT_STARTER" }, principal);
    await native.owner.waitForChildCompletion();
  } else if (mode === "REPLAY") {
    await native.client.command(command, principal);
    try { await native.client.command({ ...command, action: "RESET_STARTER", operationId: "operation:restart-blind-reset" }, principal); } catch (error) { resetError = error.message; }
  } else throw new Error("RESTART_TEST_MODE_DENIED");
  const after = native.client.readback();
  const leading = after.status === "SUCCEEDED" ? readPan515TradeState({ root: native.owner.leadingRoot }) : null;
  if (after.status === "OUTCOME_UNKNOWN") { try { native.owner.cleanup(); } catch (error) { cleanupError = error.message; } }
  native.owner.close(); native = undefined;
  process.stdout.write(JSON.stringify({ pid: process.pid, before, after, ack: ack ?? null, resetError, cleanupError, leading: leading ? { revision: leading.revision, quantities: leading.quantities, eventCount: leading.events.length } : null }) + "\n");
} catch (error) { process.stderr.write((error instanceof Error ? error.message : "RESTART_TEST_FAILED") + "\n"); process.exitCode = 1; }
finally { if (native) await native.owner.suspend(); }
