import type { BrowserProfileV1, BrowserProfileWriteV1, BrowserProfileReadV1 } from "../../packages/contracts/src/browser-profile-v1.js";
const valid: BrowserProfileV1 = { schemaVersion: "pansphaira.browser-profile/v1", items: [{ id: "shell.main", version: "1.0.0", visible: true, size: "regular" }] };
const command: BrowserProfileWriteV1 = { expectedRevision: 0, profile: valid };
// @ts-expect-error ownership is never a caller field
const spoof: BrowserProfileWriteV1 = { ...command, tenantId: "tenant-b" };
// @ts-expect-error arbitrary dimensions denied in types and runtime
const size: BrowserProfileV1 = { ...valid, items: [{ id: "shell.main", version: "1.0.0", visible: true, size: "enormous" }] };
// @ts-expect-error secrets are outside presentation
const secret: BrowserProfileV1 = { ...valid, password: "synthetic-not-secret" };
// @ts-expect-error readback revision is numeric and explicit
const read: BrowserProfileReadV1 = { revision: "latest" };
void [command, spoof, size, secret, read];
