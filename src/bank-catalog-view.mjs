import {sessionBankCatalog} from './sessions-view.mjs';
import {sourceType} from './bank-source.mjs';
import {icon} from './icons.mjs';

// Only this account's consultable studies keep a removed system bank visible.
// Historical cards never enter the live bank list or new study queues.
export function bankCatalogCards(model,updates=new Map()){
  const unavailable=sessionBankCatalog(model).filter(bank=>bank.removed&&sourceType(bank)==='system');
  const cards=[...model.banks,...unavailable.map(bank=>({...bank,enabled:false,unavailable:true}))];
  for(const [id,update] of updates)if(update.kind==='added'&&!cards.some(b=>b.id===id))cards.push({...update.bank,enabled:false,pendingActivation:true});
  return cards.map(bank=>sourceType(bank)==='system'?{...bank,pendingUpdate:updates.get(bank.id)}:bank);
}

export function catalogSyncButton(loading=false,pending=0){
  return `<button class="btn catalog-sync" data-action="refresh-system-banks" aria-busy="${loading}" ${loading?'disabled':''}>${icon('repeat',16)}<span>${loading?'Sincronizando…':pending?`Sincronizar (${pending})`:'Sincronizar'}</span></button>`;
}
