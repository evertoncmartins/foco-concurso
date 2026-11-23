import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.mjs';
import {TemporaryStorage} from '../src/temporary-storage.mjs';

test('leituras estáveis reutilizam eventos e modelo; mudanças de outra aba invalidam o cache',async()=>{
  const storage=new TemporaryStorage(),one=new Store(storage),two=new Store(storage);
  await one.add([{type:'flag',key:'test:q',flag:'favorite',value:true}]);
  const events=one.events,model=one.model();assert.equal(one.load(),events);assert.equal(one.model(),model);
  await two.add([{type:'flag',key:'test:q',flag:'review',value:true}]);
  assert.notEqual(one.load(),events);assert.notEqual(one.model(),model);assert(one.model().flags.get('test:q').review);
});

test('mudança e corrupção de um registro já conhecido continuam sendo detectadas',async()=>{
  const storage=new TemporaryStorage(),store=new Store(storage);
  const [event]=await store.add([{type:'flag',key:'test:q',flag:'favorite',value:true}]);
  storage.setItem('foco:v1:event:'+event.id,JSON.stringify({...event,value:false}));store.load();assert.equal(store.model().flags.get('test:q').favorite,false);
  storage.setItem('foco:v1:event:'+event.id,'invalid JSON');assert.throws(()=>store.load(),/corrompidos/);
});

test('cache não impede atualização do catálogo ou revisões vencidas na passagem do minuto',()=>{
  const store=new Store(new TemporaryStorage()),before=store.model();store.setSystemBanks([]);assert.notEqual(store.model(),before);
  store.derived.minute--;assert.notEqual(store.model(),before);assert.equal(store.derived.minute,Math.floor(Date.now()/60000));
});
