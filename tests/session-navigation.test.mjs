import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.mjs';
import {TemporaryStorage} from '../src/temporary-storage.mjs';
import {validateEvents} from '../src/engine.mjs';
import {createSession,chooseAnswer,moveSession,completeSession} from '../src/session.mjs';

const questions=Array.from({length:3},(_,i)=>({key:`bank:q${i}`,options:[{id:'A'},{id:'B'}],correctOption:'A',discipline:'Disciplina',subject:'Assunto',topic:'Tópico'}));

test('navegação anda ±1, respeita limites e não registra nem apaga respostas',()=>{
  const session=createSession(questions.map(q=>q.key));
  assert.equal(moveSession(session,-1).events.length,0);assert.equal(session.index,0);
  let result=moveSession(session,1);assert.equal(result.session.index,1);assert.deepEqual(result.session.answers,{});assert(result.events.every(e=>e.type==='session'));
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
