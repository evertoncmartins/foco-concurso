import {bankPresentation} from './bank-view.mjs';
import {filterQuestions} from './engine.mjs';
import {icon} from './icons.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function sessionSetupStatus(model,options){
  const available=filterQuestions(model,options).length,requested=Number(options.count);
  const validCount=Number.isInteger(requested)&&requested>=1&&requested<=5000;
  return {available,count:validCount?Math.min(requested,available):0,validCount,canStart:validCount&&available>0,banks:options.banks.length};
}
export function sessionSetupView({banks,modes,mode='smart',bankId=''}){
  return `<form id="session-form" class="session-setup">
    <header class="session-setup-header"><div><span class="setup-eyebrow">NOVA SESSÃO</span><h2 id="dialog-title">Prepare seu estudo</h2><p>Escolha os bancos e estude no seu ritmo.</p></div><button class="icon-btn setup-close" type="button" data-action="close-dialog" aria-label="Fechar configuração da sessão">${icon('x',18)}</button></header>
    <div class="session-setup-content">
      <div class="setup-controls">
        <div class="field"><label for="mode">Modo de estudo</label><select id="mode" name="mode" aria-describedby="mode-description" autofocus>${Object.entries(modes).map(([key,[label]])=>`<option value="${esc(key)}" ${mode===key?'selected':''}>${esc(label)}</option>`).join('')}</select></div>
        <div class="field"><label for="count">Quantidade de questões</label><input id="count" type="number" name="count" value="10" min="1" max="5000" step="1" inputmode="numeric" required></div>
      </div>
      <p id="mode-description" class="setup-mode-description">${esc(modes[mode]?.[1])}</p>
      <fieldset class="setup-banks"><legend>Bancos de questões</legend><p class="setup-section-note">Selecione um ou mais bancos.</p><div class="setup-bank-grid">${banks.map(bank=>{
        const {title,subtitle}=bankPresentation(bank),count=bank.questions.length;
        return `<label class="bank-choice setup-bank-choice"><input type="checkbox" name="banks" value="${esc(bank.id)}" ${!bankId||bankId===bank.id?'checked':''}><span class="setup-bank-copy"><strong>${esc(title)}</strong><span class="setup-bank-subtitle">${esc(subtitle)}</span><small>${count} ${count===1?'questão':'questões'}</small></span></label>`;
      }).join('')}</div></fieldset>
      <details class="setup-filters" id="session-filters" ${mode==='subject'?'open':''}><summary>${icon('filter',15)}<span>Filtrar por conteúdo</span><span class="setup-optional">Opcional</span><svg class="setup-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary>
        <div class="setup-filter-fields"><div class="field"><label for="discipline">Disciplina</label><select id="discipline" name="discipline"><option value="">Todas</option></select></div><div class="field"><label for="subject">Assunto</label><select id="subject" name="subject"><option value="">Todos</option></select></div><div class="field"><label for="topic">Tópico</label><select id="topic" name="topic"><option value="">Todos</option></select></div></div>
      </details>
      <div id="session-error" class="form-error" role="alert"></div>
    </div>
    <footer class="session-setup-footer"><div class="setup-summary" role="status" aria-live="polite" aria-atomic="true"><strong id="session-size">Preparando sessão…</strong><span id="eligible"></span></div><div class="setup-footer-actions"><button class="btn ghost" type="button" data-action="close-dialog">Cancelar</button><button class="btn primary" id="session-start" type="submit"><span id="session-start-label">Começar estudo</span>${icon('arrow',16)}</button></div></footer>
  </form>`;
}
