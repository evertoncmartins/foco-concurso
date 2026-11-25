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

test('decretos não recebem título de lei e renomeação pessoal do Sistema sincroniza só na conta',async()=>{
  const decree=validateSystemBank({...native,id:'decreto-8112',name:'Decreto nº 8.112/2013',displayName:undefined});
  assert.equal(bankPresentation(decree).title,decree.name);assert.equal(bankPresentation(decree).law,null);
  const own=new Store(new TemporaryStorage()),other=new Store(new TemporaryStorage()),remote=new Store(new TemporaryStorage());
  for(const store of [own,other,remote])store.setSystemBanks([decree]);
  const q=own.model().questions[0],session=createSession([q.key]);session.questionSources={[q.key]:questionSource(q)};
  await own.add([{type:'system-bank-snapshot',bank:decree,revision:decree.revision},...chooseAnswer(session,q,q.correctOption).events]);
  await own.add([{type:'bank-metadata',bankId:decree.id,sourceType:'system',displayName:'Meu estudo do decreto'}]);
  await remote.merge(validateEvents(own.export()));
  for(const store of [own,remote]){
    assert.equal(store.model().banks[0].displayName,'Meu estudo do decreto');assert.equal(store.model().banks[0].id,decree.id);
    assert.equal(store.model().stats.attempts,1);assert.equal(sessionBankCatalog(store.model())[0].title,'Meu estudo do decreto');
    assert.equal(store.model().questions[0].displayName,'Meu estudo do decreto');
  }
  assert.equal(other.model().banks[0].displayName,decree.name);assert.equal(decree.displayName,decree.name);
  own.setSystemBanks([{...decree,displayName:'Novo nome público',revision:'new'}]);
  assert.equal(own.model().banks[0].displayName,'Meu estudo do decreto');
  await own.resetProgress();assert.equal(own.model().banks[0].displayName,'Meu estudo do decreto');
});

test('IDs iguais de decreto pessoal e nativo separam respostas, favoritos, nomes e snapshots',()=>{
  const decree=validateSystemBank({...native,id:'decreto-12345',name:'Decreto nº 12.345/2026'}),q=decree.questions[0],key=questionKey(decree.id,q.id);
  const personalSession=createSession([key],'smart','personal-session',at(2));personalSession.questionSources={[key]:{bankId:decree.id,sourceType:'personal'}};
  const events=[event('import-decree','bank',{bank:validateBank(decree)}),event('saved-session','session',{session:personalSession},2),
    event('personal-answer','answer',{key,sessionId:personalSession.id,sourceType:'personal',selected:q.correctOption,correctOption:q.correctOption,correct:true,discipline:q.discipline,subject:q.subject,topic:q.topic},3),
    event('native-answer','answer',{key,bankId:decree.id,sessionId:'native-session',sourceType:'system',selected:q.correctOption,correctOption:q.correctOption,correct:true,discipline:q.discipline,subject:q.subject,topic:q.topic},4),
    event('native-name','bank-metadata',{bankId:decree.id,sourceType:'system',displayName:'Meu decreto nativo'},5),
    event('personal-name','bank-metadata',{bankId:decree.id,displayName:'Minha cópia pessoal'},6),
    event('native-snapshot','system-bank-snapshot',{bank:decree,revision:decree.revision},7)];
  const model=derive(validateEvents({schemaVersion:1,events}),Date.now(),[decree]);
  assert.equal(model.personalBanks[0].id,`personal_bank_${decree.id}`);assert.equal(model.banks.length,2);
  assert.equal(model.personalBanks[0].displayName,'Minha cópia pessoal');assert.equal(model.systemBanks[0].displayName,'Meu decreto nativo');
  assert.equal(model.answers[0].key,`personal_bank_${key}`);assert.equal(model.answers[1].key,key);
  assert.equal(model.sessions[0].queue[0],`personal_bank_${key}`);
  assert.equal(model.sessions[0].questionSources[`personal_bank_${key}`].bankId,`personal_bank_${decree.id}`);
  assert.equal(derive(events,Date.now(),[]).personalBanks[0].id,model.personalBanks[0].id);
});

test('cópia pessoal de um ID nativo no limite de tamanho continua importável e exportável',()=>{
  const id='decreto-'+ 'x'.repeat(112),decree=validateSystemBank({...native,id,name:'Decreto de teste'});
  const copy=preparePersonalBank(decree,new Set([id]));assert.equal(validateBank(copy).id,`personal_bank_${id}`);
  assert.equal(validateEvents({schemaVersion:1,events:[event('copy','bank',{bank:copy})]})[0].bank.id,copy.id);
  assert.throws(()=>validateSystemBank({...native,id:'x'.repeat(121)}),/ID do banco/);
});

test('remoção do catálogo mantém o ID pessoal usado antes, mesmo sem estudo ou snapshot do Sistema',async()=>{
  const decree=validateSystemBank({...native,id:'decreto-12345',name:'Decreto de teste'}),own=new Store(new TemporaryStorage());
  await own.add([{type:'bank',bank:validateBank(decree)}]);own.setSystemBanks([decree]);
  const q=own.model().questions.find(q=>q.sourceType==='personal'),session=createSession([q.key]);session.questionSources={[q.key]:questionSource(q)};
  await own.add(chooseAnswer(session,q,q.correctOption).events);
  own.setSystemBanks([]);const model=own.model();
  assert.equal(model.personalBanks[0].id,'personal_bank_decreto-12345');assert.equal(model.stats.attempts,1);
  assert.equal(model.progress.get(q.key).correct,1);assert.equal(model.sessions[0].queue[0],q.key);
  assert.equal(preparePersonalBank(validateBank(decree),model.systemBankIds).id,model.personalBanks[0].id);
});

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
  const html=bankCardView({...native,enabled:true},{detailsOpen:true});assert(!html.includes('data-action="bank-delete"'));assert(html.includes('data-action="bank-rename"'));assert(html.includes('bank-source system'));
  const renamed={...personal,enabled:true,displayName:'<script>meu nome</script>'},own=bankCardView(renamed,{detailsOpen:true});assert(own.includes('data-action="bank-rename"'));assert(own.includes('&lt;script&gt;'));assert(!own.includes('<script>'));
  const setup=sessionSetupView({banks:[native,renamed],modes:{smart:['Estudo','Pratique']}});assert(setup.includes('bank-source system'));assert(setup.includes('bank-source personal'));
  assert.throws(()=>validateEvents({schemaVersion:1,events:[event('delete','system-bank-state',{bankId:native.id,value:'deleted'})]}),/Estado/);
});

test('desativação publicada impede novas filas e preserva sessões, resultados, favoritos e preferências pessoais',async()=>{
  const store=new Store(new TemporaryStorage());store.setSystemBanks([native]);await store.add([{type:'bank',bank:personal},{type:'bank-state',bankId:personal.id,value:'disabled'},{type:'system-bank-state',bankId:native.id,value:'disabled'}]);
  assert.equal(store.model().systemBanks[0].enabled,true);
  const q=store.model().questions.find(q=>q.sourceType==='system'),session=createSession([q.key]);
  session.questionSources={[q.key]:questionSource(q)};
  await store.add([{type:'session',session},{type:'flag',key:q.key,flag:'favorite',value:true}]);
  const before=JSON.stringify(store.events);
  store.setSystemBanks([validateSystemBank({...native,active:false})]);
  const model=store.model();
  assert.equal(model.systemBanks[0].enabled,false);assert.equal(model.personalBanks[0].enabled,false);
  assert.equal(model.questions.some(q=>q.enabled),false);
  assert.equal(model.sessions[0].id,session.id);assert.equal(sessionQuestion(model,session,q.key).statement,q.statement);
  assert(model.flags.get(q.key).favorite);assert.equal(JSON.stringify(store.events),before);
  store.setSystemBanks([validateSystemBank({...native,active:true})]);assert.equal(store.model().systemBanks[0].enabled,true);
});

test('uma cópia histórica pessoal não substitui a questão oficial da revisão atualmente publicada',()=>{
  const forged=structuredClone(native);forged.questions[0].statement='Conteúdo forjado';
  const model=derive([event('forged-snapshot','system-bank-snapshot',{bank:forged,revision:native.revision})],Date.now(),[native]),q=model.questions[0],session=createSession([q.key]);session.questionSources={[q.key]:questionSource(q)};
  assert.equal(sessionQuestion(model,session,q.key).statement,native.questions[0].statement);
});
