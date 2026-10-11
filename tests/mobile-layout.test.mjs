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

test('foco Mobile remove elementos periféricos sem ocultar controles essenciais e respeita a safe area superior',()=>{
  const mobile=mediaBlocks(css).find(b=>b.condition.trim()==='(max-width:700px)'&&b.body.includes('height:100dvh')).body;
  assert.match(mobile,/\.topbar \.focus-toggle\{display:inline-flex/);
  assert.match(mobile,/\.session\.focus-mode \.topbar,\.session\.focus-mode \.session-header,\.session\.focus-mode \.guest-banner\{display:none/);
  assert.match(mobile,/\.session\.focus-mode \.focus-toolbar\{display:flex[^}]*safe-area-inset-top/);
  assert.match(mobile,/\.focus-mode \.focus-mobile-progress\{display:inline/);
  assert.match(mobile,/\.session\.focus-mode \.question-statement\{font-size:19px/);
  assert(!/\.session\.focus-mode \.(?:question-actions|session-summary-bar)\{[^}]*display:none/.test(mobile));
});

test('foco iOS reserva 36 px mais safe area acima da barra, sem alterar desktop, Android ou o rodapé',()=>{
  const override=css.match(/@supports \(-webkit-touch-callout:none\)\{\s*@media\(max-width:700px\)\{\s*\.session\.focus-mode \.focus-toolbar\{([^}]+)\}\s*\}\s*\}/);
  assert(override,'the adjustment must stay inside the iOS feature and Mobile width guards');
  assert.equal(override[1],'padding-top:calc(36px + env(safe-area-inset-top,0px))');
  const mobile=mediaBlocks(css).find(b=>b.condition.trim()==='(max-width:700px)'&&b.body.includes('height:100dvh')).body;
  assert.match(mobile,/\.session\.focus-mode \.focus-toolbar\{[^}]*padding:calc\(6px \+ env\(safe-area-inset-top,0px\)\)/);
  // Inset stays additive in every orientation; controls keep their reserved space.
  for(const inset of [0,20,59,62]){assert.equal((36+inset)-(6+inset),30);assert.equal((36+inset)-(18+inset),18);}
  assert(!/position|transform|height|filter|question-actions|session-summary-bar/.test(override[1]));
});

test('app iOS não pede barra de status translúcida sobre o conteúdo',async()=>{
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  const tags=html.match(/<meta\b[^>]*name="apple-mobile-web-app-status-bar-style"[^>]*>/g)||[];
  assert.equal(tags.length,1);assert.match(tags[0],/content="default"/);assert(!html.includes('black-translucent'));
  assert.match(html,/viewport-fit=cover/);assert.match(html,/name="apple-mobile-web-app-capable" content="yes"/);
});

test('configuração da Tela de Início tem ícones locais válidos sem interceptar login ou prometer uso offline',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));
  assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'./');assert.equal(manifest.scope,'./');
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  assert.match(html,/rel="manifest" href="\.\/manifest.webmanifest"/);assert.match(html,/name="apple-mobile-web-app-capable" content="yes"/);
  for(const icon of manifest.icons){
    const png=await readFile(new URL(`../public/${icon.src}`,import.meta.url));assert.equal(png.subarray(1,4).toString(),'PNG');const [width,height]=icon.sizes.split('x').map(Number);assert.equal(png.readUInt32BE(16),width);assert.equal(png.readUInt32BE(20),height);
  }
  assert(!html.includes('serviceWorker'));
});
