import {randomBytes,createHash,hkdfSync,createCipheriv,createDecipheriv,timingSafeEqual} from 'node:crypto';
import publicConfig from '../public/app-config.json' with {type:'json'};
import {normalizeGoogleProfile,parseFolder} from '../src/account.mjs';
import {IDENTITY_SCOPES,APPDATA_SCOPE,DRIVE_SCOPE,validClientId} from '../src/auth.mjs';

const DEFAULT_ORIGIN='https://foco-concurso-wine.vercel.app';
const FLOW='__Host-foco-oauth-flow',HANDOFF='__Host-foco-oauth-return',SESSION='__Host-foco-drive-session';
const FLOW_TTL=600,HANDOFF_TTL=120,SESSION_TTL=30*24*60*60;
const headers={'Cache-Control':'no-store, private','Pragma':'no-cache','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
function configuration(env){
  const clientId=env.GOOGLE_CLIENT_ID||env.PUBLIC_GOOGLE_CLIENT_ID||publicConfig.googleClientId;
  const secret=env.GOOGLE_CLIENT_SECRET||'';
  let origin;try{const url=new URL(env.GOOGLE_AUTH_ORIGIN||DEFAULT_ORIGIN);if(url.protocol==='https:'&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash)origin=url.origin;}catch{}
  const enabled=env.GOOGLE_REDIRECT_ENABLED==='true'&&validClientId(clientId)&&secret.length>=20&&!!origin;
  return {enabled,clientId,secret,origin,callback:origin?`${origin}/api/auth/callback`:null};
}
function cookie(name,value,ttl){return `${name}=${value}; Path=/; Max-Age=${ttl}; HttpOnly; Secure; SameSite=Lax`;}
function cookies(request){
  const result=new Map();for(const part of (request.headers.get('cookie')||'').split(';')){const at=part.indexOf('=');if(at>0)result.set(part.slice(0,at).trim(),part.slice(at+1).trim());}return result;
}
function seal(config,name,data){
  const key=hkdfSync('sha256',config.secret,config.origin,`foco-oauth-v1:${config.clientId}:${name}`,32);
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(name));
  const body=Buffer.concat([cipher.update(JSON.stringify(data),'utf8'),cipher.final()]);
  const value=['v1',iv.toString('base64url'),body.toString('base64url'),cipher.getAuthTag().toString('base64url')].join('.');
  if(value.length>3800)throw new Error('Invalid cookie size');return value;
}
function unseal(config,name,value,now,ttl){
  try{
    if(typeof value!=='string'||value.length>3800||!/^[\w.-]+$/.test(value))return null;
    const [version,iv,body,tag,...extra]=value.split('.');if(version!=='v1'||extra.length||!iv||!body||!tag)return null;
    const ivBytes=Buffer.from(iv,'base64url'),tagBytes=Buffer.from(tag,'base64url');if(ivBytes.length!==12||tagBytes.length!==16)return null;
    const key=hkdfSync('sha256',config.secret,config.origin,`foco-oauth-v1:${config.clientId}:${name}`,32);
    const decipher=createDecipheriv('aes-256-gcm',key,ivBytes);decipher.setAAD(Buffer.from(name));decipher.setAuthTag(tagBytes);
    const data=JSON.parse(Buffer.concat([decipher.update(Buffer.from(body,'base64url')),decipher.final()]).toString());
    if(!Number.isFinite(data.iat)||!Number.isFinite(data.exp)||data.iat>now+10000||data.exp<=now||data.exp-data.iat>ttl*1000||data.exp<=data.iat)return null;
    return data;
  }catch{return null;}
}
function response(body,status=200,setCookies=[]){
  const h=new Headers(headers);h.set('Content-Type','application/json; charset=utf-8');for(const c of setCookies)h.append('Set-Cookie',c);
  return new Response(JSON.stringify(body),{status,headers:h});
}
function redirect(location,setCookies=[]){const h=new Headers(headers);h.set('Location',location);for(const c of setCookies)h.append('Set-Cookie',c);return new Response(null,{status:303,headers:h});}
function constantEqual(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length>256||b.length>256)return false;const first=Buffer.from(a),second=Buffer.from(b);return first.length===second.length&&timingSafeEqual(first,second);}
function sameOrigin(request,config){return request.headers.get('origin')===config.origin&&(!request.headers.get('sec-fetch-site')||request.headers.get('sec-fetch-site')==='same-origin');}
function granted(scope,required){const scopes=new Set(scope.split(/\s+/));return required.split(' ').every(s=>scopes.has(s)||(s.endsWith('/userinfo.email')&&scopes.has('email'))||(s.endsWith('/userinfo.profile')&&scopes.has('profile')));}
function validRefresh(value){return typeof value==='string'&&value.length>0&&value.length<=2048;}
function sessionCookie(config,subject,refreshToken,scope,now){
  const compactScope=`${IDENTITY_SCOPES}${granted(scope,APPDATA_SCOPE)?` ${APPDATA_SCOPE}`:''}${granted(scope,DRIVE_SCOPE)?` ${DRIVE_SCOPE}`:''}`;
  return cookie(SESSION,seal(config,SESSION,{subject,refreshToken,scope:compactScope,iat:now,exp:now+SESSION_TTL*1000}),SESSION_TTL);
}

// The renewal credential is encrypted in a host-only HttpOnly cookie. It is
// never exposed to JavaScript, localStorage, Drive files or the public build.
export function createAuthHandler(action,{env=process.env,fetcher=globalThis.fetch,clock=Date.now}={}){
  return async request=>{
    const config=configuration(env),url=new URL(request.url),now=clock();
    const enabled=config.enabled&&url.origin===config.origin;
    if(action==='status'){
      if(request.method!=='GET')return response({error:'method_not_allowed'},405);
      return response({enabled,...(enabled?{clientId:config.clientId}: {})});
    }
    if(!enabled)return response({error:'redirect_not_configured'},503);
    const jar=cookies(request);
    const persisted=unseal(config,SESSION,jar.get(SESSION),now,SESSION_TTL);
    if(action==='logout'){
      if(request.method!=='POST')return response({error:'method_not_allowed'},405);
      if(!sameOrigin(request,config))return response({error:'invalid_origin'},403);
      return response({signedOut:true},200,[cookie(SESSION,'',0),cookie(HANDOFF,'',0),cookie(FLOW,'',0)]);
    }
    if(action==='refresh'){
      if(request.method!=='POST')return response({error:'method_not_allowed'},405);
      if(!sameOrigin(request,config))return response({error:'invalid_origin'},403);
      let subject;
      try{const text=await request.text();if(text.length>512)throw new Error();subject=JSON.parse(text).subject;}catch{return response({error:'invalid_request'},400);}
      if(!persisted||!validRefresh(persisted.refreshToken))return response({error:'reauthorization_required'},401,[cookie(SESSION,'',0)]);
      if(subject!==persisted.subject)return response({error:'account_mismatch'},409);
      const denied=()=>response({error:'reauthorization_required'},401,[cookie(SESSION,'',0)]);
      try{
        const exchange=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.clientId,client_secret:config.secret,refresh_token:persisted.refreshToken,grant_type:'refresh_token'}),signal:AbortSignal.timeout(20000),cache:'no-store'});
        if(!exchange.ok){const problem=await exchange.json().catch(()=>({}));return problem.error==='invalid_grant'?denied():response({error:'renewal_unavailable'},503);}
        const token=await exchange.json(),seconds=Math.min(3600,Number(token.expires_in)),scope=token.scope??persisted.scope;
        if(typeof token.access_token!=='string'||!token.access_token||token.access_token.length>4096||!Number.isFinite(seconds)||seconds<30||typeof scope!=='string'||!granted(scope,IDENTITY_SCOPES))return response({error:'renewal_unavailable'},503);
        const who=await fetcher('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${token.access_token}`},signal:AbortSignal.timeout(20000),cache:'no-store'});
        if(!who.ok)return who.status===401?denied():response({error:'renewal_unavailable'},503);
        const profile=normalizeGoogleProfile(await who.json());if(profile.sub!==subject)return denied();
        const refreshToken=token.refresh_token??persisted.refreshToken;if(!validRefresh(refreshToken))return response({error:'renewal_unavailable'},503);
        const canDrive=granted(scope,DRIVE_SCOPE),canAppData=granted(scope,APPDATA_SCOPE);
        return response({authorization:{profile:{...profile,email_verified:true},token:token.access_token,expires:clock()+seconds*1000,scope,canDrive,canAppData,withDrive:canDrive,canRefresh:true}},200,[sessionCookie(config,subject,refreshToken,scope,clock())]);
      }catch{return response({error:'renewal_unavailable'},503);}
    }
    if(action==='session'){
      if(request.method!=='POST')return response({error:'method_not_allowed'},405);
      if(!sameOrigin(request,config))return response({error:'invalid_origin'},403);
      const data=unseal(config,HANDOFF,jar.get(HANDOFF),now,HANDOFF_TTL),clear=[cookie(HANDOFF,'',0)];
      if(!data)return response({authorization:null},200,clear);
      if(!data.authorization||!Number.isFinite(data.authorization.expires)||data.authorization.expires<=now+10000)return response({authorization:null},200,clear);
      return response({authorization:data.authorization},200,clear);
    }
    if(action==='start'){
      if(request.method!=='GET')return response({error:'method_not_allowed'},405);
      const site=request.headers.get('sec-fetch-site'),origin=request.headers.get('origin');
      if((site&&!['same-origin','none'].includes(site))||(origin&&origin!==config.origin))return response({error:'invalid_origin'},403);
      const withDrive=url.searchParams.get('drive')==='1',expectedSubject=url.searchParams.get('subject')||'';
      if(expectedSubject&&!/^[A-Za-z0-9_-]{1,255}$/.test(expectedSubject))return response({error:'invalid_request'},400);
      let folderId='';try{if(withDrive&&url.searchParams.has('folder'))folderId=parseFolder(url.searchParams.get('folder'));}catch{return response({error:'invalid_folder'},400);}
      const state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');
      const scope=`${IDENTITY_SCOPES} ${APPDATA_SCOPE}${withDrive?` ${DRIVE_SCOPE}`:''}`;
      const flow={state,verifier,scope,withDrive,expectedSubject,folderId,iat:now,exp:now+FLOW_TTL*1000};
      const target=new URL('https://accounts.google.com/o/oauth2/v2/auth');
      const reusable=persisted&&validRefresh(persisted.refreshToken)&&persisted.subject===expectedSubject;
      target.search=new URLSearchParams({client_id:config.clientId,redirect_uri:config.callback,response_type:'code',scope,state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',include_granted_scopes:'true',access_type:'offline',...(expectedSubject?{login_hint:expectedSubject,...(!reusable?{prompt:'consent'}:{})}:{prompt:'select_account consent'})}).toString();
      return redirect(target.href,[cookie(FLOW,seal(config,FLOW,flow),FLOW_TTL),cookie(HANDOFF,'',0)]);
    }
    if(action==='callback'){
      if(request.method!=='GET')return response({error:'method_not_allowed'},405);
      const clear=[cookie(FLOW,'',0),cookie(HANDOFF,'',0)],fail=reason=>redirect(`${config.origin}/?google_auth=${reason}`,clear);
      const flow=unseal(config,FLOW,jar.get(FLOW),now,FLOW_TTL);
      if(!flow||url.searchParams.getAll('state').length!==1||!constantEqual(flow.state,url.searchParams.get('state')))return fail('invalid_request');
      if(url.searchParams.has('error'))return fail(url.searchParams.get('error')==='access_denied'?'denied':'failed');
      if(url.searchParams.getAll('code').length!==1)return fail('invalid_request');
      const code=url.searchParams.get('code');if(!code||code.length>4096)return fail('invalid_request');
      try{
        const exchange=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.clientId,client_secret:config.secret,code,code_verifier:flow.verifier,grant_type:'authorization_code',redirect_uri:config.callback}),signal:AbortSignal.timeout(20000),cache:'no-store'});
        if(!exchange.ok)return fail('failed');const token=await exchange.json();
        if(typeof token.access_token!=='string'||!token.access_token||token.access_token.length>4096||typeof token.scope!=='string'||!granted(token.scope,IDENTITY_SCOPES))return fail('permissions');
        const seconds=Math.min(3600,Number(token.expires_in));if(!Number.isFinite(seconds)||seconds<30)return fail('failed');
        const who=await fetcher('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${token.access_token}`},signal:AbortSignal.timeout(20000),cache:'no-store'});
        if(!who.ok)return fail('failed');const profile=normalizeGoogleProfile(await who.json());
        if(flow.expectedSubject&&profile.sub!==flow.expectedSubject)return fail('account_mismatch');
        const canDrive=granted(token.scope,DRIVE_SCOPE),canAppData=granted(token.scope,APPDATA_SCOPE);
        if(flow.withDrive&&(!canDrive||!canAppData))return fail('permissions');
        const refreshToken=validRefresh(token.refresh_token)?token.refresh_token:persisted?.subject===profile.sub&&validRefresh(persisted.refreshToken)?persisted.refreshToken:null;
        const authorization={profile:{...profile,email_verified:true},token:token.access_token,expires:clock()+seconds*1000,scope:token.scope,withDrive:flow.withDrive,canDrive,canAppData,canRefresh:!!refreshToken,...(flow.folderId?{pendingFolderId:flow.folderId}: {})};
        const issued=clock(),handoff=seal(config,HANDOFF,{authorization,iat:issued,exp:issued+HANDOFF_TTL*1000});
        return redirect(`${config.origin}/?google_auth=success`,[cookie(FLOW,'',0),cookie(HANDOFF,handoff,HANDOFF_TTL),refreshToken?sessionCookie(config,profile.sub,refreshToken,token.scope,issued):cookie(SESSION,'',0)]);
      }catch{return fail('failed');}
    }
    return response({error:'not_found'},404);
  };
}
