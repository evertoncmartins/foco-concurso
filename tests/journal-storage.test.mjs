import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {AccountStorage} from '../src/account.mjs';
import {openAccountStorage} from '../src/journal-storage.mjs';
import {TemporaryStorage} from '../src/temporary-storage.mjs';
import {Store} from '../src/store.mjs';
import {validateSystemBank} from '../src/system-banks.mjs';
import {createSession,chooseAnswer} from '../src/session.mjs';
import {validateEvents} from '../src/engine.mjs';
const raw=JSON.parse(await readFile(new URL('./fixtures/lei-8112.json',import.meta.url)));
const native=validateSystemBank({...raw,id:'lei-8112',revision:'quota-test'}),personal={...raw,id:'my-questions'};
const prefix='foco:v1:event:';
const flag=id=>({id,at:'2026-10-16T10:00:00.000Z',type:'flag',key:'my-questions:q1',flag:'favorite',value:true});
class Driver{
  records=new Map();
  async read(subject){if(this.failRead)throw new Error('read failed');return structuredClone(this.records.get(subject)||{subject,revision:0,items:[]});}
  async commit(subject,expected,items){
    if(this.failWrite)throw new Error('write failed');
    if((this.records.get(subject)?.revision||0)!==expected)throw Object.assign(new Error('conflict'),{code:'JOURNAL_CHANGED'});
    this.records.set(subject,{subject,revision:expected+1,items:structuredClone([...items])});return expected+1;
  }
}
const options=driver=>({driver,channelFactory:()=>null});
class LimitedStorage extends TemporaryStorage{
  limit=Infinity;
  get bytes(){return Array.from({length:this.length},(_,i)=>{const k=this.key(i);return (k.length+this.getItem(k).length)*2;}).reduce((a,b)=>a+b,0);}
  setItem(key,value){const old=this.getItem(key),next=this.bytes+(String(key).length*(old===null?1:0)+String(value).length-(old?.length||0))*2;if(next>this.limit)throw new DOMException('full','QuotaExceededError');super.setItem(key,value);}
}
test('histórico que impede associação no localStorage migra e associa sem apagar respostas',async()=>{
  const base=new LimitedStorage(),legacy=new AccountStorage(base,'111'),old=new Store(legacy);old.setSystemBanks([native]);await old.add([{type:'bank',bank:personal}]);
  const q=old.model().questions.find(q=>q.bankId===personal.id),s=createSession([q.key]);await old.add(chooseAnswer(s,q,q.correctOption).events);
  const original=structuredClone(old.events);base.limit=base.bytes+100;
  await assert.rejects(old.associateBank(personal.id,native.id),{name:'QuotaExceededError'});
  const storage=await openAccountStorage(base,'111',options(new Driver())),store=new Store(storage);store.setSystemBanks([native]);
  assert(original.every(e=>JSON.stringify(store.events.find(x=>x.id===e.id))===JSON.stringify(e)));
  assert.equal(legacy.keys().filter(k=>k.startsWith(prefix)).length,0);await store.associateBank(personal.id,native.id);
  assert.equal(store.model().bankLinks.size,1);assert.equal(store.model().stats.attempts,1);assert.equal(store.model().progress.get(`${native.id}:${q.id}`).correct,1);
  assert(base.bytes<=base.limit);storage.close();
});
test('falha ao copiar ou verificar IndexedDB mantém todos os dados originais no localStorage',async()=>{
  for(const mode of ['write','readback']){
    const base=new TemporaryStorage(),legacy=new AccountStorage(base,'111');legacy.setItem(prefix+'old',JSON.stringify(flag('old')));const driver=new Driver();
    if(mode==='write')driver.failWrite=true;
    else{const commit=driver.commit.bind(driver);driver.commit=async(...args)=>{const result=await commit(...args);driver.failRead=true;return result;};}
    await assert.rejects(openAccountStorage(base,'111',options(driver)),/failed/);assert(legacy.getItem(prefix+'old'));
  }
});
test('reabrir lê o diário persistido e não depende da cópia antiga do localStorage',async()=>{
  const base=new TemporaryStorage(),driver=new Driver(),first=await openAccountStorage(base,'111',options(driver));await new Store(first).merge([flag('one')]);first.close();
  const second=await openAccountStorage(base,'111',options(driver));assert.deepEqual(new Store(second).events.map(e=>e.id),['one']);second.close();
});
test('eventos de versão antiga que reaparecem depois da migração são mesclados e preservados',async()=>{
  const base=new TemporaryStorage(),driver=new Driver(),storage=await openAccountStorage(base,'111',options(driver)),store=new Store(storage);await store.merge([flag('one')]);
  new AccountStorage(base,'111').setItem(prefix+'late',JSON.stringify(flag('late')));await store.add([{type:'flag',key:'x:q',flag:'review',value:true}]);
  assert.equal(store.events.length,3);assert(store.events.some(e=>e.id==='late'));assert.equal(new AccountStorage(base,'111').getItem(prefix+'late'),null);storage.close();
});
test('abas simultâneas usam revisão atômica e não perdem tentativas',async()=>{
  const base=new TemporaryStorage(),driver=new Driver(),one=await openAccountStorage(base,'111',options(driver)),two=await openAccountStorage(base,'111',options(driver));
  const a=new Store(one),b=new Store(two);await Promise.all([a.merge([flag('one')]),b.merge([flag('two')])]);await one.refresh();await two.refresh();
  assert.deepEqual(a.load().map(e=>e.id),['one','two']);assert.deepEqual(b.load(),a.events);one.close();two.close();
});
test('IndexedDB mantém contas isoladas e conserva preferências e outras chaves do navegador',async()=>{
  const base=new TemporaryStorage(),driver=new Driver();base.setItem('other-app','preserve');new AccountStorage(base,'111').setItem('foco:config','{"theme":"dark"}');
  const one=await openAccountStorage(base,'111',options(driver)),two=await openAccountStorage(base,'222',options(driver));await new Store(one).merge([flag('one')]);
  assert.equal(new Store(two).events.length,0);assert.equal(one.getItem('foco:config'),'{"theme":"dark"}');assert.equal(base.getItem('other-app'),'preserve');
  one.close();two.close();
});
test('cache do Drive com envio pendente é recuperado e fica fora da cota do localStorage',async()=>{
  const base=new LimitedStorage(),legacy=new AccountStorage(base,'111'),driver=new Driver(),document={schemaVersion:1,owner:{provider:'google',subject:'111'},events:[flag('pending')]};
  legacy.setItem('foco:drive:folder',JSON.stringify({pending:{document}}));base.limit=base.bytes+50;
  const storage=await openAccountStorage(base,'111',options(driver)),store=new Store(storage);assert.equal(store.events[0].id,'pending');
  await storage.setLargeItem('foco:drive:folder',JSON.stringify({pending:{document},large:'x'.repeat(100000)}));assert.equal(new AccountStorage(base,'111').getItem('foco:drive:folder'),null);
  assert.equal(JSON.parse(storage.getItem('foco:drive:folder')).large.length,100000);storage.close();
});
test('falha de gravação no diário não simula associação bem-sucedida nem apaga os eventos anteriores',async()=>{
  const driver=new Driver(),storage=await openAccountStorage(new TemporaryStorage(),'111',options(driver)),store=new Store(storage);store.setSystemBanks([native]);await store.add([{type:'bank',bank:personal}]);const original=JSON.stringify(store.events);
  driver.failWrite=true;await assert.rejects(store.associateBank(personal.id,native.id),/write failed/);assert.equal(JSON.stringify(store.events),original);assert.equal(store.model().bankLinks.size,0);storage.close();
});
test('reinício e associação persistem no novo armazenamento e backups antigos não reativam respostas',async()=>{
  const driver=new Driver(),base=new TemporaryStorage(),storage=await openAccountStorage(base,'111',options(driver)),store=new Store(storage);store.setSystemBanks([native]);await store.add([{type:'bank',bank:personal}]);
  const q=store.model().questions.find(q=>q.bankId===personal.id);await store.add(chooseAnswer(createSession([q.key]),q,q.correctOption).events);await store.associateBank(personal.id,native.id);const old=store.export();await store.resetProgress();await store.merge(validateEvents(old));
  const reopened=await openAccountStorage(base,'111',options(driver)),copy=new Store(reopened);copy.setSystemBanks([native]);assert.equal(copy.model().stats.attempts,0);assert.equal(copy.model().bankLinks.size,1);storage.close();reopened.close();
});
test('notificação de outra aba atualiza o diário somente da conta correspondente',async()=>{
  const driver=new Driver(),base=new TemporaryStorage(),messages=[],channels=[];
  const channelFactory=()=>{const channel={postMessage:data=>messages.push(data),close(){}};channels.push(channel);return channel;};
  const a=await openAccountStorage(base,'111',{driver,channelFactory}),b=await openAccountStorage(base,'111',{driver,channelFactory});let changed=0;b.addEventListener('change',()=>changed++);
  await new Store(a).merge([flag('one')]);channels[1].onmessage({data:{subject:'222'}});await new Promise(setImmediate);assert.equal(changed,0);
  channels[1].onmessage({data:messages[0]});await new Promise(setImmediate);assert.equal(changed,1);assert.equal(new Store(b).events.length,1);a.close();b.close();
});
test('exclusão de sessão persiste no IndexedDB entre abas e recarga sem retirar o progresso',async()=>{
  const base=new TemporaryStorage(),driver=new Driver(),one=await openAccountStorage(base,'111',options(driver)),store=new Store(one);await store.add([{type:'bank',bank:personal}]);
  const q=store.model().questions[0],s=createSession([q.key]),next=chooseAnswer(s,q,q.correctOption);await store.add(next.events);const backup=store.export();
  const two=await openAccountStorage(base,'111',options(driver)),second=new Store(two);await store.deleteSession(s.id);await second.merge(validateEvents(backup));assert.equal(second.model().sessions.length,0);assert.equal(second.model().stats.attempts,1);
  const reopened=await openAccountStorage(base,'111',options(driver));assert.equal(new Store(reopened).model().sessions.length,0);assert.equal(new Store(reopened).model().stats.correct,1);one.close();two.close();reopened.close();
});
