import {validateBrowserErvReadV1,type BrowserErvReadV1,type BrowserErvInvoiceIdV1} from './browser-erv-read-v1.js';
// Closed projection/personal-state contracts. No decision or business authority.
export const WORKSPACE_NOTIFICATION_KIND_V1='ERV_LOCAL_EVIDENCE_APPROVAL_REQUIRED' as const;
export type WorkspaceNotificationStatusV1='OPEN'|'DONE'|'REMOVED'|'OBSOLETE'|'PLUGIN_REMOVED'|'PLUGIN_DISABLED'|'EXPIRED';
export interface WorkspaceNotificationTargetV1 {readonly pluginId:'pan.erv';readonly routeId:'pan.erv.route';readonly params:{readonly objectId:BrowserErvInvoiceIdV1;readonly revision:number};}
export interface WorkspaceNotificationPreferencesV1 {readonly schemaVersion:'pansphaira.workspace-notifications/preferences/v1';readonly revision:number;readonly inAppEnabled:boolean;readonly filter:'ALL'|'UNREAD';readonly subscriptions:readonly (typeof WORKSPACE_NOTIFICATION_KIND_V1)[];}
export interface WorkspaceNotificationEventV1 {readonly schemaVersion:'pansphaira.workspace-notifications/event/v1';readonly eventId:string;readonly eventRevision:number;readonly kind:typeof WORKSPACE_NOTIFICATION_KIND_V1;readonly target:WorkspaceNotificationTargetV1;readonly taskIdentityDigest:string;readonly status:WorkspaceNotificationStatusV1;readonly read:boolean;readonly createdAtMs:number;readonly expiresAtMs:number;}
export interface WorkspaceNotificationsFeedV1 {readonly schemaVersion:'pansphaira.workspace-notifications/feed/v1';readonly tenantId:string;readonly subjectId:'synthetic:erv-approver';readonly preferences:WorkspaceNotificationPreferencesV1;readonly events:readonly WorkspaceNotificationEventV1[];readonly executionAuthorityGranted:false;}
export interface WorkspaceNotificationSelectorV1 {readonly schemaVersion:string;readonly eventId:string;readonly eventRevision:number;}
export interface WorkspaceNotificationOpenV1 {readonly schemaVersion:'pansphaira.workspace-notifications/open-readback/v1';readonly outcome:'TARGET_READ_CONFIRMED';readonly eventId:string;readonly eventRevision:number;readonly target:WorkspaceNotificationTargetV1;readonly invoice:BrowserErvReadV1;readonly taskIdentityDigest:string;readonly taskState:'PENDING_LOCAL_EVIDENCE_APPROVAL';readonly executionAuthorityGranted:false;}
export interface WorkspaceNotificationReadV1 {readonly schemaVersion:string;readonly outcome:'READ_CONFIRMED'|'ALREADY_READ_CONFIRMED'|'NOT_RECORDED';readonly eventId:string;readonly eventRevision:number;readonly read:boolean;readonly newTaskEffect:false;readonly executionAuthorityGranted:false;}
export interface WorkspaceNotificationPreferencesWriteV1 {readonly schemaVersion:'pansphaira.workspace-notifications/preferences-write/v1';readonly expectedRevision:number;readonly preferences:{readonly inAppEnabled:boolean;readonly filter:'ALL'|'UNREAD';readonly subscriptions:readonly (typeof WORKSPACE_NOTIFICATION_KIND_V1)[]};}
const denied=():never=>{throw new Error('NOTIFICATION_CONTRACT_DENIED');};
function record(value:unknown,keys:readonly string[]):Record<string,unknown>{
  if(!value||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype)return denied();
  const ds=Object.getOwnPropertyDescriptors(value);
  if(Reflect.ownKeys(ds).length!==keys.length||Reflect.ownKeys(ds).some(k=>typeof k!=='string'||!keys.includes(k))||Object.values(ds).some(d=>!d.enumerable||!('value' in d)))return denied();
  return value as Record<string,unknown>;
}
function array(value:unknown,max:number):readonly unknown[]{
  if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>max)return denied();
  const ds=Object.getOwnPropertyDescriptors(value);
  if(Reflect.ownKeys(ds).length!==value.length+1||Reflect.ownKeys(ds).some(k=>typeof k!=='string'||(k!=='length'&&(!/^(0|[1-9][0-9]*)$/.test(k)||Number(k)>=value.length)))||Object.entries(ds).some(([k,d])=>k!=='length'&&(!d.enumerable||!('value' in d))))return denied();
  return value;
}
const integer=(v:unknown,min=0):boolean=>Number.isSafeInteger(v)&&(v as number)>=min;
const hex=(v:unknown):boolean=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function freeze<T>(v:T):T{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
const clone=<T>(v:unknown):T=>freeze(structuredClone(v)) as T;
function target(value:unknown):WorkspaceNotificationTargetV1{
  const t=record(value,['pluginId','routeId','params']),p=record(t.params,['objectId','revision']);
  if(t.pluginId!=='pan.erv'||t.routeId!=='pan.erv.route'||!['AP-PAN516-MATCHED-01','AP-PAN516-PARTIAL-01'].includes(p.objectId as string)||!integer(p.revision,1))return denied();
  return clone(value);
}
function preferenceFields(value:unknown){
  const p=record(value,['inAppEnabled','filter','subscriptions']);const list=array(p.subscriptions,1);
  if(typeof p.inAppEnabled!=='boolean'||!['ALL','UNREAD'].includes(p.filter as string)||list.some(k=>k!==WORKSPACE_NOTIFICATION_KIND_V1))return denied();
  return p;
}
export function validateWorkspaceNotificationPreferencesV1(value:unknown):WorkspaceNotificationPreferencesV1{
  const p=record(value,['schemaVersion','revision','inAppEnabled','filter','subscriptions']);
  if(p.schemaVersion!=='pansphaira.workspace-notifications/preferences/v1'||!integer(p.revision))return denied();
  preferenceFields({inAppEnabled:p.inAppEnabled,filter:p.filter,subscriptions:p.subscriptions});return clone(value);
}
export function validateWorkspaceNotificationPreferencesWriteV1(value:unknown):WorkspaceNotificationPreferencesWriteV1{
  const p=record(value,['schemaVersion','expectedRevision','preferences']);
  if(p.schemaVersion!=='pansphaira.workspace-notifications/preferences-write/v1'||!integer(p.expectedRevision))return denied();
  preferenceFields(p.preferences);return clone(value);
}
function event(value:unknown):WorkspaceNotificationEventV1{
  const e=record(value,['schemaVersion','eventId','eventRevision','kind','target','taskIdentityDigest','status','read','createdAtMs','expiresAtMs']);
  if(e.schemaVersion!=='pansphaira.workspace-notifications/event/v1'||!hex(e.eventId)||!integer(e.eventRevision,1)||e.kind!==WORKSPACE_NOTIFICATION_KIND_V1||!hex(e.taskIdentityDigest)||typeof e.read!=='boolean'||!integer(e.createdAtMs,1)||!integer(e.expiresAtMs,1)||(e.expiresAtMs as number)<=(e.createdAtMs as number)||!['OPEN','DONE','REMOVED','OBSOLETE','PLUGIN_REMOVED','PLUGIN_DISABLED','EXPIRED'].includes(e.status as string))return denied();
  target(e.target);return clone(value);
}
export function validateWorkspaceNotificationsFeedV1(value:unknown,tenantId:string):WorkspaceNotificationsFeedV1{
  const f=record(value,['schemaVersion','tenantId','subjectId','preferences','events','executionAuthorityGranted']);
  if(typeof tenantId!=='string'||!/^[a-z0-9][a-z0-9-]{0,63}$/.test(tenantId)||f.schemaVersion!=='pansphaira.workspace-notifications/feed/v1'||f.tenantId!==tenantId||f.subjectId!=='synthetic:erv-approver'||f.executionAuthorityGranted!==false)return denied();
  const events=array(f.events,128).map(event);if(new Set(events.map(e=>e.eventId+':'+e.eventRevision)).size!==events.length)return denied();
  validateWorkspaceNotificationPreferencesV1(f.preferences);return clone(value);
}
export function validateWorkspaceNotificationSelectorV1(value:unknown,operation:'open'|'mark-read'|'reconcile-read'):WorkspaceNotificationSelectorV1{
  const s=record(value,['schemaVersion','eventId','eventRevision']);
  if(!['open','mark-read','reconcile-read'].includes(operation)||s.schemaVersion!=='pansphaira.workspace-notifications/'+operation+'/v1'||!hex(s.eventId)||!integer(s.eventRevision,1))return denied();
  return clone(value);
}
export function validateWorkspaceNotificationOpenV1(value:unknown,expected:WorkspaceNotificationEventV1,tenantId:string):WorkspaceNotificationOpenV1{
  const e=event(expected),v=record(value,['schemaVersion','outcome','eventId','eventRevision','target','invoice','taskIdentityDigest','taskState','executionAuthorityGranted']);
  const t=target(v.target);let invoice:BrowserErvReadV1;try{invoice=validateBrowserErvReadV1(v.invoice);}catch{return denied();}
  if(v.schemaVersion!=='pansphaira.workspace-notifications/open-readback/v1'||v.outcome!=='TARGET_READ_CONFIRMED'||v.eventId!==e.eventId||v.eventRevision!==e.eventRevision||v.taskIdentityDigest!==e.taskIdentityDigest||v.taskState!=='PENDING_LOCAL_EVIDENCE_APPROVAL'||v.executionAuthorityGranted!==false||t.params.objectId!==e.target.params.objectId||t.params.revision!==e.target.params.revision||invoice.tenantId!==tenantId||invoice.invoiceId!==t.params.objectId||invoice.revision!==t.params.revision)return denied();
  return clone(value);
}
export function validateWorkspaceNotificationReadV1(value:unknown,expected:WorkspaceNotificationEventV1,reconciliation:boolean):WorkspaceNotificationReadV1{
  const e=event(expected),v=record(value,['schemaVersion','outcome','eventId','eventRevision','read','newTaskEffect','executionAuthorityGranted']);
  if(v.schemaVersion!=='pansphaira.workspace-notifications/'+(reconciliation?'read-reconciliation':'mark-readback')+'/v1'||v.eventId!==e.eventId||v.eventRevision!==e.eventRevision||v.newTaskEffect!==false||v.executionAuthorityGranted!==false||!(reconciliation?['READ_CONFIRMED','NOT_RECORDED']:['READ_CONFIRMED','ALREADY_READ_CONFIRMED']).includes(v.outcome as string)||v.read!==(v.outcome!=='NOT_RECORDED'))return denied();
  return clone(value);
}
