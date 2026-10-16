import {repositoryCatalog} from '../server/repository-banks.mjs';
import {mkdir,cp,rm,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

export async function buildSite(root=process.cwd()){
  const path=name=>join(root,name),{manifest,banks}=repositoryCatalog(path('public/data/question-banks'));
  const config=JSON.parse(await readFile(path('public/app-config.json'),'utf8'));
  if(process.env.PUBLIC_GOOGLE_CLIENT_ID)config.googleClientId=process.env.PUBLIC_GOOGLE_CLIENT_ID;
  if(config.googleClientId&&!/^[\w-]+\.apps\.googleusercontent\.com$/.test(config.googleClientId))throw new Error('PUBLIC_GOOGLE_CLIENT_ID inválido. Use apenas o ID público de cliente OAuth Web.');
  // Validate every bank before replacing the previous build.
  await rm(path('dist'),{recursive:true,force:true});await mkdir(path('dist/assets'),{recursive:true});
  await cp(path('public'),path('dist'),{recursive:true});await cp(path('src'),path('dist/assets'),{recursive:true,filter:file=>!file.endsWith('.json')});await cp(path('docs'),path('dist/docs'),{recursive:true});
  await writeFile(path('dist/data/question-banks/index.json'),JSON.stringify(manifest,null,2)+'\n');
  for(const bank of banks)await writeFile(path(`dist/data/question-banks/${bank.id}.json`),JSON.stringify(bank,null,2)+'\n');
  await writeFile(path('dist/app-config.json'),JSON.stringify(config,null,2));
  console.log(`Build público pronto: ${banks.length} bancos do sistema reconhecidos automaticamente.`);
  return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await buildSite();
