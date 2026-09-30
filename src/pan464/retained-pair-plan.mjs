// The single bounded edge. Qualification still requires fresh exact-checkout
// paired runner execution; these identities alone do not grant runtime access.
import {nativeUpdatePlanDigestV1} from '../pan463/native-update-executor.mjs';
import {updateDoctorContractDigest} from '../../dist/packages/contracts/src/update-doctor.js';
import {digestV1} from './retained-snapshot.mjs';
export const SOURCE_PAN_V1='c255df512ba86cf8c346c797bac5400bac1b6ab3';
export const CONSUMER_KS_V1='72d9a4af87fbbc5b23cb52835cd2f85415b8ddc7';
export const NODE_OCI_V1='node:24.19.0-bookworm@sha256:4196d66a565c6f195728d9952f161f4adfe2ad753052a08b7ec7f1c5a6bda42b';
export const SUPERSET_OCI_V1='apache/superset:6.1.0@sha256:fb3464528ec7076f91195f0ff7835755aa023e281f1bb78a84782ce7a36b3705';
export function retainedPairPlanV1({sourcePan,targetPan,consumerKs,imageId,issuedAtMs}) {
  if(sourcePan!==SOURCE_PAN_V1||consumerKs!==CONSUMER_KS_V1
    ||!/^([a-f0-9]{40})$/.test(targetPan)||targetPan===sourcePan
    ||!/^sha256:[a-f0-9]{64}$/.test(imageId)||!Number.isSafeInteger(issuedAtMs)||issuedAtMs<0)throw Error('PAN464_EXACT_EDGE_DENIED');
  const tuple = pan => ({pansphaira:pan,kaleidoSphere:consumerKs,nodeOci:NODE_OCI_V1,supersetOci:SUPERSET_OCI_V1,qualificationImageId:imageId});
  const from=tuple(sourcePan), target=tuple(targetPan);
  const authorityProfileDigest=digestV1({scope:'OWNED_DISPOSABLE_LOCAL_SYNTHETIC_PAIR',externalEffects:'DISABLED'});
  const checkPlan={schemaVersion:'chimpmaera.update/operation-plan/v1',operationId:'native:pan464-pair-v1',mode:'CHECK_ONLY',
    fromLockDigest:digestV1(from),targetLockDigest:digestV1(target),requiredAuthorityProfileDigest:authorityProfileDigest,
    authorityDelta:{added:[],removed:[]},issuedAtMs};
  checkPlan.planDigest=updateDoctorContractDigest(checkPlan,'planDigest');
  const nativePlan={schemaVersion:'pansphaira.pan463/native-update-plan/v1',mode:'LOCAL_SYNTHETIC_NATIVE_UPDATE',installationId:'pan464-synthetic',checkPlan,
    fromGeneration:1,toGeneration:2,steps:[{kind:'ADD_INVOICE_REVISION_NOTE_V1'}]};
  nativePlan.planDigest=nativeUpdatePlanDigestV1(nativePlan);
  return {from,target,authorityProfileDigest,nativePlan,edgeDigest:digestV1({from,target})};
}
