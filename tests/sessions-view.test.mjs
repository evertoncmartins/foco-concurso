import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateBank,validateEvents,derive} from '../src/engine.mjs';
import {Store} from '../src/store.mjs';
import {TemporaryStorage} from '../src/temporary-storage.mjs';
import {AccountStorage} from '../src/account.mjs';
import {sessionLibrary,sessionSummary,sessionReport,sessionsView,performanceForBank,sessionBankCatalog} from '../src/sessions-view.mjs';

const base=validateBank(JSON.parse(await readFile(new URL('../src/lei-8112.json',import.meta.url))));
const a={...structuredClone(base),id:'law-a',name:'Lei nº 8.112/1990',questions:base.questions.slice(0,3)};
const b={...structuredClone(a),id:'law-b',name:'Lei nº 8.069/1990'};
const at=n=>new Date(Date.parse('2026-10-15T12:00:00Z')+n*1000).toISOString();
const key=(bank,i=0)=>`${bank.id}:${bank.questions[i].id}`;
const saved=(id,bank,{completed=false,exam=false,index=1}={})=>({id,mode:exam?'exam':'smart',queue:bank.questions.map(q=>`${bank.id}:${q.id}`),index:completed?bank.questions.length:index,answers:{[key(bank)]:bank.questions[0].correctOption},startedAt:at(1),completed,...(completed?{completedAt:at(10)}:{})});
const sessionEvent=(session,n)=>({id:`state-${session.id}-${n}`,type:'session',session,at:at(n)});
const grade=(session,bank,n=9)=>({id:`answer-${session.id}`,type:'answer',at:at(n),key:key(bank),sessionId:session.id,selected:bank.questions[0].correctOption,correctOption:bank.questions[0].correctOption,correct:true,discipline:bank.questions[0].discipline,subject:bank.questions[0].subject,topic:bank.questions[0].topic});
function fixture(){
  const runningA=saved('paused-a',a),runningB=saved('paused-b',b,{exam:true}),doneA=saved('done-a',a,{completed:true}),doneB=saved('done-b',b,{exam:true,completed:true});
  const events=[{id:'bank-a',type:'bank',bank:a,at:at(0)},{id:'bank-b',type:'bank',bank:b,at:at(0)},sessionEvent(runningA,2),sessionEvent(runningB,3),grade(doneA,a),grade(doneB,b),sessionEvent(doneA,10),sessionEvent(doneB,11)];
  return {events:validateEvents({schemaVersion:1,events}),runningA,runningB,doneA,doneB};
}

test('biblioteca separa andamento e conclusão e filtra banco e tipo sem perder sessões',()=>{
  const {events}=fixture(),m=derive(events);
  let list=sessionLibrary(m);assert.equal(list.open,2);assert.equal(list.completed,2);assert.deepEqual(list.rows.map(s=>s.id),['paused-b','paused-a']);
  list=sessionLibrary(m,{bankId:a.id,status:'completed',type:'study'});assert.equal(list.rows.length,1);assert.equal(list.rows[0].id,'done-a');assert.equal(list.open,1);assert.equal(list.completed,1);
  assert.equal(sessionLibrary(m,{bankId:a.id,type:'exam'}).total,0);
  const summary=sessionSummary(m.sessions.find(s=>s.id==='paused-a'),m);assert.equal(summary.answered,1);assert(summary.canResume);assert.equal(summary.accuracy,null);
  const html=sessionsView(m,{status:'open',bankId:'',type:'all',page:1});assert(html.includes('Lei nº 8.112/1990'));assert(html.includes('Lei nº 8.069/1990'));assert(html.includes('data-session="paused-a"'));assert(!html.includes('Ver resultado'));
});

test('sessão mista aparece ao filtrar qualquer um dos bancos incluídos',()=>{
  const {events,runningA}=fixture(),mixed={...runningA,id:'mixed',queue:[key(a),key(b)],answers:{},index:0};
  const m=derive([...events,sessionEvent(mixed,12)]);
  assert(sessionLibrary(m,{bankId:a.id}).rows.some(r=>r.id==='mixed'));assert(sessionLibrary(m,{bankId:b.id}).rows.some(r=>r.id==='mixed'));
  assert.equal(sessionSummary(mixed,m).title,'Lei nº 8.112/1990 · Lei nº 8.069/1990');
});

test('filtros mantêm bancos atuais e removidos com estudo, omitindo importações antigas sem histórico',()=>{
  const active={...a,id:'current-unused'},disabled={...a,id:'current-disabled'},unused={...a,id:'removed-unused'},abandoned={...a,id:'removed-abandoned'};
  const banks=[a,b,active,disabled,unused,abandoned],paused={...saved('paused-only',a),answers:{}},discarded={...saved('discarded',abandoned),answers:{},abandoned:true};
  const events=banks.map(bank=>({id:`import-${bank.id}`,type:'bank',bank,at:at(0)}));
  for(const bank of [a,b,unused,abandoned])events.push({id:`remove-${bank.id}`,type:'bank-state',bankId:bank.id,value:'deleted',at:at(5)});
  events.push({id:'disable-current',type:'bank-state',bankId:disabled.id,value:'disabled',at:at(5)},sessionEvent(paused,6),sessionEvent(discarded,6),grade(saved('answer-only',b),b));
  const model=derive(validateEvents({schemaVersion:1,events})),catalog=sessionBankCatalog(model);
  assert.deepEqual(catalog.map(bank=>bank.id).sort(),[a.id,b.id,active.id,disabled.id].sort());
  assert(catalog.find(bank=>bank.id===a.id).removed);assert(catalog.find(bank=>bank.id===b.id).removed);
  assert(!catalog.find(bank=>bank.id===disabled.id).removed);
  const html=sessionsView(model,{status:'open',bankId:'',type:'all'});
  assert(!html.includes(`value="${unused.id}"`));assert(!html.includes(`value="${abandoned.id}"`));
  assert(html.includes(`value="${a.id}"`));assert(html.includes(`value="${b.id}"`));
  assert.equal(model.answers.length,1);assert.equal(model.sessions.length,2);assert.equal(model.bankHistory.length,banks.length);
});

test('reinício de progresso retira bancos removidos que só tinham estudo da etapa anterior',()=>{
  const {events}=fixture();
  const model=derive([...events,{id:'remove-old',type:'bank-state',bankId:a.id,value:'deleted',at:at(12)},{id:'new-epoch',type:'progress-reset',at:at(13)}]);
  assert.deepEqual(sessionBankCatalog(model).map(bank=>bank.id),[b.id]);
  assert(model.bankHistory.some(event=>event.bank.id===a.id));
});

test('histórico usa gabarito e texto da época da resposta após atualizar ou remover um banco',()=>{
  const {events,doneA}=fixture(),updated=structuredClone(a);updated.questions[0].statement='Texto novo do banco';updated.questions[0].correctOption=updated.questions[0].options.find(o=>o.id!==a.questions[0].correctOption).id;
  // The bank changes after the answer but before the final session record.
  const m=derive([...events,{id:'updated',type:'bank',bank:updated,at:at(9.5)},{id:'removed',type:'bank-state',bankId:a.id,value:'deleted',at:at(12)}]);
  const report=sessionReport(doneA,m);assert.equal(report.correct,1);assert.equal(report.wrong,0);assert.equal(report.accuracy,33);assert.equal(report.total,3);
  assert.equal(report.questions[0].question.statement,a.questions[0].statement);assert.equal(report.questions[0].correctOption,a.questions[0].correctOption);
  assert.equal(sessionLibrary(m,{bankId:a.id}).rows[0].canResume,false);assert(sessionBankCatalog(m).find(b=>b.id===a.id).removed);
});

test('conteúdo ausente mantém a nota registrada e impede retomada incompleta',()=>{
  const {doneA,runningA}=fixture(),m=derive([grade(doneA,a),sessionEvent(doneA,10),sessionEvent(runningA,11)]);
  const report=sessionReport(doneA,m);assert.equal(report.correct,1);assert.equal(report.accuracy,33);assert(report.questions.every(q=>q.question===null));
  assert.equal(sessionSummary(runningA,m).canResume,false);
  const html=sessionsView(m,{status:'open',bankId:'',type:'all'});assert(html.includes('Reimporte o banco original'));assert.match(html,/data-action="session-resume"[^>]*disabled/);
});

test('paginação mantém todo o histórico acessível e se ajusta aos filtros',()=>{
  const {events,runningA}=fixture(),extra=Array.from({length:25},(_,i)=>sessionEvent({...runningA,id:`extra-${i}`},20+i));
  const m=derive([...events,...extra]),first=sessionLibrary(m),last=sessionLibrary(m,{page:999});assert.equal(first.total,27);assert.equal(first.rows.length,12);assert.equal(last.pages,3);assert.equal(last.page,3);assert.equal(last.rows.length,3);
  assert.equal(new Set([1,2,3].flatMap(page=>sessionLibrary(m,{page}).rows.map(s=>s.id))).size,27);
});

test('desempenho por banco conta tentativas e questões únicas sem misturar nem modificar o modelo',()=>{
  const {events,doneA}=fixture(),repeat={...grade(doneA,a,12),id:'repeat',sessionId:'another',selected:a.questions[0].options.find(o=>o.id!==a.questions[0].correctOption).id,correct:false};
  const m=derive([...events,repeat]),before=JSON.stringify(m.answers),scoped=performanceForBank(m,a.id);
  assert.equal(scoped.stats.attempts,2);assert.equal(scoped.stats.answered,1);assert.equal(scoped.stats.accuracy,50);assert.equal(scoped.questions.length,3);
  assert.equal(performanceForBank(m,b.id).stats.accuracy,100);assert.equal(JSON.stringify(m.answers),before);assert.equal(performanceForBank(m),m);
});

test('exportação e restauração recuperam sessões antigas e reset remove todo o histórico ativo',async()=>{
  const {events}=fixture(),storage=new TemporaryStorage(),store=new Store(new AccountStorage(storage,'111'));await store.merge(events);
  const exported=store.export(),restored=new Store(new AccountStorage(new TemporaryStorage(),'111'));await restored.merge(validateEvents(exported));
  assert.deepEqual(sessionLibrary(restored.model()).rows.map(s=>s.id),['paused-b','paused-a']);assert.equal(sessionLibrary(restored.model(),{status:'completed'}).total,2);
  const other=new Store(new AccountStorage(storage,'222'));assert.equal(sessionLibrary(other.model()).total,0);
  await restored.resetProgress();assert.equal(sessionLibrary(restored.model()).total,0);assert.equal(sessionLibrary(restored.model(),{status:'completed'}).total,0);
});

test('textos importados são escapados e não há gabaritos em simulados em andamento',()=>{
  const {events,runningB}=fixture(),bank={...b,name:'<img src=x onerror=alert(1)>'};
  const m=derive([...events,{id:'unsafe-bank-label',type:'bank',bank,at:at(13)}]);
  const html=sessionsView(m,{status:'open',bankId:b.id,type:'exam'});assert(html.includes('&lt;img'));assert(!html.includes('<img src=x'));assert(!html.includes('Aproveitamento'));assert(!html.includes('Alternativa correta'));
  assert.equal(sessionSummary(runningB,m).accuracy,null);
});
