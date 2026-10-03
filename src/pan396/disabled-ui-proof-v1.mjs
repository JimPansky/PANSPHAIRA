// Only the previously admitted disabled UI lifecycle endpoints, never UI activation.
import assert from 'node:assert/strict';
export async function verifyPan396DisabledUiV1(client) {
 const rows=[];
 for(const alias of ['_floci','_localstack']) {
  const page=await client.denyDisabledUi(alias);
  assert.equal(page.status,200);assert(page.headers['content-type'].includes('text/html'));
  let status;let observation;const until=Date.now()+2000;
  do {
   observation=await client.denyDisabledUi(alias,true);assert.equal(observation.status,200);
   status=JSON.parse(observation.text);assert.deepEqual(Object.keys(status).sort(),['error','ready','url']);
   assert.equal(status.ready,false);assert.equal(status.url,null);
   if(status.error)break;
   await new Promise(resolve=>setTimeout(resolve,25));
  }while(Date.now()<until);
  assert.equal(status.error,'The Floci web console is disabled (set floci.services.ui.enabled=true to enable it).');
  rows.push({alias,interstitialStatus:page.status,interstitialIsNotAdmission:true,status:observation.status,...status,sidecarStartDeniedByEffectiveConfig:true,responseSha256:observation.auditRow.responseSha256});
 }
 return rows;
}
