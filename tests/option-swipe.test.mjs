import test from 'node:test';
import assert from 'node:assert/strict';
import {OptionSwipe} from '../src/option-swipe.mjs';

function fixture(){
  const actions=[],classes=new Set(),state={enabled:true,context:'q1',time:0};
  let captured=false;
  const row={dataset:{optionRow:'A'},isConnected:true,classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)},getBoundingClientRect:()=>({width:300}),setPointerCapture(){captured=true;},hasPointerCapture:()=>captured,releasePointerCapture(){captured=false;},closest(selector){return selector==='[data-option-row]'?this:null;}};
  const swipe=new OptionSwipe({enabled:()=>state.enabled,context:()=>state.context,onSwipe:(...args)=>actions.push(args),clock:()=>state.time});
  const event=(x=200,y=100,extras={})=>({pointerId:1,pointerType:'touch',isPrimary:true,button:0,clientX:x,clientY:y,target:row,cancelable:true,prevented:false,preventDefault(){this.prevented=true;},...extras});
  return {swipe,row,state,actions,event,classes};
}

test('esquerda risca e direita restaura somente ao concluir gesto suficiente',()=>{
  const f=fixture();f.swipe.start(f.event());const move=f.event(100,106);f.swipe.move(move);
  assert(move.prevented);assert(f.classes.has('swiping'));assert.equal(f.row.dataset.swipeLabel,'Riscar');assert.deepEqual(f.actions,[]);
  f.swipe.end(f.event(100,106));assert.deepEqual(f.actions,[['A',true]]);assert(!f.classes.has('swiping'));assert.equal(f.row.dataset.swipeLabel,undefined);
  f.swipe.start(f.event(100));f.swipe.move(f.event(200));f.swipe.end(f.event(200));assert.deepEqual(f.actions,[['A',true],['A',false]]);
});

test('toque, tremor, rolagem vertical e diagonal preservam a interação nativa',()=>{
  for(const [dx,dy] of [[0,0],[5,4],[10,100],[60,60],[30,6]]){
    const f=fixture();f.swipe.start(f.event());const move=f.event(200+dx,100+dy);f.swipe.move(move);f.swipe.end(move);assert.deepEqual(f.actions,[]);
    if(Math.abs(dy)>=Math.abs(dx)||Math.abs(dx)<12)assert(!move.prevented);
  }
  const f=fixture();f.swipe.start(f.event());f.swipe.move(f.event(203,145));f.swipe.move(f.event(310,145));f.swipe.end(f.event(310,145));assert.deepEqual(f.actions,[],'vertical intent cannot become a swipe');
});

test('clique gerado pelo arraste é consumido; toque seguinte e teclado continuam livres',()=>{
  const f=fixture();f.swipe.start(f.event());f.swipe.move(f.event(100));f.swipe.end(f.event(100));
  assert(!f.swipe.consumeClick({target:f.row,detail:0}),'keyboard activation');
  assert(f.swipe.consumeClick({target:f.row,detail:1}));assert(!f.swipe.consumeClick({target:f.row,detail:1}));
  f.swipe.start(f.event());f.swipe.move(f.event(100));f.swipe.end(f.event(100));f.swipe.start(f.event());f.swipe.end(f.event());assert(!f.swipe.consumeClick({target:f.row,detail:1}),'next real tap');
});

test('arraste curto com intenção horizontal não vira seleção acidental',()=>{
  const f=fixture();f.swipe.start(f.event());f.swipe.move(f.event(180));f.swipe.end(f.event(180));assert.deepEqual(f.actions,[]);assert(f.swipe.consumeClick({target:f.row,detail:1}));
});

test('cancelamento, perda de captura, zoom e múltiplos dedos não riscam',()=>{
  const f=fixture(),listeners={};f.swipe.bind({addEventListener(name,listener){listeners[name]=listener;}});
  listeners.pointerdown(f.event());listeners.pointermove(f.event(100));listeners.lostpointercapture(f.event(100));listeners.pointerup(f.event(100));assert.deepEqual(f.actions,[]);assert(!f.classes.has('swiping'));
  listeners.pointerdown(f.event());listeners.pointermove(f.event(100));listeners.pointercancel(f.event(100));assert.deepEqual(f.actions,[]);
  listeners.pointerdown(f.event());listeners.pointermove(f.event(100));listeners.pointerdown(f.event(100,100,{pointerId:2,isPrimary:false}));listeners.pointerup(f.event(100));listeners.pointerup(f.event(100,100,{pointerId:2}));assert.deepEqual(f.actions,[]);assert.equal(f.swipe.pointers.size,0);
});

test('trocar questão, abrir modal, sair do mobile ou remover a alternativa cancela o gesto',()=>{
  for(const change of [f=>f.state.context='q2',f=>f.state.enabled=false,f=>f.row.isConnected=false]){
    const f=fixture();f.swipe.start(f.event());f.swipe.move(f.event(100));change(f);f.swipe.end(f.event(100));assert.deepEqual(f.actions,[]);assert(!f.classes.has('swiping'));
  }
  const f=fixture();f.state.enabled=false;f.swipe.start(f.event());f.swipe.move(f.event(100));f.swipe.end(f.event(100));assert.deepEqual(f.actions,[]);
});

test('gesto incompleto pode ser desfeito antes de soltar e botões da tesoura não iniciam arraste',()=>{
  const f=fixture();f.swipe.start(f.event());f.swipe.move(f.event(80));f.swipe.end(f.event(197));assert.deepEqual(f.actions,[]);
  const cut={closest:selector=>selector==='[data-option-row]'?f.row:selector==='.option-cut'?{}:null};f.swipe.start(f.event(200,100,{target:cut}));f.swipe.move(f.event(100));f.swipe.end(f.event(100));assert.deepEqual(f.actions,[]);
});
