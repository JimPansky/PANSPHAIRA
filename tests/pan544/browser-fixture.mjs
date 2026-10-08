import {createHash} from 'node:crypto';
import {nativeFixture527,request527} from '../pan527/helpers.mjs';
import {financeFixture} from '../pan519/native-fixture.mjs';
import {initializeNativeErvHumanBackendV1,createNativeErvHumanBackendV1} from '../../src/pan542/native-human-backend.mjs';
import {createNativeNotificationsV1} from '../../src/pan544/native-notifications.mjs';
import {createNativeErvReadAdapterV1} from '../../src/pan541/native-erv-read-adapter.mjs';
export const invoiceId544='AP-PAN516-MATCHED-01';
export function decision544(p,action,id){return {schemaVersion:'pansphaira.erv-human/decision/v1',invoiceId:p.invoiceId,effectId:'synthetic:notification-browser-'+id,transportId:'synthetic:notification-browser-wire-'+id,expectedNativeRevision:p.nativeRevision,expectedProposalRevision:p.proposalRevision,proposalDigest:p.proposalDigest,action};}
export async function browserFixture544({publish=true}={}){
  const tls=await nativeFixture527();let native;let service;
  try{
    native=await financeFixture();const sessions=tls.gateway.sessionAdapter('tenant-a');
    initializeNativeErvHumanBackendV1({root:native.root,owner:'LOCAL_SYNTHETIC_OWNER',sessionBinding:sessions.binding});
    const human=createNativeErvHumanBackendV1({root:native.root,sessions});
    function issue(subjectId,role='reviewer',leaseMs=300000){const s=sessions.issueOwnerSession({subjectId,role,expiresAtMs:Date.now()+leaseMs});return {cookie:s.cookieHeader,origin:sessions.origin,'x-pan527-csrf':s.csrf};}
    const reviewer=issue('synthetic:erv-reviewer'),approver=issue('synthetic:erv-approver'),reader=issue('synthetic:erv-reader','reader');
    let plugin='AVAILABLE';service=createNativeNotificationsV1({root:native.root,sessions,catalog:()=>plugin==='ABSENT'?[]:[{id:'pan.erv',version:'1.0.0',state:plugin}]});
    if(publish){human.decide(reviewer,decision544(human.read(reviewer,{invoiceId:invoiceId544}),'REVIEW','initial-001'));service.publishNativeEvent(reviewer,{invoiceId:invoiceId544});}
    const nativeReader=createNativeErvReadAdapterV1({tenantId:'tenant-a',root:native.root});
    const proof=headers=>'session:'+createHash('sha256').update(headers.cookie).digest('hex');
    const headers=(who=approver)=>({host:new URL(tls.origin).host,...who,'x-pan544-context':proof(who)});
    return {tls,native,sessions,human,service,nativeReader,reviewer,approver,reader,issue,headers,proof,setPlugin(state){plugin=state;},request(path,method='GET',value,who=approver){return request527(tls,'/t/tenant-a/workspace/notifications'+path,headers(who),method,value);},async close(){service.close();native.close();await tls.close();}};
  }catch(error){service?.close();native?.close();await tls.close();throw error;}
}
