import {sessionBankCatalog} from './sessions-view.mjs';
import {sourceType} from './bank-source.mjs';
import {icon} from './icons.mjs';

// Only this account's consultable studies keep a removed system bank visible.
// Historical cards never enter the live bank list or new study queues.
export function bankCatalogCards(model){
  const unavailable=sessionBankCatalog(model).filter(bank=>bank.removed&&sourceType(bank)==='system');
  return [...model.banks,...unavailable.map(bank=>({...bank,enabled:false,unavailable:true}))];
}

export function catalogSyncButton(loading=false){
  return `<button class="btn catalog-sync" data-action="refresh-system-banks" aria-busy="${loading}" ${loading?'disabled':''}>${icon('repeat',16)}<span>${loading?'Sincronizando…':'Sincronizar'}</span></button>`;
}
