// Closed, local synthetic PAN396 transport. NOT AWS authentication, SDK fidelity or a generic-provider grant.
import {createHash} from 'node:crypto';
export const sha256=b=>createHash('sha256').update(b).digest('hex');
export const md5=b=>createHash('md5').update(b).digest('hex');
export const OPERATIONS=Object.freeze({s3:Object.freeze(['CreateBucket','PutBucketNotificationConfiguration','PutObject','GetObject','HeadObject','ListObjectsV2','DeleteObject','DeleteBucket','ListBuckets']),sqs:Object.freeze(['CreateQueue','GetQueueAttributes','GetQueueUrl','ReceiveMessage','DeleteMessage','PurgeQueue','DeleteQueue','ListQueues'])});
const S3_METHOD=Object.freeze({CreateBucket:'PUT',PutBucketNotificationConfiguration:'PUT',PutObject:'PUT',GetObject:'GET',HeadObject:'HEAD',ListObjectsV2:'GET',DeleteObject:'DELETE',DeleteBucket:'DELETE',ListBuckets:'GET'});
const SQS_KEYS=Object.freeze({CreateQueue:['QueueName'],GetQueueAttributes:['QueueUrl','AttributeNames'],GetQueueUrl:['QueueName'],ReceiveMessage:['QueueUrl','MaxNumberOfMessages','WaitTimeSeconds'],DeleteMessage:['QueueUrl','ReceiptHandle'],PurgeQueue:['QueueUrl'],DeleteQueue:['QueueUrl'],ListQueues:[]});
const plain=v=>v!==null&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype&&Object.values(Object.getOwnPropertyDescriptors(v)).every(d=>Object.hasOwn(d,'value'));
export class FlociLabHttpV1 {
 #endpoint;#namespace;#deadlineMs;#audit;
 constructor(endpoint,{namespace,deadlineMs=2000,audit=[]}={}) {
  const u=new URL(endpoint);
  if(u.protocol!=='http:'||u.port!=='4566'||u.username||u.password||u.pathname!=='/'||u.search||u.hash||!/^((172\.(1[6-9]|2\d|3[01])\.)|(10\.)|(192\.168\.))\d/.test(u.hostname)||!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(u.hostname))throw new Error('PAN396_OWNED_PRIVATE_ENDPOINT_REQUIRED');
  if(typeof namespace!=='string'||!/^pan396-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(namespace)||!Number.isSafeInteger(deadlineMs)||deadlineMs<1||deadlineMs>2000||!Array.isArray(audit))throw new Error('PAN396_TRANSPORT_CONTEXT_DENIED');
  this.#endpoint=u.origin;this.#namespace=namespace;this.#deadlineMs=deadlineMs;this.#audit=audit;
 }
 get endpoint(){return this.#endpoint;}
 async denyDisabledService(service) {
  const probes={ec2:{operation:'DescribeInstances',path:'/',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'Action=DescribeInstances&Version=2016-11-15'},dynamodb:{operation:'ListTables',path:'/',headers:{'Content-Type':'application/x-amz-json-1.0','X-Amz-Target':'DynamoDB_20120810.ListTables'},body:'{}'},lambda:{operation:'ListFunctions',path:'/2015-03-31/functions/',method:'GET'},sts:{operation:'GetCallerIdentity',path:'/',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'Action=GetCallerIdentity&Version=2011-06-15'}};
  if(!Object.hasOwn(probes,service))throw new Error('PAN396_NEGATIVE_PROBE_NOT_ADMITTED');
  const {operation,path,...options}=probes[service];return this.#raw(service,operation,path,options);
 }
 // Closed negative lifecycle probes only. A 200 interstitial is NOT UI admission.
 async denyDisabledUi(alias,statusOnly=false) {
  if(!['_floci','_localstack'].includes(alias)||typeof statusOnly!=='boolean')throw new Error('PAN396_NEGATIVE_PROBE_NOT_ADMITTED');
  return this.#raw('ui',statusOnly?'DisabledUiStatus':'DisabledUiStartup','/'+alias+'/ui'+(statusOnly?'/status':''),{method:'GET'});
 }
 async #raw(service,operation,path='/',{method='POST',body='',headers={},signal}={}) {
  if(typeof path!=='string'||!path.startsWith('/')||path.startsWith('//'))throw new Error('PAN396_TRANSPORT_PATH_DENIED');
  const at=Date.now();const date=new Date().toISOString().replace(/[-:]/g,'').slice(0,15)+'Z';
  // Explicit public dummy routing syntax ONLY. This signature is not valid and is NOT an authentication claim.
  const authorization=`AWS4-HMAC-SHA256 Credential=pan396-synthetic/${date.slice(0,8)}/us-east-1/${service}/aws4_request, SignedHeaders=host;x-amz-date, Signature=${'0'.repeat(64)}`;
  try{
   const timeout=AbortSignal.timeout(this.#deadlineMs);const effectiveSignal=signal?AbortSignal.any([signal,timeout]):timeout;
   // UI is a closed lifecycle negative, not an AWS credential scope. Unknown
   // SigV4 scope would test the routing guard instead of effective UI disablement.
   const routingHeaders=service==='ui'?{}:{'x-amz-date':date,authorization};
   const response=await fetch(this.#endpoint+path,{method,headers:{...routingHeaders,...headers},body:['GET','HEAD'].includes(method)?undefined:body,signal:effectiveSignal,redirect:'error'});
   const bytes=Buffer.from(await response.arrayBuffer());const row={at:new Date(at).toISOString(),service,operation,method,path,requestSha256:sha256(Buffer.from(body)),status:response.status,responseSha256:sha256(bytes),responseBytesBase64:bytes.toString('base64'),responseHeaders:Object.fromEntries(response.headers),durationMs:Date.now()-at,publicDummyRoutingNotAuthentication:true};this.#audit.push(row);
   return {status:response.status,bytes,text:bytes.toString('utf8'),headers:Object.fromEntries(response.headers),auditRow:row};
  }catch(error){this.#audit.push({at:new Date(at).toISOString(),service,operation,method,path,durationMs:Date.now()-at,error:error.name,reason:'TIMEOUT_OR_TRANSPORT_NOT_SUCCESS'});throw error;}
 }
 async sqs(operation,parameters={}) {
  if(!OPERATIONS.sqs.includes(operation))throw new Error('PAN396_OPERATION_NOT_ADMITTED');
  const keys=SQS_KEYS[operation];if(!plain(parameters)||JSON.stringify(Object.keys(parameters).sort())!==JSON.stringify([...keys].sort()))throw new Error('PAN396_SQS_PARAMETER_SHAPE_DENIED');
  if(Object.hasOwn(parameters,'QueueUrl')&&parameters.QueueUrl!=='http://localhost:4566/000000000000/'+this.#namespace+'-events')throw new Error('PAN396_SQS_QUEUE_SCOPE_DENIED');
  if(Object.hasOwn(parameters,'QueueName')&&parameters.QueueName!==this.#namespace+'-events')throw new Error('PAN396_SQS_QUEUE_SCOPE_DENIED');
  if(operation==='GetQueueAttributes'&&(!Array.isArray(parameters.AttributeNames)||!parameters.AttributeNames.length||!parameters.AttributeNames.every(x=>['QueueArn','ApproximateNumberOfMessages','ApproximateNumberOfMessagesNotVisible'].includes(x))))throw new Error('PAN396_SQS_ATTRIBUTE_DENIED');
  if(operation==='ReceiveMessage'&&(parameters.MaxNumberOfMessages!==10||parameters.WaitTimeSeconds!==0))throw new Error('PAN396_SQS_RECEIVE_BOUNDS_DENIED');
  if(operation==='DeleteMessage'&&(typeof parameters.ReceiptHandle!=='string'||!parameters.ReceiptHandle))throw new Error('PAN396_SQS_RECEIPT_REQUIRED');
  const r=await this.#raw('sqs',operation,'/',{headers:{'Content-Type':'application/x-amz-json-1.0','X-Amz-Target':'AmazonSQS.'+operation},body:JSON.stringify(parameters)});return {...r,value:r.text?JSON.parse(r.text):{}};
 }
 async s3(operation,bucket='',key='',{query='',method=S3_METHOD[operation],body='',headers={},signal}={}) {
  if(!OPERATIONS.s3.includes(operation))throw new Error('PAN396_OPERATION_NOT_ADMITTED');
  if(method!==S3_METHOD[operation])throw new Error('PAN396_OPERATION_METHOD_DENIED');
  if(operation==='ListBuckets'?(bucket!==''||key!==''):(bucket!==this.#namespace+'-invoice'))throw new Error('PAN396_S3_BUCKET_SCOPE_DENIED');
  const objectOp=['PutObject','GetObject','HeadObject','DeleteObject'].includes(operation);
  if(objectOp?![this.#namespace+'/invoice.txt',this.#namespace+'/partial.txt'].includes(key):key!=='')throw new Error('PAN396_S3_KEY_SCOPE_DENIED');
  const expectedQuery=operation==='PutBucketNotificationConfiguration'?'?notification':operation==='ListObjectsV2'?'?list-type=2':'';if(query!==expectedQuery)throw new Error('PAN396_OPERATION_QUERY_DENIED');
  if(!plain(headers)||!Object.keys(headers).every(h=>['Content-Type','If-Match'].includes(h)))throw new Error('PAN396_CREDENTIAL_OR_HEADER_INJECTION_DENIED');
  return this.#raw('s3',operation,'/'+[bucket,...key.split('/')].filter(Boolean).map(encodeURIComponent).join('/')+query,{method,body,headers,signal});
 }
}
