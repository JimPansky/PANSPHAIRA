// PAN472 independent read-only source/target diagnosis. Separate SQLite
// connections and direct SQL; no writer/provider result is trusted as readback.
// Shared closed vocabulary is reused, NOT the writer's state/plan construction.
import {
  PAN472_PLAN_V1, PAN472_RECEIPT_V1, PAN472_MAPPING_DIGEST_V1, PAN472_LIMITS_V1,
  canonicalJson, digest, exact, integer, readMarker, openNative, readMeta,
  decodeRow, references, unknown,
} from './draft-profile.mjs';
export function reconcilePan472DraftTransfer({root}) {
  let source,target;
  try {
    const m=readMarker(root);
    source=openNative(root,'source');target=openNative(root,'target');
    source.exec('BEGIN');target.exec('BEGIN');readMeta(source,m);readMeta(target,m);
    const raw=source.prepare('SELECT sequence,id,kind,revision,deleted,body FROM events ORDER BY sequence LIMIT ?').all(PAN472_LIMITS_V1.events+1);
    const head=Number(source.prepare('SELECT value FROM meta WHERE key=?').get('last-sequence')?.value);
    if(raw.length>PAN472_LIMITS_V1.events)return unknown([{code:'SOURCE_EVENT_BOUND'}]);
    if(!integer(head) || head!==raw.length)return unknown([{code:'SOURCE_SEQUENCE_GAP'}]);
    const histories=new Map(),states=new Map(),decoded=[];
    for(let i=0;i<raw.length;i++) {
      if(raw[i].sequence!==i+1)return unknown([{code:'SOURCE_SEQUENCE_GAP'}]);
      const e=decodeRow(raw[i]),prior=states.get(e.id);
      if(e.deleted && !prior)return unknown([{code:'DELETION_WITHOUT_PRIOR_REVISION',id:e.id}]);
      if(e.revision!==(prior?.revision??0)+1 || prior?.deleted || prior && prior.kind!==e.kind)
        return unknown([{code:'SOURCE_REVISION_OR_DELETION_HISTORY',id:e.id}]);
      states.set(e.id,e);decoded.push(e);
      histories.set(e.sequence,[...states.values()].sort((a,b)=>a.id.localeCompare(b.id)));
    }
    const sourceCurrent=source.prepare('SELECT id,kind,revision,deleted,body,sequence FROM objects ORDER BY id LIMIT ?').all(PAN472_LIMITS_V1.objects+1).map(decodeRow);
    if(canonicalJson(sourceCurrent)!==canonicalJson([...states.values()].sort((a,b)=>a.id.localeCompare(b.id))))
      return unknown([{code:'SOURCE_STATE_HISTORY_MISMATCH'}]);
    const c=JSON.parse(target.prepare('SELECT value FROM meta WHERE key=?').get('cursor')?.value??'null');
    const currentIssues=references(sourceCurrent);
    if(!c)return unknown(currentIssues.length?currentIssues:[{code:'TARGET_NOT_TRANSFERRED'}]);
    if(!exact(c,['sourceIdentity','sourceGeneration','throughSequence','mappingDigest','expectedStateDigest','operationKey'])
      || c.sourceIdentity!==m.sourceIdentity || c.sourceGeneration!==m.sourceGeneration
      || c.mappingDigest!==PAN472_MAPPING_DIGEST_V1 || !integer(c.throughSequence)
      || c.throughSequence<1 || c.throughSequence>head)return unknown([{code:'TARGET_CURSOR_BINDING_MISMATCH'}]);
    const expected=histories.get(c.throughSequence);
    const sourceIssues=references(expected);
    if(sourceIssues.length)return unknown(sourceIssues);
    if(Buffer.byteLength(canonicalJson({rows:expected,events:decoded.filter(e=>e.sequence<=c.throughSequence)}))>PAN472_LIMITS_V1.bytes)
      return unknown([{code:'SOURCE_BYTE_BOUND'}]);
    const quarantine=[];
    if(digest(expected)!==c.expectedStateDigest)quarantine.push({code:'CUTOFF_STATE_DIGEST_MISMATCH'});
    const actual=target.prepare('SELECT id,kind,revision,deleted,body,sequence FROM objects ORDER BY id LIMIT ?').all(PAN472_LIMITS_V1.objects+1);
    if(actual.length>PAN472_LIMITS_V1.objects)quarantine.push({code:'TARGET_OBJECT_BOUND'});
    const actualById=new Map(actual.map(r=>[r.id,r]));
    const expectedById=new Map(expected.map(r=>[r.id,r]));
    const live=new Map();
    for(const r of actual) {
      let b;
      try {b=r.body===null?null:JSON.parse(r.body);}catch{quarantine.push({code:'TARGET_BODY_MALFORMED',id:r.id});continue;}
      if(r.deleted===0)live.set(r.id,{...r,body:b});
      const wanted=expectedById.get(r.id);
      if(!wanted){quarantine.push({code:'EXTRA_OBJECT',id:r.id});continue;}
      if(r.kind!==wanted.kind || r.revision!==wanted.revision || r.sequence!==wanted.sequence
        || r.deleted!==(wanted.deleted?1:0))quarantine.push({code:'REVISION_OR_TOMBSTONE_MUTATION',id:r.id});
      if(canonicalJson(b)!==canonicalJson(wanted.body)) {
        if(b?.status!==wanted.body?.status)quarantine.push({code:'STATUS_MUTATION',id:r.id});
        if(['quantityMicros','priceMinor','amountMinor'].some(k=>b?.[k]!==wanted.body?.[k]))quarantine.push({code:'SCALING_MUTATION',id:r.id});
        quarantine.push({code:'MAPPING_CONTENT_MUTATION',id:r.id});
      }
    }
    for(const r of expected)if(!actualById.has(r.id))quarantine.push({code:'MISSING_OBJECT',id:r.id});
    for(const r of live.values()) {
      const ref=r.kind==='order'?r.body?.customerId:r.kind==='line'?r.body?.orderId:null;
      if(ref && live.get(ref)?.kind!==(r.kind==='order'?'customer':'order'))quarantine.push({code:'BROKEN_REFERENCE',id:r.id});
    }
    const effectCount=target.prepare('SELECT COUNT(*) AS n FROM outside_effects').get().n;
    if(effectCount!==0)quarantine.push({code:'OUTSIDE_EFFECT_PRESENT'});
    const approvals=target.prepare('SELECT operation_key,plan_digest,owner FROM approvals ORDER BY operation_key LIMIT ?').all(PAN472_LIMITS_V1.events+1);
    const dedup=target.prepare('SELECT operation_key,plan_digest FROM dedup ORDER BY operation_key LIMIT ?').all(PAN472_LIMITS_V1.events+1);
    const receipts=target.prepare('SELECT operation_key,receipt FROM receipts ORDER BY operation_key LIMIT ?').all(PAN472_LIMITS_V1.events+1);
    if(receipts.length>PAN472_LIMITS_V1.events || approvals.length!==receipts.length || dedup.length!==receipts.length
      || receipts.length<1)quarantine.push({code:'ATOMIC_RECEIPT_DEDUP_SET_MISMATCH'});
    const approvalsByKey=new Map(approvals.map(a=>[a.operation_key,a]));
    const dedupByKey=new Map(dedup.map(d=>[d.operation_key,d]));
    let cursorReceiptFound=false;
    for(const stored of receipts) {
      const r=JSON.parse(stored.receipt);
      const {receiptDigest,...core}=r;
      const approval=approvalsByKey.get(stored.operation_key),d=dedupByKey.get(stored.operation_key);
      if(r.schemaVersion!==PAN472_RECEIPT_V1 || r.operationKey!==stored.operation_key
        || r.sourceIdentity!==m.sourceIdentity || r.sourceGeneration!==m.sourceGeneration
        || r.targetIdentity!==m.targetIdentity || r.mappingDigest!==PAN472_MAPPING_DIGEST_V1
        || r.scope!=='LOCAL_SYNTHETIC_DISPOSABLE' || r.outsideEffectCount!==0 || r.atomicTargetAndDedup!==true
        || !integer(r.fromSequence) || !integer(r.throughSequence) || r.fromSequence>=r.throughSequence
        || r.throughSequence>c.throughSequence || !integer(r.committedAtMs)
        || receiptDigest!==digest(core) || approval?.owner!=='LOCAL_SYNTHETIC_OWNER'
        || approval?.plan_digest!==r.planDigest || d?.plan_digest!==r.planDigest) {
        quarantine.push({code:'APPROVAL_DEDUP_RECEIPT_BINDING_MISMATCH',operationKey:stored.operation_key});continue;
      }
      const rows=histories.get(r.throughSequence);
      const kind=r.fromSequence===0?'SNAPSHOT':'DELTA';
      const op={sourceIdentity:m.sourceIdentity,sourceGeneration:m.sourceGeneration,targetIdentity:m.targetIdentity,
        kind,fromSequence:r.fromSequence,throughSequence:r.throughSequence};
      const operationKey='admin-ai:poc:pan472-import:'+digest(op);
      const plan={schemaVersion:PAN472_PLAN_V1,scope:'LOCAL_SYNTHETIC_DISPOSABLE',tenant:m.tenant,...op,
        operationKey,mappingDigest:PAN472_MAPPING_DIGEST_V1,
        rows:kind==='SNAPSHOT'?rows:decoded.filter(e=>e.sequence>r.fromSequence && e.sequence<=r.throughSequence),
        expectedStateDigest:digest(rows),outsideEffects:'DISABLED'};
      if(operationKey!==r.operationKey || digest(plan)!==r.planDigest || digest(rows)!==r.expectedStateDigest)
        quarantine.push({code:'INDEPENDENT_SOURCE_PLAN_BINDING_MISMATCH',operationKey:stored.operation_key});
      if(r.operationKey===c.operationKey && r.throughSequence===c.throughSequence && r.expectedStateDigest===c.expectedStateDigest)cursorReceiptFound=true;
    }
    if(!cursorReceiptFound)quarantine.push({code:'CURSOR_RECEIPT_REQUIRED'});
    return {outcome:quarantine.length?'QUARANTINED':'VERIFIED',coverage:quarantine.length?'QUARANTINED':'COMPLETE_AT_CUTOFF',
      complete:quarantine.length===0,readOnly:true,quarantine,
      sourceIdentity:m.sourceIdentity,sourceGeneration:m.sourceGeneration,targetIdentity:m.targetIdentity,
      throughSequence:c.throughSequence,sourceHeadSequence:head,sourceAhead:head>c.throughSequence,
      currentSourceCoverage:currentIssues.length?'UNKNOWN':'COMPLETE',currentSourceQuarantine:currentIssues,
      objectCount:actual.length,receiptCount:receipts.length,outsideEffectCount:effectCount,
      mappingDigest:PAN472_MAPPING_DIGEST_V1};
  } catch(error) {return unknown([{code:error.message}]);}
  finally {target?.close();source?.close();}
}
