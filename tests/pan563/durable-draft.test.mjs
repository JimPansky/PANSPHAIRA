import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { pan441EmployeeProfileV1, pan441NarrowProfileReplacementV1 } from '../../dist/packages/contracts/src/pan441-employee-profile.js';
import { bindRuntimeTemplateV1 } from '../../src/pan529/runtime-template-contract.mjs';
import { shapeIdentity527 } from '../pan527/helpers.mjs';
const principal = {tenantId:'tenant-a',subjectId:'synthetic-draft-user',instanceId:'pan527-tls-native-core-tenant-a',generation:1,role:'reader'};
const cmd = (revision, value = 'employee.business.help') => ({schemaVersion:'pansphaira.agent-configuration/answers/v1',expectedRevision:revision,answers:[{field:'goal.purpose',value,confirmation:'CONFIRM'},{field:'data.fields',value:['displayName'],confirmation:'CONFIRM'}]});
test('A2-AC04 durable scoped draft CAS across independent handles and restart; rejected writes have no effects', async () => {
  const {createAgentConfigurationDraftStoreV1} = await import('../../src/pan563/draft-store.mjs');
  const root = mkdtempSync(join(tmpdir(),'pan563-store-')); let first, second, restarted;
  const identity = shapeIdentity527('tenant-a');
  const options = {root,profile:pan441EmployeeProfileV1(),template:bindRuntimeTemplateV1(identity)};
  try {
    first=createAgentConfigurationDraftStoreV1(options); second=createAgentConfigurationDraftStoreV1(options);
    const before=first.read(principal); assert.equal(before.revision,0); assert.equal(before.persisted,false);
    const saved=first.save(cmd(0),principal); assert.equal(saved.revision,1); assert.equal(saved.persisted,true);
    assert.deepEqual(saved.authorityContext,{schemaVersion:'pansphaira.agent-configuration/authority-context/v1',source:'PROTECTED_BACKEND',
      tenantId:principal.tenantId,subjectId:principal.subjectId,instanceId:principal.instanceId,generation:principal.generation,
      authenticatedRole:'reader',draftSaveAllowed:true,executionAuthorityGranted:false});
    assert.throws(()=>first.save({...cmd(1),authorityContext:{tenantId:'tenant-b',authenticatedRole:'reviewer'}},principal),/CONFIGURATION_SCHEMA_DENIED/);
    assert.throws(()=>first.save({...cmd(1),answers:[{field:'context.subjectId',value:'someone-else',confirmation:'CONFIRM'}]},principal),/CONFIGURATION_/);
    assert.throws(()=>second.save(cmd(0,'employee.directory.summary'),principal),/REVISION_CONFLICT/);
    assert.deepEqual(second.read(principal),saved);
    assert.throws(()=>first.save({...cmd(1),tenantId:'tenant-b'},principal),/CONFIGURATION_/);
    assert.throws(()=>first.read({...principal,tenantId:'tenant-b'}),/OWNERSHIP_DENIED/);
    assert.throws(()=>first.read({...principal,instanceId:'different-instance'}),/OWNERSHIP_DENIED/);
    assert.throws(()=>first.read({...principal,generation:2}),/OWNERSHIP_DENIED/);
    assert.equal(first.read({...principal,subjectId:'different-user'}).persisted,false);
    first.close(); first=null; second.close(); second=null;
    restarted=createAgentConfigurationDraftStoreV1(options); assert.deepEqual(restarted.read(principal),saved);
    assert.equal(saved.activationAuthorized,false); assert.equal(saved.configuration.authorityGranted,false);
  } finally {first?.close();second?.close();restarted?.close();rmSync(root,{recursive:true,force:true});}
});
test('A2-AC05 incompatible stored schema is explicitly rejected and original durable bytes are retained',async()=>{
  const {createAgentConfigurationDraftStoreV1}=await import('../../src/pan563/draft-store.mjs');
  const root=mkdtempSync(join(tmpdir(),'pan563-old-schema-'));let store;
  const options={root,profile:pan441EmployeeProfileV1(),template:bindRuntimeTemplateV1(shapeIdentity527('tenant-a'))};
  try{
    store=createAgentConfigurationDraftStoreV1(options);store.save(cmd(0),principal);store.close();store=null;
    const db=new DatabaseSync(join(root,'agent-configuration-drafts-v1.sqlite'));
    const old=JSON.parse(db.prepare('SELECT draft FROM agent_configuration_drafts_v1').get().draft);old.schemaVersion='pansphaira.agent-configuration/draft/v0';
    const bytes=JSON.stringify(old);db.prepare('UPDATE agent_configuration_drafts_v1 SET draft=?').run(bytes);db.close();
    store=createAgentConfigurationDraftStoreV1(options);
    assert.throws(()=>store.read(principal),/CONFIGURATION_SCHEMA_UNSUPPORTED/);assert.throws(()=>store.save(cmd(1),principal),/CONFIGURATION_SCHEMA_UNSUPPORTED/);
    store.close();store=null;const inspect=new DatabaseSync(join(root,'agent-configuration-drafts-v1.sqlite'),{readOnly:true});
    try{assert.equal(inspect.prepare('SELECT draft FROM agent_configuration_drafts_v1').get().draft,bytes);assert.equal(inspect.prepare('SELECT revision FROM agent_configuration_drafts_v1').get().revision,1);}finally{inspect.close();}
  }finally{store?.close();rmSync(root,{recursive:true,force:true});}
});
test('A2-AC05 changed released profile/policy requires explicit reconfirmation and retains previous qualified durable bytes',async()=>{
  const {createAgentConfigurationDraftStoreV1}=await import('../../src/pan563/draft-store.mjs');
  const root=mkdtempSync(join(tmpdir(),'pan563-profile-change-'));let store;
  const options={root,profile:pan441EmployeeProfileV1(),template:bindRuntimeTemplateV1(shapeIdentity527('tenant-a'))};
  function raw(){const db=new DatabaseSync(join(root,'agent-configuration-drafts-v1.sqlite'),{readOnly:true});try{return db.prepare('SELECT revision,draft FROM agent_configuration_drafts_v1').get();}finally{db.close();}}
  try{
    store=createAgentConfigurationDraftStoreV1(options);const saved=store.save(cmd(0),principal);store.close();store=null;const before=raw();
    store=createAgentConfigurationDraftStoreV1({...options,profile:pan441NarrowProfileReplacementV1()});
    assert.throws(()=>store.read(principal),/CONFIGURATION_POLICY_CHANGED_REJECT_REQUIRES_RECONFIRMATION/);
    assert.throws(()=>store.save(cmd(1),principal),/CONFIGURATION_POLICY_CHANGED_REJECT_REQUIRES_RECONFIRMATION/);
    store.close();store=null;assert.deepEqual(raw(),before);
    store=createAgentConfigurationDraftStoreV1(options);assert.deepEqual(store.read(principal),saved);
  }finally{store?.close();rmSync(root,{recursive:true,force:true});}
});
