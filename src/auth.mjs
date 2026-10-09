import {normalizeGoogleProfile} from './account.mjs';
export const IDENTITY_SCOPES='openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';
export const DRIVE_SCOPE='https://www.googleapis.com/auth/drive';
export const APPDATA_SCOPE='https://www.googleapis.com/auth/drive.appdata';
export function validClientId(value){return typeof value==='string'&&/^[\w-]+\.apps\.googleusercontent\.com$/.test(value);}
let library;
export async function prepareGoogle(){
  if(globalThis.google?.accounts?.oauth2)return;
  if(library)return library;
  library=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.onload=resolve;script.onerror=()=>reject(new Error('Não foi possível carregar o acesso Google. Verifique sua conexão.'));document.head.append(script);});
  try{await library;}catch(e){library=null;throw e;}
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
    await prepareGoogle();const generation=this.generation;
    const response=await new Promise((resolve,reject)=>{
      const required=withDrive?scope:IDENTITY_SCOPES;
      const client=google.accounts.oauth2.initTokenClient({client_id:this.clientId,scope,include_granted_scopes:true,...(this.profile?{login_hint:this.profile.sub}:{}),callback:r=>{if(r.error||!r.access_token)return reject(new Error('A entrada no Google não foi concluída.'));if(!google.accounts.oauth2.hasGrantedAllScopes(r,...required.split(' ')))return reject(new Error(withDrive?'Autorize o Drive e a configuração privada para recuperar sua pasta em outros dispositivos.':'Autorize o acesso ao seu perfil Google para entrar.'));resolve(r);},error_callback:()=>reject(new Error('A entrada foi cancelada ou o popup foi bloqueado. Tente novamente.'))});
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
