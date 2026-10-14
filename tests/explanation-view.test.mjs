import test from 'node:test';
import assert from 'node:assert/strict';
import {explanationView} from '../src/explanation-view.mjs';

const options=[...'ABCD'].map(id=>({id,text:`Opção ${id}`}));
const letters=html=>[...html.matchAll(/<strong class="explanation-letter">([A-H])<\/strong>/g)].map(match=>match[1]);
const paragraphs=html=>[...html.matchAll(/<p class="explanation-paragraph">(.*?)<\/p>/gs)].map(match=>match[1]);
const unformatted=html=>html.replace(/<[^>]*>/g,'').replace(/\s+/g,'');

test('comentário da referência separa C, A, B e D sem confundir A acumulação',()=>{
  const text='C combina os requisitos legais: o primeiro período exige 12 meses de exercício, o servidor tem direito a 30 dias e a vantagem da função de direção, chefia ou assessoramento integra o cálculo do adicional de um terço, pago independentemente de pedido. A antecipa indevidamente as primeiras férias. B atribui 45 dias ao cargo administrativo sem hipótese legal especial. D exclui indevidamente a vantagem da função. A acumulação de até dois períodos depende de necessidade do serviço, ressalvadas hipóteses específicas; não é uma faculdade irrestrita do servidor.';
  const html=explanationView(text,options),parts=paragraphs(html);
  assert.deepEqual(letters(html),['C','A','B','D']);assert.equal(parts.length,4);
  assert.match(parts[3],/A acumulação de até dois períodos/);
  assert.equal(unformatted(html),text.replace(/\s+/g,''));
});

test('rótulos explícitos e quebras existentes são respeitados',()=>{
  for(const separator of [' ', '\n', '\r\n', '\n\n']){
    const text=`Introdução geral.${separator}Alternativa A: hipótese correta.${separator}B) hipótese incorreta.${separator}C. Outra hipótese.${separator}D — conclusão.`;
    const html=explanationView(text,options);
    assert.deepEqual(letters(html),['A','B','C','D']);assert.equal(paragraphs(html).length,5);
    assert.equal(unformatted(html),text.replace(/\s+/g,''));
  }
  assert.deepEqual(letters(explanationView('A: regra. A: complemento. B: outra regra.',options)),['A','A','B']);
});

test('explicações agrupadas permanecem juntas com cada letra destacada',()=>{
  for(const text of ['D descreve a desídia. A, B e C sintetizam deveres. A ressalva é essencial.','B corresponde à regra. A e C contêm erros. D troca os prazos. A cobrança exige atenção.']){
    const html=explanationView(text,options);
    assert.equal(paragraphs(html).length,text.startsWith('D')?2:3);
    assert.equal(unformatted(html),text.replace(/\s+/g,''));
    assert.equal(letters(html).filter(letter=>letter==='A').length,1);
  }
});

test('menções no meio da frase e artigos gramaticais não viram rótulos',()=>{
  const text='A sindicância pode terminar em arquivamento. A lei prevê advertência. A sequência é I, II e III. A nomeação consta na lei. A alternativa escolhida não é B. A mesma questão exige atenção. A responsabilidade civil decorre de dano.';
  const html=explanationView(text,options);
  assert.deepEqual(letters(html),[]);assert.equal(paragraphs(html).length,1);
  assert.equal(unformatted(html),text.replace(/\s+/g,''));
  assert.deepEqual(letters(explanationView('A é incorreta. B não corresponde. C omite requisito. D pressupõe estabilidade.',options)),['A','B','C','D']);
});

test('delimitadores compactos e todas as alternativas A–H são aceitos somente quando existem',()=>{
  const text='Regra geral. A descreve readaptação; C, reintegração; D, recondução. E: outra hipótese. H) último caso.';
  assert.deepEqual(letters(explanationView(text,options)),['A','C','D']);
  const all=[...'ABCDEFGH'].map(id=>({id}));
  assert.deepEqual(letters(explanationView(text,all)),['A','C','D','E','H']);
  assert.deepEqual(letters(explanationView('Alternativa A: regra. B: outra regra. C: regra.',[{id:'B'},{id:'C'}])),['B','C']);
  assert.deepEqual(letters(explanationView('A: regra. B: outra regra.')),[]);
});

test('HTML, atributos e entidades importados permanecem escapados',()=>{
  const text='A: <img src=x onerror=alert(1)> & "texto". B: </p><script>alert(1)</script> &#65;. C resume a regra. D é incorreta.';
  const html=explanationView(text,options);
  assert.deepEqual(letters(html),['A','B','C','D']);
  assert(!html.includes('<img'));assert(!html.includes('<script>'));assert(!html.includes('&#65;'));
  assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html,/&amp; &quot;texto&quot;/);assert.match(html,/&amp;#65;/);
});

test('comentários genéricos, parágrafos e conteúdos extensos não são cortados',()=>{
  assert.equal(explanationView('Primeiro parágrafo.\n\nSegundo parágrafo.'),'<div class="feedback-explanation"><p class="explanation-paragraph">Primeiro parágrafo.</p><p class="explanation-paragraph">Segundo parágrafo.</p></div>');
  const text='Texto completo sem marcador. '.repeat(10000),html=explanationView(text,options);
  assert.deepEqual(letters(html),[]);assert.equal(unformatted(html),text.replace(/\s+/g,''));
});
