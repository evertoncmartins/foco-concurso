import test from 'node:test';
import assert from 'node:assert/strict';
import {formatQuestionStatement} from '../src/statement-view.mjs';

test('separa a introdução e cada afirmação, mesmo quando vierem na mesma linha',()=>{
  const text='Analise as afirmativas e preencha os parênteses, de cima para baixo: ( ) Primeira afirmação. ( ) Segunda afirmação. ( ) Terceira afirmação.';
  assert.equal(formatQuestionStatement(text),'Analise as afirmativas e preencha os parênteses, de cima para baixo:\n\n( ) Primeira afirmação.\n\n( ) Segunda afirmação.\n\n( ) Terceira afirmação.');
});

test('preserva as quebras internas e não acumula linhas em enunciados já formatados',()=>{
  const text='Analise:\n\n( ) Primeira afirmação,\ncom uma continuação.\n\n( ) Segunda afirmação.\n\nEscolha a sequência correta.';
  assert.equal(formatQuestionStatement(text),text);
  assert.equal(formatQuestionStatement(formatQuestionStatement(text)),text);
});

test('reconhece marcadores compactos, tabulações e espaços não separáveis',()=>{
  const text='Analise:\r\n\r\n(\u00a0) Primeira.\t(\t) Segunda.() Terceira.';
  const expected='Analise:\n\n(\u00a0) Primeira.\n\n(\t) Segunda.\n\n() Terceira.';
  assert.equal(formatQuestionStatement(text),expected);
  assert.equal(formatQuestionStatement('( ) Afirmação única.'),'( ) Afirmação única.');
});

test('mantém parênteses preenchidos, letras, números e referências do texto original',()=>{
  const text='Julgue as alternativas (A), (B) e (C). O ECA (Lei nº 8.069/1990) protege crianças (art. 2º). Marque (V) ou (F).';
  assert.equal(formatQuestionStatement(text),text);
});

test('não trunca afirmações longas nem interpreta marcação HTML do banco',()=>{
  const body='Conteúdo extenso e íntegro. '.repeat(2000);
  const text=`Enunciado: ( ) ${body}<script>alert("teste")</script> ( ) Final.`;
  const result=formatQuestionStatement(text);
  assert.equal(result,`Enunciado:\n\n( ) ${body}<script>alert("teste")</script>\n\n( ) Final.`);
});
