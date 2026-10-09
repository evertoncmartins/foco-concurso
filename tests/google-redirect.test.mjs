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
  const fetcher=async(url,init)=>{calls.push({url,init});if(options.networkError)throw new Error('provider detail');return url.endsWith('/token')?Response.json({access_token:'fixture-access-token',refresh_token:'must-not-persist',expires_in:3600,scope:options.scope??scope},{status:options.tokenStatus??200}):Response.json(options.profile??profile);};
  const handler=action=>createAuthHandler(action,{env:{...env,...options.env},fetcher,clock:()=>now});
  const request=(path,init={})=>new Request(`${origin}${path}`,init);
  const cookieHeader=response=>response.headers.getSetCookie().map(c=>c.split(';')[0]).filter(c=>!c.endsWith('=')).join('; ');
  const start=async(query='')=>{const response=await handler('start')(request(`/api/auth/start${query}`,{headers:{'sec-fetch-site':'same-origin'}}));return {response,cookie:cookieHeader(response),target:new URL(response.headers.get('location'))};};
  const callback=async(flow,query='code=fixture-code')=>handler('callback')(request(`/api/auth/callback?state=${flow.target.searchParams.get('state')}&${query}`,{headers:{cookie:flow.cookie}}));
  const session=async(response,headers={})=>handler('session')(request('/api/auth/session',{method:'POST',headers:{origin,cookie:cookieHeader(response),...headers}}));
  return {calls,handler,request,start,callback,session,cookieHeader,advance(ms){now+=ms;}};
}
test('status only enables the configured production origin and exposes no secret',async()=>{
  const f=fixture();const ready=await f.handler('status')(f.request('/api/auth/status'));assert.deepEqual(await ready.json(),{enabled:true,clientId:env.GOOGLE_CLIENT_ID});assert.match(ready.headers.get('cache-control'),/no-store/);
  for(const overrides of [{GOOGLE_CLIENT_SECRET:''},{GOOGLE_REDIRECT_ENABLED:'false'},{GOOGLE_AUTH_ORIGIN:'http://localhost'}]){const disabled=fixture({env:overrides});assert.deepEqual(await (await disabled.handler('status')(disabled.request('/api/auth/status'))).json(),{enabled:false});}
  assert.deepEqual(await (await f.handler('status')(new Request('https://preview.vercel.app/api/auth/status'))).json(),{enabled:false});
});
test('start redirects to Google with PKCE and protected cookies, rejecting cross-site starts',async()=>{
  const f=fixture(),flow=await f.start();assert.equal(flow.response.status,303);assert.equal(flow.target.origin,'https://accounts.google.com');assert.equal(flow.target.searchParams.get('redirect_uri'),`${origin}/api/auth/callback`);assert.equal(flow.target.searchParams.get('response_type'),'code');assert.equal(flow.target.searchParams.get('code_challenge_method'),'S256');assert.equal(flow.target.searchParams.get('access_type'),'online');assert(!flow.target.href.includes(env.GOOGLE_CLIENT_SECRET));
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
test('client navigates in the same tab without Google SDK and removes return notices',async()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'location'),destinations=[];
  try{
    Object.defineProperty(globalThis,'location',{configurable:true,value:{assign:value=>destinations.push(value)}});
    const account=new GoogleAccount(env.GOOGLE_CLIENT_ID);account.redirectEnabled=true;account.profile=profile;
    void account.authorize(true,{folderId:'https://drive.google.com/drive/folders/my-folder'});
    assert.equal(destinations.length,1);const target=new URL(destinations[0],origin);assert.equal(target.pathname,'/api/auth/start');assert.equal(target.searchParams.get('drive'),'1');assert.equal(target.searchParams.get('folder'),'my-folder');assert.equal(target.searchParams.get('subject'),'111');assert.equal(account.token,null);
    const history={state:{},replaceState(...args){this.args=args;}};assert.equal(consumeGoogleReturn({href:`${origin}/?google_auth=success&keep=yes#position`},history),'success');assert.equal(history.args[2],'/?keep=yes#position');
  }finally{if(descriptor)Object.defineProperty(globalThis,'location',descriptor);else delete globalThis.location;}
});
