// Public synthetic test client, not a mock of the affected writer or SQL store.
// One living old writer / one already-open native batch connection before fence.
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {writePan472SyntheticSource} from '../../../src/pan472/persistent-draft-transfer.mjs';
import {canonicalJson} from '../../../src/pan472/draft-profile.mjs';
const [root,mode]=process.argv.slice(2);if(!['old-writer','old-batch'].includes(mode)||!process.send)throw Error('OWNED_SYNTHETIC_IPC_CLIENT_REQUIRED');
const db=mode==='old-batch'?new DatabaseSync(join(root,'source.sqlite')):null;
if(db)db.exec('PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
const statements=db?{
 insert:db.prepare('INSERT INTO events(id,kind,revision,deleted,body) VALUES(?,?,?,?,?)'),
 update:db.prepare('UPDATE objects SET revision=?,body=?,sequence=? WHERE id=?'),
 head:db.prepare('UPDATE meta SET value=? WHERE key=?'),
}:null;
process.on('message',message=>{
 if(message?.action==='EXIT'){db?.close();process.exit(0);}
 if(message?.action!=='WRITE')return;
 try{
  const change=message.change;
  if(mode==='old-writer')writePan472SyntheticSource({root,changes:[change]});
  else{
   db.exec('BEGIN IMMEDIATE');try{
    const body=canonicalJson(change.body),inserted=statements.insert.run(change.id,change.kind,change.revision,0,body);
    statements.update.run(change.revision,body,Number(inserted.lastInsertRowid),change.id);statements.head.run(String(inserted.lastInsertRowid),'last-sequence');db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e;}
  }
  process.send({outcome:'SOURCE_WRITTEN',pid:process.pid,mode});
 }catch(error){process.send({outcome:'DENIED',code:error.message,pid:process.pid,mode});}
});
process.send({outcome:'READY',pid:process.pid,mode,preopenedNativeBatchConnection:db!==null});
