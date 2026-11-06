import {createHash,randomUUID} from 'node:crypto';
import publicConfig from '../public/app-config.json' with {type:'json'};
import {LEGACY_SYSTEM_BANK_IDS} from '../src/bank-management.mjs';
import {repositoryCatalog,repositoryBanksDirectory,repositoryBank} from './repository-banks.mjs';
import {BankAssignments} from './bank-assignments.mjs';

const ORIGIN='https://foco-concurso-wine.vercel.app',MIRROR='https://foco-concursos.ecmdigital.chatgpt.site';
const REPOSITORY='evertoncmartins/foco-concurso',PATH='public/data/question-banks/';
const validId=id=>typeof id==='string'&&/^lei-[1-9]\d*$/.test(id);
const problem=(message,status=503)=>Object.assign(new Error(message),{status});

export function createBankManagementHandler({env=process.env,fetcher=globalThis.fetch,registry=new BankAssignments({env,fetcher}),directory=repositoryBanksDirectory}={}){
  const allowed=new Set([ORIGIN,MIRROR]);
  const admins=new Set((env.BANK_ADMIN_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean));
  const baseline=(env.BANK_PROTECTED_IDS||'').split(',').map(s=>s.trim()).filter(Boolean);
  // An explicit owner review can release only the legacy hold. The permanent
  // attribution set and the atomic deletion reservation still apply.
  const reviewedUnusedIds=new Set((env.BANK_REVIEWED_UNUSED_IDS||'').split(',').map(s=>s.trim()).filter(validId));
  const protectedIds=new Set([...LEGACY_SYSTEM_BANK_IDS,...baseline].filter(id=>!reviewedUnusedIds.has(id)));
  async function identity(request){
    const token=request.headers.get('authorization')?.match(/^Bearer ([^\s]{1,4096})$/)?.[1];
    if(!token)throw problem('Entre com Google para continuar.',401);
    const response=await fetcher('https://oauth2.googleapis.com/tokeninfo',{method:'POST',body:new URLSearchParams({access_token:token}),cache:'no-store',signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw problem('A autorização expirou. Entre novamente.',401);
    const info=await response.json(),clientId=env.GOOGLE_CLIENT_ID||env.PUBLIC_GOOGLE_CLIENT_ID||publicConfig.googleClientId;
    if(info.aud!==clientId||!info.sub||!(Number(info.expires_in)>0))throw problem('Autorização Google inválida.',401);
    const profileResponse=await fetcher('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(10000)});
    if(!profileResponse.ok)throw problem('Não foi possível verificar a conta Google.',401);
    const profile=await profileResponse.json();
    if(profile.sub!==info.sub||profile.email_verified!==true||typeof profile.email!=='string')throw problem('Conta Google não verificada.',401);
    return {sub:profile.sub,admin:admins.has(profile.email.toLowerCase())};
  }
  async function github(path,method='GET',body,accept='application/vnd.github+json'){
    return fetcher(`https://api.github.com/repos/${REPOSITORY}/${path}`,{
      method,headers:{Authorization:`Bearer ${env.BANK_GITHUB_TOKEN}`,Accept:accept,'X-GitHub-Api-Version':'2026-03-10',...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(15000)});
  }
  return async request=>{
    const origin=request.headers.get('origin'),headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff',Vary:'Origin',Allow:'GET, POST, OPTIONS'};
    const reply=(data,status=200)=>Response.json(data,{status,headers});
    if(origin&&!allowed.has(origin)||!allowed.has(new URL(request.url).origin))return reply({message:'Origem não autorizada.'},403);
    if(origin)headers['Access-Control-Allow-Origin']=origin;
    if(request.method==='OPTIONS'){headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS';headers['Access-Control-Allow-Headers']='Authorization, Content-Type';return new Response(null,{status:204,headers});}
    if(!['GET','POST'].includes(request.method))return reply({message:'Método não permitido.'},405);
    try{
      const user=await identity(request),tracking=registry.configured,deletion=tracking&&!!env.BANK_GITHUB_TOKEN&&baseline.length>0;
      const {banks}=repositoryCatalog(directory),ids=new Set(banks.map(b=>b.id));
      if(request.method==='GET')return reply({admin:user.admin,tracking,deletion,banks:user.admin?(tracking?await registry.status([...ids]):[...ids].map(id=>({id}))).map(bank=>({...bank,protected:protectedIds.has(bank.id)})):[]});
      if(Number(request.headers.get('content-length'))>8192)throw problem('Solicitação muito grande.',413);
      const text=await request.text();if(text.length>8192)throw problem('Solicitação muito grande.',413);
      let body;try{body=JSON.parse(text);}catch{throw problem('Solicitação inválida.',400);}
      if(!body||typeof body!=='object'||Array.isArray(body))throw problem('Solicitação inválida.',400);
      if(body.action==='assign'){
        if(!Array.isArray(body.bankIds)||!body.bankIds.length||body.bankIds.length>50||body.bankIds.some(id=>!validId(id)))throw problem('Bancos inválidos.',400);
        const requested=[...new Set(body.bankIds)];
        if(requested.some(id=>!ids.has(id)))throw problem('Um banco saiu do catálogo. Sincronize antes de estudar.',409);
        if(!tracking)throw problem('O controle de atribuições ainda não foi ativado.');
        if(!await registry.assign(requested,user.sub))throw problem('Um banco está em exclusão. Sincronize antes de estudar.',409);
        return reply({assigned:true});
      }
      if(body.action!=='delete')throw problem('Ação inválida.',400);
      if(!user.admin)throw problem('Somente a administração pode excluir bancos do sistema.',403);
      if(!validId(body.bankId)||typeof body.revision!=='string'||body.revision.length>128)throw problem('Banco ou revisão inválida.',400);
      const id=body.bankId;
      if(protectedIds.has(id))throw problem('Este banco é anterior ao controle de atribuições e está protegido.',409);
      if(!deletion)throw problem('A exclusão global ainda não foi configurada.');
      if(!ids.has(id))throw problem('Banco indisponível. Sincronize o catálogo.',409);
      const path=`contents/${PATH}${id}.json`;
      const remote=await github(`${path}?ref=main`,'GET',undefined,'application/vnd.github.object+json');
      if(!remote.ok)throw problem('Não foi possível conferir o arquivo no GitHub.');
      const file=await remote.json();
      if(file.type!=='file'||!(/^[a-f0-9]{40}$/).test(file.sha))throw problem('Arquivo do GitHub inválido.');
      let blob=file;
      // Contents omits inline data above 1 MB. Read the immutable Git blob by
      // the inspected SHA, so a concurrent main update cannot change this read.
      if(file.encoding==='none'){
        const response=await github(`git/blobs/${file.sha}`);
        if(!response.ok)throw problem('Não foi possível ler o conteúdo do banco no GitHub.');
        blob=await response.json();
      }
      if(blob.sha!==file.sha||blob.encoding!=='base64'||typeof blob.content!=='string')throw problem('Arquivo do GitHub inválido.');
      const content=Buffer.from(blob.content,'base64');
      const sha=createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
      if(sha!==file.sha)throw problem('O conteúdo do banco não corresponde ao arquivo conferido no GitHub.');
      const bank=repositoryBank(JSON.parse(content.toString('utf8').replace(/^\uFEFF/,'')),`${id}.json`);
      if(bank.revision!==body.revision)throw problem('O banco foi atualizado. Sincronize antes de excluir.',409);
      const operation=randomUUID();
      if(!await registry.reserve(id,operation))throw problem('O banco já foi atribuído a um usuário ou está em exclusão. Use Desativar banco.',409);
      // The reservation has no TTL: a timed-out GitHub request may have committed.
      // Keep this bank closed until an operator reconciles an ambiguous result.
      let deleted;
      try{deleted=await github(path,'DELETE',{message:`Exclui banco não atribuído ${id}`,sha:file.sha,branch:'main'});}catch{throw problem('A confirmação do GitHub ficou pendente. O banco permanece bloqueado para novas atribuições.');}
      if(!deleted.ok){
        if([400,401,403,404,409,422].includes(deleted.status))await registry.finish(id,operation,{release:true});
        throw problem('O GitHub não confirmou a exclusão. Atualize o catálogo antes de tentar novamente.');
      }
      const result=await deleted.json();
      if(!result.commit?.sha)throw problem('A confirmação da exclusão ficou pendente.');
      await registry.finish(id,operation);
      return reply({deleted:true,bankId:id,commit:result.commit.sha,publishing:true});
    }catch(error){return reply({message:error.status?error.message:'Não foi possível verificar o banco. Nenhuma exclusão foi liberada.'},error.status||503);}
  };
}
