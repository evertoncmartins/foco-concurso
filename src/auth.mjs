import {normalizeGoogleProfile} from './account.mjs';
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
export class GoogleAccount extends EventTarget{
  constructor(clientId){super();this.clientId=clientId;this.profile=null;this.token=null;this.expires=0;this.scopes='';this.generation=0;this.canDrive=false;this.canAppData=false;}
  async authorize(withDrive=false){
    if(!validClientId(this.clientId))throw new Error('O responsável pela plataforma ainda precisa configurar o acesso Google.');
    const scope=`${IDENTITY_SCOPES} ${APPDATA_SCOPE}${withDrive?` ${DRIVE_SCOPE}`:''}`;
    // Loading first and opening later loses the original click in some browsers.
    // The entry page prepares GIS; this request must run before any await.
    if(!isGoogleReady())throw new Error('O acesso Google ainda não está pronto. Aguarde o carregamento e clique novamente para entrar.');
    const generation=this.generation;
    const response=await new Promise((resolve,reject)=>{
      const required=withDrive?scope:IDENTITY_SCOPES;
      const client=google.accounts.oauth2.initTokenClient({client_id:this.clientId,scope,include_granted_scopes:true,...(this.profile?{login_hint:this.profile.sub}:{}),callback:r=>{if(r.error||!r.access_token)return reject(new Error(r.error==='access_denied'?'A autorização Google não foi concedida. Clique novamente para entrar e autorize o acesso ao perfil.':'A entrada no Google não foi concluída. Tente novamente.'));if(!google.accounts.oauth2.hasGrantedAllScopes(r,...required.split(' ')))return reject(new Error(withDrive?'Autorize o Drive e a configuração privada para recuperar sua pasta em outros dispositivos.':'Autorize o acesso ao seu perfil Google para entrar.'));resolve(r);},error_callback:error=>reject(popupError(error))});
      client.requestAccessToken({prompt:this.profile?'':'select_account'});
    });
    const profile=await fetchGoogleProfile(response.access_token);
    if(generation!==this.generation)throw new Error('A entrada foi cancelada.');
    if(this.profile&&profile.sub!==this.profile.sub)throw new Error('A conta escolhida no Drive é diferente da conta conectada. Saia para trocar de usuário.');
    this.profile=profile;this.token=response.access_token;this.expires=Date.now()+Number(response.expires_in)*1000;this.scopes=response.scope||'';this.canDrive=google.accounts.oauth2.hasGrantedAllScopes(response,DRIVE_SCOPE);this.canAppData=google.accounts.oauth2.hasGrantedAllScopes(response,APPDATA_SCOPE);
    return {profile,token:this.token,expires:this.expires,withDrive,canDrive:this.canDrive,canAppData:this.canAppData};
  }
  signOut(){this.generation++;this.profile=null;this.token=null;this.expires=0;this.scopes='';this.canDrive=false;this.canAppData=false;}
}
