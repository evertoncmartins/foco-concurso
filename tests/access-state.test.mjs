import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {TemporaryStorage} from '../src/temporary-storage.mjs';
import {restoreProgress,resetSaveProgress} from '../src/restore-progress.mjs';
import {AccountStorage} from '../src/account.mjs';
import {Store} from '../src/store.mjs';
import {DriveSettings} from '../src/drive-settings.mjs';
import {DriveSync} from '../src/drive.mjs';
import {validateBank} from '../src/engine.mjs';
import {longBank} from './helpers/long-bank.mjs';

const bank=validateBank(JSON.parse(await readFile(new URL('../src/lei-8112.json',import.meta.url))));
const imports={};
for(const module of ['store','engine','drive','drive-settings','auth','account','access-views','icons','home-view','bank-view','session','focus-mode','temporary-storage','restore-progress','question-origin','explanation-view','statement-view','profile-photo'])Object.assign(imports,await import(`../src/${module}.mjs`));
const source=(await readFile(new URL('../src/app.mjs',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/\ninit\(\);\s*$/,'');
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
async function tick(){await new Promise(resolve=>setImmediate(resolve));}

// Execute the real application's event handlers with DOM and network stand-ins.
// This checks state/ordering, not visual rendering or actual Google consent.
function runtime(options={}){
  const browserStorage=new TemporaryStorage(),nodes=new Map(),listeners={};
  let googleReady=options.googleReady??true,authorizations=0,preparations=0,restores=0,renders=0;
  function element(classes=''){
    const names=new Set(classes.split(/\s+/).filter(Boolean)),attributes=new Map();
    const events=new Map();
    return {dataset:{},innerHTML:'',textContent:'',content:'',open:false,title:'',classList:{add(name){names.add(name);},remove(name){names.delete(name);},contains(name){return names.has(name);},toggle(name,force){const active=force??!names.has(name);if(active)names.add(name);else names.delete(name);return active;}},setAttribute(name,value){attributes.set(name,String(value));},getAttribute(name){return attributes.get(name)??null;},focus(){document.focused=this;},showModal(){this.open=true;},close(){this.open=false;},querySelector(){return null;},addEventListener(name,fn){events.set(name,fn);},removeEventListener(name){events.delete(name);},emit(name,event){events.get(name)?.(event);},scrollIntoView(){}};
  }
  const node=selector=>{
    if(!nodes.has(selector)){
      const el=element();
      if(selector==='#dialog')el.querySelector=selector=>node(selector);
      if(selector==='#app'){
        let html='';Object.defineProperty(el,'innerHTML',{get:()=>html,set:value=>{
          html=value;renders++;const question=html.match(/class="question-body" data-question="([^"]+)"/);
          if(question)nodes.set('.question-body',{dataset:{question:question[1]},scrollTop:0,focus(){document.focused='.question-body';}});else nodes.delete('.question-body');
          for(const key of nodes.keys())if(key.startsWith('[data-option-row='))nodes.delete(key);
          for(const [,classes,id,content] of html.matchAll(/<div class="(option [^"]*)" data-option-row="([^"]+)"[^>]*>([\s\S]*?)<\/div>/g)){
            const row=element(classes),control=element('option-cut'),tag=content.match(/<button[^>]*class="option-cut"[^>]*>/)?.[0]||'';
            for(const [,name,value] of tag.matchAll(/(aria-pressed|aria-label|title)="([^"]*)"/g))control.setAttribute(name,value);
            row.dataset.optionRow=id;row.closest=selector=>selector==='[data-option-row]'?row:null;row.getBoundingClientRect=()=>({width:300});
            row.querySelector=selector=>selector==='.option-cut'?control:null;
            nodes.set(`[data-option-row="${id}"]`,row);
          }
        }});
      }
      nodes.set(selector,el);
    }
    return nodes.get(selector);
  };
  const document={documentElement:{dataset:{theme:'light'}},fullscreenElement:null,addEventListener(name,fn){(listeners[name]??=[]).push(fn);},querySelector(selector){
    if(['.sync-label','.connection-card'].includes(selector))return node('#app').innerHTML.includes('class="'+selector.slice(1)+'"')?node(selector):null;
    if(selector==='.question-body'||selector.startsWith('[data-option-row='))return nodes.get(selector)||null;
    if(['#app','#toast','#dialog','#main','#bank-file','#progress-file','#profile-photo-file','meta[name=theme-color]'].includes(selector)||selector.startsWith('[data-action=')||selector.startsWith('[data-option='))return node(selector);
    if(selector==='dialog[open],[aria-modal="true"]:not([hidden])'&&options.otherModal)return element();
    return null;
  },async emit(name,event){for(const fn of listeners[name]??[])await fn(event);}};
  document.documentElement.requestFullscreen=async requestOptions=>{document.fullscreenRequests=(document.fullscreenRequests||0)+1;document.requestOptions=requestOptions;if(options.fullscreenError)throw new Error('Requires user activation');document.fullscreenElement=document.documentElement;await document.emit('fullscreenchange',{});};
  if(options.fullscreenUnavailable)delete document.documentElement.requestFullscreen;
  document.exitFullscreen=async()=>{document.fullscreenElement=null;await document.emit('fullscreenchange',{});};
  const media=new Map(),mediaListeners=new Map();
  const matchMedia=query=>{if(!media.has(query))media.set(query,{matches:query.includes('701')&&!options.mobile||query==='(display-mode: standalone)'&&!!options.standalone,addEventListener(name,callback){if(name==='change'){const callbacks=mediaListeners.get(query)||[];callbacks.push(callback);mediaListeners.set(query,callbacks);}}});return media.get(query);};
  const profile={sub:'111',name:'Estudante',email:'test@example.test'};
  const auth={profile,token:'fixture',expires:Date.now()+3600000,generation:0,canAppData:options.canAppData??true,canDrive:options.canDrive??true,clientId:'test.apps.googleusercontent.com',prepareAuthorization(){preparations++;},signOut(){this.profile=null;this.token=null;},async authorize(){authorizations++;if(options.authorizationError)throw options.authorizationError;this.profile=profile;this.token='fixture';this.canAppData=true;this.canDrive=true;return authorization();}};
  auth.prepareRedirect=async()=>{if(options.statusWait)await options.statusWait.promise;auth.redirectEnabled=options.redirectEnabled===true;return auth.redirectEnabled;};
  auth.restoreRedirect=async()=>{restores++;if(options.returnError)throw options.returnError;auth.profile=profile;auth.token='fixture';return authorization();};
  function authorization(){return {profile:auth.profile,token:auth.token,expires:auth.expires,canAppData:auth.canAppData,canDrive:auth.canDrive,...(options.pendingFolderId?{pendingFolderId:options.pendingFolderId}:{})};}
  class Settings extends DriveSettings{
    async restore(){if(options.folderWait)await options.folderWait.promise;if(options.folderError)throw options.folderError;return options.folder===null?null:{folderId:'my-folder'};}
  }
  class Drive extends DriveSync{
    async useAuthorization(result,{folderId}={}){
      this.connecting=true;this.token=result.token;
      try{
        this.reportProgress('history',0,2);
        if(options.historyWait)await options.historyWait.promise;
        if(options.historyError)throw options.historyError;
        await this.store.merge(options.events||[]);
        if(folderId)this.config.folderId=folderId;
        this.reportProgress('history',2,2);this.reportProgress('banks',1,1);this.status='synced';
      }finally{this.connecting=false;}
    }
  }
  const context=vm.createContext({...imports,prepareProfilePhoto:options.preparePhoto||imports.prepareProfilePhoto,GoogleAccount:options.init?function(){return auth;}:imports.GoogleAccount,consumeGoogleReturn:()=>options.notice||null,isGoogleReady:()=>googleReady,prepareGoogle:async()=>{if(options.sdkWait)await options.sdkWait.promise;if(options.sdkError)throw options.sdkError;googleReady=true;},DriveSettings:Settings,DriveSync:Drive,document,localStorage:browserStorage,matchMedia,window:{addEventListener(){},scrollTo(){}},console,crypto:globalThis.crypto,setTimeout(){return 1;},clearTimeout(){},structuredClone,Map,Set,Date,Event,URL,Blob,fetch:async url=>new Response(JSON.stringify(String(url).includes('app-config')?{googleClientId:auth.clientId}:bank),{headers:{'content-type':'application/json'}}),testAuth:auth,authorization,bank});
  vm.runInContext(source,context);vm.runInContext('auth=testAuth;',context);
  const value=code=>vm.runInContext(code,context);
  const target=dataset=>({dataset,disabled:false,closest(selector){return selector==='[data-action]'||selector==='button'?this:null;},matches(){return false;}});
  const resize=async mobile=>{const query='(min-width: 701px)',m=matchMedia(query);m.matches=!mobile;for(const callback of mediaListeners.get(query)||[])await callback({matches:m.matches});};
  const keyEvent=async overrides=>{
    const event={key:' ',code:overrides?.key?'':'Space',target:{dataset:{},closest(){return null;},matches(){return false;}},defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},altKey:false,ctrlKey:false,metaKey:false,shiftKey:false,repeat:false,isComposing:false,...overrides};
    await document.emit('keydown',event);return event;
  };
  return {keyEvent,resize,auth,document,browserStorage,value,get restores(){return restores;},get authorizations(){return authorizations;},get preparations(){return preparations;},get renders(){return renders;},html:()=>node('#app').innerHTML,click:async(action,extra={})=>document.emit('click',{target:target({action,...extra})}),confirm:accepted=>node(accepted?'#confirm-ok':'#confirm-cancel').onclick(),finish:async()=>{const pending=document.emit('click',{target:target({action:'finish'})});await tick();if(node('#dialog').open)node('#confirm-ok').onclick();await pending;},key:async(key,action,extra={})=>document.emit('keydown',{key,target:target({action,...extra}),preventDefault(){},altKey:false,ctrlKey:false,metaKey:false}),start:()=>value('openAccount(authorization())')};
}

async function studyRuntime(options={},mode='smart'){
  const app=runtime(options);app.auth.signOut();await app.click('guest');
  await app.value(`(async()=>{await newSession(model.questions.slice(0,3).map(q=>q.key),'${mode}');await navigate('session');})()`);
  return app;
}

test('zerar progresso exige confirmação, preserva a conta e preferências e permite começar novamente',async()=>{
  for(const mobile of [false,true]){
    const seed={id:'seed-bank',at:'2026-10-08T00:00:00.000Z',type:'bank',bank};
    const app=runtime({mobile,events:[seed]});await app.start();
    app.value('drive.token=null;config.name="Pessoa de teste";config.dailyGoal=23;saveConfig();');
    await app.value('(async()=>{await newSession(model.questions.slice(0,2).map(q=>q.key));await navigate("session");})()');
    await app.click('select',{option:bank.questions[0].correctOption});await app.click('answer');await app.click('flag',{flag:'favorite'});await app.click('flag',{flag:'review'});
    await app.value('navigate("performance")');
    assert(app.html().lastIndexOf('data-action="reset-progress"')>app.html().indexOf('Questões que merecem atenção'));
    const snapshot=app.value('JSON.stringify(store.events)'),profile=JSON.stringify(app.auth.profile),prefs=app.value('JSON.stringify((({activeSession,...rest})=>rest)(config))');
    let pending=app.click('reset-progress');await tick();assert(app.document.querySelector('#dialog').open);assert(app.document.querySelector('#dialog').innerHTML.includes('Sua conta')||app.document.querySelector('#dialog').innerHTML.includes('sua conta'));
    await app.click('reset-progress');app.confirm(false);await pending;assert.equal(app.value('JSON.stringify(store.events)'),snapshot);
    pending=app.click('reset-progress');await tick();app.confirm(true);await pending;
    assert.equal(app.value('model.stats.attempts'),0);assert.equal(app.value('model.stats.favorites'),0);assert.equal(app.value('model.stats.review'),0);assert.equal(app.value('model.sessions.length'),0);
    assert.equal(app.value('session'),null);assert.equal(app.value('config.activeSession'),null);assert.equal(app.value('draftSelections.size'),0);
    assert.equal(JSON.stringify(app.auth.profile),profile);assert.equal(app.value('JSON.stringify((({activeSession,...rest})=>rest)(config))'),prefs);assert.equal(app.value('model.questions.length'),bank.questions.length);
    await app.value('(async()=>{await newSession([model.questions[0].key]);await navigate("session");})()');
    await app.click('select',{option:bank.questions[0].correctOption});await app.click('answer');assert.equal(app.value('model.stats.attempts'),1);assert.equal(app.value('model.stats.correct'),1);
  }
});

test('Escape cancela a confirmação de reset e não grava nenhum evento',async()=>{
  const app=await studyRuntime();await app.click('select',{option:bank.questions[0].correctOption});await app.click('answer');await app.value('navigate("performance")');
  const before=app.value('JSON.stringify(store.events)'),pending=app.click('reset-progress');await tick();
  app.document.querySelector('#dialog').emit('cancel',{preventDefault(){}});await pending;
  assert.equal(app.value('JSON.stringify(store.events)'),before);assert.equal(app.value('working'),false);assert.equal(app.value('model.stats.attempts'),1);
});

test('reset em outro dispositivo encerra sessão aberta sem permitir recuperar as respostas antigas',async()=>{
  const app=await studyRuntime();await app.click('select',{option:bank.questions[0].correctOption});await app.click('answer');
  await app.value('store.merge([{id:"remote-reset",type:"progress-reset",at:"2099-01-01T00:00:00.000Z"}])');
  app.value('render()');assert.equal(app.value('session'),null);assert.equal(app.value('view'),'performance');assert.equal(app.value('model.stats.attempts'),0);
});

test('falha de gravação no reset mantém histórico, e falha de envio mantém reset local com aviso',async()=>{
  const app=await studyRuntime();await app.click('select',{option:bank.questions[0].correctOption});await app.click('answer');await app.value('navigate("performance")');
  app.value('savedReset=store.resetProgress.bind(store);store.resetProgress=async()=>{throw new Error("Falha de gravação de teste")};');
  let pending=app.click('reset-progress');await tick();app.confirm(true);await pending;assert.equal(app.value('model.stats.attempts'),1);assert.equal(app.value('resetSaving'),null);assert(!app.html().includes('class="restore-page"'));
  app.value('store.resetProgress=savedReset;drive.token="fixture";drive.sync=async()=>{throw new Error("offline de teste")};');
  pending=app.click('reset-progress');await tick();app.confirm(true);await pending;assert.equal(app.value('model.stats.attempts'),0);assert(app.document.querySelector('#toast').textContent.includes('pendente'));assert.equal(app.value('resetSaving'),null);assert(!app.html().includes('class="restore-page"'));
});

test('reset conectado exibe loading com etapas reais, bloqueia interação e libera automaticamente Desktop e Mobile',async()=>{
  for(const mobile of [false,true]){
    const app=runtime({mobile,events:[{id:'seed-bank',type:'bank',at:'2026-10-08T00:00:00.000Z',bank}]});await app.start();
    await app.value('(async()=>{await newSession(model.questions.slice(0,2).map(q=>q.key));await navigate("session");})()');
    await app.click('select',{option:'A'});await app.click('answer');await app.click('nav',{view:'performance'});
    const profile=JSON.stringify(app.auth.profile),theme=app.value('config.theme');
    app.value('var finishResetSync;drive.sync=async()=>{drive.busy=true;drive.setStatus("syncing");try{drive.reportProgress("history",0,2);await new Promise(resolve=>finishResetSync=resolve);drive.setStatus("synced");}finally{drive.busy=false;}};');
    let pending=app.click('reset-progress');await tick();assert.equal(app.value('resetSaving'),null);app.confirm(false);await pending;
    assert(!app.html().includes('class="restore-page"'));assert.equal(app.value('model.stats.attempts'),1);
    pending=app.click('reset-progress');await tick();app.confirm(true);await tick();
    assert.match(app.html(),/Salvando seu novo começo/);assert.match(app.html(),/restore-orbit/);assert.match(app.html(),/aria-busy="true"/);
    assert.match(app.html(),/aria-valuenow="20"/);assert.equal(app.value('restoration'),null);assert(app.value('working'));
    assert(!app.html().includes('data-action="toggle-theme"'));assert(!app.html().includes('data-action="reset-progress"'));
    await app.click('nav',{view:'study'});await app.click('toggle-theme');await app.click('logout');await app.click('reset-progress');
    await app.keyEvent({key:'Enter'});await app.keyEvent({key:'ArrowRight'});await app.keyEvent({key:'t'});await app.value('navigate("study")');
    assert.equal(app.value('view'),'performance');assert.equal(app.value('config.theme'),theme);assert.equal(JSON.stringify(app.auth.profile),profile);
    app.value('drive.reportProgress("history",1,2)');assert.match(app.html(),/aria-valuenow="43"/);assert.match(app.html(),/1 de 2 arquivos conferidos/);
    app.value('drive.reportProgress("history",2,2)');assert.match(app.html(),/aria-valuenow="65"/);
    app.value('drive.reportProgress("upload")');assert.match(app.html(),/aria-valuenow="80"/);assert.match(app.html(),/Salvando e conferindo no Google Drive/);
    app.value('drive.reportProgress("history",0,2);render()');assert.match(app.html(),/aria-valuenow="80"/);
    app.value('finishResetSync()');await pending;
    assert.equal(app.value('resetSaving'),null);assert.equal(app.value('working'),false);assert.equal(app.value('model.stats.attempts'),0);
    assert.match(app.html(),/Entenda sua evolução/);assert(!app.html().includes('class="restore-page"'));assert.equal(JSON.stringify(app.auth.profile),profile);
    app.value('drive.reportProgress("upload")');assert(!app.html().includes('class="restore-page"'),'the operation listener must be removed');
    await app.click('nav',{view:'study'});assert.equal(app.value('view'),'study');
  }
});

test('falha lenta de sincronização fecha o loading, mantém reinício local e libera navegação',async()=>{
  const app=runtime();await app.start();await app.click('nav',{view:'performance'});
  app.value('var failResetSync;drive.sync=async()=>{drive.busy=true;try{drive.reportProgress("upload");await new Promise((resolve,reject)=>failResetSync=reject);}finally{drive.busy=false;}};');
  const pending=app.click('reset-progress');await tick();app.confirm(true);await tick();
  assert.match(app.html(),/aria-valuenow="80"/);app.value('failResetSync(new Error("offline de teste"))');await pending;
  assert.equal(app.value('resetSaving'),null);assert.equal(app.value('working'),false);assert(app.value('model.progressEpoch'));
  assert(app.document.querySelector('#toast').textContent.includes('pendente'));assert(!app.html().includes('class="restore-page"'));
  await app.click('nav',{view:'study'});assert.equal(app.value('view'),'study');
});

test('sincronização comum continua sem loading bloqueante de reinício',async()=>{
  const app=runtime();await app.start();const html=app.html();
  app.value('drive.reportProgress("history",0,2);drive.reportProgress("upload")');
  assert.equal(app.html(),html);assert.equal(app.value('resetSaving'),null);
  await app.click('nav',{view:'study'});assert.equal(app.value('view'),'study');
});

test('percentual do reinício só chega a 100 na confirmação e nunca regride em novas tentativas',()=>{
  let state=resetSaveProgress(null);assert.equal(state.percent,10);
  state=resetSaveProgress(state,{stage:'history',completed:0,total:2});assert.equal(state.percent,20);
  state=resetSaveProgress(state,{stage:'history',completed:2,total:2});assert.equal(state.percent,65);
  state=resetSaveProgress(state,{stage:'upload'});assert.equal(state.percent,80);
  state=resetSaveProgress(state,{stage:'history',completed:0,total:2});assert.equal(state.percent,80);
  state=resetSaveProgress(state,{stage:'ready'});assert.equal(state.percent,100);
});

test('afirmações com parênteses ganham linhas próprias no estudo e resultado sem reescrever o banco',async()=>{
  for(const mobile of [true,false])for(const mode of ['smart','exam']){
    const app=runtime({mobile});app.auth.signOut();await app.click('guest');
    const raw=structuredClone(bank);raw.id='teste-afirmativas';raw.questions=raw.questions.slice(0,1);
    const text='Com base no ECA, analise as afirmativas, de cima para baixo: ( ) É dever do Estado assegurar ensino fundamental.\n\n( ) O acesso ao ensino obrigatório e gratuito é direito público subjetivo. ( ) Texto com <strong>marcação</strong> & caracteres especiais.';
    raw.questions[0].statement=text;
    await app.document.querySelector('#bank-file').onchange({target:{files:[{name:'afirmativas.json',text:async()=>JSON.stringify(raw)}]}});
    await app.value(`(async()=>{await newSession([model.questions.find(q=>q.bankId==='teste-afirmativas').key],'${mode}');await navigate('session');})()`);
    const formatted='Com base no ECA, analise as afirmativas, de cima para baixo:\n\n( ) É dever do Estado assegurar ensino fundamental.\n\n( ) O acesso ao ensino obrigatório e gratuito é direito público subjetivo.\n\n( ) Texto com &lt;strong&gt;marcação&lt;/strong&gt; &amp; caracteres especiais.';
    assert(app.html().includes(`<h1 class="question-statement">${formatted}</h1>`));
    const before=app.value('JSON.stringify(store.events)');await app.click('toggle-theme');
    assert.equal(app.value('JSON.stringify(store.events)'),before);
    assert.equal(app.value(`model.questions.find(q=>q.bankId==='teste-afirmativas').statement`),text);
    await app.click('select',{option:raw.questions[0].correctOption});await app.click('answer');
    await app.finish();assert.equal(app.value('view'),'result');assert(app.html().includes(`<p>${formatted}</p>`));
    assert.equal(app.value('model.stats.attempts'),1);assert.equal(app.value('model.stats.correct'),1);
    const saved=JSON.parse(app.value('JSON.stringify(store.export())'));
    assert.equal(saved.events.find(e=>e.type==='bank'&&e.bank.id===raw.id).bank.questions[0].statement,text);
  }
});

test('comentários formatados aparecem no estudo e no resultado sem reimportação ou mudança do progresso',async()=>{
  for(const mobile of [true,false])for(const mode of ['smart','exam']){
    const app=runtime({mobile});app.auth.signOut();await app.click('guest');
    const raw=structuredClone(bank);raw.id='teste-comentarios';raw.questions=raw.questions.slice(0,1);
    const text='C combina requisitos. A antecipa as férias. B atribui prazo errado. D exclui uma vantagem. A acumulação depende do serviço.';
    raw.questions[0].explanation=text;
    await app.document.querySelector('#bank-file').onchange({target:{files:[{name:'comentarios.json',text:async()=>JSON.stringify(raw)}]}});
    await app.value(`(async()=>{await newSession([model.questions.find(q=>q.bankId==='teste-comentarios').key],'${mode}');await navigate('session');})()`);
    await app.click('select',{option:raw.questions[0].correctOption});await app.click('answer');
    const formatted='<strong class="explanation-letter">A</strong> antecipa as férias.';
    if(mode==='exam')assert(!app.html().includes(formatted));else assert(app.html().includes(formatted));
    assert(app.value(`model.questions.find(q=>q.bankId==='teste-comentarios').explanation`)===text);
    const before=app.value('JSON.stringify(store.events)');await app.click('toggle-theme');
    assert.equal(app.value('JSON.stringify(store.events)'),before);
    await app.finish();assert.equal(app.value('view'),'result');assert(app.html().includes(formatted));
    assert(app.html().includes('A acumulação depende do serviço.'));
    assert.equal(app.value('model.stats.attempts'),1);assert.equal(app.value('model.stats.correct'),1);
    const saved=JSON.parse(app.value('JSON.stringify(store.export())'));
    assert.equal(saved.events.find(e=>e.type==='bank'&&e.bank.id===raw.id).bank.questions[0].explanation,text);
  }
});

test('importação pelo seletor Mobile e Desktop aceita UTF-8 com BOM e JSON acima de 10 MB',async()=>{
  for(const mobile of [true,false]){
    const app=runtime({mobile});app.auth.signOut();await app.click('guest');
    const raw=longBank({large:true}),content='\uFEFF'+JSON.stringify(raw),file={name:'banco-longo.json',size:new Blob([content]).size,text:async()=>content};
    assert(file.size>10*1024*1024);
    await app.document.querySelector('#bank-file').onchange({target:{files:[file]}});
    assert.match(app.document.querySelector('#toast').textContent,/Banco importado/);
    const imported=app.value('model.banks.find(bank=>bank.id==="teste-textos-longos")');
    assert.deepEqual(JSON.parse(JSON.stringify(imported.questions)),raw.questions);assert.equal(imported.description,raw.description);
    await app.value('newSession([model.questions.find(q=>q.bankId==="teste-textos-longos").key])');
    await app.click('nav',{view:'session'});assert(app.html().includes(raw.questions[0].options[0].text));
    await app.click('select',{option:'A'});await app.click('answer');assert.equal(app.value('model.stats.correct'),1);
    assert(app.html().includes(raw.questions[0].explanation));
    const saved=JSON.parse(app.value('JSON.stringify(store.export())'));
    assert.deepEqual(saved.events.find(e=>e.type==='bank'&&e.bank.id===raw.id).bank.questions,raw.questions);
    assert.equal(app.value('model.stats.attempts'),1);
  }
});

test('JSON malformado não entra no banco, e falha de leitura preserva a causa real',async()=>{
  const app=runtime();app.auth.signOut();await app.click('guest');const before=app.value('JSON.stringify(store.events)');
  await assert.rejects(()=>app.value('readJSON({name:"invalido.json",text:async()=>"{"})'),/invalido.json: JSON inválido/);
  await assert.rejects(()=>app.value('readJSON({name:"falha.json",text:async()=>{throw new Error("Falha de leitura");}})'),/Falha de leitura/);
  assert.equal(app.value('JSON.stringify(store.events)'),before);
});

test('seletor importa a questão 61 com alternativa numérica no Mobile e Desktop e mantém correção',async()=>{
  for(const mobile of [true,false]){
    const app=runtime({mobile});app.auth.signOut();await app.click('guest');
    const raw=structuredClone(bank);raw.id='teste-numeros';raw.name='Banco numérico sintético';
    raw.questions=Array.from({length:61},(_,i)=>({...structuredClone(bank.questions[0]),id:`q-${i+1}`}));
    raw.questions[60].options=[{id:'A',text:0},{id:'B',text:42},{id:'C',text:3.14},{id:'D',text:-1}];raw.questions[60].correctOption='A';
    const content=JSON.stringify(raw),file={name:'numeros.json',size:new Blob([content]).size,text:async()=>content};
    await app.document.querySelector('#bank-file').onchange({target:{files:[file]}});
    assert.match(app.document.querySelector('#toast').textContent,/Banco importado/);
    const imported=app.value('model.banks.find(bank=>bank.id==="teste-numeros")');assert.equal(imported.questions.length,61);
    assert.deepEqual(Array.from(imported.questions[60].options,option=>option.text),['0','42','3.14','-1']);
    await app.value('newSession([model.questions.find(q=>q.bankId==="teste-numeros"&&q.id==="q-61").key])');
    await app.click('nav',{view:'session'});assert.match(app.html(),/class="option-text" id="option-text-A">0<\/span>/);
    await app.click('select',{option:'A'});await app.click('answer');assert.equal(app.value('model.stats.correct'),1);
    assert.equal(app.value('model.stats.wrong'),0);assert.match(app.html(),/Resposta correta/);
  }
});

test('conteúdo ausente ou estruturado não importa um banco parcial nem altera progresso existente',async()=>{
  const app=runtime();app.auth.signOut();await app.click('guest');const before=app.value('JSON.stringify(store.export().events)');
  for(const [value,message] of [['null',/ausente ou nulo/],['{}',/um objeto/],['[]',/uma lista/],['false',/um booleano/]]){
    await assert.rejects(()=>app.value(`(async()=>{const raw=structuredClone(bank);raw.id='invalido';raw.questions[0].options[0].text=${value};await importBank(raw);})()`),message);
    assert.equal(app.value('JSON.stringify(store.export().events)'),before);
  }
});

test('F e R alternam marcações sem Alt, preservam seleção e ignoram repetição e digitação',async()=>{
  const app=await studyRuntime();await app.keyEvent({key:'2',code:'Digit2'});assert.equal(app.value('selected'),'B');
  for(const [key,flag] of [['f','favorite'],['r','review']]){
    const event=await app.keyEvent({key,code:`Key${key.toUpperCase()}`});assert(event.defaultPrevented);
    assert(app.value(`model.flags.get(session.queue[0]).${flag}`));assert.equal(app.value('selected'),'B');
    const before=app.value('JSON.stringify(store.events)');
    for(const modifier of ['repeat','altKey','ctrlKey','metaKey','isComposing','defaultPrevented'])await app.keyEvent({key,[modifier]:true});
    await app.keyEvent({key,target:{isContentEditable:true}});
    await app.keyEvent({key,target:{closest:()=>({}),matches:()=>true}});
    assert.equal(app.value('JSON.stringify(store.events)'),before);
    await app.keyEvent({key:key.toUpperCase()});assert(!app.value(`model.flags.get(session.queue[0]).${flag}`));
  }
  await app.click('nav',{view:'settings'});const before=app.value('JSON.stringify(store.events)');await app.keyEvent({key:'f'});await app.keyEvent({key:'r'});assert.equal(app.value('JSON.stringify(store.events)'),before);
});

test('atalho F reserva a letra F para favorito, alternativa F continua acessível pelo número 6',async()=>{
  const app=await studyRuntime();await app.value('while(model.questions[0].options.length<6){const id=String.fromCharCode(65+model.questions[0].options.length);model.questions[0].options.push({id,text:"Alternativa extra"});}');
  await app.keyEvent({key:'6',code:'Digit6'});assert.equal(app.value('selected'),'F');
  await app.keyEvent({key:'f',code:'KeyF'});assert(app.value('model.flags.get(session.queue[0]).favorite'));assert.equal(app.value('selected'),'F');
});

test('marcação por atalho bloqueia novas ações até terminar a gravação',async()=>{
  const app=await studyRuntime();await app.value('var unlockFlag;const originalFlagAdd=store.add.bind(store);store.add=async events=>{await new Promise(resolve=>unlockFlag=resolve);return originalFlagAdd(events);};');
  const first=app.keyEvent({key:'f'});assert(app.value('working'));await app.keyEvent({key:'r'});await app.keyEvent();
  app.value('unlockFlag();');await first;assert.equal(app.value('session.index'),0);assert(app.value('model.flags.get(session.queue[0]).favorite'));assert(!app.value('model.flags.get(session.queue[0]).review'));assert(!app.value('working'));
});

test('indicador do Drive acompanha sucesso e alerta sem refazer a página',async()=>{
  const app=runtime();await app.start();await app.click('nav',{view:'settings'});const renders=app.renders;
  for(const status of ['pending','synced','expired','error','local']){
    app.value(`drive.setStatus('${status}','Mensagem de teste');`);
    const label=app.document.querySelector('.sync-label'),card=app.document.querySelector('.connection-card');
    assert.equal(label.dataset.status,status);assert.equal(card.dataset.status,status);assert.match(card.innerHTML,/Mensagem de teste/);
    assert.match(label.innerHTML,status==='synced'?/m5 12 4 4 10-10/:/m12 3 10 18H2z/);assert.equal(app.renders,renders);
  }
});

test('trocar foto atualiza avatar, persiste na conta e permite remover',async()=>{
  const photo='data:image/jpeg;base64,/9j/AAAA',app=runtime({preparePhoto:async()=>photo});await app.start();await app.click('nav',{view:'settings'});
  await app.document.querySelector('#profile-photo-file').onchange({target:{files:[{type:'image/png',size:2048}],value:'fixture'}});
  assert.match(app.html(),/alt="Foto de Estudante"/);assert.equal(app.value('config.photo'),photo);assert.equal(JSON.parse(app.value('accountStorage.getItem("foco:config")')).photo,photo);
  await app.start();assert.equal(app.value('config.photo'),photo);await app.click('nav',{view:'settings'});await app.click('remove-photo');assert.equal(app.value('config.photo'),'');assert(!app.html().includes('<img src="data:image/jpeg'));
});

test('falha ao preparar a foto mantém a foto e as preferências existentes',async()=>{
  const app=runtime({preparePhoto:async()=>{throw new Error('Imagem inválida');}});await app.start();await app.click('nav',{view:'settings'});const before=app.value('JSON.stringify(config)');
  await app.document.querySelector('#profile-photo-file').onchange({target:{files:[{type:'image/png',size:2048}],value:'fixture'}});
  assert.equal(app.value('JSON.stringify(config)'),before);assert(!app.value('working'));
});
test('restauração com versões divergentes da mesma resposta chega ao início sem bloquear',async()=>{
  const first={id:'answer-shared',at:'2026-10-08T12:00:00.000Z',type:'answer',key:`${bank.id}:${bank.questions[0].id}`,sessionId:'shared',selected:'A',correctOption:'A',correct:true,discipline:'Legislação',subject:'Lei',topic:'Direitos'};
  const later={...first,at:'2026-10-08T12:01:00.000Z',selected:'B',correct:false};
  const app=runtime({events:[first,later]});await app.start();
  assert.equal(app.value('restoration'),null);assert.match(app.html(),/home-page/);assert.match(app.html(),/Drive sincronizado/);
  assert.equal(app.value('model.stats.attempts'),1);assert.equal(app.value('store.events.filter(event=>event.type==="event-conflict").length'),2);
});
const cutRow=(app,option)=>app.document.querySelector(`[data-option-row="${option}"]`);

async function dragOption(app,option,dx,dy=0){
  const event={pointerId:1,pointerType:'touch',isPrimary:true,button:0,clientX:200,clientY:100,target:cutRow(app,option),cancelable:true,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};
  const move={...event,clientX:200+dx,clientY:100+dy};
  await app.document.emit('pointerdown',event);await app.document.emit('pointermove',move);await app.document.emit('pointerup',{...move});
  return move;
}

test('tesoura Mobile risca e restaura sem selecionar, responder, gravar ou mudar rolagem',async()=>{
  const app=await studyRuntime({mobile:true});await app.click('select',{option:'B'});const before=app.value('JSON.stringify(store.events)'),renders=app.renders,body=app.document.querySelector('.question-body');body.scrollTop=180;
  assert.match(app.html(),/id="option-letter-A">A<\/span><button type="button" class="option-cut"[\s\S]*?<\/button><button type="button" class="option-select"/);
  assert(!app.html().includes('option-gesture-tip'));assert(!app.html().includes('Deslize para riscar'));
  for(const cut of [true,false,true,false]){
    await app.click('toggle-cut',{option:'A'});assert.equal(cutRow(app,'A').classList.contains('eliminated'),cut);assert.equal(cutControl(app,'A').getAttribute('aria-pressed'),String(cut));assert.equal(app.value('selected'),'B');assert.equal(app.renders,renders);assert.equal(body.scrollTop,180);assert.equal(app.value('JSON.stringify(store.events)'),before);
  }
  assert.equal(app.value('JSON.stringify(session.answers)'),'{}');assert.equal(app.value('model.stats.attempts'),0);
  await app.click('select',{option:'A'});assert.equal(app.value('selected'),'A');
});

test('arrastes Mobile deixam de riscar e não interceptam rolagem ou toques seguintes',async()=>{
  const app=await studyRuntime({mobile:true}),before=app.value('JSON.stringify(store.events)');
  for(const [dx,dy] of [[-100,0],[100,0],[0,150],[80,100]]){
    const event=await dragOption(app,'A',dx,dy);assert(!event.defaultPrevented);assert(!cutRow(app,'A').classList.contains('eliminated'));assert.equal(app.value('selected'),null);assert.equal(app.value('JSON.stringify(store.events)'),before);
  }
  await app.click('toggle-cut',{option:'A'});assert(cutRow(app,'A').classList.contains('eliminated'));
  await app.click('select',{option:'B'});assert.equal(app.value('selected'),'B');
});

test('tesoura Mobile mantém gabarito e resposta registrada após responder',async()=>{
  const app=await studyRuntime({mobile:true});await app.click('select',{option:'B'});await app.click('answer');const before=app.value('JSON.stringify(store.events)'),answer=app.value('session.answers[session.queue[0]]');
  const correct=app.value('model.questions.find(q=>q.key===session.queue[0]).correctOption');assert(cutRow(app,correct).classList.contains('correct'));
  await app.click('toggle-cut',{option:correct});assert(cutRow(app,correct).classList.contains('eliminated'));await app.click('toggle-cut',{option:correct});assert(!cutRow(app,correct).classList.contains('eliminated'));assert(cutRow(app,correct).classList.contains('correct'));assert.equal(app.value('session.answers[session.queue[0]]'),answer);assert.equal(app.value('JSON.stringify(store.events)'),before);
});
const cutControl=(app,option)=>cutRow(app,option).querySelector('.option-cut');

test('setas navegam uma questão por vez no Desktop normal e foco, mantendo rascunhos e respostas',async()=>{
  for(const mode of ['smart','exam']){
    const app=await studyRuntime({},mode);assert(!app.html().includes('data-action="skip"'));
    assert.match(app.html(),/data-action="previous"[\s\S]*data-action="answer"[\s\S]*data-action="next"/);
    await app.click('toggle-focus');assert.match(app.html(),/class="question-nav-key">←<\/kbd>/);assert.match(app.html(),/class="question-nav-key">→<\/kbd>/);
    await app.click('select',{option:'B'});await app.click('toggle-cut',{option:'C'});app.document.querySelector('.question-body').scrollTop=260;
    assert.equal((await app.keyEvent({key:'ArrowRight'})).defaultPrevented,true);assert.equal(app.value('session.index'),1);assert.equal(app.value('selected'),null);assert.equal(app.value('JSON.stringify(session.answers)'),'{}');assert.equal(app.value('model.stats.attempts'),0);
    assert.equal((await app.keyEvent({key:'ArrowRight',repeat:true})).defaultPrevented,true);assert.equal(app.value('session.index'),1);
    await app.keyEvent({key:'ArrowLeft'});assert.equal(app.value('session.index'),0);assert.equal(app.value('selected'),'B');
    await app.keyEvent({key:'Enter'});assert.equal(app.value('session.index'),0);const answers=app.value('JSON.stringify(session.answers)'),attempts=app.value('model.stats.attempts');
    await app.keyEvent({key:'ArrowRight'});await app.keyEvent({key:'ArrowLeft'});await app.keyEvent({key:'Enter'});
    assert.equal(app.value('JSON.stringify(session.answers)'),answers);assert.equal(app.value('model.stats.attempts'),attempts);
    const events=app.value('JSON.stringify(store.events)');assert.equal((await app.keyEvent()).defaultPrevented,false);assert.equal(app.value('JSON.stringify(store.events)'),events);
  }
  const normal=await studyRuntime();await normal.keyEvent({key:'ArrowRight'});assert.equal(normal.value('session.index'),1);
  const mobile=await studyRuntime({mobile:true});assert.equal((await mobile.keyEvent({key:'ArrowRight'})).defaultPrevented,false);assert.equal(mobile.value('session.index'),0);
  await mobile.click('next');await mobile.click('previous');assert.equal(mobile.value('session.index'),0);
});

test('setas respeitam campos, controles com navegação própria, modais e modificadores',async()=>{
  const options={},app=await studyRuntime(options);await app.click('toggle-focus');const events=app.value('JSON.stringify(store.events)');
  const control=selector=>({dataset:{},closest(selectors){return selectors.split(',').includes(selector)?this:null;},matches(){return false;}});
  for(const key of ['ArrowLeft','ArrowRight']){
    for(const selector of ['input','textarea','select','summary','video','[contenteditable]:not([contenteditable="false"])','[role="checkbox"]','[role="slider"]','[role="combobox"]','[role="grid"]','[aria-haspopup]:not([aria-haspopup="false"])']){
      assert.equal((await app.keyEvent({key,target:control(selector)})).defaultPrevented,false,selector);assert.equal(app.value('JSON.stringify(store.events)'),events);
    }
    assert.equal((await app.keyEvent({key,target:{isContentEditable:true}})).defaultPrevented,false);
    assert.equal((await app.keyEvent({key,composedPath:()=>[control('input')]})).defaultPrevented,false);
    for(const modifier of ['altKey','ctrlKey','metaKey','shiftKey','isComposing','defaultPrevented'])await app.keyEvent({key,[modifier]:true});
    app.document.querySelector('#dialog').open=true;assert.equal((await app.keyEvent({key})).defaultPrevented,false);app.document.querySelector('#dialog').open=false;
    options.otherModal=true;assert.equal((await app.keyEvent({key})).defaultPrevented,false);options.otherModal=false;
    await app.value('working=true;');assert.equal((await app.keyEvent({key})).defaultPrevented,false);await app.value('working=false;');
    await app.value('restoration={state:"loading"};');assert.equal((await app.keyEvent({key})).defaultPrevented,false);await app.value('restoration=null;');
  }
  assert.equal(app.value('JSON.stringify(store.events)'),events);assert.equal(app.value('session.index'),0);
  await app.keyEvent({key:'ArrowRight',target:{dataset:{action:'select'},closest:selector=>selector==='button'?{}:null}});
  assert.equal(app.value('session.index'),1,'focused alternative buttons do not swallow arrow navigation');
});

test('navegação não avança duas vezes enquanto a gravação está pendente',async()=>{
  const app=await studyRuntime();await app.value('var unlockMove;const originalAdd=store.add.bind(store);store.add=async events=>{await new Promise(resolve=>unlockMove=resolve);return originalAdd(events);};');
  const first=app.keyEvent({key:'ArrowRight'});assert(app.value('working'));await app.keyEvent({key:'ArrowRight'});await app.click('next');assert.equal(app.value('session.index'),0);
  app.value('unlockMove();');await first;assert.equal(app.value('session.index'),1);assert.equal(app.value('model.stats.attempts'),0);assert(!app.value('working'));
});

test('três botões mantêm registro no centro, limites de navegação e revisão sem novas tentativas',async()=>{
  for(const mobile of [false,true]){
    const app=await studyRuntime({mobile});
    const controls=()=>app.html().match(/<div class="question-actions">([\s\S]*?)<\/div>/)[1];
    assert.equal((controls().match(/<button /g)||[]).length,3);
    assert.match(controls(),/data-action="previous"[^>]*disabled/);assert.match(controls(),/data-action="answer"[\s\S]*Registrar resposta[\s\S]*data-action="next"/);
    const before=app.value('JSON.stringify(store.events)');await app.click('previous');assert.equal(app.value('JSON.stringify(store.events)'),before);
    await app.click('select',{option:'B'});await app.click('next');await app.click('previous');assert.equal(app.value('selected'),'B');
    await app.click('pause');await app.click('resume');assert.equal(app.value('selected'),'B');
    const correct=app.value('model.questions.find(q=>q.key===session.queue[0]).correctOption');await app.click('select',{option:correct});await app.click('answer');
    assert.equal(app.value('session.index'),0);assert.equal(app.value('model.stats.correct'),1);
    await app.click('next');await app.click('previous');assert.match(app.html(),/Resposta correta/);
    await app.click('answer');assert.equal(app.value('model.stats.attempts'),1);
    await app.click('next');await app.click('next');assert.equal(app.value('session.index'),2);assert.match(controls(),/data-action="next"[^>]*disabled/);
    const end=app.value('JSON.stringify(store.events)');await app.click('next');assert.equal(app.value('JSON.stringify(store.events)'),end);assert.equal(app.value('view'),'session');
    assert.match(app.html(),/data-action="finish">Concluir sessão/);
  }
});

test('concluir com não respondidas permite cancelar, bloqueia setas no modal e não gera erros fictícios',async()=>{
  const app=await studyRuntime();await app.click('next');await app.click('next');const before=app.value('JSON.stringify(store.events)');
  const finishing=app.click('finish');await tick();assert(app.document.querySelector('#dialog').open);assert.match(app.document.querySelector('#dialog').innerHTML,/3 questões ainda não têm resposta registrada/);
  assert.equal((await app.keyEvent({key:'ArrowLeft'})).defaultPrevented,false);assert.equal(app.value('session.index'),2);
  app.confirm(false);await finishing;assert(!app.document.querySelector('#dialog').open);assert.equal(app.value('JSON.stringify(store.events)'),before);assert.equal(app.value('view'),'session');
  await app.click('previous');const key=app.value('session.queue[session.index]'),correct=app.value('model.questions.find(q=>q.key===session.queue[session.index]).correctOption');
  await app.click('select',{option:correct});await app.click('answer');await app.click('next');await app.finish();
  assert.equal(app.value('view'),'result');assert.equal(app.value('model.stats.correct'),1);assert.equal(app.value('model.stats.wrong'),0);assert.equal(app.value('session.answers[session.queue[0]]'),null);assert.equal(app.value(`session.answers['${key}']`),correct);
});

test('simulado conserva respostas ao voltar e só apresenta comentários e resultados ao concluir',async()=>{
  const app=await studyRuntime({},'exam');const key=app.value('session.queue[0]');
  await app.click('select',{option:'A'});await app.click('answer');await app.click('next');await app.click('previous');
  assert.equal(app.value('session.answers[session.queue[0]]'),'A');assert.equal(app.value('model.stats.attempts'),0);assert(!app.html().includes('Alternativa correta:'));
  await app.click('next');await app.click('next');await app.finish();assert.equal(app.value('view'),'result');assert.equal(app.value('model.stats.attempts'),1);assert.match(app.html(),/Alternativa correta:/);
  const events=app.value('JSON.stringify(store.events)');await app.click('finish');assert.equal(app.value('JSON.stringify(store.events)'),events);assert.equal(app.value(`session.answers['${key}']`),'A');
});

test('falha ao salvar navegação conserva questão, seleção, leitura e respostas',async()=>{
  const app=await studyRuntime();await app.click('select',{option:'B'});app.document.querySelector('.question-body').scrollTop=180;
  await app.value('failure=()=>{};store.add=async()=>{throw new Error("Falha simulada");};');const before=app.value('JSON.stringify(session)');
  await app.click('next');assert.equal(app.value('JSON.stringify(session)'),before);assert.equal(app.value('selected'),'B');assert.equal(app.document.querySelector('.question-body').scrollTop,180);assert(!app.value('working'));
});

test('Ajustes descreve setas Desktop e Enter para registrar, sem o antigo atalho Pular',async()=>{
  const app=runtime();await app.start();await app.click('nav',{view:'settings'});
  assert.match(app.html(),/Registrar resposta<\/td><td><kbd>Enter/);assert.match(app.html(),/Questão anterior \(Desktop\)/);assert.match(app.html(),/Próxima questão \(Desktop\)/);assert(!app.html().includes('Pular questão'));assert(!app.html().includes('<kbd>Espaço</kbd>'));
  assert.match(app.html(),/Riscar ou restaurar seleção \(Desktop\)<\/td><td><kbd>T/);
  assert(!app.html().includes('Selecionar alternativa C (Desktop)'));
  assert.match(app.html(),/<kbd>Enter<\/kbd> após registrar/);
});

test('T risca e restaura a seleção Desktop sem responder, trocar seleção ou gravar progresso',async()=>{
  for(const focus of [false,true])for(const mode of ['smart','exam']){
    const app=await studyRuntime({},mode);if(focus)await app.click('toggle-focus');
    const initial=app.value('JSON.stringify(store.events)');
    await app.keyEvent({key:'t'});assert.equal(app.value('selected'),null);assert.equal(app.value('JSON.stringify(store.events)'),initial);
    await app.keyEvent({key:'a'});assert.equal(app.value('selected'),'A');
    const renders=app.renders,body=app.document.querySelector('.question-body');body.scrollTop=240;
    for(const [key,expected] of [['t',true],['T',false],['t',true]]){
      assert.equal((await app.keyEvent({key})).defaultPrevented,true);
      assert.equal(cutRow(app,'A').classList.contains('eliminated'),expected);
      assert.equal(cutControl(app,'A').getAttribute('aria-pressed'),String(expected));
      assert.equal(app.value('selected'),'A');assert.equal(app.value('JSON.stringify(store.events)'),initial);
      assert.equal(app.renders,renders);assert.equal(body.scrollTop,240);
    }
    await app.keyEvent({key:'t',repeat:true});assert(cutRow(app,'A').classList.contains('eliminated'));
    await app.keyEvent({key:'c'});assert.equal(app.value('selected'),'C');assert(!cutRow(app,'C').classList.contains('eliminated'));
    await app.keyEvent({key:'a'});await app.keyEvent({key:'3'});assert.equal(app.value('selected'),'C');
    await app.keyEvent({key:'t'});assert(cutRow(app,'C').classList.contains('eliminated'));assert.equal(app.value('selected'),'C');
    await app.keyEvent({key:'Enter'});const recorded=app.value('JSON.stringify(store.events)');
    await app.keyEvent({key:'t'});assert(!cutRow(app,'C').classList.contains('eliminated'));assert.equal(app.value('JSON.stringify(store.events)'),recorded);
    await app.keyEvent({key:'ArrowRight'});await app.keyEvent({key:'ArrowLeft'});assert.equal(app.value('selected'),null);
    await app.keyEvent({key:'t'});assert(cutRow(app,'C').classList.contains('eliminated'));assert.equal(app.value('session.answers[session.queue[0]]'),'C');
  }
});

test('Enter registra, passa o foco para Próxima e depois avança uma única questão, preservando setas',async()=>{
  for(const focus of [false,true])for(const mode of ['smart','exam']){
    const app=await studyRuntime({},mode);if(focus)await app.click('toggle-focus');
    await app.keyEvent({key:'Enter'});assert.equal(app.value('session.index'),0);assert.equal(app.value('JSON.stringify(session.answers)'),'{}');
    await app.keyEvent({key:'a'});await app.keyEvent({key:'Enter'});
    assert.equal(app.value('session.index'),0);assert.equal(app.value('session.answers[session.queue[0]]'),'A');
    assert.equal(app.document.focused,app.document.querySelector('[data-action=next]'));
    assert.match(app.html(),/aria-keyshortcuts="ArrowRight Enter"/);assert.match(app.html(),/<kbd>Enter<\/kbd> próxima/);
    const answers=app.value('JSON.stringify(session.answers)');
    assert.equal((await app.keyEvent({key:'Enter',repeat:true})).defaultPrevented,true);assert.equal(app.value('session.index'),0);
    await app.key('Enter','next');assert.equal(app.value('session.index'),1);assert.equal(app.value('selected'),null);
    assert.equal(app.value('JSON.stringify(session.answers)'),answers);
    await app.keyEvent({key:'Enter'});assert.equal(app.value('session.index'),1,'Enter on an unanswered question needs a selection');
    await app.keyEvent({key:'ArrowLeft'});assert.equal(app.value('session.index'),0);
    await app.keyEvent({key:'Enter'});assert.equal(app.value('session.index'),1);
    await app.keyEvent({key:'ArrowRight'});assert.equal(app.value('session.index'),2);
    await app.keyEvent({key:'b'});await app.keyEvent({key:'Enter'});const end=app.value('JSON.stringify(store.events)');
    await app.keyEvent({key:'Enter'});assert.equal(app.value('session.index'),2);assert.equal(app.value('view'),'session');
    assert.equal(app.value('JSON.stringify(store.events)'),end);assert.equal(app.value('session.completed'),false);
  }
});

test('T e Enter Desktop respeitam editores, controles próprios, modais, composição e modificadores',async()=>{
  const options={},app=await studyRuntime(options);await app.keyEvent({key:'a'});
  const control=selector=>({dataset:{},closest(selectors){return selectors.split(',').includes(selector)?this:null;}});
  for(const answered of [false,true]){
    if(answered)await app.keyEvent({key:'Enter'});
    const events=app.value('JSON.stringify(store.events)');
    for(const key of ['t','Enter']){
      for(const selector of ['input','textarea','select','summary','iframe','video','[contenteditable]:not([contenteditable="false"])','[role="checkbox"]','[role="slider"]','[role="combobox"]','[role="grid"]','[aria-haspopup]:not([aria-haspopup="false"])']){
        assert.equal((await app.keyEvent({key,target:control(selector)})).defaultPrevented,false,selector);
      }
      assert.equal((await app.keyEvent({key,target:{isContentEditable:true}})).defaultPrevented,false);
      assert.equal((await app.keyEvent({key,composedPath:()=>[control('input')]})).defaultPrevented,false);
      for(const modifier of ['altKey','ctrlKey','metaKey','shiftKey','isComposing','defaultPrevented'])await app.keyEvent({key,[modifier]:true});
      app.document.querySelector('#dialog').open=true;await app.keyEvent({key});app.document.querySelector('#dialog').open=false;
      options.otherModal=true;await app.keyEvent({key});options.otherModal=false;
      app.value('working=true');await app.keyEvent({key});app.value('working=false');
      app.value('restoration={state:"loading"}');await app.keyEvent({key});app.value('restoration=null');
      assert.equal(app.value('JSON.stringify(store.events)'),events);assert.equal(app.value('session.index'),0);
      assert(!cutRow(app,'A').classList.contains('eliminated'));
    }
  }
});

test('Enter mantém a ação nativa de outros botões e trata elementos internos de Próxima uma vez',async()=>{
  const app=await studyRuntime();await app.keyEvent({key:'a'});
  for(const action of ['toggle-cut','previous','flag','toggle-theme','finish']){
    const button={dataset:{action}},target={dataset:{},closest:selector=>selector==='button'?button:null};
    assert.equal((await app.keyEvent({key:'Enter',target})).defaultPrevented,false);
    assert.equal(app.value('JSON.stringify(session.answers)'),'{}');assert.equal(app.value('session.index'),0);
  }
  const button={dataset:{action:'select'}},target={dataset:{},closest:selector=>selector==='button'?button:null};
  await app.keyEvent({key:'Enter',target});assert.equal(app.value('session.answers[session.queue[0]]'),'A');
  const next={dataset:{action:'next'}},child={dataset:{},closest:selector=>selector==='button'?next:null};
  assert.equal((await app.keyEvent({key:'Enter',target:child,repeat:true})).defaultPrevented,true);assert.equal(app.value('session.index'),0);
  assert.equal((await app.keyEvent({key:'Enter',target:child})).defaultPrevented,true);assert.equal(app.value('session.index'),1);
});

test('Enter aguarda gravação, não duplica resposta nem navegação e conserva seleção se falhar',async()=>{
  const app=await studyRuntime();await app.keyEvent({key:'a'});
  app.value('var unlockKey;const addKey=store.add.bind(store);store.add=async events=>{await new Promise(resolve=>unlockKey=resolve);return addKey(events);};');
  let pending=app.keyEvent({key:'Enter'});assert(app.value('working'));
  await app.keyEvent({key:'Enter'});await app.keyEvent({key:'ArrowRight'});assert.equal(app.value('session.index'),0);
  app.value('unlockKey()');await pending;assert.equal(app.value('model.stats.attempts'),1);assert.equal(app.value('session.index'),0);
  pending=app.keyEvent({key:'Enter'});await app.keyEvent({key:'Enter'});await app.keyEvent({key:'ArrowRight'});
  app.value('unlockKey()');await pending;assert.equal(app.value('session.index'),1);
  app.value('store.add=async()=>{throw new Error("Falha de teste")};failure=()=>{};');
  await app.keyEvent({key:'b'});const before=app.value('JSON.stringify(store.events)');
  await app.keyEvent({key:'Enter'});assert.equal(app.value('session.index'),1);assert.equal(app.value('selected'),'B');
  assert.equal(app.value('JSON.stringify(store.events)'),before);assert.equal(app.value('working'),false);
});

test('Mobile mantém C como alternativa, tesoura por toque e Enter apenas para registrar',async()=>{
  const app=await studyRuntime({mobile:true});await app.keyEvent({key:'c'});assert.equal(app.value('selected'),'C');
  await app.keyEvent({key:'c'});assert(!cutRow(app,'C').classList.contains('eliminated'));
  await app.click('toggle-cut',{option:'C'});assert(cutRow(app,'C').classList.contains('eliminated'));
  await app.keyEvent({key:'Enter'});await app.keyEvent({key:'Enter'});assert.equal(app.value('session.index'),0);assert.equal(app.value('model.stats.attempts'),1);
  await app.keyEvent({key:'t'});assert(cutRow(app,'C').classList.contains('eliminated'));
  assert(!app.html().includes('<kbd>T</kbd>'));assert(!app.html().includes('ArrowRight Enter'));
});

test('foco automático Mobile mantém seleção, cortes e rolagem, pede tela cheia e funciona até concluir',async()=>{
  const app=await studyRuntime({mobile:true});assert(app.value('focusMode.active'));await app.click('select',{option:'B'});await app.click('toggle-cut',{option:'C'});app.document.querySelector('.question-body').scrollTop=400;
  const before=app.value('JSON.stringify(store.events)');
  assert(app.value('focusMode.active'));assert.deepEqual(app.document.requestOptions,{navigationUI:'hide'});assert.equal(app.value('selected'),'B');assert(cutRow(app,'C').classList.contains('eliminated'));assert.equal(app.document.querySelector('.question-body').scrollTop,400);assert.equal(app.value('JSON.stringify(store.events)'),before);
  assert.match(app.html(),/class="focus-mobile-progress">Questão 1 de 3/);assert.match(app.html(),/Visitante · progresso temporário/);
  await app.click('toggle-theme');assert.equal(app.document.querySelector('.question-body').scrollTop,400);assert.equal(app.value('selected'),'B');
  await app.click('answer');await app.click('next');assert(app.value('focusMode.active'));assert.equal(app.document.fullscreenElement,app.document.documentElement);assert.equal(app.document.querySelector('.question-body').scrollTop,0);assert.match(app.html(),/>Questão 2 de 3</);
  await app.click('next');await app.click('select',{option:'A'});await app.click('answer');await app.finish();
  assert.equal(app.value('view'),'result');assert.equal(app.value('focusMode.active'),false);assert.equal(app.document.fullscreenElement,null);
});

test('Mobile sem Fullscreen API entra automaticamente no foco sem alertas; Sair volta ao início',async()=>{
  for(const standalone of [false,true]){
    const app=await studyRuntime({mobile:true,fullscreenUnavailable:true,standalone});assert(app.value('focusMode.active'));assert.equal(app.document.fullscreenElement,null);assert.equal(app.document.querySelector('#toast').textContent,'');
    assert.equal(app.html().includes('data-action="fullscreen-help"'),!standalone);
    await app.click('exit-focus');assert.equal(app.value('view'),'home');assert.equal(app.value('focusMode.active'),false);assert.equal(app.value('session.index'),0);
  }
});

test('Sair no Mobile pausa estudo e simulado; retomar preserva respostas, cortes e posição da sessão',async()=>{
  for(const mode of ['smart','exam']){
    const app=await studyRuntime({mobile:true,standalone:true},mode);const id=app.value('session.id'),correct=app.value('model.questions.find(q=>q.key===session.queue[0]).correctOption');
    assert.match(app.html(),/data-action="exit-focus" aria-label="Pausar e voltar ao início"/);
    await app.click('select',{option:correct});await app.click('answer');await app.click('toggle-cut',{option:'A'});const events=app.value('JSON.stringify(store.events)'),answers=app.value('JSON.stringify(session.answers)');
    await app.click('exit-focus');assert.equal(app.value('view'),'home');assert(!app.value('focusMode.active'));assert.equal(app.value('session.completed'),false);assert.equal(app.value('config.activeSession'),id);assert.match(app.html(),/data-action="resume"/);assert.equal(app.value('JSON.stringify(store.events)'),events);
    await app.click('resume');assert.equal(app.value('view'),'session');assert(app.value('focusMode.active'));assert.equal(app.value('session.id'),id);assert.equal(app.value('JSON.stringify(session.answers)'),answers);assert(cutRow(app,'A').classList.contains('eliminated'));assert.equal(app.value('JSON.stringify(store.events)'),events);
    await app.click('next');const advanced=app.value('JSON.stringify(store.events)');assert.equal(app.value('session.index'),1);await app.click('exit-focus');await app.click('resume');assert(app.value('focusMode.active'));assert.equal(app.value('session.index'),1);assert.equal(app.value('JSON.stringify(store.events)'),advanced);
  }
});

test('Mobile mantém foco após saída nativa e recusa da API; Escape volta ao menu sem responder',async()=>{
  for(const fullscreenError of [false,true]){
    const app=await studyRuntime({mobile:true,fullscreenError});await app.click('select',{option:'B'});await app.click('toggle-cut',{option:'C'});app.document.querySelector('.question-body').scrollTop=340;const events=app.value('JSON.stringify(store.events)');
    await app.document.exitFullscreen();assert(app.value('focusMode.active'));assert.equal(app.value('view'),'session');assert.equal(app.value('selected'),'B');assert(cutRow(app,'C').classList.contains('eliminated'));assert.equal(app.document.querySelector('.question-body').scrollTop,340);assert.equal(app.document.fullscreenRequests,1);assert.equal(app.document.querySelector('#toast').textContent,'');
    await app.key('Escape','exit-focus');assert.equal(app.value('view'),'home');assert(!app.value('focusMode.active'));assert.equal(app.document.fullscreenElement,null);assert.equal(app.value('session.completed'),false);assert.equal(app.value('JSON.stringify(store.events)'),events);
  }
});

test('desktop conserva foco opcional; mudar para layout Mobile ativa foco e muda a ação de Sair',async()=>{
  const app=await studyRuntime();assert(!app.value('focusMode.active'));assert.equal(app.document.fullscreenRequests||0,0);await app.click('select',{option:'B'});
  await app.click('toggle-focus');assert(app.value('focusMode.active'));assert.match(app.html(),/data-action="exit-focus" aria-label="Sair do modo foco"/);await app.click('exit-focus');assert.equal(app.value('view'),'session');assert(!app.value('focusMode.active'));assert.equal(app.value('selected'),'B');
  await app.resize(true);assert(app.value('focusMode.active'));assert.equal(app.value('selected'),'B');assert.match(app.html(),/aria-label="Pausar e voltar ao início"/);await app.resize(false);assert(app.value('focusMode.active'));assert.match(app.html(),/aria-label="Sair do modo foco"/);
  await app.key('Escape','exit-focus');assert.equal(app.value('view'),'session');assert(!app.value('focusMode.active'));await app.resize(true);assert(app.value('focusMode.active'));await app.click('exit-focus');assert.equal(app.value('view'),'home');assert(!app.value('focusMode.active'));await app.resize(false);assert(!app.value('focusMode.active'));
});

test('questão isolada e revisão de erros também abrem automaticamente em foco no Mobile',async()=>{
  const app=await studyRuntime({mobile:true});await app.click('exit-focus');const key=app.value('model.questions[0].key');await app.click('single',{key});assert(app.value('focusMode.active'));assert.equal(app.value('session.queue.length'),1);
  const wrong=app.value('model.questions.find(q=>q.key===session.queue[0]).options.find(o=>o.id!==model.questions.find(q=>q.key===session.queue[0]).correctOption).id');await app.click('select',{option:wrong});await app.click('answer');await app.finish();assert.equal(app.value('view'),'result');assert(!app.value('focusMode.active'));
  await app.click('session-errors');assert(app.value('focusMode.active'));assert.equal(app.value('view'),'session');assert.equal(app.value('session.mode'),'errors');assert.equal(app.value('session.queue[0]'),key);assert.equal(app.value('session.queue.length'),1);
});

test('ajuda de tela cheia abre e fecha sem responder, sair do foco ou perder a leitura',async()=>{
  const app=await studyRuntime({mobile:true,fullscreenUnavailable:true});await app.click('select',{option:'B'});await app.click('toggle-cut',{option:'C'});
  app.document.querySelector('.question-body').scrollTop=250;const before=app.value('JSON.stringify(store.events)');
  await app.key('Enter','fullscreen-help');assert.equal(app.value('JSON.stringify(store.events)'),before);
  await app.click('fullscreen-help');const dialog=app.document.querySelector('#dialog');assert.equal(dialog.open,true);assert.match(dialog.innerHTML,/Adicionar à Tela de Início/);assert.match(dialog.innerHTML,/Abrir como App da Web/);assert.match(dialog.innerHTML,/não há modo offline/);
  await app.key('Escape','close-dialog');assert(app.value('focusMode.active'));await app.key('Enter','answer');assert.equal(app.value('JSON.stringify(store.events)'),before);
  await app.click('close-dialog');assert.equal(dialog.open,false);assert(app.value('focusMode.active'));assert.equal(app.value('selected'),'B');assert(cutRow(app,'C').classList.contains('eliminated'));assert.equal(app.document.querySelector('.question-body').scrollTop,250);assert.equal(app.value('session.index'),0);assert.equal(app.value('JSON.stringify(store.events)'),before);
});

test('Mobile preserva leitura ao selecionar, favoritar e alternar tema, com controles fora da área rolável',async()=>{
  const app=await studyRuntime({mobile:true});
  await app.value(`(async()=>{const long=structuredClone(bank);long.id='long-mobile';long.questions=long.questions.slice(0,2);long.questions[0].statement='Questão longa com várias linhas.\\n'.repeat(80);long.questions[0].options.forEach(o=>o.text+=' Texto extenso de alternativa.'.repeat(12));await store.add([{type:'bank',bank:validateBank(long)}]);refreshModel();await newSession(model.questions.filter(q=>q.bankId==='long-mobile').map(q=>q.key));navigate('session');})()`);
  const body=()=>app.document.querySelector('.question-body');body().scrollTop=920;
  const correct=app.value('model.questions.find(q=>q.key===session.queue[0]).correctOption');
  await app.click('select',{option:correct});assert.equal(body().scrollTop,920);
  await app.click('toggle-theme');assert.equal(body().scrollTop,920);
  await app.click('flag',{flag:'favorite'});assert.equal(body().scrollTop,920);
  await app.click('toggle-cut',{option:'B'});assert.equal(body().scrollTop,920);
  assert.match(app.html(),/Texto extenso de alternativa/);
  // Locate the closing div of the actual nested question-body, not the first child.
  const html=app.html(),start=html.indexOf('<div class="question-body"');let depth=0,end=0;
  for(const match of html.slice(start).matchAll(/<\/?div\b[^>]*>/g)){
    depth+=match[0].startsWith('</')?-1:1;
    if(!depth){end=start+match.index+match[0].length;break;}
  }
  assert(end>start);assert(html.indexOf('class="question-actions"')>=end);assert(html.indexOf('class="session-summary-bar"')>=end);
  await app.click('answer');assert.match(app.html(),/<strong>1<\/strong> acertos/);assert.match(app.html(),/<strong>0<\/strong> erros/);assert.match(app.html(),/<strong>100%<\/strong> na sessão/);assert.match(app.html(),/data-action="next"/);
});

test('Mobile reinicia a rolagem ao navegar e libera a navegação normal ao pausar',async()=>{
  const app=await studyRuntime({mobile:true});app.document.querySelector('.question-body').scrollTop=600;
  await app.click('next');assert.equal(app.document.querySelector('.question-body').scrollTop,0);assert.equal(app.value('model.stats.attempts'),0);
  app.document.querySelector('.question-body').scrollTop=400;await app.click('select',{option:'A'});assert.equal(app.document.querySelector('.question-body').scrollTop,400);
  await app.click('answer');await app.click('next');assert.equal(app.document.querySelector('.question-body').scrollTop,0);
  await app.click('pause');assert.equal(app.value('view'),'home');assert(!app.html().includes('class="shell session '));assert.equal(app.document.querySelector('.question-body'),null);
});

test('tesoura alterna instantaneamente sem selecionar, responder, gravar ou refazer a página',async()=>{
  const app=await studyRuntime(),before=app.value('JSON.stringify(store.events)'),renders=app.renders,question=app.document.querySelector('.question-body');
  question.scrollTop=180;
  assert.match(app.html(),/id="option-letter-A">A<\/span><button type="button" class="option-cut"[\s\S]*?<\/button><button type="button" class="option-select"[\s\S]*?id="option-text-A"/);
  const optionMarkup=app.html().match(/<div class="options"[\s\S]*?<\/div><\/div>/)?.[0];
  assert(optionMarkup);let buttonDepth=0;
  for(const tag of optionMarkup.match(/<\/?button\b[^>]*>/g)||[]){if(tag.startsWith('</'))buttonDepth--;else{assert.equal(buttonDepth,0,'native buttons must be siblings');buttonDepth++;}}
  assert.equal(buttonDepth,0);
  for(const cut of [true,false,true]){
    await app.click('toggle-cut',{option:'A'});
    assert.equal(cutRow(app,'A').classList.contains('eliminated'),cut);
    assert.equal(cutControl(app,'A').getAttribute('aria-pressed'),String(cut));
    assert.equal(cutControl(app,'A').getAttribute('aria-label'),`${cut?'Restaurar':'Riscar'} alternativa A`);
    assert.equal(app.value('selected'),null);assert.equal(app.value('JSON.stringify(session.answers)'),'{}');
    assert.equal(app.value('JSON.stringify(store.events)'),before);assert.equal(app.renders,renders);
    assert.equal(app.document.querySelector('.question-body'),question);assert.equal(question.scrollTop,180);
  }
  assert.equal(app.value('model.stats.attempts'),0);
});

test('cortar mantém a seleção existente e a correção original; restaurar permite selecionar normalmente',async()=>{
  const app=await studyRuntime(),correct=app.value('model.questions[0].correctOption'),wrong=app.value('model.questions[0].options.find(o=>o.id!==model.questions[0].correctOption).id');
  await app.click('select',{option:wrong});await app.click('toggle-cut',{option:wrong});
  assert.equal(app.value('selected'),wrong);assert.equal(app.value('model.stats.attempts'),0);
  await app.click('toggle-cut',{option:wrong});await app.click('toggle-cut',{option:correct});await app.click('toggle-cut',{option:correct});
  await app.click('select',{option:correct});await app.click('answer');
  assert.equal(app.value('session.answers[session.queue[0]]'),correct);assert.equal(app.value('model.stats.attempts'),1);assert.equal(app.value('model.stats.accuracy'),100);
  assert(cutRow(app,correct).classList.contains('correct'));
  const before=app.value('JSON.stringify(store.events)');
  await app.click('toggle-cut',{option:correct});await app.click('toggle-cut',{option:correct});await app.click('select',{option:wrong});
  assert.equal(app.value('session.answers[session.queue[0]]'),correct);assert.equal(app.value('selected'),correct);assert.equal(app.value('JSON.stringify(store.events)'),before);
});

test('cortes acompanham tema, foco e pausa da mesma questão e reiniciam ao avançar ou iniciar sessão',async()=>{
  const app=await studyRuntime();await app.click('toggle-cut',{option:'A'});await app.click('toggle-cut',{option:'B'});
  await app.click('toggle-theme');assert(cutRow(app,'A').classList.contains('eliminated'));assert(cutRow(app,'B').classList.contains('eliminated'));
  await app.click('toggle-focus');assert.match(app.html(),/focus-mode/);assert(cutRow(app,'A').classList.contains('eliminated'));
  await app.click('pause');await app.click('resume');assert(cutRow(app,'A').classList.contains('eliminated'));
  await app.click('next');assert(!cutRow(app,'A').classList.contains('eliminated'));assert(!cutRow(app,'B').classList.contains('eliminated'));
  await app.click('toggle-cut',{option:'A'});await app.click('select',{option:'B'});await app.click('answer');await app.click('next');assert(!cutRow(app,'A').classList.contains('eliminated'));
  await app.click('toggle-cut',{option:'A'});await app.value(`(async()=>{await newSession([model.questions[0].key]);navigate('session');})()`);assert(!cutRow(app,'A').classList.contains('eliminated'));
});

test('Enter na tesoura não confirma nem avança; atalhos de resposta continuam funcionando',async()=>{
  const app=await studyRuntime();await app.key('B','select');assert.equal(app.value('selected'),'B');
  const before=app.value('JSON.stringify(store.events)');
  await app.key('Enter','toggle-cut',{option:'A'});assert.equal(app.value('JSON.stringify(store.events)'),before);
  // Browsers dispatch the native button click after Enter or Space.
  await app.click('toggle-cut',{option:'A'});assert(cutRow(app,'A').classList.contains('eliminated'));
  await app.key('Enter','answer');assert.equal(app.value('model.stats.attempts'),1);
  await app.key('Enter','toggle-cut',{option:'A'});assert.equal(app.value('session.index'),0);
  await app.click('toggle-cut',{option:'A'});assert(!cutRow(app,'A').classList.contains('eliminated'));
});

test('tesoura funciona no mobile e no simulado sem emitir respostas antes da conclusão',async()=>{
  const app=await studyRuntime({mobile:true},'exam');assert.equal(app.value('desktopLayout.matches'),false);
  const before=app.value('JSON.stringify(store.events)');await app.click('toggle-cut',{option:'A'});await app.click('toggle-cut',{option:'C'});
  assert.equal(app.value('JSON.stringify(store.events)'),before);assert.equal(app.value('selected'),null);
  await app.click('select',{option:'B'});assert(cutRow(app,'A').classList.contains('eliminated'));await app.click('answer');
  assert.equal(app.value('model.stats.attempts'),0);assert.equal(app.value('session.answers[session.queue[0]]'),'B');assert(!app.html().includes('Alternativa correta:'));
  await app.click('toggle-cut',{option:'A'});assert(!cutRow(app,'A').classList.contains('eliminated'));
  await app.click('logout');assert.equal(app.value('cutOptions.size'),0);await app.click('guest');await app.value(`(async()=>{await newSession([model.questions[0].key]);navigate('session');})()`);assert(!cutRow(app,'C').classList.contains('eliminated'));
});

test('retorno Google recupera autorização e mantém bloqueio até restaurar a pasta escolhida',async()=>{
  const historyWait=deferred(),app=runtime({init:true,notice:'success',redirectEnabled:true,googleReady:false,pendingFolderId:'chosen-folder',historyWait});app.auth.signOut();
  const loading=app.value('init()');await tick();assert.equal(app.restores,1);assert.match(app.html(),/Preparando seus estudos/);assert.equal(app.preparations,0);assert.equal(app.authorizations,0);
  historyWait.resolve();await loading;assert.equal(app.value('config.folderId'),'chosen-folder');assert.equal(app.value('restoration'),null);assert.equal(app.value('view'),'home');assert.equal(app.value('working'),false);
});
test('retorno expirado informa erro e não abre conta nem importa progresso',async()=>{
  const app=runtime({init:true,notice:'success',redirectEnabled:true,googleReady:false,returnError:new Error('A entrada expirou.')});app.auth.signOut();await app.value('init()');
  assert.match(app.html(),/A entrada expirou/);assert.equal(app.auth.profile,null);assert.equal(app.value('store'),null);assert.equal(app.value('working'),false);assert.equal(app.preparations,0);
});
test('visitante escolhido durante consulta de login não é substituído ao terminar a consulta',async()=>{
  const statusWait=deferred(),app=runtime({init:true,redirectEnabled:true,googleReady:false,statusWait});app.auth.signOut();const initializing=app.value('init()');await tick();
  await app.click('guest');statusWait.resolve();await initializing;assert.equal(app.value('guest'),true);assert.equal(app.auth.profile,null);assert.equal(app.restores,0);assert.equal(app.preparations,0);
});

test('login só libera Google após carregar e exige novo clique para abrir autorização',async()=>{
  const sdkWait=deferred(),app=runtime({googleReady:false,sdkWait,folder:null});app.auth.signOut();app.value('renderLogin()');
  assert.match(app.html(),/data-action="login"[^>]*disabled/);
  await app.click('login');assert.match(app.html(),/Preparando Google/);assert.equal(app.authorizations,0);
  sdkWait.resolve();await tick();
  assert(!/data-action="login"[^>]*disabled/.test(app.html()));assert.equal(app.authorizations,0);assert(app.preparations>0);
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
  const options={authorizationError:Object.assign(new Error('Permita pop-ups para este site'),{code:'popup_failed_to_open'}),folder:null},app=runtime(options);app.auth.signOut();
  await app.click('login');assert.match(app.html(),/Permita pop-ups/);assert.equal(app.auth.profile,null);assert.match(app.html(),/Como liberar a janela de entrada/);assert.match(app.html(),/Ajuda do Firefox/);
  assert(!/data-action="login"[^>]*disabled/.test(app.html()));assert.equal(app.authorizations,1);
  options.authorizationError=null;await app.click('login');assert.equal(app.authorizations,2);assert.equal(app.auth.profile.sub,'111');assert(!app.html().includes('Como liberar a janela de entrada'));
});

test('rolagem interna é mantida ao selecionar e trocar tema, e reinicia na próxima questão',async()=>{
  const app=runtime();app.auth.signOut();await app.click('guest');
  await app.value(`(async()=>{await newSession(model.questions.slice(0,2).map(q=>q.key));navigate('session');})()`);
  app.document.querySelector('.question-body').scrollTop=180;
  const option=app.value('model.questions[0].correctOption');await app.click('select',{option});
  assert.equal(app.document.querySelector('.question-body').scrollTop,180);
  await app.click('toggle-theme');assert.equal(app.document.querySelector('.question-body').scrollTop,180);
  await app.click('answer');assert.equal(app.document.querySelector('.question-body').scrollTop,180);
  await app.click('next');assert.equal(app.document.querySelector('.question-body').scrollTop,0);
});

test('sessão mostra origem junto da dificuldade no modo normal e foco, com fontes após responder',async()=>{
  const app=runtime();app.auth.signOut();await app.click('guest');
  await app.value(`(async()=>{const imported=structuredClone(bank);imported.id='source-fixture';imported.questions=imported.questions.slice(0,1);Object.assign(imported.questions[0],{instituicao:'IFSP',ano:2026,tag:'IFSP-2026',tipo:'Adaptada de prova oficial',fonte:{prova:'https://example.test/prova.pdf',gabarito:'https://example.test/final.pdf',questaoOriginal:12,paginaProva:7,statusGabarito:'Definitivo'}});await store.add([{type:'bank',bank:validateBank(imported)}]);refreshModel();await newSession([model.questions.find(q=>q.bankId===imported.id).key]);navigate('session');})()`);
  assert.match(app.html(),/<span class="badge">(?:Fácil|Média|Difícil)<\/span><span class="badge origin"[^>]*>IFSP-2026<\/span>/);assert(!app.html().includes('final.pdf'));
  await app.click('toggle-focus');assert.match(app.html(),/focus-mode/);assert.match(app.html(),/>IFSP-2026</);
  const option=app.value('model.questions.find(q=>q.bankId==="source-fixture").correctOption');await app.click('select',{option});await app.click('answer');
  assert.match(app.html(),/Origem da questão/);assert.match(app.html(),/https:\/\/example.test\/final.pdf/);
});

test('Mobile usa uma única faixa antes do cartão e preserva ações, origem e cabeçalho desktop',async()=>{
  const app=await studyRuntime({mobile:true});
  await app.value(`(async()=>{const imported=structuredClone(bank);imported.id='compact-source';imported.questions=imported.questions.slice(0,2);Object.assign(imported.questions[0],{discipline:'Direito Administrativo com um nome extenso',instituicao:'IFSP',ano:2025,tag:'IFSP-2025',tipo:'Adaptada de prova oficial',fonte:{prova:'https://example.test/prova.pdf',gabarito:'https://example.test/final.pdf'}});await store.add([{type:'bank',bank:validateBank(imported)}]);refreshModel();await newSession(model.questions.filter(q=>q.bankId===imported.id).map(q=>q.key));await navigate('session');})()`);
  const html=app.html(),bar=html.indexOf('class="mobile-question-bar"'),card=html.indexOf('<article class="question-card">');
  assert(html.indexOf('class="session-progress"')<bar&&bar<card);
  assert.equal((html.match(/class="mobile-question-bar"/g)||[]).length,1);
  assert.match(html.slice(bar,card),/Direito Administrativo com um nome extenso/);
  assert.match(html.slice(bar,card),/question-difficulty">(?:Fácil|Média|Difícil)<\/span><span class="badge origin"[^>]*>IFSP-2025<\/span>/);
  assert(!html.includes('class="question-meta"'));assert(!html.includes('>Adaptada<'));assert(!html.includes('final.pdf'));
  assert.equal((html.match(/data-action="flag"/g)||[]).length,2);assert(!html.slice(card).includes('data-action="flag"'));
  app.document.querySelector('.question-body').scrollTop=420;
  for(const flag of ['favorite','review']){
    await app.click('flag',{flag});assert.equal(app.document.querySelector('.question-body').scrollTop,420);
    const current=app.html().slice(app.html().indexOf('class="mobile-question-bar"'),app.html().indexOf('<article class="question-card">'));
    assert.match(current,new RegExp(`data-flag="${flag}"[^>]*aria-pressed="true"`));
  }
  await app.resize(false);assert(!app.html().includes('class="mobile-question-bar"'));assert.match(app.html(),/class="question-meta"/);assert.match(app.html(),/>Adaptada</);
  assert(app.html().indexOf('data-action="flag"')>app.html().indexOf('class="question-body"'));
  await app.resize(true);assert.equal((app.html().match(/data-action="flag"/g)||[]).length,2);assert(!app.html().includes('>Adaptada<'));
  const correct=app.value('model.questions.find(q=>q.key===session.queue[0]).correctOption');await app.click('select',{option:correct});await app.click('answer');
  assert.match(app.html(),/Adaptada de prova oficial/);assert.match(app.html(),/https:\/\/example.test\/final.pdf/);
  await app.click('next');const next=app.html().slice(app.html().indexOf('class="mobile-question-bar"'),app.html().indexOf('<article class="question-card">'));
  assert(!next.includes('IFSP-2025'));assert(!next.includes('badge origin'));assert(!next.includes('aria-pressed="true"'));assert.equal(app.document.querySelector('.question-body').scrollTop,0);
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
  let consolidated=null;
  drive.list=async()=>consolidated?[{id:'one',name:drive.progressName()}]:[{id:'one',name:'foco-progresso-one.json'},{id:'two',name:'foco-progresso-two.json'}];
  drive.progressMetadata=async id=>({id,title:consolidated&&id==='one'?drive.progressName():`foco-progresso-${id}.json`,etag:consolidated?'after':'before'});
  drive.updateProgress=async(file,document)=>{consolidated=document;};
  drive.trashProgress=async()=>{};
  drive.readFile=async file=>{
    if(consolidated&&file.id==='one')return consolidated;
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
  drive.progressMetadata=async()=>({etag:'fixture',title:'foco-progresso-bad.json'});
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
