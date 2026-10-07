import { DatabaseSync } from 'node:sqlite';
import { constants, openSync, closeSync, lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { canonicalJson } from '../../dist/packages/contracts/src/canonical-json.js';
import { bindRuntimeTemplateV1 } from '../pan529/runtime-template-contract.mjs';
import {
  bindAgentConfigurationPolicyV1, configurationClosedObjectV1, createAgentConfigurationDraftV1,
  validateAgentConfigurationAnswersV1, validateAgentConfigurationDraftV1,
  applyAgentConfigurationAnswersV1, evaluateAgentConfigurationDraftV1,
} from '../../dist/packages/contracts/src/agent-configuration-draft-v1.js';
const owned = new WeakMap();
export function isAgentConfigurationDraftStoreV1(store, binding) {
  const expected=owned.get(store);
  return !!expected && expected.tenantId === binding.tenantId && expected.instanceId === binding.instanceId && expected.generation === binding.generation;
}
// One draft attachment to existing verified profile/template, no profile registry,
// runtime desired-state write, provider dispatch or budget reservation API.
export function createAgentConfigurationDraftStoreV1(options) {
  configurationClosedObjectV1(options,['root','profile','template']);
  const {root,profile,template}=options;
  if (typeof root !== 'string' || !isAbsolute(root) || resolve(root) !== root || realpathSync(root) !== root) throw new Error('CONFIGURATION_STORE_ROOT_DENIED');
  const stat=lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700 || stat.uid !== process.getuid()) throw new Error('CONFIGURATION_STORE_ROOT_DENIED');
  const verified=bindRuntimeTemplateV1(template.identity);
  if (canonicalJson(verified) !== canonicalJson(template)) throw new Error('CONFIGURATION_TEMPLATE_UNSUPPORTED');
  const policy=bindAgentConfigurationPolicyV1(profile,verified); const binding=verified.identity;
  const path=join(root,'agent-configuration-drafts-v1.sqlite');
  try { const fd=openSync(path,constants.O_CREAT|constants.O_EXCL|constants.O_RDWR|constants.O_NOFOLLOW,0o600); closeSync(fd); }
  catch(e){if(e.code !== 'EEXIST') throw e;}
  const file=lstatSync(path);
  if (!file.isFile() || file.isSymbolicLink() || file.nlink !== 1 || (file.mode & 0o777) !== 0o600 || file.uid !== process.getuid()) throw new Error('CONFIGURATION_STORE_FILE_DENIED');
  const db=new DatabaseSync(path); let closed=false;
  db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS agent_configuration_drafts_v1 (tenant TEXT NOT NULL, subject TEXT NOT NULL, instance TEXT NOT NULL, profile TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>0), draft TEXT NOT NULL, PRIMARY KEY(tenant,subject,instance,profile)) STRICT;');
  function scope(principal) {
    if(closed) throw new Error('CONFIGURATION_STORE_CLOSED');
    configurationClosedObjectV1(principal,['tenantId','subjectId','instanceId','generation','role']);
    if (principal.tenantId !== binding.tenantId || principal.instanceId !== binding.instanceId || principal.generation !== binding.generation
      || !['reader','reviewer'].includes(principal.role) || typeof principal.subjectId !== 'string' || !/^[a-z0-9][a-z0-9:_-]{0,79}$/.test(principal.subjectId)) throw new Error('CONFIGURATION_OWNERSHIP_DENIED');
    return [binding.tenantId,principal.subjectId,binding.instanceId,policy.profileId];
  }
  function row(key) {return db.prepare('SELECT revision,draft FROM agent_configuration_drafts_v1 WHERE tenant=? AND subject=? AND instance=? AND profile=?').get(...key);}
  function readKey(key,principal) {
    const saved=row(key);
    if(saved && (!Number.isSafeInteger(saved.revision) || saved.revision < 1)) throw new Error('CONFIGURATION_STORED_REVISION_DENIED');
    const draft=saved ? validateAgentConfigurationDraftV1(JSON.parse(saved.draft),policy) : createAgentConfigurationDraftV1(policy);
    return Object.freeze({schemaVersion:'pansphaira.agent-configuration/readback/v1',revision:saved?.revision ?? 0,persisted:!!saved,profileId:policy.profileId,
      authorityContext:Object.freeze({schemaVersion:'pansphaira.agent-configuration/authority-context/v1',source:'PROTECTED_BACKEND',
        tenantId:key[0],subjectId:key[1],instanceId:key[2],generation:binding.generation,authenticatedRole:principal.role,draftSaveAllowed:true,executionAuthorityGranted:false}),
      adapterVersion:policy.adapterVersion,policyDigest:policy.policyDigest,supportedVersions:policy.supportedVersions,definitions:policy.fields,draft,...evaluateAgentConfigurationDraftV1(draft,policy),activationAuthorized:false});
  }
  const store=Object.freeze({
    read(principal) {return readKey(scope(principal),principal);},
    save(command,principal) {
      const key=scope(principal); const input=validateAgentConfigurationAnswersV1(command,policy);
      db.exec('BEGIN IMMEDIATE');
      try {
        const current=readKey(key,principal);
        if(input.expectedRevision !== current.revision) throw new Error('CONFIGURATION_REVISION_CONFLICT');
        if(current.revision >= Number.MAX_SAFE_INTEGER) throw new Error('CONFIGURATION_REVISION_EXHAUSTED');
        const next=applyAgentConfigurationAnswersV1(current.draft,input,policy);
        if(current.persisted && canonicalJson(next) === canonicalJson(current.draft)) {db.exec('COMMIT');return current;}
        if(!current.persisted) db.prepare('INSERT INTO agent_configuration_drafts_v1 VALUES (?,?,?,?,?,?)').run(...key,1,canonicalJson(next));
        else {
          const changed=db.prepare('UPDATE agent_configuration_drafts_v1 SET revision=?,draft=? WHERE tenant=? AND subject=? AND instance=? AND profile=? AND revision=?').run(current.revision+1,canonicalJson(next),...key,current.revision);
          if(changed.changes !== 1) throw new Error('CONFIGURATION_REVISION_CONFLICT');
        }
        db.exec('COMMIT'); return readKey(key,principal);
      } catch(error) {if(db.isTransaction) db.exec('ROLLBACK');throw error;}
    },
    close(){if(!closed){db.close();closed=true;owned.delete(store);}},
  });
  owned.set(store,{tenantId:binding.tenantId,instanceId:binding.instanceId,generation:binding.generation});return store;
}
