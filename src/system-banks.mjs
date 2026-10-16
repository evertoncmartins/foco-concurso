import {validateBank} from './engine.mjs';
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
  if(!/^lei-[1-9]\d*$/.test(bank.id))throw new Error('Bancos do sistema devem usar ID lei-NUMERO.');
  const presentation=bankPresentation({...bank,displayName:undefined});
  const number=presentation.title.match(/^Lei nº ([\d.]+)\/\d{4}$/)?.[1]?.replace(/\./g,'');
  if(bank.id!==`lei-${number}`)throw new Error('O nome deve identificar a mesma lei do ID lei-NUMERO.');
  const publishedAt=typeof raw.publishedAt==='string'&&Number.isFinite(Date.parse(raw.publishedAt))?new Date(raw.publishedAt).toISOString():'2026-10-16T00:00:00.000Z';
  return {...bank,name:presentation.title,sourceType:'system',displayName:presentation.title,subtitle:bank.subtitle||presentation.subtitle,revision:typeof raw.revision==='string'?raw.revision:'1',publishedAt,editable:false,removable:false};
}
export class SystemBanks{
  constructor(fetcher=globalThis.fetch,{origin=globalThis.location?.origin}={}){this.fetcher=fetcher.bind(globalThis);this.origin=origin;this.banks=[];this.version='';this.loading=null;this.loaded=false;}
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
        this.banks=banks;this.version=manifest.version||'';this.loaded=true;return banks;
      }catch(error){failure=error;}
      throw failure;
    })();try{return await this.loading;}finally{this.loading=null;}
  }
}
