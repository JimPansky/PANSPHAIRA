import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

test('J01 selected profile has explicit operator instructions, exact artifact identity and default-off rollback',()=>{
  const text=readFileSync('docs/EXTERNAL-BI-SERVICE.md','utf8');
  for(const marker of ['BI_AGENT_PAIR_PROFILE=KS_J02_0181_C2_V1','v0.18.1','826bcc27fa1a59514001b550a8d07c2fd129bf68089ddc98bdf626b2eb346145','/v2/provider-profile','trusted-apply','PAN524'])assert(text.includes(marker),`missing ${marker}`);
  assert.match(text,/legacy.*v0\.8\.0/i);assert.match(text,/Remove.*BI_AGENT_BASE_URL/);
});

test('J01 real pair runner refuses an implicit endpoint before network or provider activation',()=>{
  const result=spawnSync(process.execPath,['scripts/verify-pan524-exact-bi-pair-v1.mjs'],{encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/PAN524_EXPLICIT_PROVIDER_URL_REQUIRED/);
});
