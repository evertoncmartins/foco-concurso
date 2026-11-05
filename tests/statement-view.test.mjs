import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {formatQuestionStatement,formatQuestionText} from '../src/statement-view.mjs';

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
  const expected='Analise:\n\nI. Texto com continuação e <strong>marcação</strong>.\n\nII. ( ) Primeiro julgamento.\n\n( ) Segundo julgamento.';
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

test('comando da questão da imagem fica fora do item IV, inclusive em snapshots com o erro antigo',async()=>{
  const bank=JSON.parse(await readFile(new URL('../public/data/question-banks/lei-9394.json',import.meta.url),'utf8'));
  const q=bank.questions.find(q=>q.id==='ldb-q713015'),command='Considerando as afirmativas acima, marque a alternativa correta:';
  assert.equal(q.correctOption,'A');assert(q.statement.includes('histórico-políticos'));
  const old=q.statement.replace('histórico-políticos','históricopolíticos');
  const formatted=formatQuestionStatement(old),paragraphs=formatted.split('\n\n');
  assert.equal(paragraphs.at(-1),command);
  assert(paragraphs.at(-2).startsWith('IV. A compreensão dos fundamentos histórico-políticos'));
  assert(paragraphs.at(-2).endsWith('no ensino de cada disciplina.'));
  assert.equal(formatQuestionStatement(formatted),formatted);
  assert.equal(formatQuestionStatement(q.statement),formatted);
});

test('comandos finais das outras leis se separam mesmo na mesma linha ou após continuação do PDF',()=>{
  const prompts=['Considerando as afirmativas acima, marque a alternativa correta:','Após a análise dos itens acima, assinale a alternativa correta:','Diante das afirmativas, assinale a alternativa correta:','Com base nas afirmativas anteriores, marque a opção correta:','Sobre as alternativas é CORRETO afirmar que:','Está correto o que se afirma em:','Está INCORRETO o que se afirma em:','Está(ão) correto(s) o(s) itens:','Estão CORRETAS, apenas, as afirmativas','É correto o que está contido em','Quais afirmações estão corretas?','Qual sequência é correta?','Assinale a alternativa correta.','Marque a sequência correta:','A sequência CORRETA é:'];
  for(const prompt of prompts){
    const text=`Analise: I. Primeira afirmação. II. Segunda afirmação com\ncontinuação. ${prompt}`;
    const expected=`Analise:\n\nI. Primeira afirmação.\n\nII. Segunda afirmação com continuação.\n\n${prompt}`;
    assert.equal(formatQuestionStatement(text),expected,prompt);
    assert.equal(formatQuestionStatement(expected),expected,prompt);
  }
  assert.equal(formatQuestionStatement('Analise: I. Está correto garantir o acesso. II. Considerando as necessidades do aluno, o ensino deve se adaptar.'),'Analise:\n\nI. Está correto garantir o acesso.\n\nII. Considerando as necessidades do aluno, o ensino deve se adaptar.');
});

test('correções editoriais são restritas e não inventam separações em palavras válidas ou mudam o distrator',()=>{
  assert.equal(formatQuestionText('históricopolíticos, afrobrasileira, didáticoescolar, pósgraduação e sulamericano.'),'histórico-políticos, afro-brasileira, didático-escolar, pós-graduação e sul-americano.');
  assert.equal(formatQuestionText('Averificação de Jovens eAdultos, Científica eTecnológica: vincularse, efetuandose e percebese.'),'A verificação de Jovens e Adultos, Científica e Tecnológica: vincular-se, efetuando-se e percebe-se.');
  assert.equal(formatQuestionText('I, Ile III; |l, III e IV; pós- graduação; sendo- lhes.'),'I, II e III; II, III e IV; pós-graduação; sendo-lhes.');
  const valid='socioeconômico, comunidade, administrativa, sobrepeso, multicampi e histórico-políticos.';
  assert.equal(formatQuestionText(valid),valid);
  assert.equal(formatQuestionText('HISTÓRICOPOLÍTICOS; Históricopolíticos'),'HISTÓRICO-POLÍTICOS; Histórico-políticos');
  const bare='Finalidades:\nla consolidação do conhecimento; II a preparação para o trabalho; III o\naprimoramento humano; IV a compreensão dos processos.';
  const fixed='Finalidades:\n\nI. a consolidação do conhecimento;\n\nII. a preparação para o trabalho;\n\nIII. o aprimoramento humano;\n\nIV. a compreensão dos processos.';
  assert.equal(formatQuestionStatement(bare),fixed);assert.equal(formatQuestionStatement(fixed),fixed);
});

test('cada afirmativa com parênteses ganha parágrafo sem modificar o marcador, inclusive ponto e barra do OCR',()=>{
  const text='() Primeira afirmativa. () Segunda afirmativa. () Terceira afirmativa. () Quarta afirmativa.';
  const expected='() Primeira afirmativa.\n\n() Segunda afirmativa.\n\n() Terceira afirmativa.\n\n() Quarta afirmativa.';
  assert.equal(formatQuestionStatement(text),expected);assert.equal(formatQuestionStatement(expected),expected);
  const mixed='Leia as afirmativas: () Primeira. (.) Segunda. (/) Terceira. ( . ) Quarta. ( / ) Quinta. ( ) Sexta.';
  const formatted='Leia as afirmativas:\n\n() Primeira.\n\n(.) Segunda.\n\n(/) Terceira.\n\n( . ) Quarta.\n\n( / ) Quinta.\n\n( ) Sexta.';
  assert.equal(formatQuestionStatement(mixed),formatted);
  assert.equal(formatted.replace(/\s/g,''),mixed.replace(/\s/g,''));
  assert.equal(formatQuestionStatement(formatted),formatted);
});

test('questão ldb-q584266 da imagem mostra quatro afirmativas e o comando, com os parênteses originais',async()=>{
  const bank=JSON.parse(await readFile(new URL('../public/data/question-banks/lei-9394.json',import.meta.url),'utf8'));
  const q=bank.questions.find(q=>q.id==='ldb-q584266'),before=structuredClone(q),text=formatQuestionStatement(q.statement);
  const paragraphs=text.split('\n\n'),assertions=paragraphs.filter(p=>/^\([\s./]*\)/.test(p));
  assert.equal(assertions.length,4);assert.deepEqual(assertions.map(p=>p.match(/^\([^)]*\)/)[0]),['()','()','(.)','(/)']);
  assert(paragraphs.at(-1).startsWith('Assinale a alternativa que contemple'));
  for(const assertion of assertions)assert(!assertion.includes('\n'));
  assert.equal(text.replace(/\s/g,''),q.statement.replace(/\s/g,''));
  assert.equal(formatQuestionStatement(text),text);assert.deepEqual(q,before);
});

test('parênteses em funções, matemática, citações, referências e lacunas posteriores não viram início de afirmativa',()=>{
  const examples=[
    'Calcule f() e g(). A soma será f() + g().',
    'Resolva: () + () = 2. Calcule (2 + 3) × (4 + 5).',
    'Na expressão: (.) representa multiplicação e (/) representa divisão.',
    'Leia a citação: “() texto citado. () continuação da citação.”',
    'O autor menciona afirmativas na citação: "() texto citado. () continuação."',
    'Os parênteses () aparecem na citação e () no comentário.',
    'Conforme a lei (art. 24), julgue os itens (I) e (II). Marque (V) ou (F).',
    'Analise: I. Primeira afirmação. ( ) II. Segunda afirmação. (.) III. Terceira afirmação. (/)',
  ];
  for(const text of examples){
    const formatted=formatQuestionStatement(text);
    if(text.startsWith('Analise: I.')){
      assert.equal(formatted,'Analise:\n\nI. Primeira afirmação. ( )\n\nII. Segunda afirmação. (.)\n\nIII. Terceira afirmação. (/)');
    }else assert.equal(formatted,text);
  }
});

test('rótulos romanos com parênteses ficam juntos e os exemplos de outros bancos mantêm uma afirmativa por parágrafo',async()=>{
  for(const [file,id,count] of [['lei-11892.json','l11892-qc-095',5],['lei-11892.json','l11892-qc-142',3],['lei-8069.json','eca-qconcursos-q753205',5],['lei-9394.json','ldb-q753169',4]]){
    const bank=JSON.parse(await readFile(new URL(`../public/data/question-banks/${file}`,import.meta.url),'utf8'));
    const q=bank.questions.find(q=>q.id===id),text=formatQuestionStatement(q.statement);
    assert.equal(text.split('\n\n').filter(p=>/^(?:[IVXLCDM]+[.)]?\s*)?\([\s./]*\)/.test(p)).length,count,id);
    assert(!/\b[IVXLCDM]+\.\s*\n\n\(/.test(text),id);
    assert.equal(text.replace(/\s/g,''),q.statement.replace(/\s/g,''),id);
    assert.equal(formatQuestionStatement(text),text,id);
  }
});
