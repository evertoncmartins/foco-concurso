import test from 'node:test';
import assert from 'node:assert/strict';
import {SessionWrites} from '../src/session-writes.mjs';
import {Store} from '../src/store.mjs';
import {AccountStorage} from '../src/account.mjs';
import {TemporaryStorage} from '../src/temporary-storage.mjs';
import {createSession,moveSession,chooseAnswer} from '../src/session.mjs';
import {validateEvents} from '../src/engine.mjs';

async function setup(count=25,mode='smart'){
  const base=new TemporaryStorage(),storage=new AccountStorage(base,'test-account'),store=new Store(storage);
  const session=createSession(Array.from({length:count},(_,i)=>`test:q${i}`),mode);
  session.questionSources=Object.fromEntries(session.queue.map(key=>[key,{bankId:'test',sourceType:'personal',displayName:'Teste'}]));
  await store.add([{type:'session',session}]);
  const writes=new SessionWrites(store,{delay:60000});
  return {base,storage,store,session,writes};
}
const q={key:'test:q0',options:[{id:'A'},{id:'B'}],correctOption:'A',discipline:'D',subject:'S',topic:'T'};

test('500 navegações rápidas em uma sessão de 5.000 questões conservam ordem, fontes e tentativas',async()=>{
  const {store,writes,session:initial}=await setup(5000);let session=initial;
  for(let i=0;i<500;i++){const result=moveSession(session,i<300?1:-1);writes.enqueue(result.events);session=result.session;}
  assert.equal(session.index,100);assert.equal(store.model().sessions[0].index,0);
  await writes.flush();assert.equal(store.model().sessions[0].index,100);assert.equal(store.model().stats.attempts,0);
  assert.deepEqual(store.model().sessions[0].questionSources,initial.questionSources);await writes.close();
});

test('transação lenta aceita novas ações e grava o estado mais recente em ordem',async()=>{
  const {store,writes,session}=await setup();let release;
  const original=store.add.bind(store);let first=true;
  store.add=async events=>{if(first){first=false;await new Promise(resolve=>release=resolve);}return original(events);};
  const next=moveSession(session,1);writes.enqueue(next.events);const saving=writes.flush();
  const back=moveSession(next.session,-1);writes.enqueue(back.events);assert.equal(writes.pending.length,2);
  release();await saving;assert.equal(store.model().sessions[0].index,0);assert.equal(writes.pending.length,0);await writes.close();
});

test('recarga recupera seleção, cortes e resposta com os mesmos IDs, sem duplicar registros',async()=>{
  const {storage,store,writes,session}=await setup();
  const draft={...session,drafts:{[q.key]:'B'},eliminatedOptions:{[q.key]:['A']}};
  writes.enqueue([{type:'session',session:draft}]);
  writes.enqueue(chooseAnswer(draft,q,'B').events);await writes.close();
  const restored=new Store(storage);await SessionWrites.recover(restored);
  assert.equal(restored.model().sessions[0].answers[q.key],'B');assert.deepEqual(restored.model().sessions[0].eliminatedOptions[q.key],['A']);assert.equal(restored.model().stats.attempts,1);
  const events=JSON.stringify(restored.events);await SessionWrites.recover(restored);assert.equal(JSON.stringify(restored.events),events);
  assert.equal(storage.keys().filter(key=>key.startsWith('foco:session-outbox:')).length,0);
});

test('falha da transação preserva a cópia recuperável e permite repetir sem duplicar resposta',async()=>{
  const {storage,store,writes,session}=await setup(),original=store.add.bind(store),statuses=[];writes.onStatus=status=>statuses.push(status);
  writes.enqueue(chooseAnswer(session,q,'A').events);store.add=async()=>{throw new Error('Disco indisponível');};
  await assert.rejects(writes.flush(),/Disco/);assert.equal(statuses.at(-1),'error');assert(storage.keys().some(key=>key.startsWith(writes.key)));assert.equal(store.model().stats.attempts,0);
  store.add=original;await writes.flush();assert.equal(store.model().stats.attempts,1);assert.equal(statuses.at(-1),'saved');assert.equal(storage.keys().some(key=>key.startsWith(writes.key)),false);await writes.close();
});

test('falha ao limpar a recuperação após commit é idempotente na reabertura',async()=>{
  const {storage,store,writes,session}=await setup(),remove=storage.removeItem.bind(storage);
  writes.enqueue(chooseAnswer(session,q,'A').events);storage.removeItem=()=>{throw new Error('Falha de limpeza');};
  await assert.rejects(writes.flush(),/limpeza/);assert.equal(store.model().stats.attempts,1);await writes.close();storage.removeItem=remove;
  const before=store.events.length,restored=new Store(storage);await SessionWrites.recover(restored);
  assert.equal(restored.model().stats.attempts,1);assert.equal(restored.events.length,before);
});

test('outra conta não lê nem envia operações pendentes',async()=>{
  const {base,storage,writes,session}=await setup();writes.enqueue(chooseAnswer(session,q,'A').events);await writes.close();
  const other=new Store(new AccountStorage(base,'other-account'));await SessionWrites.recover(other);assert.equal(other.events.length,0);assert(storage.keys().some(key=>key.startsWith(writes.key)));
});

test('reset e exclusão superam a recuperação de ações antigas',async()=>{
  for(const reset of [true,false]){
    const {storage,store,writes,session}=await setup();writes.enqueue(chooseAnswer(session,q,'A').events);await writes.close();
    if(reset)await store.resetProgress();else await store.deleteSession(session.id);
    const restored=new Store(storage);await SessionWrites.recover(restored);assert.equal(restored.model().stats.attempts,0);assert.equal(restored.model().sessions.length,0);assert.equal(storage.keys().some(key=>key.startsWith(writes.key)),false);
  }
});

test('cota local recusa a ação antes de aceitar um estado que não pode ser recuperado',async()=>{
  const {storage,store,writes,session}=await setup();storage.setItem=()=>{throw new DOMException('Quota','QuotaExceededError');};
  assert.throws(()=>writes.enqueue(moveSession(session,1).events),{name:'QuotaExceededError'});assert.equal(writes.pending.length,0);assert.equal(store.model().sessions[0].index,0);await writes.close();
});

test('simulado recuperado não emite gabarito nem pontuação antes de concluir',async()=>{
  const {storage,writes,session}=await setup(25,'exam');writes.enqueue(chooseAnswer(session,q,'B').events);await writes.close();
  const restored=new Store(storage);await SessionWrites.recover(restored);assert.equal(restored.model().stats.attempts,0);assert.equal(restored.model().sessions[0].answers[q.key],'B');
});

test('rascunhos de outras questões e cortes inválidos são recusados sem alterar o diário',()=>{
  const session=createSession(['test:q0']);
  for(const patch of [{drafts:{'other:q':'A'}},{eliminatedOptions:{'test:q0':['Z']}},{eliminatedOptions:{'test:q0':['A','A']}}]){
    assert.throws(()=>validateEvents({schemaVersion:1,events:[{id:'bad',at:'2026-11-23T12:00:00.000Z',type:'session',session:{...session,...patch}}]}),/Rascunho/);
  }
});
