import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {PublicDocuments} from '../src/public-documents.mjs';

const origin='https://foco-concurso-wine.vercel.app';
function runtime(){
  const listeners={},windowListeners={},body={style:{overflow:'auto'},children:[],append(node){this.children.push(node);}},state={returns:0,ready:true,context:{view:'settings',subject:'111'},returned:[]};
  const launcher={isConnected:true,focus(options){this.focusOptions=options;}};
  const document={body,activeElement:launcher,addEventListener(name,fn){listeners[name]=fn;},createElement(tag){return {tag,contentWindow:tag==='iframe'?{}:undefined,attributes:{},listeners:{},setAttribute(key,value){this.attributes[key]=value;},append(node){this.child=node;},addEventListener(name,fn){this.listeners[name]=fn;},showModal(){this.open=true;},close(){this.open=false;},remove(){body.children=body.children.filter(n=>n!==this);},focus(){this.focused=true;}};}};
  const stack=[{state:null,url:'https://accounts.google.com/fixture'},{state:{keep:'original'},url:origin+'/'}];let position=1;
  const window={location:{href:origin+'/',origin},addEventListener(name,fn){windowListeners[name]=fn;}};
  window.history={get state(){return stack[position].state;},get length(){return stack.length;},get position(){return position;},pushState(state,title,url){stack.splice(++position);stack.push({state,url});window.location.href=url;},replaceState(state,title,url){stack[position]={state,url};window.location.href=url;},go(delta){queueMicrotask(()=>{const target=Math.max(0,Math.min(stack.length-1,position+delta));if(target===position)return;position=target;window.location.href=stack[position].url;windowListeners.popstate({state:stack[position].state});});}};
  window.history.back=()=>window.history.go(-1);window.history.forward=()=>window.history.go(1);
  const createElement=document.createElement;document.createElement=tag=>{const node=createElement(tag);if(tag==='iframe')node.contentWindow.location={replace:url=>{node.src=url;}};return node;};
  const controller=new PublicDocuments({document,window,canOpen:()=>state.ready,getContext:()=>({...state.context}),onReturn:context=>{state.returns++;state.returned.push(context);}});
  const click=(name,overrides={})=>{const event={button:0,defaultPrevented:false,target:{closest:()=>({href:new URL(name,origin).href})},preventDefault(){this.defaultPrevented=true;},...overrides};listeners.click(event);return event;};
  const message=overrides=>windowListeners.message({source:controller.frame?.contentWindow,origin,data:{type:'foco:document:return'},...overrides});
  const back=async()=>{window.history.back();await new Promise(setImmediate);},forward=async()=>{window.history.forward();await new Promise(setImmediate);};
  return {controller,document,window,state,launcher,click,message,back,forward};
}

test('documentos abrem no aplicativo sem navegar ou recriar a sessão',async()=>{
  for(const name of ['privacidade.html','termos.html','formato-json.html']){
    const app=runtime(),event=app.click(name+'#main'),frame=app.controller.frame,dialog=app.controller.dialog;
    assert(event.defaultPrevented);assert.equal(frame.src,origin+'/'+name+'#main');assert.equal(app.window.location.href,origin+'/');assert(dialog.open);assert(frame.focused);assert.equal(app.document.body.style.overflow,'hidden');
    app.message();await new Promise(setImmediate);assert.equal(app.state.returns,1);assert.equal(app.controller.dialog,null);assert.equal(app.document.body.children.length,0);assert.equal(app.document.body.style.overflow,'auto');
    app.message();assert.equal(app.state.returns,1);
  }
});

test('origem e foco são preservados durante a leitura sem guardar credenciais',async()=>{
  for(const view of ['settings','banks']){
    const app=runtime();app.state.context={view,subject:'111'};app.click(view==='banks'?'formato-json.html':'privacidade.html');
    app.state.context={view:'home',subject:'222'};await app.controller.close();
    assert.deepEqual(app.state.returned,[{view,subject:'111'}]);assert.deepEqual(app.launcher.focusOptions,{preventScroll:true});assert.equal(app.controller.context,null);
  }
});

test('retorno não tenta focar um link removido após logout ou mudança da tela',async()=>{
  const app=runtime();app.click('termos.html');app.launcher.isConnected=false;await app.controller.close();
  assert.equal(app.launcher.focusOptions,undefined);assert.equal(app.state.returns,1);
});

test('mensagens de outro site, aba ou formato não fecham o documento',async()=>{
  const app=runtime();app.click('termos.html');
  app.message({origin:'https://other.invalid'});app.message({source:{}});app.message({data:{type:'other'}});
  assert(app.controller.dialog.open);assert.equal(app.state.returns,0);app.message();await new Promise(setImmediate);assert.equal(app.state.returns,1);
});

test('fechamento nativo também retorna, preservando o bloqueio durante autenticação',async()=>{
  const app=runtime();app.state.ready=false;assert(app.click('termos.html').defaultPrevented);assert.equal(app.controller.dialog,null);
  app.state.ready=true;app.click('termos.html');let prevented=false;app.controller.dialog.listeners.cancel({preventDefault(){prevented=true;}});await new Promise(setImmediate);assert(prevented);assert.equal(app.state.returns,1);
});

test('links externos e cliques para nova aba mantêm a navegação nativa',()=>{
  for(const overrides of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{button:1}]){const app=runtime();assert(!app.click('termos.html',overrides).defaultPrevented);assert.equal(app.controller.dialog,null);}
  const app=runtime();assert(!app.click('https://example.invalid/termos.html').defaultPrevented);assert.equal(app.controller.dialog,null);
});

test('páginas independentes voltam à entrada sem iniciar autorização; páginas internas avisam só o pai',async()=>{
  const source=await readFile(new URL('../public/assets/document-return.js',import.meta.url),'utf8');
  for(const embedded of [false,true]){
    let click;const sent=[],window={location:{origin}},parent=embedded?{postMessage:(...args)=>sent.push(args)}:window;window.parent=parent;
    vm.runInNewContext(source,{window,document:{addEventListener(name,fn){click=fn;}}});
    const event={button:0,target:{closest:()=>({hasAttribute:name=>name==='data-foco-return'})},preventDefault(){this.defaultPrevented=true;}};click(event);
    assert.equal(!!event.defaultPrevented,embedded);assert.equal(sent.length,embedded?1:0);
    if(embedded){assert.equal(sent[0][0].type,'foco:document:return');assert.equal(sent[0][1],origin);}
  }
});

test('Voltar do navegador consome só o documento e mantém a tela anterior ao OAuth no histórico',async()=>{
  for(const [view,name,subject] of [['settings','termos.html','111'],['settings','privacidade.html','111'],['banks','formato-json.html','111'],['login','termos.html',undefined]]){
    const app=runtime();app.state.context={view,subject,generation:3};app.click(name);
    assert.equal(app.window.history.position,2);assert.equal(app.window.history.state.keep,'original');
    assert(!JSON.stringify(app.window.history.state).includes('111'));
    await app.back();
    assert.equal(app.window.history.position,1);assert.equal(app.window.location.href,origin+'/');assert.equal(app.controller.dialog,null);
    assert.deepEqual(app.state.returned,[{view,subject,generation:3}]);assert.deepEqual(app.window.history.state,{keep:'original'});
  }
});

test('Avançar reabre o documento só na mesma sessão, sem repetir o retorno ou criar entradas',async()=>{
  const app=runtime();app.click('formato-json.html');await app.back();await app.forward();
  assert.equal(app.controller.frame.src,origin+'/formato-json.html');assert.equal(app.window.history.length,3);assert.equal(app.state.returns,1);
  await app.controller.close();assert.equal(app.window.history.position,1);assert.equal(app.state.returns,2);
});

test('Avançar após logout, nova geração ou troca de conta nunca reaplica o documento antigo',async()=>{
  for(const context of [{view:'login',subject:undefined,generation:1},{view:'settings',subject:'222'},{view:'settings',subject:'111',generation:1}]){
    const app=runtime();app.click('termos.html');await app.back();app.state.context=context;await app.forward();
    assert.equal(app.controller.dialog,null);assert.equal(app.window.history.state.focoDocument,undefined);assert.equal(app.state.returns,1);
  }
});

test('links entre documentos têm histórico e o botão interno retorna direto à origem',async()=>{
  const app=runtime();app.click('termos.html');app.message({data:{type:'foco:document:open',url:origin+'/privacidade.html'}});
  assert.equal(app.controller.frame.src,origin+'/privacidade.html');assert.equal(app.window.history.position,3);
  await app.back();assert.equal(app.controller.frame.src,origin+'/termos.html');assert.equal(app.state.returns,0);
  await app.forward();assert.equal(app.controller.frame.src,origin+'/privacidade.html');
  const closing=app.controller.close();assert.equal(app.controller.close(),closing);await closing;
  assert.equal(app.window.history.position,1);assert.equal(app.state.returns,1);assert.equal(app.controller.dialog,null);
});

test('origem externa, caminho fora dos documentos e mensagens inválidas não podem criar entradas',()=>{
  const app=runtime();app.click('termos.html');
  for(const url of ['https://example.invalid/termos.html',origin+'/api/auth/start','javascript:alert(1)',undefined])app.message({data:{type:'foco:document:open',url}});
  assert.equal(app.window.history.length,3);assert.equal(app.controller.frame.src,origin+'/termos.html');
});

test('links de seção substituem só a posição do iframe; links institucionais são geridos pelo pai',async()=>{
  const source=await readFile(new URL('../public/assets/document-return.js',import.meta.url),'utf8');let click,scrolled=0;const sent=[],replacements=[];
  const window={location:{href:origin+'/formato-json.html',origin},parent:{postMessage:(...args)=>sent.push(args)},history:{state:null,replaceState:(...args)=>replacements.push(args)}};
  vm.runInNewContext(source,{URL,window,document:{addEventListener(name,fn){click=fn;},getElementById(id){assert.equal(id,'campos');return {scrollIntoView(){scrolled++;}};}}});
  const link=href=>({href:new URL(href,window.location.href).href,hasAttribute:()=>false});
  const follow=(href,overrides={})=>{const event={button:0,target:{closest:()=>link(href)},preventDefault(){this.defaultPrevented=true;},...overrides};click(event);return event;};
  assert(follow('#campos').defaultPrevented);assert.equal(scrolled,1);assert.equal(replacements[0][2],origin+'/formato-json.html#campos');assert.equal(sent.length,0);
  assert(follow('./termos.html').defaultPrevented);assert.equal(sent[0][0].type,'foco:document:open');assert.equal(sent[0][0].url,origin+'/termos.html');
  assert(!follow('./termos.html',{ctrlKey:true}).defaultPrevented);assert(!follow('https://example.invalid/termos.html').defaultPrevented);
});

test('marca, botão e rodapé retornam à raiz e incluem o comportamento compartilhado nos três documentos',async()=>{
  for(const name of ['privacidade','termos','formato-json']){
    const html=await readFile(new URL(`../public/${name}.html`,import.meta.url),'utf8');
    assert.equal((html.match(/data-foco-return href="\.\/"/g)||[]).length,3);assert(html.includes('src="./assets/document-return.js"'));assert(!html.includes('return=home'));
  }
});
