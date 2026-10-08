// Closed native event projection, not a workflow/decision/effect executor.
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {acquireLocalJournalOwner} from '../../demo/runtime/local-journal-owner.mjs';
import {canonicalJson,digest,openNative,transaction,guardsMatch,fail} from '../pan473/scope-profile.mjs';
import {isProtectedSessionAdapterV1} from '../pan527/origin-session-adapter.mjs';
import {createNativeErvHumanBackendV1} from '../pan542/native-human-backend.mjs';
import {createNativeErvReadAdapterV1} from '../pan541/native-erv-read-adapter.mjs';
const kind='ERV_LOCAL_EVIDENCE_APPROVAL_REQUIRED';
const owned=new WeakMap();
const guards=['pan544_binding','pan544_events'].flatMap(table=>['UPDATE','DELETE'].map(action=>({
  name:`${table}_${action.toLowerCase()}_immutable`,
  sql:`CREATE TRIGGER ${table}_${action.toLowerCase()}_immutable BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT,'NOTIFICATION_HISTORY_IMMUTABLE_DENIED'); END`})));
function closed(value,keys,code){
  if(!value||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype)fail(code);
  const ds=Object.getOwnPropertyDescriptors(value);
  if(Reflect.ownKeys(ds).length!==keys.length||Reflect.ownKeys(ds).some(k=>typeof k!=='string'||!keys.includes(k))
    ||Object.values(ds).some(d=>!d.enumerable||!('value' in d)))fail(code);
}
function frozen(value){if(value&&typeof value==='object'){Object.values(value).forEach(frozen);Object.freeze(value);}return value;}
function local(root,write,work){
  const lease=acquireLocalJournalOwner(join(root,'pan453-owned-v2'));let db;
  try{db=openNative(root,'target',!write);if(write)return transaction(db,()=>work(db));db.exec('BEGIN');return work(db);}
  finally{db?.close();lease.release();}
}
const defaults=()=>({schemaVersion:'pansphaira.workspace-notifications/preferences/v1',revision:0,inAppEnabled:true,filter:'ALL',subscriptions:[kind]});
export function createNativeNotificationsV1(options){
  closed(options,['root','sessions','catalog'],'NOTIFICATION_OWNER_OPTIONS_DENIED');const {root,sessions,catalog}=options;
  if(!isProtectedSessionAdapterV1(sessions,sessions?.binding?.tenantId)||typeof catalog!=='function')fail('NOTIFICATION_PROTECTED_OWNER_DENIED');
  const human=createNativeErvHumanBackendV1({root,sessions}),nativeReader=createNativeErvReadAdapterV1({root,tenantId:sessions.binding.tenantId});let isClosed=false;
  const configuration=local(root,true,db=>{
    const native=JSON.parse(db.prepare('SELECT record FROM pan542_binding WHERE id=1').get().record);
    const core={schemaVersion:'pansphaira.workspace-notifications/native-binding/v1',sessionBinding:sessions.binding,humanBindingDigest:native.bindingDigest,kind,profile:'LOCAL_SYNTHETIC_NATIVE_ERV_V1'};
    const config={...core,bindingDigest:digest(core)};
    const existing=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pan544_binding'").get();
    if(existing){const row=JSON.parse(db.prepare('SELECT record FROM pan544_binding WHERE id=1').get().record);if(canonicalJson(row)!==canonicalJson(config)||!guardsMatch(db,guards))fail('NOTIFICATION_NATIVE_BINDING_DENIED');return config;}
    if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('pan544_events','pan544_preferences','pan544_read')").all().length)fail('NOTIFICATION_PARTIAL_STORE_ADOPTION_DENIED');
    db.exec('CREATE TABLE pan544_binding(id INTEGER PRIMARY KEY CHECK(id=1),record TEXT NOT NULL) STRICT; CREATE TABLE pan544_events(event_id TEXT PRIMARY KEY,event_revision INTEGER NOT NULL,recipient_subject_id TEXT NOT NULL,record TEXT NOT NULL) STRICT; CREATE TABLE pan544_preferences(tenant_id TEXT NOT NULL,subject_id TEXT NOT NULL,revision INTEGER NOT NULL,record TEXT NOT NULL,PRIMARY KEY(tenant_id,subject_id)) STRICT; CREATE TABLE pan544_read(tenant_id TEXT NOT NULL,subject_id TEXT NOT NULL,event_id TEXT NOT NULL,event_revision INTEGER NOT NULL,read_at_ms INTEGER NOT NULL,PRIMARY KEY(tenant_id,subject_id,event_id,event_revision)) STRICT;');
    db.prepare('INSERT INTO pan544_binding VALUES(1,?)').run(canonicalJson(config));for(const guard of guards)db.exec(guard.sql);return config;
  });
  function binding(db){
    if(isClosed)fail('NOTIFICATION_ADAPTER_CLOSED_DENIED');
    if(!guardsMatch(db,guards)||db.prepare('SELECT record FROM pan544_binding WHERE id=1').get()?.record!==canonicalJson(configuration))fail('NOTIFICATION_NATIVE_BINDING_DENIED');
  }
  function principal(headers,write=false){
    if(isClosed)fail('NOTIFICATION_ADAPTER_CLOSED_DENIED');
    if(headers?.origin!==undefined&&headers.origin!==sessions.origin)fail('NOTIFICATION_ORIGIN_DENIED');
    return write?sessions.authorizeMutation(headers):sessions.authenticate(headers);
  }
  // Own-session personal state only. This proof is never used by publication
  // or the governed business writer; legacy owner calls retain their CSRF guard.
  function personalPrincipal(headers){
    if(headers?.['x-pan544-context']===undefined)return principal(headers,true);
    const p=principal(headers);const pair=headers.cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith('__Host-pan527-session='));
    if(headers.origin!==sessions.origin||headers['x-pan544-context']!=='session:'+createHash('sha256').update(pair).digest('hex'))fail('HOSTED_CSRF_DENIED');
    return p;
  }
  function preferences(db,p){
    const row=db.prepare('SELECT record FROM pan544_preferences WHERE tenant_id=? AND subject_id=?').get(p.tenantId,p.subjectId);
    return row?JSON.parse(row.record):defaults();
  }
  function events(db,p){
    const rows=db.prepare('SELECT event_id,event_revision,record FROM pan544_events WHERE recipient_subject_id=? ORDER BY event_revision,event_id LIMIT 129').all(p.subjectId);
    if(rows.length>128)fail('NOTIFICATION_FEED_BOUND_DENIED');
    return rows.map(row=>{const event=JSON.parse(row.record),{recordDigest,...core}=event;
      if(event.eventId!==row.event_id||event.eventRevision!==row.event_revision||recordDigest!==digest(core)||event.bindingDigest!==configuration.bindingDigest||event.tenantId!==p.tenantId||event.recipientSubjectId!==p.subjectId)fail('NOTIFICATION_EVENT_BINDING_DENIED');
      return event;});
  }
  function pluginState(p){
    const entries=catalog(p);if(!Array.isArray(entries)||Object.getPrototypeOf(entries)!==Array.prototype||entries.length>64)fail('NOTIFICATION_PLUGIN_UNAVAILABLE_DENIED');
    for(const row of entries){closed(row,['id','version','state'],'NOTIFICATION_PLUGIN_UNAVAILABLE_DENIED');if(typeof row.id!=='string'||typeof row.version!=='string'||!['AVAILABLE','DISABLED','REMOVED','DENIED'].includes(row.state))fail('NOTIFICATION_PLUGIN_UNAVAILABLE_DENIED');}
    const matches=entries.filter(e=>e.id==='pan.erv');if(matches.length===0)return 'PLUGIN_REMOVED';if(matches.length!==1)fail('NOTIFICATION_PLUGIN_UNAVAILABLE_DENIED');
    return matches[0].version==='1.0.0'&&matches[0].state==='AVAILABLE'?'AVAILABLE':matches[0].state==='REMOVED'?'PLUGIN_REMOVED':'PLUGIN_DISABLED';
  }
  const adapter=Object.freeze({
    reconcileRead(headers,command){
      closed(command,['schemaVersion','eventId','eventRevision'],'NOTIFICATION_READ_RECONCILIATION_DENIED');
      if(command.schemaVersion!=='pansphaira.workspace-notifications/reconcile-read/v1'||typeof command.eventId!=='string'||! /^[a-f0-9]{64}$/.test(command.eventId)||!Number.isSafeInteger(command.eventRevision)||command.eventRevision<1)fail('NOTIFICATION_READ_RECONCILIATION_DENIED');
      const p=principal(headers),role=human.read(headers,{invoiceId:'AP-PAN516-MATCHED-01'});if(role.nativeRole!=='APPROVER')fail('NOTIFICATION_NATIVE_ROLE_DENIED');
      return local(root,false,db=>{binding(db);
        if(!events(db,p).some(e=>e.eventId===command.eventId&&e.eventRevision===command.eventRevision))fail('NOTIFICATION_EVENT_SELECTOR_DENIED');
        const row=db.prepare('SELECT read_at_ms FROM pan544_read WHERE tenant_id=? AND subject_id=? AND event_id=? AND event_revision=?').get(p.tenantId,p.subjectId,command.eventId,command.eventRevision);
        if(row&&(!Number.isSafeInteger(row.read_at_ms)||row.read_at_ms<1||row.read_at_ms>Date.now()))fail('NOTIFICATION_READ_STATE_UNKNOWN_DENIED');
        return frozen({schemaVersion:'pansphaira.workspace-notifications/read-reconciliation/v1',outcome:row?'READ_CONFIRMED':'NOT_RECORDED',eventId:command.eventId,eventRevision:command.eventRevision,read:Boolean(row),newTaskEffect:false,executionAuthorityGranted:false});});
    },
    markRead(headers,command){
      closed(command,['schemaVersion','eventId','eventRevision'],'NOTIFICATION_READ_REQUEST_DENIED');
      if(command.schemaVersion!=='pansphaira.workspace-notifications/mark-read/v1')fail('NOTIFICATION_READ_REQUEST_DENIED');
      const p=personalPrincipal(headers);adapter.open(headers,{...command,schemaVersion:'pansphaira.workspace-notifications/open/v1'});
      return local(root,true,db=>{binding(db);personalPrincipal(headers);
        const previous=db.prepare('SELECT read_at_ms FROM pan544_read WHERE tenant_id=? AND subject_id=? AND event_id=? AND event_revision=?').get(p.tenantId,p.subjectId,command.eventId,command.eventRevision);
        if(!previous)db.prepare('INSERT INTO pan544_read VALUES(?,?,?,?,?)').run(p.tenantId,p.subjectId,command.eventId,command.eventRevision,Date.now());
        return frozen({schemaVersion:'pansphaira.workspace-notifications/mark-readback/v1',outcome:previous?'ALREADY_READ_CONFIRMED':'READ_CONFIRMED',eventId:command.eventId,eventRevision:command.eventRevision,read:true,newTaskEffect:false,executionAuthorityGranted:false});});
    },
    open(headers,command){
      closed(command,['schemaVersion','eventId','eventRevision'],'NOTIFICATION_OPEN_REQUEST_DENIED');
      if(command.schemaVersion!=='pansphaira.workspace-notifications/open/v1'||typeof command.eventId!=='string'||! /^[a-f0-9]{64}$/.test(command.eventId)||!Number.isSafeInteger(command.eventRevision)||command.eventRevision<1)fail('NOTIFICATION_OPEN_REQUEST_DENIED');
      const p=principal(headers),role=human.read(headers,{invoiceId:'AP-PAN516-MATCHED-01'});if(role.nativeRole!=='APPROVER')fail('NOTIFICATION_NATIVE_ROLE_DENIED');
      const event=local(root,false,db=>{binding(db);return events(db,p).find(e=>e.eventId===command.eventId&&e.eventRevision===command.eventRevision);});
      if(!event)fail('NOTIFICATION_EVENT_SELECTOR_DENIED');
      const target=event.target;closed(target,['pluginId','routeId','params'],'NOTIFICATION_ROUTE_PARAM_DENIED');closed(target.params,['objectId','revision'],'NOTIFICATION_ROUTE_PARAM_DENIED');
      if(target.pluginId!=='pan.erv'||target.routeId!=='pan.erv.route'||!['AP-PAN516-MATCHED-01','AP-PAN516-PARTIAL-01'].includes(target.params.objectId)||!Number.isSafeInteger(target.params.revision)||target.params.revision<1)fail('NOTIFICATION_ROUTE_PARAM_DENIED');
      if(pluginState(p)!=='AVAILABLE')fail('NOTIFICATION_PLUGIN_UNAVAILABLE_DENIED');
      if(Date.now()>=event.expiresAtMs)fail('NOTIFICATION_EVENT_EXPIRED_DENIED');
      const source=human.notificationSource(headers,{invoiceId:target.params.objectId}),current=source.readback;
      if(current.nativeRole!=='APPROVER')fail('NOTIFICATION_NATIVE_ROLE_DENIED');
      if(current.nativeRevision!==event.nativeRevision||current.basisDigest!==event.basisDigest||current.lastEventDigest!==event.nativeEventDigest||current.state!=='REVIEWED_LOCAL_EVIDENCE_ONLY'||source.lastEvent?.taskBinding.taskIdentityDigest!==event.taskIdentityDigest)fail('NOTIFICATION_OBSOLETE_TARGET_DENIED');
      const invoice=nativeReader.read({tenantId:p.tenantId,objectId:target.params.objectId,expectedRevision:target.params.revision});
      principal(headers);return frozen({schemaVersion:'pansphaira.workspace-notifications/open-readback/v1',outcome:'TARGET_READ_CONFIRMED',eventId:event.eventId,eventRevision:event.eventRevision,target,
        invoice,taskIdentityDigest:event.taskIdentityDigest,taskState:'PENDING_LOCAL_EVIDENCE_APPROVAL',executionAuthorityGranted:false});
    },
    savePreferences(headers,command){
      closed(command,['schemaVersion','expectedRevision','preferences'],'NOTIFICATION_PREFERENCES_SHAPE_DENIED');
      closed(command.preferences,['inAppEnabled','filter','subscriptions'],'NOTIFICATION_PREFERENCES_SHAPE_DENIED');
      const value=command.preferences,list=value.subscriptions;
      if(command.schemaVersion!=='pansphaira.workspace-notifications/preferences-write/v1'||!Number.isSafeInteger(command.expectedRevision)||command.expectedRevision<0
        ||typeof value.inAppEnabled!=='boolean'||!['ALL','UNREAD'].includes(value.filter)||!Array.isArray(list)||Object.getPrototypeOf(list)!==Array.prototype||list.length>1
        ||Reflect.ownKeys(Object.getOwnPropertyDescriptors(list)).length!==list.length+1
        ||(list.length===1&&(!Object.hasOwn(list,0)||Object.getOwnPropertyDescriptor(list,'0')?.value!==kind)))fail('NOTIFICATION_PREFERENCES_SHAPE_DENIED');
      const p=personalPrincipal(headers);human.read(headers,{invoiceId:'AP-PAN516-MATCHED-01'});
      return local(root,true,db=>{binding(db);personalPrincipal(headers);const previous=preferences(db,p);if(previous.revision!==command.expectedRevision)fail('NOTIFICATION_PREFERENCES_REVISION_DENIED');
        const saved={schemaVersion:'pansphaira.workspace-notifications/preferences/v1',revision:previous.revision+1,inAppEnabled:value.inAppEnabled,filter:value.filter,subscriptions:[...list]};
        db.prepare('INSERT INTO pan544_preferences VALUES(?,?,?,?) ON CONFLICT(tenant_id,subject_id) DO UPDATE SET revision=excluded.revision,record=excluded.record').run(p.tenantId,p.subjectId,saved.revision,canonicalJson(saved));return frozen(saved);});
    },
    publishNativeEvent(headers,request){
      closed(request,['invoiceId'],'NOTIFICATION_PUBLISH_REQUEST_DENIED');principal(headers,true);
      const source=human.notificationSource(headers,request),r=source.readback,e=source.lastEvent;
      if(r.nativeRole!=='REVIEWER'||r.state!=='REVIEWED_LOCAL_EVIDENCE_ONLY'||!e||e.state!==r.state||e.eventDigest!==r.lastEventDigest)fail('NOTIFICATION_NATIVE_EVENT_REQUIRED_DENIED');
      const eventId=digest({schemaVersion:'pansphaira.workspace-notifications/event-identity/v1',kind,bindingDigest:configuration.bindingDigest,nativeEventDigest:e.eventDigest});
      const core={schemaVersion:'pansphaira.workspace-notifications/native-event/v1',kind,eventId,eventRevision:r.proposalRevision,bindingDigest:configuration.bindingDigest,
        tenantId:r.sessionBinding.tenantId,recipientSubjectId:'synthetic:erv-approver',nativeEventDigest:e.eventDigest,nativeRevision:r.nativeRevision,basisDigest:r.basisDigest,
        taskIdentityDigest:e.taskBinding.taskIdentityDigest,createdAtMs:e.taskBinding.boundAtMs,expiresAtMs:e.taskBinding.boundAtMs+24*60*60*1000,
        target:{pluginId:'pan.erv',routeId:'pan.erv.route',params:{objectId:r.invoiceId,revision:r.nativeRevision}}};
      const event={...core,recordDigest:digest(core)};
      return local(root,true,db=>{binding(db);
        const duplicate=db.prepare('SELECT record FROM pan544_events WHERE event_id=?').get(eventId);
        if(duplicate){if(duplicate.record!==canonicalJson(event))fail('NOTIFICATION_DUPLICATE_BINDING_DENIED');return frozen({schemaVersion:'pansphaira.workspace-notifications/publication/v1',outcome:'DUPLICATE_NO_NEW_EFFECT',eventId,eventRevision:event.eventRevision});}
        if(db.prepare('SELECT count(*) AS n FROM pan544_events').get().n>=128)fail('NOTIFICATION_HISTORY_BOUND_DENIED');
        db.prepare('INSERT INTO pan544_events VALUES(?,?,?,?)').run(eventId,event.eventRevision,event.recipientSubjectId,canonicalJson(event));return frozen({schemaVersion:'pansphaira.workspace-notifications/publication/v1',outcome:'PUBLISHED',eventId,eventRevision:event.eventRevision});});
    },
    feed(headers){
      const p=principal(headers),role=human.read(headers,{invoiceId:'AP-PAN516-MATCHED-01'});
      if(role.nativeRole!=='APPROVER')fail('NOTIFICATION_NATIVE_ROLE_DENIED');
      const snapshot=local(root,false,db=>{binding(db);return {prefs:preferences(db,p),rows:events(db,p).map(e=>({...e,read:Boolean(db.prepare('SELECT read_at_ms FROM pan544_read WHERE tenant_id=? AND subject_id=? AND event_id=? AND event_revision=?').get(p.tenantId,p.subjectId,e.eventId,e.eventRevision))}))};});
      const rows=snapshot.rows.map(e=>{
        const source=human.notificationSource(headers,{invoiceId:e.target.params.objectId});
        const current=source.readback;
        const availability=pluginState(p);
        const status=Date.now()>=e.expiresAtMs?'EXPIRED':availability!=='AVAILABLE'?availability:current.nativeRevision!==e.nativeRevision||current.basisDigest!==e.basisDigest?'OBSOLETE':current.state==='APPROVED_LOCAL_EVIDENCE_ONLY'?'DONE':current.state==='QUERY_PENDING_LOCAL_EVIDENCE_ONLY'?'REMOVED':current.lastEventDigest!==e.nativeEventDigest||current.state!=='REVIEWED_LOCAL_EVIDENCE_ONLY'?'OBSOLETE':'OPEN';
        return {schemaVersion:'pansphaira.workspace-notifications/event/v1',eventId:e.eventId,eventRevision:e.eventRevision,kind:e.kind,
          target:e.target,taskIdentityDigest:e.taskIdentityDigest,status,read:e.read,createdAtMs:e.createdAtMs,expiresAtMs:e.expiresAtMs};
      });
      principal(headers);return frozen({schemaVersion:'pansphaira.workspace-notifications/feed/v1',tenantId:p.tenantId,subjectId:p.subjectId,preferences:snapshot.prefs,events:snapshot.prefs.inAppEnabled?rows.filter(e=>snapshot.prefs.subscriptions.includes(e.kind)&&(snapshot.prefs.filter==='ALL'||!e.read)):[],executionAuthorityGranted:false});
    },
    close(){isClosed=true;owned.delete(adapter);},
  });
  owned.set(adapter,sessions.binding);return adapter;
}
export function isNativeNotificationsV1(adapter,binding){
  try{
    closed(binding,['audience','origin','instanceId','tenantId','generation','identityDigest'],'NOTIFICATION_OWNER_BINDING_DENIED');
    return typeof binding.tenantId==='string'&&Number.isSafeInteger(binding.generation)&&binding.generation>0&&owned.has(adapter)&&canonicalJson(owned.get(adapter))===canonicalJson(binding);
  }catch{return false;}
}
