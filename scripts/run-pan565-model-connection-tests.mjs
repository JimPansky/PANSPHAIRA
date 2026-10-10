import {spawnSync} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {join} from 'node:path';
const files=['tests/pan565/native-model-connection.test.mjs','tests/pan565/transport-price-bound.test.mjs','tests/pan565/browser-model-connection.test.mjs','tests/pan565/registration.test.mjs'];
// Same closed Node24 option admission as existing PAN548/PAN549 product entries.
// No name filters, skipped browser, injected module or fabricated result.
function nodeOptionTokens(raw){const tokens=[];let quoted=false,start=true;for(let i=0;i<raw.length;i++){let c=raw[i];if(c==='\\'&&quoted){if(++i===raw.length)throw Error('PAN565_TEST_ARGUMENT_DENIED');c=raw[i];}else if(c===' '&&!quoted){start=true;continue;}else if(c==='"'){quoted=!quoted;continue;}if(start){tokens.push(c);start=false;}else tokens[tokens.length-1]+=c;}if(quoted)throw Error('PAN565_TEST_ARGUMENT_DENIED');return tokens;}
try{
 const args=process.argv.slice(2);
 if(args.length===1&&args[0]==='--list')process.stdout.write(JSON.stringify(files)+'\n');
 else{
  const tokens=nodeOptionTokens(process.env.NODE_OPTIONS??'');
  for(let i=0;i<tokens.length;i++){const token=tokens[i],equal=token.indexOf('='),name=(equal<0?token:token.slice(0,equal)).replaceAll('_','-');if(['--trace-warnings','--no-trace-warnings','--warnings','--no-warnings'].includes(name)){if(equal>=0)throw Error('PAN565_TEST_ARGUMENT_DENIED');continue;}if(!['--conditions','-C','--max-old-space-size','--max-semi-space-size'].includes(name))throw Error('PAN565_TEST_ARGUMENT_DENIED');const value=equal<0?tokens[++i]:token.slice(equal+1);if(typeof value!=='string'||!value.length||(!['--conditions','-C'].includes(name)&&!/^[1-9][0-9]*$/.test(value)))throw Error('PAN565_TEST_ARGUMENT_DENIED');}
  if(args.length||process.env.NODE_TEST_CONTEXT!==undefined)throw Error('PAN565_TEST_ARGUMENT_DENIED');
  if(process.platform!=='linux'||process.arch!=='x64')throw Error('PAN565_TEST_REQUIRES_SUPPORTED_LINUX_X86_64');
  const env={...process.env,TMPDIR:process.env.TMPDIR||process.env.RUNNER_TEMP};if(!env.TMPDIR)throw Error('PAN565_OWNED_SCRATCH_REQUIRED');
  if(!env.PAN565_BROWSER_EVIDENCE){env.PAN565_BROWSER_EVIDENCE=mkdtempSync(join(env.TMPDIR,'pan565-browser-evidence-'));process.stdout.write('PAN565_BROWSER_EVIDENCE_DIR='+env.PAN565_BROWSER_EVIDENCE+'\n');}
  if(!env.PAN546_BROWSER_EVIDENCE)env.PAN546_BROWSER_EVIDENCE=env.PAN565_BROWSER_EVIDENCE;
  env.PAN527_BROWSER_MODULE=env.PAN527_BROWSER_MODULE||import.meta.resolve('playwright');env.PAN527_CERTUTIL=env.PAN527_CERTUTIL||'certutil';
  for(const argv of [['node_modules/typescript/bin/tsc','-p','tsconfig.json'],['scripts/build-pan541-browser.mjs'],['--test','--test-concurrency=1','--test-reporter=tap',...files]]){const p=spawnSync(process.execPath,argv,{env,stdio:'inherit'});if(p.error||p.signal||p.status===null)throw Error('PAN565_TEST_PROCESS_INTERRUPTED');if(p.status!==0){process.exitCode=p.status;break;}}
 }
}catch(e){process.stderr.write((e instanceof Error?e.message:'PAN565_TEST_TOOLING_UNAVAILABLE')+'\n');process.exitCode=1;}
