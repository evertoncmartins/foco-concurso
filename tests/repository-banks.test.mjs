import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,readFile,rm,unlink,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {repositoryCatalog} from '../server/repository-banks.mjs';
import {createBankCatalogHandler} from '../server/question-banks.mjs';
import {buildSite} from '../scripts/build.mjs';
import {SystemBanks} from '../src/system-banks.mjs';
import {derive} from '../src/engine.mjs';
import {createSession} from '../src/session.mjs';
import {questionSource} from '../src/bank-source.mjs';
import {sessionReport} from '../src/sessions-view.mjs';

const bank=(number='9394',year='1996')=>({schemaVersion:1,id:`lei-${number}`,name:`Lei nº ${number}/${year}`,description:'Banco usado apenas em teste.',questions:[{id:'test-q1',discipline:'Teste',subject:'Teste',topic:'Teste',statement:'Enunciado de teste.',options:[{id:'A',text:'Primeira alternativa.'},{id:'B',text:'Segunda alternativa.'}],correctOption:'A',explanation:'Comentário de teste.',optionExplanations:{A:'Primeira opção conforme o dispositivo de teste.',B:'Segunda opção diverge do dispositivo de teste.'},fundamentoLegal:'Lei nº 9.394/1996, art. 1º.',tipo:'Autoral',reference:{label:'Lei oficial',url:'https://www.planalto.gov.br/ccivil_03/leis/l9394.htm'},difficulty:'easy',tags:[]}]});
async function directory(t){const root=await mkdtemp(join(tmpdir(),'foco-repository-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
const save=(root,value)=>writeFile(join(root,`${value.id}.json`),JSON.stringify(value));

test('descobre novos JSONs e remoções sem cadastrar um índice e gera revisões pelo conteúdo',async t=>{
  const root=await directory(t),raw=bank();await save(root,raw);
  await writeFile(join(root,'index.json'),'índice antigo inválido e ignorado');
  const initial=repositoryCatalog(root);assert.equal(initial.banks.length,1);assert.match(initial.banks[0].revision,/^repo-/);
  await writeFile(join(root,`${raw.id}.json`),'\uFEFF'+JSON.stringify({...raw,revision:'valor-manual-ignorado'},null,4));
  assert.deepEqual(repositoryCatalog(root).manifest,initial.manifest);
  await save(root,{...raw,publishedAt:'2026-10-17T00:00:00Z'});
  assert.notEqual(repositoryCatalog(root).banks[0].revision,initial.banks[0].revision,'timestamps diferentes não podem compartilhar o ID de um snapshot');
  const changed=structuredClone(raw);changed.questions[0].statement='Enunciado revisado.';await save(root,changed);
  const update=repositoryCatalog(root);assert.notEqual(update.manifest.version,initial.manifest.version);assert.notEqual(update.banks[0].revision,initial.banks[0].revision);
  await save(root,bank('8112','1990'));assert.equal(repositoryCatalog(root).banks.length,2);
  await unlink(join(root,'lei-9394.json'));assert.deepEqual(repositoryCatalog(root).manifest.banks.map(b=>b.id),['lei-8112']);
  await unlink(join(root,'lei-8112.json'));assert.deepEqual(repositoryCatalog(root).manifest.banks,[]);
});

test('padroniza o título sem aceitar displayName arbitrário nos bancos do Sistema',async t=>{
  const root=await directory(t);await save(root,{...bank(),name:'LDB — Lei 9.394/1996',subtitle:'Lei de Diretrizes e Bases da Educação Nacional',displayName:'Nome livre pessoal'});
  const published=repositoryCatalog(root).banks[0];assert.equal(published.name,'Lei nº 9.394/1996');assert.equal(published.displayName,published.name);assert.equal(published.subtitle,'Lei de Diretrizes e Bases da Educação Nacional');
});
test('publicação de qualquer novo banco recusa feedback incompleto e referência de terceiros',async t=>{
  const root=await directory(t);
  for(const change of [q=>delete q.optionExplanations,q=>q.reference.url='https://terceiro.example/lei']){
    const raw=bank();change(raw.questions[0]);await save(root,raw);assert.throws(()=>repositoryCatalog(root),/lei-9394.json: Questão test-q1:/);
  }
});

test('recusa arquivo, ID, lei, JSON e gabarito inconsistentes com o arquivo identificado no erro',async t=>{
  const root=await directory(t);
  const cases=[['eca-8069.json',bank()],['lei-9394.json',{...bank(),id:'other-id'}],['lei-9394.json',{...bank(),name:'Lei nº 8.112/1990'}],['lei-9394.json','{invalid'],['lei-9394.json',{...bank(),questions:[{...bank().questions[0],correctOption:'C'}]}]];
  for(const [file,raw] of cases){await writeFile(join(root,file),typeof raw==='string'?raw:JSON.stringify(raw));assert.throws(()=>repositoryCatalog(root),error=>error.message.startsWith(`${file}:`));await unlink(join(root,file));}
  await writeFile(join(root,'outside.txt'),JSON.stringify(bank()));await symlink(join(root,'outside.txt'),join(root,'lei-9394.json'));assert.throws(()=>repositoryCatalog(root),/lei-9394.json/);
});

test('build publica o catálogo descoberto e os JSONs com a mesma revisão automática',async t=>{
  const root=await directory(t);for(const path of ['public/data/question-banks','src','docs'])await mkdir(join(root,path),{recursive:true});
  await writeFile(join(root,'public/app-config.json'),'{}');await save(join(root,'public/data/question-banks'),bank());
  const manifest=await buildSite(root),published=JSON.parse(await readFile(join(root,'dist/data/question-banks/lei-9394.json')));
  assert.deepEqual(JSON.parse(await readFile(join(root,'dist/data/question-banks/index.json'))),manifest);
  assert.equal(published.revision,manifest.banks[0].revision);assert.equal(published.sourceType,'system');
  await writeFile(join(root,'dist/keep.txt'),'último build válido');
  await writeFile(join(root,'public/data/question-banks/lei-9394.json'),'{invalid');
  await assert.rejects(buildSite(root),/lei-9394.json/);assert.equal(await readFile(join(root,'dist/keep.txt'),'utf8'),'último build válido');
});

test('build com pasta oficial vazia não publica bancos de exemplo dos módulos',async t=>{
  const root=await directory(t);for(const path of ['public/data/question-banks','src','docs'])await mkdir(join(root,path),{recursive:true});
  await writeFile(join(root,'public/app-config.json'),'{}');await writeFile(join(root,'src/lei-8112.json'),JSON.stringify(bank('8112','1990')));
  const manifest=await buildSite(root);assert.deepEqual(manifest.banks,[]);
  await assert.rejects(readFile(join(root,'dist/assets/lei-8112.json')),error=>error.code==='ENOENT');
});

test('API consulta o mesmo catálogo sem Google ou Blob e recusa todas as gravações',async t=>{
  const root=await directory(t);await save(root,bank());const handler=createBankCatalogHandler({directory:root}),url='https://foco-concurso-wine.vercel.app/api/question-banks';
  const response=await handler(new Request(url));assert.equal(response.status,200);assert.deepEqual(await response.json(),repositoryCatalog(root).manifest);assert.equal(response.headers.get('Access-Control-Allow-Origin'),'*');
  for(const method of ['POST','PUT','PATCH','DELETE']){const denied=await handler(new Request(url,{method,headers:{Authorization:'Bearer any-admin-token'},body:'{}'}));assert.equal(denied.status,405);assert.equal(denied.headers.get('Allow'),'GET, HEAD');}
  const head=await handler(new Request(url,{method:'HEAD'}));assert.equal(head.status,200);assert.equal(await head.text(),'');
});

test('espelho reconhece bancos novos no catálogo da produção e busca o arquivo no mesmo domínio',async t=>{
  const root=await directory(t);await save(root,bank());const {manifest,banks}=repositoryCatalog(root),calls=[],base='https://foco-concurso-wine.vercel.app/data/question-banks/';
  const catalog=new SystemBanks(async(url,options)=>{calls.push({url,options});return Response.json(url.endsWith('index.json')?manifest:banks[0]);},{origin:'https://foco-concursos.ecmdigital.chatgpt.site'});
  assert.equal((await catalog.load())[0].id,'lei-9394');assert.equal(calls[0].url,`${base}index.json`);assert.equal(calls[1].url,`${base}lei-9394.json?v=${banks[0].revision}`);assert(calls.every(c=>c.options.credentials==='omit'));
});

test('espelho conserva fallback local em falha de rede e respeita catálogo remoto vazio',async()=>{
  const calls=[],origin='https://foco-concursos.ecmdigital.chatgpt.site';
  const fallback=new SystemBanks(async url=>{calls.push(url);if(url.startsWith('https:'))throw new Error('offline');return Response.json({schemaVersion:1,version:'local',banks:[]});},{origin});
  assert.deepEqual(await fallback.load(),[]);assert.equal(fallback.version,'local');assert.equal(calls.length,2);
  const empty=new SystemBanks(async url=>{assert(url.startsWith('https:'));return Response.json({schemaVersion:1,version:'removed',banks:[]});},{origin});assert.deepEqual(await empty.load(),[]);assert.equal(empty.version,'removed');
});

test('recarga incompleta preserva catálogo anterior e rejeita mistura entre revisões',async()=>{
  const raw={...bank(),revision:'one'};let changed=false;
  const catalog=new SystemBanks(async url=>Response.json(url.endsWith('index.json')?{schemaVersion:1,version:changed?'two':'one',banks:[{id:raw.id,revision:changed?'two':'one'}]}:raw));
  await catalog.load();changed=true;await assert.rejects(catalog.load({force:true}),/versão/);assert.equal(catalog.banks[0].revision,'one');assert.equal(catalog.version,'one');
});

test('resultado de questão não respondida conserva a revisão exata da sessão após atualização',()=>{
  const original={...bank(),sourceType:'system',revision:'old'},later={...structuredClone(original),revision:'new'};later.questions[0].statement='Conteúdo de outra revisão';
  const initial=derive([],Date.now(),[original]),question=initial.questions[0],session=createSession([question.key],'exam','snapshot-session','2026-10-16T12:00:00Z');session.questionSources={[question.key]:questionSource(question)};session.completed=true;
  const events=[{id:'a-old-snapshot',at:'2026-10-16T00:00:00Z',type:'system-bank-snapshot',bank:original,revision:'old'},{id:'z-new-snapshot',at:'2026-10-16T00:00:00Z',type:'system-bank-snapshot',bank:later,revision:'new'}];
  const result=sessionReport(session,derive(events,Date.now(),[later]));assert.equal(result.questions[0].question.statement,original.questions[0].statement);assert.equal(result.total,1);
});
