import test from 'node:test';
import assert from 'node:assert/strict';
import {GoogleAccount,IDENTITY_SCOPES} from '../src/auth.mjs';

const clientId='fixture.apps.googleusercontent.com';
const profile={sub:'111',name:'Estudante',email:'test@example.test',email_verified:true};
function installGoogle(request){
  globalThis.google={accounts:{oauth2:{hasGrantedAllScopes:()=>true,initTokenClient:config=>({requestAccessToken:()=>request(config)})}}};
}
function grant(config){config.callback({access_token:'fixture-token',expires_in:3600,scope:IDENTITY_SCOPES});}
function keepGlobals(){
  const keys=['google','fetch','document','setTimeout','clearTimeout'];
  const previous=keys.map(key=>[key,Object.hasOwn(globalThis,key),globalThis[key]]);
  return ()=>{for(const [key,existed,value] of previous){if(existed)globalThis[key]=value;else delete globalThis[key];}};
}
async function freshLoader(name){return import(`../src/auth.mjs?loader-test=${name}`);}
function scriptDocument(){
  const scripts=[];
  globalThis.document={createElement:()=>({removed:false,remove(){this.removed=true;}}),head:{append(script){scripts.push(script);}}};
  return scripts;
}

test('Google abre a janela no mesmo clique, antes de qualquer espera assíncrona',async()=>{
  const restore=keepGlobals();let requests=0;
  installGoogle(config=>{requests++;grant(config);});globalThis.fetch=async()=>new Response(JSON.stringify(profile));
  try{
    const auth=new GoogleAccount(clientId),pending=auth.authorize();
    assert.equal(requests,1,'requestAccessToken must execute before authorize returns its promise');
    assert.equal((await pending).profile.sub,'111');
  }finally{restore();}
});

test('preparação do cliente ocorre antes do clique e não inicia autorização',async()=>{
  const restore=keepGlobals();let preparations=0,requests=0;
  globalThis.google={accounts:{oauth2:{hasGrantedAllScopes:()=>true,initTokenClient:config=>{preparations++;return {requestAccessToken:()=>{requests++;grant(config);}};}}}};
  globalThis.fetch=async()=>new Response(JSON.stringify(profile));
  try{
    const auth=new GoogleAccount(clientId);auth.prepareAuthorization();auth.prepareAuthorization();
    assert.equal(preparations,1);assert.equal(requests,0);assert.equal(auth.profile,null);
    const pending=auth.authorize();assert.equal(requests,1);assert.equal(preparations,1);
    assert.equal((await pending).profile.sub,'111');
  }finally{restore();}
});

test('repetição preparada ignora callbacks tardias do popup anterior',async()=>{
  const restore=keepGlobals(),clients=[];
  globalThis.google={accounts:{oauth2:{hasGrantedAllScopes:()=>true,initTokenClient:config=>{clients.push(config);return {requestAccessToken(){}};}}}};
  globalThis.fetch=async()=>new Response(JSON.stringify(profile));
  try{
    const auth=new GoogleAccount(clientId);auth.prepareAuthorization();const first=auth.authorize();
    clients[0].error_callback({type:'popup_failed_to_open'});await assert.rejects(first,error=>error.code==='popup_failed_to_open');
    auth.signOut();auth.prepareAuthorization();const second=auth.authorize();
    clients[0].error_callback({type:'popup_closed'});grant(clients[0]);assert.equal(auth.profile,null);
    grant(clients[1]);assert.equal((await second).profile.sub,'111');
    assert.equal(clients.length,2);
  }finally{restore();}
});

test('troca do ID público substitui cliente preparado sem reutilizar a configuração antiga',async()=>{
  const restore=keepGlobals(),ids=[];
  globalThis.google={accounts:{oauth2:{hasGrantedAllScopes:()=>true,initTokenClient:config=>{ids.push(config.client_id);return {requestAccessToken:()=>grant(config)};}}}};
  globalThis.fetch=async()=>new Response(JSON.stringify(profile));
  try{
    const auth=new GoogleAccount(clientId);auth.prepareAuthorization();auth.clientId='another.apps.googleusercontent.com';auth.prepareAuthorization();
    assert.equal((await auth.authorize()).profile.sub,'111');assert.deepEqual(ids,[clientId,auth.clientId]);
  }finally{restore();}
});

test('autorização sem biblioteca pronta exige novo clique e não abre janela após carregar',async()=>{
  const restore=keepGlobals();delete globalThis.google;const scripts=scriptDocument();
  try{
    const auth=new GoogleAccount(clientId);
    await assert.rejects(()=>auth.authorize(),/Aguarde o carregamento e clique novamente/);
    assert.equal(scripts.length,0);assert.equal(auth.profile,null);assert.equal(auth.token,null);
  }finally{restore();}
});

test('bloqueio e fechamento da janela têm causas distintas e permitem tentativa manual',async()=>{
  const restore=keepGlobals();let requests=0,type='popup_failed_to_open';
  installGoogle(config=>{requests++;if(type)config.error_callback({type});else grant(config);});globalThis.fetch=async()=>new Response(JSON.stringify(profile));
  try{
    const auth=new GoogleAccount(clientId);
    await assert.rejects(()=>auth.authorize(),error=>error.code===type&&error.message.includes('Permita pop-ups'));
    assert.equal(auth.profile,null);assert.equal(auth.token,null);assert.equal(requests,1);
    type='popup_closed';await assert.rejects(()=>auth.authorize(),error=>error.code===type&&error.message.includes('foi fechada')&&!error.message.includes('bloqueou'));
    assert.equal(requests,2);type=null;
    assert.equal((await auth.authorize()).profile.sub,'111');assert.equal(requests,3);
  }finally{restore();}
});

test('erro desconhecido não é apresentado como cancelamento ou bloqueio confirmado',async()=>{
  const restore=keepGlobals();installGoogle(config=>config.error_callback({type:'unknown'}));
  try{await assert.rejects(()=>new GoogleAccount(clientId).authorize(),error=>error.code==='unknown'&&!/cancelada|foi bloqueado|foi fechada/.test(error.message));}finally{restore();}
});

test('carregamentos simultâneos compartilham uma única biblioteca e só liberam API válida',async()=>{
  const restore=keepGlobals();delete globalThis.google;const scripts=scriptDocument();const loader=await freshLoader('shared');
  try{
    const first=loader.prepareGoogle(),second=loader.prepareGoogle();assert.equal(scripts.length,1);assert(!loader.isGoogleReady());
    installGoogle(()=>{});scripts[0].onload();await Promise.all([first,second]);assert(loader.isGoogleReady());
    await loader.prepareGoogle();assert.equal(scripts.length,1);
  }finally{restore();}
});

test('falha de carga remove script inválido e permite recarregar sem abrir login automático',async()=>{
  const restore=keepGlobals();delete globalThis.google;const scripts=scriptDocument();const loader=await freshLoader('retry');let requests=0;
  try{
    const failed=loader.prepareGoogle();scripts[0].onerror();await assert.rejects(failed,/carregar o acesso Google/);assert(scripts[0].removed);
    const retry=loader.prepareGoogle();assert.equal(scripts.length,2);installGoogle(()=>{requests++;});scripts[1].onload();await retry;
    assert(loader.isGoogleReady());assert.equal(requests,0);
  }finally{restore();}
});

test('script carregado sem a API Google não libera uma entrada falsa',async()=>{
  const restore=keepGlobals();delete globalThis.google;const scripts=scriptDocument();const loader=await freshLoader('invalid');
  try{const loading=loader.prepareGoogle();scripts[0].onload();await assert.rejects(loading,/não ficou disponível/);assert(!loader.isGoogleReady());assert(scripts[0].removed);}finally{restore();}
});

test('tempo limite de carga encerra espera e deixa nova tentativa disponível',async()=>{
  const restore=keepGlobals();delete globalThis.google;const scripts=scriptDocument();const loader=await freshLoader('timeout');let expire,cleared=false;
  globalThis.setTimeout=callback=>{expire=callback;return 7;};globalThis.clearTimeout=id=>{assert.equal(id,7);cleared=true;};
  try{const loading=loader.prepareGoogle();expire();await assert.rejects(loading,/demorou para carregar/);assert(cleared);assert(scripts[0].removed);assert(!loader.isGoogleReady());}finally{restore();}
});
