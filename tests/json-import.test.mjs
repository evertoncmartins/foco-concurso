import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateBank,validateEvents} from '../src/engine.mjs';
import {Store} from '../src/store.mjs';
import {TemporaryStorage} from '../src/temporary-storage.mjs';
import {chooseAnswer,createSession} from '../src/session.mjs';
import {longBank} from './helpers/long-bank.mjs';

test('conteúdo acima dos antigos limites é preservado na importação e no progresso',async()=>{
  const raw=longBank(),bank=validateBank(raw);
  assert.deepEqual(bank,raw);
  const storage=new TemporaryStorage(),store=new Store(storage);
  await store.add([{type:'bank',bank}]);
  const question=store.model().questions[0],session=createSession([question.key]);
  await store.add(chooseAnswer(session,question,'A').events);
  const reloaded=new Store(storage),document=JSON.parse(JSON.stringify(reloaded.export()));
  const restored=new Store(new TemporaryStorage());await restored.merge(validateEvents(document));
  assert.deepEqual(restored.model().banks[0].questions,raw.questions);
  assert.equal(restored.model().banks[0].description,raw.description);
  assert.equal(restored.model().stats.correct,1);
  for(const field of ['discipline','subject','topic'])assert.equal(restored.model().answers[0][field],raw.questions[0][field]);
  assert.deepEqual(validateBank(JSON.parse(JSON.stringify(bank))),raw);
});

test('alternativa inválida informa a questão e a letra, sem confundir vazio com tamanho',()=>{
  for(const value of ['', ' \n\t',null,123,{},['texto']]){
    const raw=longBank();raw.questions=Array.from({length:61},(_,i)=>({...raw.questions[0],id:`questao-${i}`}));
    raw.questions[60]={...raw.questions[60],options:[{id:'A',text:value},{id:'B',text:'Válida'}]};
    assert.throws(()=>validateBank(raw),error=>/Questão 61 alternativa A:/.test(error.message)&&!error.message.includes('caracteres')&&/texto não vazio|deve ser um texto/.test(error.message));
  }
});

test('retirar limites de conteúdo não remove limites estruturais ou validações de segurança',()=>{
  for(const update of [b=>b.id='a'.repeat(121),b=>b.questions[0].id='a'.repeat(121),b=>b.questions[0].options[0].id='AA',b=>b.questions[0].correctOption='H',b=>b.questions[0].tags=Array(31).fill('tag'),b=>b.questions=Array(5001).fill(b.questions[0]),b=>b.questions[0].fonte.prova='javascript:alert(1)',b=>b.questions[0].fonte.prova='https://user:secret@example.test/',b=>b.questions[0].fonte.dataProva='2026-02-30']){
    const raw=longBank();update(raw);assert.throws(()=>validateBank(raw));
  }
});

test('JSON Schema limita apenas os IDs técnicos, não os conteúdos textuais',async()=>{
  const schema=JSON.parse(await readFile(new URL('../docs/questions.schema.json',import.meta.url),'utf8'));
  const limits=[];
  function inspect(value,path=''){
    if(!value||typeof value!=='object')return;
    if(Object.hasOwn(value,'maxLength'))limits.push([path,value.maxLength]);
    for(const [key,item] of Object.entries(value))inspect(item,`${path}/${key}`);
  }
  inspect(schema);
  assert.deepEqual(limits,[['/properties/id',120],['/$defs/question/properties/id',120]]);
});
