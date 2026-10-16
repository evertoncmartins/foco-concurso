import {validateBank} from './engine.mjs';
export const ADMIN_EMAIL='ecmdigital@gmail.com';
export function validateSystemBank(raw){
  const bank=validateBank(raw);
  if(!/^lei-[1-9]\d*$/.test(bank.id))throw new Error('Bancos do sistema devem usar ID lei-NUMERO.');
  const publishedAt=typeof raw.publishedAt==='string'&&Number.isFinite(Date.parse(raw.publishedAt))?new Date(raw.publishedAt).toISOString():'2026-10-16T00:00:00.000Z';
  return {...bank,sourceType:'system',displayName:raw.displayName||bank.name,subtitle:raw.subtitle||'',revision:typeof raw.revision==='string'?raw.revision:'1',publishedAt,editable:false,removable:false};
}
export class SystemBanks{
  constructor(fetcher=globalThis.fetch){this.fetcher=fetcher.bind(globalThis);this.banks=[];this.version='';this.loading=null;this.loaded=false;this.admin=false;this.storageReady=false;}
  async load({force=false}={}){
    if(this.loading)return this.loading;if(this.loaded&&!force)return this.banks;
    this.loading=(async()=>{
      let manifest,base='./data/question-banks/';
      // A deployment without the API (static mirror) still serves bundled banks.
      try{const response=await this.fetcher('/api/question-banks',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(response.ok){const data=await response.json();if(data.schemaVersion===1&&Array.isArray(data.banks))manifest=data;}}catch{}
      if(!manifest&&globalThis.location&&globalThis.location.origin!=='https://foco-concurso-wine.vercel.app')try{const response=await this.fetcher('https://foco-concurso-wine.vercel.app/api/question-banks',{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(10000)});if(response.ok){const data=await response.json();if(data.schemaVersion===1&&Array.isArray(data.banks))manifest=data;}}catch{}
      if(!manifest){const response=await this.fetcher(`${base}index.json`,{cache:'no-cache'});if(!response.ok)throw new Error('Não foi possível carregar os bancos do sistema.');manifest=await response.json();}
      if(manifest.schemaVersion!==1||!Array.isArray(manifest.banks))throw new Error('Catálogo do sistema inválido.');
      const ids=new Set(),banks=await Promise.all(manifest.banks.map(async item=>{
        if(!/^lei-[1-9]\d*$/.test(item.id)||ids.has(item.id))throw new Error('Identificador do catálogo inválido.');ids.add(item.id);
        const path=item.url||`${base}${item.id}.json`;
        if(item.url&&!/^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//.test(item.url))throw new Error('Endereço do banco do sistema inválido.');
        const response=await this.fetcher(path,{cache:'no-cache'});if(!response.ok)throw new Error(`Não foi possível carregar ${item.id}.`);
        const bank=validateSystemBank(await response.json());if(bank.id!==item.id)throw new Error('O arquivo não corresponde ao catálogo.');return bank;
      }));
      this.banks=banks;this.version=manifest.version||'';this.loaded=true;return banks;
    })();try{return await this.loading;}finally{this.loading=null;}
  }
  async request(auth,body){
    const subject=auth.profile?.sub,generation=auth.generation,access=await auth.ensureAccess();
    if(auth.profile?.sub!==subject||auth.generation!==generation)throw new Error('A conta conectada mudou. Abra a administração novamente.');
    const response=await this.fetcher('/api/question-banks',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Authorization:`Bearer ${access.token}`},body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(60000)});
    const result=await response.json().catch(()=>({}));
    if(auth.profile?.sub!==subject||auth.generation!==generation)throw new Error('A conta conectada mudou. Atualize o catálogo antes de continuar.');
    if(!response.ok)throw new Error(result.message||'Não foi possível gerenciar o catálogo do sistema.');return result;
  }
  async permissions(auth){this.admin=false;this.storageReady=false;if(auth.profile?.email?.toLowerCase()!==ADMIN_EMAIL)return false;const result=await this.request(auth,{action:'permissions'});this.admin=result.admin===true;this.storageReady=result.storageReady===true;return this.admin;}
  async update(auth,operation){const result=await this.request(auth,{...operation,version:this.version});await this.load({force:true});return result;}
  clearPermissions(){this.admin=false;this.storageReady=false;}
}
