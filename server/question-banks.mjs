import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import manifest from '../public/data/question-banks/index.json' with {type:'json'};
import {validateSystemBank,ADMIN_EMAIL} from '../src/system-banks.mjs';
import {bankPresentation} from '../src/bank-names.mjs';

const bundled=manifest.banks.map(item=>{if(!/^lei-[1-9]\d*$/.test(item.id))throw new Error('Invalid bundled bank');return validateSystemBank(JSON.parse(readFileSync(new URL(`../public/data/question-banks/${item.id}.json`,import.meta.url),'utf8')));}),PATH='data/question-banks/catalog.json';
const base=()=>({version:manifest.version,entries:{},etag:null});
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
function publicCatalog(state){
  const banks=new Map(bundled.map(b=>[b.id,{id:b.id,file:`${b.id}.json`}]));
  for(const [id,item] of Object.entries(state.entries)){if(item.deleted)banks.delete(id);else banks.set(id,{id,url:item.url});}
  return {schemaVersion:1,version:state.version,banks:[...banks.values()]};
}
export function createBlobBankStorage(env){
  const options={...(env.BLOB_READ_WRITE_TOKEN?{token:env.BLOB_READ_WRITE_TOKEN}:{}),...(env.BLOB_STORE_ID?{storeId:env.BLOB_STORE_ID}:{}),access:'public'},sdk=()=>import('@vercel/blob');
  return {
    async read(){
      const {get}=await sdk(),result=await get(PATH,{...options,useCache:false});if(!result)return base();
      if(result.statusCode!==200)throw new Error('Catalog read failed');
      const state=await new Response(result.stream).json();
      if(!state||typeof state.version!=='string'||!state.entries||typeof state.entries!=='object'||Array.isArray(state.entries))throw new Error('Invalid stored catalog');
      return {...state,etag:result.blob.etag};
    },
    async writeBank(bank){const {put}=await sdk();const blob=await put(`data/question-banks/${bank.id}/${bank.revision}.json`,JSON.stringify(bank),{...options,addRandomSuffix:false,allowOverwrite:false,contentType:'application/json',cacheControlMaxAge:60});return blob.url;},
    async write(state,etag){const {put}=await sdk();await put(PATH,JSON.stringify(state),{...options,addRandomSuffix:false,allowOverwrite:!!etag,...(etag?{ifMatch:etag}:{}),contentType:'application/json',cacheControlMaxAge:60});}
  };
}
// Every write verifies the bearer directly with Google. No client-side email,
// UI flag, Drive event or imported sourceType can authorize a global change.
export function createBankCatalogHandler({env=process.env,fetcher=globalThis.fetch,storage,uuid=randomUUID}={}){
  const ready=!!(env.BLOB_READ_WRITE_TOKEN||env.BLOB_STORE_ID),backend=storage||createBlobBankStorage(env);
  return async request=>{
    if(request.method==='GET'){
      try{const response=json(publicCatalog(ready?await backend.read():base()));response.headers.set('Access-Control-Allow-Origin','*');return response;}catch{return json({message:'O catálogo compartilhado está temporariamente indisponível.'},503);}
    }
    if(request.method!=='POST')return json({message:'Método não permitido.'},405);
    const origin=env.GOOGLE_AUTH_ORIGIN||'https://foco-concurso-wine.vercel.app';
    if(new URL(request.url).origin!==origin||request.headers.get('origin')!==origin||(request.headers.get('sec-fetch-site')&&!['same-origin','none'].includes(request.headers.get('sec-fetch-site'))))return json({message:'Origem não autorizada.'},403);
    const bearer=request.headers.get('authorization')||'';
    if(!/^Bearer [^\s]{1,4096}$/.test(bearer))return json({message:'Entre com a conta administradora.'},401);
    try{
      const who=await fetcher('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:bearer},cache:'no-store',signal:AbortSignal.timeout(20000)});
      if(!who.ok)return json({message:'Autorização Google inválida ou expirada.'},401);
      const profile=await who.json();
      if(!profile.sub||profile.email_verified!==true||String(profile.email).toLowerCase()!==ADMIN_EMAIL)return json({message:'Esta conta não pode administrar bancos do sistema.'},403);
    }catch{return json({message:'Não foi possível confirmar a conta Google.'},503);}
    if(!request.headers.get('content-type')?.startsWith('application/json'))return json({message:'Envie um documento JSON.'},415);
    let input;try{input=await request.json();}catch{return json({message:'JSON inválido.'},400);}
    if(input?.action==='permissions')return json({admin:true,storageReady:ready});
    if(!['upsert','delete'].includes(input?.action))return json({message:'Operação inválida.'},400);
    if(!ready)return json({message:'O armazenamento dos bancos do sistema ainda precisa ser conectado ao projeto Vercel.'},503);
    let bank,id;
    try{
      if(input.action==='upsert'){
        bank=validateSystemBank(input.bank);id=bank.id;
        const presentation=bankPresentation({...bank,displayName:undefined});
        const number=presentation.title.match(/^Lei nº ([\d.]+)\/(\d{4})$/)?.[1]?.replace(/\./g,'');
        if(id!==`lei-${number}`)throw new Error('O nome deve identificar a mesma lei do ID lei-NUMERO.');
        bank={...bank,name:presentation.title,displayName:presentation.title,subtitle:input.bank.subtitle||presentation.subtitle,revision:uuid(),publishedAt:new Date().toISOString()};
      }else{id=input.id;if(typeof id!=='string'||!/^lei-[1-9]\d*$/.test(id))throw new Error('ID do banco inválido.');}
    }catch(error){return json({message:error.message},400);}
    try{
      const current=await backend.read();
      if(input.version!==current.version)return json({message:'O catálogo mudou. Atualize a lista antes de salvar novamente.'},409);
      if(input.action==='delete'&&!publicCatalog(current).banks.some(b=>b.id===id))return json({message:'Banco não encontrado.'},404);
      const item=bank?{url:await backend.writeBank(bank),revision:bank.revision}:{deleted:true};
      const next={version:uuid(),entries:{...current.entries,[id]:item}};
      await backend.write(next,current.etag);
      return json({saved:true,version:next.version,bankId:id});
    }catch(error){
      if(/Precondition|AlreadyExists/.test(error?.name||''))return json({message:'Outro envio atualizou o catálogo. Atualize a lista e tente novamente.'},409);
      return json({message:'Não foi possível salvar o catálogo. Nenhuma alteração foi publicada.'},503);
    }
  };
}
