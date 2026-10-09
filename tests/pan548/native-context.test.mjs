import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {nativeFixture527,request527} from '../pan527/helpers.mjs';
import {financeFixture} from '../pan519/native-fixture.mjs';
import {nativeRows} from '../fixtures/pan515/native-trade-fixture.mjs';
import {createNativeErvReadAdapterV1} from '../../src/pan541/native-erv-read-adapter.mjs';
import {enableWorkspaceBrowserV1} from '../../src/pan541/workspace-browser.mjs';
import * as ingress from '../../src/pan527/origin-session-adapter.mjs';
const base='/t/tenant-a/workspace/context-selection';
async function fixture(){
 assert.equal(typeof ingress.mountProtectedWorkspaceContextSelectionV1,'function','PAN548_AUTHENTIC_NATIVE_CONTEXT_OWNER_NOT_IMPLEMENTED');
 const tls=await nativeFixture527();let native,workspace;
 try{native=await financeFixture();const reader=createNativeErvReadAdapterV1({tenantId:'tenant-a',root:native.root});workspace=enableWorkspaceBrowserV1({optIn:true,gateway:tls.gateway,tenantId:'tenant-a',origin:tls.origin,nativeReader:reader,contextSelection:true});
  const sessions=tls.gateway.sessionAdapter('tenant-a'),issued=sessions.issueOwnerSession({subjectId:'synthetic-context-reader',role:'reader',expiresAtMs:Date.now()+60000});
  const headers={cookie:issued.cookieHeader,origin:tls.origin,'x-pan548-session':'session:'+createHash('sha256').update(issued.cookieHeader).digest('hex')};
  return {tls,native,workspace,headers,sessions,async close(){workspace.close();native.close();await tls.close();}};
 }catch(error){workspace?.close();native?.close();await tls.close();throw error;}
}
async function tab(f,headers=f.headers){const r=await request527(f.tls,base+'/tab',headers,'POST',{});assert.equal(r.status,200,r.body);const boot=JSON.parse(r.body);assert.equal(boot.schemaVersion,'pansphaira.workspace-context/tab-bootstrap/v1');assert.match(boot.tabProof,/^[a-f0-9]{64}$/);const context=boot.snapshot.context;return {headers:{...headers,'x-pan548-tab':boot.tabProof,'x-pan548-tab-id':context.binding.tabId},snapshot:boot.snapshot};}
async function snapshot(f,t){const r=await request527(f.tls,base,t.headers);assert.equal(r.status,200,r.body);return JSON.parse(r.body);}
function claim(snapshot,moduleId='pan.erv',objectId='AP-PAN516-MATCHED-01',domainRevision=4,selection={elementId:'pan.erv.amount',rowId:null}){const c=snapshot.context;return {schemaVersion:'pansphaira.workspace-context/claim/v1',tabId:c.binding.tabId,moduleId,viewId:moduleId+'.view',primaryObjectId:objectId,expected:{...c.revisions,domainRevision,epoch:c.binding.epoch},selection};}
async function issue(f,t,value){return request527(f.tls,base,t.headers,'POST',value);}
async function verify(f,t,c=t.snapshot.context){return request527(f.tls,base+'/verify',t.headers,'POST',{schemaVersion:'pansphaira.workspace-context/verify/v1',tabId:c.binding.tabId,contextHandle:c.contextHandle});}
function history(f){return JSON.stringify(nativeRows(f.native.root,'SELECT revision,effect_key,command,event FROM pan516_events ORDER BY revision'));}

test('DUI-02-AC01/02 actual protected native issuer binds current session/runtime, ERV source revision and semantic membership without execution effects',async()=>{
 const f=await fixture();try{const before=history(f),t=await tab(f),setup=t.snapshot.context;assert.equal(setup.moduleId,'pan.setup');assert.equal(setup.primaryObject,null);assert.equal(setup.revisions.domainRevision,null);assert.equal(setup.binding.subjectId,'synthetic-context-reader');assert.equal(setup.binding.tenantId,'tenant-a');assert.equal(setup.binding.origin,f.tls.origin);assert.equal(setup.binding.instanceId,f.sessions.binding.instanceId);assert.equal(setup.binding.generation,f.sessions.binding.generation);
  const invoice=JSON.parse((await request527(f.tls,'/t/tenant-a/workspace/erv?objectId=AP-PAN516-MATCHED-01',f.headers)).body),r=await issue(f,t,claim(t.snapshot,'pan.erv',invoice.invoiceId,invoice.revision));assert.equal(r.status,200,r.body);const s=JSON.parse(r.body),c=s.context;assert.match(c.contextHandle,/^context:[a-f0-9]{64}$/);assert.equal(c.primaryObject.revision,invoice.revision);assert.equal(c.revisions.domainRevision,invoice.revision);assert.equal(c.revisions.hostRevision,setup.revisions.hostRevision);assert.equal(c.revisions.viewRevision,setup.revisions.viewRevision);assert.equal(c.revisions.catalogRevision,setup.revisions.catalogRevision);assert.ok(c.binding.epoch>setup.binding.epoch);assert.ok(c.revisions.selectionRevision>setup.revisions.selectionRevision);assert.deepEqual(c.selection,{elementId:'pan.erv.amount',rowId:null});assert.equal(c.sourceMap,null);assert.equal(c.executionAuthorityGranted,false);assert.equal(c.effectsProduced,false);assert.ok(s.selections.some(x=>x.elementId==='pan.erv.summary'&&x.rowId===invoice.invoiceId));assert.equal((await verify(f,t,c)).status,200);assert.equal((await verify(f,t,setup)).status,409);
  const selected=await issue(f,t,claim(s,'pan.erv',invoice.invoiceId,invoice.revision,{elementId:'pan.erv.summary',rowId:invoice.invoiceId}));assert.equal(selected.status,200,selected.body);assert.equal(history(f),before);console.log('PAN548 actual session HMAC/TLS issuer + native SQLite revision/selection; leading history unchanged; no inference/write grant');
 }finally{await f.close();}
});
test('DUI-02-AC02 actual ERV-null and Setup-null native views remain separate from domain revision and invalidate previous module handles',async()=>{
 const f=await fixture();try{const t=await tab(f);const empty=await issue(f,t,claim(t.snapshot,'pan.erv',null,null,null));assert.equal(empty.status,200,empty.body);const s=JSON.parse(empty.body);assert.equal(s.context.primaryObject,null);assert.equal(s.context.revisions.domainRevision,null);assert.deepEqual(s.selections,[]);const back=await issue(f,t,claim(s,'pan.setup',null,null,{elementId:'pan.setup.health',rowId:null}));assert.equal(back.status,200,back.body);assert.equal((await verify(f,t,s.context)).status,409);assert.equal(JSON.parse(back.body).context.primaryObject,null);
 }finally{await f.close();}
});
test('DUI-02 authentic registry denies tenant/subject/role/tab spoof, invented native row/element, CSS/source-map and schema drift with no leading effects',async()=>{
 const f=await fixture();try{const before=history(f),t=await tab(f);for(const mutate of [x=>{x.tenantId='tenant-b';},x=>{x.subjectId='synthetic-owner';},x=>{x.role='reviewer';},x=>{x.tabId='tab:'+'f'.repeat(32);},x=>{x.selection.elementId='pan.erv.invented';},x=>{x.selection.rowId='invented-row';},x=>{x.selection.elementId='#invoice .amount';},x=>{x.sourceMap={path:'private.ts'};},x=>{x.moduleId='pan.diagnostic.broken';x.viewId=x.moduleId+'.view';},x=>{x.schemaVersion='pansphaira.workspace-context/claim/v99';},x=>{x.expected.domainRevision=1;}]){const c=claim(t.snapshot);mutate(c);const r=await issue(f,t,c);assert.ok([400,403,409].includes(r.status),r.body);assert.notEqual(r.status,200);}
  assert.equal((await request527(f.tls,'/t/tenant-b/workspace/context-selection',t.headers)).status,401);assert.equal((await issue(f,{...t,headers:{...t.headers,'x-tenant-id':'tenant-b'}},claim(t.snapshot))).status,403);assert.equal(history(f),before);assert.equal((await verify(f,t)).status,200);
 }finally{await f.close();}
});
test('DUI-02 authentic copied handles fail in other live tab, subject/session and stale lease; logout revokes current own tab',async(tcase)=>{
 const f=await fixture();try{const a=await tab(f),b=await tab(f);assert.notEqual(a.snapshot.context.binding.tabId,b.snapshot.context.binding.tabId);assert.equal((await verify(f,b,a.snapshot.context)).status,403);assert.equal((await request527(f.tls,base,{...b.headers,'x-pan548-tab-id':a.snapshot.context.binding.tabId})).status,403);
  const other=f.sessions.issueOwnerSession({subjectId:'synthetic-context-other',role:'reader',expiresAtMs:Date.now()+60000}),otherHeaders={...a.headers,cookie:other.cookieHeader,'x-pan548-session':'session:'+createHash('sha256').update(other.cookieHeader).digest('hex')};assert.equal((await request527(f.tls,base,otherHeaders)).status,403);
  const current=a.snapshot.context,clock=tcase.mock.method(Date,'now',()=>current.lease.expiresAtMs);try{const r=await verify(f,a,current);assert.ok([401,410].includes(r.status),r.body);}finally{clock.mock.restore();}
  assert.equal((await request527(f.tls,'/t/tenant-a/workspace/logout',f.headers,'POST')).status,200);assert.equal((await verify(f,b)).status,401);
 }finally{await f.close();}
});
test('DUI-02 native personal view and catalog revisions revalidate independently rather than treating a copied readback as a grant',async()=>{
 const f=await fixture();try{const t=await tab(f),old=t.snapshot.context;const profile=JSON.parse((await request527(f.tls,'/t/tenant-a/workspace/profile',f.headers)).body);const body={expectedRevision:profile.revision,profile:profile.profile};body.profile.items.find(x=>x.id==='shell.main').size='compact';const r=await request527(f.tls,'/t/tenant-a/workspace/profile',{...f.headers,'x-pan543-session':old.binding.sessionId},'POST',body);assert.equal(r.status,200,r.body);assert.equal((await verify(f,t,old)).status,409);const fresh=(await snapshot(f,t)).context;assert.equal(fresh.revisions.viewRevision,old.revisions.viewRevision+1);assert.equal(fresh.revisions.hostRevision,old.revisions.hostRevision);assert.equal(fresh.revisions.catalogRevision,old.revisions.catalogRevision);assert.equal(fresh.revisions.selectionRevision,old.revisions.selectionRevision);assert.equal(fresh.binding.epoch,old.binding.epoch);
 }finally{await f.close();}
});
