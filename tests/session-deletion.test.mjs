import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Store} from '../src/store.mjs';
import {TemporaryStorage} from '../src/temporary-storage.mjs';
import {AccountStorage} from '../src/account.mjs';
import {createSession,chooseAnswer,completeSession} from '../src/session.mjs';
import {derive,validateEvents} from '../src/engine.mjs';
import {reconcileEvents} from '../src/event-conflicts.mjs';
import {sessionLibrary,sessionReport,sessionsView} from '../src/sessions-view.mjs';
const bank=JSON.parse(await readFile(new URL('./fixtures/lei-8112.json',import.meta.url)));
async function setup(storage=new TemporaryStorage()){
  const store=new Store(storage);await store.add([{type:'bank',bank}]);const q=store.model().questions[0];
  let active=createSession([q.key],'smart','active'),done=createSession([q.key],'exam','done');
  let next=chooseAnswer(active,q,q.correctOption);active=next.session;await store.add(next.events);
  next=chooseAnswer(done,q,q.correctOption);done=next.session;await store.add(next.events);next=completeSession(done,[q]);done=next.session;await store.add(next.events);
  await store.add([{type:'flag',key:q.key,flag:'favorite',value:true}]);return {store,q,active,done};
}
test('exclusão individual de sessão ativa e concluída preserva respostas, bancos, marcas e outras sessões',async()=>{
  const {store,active,done}=await setup(),before=store.export(),stats=store.model().stats;
  assert(sessionsView(store.model(),{status:'open'}).includes('data-action="session-delete"'));
  assert.equal(await store.deleteSession(active.id),true);assert.deepEqual(store.model().sessions.map(s=>s.id),[done.id]);assert.equal(sessionLibrary(store.model()).open,0);assert.equal(sessionReport(done,store.model()).correct,1);
  assert.deepEqual(store.model().stats,stats);assert.equal(store.model().flags.size,1);assert.equal(store.model().banks.length,1);
  for(const e of before.events)assert.deepEqual(store.events.find(x=>x.id===e.id),e);
  await store.deleteSession(done.id);assert.equal(store.model().sessions.length,0);assert.deepEqual(store.model().stats,stats);const count=store.events.length;assert.equal(await store.deleteSession(done.id),false);assert.equal(store.events.length,count);
});
test('reabrir, restaurar backup antigo e receber conclusão tardia não ressuscitam a sessão excluída',async()=>{
  const {store,active}=await setup(),backup=store.export(),late={id:'late-state',at:'2099-01-01T00:00:00.000Z',type:'session',session:{...active,completed:true,completedAt:'2099-01-01T00:00:00.000Z'}};
  await store.deleteSession(active.id);await store.merge([...validateEvents(backup),late]);assert(!store.model().sessions.some(s=>s.id===active.id));assert.equal(store.model().stats.attempts,2);
  const copy=new Store(new TemporaryStorage());await copy.merge(validateEvents(store.export()));assert(copy.model().deletedSessions.has(active.id));assert(!copy.model().sessions.some(s=>s.id===active.id));
  assert.deepEqual(new Store(store.storage).model().sessions,store.model().sessions);
});
test('aba antiga não pode registrar novas respostas ou retomar sessão já excluída',async()=>{
  const {store,active,q}=await setup();await store.deleteSession(active.id);const before=JSON.stringify(store.events);
  await assert.rejects(store.add([{type:'session',session:active}]),{code:'SESSION_DELETED'});
  const otherQuestion={...q,key:'another:q'};const next=chooseAnswer(createSession([otherQuestion.key],'smart',active.id),otherQuestion,q.correctOption);
  await assert.rejects(store.add(next.events),{code:'SESSION_DELETED'});assert.equal(JSON.stringify(store.events),before);
});
test('colisões de ID preservam a exclusão mesmo com snapshot futuro de outra aba',async()=>{
  const {store,active}=await setup();await store.deleteSession(active.id);const deletion=store.events.find(e=>e.type==='session'&&e.session.deleted),other={...deletion,at:'2099-01-01T00:00:00.000Z',session:active};
  const combined=await reconcileEvents([deletion],[other]);assert.equal(combined.find(e=>e.id===deletion.id).session.deleted,true);assert(derive(combined).deletedSessions.has(active.id));
  assert.deepEqual(await reconcileEvents([other],[deletion]),combined);
});
test('falha de armazenamento mantém sessão e histórico anteriores',async()=>{
  const base=new TemporaryStorage(),{store,active}=await setup(base),before=JSON.stringify(store.events);base.setItem=()=>{throw new DOMException('full','QuotaExceededError');};
  await assert.rejects(store.deleteSession(active.id),{name:'QuotaExceededError'});assert.equal(JSON.stringify(store.events),before);assert(store.model().sessions.some(s=>s.id===active.id));
});
test('exclusão pertence só à conta atual e não reativa sessões depois de zerar progresso',async()=>{
  const base=new TemporaryStorage(),one=await setup(new AccountStorage(base,'111')),two=await setup(new AccountStorage(base,'222'));
  await one.store.deleteSession(one.active.id);assert.equal(two.store.model().sessions.length,2);assert.equal(two.store.model().deletedSessions.size,0);
  const old=one.store.export();await one.store.resetProgress();await one.store.merge(validateEvents(old));assert.equal(one.store.model().sessions.length,0);assert.equal(one.store.model().stats.attempts,0);
  const fresh=createSession([one.q.key],'smart',one.active.id,undefined,one.store.model().progressEpoch);await one.store.add([{type:'session',session:fresh}]);assert.equal(one.store.model().sessions.length,1);
});
test('exclusão malformada é recusada, e snapshots pessoais anteriores continuam válidos',async()=>{
  const {store,active}=await setup();const raw=store.events.find(e=>e.type==='session');
  for(const deleted of [false,'true',1])assert.throws(()=>validateEvents({schemaVersion:1,events:[{...raw,session:{...active,deleted,abandoned:true}}]}),/Exclusão/);
  assert.throws(()=>validateEvents({schemaVersion:1,events:[{...raw,session:{...active,deleted:true}}]}),/Exclusão/);assert.doesNotThrow(()=>validateEvents({schemaVersion:1,events:[raw]}));
});
