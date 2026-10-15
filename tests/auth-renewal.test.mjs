import test from 'node:test';
import assert from 'node:assert/strict';
import {GoogleAccount} from '../src/auth.mjs';
import {DriveSync} from '../src/drive.mjs';
import {DriveSettings} from '../src/drive-settings.mjs';
import {Store} from '../src/store.mjs';
import {TemporaryStorage} from '../src/temporary-storage.mjs';
import {AccountStorage} from '../src/account.mjs';

const profile={sub:'111',email:'test@example.test',name:'Teste',email_verified:true};
const authorization=()=>({profile,token:'new-fixture-token',expires:Date.now()+3600000,canDrive:true,canAppData:true,canRefresh:true});
function account(){const a=new GoogleAccount('fixture.apps.googleusercontent.com');Object.assign(a,{profile,token:'old-fixture-token',expires:Date.now()-1000,canDrive:true,canAppData:true,canRefresh:true,redirectEnabled:true});return a;}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
async function withFetch(fetcher,run){const old=globalThis.fetch;globalThis.fetch=fetcher;try{await run();}finally{globalThis.fetch=old;}}
function client(){const a=account(),storage=new AccountStorage(new TemporaryStorage(),'111'),store=new Store(storage),drive=new DriveSync(store,{folderId:'fixture-folder'},a),settings=new DriveSettings(storage,a);drive.token=a.token;drive.expires=a.expires;return {a,storage,store,drive,settings};}

test('renovação simultânea compartilha uma requisição e mantém perfil sem abrir login',async()=>{
  const a=account(),wait=deferred();let calls=0;
  const fetcher=async(url,init)=>{calls++;assert.equal(url,'/api/auth/refresh');assert.equal(JSON.parse(init.body).subject,'111');assert.equal(init.credentials,'same-origin');await wait.promise;return Response.json({authorization:authorization()});};
  const one=a.ensureAccess({fetcher}),two=a.ensureAccess({fetcher});assert.equal(calls,1);wait.resolve();
  const results=await Promise.all([one,two]);assert(results.every(r=>r.token==='new-fixture-token'));assert.equal(a.profile,profile);
  await a.ensureAccess({fetcher});assert.equal(calls,1);
});

test('token ainda válido renova preventivamente no último minuto',async()=>{
  const a=account();a.expires=Date.now()+45000;let calls=0;
  await a.ensureAccess({fetcher:async()=>{calls++;return Response.json({authorization:authorization()});}});assert.equal(calls,1);assert(a.expires>Date.now()+3000000);
});

test('Drive e configuração privada renovam juntos, preservando 30 eventos e a conta',async()=>{
  const c=client(),wait=deferred();let renewals=0;const headers=[];
  await c.store.add(Array.from({length:30},(_,i)=>({type:'flag',key:`bank:q${i}`,flag:'favorite',value:true})));
  const before=JSON.stringify(c.store.events);
  await withFetch(async(url,options)=>{
    if(url==='/api/auth/refresh'){renewals++;await wait.promise;return Response.json({authorization:authorization()});}
    headers.push(options.headers.Authorization);return Response.json({ok:true});
  },async()=>{
    const one=c.drive.request('https://www.googleapis.com/drive/v3/files'),two=c.settings.request('https://www.googleapis.com/drive/v3/files');
    assert.equal(renewals,1);wait.resolve();await Promise.all([one,two]);
  });
  assert.deepEqual(headers,['Bearer new-fixture-token','Bearer new-fixture-token']);assert.equal(c.drive.token,c.a.token);
  assert.equal(JSON.stringify(c.store.events),before);assert.equal(c.store.model().flags.size,30);
  assert(!JSON.stringify(c.store.export()).includes('fixture-token'));
});

test('401 renova e repete uma vez; 403 não renova e 401 repetido não cria loop',async()=>{
  for(const status of [200,401,403]){
    const c=client();c.a.expires=Date.now()+3600000;c.drive.expires=c.a.expires;let renewals=0,requests=0;
    await withFetch(async url=>{
      if(url==='/api/auth/refresh'){renewals++;return Response.json({authorization:authorization()});}
      requests++;return Response.json({}, {status:status===403?403:requests===1?401:status});
    },async()=>{
      if(status===200)await c.drive.request('https://www.googleapis.com/drive/v3/files');
      else await assert.rejects(c.drive.request('https://www.googleapis.com/drive/v3/files'));
    });
    assert.equal(renewals,status===403?0:1);assert.equal(requests,status===403?1:2);
  }
});

test('rede indisponível preserva acesso renovável e dados locais para a próxima tentativa',async()=>{
  const c=client();await c.store.add([{type:'flag',key:'bank:q',flag:'favorite',value:true}]);const before=JSON.stringify(c.store.events);
  await withFetch(async()=>{throw new TypeError('offline');},async()=>{await assert.rejects(c.drive.request('https://www.googleapis.com/drive/v3/files'));});
  assert(c.a.canRefresh);assert.equal(c.drive.token,'old-fixture-token');assert.equal(JSON.stringify(c.store.events),before);
  await withFetch(async url=>Response.json(url==='/api/auth/refresh'?{authorization:authorization()}:{ok:true}),async()=>{assert.deepEqual(await c.drive.request('https://www.googleapis.com/drive/v3/files'),{ok:true});});
});

test('revogação mantém perfil e progresso local, solicitando reconexão sem popup automático',async()=>{
  const c=client();await c.store.add([{type:'flag',key:'bank:q',flag:'favorite',value:true}]);
  await withFetch(async()=>Response.json({error:'reauthorization_required'},{status:401}),async()=>{await assert.rejects(c.drive.request('https://www.googleapis.com/drive/v3/files'),{code:'AUTH_REAUTH_REQUIRED'});});
  assert.equal(c.a.profile.sub,'111');assert.equal(c.a.canRefresh,false);assert.equal(c.drive.status,'expired');assert.equal(c.store.model().flags.get('bank:q').favorite,true);
});

test('conta diferente na renovação nunca substitui o perfil ou autoriza o Drive',async()=>{
  const c=client();let driveRequests=0;
  await withFetch(async url=>{if(url==='/api/auth/refresh')return Response.json({authorization:{...authorization(),profile:{...profile,sub:'222'}}});driveRequests++;return Response.json({});},async()=>{await assert.rejects(c.drive.request('https://www.googleapis.com/drive/v3/files'));});
  assert.equal(c.a.profile.sub,'111');assert.equal(c.a.token,'old-fixture-token');assert.equal(driveRequests,0);
});

test('desconectar durante renovação impede requisições posteriores e não reativa o Drive',async()=>{
  const c=client(),wait=deferred();let driveRequests=0;
  await withFetch(async url=>{if(url==='/api/auth/refresh'){await wait.promise;return Response.json({authorization:authorization()});}driveRequests++;return Response.json({});},async()=>{
    const pending=c.drive.request('https://www.googleapis.com/drive/v3/files');c.drive.disconnect();wait.resolve();await assert.rejects(pending,/conexão.*mudou/);
  });assert.equal(c.drive.token,null);assert.equal(driveRequests,0);
});

test('logout durante renovação descarta retorno tardio e apaga cookie após a resposta em andamento',async()=>{
  const a=account(),wait=deferred(),calls=[];
  await withFetch(async url=>{calls.push(url);if(url==='/api/auth/refresh'){await wait.promise;return Response.json({authorization:authorization()});}return Response.json({signedOut:true});},async()=>{
    const pending=a.ensureAccess(),rejected=assert.rejects(pending,/conta.*mudou/),logout=a.signOut();assert.equal(a.profile,null);assert.equal(a.token,null);
    wait.resolve();await rejected;await logout;
  });assert.deepEqual(calls,['/api/auth/refresh','/api/auth/logout']);assert.equal(a.token,null);
});
