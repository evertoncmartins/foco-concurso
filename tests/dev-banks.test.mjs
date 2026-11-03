import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,mkdir,writeFile,readFile,unlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SystemBanks} from '../src/system-banks.mjs';

test('servidor local sincroniza adição, atualização e remoção da pasta sem rebuild nem ressuscitar dist',async t=>{
  const root=await mkdtemp(join(tmpdir(),'foco-dev-banks-')),directory=join(root,'public/data/question-banks');
  let child;
  t.after(async()=>{if(child&&child.exitCode===null){const closed=once(child,'exit');child.kill();await closed;}await rm(root,{recursive:true,force:true});});
  await mkdir(directory,{recursive:true});await mkdir(join(root,'dist/data/question-banks'),{recursive:true});
  const raw=JSON.parse(await readFile(new URL('../public/data/question-banks/lei-9394.json',import.meta.url)));raw.questions=raw.questions.slice(0,1);
  await writeFile(join(root,'dist/data/question-banks/lei-9394.json'),JSON.stringify(raw));
  child=spawn(process.execPath,[fileURLToPath(new URL('../scripts/dev.mjs',import.meta.url)),'--port','0'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  const origin=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('O servidor local não iniciou.')),10000);let output='';
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.stdout.on('data',data=>{output+=data;const url=output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];if(url){clearTimeout(timer);resolve(url);}});
  });
  const catalog=new SystemBanks((url,options)=>fetch(new URL(url,origin),options),{origin});
  assert.deepEqual(await catalog.load(),[]);
  await writeFile(join(directory,'lei-9394.json'),JSON.stringify(raw));
  await catalog.load({force:true});assert.equal(catalog.banks.length,1);const revision=catalog.banks[0].revision;
  raw.questions[0].statement='Enunciado atualizado no desenvolvimento.';await writeFile(join(directory,'lei-9394.json'),JSON.stringify(raw));
  await catalog.load({force:true});assert.notEqual(catalog.banks[0].revision,revision);assert.equal(catalog.banks[0].questions[0].statement,raw.questions[0].statement);
  await writeFile(join(directory,'lei-9394.json'),'{invalid');
  await assert.rejects(catalog.load({force:true}),/carregar/);assert.equal(catalog.banks.length,1);
  await unlink(join(directory,'lei-9394.json'));await catalog.load({force:true});assert.deepEqual(catalog.banks,[]);
  const removed=await fetch(`${origin}/data/question-banks/lei-9394.json`);assert.equal(removed.status,404);assert.equal(removed.headers.get('cache-control'),'no-store');
});
