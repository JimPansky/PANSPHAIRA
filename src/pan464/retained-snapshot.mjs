// Closed snapshot support for the PAN464 owned, fully stopped synthetic pair.
// A LOCAL_COPY, never an offhost backup or a proof of quiescence by itself.
import {createHash} from 'node:crypto';
import {chmodSync, closeSync, cpSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync} from 'node:fs';
import {isAbsolute, join, relative, resolve, sep} from 'node:path';
import {canonicalJson} from '../../demo/runtime/enforcement-gate.mjs';
export const digestV1 = value => createHash('sha256').update(canonicalJson(value)).digest('hex');
const fail = code => {throw Error(`PAN464_${code}`);};
function disjoint(paths) {
  for(let i=0;i<paths.length;i++)for(let j=0;j<paths.length;j++)if(i!==j){
    const rel=relative(paths[i],paths[j]);
    if(!rel||(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith(`..${sep}`)))fail('PATHS_NOT_DISTINCT');
  }
}
function syncDirectory(path) {const fd=openSync(path,'r');try{fsyncSync(fd);}finally{closeSync(fd);}}
function syncTree(root,tree) {
  for(const entry of tree.entries){
    if(entry.kind==='FILE')syncDirectory(join(root,entry.path));
  }
  for(const entry of [...tree.entries].reverse())if(entry.kind==='DIRECTORY')syncDirectory(join(root,entry.path));
  syncDirectory(root);
}
function copyTree(source,target,tree) {
  cpSync(source,target,{recursive:true,dereference:false,verbatimSymlinks:true,errorOnExist:true,force:false});
  // Native copy/host default ACLs can otherwise widen directory permissions.
  // Restore the observed source modes before verification, never relax source.
  for(const entry of [...tree.entries].reverse())if(entry.kind!=='LINK')chmodSync(join(target,entry.path),entry.mode);
  chmodSync(target,tree.rootMode);
}
export function strictOwnedPathV1(ownedRoot,path,{exists=true}={}) {
  if(!isAbsolute(ownedRoot)||resolve(ownedRoot)!==ownedRoot||realpathSync(ownedRoot)!==ownedRoot
    ||!isAbsolute(path)||resolve(path)!==path)fail('OWNED_PATH_DENIED');
  const rel=relative(ownedRoot,path);
  if(!rel||isAbsolute(rel)||rel==='..'||rel.startsWith(`..${sep}`))fail('OWNED_PATH_DENIED');
  let cursor=ownedRoot;
  for(const part of rel.split(sep)){
    cursor=join(cursor,part);
    try {const stat=lstatSync(cursor);if(stat.isSymbolicLink()||!stat.isDirectory())fail('OWNED_PATH_DENIED');}
    catch(error){if(!exists&&error.code==='ENOENT')break;throw error;}
  }
  return path;
}
export function retainedTreeV1(root) {
  if(!lstatSync(root).isDirectory()||lstatSync(root).isSymbolicLink()||realpathSync(root)!==root)fail('SNAPSHOT_ROOT_DENIED');
  const entries=[];
  function walk(dir){
    for(const name of readdirSync(dir).sort()){
      const path=join(dir,name), stat=lstatSync(path), rel=relative(root,path);
      if(stat.isSymbolicLink()){
        const target=readlinkSync(path), resolved=resolve(dir,target), bound=relative(root,resolved);
        if(isAbsolute(target)||bound==='..'||bound.startsWith(`..${sep}`)||isAbsolute(bound))fail('SNAPSHOT_LINK_DENIED');
        entries.push({path:rel,kind:'LINK',target});
      } else if(stat.isDirectory()){
        entries.push({path:rel,kind:'DIRECTORY',mode:stat.mode&0o777});walk(path);
      } else if(stat.isFile()){
        entries.push({path:rel,kind:'FILE',mode:stat.mode&0o777,size:stat.size,
          sha256:createHash('sha256').update(readFileSync(path)).digest('hex')});
      } else fail('SNAPSHOT_SPECIAL_FILE_DENIED');
    }
  }
  walk(root);
  const rootMode=lstatSync(root).mode&0o777;
  return {class:'LOCAL_COPY',rootMode,entries,digest:digestV1({rootMode,entries})};
}
export function copyRetainedCheckpointV1({ownedRoot,state,checkpoint}) {
  strictOwnedPathV1(ownedRoot,state);strictOwnedPathV1(ownedRoot,checkpoint,{exists:false});
  const rel=relative(state,checkpoint);
  if(!rel||(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith(`..${sep}`))||existsSync(checkpoint))fail('CHECKPOINT_DESTINATION_DENIED');
  const before=retainedTreeV1(state);
  copyTree(state,checkpoint,before);
  const copy=retainedTreeV1(checkpoint), after=retainedTreeV1(state);
  if(before.digest!==copy.digest||before.digest!==after.digest)fail('CHECKPOINT_CHANGED_HELD');
  syncTree(checkpoint,copy);syncDirectory(ownedRoot);
  return copy;
}
// Called by the trusted controller ONLY while its observed writer set is empty
// and before activation intent. Preserve rejected bytes instead of deleting.
export function preserveAndRestoreV1({ownedRoot,state,checkpoint,rejected,expectedDigest}) {
  for(const path of [state,checkpoint])strictOwnedPathV1(ownedRoot,path);
  strictOwnedPathV1(ownedRoot,rejected,{exists:false});
  disjoint([state,checkpoint,rejected]);
  if(existsSync(rejected)||retainedTreeV1(checkpoint).digest!==expectedDigest)fail('RESTORE_BINDING_DENIED');
  const staged=join(ownedRoot,'restore-staged');
  disjoint([state,checkpoint,rejected,staged]);
  if(existsSync(staged))fail('RESTORE_UNKNOWN_HELD');
  mkdirSync(staged);
  copyTree(checkpoint,staged,retainedTreeV1(checkpoint));
  const stagedTree=retainedTreeV1(staged);
  if(stagedTree.digest!==expectedDigest)fail('RESTORE_COPY_MISMATCH');
  syncTree(staged,stagedTree);syncDirectory(ownedRoot);
  renameSync(state,rejected);
  syncDirectory(ownedRoot);
  // A crash between these renames leaves both copies retained and is HELD by
  // the controller; neither automatic replay nor destructive overwrite occurs.
  renameSync(staged,state);
  syncDirectory(ownedRoot);
  if(retainedTreeV1(state).digest!==expectedDigest)fail('RESTORE_READBACK_MISMATCH');
  return {outcome:'RESTORED_LOCAL_COPY',digest:expectedDigest,rejectedRetained:true};
}
