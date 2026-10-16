import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateBank,validateEvents,derive,filterQuestions} from '../src/engine.mjs';
import {bankProgressPlan,progressLinkCandidates} from '../src/bank-progress.mjs';
import {Store} from '../src/store.mjs';
import {TemporaryStorage} from '../src/temporary-storage.mjs';
import {AccountStorage} from '../src/account.mjs';
import {validateSystemBank} from '../src/system-banks.mjs';
import {questionSource,sessionQuestion} from '../src/bank-source.mjs';
import {createSession,chooseAnswer,completeSession} from '../src/session.mjs';
import {performanceForBank,sessionLibrary,sessionReport} from '../src/sessions-view.mjs';
const raw=JSON.parse(await readFile(new URL('./fixtures/lei-8112.json',import.meta.url)));
const native=validateSystemBank({...raw,id:'lei-8112',revision:'test-revision',questions:raw.questions.slice(0,3)});
const personal=validateBank({...native,id:'my-original-questions',name:'Meu banco'});
async function fixture(){const store=new Store(new TemporaryStorage());store.setSystemBanks([native]);await store.add([{type:'bank',bank:personal}]);return store;}
async function study(store,bankId,wrong=false){
  const q=store.model().questions.find(q=>q.bankId===bankId),s=createSession([q.key]);s.questionSources={[q.key]:questionSource(q)};
  const result=chooseAnswer(s,q,wrong?q.options.find(o=>o.id!==q.correctOption).id:q.correctOption);await store.add(result.events);return result.session;
}

test('bancos equivalentes continuam separados até a associação explícita',async()=>{
  const store=await fixture();await study(store,personal.id);const m=store.model();
  assert.equal(m.progress.has(`${native.id}:${native.questions[0].id}`),false);
  assert.equal(progressLinkCandidates(m,m.personalBanks[0]).length,1);assert.equal(m.stats.attempts,1);
});
test('comparação exige todo o conteúdo e o gabarito, recusando correspondência parcial ou ambígua',()=>{
  assert(bankProgressPlan(personal,native));
  for(const mutate of [b=>b.questions[1].statement+=' diferente',b=>b.questions[1].options[0].text+=' diferente',b=>b.questions[1].correctOption=b.questions[1].options.find(o=>o.id!==b.questions[1].correctOption).id,b=>b.questions[1].options.reverse()]){
    const other=structuredClone(native);mutate(other);assert.equal(bankProgressPlan(personal,other),null);
  }
  const improved=structuredClone(native);improved.questions[0].explanation='Explicação mais didática';assert(bankProgressPlan(personal,improved));
  const otherIds=structuredClone(native);otherIds.questions.forEach((q,i)=>q.id=`new-${i}`);assert(bankProgressPlan(personal,otherIds));
  const duplicate=structuredClone(otherIds);duplicate.questions.push({...duplicate.questions[0],id:'ambiguous'});assert.equal(bankProgressPlan(personal,duplicate),null);
});
test('associação soma tentativas reais sem duplicá-las e preserva origem, revisões e favoritos',async()=>{
  const store=await fixture();await study(store,personal.id,true);await study(store,native.id);
  const key=`${personal.id}:${personal.questions[0].id}`,target=`${native.id}:${native.questions[0].id}`;
  await store.add([{type:'flag',key,flag:'favorite',value:true},{type:'flag',key,flag:'review',value:true}]);
  const originals=structuredClone(store.events),before=store.model();await store.associateBank(personal.id,native.id);const m=store.model();
  assert.equal(m.stats.attempts,2);assert.equal(m.stats.correct,1);assert.equal(m.stats.wrong,1);assert.equal(m.stats.answered,1);
  assert.equal(m.progress.get(target).attempts,2);assert.equal(m.progress.get(target).lastAt,before.progress.get(target).lastAt);assert.equal(m.flags.get(target).favorite,true);assert.equal(m.flags.get(target).review,true);
  assert.equal(m.personalBanks[0].enabled,false);assert.equal(m.personalBanks[0].linkedTo.toBankId,native.id);
  assert.equal(performanceForBank(m,native.id).stats.attempts,2);assert.equal(performanceForBank(m,native.id,'personal').stats.attempts,1);
  assert.equal(m.answers.find(a=>a.bankId===personal.id).sourceType,'personal');assert(originals.every(e=>JSON.stringify(store.events.find(x=>x.id===e.id))===JSON.stringify(e)));
  assert.equal(filterQuestions(m,{mode:'new',banks:[native.id]}).length,2);assert.equal(filterQuestions(m,{mode:'favorites',banks:[native.id]}).length,1);
  const count=store.events.length;assert.equal(await store.associateBank(personal.id,native.id),false);assert.equal(store.events.length,count);
  await store.add([{type:'flag',key:target,sourceType:'system',flag:'favorite',value:false}]);assert.equal(store.model().flags.get(key).favorite,false);
});
test('escolher usar o banco nativo o ativa sem reativar a cópia pessoal',async()=>{
  const store=await fixture();await store.add([{type:'system-bank-state',bankId:native.id,value:'disabled'}]);await store.associateBank(personal.id,native.id);
  assert.equal(store.model().systemBanks[0].enabled,true);assert.equal(store.model().personalBanks[0].enabled,false);
});
test('excluir o banco pessoal após associar mantém sessão em andamento e todos os registros',async()=>{
  const store=await fixture(),s=await study(store,personal.id);await store.associateBank(personal.id,native.id);
  await store.add([{type:'bank-state',bankId:personal.id,value:'deleted'}]);const m=store.model();
  assert.equal(m.personalBanks.length,0);assert.equal(sessionLibrary(m,{bankId:native.id}).rows[0].canResume,true);
  assert(sessionQuestion(m,s,s.queue[0]));assert.equal(m.stats.attempts,1);assert.equal(performanceForBank(m,native.id).stats.attempts,1);
  const completed=completeSession(s,s.queue.map(k=>sessionQuestion(m,s,k)));await store.add(completed.events);
  const report=sessionReport(completed.session,store.model());assert.equal(report.correct,1);assert.equal(report.questions[0].sourceType,'personal');assert.equal(store.model().stats.attempts,1);
});
test('simulado aberto antes da associação continua sem revelar notas e conclui após remover o pessoal',async()=>{
  const store=await fixture(),m=store.model(),q=m.questions.find(q=>q.bankId===personal.id);let s=createSession([q.key],'exam');s.questionSources={[q.key]:questionSource(q)};
  s=chooseAnswer(s,q,q.correctOption).session;await store.add([{type:'session',session:s}]);await store.associateBank(personal.id,native.id);await store.add([{type:'bank-state',bankId:personal.id,value:'deleted'}]);
  let model=store.model();assert.equal(model.stats.attempts,0);assert.equal(sessionLibrary(model,{bankId:native.id}).rows[0].canResume,true);
  const done=completeSession(s,s.queue.map(k=>sessionQuestion(model,s,k)));await store.add(done.events);model=store.model();
  assert.equal(model.stats.attempts,1);assert.equal(model.progress.get(`${native.id}:${q.id}`).correct,1);assert.equal(sessionReport(done.session,model).correct,1);
});
test('sincronização idempotente conserva associação e tentativas tardias de dispositivo antigo',async()=>{
  const store=await fixture();await study(store,personal.id);const old=new Store(new TemporaryStorage());old.setSystemBanks([native]);await old.merge(store.events);
  await store.associateBank(personal.id,native.id);await study(old,personal.id,true);await store.merge(old.events);
  const copy=new Store(new TemporaryStorage());copy.setSystemBanks([native]);await copy.merge(validateEvents(store.export()));await copy.merge(old.events);await copy.merge(store.events);
  assert.equal(copy.model().stats.attempts,2);assert.equal(copy.model().progress.get(`${native.id}:${native.questions[0].id}`).attempts,2);
  assert.deepEqual(copy.model().stats,store.model().stats);
});
test('desfazer não apaga dados, e zerar progresso não reativa estudos antigos após sincronização',async()=>{
  const store=await fixture();await study(store,personal.id);await store.associateBank(personal.id,native.id);const linked=structuredClone(store.events);
  await store.unlinkBank(personal.id);assert.equal(store.model().progress.has(`${native.id}:${native.questions[0].id}`),false);assert.equal(store.model().stats.attempts,1);
  await store.associateBank(personal.id,native.id);await store.resetProgress();await store.merge(linked);
  assert.equal(store.model().stats.attempts,0);assert.equal(store.model().flags.size,0);assert.equal(store.model().bankLinks.size,1);
});
test('prova ausente, mapa adulterado e snapshots divergentes não associam progresso indevidamente',async()=>{
  const store=await fixture();await study(store,personal.id);await store.associateBank(personal.id,native.id);const events=structuredClone(store.events),link=events.find(e=>e.type==='bank-progress-link');
  for(const mutate of [e=>e.fromEventId='missing',e=>e.questions[0].to=native.questions[1].id,e=>e.toRevision='unknown']){
    const copy=structuredClone(events);mutate(copy.find(e=>e.id===link.id));const m=derive(copy,Date.now(),[native]);assert.equal(m.progress.has(`${native.id}:${native.questions[0].id}`),false);
  }
  const changed=structuredClone(native);changed.questions[0].statement+=' changed';const model=derive(events,Date.now(),[changed]);assert.equal(model.progress.has(`${native.id}:${native.questions[0].id}`),false);
  const copy=structuredClone(events);copy.find(e=>e.id===link.id).questions[1].from=copy.find(e=>e.id===link.id).questions[0].from;assert.throws(()=>validateEvents({schemaVersion:1,events:copy}),/associação/);
});
test('respostas históricas de conteúdo diferente nunca contam no banco nativo apesar do mesmo ID',async()=>{
  const store=await fixture();await study(store,personal.id);const events=structuredClone(store.events);events.find(e=>e.type==='answer').questionSnapshot.statement+=' old different wording';
  await store.associateBank(personal.id,native.id);const m=derive([...events,...store.events.filter(e=>!events.some(x=>x.id===e.id))],Date.now(),[native]);
  assert.equal(m.stats.attempts,1);assert.equal(m.progress.has(`${native.id}:${native.questions[0].id}`),false);
});
test('falha de armazenamento reverte a associação inteira e mantém o histórico original',async()=>{
  const storage=new TemporaryStorage(),store=new Store(storage);store.setSystemBanks([native]);await store.add([{type:'bank',bank:personal}]);await study(store,personal.id);const before=JSON.stringify(store.events),set=storage.setItem.bind(storage);let writes=0;
  storage.setItem=(k,v)=>{if(++writes===2)throw new Error('quota');set(k,v);};await assert.rejects(store.associateBank(personal.id,native.id),/quota/);
  assert.equal(JSON.stringify(store.load()),before);assert.equal(store.model().bankLinks.size,0);
});
test('associação pertence só à conta atual, sem afetar outra conta no mesmo navegador',async()=>{
  const storage=new TemporaryStorage(),one=new Store(new AccountStorage(storage,'111')),two=new Store(new AccountStorage(storage,'222'));one.setSystemBanks([native]);two.setSystemBanks([native]);
  await one.add([{type:'bank',bank:personal}]);await study(one,personal.id);await one.associateBank(personal.id,native.id);two.load();
  assert.equal(one.model().stats.attempts,1);assert.equal(two.model().stats.attempts,0);assert.equal(two.model().bankLinks.size,0);
});
