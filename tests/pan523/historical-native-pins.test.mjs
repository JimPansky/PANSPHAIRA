import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
const path='src/pan515/trade-state.mjs',historical='2683948f11df1978e7d4d02ce3fd60d430f55a7f7cd4bc7aa6d7d0041e576ddd';
test('P09 exact predecessor source pins remain historical and admit only the separately hash-bound reviewed native successor',async()=>{
 const file='tests/fixtures/pan523/historical-native-pins.mjs';assert.ok(existsSync(file),'Three actual historical native pin regressions have no closed predecessor/successor admission helper');
 const {assertHistoricalNativePin}=await import('../fixtures/pan523/historical-native-pins.mjs');assertHistoricalNativePin(path,historical);
 const a=JSON.parse(readFileSync('verification/pan523-historical-native-source-admission-v1.json','utf8'));
 for(const change of [{path:'src/pan515/neighbor.mjs'},{historicalSha256:'0'.repeat(64)},{currentSha256:'0'.repeat(64)},{historicalCommit:'0'.repeat(40)},{historicalArtifact:'tests/fixtures/pan523/neighbor.txt'},{scope:'UNBOUNDED_ALL_SOURCE_PINS'},{currentExecutionClaimedForOldReceipt:true},{extra:true}])assert.throws(()=>assertHistoricalNativePin(path,historical,{...a,...change}));
 assert.throws(()=>assertHistoricalNativePin(path,'0'.repeat(64),a));
});
