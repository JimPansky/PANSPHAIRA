// Bounded owned-test child. Real profile SQLite reservation and, only when
// requested, the unchanged NativeHuman owner with real existing signed session.
// No HTTP/product CLI, mock native state, fake role or altered timeout/budget.
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {createProtectedSessionAdapterV1} from '../../src/pan527/origin-session-adapter.mjs';
import {createNativeErvHumanBackendV1} from '../../src/pan542/native-human-backend.mjs';
if(process.argv.length!==2||!process.channel)throw Error('PAN546_OWNED_TEST_CHILD_IPC_REQUIRED');
process.once('message',options=>{
 let db;
 try{
  if(options.holdMs!==2200||!['LEASE','HUMAN_SOURCE'].includes(options.kind))throw Error('PAN546_OWNED_TEST_CHILD_SCOPE_DENIED');
  db=new DatabaseSync(join(options.profileRoot,'browser-profiles.sqlite'));db.exec('PRAGMA busy_timeout=3000; BEGIN IMMEDIATE');
  process.send({outcome:'ACTUAL_PROFILE_RESERVATION_HELD',atMs:Date.now()});
  if(options.kind==='HUMAN_SOURCE')setTimeout(()=>{
   try{
    const sessions=createProtectedSessionAdapterV1({optIn:true,...options.sessionOptions});
    const human=createNativeErvHumanBackendV1({root:options.nativeRoot,sessions}),p=human.read(options.headers,{invoiceId:options.invoiceId});
    human.decide(options.headers,{schemaVersion:'pansphaira.erv-human/decision/v1',invoiceId:p.invoiceId,effectId:'synthetic:pan546-lock-source-review',transportId:'synthetic:pan546-lock-source-review-wire',expectedNativeRevision:p.nativeRevision,expectedProposalRevision:p.proposalRevision,proposalDigest:p.proposalDigest,action:'REVIEW'});
    const after=human.read(options.headers,{invoiceId:options.invoiceId});
    process.send({outcome:'ACTUAL_INDEPENDENT_AUTHORIZED_HUMAN_REVIEW',atMs:Date.now(),nativeRevision:p.nativeRevision,afterNativeRevision:after.nativeRevision,proposalBefore:p.proposalRevision,proposalAfter:after.proposalRevision,sourceChanged:p.proposalDigest!==after.proposalDigest});
   }catch(error){process.send({outcome:'ACTUAL_TEST_CHILD_FAILED',code:error.message});process.exitCode=1;}
  },1000);
  setTimeout(()=>{try{db.exec('COMMIT');db.close();db=null;process.send({outcome:'ACTUAL_PROFILE_RESERVATION_RELEASED',atMs:Date.now()});process.disconnect();}catch(error){process.send({outcome:'ACTUAL_TEST_CHILD_FAILED',code:error.message});process.exitCode=1;process.disconnect();}},options.holdMs);
 }catch(error){try{db?.close();}catch{}process.send({outcome:'ACTUAL_TEST_CHILD_FAILED',code:error.message});process.exitCode=1;process.disconnect();}
});
