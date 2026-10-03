// Emergency cleanup only for the exact recorded invocation, never issue-wide or unrelated resources.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const owner=JSON.parse(readFileSync(process.argv[2],'utf8'));
assert(/^pan396-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(owner.name));assert.equal(owner.label,'pan396.owner='+owner.name);
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',timeout:30000});
for(const [kind,list] of [['container',['ps','-aq']],['volume',['volume','ls','-q']],['network',['network','ls','-q']]]){
 const names=docker(...list,'--filter','label='+owner.label).trim().split('\n').filter(Boolean);
 assert(names.length<=1);
 for(const id of names){const value=JSON.parse(docker(kind,'inspect',id))[0];const labels=kind==='container'?value.Config.Labels:value.Labels;assert.equal(labels['pan396.owner'],owner.name);docker(kind,'rm',...(kind==='container'?['--force']:[]),id);}
 assert.equal(docker(...list,'--filter','label='+owner.label).trim(),'');
}
console.log('Exact invocation container/volume/network residue zero; shared image/evidence retained');
