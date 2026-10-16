import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateBank,validateEvents,derive,questionKey} from '../src/engine.mjs';
import {Store} from '../src/store.mjs';
import {TemporaryStorage} from '../src/temporary-storage.mjs';
import {SystemBanks,validateSystemBank} from '../src/system-banks.mjs';
import {preparePersonalBank,questionSource,sessionQuestion} from '../src/bank-source.mjs';
import {bankCardView,bankPresentation} from '../src/bank-view.mjs';
import {sessionSetupView} from '../src/session-setup.mjs';
import {sessionBankCatalog,sessionReport,sessionLibrary,performanceForBank} from '../src/sessions-view.mjs';
import {createSession,chooseAnswer,completeSession} from '../src/session.mjs';

const fullRju=JSON.parse(await readFile(new URL('../public/data/question-banks/lei-8112.json',import.meta.url))),fullEca=JSON.parse(await readFile(new URL('../public/data/question-banks/lei-8069.json',import.meta.url)));
const native=validateSystemBank({...fullRju,questions:fullRju.questions.slice(0,3)}),personal=preparePersonalBank(validateBank({...native,id:'my-questions',name:'Questões importadas'}));
const at=n=>new Date(Date.parse('2026-10-16T10:00:00Z')+n*1000).toISOString();
const event=(id,type,data,n=1)=>({id,type,at:at(n),...data});

test('catálogo incluído no projeto contém os dois bancos completos com nomes e IDs padronizados',()=>{
  assert.equal(validateSystemBank(fullRju).questions.length,126);assert.equal(validateSystemBank(fullEca).questions.length,73);
  for(const bank of [fullRju,fullEca]){assert.match(bank.id,/^lei-\d+$/);assert.equal(bank.sourceType,'system');assert.match(bank.name,/^Lei nº/);}
});

test('bancos carregam sem login nem Drive, com fallback estático e catálogo vazio respeitado',async()=>{
  const calls=[],fetcher=async url=>{calls.push(url);if(url==='/api/question-banks')return new Response('',{status:404});if(url.endsWith('index.json'))return Response.json({schemaVersion:1,version:'one',banks:[{id:native.id}]});return Response.json(native);};
  const catalog=new SystemBanks(fetcher);await catalog.load();assert.equal(catalog.banks[0].sourceType,'system');assert(calls.every(url=>!url.includes('google')));
  const empty=new SystemBanks(async()=>Response.json({schemaVersion:1,version:'deleted',banks:[]}));await empty.load();assert.deepEqual(empty.banks,[]);
  const unsafe=new SystemBanks(async()=>Response.json({schemaVersion:1,banks:[{id:native.id,url:'https://example.test/steal'}]}));await assert.rejects(unsafe.load(),/Endereço/);
});

test('arquivo pessoal não se torna do sistema e IDs reservados migram sem misturar sessões e respostas',()=>{
  const original=validateBank({...native,sourceType:'system'}),oldKey=questionKey(original.id,original.questions[0].id),q=original.questions[0];
  const oldSession={...createSession([oldKey],'smart','legacy',at(1)),answers:{[oldKey]:q.correctOption}};
  const events=[event('import','bank',{bank:original}),event('legacy-session','session',{session:oldSession},2),event('legacy-answer','answer',{key:oldKey,sessionId:'legacy',selected:q.correctOption,correctOption:q.correctOption,correct:true,discipline:q.discipline,subject:q.subject,topic:q.topic},2),event('favorite','flag',{key:oldKey,flag:'favorite',value:true},2),event('system-answer','answer',{key:oldKey,bankId:native.id,sourceType:'system',sessionId:'new-system',selected:q.correctOption,correctOption:q.correctOption,correct:true,discipline:q.discipline,subject:q.subject,topic:q.topic},3)];
  const before=JSON.stringify(events),model=derive(events,Date.now(),[native]),legacy=model.personalBanks[0];
  assert.equal(legacy.id,'personal_bank_lei-8112');assert.equal(legacy.sourceType,'personal');assert.equal(model.systemBanks[0].id,'lei-8112');
  assert.equal(model.sessions[0].queue[0],`personal_bank_lei-8112:${q.id}`);assert(model.flags.get(model.sessions[0].queue[0]).favorite);
  assert.equal(performanceForBank(model,legacy.id).stats.attempts,1);assert.equal(performanceForBank(model,native.id).stats.attempts,1);assert.equal(JSON.stringify(events),before);
});

test('renomeação sincroniza separadamente do conteúdo e preserva IDs, progresso e nomes livres',async()=>{
  const store=new Store(new TemporaryStorage());store.setSystemBanks([native]);await store.add([{type:'bank',bank:personal}]);
  const q=store.model().questions.find(q=>q.bankId===personal.id),session=createSession([q.key],'smart');await store.add(chooseAnswer(session,q,q.correctOption).events);
  await store.add([{type:'bank-metadata',bankId:personal.id,displayName:'Meu estudo de RJU — do meu jeito'}]);
  await store.add([{type:'bank',bank:{...personal,name:'Novo nome técnico do arquivo'}}]);
  const copy=new Store(new TemporaryStorage());await copy.merge(validateEvents(store.export()));copy.setSystemBanks([native]);
  const model=copy.model(),bank=model.personalBanks[0];assert.equal(bank.id,personal.id);assert.equal(bankPresentation(bank).title,'Meu estudo de RJU — do meu jeito');assert.equal(model.stats.attempts,1);assert.equal(model.sessions[0].id,session.id);assert.equal(model.questions.find(q=>q.bankId===personal.id).displayName,bank.displayName);
  assert.equal(sessionBankCatalog(model).find(b=>b.id===personal.id).title,bank.displayName);
});

test('sessão mista preserva procedência ao voltar, concluir, atualizar ou remover o catálogo',async()=>{
  const store=new Store(new TemporaryStorage());store.setSystemBanks([native]);await store.add([{type:'bank',bank:personal},{id:'snapshot',type:'system-bank-snapshot',revision:native.revision,bank:native}]);
  let model=store.model();const questions=[model.questions.find(q=>q.sourceType==='system'),model.questions.find(q=>q.sourceType==='personal')];
  let session=createSession(questions.map(q=>q.key),'exam');session.questionSources=Object.fromEntries(questions.map(q=>[q.key,questionSource(q)]));
  session=chooseAnswer(session,questions[0],questions[0].correctOption).session;session.index=1;session=chooseAnswer(session,questions[1],questions[1].correctOption).session;await store.add([{type:'session',session}]);
  const updated=structuredClone(native);updated.revision='updated-version';updated.questions[0].statement='Texto posterior';updated.questions[0].correctOption=updated.questions[0].options.find(o=>o.id!==questions[0].correctOption).id;store.setSystemBanks([updated]);
  assert.equal(sessionQuestion(store.model(),session,questions[0].key).statement,questions[0].statement);
  store.setSystemBanks([]);model=store.model();assert(sessionLibrary(model).rows[0].canResume);
  const result=completeSession(session,session.queue.map(key=>sessionQuestion(model,session,key)));await store.add(result.events);model=store.model();
  const report=sessionReport(result.session,model);assert.equal(report.correct,2);assert.equal(report.questions[0].question.statement,questions[0].statement);assert.equal(report.questions[0].sourceType,'system');assert.equal(report.questions[1].sourceType,'personal');assert.equal(model.answers.filter(a=>a.sourceType==='system').length,1);
});

test('bancos nativos não são removidos ou renomeados por eventos pessoais e a UI respeita as permissões',()=>{
  const model=derive([event('forged-delete','bank-state',{bankId:native.id,value:'deleted'}),event('forged-name','bank-metadata',{bankId:native.id,displayName:'Falso'})],Date.now(),[native]);
  assert.equal(model.systemBanks.length,1);assert.equal(model.systemBanks[0].displayName,native.displayName);
  const html=bankCardView({...native,enabled:true},{detailsOpen:true});assert(!html.includes('data-action="bank-delete"'));assert(!html.includes('data-action="bank-rename"'));assert(html.includes('bank-source system'));
  const renamed={...personal,enabled:true,displayName:'<script>meu nome</script>'},own=bankCardView(renamed,{detailsOpen:true});assert(own.includes('data-action="bank-rename"'));assert(own.includes('&lt;script&gt;'));assert(!own.includes('<script>'));
  const setup=sessionSetupView({banks:[native,renamed],modes:{smart:['Estudo','Pratique']}});assert(setup.includes('bank-source system'));assert(setup.includes('bank-source personal'));
  assert.throws(()=>validateEvents({schemaVersion:1,events:[event('delete','system-bank-state',{bankId:native.id,value:'deleted'})]}),/Estado/);
});

test('uma cópia histórica pessoal não substitui a questão oficial da revisão atualmente publicada',()=>{
  const forged=structuredClone(native);forged.questions[0].statement='Conteúdo forjado';
  const model=derive([event('forged-snapshot','system-bank-snapshot',{bank:forged,revision:native.revision})],Date.now(),[native]),q=model.questions[0],session=createSession([q.key]);session.questionSources={[q.key]:questionSource(q)};
  assert.equal(sessionQuestion(model,session,q.key).statement,native.questions[0].statement);
});
