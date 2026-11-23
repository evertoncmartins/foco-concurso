import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const tokens=await readFile(new URL('../public/assets/appearance/tokens.css',import.meta.url),'utf8');
const accents=await readFile(new URL('../public/assets/appearance/dark-accents.css',import.meta.url),'utf8');
test('paleta escura mantém as cores oficiais do Monitor AVA centralizadas',()=>{
  const dark=tokens.slice(tokens.indexOf(':root[data-theme=dark]'));
  const expected={bg:'#121212',surface:'#202020',surface2:'#242424','surface-highlight':'#303030','input-bg':'#262626','sidebar-bg':'#181818',text:'#f1f1f1','text-secondary':'#b8b8b8',muted:'#a3a3a3',border:'#363636','border-strong':'#707070',accent:'#79ccc2','accent-hover':'#97ded5','accent-active':'#62b6ab',link:'#9dc5ff',confirm:'#89cba8',success:'#8fceb0',warning:'#e4bd80',error:'#e8a49f',purple:'#c0ace2',focus:'#94bfff'};
  for(const [name,value] of Object.entries(expected))assert(dark.includes(`--${name}:${value}`),name);
  assert(!/#[0-9a-f]{3,8}/i.test(accents),'component accents consume tokens');
});

test('cores originais do modo claro continuam disponíveis e os acentos são isolados por tema',()=>{
  const light=tokens.slice(0,tokens.indexOf(':root[data-theme=dark]'));
  for(const token of ['--bg:#f8f9fc','--surface:#fff','--text:#252638','--muted:#666a7d','--accent:#00001F','--error:#a7443d','--success:#2d6549'])assert(light.includes(token));
  for(const rule of accents.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
    if(rule[1].trim().startsWith('.')||rule[1].includes(':root'))assert(rule[1].includes('[data-theme=dark]')||rule[1].includes('.session-save-status'));
  }
  assert(accents.includes('prefers-reduced-motion:reduce'));assert(accents.includes('focus-visible'));
});
