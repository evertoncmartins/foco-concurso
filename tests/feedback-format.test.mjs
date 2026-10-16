import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {validateBank,validateEvents} from '../src/engine.mjs';
import {requireNativeFeedback} from '../src/system-banks.mjs';
import {questionFeedbackView} from '../src/explanation-view.mjs';
import {latestNativeFeedback,sessionQuestion,questionSource} from '../src/bank-source.mjs';
import {sessionReport} from '../src/sessions-view.mjs';
import {questionIdentity,bankProgressPlan} from '../src/bank-progress.mjs';
import {Store} from '../src/store.mjs';
import {TemporaryStorage} from '../src/temporary-storage.mjs';
import {createSession,chooseAnswer,completeSession} from '../src/session.mjs';
import {jsonExample} from '../scripts/json-example.mjs';

const model=JSON.parse(await readFile(new URL('../docs/modelo-banco.json',import.meta.url)));
const question=model.questions[0];
test('modelo completo usa o importador real e todos os nativos têm feedback para cada alternativa',async()=>{
  requireNativeFeedback(validateBank(model));let questions=0,alternatives=0;
  const root=new URL('../public/data/question-banks/',import.meta.url);
  for(const file of await readdir(root))if(file.endsWith('.json')&&file!=='index.json'){
    const bank=requireNativeFeedback(validateBank(JSON.parse(await readFile(new URL(file,root)))));
    for(const q of bank.questions){questions++;alternatives+=q.options.length;assert.deepEqual(Object.keys(q.optionExplanations),q.options.map(o=>o.id));for(const text of Object.values(q.optionExplanations))assert(text.length>30,`${q.id}: justificativa insuficiente`);}
  }
  assert(questions>=199);assert(alternatives>=796);
});
test('pessoal antigo importa e mantém o texto original; novos campos são opcionais, mas completos quando presentes',()=>{
  const old=structuredClone(model);delete old.questions[0].optionExplanations;delete old.questions[0].fundamentoLegal;delete old.questions[0].reference;
  const before=JSON.stringify(old),copy=validateBank(old);assert.equal(copy.questions[0].explanation,old.questions[0].explanation);assert(!copy.questions[0].optionExplanations);assert.equal(JSON.stringify(old),before);
  for(const value of [null,[],{},'texto',{...question.optionExplanations,A:''},{...question.optionExplanations,H:'extra'}]){
    const raw=structuredClone(model);raw.questions[0].optionExplanations=value;assert.throws(()=>validateBank(raw),/justificativa|optionExplanations/);
  }
});
test('perfil nativo recusa alternativa sem análise, fundamentação ausente e link não oficial',()=>{
  for(const change of [q=>delete q.optionExplanations,q=>delete q.fundamentoLegal,q=>delete q.tipo,q=>q.reference.url='https://exemplo.com/lei',q=>q.reference.url='https://www.planalto.gov.br.exemplo.com/lei']){
    const copy=structuredClone(model);change(copy.questions[0]);assert.throws(()=>requireNativeFeedback(validateBank(copy)));
  }
});
test('feedback distingue escolha e gabarito, organiza todas as opções e escapa conteúdo importado',()=>{
  const q={...question,explanation:'Texto <script>alert(1)</script>',optionExplanations:{...question.optionExplanations,A:'Erro <img src=x onerror=alert(1)>'}};
  for(const selected of ['A',question.correctOption,null]){
    const html=questionFeedbackView(q,selected);assert.equal((html.match(/class="feedback-option /g)||[]).length,q.options.length);assert.equal((html.match(/class="feedback-selected"/g)||[]).length,selected?1:0);
    assert(html.includes('Explicação'));assert(html.includes('Análise das alternativas'));assert(html.includes('Fundamentação legal'));assert(html.includes('Consultar legislação'));
    assert(!html.includes('<script>'));assert(!html.includes('<img'));assert(html.includes('&lt;script&gt;'));assert(html.includes(selected===q.correctOption?'Resposta correta':selected?'Resposta incorreta':'Questão não respondida'));
  }
  assert(!questionFeedbackView({...q,reference:{label:'Sem URL segura',url:'javascript:alert(1)'}},'A').includes('javascript:'));
  const old={...q};delete old.optionExplanations;assert(!questionFeedbackView(old,'A').includes('Análise das alternativas'));
});
test('feedback estruturado sobrevive a respostas, exportação e restauração sem duplicar tentativas',async()=>{
  const store=new Store(new TemporaryStorage());await store.add([{type:'bank',bank:model}]);const q=store.model().questions[0];await store.add(chooseAnswer(createSession([q.key]),q,q.correctOption).events);
  const restored=new Store(new TemporaryStorage());await restored.merge(validateEvents(store.export()));assert.deepEqual(restored.model().questions[0].optionExplanations,question.optionExplanations);assert.equal(restored.model().stats.attempts,1);
});
test('melhoria de feedback nativo mantém identidade, vínculo pessoal e histórico; conteúdo divergente nunca é substituído',()=>{
  const old={...question,key:'lei-8112:q',sourceType:'system'},current={...old,explanation:'Comentário revisado',optionExplanations:{...question.optionExplanations,A:'Análise revisada'}};
  const before=JSON.stringify(old),result=latestNativeFeedback(old,current);assert.equal(result.explanation,current.explanation);assert.equal(questionIdentity(result),questionIdentity(old));assert.equal(JSON.stringify(old),before);
  assert.equal(latestNativeFeedback({...old,sourceType:'personal'},current).explanation,old.explanation);
  assert.equal(latestNativeFeedback(old,{...current,statement:'Outra questão'}),old);
  assert.equal(latestNativeFeedback(old,{...current,correctOption:'A'}),old);
  assert(bankProgressPlan({id:'personal',questions:[old]},{id:'lei-8112',questions:[current]}));
});
test('exemplo do guia é gerado do mesmo JSON baixável, sem cópia manual divergente',async()=>{
  const template=await readFile(new URL('../public/formato-json.html',import.meta.url),'utf8'),html=jsonExample(template,model);
  const code=html.match(/<code id="json-example">([\s\S]*?)<\/code>/)[1].replace(/<[^>]*>/g,'').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  assert.deepEqual(JSON.parse(code),model);assert(!html.includes('FOCO_JSON_EXAMPLE'));assert.throws(()=>jsonExample('<p>sem exemplo</p>',model));
});
test('sessão e resultado antigos recebem só feedback nativo equivalente, sem regravar histórico nem nota',async()=>{
  const raw=structuredClone(model);raw.id='lei-8112';raw.name='Lei nº 8.112/1990';raw.sourceType='system';raw.revision='old';delete raw.questions[0].optionExplanations;raw.questions[0].explanation='Comentário anterior.';
  const store=new Store(new TemporaryStorage());store.setSystemBanks([raw]);await store.add([{type:'system-bank-snapshot',bank:raw,revision:'old'}]);const q=store.model().questions[0];
  let s=createSession([q.key]);s.questionSources={[q.key]:questionSource(q)};let step=chooseAnswer(s,q,q.correctOption);s=step.session;await store.add(step.events);step=completeSession(s,[q]);s=step.session;await store.add(step.events);
  const before=JSON.stringify(store.events),updated={...raw,revision:'new',questions:[{...question,explanation:'Explicação atual revisada.'}]};store.setSystemBanks([updated]);const current=store.model();
  assert.equal(sessionQuestion(current,s,q.key).explanation,'Explicação atual revisada.');const report=sessionReport(s,current);assert.equal(report.questions[0].question.explanation,'Explicação atual revisada.');assert.equal(report.correct,1);assert.equal(JSON.stringify(store.events),before);
  store.setSystemBanks([{...updated,questions:[{...updated.questions[0],correctOption:'A'}]}]);assert.equal(sessionReport(s,store.model()).questions[0].question.explanation,'Comentário anterior.');assert.equal(sessionReport(s,store.model()).correct,1);
});
