import { build } from "esbuild";
// Reuse the dependency already in the existing lock; no external runtime import.
if (process.argv.length !== 2) throw new Error("PAN541_BROWSER_BUILD_ARGUMENT_DENIED");
// Retain the existing 131072-byte protected ingress limit and locked compiler.
// Native view/controller growth is compiled with identifier/syntax/whitespace
// minification and UTF-8, not a larger limit or a replacement runtime. Native,
// browser and retained-consumer qualification remain separate from byte fit.
// Same locked compiler and original per-asset bounds. Optional native Human
// controls are a closed same-origin module, not an oversized default script.
// Report the sum separately; splitting is NOT KS single-bundle acceptance.
for (const [entry,outfile] of [["app","app"],["erv-human-v1","erv-human"],["workspace-agent-panel-v1","workspace-agent-panel"],["workspace-invoice-navigation-v1","workspace-invoice-navigation"],["workspace-model-connection-v1","workspace-model-connection"]]) {
  await build({ entryPoints: ["packages/browser-workspace/src/"+entry+".ts"], bundle: true, format: "esm", target: "es2022", outfile: "dist/browser-workspace/"+outfile+".js", sourcemap: false, minify: false, minifyWhitespace: true, minifyIdentifiers: true, minifySyntax: true, charset: "utf8", legalComments: "none" });
}
