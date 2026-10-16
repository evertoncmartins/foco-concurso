import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Store} from '../src/store.mjs';
import {TemporaryStorage} from '../src/temporary-storage.mjs';
import {AccountStorage} from '../src/account.mjs';
import {validateBank,validateEvents,derive,mergeEvents} from '../src/engine.mjs';
import {createSession,chooseAnswer,moveSession,completeSession} from '../src/session.mjs';

const bank=validateBank(JSON.parse(await readFile(new URL('./fixtures/lei-8112.json',import.meta.url))));
async function fixture(storage=new TemporaryStorage()){
  const store=new Store(storage);await store.add([{type:'bank',bank}]);
  const questions=store.model().questions.slice(0,2),originalSession=createSession(questions.map(q=>q.key));
  await store.add([{type:'session',session:originalSession}]);
  let result=chooseAnswer(originalSession,questions[0],questions[0].correctOption);await store.add(result.events);
  const moved=moveSession(result.session,1);await store.add(moved.events);
  result=chooseAnswer(moved.session,questions[1],questions[1].options.find(o=>o.id!==questions[1].correctOption).id);await store.add(result.events);
  await store.add([{type:'flag',key:questions[0].key,flag:'favorite',value:true},{type:'flag',key:questions[1].key,flag:'review',value:true}]);
  return {store,originalSession,questions};
}
function zero(store){const m=store.model();for(const k of ['attempts','correct','wrong','accuracy','answered','errors','favorites','review'])assert.equal(m.stats[k],0,k);assert.equal(m.flags.size,0);assert.equal(m.progress.size,0);assert.equal(m.sessions.length,0);assert.equal(m.answers.length,0);return m;}

test('reinício zera toda a progressão e preserva bancos, ativação, perfil, preferências e outra conta',async()=>{
  const base=new TemporaryStorage(),own=new AccountStorage(base,'test-alpha'),other=new AccountStorage(base,'test-beta');
  own.setItem('foco:config',JSON.stringify({name:'Pessoa de teste',photo:'foto-teste',theme:'dark',dailyGoal:25,folderId:'pasta-teste'}));
  const a=await fixture(own),b=await fixture(other);await a.store.add([{type:'bank-state',bankId:bank.id,value:'disabled'}]);
  const config=own.getItem('foco:config'),foreign=JSON.stringify(b.store.export().events),beforeBanks=a.store.model().banks;
  await a.store.resetProgress();const m=zero(a.store);
  assert.deepEqual(m.banks,beforeBanks);assert.equal(m.questions.length,bank.questions.length);assert.equal(m.stats.pending,bank.questions.length);
  assert.equal(own.getItem('foco:config'),config);assert.equal(JSON.stringify(new Store(other).export().events),foreign);assert.equal(a.store.export().owner.subject,'test-alpha');
  assert(m.progressEpoch);assert(a.store.events.some(e=>e.type==='progress-reset'));
});

test('nova sessão começa do zero, registra respostas e sobrevive à exportação, recarga e restauração',async()=>{
  const {store,questions}=await fixture();await store.resetProgress();
  const epoch=store.model().progressEpoch,s=createSession([questions[0].key],'smart',undefined,undefined,epoch);
  await store.add([{type:'session',session:s}]);await store.add(chooseAnswer(s,questions[0],questions[0].correctOption).events);
  assert.equal(store.model().stats.attempts,1);assert.equal(store.model().stats.correct,1);
  const reloaded=new Store(store.storage),restored=new Store(new TemporaryStorage());await restored.merge(validateEvents(reloaded.export()));
  assert.equal(restored.model().progressEpoch,epoch);assert.equal(restored.model().stats.attempts,1);assert.deepEqual(restored.model().banks,store.model().banks);
});

test('backup e eventos offline antigos não reativam progresso nem com relógio futuro',async()=>{
  const {store,questions}=await fixture(),backup=store.export();await store.resetProgress();
  await store.merge(validateEvents(backup));
  const old=backup.events.find(e=>e.type==='answer');
  await store.merge([{...old,id:'future-old-answer',at:'2099-01-01T00:00:00.000Z'},
    {id:'future-old-flag',at:'2099-01-01T00:00:00.000Z',type:'flag',key:questions[0].key,flag:'favorite',value:true}]);
  zero(store);
});

test('relógio futuro de uma etapa aposentada não desloca as datas dos novos estudos',async()=>{
  const {store,questions}=await fixture();
  await store.merge([{id:'old-future',at:'2099-01-01T00:00:00.000Z',type:'flag',key:questions[0].key,flag:'favorite',value:true}]);
  const now=Date.now();await store.resetProgress();
  assert(Date.parse(store.events.find(e=>e.type==='progress-reset').at)<now+10000);
  const s=createSession([questions[0].key],'smart',undefined,undefined,store.model().progressEpoch);
  await store.add(chooseAnswer(s,questions[0],questions[0].correctOption).events);
  const answer=store.model().answers[0];assert(Date.parse(answer.at)>=now);assert(Date.parse(answer.at)<now+10000);
});

test('sessão anterior ao reset é recusada antes de gravar respostas, navegação ou marcações',async()=>{
  const {store,originalSession,questions}=await fixture();await store.resetProgress();const before=JSON.stringify(store.events);
  for(const events of [chooseAnswer(originalSession,questions[0],questions[0].correctOption).events,moveSession(originalSession,1).events,[{type:'flag',key:questions[0].key,flag:'favorite',value:true,progressEpoch:null}]]){
    await assert.rejects(()=>store.add(events),{code:'PROGRESS_RESET'});assert.equal(JSON.stringify(store.events),before);
  }
  zero(store);
});

test('resets simultâneos e importações em ordens distintas convergem para uma única etapa ativa',async()=>{
  const {store}=await fixture(),other=new Store(new TemporaryStorage());await other.merge(store.events);
  await Promise.all([store.resetProgress(),other.resetProgress()]);
  const left=mergeEvents(store.events,other.events),right=mergeEvents(other.events,store.events);
  assert.deepEqual(left,right);assert.equal(derive(left).progressEpoch,derive(right).progressEpoch);
  await store.merge(other.events);await other.merge(store.events);zero(store);zero(other);
  assert.equal(store.model().progressEpoch,other.model().progressEpoch);
});

test('segundo reset retira a etapa anterior e permite um simulado novo, sem respostas antigas',async()=>{
  const {store,questions}=await fixture();await store.resetProgress();
  const firstEpoch=store.model().progressEpoch,s=createSession([questions[0].key],'smart',undefined,undefined,firstEpoch);
  await store.add(chooseAnswer(s,questions[0],questions[0].correctOption).events);const retired=store.export();
  await store.resetProgress();assert.notEqual(store.model().progressEpoch,firstEpoch);await store.merge(validateEvents(retired));zero(store);
  const exam=createSession([questions[0].key],'exam',undefined,undefined,store.model().progressEpoch),chosen=chooseAnswer(exam,questions[0],questions[0].correctOption);
  await store.add(chosen.events);assert.equal(store.model().stats.attempts,0);
  await store.add(completeSession(chosen.session,questions).events);assert.equal(store.model().stats.attempts,1);assert.equal(store.model().stats.correct,1);
});

test('falha de armazenamento no reset preserva todo o progresso original',async()=>{
  const {store}=await fixture(),before=JSON.stringify(store.events),save=store.storage.setItem.bind(store.storage);
  store.storage.setItem=()=>{throw new DOMException('quota','QuotaExceededError');};
  await assert.rejects(()=>store.resetProgress(),{name:'QuotaExceededError'});store.storage.setItem=save;
  assert.equal(JSON.stringify(new Store(store.storage).events),before);assert.equal(store.model().stats.attempts,2);
});

test('reset que chega durante uma gravação impede a sessão antiga de continuar',async()=>{
  const {store,originalSession,questions}=await fixture(),other=new Store(store.storage),merge=store.merge.bind(store);
  store.merge=async events=>{await other.resetProgress();return merge(events);};
  await assert.rejects(()=>store.add(chooseAnswer(originalSession,questions[0],questions[0].correctOption).events),{code:'PROGRESS_RESET'});
  zero(new Store(store.storage));
});

test('etapas malformadas e sessão com identificadores divergentes são recusadas',()=>{
  const event={id:'r',type:'progress-reset',at:'2026-10-14T22:00:00.000Z'};
  assert.equal(validateEvents({schemaVersion:1,events:[event]})[0].type,'progress-reset');
  assert.throws(()=>validateEvents({schemaVersion:1,events:[{...event,progressEpoch:{}}]}),/Etapa/);
  assert.throws(()=>validateEvents({schemaVersion:1,events:[{...event,type:'session',progressEpoch:'other',session:createSession(['bank:q'],'smart','s',undefined,'reset')}]}),/inconsistente/);
});
