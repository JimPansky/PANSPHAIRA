// PAN396 issue-local closed synthetic lab input. This is NOT AWS authentication,
// a DemoMutationGate provider extension, or productive/cloud/customer authority.
import { createHash } from 'node:crypto';
export interface Pan396BindingV1 {
  readonly schemaVersion: 'pansphaira.pan396/lab-binding/v1';
  readonly namespace: string; readonly bucket: string; readonly queueUrl: string; readonly key: string;
  readonly documentId: 'high'; readonly contentSha256: string; readonly contentMd5: string; readonly byteLength: number;
  readonly notBeforeEpochMs: number; readonly deadlineEpochMs: number;
}
export interface Pan396EventEnvelopeV1 {
  readonly schemaVersion: 'pansphaira.pan396/event-envelope/v1';
  readonly namespace: string; readonly queueUrl: string; readonly messageId: string;
  readonly receiptHandle: string; readonly body: string; readonly bodyMd5: string;
}
export interface Pan396TypedEventV1 {
  readonly schemaVersion: 'pansphaira.pan396/typed-invoice-event/v1';
  readonly namespace: string; readonly bucket: string; readonly key: string; readonly queueUrl: string;
  readonly messageId: string; readonly eventEpochMs: number; readonly bodySha256: string;
  readonly objectMd5: string; readonly byteLength: number; readonly documentId: 'high'; readonly contentSha256: string;
  readonly productivePostingAuthorized: false; readonly bookingAuthorityGranted: false;
}
export type Pan396AdmissionV1 = Readonly<{outcome:'ADMITTED';event:Pan396TypedEventV1}> | Readonly<{outcome:'DENIED';reasonCode:string}>;
const hash=(algorithm:string,value:string)=>createHash(algorithm).update(value).digest('hex');
const denied=(reasonCode:string):Pan396AdmissionV1=>Object.freeze({outcome:'DENIED',reasonCode});
function plain(v:unknown):v is Record<string,unknown>{
  return v!==null&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype
    && Object.getOwnPropertySymbols(v).length===0
    && Object.values(Object.getOwnPropertyDescriptors(v)).every(d=>Object.hasOwn(d,'value'));
}
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>plain(v)&&JSON.stringify(Object.keys(v).sort())===JSON.stringify([...keys].sort());
const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0;
export function validatePan396BindingV1(v:unknown):v is Pan396BindingV1 {
  if(!exact(v,['schemaVersion','namespace','bucket','queueUrl','key','documentId','contentSha256','contentMd5','byteLength','notBeforeEpochMs','deadlineEpochMs']))return false;
  return v.schemaVersion==='pansphaira.pan396/lab-binding/v1'&&text(v.namespace)&&/^pan396-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v.namespace)
    &&v.bucket===v.namespace+'-invoice'&&v.key===v.namespace+'/invoice.txt'
    &&v.queueUrl==='http://localhost:4566/000000000000/'+v.namespace+'-events'
    &&v.documentId==='high'&&v.contentSha256==='ee79735415e55e2fcc92c1e67e73f879f2daa5bbe2fbf9c5182adae3f180c830'
    &&v.contentMd5==='9141afc343d0c77a035576ab9fa09f20'&&v.byteLength===160
    &&typeof v.notBeforeEpochMs==='number'&&Number.isSafeInteger(v.notBeforeEpochMs)&&v.notBeforeEpochMs>0
    &&typeof v.deadlineEpochMs==='number'&&Number.isSafeInteger(v.deadlineEpochMs)
    &&v.deadlineEpochMs>v.notBeforeEpochMs&&v.deadlineEpochMs-v.notBeforeEpochMs<=180000;
}
export function admitPan396InvoiceEventV1(input:unknown,binding:Pan396BindingV1,nowEpochMs:number=Date.now()):Pan396AdmissionV1 {
  if(!validatePan396BindingV1(binding))return denied('BINDING_SHAPE_DENIED');
  if(nowEpochMs>=binding.deadlineEpochMs)return denied('TIMEOUT');
  if(!exact(input,['schemaVersion','namespace','queueUrl','messageId','receiptHandle','body','bodyMd5'])||input.schemaVersion!=='pansphaira.pan396/event-envelope/v1'
    ||!text(input.messageId)||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(input.messageId)||!text(input.receiptHandle)||!text(input.body)||input.body.length>65536||!text(input.bodyMd5))return denied('EVENT_ENVELOPE_SHAPE_DENIED');
  if(input.namespace!==binding.namespace)return denied('FOREIGN_SCOPE_DENIED');
  if(input.queueUrl!==binding.queueUrl)return denied('WRONG_QUEUE_DENIED');
  if(hash('md5',input.body)!==input.bodyMd5)return denied('MESSAGE_DIGEST_DENIED');
  let body:unknown;try{body=JSON.parse(input.body);}catch{return denied('EVENT_JSON_DENIED');}
  if(!exact(body,['Records'])||!Array.isArray(body.Records)||body.Records.length!==1)return denied('EVENT_SYNTAX_DENIED');
  const r:unknown=body.Records[0];
  if(!exact(r,['eventVersion','eventSource','awsRegion','eventTime','eventName','userIdentity','requestParameters','responseElements','s3'])
    ||r.eventVersion!=='2.1'||r.eventSource!=='aws:s3'||r.awsRegion!=='us-east-1'||r.eventName!=='ObjectCreated:Put'
    ||!text(r.eventTime)||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(r.eventTime)
    ||!exact(r.userIdentity,['principalId'])||r.userIdentity.principalId!=='AWS:EMULATOR'
    ||!exact(r.requestParameters,['sourceIPAddress'])||!text(r.requestParameters.sourceIPAddress)
    ||!exact(r.responseElements,['x-amz-request-id'])||!text(r.responseElements['x-amz-request-id']))return denied('EVENT_SYNTAX_DENIED');
  const s=r.s3;
  if(!exact(s,['s3SchemaVersion','configurationId','bucket','object'])||s.s3SchemaVersion!=='1.0'||s.configurationId!=='emulator'
    ||!exact(s.bucket,['name','arn'])||!exact(s.object,['key','size','eTag']))return denied('S3_EVENT_SHAPE_DENIED');
  if(s.bucket.name!==binding.bucket||s.bucket.arn!=='arn:aws:s3:::'+binding.bucket)return denied('WRONG_BUCKET_DENIED');
  if(s.object.key!==binding.key)return denied('FOREIGN_KEY_DENIED');
  if(s.object.size!==binding.byteLength||s.object.eTag!==binding.contentMd5)return denied('SUBSTITUTED_EVENT_PAYLOAD_DENIED');
  const epoch=Date.parse(r.eventTime);if(!Number.isFinite(epoch)||epoch<binding.notBeforeEpochMs||epoch>nowEpochMs)return denied('STALE_EVENT_DENIED');
  const event:Pan396TypedEventV1=Object.freeze({schemaVersion:'pansphaira.pan396/typed-invoice-event/v1',namespace:binding.namespace,bucket:binding.bucket,key:binding.key,queueUrl:binding.queueUrl,
    messageId:input.messageId,eventEpochMs:epoch,bodySha256:hash('sha256',input.body),objectMd5:binding.contentMd5,byteLength:binding.byteLength,documentId:'high',contentSha256:binding.contentSha256,
    productivePostingAuthorized:false,bookingAuthorityGranted:false});
  return Object.freeze({outcome:'ADMITTED',event});
}
