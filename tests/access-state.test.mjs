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
import {longBank} from './helpers/long-bank.mjs';

const bank=validateBank(JSON.parse(await readFile(new URL('../src/lei-8112.json',import.meta.url))));
const imports={};
for(const module of ['store','engine','drive','drive-settings','auth','account','access-views','icons','home-view','session','focus-mode','temporary-storage','restore-progress','question-origin','profile-photo'])Object.assign(imports,await import(`../src/${module}.mjs`));
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
    return {dataset:{},innerHTML:'',textContent:'',content:'',open:false,title:'',classList:{add(name){names.add(name);},remove(name){names.delete(name);},contains(name){return names.has(name);},toggle(name,force){const active=force??!names.has(name);if(active)names.add(name);else names.delete(name);return active;}},setAttribute(name,value){attributes.set(name,String(value));},getAttribute(name){return attributes.get(name)??null;},focus(){},showModal(){this.open=true;},close(){this.open=false;},querySelector(){return null;},scrollIntoView(){}};
  }
  const node=selector=>{
    if(!nodes.has(selector)){
      const el=element();
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
  return {keyEvent,resize,auth,document,browserStorage,value,get restores(){return restores;},get authorizations(){return authorizations;},get preparations(){return preparations;},get renders(){return renders;},html:()=>node('#app').innerHTML,click:async(action,extra={})=>document.emit('click',{target:target({action,...extra})}),key:async(key,action,extra={})=>document.emit('keydown',{key,target:target({action,...extra}),preventDefault(){},altKey:false,ctrlKey:false,metaKey:false}),start:()=>value('openAccount(authorization())')};
}

async function studyRuntime(options={},mode='smart'){
  const app=runtime(options);app.auth.signOut();await app.click('guest');
  await app.value(`(async()=>{await newSession(model.questions.slice(0,3).map(q=>q.key),'${mode}');await navigate('session');})()`);
  return app;
}

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

test('Espaço pula no estudo normal e no foco, sem registrar resposta',async()=>{
  for(const mode of ['smart','exam']){
    const app=await studyRuntime({},mode);assert(!app.html().includes('focus-skip-key'));
    assert.match(app.html(),/data-action="skip" aria-keyshortcuts="Space"/);
    await app.click('toggle-focus');assert.equal(app.document.focused,'.question-body');
    assert.match(app.html(),/data-action="skip" aria-keyshortcuts="Space">Pular<kbd class="focus-skip-key">Espaço<\/kbd>/);
    await app.click('select',{option:'B'});await app.click('toggle-cut',{option:'C'});app.document.querySelector('.question-body').scrollTop=260;
    await app.click('toggle-theme');assert.equal(app.document.querySelector('.question-body').scrollTop,260);
    const events=app.value('store.events.length');assert.equal((await app.keyEvent()).defaultPrevented,true);
    assert.equal(app.value('session.index'),1);assert.equal(app.value('selected'),null);assert.equal(app.value('model.stats.attempts'),0);assert.equal(app.value('Object.values(session.answers).filter(Boolean).length'),0);assert.equal(app.value('session.answers[session.queue[0]]'),null);assert.equal(app.value('store.events.length'),events+1);assert.equal(app.document.querySelector('.question-body').scrollTop,0);assert.equal(app.document.focused,'.question-body');
    assert.equal((await app.keyEvent({repeat:true})).defaultPrevented,true);assert.equal(app.value('session.index'),1);
    await app.click('select',{option:'A'});await app.click('answer');const answered=app.value('JSON.stringify(store.events)');
    assert(!app.html().includes('focus-skip-key'));assert.equal((await app.keyEvent()).defaultPrevented,false);assert.equal(app.value('session.index'),1);assert.equal(app.value('JSON.stringify(store.events)'),answered);
    await app.click('next');await app.keyEvent();assert.equal(app.value('view'),'result');assert(!app.value('focusMode.active'));assert(!app.html().includes('focus-skip-key'));
  }
  const normal=await studyRuntime();assert.equal((await normal.keyEvent()).defaultPrevented,true);assert.equal(normal.value('session.index'),1);assert.equal(normal.value('model.stats.attempts'),0);
  const mobile=await studyRuntime({mobile:true});assert.equal((await mobile.keyEvent()).defaultPrevented,true);assert.equal(mobile.value('session.index'),1);assert.equal(mobile.value('model.stats.attempts'),0);
});

test('Espaço respeita campos, controles nativos/customizados, modais, composição e modificadores',async()=>{
  const options={},app=await studyRuntime(options);await app.click('toggle-focus');const events=app.value('JSON.stringify(store.events)');
  const control=selector=>({dataset:{},closest(selectors){return selectors.split(',').includes(selector)?this:null;},matches(){return false;}});
  for(const selector of ['input','textarea','select','button','a[href]','summary','video','[contenteditable]:not([contenteditable="false"])','[role="checkbox"]','[role="slider"]','[role="combobox"]','[role="button"]']){
    assert.equal((await app.keyEvent({target:control(selector)})).defaultPrevented,false,selector);assert.equal(app.value('JSON.stringify(store.events)'),events);
  }
  assert.equal((await app.keyEvent({target:{isContentEditable:true}})).defaultPrevented,false);
  assert.equal((await app.keyEvent({composedPath:()=>[control('button')]})).defaultPrevented,false);
  for(const modifier of ['altKey','ctrlKey','metaKey','shiftKey','isComposing','defaultPrevented'])await app.keyEvent({[modifier]:true});
  assert.equal(app.value('JSON.stringify(store.events)'),events);
  app.document.querySelector('#dialog').open=true;assert.equal((await app.keyEvent()).defaultPrevented,false);app.document.querySelector('#dialog').open=false;
  options.otherModal=true;assert.equal((await app.keyEvent()).defaultPrevented,false);options.otherModal=false;
  await app.value('working=true;');assert.equal((await app.keyEvent()).defaultPrevented,false);await app.value('working=false;');
  await app.value('restoration={state:"loading"};');assert.equal((await app.keyEvent()).defaultPrevented,false);await app.value('restoration=null;');
  assert.equal(app.value('JSON.stringify(store.events)'),events);assert.equal(app.value('session.index'),0);
  await app.click('exit-focus');assert.equal((await app.keyEvent()).defaultPrevented,true);assert.equal(app.value('session.index'),1);
});

test('Espaço não pula duas questões quando uma gravação ainda está pendente',async()=>{
  for(const focus of [false,true]){
    const app=await studyRuntime();if(focus)await app.click('toggle-focus');
    await app.value('var unlockSkip;const originalAdd=store.add.bind(store);store.add=async events=>{await new Promise(resolve=>unlockSkip=resolve);return originalAdd(events);};');
    const first=app.keyEvent();assert(app.value('working'));await app.keyEvent();assert.equal(app.value('session.index'),0);
    app.value('unlockSkip();');await first;assert.equal(app.value('session.index'),1);assert.equal(app.value('model.stats.attempts'),0);assert(!app.value('working'));
  }
});

test('foco automático Mobile mantém seleção, cortes e rolagem, pede tela cheia e funciona até concluir',async()=>{
  const app=await studyRuntime({mobile:true});assert(app.value('focusMode.active'));await app.click('select',{option:'B'});await app.click('toggle-cut',{option:'C'});app.document.querySelector('.question-body').scrollTop=400;
  const before=app.value('JSON.stringify(store.events)');
  assert(app.value('focusMode.active'));assert.deepEqual(app.document.requestOptions,{navigationUI:'hide'});assert.equal(app.value('selected'),'B');assert(cutRow(app,'C').classList.contains('eliminated'));assert.equal(app.document.querySelector('.question-body').scrollTop,400);assert.equal(app.value('JSON.stringify(store.events)'),before);
  assert.match(app.html(),/class="focus-mobile-progress">Questão 1 de 3/);assert.match(app.html(),/Visitante · progresso temporário/);
  await app.click('toggle-theme');assert.equal(app.document.querySelector('.question-body').scrollTop,400);assert.equal(app.value('selected'),'B');
  await app.click('answer');await app.click('next');assert(app.value('focusMode.active'));assert.equal(app.document.fullscreenElement,app.document.documentElement);assert.equal(app.document.querySelector('.question-body').scrollTop,0);assert.match(app.html(),/>Questão 2 de 3</);
  await app.click('skip');await app.click('select',{option:'A'});await app.click('answer');await app.click('next');
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
  const wrong=app.value('model.questions.find(q=>q.key===session.queue[0]).options.find(o=>o.id!==model.questions.find(q=>q.key===session.queue[0]).correctOption).id');await app.click('select',{option:wrong});await app.click('answer');await app.click('next');assert.equal(app.value('view'),'result');assert(!app.value('focusMode.active'));
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

test('Mobile reinicia a rolagem ao pular ou avançar e libera a navegação normal ao pausar',async()=>{
  const app=await studyRuntime({mobile:true});app.document.querySelector('.question-body').scrollTop=600;
  await app.click('skip');assert.equal(app.document.querySelector('.question-body').scrollTop,0);assert.equal(app.value('model.stats.attempts'),0);
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
  await app.click('skip');assert(!cutRow(app,'A').classList.contains('eliminated'));assert(!cutRow(app,'B').classList.contains('eliminated'));
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
