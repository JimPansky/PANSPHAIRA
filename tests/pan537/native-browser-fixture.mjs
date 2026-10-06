import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeArtifactText } from "../../scripts/demo-current-head-e2e.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const state = join(root, ".chimpmaera-demo");
const sha = value => createHash("sha256").update(value).digest("hex");
const sourcePaths = ["packages/setup-coordinator/src/index.ts", "demo/runtime/server.mjs", "demo/runtime/approval-workbench.mjs", "demo/runtime/enforcement-gate.mjs", "demo/chimpmaera.Dockerfile", "demo/tsconfig.runtime.json", "demo/compose.yaml", "demo/manifests/authority/SAFE_GUIDED-v1.json", "demo/manifests/authority/admin-ai-poc-policy-v1.json", "package-lock.json", "package.json", "demo/install.sh", "demo/uninstall.sh", "demo/runtime/authoritative-approval-snapshot.mjs", "scripts/run-pan537-proposal-diff-browser-tests.mjs", "tests/pan537/browser-proposal-diff.test.mjs", "tests/pan537/registration.test.mjs", "tests/pan537/test-runner.test.mjs"];

async function reservePorts() {
  const reservations = [];
  try {
    for (let index = 0; index < 3; index++) {
      const server = createServer();
      await new Promise((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
      reservations.push(server);
    }
    return reservations.map(server => server.address().port);
  } finally {
    await Promise.all(reservations.map(server => new Promise(done => server.close(done))));
  }
}
function configValues() {
  return Object.fromEntries(readFileSync(join(state, "config.env"), "utf8").trim().split("\n").map(line => { const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1)]; }));
}
function ephemeralFixtureSecrets() {
  const directory = join(state, "secrets");
  if (!existsSync(directory)) return [];
  return readdirSync(directory).map(name => join(directory, name)).filter(path => statSync(path).isFile()).map(path => readFileSync(path, "utf8").trim()).filter(Boolean);
}

// This boots the unchanged product installer and real pinned Dolibarr/EspoCRM
// services. No HTTP-response stub, substitute provider, backend rewrite,
// caller-role grant or production/customer credential is used.
export async function nativeBrowserFixture537() {
  assert.ok(process.env.PAN537_BROWSER_MODULE, "PAN537_REAL_BROWSER_REQUIRED_NO_SKIP");
  assert.ok(process.env.PAN537_EVIDENCE_DIR, "PAN537_PRIVATE_EVIDENCE_DIRECTORY_REQUIRED");
  assert.equal(existsSync(state), false, "PAN537_PREEXISTING_PRODUCT_STATE_DENIED");
  const output = resolve(process.env.PAN537_EVIDENCE_DIR);
  mkdirSync(output, { recursive: true, mode: 0o700 });
  const namespace = "pansphaira-e2e-" + process.pid + "-537";
  const ports = await reservePorts();
  const env = { ...process.env, CM_DEMO_MODE: "complete", CM_AUTHORITY_PROFILE: "SAFE_GUIDED", CM_DEMO_SEED: "yes", CM_DEMO_PROJECT: namespace, CM_DEMO_RUN_OWNER: namespace,
    CM_CHIMP_PORT: "127.0.0.1:" + ports[0], CM_ESPO_PORT: "127.0.0.1:" + ports[1], CM_DOLI_PORT: "127.0.0.1:" + ports[2] };
  const pins = Object.fromEntries(sourcePaths.map(path => [path, sha(readFileSync(join(root, path)))]));
  let browser; let context; let fixtureClosed = false;
  function storeSanitized(name, text, secrets = ephemeralFixtureSecrets()) {
    writeFileSync(join(output, name), sanitizeArtifactText(text, { forbiddenValues: secrets, privateRoots: [root, output] }), { mode: 0o600 });
  }
  async function cleanup() {
    if (fixtureClosed) return;
    fixtureClosed = true;
    if (context) await context.close();
    if (browser) await browser.close();
    const secrets = ephemeralFixtureSecrets();
    if (existsSync(join(state, "config.env"))) {
      const config = configValues();
      assert.equal(config.COMPOSE_PROJECT_NAME, namespace);
      assert.equal(config.CM_DEMO_RUN_OWNER, namespace);
      const result = spawnSync("bash", ["demo/uninstall.sh", "--purge"], { cwd: root, env, encoding: "utf8", timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
      storeSanitized("actual-owned-cleanup.log", (result.stdout ?? "") + (result.stderr ?? ""), secrets);
      assert.equal(result.status, 0, "PAN537_ACTUAL_OWNED_PRODUCT_CLEANUP_REQUIRED");
      assert.equal(existsSync(state), false);
    }
    for (const [kind, command] of Object.entries({ containers: ["ps", "-aq", "--filter", "label=com.docker.compose.project=" + namespace], networks: ["network", "ls", "-q", "--filter", "label=com.docker.compose.project=" + namespace], volumes: ["volume", "ls", "-q", "--filter", "label=com.docker.compose.project=" + namespace], images: ["image", "ls", "-q", "--filter", "label=io.chimpmaera.demo.run-owner=" + namespace] })) {
      const result = spawnSync("docker", command, { cwd: root, env, encoding: "utf8", timeout: 30000 });
      assert.equal(result.status, 0, "PAN537_CLEANUP_INVENTORY_READER_REQUIRED");
      assert.equal(result.stdout.trim(), "", "PAN537_OWNED_" + kind.toUpperCase() + "_RESIDUE_DENIED");
    }
    for (const [path, digest] of Object.entries(pins)) assert.equal(sha(readFileSync(join(root, path))), digest, "Source changed during actual native fixture");
    writeFileSync(join(output, "actual-owned-cleanup.json"), JSON.stringify({ namespace, allOwnedContainersNetworksVolumesImages: 0, stateRemoved: true, sourcePinsStable: true }) + "\n", { mode: 0o600 });
  }
  try {
    const initial = spawnSync("docker", ["ps", "-aq", "--filter", "label=com.docker.compose.project=" + namespace], { env, encoding: "utf8", timeout: 30000 });
    assert.equal(initial.status, 0); assert.equal(initial.stdout.trim(), "", "PAN537_PREEXISTING_NAMESPACE_DENIED");
    const install = spawnSync("bash", ["demo/install.sh"], { cwd: root, env, encoding: "utf8", timeout: 600000, maxBuffer: 20 * 1024 * 1024 });
    storeSanitized("actual-native-install.log", (install.stdout ?? "") + (install.stderr ?? ""));
    assert.equal(install.status, 0, "PAN537_ACTUAL_NATIVE_INSTALL_REQUIRED_" + (install.signal ?? "EXIT"));
    const config = configValues(); assert.equal(config.COMPOSE_PROJECT_NAME, namespace); assert.equal(config.CM_DEMO_RUN_OWNER, namespace);
    const apiToken = readFileSync(join(state, "secrets/chimp-api-token"), "utf8").trim();
    const origin = "http://127.0.0.1:" + ports[0];
    const request = async (path, body) => {
      const response = await fetch(origin + path, { method: body === undefined ? "GET" : "POST", headers: { authorization: "Bearer " + apiToken, origin, "x-cm-csrf": "chimpmaera-local-v1", ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, value: await response.json() };
    };
    const { chromium } = await import(process.env.PAN537_BROWSER_MODULE);
    browser = await chromium.launch({ headless: true, args: ["--no-proxy-server", "--disable-background-networking"] });
    context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    // Ephemeral installer-generated synthetic test token. Never a personal
    // credential, role override, stored request header or published evidence.
    await context.addInitScript(({ token }) => sessionStorage.setItem("cmControlToken", token), { token: apiToken });
    const requests = [];
    context.on("request", request => { const url = new URL(request.url()); if (url.origin === origin) requests.push({ method: request.method(), path: url.pathname }); });
    const page = await context.newPage(); const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const image = spawnSync("docker", ["image", "inspect", config.CM_CHIMP_IMAGE, "--format", "{{.Id}}"], { env, encoding: "utf8", timeout: 30000 });
    assert.equal(image.status, 0); assert.match(image.stdout.trim(), /^sha256:[a-f0-9]{64}$/);
    writeFileSync(join(output, "actual-build-source-and-browser.json"), JSON.stringify({ namespace, sourcePins: pins, imageId: image.stdout.trim(), nodeVersion: process.version, browserVersion: browser.version(), originLoopbackOnly: true, viewport: { width: 1280, height: 900 }, realPinnedProductInstaller: true, realDolibarrProvider: true, noProductiveOrNewProviderRights: true, noSourceCommitOrReleaseQualification: true }, null, 2) + "\n", { mode: 0o600 });
    return { page, context, browser, errors, requests, origin, output, request, close: cleanup };
  } catch (error) { await cleanup(); throw error; }
}
