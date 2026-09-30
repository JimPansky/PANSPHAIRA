// Snapshot primitives only; stopped-writer authority is exercised by the
// Docker controller tests, not inferred from these filesystem unit tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync,mkdtempSync,mkdirSync,writeFileSync,readFileSync,symlinkSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {retainedTreeV1,copyRetainedCheckpointV1,preserveAndRestoreV1,strictOwnedPathV1} from '../../src/pan464/retained-snapshot.mjs';
function scope(t){const root=mkdtempSync(join(tmpdir(),'pan464-snapshot-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const state=join(root,'state');mkdirSync(state);writeFileSync(join(state,'data'),'retained source');return {ownedRoot:root,state,checkpoint:join(root,'checkpoint'),rejected:join(root,'rejected')};}
test('actual copy binds every byte and relative native generation pointer',t=>{
  const x=scope(t);mkdirSync(join(x.state,'generation'));writeFileSync(join(x.state,'generation','metadata'),'native database bytes');symlinkSync('generation',join(x.state,'active'));
  const snapshot=copyRetainedCheckpointV1(x);assert.equal(retainedTreeV1(x.state).digest,snapshot.digest);
  writeFileSync(join(x.state,'data'),'healthy wrong business');
  const restored=preserveAndRestoreV1({...x,expectedDigest:snapshot.digest});assert.equal(restored.outcome,'RESTORED_LOCAL_COPY');
  assert.equal(readFileSync(join(x.rejected,'data'),'utf8'),'healthy wrong business');assert.equal(readFileSync(join(x.state,'data'),'utf8'),'retained source');
});
test('snapshot substitution cannot be restored',t=>{
  const x=scope(t);const snapshot=copyRetainedCheckpointV1(x);writeFileSync(join(x.checkpoint,'data'),'rehashed caller replacement');
  assert.throws(()=>preserveAndRestoreV1({...x,expectedDigest:snapshot.digest}),/RESTORE_BINDING_DENIED/);
  assert.equal(readFileSync(join(x.state,'data'),'utf8'),'retained source');
});
test('native PostgreSQL/key directory modes survive copy and restore exactly',t=>{
  const x=scope(t);mkdirSync(join(x.state,'postgres'));chmodSync(join(x.state,'postgres'),0o700);
  writeFileSync(join(x.state,'postgres','private-synthetic-key'),'synthetic');chmodSync(join(x.state,'postgres','private-synthetic-key'),0o600);
  const snapshot=copyRetainedCheckpointV1(x);assert.equal(statSync(join(x.checkpoint,'postgres')).mode&0o777,0o700);
  preserveAndRestoreV1({...x,expectedDigest:snapshot.digest});assert.equal(statSync(join(x.state,'postgres')).mode&0o777,0o700);
  assert.equal(statSync(join(x.state,'postgres','private-synthetic-key')).mode&0o777,0o600);
});
test('unowned, reused and escaping symlink destinations are denied before replacement',t=>{
  const x=scope(t);assert.throws(()=>strictOwnedPathV1(x.ownedRoot,x.ownedRoot),/OWNED_PATH_DENIED/);
  copyRetainedCheckpointV1(x);assert.throws(()=>copyRetainedCheckpointV1(x),/CHECKPOINT_DESTINATION_DENIED/);
  symlinkSync('../outside',join(x.state,'escape'));assert.throws(()=>retainedTreeV1(x.state),/SNAPSHOT_LINK_DENIED/);
});
