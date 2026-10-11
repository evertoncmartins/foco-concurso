import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const css=await readFile(new URL('../public/assets/study-layout.css',import.meta.url),'utf8');
// Structural CSS guard, not a substitute for browser/device geometry checks.
function mediaBlocks(source){
  const blocks=[];
  for(const match of source.matchAll(/@media([^{}]+)\{/g)){
    let depth=1,end=match.index+match[0].length;
    const start=end;
    while(depth&&end<source.length){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;end++;}
    assert.equal(depth,0);blocks.push({condition:match[1],body:source.slice(start,end-1)});
  }
  return blocks;
}

test('rodapé Mobile reserva espaço no viewport, considera safe area e deixa somente a questão rolável',()=>{
  const blocks=mediaBlocks(css),dock=blocks.find(b=>b.body.includes('height:100dvh;min-height:0;overflow:hidden'));
  assert(dock);assert.match(dock.condition,/max-width:700px/);assert(!dock.condition.includes('min-width'));
  assert.match(dock.body,/\.shell\.session\{[^}]*height:100vh;height:100dvh[^}]*padding-bottom:env\(safe-area-inset-bottom,0px\)/);
  for(const selector of ['workspace','content','session-container','question-card','question-body']){
    const rule=dock.body.match(new RegExp(`\\.session \\.${selector}\\{([^}]+)\\}`));assert(rule);assert.match(rule[1],/min-height:0/);
  }
  assert.match(dock.body,/\.session \.question-body\{[^}]*overflow-y:auto[^}]*padding:3px 4px 20px[^}]*scroll-padding-block:8px 20px/);
  for(const selector of ['question-actions','session-summary-bar'])assert.match(dock.body,new RegExp(`\\.session \\.${selector}\\{[^}]*flex-shrink:0`));
  assert(!/position:(fixed|absolute)/.test(dock.body),'the footer must reserve real space, not overlay content');
  assert(!/(?:^|\})\s*(?:html|body|#app)\s*\{/.test(dock.body),'do not lock other pages');
  assert(!blocks.filter(b=>b.condition.includes('min-width:701px')).some(b=>b.body.includes('safe-area-inset-bottom,0px')),'mobile docking must not change desktop rules');
});
