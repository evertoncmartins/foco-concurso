import {validateBank,canonicalJSON} from './engine.mjs';
import {bankPresentation} from './bank-names.mjs';

const PRIMARY_ORIGIN='https://foco-concurso-wine.vercel.app';
// Publication profile. Historical snapshots and personal imports still use
// validateBank, so adding feedback does not invalidate existing progress.
export function requireNativeFeedback(bank){
  for(const q of bank.questions){
    const label=`Questão ${q.id}`;
    if(!q.optionExplanations||q.options.some(o=>!q.optionExplanations[o.id]?.trim()))throw new Error(`${label}: o banco nativo exige optionExplanations para todas as alternativas.`);
    if(!q.fundamentoLegal?.trim())throw new Error(`${label}: informe fundamentoLegal com os dispositivos aplicáveis.`);
    if(!q.tipo?.trim())throw new Error(`${label}: informe tipo sem atribuir uma origem não comprovada.`);
    let official=false;
    try{const url=new URL(q.reference?.url);official=url.protocol==='https:'&&!url.username&&!url.password&&(url.hostname.endsWith('.gov.br')||url.hostname.endsWith('.leg.br')||url.hostname.endsWith('.jus.br'));}catch{}
    if(!official)throw new Error(`${label}: reference deve conter label e URL HTTPS de fonte oficial brasileira.`);
  }
  return bank;
}
export function validateSystemBank(raw){
  const bank=validateBank(raw);
  if(raw.active!==undefined&&typeof raw.active!=='boolean')throw new Error('active deve ser verdadeiro ou falso.');
  if(!/^lei-[1-9]\d*$/.test(bank.id))throw new Error('Bancos do sistema devem usar ID lei-NUMERO.');
  const presentation=bankPresentation({...bank,displayName:undefined});
  const number=presentation.title.match(/^Lei nº ([\d.]+)\/\d{4}$/)?.[1]?.replace(/\./g,'');
  if(bank.id!==`lei-${number}`)throw new Error('O nome deve identificar a mesma lei do ID lei-NUMERO.');
  const publishedAt=typeof raw.publishedAt==='string'&&Number.isFinite(Date.parse(raw.publishedAt))?new Date(raw.publishedAt).toISOString():'2026-10-16T00:00:00.000Z';
  return {...bank,name:presentation.title,sourceType:'system',displayName:presentation.title,subtitle:bank.subtitle||presentation.subtitle,revision:typeof raw.revision==='string'?raw.revision:'1',publishedAt,active:raw.active!==false,editable:false,removable:false};
}
export class SystemBanks{
  constructor(fetcher=globalThis.fetch,{origin=globalThis.location?.origin}={}){this.fetcher=fetcher.bind(globalThis);this.origin=origin;this.banks=[];this.version='';this.loading=null;this.loaded=false;this.updates=new Map();this.available=null;this.checking=null;this.retired=new Map();}
  // A confirmed deletion must not reappear while the previous deployment is
  // still serving. A later publication with a new revision remains discoverable.
  withoutRetired(banks){return banks.filter(bank=>this.retired.get(bank.id)!==bank.revision);}
  retire(id,revision){
    this.retired.set(id,revision);this.banks=this.banks.filter(bank=>bank.id!==id);this.updates.delete(id);
    if(this.available)this.available.banks=this.available.banks.filter(bank=>bank.id!==id);
  }
  revive(id){this.retired.delete(id);}
  async check(){
    if(this.checking)return this.checking;
    this.checking=(async()=>{
      if(this.loading)await this.loading;
      const candidate=new SystemBanks(this.fetcher,{origin:this.origin});
      candidate.loaded=this.loaded;
      await candidate.load({force:true});
      candidate.banks=this.withoutRetired(candidate.banks);
      const current=new Map(this.banks.map(b=>[b.id,b])),latest=new Map(candidate.banks.map(b=>[b.id,b])),updates=new Map();
      for(const id of new Set([...current.keys(),...latest.keys()])){
        const before=current.get(id),bank=latest.get(id);
        if(before&&bank&&canonicalJSON(before)===canonicalJSON(bank))continue;
        const oldQuestions=new Map((before?.questions||[]).map(q=>[q.id,q])),newQuestions=new Map((bank?.questions||[]).map(q=>[q.id,q]));
        updates.set(id,{kind:!before?'added':!bank?'removed':'updated',bank,
          added:[...newQuestions.keys()].filter(id=>!oldQuestions.has(id)).length,
          removed:[...oldQuestions.keys()].filter(id=>!newQuestions.has(id)).length,
          changed:[...newQuestions].filter(([id,q])=>oldQuestions.has(id)&&canonicalJSON(oldQuestions.get(id))!==canonicalJSON(q)).length});
      }
      this.available=candidate;this.updates=updates;return updates;
    })();
    try{return await this.checking;}finally{this.checking=null;}
  }
  apply(bankId){
    if(!this.available)return this.banks;
    if(!bankId){this.banks=this.available.banks;this.updates.clear();}
    else{
      const bank=this.available.banks.find(b=>b.id===bankId),exists=this.banks.some(b=>b.id===bankId);
      this.banks=this.banks.flatMap(b=>b.id===bankId?(bank?[bank]:[]):[b]);
      if(bank&&!exists)this.banks.push(bank);
      this.updates.delete(bankId);
    }
    this.loaded=true;
    if(!this.updates.size){this.version=this.available.version;this.available=null;}
    return this.banks;
  }
  async load({force=false}={}){
    if(this.loading)return this.loading;if(this.loaded&&!force)return this.banks;
    this.loading=(async()=>{
      const local='./data/question-banks/',development=this.origin&&['localhost','127.0.0.1','[::1]','terminal.local'].includes(new URL(this.origin).hostname);
      // Static mirrors follow the production catalog, including files added later.
      const bases=this.origin&&this.origin!==PRIMARY_ORIGIN&&!development?[`${PRIMARY_ORIGIN}/data/question-banks/`,local]:[local];
      let failure;
      for(const base of bases)try{
        const response=await this.fetcher(`${base}index.json`,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(10000)});
        if(!response.ok)throw new Error('Não foi possível carregar os bancos do sistema.');
        const manifest=await response.json();
        if(manifest.schemaVersion!==1||!Array.isArray(manifest.banks))throw new Error('Catálogo do sistema inválido.');
        const ids=new Set(),banks=await Promise.all(manifest.banks.map(async item=>{
          if(!/^lei-[1-9]\d*$/.test(item.id)||ids.has(item.id))throw new Error('Identificador do catálogo inválido.');ids.add(item.id);
          if(item.url||item.file&&item.file!==`${item.id}.json`)throw new Error('Endereço do banco do sistema inválido.');
          const revision=item.revision?`?v=${encodeURIComponent(item.revision)}`:'';
          const response=await this.fetcher(`${base}${item.id}.json${revision}`,{cache:'no-cache',credentials:'omit',signal:AbortSignal.timeout(15000)});
          if(!response.ok)throw new Error(`Não foi possível carregar ${item.id}.`);
          const bank=validateSystemBank(await response.json());
          if(bank.id!==item.id||item.revision&&bank.revision!==item.revision)throw new Error('O arquivo não corresponde à versão do catálogo. Atualize a lista.');
          return bank;
        }));
        this.banks=this.withoutRetired(banks);this.version=manifest.version||'';this.loaded=true;this.updates.clear();this.available=null;return this.banks;
      // After a successful load, keep that catalog on failure instead of
      // replacing it with a potentially older copy bundled in a mirror.
      }catch(error){failure=error;if(this.loaded)break;}
      throw failure;
    })();try{return await this.loading;}finally{this.loading=null;}
  }
}
