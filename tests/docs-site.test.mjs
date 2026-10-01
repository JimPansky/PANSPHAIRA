import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const output = join(process.cwd(), "dist", "docs-site");
const baseUrl = "https://jofe2.github.io/PANSPHAIRA/";
const curatedPages = [
  ["index.html", baseUrl],
  ["alternatives.html", `${baseUrl}alternatives`],
  ["AGENT-WORK-EVENT-CONTRACT.html", `${baseUrl}AGENT-WORK-EVENT-CONTRACT`],
  ["CAPABILITY-CELL-ERP-ORDER.html", `${baseUrl}CAPABILITY-CELL-ERP-ORDER`],
  ["EXTERNAL-BI-SERVICE.html", `${baseUrl}EXTERNAL-BI-SERVICE`],
  ["explanation/overview.html", `${baseUrl}explanation/overview`],
  ["explanation/architecture-tour.html", `${baseUrl}explanation/architecture-tour`],
  ["explanation/knowledge-and-reuse.html", `${baseUrl}explanation/knowledge-and-reuse`],
  ["explanation/research-questions.html", `${baseUrl}explanation/research-questions`],
  ["capabilities.html", `${baseUrl}capabilities`],
  ["examples.html", `${baseUrl}examples`],
  ["EXTENSION-ASSURANCE-PROFILES.html", `${baseUrl}EXTENSION-ASSURANCE-PROFILES`],
  ["INTEGRATION-PROFILES.html", `${baseUrl}INTEGRATION-PROFILES`],
  ["KNOWN-LIMITATIONS.html", `${baseUrl}KNOWN-LIMITATIONS`],
  ["LOCAL-FILE-KNOWLEDGE-CORPUS.html", `${baseUrl}LOCAL-FILE-KNOWLEDGE-CORPUS`],
  ["QUICKSTART.html", `${baseUrl}QUICKSTART`],
  ["RESOURCE-PLANE-PROFILES.html", `${baseUrl}RESOURCE-PLANE-PROFILES`],
  ["roadmap.html", `${baseUrl}roadmap`],
  ["SECURE-DEFAULT-PROOF.html", `${baseUrl}SECURE-DEFAULT-PROOF`],
  ["UPDATE-MIGRATION-DOCTOR-CONTRACTS.html", `${baseUrl}UPDATE-MIGRATION-DOCTOR-CONTRACTS`],
  ["USAGE-INSIGHTS-CONTRACT.html", `${baseUrl}USAGE-INSIGHTS-CONTRACT`],
  ["use-cases/crm-erp-approval-readback.html", `${baseUrl}use-cases/crm-erp-approval-readback`],
  ["use-cases/index.html", `${baseUrl}use-cases/`],
  ["use-cases/governed-agent-actions.html", `${baseUrl}use-cases/governed-agent-actions`],
];

function html(relativePath) {
  return readFileSync(join(output, relativePath), "utf8");
}

function attribute(source, selector) {
  const match = source.match(selector);
  assert.ok(match, `missing metadata: ${selector}`);
  return match[1];
}

test("curated pages have unique canonical, description, OpenGraph, and SoftwareSourceCode metadata", () => {
  const titles = new Set();
  const descriptions = new Set();

  for (const [path, canonical] of curatedPages) {
    const source = html(path);
    assert.equal(attribute(source, /<link rel="canonical" href="([^"]+)"/), canonical);
    assert.equal(attribute(source, /<meta property="og:url" content="([^"]+)"/), canonical);
    assert.match(source, /<meta property="og:image" content="https:\/\/opengraph\.githubassets\.com\/1\/JoFe2\/PANSPHAIRA"/);
    assert.match(source, /<meta name="twitter:card" content="summary_large_image"/);

    const title = attribute(source, /<meta property="og:title" content="([^"]+)"/);
    const description = attribute(source, /<meta property="og:description" content="([^"]+)"/);
    assert.equal(attribute(source, /<meta property="og:site_name" content="([^"]+)"/), "PanSphaira");
    assert.match(title, /\| PanSphaira$/);
    assert.ok(!titles.has(title), `duplicate title: ${title}`);
    assert.ok(!descriptions.has(description), `duplicate description: ${description}`);
    titles.add(title);
    descriptions.add(description);

    const jsonLd = attribute(source, /<script type="application\/ld\+json">([^<]+)<\/script>/);
    const metadata = JSON.parse(jsonLd);
    assert.equal(metadata["@type"], "SoftwareSourceCode");
    assert.equal(metadata.name, "PanSphaira");
    assert.equal(metadata.codeRepository, "https://github.com/JoFe2/PANSPHAIRA");
    assert.equal(metadata.url, canonical);
    assert.equal(metadata.license, "https://www.apache.org/licenses/LICENSE-2.0");
    assert.match(metadata.version, /^0\.2\.0-poc\./);
    assert.equal(metadata.developmentStatus, "active");
    assert.doesNotMatch(source, /href="https:\/\/jofe2\.github\.io\/(?:tools|tests|demo|release)\//);
  }
});

test("sitemap and robots expose only the curated public surface", () => {
  const sitemap = readFileSync(join(output, "sitemap.xml"), "utf8");
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]).sort();
  assert.deepEqual(urls, curatedPages.map(([, canonical]) => canonical).sort());
  assert.doesNotMatch(sitemap, /\/development\//);

  const robots = readFileSync(join(output, "robots.txt"), "utf8");
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /^Sitemap: https:\/\/jofe2\.github\.io\/PANSPHAIRA\/sitemap\.xml$/m);
});

test("development evidence is excluded from the generated site", () => {
  const generated = readdirSync(output, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name));
  assert.ok(generated.every((path) => !path.includes("/development/")));
});

test("intent content stays evidence-linked, honest, and reachable from the home page", () => {
  const intentSources = [
    "docs/alternatives.md",
    "docs/roadmap.md",
    "docs/use-cases/crm-erp-approval-readback.md",
  ];
  const governance = JSON.parse(readFileSync(join(process.cwd(), "release", "governance.json"), "utf8"));
  const publicManifest = readFileSync(join(process.cwd(), "release", "public-files.manifest"), "utf8");
  for (const source of intentSources) {
    assert.ok(governance.activePublicFiles.includes(source), `${source} is outside public-truth drift coverage`);
    assert.match(publicManifest, new RegExp(`^${source.replaceAll(".", "\\.")}\\t`, "m"));
  }

  const home = html("index.html");
  const homeRoutes = new Set([...home.matchAll(/href="([^"]+)"/g)].map(([, href]) => new URL(href, baseUrl).pathname.replace(/\/$/, "")));
  for (const route of [
    "/PANSPHAIRA/QUICKSTART",
    "/PANSPHAIRA/SECURE-DEFAULT-PROOF",
    "/PANSPHAIRA/KNOWN-LIMITATIONS",
    "/PANSPHAIRA/use-cases/crm-erp-approval-readback",
    "/PANSPHAIRA/alternatives",
    "/PANSPHAIRA/roadmap",
  ]) {
    assert.ok(homeRoutes.has(route), `Home route missing: ${route}`);
  }
  assert.match(home, /github\.com\/JoFe2\/PANSPHAIRA\/discussions\/categories\/q-a/);
  assert.match(home, /github\.com\/JoFe2\/PANSPHAIRA\/blob\/main\/CONTRIBUTING\.md/);

  const crmErp = html("use-cases/crm-erp-approval-readback.html");
  assert.match(crmErp, /CM-SEC-007/);
  assert.match(crmErp, /Transport acceptance alone/);
  assert.match(crmErp, /fictional/);
  assert.match(crmErp, /does not prove live EspoCRM or Dolibarr compatibility/);

  const alternatives = html("alternatives.html");
  for (const category of ["workflow engine", "policy engine", "Agent framework", "sandbox", "observability platform"]) {
    assert.match(alternatives, new RegExp(category, "i"));
  }
  assert.match(alternatives, /makes no measured speed, adoption, security, or superiority comparison/);

  const roadmap = html("roadmap.html");
  assert.match(roadmap, /not a second backlog/);
  assert.match(roadmap, /not evidence that a capability is released/);
  for (const issue of [3, 9, 32, 36, 41, 43, 45]) {
    assert.match(roadmap, new RegExp(`github\\.com/JoFe2/PANSPHAIRA/issues/${issue}`));
  }

  for (const [path] of curatedPages) {
    const source = html(path);
    assert.doesNotMatch(source, /production[- ]ready|customer deployment|guaranteed security|universally secure|market-leading/i);
  }
});

test("Pages delivery uses immutable actions and least-privilege job permissions", () => {
  const workflow = readFileSync(join(process.cwd(), ".github", "workflows", "docs-pages.yml"), "utf8");
  const actionRefs = [...workflow.matchAll(/^\s*uses:\s*\S+@([^\s#]+)/gm)].map((match) => match[1]);
  assert.ok(actionRefs.length >= 3);
  assert.ok(actionRefs.every((reference) => /^[a-f0-9]{40}$/.test(reference)));
  assert.match(workflow, /build:[\s\S]*?permissions:\n\s+contents: read/);
  assert.match(workflow, /deploy:[\s\S]*?permissions:\n\s+pages: write\n\s+id-token: write/);
  assert.equal(
    workflow.match(/if: github\.ref == 'refs\/heads\/main' && github\.event_name != 'pull_request'/g)?.length,
    2,
  );
  assert.doesNotMatch(workflow, /permissions:\s*write-all/);
});

test("R1 assurance deep-links resolve to actual built fragment IDs for all three routes", () => {
  const target = html("SECURITY-ASSURANCE.html").replace(/<script\b[\s\S]*?<\/script>/gi, "");
  const targetIds = new Set([...target.matchAll(/<[A-Za-z][^>]*\bid="([^"]+)"/g)].map((match) => match[1]));
  for (const path of ["capabilities.html", "roadmap.html", "use-cases/crm-erp-approval-readback.html"]) {
    const links = [...html(path).matchAll(/\bhref="([^"]+)"/g)]
      .map((match) => new URL(match[1], `${baseUrl}${path}`))
      .filter((link) => ["/PANSPHAIRA/SECURITY-ASSURANCE", "/PANSPHAIRA/SECURITY-ASSURANCE.html"].includes(link.pathname) && link.hash);
    assert.equal(links.length, 1, `Expected the existing assurance fragment route in ${path}`);
    for (const link of links) {
      assert.equal(link.hash, "#locally-validated-synthetic-evidence", `Compatible assurance fragment must not silently change in ${path}`);
      assert.ok(targetIds.has(link.hash.slice(1)), `${path} assurance fragment has no actual built target: ${link.hash}`);
    }
  }
});

test("R1 reading routes retain public coverage and source-bound accessible diagrams", () => {
  const source = (path) => readFileSync(join(process.cwd(), path), "utf8");
  const governance = JSON.parse(source("release/governance.json"));
  const manifest = source("release/public-files.manifest");
  const readme = source("README.md");
  assert.equal(createHash("sha256").update(readme).digest("hex"), "fcb6619af13ffd9ec8e5f17ed7c4f105d50f7e9d21962d1bf1cd079e97c45c3f");
  assert.equal(readme.match(/```mermaid\n([\s\S]*?)\n```/)[1].trim(), source("docs/diagrams/concept-loop.mmd").trim());
  for (const alias of ["adapt-incoming-invoice-processing-to-the-controls-the-situation-needs", "let-ai-agents-ask-better-bi-questions-with-kaleidosphere", "keep-the-business-capability-stable-while-provider-details-change", "adaptive-knowledge-engineering", "proof-today", "evidence-and-scope", "releases"]) {
    assert.ok(readme.includes(`<a id="${alias}"></a>`), `Compatibility anchor missing: ${alias}`);
  }
  for (const path of ["explanation/overview", "explanation/architecture-tour", "explanation/knowledge-and-reuse", "explanation/research-questions", "use-cases/index"]) {
    assert.ok(governance.activePublicFiles.includes(`docs/${path}.md`));
    assert.ok(manifest.includes(`docs/${path}.md\tdocs/${path}.md\t0644`));
    assert.match(html(`${path}.html`), /class="VPDoc/);
  }
  const diagramPins = {
    "concept-loop": "5c9a83a01a031cf5df8b49d7b06ba7be40fd4e2f0eb4c3edf2d50bb2ac151b44",
    "controlled-effect": "62e41dfdfbec5964a14590d5bebc032e6a899cc48e829edd6f1015f7cda8ea30",
    "knowledge-lifecycle": "7eb50f45f2bc6a8c0309189a3bef94ab779e787f0c6009ab7f47a2bdb9bf65c3",
    "provider-adaptation": "67f098119c8550c2fedc615259286fb1ea4b0ea991516fb1830e171cc750c93e",
  };
  for (const [name, pin] of Object.entries(diagramPins)) {
    const svg = source(`docs/diagrams/${name}.svg`);
    const mermaid = source(`docs/diagrams/${name}.mmd`);
    assert.equal(createHash("sha256").update(svg).digest("hex"), pin);
    assert.match(svg, /aria-labelledby="[^"]+"/);
    assert.match(svg, /aria-describedby="[^"]+"/);
    assert.match(svg, /viewBox="[^"]+"/);
    assert.ok(svg.includes(mermaid.match(/accTitle: (.+)/)[1]));
    assert.ok(svg.includes(mermaid.match(/accDescr: (.+)/)[1]));
    assert.doesNotMatch(svg, /<script\b|\bonload=|(?:href|src)="https?:\/\//i);
    for (const extension of ["mmd", "svg"]) assert.ok(manifest.includes(`docs/diagrams/${name}.${extension}\tdocs/diagrams/${name}.${extension}\t0644`));
  }
});
