import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {bankOverviewData,bankCardView} from '../src/bank-view.mjs';
import {validateBank} from '../src/engine.mjs';
import {questionIdentity} from '../src/bank-progress.mjs';

test('resumo usa origem e ano de cada questão, agrupa instituições e não inventa metadados ausentes',()=>{
  const bank={name:'Meu conteúdo',questions:[
    {instituicao:'IFSP',ano:2025,subject:'Redes',discipline:'Informática'},
    {instituicao:'ifsp',ano:2024,subject:'Redes',discipline:'Informática'},
    {tag:'UNIFAL-MG-2023',subject:'Segurança',discipline:'Informática'},
    {instituicao:'Não informado no PDF',subject:'Segurança',discipline:'Informática'},
    {ano:1800,subject:'Segurança',discipline:'Informática'}
  ]};
  const snapshot=JSON.stringify(bank),data=bankOverviewData(bank);
  assert.deepEqual(data.institutions,[{label:'IFSP',count:2},{label:'UNIFAL-MG',count:1}]);
  assert.deepEqual(data.subjects,[{label:'Segurança',count:3},{label:'Redes',count:2}]);
  assert.equal(data.period,'2023–2025');assert.equal(data.total,5);
  assert.equal(data.missingInstitutions,2);assert.equal(data.missingYears,2);
  assert.equal(JSON.stringify(bank),snapshot);
  assert.equal(bankOverviewData({name:'Sem origem',questions:[{subject:'Redes'}]}).period,'Não informado');
  assert.equal(bankOverviewData({name:'Um ano',questions:[{ano:2026}]}).period,'2026');
});

test('cada questão aparece uma vez no assunto principal, mesmo quando cita diversos dispositivos',()=>{
  const lei={name:'Lei nº 8.112/1990',questions:[
    {tags:['Título II','Lei 8.112/1990 — art. 13','Lei 8.112/1990 — art. 15']},
    {tags:['Título III']},{tags:['Título III']},{subject:'Remoção'}
  ]};
  const data=bankOverviewData(lei);
  assert.equal(data.subjects.reduce((n,s)=>n+s.count,0),4);
  assert.equal(data.subjects.find(s=>s.label==='Direitos e vantagens').count,2);
  const eca=bankOverviewData({name:'ECA',questions:[
    {tags:['ECA — art. 4º, § 1º','ECA — art. 53']},
    {tags:['ECA — art. 18-B']},{tags:['ECA — art. 136']},{tags:['ECA — art. 53']}
  ]});
  assert.equal(eca.subjects.length,4);assert.equal(eca.subjects.reduce((n,s)=>n+s.count,0),4);
  assert(eca.subjects.some(s=>s.label==='Conselho Tutelar'));
});

test('banco misto e conteúdo desconhecido mantêm apresentação genérica, sem atribuir uma lei indevida',()=>{
  assert.equal(bankOverviewData({name:'Lei 8.112/1990 e ECA',questions:[]}).law,null);
  assert.equal(bankOverviewData({name:'Matemática',questions:[]}).law,null);
  assert.equal(bankOverviewData({name:'Lei nº 8.069/1990',questions:[]}).law.key,'8069');
});

test('visão usa explicação breve da lei e metadados escapados, preservando a descrição original nos dados',()=>{
  const bank={id:'banco',enabled:true,name:'Lei 8.112/1990',description:'IMPLEMENTAÇÃO E CURADORIA: texto técnico original.',questions:[
    {instituicao:'<img src=x onerror=alert(1)>',ano:2025,subject:'<script>alert(1)</script>',discipline:'Direito Administrativo'}
  ]};
  const html=bankCardView(bank,{detailsOpen:true});
  assert(html.includes('Estabelece as regras da vida funcional'));
  assert(!html.includes('IMPLEMENTAÇÃO E CURADORIA'));assert.equal(bank.description,'IMPLEMENTAÇÃO E CURADORIA: texto técnico original.');
  assert(!html.includes('<img'));assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));
});

test('LDB usa o card de lei com assuntos temáticos, contagens e fonte oficial',async()=>{
  const bank={...validateBank(JSON.parse(await readFile(new URL('../public/data/question-banks/lei-9394.json',import.meta.url)))),sourceType:'system',enabled:true};
  const data=bankOverviewData(bank),html=bankCardView(bank,{detailsOpen:true});
  assert.equal(data.law.key,'9394');assert.equal(data.title,'Lei nº 9.394/1996');
  assert(data.subjects.length>=10);assert(data.subjects.every(s=>s.label!==bank.name&&s.count>0));
  for(const label of ['Educação profissional e tecnológica','Educação superior','Currículo e diversidade','Formação dos profissionais da educação'])assert(data.subjects.some(s=>s.label===label));
  assert.equal(data.subjects.reduce((sum,s)=>sum+s.count,0),bank.questions.length);
  assert.equal(data.institutions.reduce((sum,s)=>sum+s.count,0)+data.missingInstitutions,bank.questions.length);
  assert(html.includes('Sobre a lei'));assert(html.includes('Ler a lei'));assert(html.includes('https://www.planalto.gov.br/ccivil_03/leis/l9394compilado.htm'));
  assert(!html.includes('Triagem de'));assert(!html.includes('Não é inventário'));assert(!html.includes('Fontes:'));
  for(const q of bank.questions)assert.equal(questionIdentity(q),questionIdentity({...q,subject:bank.name}));
});

test('bancos nativos apresentam contagens reais e não usam o nome da lei como assunto do card',async()=>{
  const root=new URL('../public/data/question-banks/',import.meta.url);
  for(const file of await readdir(root))if(/^lei-\d+\.json$/.test(file)){
    const bank=validateBank(JSON.parse(await readFile(new URL(file,root)))),data=bankOverviewData(bank);
    assert.equal(data.total,bank.questions.length);
    assert.equal(data.subjects.reduce((sum,s)=>sum+s.count,0),data.total,file);
    assert(data.subjects.every(s=>s.label!==data.title),`${file}: classifique os assuntos pelo conteúdo, não pelo nome da lei`);
  }
});
