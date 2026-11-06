// Default legacy hold. Only the server may release a bank after an explicit
// owner review; absence of a central record alone is not evidence of no use.
export const LEGACY_SYSTEM_BANK_IDS=Object.freeze(['lei-11892','lei-12772','lei-8069','lei-8112','lei-9394']);

export class BankManagement{
  constructor(fetcher=globalThis.fetch,{origin=globalThis.location?.origin}={}){
    this.fetcher=fetcher.bind(globalThis);
    this.endpoint=origin&&origin.endsWith('.chatgpt.site')?'https://foco-concurso-wine.vercel.app/api/bank-management':'/api/bank-management';
    this.reset();
  }
  reset(){this.generation=(this.generation||0)+1;this.known=false;this.admin=false;this.tracking=false;this.deletion=false;this.banks=new Map();this.assigned=new Set();}
  async request(auth,{method='GET',body}={}){
    const generation=auth.generation,subject=auth.profile?.sub;
    if(!subject)throw new Error('Entre com Google para continuar.');
    const authorization=await auth.ensureAccess();
    if(auth.generation!==generation||auth.profile?.sub!==subject)throw new Error('A conta conectada mudou.');
    const response=await this.fetcher(this.endpoint,{method,credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(25000),
      headers:{Authorization:`Bearer ${authorization.token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    if(auth.generation!==generation||auth.profile?.sub!==subject)throw new Error('A conta conectada mudou.');
    if(!response.ok){let message;try{message=(await response.json()).message;}catch{}throw new Error(message||'Não foi possível verificar as atribuições deste banco.');}
    return response.json();
  }
  async inspect(auth){
    const generation=this.generation;
    try{
      const result=await this.request(auth);
      if(generation!==this.generation)return;
      if(typeof result.tracking!=='boolean'||typeof result.deletion!=='boolean')throw new Error('Resposta de administração inválida.');
      this.known=true;this.admin=result.admin===true;this.tracking=result.tracking===true;this.deletion=result.deletion===true;
      this.banks=new Map((result.banks||[]).map(bank=>[bank.id,bank]));
    }catch{if(generation===this.generation){this.known=false;this.admin=false;this.tracking=false;this.deletion=false;this.banks.clear();}}
  }
  presentation(id){
    if(!this.admin)return null;
    const bank=this.banks.get(id);
    const reason=bank?.protected?'Uso anterior ainda não verificado. Use Desativar banco.':
      !this.tracking||!this.deletion?'Exclusão global aguardando configuração.':
      !bank||typeof bank.protected!=='boolean'||!Number.isSafeInteger(bank.assigned)||bank.assigned<0?'Atribuições ainda não verificadas.':bank.state?'Exclusão em processamento.':
      bank.assigned?`Atribuído a ${bank.assigned} ${bank.assigned===1?'usuário':'usuários'}. Use Desativar banco.`:'';
    return {admin:true,canDelete:!reason,reason};
  }
  async assign(ids,auth){
    const required=[...new Set(ids)].filter(id=>!this.assigned.has(id));
    if(!required.length)return;
    const generation=this.generation;
    // Dormant mode is explicitly confirmed by the server. When enabling the
    // feature, the rollout baseline must protect every bank already published.
    await this.inspect(auth);
    if(generation!==this.generation)throw new Error('A conta conectada mudou.');
    if(!this.known)throw new Error('Não foi possível verificar as atribuições. Tente novamente antes de iniciar a sessão.');
    if(!this.tracking)return;
    // A new bank must never acquire untracked users while deletion is enabled.
    await this.request(auth,{method:'POST',body:{action:'assign',bankIds:required}});
    if(generation!==this.generation)throw new Error('A conta conectada mudou.');
    for(const id of required)this.assigned.add(id);
  }
  async remove(bank,auth){
    if(!this.presentation(bank.id)?.canDelete)throw new Error('Este banco não está liberado para exclusão global.');
    return this.request(auth,{method:'POST',body:{action:'delete',bankId:bank.id,revision:bank.revision}});
  }
}
