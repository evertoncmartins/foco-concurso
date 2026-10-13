import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateBank,validateEvents,mergeEvents,derive,canonicalJSON} from '../src/engine.mjs';
import {reconcileEvents,coversEvents} from '../src/event-conflicts.mjs';
import {Store} from '../src/store.mjs';

class MemoryStorage{data=new Map();get length(){return this.data.size;}key(i){return [...this.data.keys()][i]??null;}getItem(key){return this.data.get(key)??null;}setItem(key,value){this.data.set(key,String(value));}removeItem(key){this.data.delete(key);}}
const bank=validateBank(JSON.parse(await readFile(new URL('../src/lei-8112.json',import.meta.url))));
const seed={id:'builtin-lei-8112-v1',at:'2026-10-08T00:00:00.000Z',type:'bank',bank};
const flag=(value,at='2026-10-08T12:00:00.000Z')=>({id:'same-flag',at,type:'flag',key:'bank:q1',flag:'favorite',value});
const answer=(selected,at)=>({id:'answer-session-bank:q1',at,type:'answer',key:'bank:q1',sessionId:'session',selected,correctOption:'A',correct:selected==='A',discipline:'Legislação',subject:'Lei',topic:'Direitos'});
const originals=events=>events.filter(event=>event.type==='event-conflict').map(event=>event.event);

test('ordem dos campos JSON não cria conflito nem registros extras',async()=>{
  const first=flag(true),reordered=Object.fromEntries(Object.entries(first).reverse());
  assert.equal(mergeEvents([first],[reordered]).length,1);
  assert.equal((await reconcileEvents([first],[reordered])).length,1);
  const storage=new MemoryStorage(),store=new Store(storage);await store.merge([first]);await store.merge([reordered]);
  assert.equal(new Store(storage).events.length,1);
});

test('normalização de bancos antigos não duplica o banco inicial',async()=>{
  const older=structuredClone(seed);delete older.bank.description;
  const normalized={...seed,bank:{...seed.bank,description:''}};
  const result=await reconcileEvents([older],[normalized]);assert.equal(result.length,1);assert.equal(derive(result).banks.length,1);
});

test('respostas divergentes da mesma tentativa são preservadas e contadas uma vez',async()=>{
  const first=answer('A','2026-10-08T12:00:00.000Z'),later=answer('B','2026-10-08T12:01:00.000Z');
  const result=await reconcileEvents([first],[later]);
  assert.deepEqual(result.find(event=>event.type==='answer'),first);
  assert.equal(derive(result).stats.attempts,1);assert.equal(derive(result).stats.correct,1);
  assert.equal(originals(result).length,2);assert(coversEvents(result,[first,later]));
});

test('reenvio da mesma resposta com outro horário não infla desempenho',async()=>{
  const result=await reconcileEvents([answer('A','2026-10-08T12:00:00.000Z')],[answer('A','2026-10-08T12:00:01.000Z')]);
  assert.equal(derive(result).stats.attempts,1);assert.equal(originals(result).length,2);
});

test('bancos, marcações e sessões usam a versão recente e conservam as anteriores',async()=>{
  const oldBank=seed,newBank={...seed,at:'2026-10-09T00:00:00.000Z',bank:{...bank,name:'Nome atualizado'}};
  const oldSession={id:'same-session',at:'2026-10-08T12:00:00.000Z',type:'session',session:{id:'session',queue:['bank:q1'],index:0,answers:{},mode:'smart',completed:false}};
  const newSession={...oldSession,at:'2026-10-08T12:01:00.000Z',session:{...oldSession.session,index:1,answers:{'bank:q1':'A'},completed:true}};
  const result=await reconcileEvents([oldBank,flag(true),oldSession],[newBank,flag(false,'2026-10-08T12:01:00.000Z'),newSession]);
  const model=derive(result);assert.equal(model.banks[0].name,'Nome atualizado');assert.equal(model.flags.get('bank:q1').favorite,false);assert.equal(model.sessions[0].completed,true);
  assert.equal(originals(result).length,6);
});

test('empates e três variantes convergem independentemente da ordem e dos dispositivos',async()=>{
  const a=flag(true),b=flag(false),c={...flag(true),key:'bank:q2'};
  const all=await reconcileEvents([a,b,c]),reverse=await reconcileEvents([c,b,a]);
  assert.equal(canonicalJSON(all),canonicalJSON(reverse));
  const incremental=await reconcileEvents(await reconcileEvents([a],[b]),[c]);
  assert.equal(canonicalJSON(all),canonicalJSON(incremental));
  const repeated=await reconcileEvents(all,[a,b,c],all);assert.equal(canonicalJSON(repeated),canonicalJSON(all));
});

test('originais continuam recuperáveis na exportação e após recarregar o navegador',async()=>{
  const storage=new MemoryStorage(),store=new Store(storage),a=flag(true),b=flag(false,'2026-10-08T12:01:00.000Z');
  await store.merge([a]);await store.merge([b]);const reloaded=new Store(storage);
  assert.equal(reloaded.events.length,3);assert(coversEvents(reloaded.export().events,[a,b]));
  const other=new Store(new MemoryStorage());await other.merge(validateEvents(reloaded.export()));await other.merge([a]);
  assert.equal(canonicalJSON(other.events),canonicalJSON(reloaded.events));
});

test('restauração aceita colisões dentro de um só arquivo sem apagar versões',async()=>{
  const store=new Store(new MemoryStorage()),a=flag(true),b=flag(false);
  await store.merge([a,b]);assert.equal(store.events.length,3);assert(coversEvents(store.events,[a,b]));
});

test('registro de recuperação adulterado ou aninhado é recusado',async()=>{
  const repaired=await reconcileEvents([flag(true),flag(false)]),record=repaired.find(event=>event.type==='event-conflict');
  await assert.rejects(()=>reconcileEvents([{...record,event:{...record.event,key:'altered'}}]),/recuperação inválido/);
  assert.throws(()=>validateEvents({schemaVersion:1,events:[{...record,event:record}]}),/recuperação inválido/);
});

test('resultados inconsistentes continuam recusados antes de salvar',async()=>{
  const storage=new MemoryStorage(),store=new Store(storage);await store.merge([flag(true)]);const before=[...storage.data];
  await assert.rejects(()=>store.merge([{...answer('A','2026-10-08T12:00:00.000Z'),correct:false}]),/inconsistente/);
  assert.deepEqual([...storage.data],before);
});

test('falha de cota desfaz arquivos de recuperação e a substituição ativa',async()=>{
  const storage=new MemoryStorage(),store=new Store(storage);await store.merge([flag(true)]);const before=[...storage.data];
  const save=storage.setItem.bind(storage);let writes=0;
  storage.setItem=(key,value)=>{if(++writes===4)throw new DOMException('quota','QuotaExceededError');save(key,value);};
  await assert.rejects(()=>store.merge([flag(false,'2026-10-08T12:01:00.000Z'),{...flag(true),id:'new-flag'}]),{name:'QuotaExceededError'});
  assert.deepEqual([...storage.data],before);assert.equal(new Store(storage).events.length,1);
});

test('evento incluído por outra aba durante a reconciliação continua no histórico',async()=>{
  const storage=new MemoryStorage(),a=new Store(storage),b=new Store(storage);await a.merge([flag(true)]);
  await Promise.all([a.merge([flag(false,'2026-10-08T12:01:00.000Z')]),b.merge([{...flag(true),id:'other-tab'}])]);
  const result=new Store(storage).events;assert(result.some(event=>event.id==='other-tab'));assert(coversEvents(result,[flag(true),flag(false,'2026-10-08T12:01:00.000Z')]));
});
