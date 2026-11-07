import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Store} from '../src/store.mjs';
import {TemporaryStorage} from '../src/temporary-storage.mjs';
import {AccountStorage} from '../src/account.mjs';
import {validateSystemBank} from '../src/system-banks.mjs';
import {validateEvents,filterQuestions} from '../src/engine.mjs';
import {createSession,chooseAnswer} from '../src/session.mjs';
import {questionSource} from '../src/bank-source.mjs';
import {bankCatalogCards} from '../src/bank-catalog-view.mjs';
import {sessionBankCatalog,sessionReport} from '../src/sessions-view.mjs';
import {bankScopeView} from '../src/bank-scope.mjs';

const raw=JSON.parse(await readFile(new URL('./fixtures/lei-8112.json',import.meta.url))),native=validateSystemBank({...raw,id:'lei-8112',name:'Lei nº 8.112/1990',questions:raw.questions.slice(0,2)});

test('preferência pessoal restringe só a conta, sincroniza pelo diário e não altera o catálogo ou progresso',async()=>{
  const storage=new TemporaryStorage(),own=new Store(new AccountStorage(storage,'own')),other=new Store(new AccountStorage(storage,'other')),remote=new Store(new AccountStorage(new TemporaryStorage(),'own'));
  for(const store of [own,other,remote])store.setSystemBanks([native]);
  const q=own.model().questions[0],session=createSession([q.key]);session.questionSources={[q.key]:questionSource(q)};
  await own.add([{type:'system-bank-snapshot',bank:native,revision:native.revision},{type:'session',session},...chooseAnswer(session,q,q.correctOption).events]);
  const before=sessionReport(own.model().sessions[0],own.model());
  await own.add([{type:'system-bank-preference',bankId:native.id,value:'disabled'}]);assert.equal(filterQuestions(own.model(),{mode:'random'}).length,0);assert.equal(other.model().banks[0].enabled,true);
  await own.add([{type:'system-bank-preference',bankId:native.id,value:'hidden'}]);assert.equal(bankCatalogCards(own.model()).length,0);assert.equal(own.model().systemBanks.length,1);assert.equal(own.model().sessions.length,1);assert.equal(own.model().answers.length,1);
  assert.equal(sessionReport(own.model().sessions[0],own.model()).correct,before.correct);assert.equal(sessionBankCatalog(own.model())[0].removed,false);
  await remote.merge(own.events);assert.equal(bankCatalogCards(remote.model()).length,0);assert.equal(other.model().banks.length,1);
  const pending=new Map([[native.id,{kind:'added',bank:native}]]);assert.equal(bankCatalogCards(own.model(),pending).length,0);
  await own.resetProgress();assert.equal(own.model().systemBanks[0].personalState,'hidden');
  await own.add([{type:'system-bank-preference',bankId:native.id,value:'enabled'}]);assert.equal(own.model().banks[0].enabled,true);
});

test('preferência pessoal nunca reativa banco desativado globalmente; eventos antigos continuam ignorados',async()=>{
  const store=new Store(new TemporaryStorage());store.setSystemBanks([{...native,active:false}]);
  await store.add([{type:'system-bank-preference',bankId:native.id,value:'enabled'},{type:'system-bank-state',bankId:native.id,value:'enabled'}]);
  assert.equal(store.model().banks[0].enabled,false);assert.equal(filterQuestions(store.model(),{mode:'random'}).length,0);
  store.setSystemBanks([native]);await store.add([{type:'system-bank-state',bankId:native.id,value:'disabled'}]);assert.equal(store.model().banks[0].enabled,true);
  for(const item of [{bankId:'personal',value:'hidden'},{bankId:native.id,value:'deleted'}])assert.throws(()=>validateEvents({schemaVersion:1,events:[{id:'bad',at:new Date().toISOString(),type:'system-bank-preference',...item}]}),/Preferência/);
});

test('seletor informa os dois alcances, oferece cancelamento e explica opção global bloqueada',()=>{
  const html=bankScopeView({systemReason:'Já atribuído <preservar>'});assert(html.includes('Pessoal'));assert(html.includes('Sistema'));assert(html.includes('bank-scope-cancel'));assert.match(html,/id="bank-scope-system"[^>]*disabled/);assert(html.includes('&lt;preservar&gt;'));assert(html.includes('aria-describedby="bank-scope-reason"'));
});
