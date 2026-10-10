import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateBank,validateEvents} from '../src/engine.mjs';
import {Store} from '../src/store.mjs';
import {TemporaryStorage} from '../src/temporary-storage.mjs';
import {questionOriginBadges,questionSourceDetails} from '../src/question-origin.mjs';

const base=JSON.parse(await readFile(new URL('../src/lei-8112.json',import.meta.url)));
function fixture(){
  const bank=structuredClone(base);bank.questions=bank.questions.slice(0,1);
  Object.assign(bank.questions[0],{instituicao:'IFSP',ano:2026,tag:'IFSP-2026',banca:'Comissão do IFSP',cargo:'Cargo de teste',nivelCargo:'Superior',tipo:'Adaptada de prova oficial',fundamentoLegal:'Art. 8º, II',atualizacaoLegislativa:'Conferida em 2026.',fonte:{prova:'https://example.test/prova.pdf',gabarito:'https://example.test/final.pdf',editalUrl:'https://example.test/concurso',editalDocumento:'https://example.test/edital.pdf',edital:'253/2025',questaoOriginal:12,paginaProva:7,paginaGabarito:1,observacao:'Gabarito após recursos.',dataProva:'2026-01-25',consultaEm:'2026-10-10',statusGabarito:'Definitivo',gabaritoOriginal:'B',unknown:'discard'}});
  return bank;
}

test('origem sobrevive à importação, recarga, exportação e restauração do progresso',async()=>{
  const bank=validateBank(fixture()),storage=new TemporaryStorage(),store=new Store(storage);
  assert.equal(bank.questions[0].fonte.unknown,undefined);
  await store.add([{type:'bank',bank}]);
  const reloaded=new Store(storage),restored=new Store(new TemporaryStorage());
  await restored.merge(validateEvents(reloaded.export()));
  assert.deepEqual(restored.model().questions[0].fonte,bank.questions[0].fonte);
  for(const field of ['instituicao','ano','tag','banca','cargo','nivelCargo','tipo','fundamentoLegal','atualizacaoLegislativa'])assert.equal(restored.model().questions[0][field],bank.questions[0][field]);
});

test('fontes executáveis, credenciais em URLs, datas inválidas e tags inconsistentes são recusadas',()=>{
  for(const update of [q=>q.fonte.prova='javascript:alert(1)',q=>q.fonte.gabarito='https://user:secret@example.test/key',q=>q.ano='2026',q=>q.ano=1800,q=>q.tag='IFSP-2025',q=>q.fonte.paginaProva=0,q=>q.fonte.consultaEm='2026-02-30',q=>q.fonte.gabaritoOriginal='Z',q=>q.fonte=[]]){
    const bank=fixture();update(bank.questions[0]);assert.throws(()=>validateBank(bank));
  }
});

test('bancos anteriores não recebem uma falsa origem de concurso',()=>{
  const q=validateBank(base).questions[0];assert.equal(q.instituicao,undefined);assert.equal(questionOriginBadges(q),'');
  assert.match(questionOriginBadges({...q,tags:['IFSC-2019']}),/>IFSC-2019</);
});

test('badges e referências escapam metadados e identificam adaptação sem revelar o gabarito',()=>{
  const q=fixture().questions[0];q.cargo='Teste "<script>alert(1)</script>';q.tag='IFSP-2026';
  const badges=questionOriginBadges(q);assert.match(badges,/badge origin/);assert.match(badges,/>Adaptada</);assert(!badges.includes('<script>'));assert(!badges.includes('final.pdf'));assert(!badges.includes('Gabarito'));
  const details=questionSourceDetails(q);assert.match(details,/Questão original 12/);assert.match(details,/Página 7 do PDF/);assert.match(details,/Gabarito definitivo/);assert.match(details,/rel="noopener noreferrer"/);assert(!details.includes('<script>'));
});
