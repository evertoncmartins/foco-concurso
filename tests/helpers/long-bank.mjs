// Synthetic content, never a real exam question or personal progress.
export function longBank({large=false}={}){
  const text='Texto longo de teste.\n'.repeat(1200)+'Fim.';
  return {schemaVersion:1,id:'teste-textos-longos',name:text,description:text,questions:[{
    id:'questao-longa',discipline:text,subject:text,topic:text,statement:text,
    options:[{id:'A',text:large?'á'.repeat(6*1024*1024)+'Fim.':text},{id:'B',text:'Outra alternativa.'}],
    correctOption:'A',explanation:text,difficulty:'medium',tags:[text],reference:{label:text,url:'https://example.test/referencia'},
    instituicao:text,ano:2026,tag:`${text}-2026`,banca:text,cargo:text,nivelCargo:text,tipo:text,
    fundamentoLegal:text,atualizacaoLegislativa:text,
    fonte:{prova:'https://example.test/'+ 'a'.repeat(3100),edital:text,statusGabarito:text,observacao:text,dataProva:'2026-10-14'}
  }]};
}
