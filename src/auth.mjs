import {normalizeGoogleProfile,parseFolder} from './account.mjs';
export const IDENTITY_SCOPES='openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';
export const DRIVE_SCOPE='https://www.googleapis.com/auth/drive';
export const APPDATA_SCOPE='https://www.googleapis.com/auth/drive.appdata';
export function validClientId(value){return typeof value==='string'&&/^[\w-]+\.apps\.googleusercontent\.com$/.test(value);}
export function isGoogleReady(){return typeof globalThis.google?.accounts?.oauth2?.initTokenClient==='function'&&typeof globalThis.google?.accounts?.oauth2?.hasGrantedAllScopes==='function';}
let library;
export async function prepareGoogle(){
  if(isGoogleReady())return;
  if(library)return library;
  library=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
    let settled=false;
    const finish=error=>{if(settled)return;settled=true;clearTimeout(timeout);script.onload=script.onerror=null;if(error){script.remove();reject(error);}else resolve();};
    const timeout=setTimeout(()=>finish(new Error('O acesso Google demorou para carregar. Verifique sua conexão e tente carregar novamente.')),20000);
    script.onload=()=>finish(isGoogleReady()?null:new Error('O acesso Google não ficou disponível. Verifique se alguma extensão bloqueia o login e tente carregar novamente.'));
    script.onerror=()=>finish(new Error('Não foi possível carregar o acesso Google. Verifique sua conexão ou extensões e tente carregar novamente.'));
    try{document.head.append(script);}catch{finish(new Error('Não foi possível preparar o acesso Google. Tente carregar novamente.'));}
  });
  try{await library;}catch(e){library=null;throw e;}
}
function popupError(error){
  const type=error?.type;
  const message=type==='popup_failed_to_open'?'O navegador não conseguiu abrir a janela do Google. Permita pop-ups para este site e clique em “Continuar com Google” novamente.':type==='popup_closed'?'A janela do Google foi fechada antes de concluir a entrada. Clique em “Continuar com Google” novamente e finalize o acesso na janela.':'Não foi possível concluir a abertura da janela do Google. Tente novamente; se persistir, verifique as permissões do site e as extensões do navegador.';
  return Object.assign(new Error(message),{code:type||'unknown'});
}
export async function fetchGoogleProfile(token,fetcher=fetch){
  const response=await fetcher('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000),cache:'no-store'});
  if(!response.ok)throw new Error('Não foi possível confirmar sua conta Google. Entre novamente.');
  return normalizeGoogleProfile(await response.json());
}
export function consumeGoogleReturn(location=globalThis.location,history=globalThis.history){
  const url=new URL(location.href),notice=url.searchParams.get('google_auth');
  if(!notice)return null;
  url.searchParams.delete('google_auth');history.replaceState(history.state,'',`${url.pathname}${url.search}${url.hash}`);
  return ['success','denied','failed','account_mismatch','permissions','invalid_request'].includes(notice)?notice:'failed';
}
export function googleReturnMessage(notice){
  return ({denied:'A autorização Google foi cancelada. Clique novamente para entrar.',account_mismatch:'A conta escolhida é diferente da conta conectada. Entre com a mesma conta para conectar o Drive.',permissions:'Autorize as permissões solicitadas para restaurar sua pasta e seus estudos.',invalid_request:'A entrada expirou ou não pôde ser confirmada. Clique novamente para entrar.'})[notice]||'Não foi possível concluir a entrada no Google. Tente novamente.';
}
export class GoogleAccount extends EventTarget{
  constructor(clientId){super();this.clientId=clientId;this.profile=null;this.token=null;this.expires=0;this.scopes='';this.generation=0;this.canDrive=false;this.canAppData=false;this.prepared=new Map();this.redirectEnabled=false;}
  async prepareRedirect(fetcher=fetch){
    this.redirectEnabled=false;const clientId=this.clientId;
    try{
      const response=await fetcher('/api/auth/status',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(response.ok){const status=await response.json();this.redirectEnabled=status.enabled===true&&validClientId(status.clientId)&&status.clientId===clientId&&clientId===this.clientId;}
    }catch{}
    return this.redirectEnabled;
  }
  async restoreRedirect(fetcher=fetch){
    if(!this.redirectEnabled)throw new Error('O retorno do Google ainda não está configurado neste site.');
    const generation=this.generation;
    const response=await fetcher('/api/auth/session',{method:'POST',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('Não foi possível confirmar o retorno do Google. Entre novamente.');
    const result=(await response.json()).authorization;
    if(!result||typeof result.token!=='string'||!result.token||!Number.isFinite(result.expires)||result.expires<=Date.now()+10000)throw new Error('A entrada expirou. Clique novamente para entrar com Google.');
    const profile=normalizeGoogleProfile(result.profile);
    const pendingFolderId=result.pendingFolderId?parseFolder(result.pendingFolderId):undefined;
    if(generation!==this.generation)throw new Error('A entrada foi cancelada.');
    if(this.profile&&profile.sub!==this.profile.sub)throw new Error(googleReturnMessage('account_mismatch'));
    this.profile=profile;this.token=result.token;this.expires=result.expires;this.scopes=result.scope||'';this.canDrive=result.canDrive===true;this.canAppData=result.canAppData===true;
    return {profile,token:this.token,expires:this.expires,withDrive:result.withDrive===true,canDrive:this.canDrive,canAppData:this.canAppData,...(pendingFolderId?{pendingFolderId}:{})};
  }
  prepareAuthorization(withDrive=false){
    if(this.redirectEnabled)return;
    if(!validClientId(this.clientId)||!isGoogleReady())return;
    const previous=this.prepared.get(withDrive);
    if(previous?.clientId===this.clientId&&previous.generation===this.generation)return;
    const scope=`${IDENTITY_SCOPES} ${APPDATA_SCOPE}${withDrive?` ${DRIVE_SCOPE}`:''}`;
    const request={clientId:this.clientId,generation:this.generation,resolve:null,reject:null};
    request.client=google.accounts.oauth2.initTokenClient({client_id:this.clientId,scope,include_granted_scopes:true,...(this.profile?{login_hint:this.profile.sub}:{}),callback:r=>request.resolve?.(r),error_callback:error=>request.reject?.(popupError(error))});
    this.prepared.set(withDrive,request);
  }
  async authorize(withDrive=false,{folderId}={}){
    if(!validClientId(this.clientId))throw new Error('O responsável pela plataforma ainda precisa configurar o acesso Google.');
    if(this.redirectEnabled){
      const params=new URLSearchParams();if(withDrive){params.set('drive','1');if(folderId)params.set('folder',parseFolder(folderId));}if(this.profile)params.set('subject',this.profile.sub);
      globalThis.location.assign(`/api/auth/start${params.size?`?${params}`:''}`);
      return new Promise(()=>{}); // Keep the entry blocked until the same-tab navigation completes.
    }
    const scope=`${IDENTITY_SCOPES} ${APPDATA_SCOPE}${withDrive?` ${DRIVE_SCOPE}`:''}`;
    // Prepare the library and token client on the entry page. Only the token
    // request belongs in the click; never wait or retry automatically here.
    if(!isGoogleReady())throw new Error('O acesso Google ainda não está pronto. Aguarde o carregamento e clique novamente para entrar.');
    const generation=this.generation;
    this.prepareAuthorization(withDrive);
    const request=this.prepared.get(withDrive);this.prepared.delete(withDrive);
    let response;
    try{
      response=await new Promise((resolve,reject)=>{
        request.resolve=resolve;request.reject=reject;
        try{request.client.requestAccessToken({prompt:this.profile?'':'select_account'});}catch(error){reject(error);}
      });
    }finally{request.resolve=request.reject=null;}
    if(generation!==this.generation)throw new Error('A entrada foi cancelada.');
    if(response.error||!response.access_token)throw new Error(response.error==='access_denied'?'A autorização Google não foi concedida. Clique novamente para entrar e autorize o acesso ao perfil.':'A entrada no Google não foi concluída. Tente novamente.');
    const required=withDrive?scope:IDENTITY_SCOPES;
    if(!google.accounts.oauth2.hasGrantedAllScopes(response,...required.split(' ')))throw new Error(withDrive?'Autorize o Drive e a configuração privada para recuperar sua pasta em outros dispositivos.':'Autorize o acesso ao seu perfil Google para entrar.');
    const profile=await fetchGoogleProfile(response.access_token);
    if(generation!==this.generation)throw new Error('A entrada foi cancelada.');
    if(this.profile&&profile.sub!==this.profile.sub)throw new Error('A conta escolhida no Drive é diferente da conta conectada. Saia para trocar de usuário.');
    this.profile=profile;this.token=response.access_token;this.expires=Date.now()+Number(response.expires_in)*1000;this.scopes=response.scope||'';this.canDrive=google.accounts.oauth2.hasGrantedAllScopes(response,DRIVE_SCOPE);this.canAppData=google.accounts.oauth2.hasGrantedAllScopes(response,APPDATA_SCOPE);
    return {profile,token:this.token,expires:this.expires,withDrive,canDrive:this.canDrive,canAppData:this.canAppData};
  }
  signOut(){this.generation++;this.prepared.clear();this.profile=null;this.token=null;this.expires=0;this.scopes='';this.canDrive=false;this.canAppData=false;}
}
