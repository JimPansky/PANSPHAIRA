import { readFileSync } from "node:fs";
import { mountProtectedGuidedDocumentV1, protectedGuidedOwnerContextV1 } from "../pan527/origin-session-adapter.mjs";
import { runtimeIdentityDigestV1, validateRuntimeIdentityV1 } from "../pan526/runtime-contract.mjs";
import { createGuidedNativeOwnerV1 } from "./native-journey-controller.mjs";
import { createGuidedHelperBrokerV1 } from "./guided-helper-broker.mjs";

// Deliberate owner-local opt-in on the existing HTTPS product server. Neither
// this function nor any session/role/template can be supplied by browser JSON.
export async function enableGuidedBrowserJourneyV1(options) {
  const ds = options && Object.getOwnPropertyDescriptors(options);
  if (!ds || Object.getPrototypeOf(options) !== Object.prototype || JSON.stringify(Reflect.ownKeys(ds).sort()) !== JSON.stringify(["gateway", "optIn", "origin", "tenants"])
    || Object.values(ds).some(d => !d.enumerable || d.get || d.set) || options.optIn !== true || !Array.isArray(options.tenants) || options.tenants.length < 1 || options.tenants.length > 8) throw new Error("GUIDED_BROWSER_OWNER_DENIED");
  const assets = Object.fromEntries(["html", "script", "style"].map((key, index) => [key, readFileSync(new URL(["./screen.html", "./app.js", "./style.css"][index], import.meta.url), "utf8")]));
  const mounts = []; const owners = new Map();
  try {
    for (const spec of options.tenants) {
      const identity = validateRuntimeIdentityV1(spec.identity);
      if (identity.authorityProfile !== "SAFE_GUIDED") throw new Error("GUIDED_BROWSER_SAFE_GUIDED_REQUIRED");
      const ownerBinding = { optIn: true, tenantId: identity.tenantId, identityDigest: runtimeIdentityDigestV1(identity), origin: options.origin };
      const context = protectedGuidedOwnerContextV1(options.gateway, ownerBinding);
      const owner = createGuidedNativeOwnerV1({ optIn: true, identity: context.identity, parentRoot: context.productRoot, probeMode: "NORMAL" });
      owners.set(identity.tenantId, owner);
      const journey = createGuidedHelperBrokerV1({ optIn: true, identity: context.identity, nativeClient: owner.client });
      mounts.push(mountProtectedGuidedDocumentV1(options.gateway, { ...ownerBinding, ...assets, journey }));
    }
    return Object.freeze({ nativeOwner(tenantId) { const owner = owners.get(tenantId); if (!owner) throw new Error("GUIDED_NATIVE_TENANT_DENIED"); return owner; },
      async close() {
        for (const mount of [...mounts].reverse()) mount.close();
        const retainedUnknownTenants = [];
        for (const [tenantId, owner] of owners) {
          const current = owner.client.readback();
          if (current.status === "OUTCOME_UNKNOWN" || !current.childCompleted) { const stopped = await owner.owner.suspend(); if (stopped.status === "OUTCOME_UNKNOWN") retainedUnknownTenants.push(tenantId); else owner.owner.cleanup(); }
          else owner.owner.cleanup();
        }
        return Object.freeze({ retainedUnknownTenants: Object.freeze(retainedUnknownTenants) });
      } });
  } catch (error) { for (const mount of [...mounts].reverse()) mount.close(); for (const owner of owners.values()) owner.owner.cleanup(); throw error; }
}
