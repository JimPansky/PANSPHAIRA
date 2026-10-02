import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
export const PAN456_SCHEMA = 'pansphaira.policy-backend-evaluation/v1';
export const CANDIDATE = Object.freeze({ name:'json-logic-js', version:'2.0.5', license:'MIT', runtimeDependencyCount:0, integrity:'sha512-rTT2+lqcuUmj4DgWfmzupZqQDA64AdmYqizzMPWj3DxGdfFNsxPpcNVSaTj4l8W2tG/+hg7/mQhxjU3aPacO6g==', packageSha256:'db182c0914465de9b2a03891e3333f2bdd34278de816921670def4c47b01b388', logicSha256:'73a6dc521e8990c2eed330dcfdb35605d7e1065a6e19d26673cb7ad4cd09d881', licenseSha256:'453a163c949bf67cbed175f93d6a57c11df65086dd8e32ea490179cef4033cdf' });
export const PROGRAM_TEXT = JSON.stringify({if:[{'===':[{var:'capability'},'customer.contact.create']},0,{'===':[{var:'capability'},'sales.order.create']},1,2]});
export const COORDINATED_MAINTENANCE = Object.freeze([
 Object.freeze({path:'demo/runtime/admin-ai-policy.mjs',responsibility:'Fixed manifest rule-kind/outcome/reason vocabulary, validateAdminAiPocPolicy expected table; independent admission must remain.'}),
 Object.freeze({path:'demo/runtime/policy-evaluator.mjs',responsibility:'createInternalStaticPolicyEvaluator capability-to-validated-rule selection map.'}),
 Object.freeze({path:'demo/runtime/admin-ai-poc.mjs',responsibility:'intentFor capability/adapter mapping and adapter ceiling; independent authority ceiling must remain, not removable duplication.'}),
]);
export const DISPOSITION = Object.freeze({verdict:'REJECT_ADOPTION_RETAIN_INTERNAL_STATIC',implementedCapability:'BOUNDED_EXECUTABLE_TOOLING_COMPARISON_ONLY',runtimeActivated:false,duplication:'NO_REMOVABLE_DUPLICATION_DEMONSTRATED',reason:'Generic expression evaluation leaves manifest vocabulary, intent mapping, trusted context and independent adapter ceilings in place. Existing two-entry map is not replaced in runtime; translating it introduces an extra program/version/byte pin and child protocol to maintain.',fallback:'Unchanged internal-static 1.0.0 remains the existing default. Candidate failures never fall back to a grant. Any later adoption is a separate exact-version/program/context migration with independent acceptance.'});
const digest=b=>createHash('sha256').update(b).digest('hex');
export function verifyCandidateBytes({packageBytes,logicBytes,licenseBytes}) {
 let p;try{p=JSON.parse(packageBytes);}catch{throw Error('PAN456_PACKAGE_MALFORMED_DENIED');}
 if(p.name!==CANDIDATE.name||p.version!==CANDIDATE.version||p.license!==CANDIDATE.license||Object.keys(p.dependencies??{}).length!==0)throw Error('PAN456_VERSION_LICENSE_DEPENDENCY_PIN_DENIED');
 if(digest(packageBytes)!==CANDIDATE.packageSha256||digest(logicBytes)!==CANDIDATE.logicSha256||digest(licenseBytes)!==CANDIDATE.licenseSha256)throw Error('PAN456_CANDIDATE_BYTES_DENIED');
 return CANDIDATE;
}
export function verifyInstalledCandidate() {
 const root=new URL('../../node_modules/json-logic-js/',import.meta.url);
 return verifyCandidateBytes({packageBytes:readFileSync(new URL('package.json',root)),logicBytes:readFileSync(new URL('logic.js',root)),licenseBytes:readFileSync(new URL('LICENSE',root))});
}
