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

export function bankCardView(bank,{detailsOpen=false,index=0,association=null,syncing=false,management=null}={}){
  const panelId=`bank-details-${index}`,overview=bankOverviewData(bank);
  const {law,institutions,subjects,disciplines,total,period,missingInstitutions,missingYears}=overview;
  const detailLabel=detailsOpen?'Ocultar detalhes':'Ver mais detalhes';
  const {title,subtitle}=overview;
  const description=sourceType(bank)==='system'&&bank.description?.trim()?bank.description:law?.description||`Questões ${disciplines.length?`de ${disciplines.join(' e ')}`:'para concursos públicos'} para praticar e revisar os assuntos apresentados abaixo.`;
  const enabled=bank.enabled&&!bank.unavailable;
  const muted=bank.unavailable||sourceType(bank)==='system'&&bank.active===false;
  return `<article class="card bank-card ${enabled?'':'disabled'}${muted?' bank-muted':''}" aria-label="${esc(bank.displayName||bank.name)}">
    <header class="bank-heading">
      <div class="bank-heading-top"><span class="bank-symbol">${icon('book',20)}</span>${sourceTag(bank)}<span class="bank-status ${enabled?'is-active':''}"><span aria-hidden="true"></span>${bank.pendingActivation?'A sincronizar':bank.unavailable?'Indisponível':enabled?'Ativo':'Desativado'}</span></div>
      <div class="bank-title"><h3 title="${esc(bank.displayName||bank.name)}">${esc(title)}</h3><p>${esc(subtitle)}</p></div>
    </header>
    <dl class="bank-stats" aria-label="Resumo do conteúdo">
      <div><dt>Questões</dt><dd>${bank.unavailable&&!total?'—':total}</dd></div>
      <div><dt>${plural(institutions.length,'Instituição','Instituições')}</dt><dd>${institutions.length||'—'}</dd></div>
      <div class="bank-period"><dt>Provas</dt><dd>${period==='Não informado'?'—':esc(period)}</dd></div>
    </dl>
    ${bank.pendingUpdate?`<div class="bank-update" role="status"><p><strong>${bank.pendingUpdate.kind==='added'?'Novo banco disponível':bank.pendingUpdate.kind==='removed'?'Banco retirado do catálogo':'Atualização disponível'}</strong><span>${bank.pendingUpdate.kind==='removed'?'Sincronize para atualizar sua lista.':[
      bank.pendingUpdate.added?`${bank.pendingUpdate.added} ${plural(bank.pendingUpdate.added,'questão nova','questões novas')}`:'',
      bank.pendingUpdate.changed?`${bank.pendingUpdate.changed} ${plural(bank.pendingUpdate.changed,'questão alterada','questões alteradas')}`:'',
      bank.pendingUpdate.removed?`${bank.pendingUpdate.removed} ${plural(bank.pendingUpdate.removed,'questão removida','questões removidas')}`:''
    ].filter(Boolean).join(' · ')||'Informações do banco atualizadas.'}</span></p><button class="btn small" data-action="sync-system-bank" data-bank="${esc(bank.id)}" ${syncing?'disabled':''}>${icon('repeat',14)} Sincronizar banco</button></div>`:''}
    ${bank.unavailable?'<p class="bank-unavailable-note">Este banco saiu do catálogo. Seus estudos e resultados continuam no histórico.</p>':''}
    <div class="bank-primary-actions">
      ${bank.unavailable?`<button class="btn small" data-action="bank-history" data-bank="${esc(bank.id)}">Ver sessões ${icon('clock',14)}</button>`:`<button class="btn small primary" data-action="start" data-bank="${esc(bank.id)}" ${enabled?'':'disabled'}>Estudar ${icon('arrow',14)}</button>`}
      <button class="bank-details-toggle" data-action="bank-details" data-bank="${esc(bank.id)}" aria-expanded="${detailsOpen}" aria-controls="${panelId}" aria-label="${detailLabel} de ${esc(bank.displayName||bank.name)}"><span class="bank-details-label">${detailLabel}</span><svg class="bank-details-chevron" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
    </div>
    ${bank.unavailable?`<button class="bank-remove-card text-link" data-action="bank-hide" data-bank="${esc(bank.id)}">${icon('trash',14)} Remover card</button>`:''}
    ${bank.linkedTo?`<div class="bank-progress-link"><p>Progresso associado a <strong>${esc(bank.linkedTo.displayName)}</strong>, do Sistema. Suas sessões anteriores continuam disponíveis.</p></div>`:association?`<div class="bank-progress-link"><p>Este conteúdo também está em <strong>${esc(association.displayName||association.name)}</strong>, do Sistema. Continue seus estudos com o progresso que já fez.</p><button class="btn small" data-action="bank-associate" data-bank="${esc(bank.id)}" data-target="${esc(association.id)}">Associar progresso ${icon('arrow',14)}</button></div>`:''}
    <div class="bank-details-panel" id="${panelId}" ${detailsOpen?'':'hidden'}>
      <section class="bank-detail-section"><h4>${law?'Sobre a lei':'Sobre o conteúdo'}</h4><p class="bank-about">${esc(description)}</p>${law?`<a class="bank-law-link" href="${law.url}" target="_blank" rel="noopener noreferrer">Ler a lei ${icon('arrow',13)}</a>`:''}</section>
      <section class="bank-detail-section"><h4>Assuntos abordados <span>${subjects.length}</span></h4><p class="bank-section-note">Questões por assunto principal</p><ul class="bank-subject-list">${subjects.map(s=>`<li><span>${esc(s.label)}</span><strong>${s.count}<span class="bank-count-unit"> ${plural(s.count,'questão','questões')}</span></strong></li>`).join('')}</ul></section>
      <section class="bank-detail-section"><h4>Instituições de origem <span>${institutions.length}</span></h4>${institutions.length?`<ul class="bank-institution-list">${institutions.map(i=>`<li><span>${esc(i.label)}</span><strong>${i.count}<span class="bank-count-unit"> ${plural(i.count,'questão','questões')}</span></strong></li>`).join('')}</ul>`:'<p class="bank-section-note">Instituições não informadas nas questões.</p>'}${missingInstitutions&&institutions.length?`<p class="bank-section-note">${missingInstitutions} ${plural(missingInstitutions,'questão sem instituição informada','questões sem instituição informada')}.</p>`:''}</section>
      <div class="bank-period-note">${icon('clock',14)}<span>Período das provas: <strong>${esc(period)}</strong>${missingYears&&overview.firstYear!==null?` · ${missingYears} ${plural(missingYears,'questão sem ano informado','questões sem ano informado')}`:''}</span></div>
      ${bank.unavailable?'':`<div class="bank-management">
        ${bank.linkedTo?`<button class="btn small" data-action="bank-unlink" data-bank="${esc(bank.id)}">Desfazer associação</button>`:sourceType(bank)==='personal'||management?.admin?`<button class="btn small" data-action="${sourceType(bank)==='system'?'system-bank-toggle':'bank-toggle'}" data-bank="${esc(bank.id)}" ${sourceType(bank)==='system'&&(!management.canToggle||syncing||bank.pendingActivation)?'disabled':''}>${bank.enabled?'Desativar':'Ativar'} banco${sourceType(bank)==='system'?' para todos':''}</button>`:''}
        <div class="bank-file-actions">
          ${sourceType(bank)==='personal'?`<button class="btn small" data-action="bank-rename" data-bank="${esc(bank.id)}">Renomear</button>`:''}
          <button class="icon-btn" data-action="bank-export" data-bank="${esc(bank.id)}" aria-label="Exportar ${esc(bank.displayName||bank.name)}" title="Exportar JSON">${icon('download',17)}<span class="bank-action-label">Exportar</span></button>
          ${sourceType(bank)==='personal'||management?.admin?`<button class="icon-btn" data-action="${sourceType(bank)==='personal'?'bank-delete':'system-bank-delete'}" data-bank="${esc(bank.id)}" aria-label="Excluir ${esc(bank.displayName||bank.name)}" title="${esc(sourceType(bank)==='personal'?'Excluir banco':management.reason||'Excluir banco para todos')}" ${sourceType(bank)==='system'&&(!management.canDelete||syncing)?'disabled':''}>${icon('trash',17)}<span class="bank-action-label">Excluir</span></button>`:''}
        </div>
      </div>`}
      ${sourceType(bank)==='system'&&bank.active===false?'<p class="bank-section-note">Desativado pela administração para novas sessões. Seus estudos e resultados anteriores continuam disponíveis.</p>':''}
      ${management?.admin&&management.reason?`<p class="bank-section-note">${esc(management.reason)}</p>`:''}
    </div>
  </article>`;
}
