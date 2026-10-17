const laws=[
  {key:'8112',matches:name=>/\b8\.?112\b/u.test(name),name:'Lei nº 8.112/1990',subtitle:'Servidores públicos federais',description:'Estabelece as regras da vida funcional dos servidores públicos civis federais: ingresso, movimentação, direitos, deveres e responsabilidades no serviço público.',url:'https://www.planalto.gov.br/ccivil_03/leis/l8112compilado.htm'},
  {key:'8069',matches:name=>/\b8\.?069\b|\bECA\b|Estatuto da Criança e do Adolescente/iu.test(name),name:'Lei nº 8.069/1990',subtitle:'Estatuto da Criança e do Adolescente',description:'Protege os direitos de crianças e adolescentes e define responsabilidades da família, da sociedade e do poder público para garantir seu desenvolvimento, sua dignidade e sua proteção integral.',url:'https://www.planalto.gov.br/ccivil_03/leis/l8069.htm'},
  {key:'9394',matches:name=>/\b9\.?394\b|\bLDB\b|Diretrizes e Bases da Educação Nacional/iu.test(name),name:'Lei nº 9.394/1996',subtitle:'Diretrizes e bases da educação nacional',description:'Estabelece as diretrizes e bases da educação nacional: direito à educação, organização dos sistemas de ensino, níveis e modalidades, currículo e formação dos profissionais da educação.',url:'https://www.planalto.gov.br/ccivil_03/leis/l9394compilado.htm'}
];


// Shared naming for banks, questions, filters and history.
// Preserve imported names/IDs; format only a single, explicitly identified law.
function originalPresentation(bank){
  const name=String(bank.name||''),matched=laws.filter(l=>l.matches(name));
  const disciplines=[...new Set((bank.questions||[]).map(q=>q.discipline).filter(Boolean))];
  const fallback={law:null,title:name,subtitle:disciplines.join(' · ')||'Banco de questões'};
  const explicit=[...name.matchAll(/\bLei\s+(?:n[º°o.]?\s*)?(\d+(?:\.\d+)*)\s*\/\s*(\d{4})\b/giu)].filter(m=>!/Decreto\s*[-–—]\s*$/iu.test(name.slice(0,m.index)));
  const normalizeNumber=n=>n.replace(/\./g,'').replace(/^0+(?=\d)/u,'').replace(/\B(?=(\d{3})+(?!\d))/gu,'.');
  const identified=new Set(explicit.map(m=>`Lei nº ${normalizeNumber(m[1])}/${m[2]}`));
  if(matched.length>1||identified.size>1)return fallback;
  const law=matched.length===1?matched[0]:null;
  const title=[...identified][0]||law?.name;
  if(!title)return fallback;
  if(law&&title===law.name)return {law,title,subtitle:law.subtitle};
  const match=explicit[0],trim=v=>v.replace(/^[\s·:—–-]+|[\s·:—–-]+$/gu,'');
  const suffix=match?trim(name.slice(match.index+match[0].length)):'';
  const prefix=match?trim(name.slice(0,match.index)):'';
  const useful=v=>v.length>5&&!/^(?:banco|questões|unificado|recorte|edital|títulos|capítulos|arts?\.)\b/iu.test(v);
  return {law:null,title,subtitle:useful(suffix)?suffix:useful(prefix)?prefix:fallback.subtitle};
}

export function bankPresentation(bank){const original=originalPresentation(bank);return {...original,title:bank.displayName||original.title,subtitle:bank.subtitle||original.subtitle};}
