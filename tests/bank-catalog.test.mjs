import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Store} from '../src/store.mjs';
import {TemporaryStorage} from '../src/temporary-storage.mjs';
import {AccountStorage} from '../src/account.mjs';
import {validateSystemBank,SystemBanks} from '../src/system-banks.mjs';
import {bankCatalogCards,catalogSyncButton} from '../src/bank-catalog-view.mjs';
import {bankCardView} from '../src/bank-view.mjs';
import {questionSource} from '../src/bank-source.mjs';
import {createSession,chooseAnswer,completeSession} from '../src/session.mjs';
import {filterQuestions} from '../src/engine.mjs';
import {sessionReport} from '../src/sessions-view.mjs';

const raw=JSON.parse(await readFile(new URL('../public/data/question-banks/lei-9394.json',import.meta.url)));
const native=validateSystemBank({...raw,revision:'test-one',questions:raw.questions.slice(0,2)});
const other=validateSystemBank({...native,id:'lei-12345',name:'Lei nº 12.345/2010'});
async function study(store,{completed=true,exam=false}={}){
  store.setSystemBanks([native,other]);
  await store.add([native,other].map(bank=>({type:'system-bank-snapshot',revision:bank.revision,bank})));
  const q=store.model().questions[0];let session=createSession([q.key],exam?'exam':'smart');
  session.questionSources={[q.key]:questionSource(q)};
  await store.add([{type:'session',session}]);
  if(!exam){const result=chooseAnswer(session,q,q.correctOption);session=result.session;await store.add(result.events);}
  if(completed){const result=completeSession(session,[q]);await store.add(result.events);session=result.session;}
  return session;
}

test('remoção conserva só o card estudado, o histórico e o gabarito registrado; retorno recupera card ativo',async()=>{
  const store=new Store(new TemporaryStorage()),session=await study(store);
  const journal=JSON.stringify(store.events),before=sessionReport(session,store.model());
  store.setSystemBanks([]);const model=store.model(),cards=bankCatalogCards(model);
  assert.equal(cards.length,1);assert.equal(cards[0].id,native.id);assert.equal(cards[0].unavailable,true);assert.equal(cards[0].enabled,false);
  assert.equal(cards[0].questions.length,2);assert.equal(model.banks.length,0);assert.equal(filterQuestions(model,{mode:'random'}).length,0);
  assert.equal(sessionReport(session,model).total,before.total);assert.equal(sessionReport(session,model).correct,before.correct);
  assert.equal(sessionReport(session,model).questions[0].question.statement,before.questions[0].question.statement);
  assert.equal(JSON.stringify(store.events),journal);
  const html=bankCardView(cards[0],{detailsOpen:true});
  assert(html.includes('Indisponível'));assert(html.includes('Ver sessões'));assert(html.includes('Lei nº 9.394/1996'));
  for(const action of ['start','bank-toggle','bank-export','bank-delete'])assert(!html.includes(`data-action="${action}"`));
  store.setSystemBanks([native]);const restored=bankCatalogCards(store.model());
  assert.equal(restored.length,1);assert(!restored[0].unavailable);assert(restored[0].enabled);
  assert.equal(store.model().stats.attempts,1);assert.equal(JSON.stringify(store.events),journal);
});

test('sessão de simulado em andamento mantém card indisponível sem revelar correção',async()=>{
  const store=new Store(new TemporaryStorage());await study(store,{completed:false,exam:true});store.setSystemBanks([]);
  const cards=bankCatalogCards(store.model());assert.equal(cards.length,1);assert(cards[0].unavailable);
  const html=bankCardView(cards[0]);assert(!html.includes('acertos'));assert(!html.includes('erros'));assert.equal(store.model().answers.length,0);
});

test('card removido respeita conta, etapa atual e sessões excluídas, sem confiar em snapshots isolados',async()=>{
  const storage=new TemporaryStorage(),own=new Store(new AccountStorage(storage,'alpha')),foreign=new Store(new AccountStorage(storage,'beta'));
  const session=await study(own,{completed:false,exam:true});own.setSystemBanks([]);
  assert.equal(bankCatalogCards(own.model()).length,1);assert.equal(bankCatalogCards(foreign.model()).length,0);
  await own.deleteSession(session.id);assert.equal(bankCatalogCards(own.model()).length,0);
  await study(own);own.setSystemBanks([]);assert.equal(bankCatalogCards(own.model()).length,1);
  await own.resetProgress();assert.equal(bankCatalogCards(own.model()).length,0);
  assert(own.events.some(e=>e.type==='system-bank-snapshot'));
});

test('resposta antiga sem snapshot ainda identifica a lei e não inventa contagem de questões',async()=>{
  const store=new Store(new TemporaryStorage());store.setSystemBanks([native]);
  const q=store.model().questions[0],s=createSession([q.key]);await store.add(chooseAnswer(s,q,q.correctOption).events);store.setSystemBanks([]);
  const cards=bankCatalogCards(store.model());assert.equal(cards.length,1);assert.equal(cards[0].sourceType,'system');
  const html=bankCardView(cards[0]);assert(html.includes('Lei nº 9.394/1996'));assert(html.includes('<dt>Questões</dt><dd>—</dd>'));
});

test('sincronização segue disponibilidade global, preserva importações e não duplica card histórico',async()=>{
  const store=new Store(new TemporaryStorage());await study(store);
  await store.add([{type:'bank',bank:{...native,id:'my-bank',displayName:'Meus estudos'}},{type:'system-bank-state',bankId:native.id,value:'disabled'}]);
  store.setSystemBanks([]);assert.equal(bankCatalogCards(store.model()).length,2);
  store.setSystemBanks([native,other]);const cards=bankCatalogCards(store.model());assert.equal(cards.length,3);
  assert.equal(cards.find(b=>b.id===native.id).enabled,true);assert.equal(cards.find(b=>b.id==='my-bank').sourceType,'personal');
  store.setSystemBanks([{...native,active:false},other]);assert.equal(bankCatalogCards(store.model()).find(b=>b.id===native.id).enabled,false);
  assert(!cards.some(b=>b.unavailable));
});

test('consulta compartilhada inclui e remove bancos e conserva catálogo anterior em falha',async()=>{
  let banks=[native],release;const calls=[];
  const catalog=new SystemBanks(async(url,options)=>{
    calls.push({url,options});if(release)await new Promise(resolve=>release=resolve);
    if(banks===null)throw new Error('offline');
    return Response.json(url.includes('index.json')?{schemaVersion:1,banks:banks.map(b=>({id:b.id,revision:b.revision}))}:banks.find(b=>url.includes(`${b.id}.json`)));
  },{origin:'http://localhost:5173'});
  await catalog.load();banks=[native,other];await catalog.load({force:true});assert.equal(catalog.banks.length,2);
  banks=[];await catalog.load({force:true});assert.equal(catalog.banks.length,0);
  banks=[native];await catalog.load({force:true});banks=null;await assert.rejects(catalog.load({force:true}),/offline/);assert.equal(catalog.banks.length,1);assert.equal(catalog.loading,null);
  banks=[];release=true;const a=catalog.load({force:true}),b=catalog.load({force:true}),count=calls.length;release();release=null;
  assert.deepEqual(await a,[]);assert.deepEqual(await b,[]);assert.equal(calls.length,count);
  assert(calls.filter(c=>c.url.includes('index.json')).every(c=>c.options.cache==='no-store'));
});

test('espelho mantém último catálogo confirmado se a produção falhar durante sincronização',async()=>{
  let offline=false;const calls=[];
  const catalog=new SystemBanks(async url=>{calls.push(url);if(offline)throw new Error('offline');return Response.json(url.includes('index.json')?{schemaVersion:1,banks:[{id:native.id}]}:native);},{origin:'https://foco-concursos.ecmdigital.chatgpt.site'});
  await catalog.load();offline=true;await assert.rejects(catalog.load({force:true}),/offline/);
  assert.equal(catalog.banks[0].id,native.id);assert(!calls.some(url=>url.startsWith('./')));
});

test('botão de sincronizar comunica carregamento e impede cliques repetidos',()=>{
  const busy=catalogSyncButton(true),idle=catalogSyncButton();
  assert(busy.includes('Sincronizando…'));assert(busy.includes('aria-busy="true" disabled'));
  assert(idle.includes('Sincronizar'));assert(!idle.includes('disabled'));
});

test('consulta sinaliza inclusões, alterações e exclusões sem aplicar antes da sincronização por banco',async()=>{
  let banks=[native,other];
  const catalog=new SystemBanks(async url=>Response.json(url.includes('index.json')?{schemaVersion:1,version:'latest',banks:banks.map(b=>({id:b.id,revision:b.revision}))}:banks.find(b=>url.includes(`${b.id}.json`))),{origin:'http://localhost:5173'});
  await catalog.load();
  const store=new Store(new TemporaryStorage()),session=await study(store),journal=JSON.stringify(store.events),report=sessionReport(session,store.model());
  const changed=structuredClone(native);changed.revision='test-two';changed.questions[0].explanation+=' Revisão editorial.';
  changed.questions[1]={...changed.questions[1],id:'nova-questao'};banks=[changed];
  await catalog.check();store.setSystemBanks(catalog.banks);
  assert.equal(catalog.banks[0].revision,'test-one');
  assert.deepEqual({...catalog.updates.get(native.id),bank:undefined},{kind:'updated',bank:undefined,added:1,removed:1,changed:1});
  const cards=bankCatalogCards(store.model(),catalog.updates),html=bankCardView(cards.find(b=>b.id===native.id));
  for(const label of ['Atualização disponível','1 questão nova','1 questão alterada','1 questão removida','Sincronizar banco'])assert(html.includes(label));
  assert(bankCardView(cards.find(b=>b.id===other.id)).includes('Banco retirado do catálogo'));
  catalog.apply(native.id);store.setSystemBanks(catalog.banks);
  assert.equal(store.model().systemBanks.find(b=>b.id===native.id).revision,'test-two');
  assert.equal(catalog.updates.size,1);assert(catalog.banks.some(b=>b.id===other.id));
  assert.equal(JSON.stringify(store.events),journal);assert.equal(sessionReport(session,store.model()).correct,report.correct);
  catalog.apply();assert(!catalog.banks.some(b=>b.id===other.id));assert.equal(catalog.version,'latest');
});

test('novos bancos aguardam sincronização e falha na consulta preserva aviso e versão aplicada',async()=>{
  let banks=[],offline=false;
  const catalog=new SystemBanks(async url=>{if(offline)throw new Error('offline');return Response.json(url.includes('index.json')?{schemaVersion:1,banks:banks.map(b=>({id:b.id}))}:native);});
  await catalog.load();banks=[native];await catalog.check();
  const store=new Store(new TemporaryStorage()),cards=bankCatalogCards(store.model(),catalog.updates);
  assert.equal(cards.length,1);assert.equal(cards[0].pendingActivation,true);assert.equal(store.model().banks.length,0);
  assert(bankCardView(cards[0]).includes('Novo banco disponível'));
  offline=true;await assert.rejects(catalog.check(),/offline/);assert.equal(catalog.updates.size,1);assert.equal(catalog.banks.length,0);
  catalog.apply(native.id);assert.equal(catalog.banks.length,1);assert.equal(catalog.updates.size,0);
});
