// Bounded local synthetic journal owner. Persistent opt-in mode prevents exported
// gate/workbench constructors from silently opening the same composed journal.
// NOT an OS sandbox, cross-host lock, or automatic dead-worker recovery.
import { closeSync, existsSync, fsyncSync, fstatSync, mkdirSync, openSync, readFileSync,
  realpathSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
const leases = new WeakMap();
const MODE = 'pansphaira.local/journal-owner/v2\n';
const RESERVED = 'pan453-owned-v2';

// v2 is a separate, named synthetic journal namespace, never adopted from a
// legacy root. A direct entry point refuses even before mode is installed.
export function isOwnedSyntheticPath(path) {
  return path.split(/[\\/]+/).includes(RESERVED);
}


export function acquireLocalJournalOwner(root) {
  if (!isOwnedSyntheticPath(root)) throw Error('JOURNAL_OWNED_NAMESPACE_REQUIRED_DENIED');
  mkdirSync(root,{recursive:true});
  const actual = realpathSync(root);
  if (!isOwnedSyntheticPath(actual)) throw Error('JOURNAL_OWNED_NAMESPACE_REQUIRED_DENIED');
  const mode = join(actual,'journal-owner.mode');
  if(!existsSync(mode) && (existsSync(join(actual,'effects.json')) || existsSync(join(actual,'approvals.json'))))
    throw Error('JOURNAL_UNOWNED_ADOPTION_DENIED');
  try {
    writeFileSync(mode, MODE, {flag:'wx',mode:0o600,flush:true});
    const dirFd=openSync(actual,'r');try{fsyncSync(dirFd);}finally{closeSync(dirFd);}
  } catch(error) {
    if(error?.code!=='EEXIST')throw error;
    if(readFileSync(mode,'utf8')!==MODE)throw Error('JOURNAL_MODE_INVALID_DENIED');
  }
  const marker = join(actual,'operation.lock');
  let fd;
  try { fd=openSync(marker,'wx',0o600); }
  catch(error){ if(error?.code==='EEXIST')throw Error('BTH_JOURNAL_FENCED_DENIED');throw error; }
  const inode=fstatSync(fd).ino;
  const token=Object.freeze({});
  leases.set(token,{root:actual,marker,fd,inode,live:true});
  try { writeFileSync(fd,JSON.stringify({pid:process.pid,scope:'LOCAL_SYNTHETIC_ORDER'}));fsyncSync(fd);
    const dirFd=openSync(actual,'r');try{fsyncSync(dirFd);}finally{closeSync(dirFd);}
  }
  catch(error){ closeSync(fd);unlinkSync(marker);leases.get(token).live=false;throw error; }
  return Object.freeze({token,release() {
    const lease=leases.get(token);
    if(!lease?.live)throw Error('JOURNAL_OWNER_RELEASE_INVALID_DENIED');
    lease.live=false;
    closeSync(fd);
    if(statSync(marker).ino!==inode)throw Error('JOURNAL_OWNER_REPLACED_DENIED');
    unlinkSync(marker);
    const dirFd=openSync(actual,'r');try{fsyncSync(dirFd);}finally{closeSync(dirFd);}
  }});
}

export function assertLocalJournalOwner(receiptPath, token) {
  if (isOwnedSyntheticPath(receiptPath) && token == null)
    throw Error('JOURNAL_OWNER_REQUIRED_DENIED');
  if(!existsSync(dirname(receiptPath)))return;
  const root=realpathSync(dirname(receiptPath));
  const mode=join(root,'journal-owner.mode');
  if (isOwnedSyntheticPath(root) && !existsSync(mode))
    throw Error('JOURNAL_OWNER_REQUIRED_DENIED');
  if(!existsSync(mode))return;
  if(readFileSync(mode,'utf8')!==MODE)throw Error('JOURNAL_MODE_INVALID_DENIED');
  const lease=leases.get(token);
  if(!lease?.live || lease.root!==root || fstatSync(lease.fd).ino!==lease.inode
    || statSync(lease.marker).ino!==lease.inode)throw Error('JOURNAL_OWNER_REQUIRED_DENIED');
}
