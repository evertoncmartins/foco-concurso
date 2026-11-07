import {icon} from './icons.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function bankScopeView({title='Onde aplicar esta ação?',personal='Somente na sua conta. Os outros usuários não serão afetados.',system='No Sistema, para todos os usuários.',systemReason=''}={}){
  return `<div class="dialog-title"><h2 id="dialog-title">${esc(title)}</h2><p>Escolha o alcance antes de continuar.</p></div><div class="bank-scope-options"><button type="button" id="bank-scope-personal" class="bank-scope-option">${icon('book',21)}<span><strong>Pessoal</strong><small>${esc(personal)}</small></span>${icon('arrow',16)}</button><button type="button" id="bank-scope-system" class="bank-scope-option" ${systemReason?'disabled aria-describedby="bank-scope-reason"':''}>${icon('cloud',21)}<span><strong>Sistema</strong><small>${esc(system)}</small></span>${icon('arrow',16)}</button></div>${systemReason?`<p id="bank-scope-reason" class="setting-note">${esc(systemReason)}</p>`:''}<div class="dialog-actions"><button type="button" class="btn" id="bank-scope-cancel">Cancelar</button></div>`;
}
