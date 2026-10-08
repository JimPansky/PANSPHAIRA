// Actual process-bound persistence observer. Synthetic session material is
// passed through stdin only; it is neither logged nor written to new files.
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {isAbsolute,resolve} from 'node:path';
import {createProtectedSessionAdapterV1} from '../../src/pan527/origin-session-adapter.mjs';
import {createNativeNotificationsV1} from '../../src/pan544/native-notifications.mjs';
const [root,stateRoot,...extra]=process.argv.slice(2);
if(extra.length||[root,stateRoot].some(path=>typeof path!=='string'||!isAbsolute(path)||resolve(path)!==path||realpathSync(path)!==path||!lstatSync(path).isDirectory()||lstatSync(path).uid!==process.getuid()||(lstatSync(path).mode&0o777)!==0o700))throw new Error('PAN544_RESTART_CUSTODY_DENIED');
const raw=readFileSync(0,'utf8');if(Buffer.byteLength(raw)>20000)throw new Error('PAN544_RESTART_INPUT_DENIED');
const input=JSON.parse(raw);
if(input.sessionOptions?.stateRoot!==stateRoot||!['MARK_READ_AND_DROP_RESPONSE','READ_FRESH_LOGIN'].includes(input.mode))throw new Error('PAN544_RESTART_CUSTODY_DENIED');
const sessions=createProtectedSessionAdapterV1(input.sessionOptions);
const feed=createNativeNotificationsV1({root,sessions,catalog:()=>[{id:'pan.erv',version:'1.0.0',state:'AVAILABLE'}]});
if(input.mode==='MARK_READ_AND_DROP_RESPONSE'){
  const actual=feed.markRead(input.headers,input.command);
  if(actual.outcome!=='READ_CONFIRMED'||actual.read!==true||actual.newTaskEffect!==false)throw new Error('PAN544_REAL_CHILD_MARKREAD_NOT_COMMITTED');
  process.exit(73);
}
process.stdout.write(JSON.stringify(feed.feed(input.headers)));
