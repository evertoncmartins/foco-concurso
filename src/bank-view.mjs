import {icon} from './icons.mjs';
import {sourceTag,sourceType} from './bank-source.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plural=(n,one,many)=>n===1?one:many;
const compare=(a,b)=>a.localeCompare(b,'pt-BR',{numeric:true,sensitivity:'base'});
const titles={I:'Disposições preliminares',II:'Provimento, vacância e movimentação',III:'Direitos e vantagens',IV:'Regime disciplinar',V:'Processo administrativo disciplinar',VI:'Seguridade social',VII:'Disposições gerais',VIII:'Disposições transitórias e finais'};
import {bankPresentation} from './bank-names.mjs';
export {bankPresentation} from './bank-names.mjs';

function origin(q){
  const tag=[q.tag,...(q.tags||[])].find(t=>/^[A-Z][A-Z0-9.-]*-[12]\d{3}$/.test(t||''));
  const match=tag?.match(/^(.+)-(\d{4})$/);
  const institution=String(q.instituicao||match?.[1]||'').trim();
  const rawYear=q.ano??match?.[2],year=rawYear==null?null:Number(rawYear);
  return {institution:/^(?:não informad[ao]|desconhecid[ao])\b/iu.test(institution)?'':institution,year:Number.isInteger(year)&&year>=1900&&year<=2200?year:null};
}
function subject(q,law){
  if(law?.key==='8112'){
    const title=q.tags?.map(t=>t.match(/^Título (I|II|III|IV|V|VI|VII|VIII)$/u)?.[1]).find(Boolean);
    if(titles[title])return titles[title];
  }
  if(law?.key==='8069'){
    const article=q.tags?.map(t=>t.match(/^ECA\s*[—–-]\s*art\.\s*(\d+)/u)?.[1]).find(Boolean);
    const n=Number(article);
    if(n>=1&&n<=6)return 'Disposições preliminares';
    if(n>=7&&n<=14)return 'Vida e saúde';
    if(n>=15&&n<=18)return 'Liberdade, respeito e dignidade';
    if(n>=19&&n<=24)return 'Convivência familiar e comunitária';
    if(n>=53&&n<=58)return 'Educação, cultura, esporte e lazer';
    if(n>=131&&n<=140)return 'Conselho Tutelar';
  }
  const label=String(q.subject||'').trim();
  return (!label||/^(?:Lei (?:nº )?8\.?112\/1990|Estatuto da Criança e do Adolescente\s*[—–-]\s*Lei 8\.?069\/1990)$/iu.test(label)?q.topic:label)||'Outros assuntos';
}
function counts(map){return [...map.values()].sort((a,b)=>b.count-a.count||compare(a.label,b.label));}
function add(map,label){const key=label.toLocaleUpperCase('pt-BR');const entry=map.get(key)||{label,count:0};entry.count++;map.set(key,entry);}

export function bankOverviewData(bank){
  const presentation=bankPresentation(bank),law=presentation.law;
  const institutions=new Map(),subjects=new Map(),years=[];
  let missingInstitutions=0,missingYears=0;
  for(const q of bank.questions){
    const metadata=origin(q);
    if(metadata.institution)add(institutions,metadata.institution);else missingInstitutions++;
    if(metadata.year!==null)years.push(metadata.year);else missingYears++;
    add(subjects,subject(q,law));
  }
  const firstYear=years.length?Math.min(...years):null,lastYear=years.length?Math.max(...years):null;
  const period=firstYear===null?'Não informado':firstYear===lastYear?`${firstYear}`:`${firstYear}–${lastYear}`;
  const disciplines=[...new Set(bank.questions.map(q=>q.discipline).filter(Boolean))];
  return {...presentation,institutions:counts(institutions),subjects:counts(subjects),disciplines,firstYear,lastYear,period,missingInstitutions,missingYears,total:bank.questions.length};
}

export function bankCardView(bank,{detailsOpen=false,index=0,association=null}={}){
  const panelId=`bank-details-${index}`,overview=bankOverviewData(bank);
  const {law,institutions,subjects,disciplines,total,period,missingInstitutions,missingYears}=overview;
  const detailLabel=detailsOpen?'Ocultar detalhes':'Ver mais detalhes';
  const {title,subtitle}=overview;
  const description=sourceType(bank)==='system'&&bank.description?.trim()?bank.description:law?.description||`Questões ${disciplines.length?`de ${disciplines.join(' e ')}`:'para concursos públicos'} para praticar e revisar os assuntos apresentados abaixo.`;
  return `<article class="card bank-card ${bank.enabled?'':'disabled'}" aria-label="${esc(bank.displayName||bank.name)}">
    <header class="bank-heading">
      <div class="bank-heading-top"><span class="bank-symbol">${icon('book',20)}</span>${sourceTag(bank)}<span class="bank-status ${bank.enabled?'is-active':''}"><span aria-hidden="true"></span>${bank.enabled?'Ativo':'Desativado'}</span></div>
      <div class="bank-title"><h3 title="${esc(bank.displayName||bank.name)}">${esc(title)}</h3><p>${esc(subtitle)}</p></div>
    </header>
    <dl class="bank-stats" aria-label="Resumo do conteúdo">
      <div><dt>Questões</dt><dd>${total}</dd></div>
      <div><dt>${plural(institutions.length,'Instituição','Instituições')}</dt><dd>${institutions.length||'—'}</dd></div>
      <div class="bank-period"><dt>Provas</dt><dd>${period==='Não informado'?'—':esc(period)}</dd></div>
    </dl>
    <div class="bank-primary-actions">
      <button class="btn small primary" data-action="start" data-bank="${esc(bank.id)}" ${bank.enabled?'':'disabled'}>Estudar ${icon('arrow',14)}</button>
      <button class="bank-details-toggle" data-action="bank-details" data-bank="${esc(bank.id)}" aria-expanded="${detailsOpen}" aria-controls="${panelId}" aria-label="${detailLabel} de ${esc(bank.displayName||bank.name)}"><span class="bank-details-label">${detailLabel}</span><svg class="bank-details-chevron" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
    </div>
    ${bank.linkedTo?`<div class="bank-progress-link"><p>Progresso associado a <strong>${esc(bank.linkedTo.displayName)}</strong>, do Sistema. Suas sessões anteriores continuam disponíveis.</p></div>`:association?`<div class="bank-progress-link"><p>Este conteúdo também está em <strong>${esc(association.displayName||association.name)}</strong>, do Sistema. Continue seus estudos com o progresso que já fez.</p><button class="btn small" data-action="bank-associate" data-bank="${esc(bank.id)}" data-target="${esc(association.id)}">Associar progresso ${icon('arrow',14)}</button></div>`:''}
    <div class="bank-details-panel" id="${panelId}" ${detailsOpen?'':'hidden'}>
      <section class="bank-detail-section"><h4>${law?'Sobre a lei':'Sobre o conteúdo'}</h4><p class="bank-about">${esc(description)}</p>${law?`<a class="bank-law-link" href="${law.url}" target="_blank" rel="noopener noreferrer">Ler a lei ${icon('arrow',13)}</a>`:''}</section>
      <section class="bank-detail-section"><h4>Assuntos abordados <span>${subjects.length}</span></h4><p class="bank-section-note">Questões por assunto principal</p><ul class="bank-subject-list">${subjects.map(s=>`<li><span>${esc(s.label)}</span><strong>${s.count}<span class="bank-count-unit"> ${plural(s.count,'questão','questões')}</span></strong></li>`).join('')}</ul></section>
      <section class="bank-detail-section"><h4>Instituições de origem <span>${institutions.length}</span></h4>${institutions.length?`<ul class="bank-institution-list">${institutions.map(i=>`<li><span>${esc(i.label)}</span><strong>${i.count}<span class="bank-count-unit"> ${plural(i.count,'questão','questões')}</span></strong></li>`).join('')}</ul>`:'<p class="bank-section-note">Instituições não informadas nas questões.</p>'}${missingInstitutions&&institutions.length?`<p class="bank-section-note">${missingInstitutions} ${plural(missingInstitutions,'questão sem instituição informada','questões sem instituição informada')}.</p>`:''}</section>
      <div class="bank-period-note">${icon('clock',14)}<span>Período das provas: <strong>${esc(period)}</strong>${missingYears&&overview.firstYear!==null?` · ${missingYears} ${plural(missingYears,'questão sem ano informado','questões sem ano informado')}`:''}</span></div>
      <div class="bank-management">
        ${bank.linkedTo?`<button class="btn small" data-action="bank-unlink" data-bank="${esc(bank.id)}">Desfazer associação</button>`:`<button class="btn small" data-action="bank-toggle" data-bank="${esc(bank.id)}">${bank.enabled?'Desativar':'Ativar'} banco</button>`}
        <div class="bank-file-actions">
          ${sourceType(bank)==='personal'?`<button class="btn small ghost" data-action="bank-rename" data-bank="${esc(bank.id)}">Renomear</button>`:''}
          <button class="icon-btn" data-action="bank-export" data-bank="${esc(bank.id)}" aria-label="Exportar ${esc(bank.displayName||bank.name)}" title="Exportar JSON">${icon('download',17)}<span class="bank-action-label">Exportar</span></button>
          ${sourceType(bank)==='personal'?`<button class="icon-btn" data-action="bank-delete" data-bank="${esc(bank.id)}" aria-label="Excluir ${esc(bank.displayName||bank.name)}" title="Excluir banco">${icon('trash',17)}<span class="bank-action-label">Excluir</span></button>`:''}
        </div>
      </div>
    </div>
  </article>`;
}
