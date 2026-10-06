// Historical execution pins stay original; this is a closed current-reader
// admission for one new native source, not an old execution rerun or authority.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
export function assertHistoricalNativePin(path,expectedHash,admission=null){
 if(path!=='src/pan515/trade-state.mjs'){assert.equal(sha(path),expectedHash,path);return;}
 const a=admission??JSON.parse(readFileSync('verification/pan523-historical-native-source-admission-v1.json','utf8'));
 assert.deepEqual(Object.keys(a).sort(),['schemaVersion','historicalCommit','path','historicalSha256','currentSha256','historicalArtifact','scope','currentExecutionClaimedForOldReceipt'].sort());
 assert.equal(a.schemaVersion,'pansphaira.pan523/historical-native-pin-admission/v1');assert.equal(a.historicalCommit,'54d4a597536a52b110bab7d23b5b32cfd060244e');assert.equal(a.path,path);
 assert.equal(a.historicalSha256,'2683948f11df1978e7d4d02ce3fd60d430f55a7f7cd4bc7aa6d7d0041e576ddd');assert.equal(expectedHash,a.historicalSha256);
 assert.equal(a.historicalArtifact,'tests/fixtures/pan523/retained-pan515-trade-state-54d4a597.txt');assert.equal(sha(a.historicalArtifact),a.historicalSha256);
 assert.match(a.currentSha256,/^[a-f0-9]{64}$/);assert.equal(sha(path),a.currentSha256);
 assert.equal(a.scope,'ONE_NATIVE_SOURCE_SUCCESSOR_ONLY_OLD_EXECUTION_NOT_RELABELLED');assert.equal(a.currentExecutionClaimedForOldReceipt,false);
}
