import test from 'node:test';
import assert from 'node:assert/strict';
import {FocusMode} from '../src/focus-mode.mjs';

class Desktop extends EventTarget {
  matches=true;
  resize(matches){this.matches=matches;this.dispatchEvent(new Event('change'));}
}
class BrowserDocument extends EventTarget {
  fullscreenElement=null;
  requests=0;
  exits=0;
  documentElement={requestFullscreen:async()=>{
    this.requests++;
    this.fullscreenElement=this.documentElement;
    this.dispatchEvent(new Event('fullscreenchange'));
  }};
  async exitFullscreen(){this.exits++;this.leaveFullscreen();}
  leaveFullscreen(){this.fullscreenElement=null;this.dispatchEvent(new Event('fullscreenchange'));}
}
function setup(){
  const document=new BrowserDocument(),desktop=new Desktop(),states=[];
  let unavailable=0;
  const focus=new FocusMode({document,desktop,onChange:()=>states.push(focus.active),onUnavailable:()=>unavailable++});
  return {focus,document,desktop,states,get unavailable(){return unavailable;}};
}

test('modo foco usa elemento estável e mantém tela cheia entre redesenhos',async()=>{
  const {focus,document,states}=setup();
  await focus.enter();
  const stableRoot=document.documentElement;
  document.applicationHTML='alternativa selecionada';
  document.applicationHTML='feedback da resposta';
  document.applicationHTML='próxima questão';
  assert(focus.active);
  assert.equal(document.fullscreenElement,stableRoot);
  assert.equal(document.requests,1);
  await focus.exit();
  assert.deepEqual(states,[true,false]);
  assert.equal(document.exits,1);
});

test('saída nativa do navegador restaura o layout e permite entrar novamente',async()=>{
  const {focus,document,states}=setup();
  await focus.enter();
  document.leaveFullscreen();
  assert(!focus.active);
  assert.deepEqual(states,[true,false]);
  await focus.enter();
  assert(focus.active);
  assert.equal(document.requests,2);
});

test('recusa de tela cheia mantém foco sem menus e permite saída normal',async()=>{
  const setupResult=setup(),{focus,document}=setupResult;
  document.documentElement.requestFullscreen=async()=>{throw new Error('Permission denied');};
  await focus.enter();
  assert(focus.active);
  assert.equal(setupResult.unavailable,1);
  await focus.exit();
  assert(!focus.active);
  assert.equal(document.exits,0);
});

test('navegador sem API de tela cheia continua com modo foco funcional',async()=>{
  const setupResult=setup(),{focus,document}=setupResult;
  delete document.documentElement.requestFullscreen;
  await focus.enter();
  assert(focus.active);
  assert.equal(setupResult.unavailable,1);
  await focus.exit();
  assert(!focus.active);
});

test('não ativa no celular; mudança de largura encerra foco e tela cheia',async()=>{
  const {focus,document,desktop}=setup();
  desktop.resize(false);
  await focus.enter();
  assert(!focus.active);
  assert.equal(document.requests,0);
  desktop.resize(true);
  await focus.enter();
  desktop.resize(false);
  assert(!focus.active);
  assert.equal(document.fullscreenElement,null);
  assert.equal(document.exits,1);
});

test('pausar antes de concluir entrada assíncrona não deixa tela cheia órfã',async()=>{
  const {focus,document,states}=setup();
  let complete;
  document.documentElement.requestFullscreen=()=>new Promise(resolve=>{complete=()=>{
    document.fullscreenElement=document.documentElement;
    document.dispatchEvent(new Event('fullscreenchange'));
    resolve();
  };});
  const entering=focus.enter();
  assert(focus.pending);
  await focus.exit();
  await focus.enter(); // Ignore a second click until the pending request settles.
  assert(!focus.active);
  complete();
  await entering;
  assert(!focus.active);
  assert(!focus.pending);
  assert.equal(document.fullscreenElement,null);
  assert.equal(document.exits,1);
  assert.deepEqual(states,[true,false]);
});

test('cliques repetidos não abrem nem fecham tela cheia mais de uma vez',async()=>{
  const {focus,document}=setup();
  await Promise.all([focus.enter(),focus.enter(),focus.enter()]);
  assert.equal(document.requests,1);
  await Promise.all([focus.exit(),focus.exit()]);
  assert.equal(document.exits,1);
});

test('modo foco não encerra tela cheia que já estava ativa fora dele',async()=>{
  const {focus,document}=setup();
  document.fullscreenElement=document.documentElement;
  await focus.enter();
  await focus.exit();
  assert.equal(document.requests,0);
  assert.equal(document.exits,0);
  assert.equal(document.fullscreenElement,document.documentElement);
});
