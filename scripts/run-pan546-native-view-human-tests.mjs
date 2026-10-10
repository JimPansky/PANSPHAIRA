import {spawnSync} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {join} from 'node:path';
const files=['tests/pan546/module-view.test.mjs','tests/pan546/native-view.test.mjs','tests/pan546/transport.test.mjs','tests/pan546/native-association.test.mjs','tests/pan546/reservation-native.test.mjs','tests/pan546/native-human-workspace.test.mjs','tests/pan546/native-references.test.mjs','tests/pan546/browser-view.test.mjs','tests/pan546/browser-human.test.mjs','tests/pan546/browser-human-combined.test.mjs','tests/pan546/native-invoice-navigation.test.mjs','tests/pan546/navigation-review517.test.mjs','tests/pan546/navigation-transport.test.mjs','tests/pan546/browser-navigation.test.mjs','tests/pan546/registration.test.mjs'];
// The existing fixed Node24 admission boundary, not a new runner/provider.
// A trusted Node/npm parent remains required; no caller test selection.
function nodeOptionTokens(raw){
 const tokens=[];let quoted=false,start=true;
 for(let i=0;i<raw.length;i++){
  let c=raw[i];
  if(c==='\\'&&quoted){if(++i===raw.length)throw new Error('PAN546_TEST_ARGUMENT_DENIED');c=raw[i];}
  else if(c===' '&&!quoted){start=true;continue;}
  else if(c==='"'){quoted=!quoted;continue;}
  if(start){tokens.push(c);start=false;}else tokens[tokens.length-1]+=c;
 }
 if(quoted)throw new Error('PAN546_TEST_ARGUMENT_DENIED');return tokens;
}
try{
 const args=process.argv.slice(2);
 if(args.length===1&&args[0]==='--list')process.stdout.write(JSON.stringify(files)+'\n');
 else{
  const nodeOptions=nodeOptionTokens(process.env.NODE_OPTIONS??'');
  for(let i=0;i<nodeOptions.length;i++){
   const token=nodeOptions[i],equal=token.indexOf('='),name=(equal<0?token:token.slice(0,equal)).replaceAll('_','-');
   if(['--trace-warnings','--no-trace-warnings','--warnings','--no-warnings'].includes(name)){
    if(equal>=0)throw new Error('PAN546_TEST_ARGUMENT_DENIED');continue;
   }
   if(!['--conditions','-C','--max-old-space-size','--max-semi-space-size'].includes(name))throw new Error('PAN546_TEST_ARGUMENT_DENIED');
   const value=equal<0?nodeOptions[++i]:token.slice(equal+1);
   if(typeof value!=='string'||!value.length||(!['--conditions','-C'].includes(name)&&!/^[1-9][0-9]*$/.test(value)))throw new Error('PAN546_TEST_ARGUMENT_DENIED');
  }
  if(args.length||process.env.NODE_TEST_CONTEXT!==undefined)throw new Error('PAN546_TEST_ARGUMENT_DENIED');
  if(process.platform!=='linux'||process.arch!=='x64')throw new Error('PAN546_TEST_REQUIRES_SUPPORTED_LINUX_X86_64');
  const env={...process.env,TMPDIR:process.env.TMPDIR||process.env.RUNNER_TEMP};
  if(!env.TMPDIR)throw new Error('PAN546_OWNED_SCRATCH_REQUIRED');
  if(!env.PAN546_BROWSER_EVIDENCE){env.PAN546_BROWSER_EVIDENCE=mkdtempSync(join(env.TMPDIR,'pan546-browser-evidence-'));process.stdout.write('PAN546_BROWSER_EVIDENCE_DIR='+env.PAN546_BROWSER_EVIDENCE+'\n');}
  env.PAN527_BROWSER_MODULE=env.PAN527_BROWSER_MODULE||import.meta.resolve('playwright');env.PAN527_CERTUTIL=env.PAN527_CERTUTIL||'certutil';
  for(const argv of [['node_modules/typescript/bin/tsc','-p','tsconfig.json'],['scripts/build-pan541-browser.mjs'],['--test','--test-concurrency=1','--test-reporter=tap',...files]]){
   const run=spawnSync(process.execPath,argv,{env,stdio:'inherit'});if(run.error||run.signal||run.status===null)throw new Error('PAN546_TEST_PROCESS_INTERRUPTED');if(run.status!==0){process.exitCode=run.status;break;}
  }
 }
}catch(e){process.stderr.write((e instanceof Error?e.message:'PAN546_TEST_TOOLING_UNAVAILABLE')+'\n');process.exitCode=1;}
