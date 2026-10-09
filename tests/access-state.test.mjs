import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {TemporaryStorage} from '../src/temporary-storage.mjs';
import {restoreProgress} from '../src/restore-progress.mjs';
import {AccountStorage} from '../src/account.mjs';
import {Store} from '../src/store.mjs';
import {DriveSettings} from '../src/drive-settings.mjs';
import {DriveSync} from '../src/drive.mjs';
import {validateBank} from '../src/engine.mjs';

const bank=validateBank(JSON.parse(await readFile(new URL('../src/lei-8112.json',import.meta.url))));
const imports={};
for(const module of ['store','engine','drive','drive-settings','auth','account','access-views','icons','home-view','session','focus-mode','temporary-storage','restore-progress'])Object.assign(imports,await import(`../src/${module}.mjs`));
const source=(await readFile(new URL('../src/app.mjs',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/\ninit\(\);\s*$/,'');
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
async function tick(){await new Promise(resolve=>setImmediate(resolve));}

// Execute the real application's event handlers with DOM and network stand-ins.
// This checks state/ordering, not visual rendering or actual Google consent.
function runtime(options={}){
  const browserStorage=new TemporaryStorage(),nodes=new Map(),listeners={};
  let googleReady=options.googleReady??true,authorizations=0;
  const node=selector=>{
    if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',textContent:'',content:'',open:false,classList:{add(){},remove(){}},focus(){},close(){this.open=false;},querySelector(){return null;},scrollIntoView(){}});
    return nodes.get(selector);
  };
  const document={documentElement:{dataset:{theme:'light'}},fullscreenElement:null,addEventListener(name,fn){(listeners[name]??=[]).push(fn);},querySelector(selector){
    if(['#app','#toast','#dialog','#main','#bank-file','#progress-file','meta[name=theme-color]'].includes(selector)||selector.startsWith('[data-action=')||selector.startsWith('[data-option='))return node(selector);
    return null;
  },async emit(name,event){for(const fn of listeners[name]??[])await fn(event);}};
  document.documentElement.requestFullscreen=async()=>{document.fullscreenElement=document.documentElement;await document.emit('fullscreenchange',{});};
  document.exitFullscreen=async()=>{document.fullscreenElement=null;await document.emit('fullscreenchange',{});};
  const media=new Map();
  const matchMedia=query=>{if(!media.has(query))media.set(query,{matches:query.includes('701'),addEventListener(){}});return media.get(query);};
  const profile={sub:'111',name:'Estudante',email:'test@example.test'};
  const auth={profile,token:'fixture',expires:Date.now()+3600000,generation:0,canAppData:options.canAppData??true,canDrive:options.canDrive??true,clientId:'test.apps.googleusercontent.com',signOut(){this.profile=null;this.token=null;},async authorize(){authorizations++;if(options.authorizationError)throw options.authorizationError;this.profile=profile;this.token='fixture';this.canAppData=true;this.canDrive=true;return authorization();}};
  function authorization(){return {profile:auth.profile,token:auth.token,expires:auth.expires,canAppData:auth.canAppData,canDrive:auth.canDrive};}
  class Settings extends DriveSettings{
    async restore(){if(options.folderWait)await options.folderWait.promise;if(options.folderError)throw options.folderError;return options.folder===null?null:{folderId:'my-folder'};}
  }
  class Drive extends DriveSync{
    async useAuthorization(result){
      this.connecting=true;this.token=result.token;
      try{
        this.reportProgress('history',0,2);
        if(options.historyWait)await options.historyWait.promise;
        if(options.historyError)throw options.historyError;
        await this.store.merge(options.events||[]);
        this.reportProgress('history',2,2);this.reportProgress('banks',1,1);this.status='synced';
      }finally{this.connecting=false;}
    }
  }
  const context=vm.createContext({...imports,isGoogleReady:()=>googleReady,prepareGoogle:async()=>{if(options.sdkWait)await options.sdkWait.promise;if(options.sdkError)throw options.sdkError;googleReady=true;},DriveSettings:Settings,DriveSync:Drive,document,localStorage:browserStorage,matchMedia,window:{addEventListener(){},scrollTo(){}},console,crypto:globalThis.crypto,setTimeout(){return 1;},clearTimeout(){},structuredClone,Map,Set,Date,Event,URL,Blob,fetch:async()=>new Response(JSON.stringify(bank),{headers:{'content-type':'application/json'}}),testAuth:auth,authorization,bank});
  vm.runInContext(source,context);vm.runInContext('auth=testAuth;',context);
  const value=code=>vm.runInContext(code,context);
  const target=dataset=>({dataset,disabled:false,closest(){return this;},matches(){return false;}});
  return {auth,document,browserStorage,value,get authorizations(){return authorizations;},html:()=>node('#app').innerHTML,click:async(action,extra={})=>document.emit('click',{target:target({action,...extra})}),start:()=>value('openAccount(authorization())')};
}

test('login só libera Google após carregar e exige novo clique para abrir autorização',async()=>{
  const sdkWait=deferred(),app=runtime({googleReady:false,sdkWait,folder:null});app.auth.signOut();app.value('renderLogin()');
  assert.match(app.html(),/data-action="login"[^>]*disabled/);
  await app.click('login');assert.match(app.html(),/Preparando Google/);assert.equal(app.authorizations,0);
  sdkWait.resolve();await tick();
  assert(!/data-action="login"[^>]*disabled/.test(app.html()));assert.equal(app.authorizations,0);
  await app.click('login');assert.equal(app.authorizations,1);assert.equal(app.auth.profile.sub,'111');
});

test('falha de carga permite tentar novamente ou usar visitante sem iniciar login sozinho',async()=>{
  const options={googleReady:false,sdkError:new Error('Falha de rede'),folder:null},app=runtime(options);app.auth.signOut();
  await app.click('retry-google');assert.match(app.html(),/Falha de rede/);assert.match(app.html(),/data-action="retry-google"/);
  assert(!/data-action="guest"[^>]*disabled/.test(app.html()));assert.equal(app.authorizations,0);
  options.sdkError=null;await app.click('retry-google');assert.equal(app.authorizations,0);
  assert(!/data-action="login"[^>]*disabled/.test(app.html()));
  await app.click('guest');assert(app.value('guest'));
});

test('erro no popup mantém login habilitado para nova tentativa explícita',async()=>{
  const options={authorizationError:new Error('Permita pop-ups para este site'),folder:null},app=runtime(options);app.auth.signOut();
  await app.click('login');assert.match(app.html(),/Permita pop-ups/);assert.equal(app.auth.profile,null);
  assert(!/data-action="login"[^>]*disabled/.test(app.html()));assert.equal(app.authorizations,1);
  options.authorizationError=null;await app.click('login');assert.equal(app.authorizations,2);assert.equal(app.auth.profile.sub,'111');
});

test('visitante mantém progresso na sessão e não recupera dados após nova instância',async()=>{
  const browser=new TemporaryStorage(),profile=new AccountStorage(browser,'111');
  await new Store(profile).add([{type:'flag',key:'bank:q',flag:'favorite',value:true}]);
  const before=Array.from({length:browser.length},(_,i)=>[browser.key(i),browser.getItem(browser.key(i))]);
  const memory=new TemporaryStorage(),guestStore=new Store(memory);
  await guestStore.add([{type:'bank',bank},{type:'flag',key:`${bank.id}:${bank.questions[0].id}`,flag:'favorite',value:true}]);
  assert.equal(guestStore.model().stats.favorites,1);
  assert.equal(new Store(memory).model().stats.favorites,1);
  assert.equal(new Store(new TemporaryStorage()).events.length,0);
  assert.deepEqual(Array.from({length:browser.length},(_,i)=>[browser.key(i),browser.getItem(browser.key(i))]),before);
});

test('progresso acompanha arquivos concluídos sem regredir ao sincronizar bancos',()=>{
  let state=restoreProgress(null,{stage:'history',completed:0,total:4});assert.equal(state.percent,35);
  state=restoreProgress(state,{stage:'history',completed:2,total:4});assert.equal(state.percent,55);assert.match(state.detail,/2 de 4/);
  state=restoreProgress(state,{stage:'banks',completed:1,total:2});assert.equal(state.percent,88);
  state=restoreProgress(state,{stage:'history',completed:0,total:2});assert.equal(state.percent,88);
  state=restoreProgress(state,{stage:'ready'});assert.equal(state.percent,100);
});

test('Drive só avança o contador depois de ler, validar e recuperar cada arquivo',async()=>{
  const store=new Store(new TemporaryStorage()),drive=new DriveSync(store,{folderId:'folder'}),wait=deferred(),steps=[];
  drive.token='fixture';drive.expires=Date.now()+3600000;
  drive.list=async()=>[{id:'one',name:'foco-progresso-one.json'},{id:'two',name:'foco-progresso-two.json'}];
  drive.readFile=async file=>{
    if(file.id==='one')await wait.promise;
    return {schemaVersion:1,events:[{id:file.id,at:'2026-10-09T12:00:00.000Z',type:'flag',key:`bank:${file.id}`,flag:'favorite',value:true}]};
  };
  drive.addEventListener('progress',()=>steps.push({...drive.restoreProgress}));
  const syncing=drive.sync();await tick();
  assert(steps.some(s=>s.stage==='history'&&s.total===2&&s.completed===0));
  assert(!steps.some(s=>s.stage==='history'&&s.completed>0));
  wait.resolve();await syncing;
  assert(steps.some(s=>s.stage==='history'&&s.completed===1&&s.total===2));
  assert(steps.some(s=>s.stage==='history'&&s.completed===2&&s.total===2));
  assert.equal(store.events.length,2);
});

test('arquivo inválido interrompe restauração sem contar como recuperado',async()=>{
  const store=new Store(new TemporaryStorage()),drive=new DriveSync(store,{folderId:'folder'}),steps=[];
  drive.token='fixture';drive.expires=Date.now()+3600000;
  drive.list=async()=>[{id:'bad',name:'foco-progresso-bad.json'}];
  drive.readFile=async()=>({schemaVersion:99,events:[]});
  drive.addEventListener('progress',()=>steps.push({...drive.restoreProgress}));
  await assert.rejects(()=>drive.sync());
  assert.equal(drive.status,'error');assert.equal(store.events.length,0);
  assert(!steps.some(s=>s.stage==='history'&&s.completed>0));
  assert(!steps.some(s=>s.stage==='upload'));
});

test('login bloqueia navegação até pasta e histórico serem restaurados',async()=>{
  const folderWait=deferred(),historyWait=deferred();
  const app=runtime({folderWait,historyWait,events:[{id:'remote-favorite',at:'2026-10-09T12:00:00.000Z',type:'flag',key:`${bank.id}:${bank.questions[0].id}`,flag:'favorite',value:true}]});
  const opening=app.start();await tick();
  assert.match(app.html(),/class="restore-page"/);assert(!app.html().includes('class="shell'));
  await app.click('nav',{view:'study'});assert.equal(app.value('view'),'home');
  await app.click('guest');assert(!app.value('guest'));
  await app.click('toggle-theme');assert.equal(app.value('document.documentElement.dataset.theme'),'dark');
  assert.match(app.html(),/class="restore-page"/);
  folderWait.resolve();await tick();
  assert.match(app.html(),/Restaurando seu histórico/);assert.equal(app.value('model.stats.favorites'),0);
  await app.click('start');assert.equal(app.value('session'),null);
  historyWait.resolve();await opening;
  assert.equal(app.value('restoration'),null);assert.match(app.html(),/class="shell/);
  assert.equal(app.value('model.stats.favorites'),1);
});

test('falha de restauração mantém tela bloqueante e nova tentativa recupera o histórico',async()=>{
  const options={historyError:new Error('Sem conexão')},app=runtime(options);
  await app.start();assert.match(app.html(),/Não foi possível sincronizar/);assert.equal(app.value('restoration.state'),'error');
  await app.click('nav',{view:'study'});assert.equal(app.value('view'),'home');
  options.historyError=null;await app.click('restore-retry');
  assert.equal(app.value('restoration'),null);assert.equal(app.value('drive.status'),'synced');
});

test('autorização ausente impede estudar até consentimento ou escolha local explícita',async()=>{
  const app=runtime({canDrive:false});await app.start();
  assert.equal(app.value('restoration.state'),'permission');assert.match(app.html(),/Autorizar e restaurar/);
  await app.click('restore-authorize');assert.equal(app.value('restoration'),null);assert.equal(app.value('drive.status'),'synced');
  const local=runtime({canAppData:false});await local.start();
  await local.click('restore-local');assert.equal(local.value('restoration'),null);assert.equal(local.value('view'),'home');assert.equal(local.value('drive.token'),null);
});

test('visitante responde, muda tema no foco e sai sem gravar respostas no navegador',async()=>{
  const app=runtime();app.auth.signOut();await app.click('guest');
  assert(app.value('guest'));assert.match(app.html(),/Modo visitante/);
  await app.value(`(async()=>{await newSession(model.questions.slice(0,2).map(q=>q.key));navigate('session');})()`);
  const option=app.value('model.questions[0].correctOption');
  await app.click('select',{option});await app.click('toggle-focus');await app.click('toggle-theme');
  assert(app.value('focusMode.active'));assert.equal(app.value('selected'),option);
  assert.match(app.html(),/class="focus-toolbar"[\s\S]*data-action="toggle-theme"/);
  await app.click('answer');assert.equal(app.value('model.stats.attempts'),1);
  assert.match(app.html(),/Resposta registrada nesta sessão/);assert(!app.html().includes('Progresso salvo.'));
  assert.deepEqual(Array.from({length:app.browserStorage.length},(_,i)=>app.browserStorage.key(i)),['foco:appearance']);
  await app.click('guest-login');assert(!app.value('guest'));assert.match(app.html(),/Continuar sem entrar/);
  await app.click('guest');assert.equal(app.value('model.stats.attempts'),0);
});
