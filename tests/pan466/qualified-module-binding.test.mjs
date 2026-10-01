// Metadata boundaries only; actual native behavior has a separate required gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import {retainedModuleBindingV1,createQualifiedRetainedModuleV1} from '../../src/pan466/qualified-retained-module.mjs';
const targetHead='1'.repeat(40),imageId='sha256:'+'2'.repeat(64);
test('native adapter binding is immutable declaration, not qualification or an effect grant',()=>{
 const b=retainedModuleBindingV1({targetHead,imageId});assert(Object.isFrozen(b));assert.equal(b.generation,1);
 assert.throws(()=>{b.generation=2;},TypeError);assert.equal(Object.hasOwn(b,'authority'),false);assert.equal(Object.hasOwn(b,'eligible'),false);
});
for(const generation of [0,-1,1.5,NaN,Number.MAX_SAFE_INTEGER+1])test(`native adapter rejects invalid captured generation ${generation}`,()=>{
 assert.throws(()=>retainedModuleBindingV1({targetHead,imageId,generation}),/PAN466_BINDING_REQUIRED/);
});
for(const change of [{descriptorDigest:'f'.repeat(64)},{consumerCommit:'3'.repeat(40)},{moduleId:'another-module'},{schemaVersion:2},{eligible:true}])test(`native adapter rejects substituted or caller-qualified binding ${Object.keys(change).join(',')}`,()=>{
 const b={...retainedModuleBindingV1({targetHead,imageId}),...change};
 assert.throws(()=>createQualifiedRetainedModuleV1({processBinding:b,targetHead,imageId,readCurrentModule:()=>b,readPermission:()=>({}),readHistoryPermission:()=>({})}),/PAN466_TRUSTED_INPUTS_REQUIRED/);
});
