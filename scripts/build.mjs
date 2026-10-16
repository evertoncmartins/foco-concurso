import {validateSystemBank} from '../src/system-banks.mjs';
import {mkdir,cp,rm,readFile,writeFile} from 'node:fs/promises';
const catalog=JSON.parse(await readFile('public/data/question-banks/index.json','utf8')),bankIds=new Set();
for(const item of catalog.banks){if(!/^lei-[1-9]\d*$/.test(item.id)||bankIds.has(item.id)||item.file!==`${item.id}.json`)throw new Error('Catálogo nativo inválido.');bankIds.add(item.id);const bank=validateSystemBank(JSON.parse(await readFile(`public/data/question-banks/${item.file}`,'utf8')));if(bank.id!==item.id)throw new Error('ID do arquivo nativo divergente.');}
await rm('dist',{recursive:true,force:true});await mkdir('dist/assets',{recursive:true});
await cp('public','dist',{recursive:true});await cp('src','dist/assets',{recursive:true});await cp('docs','dist/docs',{recursive:true});
const config=JSON.parse(await readFile('public/app-config.json','utf8'));
if(process.env.PUBLIC_GOOGLE_CLIENT_ID)config.googleClientId=process.env.PUBLIC_GOOGLE_CLIENT_ID;
if(config.googleClientId&&!/^[\w-]+\.apps\.googleusercontent\.com$/.test(config.googleClientId))throw new Error('PUBLIC_GOOGLE_CLIENT_ID inválido. Use apenas o ID público de cliente OAuth Web.');
await writeFile('dist/app-config.json',JSON.stringify(config,null,2));
console.log('Build público pronto: HTML, CSS, módulos e bancos de questões. Integrações do servidor são publicadas separadamente.');
