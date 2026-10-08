import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../../dist/packages/contracts/src/canonical-json.js';
import { pan441EmployeeProfileV1 } from '../../dist/packages/contracts/src/pan441-employee-profile.js';
import { bindRuntimeTemplateV1 } from '../../src/pan529/runtime-template-contract.mjs';
import { shapeIdentity527 } from '../pan527/helpers.mjs';
import * as api from '../../dist/packages/contracts/src/agent-configuration-draft-v1.js';
const cmd=answers=>({schemaVersion:api.AGENT_CONFIGURATION_ANSWERS_SCHEMA_V1,expectedRevision:0,answers});
const a=(field,value,confirmation='CONFIRM')=>({field,value,confirmation});
test('A2-AC01/05 incompatible runtime versions, template identity extras and exotic nested data do not enter a supported policy',()=>{
  const profile=pan441EmployeeProfileV1();const base=bindRuntimeTemplateV1(shapeIdentity527('tenant-a'));
  function forged(mutator){const t=structuredClone(base);mutator(t);const {runtimeTemplateDigest,...body}=t;return {...body,runtimeTemplateDigest:createHash('sha256').update(canonicalJson(body)).digest('hex')};}
  for(const t of [forged(t=>t.identity.runtime.version='22.0.0'),forged(t=>t.identity.runtime.version='24.14.0'),forged(t=>t.identity.runtime.name='other'),forged(t=>t.identity.role='reviewer'),forged(t=>t.identity.contractVersion='2.0.0')]) assert.throws(()=>api.bindAgentConfigurationPolicyV1(profile,t),/CONFIGURATION_/);
  let invoked=false;const t=structuredClone(base);Object.defineProperty(t.identity.runtime,'version',{enumerable:true,get(){invoked=true;return '24.19.0';}});
  assert.throws(()=>api.bindAgentConfigurationPolicyV1(profile,t),/CONFIGURATION_/);assert.equal(invoked,false);
  for(const limit of ['maxInputBytes','maxOutputBytes','maxTokens','maxRequests','timeoutMs'])
    assert.throws(()=>api.bindAgentConfigurationPolicyV1(profile,forged(t=>t.resourceClass[limit]*=2)),/CONFIGURATION_TEMPLATE_UNSUPPORTED/);
});
test('A2-AC03 dependency closure invalidates only model-dependent answers/checks and conditional budget is explicit',()=>{
  const p=api.bindAgentConfigurationPolicyV1(pan441EmployeeProfileV1(),bindRuntimeTemplateV1(shapeIdentity527('tenant-a')));
  const original=api.applyAgentConfigurationAnswersV1(api.createAgentConfigurationDraftV1(p),cmd([a('goal.purpose','employee.business.help'),a('data.fields',['displayName'])]),p);
  const changed=api.applyAgentConfigurationAnswersV1(original,cmd([a('model.reference','NONE')]),p);
  assert.equal(changed.fields['model.secretReference'].confirmation,'STALE');assert.equal(changed.fields['budget.modelUnits'].confirmation,'STALE');
  const affected=new Set(['model.reference',...Object.keys(p.fields).filter(k=>p.fields[k].dependencies.includes('model.reference'))]);
  for(const k of Object.keys(original.fields).filter(k=>!affected.has(k)))assert.deepEqual(changed.fields[k],original.fields[k]);
  for(const k of affected)if(k!=='model.reference')assert.equal(changed.fields[k].confirmation,'STALE',k);
  const result=api.evaluateAgentConfigurationDraftV1(changed,p);assert.deepEqual(result.questions,[]);assert.equal(result.configuration.parameters['budget.modelUnits'],null);
  for(const k of affected)if(p.fields[k].requiredWhen==='SYNTHETIC_MODEL')assert.equal(result.configuration.parameters[k],null,k);
  const unknown=api.applyAgentConfigurationAnswersV1(original,cmd([a('model.reference',null,'UNKNOWN')]),p);assert.equal(api.evaluateAgentConfigurationDraftV1(unknown,p).configuration,null);
});
