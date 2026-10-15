import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateBank,derive} from '../src/engine.mjs';
import {bankPresentation} from '../src/bank-view.mjs';
import {sessionSetupView,sessionSetupStatus} from '../src/session-setup.mjs';

const base=validateBank(JSON.parse(await readFile(new URL('../src/lei-8112.json',import.meta.url))));
const banks=[{...base,id:'rju',name:'Lei nº 8.112/1990 — banco unificado — Títulos I a V'},{...base,id:'eca',name:'ECA — banco unificado — IFs e universidades — recorte do edital'}];
const modes={smart:['Recomendadas','Combine questões novas e revisões.'],subject:['Por assunto','Escolha um conteúdo.'],exam:['Simulado','Gabarito somente ao concluir.']};

test('configuração usa os mesmos títulos e subtítulos dos cards, preservando nomes e IDs importados',()=>{
  const before=JSON.stringify(banks),html=sessionSetupView({banks,modes,bankId:'eca'});
  for(const bank of banks){const presentation=bankPresentation(bank);assert(html.includes(`<strong>${presentation.title}</strong>`));assert(html.includes(presentation.subtitle));assert(html.includes(`name="banks" value="${bank.id}"`));}
  assert(!html.includes('banco unificado'));assert(!html.includes('recorte do edital'));
  assert.match(html,/name="banks" value="eca" checked/);assert.doesNotMatch(html,/name="banks" value="rju" checked/);
  assert.equal(JSON.stringify(banks),before);
  assert.equal((sessionSetupView({banks,modes}).match(/value="(?:rju|eca)" checked/g)||[]).length,2);
});

test('bancos genéricos e mistos conservam seus nomes e textos importados são escapados',()=>{
  const generic={...base,id:'mixed',name:'Lei 8.112/1990 e ECA'},unsafe={...base,id:'safe-id',name:'<script>alert(1)</script>'};
  const html=sessionSetupView({banks:[generic,unsafe],modes,mode:'subject'});
  assert(html.includes(`<strong>${generic.name}</strong>`));assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));
  assert.match(html,/id="session-filters" open/);
  assert.doesNotMatch(sessionSetupView({banks,modes}),/id="session-filters" open/);
});

test('resumo considera bancos, filtros e progresso reais sem alterar dados e limita a sessão ao disponível',()=>{
  const model=derive(banks.map(bank=>({id:bank.id,type:'bank',bank,at:'2026-10-15T00:00:00Z'})));
  const options={mode:'smart',banks:['eca'],count:50},snapshot=JSON.stringify(model.answers);
  assert.deepEqual(sessionSetupStatus(model,options),{available:10,count:10,validCount:true,canStart:true,banks:1});
  const q=model.questions.find(q=>q.bankId==='eca');model.flags.set(q.key,{favorite:true});
  assert.equal(sessionSetupStatus(model,{...options,mode:'favorites'}).count,1);
  assert.equal(sessionSetupStatus(model,{...options,discipline:'Conteúdo ausente'}).canStart,false);
  assert.equal(sessionSetupStatus(model,{...options,banks:[]}).available,0);
  assert.equal(sessionSetupStatus(model,{...options,mode:'errors'}).canStart,false);
  assert.equal(JSON.stringify(model.answers),snapshot);
});

test('quantidade inválida não libera o início nem mostra uma quantidade fictícia',()=>{
  const model=derive([{id:'bank',type:'bank',bank:base,at:'2026-10-15T00:00:00Z'}]);
  for(const count of ['',0,-1,1.5,5001,NaN,Infinity]){const result=sessionSetupStatus(model,{banks:[base.id],count});assert.equal(result.canStart,false);assert.equal(result.validCount,false);assert.equal(result.count,0);}
  assert.equal(sessionSetupStatus(model,{banks:[base.id],count:1}).count,1);
});
