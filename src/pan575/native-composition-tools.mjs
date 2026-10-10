// Original574 native tools, not names reimplemented by the loop. Opaque
// grants are issued only by this host assembly and never appear in context.
import {createHash} from 'node:crypto';
import {canonicalJson} from '../../dist/packages/contracts/src/canonical-json.js';
import {createPan471CompositionSession,discoverPan471CompositionBindings} from '../pan471/composition-bindings.mjs';
const hash=v=>createHash('sha256').update(canonicalJson(v)).digest('hex');
export function createNativeCompositionFeedbackToolsV1(){
 const session=createPan471CompositionSession(),bindings=discoverPan471CompositionBindings().bindings;
 const tools=bindings.map(binding=>{
  const grant=session.controller.issue(binding.capabilityId);
  const envelope=input=>({schemaVersion:'pansphaira.pan471/composition-call/v1',capabilityId:binding.capabilityId,contractDigest:binding.contractDigest,operation:binding.operation,unit:binding.quantity.unit,input});
  return Object.freeze({descriptor:Object.freeze({name:binding.capabilityId,description:'Original574 '+binding.effect+'; native schema/opaque owner grant/source digest/readback required. '+binding.quantity.unit+' only. No live ERP or procurement authority.',inputSchema:{type:'object',additionalProperties:false,required:binding.inputContract.required,properties:Object.fromEntries(binding.inputContract.required.map(k=>[k,k==='schema'?{const:binding.inputContract.schema}:{}]))}}),
   invoke:input=>{const result=session.tools.invoke(grant,envelope(input));if(result.outcome==='DENIED')throw Error('LOOP_TOOL_DENIED');return result;},
   validate:(result,input)=>{const {resultDigest,...core}=result;if(result.schemaVersion!=='pansphaira.pan471/composition-readback/v1'||result.outcome!=='NATIVE_READBACK'||result.capabilityId!==binding.capabilityId||result.contractDigest!==binding.contractDigest||result.callDigest!==hash(envelope(input))||resultDigest!==hash(core))return false;return result.nativeResult.outcome===binding.outputContract.outcome;}});
 });
 return Object.freeze({tools:Object.freeze(tools),nativeEvidence:session.controller.evidence,bindings:Object.freeze(bindings.map(b=>({capabilityId:b.capabilityId,contractDigest:b.contractDigest,contractRevision:b.contractRevision})))});
}
