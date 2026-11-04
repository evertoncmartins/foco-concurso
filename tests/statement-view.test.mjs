import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {formatQuestionStatement} from '../src/statement-view.mjs';

test('separa a introdução e cada afirmação, mesmo quando vierem na mesma linha',()=>{
  const text='Analise as afirmativas e preencha os parênteses, de cima para baixo: ( ) Primeira afirmação. ( ) Segunda afirmação. ( ) Terceira afirmação.';
  assert.equal(formatQuestionStatement(text),'Analise as afirmativas e preencha os parênteses, de cima para baixo:\n\n( ) Primeira afirmação.\n\n( ) Segunda afirmação.\n\n( ) Terceira afirmação.');
});

test('une linhas da mesma frase, preserva parágrafos e não acumula linhas ao formatar novamente',()=>{
  const text='Analise:\n\n( ) Primeira afirmação,\ncom uma continuação.\n\n( ) Segunda afirmação.\n\nEscolha a sequência correta.';
  const expected='Analise:\n\n( ) Primeira afirmação, com uma continuação.\n\n( ) Segunda afirmação.\n\nEscolha a sequência correta.';
  assert.equal(formatQuestionStatement(text),expected);
  assert.equal(formatQuestionStatement(expected),expected);
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

test('questão da imagem tem texto corrido em cada assertiva e espaço após I., II., III. e IV.',async()=>{
  const bank=JSON.parse(await readFile(new URL('../public/data/question-banks/lei-9394.json',import.meta.url),'utf8'));
  const text=bank.questions.find(q=>q.id==='ldb-q1023573').statement;
  const expected=[
    'Em consonância com a Lei Federal no 9.394/96 - LDB, a formação dos profissionais da educação, de maneira que atenda às especificidades do exercício de suas atividades, bem como aos objetivos das diferentes etapas e modalidades da educação básica, terá como fundamentos:',
    'I. a associação entre teorias e práticas, mediante estágios supervisionados e capacitação em serviço;',
    'II. o aproveitamento da formação e experiências anteriores, em instituições de ensino e em outras atividades;',
    'III. a realização de atividades - meio necessárias ao funcionamento dos sistemas de ensino;',
    'IV. a presença de sólida formação básica, que propicie o conhecimento dos fundamentos científicos e sociais de suas competências de trabalho.',
    'Considerando essas assertivas, estão corretas:'
  ].join('\n\n');
  assert.equal(formatQuestionStatement(text),expected);
  assert.equal(formatQuestionStatement(expected),expected);
});

test('formata sequências romanas com ponto, parênteses e traços, incluindo IX e X',()=>{
  for(const marker of [n=>`${n}.`,n=>`${n})`,n=>`(${n})`,n=>`${n}-`,n=>`${n} –`,n=>`${n} —`,n=>`${n}:`]){
    const labels=['I','II','III','IV','V','VI','VII','VIII','IX','X','XI'];
    const assertions=labels.map(n=>`${marker(n)} Afirmação ${n}.`);
    const expected=`Analise:\n\n${assertions.join('\n\n')}`;
    assert.equal(formatQuestionStatement(`Analise: ${assertions.join(' ')}`),expected);
    assert.equal(formatQuestionStatement(expected),expected);
  }
  assert.equal(formatQuestionStatement('Analise: I.Primeira;II.Segunda;III.Terceira.'),'Analise:\n\nI. Primeira;\n\nII. Segunda;\n\nIII. Terceira.');
});

test('preserva citações romanas em prosa e referências dentro das assertivas',()=>{
  for(const text of ['O capítulo II - da Educação Básica e o título III - da Educação tratam da matéria.','O inciso I. A referência continua no inciso II. O texto prossegue.','Considere I, II e III. Marque V ou F.','Os itens (I), (II) e (III) foram citados.','O Colégio Pedro II integra a rede. Anexo IV.','C. Texto sem enumeração romana.'])assert.equal(formatQuestionStatement(text),text);
  const text='No capítulo II - da Educação Básica, analise: I. Observe o inciso II. A primeira assertiva continua. II. Segunda assertiva. III. Terceira.';
  assert.equal(formatQuestionStatement(text),'No capítulo II - da Educação Básica, analise:\n\nI. Observe o inciso II. A primeira assertiva continua.\n\nII. Segunda assertiva.\n\nIII. Terceira.');
});

test('une continuação de assertivas, mantém parênteses vazios e deixa escape a cargo da exibição',()=>{
  const text='Analise: I. Texto\ncom continuação e <strong>marcação</strong>. II. ( ) Primeiro julgamento. ( ) Segundo julgamento.';
  const expected='Analise:\n\nI. Texto com continuação e <strong>marcação</strong>.\n\nII.\n\n( ) Primeiro julgamento.\n\n( ) Segundo julgamento.';
  assert.equal(formatQuestionStatement(text),expected);
  assert.equal(formatQuestionStatement(expected),expected);
});

test('une quebras de PDF em todo enunciado e conserva listas numéricas, alfabéticas e parágrafos',()=>{
  const text='A educação\r\nprofissional tem objetivos.\r\n\r\nCompare as regras:\r\n1. Primeira regra com\r\ncontinuação.\r\n2. Segunda regra.\r\na) Primeiro grupo com\r\ncontinuação.\r\nb) Segundo grupo.\r\n• Primeiro ponto\r\ncom continuação.\r\n• Segundo ponto.';
  const expected='A educação profissional tem objetivos.\n\nCompare as regras:\n1. Primeira regra com continuação.\n2. Segunda regra.\na) Primeiro grupo com continuação.\nb) Segundo grupo.\n• Primeiro ponto com continuação.\n• Segundo ponto.';
  assert.equal(formatQuestionStatement(text),expected);
  assert.equal(formatQuestionStatement(expected),expected);
});

test('normaliza marcadores compactos e linhas de continuação sem alterar citações ou palavras',()=>{
  for(const marker of [n=>`${n}.`,n=>`${n})`,n=>`(${n})`,n=>`${n}-`,n=>`${n}–`,n=>`${n}—`,n=>`${n}:`,n=>`${n},`]){
    const text=`Analise:\n${marker('I')}a primeira\nafirmação.\n${marker('II')}a segunda\nafirmação.\n${marker('III')}a terceira afirmação.\nQual é a resposta?`;
    const expected=`Analise:\n\n${marker('I')} a primeira afirmação.\n\n${marker('II')} a segunda afirmação.\n\n${marker('III')} a terceira afirmação.\n\nQual é a resposta?`;
    assert.equal(formatQuestionStatement(text),expected);
    assert.equal(formatQuestionStatement(expected),expected);
    assert.equal(expected.replace(/\s/g,''),text.replace(/\s/g,''));
  }
});
