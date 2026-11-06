import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {repositoryCatalog} from '../server/repository-banks.mjs';
const args=process.argv.slice(2),value=(name,fallback)=>{const index=args.indexOf(name);return index<0?fallback:args[index+1];};
const port=Number(value('--port','5173')),host=value('--host','127.0.0.1'),root=resolve('dist');
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.md':'text/plain'};
const server=createServer(async(req,res)=>{
  try{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    // Preview never grants global administration or writes attribution data.
    if(pathname==='/api/bank-management'){
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
      res.end(req.method==='HEAD'?undefined:JSON.stringify({admin:false,tracking:false,deletion:false,banks:[]}));return;
    }
    // Local development discovers changes directly in the official folder,
    // including deletions, even when dist still contains an earlier build.
    const asset=pathname.match(/^\/data\/question-banks\/(index|lei-[1-9]\d*)\.json$/);
    if(asset){
      try{
        const {manifest,banks}=repositoryCatalog(resolve('public/data/question-banks'));
        const data=asset[1]==='index'?manifest:banks.find(bank=>bank.id===asset[1]);
        res.writeHead(data?200:404,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
        res.end(req.method==='HEAD'?undefined:JSON.stringify(data||{message:'Banco indisponível.'}));
      }catch{res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(req.method==='HEAD'?undefined:JSON.stringify({message:'Não foi possível validar os bancos do sistema.'}));}
      return;
    }
    let file=resolve(root,`.${pathname}`);
    if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403).end();return;}
    if((await stat(file)).isDirectory())file=resolve(file,'index.html');
    const data=await readFile(file);
    res.writeHead(200,{'Content-Type':`${types[extname(file)]||'application/octet-stream'}; charset=utf-8`,'Cache-Control':'no-store'});
    res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(404).end('Not found');}
});
server.listen(port,host,()=>console.log(`Foco em http://${host}:${server.address().port}`));
