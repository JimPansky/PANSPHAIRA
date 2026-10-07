import { createAgentConfigurationDraftStoreV1 } from '../../src/pan563/draft-store.mjs';
import { pan441EmployeeProfileV1 } from '../../dist/packages/contracts/src/pan441-employee-profile.js';
import { bindRuntimeTemplateV1 } from '../../src/pan529/runtime-template-contract.mjs';
import { shapeIdentity527 } from '../pan527/helpers.mjs';
const principal={tenantId:'tenant-a',subjectId:'synthetic-process-user',instanceId:'pan527-tls-native-core-tenant-a',generation:1,role:'reader'};
const store=createAgentConfigurationDraftStoreV1({root:process.argv[2],profile:pan441EmployeeProfileV1(),template:bindRuntimeTemplateV1(shapeIdentity527('tenant-a'))});
try {
  if(process.argv[3] === 'read') console.log(JSON.stringify(store.read(principal)));
  else {
    process.send?.({ready:true});
    process.on('message',()=>{
      try {console.log(JSON.stringify({outcome:'SAVED',readback:store.save({schemaVersion:'pansphaira.agent-configuration/answers/v1',expectedRevision:0,answers:[{field:'goal.purpose',value:'employee.business.help',confirmation:'CONFIRM'},{field:'data.fields',value:['displayName'],confirmation:'CONFIRM'}]},principal)}));}
      catch(e){console.log(JSON.stringify({outcome:e.message}));}
      finally{store.close();process.disconnect();}
    });
  }
}finally{if(process.argv[3] === 'read')store.close();}
