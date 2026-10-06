import assert from "node:assert/strict";
import test from "node:test";
import { financeFixture } from "../pan519/native-fixture.mjs";
import { nativeRows } from "../fixtures/pan515/native-trade-fixture.mjs";

let backend;
try { backend = await import("../../src/pan541/native-erv-read-adapter.mjs"); }
catch (error) { if (error.code !== "ERR_MODULE_NOT_FOUND") throw error; }

test("PUI-01-AC03 native read-only ERV adapter projects actual leading SQLite history without creating a shadow ledger", async () => {
  assert.equal(typeof backend?.createNativeErvReadAdapterV1, "function", "PAN541_REAL_NATIVE_ERV_READ_ADAPTER_NOT_IMPLEMENTED");
  const fixture = await financeFixture();
  try {
    const before = nativeRows(fixture.root, "SELECT revision,effect_key,command,event FROM pan516_events ORDER BY revision");
    const reader = backend.createNativeErvReadAdapterV1({ tenantId: "tenant-a", root: fixture.root });
    assert.equal(backend.isNativeErvReadAdapterV1(reader, "tenant-a"), true);
    assert.equal(backend.isNativeErvReadAdapterV1(reader, "tenant-b"), false);
    const value = reader.read({ tenantId: "tenant-a", objectId: "AP-PAN516-MATCHED-01", expectedRevision: null });
    assert.equal(value.schemaVersion, "pansphaira.browser-erv-read/v1");
    assert.equal(value.invoiceId, "AP-PAN516-MATCHED-01");
    assert.equal(value.leadingStore, "PAN472_TARGET_SQLITE");
    assert.equal(value.readOnly, true);
    assert.equal(value.status, "RELEASED_LOCAL_SYNTHETIC");
    assert.equal(value.decisionOutcome, "MATCHED");
    assert.equal(value.invoiceAmountMinor, 60000); assert.equal(value.expectedAmountMinor, 60000);
    assert.equal(value.acceptedQuantity, 10); assert.equal(value.invoicedQuantity, 10);
    assert.equal(value.revision, before.length);
    assert.match(value.basisDigest, /^[a-f0-9]{64}$/);
    assert.equal(value.bookingAuthorityGranted, false); assert.equal(value.paymentOrderAuthorized, false);
    assert.throws(() => reader.read({ tenantId: "tenant-b", objectId: value.invoiceId, expectedRevision: null }), /ERV_TENANT_BINDING_DENIED/);
    assert.throws(() => reader.read({ tenantId: "tenant-a", objectId: "unknown-invoice", expectedRevision: null }), /ERV_OBJECT_BINDING_DENIED/);
    assert.throws(() => reader.read({ tenantId: "tenant-a", objectId: value.invoiceId, expectedRevision: value.revision - 1 }), /ERV_OBJECT_REVISION_STALE/);
    assert.deepEqual(reader.read({ tenantId: "tenant-a", objectId: value.invoiceId, expectedRevision: value.revision }), value);
    assert.deepEqual(nativeRows(fixture.root, "SELECT revision,effect_key,command,event FROM pan516_events ORDER BY revision"), before);
  } finally { fixture.close(); }
});

test("PUI-01 native owner marker denies absent tenant and unowned facade even when both lookup values are undefined", () => {
  for (const value of [{}, null, undefined, "not-an-owned-adapter"]) {
    assert.equal(backend.isNativeErvReadAdapterV1(value, undefined), false, "UNOWNED_ADAPTER_WITH_UNDEFINED_TENANT_MUST_NOT_BE_BRANDED");
    assert.equal(backend.isNativeErvReadAdapterV1(value, "tenant-a"), false);
  }
});
