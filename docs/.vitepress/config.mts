import { readFileSync } from "node:fs";
import { posix } from "node:path";
import { defineConfig, type HeadConfig } from "vitepress";

const repositoryUrl = "https://github.com/JoFe2/PANSPHAIRA";
const siteUrl = "https://jofe2.github.io/PANSPHAIRA/";
// PAN-LINK-01: repositoryUrl and siteUrl are the canonical owner routes for
// canonical/codeRepository/nav/edit/social, sitemap, robots and OpenGraph
// consumers. The stable repository and Pages path remains /PANSPHAIRA/.
const siteDescription =
  "Open-source local proof of concept for governed, verifiable AI-agent actions across business systems.";
const socialImage = "https://opengraph.githubassets.com/1/JoFe2/PANSPHAIRA";
const releaseMetadata = JSON.parse(
  readFileSync(new URL("../../release/governance.json", import.meta.url), "utf8"),
) as { currentRelease: { tag: string } };

const curatedSitemapPaths = new Set([
  "",
  "alternatives",
  "AGENT-WORK-EVENT-CONTRACT",
  "EXTERNAL-BI-SERVICE",
  "explanation/overview",
  "explanation/architecture-tour",
  "explanation/knowledge-and-reuse",
  "explanation/research-questions",
  "capabilities",
  "CAPABILITY-CELL-ERP-ORDER",
  "examples",
  "EXTENSION-ASSURANCE-PROFILES",
  "INTEGRATION-PROFILES",
  "KNOWN-LIMITATIONS",
  "LOCAL-FILE-KNOWLEDGE-CORPUS",
  "QUICKSTART",
  "RESOURCE-PLANE-PROFILES",
  "UPDATE-MIGRATION-DOCTOR-CONTRACTS",
  "USAGE-INSIGHTS-CONTRACT",
  "roadmap",
  "SECURE-DEFAULT-PROOF",
  "use-cases/crm-erp-approval-readback",
  "use-cases",
  "use-cases/governed-agent-actions",
]);

function publicPath(relativePath: string): string {
  const route = relativePath
    .replace(/(^|\/)index\.md$/, "$1")
    .replace(/\.md$/, "");
  return route ? `${route}` : "";
}

export default defineConfig({
  lang: "en-US",
  title: "PanSphaira",
  description: siteDescription,
  base: "/PANSPHAIRA/",
  outDir: "../dist/docs-site",
  cleanUrls: true,
  lastUpdated: true,
  srcExclude: ["development/**"],
  markdown: {
    config(md) {
      md.core.ruler.push("chimpmaera-repository-links", (state) => {
        for (const token of state.tokens) {
          if (token.type !== "inline" || !token.children) continue;
          for (const child of token.children) {
            if (child.type !== "link_open") continue;
            const hrefIndex = child.attrIndex("href");
            if (hrefIndex < 0) continue;
            const href = child.attrs?.[hrefIndex]?.[1] ?? "";
            if (!href.startsWith("../")) continue;

            const [pathname, fragment = ""] = href.split("#", 2);
            const resolved = posix.normalize(
              posix.join(posix.dirname(state.env.relativePath), pathname),
            );
            if (!resolved.startsWith("../")) continue;

            const repositoryPath = resolved.replace(/^\.\.\//, "");
            const suffix = fragment ? `#${fragment}` : "";
            child.attrSet("href", `${repositoryUrl}/blob/main/${repositoryPath}${suffix}`);
          }
        }
      });
    },
  },
  sitemap: {
    hostname: siteUrl,
    transformItems: (items) => items.filter((item) => {
      const path = item.url.replace(/^https:\/\/jofe2\.github\.io\/PANSPHAIRA\//, "").replace(/\/$/, "");
      return curatedSitemapPaths.has(path);
    }),
  },
  transformHead({ pageData }): HeadConfig[] {
    const route = publicPath(pageData.relativePath);
    const canonicalUrl = new URL(route, siteUrl).href;
    const title = pageData.title ? `${pageData.title} | PanSphaira` : "PanSphaira";
    const description = pageData.description || siteDescription;
    const softwareSourceCode = {
      "@context": "https://schema.org",
      "@type": "SoftwareSourceCode",
      name: "PanSphaira",
      description: siteDescription,
      codeRepository: repositoryUrl,
      url: canonicalUrl,
      license: "https://www.apache.org/licenses/LICENSE-2.0",
      version: releaseMetadata.currentRelease.tag.replace(/^v/, ""),
      runtimePlatform: ["Linux x86_64", "Node.js 24", "Docker Engine with Docker Compose v2"],
      developmentStatus: "active",
    };

    return [
      ["link", { rel: "canonical", href: canonicalUrl }],
      ["meta", { property: "og:type", content: "website" }],
      ["meta", { property: "og:site_name", content: "PanSphaira" }],
      ["meta", { property: "og:title", content: title }],
      ["meta", { property: "og:description", content: description }],
      ["meta", { property: "og:url", content: canonicalUrl }],
      ["meta", { property: "og:image", content: socialImage }],
      ["meta", { name: "twitter:card", content: "summary_large_image" }],
      ["script", { type: "application/ld+json" }, JSON.stringify(softwareSourceCode).replace(/</g, "\\u003c")],
    ];
  },
  themeConfig: {
    nav: [
      { text: "Understand the idea", link: "/explanation/overview" },
      {
        text: "Use cases",
        items: [
          { text: "Application guide", link: "/use-cases/" },
          { text: "Governed agent actions", link: "/use-cases/governed-agent-actions" },
          { text: "CRM → ERP approval and readback", link: "/use-cases/crm-erp-approval-readback" },
        ],
      },
      { text: "Capabilities", link: "/capabilities" },
      { text: "Examples", link: "/examples" },
      { text: "Alternatives", link: "/alternatives" },
      { text: "Roadmap", link: "/roadmap" },
      { text: "Evidence", link: "/SECURE-DEFAULT-PROOF" },
      { text: "GitHub", link: repositoryUrl },
    ],
    sidebar: [
      {
        text: "Start",
        items: [
          { text: "Overview", link: "/" },
          { text: "The ecosystem idea", link: "/explanation/overview" },
          { text: "Application guide", link: "/use-cases/" },
          { text: "Quickstart", link: "/QUICKSTART" },
          { text: "Governed agent actions", link: "/use-cases/governed-agent-actions" },
          { text: "CRM → ERP approval and readback", link: "/use-cases/crm-erp-approval-readback" },
        ],
      },
      {
        text: "Concepts and boundaries",
        items: [
          { text: "Architecture tour", link: "/explanation/architecture-tour" },
          { text: "Knowledge and reuse", link: "/explanation/knowledge-and-reuse" },
          { text: "Research questions", link: "/explanation/research-questions" },
          { text: "Canon", link: "/CANON" },
          { text: "Architecture", link: "/ARCHITECTURE" },
          { text: "Security assurance", link: "/SECURITY-ASSURANCE" },
          { text: "Known limitations", link: "/KNOWN-LIMITATIONS" },
        ],
      },
      {
        text: "Verify",
        items: [
          { text: "Capability evidence", link: "/capabilities" },
          { text: "ERP order capability cell", link: "/CAPABILITY-CELL-ERP-ORDER" },
          { text: "Local file knowledge corpus", link: "/LOCAL-FILE-KNOWLEDGE-CORPUS" },
          { text: "Agent-work event contract", link: "/AGENT-WORK-EVENT-CONTRACT" },
          { text: "External BI service boundary", link: "/EXTERNAL-BI-SERVICE" },
          { text: "Extension assurance profiles", link: "/EXTENSION-ASSURANCE-PROFILES" },
          { text: "Integration profiles", link: "/INTEGRATION-PROFILES" },
          { text: "Resource-plane profiles", link: "/RESOURCE-PLANE-PROFILES" },
          { text: "Update, migration, and Doctor contracts", link: "/UPDATE-MIGRATION-DOCTOR-CONTRACTS" },
          { text: "Usage-insights contract", link: "/USAGE-INSIGHTS-CONTRACT" },
          { text: "Reproducible examples", link: "/examples" },
          { text: "SAFE_GUIDED proof", link: "/SECURE-DEFAULT-PROOF" },
          { text: "Known limitations", link: "/KNOWN-LIMITATIONS" },
        ],
      },
      {
        text: "Choose and follow",
        items: [
          { text: "When to use an alternative", link: "/alternatives" },
          { text: "Now / Next / Later", link: "/roadmap" },
        ],
      },
    ],
    editLink: {
      pattern: `${repositoryUrl}/edit/main/docs/:path`,
      text: "Edit this page on GitHub",
    },
    socialLinks: [{ icon: "github", link: repositoryUrl }],
    search: { provider: "local" },
    footer: {
      message: "Local synthetic proof of concept — not a production release or security certification.",
      copyright: "Licensed under Apache-2.0.",
    },
  },
});
