// Original360 execution composition. Source qualification/delivery is a separate
// gate: these local executions never grant productive or external authority.
import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { runIncomingInvoiceSetupAgentV1 } from '../../dist/packages/contracts/src/incoming-invoice-adaptive-ui.js';
import { createErvUiPackageV1, genericReferenceConsumerRender, verifyTrustedErvUiSourceV1 } from '../../erv-ui-reference/reference.mjs';
import { loadOriginalErvProfileV1, evaluateOriginalErvCaseV1, deriveOriginalApprovalV1, originalCoreIdentityV1, sha256, digest, canonical, freeze } from './original-erv-core-v1.mjs';
import { originalInvoiceRequestV1, intakeOriginalInvoiceV1, readOriginalInvoiceV1, createOriginalInvoiceStoreV1, originalInputIdentityV1 } from './original-invoice-input-v1.mjs';
const ROOT=new URL('../../',import.meta.url);
const SETUP_PATH='tests/fixtures/incoming-invoice/ap-05-frozen-setup-v1.json';
const SETUP_SHA='fb239dd4fdc964ce0124f8be69ea97078205d31642ff034cdf95dfeb9a7364ec';
const deny=reason=>freeze({outcome:'DENIED',reasonCode:reason,productivePostingAuthorized:false});
export function originalSetupInputV1() {
  const bytes=readFileSync(new URL(SETUP_PATH,ROOT));
  if(sha256(bytes)!==SETUP_SHA)throw new Error('PAN360_ORIGINAL_SETUP_SOURCE_IDENTITY_DENIED');
  return JSON.parse(bytes);
}
export function runOriginalSetupV1(input=originalSetupInputV1()) {
  const original=originalSetupInputV1();
  if(input===null || typeof input!=='object' || canonical(Object.keys(input).sort())!==canonical(['baseline','changed','answers'].sort())
    || canonical(input.baseline)!==canonical(original.baseline) || canonical(input.changed)!==canonical(original.changed))return deny('ORIGINAL_REQUIREMENT_IDENTITY_DENIED');
  const dialogue=runIncomingInvoiceSetupAgentV1(input);
  if(dialogue.outcome!=='RESOLVED')return dialogue;
  if(dialogue.configurationDelta.configuration.tolerancePolicy.rateBasisPoints!==200)return deny('ORIGINAL200BPS_REQUIRED');
  const baseline={schemaVersion:'pansphaira.pan360/executable-configuration/v1',scenario:'LEAN',matchingMode:{variantId:'LEAN_INVOICE_ONLY_V1',version:'1.0.0'},tolerancePolicy:{variantId:'STRICT_ZERO_V1',version:'1.0.0'},rateBasisPoints:0,purchaseOrderRequired:false,receiptRequired:false,separateApprovalThresholdMinor:null};
  const modified={schemaVersion:'pansphaira.pan360/executable-configuration/v1',scenario:'SEGREGATED_ENTERPRISE',matchingMode:{variantId:'THREE_WAY_RELATIONAL_V2',version:'1.0.0'},tolerancePolicy:{variantId:'RATE_BPS_V1',version:'2.0.0'},rateBasisPoints:200,purchaseOrderRequired:true,receiptRequired:true,separateApprovalThresholdMinor:1000000};
  const unsigned={schemaVersion:'pansphaira.pan360/original-configuration-delta/v1',configurationVersion:'1.0.0',originalOwnerReferences:['PAN365:5508575190','PAN366:5508575402'],
    originalBeforeRequirementDigest:dialogue.configurationDelta.beforeRequirementDigest,originalAfterRequirementDigest:dialogue.configurationDelta.afterRequirementDigest,
    beforeConfigurationDigest:digest(baseline),afterConfigurationDigest:digest(modified),baseline,modified,
    reusedDialogueDelta:dialogue.configurationDelta,transcriptDigest:dialogue.transcript.transcriptDigest,
    explicitAdapterResolution:{historicalBaselineTwoWaySelectionIsNotExecutionProof:true,originalBaselineNoMandatoryPoReceipt:'SUPPORTED_LEAN_INVOICE_ONLY_V1',requestedLegacyRateSelection:'RATE_BPS_V1@1.0.0+200bps',nativeSupportedSelection:'RATE_BPS_V1@2.0.0=200bps',historical100bpsSelectionPreserved:'RATE_BPS_V1@1.0.0=100bps'},
    unresolvedGaps:[],inventedExecutableFunctions:[],authorityGranted:false};
  return freeze({outcome:'RESOLVED',transcript:dialogue.transcript,configurationDelta:{...unsigned,configurationDeltaDigest:digest(unsigned)}});
}
function sourceIdentity() {
  const core=originalCoreIdentityV1();const input=originalInputIdentityV1();
  const paths=['packages/contracts/src/incoming-invoice-adaptive-ui.ts','dist/packages/contracts/src/incoming-invoice-adaptive-ui.js','erv-ui-reference/reference.mjs','erv-ui-reference/schema.json','erv-ui-reference/descriptors.mjs','src/pan360/original-erv-execution-v1.mjs'];
  const bindings=paths.map(path=>({path,sha256:sha256(readFileSync(new URL(path,ROOT)))}));
  return freeze({core,input,bindings,compositionDigest:digest({coreDigest:core.coreDigest,inputDigest:input.inputDigest,bindings})});
}
export const originalExecutionIdentityV1=sourceIdentity;
function uiDescriptor(label,configuration,requirement,identity,record,decision,approval) {
  const evidence=[{ref:'document',kind:'DOCUMENT_VERSION',content:{version:record.version,recordDigest:record.recordDigest}},{ref:'extraction',kind:'STRUCTURED_TEXT_EXTRACTION',content:record.extraction},{ref:'decision',kind:'LOCAL_DECISION',content:decision},{ref:'approval',kind:'LOCAL_APPROVAL_REQUIREMENT',content:approval}];
  const field=(id,labelText,state,value,reasonCode)=>({fieldId:id,label:labelText,accessibilityLabel:labelText,displayKind:id==='amount'?'CURRENCY':'TEXT',state,...(state==='VALUE'?{value}:{reasonCode}),evidenceRefs:[id==='amount'?'extraction':id==='approval'?'approval':'decision']});
  const specs=[field('amount','Observed invoice amount in EUR minor','VALUE',record.extraction.fields.grossAmountMinor.value),field('outcome','Local declared decision outcome','VALUE',decision.outcome),field('scope','Actual matching scope','VALUE',decision.matchingScope??decision.exceptionCode??decision.conflict?.conflictKind??decision.reasonCode),field('approval','Separate approval process state','VALUE',approval.state)];
  for(const [id,required] of [['purchase-order',configuration.purchaseOrderRequired],['receipt',configuration.receiptRequired]]) {
    const kind=id==='receipt'?'RECEIPT':'PURCHASE_ORDER';const ref=decision.evidenceCitations?.find(x=>x.referenceKind===kind);
    specs.push(field(id,kind,ref?'VALUE':'UNKNOWN',ref?.referenceId,required?'REQUIRED_REFERENCE_UNKNOWN':'NOT_REQUIRED_BY_LEAN_CONFIGURATION'));
  }
  const actions=[{actionId:'acknowledge-local-evidence',order:0,enabled:decision.outcome==='MATCHED' && approval.state==='NOT_REQUIRED',...(decision.outcome==='MATCHED'&&approval.state==='NOT_REQUIRED'?{}:{disabledReason:approval.state}),requiredEvidenceRefs:['decision','approval'],authority:'NONE',confirmationIntent:{required:true,label:'Acknowledge local evidence only'},readbackIntent:{label:'Local evidence acknowledgment readback'},evidenceRefs:['decision','approval']}];
  return {contextId:'pan360:'+label,scenario:configuration.scenario,requirement,configuration,scenarioDescriptor:{scenario:configuration.scenario,processVector:true,companySizeNotAnInput:true},core:{coreVersion:identity.core.coreVersion,coreDigest:identity.core.coreDigest},evidence,
    screens:[{screenId:'pan360-local-erv',order:0,sections:[{sectionId:'local-result',order:0,components:specs.map((f,order)=>({componentId:'pan360:'+f.fieldId,order,kind:'FIELD',field:f,actions:order===0?actions:[]}))}]}]};
}
export async function runOriginalErvVariantV1({label,caseId,setupInput,configurationDelta,expectedIdentity,request,approvalActors=null}) {
  if(!['BASELINE','MODIFIED'].includes(label))return deny('VARIANT_LABEL_DENIED');
  if(configurationDelta===undefined || configurationDelta===null)return deny('DIALOGUE_DELTA_MISSING');
  const setup=runOriginalSetupV1(setupInput);
  if(setup.outcome!=='RESOLVED')return deny('DIALOGUE_NOT_RESOLVED');
  if(canonical(configurationDelta)!==canonical(setup.configurationDelta))return deny('DIALOGUE_DELTA_IDENTITY_DENIED');
  const identity=sourceIdentity();
  if(!expectedIdentity || canonical(identity)!==canonical(expectedIdentity))return deny('CORE_OR_COMPOSITION_IDENTITY_DENIED');
  const profile=loadOriginalErvProfileV1();const candidate=profile.cases.find(c=>c.caseId===caseId);
  if(!candidate)return deny('CASE_SOURCE_IDENTITY_DENIED');
  const configuration=label==='BASELINE'?configurationDelta.baseline:configurationDelta.modified;
  // Deliberate100bps and unknown policies are evaluated only in core qualification,
  // never silently substituted for the Original200bps changed execution.
  if(canonical(candidate.matchingMode)!==canonical(configuration.matchingMode) || canonical(candidate.tolerancePolicy)!==canonical(configuration.tolerancePolicy))return deny('EXECUTABLE_CONFIGURATION_IDENTITY_DENIED');
  const store=createOriginalInvoiceStoreV1();
  const accepted=await intakeOriginalInvoiceV1(request,store);
  if(accepted.outcome!=='ACCEPTED')return accepted;
  const readback=await readOriginalInvoiceV1(accepted.record.version.versionId,store);
  if(readback.outcome!=='FOUND')return deny('INTAKE_READBACK_MISSING_OR_DENIED');
  const invoice=candidate.references.find(ref=>ref.body.referenceKind==='INVOICE');
  if(!invoice || invoice.body.matchAmountMinor!==readback.extraction.fields.grossAmountMinor.value || invoice.body.supplierId!==accepted.record.supplierInvoiceIdentity.supplierId)return deny('OBSERVED_DOCUMENT_REFERENCE_MISMATCH');
  // Actual fresh point-of-use identity after the final intake/readback await.
  if(canonical(sourceIdentity())!==canonical(identity))return deny('CORE_OR_COMPOSITION_IDENTITY_DENIED');
  const decision=evaluateOriginalErvCaseV1(candidate,profile);
  const approval=deriveOriginalApprovalV1(decision,{scenario:configuration.scenario,separateApprovalThresholdMinor:configuration.separateApprovalThresholdMinor});
  let approvalRecord=null;
  if(approvalActors!==null) {
    if(approval.state!=='REQUIRES_SEPARATE_APPROVAL' || canonical(Object.keys(approvalActors).sort())!==canonical(['requester','approver'].sort())
      || approvalActors.requester!=='synthetic-originator' || approvalActors.approver!=='synthetic-independent-approver' || approvalActors.requester===approvalActors.approver)return deny('SEPARATE_APPROVAL_ACTOR_DENIED');
    approvalRecord=freeze({schemaVersion:'pansphaira.pan360/local-separate-approval/v1',actorSource:'DECLARED_LOCAL_SYNTHETIC_TEST_ACTORS_ONLY',...approvalActors,decisionDigest:digest(decision),requirementDigest:digest(approval),state:'APPROVED_LOCAL_EVIDENCE_ONLY',bookingAuthorityGranted:false,productivePostingAuthorized:false});
  }
  const scratch=process.env.TMPDIR??process.env.RUNNER_TEMP;
  if(!scratch || !resolve(scratch).startsWith('/'))throw new Error('PAN360_OWNED_SCRATCH_REQUIRED');
  const owned=await mkdtemp(join(resolve(scratch),'pan360-local-execution-'));
  let result;
  try {
    const journal={schemaVersion:'pansphaira.pan360/local-evidence-journal/v1',recordDigest:accepted.record.recordDigest,decision,approval,approvalRecord};
    await writeFile(join(owned,'journal.json'),canonical(journal)+'\n',{flag:'wx',mode:0o600});
    const independentlyReadJournal=JSON.parse(await readFile(join(owned,'journal.json'),'utf8'));
    if(canonical(independentlyReadJournal)!==canonical(journal))return deny('LOCAL_JOURNAL_READBACK_DENIED');
    const descriptor=uiDescriptor(label,configuration,label==='BASELINE'?setupInput.baseline:setupInput.changed,identity,accepted.record,decision,approval);
    const ui=createErvUiPackageV1(descriptor);const rendered=genericReferenceConsumerRender(ui);
    const trust=verifyTrustedErvUiSourceV1(ui,ui.readback.packageSha256);
    if(rendered.outcome!=='RENDERED' || !trust.valid)return deny('UI_CONSUMER_OR_SOURCE_READBACK_DENIED');
    const unsigned={schemaVersion:'pansphaira.pan360/original-variant-execution/v1',label,caseId,scope:'PUBLIC_SYNTHETIC_NON_CUSTOMER_AUTHORITY_FREE',sourceIdentity:identity,
      requirementDigest:digest(label==='BASELINE'?setupInput.baseline:setupInput.changed),configuration,configurationDigest:digest(configuration),dialogueDeltaDigest:configurationDelta.configurationDeltaDigest,transcriptDigest:setup.transcript.transcriptDigest,
      document:accepted.record,intakeReadback:readback,extraction:accepted.record.extraction,decision,approval,approvalRecord,localJournalReadbackDigest:digest(independentlyReadJournal),
      ui,uiConsumer:rendered,uiSourceTrustedDigest:ui.readback.packageSha256,
      reusedLayerIds:{intakeStorage:'chimpmaera.incoming-invoice/intake-store/v1',extraction:accepted.record.extraction.extractorId,matching:'chimpmaera.incoming-invoice/erv-core/v1',advisor:'EVIDENCE_CITING_ONLY',dialogue:setup.transcript.schemaVersion,ui:ui.schemaVersion},
      nonclaims:['SYNTHETIC_STRUCTURED_TEXT_NOT_OCR','NO_EXTERNAL_SYSTEM_OF_RECORD_READBACK','NO_PRODUCTION_OR_BOOKING_AUTHORITY','NEW_VERSIONED_INPUT_AND_CORE_ADMISSION_QUALIFICATION_SEPARATE'],ownedFilesystemCleanup:'REQUIRED_BEFORE_SUCCESS'};
    result=freeze({outcome:'EXECUTED',execution:{...unsigned,ownedFilesystemCleanup:'OWNED_DIRECTORY_REMOVED',executionDigest:digest({...unsigned,ownedFilesystemCleanup:'OWNED_DIRECTORY_REMOVED'})}});
  } finally {await rm(owned,{recursive:true,force:true});}
  if(canonical(sourceIdentity())!==canonical(identity))return deny('CORE_OR_COMPOSITION_IDENTITY_DENIED');
  return result;
}
export async function runOriginalErvPairV1() {
  const setupInput=originalSetupInputV1();const setup=runOriginalSetupV1(setupInput);const expectedIdentity=sourceIdentity();
  const baseline=await runOriginalErvVariantV1({label:'BASELINE',caseId:'lean-no-po-no-receipt',setupInput,configurationDelta:setup.configurationDelta,expectedIdentity,request:originalInvoiceRequestV1('high')});
  const modified=await runOriginalErvVariantV1({label:'MODIFIED',caseId:'three-way-discriminating200',setupInput,configurationDelta:setup.configurationDelta,expectedIdentity,request:originalInvoiceRequestV1('high'),approvalActors:{requester:'synthetic-originator',approver:'synthetic-independent-approver'}});
  if(baseline.outcome!=='EXECUTED' || modified.outcome!=='EXECUTED')return freeze({outcome:'DENIED',reasonCode:'VARIANT_PAIR_EXECUTION_DENIED',baseline,modified});
  if(canonical(baseline.execution.sourceIdentity)!==canonical(modified.execution.sourceIdentity))return deny('SAME_CORE_PAIR_IDENTITY_DENIED');
  const receipt={schemaVersion:'pansphaira.pan360/original-erv-reuse-receipt/v1',scope:'PUBLIC_SYNTHETIC_NON_CUSTOMER_AUTHORITY_FREE',baselineExecutionDigest:baseline.execution.executionDigest,modifiedExecutionDigest:modified.execution.executionDigest,coreModuleDigestsIdentical:true,sourceIdentity:expectedIdentity,
    originalRequirements:loadOriginalErvProfileV1().originalRequirements,dialogueDeltaDigest:setup.configurationDelta.configurationDeltaDigest,
    reusedLayerIds:baseline.execution.reusedLayerIds,originalBehavior:{baselineNoMandatoryPoReceipt:true,changedRateBasisPoints:modified.execution.decision.appliedRateBasisPoints,separateApprovalComparison:modified.execution.approval.comparison,changedSeparateApprovalActuallyJournaled:modified.execution.approvalRecord?.state==='APPROVED_LOCAL_EVIDENCE_ONLY'},
    qualification:'DEVELOPMENT_EXECUTED_RELEASE_QUALIFICATION_AND_EXACT_RELEASED_REPLAY_STILL_REQUIRED',historical100bpsSourceNotOverwritten:true,authorityGranted:false};
  return freeze({outcome:'EXECUTED_PAIR',setup,baseline,modified,reuseReceipt:{...receipt,reuseReceiptDigest:digest(receipt)}});
}
