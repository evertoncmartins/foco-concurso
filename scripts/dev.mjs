import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
const args=process.argv.slice(2),value=(name,fallback)=>{const index=args.indexOf(name);return index<0?fallback:args[index+1];};
const port=Number(value('--port','5173')),host=value('--host','127.0.0.1'),root=resolve('dist');
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.md':'text/plain'};
createServer(async(req,res)=>{try{if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=resolve(root,`.${pathname}`);if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403).end();return;}if((await stat(file)).isDirectory())file=resolve(file,'index.html');const data=await readFile(file);res.writeHead(200,{'Content-Type':`${types[extname(file)]||'application/octet-stream'}; charset=utf-8`,'Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:data);}catch{res.writeHead(404).end('Not found');}}).listen(port,host,()=>console.log(`Foco em http://${host}:${port}`));
