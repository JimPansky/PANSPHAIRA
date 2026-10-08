import type { AgentConfigurationAnswerV1, AgentConfigurationAnswersV1 } from '../../packages/contracts/src/agent-configuration-draft-v1.js';
const valid:AgentConfigurationAnswerV1={field:'model.reference',value:'NONE',confirmation:'CONFIRM'};
// @ts-expect-error raw secrets are not a supported secret-reference value
const rawSecret:AgentConfigurationAnswerV1={field:'model.secretReference',value:'sk-example',confirmation:'CONFIRM'};
// @ts-expect-error arbitrary runtime operations are not configuration fields
const operation:AgentConfigurationAnswerV1={field:'runtime.command',value:'command',confirmation:'CONFIRM'};
// @ts-expect-error unsupported work-rule enum
const work:AgentConfigurationAnswerV1={field:'work.mode',value:'AUTO_WRITE',confirmation:'CONFIRM'};
// @ts-expect-error provenance is not a caller input
const source:AgentConfigurationAnswerV1={field:'goal.purpose',value:'employee.business.help',confirmation:'CONFIRM',source:'POLICY'};
// @ts-expect-error identity/rights are not a caller input
const identity:AgentConfigurationAnswersV1={schemaVersion:'pansphaira.agent-configuration/answers/v1',expectedRevision:0,answers:[valid],role:'reviewer'};
void [valid,rawSecret,operation,work,source,identity];
