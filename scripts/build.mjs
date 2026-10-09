import {mkdir,cp,rm,readFile,writeFile} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist/assets',{recursive:true});
await cp('public','dist',{recursive:true});await cp('src','dist/assets',{recursive:true});await cp('docs','dist/docs',{recursive:true});
const config=JSON.parse(await readFile('public/app-config.json','utf8'));
if(process.env.PUBLIC_GOOGLE_CLIENT_ID)config.googleClientId=process.env.PUBLIC_GOOGLE_CLIENT_ID;
if(config.googleClientId&&!/^[\w-]+\.apps\.googleusercontent\.com$/.test(config.googleClientId))throw new Error('PUBLIC_GOOGLE_CLIENT_ID inválido. Use apenas o ID público de cliente OAuth Web.');
await writeFile('dist/app-config.json',JSON.stringify(config,null,2));
console.log('Build pronto: HTML, CSS e módulos JavaScript; nenhuma dependência de produção.');
