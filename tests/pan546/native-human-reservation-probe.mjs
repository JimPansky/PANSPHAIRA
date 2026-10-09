// Owned regression child: holds only this fixture's REAL native SQLite writer
// reservation, changes no data and does not hold/adopt the Human journal owner.
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {lstatSync,realpathSync} from 'node:fs';
if(process.argv.length!==2||!process.channel)throw Error('PAN546_OWNED_NATIVE_CHILD_IPC_REQUIRED');
process.once('message',options=>{let db;try{
 if(Object.keys(options).sort().join(',')!=='holdMs,root'||options.holdMs!==2000||typeof options.root!=='string'||realpathSync(options.root)!==options.root||!lstatSync(options.root).isDirectory())throw Error('PAN546_OWNED_NATIVE_CHILD_SCOPE_DENIED');
 db=new DatabaseSync(join(options.root,'target.sqlite'));db.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE');process.send({outcome:'ACTUAL_NATIVE_WRITE_RESERVATION_HELD',atMs:Date.now()});
 setTimeout(()=>{try{db.exec('COMMIT');db.close();db=null;process.send({outcome:'ACTUAL_NATIVE_WRITE_RESERVATION_RELEASED',atMs:Date.now()});process.disconnect();}catch(error){process.send({outcome:'ACTUAL_OWNED_CHILD_FAILED',error:error.message});process.exitCode=1;process.disconnect();}},options.holdMs);
 }catch(error){db?.close();process.send({outcome:'ACTUAL_OWNED_CHILD_FAILED',error:error.message});process.exitCode=1;process.disconnect();}});
