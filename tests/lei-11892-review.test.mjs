import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateSystemBank,requireNativeFeedback} from '../src/system-banks.mjs';
import {bankOverviewData,bankCardView} from '../src/bank-view.mjs';

const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const raw=read('../public/data/question-banks/lei-11892.json');
const review=read('../docs/revisoes/lei-11892-2026-11-07.json');

test('revisão da Lei 11.892 retira a premissa superada sem perder IDs ou gabaritos retidos',()=>{
  const bank=requireNativeFeedback(validateSystemBank(raw));
  assert.equal(review.decisions.length,266);
  assert.equal(new Set(review.decisions.map(d=>d.id)).size,266);
  const excluded=review.decisions.filter(d=>d.status==='excluída');
  assert.deepEqual(excluded.map(d=>d.id),['l11892-qc-055']);
  assert.match(excluded[0].basis,/15\.367\/2026/);
  const retained=review.decisions.filter(d=>d.status==='mantida');
  assert.equal(bank.questions.length,265);
  assert.deepEqual(bank.questions.map(q=>[q.id,q.correctOption]),retained.map(d=>[d.id,d.correctOption]));
  const overview=bankOverviewData(bank);
  assert.equal(overview.subjects.reduce((sum,s)=>sum+s.count,0),265);
  assert.match(bankCardView(bank),/<dt>Questões<\/dt><dd>265<\/dd>/);
});

test('correção editorial mantém o conteúdo falso dos distratores',()=>{
  const q=raw.questions.find(q=>q.id==='l11892-q3972349');
  assert.match(q.statement,/horizontalização/);
  assert.doesNotMatch(q.statement,/horizontalizarão/);
  assert.equal(q.correctOption,'D');
  assert.match(q.explanation,/III — Falsa/);
  const upper=raw.questions.find(q=>q.id==='l11892-q3367958');
  assert.match(upper.options.find(o=>o.id==='B').text,/apenas no nível superior/);
  assert.equal(upper.correctOption,'A');
});
