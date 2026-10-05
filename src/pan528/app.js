const byId = id => document.getElementById(id);
const button = byId("run-starter"); const progress = byId("progress"); const result = byId("native-result");
const tenantPath = location.pathname.slice(0, -"/guided".length);
let firstValueMs = null; let nativeSetup = null; let active = false;
const valueKeys = ["physical", "reserved", "blocked", "available", "shipped", "returned"];
function valuesMatch(expected, observed) {
  return expected && observed && [expected, observed].every(value => JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...valueKeys].sort()) && valueKeys.every(key => Number.isSafeInteger(value[key]) && value[key] >= 0)) && valueKeys.every(key => expected[key] === observed[key]);
}
async function api(path, body) {
  const csrf = sessionStorage.getItem("pan528-csrf");
  if (body !== undefined && (!csrf || !/^[a-f0-9]{64}$/.test(csrf))) throw new Error("Owner-issued CSRF transport nonce required. No rights are inferred from this page.");
  const response = await fetch(tenantPath + path, { method: body === undefined ? "GET" : "POST", headers: body === undefined ? {} : { "content-type": "application/json", "x-pan527-csrf": csrf }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("Protected native request denied: HTTP " + response.status);
  return response.json();
}
async function show(native) {
  if (native.status === "SUCCEEDED" && !valuesMatch(native.expectedBusinessValue, native.observedBusinessValue)) native = { ...native, status: "FAILED" };
  byId("expected-value").textContent = native.expectedBusinessValue ? native.expectedBusinessValue.available + " STK" : "Not run";
  byId("observed-value").textContent = native.observedBusinessValue ? native.observedBusinessValue.available + " STK" : "Not observed";
  byId("business-status").textContent = native.status;
  if (native.status === "OUTCOME_UNKNOWN") result.textContent = JSON.stringify({ authorityProfile: nativeSetup?.authorityProfile ?? native.authorityProfile, acceptedBusinessOutcome: false, businessResult: native }, null, 2);
  if (["SUCCEEDED", "FAILED"].includes(native.status)) {
    result.textContent = JSON.stringify({ authorityProfile: nativeSetup?.authorityProfile ?? native.authorityProfile, setupTemplate: nativeSetup?.template ?? null, nativeAnswer: nativeSetup?.nativeAnswer ?? null, businessResult: native }, null, 2);
    progress.textContent = native.status === "SUCCEEDED" ? "Native receipt and reservation completed; expected and observed business values match." : "Business result failed. HTTP success does not approve a wrong value.";
    if (native.status === "SUCCEEDED" && firstValueMs === null) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      firstValueMs = performance.now().toFixed(2);
    }
    if (firstValueMs !== null) byId("first-value").textContent = firstValueMs;
  } else progress.textContent = native.status === "OUTCOME_UNKNOWN" ? (native.abortAcknowledged ? (native.childCompleted ? "Abort child close observed; business effect remains unresolved. No blind reset is allowed." : "Abort request acknowledged, not child completion; business effect is unresolved. No blind reset is allowed.") : "Native child is in flight or its effect is unresolved. No blind reset is allowed.") : "Ready for an explicit bounded action.";
  button.disabled = active || native.status !== "IDLE";
  byId("abort-starter").disabled = native.status !== "OUTCOME_UNKNOWN" || native.childCompleted || native.abortAcknowledged;
  byId("reset-starter").disabled = active || !["SUCCEEDED", "FAILED"].includes(native.status) || native.childCompleted !== true;
}
button.addEventListener("click", async () => {
  active = true; button.disabled = true; progress.textContent = "Starting two bounded owned synthetic actions…";
  try {
    const nativeAnswer = await api("/api/ask", { question: "What is happening?" });
    const status = await api("/api/status");
    if (status.authority?.profile?.profileId !== "SAFE_GUIDED") throw new Error("Observed native authority is not SAFE_GUIDED");
    nativeSetup = { authorityProfile: status.authority.profile.profileId, template: status.template, nativeAnswer };
    const before = await api("/guided/status");
    let native = await api("/guided/command", { action: "RUN_STARTER", operationId: "operation:browser-" + crypto.randomUUID(), binding: before.binding });
    await show(native);
    const deadline = performance.now() + 12000;
    while (native.status === "OUTCOME_UNKNOWN" && !native.childCompleted && performance.now() < deadline) { await new Promise(resolve => setTimeout(resolve, 25)); native = await api("/guided/status"); }
    active = false; await show(native);
  } catch (error) { active = false; result.textContent = "No accepted result."; progress.textContent = error.message; button.disabled = false; }
});
byId("refresh-status").addEventListener("click", async () => {
  try { await show(await api("/guided/status")); } catch (error) { progress.textContent = error.message; }
});
byId("abort-starter").addEventListener("click", async () => {
  byId("abort-starter").disabled = true;
  try {
    const before = await api("/guided/status");
    await show(await api("/guided/command", { action: "ABORT_STARTER", operationId: before.operationId, binding: before.binding }));
  } catch (error) { progress.textContent = error.message; }
});
byId("reset-starter").addEventListener("click", async () => {
  active = true; button.disabled = true; byId("reset-starter").disabled = true;
  try {
    const before = await api("/guided/status");
    const native = await api("/guided/command", { action: "RESET_STARTER", operationId: "operation:reset-" + crypto.randomUUID(), binding: before.binding });
    active = false; await show(native);
    if (native.status === "IDLE") result.textContent = "Own completed synthetic starter reset. Prior runtime budget remains consumed. No current business result.";
  } catch (error) {
    active = false;
    try { await show(await api("/guided/status")); } catch { button.disabled = true; }
    progress.textContent = error.message;
  }
});
byId("request-helper").addEventListener("click", async () => {
  const helperButton = byId("request-helper"); helperButton.disabled = true;
  try {
    const before = await api("/guided/status");
    const proposal = await api("/guided/command", { action: "SUGGEST_STARTER", operationId: "operation:helper-" + crypto.randomUUID(), binding: before.binding });
    if (proposal.schemaVersion !== "pansphaira.guided-native/suggestion/v1" || proposal.planOnly !== true || proposal.activationAuthorized !== false || proposal.modelInvocation !== "NOT_REQUESTED" || proposal.suggestion?.kind !== "RUN_CONTROLLED_NATIVE_STARTER") throw new Error("Typed proposal denied; no execution or rights are inferred.");
    byId("helper-proposal").textContent = JSON.stringify(proposal, null, 2);
    byId("helper-status").textContent = "Suggested: receive 10 synthetic pieces and reserve 6; expect 4 available. Plan only, not executed. Use Run starter separately.";
  } catch (error) { byId("helper-status").textContent = error.message; byId("helper-proposal").textContent = "No accepted proposal."; }
  finally { helperButton.disabled = false; }
});
