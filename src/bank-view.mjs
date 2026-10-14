import {icon} from './icons.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Imported descriptions are plain text. Break long prose at sentence boundaries,
// preserving legal numbers, abbreviations, explicit lines and the complete text.
export function bankDescriptionParagraphs(description){
  const text=String(description||'Seu banco de questões para estudo e revisão.').replace(/\r\n?/g,'\n').trim();
  return text.replace(/([.!?])([ \t]+)(?=[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])/gu,(match,punctuation,space,index,source)=>{
    const preceding=source.slice(Math.max(0,index-20),index+1);
    return /\b(?:arts?|incs?|n|no|pp?|sr|sra|dr|dra|prof|profa|ex)\.$/iu.test(preceding)?match:`${punctuation}\n`;
  }).split(/\n+/).map(p=>p.trim()).filter(Boolean);
}

export function bankCardView(bank,{detailsOpen=false,index=0}={}){
  const panelId=`bank-details-${index}`;
  const disciplines=[...new Set(bank.questions.map(q=>q.discipline))];
  const subjects=new Set(bank.questions.map(q=>q.subject)).size;
  const detailLabel=detailsOpen?'Ocultar detalhes':'Ver mais detalhes';
  return `<article class="card bank-card ${bank.enabled?'':'disabled'}">
    <header class="bank-heading">
      <span class="bank-symbol">${icon('book',20)}</span>
      <div class="bank-title"><h3>${esc(bank.name)}</h3><p>${bank.questions.length} ${bank.questions.length===1?'questão':'questões'} · ${subjects} ${subjects===1?'assunto':'assuntos'}</p></div>
      <span class="badge ${bank.enabled?'green':''}">${bank.enabled?'Ativo':'Desativado'}</span>
    </header>
    <div class="bank-primary-actions">
      <button class="btn small primary" data-action="start" data-bank="${esc(bank.id)}" ${bank.enabled?'':'disabled'}>Estudar ${icon('arrow',14)}</button>
      <button class="bank-details-toggle" data-action="bank-details" data-bank="${esc(bank.id)}" aria-expanded="${detailsOpen}" aria-controls="${panelId}" aria-label="${detailLabel} de ${esc(bank.name)}"><span class="bank-details-label">${detailLabel}</span><svg class="bank-details-chevron" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
    </div>
    <div class="bank-details-panel" id="${panelId}" ${detailsOpen?'':'hidden'}>
      <h4>Sobre este banco</h4>
      <div class="bank-description">${bankDescriptionParagraphs(bank.description).map(p=>`<p>${esc(p)}</p>`).join('')}</div>
      <div class="bank-disciplines">${disciplines.map(d=>`<span class="pill">${esc(d)}</span>`).join('')}</div>
      <div class="bank-management">
        <button class="btn small" data-action="bank-toggle" data-bank="${esc(bank.id)}">${bank.enabled?'Desativar':'Ativar'} banco</button>
        <div class="bank-file-actions">
          <button class="icon-btn" data-action="bank-export" data-bank="${esc(bank.id)}" aria-label="Exportar ${esc(bank.name)}" title="Exportar JSON">${icon('download',17)}</button>
          <button class="icon-btn" data-action="bank-delete" data-bank="${esc(bank.id)}" aria-label="Excluir ${esc(bank.name)}" title="Excluir banco">${icon('trash',17)}</button>
        </div>
      </div>
    </div>
  </article>`;
}
