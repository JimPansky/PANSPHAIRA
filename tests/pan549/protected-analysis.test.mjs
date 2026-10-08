import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {nativeFixture527,request527} from '../pan527/helpers.mjs';
import {financeFixture} from '../pan519/native-fixture.mjs';
import {nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
import {createNativeAnalysisReadAdapterV1} from '../../src/pan549/native-analysis-read.mjs';
import {createNativeErvReadAdapterV1} from '../../src/pan541/native-erv-read-adapter.mjs';
import {enableWorkspaceBrowserV1} from '../../src/pan541/workspace-browser.mjs';
import * as ingress from '../../src/pan527/origin-session-adapter.mjs';
const selector={schemaVersion:'pansphaira.workspace-analysis/read/v1',objectId:'analysis:common-trade-01:stock',expectedNativeRevision:null,expectedResultRevision:null,asOf:'2026-06-30T23:59:59+02:00'};

test('PUI-08-AC04 native analysis mounts on the real current protected shell ingress with own-session origin proof; direct stale scope and revoked-session reads fail closed',async()=>{
 assert.equal(typeof ingress.mountProtectedWorkspaceAnalysisV1,'function','PAN549_REAL_PROTECTED_ANALYSIS_INGRESS_NOT_IMPLEMENTED');
 const tls=await nativeFixture527();let native,workspace;
 try{
  native=await financeFixture();const before=nativeRows(native.root,'SELECT revision,command,event FROM pan515_events ORDER BY revision');
  const sessions=tls.gateway.sessionAdapter('tenant-a'),analysisReader=createNativeAnalysisReadAdapterV1({optIn:true,root:native.root,sessions});
  workspace=enableWorkspaceBrowserV1({optIn:true,gateway:tls.gateway,tenantId:'tenant-a',origin:tls.origin,nativeReader:createNativeErvReadAdapterV1({tenantId:'tenant-a',root:native.root}),analysisReader});
  const issued=sessions.issueOwnerSession({subjectId:'synthetic:analysis-transport-reader',role:'reader',expiresAtMs:Date.now()+60000});
  const context=JSON.parse((await request527(tls,'/t/tenant-a/workspace/context',{cookie:issued.cookieHeader})).body);
  const headers={cookie:issued.cookieHeader,origin:tls.origin,'x-pan549-context':context.sessionId};
  const response=await request527(tls,'/t/tenant-a/workspace/analysis',headers,'POST',selector);
  assert.equal(response.status,200);assert.equal(response.tlsAuthorized,true);const actual=JSON.parse(response.body);
  assert.deepEqual(actual,analysisReader.read(headers,selector));assert.equal(actual.rows.find(r=>r.key==='physical').value,2);
  assert.equal(response.headers['set-cookie'],undefined,'readonly late result must never restore a retired session cookie');
  assert.equal((await request527(tls,'/t/tenant-a/workspace/analysis',{cookie:issued.cookieHeader,origin:tls.origin},'POST',selector)).status,401);
  assert.equal((await request527(tls,'/t/tenant-a/workspace/analysis',{...headers,origin:'https://outside.invalid'},'POST',selector)).status,403);
  assert.equal((await request527(tls,'/t/tenant-b/workspace/analysis',headers,'POST',selector)).status,401);
  for(const changes of [{expectedNativeRevision:999},{expectedResultRevision:'0'.repeat(64)}])assert.equal((await request527(tls,'/t/tenant-a/workspace/analysis',headers,'POST',{...selector,...changes})).status,409);
  for(const changes of [{tenantId:'tenant-b'},{sql:'SELECT * FROM objects'},{authority:'reviewer'}])assert.equal((await request527(tls,'/t/tenant-a/workspace/analysis',headers,'POST',{...selector,...changes})).status,400);
  assert.equal((await request527(tls,'/t/tenant-a/workspace/logout',{cookie:issued.cookieHeader,origin:tls.origin},'POST')).status,200);
  assert.equal((await request527(tls,'/t/tenant-a/workspace/analysis',headers,'POST',selector)).status,401);
  assert.deepEqual(nativeRows(native.root,'SELECT revision,command,event FROM pan515_events ORDER BY revision'),before);
 }finally{workspace?.close();native?.close();await tls.close();}
});
