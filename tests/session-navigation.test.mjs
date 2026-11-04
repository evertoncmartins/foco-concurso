import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.mjs';
import {TemporaryStorage} from '../src/temporary-storage.mjs';
import {validateEvents} from '../src/engine.mjs';
import {createSession,chooseAnswer,moveSession,jumpSession,completeSession} from '../src/session.mjs';
import {sessionQuestionStates,nextSkippedIndex,sessionQuestionListView,sessionNavigationView} from '../src/session-navigator.mjs';

const questions=Array.from({length:3},(_,i)=>({key:`bank:q${i}`,options:[{id:'A'},{id:'B'}],correctOption:'A',discipline:'Disciplina',subject:'Assunto',topic:'Tópico'}));

test('navegação anda ±1, respeita limites e não registra nem apaga respostas',()=>{
  const session=createSession(questions.map(q=>q.key));
  assert.equal(moveSession(session,-1).events.length,0);assert.equal(session.index,0);
  let result=moveSession(session,1);assert.equal(result.session.index,1);assert.deepEqual(result.session.answers,{[questions[0].key]:null});assert(result.events.every(e=>e.type==='session'));
  result=chooseAnswer(result.session,questions[1],'B');
  const answers=structuredClone(result.session.answers),before=result.session;
  result=moveSession(before,-1);assert.equal(result.session.index,0);assert.deepEqual(result.session.answers,answers);assert.equal(before.index,1);
  result=moveSession(moveSession(result.session,1).session,1);assert.equal(result.session.index,2);
  assert.equal(moveSession(result.session,1).events.length,0);assert(!result.session.completed);
  assert.throws(()=>moveSession(session,2),/uma questão/);assert.throws(()=>moveSession(session,0),/uma questão/);
});

test('ir e voltar, pausar e restaurar conserva o progresso sem contar novamente',async()=>{
  const store=new Store(new TemporaryStorage());let session=createSession(questions.map(q=>q.key));
  await store.add([{type:'session',session}]);
  let result=chooseAnswer(session,questions[0],'A');await store.add(result.events);session=result.session;
  for(const direction of [1,1,-1,-1]){result=moveSession(session,direction);await store.add(result.events);session=result.session;}
  assert.equal(session.index,0);assert.equal(store.model().stats.correct,1);assert.equal(store.model().stats.attempts,1);
  assert.throws(()=>chooseAnswer(session,questions[0],'B'),/já/);
  const restored=new Store(new TemporaryStorage());await restored.merge(validateEvents(store.export()));
  assert.equal(restored.model().sessions[0].index,0);assert.equal(restored.model().sessions[0].answers[questions[0].key],'A');assert.equal(restored.model().stats.attempts,1);
});

test('conclusão é explícita, conserva não respondidas e não duplica tentativas no estudo',async()=>{
  const store=new Store(new TemporaryStorage());let result=chooseAnswer(createSession(questions.map(q=>q.key)),questions[0],'A');await store.add(result.events);
  result=completeSession(result.session,questions,'2026-10-14T03:00:00.000Z');await store.add(result.events);
  assert(result.session.completed);assert.equal(result.session.index,3);assert.equal(result.session.answers[questions[1].key],null);
  assert.equal(store.model().stats.attempts,1);assert.equal(result.events.filter(e=>e.type==='answer').length,0);
  assert.throws(()=>completeSession(result.session,questions),/concluída/);assert.throws(()=>moveSession(result.session,-1),/concluída/);
});

test('simulado permite ir e voltar sem resultados e só emite respostas ao concluir',async()=>{
  const store=new Store(new TemporaryStorage());let session=createSession(questions.map(q=>q.key),'exam');
  let result=chooseAnswer(session,questions[0],'A');await store.add(result.events);session=result.session;
  result=moveSession(session,1);await store.add(result.events);
  result=chooseAnswer(result.session,questions[1],'B');await store.add(result.events);
  result=moveSession(result.session,-1);await store.add(result.events);assert.equal(store.model().stats.attempts,0);
  result=completeSession(result.session,questions);await store.add(result.events);
  assert.equal(result.events.filter(e=>e.type==='answer').length,2);assert.equal(store.model().stats.correct,1);assert.equal(store.model().stats.wrong,1);
  assert.equal(result.session.answers[questions[2].key],null);assert.throws(()=>completeSession(result.session,questions),/concluída/);
});

test('sessões antigas com perguntas puladas podem voltar e registrar a resposta',()=>{
  const session=createSession(questions.map(q=>q.key));session.index=1;session.answers[questions[0].key]=null;
  const back=moveSession(session,-1).session,result=chooseAnswer(back,questions[0],'A');
  assert.equal(result.session.answers[questions[0].key],'A');assert.equal(result.events.filter(e=>e.type==='answer').length,1);
});

test('lista distingue puladas, pendentes, acertos e erros usando somente a tentativa desta sessão',()=>{
  const session=createSession(['q1','q2','q3','q4','q5']);
  session.answers={q1:'A',q2:'B',q3:null,q4:'A'};
  const answers=[{sessionId:session.id,key:'q1',correctOption:'A'},{sessionId:session.id,key:'q2',correctOption:'A'},{sessionId:'outra',key:'q4',correctOption:'B'}];
  const states=sessionQuestionStates(session,answers);
  assert.deepEqual(states.map(q=>q.status),['correct','wrong','skipped','answered','pending']);
  assert.equal(states.filter(q=>q.current).length,1);
  assert.equal(nextSkippedIndex(session),2);
  const html=sessionQuestionListView(session,answers,()=>'<Tema & assunto>');
  for(const status of ['Acerto','Erro','Pulada','Respondida','Pendente'])assert(html.includes(status));
  assert.equal((html.match(/data-action="jump-question"/g)||[]).length,5);
  assert(html.includes('&lt;Tema &amp; assunto&gt;'));assert(!html.includes('<Tema'));
  assert(html.includes('aria-current="step"'));
});

test('atalho percorre puladas em ordem circular e as remove ao registrar uma resposta',()=>{
  let session=createSession(['q1','q2','q3','q4']);
  assert.equal(nextSkippedIndex(session),-1);assert.match(sessionNavigationView(session),/disabled/);
  session=jumpSession(session,2).session; // Apenas q1 foi visitada; q2 continua pendente.
  assert.deepEqual(sessionQuestionStates(session).map(q=>q.status),['skipped','pending','pending','pending']);
  session=jumpSession(session,3).session;
  assert.equal(nextSkippedIndex(session),0);
  session=jumpSession(session,nextSkippedIndex(session)).session;
  assert.equal(nextSkippedIndex(session),2);
  session=chooseAnswer(session,{...questions[0],key:'q1'},'A').session;
  assert.equal(session.answers.q1,'A');assert.equal(nextSkippedIndex(session),2);
  assert.match(sessionNavigationView(session),/<strong>2<\/strong>/);
});

test('salto preserva rascunhos registrados, origens e etapa; recarga e mesclagem conservam puladas sem tentativas extras',async()=>{
  const store=new Store(new TemporaryStorage());
  let session=createSession(questions.map(q=>q.key),'smart','navigation','2026-11-04T12:00:00Z');
  session.questionSources=Object.fromEntries(session.queue.map(key=>[key,{bankId:'bank',sourceType:'system',displayName:'Lei nº 1/2026'}]));
  const original=structuredClone(session);
  let result=jumpSession(session,2);assert.deepEqual(session,original);await store.add(result.events);
  result=chooseAnswer(result.session,questions[2],'B');await store.add(result.events);
  result=jumpSession(result.session,0);await store.add(result.events);
  const restored=new Store(new TemporaryStorage());await restored.merge(validateEvents(store.export()));
  session=restored.model().sessions[0];
  assert.equal(session.index,0);assert.deepEqual(session.answers,{[questions[0].key]:null,[questions[2].key]:'B'});
  assert.deepEqual(session.questionSources,original.questionSources);assert.equal(restored.model().stats.attempts,1);
  assert.equal(jumpSession(session,0).events.length,0);
  for(const index of [-1,3,1.5,NaN,'1'])assert.throws(()=>jumpSession(session,index),/válida/);
  assert.throws(()=>jumpSession({...session,completed:true},1),/concluída/);
});

test('simulado mantém acertos e erros ocultos na lista e nas legendas até a conclusão',async()=>{
  const store=new Store(new TemporaryStorage());
  let result=chooseAnswer(createSession(questions.map(q=>q.key),'exam'),questions[0],'A');await store.add(result.events);
  result=jumpSession(result.session,1);await store.add(result.events);
  result=chooseAnswer(result.session,questions[1],'B');await store.add(result.events);
  const premature=[{sessionId:result.session.id,key:questions[0].key,correctOption:'A'}];
  assert.deepEqual(sessionQuestionStates(result.session,premature).map(q=>q.status),['answered','answered','pending']);
  const html=sessionQuestionListView(result.session,premature);
  assert(!/is-correct|is-wrong|Acerto:|Erro:/.test(html));assert(html.includes('Respondida: 2'));
  assert.equal(store.model().stats.attempts,0);
  result=completeSession(result.session,questions);await store.add(result.events);
  assert.deepEqual(sessionQuestionStates(result.session,store.model().answers).map(q=>q.status),['correct','wrong','skipped']);
  assert.equal(store.model().stats.attempts,2);
});
