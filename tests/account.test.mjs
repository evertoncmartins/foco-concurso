import test from 'node:test';
import assert from 'node:assert/strict';
import {AccountStorage,normalizeGoogleProfile,parseFolder,assertProgressOwner} from '../src/account.mjs';
import {GoogleAccount,fetchGoogleProfile,IDENTITY_SCOPES,DRIVE_SCOPE,APPDATA_SCOPE,validClientId} from '../src/auth.mjs';
import {Store} from '../src/store.mjs';
import {DriveSync} from '../src/drive.mjs';
class MemoryStorage{data=new Map();get length(){return this.data.size;}key(i){return [...this.data.keys()][i]??null;}getItem(k){return this.data.get(k)??null;}setItem(k,v){this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}}
const flag=(id)=>({id,at:'2026-10-08T12:00:00.000Z',type:'flag',key:'bank:q1',flag:'favorite',value:true});
const profile=id=>({sub:id,email:`${id}@example.test`,email_verified:true,name:`User ${id}`});
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const clientId='123-example.apps.googleusercontent.com';
test('contas no mesmo navegador não veem eventos, preferências ou caches umas das outras',async()=>{
  const base=new MemoryStorage(),a=new AccountStorage(base,'111'),b=new AccountStorage(base,'222');const sa=new Store(a),sb=new Store(b);
  await sa.merge([flag('A')]);await sb.merge([flag('B')]);a.setItem('foco:config','{"name":"Alice"}');b.setItem('foco:config','{"name":"Bob"}');a.setItem('foco:drive:folder','A-cache');
  assert.deepEqual(new Store(a).events.map(e=>e.id),['A']);assert.deepEqual(new Store(b).events.map(e=>e.id),['B']);assert.equal(b.getItem('foco:drive:folder'),null);assert.equal(a.getItem('foco:config'),' {"name":"Alice"}'.trim());assert.equal(b.getItem('foco:config'),' {"name":"Bob"}'.trim());assert(!a.ownsKey('foco:user:222:foco:v1:event:B'));
});
test('a versão antiga não é atribuída automaticamente a nenhuma conta',async()=>{const base=new MemoryStorage(),legacy=new Store(base);await legacy.merge([flag('old')]);const a=new Store(new AccountStorage(base,'111'));assert.equal(a.events.length,0);assert.equal(new Store(base).events.length,1);});
test('exportação identifica proprietário e restauração recusa conta diferente',async()=>{const base=new MemoryStorage(),s=new Store(new AccountStorage(base,'111'));await s.merge([flag('A')]);const document=s.export();assert.equal(document.owner.subject,'111');assert.doesNotThrow(()=>assertProgressOwner(document,'111'));assert.throws(()=>assertProgressOwner(document,'222'),/outra conta/);assert.throws(()=>assertProgressOwner({schemaVersion:1,events:[]},'111'),/identificação/);});
test('identidade usa ID estável e só aceita perfil com e-mail verificado',()=>{assert.equal(normalizeGoogleProfile(profile('111')).sub,'111');assert.throws(()=>normalizeGoogleProfile({...profile('111'),email_verified:false}),/verificado/);assert.throws(()=>normalizeGoogleProfile({email:'someone@example.test'}),/válida/);assert.throws(()=>new AccountStorage(new MemoryStorage(),'a:b'),/inválido/);});
test('link de pasta é validado sem aceitar arquivo, domínio falso ou parâmetros injetados',()=>{assert.equal(parseFolder('https://drive.google.com/drive/folders/folder_123?usp=sharing'),'folder_123');assert.equal(parseFolder('https://drive.google.com/drive/u/0/folders/folder-123'),'folder-123');assert.throws(()=>parseFolder('https://evil.test/drive/folders/123'),/Google Drive/);assert.throws(()=>parseFolder('https://drive.google.com/file/d/123'),/pasta/);assert.throws(()=>parseFolder("abc' or trashed=true"),/ID/);});
test('configuração OAuth só aceita um identificador público',()=>{assert(validClientId(clientId));assert(!validClientId('access-token'));assert(!validClientId('client-secret'));assert(!validClientId(''));});
test('perfil é confirmado pelo endpoint HTTPS Google com Bearer e sem token na URL',async()=>{let seen;const p=await fetchGoogleProfile('fixture-token',async(url,options)=>{seen={url,options};return response(profile('111'));});assert.equal(p.sub,'111');assert.equal(seen.url,'https://openidconnect.googleapis.com/v1/userinfo');assert.equal(seen.options.headers.Authorization,'Bearer fixture-token');assert.equal(seen.options.cache,'no-store');assert(!seen.url.includes('fixture-token'));await assert.rejects(()=>fetchGoogleProfile('invalid',async()=>response({},401)),/confirmar/);});
test('login solicita perfil e configuração privada; pasta de estudos pede autorização adicional',async()=>{
  const oldGoogle=globalThis.google,oldFetch=globalThis.fetch;const configs=[];
  globalThis.google={accounts:{oauth2:{hasGrantedAllScopes:(r,...scopes)=>scopes.every(s=>r.scope.split(' ').includes(s)),initTokenClient:config=>{configs.push(config);return {requestAccessToken:()=>config.callback({access_token:'fixture-token',expires_in:3600,scope:config.scope})};}}}};globalThis.fetch=async()=>response(profile('111'));
  try{const auth=new GoogleAccount(clientId);const result=await auth.authorize();assert(!configs[0].scope.split(' ').includes(DRIVE_SCOPE));assert(configs[0].scope.split(' ').includes(APPDATA_SCOPE));assert.equal(auth.profile.sub,'111');assert(result.canAppData);assert(!result.canDrive);await auth.authorize(true);assert(configs[1].scope.split(' ').includes(DRIVE_SCOPE));assert.equal(configs[1].login_hint,'111');assert(auth.canDrive);auth.signOut();assert.equal(auth.profile,null);assert.equal(auth.token,null);assert(!auth.canAppData);}finally{globalThis.google=oldGoogle;globalThis.fetch=oldFetch;}
});
test('trocar conta durante consentimento do Drive é recusado',async()=>{
  const oldGoogle=globalThis.google,oldFetch=globalThis.fetch;globalThis.google={accounts:{oauth2:{hasGrantedAllScopes:()=>true,initTokenClient:config=>({requestAccessToken:()=>config.callback({access_token:'other-user-token',expires_in:3600,scope:config.scope})})}}};globalThis.fetch=async()=>response(profile('222'));
  try{const auth=new GoogleAccount(clientId);auth.profile=normalizeGoogleProfile(profile('111'));auth.token='first-user-token';await assert.rejects(()=>auth.authorize(true),/diferente/);assert.equal(auth.profile.sub,'111');assert.equal(auth.token,'first-user-token');}finally{globalThis.google=oldGoogle;globalThis.fetch=oldFetch;}
});
test('permissão de configuração negada mantém login e estudo local disponíveis',async()=>{
  const oldGoogle=globalThis.google,oldFetch=globalThis.fetch;
  globalThis.google={accounts:{oauth2:{hasGrantedAllScopes:(r,...scopes)=>scopes.every(s=>r.scope.split(' ').includes(s)),initTokenClient:config=>({requestAccessToken:()=>config.callback({access_token:'fixture-token',expires_in:3600,scope:IDENTITY_SCOPES})})}}};globalThis.fetch=async()=>response(profile('111'));
  try{const auth=new GoogleAccount(clientId);const result=await auth.authorize();assert.equal(result.profile.sub,'111');assert(!result.canAppData);await assert.rejects(()=>auth.authorize(true),/configuração privada/);}finally{globalThis.google=oldGoogle;globalThis.fetch=oldFetch;}
});
test('login reutiliza escopos Drive já concedidos para recuperar progresso sem segundo popup',async()=>{
  const oldGoogle=globalThis.google,oldFetch=globalThis.fetch;let popups=0;
  globalThis.google={accounts:{oauth2:{hasGrantedAllScopes:(r,...scopes)=>scopes.every(s=>r.scope.split(' ').includes(s)),initTokenClient:config=>{assert(config.include_granted_scopes);return {requestAccessToken:()=>{popups++;config.callback({access_token:'fixture-token',expires_in:3600,scope:`${config.scope} ${DRIVE_SCOPE}`});}};}}}};globalThis.fetch=async()=>response(profile('111'));
  try{const auth=new GoogleAccount(clientId);const result=await auth.authorize();assert(result.canDrive);assert(result.canAppData);assert.equal(popups,1);}finally{globalThis.google=oldGoogle;globalThis.fetch=oldFetch;}
});
test('Drive recusa autorização de outra conta antes de ler a pasta',async()=>{const store=new Store(new AccountStorage(new MemoryStorage(),'111'));const drive=new DriveSync(store,{folderId:'folder'}, {authorize:async()=>({profile:profile('222'),token:'wrong',expires:Date.now()+10000})});await assert.rejects(()=>drive.connect(),/corresponde/);assert.equal(drive.token,null);});
test('mesma pasta mantém prefixos, caches e lotes de progresso separados por conta',async()=>{
  const base=new MemoryStorage(),a=new DriveSync(new Store(new AccountStorage(base,'111')),{folderId:'same'}),b=new DriveSync(new Store(new AccountStorage(base,'222')),{folderId:'same'});
  a.saveCache({files:['A'],events:['eA'],pending:null});b.saveCache({files:['B'],events:['eB'],pending:null});assert.equal(a.progressPrefix(),'foco-progresso-111-');assert.equal(b.progressPrefix(),'foco-progresso-222-');assert.deepEqual(a.cache().files,['A']);assert.deepEqual(b.cache().files,['B']);
});
test('mesmo nome de arquivo não permite importar progresso de outro proprietário',async()=>{
  const store=new Store(new AccountStorage(new MemoryStorage(),'111')),drive=new DriveSync(store,{folderId:'same'});drive.token='fixture';drive.expires=Date.now()+3600000;
  drive.list=async()=>[{id:'A',name:'foco-progresso-111-pretend.json',ownedByMe:true}];drive.readFile=async()=>({schemaVersion:1,owner:{provider:'google',subject:'222'},events:[flag('B')]});await assert.rejects(()=>drive.sync(),/outra conta/);assert.equal(store.events.length,0);assert.equal(drive.status,'error');
});
test('arquivos criados por outro usuário são ignorados mesmo com prefixo semelhante',async()=>{
  const store=new Store(new AccountStorage(new MemoryStorage(),'111')),drive=new DriveSync(store,{folderId:'same'});drive.token='fixture';drive.expires=Date.now()+3600000;
  drive.list=async()=>[{id:'B',name:'foco-progresso-111-forged.json',ownedByMe:false},{id:'C',name:'foco-progresso-222-real.json',ownedByMe:true}];let reads=0;drive.readFile=async()=>{reads++;};drive.request=async()=>({ids:['new']});drive.upload=async()=>{};await drive.sync();assert.equal(reads,0);assert.equal(store.events.length,0);
});
test('sair encerra o adaptador e impede respostas HTTP tardias de atualizar o perfil',async()=>{const store=new Store(new AccountStorage(new MemoryStorage(),'111')),drive=new DriveSync(store,{folderId:'folder'});drive.token='fixture';drive.expires=Date.now()+3600000;drive.close();await assert.rejects(()=>drive.request('https://www.googleapis.com/drive/v3/files'));assert.equal(drive.token,null);assert(drive.closed);});
test('importação automática não substitui nem reativa um banco existente',async()=>{
  const bank={schemaVersion:1,id:'b',name:'Banco',questions:[{id:'q',discipline:'D',subject:'S',topic:'T',statement:'Pergunta',options:[{id:'A',text:'sim'},{id:'B',text:'não'}],correctOption:'A',explanation:'Explicação',difficulty:'easy',tags:[]}]};const store=new Store(new AccountStorage(new MemoryStorage(),'111'));await store.add([{type:'bank',bank},{type:'bank-state',bankId:'b',value:'deleted'}]);const drive=new DriveSync(store,{folderId:'folder'});drive.bankFiles=async()=>[{id:'bank'}];drive.readFile=async()=>bank;const result=await drive.importNewBanks();assert.equal(result.imported,0);assert.equal(store.model().banks.length,0);
});
