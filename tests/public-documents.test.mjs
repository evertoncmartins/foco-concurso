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
  const window={location:{href:origin+'/',origin},addEventListener(name,fn){windowListeners[name]=fn;}};
  const controller=new PublicDocuments({document,window,canOpen:()=>state.ready,getContext:()=>({...state.context}),onReturn:context=>{state.returns++;state.returned.push(context);}});
  const click=(name,overrides={})=>{const event={button:0,defaultPrevented:false,target:{closest:()=>({href:new URL(name,origin).href})},preventDefault(){this.defaultPrevented=true;},...overrides};listeners.click(event);return event;};
  const message=overrides=>windowListeners.message({source:controller.frame?.contentWindow,origin,data:{type:'foco:document:return'},...overrides});
  return {controller,document,window,state,launcher,click,message};
}

test('documentos abrem no aplicativo sem navegar ou recriar a sessão',async()=>{
  for(const name of ['privacidade.html','termos.html','formato-json.html']){
    const app=runtime(),event=app.click(name+'#main'),frame=app.controller.frame,dialog=app.controller.dialog;
    assert(event.defaultPrevented);assert.equal(frame.src,origin+'/'+name+'#main');assert.equal(app.window.location.href,origin+'/');assert(dialog.open);assert(frame.focused);assert.equal(app.document.body.style.overflow,'hidden');
    app.message();await Promise.resolve();assert.equal(app.state.returns,1);assert.equal(app.controller.dialog,null);assert.equal(app.document.body.children.length,0);assert.equal(app.document.body.style.overflow,'auto');
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

test('mensagens de outro site, aba ou formato não fecham o documento',()=>{
  const app=runtime();app.click('termos.html');
  app.message({origin:'https://other.invalid'});app.message({source:{}});app.message({data:{type:'other'}});
  assert(app.controller.dialog.open);assert.equal(app.state.returns,0);app.message();assert.equal(app.state.returns,1);
});

test('fechamento nativo também retorna, preservando o bloqueio durante autenticação',async()=>{
  const app=runtime();app.state.ready=false;assert(app.click('termos.html').defaultPrevented);assert.equal(app.controller.dialog,null);
  app.state.ready=true;app.click('termos.html');let prevented=false;app.controller.dialog.listeners.cancel({preventDefault(){prevented=true;}});await Promise.resolve();assert(prevented);assert.equal(app.state.returns,1);
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
    const event={button:0,target:{closest:()=>({})},preventDefault(){this.defaultPrevented=true;}};click(event);
    assert.equal(!!event.defaultPrevented,embedded);assert.equal(sent.length,embedded?1:0);
    if(embedded){assert.equal(sent[0][0].type,'foco:document:return');assert.equal(sent[0][1],origin);}
  }
});

test('marca, botão e rodapé retornam à raiz e incluem o comportamento compartilhado nos três documentos',async()=>{
  for(const name of ['privacidade','termos','formato-json']){
    const html=await readFile(new URL(`../public/${name}.html`,import.meta.url),'utf8');
    assert.equal((html.match(/data-foco-return href="\.\/"/g)||[]).length,3);assert(html.includes('src="./assets/document-return.js"'));assert(!html.includes('return=home'));
  }
});
