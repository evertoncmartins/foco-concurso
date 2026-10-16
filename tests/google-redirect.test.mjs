import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createAuthHandler} from '../server/google-redirect.mjs';
import {GoogleAccount,IDENTITY_SCOPES,APPDATA_SCOPE,DRIVE_SCOPE,consumeGoogleReturn} from '../src/auth.mjs';
const origin='https://foco-concurso-wine.vercel.app';
const env={GOOGLE_REDIRECT_ENABLED:'true',GOOGLE_CLIENT_ID:'fixture.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'fixture-only-secret-for-automated-tests'};
const profile={sub:'111',email:'test@example.test',email_verified:true,name:'Teste'};
const scope=`${IDENTITY_SCOPES} ${APPDATA_SCOPE} ${DRIVE_SCOPE}`;
function fixture(options={}){
  let now=Date.now();const calls=[];
  const fetcher=async(url,init)=>{calls.push({url,init});if(options.networkError)throw new Error('provider detail');if(url.endsWith('/token')){
    const renewing=init.body.get('grant_type')==='refresh_token';
    return Response.json(renewing?options.refreshResponse??{access_token:'fixture-renewed-token',expires_in:3600,scope:options.scope??scope}:{access_token:'fixture-access-token',...(options.noRefresh?{}:{refresh_token:'must-not-persist'}),expires_in:3600,scope:options.scope??scope},{status:renewing?options.refreshStatus??200:options.tokenStatus??200});
  }return Response.json(options.profile??profile);};
  const handler=action=>createAuthHandler(action,{env:{...env,...options.env},fetcher,clock:()=>now});
  const request=(path,init={})=>new Request(`${origin}${path}`,init);
  const cookieHeader=response=>response.headers.getSetCookie().map(c=>c.split(';')[0]).filter(c=>!c.endsWith('=')).join('; ');
  const start=async(query='')=>{const response=await handler('start')(request(`/api/auth/start${query}`,{headers:{'sec-fetch-site':'same-origin'}}));return {response,cookie:cookieHeader(response),target:new URL(response.headers.get('location'))};};
  const callback=async(flow,query='code=fixture-code')=>handler('callback')(request(`/api/auth/callback?state=${flow.target.searchParams.get('state')}&${query}`,{headers:{cookie:flow.cookie}}));
  const session=async(response,headers={})=>handler('session')(request('/api/auth/session',{method:'POST',headers:{origin,cookie:cookieHeader(response),...headers}}));
  const refresh=(returned,subject='111',headers={})=>handler('refresh')(request('/api/auth/refresh',{method:'POST',headers:{origin,cookie:cookieHeader(returned),...headers},body:JSON.stringify({subject})}));
  return {calls,handler,request,start,callback,session,refresh,cookieHeader,advance(ms){now+=ms;}};
}

test('acesso offline renova após uma hora com cookie cifrado de 30 dias sem expor o refresh token',async()=>{
  const f=fixture(),flow=await f.start('?drive=1'),returned=await f.callback(flow);
  assert.equal(flow.target.searchParams.get('access_type'),'offline');assert(flow.target.searchParams.get('prompt').includes('consent'));
  const persistent=returned.headers.getSetCookie().find(c=>c.startsWith('__Host-foco-drive-session='));
  assert.match(persistent,/Max-Age=2592000; HttpOnly; Secure; SameSite=Lax/);assert(!persistent.includes('must-not-persist'));
  f.advance(61*60*1000);const response=await f.refresh(returned),auth=(await response.json()).authorization;
  assert.equal(response.status,200);assert.equal(auth.token,'fixture-renewed-token');assert.equal(auth.profile.sub,'111');assert(auth.canRefresh);
  assert(!JSON.stringify(auth).includes('must-not-persist'));assert(!response.headers.getSetCookie()[0].includes('must-not-persist'));
  const refreshCall=f.calls.find(c=>c.init.body?.get('grant_type')==='refresh_token');assert.equal(refreshCall.init.body.get('refresh_token'),'must-not-persist');assert.equal(refreshCall.init.body.get('client_secret'),env.GOOGLE_CLIENT_SECRET);
  assert.match(response.headers.get('cache-control'),/no-store/);
});

test('renovação recusa origem, conta, método, cookie adulterado e sessão vencida antes de chamar Google',async()=>{
  const f=fixture(),returned=await f.callback(await f.start());const count=f.calls.length;
  assert.equal((await f.refresh(returned,'222')).status,409);
  assert.equal((await f.refresh(returned,'111',{origin:'https://evil.test'})).status,403);
  assert.equal((await f.refresh(returned,'111',{'sec-fetch-site':'cross-site'})).status,403);
  assert.equal((await f.handler('refresh')(f.request('/api/auth/refresh'))).status,405);
  const cookie=f.cookieHeader(returned).replace(/(__Host-foco-drive-session=)[^;]+/,'$1invalid');
  assert.equal((await f.refresh(returned,'111',{cookie})).status,401);
  f.advance(31*24*60*60*1000);assert.equal((await f.refresh(returned)).status,401);assert.equal(f.calls.length,count);
});

test('revogação limpa só a sessão de renovação, enquanto falhas transitórias preservam a credencial',async()=>{
  const options={},f=fixture(options),returned=await f.callback(await f.start());
  options.refreshStatus=503;options.refreshResponse={error:'temporarily_unavailable'};
  let response=await f.refresh(returned);assert.equal(response.status,503);assert.equal(response.headers.getSetCookie().length,0);
  options.refreshStatus=400;options.refreshResponse={error:'invalid_grant',error_description:'private provider detail'};
  response=await f.refresh(returned);assert.equal(response.status,401);assert.match(response.headers.getSetCookie()[0],/Max-Age=0/);assert(!JSON.stringify(await response.json()).includes('private provider detail'));
});

test('renovação confere identidade, preserva refresh token ausente e aceita rotação sem expor a credencial',async()=>{
  const options={},f=fixture(options),returned=await f.callback(await f.start());
  let renewed=await f.refresh(returned);assert.equal(renewed.status,200);
  await f.refresh(renewed);assert.equal(f.calls.filter(c=>c.init.body?.get('grant_type')==='refresh_token').at(-1).init.body.get('refresh_token'),'must-not-persist');
  options.refreshResponse={access_token:'next-access',expires_in:3600,scope,refresh_token:'fixture-rotated-renewal'};
  renewed=await f.refresh(renewed);assert(!JSON.stringify(await renewed.clone().json()).includes('fixture-rotated-renewal'));
  await f.refresh(renewed);assert.equal(f.calls.filter(c=>c.init.body?.get('grant_type')==='refresh_token').at(-1).init.body.get('refresh_token'),'fixture-rotated-renewal');
  options.profile={...profile,sub:'222'};assert.equal((await f.refresh(renewed)).status,401);
});

test('logout elimina cookies deste navegador e exige POST da mesma origem',async()=>{
  const f=fixture(),returned=await f.callback(await f.start());
  let response=await f.handler('logout')(f.request('/api/auth/logout',{method:'POST',headers:{origin,cookie:f.cookieHeader(returned)}}));
  assert.equal(response.status,200);assert.equal(response.headers.getSetCookie().length,3);assert(response.headers.getSetCookie().every(c=>c.includes('Max-Age=0')));
  assert.equal((await f.handler('logout')(f.request('/api/auth/logout'))).status,405);
  assert.equal((await f.handler('logout')(f.request('/api/auth/logout',{method:'POST',headers:{origin:'https://evil.test'}}))).status,403);
});
test('status only enables the configured production origin and exposes no secret',async()=>{
  const f=fixture();const ready=await f.handler('status')(f.request('/api/auth/status'));assert.deepEqual(await ready.json(),{enabled:true,clientId:env.GOOGLE_CLIENT_ID});assert.match(ready.headers.get('cache-control'),/no-store/);
  for(const overrides of [{GOOGLE_CLIENT_SECRET:''},{GOOGLE_REDIRECT_ENABLED:'false'},{GOOGLE_AUTH_ORIGIN:'http://localhost'}]){const disabled=fixture({env:overrides});assert.deepEqual(await (await disabled.handler('status')(disabled.request('/api/auth/status'))).json(),{enabled:false});}
  assert.deepEqual(await (await f.handler('status')(new Request('https://preview.vercel.app/api/auth/status'))).json(),{enabled:false});
});
test('start redirects to Google with PKCE and protected cookies, rejecting cross-site starts',async()=>{
  const f=fixture(),flow=await f.start();assert.equal(flow.response.status,303);assert.equal(flow.target.origin,'https://accounts.google.com');assert.equal(flow.target.searchParams.get('redirect_uri'),`${origin}/api/auth/callback`);assert.equal(flow.target.searchParams.get('response_type'),'code');assert.equal(flow.target.searchParams.get('code_challenge_method'),'S256');assert.equal(flow.target.searchParams.get('access_type'),'offline');assert(!flow.target.href.includes(env.GOOGLE_CLIENT_SECRET));
  assert.match(flow.response.headers.getSetCookie()[0],/HttpOnly; Secure; SameSite=Lax/);assert.match(flow.response.headers.getSetCookie()[0],/Max-Age=600/);assert(!flow.cookie.includes('state'));assert(!flow.cookie.includes('fixture-access-token'));
  assert.equal((await f.handler('start')(f.request('/api/auth/start',{headers:{'sec-fetch-site':'cross-site'}}))).status,403);
  assert.equal((await f.handler('start')(f.request('/api/auth/start?drive=1&folder=https://evil.test/'))).status,400);
});
test('callback exchanges code with secret and matching PKCE, then returns cleanly and consumes handoff',async()=>{
  const f=fixture(),flow=await f.start('?drive=1&subject=111&folder=my-folder'),returned=await f.callback(flow);assert.equal(returned.headers.get('location'),`${origin}/?google_auth=success`);assert.equal(f.calls.length,2);
  const body=f.calls[0].init.body;assert.equal(body.get('client_secret'),env.GOOGLE_CLIENT_SECRET);assert.equal(body.get('code'),'fixture-code');assert.equal(createHash('sha256').update(body.get('code_verifier')).digest('base64url'),flow.target.searchParams.get('code_challenge'));
  assert(!f.cookieHeader(returned).includes('fixture-access-token'));assert(!f.cookieHeader(returned).includes('must-not-persist'));assert.match(returned.headers.getSetCookie()[1],/Max-Age=120/);
  const session=await f.session(returned),authorization=(await session.json()).authorization;assert.equal(authorization.profile.sub,'111');assert.equal(authorization.profile.email_verified,true);assert.equal(authorization.pendingFolderId,'my-folder');assert.equal(authorization.canDrive,true);assert.equal(authorization.token,'fixture-access-token');assert(!JSON.stringify(authorization).includes('must-not-persist'));assert.match(session.headers.getSetCookie()[0],/Max-Age=0/);assert.match(session.headers.get('cache-control'),/no-store/);
  const account=new GoogleAccount(env.GOOGLE_CLIENT_ID);account.redirectEnabled=true;const restored=await account.restoreRedirect(async()=>Response.json({authorization}));assert.equal(restored.pendingFolderId,'my-folder');assert.equal(account.profile.sub,'111');assert.equal(account.token,'fixture-access-token');account.signOut();assert.equal(account.token,null);
  assert.equal((await f.session(returned,{origin:'https://evil.test'})).status,403);
  f.advance(121000);assert.equal((await (await f.session(returned)).json()).authorization,null);
});
test('missing, changed, duplicated and expired state never exchange a code',async()=>{
  const f=fixture(),flow=await f.start();
  for(const [query,cookie] of [['state=wrong&code=x',flow.cookie],[`state=${flow.target.searchParams.get('state')}&code=x`,''],[`state=${flow.target.searchParams.get('state')}&state=wrong&code=x`,flow.cookie],[`state=${flow.target.searchParams.get('state')}&code=x`,flow.cookie.slice(0,-4)+'AAAA']]){
    const response=await f.handler('callback')(f.request(`/api/auth/callback?${query}`,{headers:{cookie}}));assert.equal(response.headers.get('location'),`${origin}/?google_auth=invalid_request`);
  }
  f.advance(601000);assert.equal((await f.callback(flow)).headers.get('location'),`${origin}/?google_auth=invalid_request`);assert.equal(f.calls.length,0);
});
test('cancelled consent and duplicate codes clear flow without calling Google',async()=>{
  const f=fixture(),flow=await f.start();assert.equal((await f.callback(flow,'error=access_denied')).headers.get('location'),`${origin}/?google_auth=denied`);assert.equal((await f.callback(flow,'code=x&code=y')).headers.get('location'),`${origin}/?google_auth=invalid_request`);assert.equal(f.calls.length,0);
});
test('wrong account, unverified identity, insufficient permissions and provider failures return safe errors',async()=>{
  for(const [options,query,reason] of [[{profile:{...profile,sub:'222'}},'?drive=1&subject=111','account_mismatch'],[{profile:{...profile,email_verified:false}},'','failed'],[{scope:IDENTITY_SCOPES},'?drive=1','permissions'],[{scope:DRIVE_SCOPE},'','permissions'],[{tokenStatus:400},'','failed'],[{networkError:true},'','failed']]){
    const f=fixture(options),response=await f.callback(await f.start(query));assert.equal(response.headers.get('location'),`${origin}/?google_auth=${reason}`);assert(response.headers.getSetCookie().every(c=>c.includes('Max-Age=0')));assert(!response.headers.get('location').includes('provider detail'));
  }
});
test('client fallback does not enable redirect on a static host or different client ID',async()=>{
  const account=new GoogleAccount(env.GOOGLE_CLIENT_ID);
  assert.equal(await account.prepareRedirect(async()=>new Response('',{status:404})),false);
  assert.equal(await account.prepareRedirect(async()=>Response.json({enabled:true,clientId:'other.apps.googleusercontent.com'})),false);
  assert.equal(await account.prepareRedirect(async()=>Response.json({enabled:true,clientId:env.GOOGLE_CLIENT_ID})),true);
  await assert.rejects(account.restoreRedirect(async()=>Response.json({authorization:null})),/expirou/);assert.equal(account.profile,null);
});
test('client replaces the login entry in the same tab without Google SDK and removes return notices',async()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'location'),destinations=[];
  try{
    Object.defineProperty(globalThis,'location',{configurable:true,value:{replace:value=>destinations.push(value),assign:()=>assert.fail('OAuth must replace the entry')}});
    const account=new GoogleAccount(env.GOOGLE_CLIENT_ID);account.redirectEnabled=true;account.profile=profile;
    void account.authorize(true,{folderId:'https://drive.google.com/drive/folders/my-folder'});
    assert.equal(destinations.length,1);const target=new URL(destinations[0],origin);assert.equal(target.pathname,'/api/auth/start');assert.equal(target.searchParams.get('drive'),'1');assert.equal(target.searchParams.get('folder'),'my-folder');assert.equal(target.searchParams.get('subject'),'111');assert.equal(account.token,null);
    const history={state:{},replaceState(...args){this.args=args;}};assert.equal(consumeGoogleReturn({href:`${origin}/?google_auth=success&keep=yes#position`},history),'success');assert.equal(history.args[2],'/?keep=yes#position');
  }finally{if(descriptor)Object.defineProperty(globalThis,'location',descriptor);else delete globalThis.location;}
});
