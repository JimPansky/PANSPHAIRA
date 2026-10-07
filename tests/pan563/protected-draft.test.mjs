import test from 'node:test';
import assert from 'node:assert/strict';
import { request527 } from '../pan527/helpers.mjs';
import { nativeRows } from '../fixtures/pan515/native-trade-fixture.mjs';
import { draftWorkspaceFixture } from './helpers.mjs';
import { defaultBrowserProfileV1 } from '../../dist/packages/contracts/src/browser-profile-v1.js';
const command = revision => ({schemaVersion:'pansphaira.agent-configuration/answers/v1',expectedRevision:revision,answers:[{field:'goal.purpose',value:'employee.business.help',confirmation:'CONFIRM'},{field:'data.fields',value:['displayName'],confirmation:'CONFIRM'}]});
test('A2 actual protected backend owns draft identity, enforces CAS and negative requests; no execution/history mutation',async()=>{
  const f=await draftWorkspaceFixture();
  try {
    const before=JSON.stringify(nativeRows(f.native.root,'SELECT revision,effect_key,command,event FROM pan516_events ORDER BY revision'));
    const sessions=f.gateway.sessionAdapter('tenant-a');
    const user=sessions.issueOwnerSession({subjectId:'synthetic-draft-user',role:'reader',expiresAtMs:Date.now()+120000});
    const context=JSON.parse((await request527(f,'/t/tenant-a/workspace/context',{cookie:user.cookieHeader})).body);
    const path='/t/tenant-a/workspace/configuration';const headers={cookie:user.cookieHeader,origin:f.origin,'x-pan563-context':context.sessionId};
    assert.equal((await request527(f,path)).status,401);
    const read=await request527(f,path,headers);assert.equal(read.status,200);assert.equal(read.headers['set-cookie'],undefined);
    const current=JSON.parse(read.body);assert.equal(current.persisted,false);assert.equal(current.revision,0);
    const saved=await request527(f,path,headers,'POST',command(0));assert.equal(saved.status,200);
    const value=JSON.parse(saved.body);assert.equal(value.revision,1);assert.equal(value.outcome,'RESOLVED');
    assert.equal((await request527(f,path,headers,'POST',command(0))).status,409);
    for (const bad of [{...command(1),role:'reviewer'},{...command(1),tenantId:'tenant-b'},{...command(1),source:'POLICY'},{...command(1),schemaVersion:'old'},
      {...command(1),answers:[{field:'model.secretReference',value:'sk-RAW-SECRET',confirmation:'CONFIRM'}]}]) {
      const response=await request527(f,path,headers,'POST',bad);assert.equal(response.status,400,response.body);
    }
    assert.equal((await request527(f,path,{...headers,origin:'https://untrusted.example.invalid'},'POST',command(1))).status,403);
    assert.equal((await request527(f,path,{...headers,'x-role':'reviewer'},'POST',command(1))).status,403);
    assert.equal((await request527(f,path,{cookie:user.cookieHeader,origin:f.origin},'POST',command(1))).status,403);
    assert.equal((await request527(f,path,{...headers,'x-pan563-context':'session:'+'0'.repeat(64)},'POST',command(1))).status,403);
    assert.equal((await request527(f,'/t/tenant-b/workspace/configuration',headers)).status,401);
    assert.equal((await request527(f,path+'?tenantId=tenant-b',headers)).status,404);
    assert.deepEqual(JSON.parse((await request527(f,path,headers)).body),value);
    const separate=sessions.issueOwnerSession({subjectId:'synthetic-contradiction-user',role:'reader',expiresAtMs:Date.now()+120000});
    const otherContext=JSON.parse((await request527(f,'/t/tenant-a/workspace/context',{cookie:separate.cookieHeader})).body);
    const otherHeaders={cookie:separate.cookieHeader,origin:f.origin,'x-pan563-context':otherContext.sessionId};
    const contradictory={...command(0),answers:[...command(0).answers,{field:'goal.purpose',value:'employee.directory.summary',confirmation:'CONFIRM'}]};
    const unresolved=JSON.parse((await request527(f,path,otherHeaders,'POST',contradictory)).body);
    assert.equal(unresolved.outcome,'NEEDS_CLARIFICATION');assert.equal(unresolved.configuration,null);assert.equal(unresolved.questions[0].reason,'CONTRADICTION');
    assert.deepEqual(JSON.parse((await request527(f,path,otherHeaders)).body),unresolved);
    assert.deepEqual(JSON.parse((await request527(f,path,headers)).body),value);
    await f.restartDraftBackend();assert.deepEqual(JSON.parse((await request527(f,path,headers)).body),value);
    assert.equal((await request527(f,'/t/tenant-a/workspace/logout',headers,'POST')).status,200);
    assert.equal((await request527(f,path,headers)).status,401);
    const again=sessions.issueOwnerSession({subjectId:'synthetic-draft-user',role:'reader',expiresAtMs:Date.now()+120000});
    assert.deepEqual(JSON.parse((await request527(f,path,{cookie:again.cookieHeader})).body),value);
    assert.equal(JSON.stringify(nativeRows(f.native.root,'SELECT revision,effect_key,command,event FROM pan516_events ORDER BY revision')),before);
  } finally {await f.close();}
});
test('A2 Main297 configuration attachment preserves delivered profile/context/native routes and independent revision histories',async()=>{
  const f=await draftWorkspaceFixture();
  try{
    const before=JSON.stringify(nativeRows(f.native.root,'SELECT revision,effect_key,command,event FROM pan516_events ORDER BY revision'));
    const user=f.gateway.sessionAdapter('tenant-a').issueOwnerSession({subjectId:'synthetic-coexistence-user',role:'reader',expiresAtMs:Date.now()+120000});
    const cookie={cookie:user.cookieHeader};const prefix='/t/tenant-a/workspace';
    const context=JSON.parse((await request527(f,prefix+'/context',cookie)).body);
    const draftHeaders={...cookie,origin:f.origin,'x-pan563-context':context.sessionId};
    const profileHeaders={...cookie,origin:f.origin,'x-pan543-session':context.sessionId};
    const readProfile=await request527(f,prefix+'/profile',cookie);assert.equal(readProfile.status,200);assert.equal(JSON.parse(readProfile.body).revision,0);
    const savedDraft=await request527(f,prefix+'/configuration',draftHeaders,'POST',command(0));assert.equal(savedDraft.status,200);
    const profile=defaultBrowserProfileV1();profile.items[3].visible=true;profile.items[3].size='large';
    const savedProfile=await request527(f,prefix+'/profile',profileHeaders,'POST',{expectedRevision:0,profile});assert.equal(savedProfile.status,200);
    assert.deepEqual(JSON.parse((await request527(f,prefix+'/configuration',cookie)).body),JSON.parse(savedDraft.body));
    assert.deepEqual(JSON.parse((await request527(f,prefix+'/profile',cookie)).body),JSON.parse(savedProfile.body));
    assert.equal((await request527(f,prefix+'/profile',draftHeaders,'POST',{expectedRevision:1,profile})).status,401);
    assert.equal((await request527(f,prefix+'/configuration',profileHeaders,'POST',command(1))).status,403);
    for(const path of ['/t/tenant-a/api/status','/t/tenant-a/api/effective-rights',prefix+'/context',prefix+'/erv'])assert.equal((await request527(f,path,cookie)).status,200,path);
    const html=await request527(f,prefix,cookie);assert.equal(html.status,200);assert.match(html.body,/profile.controls/);assert.match(html.body,/data-owner-configuration-drafts="true"/);
    await f.restartDraftBackend();
    assert.deepEqual(JSON.parse((await request527(f,prefix+'/configuration',cookie)).body),JSON.parse(savedDraft.body));
    assert.deepEqual(JSON.parse((await request527(f,prefix+'/profile',cookie)).body),JSON.parse(savedProfile.body));
    assert.equal(JSON.stringify(nativeRows(f.native.root,'SELECT revision,effect_key,command,event FROM pan516_events ORDER BY revision')),before);
  }finally{await f.close();}
});
