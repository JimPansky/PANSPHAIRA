import { build } from "esbuild";
// Reuse the dependency already in the existing lock; no external runtime import.
if (process.argv.length !== 2) throw new Error("PAN541_BROWSER_BUILD_ARGUMENT_DENIED");
await build({ entryPoints: ["packages/browser-workspace/src/app.ts"], bundle: true, format: "esm", target: "es2022", outfile: "dist/browser-workspace/app.js", sourcemap: false, minify: false, legalComments: "none" });
