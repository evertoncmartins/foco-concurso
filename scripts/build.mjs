import {mkdir,cp,rm} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist/assets',{recursive:true});
await cp('public','dist',{recursive:true});await cp('src','dist/assets',{recursive:true});await cp('docs','dist/docs',{recursive:true});
console.log('Build pronto: HTML, CSS e módulos JavaScript; nenhuma dependência de produção.');
