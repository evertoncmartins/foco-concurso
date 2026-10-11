const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const bounded=(value,label,max)=>{
  if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error(`${label}: informe um texto válido (até ${max} caracteres).`);
  return value.trim();
};
function https(value,label){
  const url=new URL(bounded(value,label,3000));
  if(url.protocol!=='https:'||url.username||url.password)throw new Error(`${label}: use uma URL HTTPS sem credenciais.`);
  return url.href;
}
function date(value,label){
  const result=bounded(value,label,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(result)||!Number.isFinite(Date.parse(result))||new Date(result).toISOString().slice(0,10)!==result)throw new Error(`${label}: use uma data válida AAAA-MM-DD.`);
  return result;
}

// Keep a bounded, explicit provenance record through import, export and Drive sync.
export function normalizeQuestionOrigin(question,label){
  const origin={};
  for(const [field,max] of Object.entries({instituicao:200,tag:100,banca:200,cargo:300,nivelCargo:200,tipo:200,fundamentoLegal:2000,atualizacaoLegislativa:2000})){
    if(question[field]!=null)origin[field]=bounded(question[field],`${label} ${field}`,max);
  }
  if(question.ano!=null){
    if(!Number.isInteger(question.ano)||question.ano<1900||question.ano>2100)throw new Error(`${label}: ano deve ser um número inteiro entre 1900 e 2100.`);
    origin.ano=question.ano;
  }
  if(origin.instituicao&&origin.ano&&origin.tag&&origin.tag!==`${origin.instituicao}-${origin.ano}`)throw new Error(`${label}: tag deve corresponder à instituição e ao ano da prova.`);
  if(question.fonte!=null){
    const source=question.fonte;
    if(typeof source!=='object'||Array.isArray(source))throw new Error(`${label}: fonte deve ser um objeto.`);
    origin.fonte={};
    for(const field of ['prova','gabarito','editalUrl','editalDocumento'])if(source[field]!=null)origin.fonte[field]=https(source[field],`${label} fonte ${field}`);
    for(const field of ['edital','statusGabarito'])if(source[field]!=null)origin.fonte[field]=bounded(source[field],`${label} fonte ${field}`,200);
    if(source.observacao!=null)origin.fonte.observacao=bounded(source.observacao,`${label} fonte observacao`,1000);
    for(const field of ['questaoOriginal','paginaProva','paginaGabarito'])if(source[field]!=null){
      if(!Number.isInteger(source[field])||source[field]<1||source[field]>10000)throw new Error(`${label}: fonte ${field} deve ser um inteiro de 1 a 10.000.`);
      origin.fonte[field]=source[field];
    }
    for(const field of ['dataProva','consultaEm'])if(source[field]!=null)origin.fonte[field]=date(source[field],`${label} fonte ${field}`);
    if(source.gabaritoOriginal!=null){
      if(!/^[A-H]$/.test(source.gabaritoOriginal))throw new Error(`${label}: fonte gabaritoOriginal deve ser A–H.`);
      origin.fonte.gabaritoOriginal=source.gabaritoOriginal;
    }
  }
  return origin;
}

export function questionOriginBadges(question,{showAdapted=true}={}){
  const tag=question.tag||(question.instituicao&&question.ano?`${question.instituicao}-${question.ano}`:question.tags?.find(value=>/^(?:IF[A-Z0-9]+|CEFET(?:-[A-Z]{2})?|UTFPR)-\d{4}$/i.test(value)));
  const title=[question.instituicao,question.ano,question.banca,question.cargo,question.nivelCargo].filter(Boolean).join(' · ')||tag;
  const adapted=/adapt/i.test(question.tipo||'');
  return `${tag?`<span class="badge origin" title="${escape(title)}" aria-label="Origem: ${escape(tag)}">${escape(tag)}</span>`:''}${adapted&&showAdapted?'<span class="badge" title="Texto adaptado de uma questão de prova. A fonte está no comentário.">Adaptada</span>':''}`;
}

export function questionSourceDetails(question){
  const source=question.fonte;
  if(!source&&!question.fundamentoLegal&&!question.atualizacaoLegislativa)return '';
  const metadata=[question.tipo,question.instituicao,question.ano,question.banca,question.cargo,question.nivelCargo,source?.edital?`Edital ${source.edital}`:'',source?.questaoOriginal?`Questão original ${source.questaoOriginal}`:'',source?.paginaProva?`Página ${source.paginaProva} do PDF`:''].filter(Boolean);
  const link=(url,label)=>url?`<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>`:'';
  return `<div class="question-source">${question.fundamentoLegal?`<p><strong>Fundamento legal:</strong> ${escape(question.fundamentoLegal)}</p>`:''}${question.atualizacaoLegislativa?`<p>${escape(question.atualizacaoLegislativa)}</p>`:''}${metadata.length?`<details><summary>Origem da questão</summary><p>${escape(metadata.join(' · '))}</p>${source?.paginaGabarito?`<p>Gabarito: página ${escape(source.paginaGabarito)} do PDF.</p>`:''}${source?.observacao?`<p>${escape(source.observacao)}</p>`:''}<div class="source-links">${[link(source?.prova,'Prova oficial'),link(source?.gabarito,source?.statusGabarito?`Gabarito ${source.statusGabarito.toLowerCase()}`:'Gabarito oficial'),link(source?.editalUrl,'Página do concurso'),link(source?.editalDocumento,'Edital oficial')].filter(Boolean).join(' · ')}</div></details>`:''}</div>`;
}
