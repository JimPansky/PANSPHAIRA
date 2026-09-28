import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateIncomingInvoiceAp06ProofProbeV2 } from "../dist/packages/contracts/src/index.js";

const root = process.cwd();
const probePath = resolve(root, "verification/incoming-invoice-ap06-proof-probe-v2.json");
const probeV1Path = resolve(root, "verification/incoming-invoice-ap06-proof-probe-v1.json");
const expectationsPath = resolve(root, "tests/fixtures/incoming-invoice/ap-02-extraction-dataflow-expectations-v1.json");
const sourceManifestPath = resolve(root, "tests/fixtures/incoming-invoice/source-manifest-v1.json");
// Byte-identical v1-frozen predecessor sources; every entry reads from the repo path it names.
const sourceFiles = [
  ["ap01-blueprint-source-v1", "packages/contracts/src/incoming-invoice-blueprint.ts"],
  ["ap02-intake-source-v1", "packages/contracts/src/incoming-invoice-intake.ts"],
  ["ap02-intake-source-v1", "tests/fixtures/incoming-invoice/supplier-invoice-v1.txt"],
  ["extraction-benchmark-source-v1", "packages/contracts/src/incoming-invoice-extraction-benchmark.ts"],
  ["ap03-holdout-source-v1", "tests/fixtures/incoming-invoice/ap-03-holdout-v1.json"],
  ["ap04-erv-core-v1", "packages/contracts/src/incoming-invoice-erv.ts"],
  ["ap04-erv-core-v1", "tests/fixtures/incoming-invoice/ap-04-erv-cases-v1.json"],
  ["ap04-erv-core-v1", "schemas/contracts/incoming-invoice-erv-v1.schema.json"],
  ["pan365-adaptive-ui-source-v1", "packages/contracts/src/incoming-invoice-adaptive-ui.ts"],
  ["pan365-ap05-receipt-manifest-source-v1", "packages/contracts/src/incoming-invoice-ap05-receipt-manifest.ts"],
  ["pan488-extraction-dataflow-source-v1", "packages/contracts/src/incoming-invoice-extraction-dataflow-v2.ts"],
];

const expectations = JSON.parse(readFileSync(expectationsPath, "utf8"));
const manifest = JSON.parse(readFileSync(sourceManifestPath, "utf8"));
const documentBytes = Uint8Array.from(readFileSync(resolve(root, expectations.documentPath)));
const input = {
  predecessorSources: sourceFiles.map(([releaseId, path]) => ({ releaseId, path, bytes: Uint8Array.from(readFileSync(resolve(root, path))) })),
  historicalProbeV1Bytes: Uint8Array.from(readFileSync(probeV1Path)),
  dataflowInput: {
    intakeRequest: {
      schemaVersion: "chimpmaera.incoming-invoice/intake-request/v1",
      blueprintSchemaVersion: "chimpmaera.incoming-invoice/blueprint/v1",
      requestedAuthority: "LOCAL_SYNTHETIC_PROOF",
      requestedEffects: ["READ_SYNTHETIC", "WRITE_LOCAL_PROOF"],
      fileName: manifest.fileName,
      mediaType: manifest.mediaType,
      bytes: documentBytes,
      claimedSha256: manifest.sha256,
      provenance: structuredClone(manifest.provenance),
      metadata: {
        documentId: "doc:synthetic:ap-02:supplier-invoice-v1",
        versionOrdinal: 1,
        documentKind: "SUPPLIER_INVOICE",
        issueDate: "2026-09-02",
        currency: "EUR",
      },
      identityCandidates: [structuredClone(manifest.declaredIdentity)],
    },
    ervCasePackBytes: Uint8Array.from(readFileSync(resolve(root, expectations.ervCasePackPath))),
    counterparty: structuredClone(expectations.counterparty),
    matchingMode: structuredClone(expectations.matchingMode),
    tolerancePolicy: structuredClone(expectations.tolerancePolicy),
  },
};

async function main() {
  const generated = await generateIncomingInvoiceAp06ProofProbeV2(input);
  if (process.argv.includes("--check")) {
    const existing = readFileSync(probePath, "utf8");
    if (existing !== generated.serialized) {
      process.stderr.write("AP-06 v2 proof probe is not reproducible from released sources\n");
      process.exitCode = 1;
    } else {
      process.stdout.write(`${generated.probe.proofProbeDigest}\n`);
    }
  } else {
    writeFileSync(probePath, generated.serialized, "utf8");
    process.stdout.write(`${probePath}\n${generated.probe.proofProbeDigest}\n`);
  }
}

await main();
