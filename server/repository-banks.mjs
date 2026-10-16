import {createHash} from 'node:crypto';
import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonicalJSON} from '../src/engine.mjs';
import {validateSystemBank} from '../src/system-banks.mjs';

export const repositoryBanksDirectory=fileURLToPath(new URL('../public/data/question-banks/',import.meta.url));
const digest=value=>createHash('sha256').update(canonicalJSON(value)).digest('hex');

// The directory is the source of truth. No hand-maintained index or storage service.
export function repositoryCatalog(directory=repositoryBanksDirectory){
  const banks=[];
  for(const entry of readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en',{numeric:true}))){
    const file=entry.name;
    if(file==='index.json'||!/\.json$/i.test(file))continue;
    try{
      if(!entry.isFile()||!/^lei-[1-9]\d*\.json$/.test(file))throw new Error('Use um arquivo lei-NUMERO.json, sem pontos ou ano no nome.');
      const raw=JSON.parse(readFileSync(join(directory,file),'utf8').replace(/^\uFEFF/,''));
      const bank=validateSystemBank(raw);
      if(file!==`${bank.id}.json`)throw new Error(`O ID deve ser ${file.slice(0,-5)}, igual ao nome do arquivo.`);
      const content={schemaVersion:bank.schemaVersion,id:bank.id,name:bank.name,displayName:bank.displayName,subtitle:bank.subtitle,description:bank.description,questions:bank.questions,publishedAt:bank.publishedAt};
      banks.push({...bank,revision:`repo-${digest(content).slice(0,24)}`});
    }catch(error){throw new Error(`${file}: ${error.message}`,{cause:error});}
  }
  const entries=banks.map(bank=>({id:bank.id,file:`${bank.id}.json`,revision:bank.revision}));
  return {manifest:{schemaVersion:1,version:`repo-${digest(entries).slice(0,24)}`,banks:entries},banks};
}
