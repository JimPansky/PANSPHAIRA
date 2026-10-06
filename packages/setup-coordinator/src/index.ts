import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { dirname, resolve } from "node:path";
import {
  activatePocAdminAuthorityProfileV1,
  applyPocEarlyAdminRepairV1,
  askPocEarlyAdminAssistantV1,
  buildPocEarlyAdminRepairPlanV1,
  buildPocEarlyAdminStatusV1,
  buildPocGuidedDemoCleanupReceiptV1,
  buildPocGuidedDemoSetupReceiptV1,
  compileEffectiveRightsV1,
  promotePocEarlyAdminToStageBV1,
  resetPocAdminAuthorityToSafeV1,
  renderPermissionXrayV1,
  resumePocEarlyAdminSetupV1,
  runPocEarlyAdminSyntheticSetupV1,
  syntheticEffectiveRightsInputV1,
  verifyPocEarlyAdminRepairReceiptV1,
  verifyPocEarlyAdminStatusV1,
  verifyPocGuidedDemoSetupPlanV1,
  type PocEarlyAdminAnswerV1,
  type PocAdminAuthoritySelectionV1,
  type PocEarlyAdminIssueCodeV1,
  type PocEarlyAdminRepairPlanV1,
  type PocEarlyAdminRepairReceiptV1,
  type PocEarlyAdminStatusV1,
  type PocGuidedDemoSetupPlanV1,
  type PocGuidedDemoCleanupReceiptV1,
  type PermissionXrayV1,
} from "../../contracts/src/index.js";

export class PocEarlyAdminCoordinatorV1 {
  private readonly plan: PocGuidedDemoSetupPlanV1;
  private readonly workspaceRoot: string;
  private statusValue: PocEarlyAdminStatusV1;
  private pendingRepairValue: PocEarlyAdminRepairPlanV1 | undefined;
  private readonly ownedRoot: string;
  private readonly ownedComponents: readonly string[];
  private readonly statusPath: string;
  private readonly eventsPath: string;
  private readonly repairBoundaryObserver: (() => void) | undefined;

  constructor(
    planInput: PocGuidedDemoSetupPlanV1,
    workspaceRootInput: string,
    options: Readonly<{
      policyAvailable?: boolean;
      resume?: boolean;
      repairBoundaryObserver?: () => void;
    }> = {},
  ) {
    this.workspaceRoot = resolve(workspaceRootInput);
    const candidateOwnedRoot = resolve(
      this.workspaceRoot,
      planInput.storage.ownedStateRoot,
    );
    const safePrefix = `${resolve(this.workspaceRoot, "artifacts/poc-guided-demo/playgrounds")}/`;
    if (!candidateOwnedRoot.startsWith(safePrefix)) {
      throw new Error("UNSAFE_COORDINATOR_STATE_ROOT_DENIED");
    }
    this.plan = structuredClone(verifyPocGuidedDemoSetupPlanV1(planInput));
    this.repairBoundaryObserver = options.repairBoundaryObserver;
    this.ownedComponents = this.plan.storage.ownedStateRoot.split("/");
    this.ownedRoot = resolve(this.workspaceRoot, this.plan.storage.ownedStateRoot);
    if (!this.ownedRoot.startsWith(safePrefix)) {
      throw new Error("UNSAFE_COORDINATOR_STATE_ROOT_DENIED");
    }
    this.statusPath = resolve(this.ownedRoot, "dashboard-status.json");
    this.eventsPath = resolve(this.ownedRoot, "dashboard-events.jsonl");
    if (options.resume && existsSync(this.statusPath)) {
      this.statusValue = verifyPocEarlyAdminStatusV1(
        JSON.parse(readFileSync(this.statusPath, "utf8")) as PocEarlyAdminStatusV1,
      );
      if (this.statusValue.authority.profile.profileId !== "SAFE_GUIDED") {
        this.statusValue = resetPocAdminAuthorityToSafeV1(
          this.statusValue,
          "PROCESS_RESTART",
        );
        this.persist(
          "AUTHORITY_RESET_ON_PROCESS_RESTART",
          this.statusValue.currentAction,
        );
      } else {
        this.appendEvent("RESUMED", this.statusValue.currentAction);
      }
    } else {
      this.statusValue = buildPocEarlyAdminStatusV1(this.plan, {
        ...(options.policyAvailable === undefined
          ? {}
          : { policyAvailable: options.policyAvailable }),
      });
      this.persist("DASHBOARD_STARTED", "Stage A available before installation.");
    }
  }

  status(): PocEarlyAdminStatusV1 {
    return verifyPocEarlyAdminStatusV1(this.statusValue);
  }

  permissionXray(): PermissionXrayV1 {
    return renderPermissionXrayV1(
      compileEffectiveRightsV1(syntheticEffectiveRightsInputV1()),
    );
  }

  activateAuthority(
    selection: PocAdminAuthoritySelectionV1,
  ): PocEarlyAdminStatusV1 {
    this.statusValue = activatePocAdminAuthorityProfileV1(
      this.statusValue,
      selection,
    );
    this.persist(
      "AUTHORITY_PROFILE_ACTIVATED",
      this.statusValue.authority.profile.profileId,
    );
    return this.status();
  }

  pendingRepair(): PocEarlyAdminRepairPlanV1 | undefined {
    return this.pendingRepairValue;
  }

  runSyntheticSetup(
    injectFailure?: PocEarlyAdminIssueCodeV1,
  ): PocEarlyAdminStatusV1 {
    mkdirSync(this.ownedRoot, { recursive: true });
    this.atomicWrite(
      resolve(this.ownedRoot, "setup-plan.json"),
      `${JSON.stringify(this.plan, null, 2)}\n`,
    );
    if (injectFailure === "CONFIG_DIGEST_MISMATCH") {
      this.atomicWrite(
        resolve(this.ownedRoot, "config.json"),
        `${JSON.stringify({ syntheticFailure: injectFailure }, null, 2)}\n`,
      );
    }
    this.statusValue = runPocEarlyAdminSyntheticSetupV1(
      this.statusValue,
      injectFailure === undefined ? {} : { injectFailure },
    );
    if (this.statusValue.health.status === "PASS") {
      this.materializeHealthySetup();
    }
    this.persist(
      injectFailure === undefined ? "SETUP_HEALTHY" : "FAILURE_INJECTED",
      this.statusValue.currentAction,
    );
    return this.status();
  }

  diagnose(issueCode: PocEarlyAdminIssueCodeV1): PocEarlyAdminRepairPlanV1 {
    this.pendingRepairValue = buildPocEarlyAdminRepairPlanV1(
      this.statusValue,
      issueCode,
    );
    this.appendEvent("DIAGNOSIS_READY", this.pendingRepairValue.diagnosis);
    return this.pendingRepairValue;
  }

  applyRepair(
    repairPlan: PocEarlyAdminRepairPlanV1,
    ownerConfirmed: boolean,
  ): PocEarlyAdminRepairReceiptV1 {
    if (
      this.pendingRepairValue === undefined
      || repairPlan.repairPlanDigest
        !== this.pendingRepairValue.repairPlanDigest
    ) {
      throw new Error("REPAIR_NOT_SERVER_ISSUED_DENIED");
    }
    const result = applyPocEarlyAdminRepairV1(
      this.statusValue,
      repairPlan,
      ownerConfirmed,
    );
    const rewritesConfig = repairPlan.action.actionId
      === "REWRITE_OWNED_CONFIG_FROM_VERIFIED_PLAN";
    if (!rewritesConfig
      && repairPlan.action.actionId !== "RETRY_DECLARED_HEALTH_CHECKS") {
      throw new Error("UNDECLARED_ACTION_DENIED");
    }
    this.applyOwnedRepairResult(result.status, result.receipt, rewritesConfig);
    this.pendingRepairValue = undefined;
    return result.receipt;
  }

  resume(): PocEarlyAdminStatusV1 {
    this.statusValue = resumePocEarlyAdminSetupV1(this.statusValue);
    this.materializeHealthySetup();
    this.persist("SETUP_RESUMED", "Health, policy and identity gates evaluated.");
    return this.status();
  }

  promote(): PocEarlyAdminStatusV1 {
    this.statusValue = promotePocEarlyAdminToStageBV1(this.statusValue);
    this.persist("STAGE_B_PROMOTED", this.statusValue.currentAction);
    return this.status();
  }

  ask(question: string): PocEarlyAdminAnswerV1 {
    const answer = askPocEarlyAdminAssistantV1(this.statusValue, question);
    this.appendEvent("QUESTION_ANSWERED", `${answer.topic}:${answer.questionDigest}`);
    return answer;
  }

  cleanup(): PocGuidedDemoCleanupReceiptV1 {
    const setupReceipt = buildPocGuidedDemoSetupReceiptV1(this.plan);
    const receipt = buildPocGuidedDemoCleanupReceiptV1(
      this.plan,
      setupReceipt,
    );
    rmSync(this.ownedRoot, { recursive: true, force: true });
    const cleanupPath = resolve(
      this.workspaceRoot,
      this.plan.storage.cleanupReceiptPath,
    );
    mkdirSync(dirname(cleanupPath), { recursive: true });
    this.atomicWrite(cleanupPath, `${JSON.stringify(receipt, null, 2)}\n`);
    return receipt;
  }

  private materializeHealthySetup(): void {
    const receipt = buildPocGuidedDemoSetupReceiptV1(this.plan);
    this.atomicWrite(
      resolve(this.ownedRoot, "config.json"),
      `${JSON.stringify(this.plan.config, null, 2)}\n`,
    );
    this.atomicWrite(
      resolve(this.ownedRoot, "lock.json"),
      `${JSON.stringify(this.plan.lock, null, 2)}\n`,
    );
    this.atomicWrite(
      resolve(this.ownedRoot, "receipt.json"),
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
  }

  private persist(event: string, detail: string): void {
    mkdirSync(this.ownedRoot, { recursive: true });
    this.atomicWrite(
      this.statusPath,
      `${JSON.stringify(this.statusValue, null, 2)}\n`,
    );
    this.appendEvent(event, detail);
  }

  private appendEvent(event: string, detail: string): void {
    mkdirSync(this.ownedRoot, { recursive: true });
    const line = JSON.stringify({
      event,
      detail,
      statusDigest: this.statusValue.statusDigest,
    });
    writeFileSync(this.eventsPath, `${line}\n`, { flag: "a" });
  }

  private atomicWrite(path: string, content: string): void {
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.tmp`;
    writeFileSync(temporary, content);
    renameSync(temporary, path);
  }

  private applyOwnedRepairResult(
    nextStatus: PocEarlyAdminStatusV1,
    receipt: PocEarlyAdminRepairReceiptV1,
    rewritesConfig: boolean,
  ): void {
    verifyPocGuidedDemoSetupPlanV1(this.plan);
    verifyPocEarlyAdminRepairReceiptV1(receipt, this.pendingRepairValue!);
    this.withOwnedDirectory((directory) => {
      this.repairBoundaryObserver?.();
      this.assertOwnedRootStillBound(directory);
      const evidenceNames = [
        "repair-receipt.json",
        "dashboard-status.json",
        "dashboard-events.jsonl",
      ] as const;
      for (const name of evidenceNames) {
        this.assertRegularOrAbsent(directory, name);
      }
      if (rewritesConfig) {
        this.assertRegularOrAbsent(directory, "config.json");
        this.assertRegularOrAbsent(directory, "rollback-config.json");
      }
      const previousConfig = rewritesConfig
        ? this.readRegularIfPresent(directory, "config.json")
        : undefined;
      const previousEvents = this.readRegularIfPresent(
        directory,
        "dashboard-events.jsonl",
      ) ?? "";
      const event = JSON.stringify({
        event: "REPAIR_APPLIED",
        detail: receipt.actionId,
        statusDigest: nextStatus.statusDigest,
      });
      if (rewritesConfig) {
        if (previousConfig !== undefined) {
          this.atomicWriteOwned(
            directory,
            "rollback-config.json",
            previousConfig,
          );
        }
        this.atomicWriteOwned(
          directory,
          "config.json",
          `${JSON.stringify(this.plan.config, null, 2)}\n`,
        );
      }
      this.atomicWriteOwned(
        directory,
        "repair-receipt.json",
        `${JSON.stringify(receipt, null, 2)}\n`,
      );
      this.atomicWriteOwned(
        directory,
        "dashboard-status.json",
        `${JSON.stringify(nextStatus, null, 2)}\n`,
      );
      this.atomicWriteOwned(
        directory,
        "dashboard-events.jsonl",
        `${previousEvents}${event}\n`,
      );
    });
    this.statusValue = nextStatus;
  }

  private withOwnedDirectory<T>(operation: (directory: number) => T): T {
    let directory = openSync(
      this.workspaceRoot,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    try {
      for (const component of this.ownedComponents) {
        const child = openSync(
          `/proc/self/fd/${directory}/${component}`,
          constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
        );
        closeSync(directory);
        directory = child;
      }
      return operation(directory);
    } finally {
      closeSync(directory);
    }
  }

  private assertOwnedRootStillBound(directory: number): void {
    const opened = fstatSync(directory);
    const current = lstatSync(this.ownedRoot);
    if (
      !current.isDirectory()
      || current.isSymbolicLink()
      || opened.dev !== current.dev
      || opened.ino !== current.ino
    ) {
      throw new Error("OWNED_STATE_COMPONENT_SWAP_DENIED");
    }
  }

  private assertRegularOrAbsent(directory: number, name: string): void {
    const value = lstatSync(`/proc/self/fd/${directory}/${name}`, {
      throwIfNoEntry: false,
    });
    if (value !== undefined && !value.isFile()) {
      throw new Error("OWNED_STATE_NON_REGULAR_ENTRY_DENIED");
    }
  }

  private readRegularIfPresent(
    directory: number,
    name: string,
  ): string | undefined {
    const path = `/proc/self/fd/${directory}/${name}`;
    const value = lstatSync(path, { throwIfNoEntry: false });
    if (value === undefined) return undefined;
    if (!value.isFile()) throw new Error("OWNED_STATE_NON_REGULAR_ENTRY_DENIED");
    const descriptor = openSync(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      if (!fstatSync(descriptor).isFile()) {
        throw new Error("OWNED_STATE_NON_REGULAR_ENTRY_DENIED");
      }
      return readFileSync(descriptor, "utf8");
    } finally {
      closeSync(descriptor);
    }
  }

  private atomicWriteOwned(
    directory: number,
    name: string,
    content: string,
  ): void {
    this.assertRegularOrAbsent(directory, name);
    const root = `/proc/self/fd/${directory}`;
    const temporaryName = `.${name}.${randomUUID()}.tmp`;
    const temporaryPath = `${root}/${temporaryName}`;
    const targetPath = `${root}/${name}`;
    let descriptor: number | undefined;
    try {
      descriptor = openSync(
        temporaryPath,
        constants.O_WRONLY
          | constants.O_CREAT
          | constants.O_EXCL
          | constants.O_NOFOLLOW,
        0o600,
      );
      writeFileSync(descriptor, content, "utf8");
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = undefined;
      this.assertRegularOrAbsent(directory, name);
      renameSync(temporaryPath, targetPath);
      fsyncSync(directory);
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
      try {
        unlinkSync(temporaryPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }

}

export function assertPocEarlyAdminLoopbackBindV1(host: string): void {
  if (!["127.0.0.1", "::1", "localhost"].includes(host)) {
    throw new Error("REMOTE_BIND_DENIED");
  }
}

function requestIsLoopback(request: IncomingMessage): boolean {
  const remote = request.socket.remoteAddress ?? "";
  const remoteAllowed = [
    "127.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
  ].includes(remote);
  const host = (request.headers.host ?? "").toLowerCase();
  const hostAllowed = /^(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(host)
    || /^\[::1\](?::\d+)?$/.test(host);
  return remoteAllowed && hostAllowed;
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  value: unknown,
): void {
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  });
  response.end(`${JSON.stringify(value, null, 2)}\n`);
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 8192) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error("REQUEST_INVALID");
  }
  return value as Record<string, unknown>;
}

const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>PanSphaira Setup</title>
  <style>
    :root{color-scheme:dark;font:14px system-ui;background:#101418;color:#e8eef2}
    body{max-width:980px;margin:auto;padding:20px}
    header,.card{background:#182028;border:1px solid #32414d;border-radius:10px;padding:14px;margin:10px 0;overflow-wrap:anywhere}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:10px}
    progress{width:100%} button,input{padding:8px;margin:4px;background:#22303b;color:inherit;border:1px solid #536675;border-radius:6px}
    #question,#ask{box-sizing:border-box;max-width:calc(100% - 8px)}
    #ask{overflow-wrap:anywhere}
    pre{white-space:pre-wrap;overflow-wrap:anywhere}.pass{color:#73d697}.failed{color:#ff8b8b}
    #admin-ai-business-diff{min-width:0} #admin-ai-business-diff table{width:100%;table-layout:fixed;border-collapse:collapse} #admin-ai-business-diff th,#admin-ai-business-diff td{border:1px solid #536675;padding:6px;text-align:left;vertical-align:top;overflow-wrap:anywhere}
  </style>
</head>
<body>
  <header><h1>PanSphaira local setup</h1><p id="summary">Stage A starting…</p><progress id="progress" max="100"></progress></header>
  <main class="grid">
    <section class="card"><h2>Template & plan</h2><pre id="plan"></pre></section>
    <section class="card"><h2>Stages</h2><pre id="stages"></pre></section>
    <section class="card"><h2>Downloads, cache & disk</h2><pre id="resources"></pre></section>
    <section class="card"><h2>Health & authority</h2><pre id="health"></pre></section>
    <section class="card"><h2>Warnings & decisions</h2><pre id="decisions"></pre></section>
    <section class="card"><h2>Receipts, resume & cleanup</h2><pre id="receipts"></pre></section>
    <section class="card"><h2>Permission X-ray</h2><p>Read-only local synthetic facts; ALLOW is not executable authority.</p><pre id="permission-xray"></pre></section>
  </main>
  <section class="card" id="admin-ai-proof"><h2>Admin-AI Approval Workbench</h2>
    <p>Deterministic static-policy preview — no live LLM and no production authority. OWNER_ESCALATION requires an explicit local owner Approve or Reject decision.</p>
    <div><button id="admin-ai-contact">Auto-grant synthetic contact</button><pre id="admin-ai-contact-result">Outcome: not run\nReason code: not run\nPolicy digest: not run</pre></div>
    <div><button id="admin-ai-order">Owner escalation for synthetic order</button><div id="admin-ai-business-diff"></div><pre id="admin-ai-order-result">Outcome: not run\nReason code: not run\nPolicy digest: not run</pre></div>
    <div><button id="admin-ai-deny">Deny unknown action</button><pre id="admin-ai-deny-result">Outcome: not run\nReason code: not run\nPolicy digest: not run</pre></div>
    <span id="admin-ai-effect-control"></span><pre id="admin-ai-effect-result"></pre>
  </section>
  <section class="card"><h2>Ask the setup assistant</h2><input id="question" size="60" placeholder="What is happening?"><button id="ask">Ask</button><pre id="answer"></pre></section>
  <section class="card"><h2>Bounded actions</h2><button id="run">Run synthetic setup</button><button id="resume">Resume</button><button id="promote">Promote after gates</button><button id="cleanup">Cleanup owned state</button><pre id="action"></pre></section>
  <script>
    const byId=(id)=>document.getElementById(id);
    function controlToken(){let token=sessionStorage.getItem('cmControlToken');if(!token){token=prompt('Paste the local PanSphaira control token from .chimpmaera-demo/secrets/chimp-api-token')||'';if(token)sessionStorage.setItem('cmControlToken',token)}return token}
    async function api(path,body){const headers={'content-type':'application/json'};if(body){headers.authorization='Bearer '+controlToken();headers['x-cm-csrf']='chimpmaera-local-v1'}const response=await fetch(path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined});const value=await response.json();if(!response.ok)throw new Error(value.error);return value}
    async function refresh(){const [s,x]=await Promise.all([api('/api/status'),api('/api/effective-rights')]);byId('summary').textContent=s.currentAction;byId('progress').value=s.progress.percent;byId('plan').textContent=JSON.stringify({template:s.template,plan:s.plan,provider:s.provider},null,2);byId('stages').textContent=s.stages.map(x=>x.status+' '+x.label).join('\\n');byId('resources').textContent=JSON.stringify(s.resources,null,2);byId('health').textContent=JSON.stringify({health:s.health,authority:s.authority},null,2);byId('decisions').textContent=JSON.stringify({warnings:s.warnings,decisions:s.decisions},null,2);byId('receipts').textContent=JSON.stringify({receipts:s.receipts,resume:s.resume,cleanup:s.cleanup},null,2);byId('permission-xray').textContent=JSON.stringify(x,null,2)}
    async function act(path,body){try{const value=await api(path,body??{});byId('action').textContent=JSON.stringify(value,null,2);await refresh()}catch(error){byId('action').textContent=String(error)}}
    let adminAiEffect=null;
    function renderAdminAiBusinessDiff(proposal){
      const region=byId('admin-ai-business-diff');region.replaceChildren();
      const diff=proposal?.businessDiff;if(!diff||!Array.isArray(diff.changes))return;
      const summary=document.createElement('p');summary.textContent=diff.summary;region.append(summary);
      const table=document.createElement('table');const caption=document.createElement('caption');caption.textContent='Before and after business changes';table.append(caption);
      const head=document.createElement('thead');const headings=document.createElement('tr');
      for(const label of ['Field','Before','After']){const cell=document.createElement('th');cell.scope='col';cell.textContent=label;headings.append(cell)}head.append(headings);table.append(head);
      const labels={customerReference:'Customer reference',customerId:'Customer ID',orderDateEpoch:'Order date (UTC)'};
      const format=(field,value)=>{if(value===null)return 'Not present';if(field==='orderDateEpoch'&&typeof value==='number'){const date=new Date(value*1000);if(Number.isFinite(date.valueOf()))return date.toISOString()}return typeof value==='object'?JSON.stringify(value):String(value)};
      const body=document.createElement('tbody');
      for(const change of diff.changes){const row=document.createElement('tr');const field=document.createElement('th');field.scope='row';field.textContent=labels[change.field]??change.field;row.append(field);for(const value of [change.before,change.after]){const cell=document.createElement('td');cell.textContent=format(change.field,value);row.append(cell)}body.append(row)}table.append(body);region.append(table);
      const impact=document.createElement('p');impact.textContent='Current target matches: '+diff.priorState.matchCount+'. Budget ceiling: '+diff.impacts.budget.currency+' '+diff.impacts.budget.upperBound+'. '+diff.rollback.description;region.append(impact);
    }
    async function adminAiRequest(requestKind,replayKey,resultId){const control=byId('admin-ai-effect-control');control.replaceChildren();adminAiEffect=null;renderAdminAiBusinessDiff(null);try{const value=await api('/api/demo/admin-ai/request',{schemaVersion:'chimpmaera.demo/admin-ai-request/v1',actor:'agent:admin-ai-poc',requestKind,replayKey});const d=value.decision;const p=value.proposal;renderAdminAiBusinessDiff(p);byId(resultId).textContent=JSON.stringify({outcome:d.outcome,reasonCode:d.reasonCodes[0],policyDigest:d.policyDigest,businessDiff:p?.businessDiff,businessDiffDigest:p?.businessDiffDigest},null,2);if(d.outcome==='AUTO_GRANT'){adminAiEffect={decision:d,authority:d.authority};addAdminAiButton(control,'Run approved effect',adminAiRunEffect)}else if(d.outcome==='OWNER_ESCALATION'){adminAiEffect={decision:d,proposal:p,authority:null};addAdminAiButton(control,'Approve',()=>adminAiOwnerDecision('APPROVE'));addAdminAiButton(control,'Reject',()=>adminAiOwnerDecision('REJECT'))}}catch(error){byId(resultId).textContent=String(error)}}
    function addAdminAiButton(control,label,handler){const button=document.createElement('button');button.textContent=label;button.onclick=handler;control.append(button)}
    async function adminAiOwnerDecision(ownerDecision){try{const d=adminAiEffect?.decision;if(!d||d.outcome!=='OWNER_ESCALATION')throw new Error('OWNER_ESCALATION_REQUIRED');const value=await api('/api/demo/admin-ai/owner-decision',{decisionDigest:d.decisionDigest,ownerDecision});adminAiEffect.authority=value.authority;byId('admin-ai-effect-result').textContent=JSON.stringify({decisionReceipt:value.decisionReceipt,authority:value.authority},null,2);const control=byId('admin-ai-effect-control');control.replaceChildren();if(ownerDecision==='APPROVE')addAdminAiButton(control,'Run approved effect',adminAiRunEffect)}catch(error){byId('admin-ai-effect-result').textContent=String(error)}}
    async function adminAiRunEffect(){try{const d=adminAiEffect?.decision;const authority=adminAiEffect?.authority;const p=adminAiEffect?.proposal;if(!d||!authority)throw new Error('EXECUTABLE_AUTHORITY_REQUIRED');const value=await api('/api/demo/effects',{action:d.action,actionDigest:d.actionDigest,businessDiff:p?.businessDiff,businessDiffDigest:p?.businessDiffDigest,authority});byId('admin-ai-effect-result').textContent=JSON.stringify({replayed:value.replayed,replayState:value.replayState,readback:value.readback,receipt:value.receipt},null,2)}catch(error){const deniedBeforeEffect=['EXECUTABLE_AUTHORITY_REQUIRED','AUTHENTICATION_REQUIRED','OWNER_EFFECT_ENVELOPE_INVALID_DENIED','OWNER_AUTHORITY_INVALID_DENIED','ACTION_DIGEST_MISMATCH_DENIED'].includes(error?.message);byId('admin-ai-effect-result').textContent=JSON.stringify({state:deniedBeforeEffect?'DENIED':'OUTCOME_UNKNOWN',reason:deniedBeforeEffect?error.message:'No confirmed outcome for this attempt. Check the native effect receipt; do not retry blindly.',thisAttemptReceiptObserved:false},null,2);if(!deniedBeforeEffect)byId('admin-ai-effect-control').replaceChildren()}}
    byId('admin-ai-contact').onclick=()=>adminAiRequest('SYNTHETIC_ESPOCRM_CONTACT_CREATE','admin-ai:poc:ui-contact-001','admin-ai-contact-result');
    byId('admin-ai-order').onclick=()=>adminAiRequest('SYNTHETIC_DOLIBARR_ORDER_CREATE','admin-ai:poc:ui-order-'+Date.now(),'admin-ai-order-result');
    byId('admin-ai-deny').onclick=()=>adminAiRequest('UNDECLARED_PROVIDER_DELETE','admin-ai:poc:ui-deny-001','admin-ai-deny-result');
    byId('run').onclick=()=>act('/api/run');byId('resume').onclick=()=>act('/api/resume');byId('promote').onclick=()=>act('/api/promote');byId('cleanup').onclick=()=>act('/api/cleanup');
    byId('ask').onclick=async()=>{try{byId('answer').textContent=JSON.stringify(await api('/api/ask',{question:byId('question').value}),null,2)}catch(error){byId('answer').textContent=String(error)}};
    refresh();setInterval(refresh,1000);
  </script>
</body>
</html>
`;

export function createPocEarlyAdminDashboardServerV1(
  coordinator: PocEarlyAdminCoordinatorV1,
  host = "127.0.0.1",
): Server {
  assertPocEarlyAdminLoopbackBindV1(host);
  return createServer(async (request, response) => {
    try {
      if (!requestIsLoopback(request)) {
        sendJson(response, 403, { error: "DASHBOARD_FOREIGN_ACCESS_DENIED" });
        return;
      }
      const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
      if (request.method === "GET" && url.pathname === "/") {
        response.writeHead(200, {
          "cache-control": "no-store",
          "content-security-policy":
            "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
          "content-type": "text/html; charset=utf-8",
          "x-content-type-options": "nosniff",
        });
        response.end(DASHBOARD_HTML);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/status") {
        sendJson(response, 200, coordinator.status());
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/effective-rights") {
        sendJson(response, 200, coordinator.permissionXray());
        return;
      }
      const body = request.method === "POST" ? await readJson(request) : {};
      if (request.method === "POST" && url.pathname === "/api/run") {
        const failure = body.failure;
        if (
          failure !== undefined
          && failure !== "CONFIG_DIGEST_MISMATCH"
          && failure !== "TRANSIENT_HEALTH_CHECK_FAILURE"
        ) throw new Error("UNKNOWN_FAILURE_INJECTION_DENIED");
        sendJson(
          response,
          200,
          coordinator.runSyntheticSetup(
            failure as PocEarlyAdminIssueCodeV1 | undefined,
          ),
        );
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/diagnose") {
        sendJson(
          response,
          200,
          coordinator.diagnose(body.issueCode as PocEarlyAdminIssueCodeV1),
        );
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/repair") {
        const plan = body.repairPlan as PocEarlyAdminRepairPlanV1
          ?? coordinator.pendingRepair();
        if (plan === undefined) throw new Error("REPAIR_PLAN_REQUIRED");
        sendJson(
          response,
          200,
          coordinator.applyRepair(plan, body.ownerConfirmed === true),
        );
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/resume") {
        sendJson(response, 200, coordinator.resume());
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/promote") {
        sendJson(response, 200, coordinator.promote());
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/ask") {
        if (typeof body.question !== "string") throw new Error("QUESTION_INVALID");
        sendJson(response, 200, coordinator.ask(body.question));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/cleanup") {
        sendJson(response, 200, coordinator.cleanup());
        return;
      }
      sendJson(response, 404, { error: "NOT_FOUND" });
    } catch (error) {
      const code = error instanceof Error ? error.message : "REQUEST_FAILED";
      sendJson(response, 409, { error: code });
    }
  });
}
