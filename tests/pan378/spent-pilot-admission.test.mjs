import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cpSync,mkdtempSync,readFileSync,readdirSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import test from 'node:test';
import {PACKET_RELATIVE_PATH,replaySpentPilotV3,TRUSTED_SPENT_PILOT_V3} from '../../src/pan378/spent-pilot-replay-v3.mjs';
const scratch=process.env.TMPDIR??process.env.RUNNER_TEMP;
const sha=x=>createHash('sha256').update(x).digest('hex');
function withPacket(run){const root=mkdtempSync(join(scratch,'pan378-negative-'));const packet=join(root,'packet');cpSync(resolve(PACKET_RELATIVE_PATH),packet,{recursive:true});try{run(packet,root);}finally{rmSync(root,{recursive:true,force:true});}}
test('DOC-AI trust admission fixes manifest, complete bundle and report identities independently of any caller remint',()=>{
 assert.ok(Object.isFrozen(TRUSTED_SPENT_PILOT_V3));
 for(const [file,reason] of [['packet-manifest.json','SPENT_PACKET_MANIFEST_TRUST_ROOT_DENIED'],['new-epoch-v3-evaluated-custody.bundle','SPENT_BUNDLE_TRUST_ROOT_DENIED'],['report-v3.json','SPENT_REPORT_TRUST_ROOT_DENIED']])withPacket((packet,root)=>{
  writeFileSync(join(packet,file),Buffer.concat([readFileSync(join(packet,file)),Buffer.from('forged')]));
  assert.throws(()=>replaySpentPilotV3({packetDir:packet,scratchRoot:root}),new RegExp(reason));assert.deepEqual(readdirSync(root),['packet']);
 });
 withPacket((packet,root)=>{const manifest=JSON.parse(readFileSync(join(packet,'packet-manifest.json')));const file=join(packet,'report-v3.json');writeFileSync(file,'{"verdict":"GO"}\n');manifest.files.find(x=>x.path==='report-v3.json').sha256=sha(readFileSync(file));writeFileSync(join(packet,'packet-manifest.json'),JSON.stringify(manifest));assert.throws(()=>replaySpentPilotV3({packetDir:packet,scratchRoot:root}),/SPENT_PACKET_MANIFEST_TRUST_ROOT_DENIED/);});
});
test('DOC-AI admission denies symlinked files, symlinked packet roots and missing owned scratch rather than outside reads',()=>{
 withPacket((packet,root)=>{const path=join(packet,'report-v3.json');rmSync(path);symlinkSync(join(resolve(PACKET_RELATIVE_PATH),'report-v3.json'),path);assert.throws(()=>replaySpentPilotV3({packetDir:packet,scratchRoot:root}),/PACKET_SYMLINK_DENIED/);});
 const root=mkdtempSync(join(scratch,'pan378-links-'));try{const link=join(root,'packet');symlinkSync(resolve(PACKET_RELATIVE_PATH),link);assert.throws(()=>replaySpentPilotV3({packetDir:link,scratchRoot:root}),/PACKET_SYMLINK_DENIED/);for(const bad of ['/','relative',undefined])assert.throws(()=>replaySpentPilotV3({scratchRoot:bad??''}),/PAN378_OWNED_SCRATCH_REQUIRED/);}finally{rmSync(root,{recursive:true,force:true});}
});
test('DOC-AI-AC05..07 exact full oracle output retains all denominators, UNKNOWN, every named deny probe and negative scope',()=>{
 const report=JSON.parse(readFileSync(join(PACKET_RELATIVE_PATH,'report-v3.json')));
 assert.equal(report.schemaVersion,'pansphaira.document-ai-pilot/report/v2');assert.equal(report.verdict,'FALSIFIED_WITH_EVIDENCE');
 assert.deepEqual(report.denominators,{fieldValues:24,lineItems:12,taxes:8,totals:6,dispositions:6,documentsExact:6});
 for(const [name,metric] of Object.entries(report.metrics)){assert.equal(metric.denominator,report.denominators[name]);assert.equal(metric.exactCorrect+metric.incorrect+metric.abstained,metric.denominator);}
 assert.equal(report.metrics.lineItems.abstained,6);assert.equal(report.metrics.totals.abstained,1);assert.equal(report.metrics.documentsExact.exactCorrect,4);
 assert.deepEqual(report.adversarialMatrix.map(x=>x.id),['PAIRED_SUBSTITUTION','CASE_ID_LEAKAGE','HARD_CODED_CONFIDENCE','GOLD_ACCESS','CALLER_AUTHORED_SEQUENCE','PROPOSAL_PARSER_REUSE','RE_DIGESTED_FORGERY','UNKNOWN_TO_ZERO','POST_VALIDATION_MUTATION']);assert.ok(report.adversarialMatrix.every(x=>x.passed&&x.outcome==='DENIED'&&x.reasonCode===x.expectedReasonCode));
 assert.equal(report.calibration.bins[0].meanConfidence.state,'UNKNOWN');assert.equal(report.authority.customerData,false);assert.equal(report.authority.postingOrBookingAuthorized,false);assert.ok(report.nonclaims.includes('NO_UNKNOWN_AS_ZERO_ABSENCE_OR_SUCCESS'));
});
