import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { nativeFixture527 } from '../pan527/helpers.mjs';
import { financeFixture } from '../pan519/native-fixture.mjs';
import { pan441EmployeeProfileV1 } from '../../dist/packages/contracts/src/pan441-employee-profile.js';
import { bindRuntimeTemplateV1 } from '../../src/pan529/runtime-template-contract.mjs';
import { protectedGuidedOwnerContextV1 } from '../../src/pan527/origin-session-adapter.mjs';
import { createNativeErvReadAdapterV1 } from '../../src/pan541/native-erv-read-adapter.mjs';
import { enableWorkspaceBrowserV1 } from '../../src/pan541/workspace-browser.mjs';
import { createAgentConfigurationDraftStoreV1 } from '../../src/pan563/draft-store.mjs';
export async function draftWorkspaceFixture() {
  const tls=await nativeFixture527();let native,store,workspace;
  try {
    native=await financeFixture();
    const sessions=tls.gateway.sessionAdapter('tenant-a');
    const owner=protectedGuidedOwnerContextV1(tls.gateway,{optIn:true,tenantId:'tenant-a',origin:tls.origin,identityDigest:sessions.binding.identityDigest});
    const root=join(owner.productRoot,'configuration-drafts');mkdirSync(root,{mode:0o700});
    const options={root,profile:pan441EmployeeProfileV1(),template:bindRuntimeTemplateV1(owner.identity)};
    store=createAgentConfigurationDraftStoreV1(options);
    const reader=createNativeErvReadAdapterV1({tenantId:'tenant-a',root:native.root});
    const mount=()=>enableWorkspaceBrowserV1({optIn:true,gateway:tls.gateway,tenantId:'tenant-a',origin:tls.origin,nativeReader:reader,configurationDrafts:store});
    workspace=mount();
    return {...tls,native,options,get store(){return store;},async restartDraftBackend(){workspace.close();store.close();store=createAgentConfigurationDraftStoreV1(options);workspace=mount();},
      async close(){workspace?.close();store?.close();native?.close();await tls.close();}};
  }catch(e){workspace?.close();store?.close();native?.close();await tls.close();throw e;}
}
