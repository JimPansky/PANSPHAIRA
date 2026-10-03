// Explicit simplest IN-MEMORY FAKE comparison boundary, NEVER presented as Floci/AWS output.
import {randomUUID} from 'node:crypto';
import {md5} from './floci-http-v1.mjs';
export class SimplestAtomicS3SqsFakeV1 {
 objects=new Map();messages=[];queuePresent=true;
 constructor(binding){this.binding=structuredClone(binding);}
 async put(key,bytes){
  // Deliberately named common all-or-nothing map/list fake: validate queue BEFORE storing.
  if(!this.queuePresent)return {outcome:'FAKE_QUEUE_MISSING_NO_OBJECT_EFFECT'};
  const b=Uint8Array.from(bytes);this.objects.set(key,b);
  const event={Records:[{eventVersion:'2.1',eventSource:'aws:s3',awsRegion:'us-east-1',eventTime:new Date().toISOString(),eventName:'ObjectCreated:Put',userIdentity:{principalId:'AWS:EMULATOR'},requestParameters:{sourceIPAddress:'127.0.0.1'},responseElements:{'x-amz-request-id':randomUUID()},s3:{s3SchemaVersion:'1.0',configurationId:'emulator',bucket:{name:this.binding.bucket,arn:'arn:aws:s3:::'+this.binding.bucket},object:{key,size:b.byteLength,eTag:md5(b)}}}]};
  const body=JSON.stringify(event);const message={schemaVersion:'pansphaira.pan396/event-envelope/v1',namespace:this.binding.namespace,queueUrl:this.binding.queueUrl,messageId:randomUUID(),receiptHandle:'public-fake-receipt-not-native',body,bodyMd5:md5(body)};
  this.messages.push(message);return {outcome:'FAKE_PUT_AND_EVENT',message};
 }
 async readObject({namespace,bucket,key,operation}){const bytes=this.objects.get(key);return {namespace,bucket,key,operation,status:bytes?200:404,bytes:bytes?Uint8Array.from(bytes):new Uint8Array(),eTag:bytes?'"'+md5(bytes)+'"':null};}
 purge(){this.objects.clear();this.messages=[];this.queuePresent=false;return {fakeObjects:this.objects.size,fakeMessages:this.messages.length,fakeQueuePresent:this.queuePresent};}
}
export function pan396HighBindingV1(namespace,queueUrl,notBeforeEpochMs=Date.now()-1000,deadlineEpochMs=Date.now()+60000){return {schemaVersion:'pansphaira.pan396/lab-binding/v1',namespace,bucket:namespace+'-invoice',queueUrl,key:namespace+'/invoice.txt',documentId:'high',contentSha256:'ee79735415e55e2fcc92c1e67e73f879f2daa5bbe2fbf9c5182adae3f180c830',contentMd5:'9141afc343d0c77a035576ab9fa09f20',byteLength:160,notBeforeEpochMs,deadlineEpochMs};}
