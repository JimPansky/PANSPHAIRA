import { build } from "esbuild";
// Reuse the dependency already in the existing lock; no external runtime import.
if (process.argv.length !== 2) throw new Error("PAN541_BROWSER_BUILD_ARGUMENT_DENIED");
// Keep the existing 131072-byte protected document limit. Whitespace-only
// minification preserves identifiers and the same module graph/behaviour; do not
// raise that ingress bound as the additive context adapter grows the bundle.
await build({ entryPoints: ["packages/browser-workspace/src/app.ts"], bundle: true, format: "esm", target: "es2022", outfile: "dist/browser-workspace/app.js", sourcemap: false, minify: false, minifyWhitespace: true, legalComments: "none" });
