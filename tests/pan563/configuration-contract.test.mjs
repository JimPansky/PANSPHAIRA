import test from 'node:test';
import assert from 'node:assert/strict';
import { pan441EmployeeProfileV1 } from '../../dist/packages/contracts/src/pan441-employee-profile.js';
import { bindRuntimeTemplateV1 } from '../../src/pan529/runtime-template-contract.mjs';
import { shapeIdentity527 } from '../pan527/helpers.mjs';
const load = () => import('../../dist/packages/contracts/src/agent-configuration-draft-v1.js');
const answer = (field, value, confirmation = 'CONFIRM') => ({ field, value, confirmation });
const command = answers => ({ schemaVersion: 'pansphaira.agent-configuration/answers/v1', expectedRevision: 0, answers });
async function fixture() {
  const api = await load();
  const policy = api.bindAgentConfigurationPolicyV1(pan441EmployeeProfileV1(), bindRuntimeTemplateV1(shapeIdentity527('tenant-a')));
  return { api, policy, draft: api.createAgentConfigurationDraftV1(policy) };
}
test('A2-AC01/02 closed typed fields cover all groups and explicit schema/adapter versions, including provenance and checks', async () => {
  const { api, policy, draft } = await fixture();
  assert.equal(policy.adapterVersion, 'pan441-pan529/v1');
  assert.deepEqual(new Set(Object.values(policy.fields).map(f => f.group)), new Set(['context','goal','runtime','model','access','data','tools','work','budget','persistence','modules']));
  for (const [field, definition] of Object.entries(policy.fields)) {
    for (const key of ['type','allowedValues','requiredWhen','validator','sensitivity','dependencies']) assert.ok(Object.hasOwn(definition,key), field + ':' + key);
    for (const key of ['value','source','confirmation','validation']) assert.ok(Object.hasOwn(draft.fields[field], key));
  }
  assert.equal(api.evaluateAgentConfigurationDraftV1(draft,policy).configuration, null);
  assert.deepEqual(api.evaluateAgentConfigurationDraftV1(draft,policy).questions.map(q => q.field), ['goal.purpose']);
});
test('A2-AC03 no UNKNOWN default; contradiction remains unresolved; confirmed current answers not asked again', async () => {
  const { api, policy, draft } = await fixture();
  const unknown = api.applyAgentConfigurationAnswersV1(draft, command([answer('goal.purpose',null,'UNKNOWN')]), policy);
  assert.equal(api.evaluateAgentConfigurationDraftV1(unknown,policy).configuration, null);
  const contradicted = api.applyAgentConfigurationAnswersV1(draft,command([answer('goal.purpose','employee.business.help'),answer('goal.purpose','employee.directory.summary')]),policy);
  assert.equal(contradicted.fields['goal.purpose'].confirmation,'CONTRADICTED');
  assert.equal(api.evaluateAgentConfigurationDraftV1(contradicted,policy).questions[0].reason,'CONTRADICTION');
  const first = api.applyAgentConfigurationAnswersV1(draft, command([answer('goal.purpose','employee.business.help')]),policy);
  assert.deepEqual(api.evaluateAgentConfigurationDraftV1(first,policy).questions.map(q => q.field), ['data.fields']);
  const ready = api.applyAgentConfigurationAnswersV1(first,command([answer('data.fields',['displayName','department'])]),policy);
  assert.deepEqual(api.evaluateAgentConfigurationDraftV1(ready,policy).questions,[]);
  assert.ok(api.evaluateAgentConfigurationDraftV1(ready,policy).configuration);
});
test('A2-AC03 exactly affected answers/checks are invalidated, unchanged values preserve checks and independent settings', async () => {
  const { api, policy, draft } = await fixture();
  const ready = api.applyAgentConfigurationAnswersV1(draft,command([answer('goal.purpose','employee.business.help'),answer('data.fields',['displayName'])]),policy);
  const change = api.applyAgentConfigurationAnswersV1(ready,command([answer('goal.purpose','employee.directory.summary')]),policy);
  assert.equal(change.fields['data.fields'].confirmation,'STALE');
  assert.equal(change.fields['data.fields'].validation.status,'STALE');
  for (const field of Object.keys(ready.fields).filter(f => !['goal.purpose','data.fields'].includes(f))) assert.deepEqual(change.fields[field],ready.fields[field],field);
  const same = api.applyAgentConfigurationAnswersV1(ready,command([answer('goal.purpose','employee.business.help')]),policy);
  assert.deepEqual(same,ready);
});
test('A2-AC04 equivalent confirmed values and answer order normalize byte-identically', async () => {
  const { api, policy, draft } = await fixture();
  const a = [answer('goal.purpose','employee.business.help'),answer('data.fields',['department','displayName'])];
  const left = api.evaluateAgentConfigurationDraftV1(api.applyAgentConfigurationAnswersV1(draft,command(a),policy),policy);
  const right = api.evaluateAgentConfigurationDraftV1(api.applyAgentConfigurationAnswersV1(draft,command([...a].reverse().map(x => x.field === 'data.fields' ? answer(x.field,['displayName','department']) : x)),policy),policy);
  assert.deepEqual(left.configuration,right.configuration); assert.equal(left.configurationDigest,right.configurationDigest);
});
test('A2-AC02/05 schema extras, manipulated provenance/role, raw secrets, unsupported values/capabilities and schema fail visibly closed', async () => {
  const { api, policy, draft } = await fixture();
  const valid = command([answer('goal.purpose','employee.business.help')]);
  for (const bad of [
    {...valid,role:'reviewer'}, {...valid,source:'POLICY'}, {...valid,userId:'someone-else'},
    {...valid,schemaVersion:'pansphaira.agent-configuration/answers/v0'},
    command([{...valid.answers[0],source:'PROFILE_TEMPLATE'}]),
    command([answer('unknown','x')]), command([answer('model.secretReference','sk-RAW-SECRET')]),
    command([answer('runtime.templateId','arbitrary-runtime')]), command([answer('model.reference','paid-or-tool-model')]),
    command([answer('tools.capabilities',['employee.directory.write'])]), command([answer('budget.modelUnits',65)]),
    command([answer('persistence.mode','STORE_BUSINESS_DATA')])
  ]) assert.throws(() => api.applyAgentConfigurationAnswersV1(draft,bad,policy),/CONFIGURATION_/);
  assert.throws(() => api.evaluateAgentConfigurationDraftV1({...draft,schemaVersion:'v0'},policy),/SCHEMA_UNSUPPORTED/);
  let invoked = false; const malicious = {...valid}; Object.defineProperty(malicious,'source',{enumerable:true,get(){invoked=true;return 'POLICY';}});
  assert.throws(() => api.applyAgentConfigurationAnswersV1(draft,malicious,policy)); assert.equal(invoked,false);
});
test('A2-AC01/02 recovered #560 groups have bounded versioned fields, localized help and owner-derived support ceilings', async () => {
  const {api,policy,draft}=await fixture();
  const required=['context.timezone','goal.agentName','goal.useCase','runtime.adapterId','runtime.version','runtime.location','runtime.capabilities',
    'model.connection','model.requirements','model.maxInputBytes','model.maxOutputBytes','model.maxTokens',
    'access.authMode','access.checkStatus','data.source','data.scope','data.operation','data.purpose',
    'work.confirmation','work.timeoutMs','work.maxSteps','work.parallelism','work.maxRequests',
    'persistence.retention','persistence.redaction','persistence.deletionScope','persistence.scope','modules.selection'];
  for(const field of required)assert.ok(Object.hasOwn(policy.fields,field),field);
  assert.ok(Object.values(policy.fields).some(d=>d.group==='access'));
  assert.ok(Object.values(policy.fields).some(d=>d.group==='modules'));
  for(const d of Object.values(policy.fields)){
    assert.equal(d.schemaVersion,'pansphaira.agent-configuration/field/v1');assert.equal(d.version,'1.0.0');
    assert.ok(d.help['de-DE']);assert.ok(d.help['en-GB']);
  }
  assert.equal(draft.fields['runtime.version'].value,process.version.slice(1));
  assert.deepEqual(policy.fields['model.maxInputBytes'].allowedValues,[1,4096]);
  assert.deepEqual(policy.fields['model.maxOutputBytes'].allowedValues,[1,8192]);
  assert.deepEqual(policy.fields['model.maxTokens'].allowedValues,[1,32]);
  assert.deepEqual(policy.fields['work.timeoutMs'].allowedValues,[1,20000]);
  assert.deepEqual(policy.fields['work.parallelism'].allowedValues,[1,1]);
  const ready=api.applyAgentConfigurationAnswersV1(draft,command([answer('goal.purpose','employee.business.help'),answer('data.fields',['displayName'])]),policy);
  for(const [field,value] of [['model.maxTokens',33],['model.maxInputBytes',4097],['model.maxOutputBytes',8193],['work.timeoutMs',20001],['work.parallelism',2],
    ['work.maxSteps',2],['modules.selection','pan.erv'],['access.authMode','API_KEY'],['access.checkStatus','PASSED'],['data.operation','WRITE']])
    assert.throws(()=>api.applyAgentConfigurationAnswersV1(ready,command([answer(field,value)]),policy),/CONFIGURATION_/);
  const narrower=api.applyAgentConfigurationAnswersV1(ready,command([answer('work.timeoutMs',1000),answer('model.maxTokens',8)]),policy);
  assert.equal(api.evaluateAgentConfigurationDraftV1(narrower,policy).configuration.parameters['work.timeoutMs'],1000);
  assert.equal(api.evaluateAgentConfigurationDraftV1(narrower,policy).configuration.parameters['model.maxTokens'],8);
});
